/**
 * ArXiv API client service
 */

import { ArxivPaper } from '../types';

export interface ArxivSearchOptions {
  query: string;
  maxResults?: number;
  fromDate?: string;
  toDate?: string;
  sortBy?: 'submittedDate' | 'lastUpdatedDate' | 'relevance';
  sortOrder?: 'ascending' | 'descending';
}

export class ArxivClient {
  private baseUrl = 'https://export.arxiv.org/api/query';
  private rateLimit = 3000; // 3 seconds between requests per arXiv guidelines

  /**
   * Search arXiv with parameters
   */
  async search(options: ArxivSearchOptions): Promise<ArxivPaper[]> {
    const {
      query,
      maxResults = 100,
      fromDate,
      toDate,
      sortBy = 'submittedDate',
      sortOrder = 'descending'
    } = options;

    // Build search query
    let searchQuery = query;

    if (fromDate || toDate) {
      const dateFrom = fromDate ? `${fromDate}000000` : '*';
      const dateTo = toDate ? `${toDate}235959` : '*';
      searchQuery = `${searchQuery} AND submittedDate:[${dateFrom} TO ${dateTo}]`;
    }

    const params = new URLSearchParams({
      search_query: searchQuery,
      max_results: Math.min(maxResults, 2000).toString(),
      sortBy,
      sortOrder
    });

    try {
      const url = `${this.baseUrl}?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`ArXiv API error: ${response.status}`);
      }

      const xml = await response.text();
      return this.parseAtomFeed(xml);
    } catch (error) {
      console.error('[ArxivClient] Search error:', error);
      throw error;
    }
  }

  /**
   * Fetch papers from specific date
   */
  async fetchByDate(date: string, category: string = 'cs.AI', maxResults: number = 100): Promise<ArxivPaper[]> {
    const query = `cat:${category}`;

    return this.search({
      query,
      maxResults,
      fromDate: date,
      toDate: date,
      sortBy: 'submittedDate',
      sortOrder: 'descending'
    });
  }

  /**
   * Parse Atom feed XML
   */
  private parseAtomFeed(xml: string): ArxivPaper[] {
    const papers: ArxivPaper[] = [];

    try {
      // Simple regex-based parsing (production would use proper XML parser)
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;

      while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];
        const paper = this.parseEntry(entry);

        if (paper) {
          papers.push(paper);
        }
      }
    } catch (error) {
      console.error('[ArxivClient] Parse error:', error);
    }

    return papers;
  }

  /**
   * Parse single entry from Atom feed
   */
  private parseEntry(entry: string): ArxivPaper | null {
    try {
      const arxivId = this.extractTag(entry, 'arxiv:id');
      const title = this.extractTag(entry, 'title')?.replace(/\n/g, ' ').trim();
      const summary = this.extractTag(entry, 'summary')?.replace(/\n/g, ' ').trim();
      const published = this.extractTag(entry, 'published');
      const pdfUrl = this.extractAttribute(entry, 'arxiv:pdf', 'href');

      // Extract authors
      const authorMatches = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>/g) || [];
      const authors = authorMatches
        .map((a) => a.match(/<name>(.*?)<\/name>/)?.[1] || '')
        .filter(Boolean);

      // Extract categories
      const primaryCategoryMatch = entry.match(/<arxiv:primary_category term="([^"]+)"/);
      const categories = primaryCategoryMatch ? [primaryCategoryMatch[1]] : [];

      if (!arxivId || !title) {
        return null;
      }

      return {
        arxiv_id: arxivId,
        title,
        abstract: summary || '',
        authors,
        published_date: published || new Date().toISOString(),
        pdf_url: pdfUrl || '',
        categories
      };
    } catch (error) {
      console.error('[ArxivClient] Entry parse error:', error);
      return null;
    }
  }

  /**
   * Extract XML tag content
   */
  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract XML attribute
   */
  private extractAttribute(xml: string, tag: string, attr: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }
}
