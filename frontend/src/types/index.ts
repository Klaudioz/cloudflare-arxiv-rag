/**
 * Frontend type definitions
 */

export interface Paper {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  published_date: string;
  pdf_url: string;
  categories: string[];
}

export interface SearchResult {
  arxiv_id: string;
  title: string;
  abstract: string;
  score: number;
}

export interface RAGResponse {
  success: boolean;
  query: string;
  response: string;
  sources: Paper[];
  latency_ms: number;
  cache_hit: boolean;
}

export interface SearchRequest {
  query: string;
  top_k?: number;
}

export interface RAGRequest {
  query: string;
  top_k?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Paper[];
  latency_ms?: number;
}

export interface AppState {
  apiKey: string;
  messages: Message[];
  loading: boolean;
  error: string | null;
  cacheHitRate: number;
}
