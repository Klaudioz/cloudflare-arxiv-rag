/**
 * Papers router - endpoints for paper management
 */

import { Hono } from 'hono';
import { IngestionService } from '../services';
import { formatError, isAppError, ValidationError } from '../middleware';
import { ArxivClient } from '../services/arxiv-client';

interface Env {
  AI: Ai;
  ANALYTICS: AnalyticsEngineDataPoint;
}

// Helper to convert number to Hono status code type
const getStatus = (code: number) => code as any;

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
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    return c.json(formatError(error), getStatus(500));
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
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    return c.json(formatError(error), getStatus(500));
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
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    return c.json(formatError(error), getStatus(500));
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
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    return c.json(formatError(error), getStatus(500));
  }
});

/**
 * GET /papers/archive/month/:year/:month - Get papers from specific month
 */
papersRouter.get('/archive/month/:year/:month', async (c) => {
  try {
    const year = parseInt(c.req.param('year'));
    const month = parseInt(c.req.param('month'));
    const category = c.req.query('category') || 'cs.AI';
    const maxResults = parseInt(c.req.query('max_results') || '100');

    if (!year || !month) {
      throw new ValidationError('Year and month are required');
    }

    if (month < 1 || month > 12) {
      throw new ValidationError('Month must be between 1 and 12');
    }

    const arxivClient = new ArxivClient();
    const papers = await arxivClient.fetchByMonth(year, month, category, maxResults);

    return c.json({
      success: true,
      year,
      month,
      category,
      papers_count: papers.length,
      papers
    });
  } catch (error) {
    if (isAppError(error)) {
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    return c.json(formatError(error), getStatus(500));
  }
});

/**
 * GET /papers/archive/year/:year - Get papers from specific year
 */
papersRouter.get('/archive/year/:year', async (c) => {
  try {
    const year = parseInt(c.req.param('year'));
    const category = c.req.query('category') || 'cs.AI';
    const maxResults = parseInt(c.req.query('max_results') || '100');

    if (!year) {
      throw new ValidationError('Year is required');
    }

    const arxivClient = new ArxivClient();
    const papers = await arxivClient.fetchByYear(year, category, maxResults);

    return c.json({
      success: true,
      year,
      category,
      papers_count: papers.length,
      papers
    });
  } catch (error) {
    if (isAppError(error)) {
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    return c.json(formatError(error), getStatus(500));
  }
});

/**
 * GET /papers/archive/range - Get papers from date range
 */
papersRouter.get('/archive/range', async (c) => {
  try {
    const fromDate = c.req.query('from_date');
    const toDate = c.req.query('to_date');
    const category = c.req.query('category') || 'cs.AI';
    const maxResults = parseInt(c.req.query('max_results') || '100');

    if (!fromDate || !toDate) {
      throw new ValidationError('from_date and to_date are required (YYYYMMDD format)');
    }

    if (!/^\d{8}$/.test(fromDate) || !/^\d{8}$/.test(toDate)) {
      throw new ValidationError('Invalid date format. Use YYYYMMDD');
    }

    const arxivClient = new ArxivClient();
    const papers = await arxivClient.search({
      query: `cat:${category}`,
      maxResults,
      fromDate,
      toDate,
      sortBy: 'submittedDate',
      sortOrder: 'descending'
    });

    return c.json({
      success: true,
      from_date: fromDate,
      to_date: toDate,
      category,
      papers_count: papers.length,
      papers
    });
  } catch (error) {
    if (isAppError(error)) {
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    return c.json(formatError(error), getStatus(500));
  }
});
