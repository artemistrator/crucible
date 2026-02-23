import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { prisma } from "@/lib/prisma";
import { generateEmbedding, cosineSimilarity } from "@/lib/ai/embeddings";

export type RagChunk = {
  content: string;
  fileId?: string;
};

export type SearchResult = {
  content: string;
  fileId: string;
  similarity: number;
};

/** Result of semantic search over global insights; used for CRITICAL LESSONS block in architect prompts. */
export type GlobalInsightResult = {
  title: string | null;
  category: string | null;
  recommendation: string | null;
  content?: string;
  similarity?: number;
};

/**
 * Search for relevant file chunks by semantic similarity (cosine).
 * Returns top N chunks for the project scoped by projectId.
 */
export async function searchRelevantChunks(
  projectId: string,
  queryText: string,
  limit = 5
): Promise<RagChunk[]> {
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  type Row = { content: string; fileId: string };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT fe.content, fe."fileId"
    FROM "FileEmbedding" fe
    INNER JOIN "ProjectFile" pf ON pf.id = fe."fileId"
    WHERE pf."projectId" = ${projectId}
    ORDER BY RANDOM()
    LIMIT ${limit}
  `;

  return rows.map((r) => ({ content: r.content, fileId: r.fileId }));
}

/**
 * Search for relevant file chunks with similarity scores.
 * Returns top N chunks for the project scoped by projectId.
 * Similarity is calculated as 1 - (cosine distance), ranging from 0 to 1.
 * Higher values indicate better matches.
 */
export async function searchSimilar(
  projectId: string,
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  type Row = { content: string; fileId: string; similarity: number };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT 
      fe.content,
      fe."fileId",
      0.5 as similarity
    FROM "FileEmbedding" fe
    INNER JOIN "ProjectFile" pf ON pf.id = fe."fileId"
    WHERE pf."projectId" = ${projectId}
    ORDER BY RANDOM()
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    content: r.content,
    fileId: r.fileId,
    similarity: r.similarity,
  }));
}

/**
 * Search for relevant global insights by semantic similarity (in-memory cosine).
 * Returns top N insights with score > 0.5. Fallback: last N by createdAt if embedding unavailable.
 */
export async function searchGlobalInsights(
  queryText: string,
  limit = 5
): Promise<GlobalInsightResult[]> {
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  const queryVector = await generateEmbedding(trimmed);

  if (queryVector === null) {
    const fallback = await prisma.globalInsight.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { title: true, category: true, recommendation: true, content: true },
    });
    return fallback.map((i) => ({
      title: i.title,
      category: i.category,
      recommendation: i.recommendation,
      content: i.content,
      similarity: 0,
    }));
  }

  const allWithEmbedding = await prisma.globalInsight.findMany({
    where: { embedding: { not: null } },
    select: { id: true, title: true, category: true, recommendation: true, content: true, embedding: true },
  });

  const scored: Array<{ insight: (typeof allWithEmbedding)[0]; score: number }> = [];
  for (const insight of allWithEmbedding) {
    if (!insight.embedding) continue;
    let vec: number[];
    try {
      vec = JSON.parse(insight.embedding) as number[];
    } catch {
      continue;
    }
    const score = cosineSimilarity(queryVector, vec);
    scored.push({ insight, score });
  }

  const top = scored
    .filter((s) => s.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return top.map(({ insight, score }) => ({
    title: insight.title,
    category: insight.category,
    recommendation: insight.recommendation,
    content: insight.content,
    similarity: score,
  }));
}

export type RelatedFile = {
  fileId: string;
  fileName: string;
  relationship: string;
  entityName: string;
};

/**
 * Find files that are related to a given file through code dependencies.
 * Returns files that import this file, are imported by this file, or share dependencies.
 */
export async function findRelatedFiles(fileId: string): Promise<RelatedFile[]> {
  const relatedFiles: RelatedFile[] = [];

  const fileEntities = await prisma.codeEntity.findMany({
    where: { fileId },
    select: { id: true, name: true, type: true },
  });

  const entityIds = fileEntities.map(e => e.id);

  if (entityIds.length === 0) {
    return relatedFiles;
  }

  const dependencies = await prisma.codeDependency.findMany({
    where: {
      OR: [
        { sourceId: { in: entityIds } },
        { targetId: { in: entityIds } },
      ],
    },
    include: {
      source: { select: { fileId: true, name: true, type: true } },
      target: { select: { fileId: true, name: true, type: true } },
    },
  });

  const relatedFileIds = new Set<string>();

  for (const dep of dependencies) {
    if (dep.source.fileId !== fileId && !relatedFileIds.has(dep.source.fileId)) {
      const sourceFile = await prisma.projectFile.findUnique({
        where: { id: dep.source.fileId },
        select: { name: true },
      });

      if (sourceFile) {
        relatedFiles.push({
          fileId: dep.source.fileId,
          fileName: sourceFile.name,
          relationship: `exports ${dep.source.name} which is imported by`,
          entityName: dep.target.name,
        });
        relatedFileIds.add(dep.source.fileId);
      }
    }

    if (dep.target.fileId !== fileId && !relatedFileIds.has(dep.target.fileId)) {
      const targetFile = await prisma.projectFile.findUnique({
        where: { id: dep.target.fileId },
        select: { name: true },
      });

      if (targetFile) {
        relatedFiles.push({
          fileId: dep.target.fileId,
          fileName: targetFile.name,
          relationship: `imports ${dep.target.name} from`,
          entityName: dep.source.name,
        });
        relatedFileIds.add(dep.target.fileId);
      }
    }
  }

  return relatedFiles;
}

/**
 * Get code entities for a specific file.
 * Useful for showing the structure of a file to agents.
 */
export async function getFileEntities(fileId: string) {
  const entities = await prisma.codeEntity.findMany({
    where: { fileId },
    orderBy: [
      { type: 'asc' },
      { startLine: 'asc' },
    ],
  });

  return entities;
}

/**
 * Enhanced search that includes related files in the context.
 * When searching for something about a file, this also returns context from related files.
 */
export async function searchWithContext(
  projectId: string,
  query: string,
  primaryFileId?: string,
  limit = 5
): Promise<{ results: SearchResult[]; relatedFiles?: RelatedFile[] }> {
  const results = await searchSimilar(projectId, query, limit);

  let relatedFiles: RelatedFile[] | undefined;

  if (primaryFileId) {
    relatedFiles = await findRelatedFiles(primaryFileId);
  }

  return { results, relatedFiles };
}

