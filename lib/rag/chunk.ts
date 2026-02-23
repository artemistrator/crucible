/**
 * Split text into chunks with overlap for RAG embedding.
 * Chunk size ~chunkSize chars, overlap overlapSize chars.
 */
export function chunkText(
  text: string,
  chunkSize = 1000,
  overlapSize = 200
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + chunkSize, trimmed.length);
    const chunk = trimmed.slice(start, end);
    if (chunk.trim()) chunks.push(chunk);
    start += chunkSize - overlapSize;
    if (start >= trimmed.length) break;
  }

  return chunks;
}
