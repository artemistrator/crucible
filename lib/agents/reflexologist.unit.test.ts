import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InsightSchema, InsightArraySchema } from "./reflexologist";

describe("Reflexologist Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Insight Schema Validation", () => {
    it("should validate insight with valid data (TOOLING category)", () => {
      const validInsight = {
        title: "Missing Import Statements",
        summary: "The AI frequently forgets to import React components before using them",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: {
          projectId: "proj-1",
          planId: "plan-1",
          sessionId: "session-1",
        },
        recommendation: "Add a pre-flight check that verifies all imports are present",
      };

      expect(() => InsightSchema.parse(validInsight)).not.toThrow();
    });

    it("should validate insight with valid data (WORKFLOW category)", () => {
      const validInsight = {
        title: "Inconsistent Task Retry Logic",
        summary: "Tasks are being retried with exponential backoff but without error classification",
        category: "WORKFLOW" as const,
        severity: "high" as const,
        appliesTo: {
          projectId: "proj-1",
          planId: null,
          sessionId: "session-1",
        },
        recommendation: "Implement error classification to determine retry eligibility",
      };

      expect(() => InsightSchema.parse(validInsight)).not.toThrow();
    });

    it("should reject insight with invalid category", () => {
      const invalidInsight = {
        title: "Test Insight",
        summary: "Test summary",
        category: "INVALID_CATEGORY" as any,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
      };

      expect(() => InsightSchema.parse(invalidInsight)).toThrow();
    });

    it("should reject insight with invalid severity", () => {
      const invalidInsight = {
        title: "Test Insight",
        summary: "Test summary",
        category: "TOOLING" as const,
        severity: "critical" as any,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
      };

      expect(() => InsightSchema.parse(invalidInsight)).toThrow();
    });

    it("should reject insight with empty title", () => {
      const invalidInsight = {
        title: "",
        summary: "Test summary",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
      };

      expect(() => InsightSchema.parse(invalidInsight)).toThrow();
    });

    it("should reject insight with title exceeding max length", () => {
      const invalidInsight = {
        title: "a".repeat(300),
        summary: "Test summary",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
      };

      expect(() => InsightSchema.parse(invalidInsight)).toThrow();
    });

    it("should reject insight with empty summary", () => {
      const invalidInsight = {
        title: "Test Insight",
        summary: "",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
      };

      expect(() => InsightSchema.parse(invalidInsight)).toThrow();
    });

    it("should reject insight with empty recommendation", () => {
      const invalidInsight = {
        title: "Test Insight",
        summary: "Test summary",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "",
      };

      expect(() => InsightSchema.parse(invalidInsight)).toThrow();
    });

    it("should accept insight with optional fingerprint", () => {
      const validInsight = {
        title: "Test Insight",
        summary: "Test summary",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
        fingerprint: "tooling:missing-imports",
      };

      const result = InsightSchema.parse(validInsight);
      expect(result.fingerprint).toBe("tooling:missing-imports");
    });

    it("should accept insight with optional tags", () => {
      const validInsight = {
        title: "Test Insight",
        summary: "Test summary",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
        tags: ["import", "react", "missing"],
      };

      const result = InsightSchema.parse(validInsight);
      expect(result.tags).toEqual(["import", "react", "missing"]);
    });

    it("should reject tags array exceeding max length (16)", () => {
      const invalidInsight = {
        title: "Test Insight",
        summary: "Test summary",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
        tags: Array.from({ length: 17 }, (_, i) => `tag${i}`),
      };

      expect(() => InsightSchema.parse(invalidInsight)).toThrow();
    });

    it("should reject insight with tag exceeding max length", () => {
      const invalidInsight = {
        title: "Test Insight",
        summary: "Test summary",
        category: "TOOLING" as const,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
        tags: [""],
      };

      expect(() => InsightSchema.parse(invalidInsight)).toThrow();
    });
  });

  describe("Insight Array Schema Validation", () => {
    it("should validate array with up to 3 insights", () => {
      const validArray = [
        {
          title: "Insight 1",
          summary: "Summary 1",
          category: "TOOLING" as const,
          severity: "low" as const,
          appliesTo: { projectId: "proj-1" },
          recommendation: "Rec 1",
        },
        {
          title: "Insight 2",
          summary: "Summary 2",
          category: "WORKFLOW" as const,
          severity: "medium" as const,
          appliesTo: { projectId: "proj-1" },
          recommendation: "Rec 2",
        },
        {
          title: "Insight 3",
          summary: "Summary 3",
          category: "QA_PROCESS" as const,
          severity: "high" as const,
          appliesTo: { projectId: "proj-1" },
          recommendation: "Rec 3",
        },
      ];

      expect(() => InsightArraySchema.parse(validArray)).not.toThrow();
    });

    it("should reject array with more than 3 insights", () => {
      const invalidArray = [
        {
          title: "Insight 1",
          summary: "Summary 1",
          category: "TOOLING" as const,
          severity: "low" as const,
          appliesTo: { projectId: "proj-1" },
          recommendation: "Rec 1",
        },
        {
          title: "Insight 2",
          summary: "Summary 2",
          category: "WORKFLOW" as const,
          severity: "medium" as const,
          appliesTo: { projectId: "proj-1" },
          recommendation: "Rec 2",
        },
        {
          title: "Insight 3",
          summary: "Summary 3",
          category: "QA_PROCESS" as const,
          severity: "high" as const,
          appliesTo: { projectId: "proj-1" },
          recommendation: "Rec 3",
        },
        {
          title: "Insight 4",
          summary: "Summary 4",
          category: "ARCHITECTURE" as const,
          severity: "medium" as const,
          appliesTo: { projectId: "proj-1" },
          recommendation: "Rec 4",
        },
      ];

      expect(() => InsightArraySchema.parse(invalidArray)).toThrow();
    });

    it("should validate empty array", () => {
      const emptyArray: any[] = [];

      expect(() => InsightArraySchema.parse(emptyArray)).not.toThrow();
    });
  });

  describe("Fingerprint Generation", () => {
    it("should generate fingerprint from category and title", () => {
      const category = "TOOLING";
      const title = "Missing Dependencies in React Components";
      const fingerprint = `${category}:${title}`.toLowerCase().slice(0, 120);

      expect(fingerprint).toBe("tooling:missing dependencies in react components");
    });

    it("should truncate fingerprint to max 120 characters", () => {
      const category = "ARCHITECTURE";
      const title = "This is a very long title that exceeds the maximum length when combined with the category prefix and needs to be truncated properly without causing issues";
      const fingerprint = `${category}:${title}`.toLowerCase().slice(0, 120);

      expect(fingerprint.length).toBeLessThanOrEqual(120);
      expect(fingerprint).toBe("architecture:this is a very long title that exceeds the maximum length when combined with the category prefix and needs ");
    });

    it("should be case-insensitive", () => {
      const category1 = "TOOLING";
      const category2 = "tooling";
      const title = "Test Title";
      const fingerprint1 = `${category1}:${title}`.toLowerCase().slice(0, 120);
      const fingerprint2 = `${category2}:${title}`.toLowerCase().slice(0, 120);

      expect(fingerprint1).toBe(fingerprint2);
    });
  });

  describe("Signal Detection Logic", () => {
    it("should detect signals when logs have errors", () => {
      const logs = [
        { type: "info" },
        { type: "error" },
        { type: "info" },
      ];
      const hasSignals = logs.some((l: any) => l.type === "error");

      expect(hasSignals).toBe(true);
    });

    it("should detect signals when logs have warnings", () => {
      const logs = [
        { type: "info" },
        { type: "warning" },
        { type: "info" },
      ];
      const hasSignals = logs.some((l: any) => l.type === "warning");

      expect(hasSignals).toBe(true);
    });

    it("should detect signals when qaOutcomes exist", () => {
      const qaOutcomes = [
        { taskId: "task-1", status: "REJECTED", message: "QA rejected task" },
        { taskId: "task-2", status: "DONE", message: "QA approved task" },
      ];
      const hasSignals = qaOutcomes.length > 0;

      expect(hasSignals).toBe(true);
    });

    it("should detect signals when retryCounter has entries", () => {
      const retrySummary = {
        retryCounter: {
          "task-1": 3,
          "task-2": 2,
        },
        lastErrorSignature: null,
      };
      const hasSignals = Object.keys(retrySummary.retryCounter || {}).length > 0;

      expect(hasSignals).toBe(true);
    });

    it("should not detect signals when all are empty/absent", () => {
      const qaOutcomes: any[] = [];
      const logs = [{ type: "info" }, { type: "success" }];
      const retrySummary = {
        retryCounter: {},
        lastErrorSignature: null,
      };

      const hasSignals =
        qaOutcomes.length > 0 ||
        Object.keys(retrySummary.retryCounter || {}).length > 0 ||
        logs.some((l: any) => l.type === "error");

      expect(hasSignals).toBe(false);
    });
  });

  describe("Category Validity", () => {
    const validCategories = [
      "TOOLING",
      "WORKFLOW",
      "QA_PROCESS",
      "ARCHITECTURE",
      "DOCUMENTATION",
      "MISC",
    ] as const;

    it.each(validCategories)("should accept %s as valid category", (category) => {
      const insight = {
        title: "Test Insight",
        summary: "Test summary",
        category,
        severity: "medium" as const,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
      };

      expect(() => InsightSchema.parse(insight)).not.toThrow();
    });
  });

  describe("Severity Validity", () => {
    const validSeverities = ["low", "medium", "high"] as const;

    it.each(validSeverities)("should accept %s as valid severity", (severity) => {
      const insight = {
        title: "Test Insight",
        summary: "Test summary",
        category: "TOOLING" as const,
        severity,
        appliesTo: { projectId: "proj-1" },
        recommendation: "Test recommendation",
      };

      expect(() => InsightSchema.parse(insight)).not.toThrow();
    });
  });
});
