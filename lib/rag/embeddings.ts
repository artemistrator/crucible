import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { trackEmbeddingUsage } from "@/lib/ai/call";

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Generate embeddings for multiple text chunks via OpenAI.
 * Returns array of vectors (each is number[] of dimension 1536).
 * @throws Error if OpenAI API fails or returns invalid response
 */
export async function generateEmbeddings(texts: string[], projectId?: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    const result = await embedMany({
      model: openai.embedding(EMBEDDING_MODEL),
      values: texts,
    });

    if (!result.embeddings || result.embeddings.length !== texts.length) {
      throw new Error("Invalid embeddings response from OpenAI API");
    }

    if (projectId && result.usage && (result.usage as any).promptTokens) {
      await trackEmbeddingUsage(projectId, EMBEDDING_MODEL, (result.usage as any).promptTokens, "embedding");
    }

    return result.embeddings;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
    throw new Error("Unknown error while generating embeddings");
  }
}

/**
 * Alias for backward compatibility.
 * @deprecated Use generateEmbeddings instead.
 */
export const getEmbeddings = generateEmbeddings;
