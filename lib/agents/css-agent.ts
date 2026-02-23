import { BaseAgent, AgentConfig } from "./base-agent";
import { AgentMessage, AgentRole, MessageType } from "@prisma/client";
import { generateText } from "ai";
import { getModel, resolveProvider } from "@/lib/ai/providers";
import { prisma } from "@/lib/prisma";
import { trackAIUsage } from "@/lib/ai/call";

export class CSSAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super({ ...config, agentRole: AgentRole.CSS });
  }

  async processMessage(message: AgentMessage): Promise<Record<string, unknown>> {
    switch (message.eventType) {
      case MessageType.STYLE_REQUEST:
        return await this.handleStyleRequest(message);
      default:
        throw new Error(`Unknown event type: ${message.eventType}`);
    }
  }

  private async handleStyleRequest(message: AgentMessage): Promise<Record<string, unknown>> {
    const { taskId, filePath, content } = message.payload as {
      taskId: string;
      filePath: string;
      content: string;
    };

    this.log("info", `[CSS] Processing style request for file: ${filePath}`);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        plan: {
          include: { project: true },
        },
      },
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const project = task.plan?.project;
    if (!project) {
      throw new Error(`Task plan has no project`);
    }

    const systemPrompt = `You are a CSS/Tailwind CSS expert. Your job is to review and improve CSS code.

TASK CONTEXT:
- Task: ${task.title}
- Description: ${task.description}
- Tech Stack: ${task.plan.techStack}

INSTRUCTIONS:
1. Review the provided CSS code
2. If using Tailwind, ensure classes are properly formatted and follow best practices
3. Suggest improvements for:
   - Responsiveness
   - Accessibility
   - Performance
   - Cross-browser compatibility
4. If the CSS looks good, confirm it meets requirements
5. If improvements are needed, provide the improved version

OUTPUT FORMAT (JSON):
{
  "status": "APPROVED" or "NEEDS_IMPROVEMENT",
  "reasoning": "Brief explanation of your decision",
  "improvedContent": "improved CSS code if needed, otherwise null",
  "suggestions": ["suggestion1", "suggestion2"]
}

Return ONLY valid JSON, no markdown or extra text.`;

    const userMessage = `Review and improve this CSS file:
File: ${filePath}

Current content:
${content}

Please provide your analysis and any improvements needed.`;

    const resolvedProvider = resolveProvider(project.aiProvider || undefined);
    const resolvedModel = project.aiModel || "gpt-4o-mini";

    this.log("info", `[CSS] Analyzing CSS with LLM...`);

    let aiResultText: string;
    try {
      if (resolvedProvider === "zai") {
        const { generateTextZai } = await import("@/lib/ai/zai");
        const raw = await generateTextZai({
          systemPrompt,
          userMessage,
          model: resolvedModel,
          temperature: 0.3,
          maxTokens: 2048,
        });
        if (raw == null || typeof raw !== "string") {
          throw new Error("AI returned invalid response");
        }
        aiResultText = raw;
      } else {
        const aiResult = await generateText({
          model: getModel(resolvedProvider, resolvedModel),
          system: systemPrompt,
          prompt: userMessage,
          temperature: 0.3,
          maxTokens: 2048,
        });
        if (aiResult == null) {
          throw new Error("AI returned null");
        }
        aiResultText = aiResult.text ?? "";
        try {
          await trackAIUsage(aiResult, {
            projectId: project.id,
            actionType: "css_review",
            model: resolvedModel,
            executionSessionId: this.config.sessionId,
          });
        } catch (trackErr) {
          this.log("error", `trackAIUsage failed: ${trackErr instanceof Error ? trackErr.message : String(trackErr)}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `CSS analysis failed: ${msg}`);
      throw new Error(`CSS analysis failed: ${msg}`);
    }

    let parsed: any;
    try {
      const cleaned = aiResultText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
      if (!cleaned) {
        throw new Error("AI returned invalid JSON");
      }
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      this.log("error", `Failed to parse CSS analysis: ${msg}`);
      throw new Error(`Failed to parse CSS analysis JSON: ${msg}`);
    }

    this.log("info", `[CSS] Review status: ${parsed.status}`);

    await prisma.comment.create({
      data: {
        taskId,
        content: `🎨 CSS Review (${filePath})\n\nStatus: ${parsed.status}\n\nReasoning:\n${parsed.reasoning}\n\n${parsed.suggestions ? "Suggestions:\n" + parsed.suggestions.join("\n") : ""}`,
        authorRole: "QA",
        isSystem: true,
      },
    });

    if (parsed.status === "NEEDS_IMPROVEMENT" && parsed.improvedContent) {
      await this.sendMessage(
        AgentRole.TASK_EXECUTOR,
        MessageType.STYLE_RESPONSE,
        {
          taskId,
          filePath,
          improvedContent: parsed.improvedContent,
          reasoning: parsed.reasoning,
        },
        message.replyToId ?? undefined
      );
    }

    return {
      status: parsed.status,
      reasoning: parsed.reasoning,
      improvedContent: parsed.improvedContent,
      suggestions: parsed.suggestions,
    };
  }
}
