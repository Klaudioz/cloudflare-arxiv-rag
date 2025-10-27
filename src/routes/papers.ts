/**
 * Papers router - endpoints for paper management
 */

import { Hono } from 'hono';
import { IngestionService } from '../services';
import { formatError, isAppError, ValidationError } from '../middleware';

interface Env {
  AI: Ai;
  ANALYTICS: AnalyticsEngineDataPoint;
}

export const papersRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /papers - List recent papers
 */
papersRouter.get('/', async (c) => {
  try {
    // In production, would fetch from D1 or AI Search
    return c.json({
      success: true,
      papers: [],
      total: 0,
      message: 'Paper listing not yet implemented'
    });
  } catch (error) {
    if (isAppError(error)) {
      return c.json(formatError(error), error.statusCode);
    }
    return c.json(formatError(error), 500);
  }
});

/**
 * GET /papers/:id - Get specific paper
 */
papersRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    if (!id) {
      throw new ValidationError('Paper ID is required');
    }

    // In production, would fetch from D1 or AI Search
    return c.json({
      success: false,
      error: 'Paper not found',
      id
    }, 404);
  } catch (error) {
    if (isAppError(error)) {
      return c.json(formatError(error), error.statusCode);
    }
    return c.json(formatError(error), 500);
  }
});

/**
 * POST /papers/ingest - Trigger paper ingestion
 */
papersRouter.post('/ingest', async (c) => {
  try {
    const { date, category = 'cs.AI', max_results = 100 } = await c.req.json();

    if (!date) {
      throw new ValidationError('Date is required (YYYY-MM-DD format)');
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('Invalid date format. Use YYYY-MM-DD');
    }

    const ingestionService = new IngestionService();
    const result = await ingestionService.ingestByDate(date, category, max_results);

    return c.json({
      success: true,
      ...result
    });
  } catch (error) {
    if (isAppError(error)) {
      return c.json(formatError(error), error.statusCode);
    }
    return c.json(formatError(error), 500);
  }
});

/**
 * GET /papers/daily/:date - Get papers from specific date
 */
papersRouter.get('/daily/:date', async (c) => {
  try {
    const date = c.req.param('date');
    const category = c.req.query('category') || 'cs.AI';

    if (!date) {
      throw new ValidationError('Date is required');
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('Invalid date format. Use YYYY-MM-DD');
    }

    const ingestionService = new IngestionService();
    const papers = await ingestionService.getDailyPapers(date, category);

    return c.json({
      success: true,
      date,
      category,
      papers_count: papers.length,
      papers
    });
  } catch (error) {
    if (isAppError(error)) {
      return c.json(formatError(error), error.statusCode);
    }
    return c.json(formatError(error), 500);
  }
});
