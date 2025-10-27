/**
 * Rate limiting middleware
 */

import { RateLimitError } from './errors';

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute?: number;
  requestsPerHour?: number;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private env: any;
  private cacheKeyPrefix = 'ratelimit:';

  constructor(env: any, config: RateLimitConfig = { enabled: true }) {
    this.env = env;
    this.config = config;
  }

  /**
   * Check if request should be rate limited
   */
  async checkLimit(
    identifier: string,
    limit: number = this.config.requestsPerMinute || 60,
    windowSeconds: number = 60
  ): Promise<void> {
    if (!this.config.enabled || !this.env.CACHE) {
      return; // Rate limiting disabled
    }

    const cacheKey = `${this.cacheKeyPrefix}${identifier}`;

    try {
      // Get current count from cache
      const cached = await this.env.CACHE.get(cacheKey);
      const count = cached ? parseInt(cached) : 0;

      if (count >= limit) {
        throw new RateLimitError(Math.ceil(windowSeconds));
      }

      // Increment counter
      const newCount = count + 1;
      await this.env.CACHE.put(cacheKey, String(newCount), {
        expirationTtl: windowSeconds
      });
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      // If cache fails, allow request through
      console.error('[RateLimiter] Cache error:', error);
    }
  }

  /**
   * Get rate limit info for identifier
   */
  async getInfo(identifier: string): Promise<{
    remaining: number;
    limit: number;
    resetTime: number;
  }> {
    if (!this.config.enabled || !this.env.CACHE) {
      return {
        remaining: this.config.requestsPerMinute || 60,
        limit: this.config.requestsPerMinute || 60,
        resetTime: Date.now() + 60000
      };
    }

    const cacheKey = `${this.cacheKeyPrefix}${identifier}`;
    const limit = this.config.requestsPerMinute || 60;

    try {
      const cached = await this.env.CACHE.get(cacheKey);
      const count = cached ? parseInt(cached) : 0;
      const remaining = Math.max(0, limit - count);

      return {
        remaining,
        limit,
        resetTime: Date.now() + 60000
      };
    } catch (error) {
      console.error('[RateLimiter] Error getting info:', error);
      return {
        remaining: limit,
        limit,
        resetTime: Date.now() + 60000
      };
    }
  }

  /**
   * Extract identifier from request (IP, user ID, etc.)
   */
  getIdentifier(cfConnectingIp?: string, userId?: string): string {
    if (userId) {
      return `user:${userId}`;
    }
    if (cfConnectingIp) {
      return `ip:${cfConnectingIp}`;
    }
    return 'anonymous';
  }
}
