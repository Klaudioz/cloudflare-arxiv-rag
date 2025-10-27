/**
 * Authentication middleware for API requests
 */

import { AppError } from './errors';

export interface AuthConfig {
  enabled: boolean;
  apiKeys?: string[];
  jwtSecret?: string;
}

export interface AuthContext {
  userId?: string;
  apiKey?: string;
  authenticated: boolean;
  role?: 'user' | 'admin';
}

export class AuthManager {
  private config: AuthConfig;
  private env: any;

  constructor(env: any, config: AuthConfig = { enabled: false }) {
    this.env = env;
    this.config = config;
  }

  /**
   * Authenticate request
   */
  async authenticate(request: Request): Promise<AuthContext> {
    if (!this.config.enabled) {
      return { authenticated: true };
    }

    const authHeader = request.headers.get('Authorization');

    // Check API Key (Bearer token)
    if (authHeader?.startsWith('Bearer ')) {
      const apiKey = authHeader.substring(7);
      return this.validateApiKey(apiKey);
    }

    // Check Authorization header
    if (authHeader?.startsWith('x-api-key ')) {
      const apiKey = authHeader.substring(10);
      return this.validateApiKey(apiKey);
    }

    // Check x-api-key header
    const xApiKey = request.headers.get('x-api-key');
    if (xApiKey) {
      return this.validateApiKey(xApiKey);
    }

    throw new AppError('Missing authentication credentials', 401, 'AUTH_REQUIRED');
  }

  /**
   * Validate API key
   */
  private async validateApiKey(apiKey: string): Promise<AuthContext> {
    if (!apiKey || apiKey.length === 0) {
      throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
    }

    // Check against configured API keys
    if (this.config.apiKeys && this.config.apiKeys.includes(apiKey)) {
      return {
        authenticated: true,
        apiKey,
        userId: apiKey.substring(0, 16),
        role: 'user'
      };
    }

    // Check against admin key (if configured)
    const adminKey = this.env.ADMIN_API_KEY;
    if (adminKey && apiKey === adminKey) {
      return {
        authenticated: true,
        apiKey,
        userId: 'admin',
        role: 'admin'
      };
    }

    throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
  }

  /**
   * Validate JWT token
   */
  async validateJWT(token: string): Promise<AuthContext> {
    if (!this.config.jwtSecret) {
      throw new AppError('JWT validation not configured', 500, 'JWT_NOT_CONFIGURED');
    }

    try {
      // In production, use a proper JWT library
      // This is a simplified implementation
      const [headerB64, payloadB64, signatureB64] = token.split('.');

      if (!headerB64 || !payloadB64 || !signatureB64) {
        throw new Error('Invalid JWT format');
      }

      const payload = JSON.parse(atob(payloadB64));

      // Check expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        throw new AppError('Token expired', 401, 'TOKEN_EXPIRED');
      }

      return {
        authenticated: true,
        userId: payload.sub || payload.userId,
        role: payload.role || 'user'
      };
    } catch (error) {
      throw new AppError('Invalid JWT token', 401, 'INVALID_JWT');
    }
  }

  /**
   * Require authentication
   */
  requireAuth(context: AuthContext): void {
    if (!context.authenticated) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }
  }

  /**
   * Require admin role
   */
  requireAdmin(context: AuthContext): void {
    this.requireAuth(context);

    if (context.role !== 'admin') {
      throw new AppError('Admin access required', 403, 'FORBIDDEN');
    }
  }

  /**
   * Get user identifier for rate limiting
   */
  getUserIdentifier(context: AuthContext, cfConnectingIp?: string): string {
    if (context.authenticated && context.userId) {
      return `user:${context.userId}`;
    }

    if (cfConnectingIp) {
      return `ip:${cfConnectingIp}`;
    }

    return 'anonymous';
  }
}
