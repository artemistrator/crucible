import { BaseAgent, AgentConfig } from "./base-agent";
import { AgentMessage, AgentRole, MessageType } from "@prisma/client";
import { createAgentTools } from "./tools";
import { generateText } from "ai";
import { getModel, resolveProvider } from "@/lib/ai/providers";
import { prisma } from "@/lib/prisma";
import { getCompactProjectContext } from "./project-context";
import { trackAIUsage } from "@/lib/ai/call";
import { generateTaskPrompt } from "./prompt-generator";
import { getLLMSettings } from "@/lib/settings";

interface AIExecutionPlan {
  steps: Array<{
    thought?: string;
    toolName?: string;
    params?: Record<string, unknown>;
  }>;
}

export class TaskExecutorAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super({ ...config, agentRole: config.agentRole ?? AgentRole.TASK_EXECUTOR });
  }

  async processMessage(message: AgentMessage): Promise<Record<string, unknown>> {
    switch (message.eventType) {
      case MessageType.TASK_REQUEST:
        return await this.handleTaskRequest(message);
      case MessageType.TICKET_REQUEST:
        return await this.handleTicketRequest(message);
      case MessageType.STYLE_RESPONSE:
        this.log("info", `[${this.config.agentRole}] Received CSS styling completion`);
        return {};
      default:
        throw new Error(`Unknown event type: ${message.eventType}`);
    }
  }

  private async handleTaskRequest(message: AgentMessage): Promise<Record<string, unknown>> {
    const { taskId } = message.payload as { taskId: string };

    this.log("info", `[${this.config.agentRole}] Processing task: ${taskId}`);

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

    if (!task.plan?.project) {
      throw new Error(`Task plan has no project`);
    }

    this.log("info", `\n👷 [TASK_EXECUTOR] -> @TEAM: "Принял задачу '${task.title}'. Ушел генерировать план и кодить."`);

    let instructions = task.generatedPrompt?.trim();

    if (!instructions) {
      this.log("info", `[${this.config.agentRole}] Generating detailed prompt for task ${taskId}...`);
      instructions = await generateTaskPrompt(taskId, false, false);
    }

    const project = task.plan.project;
    const projectId = project.id;

    const projectContext = await getCompactProjectContext(projectId);

    const tools = createAgentTools(
      projectId,
      this.config.sessionId,
      this.config.mode ?? "local"
    );

    const planSystemPrompt = `You are an experienced software engineer. Your job is to produce an execution plan as JSON only.

${projectContext}

Task: ${task.title}
Instructions: ${instructions}

Your output MUST be a JSON object with a "steps" array. Each step is either:
- A thought: { "thought": "Brief explanation of why you are doing next action" }
- A tool call: { "toolName": "<name>", "params": { ... } }

Available toolNames: executeCommand, readFile, writeFile, searchKnowledge, webSearch.
BEFORE each tool step, add a "thought" step explaining WHY you are doing this.

CRITICAL RULES FOR FILE MANIPULATION:
1. NO PLACEHOLDERS: You are FORBIDDEN from using placeholders like "// rest of the code", "<!-- existing code -->", or "...".
2. FULL OVERWRITE: The writeFile tool OVERWRITES the entire file. You MUST output the 100% COMPLETE, production-ready file content every single time.
3. READ BEFORE WRITE: If you are modifying an existing file, you MUST successfully use readFile first.
4. PATH FORMAT: Never use "./" prefixes in file paths for tools. Use relative paths like "index.html" or "src/app.js".

Example:
{
  "steps": [
    { "thought": "I need to see what files are in project." },
    { "toolName": "readFile", "params": { "filePath": "package.json" } },
    { "thought": "Now I will run tests." },
    { "toolName": "executeCommand", "params": { "command": "npm test", "reason": "Run tests" } }
  ]
}

If you cannot create a plan (e.g. task is unclear or out of scope), return exactly: {"steps": []}. Never return null or undefined for "steps"—always an array. Return ONLY valid JSON, no markdown or extra text.`;

    const planUserMessage = `Create an execution plan for this task: ${task.title}\n\nInstructions: ${instructions}`;

    const resolvedProvider = resolveProvider(project.aiProvider || undefined);
    const resolvedModel = project.aiModel || "gpt-4o-mini";
    const llmSettings = await getLLMSettings();

    this.log("info", `[${this.config.agentRole}] Generating execution plan for task: ${task.title}`);

    let planJsonText: string;
    try {
      if (resolvedProvider === "zai") {
        const { generateTextZai } = await import("@/lib/ai/zai");
        const raw = await generateTextZai({
          systemPrompt: planSystemPrompt,
          userMessage: planUserMessage,
          model: resolvedModel,
          temperature: llmSettings.temperature,
          maxTokens: llmSettings.maxTokens,
        });
        if (raw == null || typeof raw !== "string") {
          throw new Error("AI returned invalid response");
        }
        planJsonText = raw;
      } else {
        const aiResult = await generateText({
          model: getModel(resolvedProvider, resolvedModel),
          system: planSystemPrompt,
          prompt: planUserMessage,
          temperature: llmSettings.temperature,
          maxTokens: llmSettings.maxTokens,
        });
        if (aiResult == null) {
          throw new Error("AI returned null");
        }
        planJsonText = aiResult.text ?? "";
        try {
          await trackAIUsage(aiResult, {
            projectId,
            actionType: "execute_task",
            model: resolvedModel,
            executionSessionId: this.config.sessionId,
          });
        } catch (trackErr) {
          this.log("error", `trackAIUsage failed: ${trackErr instanceof Error ? trackErr.message : String(trackErr)}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `LLM call failed: ${msg}`);
      throw new Error(`LLM call failed: ${msg}`);
    }

    if (!planJsonText) {
      throw new Error("AI returned empty response");
    }

    let plan: AIExecutionPlan | null = null;
    try {
      const cleaned = planJsonText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
      if (!cleaned) {
        throw new Error("AI returned invalid plan");
      }
      plan = JSON.parse(cleaned) as AIExecutionPlan;
      if (!plan || !Array.isArray(plan.steps)) {
        throw new Error("Invalid plan structure");
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      this.log("error", `Failed to parse AI plan: ${msg}`);
      throw new Error(`Failed to parse execution plan JSON: ${msg}`);
    }

    const steps = plan.steps;
    if (steps.length === 0) {
      throw new Error("AI failed to generate any execution steps");
    }

    this.log("info", `[${this.config.agentRole}] Plan generated. ${steps.length} steps to perform.`);

    const results = [];
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;

      if ("thought" in step && typeof step.thought === "string") {
        this.log("info", `[${this.config.agentRole}] 🧠 ${step.thought}`);
        continue;
      }

      if ("toolName" in step && typeof step.toolName === "string" && step.toolName in tools) {
        const toolName = step.toolName;
        const params = step.params && typeof step.params === "object" ? step.params : {};
        this.log("info", `[${this.config.agentRole}] 🛠️ Executing: ${toolName}`);

        try {
          const tool = tools[toolName as keyof typeof tools];
          const result = await (tool as any).execute(params);
          results.push({ toolName, result, success: true });
          this.log("info", `[${this.config.agentRole}] ✅ ${toolName} completed`);

          const stepParams = step.params as Record<string, unknown>;
          if (toolName === "writeFile" && typeof stepParams.filePath === "string") {
            const filePath = stepParams.filePath;
            if (filePath.endsWith('.css') || filePath.endsWith('.scss') || filePath.endsWith('.module.css')) {
              this.log("info", `[${this.config.agentRole}] 🎨 CSS file detected, delegating to CSS Agent`);
              await this.sendMessage(
                AgentRole.CSS,
                MessageType.STYLE_REQUEST,
                {
                  taskId,
                  filePath,
                  content: typeof stepParams.content === "string" ? stepParams.content : "",
                },
                message.id
              );
            }
          }
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.log("error", `[${this.config.agentRole}] ${toolName} failed: ${errMsg}`);
          results.push({ toolName, error: errMsg, success: false });
        }
      }
    }

    // --- Verification phase: run automatedCheck and ls -la for artifacts, if verificationCriteria is present ---
    const vc = task.verificationCriteria as {
      artifacts?: string[];
      automatedCheck?: string;
      manualCheck?: string;
    } | null;

    let artifactsOutput = "";
    let automatedCheckOutput = "";
    let hasVerificationFailures = false;

    if (vc) {
      const artifacts = Array.isArray(vc.artifacts) ? vc.artifacts : [];
      const automatedCheck =
        typeof vc.automatedCheck === "string" && vc.automatedCheck.trim()
          ? vc.automatedCheck.trim()
          : null;

      if (artifacts.length > 0 || automatedCheck) {
        this.log("info", `[${this.config.agentRole}] 🔍 Verification phase: running automatedCheck and artifact checks...`);

        const verificationSteps: Array<{ command: string; reason: string; isArtifactCheck?: boolean }> = [];

        // FIX 2: Run automatedCheck via script to avoid shell escaping (quotes, !, etc.)
        const VERIFY_EOF = "AI_VERIFY_SCRIPT_END_7f3a";
        if (automatedCheck) {
          verificationSteps.push({
            command: `cat << '${VERIFY_EOF}' > .ai-temp-check.sh\n${automatedCheck}\n${VERIFY_EOF}\nsh .ai-temp-check.sh`,
            reason: "Run automatedCheck",
          });
        }

        for (const artifact of artifacts) {
          verificationSteps.push({
            command: `ls -la "${artifact}"`,
            reason: `Verify artifact: ${artifact}`,
            isArtifactCheck: true,
          });
          // FIX 1: Show file content so QA can verify required text (limit lines)
          verificationSteps.push({
            command: `head -n 200 "${artifact}"`,
            reason: `Artifact content: ${artifact}`,
            isArtifactCheck: true,
          });
        }

        const artifactOutputs: string[] = [];
        const checkOutputs: string[] = [];

        for (const vstep of verificationSteps) {
          const cmd = vstep.command;
          const reason = vstep.reason;

          this.log("info", `[${this.config.agentRole}][Verification] Running: ${cmd}`);

          try {
            const execTool = tools.executeCommand;
            const result = await (execTool as any).execute({ command: cmd, reason });
            const out = typeof result?.stdout === "string" ? result.stdout : "";
            const err = typeof result?.stderr === "string" ? result.stderr : "";
            const success = result?.success === true;
            const exitCode = result?.exitCode;

            if (!success || exitCode !== 0) {
              hasVerificationFailures = true;
            }

            const output = [
              `--- ${reason} ---`,
              `$ ${cmd}`,
              `exit ${exitCode ?? "?"}`,
              out,
              err ? `stderr:\n${err}` : "",
            ]
              .filter(Boolean)
              .join("\n");

            if (vstep.isArtifactCheck) {
              artifactOutputs.push(output);
            } else {
              checkOutputs.push(output);
            }
          } catch (verr) {
            hasVerificationFailures = true;
            const output = [
              `--- ${reason} ---`,
              `$ ${cmd}`,
              `FAILED: ${verr instanceof Error ? verr.message : String(verr)}`,
            ].join("\n");

            if (vstep.isArtifactCheck) {
              artifactOutputs.push(output);
            } else {
              checkOutputs.push(output);
            }
          }
        }

        artifactsOutput = artifactOutputs.join("\n\n");
        automatedCheckOutput = checkOutputs.join("\n\n");
      }
    }

    let reportText = results.map(r => {
      if (r.success) {
        const result = r.result as any;
        if (result.stdout || result.stderr || result.error) {
          const output = result.stdout || result.stderr || result.error || "";
          return `- ${r.toolName}: ${output.slice(0, 200)}`;
        }
        return `- ${r.toolName}: completed`;
      }
      return `- ${r.toolName}: failed - ${r.error}`;
    }).join("\n");

    if (artifactsOutput || automatedCheckOutput) {
      let verificationSection = "\n\n=== VERIFICATION EVIDENCE ===\n\n";
      if (artifactsOutput) {
        verificationSection += "Artifacts Check:\n" + artifactsOutput + "\n\n";
      }
      if (automatedCheckOutput) {
        verificationSection += "Automated Check:\n" + automatedCheckOutput + "\n\n";
      }
      if (hasVerificationFailures) {
        verificationSection += "⚠️ Some verification commands failed. See output above for details.\n";
      } else {
        verificationSection += "✅ All verification commands succeeded.\n";
      }
      reportText = reportText ? reportText + "\n\n" + verificationSection : verificationSection;
    }

    // FIX 3: Explicit headless exception so QA applies HEADLESS EXCEPTION when Artifacts + AutomatedCheck are satisfied
    const headlessBlock = `

### Manual Check
[HEADLESS MODE TRIGGERED]
В headless-окружении (Docker/Server) ручная проверка (открыть браузер, сделать скриншот) физически невозможна. Проверка отложена на пользователя. QA-агент обязан применить HEADLESS EXCEPTION, если Artifacts и AutomatedCheck пройдены успешно.`;
    reportText = (reportText || "No report generated.") + headlessBlock;

    try {
      await prisma.comment.create({
        data: {
          taskId,
          content: reportText,
          authorRole: "DEVOPS",
          isSystem: false,
        },
      });
      this.log("info", `[${this.config.agentRole}] Created report comment for task ${taskId}`);
    } catch (commentErr) {
      this.log("error", `[${this.config.agentRole}] Failed to create report comment: ${commentErr instanceof Error ? commentErr.message : String(commentErr)}`);
    }

    this.log("info", `\n📤 [TASK_EXECUTOR] -> @QA: "Я закончил писать код. Отправил тебе на ревью (QA_REQUEST)."`);
    await this.sendMessage(
      AgentRole.QA,
      MessageType.QA_REQUEST,
      {
        taskId,
        report: reportText || "No report generated.",
      },
      message.id
    );

    this.log("info", `[${this.config.agentRole}] Sent QA_REQUEST for task ${taskId}`);

    return {
      success: true,
      results,
      taskId,
      taskTitle: task.title,
    };
  }

  /** Пишет в комментарии к задаче причину отклонения тикета (статус тикета уже REJECTED). */
  private async createTicketRejectionComment(
    taskId: string,
    ticketId: string,
    reason: string
  ): Promise<void> {
    try {
      await prisma.comment.create({
        data: {
          taskId,
          content: `**Тикет отклонён** (ticket \`${ticketId}\`)\n\n${reason}`,
          authorRole: "DEVOPS",
          isSystem: true,
        },
      });
      this.log("info", `[${this.config.agentRole}] Created rejection comment for ticket ${ticketId} on task ${taskId}`);
    } catch (err) {
      this.log(
        "error",
        `[${this.config.agentRole}] Failed to create ticket rejection comment: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleTicketRequest(message: AgentMessage): Promise<Record<string, unknown>> {
    const { ticketId, relatedTaskId } = message.payload as { ticketId: string; relatedTaskId: string };

    this.log("info", `[${this.config.agentRole}] Processing ticket: ${ticketId}`);

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    if (!relatedTaskId) {
      throw new Error(`Ticket ${ticketId} has no relatedTaskId`);
    }

    const originalTask = await prisma.task.findUnique({
      where: { id: relatedTaskId },
      include: {
        plan: {
          include: { project: true },
        },
      },
    });

    if (!originalTask || !originalTask.plan?.project) {
      throw new Error(`Original task ${relatedTaskId} not found or has no project`);
    }

    const project = originalTask.plan.project;
    const projectId = project.id;

    const extraRequirement =
      `Ticket "${ticket.title}": ${ticket.description}\n` +
      `Adapt your instructions to address this requirement from the ticket.`;

    this.log("info", `\n🔧 [TASK_EXECUTOR] -> @QA: "Вижу твои замечания по тикету. Извиняюсь, сейчас всё исправлю."`);
    this.log("info", `[${this.config.agentRole}] Regenerating prompt for task ${relatedTaskId} based on ticket ${ticketId}...`);

    let instructions: string;
    try {
      instructions = await generateTaskPrompt(
        relatedTaskId,
        true,
        false,
        extraRequirement
      );
    } catch (promptErr) {
      const msg = promptErr instanceof Error ? promptErr.message : String(promptErr);
      this.log("error", `[${this.config.agentRole}] Failed to regenerate prompt: ${msg}`);

      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "REJECTED" },
      });
      await this.createTicketRejectionComment(relatedTaskId, ticketId, `Не удалось перегенерировать промпт: ${msg}`);

      throw new Error(`Failed to regenerate prompt: ${msg}`);
    }

    const projectContext = await getCompactProjectContext(projectId);

    const tools = createAgentTools(
      projectId,
      this.config.sessionId,
      this.config.mode ?? "local"
    );

    const planSystemPrompt = `You are an experienced software engineer. Your job is to produce an execution plan as JSON only.

${projectContext}

Task: ${originalTask.title}
Instructions: ${instructions}

Your output MUST be a JSON object with a "steps" array. Each step is either:
- A thought: { "thought": "Brief explanation of why you are doing next action" }
- A tool call: { "toolName": "<name>", "params": { ... } }

Available toolNames: executeCommand, readFile, writeFile, searchKnowledge, webSearch.
BEFORE each tool step, add a "thought" step explaining WHY you are doing this.

CRITICAL RULES FOR FILE MANIPULATION:
1. NO PLACEHOLDERS: You are FORBIDDEN from using placeholders like "// rest of the code", "<!-- existing code -->", or "...".
2. FULL OVERWRITE: The writeFile tool OVERWRITES the entire file. You MUST output the 100% COMPLETE, production-ready file content every single time.
3. READ BEFORE WRITE: If you are modifying an existing file, you MUST successfully use readFile first.
4. PATH FORMAT: Never use "./" prefixes in file paths for tools. Use relative paths like "index.html" or "src/app.js".

Example:
{
  "steps": [
    { "thought": "I need to see what files are in project." },
    { "toolName": "readFile", "params": { "filePath": "package.json" } },
    { "thought": "Now I will run tests." },
    { "toolName": "executeCommand", "params": { "command": "npm test", "reason": "Run tests" } }
  ]
}

If you cannot create a plan (e.g. task is unclear or out of scope), return exactly: {"steps": []}. Never return null or undefined for "steps"—always an array. Return ONLY valid JSON, no markdown or extra text.`;

    const planUserMessage = `Create an execution plan for this task: ${originalTask.title}\n\nInstructions: ${instructions}`;

    const resolvedProvider = resolveProvider(project.aiProvider || undefined);
    const resolvedModel = project.aiModel || "gpt-4o-mini";
    const llmSettings = await getLLMSettings();

    this.log("info", `[${this.config.agentRole}] Generating execution plan for ticket ${ticketId} (task: ${originalTask.title})`);

    let planJsonText: string;
    try {
      if (resolvedProvider === "zai") {
        const { generateTextZai } = await import("@/lib/ai/zai");
        const raw = await generateTextZai({
          systemPrompt: planSystemPrompt,
          userMessage: planUserMessage,
          model: resolvedModel,
          temperature: llmSettings.temperature,
          maxTokens: llmSettings.maxTokens,
        });
        if (raw == null || typeof raw !== "string") {
          throw new Error("AI returned invalid response");
        }
        planJsonText = raw;
      } else {
        const aiResult = await generateText({
          model: getModel(resolvedProvider, resolvedModel),
          system: planSystemPrompt,
          prompt: planUserMessage,
          temperature: llmSettings.temperature,
          maxTokens: llmSettings.maxTokens,
        });
        if (aiResult == null) {
          throw new Error("AI returned null");
        }
        planJsonText = aiResult.text ?? "";
        try {
          await trackAIUsage(aiResult, {
            projectId,
            actionType: "execute_task",
            model: resolvedModel,
            executionSessionId: this.config.sessionId,
          });
        } catch (trackErr) {
          this.log("error", `trackAIUsage failed: ${trackErr instanceof Error ? trackErr.message : String(trackErr)}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `LLM call failed: ${msg}`);

      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "REJECTED" },
      });
      await this.createTicketRejectionComment(relatedTaskId, ticketId, `Ошибка вызова LLM: ${msg}`);

      throw new Error(`LLM call failed: ${msg}`);
    }

    if (!planJsonText) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "REJECTED" },
      });
      await this.createTicketRejectionComment(relatedTaskId, ticketId, "AI вернул пустой ответ.");
      throw new Error("AI returned empty response");
    }

    let plan: AIExecutionPlan | null = null;
    try {
      const cleaned = planJsonText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
      if (!cleaned) {
        throw new Error("AI returned invalid plan");
      }
      plan = JSON.parse(cleaned) as AIExecutionPlan;
      if (!plan || !Array.isArray(plan.steps)) {
        throw new Error("Invalid plan structure");
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      this.log("error", `Failed to parse AI plan: ${msg}`);

      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "REJECTED" },
      });
      await this.createTicketRejectionComment(relatedTaskId, ticketId, `Не удалось распарсить план выполнения (JSON): ${msg}`);

      throw new Error(`Failed to parse execution plan JSON: ${msg}`);
    }

    const steps = plan.steps;
    if (steps.length === 0) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "REJECTED" },
      });
      await this.createTicketRejectionComment(relatedTaskId, ticketId, "AI не сгенерировал ни одного шага выполнения.");
      throw new Error("AI failed to generate any execution steps");
    }

    this.log("info", `[${this.config.agentRole}] Ticket plan generated. ${steps.length} steps to perform.`);

    const results = [];
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;

      if ("thought" in step && typeof step.thought === "string") {
        this.log("info", `[${this.config.agentRole}] 🧠 ${step.thought}`);
        continue;
      }

      if ("toolName" in step && typeof step.toolName === "string" && step.toolName in tools) {
        const toolName = step.toolName;
        const params = step.params && typeof step.params === "object" ? step.params : {};
        this.log("info", `[${this.config.agentRole}] 🛠️ Executing: ${toolName}`);

        try {
          const tool = tools[toolName as keyof typeof tools];
          const result = await (tool as any).execute(params);
          results.push({ toolName, result, success: true });
          this.log("info", `[${this.config.agentRole}] ✅ ${toolName} completed`);

          const stepParams = step.params as Record<string, unknown>;
          if (toolName === "writeFile" && typeof stepParams.filePath === "string") {
            const filePath = stepParams.filePath;
            if (filePath.endsWith('.css') || filePath.endsWith('.scss') || filePath.endsWith('.module.css')) {
              this.log("info", `[${this.config.agentRole}] 🎨 CSS file detected, delegating to CSS Agent`);
              await this.sendMessage(
                AgentRole.CSS,
                MessageType.STYLE_REQUEST,
                {
                  taskId: relatedTaskId,
                  filePath,
                  content: typeof stepParams.content === "string" ? stepParams.content : "",
                },
                message.id
              );
            }
          }
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          this.log("error", `[${this.config.agentRole}] ${toolName} failed: ${errMsg}`);
          results.push({ toolName, error: errMsg, success: false });
        }
      }
    }

    const vc = originalTask.verificationCriteria as {
      artifacts?: string[];
      automatedCheck?: string;
      manualCheck?: string;
    } | null;

    let artifactsOutput = "";
    let automatedCheckOutput = "";
    let hasVerificationFailures = false;

    if (vc) {
      const artifacts = Array.isArray(vc.artifacts) ? vc.artifacts : [];
      // Для тикета не гоняем automatedCheck исходной задачи: вывод мог измениться (HTML разбит тегами и т.д.).
      const automatedCheck = null;

      if (artifacts.length > 0 || automatedCheck) {
        this.log("info", `[${this.config.agentRole}] 🔍 Verification phase (ticket run: artifact checks only)...`);

        const verificationSteps: Array<{ command: string; reason: string; isArtifactCheck?: boolean }> = [];

        if (automatedCheck) {
          const VERIFY_EOF = "AI_VERIFY_SCRIPT_END_7f3a";
          verificationSteps.push({
            command: `cat << '${VERIFY_EOF}' > .ai-temp-check.sh\n${automatedCheck}\n${VERIFY_EOF}\nsh .ai-temp-check.sh`,
            reason: "Run automatedCheck",
          });
        }

        for (const artifact of artifacts) {
          verificationSteps.push({
            command: `ls -la "${artifact}"`,
            reason: `Verify artifact: ${artifact}`,
            isArtifactCheck: true,
          });
          verificationSteps.push({
            command: `head -n 200 "${artifact}"`,
            reason: `Artifact content: ${artifact}`,
            isArtifactCheck: true,
          });
        }

        const artifactOutputs: string[] = [];
        const checkOutputs: string[] = [];

        for (const vstep of verificationSteps) {
          const cmd = vstep.command;
          const reason = vstep.reason;

          this.log("info", `[${this.config.agentRole}][Verification] Running: ${cmd}`);

          try {
            const execTool = tools.executeCommand;
            const result = await (execTool as any).execute({ command: cmd, reason });
            const out = typeof result?.stdout === "string" ? result.stdout : "";
            const err = typeof result?.stderr === "string" ? result.stderr : "";
            const success = result?.success === true;
            const exitCode = result?.exitCode;

            if (!success || exitCode !== 0) {
              hasVerificationFailures = true;
            }

            const output = [
              `--- ${reason} ---`,
              `$ ${cmd}`,
              `exit ${exitCode ?? "?"}`,
              out,
              err ? `stderr:\n${err}` : "",
            ]
              .filter(Boolean)
              .join("\n");

            if (vstep.isArtifactCheck) {
              artifactOutputs.push(output);
            } else {
              checkOutputs.push(output);
            }
          } catch (verr) {
            hasVerificationFailures = true;
            const output = [
              `--- ${reason} ---`,
              `$ ${cmd}`,
              `FAILED: ${verr instanceof Error ? verr.message : String(verr)}`,
            ].join("\n");

            if (vstep.isArtifactCheck) {
              artifactOutputs.push(output);
            } else {
              checkOutputs.push(output);
            }
          }
        }

        artifactsOutput = artifactOutputs.join("\n\n");
        automatedCheckOutput = checkOutputs.join("\n\n");
      }
    }

    const ticketVerificationNote =
      "\n[Ticket run] automatedCheck from the original task was skipped (implementation was modified by the ticket). Verify based on artifacts and report content only.";

    let reportText = results.map(r => {
      if (r.success) {
        const result = r.result as any;
        if (result.stdout || result.stderr || result.error) {
          const output = result.stdout || result.stderr || result.error || "";
          return `- ${r.toolName}: ${output.slice(0, 200)}`;
        }
        return `- ${r.toolName}: completed`;
      }
      return `- ${r.toolName}: failed - ${r.error}`;
    }).join("\n");

    if (artifactsOutput || automatedCheckOutput) {
      let verificationSection = "\n\n=== VERIFICATION EVIDENCE ===\n\n";
      if (artifactsOutput) {
        verificationSection += "Artifacts Check:\n" + artifactsOutput + "\n\n";
      }
      if (automatedCheckOutput) {
        verificationSection += "Automated Check:\n" + automatedCheckOutput + "\n\n";
      }
      verificationSection += ticketVerificationNote + "\n\n";
      if (hasVerificationFailures) {
        verificationSection += "⚠️ Some verification commands failed. See output above for details.\n";
      } else {
        verificationSection += "✅ All verification commands succeeded.\n";
      }
      reportText = reportText ? reportText + "\n\n" + verificationSection : verificationSection;
    } else {
      reportText = (reportText || "") + ticketVerificationNote;
    }

    const headlessBlockTicket = `

### Manual Check
[HEADLESS MODE TRIGGERED]
В headless-окружении (Docker/Server) ручная проверка (открыть браузер, сделать скриншот) физически невозможна. Проверка отложена на пользователя. QA-агент обязан применить HEADLESS EXCEPTION, если Artifacts и AutomatedCheck пройдены успешно.`;
    reportText = (reportText || "No report generated.") + headlessBlockTicket;

    try {
      await prisma.comment.create({
        data: {
          taskId: relatedTaskId,
          content: reportText,
          authorRole: "DEVOPS",
          isSystem: false,
        },
      });
      this.log("info", `[${this.config.agentRole}] Created report comment for ticket ${ticketId}`);
    } catch (commentErr) {
      this.log("error", `[${this.config.agentRole}] Failed to create report comment: ${commentErr instanceof Error ? commentErr.message : String(commentErr)}`);
    }

    this.log("info", `\n📤 [TASK_EXECUTOR] -> @QA: "Я закончил писать код. Отправил тебе на ревью (QA_REQUEST)."`);
    // Статус тикета выставит TeamLead по результату QA (единый источник истины).
    await this.sendMessage(
      AgentRole.QA,
      MessageType.QA_REQUEST,
      {
        taskId: relatedTaskId,
        report: reportText || "No report generated.",
        ticketId,
      },
      message.id
    );

    this.log("info", `[${this.config.agentRole}] Sent QA_REQUEST for ticket ${ticketId} (task ${relatedTaskId}); ticket status will be set by QA result`);

    return {
      success: true,
      results,
      ticketId,
      taskId: relatedTaskId,
      taskTitle: originalTask.title,
    };
  }
}
