/**
 * Mock API client for testing
 */

import { vi } from 'vitest';
import type { RAGResponse, SearchResult, Paper } from '../../src/types/index';

export const createMockAPIClient = () => ({
  health: vi.fn().mockResolvedValue({
    status: 'ok',
    service: 'cloudflare-arxiv-rag',
    version: '0.1.0'
  }),

  search: vi.fn().mockResolvedValue<SearchResult[]>([
    {
      arxiv_id: '2024.12345',
      title: 'Attention Is All You Need',
      abstract: 'The transformer architecture...',
      score: 0.95
    },
    {
      arxiv_id: '2024.12346',
      title: 'BERT: Pre-training of Deep Bidirectional Transformers',
      abstract: 'Bidirectional encoder representations...',
      score: 0.87
    }
  ]),

  ask: vi.fn().mockResolvedValue<RAGResponse>({
    success: true,
    query: 'What are transformers?',
    response: 'Transformers are a type of neural network architecture...',
    sources: [
      {
        arxiv_id: '2024.12345',
        title: 'Attention Is All You Need',
        abstract: 'The transformer architecture...',
        authors: ['Vaswani et al.'],
        published_date: '2017-06-12T00:00:00Z',
        pdf_url: 'https://arxiv.org/pdf/1706.03762',
        categories: ['cs.CL']
      }
    ],
    latency_ms: 245,
    cache_hit: false
  }),

  streamAsk: vi.fn().mockResolvedValue<AsyncGenerator<string>>(
    (async function* () {
      yield JSON.stringify({ response: 'Transformers ' });
      yield JSON.stringify({ response: 'are neural ' });
      yield JSON.stringify({ response: 'networks.' });
    })()
  ),

  getMetrics: vi.fn().mockResolvedValue({
    service: 'cloudflare-arxiv-rag',
    stats: {
      documentsIndexed: 5234,
      cacheHitRate: 0.78,
      lastSync: '2024-10-27T12:30:00Z'
    }
  }),

  getPapers: vi.fn().mockResolvedValue<Paper[]>([
    {
      arxiv_id: '2024.12345',
      title: 'Attention Is All You Need',
      abstract: 'The transformer architecture...',
      authors: ['Vaswani et al.'],
      published_date: '2017-06-12T00:00:00Z',
      pdf_url: 'https://arxiv.org/pdf/1706.03762',
      categories: ['cs.CL']
    }
  ]),

  getPaper: vi.fn().mockResolvedValue<Paper>({
    arxiv_id: '2024.12345',
    title: 'Attention Is All You Need',
    abstract: 'The transformer architecture...',
    authors: ['Vaswani et al.'],
    published_date: '2017-06-12T00:00:00Z',
    pdf_url: 'https://arxiv.org/pdf/1706.03762',
    categories: ['cs.CL']
  }),

  getDailyPapers: vi.fn().mockResolvedValue<Paper[]>([
    {
      arxiv_id: '2024.12345',
      title: 'Recent AI Paper',
      abstract: 'A recent paper about AI...',
      authors: ['Author 1', 'Author 2'],
      published_date: '2024-10-27T00:00:00Z',
      pdf_url: 'https://arxiv.org/pdf/2024.12345',
      categories: ['cs.AI']
    }
  ]),

  getMonthlyArchive: vi.fn().mockResolvedValue<Paper[]>([
    {
      arxiv_id: '2024.10001',
      title: 'October 2024 Paper 1',
      abstract: 'First paper...',
      authors: ['Author 1'],
      published_date: '2024-10-01T00:00:00Z',
      pdf_url: 'https://arxiv.org/pdf/2024.10001',
      categories: ['cs.AI']
    }
  ]),

  getYearlyArchive: vi.fn().mockResolvedValue<Paper[]>([
    {
      arxiv_id: '2024.01001',
      title: '2024 Paper 1',
      abstract: 'First 2024 paper...',
      authors: ['Author 1'],
      published_date: '2024-01-01T00:00:00Z',
      pdf_url: 'https://arxiv.org/pdf/2024.01001',
      categories: ['cs.AI']
    }
  ]),

  getDateRangeArchive: vi.fn().mockResolvedValue<Paper[]>([
    {
      arxiv_id: '2024.05001',
      title: 'Paper in range',
      abstract: 'Paper from date range...',
      authors: ['Author 1'],
      published_date: '2024-05-15T00:00:00Z',
      pdf_url: 'https://arxiv.org/pdf/2024.05001',
      categories: ['cs.AI']
    }
  ]),

  setApiKey: vi.fn()
});

export const createMockStoreState = () => ({
  apiKey: 'sk-test-key-12345',
  messages: [],
  loading: false,
  error: null,
  cacheHitRate: 0,
  setApiKey: vi.fn(),
  addMessage: vi.fn(),
  clearMessages: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  setCacheHitRate: vi.fn()
});

export const createMockEnv = () => ({
  AI: {
    aiSearch: vi.fn().mockReturnValue({
      search: vi.fn().mockResolvedValue({
        results: []
      }),
      aiSearch: vi.fn().mockResolvedValue({
        result: { response: '', data: [] }
      })
    })
  },
  ANALYTICS: {
    writeDataPoint: vi.fn()
  },
  CACHE: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined)
  },
  ADMIN_API_KEY: 'sk-admin-test-key'
});
