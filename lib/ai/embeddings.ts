const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Generate an embedding vector for the given text using OpenAI API.
 * Returns null if the API key is missing or the request fails (system keeps working without embeddings).
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return null;
  }
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8192),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.warn("[embeddings] OpenAI embeddings API error:", response.status, err?.slice(0, 200));
      return null;
    }
    const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return null;
    }
    return embedding;
  } catch (error) {
    console.warn("[embeddings] generateEmbedding failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Cosine similarity between two vectors: (A·B) / (||A|| * ||B||).
 * Returns 0 if either vector has zero length.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
