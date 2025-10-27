/**
 * Integration tests for middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../src/middleware/rate-limiter';
import { AuthManager } from '../../src/middleware/auth';
import { Validator } from '../../src/middleware/validation';

describe('Middleware Integration Tests', () => {
  describe('RateLimiter', () => {
    let limiter: RateLimiter;
    let mockEnv: any;

    beforeEach(() => {
      mockEnv = {
        CACHE: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined)
        }
      };

      limiter = new RateLimiter(mockEnv, {
        enabled: true,
        requestsPerMinute: 10,
        requestsPerHour: 100
      });
    });

    it('should allow requests within limit', async () => {
      await expect(limiter.checkLimit('test-user')).resolves.toBeUndefined();
    });

    it('should track rate limit info', async () => {
      const info = await limiter.getInfo('test-user');

      expect(info.remaining).toBeDefined();
      expect(info.limit).toBe(10);
      expect(info.resetTime).toBeDefined();
    });

    it('should handle per-IP limiting', async () => {
      const identifier = limiter.getIdentifier('192.168.1.1');

      expect(identifier).toContain('ip:');
    });

    it('should handle per-user limiting', async () => {
      const identifier = limiter.getIdentifier(undefined, 'user-123');

      expect(identifier).toContain('user:');
    });

    it('should fallback to anonymous when no identifier', () => {
      const identifier = limiter.getIdentifier();

      expect(identifier).toBe('anonymous');
    });
  });

  describe('AuthManager', () => {
    let authManager: AuthManager;
    let mockEnv: any;

    beforeEach(() => {
      mockEnv = {
        ADMIN_API_KEY: 'sk-admin-key'
      };
    });

    it('should allow requests without auth when disabled', async () => {
      authManager = new AuthManager(mockEnv, { enabled: false });

      const req = new Request('http://localhost', { headers: {} });
      const context = await authManager.authenticate(req);

      expect(context.authenticated).toBe(true);
    });

    it('should validate Bearer token', async () => {
      authManager = new AuthManager(mockEnv, {
        enabled: true,
        apiKeys: ['sk-test-key']
      });

      const req = new Request('http://localhost', {
        headers: { Authorization: 'Bearer sk-test-key' }
      });

      const context = await authManager.authenticate(req);

      expect(context.authenticated).toBe(true);
      expect(context.apiKey).toBe('sk-test-key');
    });

    it('should validate x-api-key header', async () => {
      authManager = new AuthManager(mockEnv, {
        enabled: true,
        apiKeys: ['sk-test-key']
      });

      const req = new Request('http://localhost', {
        headers: { 'x-api-key': 'sk-test-key' }
      });

      const context = await authManager.authenticate(req);

      expect(context.authenticated).toBe(true);
    });

    it('should recognize admin key', async () => {
      authManager = new AuthManager(mockEnv, { enabled: true });

      const req = new Request('http://localhost', {
        headers: { Authorization: 'Bearer sk-admin-key' }
      });

      const context = await authManager.authenticate(req);

      expect(context.role).toBe('admin');
    });

    it('should reject invalid credentials', async () => {
      authManager = new AuthManager(mockEnv, { enabled: true });

      const req = new Request('http://localhost', {
        headers: { Authorization: 'Bearer invalid-key' }
      });

      await expect(authManager.authenticate(req)).rejects.toThrow();
    });

    it('should require auth when enabled', async () => {
      authManager = new AuthManager(mockEnv, { enabled: true });

      const req = new Request('http://localhost', { headers: {} });

      await expect(authManager.authenticate(req)).rejects.toThrow();
    });
  });

  describe('Validator', () => {
    it('should validate search requests', () => {
      const validator = new Validator();

      const validData = { query: 'test', top_k: 5 };
      expect(() => validator.validateSearchRequest(validData)).not.toThrow();
    });

    it('should reject invalid search requests', () => {
      const validator = new Validator();

      const invalidData = { top_k: 5 }; // Missing query
      expect(() => validator.validateSearchRequest(invalidData)).toThrow();
    });

    it('should validate RAG requests', () => {
      const validator = new Validator();

      const validData = { query: 'What are transformers?', top_k: 3 };
      expect(() => validator.validateRAGRequest(validData)).not.toThrow();
    });

    it('should enforce max constraints', () => {
      const validator = new Validator();

      const data = { query: 'test'.repeat(10000), top_k: 50 };
      expect(() => validator.validateRAGRequest(data)).toThrow();
    });
  });

  describe('Combined Middleware Flow', () => {
    it('should authenticate and rate limit together', async () => {
      const mockEnv = {
        CACHE: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined)
        },
        ADMIN_API_KEY: 'sk-admin'
      };

      const authManager = new AuthManager(mockEnv, {
        enabled: true,
        apiKeys: ['sk-test']
      });

      const limiter = new RateLimiter(mockEnv, { enabled: true });

      // Authenticate
      const req = new Request('http://localhost', {
        headers: { Authorization: 'Bearer sk-test' }
      });

      const context = await authManager.authenticate(req);
      expect(context.authenticated).toBe(true);

      // Rate limit
      const identifier = authManager.getUserIdentifier(context, '192.168.1.1');
      await expect(limiter.checkLimit(identifier)).resolves.toBeUndefined();
    });
  });
});
