/**
 * Type definitions for Cloudflare arXiv RAG
 */

export interface ArxivPaper {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  published_date: string;
  pdf_url: string;
  categories: string[];
}

export interface SearchResult {
  file_id: string;
  filename: string;
  score: number;
  attributes: {
    modified_date: number;
    folder?: string;
    [key: string]: any;
  };
  content: Array<{
    id: string;
    type: string;
    text: string;
  }>;
}

export interface AISearchResponse {
  success: boolean;
  result: {
    object: string;
    search_query: string;
    response: string;
    data: SearchResult[];
    has_more: boolean;
    next_page: any;
  };
}

export interface RAGRequest {
  query: string;
  top_k?: number;
  use_hybrid?: boolean;
  stream?: boolean;
}

export interface RAGResponse {
  success: boolean;
  query: string;
  response: string;
  sources: SearchResult[];
  latency_ms: number;
  cache_hit: boolean;
}

export interface WorkflowPayload {
  date?: string;
  category?: string;
}

export interface MetricsData {
  indexes: string[];
  blobs?: string[];
  doubles: number[];
}
