import { Hono } from 'hono';
import { AISearchClient, ArxivClient } from './services';
import { ConfigManager, Validator, formatError, isAppError, ValidationError } from './middleware';
import { Analytics } from './utils';

interface Env {
  AI: Ai;
  ANALYTICS: AnalyticsEngineDataPoint;
  CACHE?: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// Initialize services
let configManager: ConfigManager;
let analytics: Analytics;
let aiSearchClient: AISearchClient;
let arxivClient: ArxivClient;

/**
 * Initialize services on first request
 */
function initializeServices(env: Env) {
  if (!configManager) {
    configManager = new ConfigManager(env);
    analytics = new Analytics(env, {
      enabled: configManager.get('analytics.enabled'),
      sampleRate: configManager.get('analytics.sampleRate')
    });
    aiSearchClient = new AISearchClient(env, configManager.get('aiSearch.instanceName'));
    arxivClient = new ArxivClient();
  }
}

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  initializeServices(c.env);

  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'cloudflare-arxiv-rag',
    version: '0.1.0',
    config: {
      environment: configManager.get('env'),
      aiSearch: configManager.get('aiSearch.instanceName')
    }
  });
});

/**
 * Search endpoint - retrieval only (no generation)
 */
app.post('/api/v1/search', async (c) => {
  try {
    initializeServices(c.env);
    const data = await c.req.json();

    // Validate input
    Validator.validateSearchRequest(data);

    const { query, max_results = 10 } = data;
    const startTime = Date.now();

    // AI Search: pure retrieval
    const results = await aiSearchClient.search({
      query,
      maxNumResults: max_results
    });

    const latency = Date.now() - startTime;

    // Track analytics
    analytics.trackSearchRequest(query, results.length, latency);

    return c.json({
      success: true,
      query,
      results_count: results.length,
      latency_ms: latency,
      data: results
    });
  } catch (error) {
    if (isAppError(error)) {
      analytics.trackError('/api/v1/search', error.message, error.statusCode);
      return c.json(formatError(error), error.statusCode);
    }
    analytics.trackError('/api/v1/search', String(error), 500);
    return c.json(formatError(error), 500);
  }
});

/**
 * RAG endpoint - retrieval + AI generation
 */
app.post('/api/v1/ask', async (c) => {
  try {
    initializeServices(c.env);
    const data = await c.req.json();

    // Validate input
    Validator.validateRAGRequest(data);

    const { query, top_k = 3 } = data;

    // AI Search: retrieval + generation
    const response = await aiSearchClient.aiSearch({
      query,
      maxNumResults: top_k,
      stream: false,
      model: '@cf/meta/llama-3.3-70b-instruct-sd'
    });

    // Track analytics
    analytics.trackRAGRequest(query, response.latency_ms, response.cache_hit, top_k);

    return c.json(response);
  } catch (error) {
    if (isAppError(error)) {
      analytics.trackError('/api/v1/ask', error.message, error.statusCode);
      return c.json(formatError(error), error.statusCode);
    }
    analytics.trackError('/api/v1/ask', String(error), 500);
    return c.json(formatError(error), 500);
  }
});

/**
 * Streaming RAG endpoint - real-time response streaming
 */
app.post('/api/v1/stream', async (c) => {
  try {
    initializeServices(c.env);
    const data = await c.req.json();

    // Validate input
    Validator.validateRAGRequest(data);

    const { query, top_k = 3 } = data;

    // AI Search: retrieval + streaming generation
    const response = await aiSearchClient.aiSearchStream({
      query,
      maxNumResults: top_k,
      model: '@cf/meta/llama-3.3-70b-instruct-sd'
    });

    // Track analytics
    analytics.trackRAGRequest(query, 0, false, top_k);

    // Return streaming response
    return new Response(response, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    if (isAppError(error)) {
      analytics.trackError('/api/v1/stream', error.message, error.statusCode);
      return c.json(formatError(error), error.statusCode);
    }
    analytics.trackError('/api/v1/stream', String(error), 500);
    return c.json(formatError(error), 500);
  }
});

/**
 * Metrics endpoint - cache and performance stats
 */
app.get('/api/v1/metrics', async (c) => {
  try {
    initializeServices(c.env);

    const stats = await aiSearchClient.getStats();

    return c.json({
      service: 'cloudflare-arxiv-rag',
      timestamp: Date.now(),
      features: {
        ai_search: 'enabled',
        similarity_cache: 'enabled',
        streaming: 'enabled'
      },
      stats: {
        documentsIndexed: stats.documentsIndexed,
        cacheHitRate: `${(stats.cacheHitRate * 100).toFixed(2)}%`,
        lastSync: stats.lastSyncTime
      }
    });
  } catch (error) {
    console.error('Metrics error:', error);
    return c.json({ error: 'Failed to retrieve metrics' }, 500);
  }
});

/**
 * Error handling middleware
 */
app.onError((err, c) => {
  console.error('Handler error:', err);
  if (isAppError(err)) {
    return c.json(formatError(err), err.statusCode);
  }
  return c.json(formatError(err), 500);
});

export default app;
