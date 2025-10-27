/**
 * Embeddings service
 * Generates embeddings using Workers AI for semantic search
 */

export interface TextChunk {
  text: string;
  metadata?: Record<string, any>;
}

export interface ChunkWithEmbedding {
  text: string;
  embedding: number[];
  metadata?: Record<string, any>;
}

export class EmbeddingsService {
  private batchSize = 10;

  constructor(private ai: Ai) {}

  /**
   * Chunk text into sentences/paragraphs
   */
  chunkText(text: string, chunkSize: number = 512): TextChunk[] {
    if (!text || text.length === 0) return [];

    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: TextChunk[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk) {
        chunks.push({ text: currentChunk.trim() });
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({ text: currentChunk.trim() });
    }

    return chunks;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.length === 0) {
      throw new Error('Text cannot be empty');
    }

    try {
      // Use @cf/baai/bge-base-en-v1.5 for embeddings
      const response = await (this.ai as any).run('@cf/baai/bge-base-en-v1.5', {
        text: text
      }) as any;

      if (!response || !Array.isArray(response)) {
        throw new Error('Invalid embedding response');
      }

      return response;
    } catch (error) {
      console.error('[EmbeddingsService] Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /**
   * Generate embeddings for text chunks
   */
  async generateChunkEmbeddings(chunks: TextChunk[]): Promise<ChunkWithEmbedding[]> {
    if (chunks.length === 0) return [];

    const texts = chunks.map(c => c.text);
    const embeddings = await this.generateEmbeddingsBatch(texts);

    return chunks.map((chunk, index) => ({
      text: chunk.text,
      embedding: embeddings[index],
      metadata: chunk.metadata
    }));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Find similar embeddings
   */
  findSimilar(
    queryEmbedding: number[],
    candidates: Array<{ embedding: number[]; id: string; text: string }>,
    topK: number = 5,
    minSimilarity: number = 0.3
  ): Array<{ id: string; text: string; score: number }> {
    const scores = candidates.map(candidate => ({
      id: candidate.id,
      text: candidate.text,
      score: this.cosineSimilarity(queryEmbedding, candidate.embedding)
    }));

    return scores
      .filter(s => s.score >= minSimilarity)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

export default EmbeddingsService;
