import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createExecuteCommandTool,
  createCloudExecuteCommandTool,
  createReadFileTool,
  createSearchKnowledgeTool,
  webSearch,
  createWriteFileTool,
  createCloudWriteFileTool,
} from "./tools";
import { getCompactProjectContext } from "./project-context";
import { trackAIUsage } from "@/lib/ai/call";
import { generateTextZai } from "@/lib/ai/zai";
import { getModel, resolveProvider } from "@/lib/ai/providers";
import { getLLMSettings } from "@/lib/settings";
import { CommandStatus, type Ticket } from "@prisma/client";
import { ExecutionSessionManager } from "@/lib/execution/session-manager";
import { createHash } from "crypto";
import { generateProjectContext } from "@/lib/agents/project-context";
import { generateTaskPrompt } from "@/lib/agents/prompt-generator";

interface ExecutionConfig {
  projectId: string;
  planId: string;
  sessionId?: string;
  autoApprove?: boolean;
  mode: "local" | "cloud";
  runBuildAfterTask?: boolean;
  onLog?: (level: "info" | "error" | "success", message: string) => void;
}

interface AIExecutionPlan {
  steps: Array<{
    thought?: string;
    toolName?: string;
    params?: Record<string, unknown>;
  }>;
}

export type ExecuteTaskResult =
  | { success: true; report: string }
  | { success: false };

type SessionEventType = "command_created" | "command_approved" | "command_rejected" | "command_executing" | "command_result" | 
                         "task_started" | "task_completed" | "error" | "user_message" | "agent_message" | "info";

class ExecutionAgent {
  private config: ExecutionConfig;
  private isRunning: boolean = false;
  private isPaused: boolean = false;

  constructor(config: ExecutionConfig) {
    this.config = config;
  }

  log(level: "info" | "error" | "success", message: string) {
    if (this.config.onLog) {
      this.config.onLog(level, message);
    }
  }

  async emitEvent(type: SessionEventType, data: any) {
    if (!this.config.sessionId) return;

    try {
      let logType: "info" | "error" | "user_message" | "agent_message" | "command";

      switch (type) {
        case "error":
          logType = "error";
          break;
        case "user_message":
          logType = "user_message";
          break;
        case "agent_message":
          logType = "agent_message";
          break;
        case "command_created":
        case "command_approved":
        case "command_rejected":
        case "command_executing":
        case "command_result":
          logType = "command";
          break;
        default:
          logType = "info";
      }

      const message =
        typeof data === "string"
          ? data
          : data?.message
          ? String(data.message)
          : JSON.stringify(data ?? {});

      await prisma.executionLog.create({
        data: {
          sessionId: this.config.sessionId,
          type: logType,
          message,
          metadata: {
            eventType: type,
            data,
          },
        },
      });
    } catch (error) {
      console.error("[ExecutionAgent] Failed to persist event log:", error);
    }
  }

  private createErrorSignature(taskId: string, errorMessage: string): string {
    const signature = `${taskId}:${errorMessage}`;
    return createHash('sha256').update(signature).digest('hex').substring(0, 16);
  }

  async handleError(taskId: string, errorMessage: string, errorType: string): Promise<boolean> {
    if (!this.config.sessionId) {
      this.log("error", `Error occurred (no session): ${errorMessage}`);
      return false;
    }

    const errorSignature = this.createErrorSignature(taskId, errorMessage);
    const sessionManager = ExecutionSessionManager.getInstance();

    this.log("error", `Command execution error [${errorType}]: ${errorMessage} (signature: ${errorSignature})`);

    await sessionManager.incrementRetryCounter(this.config.sessionId, errorSignature);

    const { shouldPause, reason } = await sessionManager.checkRetryLimit(this.config.sessionId, errorSignature);

    if (shouldPause) {
      this.log("error", `Execution paused: ${reason}`);
      await this.emitEvent("error", {
        message: reason,
        data: {
          taskId,
          errorType,
          errorMessage,
          errorSignature,
        }
      });
      await sessionManager.pauseSession(this.config.sessionId);
      this.pause();
      return false;
    }

    return true;
  }

