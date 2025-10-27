/**
 * RAG (Retrieval-Augmented Generation) service
 * Combines search and LLM generation for question answering
 */

import { SearchService } from './search-service';
import { Paper } from './d1-client';

export interface RAGResponse {
  answer: string;
  sources: Array<{
    arxivId: string;
    title: string;
    authors: string[];
    url: string;
  }>;
  generatedAt: string;
}

export interface RAGOptions {
  query: string;
  topK?: number;
  searchType?: 'keyword' | 'semantic' | 'hybrid';
  keywordWeight?: number;
  semanticWeight?: number;
}

export class RAGService {
  private systemPrompt = `You are an expert research assistant specializing in arXiv papers. 
Your role is to answer questions about research papers based on the provided context.
Always cite your sources using [1], [2], etc. at the end of your response.
Format: [1] Author et al., "Title", arXiv:XXXX.XXXXX
Be concise but comprehensive. If information isn't in the context, say so.`;

  constructor(
    private searchService: SearchService,
    private ai: Ai
  ) {}

  /**
   * Generate answer from query using RAG
   */
  async generateAnswer(options: RAGOptions): Promise<RAGResponse> {
    const {
      query,
      topK = 5,
      searchType = 'hybrid',
      keywordWeight = 0.5,
      semanticWeight = 0.5
    } = options;

    if (!query || query.length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      // Search for relevant papers
      const searchResults = await this.performSearch(
        query,
        topK,
        searchType,
        keywordWeight,
        semanticWeight
      );

      if (searchResults.length === 0) {
        return {
          answer: 'I could not find relevant papers to answer your question. Please try a different query.',
          sources: [],
          generatedAt: new Date().toISOString()
        };
      }

      // Build context from search results
      const context = this.buildContext(searchResults);

      // Generate answer using LLM
      const answer = await this.generateWithLLM(query, context, searchResults);

      return {
        answer,
        sources: searchResults.map(result => ({
          arxivId: result.paper.arxiv_id,
          title: result.paper.title,
          authors: result.paper.authors || [],
          url: result.paper.pdf_url
        })),
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[RAGService] Error generating answer:', error);
      throw error;
    }
  }

  /**
   * Perform search based on type
   */
  private async performSearch(
    query: string,
    topK: number,
    searchType: 'keyword' | 'semantic' | 'hybrid',
    keywordWeight: number,
    semanticWeight: number
  ) {
    switch (searchType) {
      case 'keyword':
        return await this.searchService.keywordSearch({
          query,
          limit: topK
        });
      case 'semantic':
        return await this.searchService.semanticSearch({
          query,
          topK
        });
      case 'hybrid':
      default:
        return await this.searchService.hybridSearch(
          query,
          topK,
          keywordWeight,
          semanticWeight
        );
    }
  }

  /**
   * Build context string from search results
   */
  private buildContext(results: Array<{ paper: Paper; score: number }>): string {
    let context = 'Based on the following papers:\n\n';

    results.forEach((result, index) => {
      const paper = result.paper;
      context += `[${index + 1}] ${paper.title}\n`;
      context += `Authors: ${(paper.authors || []).join(', ')}\n`;
      context += `Published: ${paper.published_date}\n`;
      context += `Abstract: ${paper.abstract.substring(0, 300)}...\n`;
      context += `Score: ${(result.score * 100).toFixed(1)}%\n\n`;
    });

    return context;
  }

  /**
   * Generate answer using Workers AI LLM
   */
  private async generateWithLLM(
    query: string,
    context: string,
    sources: Array<{ paper: Paper; score: number }>
  ): Promise<string> {
    try {
      // Use Llama 3.3 for generation
      const response = await (this.ai as any).run('@cf/meta/llama-3.3-70b-instruct-sd', {
        messages: [
          {
            role: 'system',
            content: this.systemPrompt
          },
          {
            role: 'user',
            content: `${context}\n\nQuestion: ${query}\n\nProvide a comprehensive answer based on the papers above.`
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      }) as any;

      // Extract text from response
      if (response && response.result && response.result.response) {
        // Format with citations
        return this.formatAnswerWithCitations(response.result.response, sources);
      }

      return 'Unable to generate answer from the provided context.';
    } catch (error) {
      console.error('[RAGService] LLM generation error:', error);
      throw error;
    }
  }

  /**
   * Format answer with proper citations
   */
  private formatAnswerWithCitations(
    answer: string,
    sources: Array<{ paper: Paper; score: number }>
  ): string {
    let formattedAnswer = answer.trim();

    // Add citation references if not already present
    if (!formattedAnswer.includes('[1]')) {
      formattedAnswer += '\n\nSources:\n';
      sources.forEach((source, index) => {
        const paper = source.paper;
        formattedAnswer += `[${index + 1}] ${(paper.authors || [])[0] || 'Unknown'} et al., "${paper.title}", arXiv:${paper.arxiv_id} (${paper.published_date})\n`;
      });
    }

    return formattedAnswer;
  }

  /**
   * Stream answer generation
   */
  async *streamAnswer(options: RAGOptions): AsyncGenerator<string, void, unknown> {
    const {
      query,
      topK = 5,
      searchType = 'hybrid',
      keywordWeight = 0.5,
      semanticWeight = 0.5
    } = options;

    if (!query || query.length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      // Search for relevant papers
      const searchResults = await this.performSearch(
        query,
        topK,
        searchType,
        keywordWeight,
        semanticWeight
      );

      if (searchResults.length === 0) {
        yield 'I could not find relevant papers to answer your question. Please try a different query.';
        return;
      }

      // Build context
      const context = this.buildContext(searchResults);

      // Stream from LLM
      yield* this.streamLLMResponse(query, context, searchResults);
    } catch (error) {
      console.error('[RAGService] Error streaming answer:', error);
      throw error;
    }
  }

  /**
   * Stream LLM response
   */
  private async *streamLLMResponse(
    query: string,
    context: string,
    sources: Array<{ paper: Paper; score: number }>
  ): AsyncGenerator<string, void, unknown> {
    try {
      const response = await (this.ai as any).run('@cf/meta/llama-3.3-70b-instruct-sd', {
        messages: [
          {
            role: 'system',
            content: this.systemPrompt
          },
          {
            role: 'user',
            content: `${context}\n\nQuestion: ${query}\n\nProvide a comprehensive answer based on the papers above.`
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        stream: true
      }) as any;

      // Stream chunks
      if (response && typeof (response as any)[Symbol.asyncIterator] === 'function') {
        for await (const chunk of response) {
          if (chunk && chunk.response) {
            // eslint-disable-next-line no-restricted-syntax
            yield chunk.response;
          }
        }
      }

      // Add citations at the end
      // eslint-disable-next-line no-restricted-syntax
      yield '\n\nSources:\n';
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const paper = source.paper;
        // eslint-disable-next-line no-restricted-syntax
        yield `[${i + 1}] ${(paper.authors || [])[0] || 'Unknown'} et al., "${paper.title}", arXiv:${paper.arxiv_id}\n`;
      }
    } catch (error) {
      console.error('[RAGService] LLM streaming error:', error);
      throw error;
    }
  }
}

export default RAGService;
