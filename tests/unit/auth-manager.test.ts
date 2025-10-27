/**
 * Tests for AuthManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuthManager } from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errors';

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      ADMIN_API_KEY: 'sk-admin-key'
    };
  });

  describe('authentication disabled', () => {
    it('should return authenticated context when auth is disabled', async () => {
      authManager = new AuthManager(mockEnv, { enabled: false });

      const mockRequest = new Request('http://localhost', {
        headers: {}
      });

      const context = await authManager.authenticate(mockRequest);

      expect(context.authenticated).toBe(true);
      expect(context.userId).toBeUndefined();
    });
  });

  describe('API key validation', () => {
    beforeEach(() => {
      authManager = new AuthManager(mockEnv, {
        enabled: true,
        apiKeys: ['sk-test-key-1', 'sk-test-key-2']
      });
    });

    it('should validate bearer token', async () => {
      const mockRequest = new Request('http://localhost', {
        headers: {
          'Authorization': 'Bearer sk-test-key-1'
        }
      });

      const context = await authManager.authenticate(mockRequest);

      expect(context.authenticated).toBe(true);
      expect(context.apiKey).toBe('sk-test-key-1');
      expect(context.role).toBe('user');
    });

    it('should validate x-api-key header', async () => {
      const mockRequest = new Request('http://localhost', {
        headers: {
          'x-api-key': 'sk-test-key-2'
        }
      });

      const context = await authManager.authenticate(mockRequest);

      expect(context.authenticated).toBe(true);
      expect(context.apiKey).toBe('sk-test-key-2');
    });

    it('should validate admin API key', async () => {
      const mockRequest = new Request('http://localhost', {
        headers: {
          'Authorization': 'Bearer sk-admin-key'
        }
      });

      const context = await authManager.authenticate(mockRequest);

      expect(context.authenticated).toBe(true);
      expect(context.role).toBe('admin');
      expect(context.userId).toBe('admin');
    });

    it('should reject invalid API key', async () => {
      const mockRequest = new Request('http://localhost', {
        headers: {
          'Authorization': 'Bearer invalid-key'
        }
      });

      await expect(authManager.authenticate(mockRequest)).rejects.toThrow('Invalid API key');
    });

    it('should reject missing credentials', async () => {
      const mockRequest = new Request('http://localhost', {
        headers: {}
      });

      await expect(authManager.authenticate(mockRequest)).rejects.toThrow(
        'Missing authentication credentials'
      );
    });
  });

  describe('requireAuth', () => {
    beforeEach(() => {
      authManager = new AuthManager(mockEnv, { enabled: true });
    });

    it('should pass for authenticated context', () => {
      const context = { authenticated: true, userId: 'user-1' };

      expect(() => authManager.requireAuth(context)).not.toThrow();
    });

    it('should throw for unauthenticated context', () => {
      const context = { authenticated: false };

      expect(() => authManager.requireAuth(context)).toThrow('Unauthorized');
    });
  });

  describe('requireAdmin', () => {
    beforeEach(() => {
      authManager = new AuthManager(mockEnv, { enabled: true });
    });

    it('should pass for admin role', () => {
      const context = { authenticated: true, role: 'admin' as const };

      expect(() => authManager.requireAdmin(context)).not.toThrow();
    });

    it('should fail for user role', () => {
      const context = { authenticated: true, role: 'user' as const };

      expect(() => authManager.requireAdmin(context)).toThrow('Admin access required');
    });

    it('should fail for unauthenticated', () => {
      const context = { authenticated: false };

      expect(() => authManager.requireAdmin(context)).toThrow('Unauthorized');
    });
  });

  describe('getUserIdentifier', () => {
    beforeEach(() => {
      authManager = new AuthManager(mockEnv, { enabled: true });
    });

    it('should return user identifier when authenticated', () => {
      const context = { authenticated: true, userId: 'user-123' };

      const identifier = authManager.getUserIdentifier(context);

      expect(identifier).toBe('user:user-123');
    });

    it('should return IP-based identifier when not authenticated', () => {
      const context = { authenticated: false };

      const identifier = authManager.getUserIdentifier(context, '192.168.1.1');

      expect(identifier).toBe('ip:192.168.1.1');
    });

    it('should return anonymous when no identifier available', () => {
      const context = { authenticated: false };

      const identifier = authManager.getUserIdentifier(context);

      expect(identifier).toBe('anonymous');
    });
  });
});
