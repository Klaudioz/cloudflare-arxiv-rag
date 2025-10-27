/**
 * Text chunking utilities for paper processing
 */

export interface ChunkOptions {
  chunkSize?: number;
  overlapSize?: number;
  strategy?: 'sentence' | 'paragraph' | 'sliding';
}

const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_OVERLAP_SIZE = 50;

/**
 * Split text by sentences
 */
export function splitBySentences(text: string): string[] {
  return text
    .match(/[^.!?]+[.!?]+/g) || [text]
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Split text by paragraphs
 */
export function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Split text using sliding window
 */
export function slidingWindowChunk(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlapSize: number = DEFAULT_OVERLAP_SIZE
): string[] {
  if (!text || text.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = start + chunkSize;
    const chunk = text.substring(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start += chunkSize - overlapSize;
  }

  return chunks;
}

/**
 * Smart chunking: combine sentences into chunks
 */
export function smartChunk(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): string[] {
  if (!text || text.length === 0) return [];

  const sentences = splitBySentences(text);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const testChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;

    if (testChunk.length > chunkSize && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk = testChunk;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Chunk paper content with smart strategy
 */
export function chunkPaperContent(
  abstract: string,
  options: ChunkOptions = {}
): string[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    strategy = 'sentence'
  } = options;

  switch (strategy) {
    case 'paragraph':
      return splitByParagraphs(abstract);
    case 'sliding':
      return slidingWindowChunk(abstract, chunkSize);
    case 'sentence':
    default:
      return smartChunk(abstract, chunkSize);
  }
}

/**
 * Prepare paper for ingestion
 */
export function preparePaperForIngestion(paperText: string): {
  title: string;
  chunks: string[];
} {
  // Assume first line is title
  const lines = paperText.split('\n').filter(l => l.trim());
  const title = lines[0] || 'Untitled';
  const abstract = lines.slice(1).join('\n');

  const chunks = chunkPaperContent(abstract, {
    chunkSize: 512,
    strategy: 'sentence'
  });

  return { title, chunks };
}

export default {
  chunkPaperContent,
  preparePaperForIngestion,
  smartChunk,
  slidingWindowChunk,
  splitBySentences,
  splitByParagraphs
};
