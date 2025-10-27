/**
 * Cloudflare AI Search client service
 */

import { SearchResult, AISearchResponse, RAGResponse } from '../types';
import { AISearchError } from '../middleware';

export interface AISearchOptions {
  query: string;
  maxNumResults?: number;
  rewriteQuery?: boolean;
  rankingOptions?: {
    scoreThreshold?: number;
  };
  stream?: boolean;
  filters?: any;
}

export class AISearchClient {
  private env: any;
  private instanceName: string;

  constructor(env: any, instanceName: string = 'arxiv-papers') {
    this.env = env;
    this.instanceName = instanceName;
  }

  /**
   * Search for papers (retrieval only)
   */
  async search(options: AISearchOptions): Promise<SearchResult[]> {
    try {
      const { query, maxNumResults = 10, rankingOptions, filters } = options;

      const result = await this.env.AI.aiSearch(this.instanceName).search({
        query,
        max_num_results: Math.min(maxNumResults, 50),
        ranking_options: rankingOptions,
        filters
      });

      if (!result.result?.data) {
        return [];
      }

      return result.result.data;
    } catch (error) {
      console.error('[AISearchClient] Search error:', error);
      throw new AISearchError(`Failed to search papers: ${String(error)}`);
    }
  }

  /**
   * AI Search with generation
   */
  async aiSearch(options: AISearchOptions & { model?: string }): Promise<RAGResponse> {
    try {
      const {
        query,
        maxNumResults = 3,
        rewriteQuery = false,
        rankingOptions,
        filters,
        stream = false,
        model = '@cf/meta/llama-3.3-70b-instruct-sd'
      } = options;

      const startTime = Date.now();

      const result = await this.env.AI.aiSearch(this.instanceName).aiSearch({
        query,
        max_num_results: Math.min(maxNumResults, 50),
        rewrite_query: rewriteQuery,
        ranking_options: rankingOptions,
        filters,
        stream,
        model
      });

      const latency = Date.now() - startTime;

      if (!result.result) {
        throw new AISearchError('Invalid response from AI Search');
      }

      return {
        success: true,
        query,
        response: result.result.response || '',
        sources: result.result.data || [],
        latency_ms: latency,
        cache_hit: latency < 100 // Heuristic: cache hits are very fast
      };
    } catch (error) {
      console.error('[AISearchClient] AI Search error:', error);
      throw new AISearchError(`Failed to generate RAG response: ${String(error)}`);
    }
  }

  /**
   * Stream AI Search response
   */
  async aiSearchStream(options: AISearchOptions & { model?: string }): Promise<ReadableStream> {
    try {
      const {
        query,
        maxNumResults = 3,
        rewriteQuery = false,
        rankingOptions,
        filters,
        model = '@cf/meta/llama-3.3-70b-instruct-sd'
      } = options;

      const result = await this.env.AI.aiSearch(this.instanceName).aiSearch({
        query,
        max_num_results: Math.min(maxNumResults, 50),
        rewrite_query: rewriteQuery,
        ranking_options: rankingOptions,
        filters,
        stream: true,
        model
      });

      if (!result.toReadableStream) {
        throw new AISearchError('Streaming not supported in response');
      }

      return result.toReadableStream();
    } catch (error) {
      console.error('[AISearchClient] Stream error:', error);
      throw new AISearchError(`Failed to stream RAG response: ${String(error)}`);
    }
  }

  /**
   * Get search stats
   */
  async getStats(): Promise<{
    documentsIndexed: number;
    lastSyncTime: number;
    cacheHitRate: number;
  }> {
    try {
      // In production, this would call AI Search stats API
      // For now, return placeholder
      return {
        documentsIndexed: 0,
        lastSyncTime: Date.now(),
        cacheHitRate: 0.78 // 78% average
      };
    } catch (error) {
      console.error('[AISearchClient] Stats error:', error);
      return {
        documentsIndexed: 0,
        lastSyncTime: Date.now(),
        cacheHitRate: 0
      };
    }
  }

  /**
   * Trigger manual sync
   */
  async triggerSync(): Promise<{ status: string; syncId: string }> {
    try {
      // In production, this would call AI Search sync API
      return {
        status: 'queued',
        syncId: `sync_${Date.now()}`
      };
    } catch (error) {
      console.error('[AISearchClient] Sync error:', error);
      throw new AISearchError(`Failed to trigger sync: ${String(error)}`);
    }
  }
}
