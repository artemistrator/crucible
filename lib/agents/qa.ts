import { generateText } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getModel, resolveProvider } from "@/lib/ai/providers";
import { createAgentTools } from "./tools";
import { trackAIUsage } from "@/lib/ai/call";
import { analyzeRejectReason } from "./debug";
import { getCompactProjectContext } from "./project-context";
import { logQA } from "@/lib/qa-logger";
import { getLLMSettings } from "@/lib/settings";

async function addSystemComment(taskId: string, content: string, emoji: string = "🔍") {
  try {
    await prisma.comment.create({
      data: {
        taskId,
        content: `${emoji} ${content}`,
        authorRole: "QA",
        isSystem: true,
      },
    });
  } catch (error) {
    console.error("[QA] Failed to add system comment:", error);
  }
}

const qaVerificationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

export async function verifyTaskCompletion(taskId: string, reportContent: string) {
  logQA(taskId, 'START', 'Starting QA verification', {
    reportLength: reportContent.length,
    reportPreview: reportContent.slice(0, 200)
  });

  await addSystemComment(taskId, '🔍 Начинаю QA проверку выполнения задачи...');

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      plan: {
        include: {
          project: true,
        },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  }) as any;

  if (!task || !task.plan?.project) {
    logQA(taskId, 'ERROR', 'Task not found');
    throw new Error("Task not found");
  }

  const project = task.plan.project;
  const plan = task.plan;

  logQA(taskId, 'TASK_INFO', 'Task loaded', {
    title: task.title,
    executorAgent: task.executorAgent,
    status: task.status
  });

  await addSystemComment(taskId, '📋 Загружена задача: ' + task.title);

  const hasTestLogs = reportContent.toLowerCase().includes("test") || 
                      reportContent.toLowerCase().includes("pass") ||
                      reportContent.toLowerCase().includes("✓") ||
                      reportContent.toLowerCase().includes("✅");

  const hasBuildLogs = reportContent.toLowerCase().includes("build") ||
                       reportContent.toLowerCase().includes("compiled") ||
                       reportContent.toLowerCase().includes("npm run") ||
                       reportContent.toLowerCase().includes("npm run build");

  const recentComments = task.comments.map((c: any) => c.content).join("\n---\n");

  const vc = task.verificationCriteria as { artifacts?: string[]; manualCheck?: string; automatedCheck?: string } | null;

  logQA(taskId, 'VC_LOADED', 'Verification criteria loaded', vc);

  if (vc) {
    const criteriaSummary = [];
    if (vc.artifacts?.length) criteriaSummary.push(`📁 Файлы: ${vc.artifacts.join(', ')}`);
    if (vc.automatedCheck) criteriaSummary.push('🤖 Авто-проверка: ' + vc.automatedCheck);
    if (vc.manualCheck) criteriaSummary.push('👤 Ручная проверка: ' + vc.manualCheck);
    await addSystemComment(taskId, criteriaSummary.join('\n'), '✅');
  }

  const projectStateContext = await getCompactProjectContext(project.id);
  logQA(taskId, 'CONTEXT', 'Project context loaded', {
    contextLength: projectStateContext.length,
    contextPreview: projectStateContext.slice(0, 200)
  });

  const prompt = `You are a strict QA Specialist following GSD Goal-Backward Verification methodology.

${projectStateContext}

=== TASK INFORMATION ===
Task Title: ${task.title}
Description: ${task.description}
Executor Role: ${task.executorAgent || "Not specified"}

Project Plan: ${plan.title}
Tech Stack: ${plan.techStack}

=== VERIFICATION CRITERIA (from Architect) ===
${vc ? `${vc.artifacts && vc.artifacts.length > 0 ? `[Artifacts]\nExpected files:\n${vc.artifacts.map(a => `  - ${a}`).join('\n')}\n` : ''}
${vc.manualCheck ? `[manualCheck]\n${vc.manualCheck}\n` : ''}
${vc.automatedCheck ? `[automatedCheck]\n${vc.automatedCheck}\n` : ''}` : ''}
=== END VERIFICATION CRITERIA ===

=== EXECUTOR REPORT (evidence) ===
${reportContent}
=== END EXECUTOR REPORT ===

${recentComments ? `=== PREVIOUS COMMENTS ===\n${recentComments}\n=== END PREVIOUS COMMENTS ===\n\n` : ""}

=== YOUR MISSION ===
Follow the GSD Verification Protocol to decide if this task is COMPLETE.

**STEP 1**: Read the Verification Criteria above.
**STEP 2**: Search the Executor Report for evidence for EACH criteria point:
   - [Artifacts]: Look for ls -la output, file content, or file creation logs
   - [automatedCheck]: Look for test/build success logs, PASS markers
   - [manualCheck]: Look for confirmation text or screenshot descriptions
**STEP 3**: Check if ALL criteria have sufficient evidence.
**STEP 4**: Make your decision.

**CRITICAL RULE**: If ANY criteria point has NO evidence in the report — REJECT with:
"Verification Failed. Missing evidence for: [criteria name]. Please provide [specific evidence needed]."

**HEADLESS EXCEPTION**: Executor runs in Docker/headless (no browser). If manualCheck only asks for "open in browser", "screenshot", or "visual confirmation", and Artifacts + automatedCheck both have evidence, APPROVE and state that manual check is deferred to user.

**TICKET RUN EXCEPTION**: If the report contains "[Ticket run]" and states that "automatedCheck from the original task was skipped" (implementation was modified by the ticket), do NOT require automatedCheck evidence. APPROVE when: (1) Artifacts have evidence (files exist), and (2) the report describes the implementation (e.g. file content or tool outputs). The original automatedCheck may fail on modified output (e.g. HTML with new tags splitting text); that is expected for ticket runs.

Only APPROVE when:
✓ All Artifacts are mentioned/shown in the report
✓ All automatedCheck commands show success (PASS, Build success, no errors)
✓ manualCheck has confirmation or screenshot description
✓ No visible syntax/logic errors in code

Evidence examples you should ACCEPT:
- "ls -la" output showing the file exists
- Full file content in code blocks
- "PASS" or "✓" in test output
- "Build success" or "Compiled successfully" messages
- "I verified X and it works" text

Evidence examples you should REJECT:
- No mention of required files at all
- Test output with FAIL or errors
- Build output with compilation errors
- No confirmation for manual checks

ВАЖНО: Ответь ТОЛЬКО валидным JSON в следующем формате:
{
  "status": "APPROVED" или "REJECTED",
  "reasoning": "For APPROVED: List each criteria and the evidence found. For REJECTED: Start with 'Verification Failed. Missing evidence for:' and list missing criteria with specific evidence needed.",
  "confidence": число от 0.0 до 1.0
}`;

  const resolvedProvider = resolveProvider(project.aiProvider ?? undefined);
  const resolvedModel = project.aiModel ?? "gpt-4o-mini";
  const model = getModel(resolvedProvider, resolvedModel);
  const modelDisplay = project.aiModel ?? `${resolvedProvider}/${resolvedModel}`;

  logQA(taskId, 'AI_CALL', 'Calling AI for QA verification', {
    model: modelDisplay,
    reportLength: reportContent.length,
    hasVC: !!vc
  });

  await addSystemComment(taskId, '🤖 Анализирую отчет с помощью AI (' + modelDisplay + ')...');

  const tools = createAgentTools(project.id);
  const llmSettings = await getLLMSettings();
  const qaTemperature = Math.min(llmSettings.temperature, 0.1);

  const system = `You are a strict QA Specialist following the GSD (Goal-Backward Verification) methodology.
Your job is to verify task completion based on the report provided by the Executor Agent (User/Cursor).

### CRITICAL RUNTIME CONTEXT
- **You are running inside a Docker Container.**
- **The Code is on the User's Host Machine.**
- **YOU DO NOT HAVE DIRECT ACCESS TO THE FILE SYSTEM.**
- **YOU CANNOT ACCESS LOCALHOST (127.0.0.1) OF THE USER.**

### GSD VERIFICATION PROTOCOL (STRICT)

Follow this exact algorithm:

#### STEP 1: READ VERIFICATION CRITERIA
Extract the verificationCriteria from the task:
- **Artifacts**: File paths that must exist
- **automatedCheck**: Commands that must succeed (tests, builds)
- **manualCheck**: What must be verified manually

#### STEP 2: COLLECT EVIDENCE FROM REPORT
For each criteria point, search for evidence:

**A. For Artifacts:**
- Look for \`ls -la\` output showing the file exists
- Look for full file content in the report (code blocks, \`\`\`filename\`\`\`)
- Look for \`cat\` or \`cat <filename>\` commands with file content
- Look for file creation logs (e.g., "Created src/app/api/auth/route.ts")

**B. For automatedCheck:**
- Look for test execution logs (e.g., "PASS", "✓", "All tests passed")
- Look for build success messages (e.g., "Build success", "Compiled successfully")
- Look for command output from the specified automatedCheck command
- Look for npm/yarn output showing successful execution

**C. For manualCheck:**
- Look for textual confirmation ("I verified X", "Y works as expected")
- Look for screenshot descriptions or base64 image data
- Look for UI behavior descriptions matching the criteria

#### STEP 3: VALIDATE EVIDENCE (TRUTH CHECK)
For each criteria point, decide if the evidence is sufficient:
- **Artifacts**: Sufficient if file is mentioned OR full content is shown OR \`ls\` output shows it
- **automatedCheck**: Sufficient if logs show successful execution OR no errors in output
- **manualCheck**: Sufficient if user explicitly confirms verification OR describes expected behavior

#### STEP 4: MAKE DECISION
**APPROVE (status: "APPROVED"):**
- ALL verificationCriteria points have sufficient evidence
- No visible syntax/logic errors in provided code
- No errors in logs

**REJECT (status: "REJECTED"):**
- AT LEAST ONE verificationCriteria point has NO evidence
- Evidence contradicts criteria
- Visible syntax/logic errors
- Report contains no code/logs at all

#### STEP 5: GENERATE REASONING
**If APPROVED:**
- List each criteria point and the evidence found
- Example: "✓ Artifacts: Found src/app/api/auth/route.ts in ls output. ✓ automatedCheck: npm run test shows PASS."

**If REJECTED:**
- Start with: "Verification Failed. Missing evidence for:"
- List ALL missing criteria points
- For each missing point, specify what evidence is needed
- Example: "Verification Failed. Missing evidence for: [Artifacts] Please provide ls -la output or file content showing src/app/api/auth/route.ts exists. [automatedCheck] Please provide npm run test output showing PASS."

### CODE REVIEW CHECKLIST (when evidence exists)
When reviewing provided code snippets, check for:
- Hardcoded secrets, API keys, or sensitive data
- Missing type annotations (any in TypeScript)
- Logic errors
- Security vulnerabilities
- Missing error handling
- Incorrect imports

### IMPORTANT RULES
- **NEVER REJECT** because "File not found" or "Cannot connect to localhost" — THIS IS EXPECTED.
- ONLY approve when ALL criteria have evidence.
- Use GSD terminology: "Artifacts", "Truths" (evidence that proves criteria).

### ENVIRONMENT LIMITATIONS (approve when artifact + manual evidence exist)
- If **Artifacts** have clear evidence (ls -la output, file content in report, or "Created X" / "written successfully") AND **manualCheck** is confirmed in the report (e.g. "отображается текст", "I verified"), but **automatedCheck** failed only because a shell command is missing in the environment (e.g. "file: command not found", "command not found", "not found"), then **APPROVE**.
- In the reasoning, state: artifact and manual check satisfied; automatedCheck failed due to environment (missing command), not due to task implementation.

### HEADLESS / DOCKER: manualCheck requiring browser or screenshot
- **Executor runs in a container/headless environment. It CANNOT open a real browser, take screenshots, or perform visual UI checks.**
- If **Artifacts** and **automatedCheck** BOTH have sufficient evidence in the report (files exist, automated command succeeded), and **manualCheck** ONLY requires "open in browser", "screenshot", "visual confirmation", or "displayed on page", then **APPROVE**.
- In the reasoning, state: Artifacts and automatedCheck satisfied; manualCheck requires browser/visual verification which is not available in this environment — deferred to user. Do NOT REJECT solely because the report lacks screenshot or "I opened in browser" text.

### TICKET RUN: automatedCheck skipped
- If the report contains **"[Ticket run]"** and states that **"automatedCheck from the original task was skipped"** (implementation was modified by the ticket), do NOT require automatedCheck evidence.
- APPROVE when: (1) **Artifacts** have evidence (files exist, ls -la or content), and (2) the report describes the implementation (tool outputs, file content). The original task's automatedCheck (e.g. grep for exact phrase) may fail when output was changed by the ticket (e.g. HTML with spans); that is expected.
- In the reasoning, state: Ticket run; automatedCheck skipped per ticket-run rule. Artifacts satisfied; evidence from report.

ВАЖНО: Ответь ТОЛЬКО валидным JSON в следующем формате:
{
  "status": "APPROVED" или "REJECTED",
  "reasoning": "подробное объяснение решения с указанием доказательств или отсутствия доказательств по каждому критерию",
  "confidence": число от 0.0 до 1.0
}`;

  const LOW_CONFIDENCE_THRESHOLD = 0.7;
  const runOneQA = async (promptOverride?: string) => {
    const res = await generateText({
      model,
      system,
      prompt: promptOverride ?? prompt,
      tools,
      maxSteps: 5,
      maxTokens: llmSettings.maxTokens,
      temperature: qaTemperature,
    });
    await trackAIUsage(res, { projectId: project.id, taskId, actionType: "qa_check", model: modelDisplay });
    let jsonStr = res.text?.trim() ?? "";
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^\s*```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/g, "").trim();
    }
    if (!jsonStr) jsonStr = "{}";
    const p = qaVerificationSchema.safeParse(JSON.parse(jsonStr));
    if (!p.success) throw new Error("QA response parsing failed");
    return p.data;
  };

  let parsedData = await runOneQA();
  if (parsedData.status === "REJECTED" && parsedData.confidence < LOW_CONFIDENCE_THRESHOLD) {
    logQA(taskId, "RETRY", "Low-confidence REJECTED, requesting second opinion", {
      confidence: parsedData.confidence,
      threshold: LOW_CONFIDENCE_THRESHOLD,
    });
    await addSystemComment(taskId, "🔄 Низкая уверенность при отклонении — повторная проверка...");
    try {
      const second = await runOneQA(
        prompt + "\n\n[SECOND OPINION] Re-evaluate. If evidence is borderline or partially present for the criteria, prefer APPROVED."
      );
      if (second.status === "APPROVED") {
        parsedData = second;
        await addSystemComment(taskId, "✅ После повторной проверки: решение изменено на APPROVED.\n\n" + second.reasoning);
      }
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[QA] Second opinion failed:", e);
      }
    }
  }

  const { status, reasoning, confidence } = parsedData;

  const computedFinalStatus =
    status === "APPROVED"
      ? project.requireApproval
        ? "WAITING_APPROVAL"
        : "DONE"
      : "REJECTED";

  logQA(taskId, 'DECISION', 'QA decision made', {
    status,
    finalStatus: computedFinalStatus,
    confidence,
    reasoningPreview: reasoning.slice(0, 300)
  });

  let finalStatus: string =
    status === "APPROVED"
      ? project.requireApproval
        ? "WAITING_APPROVAL"
        : "DONE"
      : "REJECTED";
  if (status === "APPROVED") {
    await addSystemComment(taskId, '✅ QA ПРОВЕРКА ПРОЙДЕНА!\n\n' + reasoning, '🎉');
  } else {
    await addSystemComment(taskId, '❌ QA ПРОВЕРКА НЕ ПРОЙДЕНА!\n\n' + reasoning, '🚫');
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: finalStatus as any },
  });

  let debugSummary = null;
  if (status === "REJECTED") {
    try {
      debugSummary = await analyzeRejectReason({
        projectId: project.id,
        taskId,
        qaReasoning: reasoning,
        verificationCriteria: vc,
        executorReport: reportContent,
      });

      const debugSummaryText = `<symptoms>
expected: ${debugSummary.symptoms.expected}
actual: ${debugSummary.symptoms.actual}
missing_evidence: ${debugSummary.symptoms.missing_evidence}
</symptoms>`;

      await prisma.comment.create({
        data: {
          taskId,
          content: `🐛 Debug Summary (GSD)\n\n${debugSummaryText}`,
          authorRole: "QA",
        },
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[QA] Failed to generate debug summary:", error);
      }
    }
  }

  return {
    taskId,
    status,
    finalStatus,
    reasoning,
    confidence,
    taskTitle: task.title,
    debugSummary,
  };
}
