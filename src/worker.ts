import { Hono } from 'hono';

interface Env {
  AI: Ai;
  ANALYTICS: AnalyticsEngineDataPoint;
}

const app = new Hono<{ Bindings: Env }>();

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'cloudflare-arxiv-rag',
    version: '0.1.0'
  });
});

/**
 * Search endpoint - retrieval only (no generation)
 * 
 * @param query - Search query
 * @param max_results - Max results to return (default: 10, max: 50)
 * @returns Array of matching papers
 */
app.post('/api/v1/search', async (c) => {
  try {
    const { query, max_results = 10 } = await c.req.json();

    if (!query) {
      return c.json({ error: 'query is required' }, 400);
    }

    if (max_results > 50) {
      return c.json({ error: 'max_results cannot exceed 50' }, 400);
    }

    // AI Search: pure retrieval
    const results = await c.env.AI.aiSearch('arxiv-papers').search({
      query,
      max_num_results: max_results
    });

    // Track analytics
    trackMetric(c.env, 'search_request', 1, { query_length: query.length });

    return c.json({
      success: true,
      query,
      results_count: results.data?.length || 0,
      data: results.data || []
    });
  } catch (error) {
    console.error('Search error:', error);
    trackMetric(c.env, 'search_error', 1, { error_type: 'search' });
    return c.json({ error: 'Search failed' }, 500);
  }
});

/**
 * RAG endpoint - retrieval + AI generation
 * 
 * @param query - User question
 * @param top_k - Number of papers to retrieve (default: 3, max: 10)
 * @returns Generated answer with source papers
 */
app.post('/api/v1/ask', async (c) => {
  try {
    const { query, top_k = 3 } = await c.req.json();

    if (!query) {
      return c.json({ error: 'query is required' }, 400);
    }

    if (top_k > 10) {
      return c.json({ error: 'top_k cannot exceed 10' }, 400);
    }

    const startTime = Date.now();

    // AI Search: retrieval + generation
    const response = await c.env.AI.aiSearch('arxiv-papers').aiSearch({
      query,
      max_num_results: top_k,
      stream: false,
      model: '@cf/meta/llama-3.3-70b-instruct-sd'
    });

    const latency = Date.now() - startTime;

    // Track analytics
    trackMetric(c.env, 'rag_request', latency, { 
      query_length: query.length,
      top_k
    });

    return c.json({
      success: true,
      query,
      response: response.result?.response || '',
      sources: response.result?.data || [],
      latency_ms: latency,
      cache_hit: latency < 100 // Heuristic: cache hits are very fast
    });
  } catch (error) {
    console.error('RAG error:', error);
    trackMetric(c.env, 'rag_error', 1, { error_type: 'rag' });
    return c.json({ error: 'RAG request failed' }, 500);
  }
});

/**
 * Streaming RAG endpoint - real-time response streaming
 * 
 * @param query - User question
 * @param top_k - Number of papers to retrieve (default: 3, max: 10)
 * @returns Server-Sent Events stream
 */
app.post('/api/v1/stream', async (c) => {
  try {
    const { query, top_k = 3 } = await c.req.json();

    if (!query) {
      return c.json({ error: 'query is required' }, 400);
    }

    if (top_k > 10) {
      return c.json({ error: 'top_k cannot exceed 10' }, 400);
    }

    // AI Search: retrieval + streaming generation
    const response = await c.env.AI.aiSearch('arxiv-papers').aiSearch({
      query,
      max_num_results: top_k,
      stream: true,
      model: '@cf/meta/llama-3.3-70b-instruct-sd'
    });

    // Track analytics
    trackMetric(c.env, 'stream_request', 1, { query_length: query.length });

    // Return streaming response
    return new Response(response.toReadableStream(), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Stream error:', error);
    trackMetric(c.env, 'stream_error', 1, { error_type: 'stream' });
    return c.json({ error: 'Stream request failed' }, 500);
  }
});

/**
 * Metrics endpoint - cache and performance stats
 */
app.get('/api/v1/metrics', async (c) => {
  return c.json({
    service: 'cloudflare-arxiv-rag',
    timestamp: Date.now(),
    features: {
      ai_search: 'enabled',
      similarity_cache: 'enabled',
      streaming: 'enabled'
    },
    note: 'Full metrics available in Cloudflare Dashboard'
  });
});

/**
 * Helper function to track metrics
 */
function trackMetric(env: Env, name: string, value: number, tags?: Record<string, any>) {
  try {
    env.ANALYTICS.writeDataPoint({
      indexes: [name, ...(tags ? Object.values(tags) : [])],
      blobs: [JSON.stringify(tags || {})],
      doubles: [value]
    });
  } catch (e) {
    console.error('Analytics error:', e);
  }
}

export default app;