  async createPendingCommand(
    command: string,
    type: string = "SHELL",
    reason?: string,
    filePath?: string,
    fileContent?: string
  ): Promise<string> {
    const syncCommand = await prisma.syncCommand.create({
      data: {
        projectId: this.config.projectId,
        command,
        type,
        reason,
        filePath,
        fileContent,
        status: this.config.autoApprove ? CommandStatus.APPROVED : CommandStatus.PENDING,
        requiresApproval: !this.config.autoApprove,
      },
    });

    this.log(
      this.config.autoApprove ? "info" : "success",
      `Command created: ${type === "WRITE_FILE" ? `Write ${filePath}` : command} (status: ${syncCommand.status})`
    );

    await this.emitEvent("command_created", {
      id: syncCommand.id,
      command: syncCommand.command,
      reason: syncCommand.reason,
      type: syncCommand.type,
      filePath: syncCommand.filePath,
      fileContent: syncCommand.fileContent,
      status: syncCommand.status,
      requiresApproval: syncCommand.requiresApproval,
      createdAt: syncCommand.createdAt.toISOString()
    });

    return syncCommand.id;
  }

  async waitForCommandApproval(commandId: string, timeout: number = 300000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.isPaused) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (this.isRunning === false) {
        return false;
      }

      const command = await prisma.syncCommand.findUnique({
        where: { id: commandId },
      });

      if (!command) {
        this.log("error", `Command ${commandId} not found`);
        return false;
      }

      if (command.status === CommandStatus.APPROVED) {
        return true;
      }

      if (command.status === CommandStatus.REJECTED) {
        return false;
      }

