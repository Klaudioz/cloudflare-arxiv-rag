/**
 * Paper ingestion service for processing arXiv papers
 */

import { ArxivClient } from './arxiv-client';
import { ArxivPaper } from '../types';

export interface IngestionResult {
  papersFetched: number;
  papersIndexed: number;
  papersFailed: number;
  processingTimeMs: number;
  errors: string[];
}

export class IngestionService {
  private arxivClient: ArxivClient;

  constructor() {
    this.arxivClient = new ArxivClient();
  }

  /**
   * Ingest papers for a specific date
   */
  async ingestByDate(
    date: string,
    category: string = 'cs.AI',
    maxResults: number = 100
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Fetch papers from arXiv
      const papers = await this.arxivClient.fetchByDate(date, category, maxResults);

      if (papers.length === 0) {
        return {
          papersFetched: 0,
          papersIndexed: 0,
          papersFailed: 0,
          processingTimeMs: Date.now() - startTime,
          errors
        };
      }

      // Process papers for indexing
      const processedPapers = this.processPapers(papers);

      // Index papers (in production, would index to AI Search)
      const indexResult = await this.indexPapers(processedPapers);

      return {
        papersFetched: papers.length,
        papersIndexed: indexResult.success,
        papersFailed: indexResult.failed,
        processingTimeMs: Date.now() - startTime,
        errors: [...errors, ...indexResult.errors]
      };
    } catch (error) {
      const errorMsg = String(error);
      errors.push(errorMsg);

      return {
        papersFetched: 0,
        papersIndexed: 0,
        papersFailed: 0,
        processingTimeMs: Date.now() - startTime,
        errors
      };
    }
  }

  /**
   * Process papers for storage
   */
  private processPapers(papers: ArxivPaper[]): ArxivPaper[] {
    return papers.map((paper) => ({
      ...paper,
      // Ensure all required fields are present
      arxiv_id: paper.arxiv_id || '',
      title: this.sanitizeText(paper.title || ''),
      abstract: this.sanitizeText(paper.abstract || ''),
      authors: paper.authors || [],
      published_date: paper.published_date || new Date().toISOString(),
      pdf_url: paper.pdf_url || '',
      categories: paper.categories || []
    }));
  }

  /**
   * Index papers to AI Search
   */
  private async indexPapers(papers: ArxivPaper[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const paper of papers) {
      try {
        // In production, this would:
        // 1. Upload paper data to R2
        // 2. Trigger AI Search sync
        // 3. Wait for indexing completion

        successCount++;
      } catch (error) {
        failureCount++;
        errors.push(`Failed to index ${paper.arxiv_id}: ${String(error)}`);
      }
    }

    return { success: successCount, failed: failureCount, errors };
  }

  /**
   * Sanitize text for storage
   */
  private sanitizeText(text: string): string {
    return text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 10000); // Limit text length
  }

  /**
   * Get daily papers
   */
  async getDailyPapers(
    date: string,
    category: string = 'cs.AI',
    maxResults: number = 100
  ): Promise<ArxivPaper[]> {
    try {
      return await this.arxivClient.fetchByDate(date, category, maxResults);
    } catch (error) {
      console.error('[IngestionService] Error fetching daily papers:', error);
      return [];
    }
  }
}
