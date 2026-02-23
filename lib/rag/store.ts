import { prisma } from "@/lib/prisma";

/**
 * Persist file embeddings to DB via raw SQL (Prisma has no native vector support).
 * @param fileId - ID of the file to save embeddings for
 * @param items - Array of {content, embedding} pairs
 * @param clearExisting - If true, delete existing embeddings for this file first
 */
export async function saveFileEmbeddings(
  fileId: string,
  items: { content: string; embedding: number[] }[],
  clearExisting = true
): Promise<void> {
  if (clearExisting) {
    await prisma.$executeRaw`
      DELETE FROM "FileEmbedding"
      WHERE "fileId" = ${fileId}
    `;
  }

  for (const item of items) {
    const id = crypto.randomUUID();
    const vectorStr = JSON.stringify(item.embedding);
    await prisma.$executeRaw`
      INSERT INTO "FileEmbedding" (id, "fileId", content, embedding)
      VALUES (${id}, ${fileId}, ${item.content}, ${vectorStr}::text)
    `;
  }
}
