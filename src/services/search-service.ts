/**
 * Search service for D1
 * Implements keyword and semantic search
 */

import { D1Client, SearchResult } from './d1-client';
import { EmbeddingsService } from './embeddings-service';

export interface KeywordSearchOptions {
  query: string;
  limit?: number;
  category?: string;
}

export interface SemanticSearchOptions {
  query: string;
  topK?: number;
  minSimilarity?: number;
}

export class SearchService {
  constructor(
    private d1Client: D1Client,
    private embeddingsService: EmbeddingsService
  ) {}

  /**
   * Full-text keyword search on papers
   */
  async keywordSearch(options: KeywordSearchOptions): Promise<SearchResult[]> {
    const { query, limit = 10, category } = options;

    if (!query || query.length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      // Search in both title and abstract
      const papers = await this.d1Client.searchKeyword(query, limit);

      // Filter by category if provided
      if (category) {
        return papers.filter(p => p.paper.category === category);
      }

      return papers;
    } catch (error) {
      console.error('[SearchService] Keyword search error:', error);
      throw error;
    }
  }

  /**
   * Semantic search using embeddings
   */
  async semanticSearch(options: SemanticSearchOptions): Promise<SearchResult[]> {
    const { query, topK = 10, minSimilarity = 0.3 } = options;

    if (!query || query.length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingsService.generateEmbedding(query);

      // Get all embeddings from database
      const allChunks = await this.d1Client.getAllChunksWithEmbeddings();

      if (allChunks.length === 0) {
        return [];
      }

      // Find similar chunks
      const similar = this.embeddingsService.findSimilar(
        queryEmbedding,
        allChunks
          .filter(c => c.embedding)
          .map(c => ({
            id: c.chunkId,
            text: c.content,
            embedding: JSON.parse(c.embedding || '[]')
          })),
        topK,
        minSimilarity
      );

      // Group by paper and aggregate scores
      const paperScores = new Map<string, { paper: any; score: number }>();

      for (const result of similar) {
        const chunk = allChunks.find(c => c.chunkId === result.id);
        if (!chunk) continue;

        const existing = paperScores.get(chunk.paperId) || {
          paper: chunk.paper,
          score: 0
        };

        existing.score += result.score;
        paperScores.set(chunk.paperId, existing);
      }

      // Convert to results and sort by score
      const results: SearchResult[] = Array.from(paperScores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => ({
          paper: item.paper,
          score: item.score,
          relevance: 'semantic'
        }));

      return results;
    } catch (error) {
      console.error('[SearchService] Semantic search error:', error);
      throw error;
    }
  }

  /**
   * Hybrid search combining keyword and semantic
   */
  async hybridSearch(
    query: string,
    topK: number = 10,
    keywordWeight: number = 0.5,
    semanticWeight: number = 0.5
  ): Promise<SearchResult[]> {
    if (!query || query.length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      // Run both searches in parallel
      const [keywordResults, semanticResults] = await Promise.all([
        this.keywordSearch({ query, limit: topK * 2 }),
        this.semanticSearch({ query, topK: topK * 2 })
      ]);

      // Normalize scores (0-1 range)
      const normalizeScores = (results: SearchResult[]) => {
        if (results.length === 0) return results;
        const maxScore = Math.max(...results.map(r => r.score));
        return results.map(r => ({
          ...r,
          score: maxScore > 0 ? r.score / maxScore : 0
        }));
      };

      const normKeyword = normalizeScores(keywordResults);
      const normSemantic = normalizeScores(semanticResults);

      // Combine results using RRF (Reciprocal Rank Fusion)
      const combinedScores = new Map<string, { paper: any; score: number }>();
      const k = 60; // RRF constant

      for (let i = 0; i < normKeyword.length; i++) {
        const result = normKeyword[i];
        const paperId = result.paper.id || `unknown_${i}`;
        const rrfScore = (1 / (k + i + 1)) * keywordWeight;

        if (!combinedScores.has(paperId)) {
          combinedScores.set(paperId, { paper: result.paper, score: 0 });
        }

        const existing = combinedScores.get(paperId);
        if (existing) {
          existing.score += rrfScore;
        }
      }

      for (let i = 0; i < normSemantic.length; i++) {
        const result = normSemantic[i];
        const paperId = result.paper.id || `unknown_${i}`;
        const rrfScore = (1 / (k + i + 1)) * semanticWeight;

        if (!combinedScores.has(paperId)) {
          combinedScores.set(paperId, { paper: result.paper, score: 0 });
        }

        const existing = combinedScores.get(paperId);
        if (existing) {
          existing.score += rrfScore;
        }
      }

      // Convert to results and sort
      const results: SearchResult[] = Array.from(combinedScores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => ({
          paper: item.paper,
          score: item.score,
          relevance: 'hybrid'
        }));

      return results;
    } catch (error) {
      console.error('[SearchService] Hybrid search error:', error);
      throw error;
    }
  }
}

export default SearchService;
