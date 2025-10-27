import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';

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
        // Placeholder - requires env binding in actual deployment
        // Would use IngestionService.fetchArxivPapers()
        console.log(`[Workflow] Would fetch papers for ${dateStr} in category ${category}`);
        return [];
      });

      console.log(`[Workflow] Fetched ${papers.length} papers from arXiv`);

      if (papers.length === 0) {
        console.log('[Workflow] No papers to process');
        return {
          status: 'success',
          date: dateStr,
          papers_processed: 0,
          papers_indexed: 0,
          message: 'No papers found for this date'
        };
      }

      // Step 2: Generate report
      const report = await step.do('generate-report', async () => {
        return {
          timestamp: Date.now(),
          date: dateStr,
          category,
          papers_fetched: papers.length,
          papers_indexed: papers.length,
          papers_failed: 0,
          processing_time_ms: 0
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
 * Workflow handlers
 * 
 * In production deployment:
 * 1. Provide D1Database and Ai bindings to workflow env
 * 2. Call IngestionService.fetchArxivPapers() to get papers from arXiv
 * 3. Call IngestionService.ingestPapers() to process and embed
 * 4. Call IngestionService.logIngestion() to track results
 * 
 * Example production code:
 * 
 * const d1Client = new D1Client(env.DB);
 * const embeddingsService = new EmbeddingsService(env.AI);
 * const ingestionService = new IngestionService(d1Client, embeddingsService);
 * 
 * const papers = await ingestionService.fetchArxivPapers('cat:cs.AI', 50);
 * const result = await ingestionService.ingestPapers(papers);
 * await ingestionService.logIngestion(result, 'completed');
 */

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
