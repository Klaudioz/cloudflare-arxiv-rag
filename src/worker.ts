import { Hono } from 'hono';
import { AISearchClient } from './services';
import { Validator, formatError, isAppError, RateLimiter, AuthManager, RateLimitError } from './middleware';
import { ConfigManager } from './config';
import { Analytics } from './utils';
import { papersRouter } from './routes/papers';
import { searchRouter } from './routes/search';
import { ragRouter } from './routes/rag';
import AISearchSetupService from './services/ai-search-setup';

interface Env {
  AI: Ai;
  ANALYTICS: AnalyticsEngineDataPoint;
  CACHE?: KVNamespace;
  DB: D1Database;
  R2_BUCKET?: R2Bucket;
  ADMIN_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

// Helper to convert number to Hono status code type
const getStatus = (code: number) => code as any;

const app = new Hono<{ Bindings: Env }>();

// Root route
app.get('/', (c) => {
  return c.json({
    service: 'Cloudflare arXiv RAG',
    status: 'operational',
    version: '0.1.0',
    endpoints: {
      health: 'GET /health',
      search: {
        keyword: 'POST /api/v1/search/keyword',
        semantic: 'POST /api/v1/search/semantic',
        hybrid: 'POST /api/v1/search/hybrid'
      },
      rag: {
        ask: 'POST /api/v1/rag/ask',
        stream: 'POST /api/v1/rag/stream'
      },
      papers: {
        ingest: 'POST /api/v1/papers/ingest',
        daily: 'GET /api/v1/papers/daily'
      }
    },
    docs: 'https://github.com/Klaudioz/cloudflare-arxiv-rag'
  });
});

// Register routers
app.route('/api/v1/papers', papersRouter);
app.route('/api/v1/search', searchRouter);
app.route('/api/v1/rag', ragRouter);

// Initialize services
let configManager: ConfigManager;
let analytics: Analytics;
let aiSearchClient: AISearchClient;
let rateLimiter: RateLimiter;
let authManager: AuthManager;

// Track AI Search setup state
let aiSearchSetupAttempted = false;

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
    rateLimiter = new RateLimiter(env, {
      enabled: configManager.get('rateLimit.enabled'),
      requestsPerMinute: configManager.get('rateLimit.requestsPerMinute'),
      requestsPerHour: configManager.get('rateLimit.requestsPerHour')
    });
    authManager = new AuthManager(env, {
      enabled: configManager.get('auth.enabled'),
      apiKeys: configManager.get('auth.apiKeys')
    });

    // Attempt to setup AI Search instance (non-blocking)
    if (!aiSearchSetupAttempted && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
      aiSearchSetupAttempted = true;
      const setupService = AISearchSetupService.getInstance();
      setupService.ensureAISearchInstance({
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.CLOUDFLARE_API_TOKEN,
        instanceName: configManager.get('aiSearch.instanceName')
      }).catch(err => {
        console.error('[Worker Init] AI Search setup error (non-blocking):', err);
      });
    }
  }
}

/**
 * CORS middleware
 */
app.use('*', (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  c.header('Access-Control-Max-Age', '86400');
  
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  return next();
});

/**
 * Security headers middleware
 */
app.use('*', (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  return next();
});

/**
 * Rate limiting & authentication middleware
 */
app.use('*', async (c, next) => {
  try {
    initializeServices(c.env);

    // Skip auth for health check endpoints
    if (c.req.path === '/health' || c.req.path === '/api/v1/health') {
      return next();
    }

    // Authenticate request
    if (authManager.constructor.prototype.constructor.name === 'AuthManager') {
      const authConfig = configManager.get('auth.enabled');
      if (authConfig) {
        const authContext = await authManager.authenticate(c.req.raw);
        (c as any).set('auth', authContext);
      }
    }

    // Check rate limit
    const cfConnectingIp = c.req.header('cf-connecting-ip');
    const identifier = rateLimiter.getIdentifier(cfConnectingIp);
    
    try {
      await rateLimiter.checkLimit(identifier);
    } catch (error) {
      if (error instanceof RateLimitError) {
        analytics.trackError(c.req.path, 'Rate limit exceeded', 429);
        return c.json(formatError(error), getStatus(429));
      }
      throw error;
    }

    return next();
  } catch (error) {
    if (isAppError(error)) {
      analytics.trackError(c.req.path, error.message, error.statusCode);
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    analytics.trackError(c.req.path, String(error), 500);
    return c.json(formatError(error), getStatus(500));
  }
});

/**
 * Debug endpoint to see available bindings
 */
app.get('/debug/bindings', (c) => {
  initializeServices(c.env);

  return c.json({
    bindings: {
      ai: typeof c.env.AI,
      analytics: typeof c.env.ANALYTICS,
      r2: typeof c.env.R2_BUCKET,
      db: typeof c.env.DB,
      keys: Object.keys(c.env)
    }
  });
});

/**
 * Health check endpoints (both paths for compatibility)
 */
app.get('/health', (c) => {
  initializeServices(c.env);

  const response = c.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'cloudflare-arxiv-rag',
    version: '0.1.0',
    config: {
      environment: configManager.get('env'),
      aiSearch: configManager.get('aiSearch.instanceName')
    }
  });

  // Cache health check for 1 minute
  c.header('Cache-Control', 'public, max-age=60');
  return response;
});

app.get('/api/v1/health', (c) => {
  initializeServices(c.env);

  const response = c.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'cloudflare-arxiv-rag',
    version: '0.1.0',
    config: {
      environment: configManager.get('env'),
      aiSearch: configManager.get('aiSearch.instanceName')
    }
  });

  // Cache health check for 1 minute
  c.header('Cache-Control', 'public, max-age=60');
  return response;
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
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    analytics.trackError('/api/v1/search', String(error), 500);
    return c.json(formatError(error), getStatus(500));
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
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    analytics.trackError('/api/v1/ask', String(error), 500);
    return c.json(formatError(error), getStatus(500));
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
      return c.json(formatError(error), getStatus(error.statusCode));
    }
    analytics.trackError('/api/v1/stream', String(error), 500);
    return c.json(formatError(error), getStatus(500));
  }
});

/**
 * Metrics endpoint - cache and performance stats
 */
app.get('/api/v1/metrics', async (c) => {
  try {
    initializeServices(c.env);

    const stats = await aiSearchClient.getStats();

    const response = c.json({
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

    // Cache metrics for 5 minutes
    c.header('Cache-Control', 'public, max-age=300');
    return response;
  } catch (error) {
    console.error('Metrics error:', error);
    return c.json({ error: 'Failed to retrieve metrics' }, getStatus(500));
  }
});

/**
 * Error handling middleware
 */
app.onError((err, c) => {
  console.error('Handler error:', err);
  if (isAppError(err)) {
    return c.json(formatError(err), getStatus(err.statusCode));
  }
  return c.json(formatError(err), getStatus(500));
});

export default app;
