-- Migration: Create initial schema for arXiv RAG
-- Date: 2025-10-27
-- Description: Create tables for papers, chunks, embeddings, and ingestion logs

-- Papers table: Core paper metadata
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  arxiv_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  authors TEXT NOT NULL,  -- JSON array stored as text
  published_date TEXT NOT NULL,
  category TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on arxiv_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_papers_arxiv_id ON papers(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_papers_published_date ON papers(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_papers_category ON papers(category);

-- Paper chunks table: Chunked paper content for embedding
CREATE TABLE IF NOT EXISTS paper_chunks (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  UNIQUE(paper_id, chunk_index)
);

-- Create index on paper_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_chunks_paper_id ON paper_chunks(paper_id);

-- Chunk embeddings table: Vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL,
  embedding BLOB NOT NULL,  -- Binary encoded vector (768 dimensions)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id) REFERENCES paper_chunks(id) ON DELETE CASCADE,
  UNIQUE(chunk_id)
);

-- Ingestion logs table: Track daily paper ingestion runs
CREATE TABLE IF NOT EXISTS ingestion_logs (
  id TEXT PRIMARY KEY,
  ingestion_date TEXT NOT NULL,
  papers_fetched INTEGER DEFAULT 0,
  papers_indexed INTEGER DEFAULT 0,
  chunks_created INTEGER DEFAULT 0,
  embeddings_generated INTEGER DEFAULT 0,
  status TEXT NOT NULL,  -- 'pending', 'running', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ingestion_date)
);

-- Create index on status and date for monitoring
CREATE INDEX IF NOT EXISTS idx_logs_status ON ingestion_logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_date ON ingestion_logs(ingestion_date DESC);
