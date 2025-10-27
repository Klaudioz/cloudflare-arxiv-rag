/**
 * Caching utilities for AI Search queries
 * 
 * AI Search provides built-in similarity caching with MinHash + LSH
 * This module provides helpers for cache key generation and metrics
 */

export interface CacheConfig {
  ttlSeconds: number;
  enabled: boolean;
}

export class QueryCache {
  private config: CacheConfig;
  private env: any;

  constructor(env: any, config: CacheConfig = { ttlSeconds: 86400, enabled: true }) {
    this.env = env;
    this.config = config;
  }

  /**
   * Generate a deterministic cache key for a query
   * AI Search handles similarity caching internally, but we can use this for KV caching
   */
  generateCacheKey(query: string, topK: number = 3): string {
    const queryNormalized = query.toLowerCase().trim();
    const hash = this.simpleHash(queryNormalized);
    return `rag_cache:${hash}:${topK}`;
  }

  /**
   * Get cached result if available
   */
  async getCached(key: string): Promise<any | null> {
    if (!this.config.enabled) return null;

    try {
      const cached = await this.env.CACHE.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      console.error('[Cache] Error retrieving cached result:', e);
      return null;
    }
  }

  /**
   * Store result in cache
   */
  async setCached(key: string, value: any): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await this.env.CACHE.put(key, JSON.stringify(value), {
        expirationTtl: this.config.ttlSeconds
      });
    } catch (e) {
      console.error('[Cache] Error storing cache:', e);
    }
  }

  /**
   * Simple hash function for generating cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

export class CacheMetrics {
  private hits: number = 0;
  private misses: number = 0;
  private hitLatencies: number[] = [];
  private missLatencies: number[] = [];

  /**
   * Record a cache hit
   */
  recordHit(latency: number) {
    this.hits++;
    this.hitLatencies.push(latency);
  }

  /**
   * Record a cache miss
   */
  recordMiss(latency: number) {
    this.misses++;
    this.missLatencies.push(latency);
  }

  /**
   * Get cache hit rate (0-100)
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : (this.hits / total) * 100;
  }

  /**
   * Get average hit latency
   */
  getAverageHitLatency(): number {
    if (this.hitLatencies.length === 0) return 0;
    const sum = this.hitLatencies.reduce((a, b) => a + b, 0);
    return sum / this.hitLatencies.length;
  }

  /**
   * Get average miss latency
   */
  getAverageMissLatency(): number {
    if (this.missLatencies.length === 0) return 0;
    const sum = this.missLatencies.reduce((a, b) => a + b, 0);
    return sum / this.missLatencies.length;
  }

  /**
   * Get metrics summary
   */
  getSummary() {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      averageHitLatency: this.getAverageHitLatency(),
      averageMissLatency: this.getAverageMissLatency()
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.hits = 0;
    this.misses = 0;
    this.hitLatencies = [];
    this.missLatencies = [];
  }
}
