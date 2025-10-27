/**
 * Configuration management
 */

export interface Config {
  env: 'development' | 'staging' | 'production';
  debug: boolean;
  aiSearch: {
    instanceName: string;
    syncIntervalHours: number;
  };
  arxiv: {
    categories: string[];  // Support multiple categories
    maxResults: number;
    schedule: string;
  };
  api: {
    maxResultsLimit: number;
    maxTopKLimit: number;
    timeoutMs: number;
  };
  analytics: {
    enabled: boolean;
    sampleRate: number;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
  rateLimit: {
    enabled: boolean;
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  auth: {
    enabled: boolean;
    apiKeys: string[];
    jwtSecret?: string;
  };
}

export class ConfigManager {
  private config: Config;

  constructor(env?: any) {
    this.config = {
      env: (env?.ENVIRONMENT as any) || 'production',
      debug: env?.DEBUG === 'true',
      aiSearch: {
        instanceName: env?.AI_SEARCH_NAME || 'arxiv-papers',
        syncIntervalHours: parseInt(env?.AI_SEARCH_SYNC_INTERVAL_HOURS || '6')
      },
      arxiv: {
        categories: this.parseCategories(env?.ARXIV_CATEGORY),
        maxResults: parseInt(env?.ARXIV_MAX_RESULTS || '100'),
        schedule: env?.ARXIV_SEARCH_SCHEDULE || '0 6 * * 1-5'
      },
      api: {
        maxResultsLimit: parseInt(env?.MAX_RESULTS_LIMIT || '50'),
        maxTopKLimit: parseInt(env?.MAX_TOP_K_LIMIT || '10'),
        timeoutMs: 30000
      },
      analytics: {
        enabled: env?.ANALYTICS_ENABLED !== 'false',
        sampleRate: parseInt(env?.ANALYTICS_SAMPLE_RATE || '100')
      },
      cache: {
        enabled: env?.CACHE_ENABLED !== 'false',
        ttlSeconds: parseInt(env?.CACHE_TTL_SECONDS || '86400')
      },
      rateLimit: {
        enabled: env?.RATE_LIMIT_ENABLED === 'true',
        requestsPerMinute: parseInt(env?.RATE_LIMIT_PER_MINUTE || '60'),
        requestsPerHour: parseInt(env?.RATE_LIMIT_PER_HOUR || '1000')
      },
      auth: {
        enabled: env?.AUTH_ENABLED === 'true',
        apiKeys: this.parseApiKeys(env?.API_KEYS),
        jwtSecret: env?.JWT_SECRET
      }
    };
  }

  /**
   * Parse comma-separated arXiv categories
   */
  private parseCategories(categoriesStr?: string): string[] {
    if (!categoriesStr) {
      return ['cs.AI'];  // Default to cs.AI
    }
    return categoriesStr.split(',').map((cat) => cat.trim()).filter(Boolean);
  }

  /**
   * Parse comma-separated API keys
   */
  private parseApiKeys(apiKeysStr?: string): string[] {
    if (!apiKeysStr) {
      return [];
    }
    return apiKeysStr.split(',').map((key) => key.trim()).filter(Boolean);
  }

  getConfig(): Readonly<Config> {
    return Object.freeze(this.config);
  }

  get(key: string): any {
    return this.getNestedValue(this.config, key);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  isDevelopment(): boolean {
    return this.config.env === 'development';
  }

  isProduction(): boolean {
    return this.config.env === 'production';
  }

  isStaging(): boolean {
    return this.config.env === 'staging';
  }
}
