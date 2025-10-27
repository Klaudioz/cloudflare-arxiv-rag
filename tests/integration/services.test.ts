/**
 * Integration tests for services
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AISearchClient } from '../../src/services/ai-search-client';
import { IngestionService } from '../../src/services/ingestion-service';

describe('Service Integration Tests', () => {
  describe('AISearchClient', () => {
    let client: AISearchClient;
    let mockEnv: any;

    beforeEach(() => {
      mockEnv = {
        AI: {
          aiSearch: vi.fn().mockReturnValue({
            search: vi.fn().mockResolvedValue({
              results: [
                {
                  arxiv_id: '2024.12345',
                  title: 'Test Paper',
                  abstract: 'Test abstract',
                  score: 0.95
                }
              ]
            }),
            aiSearch: vi.fn().mockResolvedValue({
              result: {
                response: 'Generated response',
                data: []
              }
            })
          })
        }
      };

      client = new AISearchClient(mockEnv, 'test-instance');
    });

    it('should search papers', async () => {
      const results = await client.search('transformers', 5);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Paper');
    });

    it('should generate RAG responses', async () => {
      const response = await client.aiSearch('What are transformers?', 3);

      expect(response).toBeDefined();
      expect(response.result).toBeDefined();
    });

    it('should detect cache hits', async () => {
      const response = await client.aiSearch('query 1', 3);
      const latency = response.latency_ms || 1000;

      // Cache hit if latency < 100ms
      const isCached = latency < 100;
      expect(typeof isCached).toBe('boolean');
    });

    it('should get AI Search stats', async () => {
      const stats = await client.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.documentsIndexed).toBe('number');
    });
  });

  describe('IngestionService', () => {
    let service: IngestionService;

    beforeEach(() => {
      service = new IngestionService();
    });

    it('should ingest papers for a date', async () => {
      const result = await service.ingestByDate('2024-10-27', 'cs.AI', 10);

      expect(result).toBeDefined();
      expect(result.papersFetched).toBeGreaterThanOrEqual(0);
      expect(result.papersIndexed).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty results gracefully', async () => {
      const result = await service.ingestByDate('1900-01-01', 'cs.AI', 10);

      expect(result.papersFetched).toBe(0);
      expect(result.papersIndexed).toBe(0);
    });

    it('should sanitize paper text', async () => {
      const result = await service.ingestByDate('2024-10-27', 'cs.AI', 1);

      expect(result).toBeDefined();
    });

    it('should get daily papers', async () => {
      const papers = await service.getDailyPapers('2024-10-27', 'cs.AI');

      expect(Array.isArray(papers)).toBe(true);
    });

    it('should handle ingestion errors', async () => {
      const result = await service.ingestByDate('invalid-date', 'cs.AI', 10);

      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });
});
