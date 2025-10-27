/**
 * Analytics utilities for tracking RAG metrics
 */

export interface AnalyticsConfig {
  enabled: boolean;
  sampleRate?: number; // 0-100, percentage of requests to track
}

export class Analytics {
  private config: AnalyticsConfig;
  private env: any;

  constructor(env: any, config: AnalyticsConfig = { enabled: true }) {
    this.env = env;
    this.config = config;
  }

  /**
   * Track a RAG request
   */
  trackRAGRequest(
    query: string,
    latency: number,
    cacheHit: boolean,
    topK: number,
    error?: string
  ) {
    if (!this.shouldTrack()) return;

    try {
      this.env.ANALYTICS.writeDataPoint({
        indexes: [
          'rag_request',
          cacheHit ? 'cache_hit' : 'cache_miss',
          error ? 'error' : 'success'
        ],
        blobs: [query.substring(0, 100)],
        doubles: [latency, topK, cacheHit ? 1 : 0]
      });
    } catch (e) {
      console.error('[Analytics] Error tracking RAG request:', e);
    }
  }

  /**
   * Track a search request
   */
  trackSearchRequest(query: string, resultCount: number, latency: number) {
    if (!this.shouldTrack()) return;

    try {
      this.env.ANALYTICS.writeDataPoint({
        indexes: ['search_request', 'retrieval_only'],
        blobs: [query.substring(0, 100)],
        doubles: [latency, resultCount]
      });
    } catch (e) {
      console.error('[Analytics] Error tracking search request:', e);
    }
  }

  /**
   * Track an API error
   */
  trackError(endpoint: string, error: string, statusCode: number) {
    if (!this.shouldTrack()) return;

    try {
      this.env.ANALYTICS.writeDataPoint({
        indexes: ['api_error', endpoint, String(statusCode)],
        blobs: [error.substring(0, 100)],
        doubles: [1]
      });
    } catch (e) {
      console.error('[Analytics] Error tracking error:', e);
    }
  }

  /**
   * Track workflow execution
   */
  trackWorkflow(name: string, duration: number, status: 'success' | 'error', itemsProcessed: number) {
    if (!this.shouldTrack()) return;

    try {
      this.env.ANALYTICS.writeDataPoint({
        indexes: ['workflow', name, status],
        blobs: [name],
        doubles: [duration, itemsProcessed]
      });
    } catch (e) {
      console.error('[Analytics] Error tracking workflow:', e);
    }
  }

  /**
   * Track cache metrics
   */
  trackCacheMetrics(hitRate: number, avgHitLatency: number, avgMissLatency: number) {
    if (!this.shouldTrack()) return;

    try {
      this.env.ANALYTICS.writeDataPoint({
        indexes: ['cache_metrics', 'similarity_cache'],
        blobs: [],
        doubles: [hitRate, avgHitLatency, avgMissLatency]
      });
    } catch (e) {
      console.error('[Analytics] Error tracking cache metrics:', e);
    }
  }

  /**
   * Determine if this request should be tracked
   */
  private shouldTrack(): boolean {
    if (!this.config.enabled) return false;
    if (!this.config.sampleRate) return true;

    return Math.random() * 100 < this.config.sampleRate;
  }
}
