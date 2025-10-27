/**
 * Application constants
 */

export const API_VERSION = 'v1';
export const SERVICE_NAME = 'cloudflare-arxiv-rag';
export const SERVICE_VERSION = '0.1.0';

export const ARXIV_CATEGORIES = {
  CS_AI: 'cs.AI',
  CS_LG: 'cs.LG',
  CS_NE: 'cs.NE',
  CS_CL: 'cs.CL',
  STAT_ML: 'stat.ML'
} as const;

export const DEFAULT_CONFIG = {
  MAX_RESULTS: 50,
  MAX_TOP_K: 10,
  CACHE_TTL_SECONDS: 86400,
  REQUEST_TIMEOUT_MS: 30000,
  ANALYTICS_SAMPLE_RATE: 100
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  AI_SEARCH_ERROR: 'AI_SEARCH_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  RATE_LIMIT: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;
