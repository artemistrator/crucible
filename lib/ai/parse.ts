export type PlanProsCons = {
  pros: string[];
  cons: string[];
};

export type PlanPayload = {
  title: string;
  description: string;
  techStack: string;
  relevanceScore: number;
  /** 1–5, optional for backward compatibility */
  estimatedComplexity?: number;
  /** Estimated days for manual implementation; we derive LLM time by dividing by 3–4 */
  estimatedManualDays?: number;
  pros?: string[];
  cons?: string[];
  /** anti_overengineering_check or similar reasoning */
  reasoning?: string;
};

function normalizeTechStack(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join(", ");
  }
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function normalizeRelevanceScore(score: number): number {
  let normalized = score;

  if (score <= 0) {
    return 0;
  } else if (score < 1) {
    normalized = score * 100;
  } else if (score <= 100) {
    normalized = score;
  } else {
    normalized = 100;
  }

  if (normalized < 0) return 0;
  if (normalized > 100) return 100;
  return Math.round(normalized);
}

function normalizeComplexity1to5(v: unknown): number | null {
  const n = toNumber(v);
  if (n === null) return null;
  if (n >= 1 && n <= 5) return Math.round(n);
  if (n >= 0 && n < 1) return 1;
  if (n > 5 && n <= 10) return Math.round((n / 10) * 5);
  return null;
}

function normalizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === "string").slice(0, 5);
}

function isPlanPayload(value: unknown): value is PlanPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  const techStack = normalizeTechStack(record.techStack);
  const score = toNumber(record.relevanceScore);
  return (
    typeof record.title === "string" &&
    typeof record.description === "string" &&
    typeof techStack === "string" &&
    score !== null
  );
}

/**
 * Find the index of the matching closing bracket/brace so we can strip trailing text.
 * Skips braces inside string literals.
 */
function findJsonEnd(s: string, start: number): number {
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 1;
  const len = s.length;
  let inString: string | null = null;
  for (let i = start + 1; i < len; i++) {
    const c = s[i];
    if (inString !== null) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractJson(text: string): string {
  let trimmed = text.trim();
  // Strip markdown code block if present — search anywhere (text before/after is allowed)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    trimmed = codeBlockMatch[1].trim();
  }
  // Fallback: find first { or [ and extract to matching close
  const firstBracket = trimmed.indexOf("[");
  const firstBrace = trimmed.indexOf("{");
  const start =
    firstBracket === -1
      ? firstBrace
      : firstBrace === -1
        ? firstBracket
        : Math.min(firstBracket, firstBrace);
  if (start === -1) {
    return trimmed;
  }
  const slice = trimmed.slice(start);
  const end = findJsonEnd(slice, 0);
  return end === -1 ? slice : slice.slice(0, end + 1);
}

export function parsePlansFromJson(text: string): PlanPayload[] {
  const jsonText = extractJson(text);
  const parsed = JSON.parse(jsonText);
  const items = Array.isArray(parsed) ? parsed : parsed?.plans;

  if (!Array.isArray(items)) {
    throw new Error("LLM response is not an array of plans");
  }

  const plans = items
    .filter(isPlanPayload)
    .map((item) => {
      const record = item as Record<string, unknown>;
      const score = toNumber(record.relevanceScore);
      const complexity = normalizeComplexity1to5(record.estimatedComplexity);
      const manualDays = toNumber(record.estimatedManualDays);
      const pros = normalizeStringArray(record.pros);
      const cons = normalizeStringArray(record.cons);
      const reasoning =
        typeof record.reasoning === "string"
          ? record.reasoning
          : typeof record.anti_overengineering_check === "string"
            ? record.anti_overengineering_check
            : undefined;
      return {
        title: record.title as string,
        description: record.description as string,
        techStack: normalizeTechStack(record.techStack) as string,
        relevanceScore: normalizeRelevanceScore(score ?? 0),
        estimatedComplexity: complexity ?? undefined,
        estimatedManualDays: manualDays ?? undefined,
        pros: pros.length ? pros : undefined,
        cons: cons.length ? cons : undefined,
        reasoning
      };
    });

  // Accept 1-3 plans; return up to 3 (relaxed for varying LLM output)
  if (plans.length === 0) {
    throw new Error("LLM response does not contain any valid plans");
  }

  return plans.slice(0, 3);
}
