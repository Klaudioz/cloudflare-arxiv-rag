/**
 * API client for backend communication
 */

import axios, { AxiosInstance } from 'axios';
import type { RAGResponse, SearchResult, Paper } from '@/types';

export class APIClient {
  private client: AxiosInstance;
  private apiKey: string = '';

  constructor(baseURL?: string) {
    // Use environment variable or default to staging API
    const apiUrl = baseURL || import.meta.env.VITE_API_URL || 'https://cloudflare-arxiv-rag-staging.klaudioz.workers.dev/api/v1';
    
    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Set API key for requests
   */
  setApiKey(key: string) {
    this.apiKey = key;
    this.client.defaults.headers.common['x-api-key'] = key;
  }

  /**
   * Health check
   */
  async health() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw new Error('Failed to connect to API');
    }
  }

  /**
   * Search papers (retrieval only)
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    const response = await this.client.post('/search', {
      query,
      top_k: topK,
    });
    return response.data.results || [];
  }

  /**
   * RAG ask (retrieval + generation)
   */
  async ask(query: string, topK: number = 3): Promise<RAGResponse> {
    const response = await this.client.post('/ask', {
      query,
      top_k: topK,
    });
    return response.data;
  }

  /**
   * Stream RAG response
   */
  async *streamAsk(query: string, topK: number = 3): AsyncGenerator<string> {
    const response = await this.client.post('/stream', {
      query,
      top_k: topK,
    });

    if (!(response.data instanceof ReadableStream)) {
      throw new Error('Expected streaming response');
    }

    const reader = response.data.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            yield line.slice(6);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get metrics
   */
  async getMetrics() {
    const response = await this.client.get('/metrics');
    return response.data;
  }

  /**
   * Get papers
   */
  async getPapers(page: number = 1, limit: number = 20): Promise<Paper[]> {
    const response = await this.client.get('/papers', {
      params: { page, limit },
    });
    return response.data.papers || [];
  }

  /**
   * Get paper by ID
   */
  async getPaper(id: string): Promise<Paper> {
    const response = await this.client.get(`/papers/${id}`);
    return response.data;
  }

  /**
   * Get daily papers
   */
  async getDailyPapers(date: string, category: string = 'cs.AI'): Promise<Paper[]> {
    const response = await this.client.get(`/papers/daily/${date}`, {
      params: { category },
    });
    return response.data.papers || [];
  }

  /**
   * Get monthly archive
   */
  async getMonthlyArchive(year: number, month: number, category: string = 'cs.AI'): Promise<Paper[]> {
    const response = await this.client.get(`/papers/archive/month/${year}/${month}`, {
      params: { category },
    });
    return response.data.papers || [];
  }

  /**
   * Get yearly archive
   */
  async getYearlyArchive(year: number, category: string = 'cs.AI'): Promise<Paper[]> {
    const response = await this.client.get(`/papers/archive/year/${year}`, {
      params: { category },
    });
    return response.data.papers || [];
  }

  /**
   * Get date range archive
   */
  async getDateRangeArchive(fromDate: string, toDate: string, category: string = 'cs.AI'): Promise<Paper[]> {
    const response = await this.client.get(`/papers/archive/range`, {
      params: { from_date: fromDate, to_date: toDate, category },
    });
    return response.data.papers || [];
  }
}

export const apiClient = new APIClient();
