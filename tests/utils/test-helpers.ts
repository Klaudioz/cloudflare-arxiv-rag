/**
 * Test helper utilities
 */

import { vi } from 'vitest';

/**
 * Create a mock Request object
 */
export function createMockRequest(
  url: string = 'http://localhost:8787',
  options: RequestInit = {}
): Request {
  const defaults: RequestInit = {
    method: 'GET',
    headers: {},
  };

  return new Request(url, { ...defaults, ...options });
}

/**
 * Create a mock Response object
 */
export function createMockResponse(body: any = {}, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Mock fetch globally
 */
export function mockFetch(response: Response | Response[] = createMockResponse()) {
  const responses = Array.isArray(response) ? response : [response];
  let callIndex = 0;

  global.fetch = vi.fn(async () => {
    const currentResponse = responses[callIndex % responses.length];
    callIndex++;
    return currentResponse.clone(); // Clone to avoid issues with multiple reads
  });

  return global.fetch as any;
}

/**
 * Wait for async operations
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 1000,
  interval: number = 50
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for condition after ${timeout}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Create test papers
 */
export function createTestPapers(count: number = 1) {
  return Array.from({ length: count }, (_, i) => ({
    arxiv_id: `2024.${String(10000 + i).padStart(5, '0')}`,
    title: `Test Paper ${i + 1}`,
    abstract: `Abstract for test paper ${i + 1}...`,
    authors: [`Author ${i + 1}`, `Co-author ${i + 1}`],
    published_date: `2024-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    pdf_url: `https://arxiv.org/pdf/2024.${String(10000 + i).padStart(5, '0')}`,
    categories: ['cs.AI', 'cs.LG']
  }));
}

/**
 * Create test messages
 */
export function createTestMessages(count: number = 1) {
  const messages = [];

  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) {
      // User message
      messages.push({
        id: `msg-${i}`,
        role: 'user' as const,
        content: `What about topic ${i}?`,
        timestamp: new Date()
      });
    } else {
      // Assistant message
      messages.push({
        id: `msg-${i}`,
        role: 'assistant' as const,
        content: `Here's information about topic ${i}...`,
        timestamp: new Date(),
        sources: createTestPapers(1),
        latency_ms: Math.random() * 1000
      });
    }
  }

  return messages;
}

/**
 * Test data generators
 */
export const testDataGenerators = {
  /**
   * Generate random API key
   */
  apiKey: () => `sk-${Math.random().toString(36).substring(2, 15)}`,

  /**
   * Generate random date in YYYYMMDD format
   */
  date: () => {
    const date = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    return date.toISOString().split('T')[0].replace(/-/g, '');
  },

  /**
   * Generate random query
   */
  query: () => {
    const topics = ['transformers', 'machine learning', 'deep learning', 'neural networks', 'AI'];
    return topics[Math.floor(Math.random() * topics.length)];
  },

  /**
   * Generate random UUID
   */
  uuid: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
};

/**
 * Assert async function throws
 */
export async function expectAsyncError(
  fn: () => Promise<any>,
  message?: string | RegExp
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (message) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (typeof message === 'string') {
        if (!errorMessage.includes(message)) {
          throw new Error(`Expected error to contain "${message}", got "${errorMessage}"`);
        }
      } else if (!message.test(errorMessage)) {
        throw new Error(`Expected error to match ${message}, got "${errorMessage}"`);
      }
    }
    return error as Error;
  }
}
