/**
 * Search routes for keyword, semantic, and hybrid search
 */

import { Hono } from 'hono';
import { D1Client } from '../services/d1-client';
import { EmbeddingsService } from '../services/embeddings-service';
import { SearchService } from '../services/search-service';

interface SearchEnv {
  AI: Ai;
  DB: D1Database;
}

export const searchRouter = new Hono<{ Bindings: SearchEnv }>();

/**
 * Search - keyword search on papers
 */
searchRouter.post('/keyword', async (c) => {
  try {
    const { query, limit = 10, category } = await c.req.json() as {
      query: string;
      limit?: number;
      category?: string;
    };

    // Validate input
    if (!query || query.length === 0) {
      return c.json({ error: 'Query is required' }, 400);
    }

    if (query.length > 1000) {
      return c.json({ error: 'Query too long (max 1000 chars)' }, 400);
    }

    // Initialize services
    const d1Client = new D1Client(c.env.DB);
    const searchService = new SearchService(d1Client, new EmbeddingsService(c.env.AI));

    // Perform search
    const results = await searchService.keywordSearch({
      query,
      limit,
      category
    });

    return c.json({
      query,
      type: 'keyword',
      results: results.map(r => ({
        arxivId: r.paper.arxiv_id,
        title: r.paper.title,
        abstract: r.paper.abstract,
        authors: r.paper.authors,
        publishedDate: r.paper.published_date,
        category: r.paper.category,
        score: r.score,
        pdfUrl: r.paper.pdf_url
      })),
      count: results.length
    });
  } catch (error) {
    console.error('[SearchRouter] Keyword search error:', error);
    return c.json({ error: 'Search failed' }, 500);
  }
});

/**
 * Search - semantic search using embeddings
 */
searchRouter.post('/semantic', async (c) => {
  try {
    const { query, topK = 10, minSimilarity = 0.3 } = await c.req.json() as {
      query: string;
      topK?: number;
      minSimilarity?: number;
    };

    // Validate input
    if (!query || query.length === 0) {
      return c.json({ error: 'Query is required' }, 400);
    }

    if (query.length > 1000) {
      return c.json({ error: 'Query too long (max 1000 chars)' }, 400);
    }

    // Initialize services
    const d1Client = new D1Client(c.env.DB);
    const embeddingsService = new EmbeddingsService(c.env.AI);
    const searchService = new SearchService(d1Client, embeddingsService);

    // Perform search
    const results = await searchService.semanticSearch({
      query,
      topK,
      minSimilarity
    });

    return c.json({
      query,
      type: 'semantic',
      results: results.map(r => ({
        arxivId: r.paper.arxiv_id,
        title: r.paper.title,
        abstract: r.paper.abstract,
        authors: r.paper.authors,
        publishedDate: r.paper.published_date,
        category: r.paper.category,
        score: r.score,
        pdfUrl: r.paper.pdf_url
      })),
      count: results.length
    });
  } catch (error) {
    console.error('[SearchRouter] Semantic search error:', error);
    return c.json({ error: 'Search failed' }, 500);
  }
});

/**
 * Search - hybrid search combining keyword and semantic
 */
searchRouter.post('/hybrid', async (c) => {
  try {
    const {
      query,
      topK = 10,
      keywordWeight = 0.5,
      semanticWeight = 0.5
    } = await c.req.json() as {
      query: string;
      topK?: number;
      keywordWeight?: number;
      semanticWeight?: number;
    };

    // Validate input
    if (!query || query.length === 0) {
      return c.json({ error: 'Query is required' }, 400);
    }

    if (query.length > 1000) {
      return c.json({ error: 'Query too long (max 1000 chars)' }, 400);
    }

    // Initialize services
    const d1Client = new D1Client(c.env.DB);
    const embeddingsService = new EmbeddingsService(c.env.AI);
    const searchService = new SearchService(d1Client, embeddingsService);

    // Perform search
    const results = await searchService.hybridSearch(
      query,
      topK,
      keywordWeight,
      semanticWeight
    );

    return c.json({
      query,
      type: 'hybrid',
      weights: { keyword: keywordWeight, semantic: semanticWeight },
      results: results.map(r => ({
        arxivId: r.paper.arxiv_id,
        title: r.paper.title,
        abstract: r.paper.abstract,
        authors: r.paper.authors,
        publishedDate: r.paper.published_date,
        category: r.paper.category,
        score: r.score,
        pdfUrl: r.paper.pdf_url
      })),
      count: results.length
    });
  } catch (error) {
    console.error('[SearchRouter] Hybrid search error:', error);
    return c.json({ error: 'Search failed' }, 500);
  }
});

export default searchRouter;
