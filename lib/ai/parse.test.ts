import { describe, it, expect } from "vitest";
import { parsePlansFromJson, PlanPayload } from "./parse";

describe("parsePlansFromJson", () => {
  const validPlan1: PlanPayload = {
    title: "Simple Plan",
    description: "A simple plan description",
    techStack: "React, TypeScript",
    relevanceScore: 80
  };

  const validPlan2: PlanPayload = {
    title: "Advanced Plan",
    description: "An advanced plan description",
    techStack: ["Next.js", "PostgreSQL", "Docker"],
    relevanceScore: 95
  };

  const validPlan3: PlanPayload = {
    title: "Enterprise Plan",
    description: "Enterprise grade solution",
    techStack: "Kubernetes, Microservices",
    relevanceScore: 0.85 // Should be normalized to 85
  };

  describe("successful parsing", () => {
    it("should parse JSON with 3 valid plans", () => {
      const input = JSON.stringify({ plans: [validPlan1, validPlan2, validPlan3] });
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe("Simple Plan");
      expect(result[1].relevanceScore).toBe(95);
      expect(result[2].relevanceScore).toBe(85); // Normalized from 0.85
    });

    it("should parse JSON with 1 valid plan", () => {
      const input = JSON.stringify({ plans: [validPlan1] });
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Simple Plan");
    });

    it("should parse JSON with 2 valid plans", () => {
      const input = JSON.stringify({ plans: [validPlan1, validPlan2] });
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(2);
    });

    it("should parse direct array without 'plans' wrapper", () => {
      const input = JSON.stringify([validPlan1, validPlan2]);
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Simple Plan");
    });

    it("should parse JSON with markdown code block", () => {
      const input = `
Here are the plans:

\`\`\`json
{
  "plans": [
    ${JSON.stringify(validPlan1)},
    ${JSON.stringify(validPlan2)}
  ]
}
\`\`\`

Hope this helps!
`;
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Simple Plan");
    });

    it("should parse JSON with text before and after", () => {
      const input = `Some introductory text here...

{
  "plans": [${JSON.stringify(validPlan1)}]
}

Some concluding text here...`;
      
      const result = parsePlansFromJson(input);
      expect(result).toHaveLength(1);
    });

    it("should normalize relevance scores correctly", () => {
      const plans = [
        { ...validPlan1, relevanceScore: 0.5 },    // 0-1 range -> 50
        { ...validPlan1, relevanceScore: 50 },     // already 0-100 -> 50
        { ...validPlan1, relevanceScore: 150 },    // >100 -> 100
      ];
      
      const input = JSON.stringify({ plans });
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(3);
      expect(result[0].relevanceScore).toBe(50);
      expect(result[1].relevanceScore).toBe(50);
      expect(result[2].relevanceScore).toBe(100);
    });

    it("should handle negative relevance scores", () => {
      const plan = { ...validPlan1, relevanceScore: -10 };
      const input = JSON.stringify({ plans: [plan] });
      const result = parsePlansFromJson(input);
      
      expect(result[0].relevanceScore).toBe(0); // negative -> 0
    });

    it("should handle techStack as array", () => {
      const plan = {
        title: "Test",
        description: "Test desc",
        techStack: ["React", "Node.js", "MongoDB"],
        relevanceScore: 75
      };
      
      const input = JSON.stringify({ plans: [plan] });
      const result = parsePlansFromJson(input);
      
      expect(result[0].techStack).toBe("React, Node.js, MongoDB");
    });

    it("should limit to max 3 plans", () => {
      const plans = [validPlan1, validPlan2, validPlan3, validPlan1, validPlan2];
      const input = JSON.stringify({ plans });
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(3);
    });
  });

  describe("error cases", () => {
    it("should throw error for empty response", () => {
      expect(() => parsePlansFromJson("")).toThrow();
    });

    it("should throw error for invalid JSON", () => {
      expect(() => parsePlansFromJson("not json at all")).toThrow();
    });

    it("should throw error when plans is not an array", () => {
      const input = JSON.stringify({ plans: "not an array" });
      expect(() => parsePlansFromJson(input)).toThrow("LLM response is not an array of plans");
    });

    it("should throw error when no valid plans found", () => {
      const input = JSON.stringify({ plans: [] });
      expect(() => parsePlansFromJson(input)).toThrow("LLM response does not contain any valid plans");
    });

    it("should throw error when all plans are invalid", () => {
      const plans = [
        { title: "Missing fields" }, // Missing description, techStack, relevanceScore
        { description: "Missing other fields" },
      ];
      const input = JSON.stringify({ plans });
      expect(() => parsePlansFromJson(input)).toThrow("LLM response does not contain any valid plans");
    });

    it("should skip invalid plans and keep valid ones", () => {
      const plans = [
        validPlan1,
        { title: "Invalid", description: "Missing fields" },
        validPlan2,
      ];
      const input = JSON.stringify({ plans });
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Simple Plan");
      expect(result[1].title).toBe("Advanced Plan");
    });

    it("should throw error for null/undefined", () => {
      expect(() => parsePlansFromJson("null")).toThrow();
      expect(() => parsePlansFromJson("undefined")).toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle relevanceScore as string number", () => {
      const plan = {
        title: "Test",
        description: "Test desc",
        techStack: "React",
        relevanceScore: "85"
      };
      
      const input = JSON.stringify({ plans: [plan] });
      const result = parsePlansFromJson(input);
      
      expect(result[0].relevanceScore).toBe(85);
    });

    it("should handle complex JSON structure", () => {
      const input = `
# Analysis

Based on your idea, here are three approaches:

\`\`\`json
{
  "complexity_analysis": "This is a moderately complex project",
  "plans": [
    {
      "title": "MVP Approach",
      "description": "Focus on core features first",
      "techStack": ["React", "Firebase"],
      "relevanceScore": 90,
      "anti_overengineering_check": "Minimal stack for quick launch"
    }
  ]
}
\`\`\`

Good luck!
`;
      const result = parsePlansFromJson(input);
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("MVP Approach");
    });

    it("should handle nested quotes in strings", () => {
      const plan = {
        title: "Test \"Quoted\" Title",
        description: "Description with \"quotes\"",
        techStack: "Tech \"Stack\"",
        relevanceScore: 80
      };
      
      const input = JSON.stringify({ plans: [plan] });
      const result = parsePlansFromJson(input);
      
      expect(result[0].title).toBe('Test "Quoted" Title');
    });
  });
});
