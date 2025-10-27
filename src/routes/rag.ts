/**
 * RAG (Retrieval-Augmented Generation) routes
 */

import { Hono } from 'hono';
import { D1Client } from '../services/d1-client';
import { EmbeddingsService } from '../services/embeddings-service';
import { SearchService } from '../services/search-service';
import { RAGService } from '../services/rag-service';

interface RAGEnv {
  AI: Ai;
  DB: D1Database;
}

export const ragRouter = new Hono<{ Bindings: RAGEnv }>();

/**
 * Ask - generate answer using RAG
 */
ragRouter.post('/ask', async (c) => {
  try {
    const {
      query,
      topK = 5,
      searchType = 'hybrid',
      keywordWeight = 0.5,
      semanticWeight = 0.5
    } = await c.req.json() as {
      query: string;
      topK?: number;
      searchType?: 'keyword' | 'semantic' | 'hybrid';
      keywordWeight?: number;
      semanticWeight?: number;
    };

    // Validate input
    if (!query || query.length === 0) {
      return c.json({ error: 'Query is required' }, 400);
    }

    if (query.length > 2000) {
      return c.json({ error: 'Query too long (max 2000 chars)' }, 400);
    }

    // Initialize services
    const d1Client = new D1Client(c.env.DB);
    const embeddingsService = new EmbeddingsService(c.env.AI);
    const searchService = new SearchService(d1Client, embeddingsService);
    const ragService = new RAGService(searchService, c.env.AI);

    // Generate answer
    const response = await ragService.generateAnswer({
      query,
      topK,
      searchType,
      keywordWeight,
      semanticWeight
    });

    return c.json(response);
  } catch (error) {
    console.error('[RAGRouter] Ask error:', error);
    return c.json({ error: 'Answer generation failed' }, 500);
  }
});

/**
 * Stream - stream answer generation using Server-Sent Events
 */
ragRouter.post('/stream', async (c) => {
  try {
    const {
      query,
      topK = 5,
      searchType = 'hybrid',
      keywordWeight = 0.5,
      semanticWeight = 0.5
    } = await c.req.json() as {
      query: string;
      topK?: number;
      searchType?: 'keyword' | 'semantic' | 'hybrid';
      keywordWeight?: number;
      semanticWeight?: number;
    };

    // Validate input
    if (!query || query.length === 0) {
      return c.json({ error: 'Query is required' }, 400);
    }

    if (query.length > 2000) {
      return c.json({ error: 'Query too long (max 2000 chars)' }, 400);
    }

    // Initialize services
    const d1Client = new D1Client(c.env.DB);
    const embeddingsService = new EmbeddingsService(c.env.AI);
    const searchService = new SearchService(d1Client, embeddingsService);
    const ragService = new RAGService(searchService, c.env.AI);

    // Create stream
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    // Send headers
    const encoder = new TextEncoder();

    // Start streaming in background
    (async () => {
      try {
        // Send initial event
        await writer.write(encoder.encode('data: {"type":"start","query":"' + query.replace(/"/g, '\\"') + '"}\n\n'));

        // Stream answer
        for await (const chunk of ragService.streamAnswer({
          query,
          topK,
          searchType,
          keywordWeight,
          semanticWeight
        })) {
          const event = {
            type: 'chunk',
            content: chunk
          };
          await writer.write(
            encoder.encode('data: ' + JSON.stringify(event).replace(/\n/g, '\\n') + '\n\n')
          );
        }

        // Send complete event
        await writer.write(encoder.encode('data: {"type":"complete"}\n\n'));
      } catch (error) {
        console.error('[RAGRouter] Stream error:', error);
        const errorEvent = {
          type: 'error',
          message: 'Stream generation failed'
        };
        await writer.write(encoder.encode('data: ' + JSON.stringify(errorEvent) + '\n\n'));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('[RAGRouter] Stream setup error:', error);
    return c.json({ error: 'Stream setup failed' }, 500);
  }
});

export default ragRouter;
