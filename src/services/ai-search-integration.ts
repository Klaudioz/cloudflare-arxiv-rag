/**
 * AI Search Integration Service
 * Integrates with Cloudflare's AI Search (formerly AutoRAG)
 * 
 * Official Documentation: https://developers.cloudflare.com/ai-search/
 */

export interface AISearchResponse {
  results: Array<{
    id: string;
    text: string;
    metadata?: Record<string, any>;
    score?: number;
  }>;
  answer?: string;
  sources?: Array<{
    id: string;
    title: string;
    url: string;
  }>;
}

export interface AISearchOptions {
  query: string;
  topK?: number;
  maxResults?: number;
  matchThreshold?: number;
}

export class AISearchIntegration {
  private projectName: string = 'arxiv-papers';

  constructor(private aiSearch: any) {}

  /**
   * Search papers using AI Search
   * Supports natural language queries with semantic understanding
   */
  async search(options: AISearchOptions): Promise<AISearchResponse> {
    const {
      query,
      topK = 5,
      maxResults = topK,
      matchThreshold = 0.3
    } = options;

    if (!query || query.length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      // Call AI Search with semantic search
      // AI Search automatically handles:
      // - Query understanding
      // - Embedding generation
      // - Vector similarity search
      // - BM25 keyword search
      // - Hybrid ranking (RRF)
      const response = await this.aiSearch.search({
        query,
        max_num_results: maxResults,
        match_threshold: matchThreshold
      }) as any;

      return {
        results: response.results || [],
        sources: response.metadata?.sources || []
      };
    } catch (error) {
      console.error('[AISearchIntegration] Search error:', error);
      throw error;
    }
  }

  /**
   * Query AI Search for RAG generation
   * Returns both retrieved documents and generated answer
   */
  async generateAnswer(options: AISearchOptions & {
    stream?: boolean;
  }): Promise<AISearchResponse> {
    const {
      query,
      topK = 5,
      stream = false
    } = options;

    if (!query || query.length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      // Call AI Search with RAG generation
      // AI Search automatically:
      // - Retrieves relevant documents
      // - Generates answer using LLM
      // - Grounds response in source documents
      // - Handles streaming if requested
      const response = await this.aiSearch.aiSearch({
        query,
        max_num_results: topK,
        stream
      }) as any;

      return {
        results: response.results || [],
        answer: response.answer,
        sources: response.sources || []
      };
    } catch (error) {
      console.error('[AISearchIntegration] RAG generation error:', error);
      throw error;
    }
  }

  /**
   * Stream AI Search responses (for real-time generation)
   */
  async *streamAnswer(query: string, topK: number = 5): AsyncGenerator<string, void, unknown> {
    if (!query || query.length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      const response = await this.aiSearch.aiSearch({
        query,
        max_num_results: topK,
        stream: true
      }) as any;

      if (response && typeof (response as any)[Symbol.asyncIterator] === 'function') {
        for await (const chunk of response) {
          if (chunk && chunk.answer) {
            // eslint-disable-next-line no-restricted-syntax
            yield chunk.answer;
          }
        }
      }
    } catch (error) {
      console.error('[AISearchIntegration] Stream error:', error);
      throw error;
    }
  }

  /**
   * Index documents in AI Search
   * AI Search automatically handles chunking and embedding
   */
  async indexDocuments(documents: Array<{
    id: string;
    title: string;
    content: string;
    metadata?: Record<string, any>;
  }>): Promise<{ indexed: number; failed: number }> {
    let indexed = 0;
    let failed = 0;

    for (const doc of documents) {
      try {
        // Document ingestion automatically handled by AI Search
        // Just submit the documents and AI Search handles:
        // - Document parsing
        // - Intelligent chunking
        // - Embedding generation
        // - Vector indexing
        // - Metadata extraction
        await this.submitDocument({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          metadata: doc.metadata
        });
        indexed++;
      } catch (error) {
        console.error(`[AISearchIntegration] Failed to index document ${doc.id}:`, error);
        failed++;
      }
    }

    return { indexed, failed };
  }

  /**
   * Submit single document for indexing
   */
  private async submitDocument(doc: {
    id: string;
    title: string;
    content: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      // In production, this would upload to R2 or use AI Search's ingestion API
      // AI Search continuously monitors data sources and auto-indexes
      console.log(`[AISearchIntegration] Submitting document: ${doc.id}`);
      // Placeholder - actual implementation depends on AI Search data source configuration
    } catch (error) {
      console.error('[AISearchIntegration] Document submission error:', error);
      throw error;
    }
  }

  /**
   * Get AI Search configuration
   * Shows current settings for retrieval and generation
   */
  async getConfiguration(): Promise<any> {
    try {
      // Returns configuration including:
      // - Chunk size and overlap
      // - Embedding model
      // - Query rewriting settings
      // - Match threshold
      // - Generation model
      // - Similarity caching settings
      const config = await this.aiSearch.getConfig?.() || {};
      return config;
    } catch (error) {
      console.error('[AISearchIntegration] Configuration retrieval error:', error);
      throw error;
    }
  }

  /**
   * Update AI Search configuration
   * Editable settings include chunk size, models, prompts, thresholds
   */
  async updateConfiguration(config: {
    chunkSize?: number;
    chunkOverlap?: number;
    queryRewrite?: boolean;
    matchThreshold?: number;
    maxResults?: number;
    generationSystemPrompt?: string;
    similarityCaching?: boolean;
  }): Promise<void> {
    try {
      // Update editable configuration parameters
      // Cannot edit: data_source, embedding_model (set at creation)
      // Can edit: chunk sizes, models, prompts, thresholds, caching
      await this.aiSearch.updateConfig?.(config);
    } catch (error) {
      console.error('[AISearchIntegration] Configuration update error:', error);
      throw error;
    }
  }
}

export default AISearchIntegration;
