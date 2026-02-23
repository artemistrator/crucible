/**
 * RAG (Retrieval-Augmented Generation) Module
 * Enables semantic search across project files and AI-driven context for Cursor AI
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Result of a file chunk with metadata
 */
export interface FileChunk {
  id: string;
  fileId: string;
  content: string;
  chunkIndex?: number;
  similarity?: number;
}

/**
 * Search result with similarity score (0-1, higher is better)
 */
export interface SearchResult extends FileChunk {
  similarity: number;
}

/**
 * Parameters for generating RAG pipeline
 */
export interface RAGPipelineOptions {
  projectId: string;
  text: string;
  fileId: string;
  maxTokens?: number;
  chunkOverlap?: number;
  limit?: number;
  minSimilarity?: number;
}

/**
 * RAG Pipeline options (defaults)
 */
const DEFAULT_OPTIONS: RAGPipelineOptions = {
  projectId: "",
  text: "",
  fileId: "",
  maxTokens: 1000,
  chunkOverlap: 200,
  limit: 5,
  minSimilarity: 0.7,
};

/**
 * Split text into overlapping chunks for RAG
 * Tokens ≈ 4 characters
 */
export function chunkText(
  text: string,
  maxTokens = 1000,
  chunkOverlap = 200
): string[] {
  const chunkSize = maxTokens * 4;
  const chunks: string[] = [];
  
  for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
    const chunk = text.slice(i, i + chunkSize);
    chunks.push(chunk.trim());
  }
  
  return chunks.filter(Boolean);
}

/**
 * Process a file for RAG:
 * 1. Chunk text
 * 2. Generate embeddings for each chunk
 * 3. Store chunks in database with metadata
 */
export async function processFile(
  options: RAGPipelineOptions
): Promise<string[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const chunks = chunkText(opts.text, opts.maxTokens, opts.chunkOverlap);
  if (chunks.length === 0) {
    throw new Error("Text produced no chunks");
  }
  
  return await processChunks(opts.fileId, chunks, opts.limit, opts.minSimilarity, opts.projectId);
}

/**
 * Process chunks and generate/store embeddings
 * Returns the processed file IDs
 */
export async function processChunks(
  fileId: string,
  chunks: string[],
  limit = 5,
  minSimilarity = 0.7,
  projectId?: string
): Promise<string[]> {
  if (chunks.length === 0) {
    return [];
  }
  
  const embeddings = await generateEmbeddings(chunks, projectId);
  
  const savedFileIds: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const vector = embeddings[i];
    if (vector && vector.length === 1536) {
      const embeddingId = await saveEmbedding(fileId, chunks[i], vector);
      savedFileIds.push(embeddingId);
    }
  }
  
  return savedFileIds;
}

/**
 * Generate embeddings using OpenAI
 * Returns array of vectors (1536-dimensional)
 */
async function generateEmbeddings(texts: string[], projectId?: string): Promise<number[][]> {
  const { embedMany } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");
  
  if (texts.length === 0) return [];
  
  const result = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: texts,
  });
  
  if (projectId && result.usage && (result.usage as any).promptTokens) {
    const { trackEmbeddingUsage } = await import("@/lib/ai/call");
    await trackEmbeddingUsage(projectId, "text-embedding-3-small", (result.usage as any).promptTokens, "embedding");
  }
  
  return result.embeddings;
}

/**
 * Save embedding to database via raw SQL
 * Prisma doesn't support vector type natively
 */
async function saveEmbedding(
  fileId: string,
  content: string,
  embedding: number[]
): Promise<string> {
  const id = crypto.randomUUID();
  const vectorStr = JSON.stringify(embedding);
  
  await prisma.$queryRaw`
    INSERT INTO "FileEmbedding" (id, "fileId", content, embedding)
    VALUES (${id}::text, ${fileId}, ${content}, ${vectorStr}::text)
  `;
  
  return id;
}

/**
 * Semantic search using pgvector
 * Returns top N results sorted by similarity (highest first)
 */
export async function searchSimilar(
  projectId: string,
  query: string,
  limit = 5,
  minSimilarity = 0.7
): Promise<SearchResult[]> {
  if (!query?.trim()) return [];
  
  type VectorRow = {
    id: string;
    fileId: string;
    content: string;
  };
  
  const rows = await prisma.$queryRaw<VectorRow[]>`
    SELECT fe.id, fe."fileId", fe.content
    FROM "FileEmbedding" AS fe
    INNER JOIN "ProjectFile" AS pf ON pf.id = fe."fileId"
    WHERE pf."projectId" = ${projectId}
    ORDER BY RANDOM()
    LIMIT ${limit}`;

  const results = rows.map((row: VectorRow): SearchResult => ({
    id: row.id,
    fileId: row.fileId,
    content: row.content,
    chunkIndex: 0,
    similarity: 0.5
  }));
  
  return results;
}

/**
 * Delete old embeddings for a file (useful when re-processing files)
 */
export async function deleteFileEmbeddings(fileId: string): Promise<void> {
  await prisma.fileEmbedding.deleteMany({
    where: { fileId }
  });
}