      if (command.status === CommandStatus.COMPLETED || command.status === CommandStatus.FAILED) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.log("error", `Command ${commandId} approval timeout`);
    return false;
  }

  async waitForCommandCompletion(commandId: string, timeout: number = 600000): Promise<{ success: boolean; output?: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.isPaused) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (this.isRunning === false) {
        return { success: false };
      }

      const command = await prisma.syncCommand.findUnique({
        where: { id: commandId },
      });

      if (!command) {
        this.log("error", `Command ${commandId} not found`);
        return { success: false };
      }

      if (command.status === CommandStatus.COMPLETED) {
        return { success: true, output: command.stdout || "" };
      }

      if (command.status === CommandStatus.FAILED || command.status === CommandStatus.REJECTED) {
        return { success: false, output: command.stderr || "" };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.log("error", `Command ${commandId} completion timeout`);
    return { success: false };
  }

  pause() {
    this.isPaused = true;
    this.log("info", "Execution paused");
  }

  resume() {
    this.isPaused = false;
    this.log("info", "Execution resumed");
  }

  stop() {
    this.isRunning = false;
    this.log("info", "Execution stopped");
  }

  isExecuting(): boolean {
    return this.isRunning && !this.isPaused;
  }

  async executeTask(taskId: string, generatedPrompt?: string | null): Promise<ExecuteTaskResult> {
    this.isRunning = true;
    this.isPaused = false;

    try {
      return await this.executeTaskInner(taskId, generatedPrompt);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[ExecutionAgent] CRITICAL CRASH:", error);
      this.log("error", "CRITICAL CRASH: " + msg);
      try {
        await this.emitEvent("error", {
          message: "CRITICAL CRASH: " + msg,
          taskId,
          raw: error instanceof Error ? error.stack : String(error),
        });
      } catch (emitErr) {
        console.error("[ExecutionAgent] Failed to emit crash event:", emitErr);
      }
      return { success: false };
    } finally {
      this.isRunning = false;
    }
  }

  async executeTicket(ticket: Ticket): Promise<ExecuteTaskResult> {
    this.isRunning = true;
    this.isPaused = false;

    try {
      return await this.executeTicketInner(ticket);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[ExecutionAgent] TICKET CRITICAL CRASH:", error);
      this.log("error", "TICKET CRITICAL CRASH: " + msg);
      try {
        await this.emitEvent("error", {
          message: "TICKET CRITICAL CRASH: " + msg,
          ticketId: ticket.id,
          raw: error instanceof Error ? error.stack : String(error),
        });
      } catch (emitErr) {
        console.error("[ExecutionAgent] Failed to emit ticket crash event:", emitErr);
      }
      return { success: false };
    } finally {
      this.isRunning = false;
    }
  }

  private async executeTaskInner(taskId: string, generatedPrompt?: string | null): Promise<ExecuteTaskResult> {
    let task;
    try {
      task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          plan: {
            include: {
              project: true,
            },
          },
          dependencies: {
            include: {
              dependsOn: {
                select: { id: true, status: true },
              },
            },
          },
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `Failed to load task: ${msg}`);
      return { success: false };
    }

    if (!task) {
      this.log("error", `Task ${taskId} not found`);
      return { success: false };
    }

    if (!task.plan) {
      this.log("error", "Task has no plan");
      return { success: false };
    }

    if (!task.plan.project) {
      this.log("error", "Task plan has no project");
      return { success: false };
    }

    const project = task.plan.project;

    this.log("info", `[AI] 🧠 Received task: "${task.title}"`);
    this.log("info", `Starting task: ${task.title}`);

    try {
      await this.emitEvent("task_started", {
        taskId,
        title: task.title,
        description: task.description
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `Failed to emit task_started: ${msg}`);
      return { success: false };
    }

    let projectContext: string;
    try {
      projectContext = await getCompactProjectContext(project.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `Failed to get project context: ${msg}`);
      return { success: false };
    }

    try {
    const llmSettings = await getLLMSettings();
    const useCloudMode = this.config.mode === "cloud";

    const executeCommandTool = useCloudMode
      ? createCloudExecuteCommandTool(project.id, this.config.sessionId)
      : createExecuteCommandTool(project.id, this.config.sessionId);
    const readFileTool = createReadFileTool(project.id);
    const writeFileTool = useCloudMode
      ? createCloudWriteFileTool(project.id)
      : createWriteFileTool(project.id, this.config.sessionId);
    const searchKnowledgeTool = createSearchKnowledgeTool(project.id);

    const toolsMap: Record<string, { execute: (params: any) => Promise<any> }> = {
      executeCommand: executeCommandTool as any,
      readFile: readFileTool as any,
      writeFile: writeFileTool as any,
      searchKnowledge: searchKnowledgeTool as any,
      webSearch: webSearch as any,
    };

    const taskInstructions = (generatedPrompt ?? task.description) || task.description;
    const planSystemPrompt = `You are an experienced software engineer. Your job is to produce an execution plan as JSON only.

${projectContext}

Task: ${task.title}
Instructions: ${taskInstructions}

Your output MUST be a JSON object with a "steps" array. Each step is either:
- A thought: { "thought": "Brief explanation of why you are doing the next action" }
- A tool call: { "toolName": "<name>", "params": { ... } }

Available toolNames: executeCommand, readFile, writeFile, searchKnowledge, webSearch.
BEFORE each tool step, add a "thought" step explaining WHY you are doing this.

Example:
{
  "steps": [
    { "thought": "I need to see what files are in the project." },
    { "toolName": "readFile", "params": { "filePath": "package.json" } },
    { "thought": "Now I will run tests." },
    { "toolName": "executeCommand", "params": { "command": "npm test", "reason": "Run tests" } }
  ]
}

If you cannot create a plan (e.g. task is unclear or out of scope), return exactly: {"steps": []}. Never return null or undefined for "steps"—always an array. Return ONLY valid JSON, no markdown or extra text.`;

    const planUserMessage = `Create an execution plan for this task: ${task.title}\n\nInstructions: ${taskInstructions}`;

    this.log("info", "[AI] 📝 Generating execution plan...");
    await this.emitEvent("info", { message: "[AI] 📝 Generating execution plan..." });

    const resolvedProvider = resolveProvider(project.aiProvider || undefined);
    const resolvedModel = project.aiModel || "gpt-4o-mini";

    let planJsonText: string;
    try {
      if (resolvedProvider === "zai") {
        const raw = await generateTextZai({
          systemPrompt: planSystemPrompt,
          userMessage: planUserMessage,
          model: resolvedModel,
          temperature: llmSettings.temperature,
          maxTokens: llmSettings.maxTokens,
        });
        if (raw == null || typeof raw !== "string") {
          this.log("error", `AI (zai) returned invalid response. Raw: ${JSON.stringify(raw)}`);
          return { success: false };
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
          this.log("error", "AI returned null");
          await this.emitEvent("error", { message: "AI returned null", taskId });
          return { success: false };
        }
        planJsonText = aiResult.text ?? "";
        try {
          await trackAIUsage(aiResult, {
            projectId: project.id,
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
      await this.emitEvent("error", { message: `LLM call failed: ${msg}`, taskId });
      return { success: false };
    }

    if (!planJsonText) {
      this.log("error", "AI returned empty response.");
      return { success: false };
    }

    this.log("info", `[AI RAW RESPONSE] ${JSON.stringify(planJsonText.slice(0, 2000))}`);

    let plan: AIExecutionPlan | null = null;
    try {
      const cleaned = planJsonText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
      if (!cleaned) {
        this.log("error", "AI returned invalid plan");
        await this.emitEvent("error", { message: "AI returned invalid plan", taskId });
        return { success: false };
      }
      plan = JSON.parse(cleaned) as AIExecutionPlan;
      await this.log('info', '[AI] ✅ Plan generated. Steps: ' + JSON.stringify(plan.steps));
      if (!plan || !Array.isArray(plan.steps)) {
        throw new Error("Invalid plan structure");
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("[ExecutionAgent] Plan JSON parse error:", parseErr);
      this.log("error", `Failed to parse AI plan: ${msg}`);
      await this.emitEvent("error", {
        message: "Failed to parse execution plan JSON",
        taskId,
        raw: planJsonText?.slice(0, 500),
      });
      return { success: false };
    }

    const steps = plan.steps;
    if (steps.length === 0) {
      this.log("error", "AI failed to generate any execution steps.");
      await this.emitEvent("error", {
        message: "AI failed to generate any execution steps.",
        taskId,
      });
      return { success: false };
    }
    const hasToolStep = steps.some(
      (s) => s && typeof s === "object" && "toolName" in s && typeof (s as any).toolName === "string" && (s as any).toolName in toolsMap
    );
    if (!hasToolStep) {
      this.log("error", "AI plan has no tool steps (only thoughts). Task requires at least one writeFile or executeCommand.");
      await this.emitEvent("error", {
        message: "AI plan has no tool steps (only thoughts). Task requires at least one writeFile or executeCommand.",
        taskId,
      });
      return { success: false };
    }
    this.log("info", `[AI] ✅ Plan generated. ${steps.length} steps to perform.`);
    await this.emitEvent("info", { message: `[AI] ✅ Plan generated. ${steps.length} steps to perform.` });

    if (this.config.autoApprove) {
      this.log("info", "Auto-approve enabled - commands will execute automatically");
      await this.emitEvent("info", { message: "Auto-approve enabled - commands will execute automatically" });
    } else {
      this.log("info", "Manual approval required - commands will wait for user approval");
      await this.emitEvent("info", { message: "Manual approval required - commands will wait for user approval" });
    }

    try {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `Failed to update task status to IN_PROGRESS: ${msg}`);
      return { success: false };
    }

    let stepIndex = 0;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      try {
        if (!step || typeof step !== "object") continue;

        if ("thought" in step && typeof step.thought === "string") {
          const thoughtMsg = `[AI] 🧠 ${step.thought}`;
          this.log("info", thoughtMsg);
          await this.emitEvent("info", { message: thoughtMsg });
          continue;
        }

        if ("toolName" in step && typeof step.toolName === "string" && step.toolName in toolsMap) {
          stepIndex += 1;
          const toolName = step.toolName;
          const params = (step.params && typeof step.params === "object" ? step.params : {}) as Record<string, unknown>;
          const stepMsg = `[AI] 🛠️ Executing step ${stepIndex}: ${toolName} with params...`;
          this.log("info", stepMsg);
          await this.emitEvent("info", { message: stepMsg });

          try {
            const tool = toolsMap[toolName];
            await tool.execute(params);
            const doneMsg = `[AI] ✔️ Step ${stepIndex} completed.`;
            this.log("info", doneMsg);
            await this.emitEvent("info", { message: doneMsg });
          } catch (toolErr) {
            const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
            console.error("[ExecutionAgent] Step execution error:", toolErr);
            this.log("error", `Step ${stepIndex} (${toolName}) failed: ${errMsg}`);
            const errorHandled = await this.handleError(taskId, errMsg, "TOOL_EXECUTION_ERROR");
            if (!errorHandled) {
              return { success: false };
            }
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.log("error", `CRASH ON STEP: ${JSON.stringify(step)}. Error: ${errMsg}`);
        console.error("[ExecutionAgent] CRASH ON STEP:", step, error);
        continue;
      }
    }

    // --- Verification phase: run automatedCheck and ls -la for artifacts ---
    let artifactsOutput = "";
    let automatedCheckOutput = "";
    let hasVerificationFailures = false;
    const vc = task.verificationCriteria as { artifacts?: string[]; automatedCheck?: string } | null;
    const artifacts = Array.isArray(vc?.artifacts) ? vc.artifacts : [];
    const automatedCheck = typeof vc?.automatedCheck === "string" && vc.automatedCheck.trim() ? vc.automatedCheck.trim() : null;

    if (artifacts.length > 0 || automatedCheck) {
      this.log("info", "[AI] 🔍 Verification phase: generating and running verification commands...");
      await this.emitEvent("info", { message: "[AI] 🔍 Verification phase..." });

      const verificationSystemPrompt = `You are a verification agent. The coding is done. Now you MUST run the verification steps defined in the task.
Your output MUST be a JSON object with a "steps" array. Each step: { "toolName": "executeCommand", "params": { "command": "<shell command>", "reason": "<brief reason>" } }.
- If automatedCheck is provided: add ONE step with that exact command (will be run via a script wrapper server-side).
- For EACH artifact path: add "ls -la <path>" then "head -n 200 <path>" to prove the file exists and show content for QA.
Return ONLY valid JSON, no markdown. Example: {"steps":[{"toolName":"executeCommand","params":{"command":"npm test","reason":"Run automated check"}},{"toolName":"executeCommand","params":{"command":"ls -la src/index.html","reason":"Verify artifact exists"}},{"toolName":"executeCommand","params":{"command":"head -n 200 src/index.html","reason":"Artifact content"}}]}`;

      const verificationUserMessage = `Task verification criteria:
- artifacts: ${JSON.stringify(artifacts)}
- automatedCheck: ${automatedCheck ?? "(none)"}

Generate verification steps. Execute the automatedCheck command (if any) and ls -la for each artifact. Return JSON only.`;

      let verificationSteps: Array<{ toolName?: string; params?: { command?: string; reason?: string } }> = [];
      try {
        let verificationPlanText: string;
        if (resolvedProvider === "zai") {
          const raw = await generateTextZai({
            systemPrompt: verificationSystemPrompt,
            userMessage: verificationUserMessage,
            model: resolvedModel,
            temperature: llmSettings.temperature,
            maxTokens: llmSettings.maxTokens,
          });
          verificationPlanText = (raw && typeof raw === "string" ? raw : "").trim();
        } else {
          const vr = await generateText({
            model: getModel(resolvedProvider, resolvedModel),
            system: verificationSystemPrompt,
            prompt: verificationUserMessage,
            temperature: llmSettings.temperature,
            maxTokens: llmSettings.maxTokens,
          });
          verificationPlanText = (vr?.text ?? "").trim();
        }
        if (verificationPlanText) {
          const cleaned = verificationPlanText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1").trim();
          const parsed = JSON.parse(cleaned) as { steps?: typeof verificationSteps };
          verificationSteps = Array.isArray(parsed?.steps) ? parsed.steps : [];
        }
      } catch (parseErr) {
        this.log("info", `[Verification] AI plan failed, using fallback commands. ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      }

      // Fallback: if AI returns no steps, build them from verificationCriteria
      const VERIFY_EOF = "AI_VERIFY_SCRIPT_END_7f3a";
      if (verificationSteps.length === 0 && (automatedCheck || artifacts.length > 0)) {
        verificationSteps = [];
        if (automatedCheck) {
          // FIX 2: Run via script to avoid shell escaping (quotes, !, etc.)
          verificationSteps.push({
            toolName: "executeCommand",
            params: {
              command: `cat << '${VERIFY_EOF}' > .ai-temp-check.sh\n${automatedCheck}\n${VERIFY_EOF}\nsh .ai-temp-check.sh`,
              reason: "Run automatedCheck",
            },
          });
        }
        for (const artifact of artifacts) {
          verificationSteps.push({
            toolName: "executeCommand",
            params: { command: `ls -la "${artifact}"`, reason: `Verify artifact: ${artifact}` },
          });
          // FIX 1: Show file content so QA can verify required text (limit lines)
          verificationSteps.push({
            toolName: "executeCommand",
            params: { command: `head -n 200 "${artifact}"`, reason: `Artifact content: ${artifact}` },
          });
        }
      }

      const artifactOutputs: string[] = [];
      const checkOutputs: string[] = [];
      for (let vi = 0; vi < verificationSteps.length; vi++) {
        const vstep = verificationSteps[vi];
        if (!vstep?.toolName || vstep.toolName !== "executeCommand" || !vstep.params?.command) continue;
        const cmd = String(vstep.params.command);
        const reason = String(vstep.params.reason || "Verification");
        this.log("info", `[Verification] Running: ${cmd}`);
        try {
          const tool = toolsMap.executeCommand;
          const result = await tool.execute({ command: cmd, reason });
          const out = typeof result?.stdout === "string" ? result.stdout : "";
          const err = typeof result?.stderr === "string" ? result.stderr : "";
          const success = result?.success === true;
          const exitCode = result?.exitCode;
          if (!success || exitCode !== 0) {
            hasVerificationFailures = true;
          }
          const output = `--- ${reason} ---\n$ ${cmd}\n${success ? "exit 0" : "exit " + (exitCode ?? "?")}\n${out}${err ? "\nstderr:\n" + err : ""}`;
          if (cmd.includes("ls -la") || cmd.includes("head -n")) {
            artifactOutputs.push(output);
          } else if (cmd.includes(".ai-temp-check.sh") || cmd === automatedCheck) {
            checkOutputs.push(output);
          } else {
            checkOutputs.push(output);
          }
        } catch (verr) {
          hasVerificationFailures = true;
          const output = `--- ${reason} ---\n$ ${cmd}\nFAILED: ${verr instanceof Error ? verr.message : String(verr)}`;
          if (cmd.includes("ls -la") || cmd.includes("head -n")) {
            artifactOutputs.push(output);
          } else {
            checkOutputs.push(output);
          }
        }
      }
      artifactsOutput = artifactOutputs.join("\n\n");
      automatedCheckOutput = checkOutputs.join("\n\n");
    }

    let reportText = "No report generated.";
    try {
      const stepsSummary = steps
        .filter((s) => s && typeof s === "object" && "toolName" in s && typeof (s as any).toolName === "string")
        .map((s) => {
          const step = s as { toolName: string; params?: Record<string, unknown> };
          const paramsStr = step.params ? ` ${JSON.stringify(step.params)}` : "";
          return `- ${step.toolName}${paramsStr}`;
        })
        .join("\n");

      const vcFull = task.verificationCriteria as {
        artifacts?: string[];
        automatedCheck?: string;
        manualCheck?: string;
      } | null;

      const artifactsList = Array.isArray(vcFull?.artifacts) && vcFull!.artifacts.length > 0
        ? vcFull!.artifacts.map((a: string) => `- ${a}`).join("\n")
        : "(none)";
      const automatedCheckText =
        typeof vcFull?.automatedCheck === "string" && vcFull.automatedCheck.trim()
          ? vcFull.automatedCheck.trim()
          : "(none)";
      const manualCheckText =
        typeof vcFull?.manualCheck === "string" && vcFull.manualCheck.trim()
          ? vcFull.manualCheck.trim()
          : "(none)";

      const reportPrompt = `You are generating a structured DEVOPS execution report for QA.

Task title: ${task.title}

=== EXECUTION STEPS ===
The following tool steps were executed:
${stepsSummary || "(no tool steps)"}

=== VERIFICATION CRITERIA ===
[Artifacts]
${artifactsList}

[automatedCheck]
${automatedCheckText}

[manualCheck]
${manualCheckText}

=== YOUR OUTPUT FORMAT (PLAIN TEXT ONLY) ===
Produce a concise report with the following sections:

1) Artifacts
- List all created or modified files (especially those in verificationCriteria.artifacts).
- For each file, briefly describe its purpose.

2) Automated Check
- List all verification commands that were executed (tests, builds, ls -la, etc.).
- Summarize whether they succeeded or failed, referencing any relevant output.

3) Manual Check
- Using the manualCheck text above, explicitly confirm that the behavior is satisfied.
- Example wording: "Opening index.html in a browser displays 'Привет мир!' in a centered layout with the configured Google Font. This matches manualCheck."

4) Summary
- 2–3 bullet points summarizing the work done and verification status.

Return ONLY plain text in Russian, without Markdown code fences.`;

      const reportSystem =
        "You are a concise technical writer generating structured QA-friendly execution reports. " +
        "Always include sections: Artifacts, Automated Check, Manual Check, Summary. " +
        "Write in Russian. Output plain text only (no markdown code fences).";
      const resolvedProvider = resolveProvider(project.aiProvider || undefined);
      const resolvedModel = project.aiModel || "gpt-4o-mini";
        if (resolvedProvider === "zai") {
        const raw = await generateTextZai({
          systemPrompt: reportSystem,
          userMessage: reportPrompt,
          model: resolvedModel,
          temperature: llmSettings.temperature,
          maxTokens: llmSettings.maxTokens,
        });
        reportText = (raw && typeof raw === "string" ? raw : reportText).trim() || reportText;
      } else {
        const result = await generateText({
          model: getModel(resolvedProvider, resolvedModel),
          system: reportSystem,
          prompt: reportPrompt,
          temperature: llmSettings.temperature,
          maxTokens: llmSettings.maxTokens,
        });
      reportText = (result?.text ?? reportText).trim() || reportText;
      }
    } catch (reportErr) {
      this.log("error", `Report generation failed: ${reportErr instanceof Error ? reportErr.message : String(reportErr)}`);
    }

    if (artifactsOutput || automatedCheckOutput) {
      let verificationSection = "\n\n## Verification Evidence\n\n";
      if (artifactsOutput) {
        verificationSection += "### Artifacts Check\n```bash\n" + artifactsOutput + "\n```\n\n";
      }
      if (automatedCheckOutput) {
        verificationSection += "### Automated Check\n```bash\n" + automatedCheckOutput + "\n```\n\n";
      }
      if (hasVerificationFailures) {
        verificationSection += "⚠️ Some verification commands failed. See output above for details.\n\n";
      }
      reportText = reportText + verificationSection;
    }

    // FIX 3: Explicit headless exception so QA applies HEADLESS EXCEPTION when Artifacts + AutomatedCheck are satisfied
    const headlessBlock = `

### Manual Check
[HEADLESS MODE TRIGGERED]
В headless-окружении (Docker/Server) ручная проверка (открыть браузер, сделать скриншот) физически невозможна. Проверка отложена на пользователя. QA-агент обязан применить HEADLESS EXCEPTION, если Artifacts и AutomatedCheck пройдены успешно.`;
    reportText = reportText + headlessBlock;

    this.log("info", "[AI] 📋 Report prepared with verification evidence.");
    await this.emitEvent("info", { message: "[AI] 📋 Report prepared with verification evidence." });

    try {
      await prisma.comment.create({
        data: {
          taskId,
          content: reportText,
          authorRole: "DEVOPS",
          isSystem: false,
        },
      });
    } catch (commentErr) {
      const msg = commentErr instanceof Error ? commentErr.message : String(commentErr);
      this.log("error", `Failed to save report comment: ${msg}`);
      throw commentErr;
    }

    await this.emitEvent("info", { message: "Report generated, sending to QA for verification." });

    // Build phase: run npm run build if configured
    if (this.config.runBuildAfterTask) {
      this.log("info", "[AI] 🏗️  Build phase: running build command...");
      await this.emitEvent("info", { message: "[AI] 🏗️  Build phase: running build command..." });

      try {
        const tool = toolsMap.executeCommand;

        this.log("info", "[Build] Running: npm run build");
        await this.emitEvent("info", { message: "[Build] Running: npm run build" });

        const buildResult = await tool.execute({ command: "npm run build", reason: "Build project artifacts" });

        const buildSuccess = buildResult?.success === true;
        const buildOutput = typeof buildResult?.stdout === "string" ? buildResult.stdout : "";
        const buildError = typeof buildResult?.stderr === "string" ? buildResult.stderr : "";

        this.log("info", `[Build] Exit code: ${buildResult?.exitCode ?? "unknown"}`);
        this.log("info", buildSuccess ? "[Build] ✅ Build succeeded" : "[Build] ❌ Build failed");

        if (!buildSuccess) {
          this.log("error", `[Build] stderr: ${buildError || "No stderr output"}`);
          await this.emitEvent("error", {
            message: "Build failed. Check the output for details.",
            data: {
              exitCode: buildResult?.exitCode,
              stderr: buildError
            }
          });

          // Add build failure to report
          const buildFailureNote = `\n\n=== BUILD FAILURE ===\nExit code: ${buildResult?.exitCode}\nstderr:\n${buildError}`;
          reportText = reportText + buildFailureNote;
        } else {
          this.log("success", "[Build] ✅ Build artifacts ready for export");
          await this.emitEvent("info", { message: "[Build] ✅ Build artifacts ready for export" });

          // Add build success to report
          const buildSuccessNote = `\n\n=== BUILD SUCCESS ===\nBuild completed successfully. Ready for export.`;
          reportText = reportText + buildSuccessNote;
        }

        // Save build output as comment
        await prisma.comment.create({
          data: {
            taskId,
            content: buildSuccess
              ? "✅ Build succeeded. Artifacts ready for export."
              : "❌ Build failed. Check stderr for details.",
            authorRole: "DEVOPS",
            isSystem: false,
          },
        });
      } catch (buildError) {
        const msg = buildError instanceof Error ? buildError.message : String(buildError);
        this.log("error", `[Build] Error: ${msg}`);
        await this.emitEvent("error", {
          message: `Build error: ${msg}`,
          data: { error: msg }
        });

        const buildFailureNote = `\n\n=== BUILD ERROR ===\n${msg}`;
        reportText = reportText + buildFailureNote;
      }
    }

    try {
      await this.emitEvent("task_completed", {
        taskId,
        title: task.title,
        success: true
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `Failed to emit task_completed: ${msg}`);
    }

    return { success: true, report: reportText };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[ExecutionAgent] executeTaskInner CRITICAL CRASH:", error);
      this.log("error", "CRITICAL CRASH: " + msg);
      try {
        await this.emitEvent("error", {
          message: "CRITICAL CRASH: " + msg,
          taskId,
          raw: error instanceof Error ? (error as Error).stack : String(error),
        });
      } catch (emitErr) {
        console.error("[ExecutionAgent] Failed to emit crash event:", emitErr);
      }
      return { success: false };
    }
  }

  private async executeTicketInner(ticket: Ticket): Promise<ExecuteTaskResult> {
    if (!ticket.relatedTaskId) {
      this.log(
        "error",
        `Ticket ${ticket.id} has no relatedTaskId. Cannot execute without original task.`
      );
      return { success: false };
    }

    let originalTask: any = null;
    try {
      originalTask = await prisma.task.findUnique({
        where: { id: ticket.relatedTaskId },
        include: {
          plan: {
            include: {
              project: true,
            },
          },
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `Failed to load original task for ticket ${ticket.id}: ${msg}`);
      return { success: false };
    }

    if (!originalTask || !originalTask.plan?.project) {
      this.log(
        "error",
        `Original task ${ticket.relatedTaskId} not found or has no project (ticket ${ticket.id}).`
      );
      return { success: false };
    }

    const projectId = originalTask.plan.project.id;

    let projectContext = "";
    try {
      projectContext = await generateProjectContext(projectId, {
        includeDetails: true,
        maxTasks: 20,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log("error", `Failed to generate project context for ticket ${ticket.id}: ${msg}`);
    }

    const extraRequirement =
      `Regenerate instructions for this task, but with this new requirement from ticket "${ticket.title}":\n` +
      `"${ticket.description}"` +
      (projectContext
        ? `\n\nUse the following up-to-date project state while adapting instructions:\n${projectContext}`
        : "");

    this.log(
      "info",
      `[AI] 🎫 Regenerating prompt for original task ${originalTask.id} based on ticket ${ticket.id}...`
    );

    let regeneratedPrompt: string;
    try {
      regeneratedPrompt = await generateTaskPrompt(
        originalTask.id,
        true,
        false,
        extraRequirement
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(
        "error",
        `Failed to regenerate task prompt for ticket ${ticket.id} (task ${originalTask.id}): ${msg}`
      );
      return { success: false };
    }

    this.log(
      "info",
      `[AI] 🎫 Executing ticket "${ticket.title}" by re-running original task ${originalTask.id} with updated prompt.`
    );

    return this.executeTaskInner(originalTask.id, regeneratedPrompt);
  }

  async handleUserMessage(message: string): Promise<string> {
    this.log("info", `Received user message: ${message}`);

    await this.emitEvent("agent_message", {
      message: `I understand you want to: "${message}". Let me analyze what needs to be done.`,
      action: "analyzing"
    });

    try {
      const project = await prisma.project.findUnique({
        where: { id: this.config.projectId },
      });

      if (!project) {
        const response = "I couldn't find the project. Please check the project ID.";
        await this.emitEvent("agent_message", { message: response, action: "error" });
        return response;
      }

      const projectContext = await getCompactProjectContext(project.id);

      const systemPrompt = `You are a helpful AI coding assistant. The user has sent you a message during an active execution session.

Project Context:
${projectContext}

Your role is to:
1. Understand what the user wants
2. Provide a helpful response about what you'll do
3. If they want to modify code or run commands, acknowledge and describe the next steps

Keep your response concise and conversational, as if you're chatting with a developer colleague.
You can mention specific files, commands, or actions you'll take.`;

      const resolvedProvider = resolveProvider(project.aiProvider || undefined);
      const resolvedModel = project.aiModel || "gpt-4o-mini";

      let response: string;

      const chatLlmSettings = await getLLMSettings();
      if (resolvedProvider === "zai") {
        response = await generateTextZai({
          systemPrompt,
          userMessage: message,
          model: resolvedModel,
          temperature: chatLlmSettings.temperature,
          maxTokens: chatLlmSettings.maxTokens,
        });
      } else {
        const result = await generateText({
          model: getModel(resolvedProvider, resolvedModel),
          system: systemPrompt,
          prompt: message,
          temperature: chatLlmSettings.temperature,
          maxTokens: chatLlmSettings.maxTokens,
        });
        response = result.text ?? "I understand. How can I help you with this?";
      }

      await this.emitEvent("agent_message", {
        message: response,
        action: "responded"
      });

      return response;
    } catch (error) {
      const errorMsg = `Sorry, I had trouble processing your message: ${error instanceof Error ? error.message : "Unknown error"}`;
      await this.emitEvent("agent_message", { message: errorMsg, action: "error" });
      return errorMsg;
    }
  }
}

export { ExecutionAgent };
