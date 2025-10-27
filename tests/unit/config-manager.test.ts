/**
 * Tests for ConfigManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../../src/config';

describe('ConfigManager', () => {
  describe('initialization', () => {
    it('should load environment variables', () => {
      const env = {
        ENVIRONMENT: 'production',
        AI_SEARCH_NAME: 'test-instance',
        ARXIV_CATEGORY: 'cs.LG'
      };

      const config = new ConfigManager(env);

      expect(config.get('env')).toBe('production');
      expect(config.get('aiSearch.instanceName')).toBe('test-instance');
      expect(config.get('arxiv.category')).toBe('cs.LG');
    });

    it('should use default values when env vars are missing', () => {
      const config = new ConfigManager({});

      expect(config.get('env')).toBe('production');
      expect(config.get('aiSearch.instanceName')).toBe('arxiv-papers');
      expect(config.get('arxiv.category')).toBe('cs.AI');
    });

    it('should parse nested configuration', () => {
      const config = new ConfigManager({});

      expect(config.get('api.maxResultsLimit')).toBeDefined();
      expect(config.get('analytics.enabled')).toBeDefined();
      expect(config.get('cache.ttlSeconds')).toBeDefined();
    });
  });

  describe('environment checks', () => {
    it('should identify development environment', () => {
      const config = new ConfigManager({ ENVIRONMENT: 'development' });
      expect(config.isDevelopment()).toBe(true);
      expect(config.isProduction()).toBe(false);
    });

    it('should identify production environment', () => {
      const config = new ConfigManager({ ENVIRONMENT: 'production' });
      expect(config.isProduction()).toBe(true);
      expect(config.isDevelopment()).toBe(false);
    });

    it('should identify staging environment', () => {
      const config = new ConfigManager({ ENVIRONMENT: 'staging' });
      expect(config.isStaging()).toBe(true);
    });
  });

  describe('rate limiting config', () => {
    it('should parse rate limit settings', () => {
      const env = {
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_PER_MINUTE: '100',
        RATE_LIMIT_PER_HOUR: '5000'
      };

      const config = new ConfigManager(env);

      expect(config.get('rateLimit.enabled')).toBe(true);
      expect(config.get('rateLimit.requestsPerMinute')).toBe(100);
      expect(config.get('rateLimit.requestsPerHour')).toBe(5000);
    });

    it('should use default rate limit values', () => {
      const config = new ConfigManager({});

      expect(config.get('rateLimit.enabled')).toBe(false);
      expect(config.get('rateLimit.requestsPerMinute')).toBe(60);
      expect(config.get('rateLimit.requestsPerHour')).toBe(1000);
    });
  });

  describe('authentication config', () => {
    it('should parse API keys', () => {
      const env = {
        AUTH_ENABLED: 'true',
        API_KEYS: 'sk-key1,sk-key2,sk-key3'
      };

      const config = new ConfigManager(env);

      expect(config.get('auth.enabled')).toBe(true);
      expect(config.get('auth.apiKeys')).toEqual(['sk-key1', 'sk-key2', 'sk-key3']);
    });

    it('should handle empty API keys', () => {
      const config = new ConfigManager({ AUTH_ENABLED: 'true' });

      expect(config.get('auth.enabled')).toBe(true);
      expect(config.get('auth.apiKeys')).toEqual([]);
    });

    it('should trim whitespace from API keys', () => {
      const env = {
        AUTH_ENABLED: 'true',
        API_KEYS: 'sk-key1 , sk-key2 , sk-key3'
      };

      const config = new ConfigManager(env);

      expect(config.get('auth.apiKeys')).toEqual(['sk-key1', 'sk-key2', 'sk-key3']);
    });
  });

  describe('getConfig', () => {
    it('should return frozen config object', () => {
      const config = new ConfigManager({});
      const frozen = config.getConfig();

      expect(() => {
        (frozen as any).newProp = 'value';
      }).toThrow();
    });
  });
});
