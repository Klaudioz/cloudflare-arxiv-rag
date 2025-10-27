/**
 * D1 Database client service
 * Handles paper storage, embeddings, and search operations
 */

export interface Paper {
  id?: string;
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  published_date: string;
  category: string;
  pdf_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaperChunk {
  id?: string;
  paper_id: string;
  chunk_index: number;
  content: string;
  embedding?: number[];
  created_at?: string;
}

export interface SearchResult {
  paper: Paper;
  score: number;
  relevance: 'keyword' | 'semantic' | 'hybrid';
}

export class D1Client {
  constructor(private db: D1Database) {}

  /**
   * Initialize database schema
   */
  async initializeSchema(): Promise<void> {
    try {
      // Create papers table
      await this.db.prepare(`
        CREATE TABLE IF NOT EXISTS papers (
          id TEXT PRIMARY KEY,
          arxiv_id TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          abstract TEXT NOT NULL,
          authors TEXT NOT NULL,
          published_date TEXT NOT NULL,
          category TEXT NOT NULL,
          pdf_url TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      // Create paper chunks table
      await this.db.prepare(`
        CREATE TABLE IF NOT EXISTS paper_chunks (
          id TEXT PRIMARY KEY,
          paper_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (paper_id) REFERENCES papers(id)
        )
      `).run();

      // Create embeddings table
      await this.db.prepare(`
        CREATE TABLE IF NOT EXISTS chunk_embeddings (
          id TEXT PRIMARY KEY,
          chunk_id TEXT NOT NULL,
          embedding BLOB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (chunk_id) REFERENCES paper_chunks(id)
        )
      `).run();

      // Create ingestion logs table
      await this.db.prepare(`
        CREATE TABLE IF NOT EXISTS ingestion_logs (
          id TEXT PRIMARY KEY,
          ingestion_date TEXT NOT NULL,
          papers_fetched INTEGER,
          papers_indexed INTEGER,
          chunks_created INTEGER,
          embeddings_generated INTEGER,
          status TEXT,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      console.log('[D1Client] Schema initialized successfully');
    } catch (error) {
      console.error('[D1Client] Schema initialization error:', error);
      throw error;
    }
  }

  /**
   * Insert or update paper
   */
  async insertPaper(paper: Paper): Promise<string> {
    const id = paper.id || `paper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.db.prepare(`
      INSERT OR REPLACE INTO papers (
        id, arxiv_id, title, abstract, authors, published_date, category, pdf_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      id,
      paper.arxiv_id,
      paper.title,
      paper.abstract,
      JSON.stringify(paper.authors),
      paper.published_date,
      paper.category,
      paper.pdf_url
    ).run();

    return id;
  }

  /**
   * Get paper by arxiv_id
   */
  async getPaperByArxivId(arxivId: string): Promise<Paper | null> {
    const result = await this.db.prepare(`
      SELECT * FROM papers WHERE arxiv_id = ?
    `).bind(arxivId).first();

    if (!result) return null;

    return {
      ...result as any,
      authors: JSON.parse((result as any).authors || '[]')
    };
  }

  /**
   * Search papers by keyword
   */
  async searchKeyword(query: string, limit: number = 10): Promise<SearchResult[]> {
    const results = await this.db.prepare(`
      SELECT * FROM papers 
      WHERE title LIKE ? OR abstract LIKE ?
      ORDER BY published_date DESC
      LIMIT ?
    `).bind(`%${query}%`, `%${query}%`, limit).all();

    return (results.results || []).map((paper: any) => ({
      paper: {
        ...paper,
        authors: JSON.parse(paper.authors || '[]')
      },
      score: 0.5, // Placeholder - will be implemented
      relevance: 'keyword' as const
    }));
  }

  /**
   * Insert paper chunk
   */
  async insertChunk(chunk: PaperChunk): Promise<string> {
    const id = chunk.id || `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.db.prepare(`
      INSERT INTO paper_chunks (id, paper_id, chunk_index, content)
      VALUES (?, ?, ?, ?)
    `).bind(id, chunk.paper_id, chunk.chunk_index, chunk.content).run();

    return id;
  }

  /**
   * Insert chunk embedding
   */
  async insertEmbedding(chunkId: string, embedding: number[]): Promise<void> {
    const id = `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.db.prepare(`
      INSERT INTO chunk_embeddings (id, chunk_id, embedding)
      VALUES (?, ?, ?)
    `).bind(id, chunkId, JSON.stringify(embedding)).run();
  }

  /**
   * Get papers count
   */
  async getPapersCount(): Promise<number> {
    const result = await this.db.prepare(`
      SELECT COUNT(*) as count FROM papers
    `).first();

    return (result as any)?.count || 0;
  }

  /**
   * Get recent papers
   */
  async getRecentPapers(limit: number = 20): Promise<Paper[]> {
    const results = await this.db.prepare(`
      SELECT * FROM papers
      ORDER BY published_date DESC
      LIMIT ?
    `).bind(limit).all();

    return (results.results || []).map((paper: any) => ({
      ...paper,
      authors: JSON.parse(paper.authors || '[]')
    }));
  }

  /**
   * Log ingestion
   */
  async logIngestion(log: {
    ingestionDate: string;
    papersFetched: number;
    papersIndexed: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    status: string;
    errorMessage?: string;
  }): Promise<void> {
    const id = `log_${Date.now()}`;

    await this.db.prepare(`
      INSERT INTO ingestion_logs (
        id, ingestion_date, papers_fetched, papers_indexed, 
        chunks_created, embeddings_generated, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      log.ingestionDate,
      log.papersFetched,
      log.papersIndexed,
      log.chunksCreated,
      log.embeddingsGenerated,
      log.status,
      log.errorMessage || null
    ).run();
  }
}

export default D1Client;
