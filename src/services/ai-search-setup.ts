/**
 * AI Search instance setup service
 * Automatically creates and configures AI Search instance via Cloudflare API
 */

interface AISearchSetupConfig {
  accountId: string;
  apiToken: string;
  instanceName: string;
  dataSourceUrl?: string;
}

export class AISearchSetupService {
  private static instance: AISearchSetupService;
  private setupInProgress = false;
  private setupCache: Map<string, boolean> = new Map();

  private constructor() {}

  static getInstance(): AISearchSetupService {
    if (!AISearchSetupService.instance) {
      AISearchSetupService.instance = new AISearchSetupService();
    }
    return AISearchSetupService.instance;
  }

  /**
   * Verify or create AI Search instance
   */
  async ensureAISearchInstance(config: AISearchSetupConfig): Promise<boolean> {
    const cacheKey = `${config.accountId}-${config.instanceName}`;

    // Return cached result if already checked
    if (this.setupCache.has(cacheKey)) {
      return this.setupCache.get(cacheKey) || false;
    }

    // Prevent concurrent setup attempts
    if (this.setupInProgress) {
      console.log('[AISearchSetup] Setup already in progress, skipping...');
      return false;
    }

    this.setupInProgress = true;

    try {
      // Try to get existing instance
      const exists = await this.checkInstanceExists(config);

      if (exists) {
        console.log(`[AISearchSetup] AI Search instance '${config.instanceName}' already exists`);
        this.setupCache.set(cacheKey, true);
        return true;
      }

      // Try to create instance
      const created = await this.createAISearchInstance(config);

      if (created) {
        console.log(`[AISearchSetup] AI Search instance '${config.instanceName}' created successfully`);
        this.setupCache.set(cacheKey, true);
        return true;
      } else {
        console.warn(`[AISearchSetup] Failed to create AI Search instance`);
        this.setupCache.set(cacheKey, false);
        return false;
      }
    } finally {
      this.setupInProgress = false;
    }
  }

  /**
   * Check if AI Search instance exists
   */
  private async checkInstanceExists(config: AISearchSetupConfig): Promise<boolean> {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai-search/indexes`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        console.log(`[AISearchSetup] Failed to check existing instances: ${response.status}`);
        return false;
      }

      const data = await response.json() as any;

      // Check if our instance exists in the list
      if (data.result && Array.isArray(data.result)) {
        const found = data.result.some((idx: any) => idx.name === config.instanceName);
        return found;
      }

      return false;
    } catch {
      console.log(`[AISearchSetup] Error checking instance existence`);
      return false;
    }
  }

  /**
   * Create AI Search instance via API
   */
  private async createAISearchInstance(config: AISearchSetupConfig): Promise<boolean> {
    try {
      const payload = {
        name: config.instanceName,
        settings: {
          embedding_model: '@hf/baai-bge-base-en-v1.5',
          auto_sync: true,
          sync_interval_hours: 24,
          ...(config.dataSourceUrl && { data_source: config.dataSourceUrl })
        }
      };

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai-search/indexes`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.log(`[AISearchSetup] Failed to create instance: ${response.status} - ${error}`);
        return false;
      }

      const data = await response.json() as any;

      if (data.success && data.result) {
        console.log(`[AISearchSetup] Instance created with ID: ${data.result.id}`);
        return true;
      }

      return false;
    } catch {
      console.log(`[AISearchSetup] Error creating instance`);
      return false;
    }
  }

  /**
   * Get instance status
   */
  async getInstanceStatus(config: AISearchSetupConfig): Promise<string> {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai-search/indexes`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        return 'error';
      }

      const data = await response.json() as any;

      if (data.result && Array.isArray(data.result)) {
        const instance = data.result.find((idx: any) => idx.name === config.instanceName);
        return instance?.status || 'not_found';
      }

      return 'not_found';
    } catch {
      return 'error';
    }
  }
}

export default AISearchSetupService;
