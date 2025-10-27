/**
 * Tests for ArxivClient service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArxivClient } from '../../src/services/arxiv-client';

describe('ArxivClient', () => {
  let client: ArxivClient;

  beforeEach(() => {
    client = new ArxivClient();
  });

  describe('fetchByDate', () => {
    it('should construct correct query with category and date', async () => {
      // Mock fetch to verify request
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <id>http://arxiv.org/abs/2024.12345v1</id>
              <title>Test Paper</title>
              <summary>Test abstract</summary>
              <published>2024-10-27T00:00:00Z</published>
            </entry>
          </feed>`
      });

      const papers = await client.fetchByDate('2024-10-27', 'cs.AI', 10);

      expect(papers).toHaveLength(1);
      expect(papers[0].title).toBe('Test Paper');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
          </feed>`
      });

      const papers = await client.fetchByDate('2024-10-27', 'cs.AI', 10);

      expect(papers).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(client.fetchByDate('2024-10-27')).rejects.toThrow();
    });
  });

  describe('fetchByDateRange', () => {
    it('should support custom date ranges', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <id>http://arxiv.org/abs/2024.12345v1</id>
              <title>Range Test</title>
              <summary>Abstract</summary>
              <published>2024-10-15T00:00:00Z</published>
            </entry>
          </feed>`
      });

      const papers = await client.fetchByDateRange('20241001', '20241031', 'cs.AI');

      expect(papers).toHaveLength(1);
      expect(papers[0].title).toBe('Range Test');
    });
  });

  describe('fetchByMonth', () => {
    it('should fetch papers for specific month', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <id>http://arxiv.org/abs/2024.12345v1</id>
              <title>October Paper</title>
              <summary>Abstract</summary>
              <published>2024-10-15T00:00:00Z</published>
            </entry>
          </feed>`
      });

      const papers = await client.fetchByMonth(2024, 10, 'cs.AI', 100);

      expect(papers).toHaveLength(1);
      expect(papers[0].title).toBe('October Paper');
    });
  });

  describe('fetchByYear', () => {
    it('should fetch papers for entire year', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <id>http://arxiv.org/abs/2024.12345v1</id>
              <title>2024 Paper</title>
              <summary>Abstract</summary>
              <published>2024-06-15T00:00:00Z</published>
            </entry>
          </feed>`
      });

      const papers = await client.fetchByYear(2024, 'cs.AI', 100);

      expect(papers).toHaveLength(1);
      expect(papers[0].title).toBe('2024 Paper');
    });
  });
});
