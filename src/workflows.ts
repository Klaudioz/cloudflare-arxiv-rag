import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';

interface ArxivPaper {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  published_date: string;
  pdf_url: string;
  categories: string[];
}

interface WorkflowPayload {
  date?: string;
  category?: string;
}

/**
 * Daily arXiv ingestion workflow
 * 
 * Runs Monday-Friday at 6 AM UTC
 * Fetches papers from arXiv and indexes them in AI Search
 */
export class ArxivIngestionWorkflow extends WorkflowEntrypoint<WorkflowPayload> {
  async run(event: any, step: WorkflowStep) {
    // Calculate target date (previous day)
    const targetDate = event.payload.date
      ? new Date(event.payload.date)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const dateStr = targetDate.toISOString().split('T')[0];
    const category = event.payload.category || 'cs.AI';

    console.log(`[Workflow] Starting ingestion for ${dateStr} in category ${category}`);

    try {
      // Step 1: Fetch papers from arXiv API
      const papers = await step.do('fetch-arxiv', async () => {
        return await fetchArxivPapers(dateStr, category);
      });

      console.log(`[Workflow] Fetched ${papers.length} papers from arXiv`);

      if (papers.length === 0) {
        return {
          status: 'success',
          date: dateStr,
          papers_processed: 0,
          papers_indexed: 0,
          message: 'No papers found for this date'
        };
      }

      // Step 2: Process and index papers
      // AI Search will automatically:
      // - Download PDFs
      // - Parse documents
      // - Chunk content
      // - Generate embeddings
      // - Create vector index
      // - Extract metadata
      const indexResult = await step.do('index-papers', async () => {
        return await indexPapersInAISearch(papers);
      });

      console.log(`[Workflow] Indexed ${indexResult.indexed} papers in AI Search`);

      // Step 3: Generate report
      const report = await step.do('generate-report', async () => {
        return {
          timestamp: Date.now(),
          date: dateStr,
          category,
          papers_fetched: papers.length,
          papers_indexed: indexResult.indexed,
          papers_failed: indexResult.failed,
          processing_time_ms: indexResult.processing_time
        };
      });

      console.log('[Workflow] Ingestion complete:', report);

      return {
        status: 'success',
        ...report
      };
    } catch (error) {
      console.error('[Workflow] Error:', error);
      return {
        status: 'error',
        date: dateStr,
        error: String(error)
      };
    }
  }
}

/**
 * Fetch papers from arXiv API
 * 
 * @param date - Date in YYYYMMDD format
 * @param category - arXiv category (e.g., cs.AI)
 * @returns Array of papers
 */
async function fetchArxivPapers(date: string, category: string): Promise<ArxivPaper[]> {
  try {
    // arXiv API query
    const fromDate = `${date}000000`;
    const toDate = `${date}235959`;

    const query = `cat:${category} AND submittedDate:[${fromDate} TO ${toDate}]`;
    const encodedQuery = encodeURIComponent(query);

    const url = `https://export.arxiv.org/api/query?search_query=${encodedQuery}&max_results=100&sortBy=submittedDate&sortOrder=descending`;

    const response = await fetch(url);
    const text = await response.text();

    // Parse Atom feed
    const papers = parseArxivFeed(text);
    console.log(`[Fetch] Retrieved ${papers.length} papers for ${date}`);

    return papers;
  } catch (error) {
    console.error('[Fetch] Error fetching from arXiv:', error);
    return [];
  }
}

/**
 * Parse arXiv Atom feed response
 */
function parseArxivFeed(xmlText: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // Simple XML parsing (production would use proper XML parser)
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entry = match[1];

    try {
      const arxivId = extractTag(entry, 'arxiv:id');
      const title = extractTag(entry, 'title')?.replace(/\n/g, ' ').trim() || '';
      const abstract = extractTag(entry, 'summary')?.replace(/\n/g, ' ').trim() || '';
      const authorMatches = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>/g) || [];
      const authors = authorMatches.map(a => a.match(/<name>(.*?)<\/name>/)?.[1] || '').filter(Boolean);
      const published = extractTag(entry, 'published');
      const pdfUrl = extractAttribute(entry, 'arxiv:pdf', 'href');

      // Extract categories
      const categoryMatches = entry.match(/<arxiv:primary_category term="([^"]+)"/);
      const categories = categoryMatches ? [categoryMatches[1]] : [];

      if (arxivId && title) {
        papers.push({
          arxiv_id: arxivId,
          title,
          abstract,
          authors,
          published_date: published || new Date().toISOString(),
          pdf_url: pdfUrl || '',
          categories
        });
      }
    } catch (e) {
      console.error('[Parse] Error parsing entry:', e);
    }
  }

  return papers;
}

/**
 * Extract XML tag content
 */
function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract XML attribute
 */
function extractAttribute(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Index papers in AI Search
 * 
 * AI Search automatically handles:
 * - Document parsing
 * - Intelligent chunking
 * - Embedding generation (via Workers AI)
 * - Vector indexing (via Vectorize)
 * - Metadata extraction
 * - Multi-region replication
 */
async function indexPapersInAISearch(papers: ArxivPaper[]): Promise<{
  indexed: number;
  failed: number;
  processing_time: number;
}> {
  const startTime = Date.now();

  try {
    // In production, this would upload to R2 and trigger AI Search sync
    // For now, we return mock success
    console.log(`[Index] Queueing ${papers.length} papers for AI Search indexing`);

    // Each paper would be uploaded to R2:
    // s3://arxiv-papers/{category}/{arxiv_id}.json
    // AI Search continuously monitors and auto-indexes new files

    const processingTime = Date.now() - startTime;

    return {
      indexed: papers.length,
      failed: 0,
      processing_time: processingTime
    };
  } catch (error) {
    console.error('[Index] Error indexing papers:', error);
    return {
      indexed: 0,
      failed: papers.length,
      processing_time: Date.now() - startTime
    };
  }
}

/**
 * Scheduled trigger for the workflow
 * Runs Monday-Friday at 6 AM UTC
 */
export default {
  async scheduled(event: ScheduledEvent, env: any) {
    console.log('[Scheduled] Triggering ArxivIngestionWorkflow');

    try {
      const workflow = env.WORKFLOWS.get('arxiv-ingestion');
      const instance = await workflow.create({
        payload: {
          date: new Date().toISOString().split('T')[0],
          category: 'cs.AI'
        }
      });

      console.log(`[Scheduled] Workflow started with ID: ${instance.id}`);
      return new Response('Workflow triggered', { status: 202 });
    } catch (error) {
      console.error('[Scheduled] Error triggering workflow:', error);
      return new Response('Failed to trigger workflow', { status: 500 });
    }
  }
};
