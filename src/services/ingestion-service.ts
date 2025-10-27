/**
 * Ingestion service for daily paper processing
 */

import { D1Client } from './d1-client';
import { EmbeddingsService } from './embeddings-service';
import { chunkPaperContent } from '../utils/chunking';

export interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  arxivId: string;
  category: string;
  pdfUrl: string;
}

export interface IngestionResult {
  totalPapers: number;
  successfulPapers: number;
  totalChunks: number;
  totalEmbeddings: number;
  errors: Array<{ paperId: string; error: string }>;
  duration: number;
}

export interface BulkIngestionResult extends IngestionResult {
  duplicatesSkipped: number;
  batchCount: number;
}

export class IngestionService {
  constructor(
    private d1Client: D1Client,
    private embeddingsService: EmbeddingsService
  ) {}

  /**
   * Process and ingest papers
   */
  async ingestPapers(papers: ArxivPaper[]): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      totalPapers: papers.length,
      successfulPapers: 0,
      totalChunks: 0,
      totalEmbeddings: 0,
      errors: [],
      duration: 0
    };

    for (const paper of papers) {
      try {
        // Insert paper
        const paperId = await this.d1Client.insertPaper({
          arxiv_id: paper.arxivId,
          title: paper.title,
          abstract: paper.abstract,
          authors: paper.authors,
          published_date: paper.published,
          category: paper.category,
          pdf_url: paper.pdfUrl
        });

        // Chunk paper content
        const chunks = chunkPaperContent(paper.abstract, {
          chunkSize: 512,
          strategy: 'sentence'
        });

        // Insert chunks and generate embeddings
        for (let i = 0; i < chunks.length; i++) {
          const chunkContent = chunks[i];

          // Insert chunk
          const chunkId = await this.d1Client.insertChunk({
            paper_id: paperId,
            chunk_index: i,
            content: chunkContent
          });

          // Generate embedding
          try {
            const embedding = await this.embeddingsService.generateEmbedding(chunkContent);
            await this.d1Client.insertEmbedding(chunkId, embedding);
            result.totalEmbeddings++;
          } catch (embError) {
            console.error(`[IngestionService] Embedding error for chunk ${i}:`, embError);
            // Continue with next chunk even if embedding fails
          }

          result.totalChunks++;
        }

        result.successfulPapers++;
      } catch (error) {
        console.error(`[IngestionService] Error ingesting paper ${paper.arxivId}:`, error);
        result.errors.push({
          paperId: paper.arxivId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Fetch papers from arXiv API
   */
  async fetchArxivPapers(
    query: string = 'cat:cs.AI',
    maxResults: number = 50,
    startIndex: number = 0
  ): Promise<ArxivPaper[]> {
    try {
      // Construct arXiv API URL
      const url = new URL('http://export.arxiv.org/api/query');
      url.searchParams.append('search_query', query);
      url.searchParams.append('start', startIndex.toString());
      url.searchParams.append('max_results', maxResults.toString());
      url.searchParams.append('sortBy', 'submittedDate');
      url.searchParams.append('sortOrder', 'descending');

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`arXiv API error: ${response.status}`);
      }

      const text = await response.text();

      // Parse XML response
      const papers = this.parseArxivXML(text);
      return papers;
    } catch (error) {
      console.error('[IngestionService] Error fetching arXiv papers:', error);
      throw error;
    }
  }

  /**
   * Parse arXiv XML response
   */
  private parseArxivXML(xml: string): ArxivPaper[] {
    const papers: ArxivPaper[] = [];

    // Simple regex-based parsing (XML parsing in Workers is limited)
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let entryMatch;

    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entry = entryMatch[1];

      // Extract fields
      const idMatch = /<id>http:\/\/arxiv\.org\/abs\/([\d.]+)<\/id>/.exec(entry);
      const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
      const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entry);
      const publishedMatch = /<published>([^<]+)<\/published>/.exec(entry);
      const categoryMatch = /<arxiv:primary_category term="([^"]+)"/.exec(entry);

      if (!idMatch) continue;

      const arxivId = idMatch[1];
      const title = titleMatch ? this.cleanText(titleMatch[1]) : 'Untitled';
      const abstract = summaryMatch ? this.cleanText(summaryMatch[1]) : '';
      const published = publishedMatch ? publishedMatch[1].split('T')[0] : new Date().toISOString().split('T')[0];
      const category = categoryMatch ? categoryMatch[1] : 'cs.AI';

      // Extract authors
      const authorMatches = [...entry.matchAll(/<author><name>([^<]+)<\/name><\/author>/g)];
      const authors = authorMatches.map(m => m[1]);

      papers.push({
        id: arxivId,
        arxivId,
        title,
        abstract,
        authors: authors.length > 0 ? authors : ['Unknown'],
        published,
        category,
        pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`
      });
    }

    return papers;
  }

  /**
   * Clean text from XML
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/&#\d+;/g, '')
      .trim();
  }

  /**
   * Bulk ingest papers from JSONL format (one JSON per line)
   * Processes in batches to avoid timeout/memory issues
   */
  async bulkIngestFromJsonl(jsonlContent: string, batchSize: number = 500): Promise<BulkIngestionResult> {
    const startTime = Date.now();
    const result: BulkIngestionResult = {
      totalPapers: 0,
      successfulPapers: 0,
      totalChunks: 0,
      totalEmbeddings: 0,
      duplicatesSkipped: 0,
      errors: [],
      duration: 0,
      batchCount: 0
    };

    // Parse JSONL
    const lines = jsonlContent.trim().split('\n');
    const papers: ArxivPaper[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const doc = JSON.parse(line);
        papers.push({
          id: doc.id,
          title: doc.title,
          authors: doc.authors || ['Unknown'],
          abstract: doc.abstract || '',
          published: doc.published || new Date().toISOString().split('T')[0],
          arxivId: doc.arxiv_id,
          category: doc.category || 'cs.AI',
          pdfUrl: doc.pdf_url || `https://arxiv.org/pdf/${doc.arxiv_id}.pdf`
        });
      } catch (e) {
        console.error(`[IngestionService] Failed to parse JSONL line:`, e);
      }
    }

    result.totalPapers = papers.length;
    console.log(`[IngestionService] Processing ${papers.length} papers in batches of ${batchSize}`);

    // Process in batches
    for (let i = 0; i < papers.length; i += batchSize) {
      const batch = papers.slice(i, i + batchSize);
      result.batchCount++;

      console.log(`[IngestionService] Processing batch ${result.batchCount} (${batch.length} papers)`);

      try {
        const batchResult = await this.ingestPapers(batch);
        result.successfulPapers += batchResult.successfulPapers;
        result.totalChunks += batchResult.totalChunks;
        result.totalEmbeddings += batchResult.totalEmbeddings;
        result.errors = result.errors.concat(batchResult.errors);

        // Check for duplicates (if paper exists, it's skipped by d1Client)
        result.duplicatesSkipped += batch.length - batchResult.successfulPapers;
      } catch (batchError) {
        console.error(`[IngestionService] Batch ${result.batchCount} failed:`, batchError);
        result.errors.push({
          paperId: `batch-${result.batchCount}`,
          error: batchError instanceof Error ? batchError.message : 'Unknown batch error'
        });
      }

      // Small delay between batches to avoid overwhelming resources
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Log ingestion result
   */
  async logIngestion(result: IngestionResult, status: 'pending' | 'running' | 'completed' | 'failed'): Promise<void> {
    await this.d1Client.logIngestion({
      ingestionDate: new Date().toISOString().split('T')[0],
      papersFetched: result.totalPapers,
      papersIndexed: result.successfulPapers,
      chunksCreated: result.totalChunks,
      embeddingsGenerated: result.totalEmbeddings,
      status,
      errorMessage: result.errors.length > 0 ? `${result.errors.length} errors during ingestion` : undefined
    });
  }
}

export default IngestionService;
