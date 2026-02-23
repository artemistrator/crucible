# End-to-End Pipeline X-Ray: Жизненный цикл идеи в ai-orchestrator

**Дата анализа:** 22 февраля 2026  
**Объем кодовой базы:** ~70 ключевых файлов  
**Технологический стек:** Next.js, Prisma, TypeScript, AI SDK (Vercel AI)

---

## Phase 1: Inception (Идея → План → Задачи)

### 1.1 API Entry Points

| Endpoint | Файл | Назначение |
|-----------|--------|------------|
| `POST /api/decompose-idea` | `app/api/decompose-idea/route.ts` | Создает Project и генерирует 3 плана |
| `POST /api/projects` | `app/api/projects/route.ts` | Создает Project (устаревший, используется только fallback) |
| `PATCH /api/plans/[planId]` | `app/api/plans/[planId]/route.ts` | Выбирает план для разработки |
| `POST /api/generate-tasks` | `app/api/generate-tasks/route.ts` | Генерирует задачи из выбранного плана |

### 1.2 Flow: Decompose Idea → Plan Selection

**Шаг 1: Декомпозиция идеи**
```typescript
// app/api/decompose-idea/route.ts:129
export async function POST(request: Request) {
  const { ideaText, provider, model, baseProjectId } = body;
  
  // 1. Получение Global Insights из прошлого опыта
  const globalInsights = await searchGlobalInsights(ideaText, 5);
  
  // 2. Определение режима: новый проект или эволюция существующего
  if (baseProjectId) {
    // Evolve Mode: загрузка контекста существующего проекта
    const projectContext = await getCompactProjectContext(baseProjectId);
    systemPrompt = SYSTEM_PROMPT_EVOLVE.replace(
      "{PROJECT_CONTEXT_PLACEHOLDER}", projectContext
    );
  }
  
  // 3. Вызов LLM для генерации 3 планов
  const result = await generateText({
    model: getModel(resolvedProvider, resolvedModel),
    system: systemPrompt,
    prompt: `Project Idea: ${ideaText}`,
    temperature: 0.4,
    maxTokens: 2048,
  });
  
  // 4. Парсинг JSON с retry (max 3 попытки)
  const plans = parsePlansFromJson(result.text);
  
  // 5. Создание Project в БД
  const project = await prisma.project.create({
    data: {
      ideaText,
      aiProvider: resolvedProvider,
      aiModel: resolvedModel,
      status: "IN_PROGRESS",
    }
  });
  
  // 6. Создание 3 Plan записей
  const planRecords = await Promise.all(
    plans.map(plan => prisma.plan.create({
      data: {
        projectId: project.id,
        title: plan.title,
        description: plan.description,
        techStack: plan.techStack,
        relevanceScore: plan.relevanceScore,
        estimatedComplexity: String(plan.estimatedComplexity),
        estimatedTime: formatEstimatedTimeWithLLM(plan.estimatedManualDays),
        reasoning: plan.reasoning,
        prosCons: { pros: plan.pros, cons: plan.cons }
      }
    }))
  );
  
  // 7. Инициализация рабочей директории
  await initProjectWorkspace(project.id);
}
```

**Результат Phase 1.1:**
- `Project` запись в БД со статусом `IN_PROGRESS`
- 3 `Plan` записи в БД (пользователь выбирает один)
- Рабочая директория: `/projects/[projectId]`

### 1.3 Flow: Plan → Tasks Generation

**Шаг 2: Выбор плана и генерация задач**
```typescript
// app/api/generate-tasks/route.ts:33
export async function POST(request: Request) {
  const { planId } = body;
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { project: true }
  });
  
  // 1. Проверка: задачи уже есть?
  const existingTasks = await prisma.task.findMany({
    where: { planId }
  });
  if (existingTasks.length > 0) {
    return { success: true, tasks: existingTasks };
  }
  
  // 2. Получение контекста проекта
  const projectStateContext = await getCompactProjectContext(plan.projectId);
  
  // 3. Вызов LLM для генерации задач с зависимостями
  const result = await generateText({
    system: SYSTEM_PROMPT,
    prompt: `
      План: ${plan.title}
      Стек: ${plan.techStack}
      ${projectStateContext}
      
      Используй методологию Goal-Backward Verification.
      Для каждой задачи укажи verificationCriteria:
      - artifacts: массив путей к файлам
      - manualCheck: описание ручной проверки
      - automatedCheck: команда для автоматической проверки
      
      Создай Граф Зависимостей: dependencyIndices - массив индексов задач, которые блокируют текущую.
    `,
    temperature: 0.3,
    maxTokens: 4096,
  });
  
  // 4. Парсинг JSON
  const parsed = JSON.parse(cleanJson);
  const { estimatedComplexity, reasoning, tasks } = taskSchema.parse(parsed);
  
  // 5. Создание задач в транзакции
  const taskRecords = await prisma.$transaction(async (tx) => {
    const records = await Promise.all(
      tasks.map(task => tx.task.create({
        data: {
          planId: plan.id,
          title: task.title,
          description: task.description,
          executorAgent: task.executorAgent, // TASK_EXECUTOR | BACKEND | DEVOPS
          observerAgent: TEAMLEAD,
          status: "TODO",
          branchName: task.branchName,
          verificationCriteria: task.verificationCriteria
        }
      }))
    );
    
    // 6. Создание зависимостей
    tasks.forEach((task, index) => {
      const dependencyIndices = task.dependencyIndices || [];
      dependencyIndices.forEach(depIndex => {
        tx.taskDependency.create({
          data: {
            taskId: records[index].id,
            dependsOnId: records[depIndex].id
          }
        });
      });
    });
    
    return records;
  });
  
  // 7. Генерация ADR (Architecture Decision Record)
  const adrContent = await generateADR(plan.projectId, plan.id);
  await saveDocToClient(plan.projectId, "001-initial-architecture.md", adrContent);
}
```

**Результат Phase 1.3:**
- `Task` записи в БД со статусом `TODO`
- `TaskDependency` записи в БД (граф зависимостей)
- `Plan` обновлен с `estimatedComplexity`, `reasoning`
- ADR документ сохранен

### 1.4 Database Models (Phase 1)

```prisma
model Project {
  id              String        @id @default(cuid())
  ideaText        String
  context         String         @db.Text @default("")
  status          ProjectStatus   @default(IN_PROGRESS) // IN_PROGRESS | COMPLETED | ARCHIVED
  plans           Plan[]
  executionSessions ExecutionSession[]
  tickets         Ticket[]
}

model Plan {
  id                  String   @id @default(cuid())
  projectId           String
  title               String
  techStack           String
  selected            Boolean  @default(false)
  estimatedComplexity String?  @db.VarChar(2) // "S" | "M" | "L" | "XL"
  estimatedTime       String?  @db.VarChar(80)
  tasks               Task[]
}

model Task {
  id                  String            @id @default(cuid())
  planId              String
  title               String
  description         String
  status              TaskStatus        @default(TODO) // TODO | IN_PROGRESS | REVIEW | WAITING_APPROVAL | DONE
  executorAgent       AgentRole?        // TASK_EXECUTOR | BACKEND | DEVOPS | TEAMLEAD | QA
  branchName          String?
  verificationCriteria Json?              // { artifacts: [], manualCheck: "", automatedCheck: "" }
  dependencies        TaskDependency[]  @relation("TaskDependencies")
  dependents          TaskDependency[]  @relation("DependentTasks")
  comments            Comment[]
}

model TaskDependency {
  id          String @id @default(cuid())
  taskId      String
  dependsOnId String
  // Циклические зависимости запрещены
}
```

---

## Phase 2: Dispatch & Execution (AHP Worker / Legacy Worker)

### 2.1 Execution Session Creation

| Endpoint | Файл | Назначение |
|-----------|--------|------------|
| `POST /api/execution-sessions/start` | `app/api/execution-sessions/start/route.ts` | Создает ExecutionSession |
| `POST /api/execution-sessions/run` | `app/api/execution-sessions/run/route.ts` | Запускает Legacy Worker |
| `POST /api/execution-sessions/run-ahp` | `app/api/execution-sessions/run-ahp/route.ts` | Запускает AHP Worker (Agent Hive Protocol) |

```prisma
model ExecutionSession {
  id          String        @id @default(cuid())
  projectId    String
  planId      String?
  status      String        @default("RUNNING") // RUNNING | PAUSED | STOPPED | ERROR
  engine      String?       @default("legacy") // "legacy" or "ahp"
  costLimit   Float?
  currentCost Float         @default(0)
  metadata    Json?         @default("{}") // { retryCounter: {}, autoApprove: bool, ... }
  totalSteps  Int?          @default(0)
  totalErrors Int?          @default(0)
  logs        ExecutionLog[]
  messages    AgentMessage[]
}
```

### 2.2 Legacy Worker Flow (`/api/execution-sessions/run`)

**Цикл воркера:**
```typescript
// app/api/execution-sessions/run/route.ts:12
async function runExecutionSession(sessionId: string) {
  const session = await prisma.executionSession.findUnique({
    where: { id: sessionId },
    include: { project: true }
  });
  
  const agent = new ExecutionAgent({
    projectId: session.projectId,
    planId: session.planId,
    sessionId: session.id,
    autoApprove: sessionMetadata.autoApprove || false,
    mode: executionMode, // "local" | "cloud"
  });
  
  // 1. Приоритет: обрабатываем OPEN tickets перед TODO tasks
  const openTickets = await prisma.ticket.findMany({
    where: { projectId: session.projectId, status: "OPEN" },
    orderBy: { createdAt: "asc" }
  });
  
  if (openTickets.length > 0) {
    const ticket = openTickets[0];
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "IN_PROGRESS" }
    });
    
    const result = await agent.executeTicket(currentTicket);
    const nextStatus = result.success ? "DONE" : "REJECTED";
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: nextStatus }
    });
    return; // Один ticket за run
  }
  
  // 2. Если нет tickets - обрабатываем TODO tasks
  const tasks = await prisma.task.findMany({
    where: { planId, status: "TODO" },
    orderBy: { createdAt: "asc" }
  });
  
  for (const task of tasks) {
    // 3. Генерация промпта для задачи
    const generatedPrompt = await generateTaskPrompt(task.id, false, false);
    
    // 4. Выполнение задачи
    const result = await agent.executeTask(task.id, generatedPrompt);
    
    if (!result.success) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "REVIEW" }
      });
      continue;
    }
    
    // 5. Сохранение отчета
    await prisma.comment.create({
      data: {
        taskId: task.id,
        content: result.report,
        authorRole: "DEVOPS",
        isSystem: false
      }
    });
    
    // 6. QA проверка с auto-retry (макс 2 попытки)
    let qaResult = await verifyTaskCompletion(task.id, result.report);
    const MAX_QA_RETRIES = 2;
    let attempt = 0;
    
    while (qaResult.status === "REJECTED" && attempt < MAX_QA_RETRIES) {
      attempt++;
      // Автоматический сбор недостающих evidence
      const autoReport = await collectMissingEvidence(task.id, qaResult);
      await prisma.comment.create({
        data: { taskId: task.id, content: autoReport, authorRole: "DEVOPS" }
      });
      
      // Повторная QA проверка
      qaResult = await verifyTaskCompletion(task.id, result.report + "\n\n" + autoReport);
    }
    
    // 7. Обновление статуса задачи
    await prisma.task.update({
      where: { id: task.id },
      data: { status: qaResult.finalStatus } // DONE | REJECTED | WAITING_APPROVAL
    });
    
    // 8. Инкрементальная рефлексия (каждые 5 задач)
    if (processedTasksCount % 5 === 0) {
      await runReflexologistForSession({
        projectId: session.projectId,
        sessionId: session.id,
        planId,
        mode: "incremental",
        maxInsights: 3
      });
    }
  }
  
  // 9. Финализация сессии
  const allTasksDone = planTasks.every(t => t.status === "DONE");
  if (allTasksDone) {
    await prisma.project.update({
      where: { id: session.projectId },
      data: { status: "COMPLETED" }
    });
    
    // 10. Финальная рефлексия
    await runReflexologistForSession({
      projectId: session.projectId,
      sessionId: session.id,
      planId,
      mode: "final",
      maxInsights: 3
    });
  }
}
```

### 2.3 AHP Worker Flow (`/api/execution-sessions/run-ahp`)

**Agent Hive Protocol (AHP) - распределенная система агентов:**

```typescript
// app/api/execution-sessions/run-ahp/route.ts:41
async function runAHPDispatcher(sessionId: string) {
  const session = await prisma.executionSession.findUnique({
    where: { id: sessionId },
    include: { project: true }
  });
  
  const MAX_ITERATIONS = 500;
  let iteration = 0;
  
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    
    // 1. Проверка завершения сессии
    const isComplete = await isSessionComplete(sessionId);
    if (isComplete) break;
    
    // 2. Получение PENDING/PROCESSING сообщений
    const pendingMessages = await prisma.agentMessage.findMany({
      where: {
        sessionId,
        status: { in: [PENDING, PROCESSING] }
      },
      orderBy: { createdAt: "asc" }
    });
    
    if (pendingMessages.length === 0) {
      // 3. Поиск следующей задачи/ticket
      const nextItem = await findNextTask(session.projectId, session.planId);
      
      if (nextItem.type === "ticket") {
        // Обработка ticket
        const ticket = nextItem.data;
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: "IN_PROGRESS" }
        });
        
        await messageBus.postMessage({
          sessionId,
          sourceAgent: TEAMLEAD,
          targetAgent: ticket.relatedTaskId 
            ? (await prisma.task.findUnique(...)).executorAgent || TASK_EXECUTOR
            : TASK_EXECUTOR,
          eventType: TICKET_REQUEST,
          payload: { ticketId: ticket.id, relatedTaskId: ticket.relatedTaskId }
        });
      } else if (nextItem.type === "task") {
        // Обработка task
        const task = nextItem.data;
        await prisma.task.update({
          where: { id: task.id },
          data: { status: "IN_PROGRESS" }
        });
        
        await messageBus.postMessage({
          sessionId,
          sourceAgent: TEAMLEAD,
          targetAgent: task.executorAgent || TASK_EXECUTOR,
          eventType: TASK_REQUEST,
          payload: { taskId: task.id }
        });
      }
      continue;
    }
    
    // 4. Группировка сообщений по агентам
    const messagesByAgent = groupBy(pendingMessages.filter(m => m.status === PENDING), "targetAgent");
    
    // 5. Параллельное выполнение агентов
    const agentPromises = Object.entries(messagesByAgent).map(([agentRole, messages]) => {
      const agent = createAgentForRole(
        agentRole,
        sessionId,
        session.projectId,
        autoApprove,
        onLog,
        mode
      );
      return agent.run(); // BaseAgent.run() обрабатывает сообщения
    });
    
    await Promise.allSettled(agentPromises);
    
    // Пауза между итерациями
    await new Promise(resolve => setTimeout(resolve, ITERATION_PAUSE_MS));
  }
  
  // 6. Финализация сессии
  await finalizeSession(sessionId, session.projectId, session.planId);
}
```

### 2.4 Agent Factory & Roles

**Фабрика агентов** (`lib/execution/agent-factory.ts`):

```typescript
export function createAgentForRole(
  agentRole: AgentRole,
  sessionId: string,
  projectId: string,
  autoApprove: boolean,
  onLog: (level, message) => void,
  mode?: "local" | "cloud"
): BaseAgent {
  switch (agentRole) {
    case TASK_EXECUTOR:
      return new TaskExecutorAgent(config);
    case QA:
      return new QAAgent(config);
    case TEAMLEAD:
      return new TeamLeadAgent(config);
    case BACKEND:
    case DEVOPS:
    case CURSOR:
      return new TaskExecutorAgent(config); // Тот же агент, но с другим role
    default:
      throw new Error(`Unknown agent role: ${agentRole}`);
  }
}
```

**Роли агентов:**
- `TASK_EXECUTOR` / `BACKEND` / `DEVOPS` / `CURSOR`: TaskExecutorAgent
- `QA`: QAAgent
- `TEAMLEAD`: TeamLeadAgent

### 2.5 TaskExecutorAgent Flow

**Обработка TASK_REQUEST:**
```typescript
// lib/agents/task-executor-agent.ts:24
async handleTaskRequest(message: AgentMessage) {
  const { taskId } = message.payload;
  
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { plan: { include: { project: true } } }
  });
  
  // 1. Генерация детального промпта
  let instructions = task.generatedPrompt?.trim();
  if (!instructions) {
    instructions = await generateTaskPrompt(taskId, false, false);
  }
  
  // 2. Генерация execution plan (JSON план действий)
  const planResult = await generateText({
    system: `
      You are an experienced software engineer. Your job is to produce an execution plan as JSON only.
      ${projectContext}
      
      Task: ${task.title}
      Instructions: ${instructions}
      
      Output MUST be JSON with "steps" array:
      - thought: { "thought": "Brief explanation" }
      - tool call: { "toolName": "executeCommand", "params": { "command": "npm test" } }
      
      Available tools: executeCommand, readFile, writeFile, searchKnowledge, webSearch
    `,
    prompt: `Create an execution plan for this task: ${task.title}`,
    temperature: 0.2,
    maxTokens: 4096
  });
  
  const plan: AIExecutionPlan = JSON.parse(planResult.text);
  
  // 3. Выполнение шагов
  const tools = createAgentTools(projectId, sessionId, mode);
  const results = [];
  
  for (const step of plan.steps) {
    if ("thought" in step) {
      this.log("info", `🧠 ${step.thought}`);
      continue;
    }
    
    if ("toolName" in step && step.toolName in tools) {
      const tool = tools[step.toolName];
      const result = await tool.execute(step.params);
      results.push({ toolName: step.toolName, result, success: true });
      
      // CSS делегирование
      if (step.toolName === "writeFile" && filePath.endsWith('.css')) {
        await this.sendMessage(
          QA,
          STYLE_REQUEST,
          { taskId, filePath, content: step.params.content },
          message.id
        );
      }
    }
  }
  
  // 4. Фаза верификации
  const vc = task.verificationCriteria as {
    artifacts?: string[];
    automatedCheck?: string;
    manualCheck?: string;
  };
  
  let artifactsOutput = "";
  let automatedCheckOutput = "";
  
  if (vc) {
    const artifacts = vc.artifacts || [];
    const automatedCheck = vc.automatedCheck;
    
    // 4a. Запуск automatedCheck через временный скрипт
    if (automatedCheck) {
      const VERIFY_EOF = "AI_VERIFY_SCRIPT_END_7f3a";
      const cmd = `cat << '${VERIFY_EOF}' > .ai-temp-check.sh\n${automatedCheck}\n${VERIFY_EOF}\nsh .ai-temp-check.sh`;
      const result = await tools.executeCommand.execute({ command: cmd });
      automatedCheckOutput = result.stdout;
    }
    
    // 4b. Проверка артефактов (ls -la + head -n 200)
    for (const artifact of artifacts) {
      const lsResult = await tools.executeCommand.execute({
        command: `ls -la "${artifact}"`
      });
      const headResult = await tools.executeCommand.execute({
        command: `head -n 200 "${artifact}"`
      });
      artifactsOutput += `--- ${artifact} ---\n$ ls -la output\n${headResult.stdout}`;
    }
  }
  
  // 5. Формирование отчета
  const reportText = `
    === EXECUTION STEPS ===
    ${results.map(r => `- ${r.toolName}: ${r.result.stdout || r.result.error}`).join('\n')}
    
    === VERIFICATION EVIDENCE ===
    Artifacts Check:\n${artifactsOutput}
    Automated Check:\n${automatedCheckOutput}
    
    ### Manual Check
    [HEADLESS MODE TRIGGERED]
    В headless-окружении ручная проверка невозможна. Проверка отложена на пользователя.
  `;
  
  // 6. Сохранение отчета
  await prisma.comment.create({
    data: {
      taskId,
      content: reportText,
      authorRole: "DEVOPS",
      isSystem: false
    }
  });
  
  // 7. Отправка QA_REQUEST
  await this.sendMessage(
    QA,
    QA_REQUEST,
    { taskId, report: reportText },
    message.id
  );
  
  return { success: true, results };
}
```

**Обработка TICKET_REQUEST:**
```typescript
// lib/agents/task-executor-agent.ts:397
async handleTicketRequest(message: AgentMessage) {
  const { ticketId, relatedTaskId } = message.payload;
  
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  const originalTask = await prisma.ticket.findUnique({ 
    where: { id: relatedTaskId },
    include: { plan: { include: { project: true } } }
  });
  
  // 1. Регенерация промпта с учетом требований тикета
  const extraRequirement = `Ticket "${ticket.title}": ${ticket.description}`;
  const instructions = await generateTaskPrompt(
    relatedTaskId,
    true, // isTicketRun
    false,
    extraRequirement
  );
  
  // 2. Выполнение (тот же flow что и TASK_REQUEST)
  // ...执行同样的 execution plan + verification
  
  // 3. Отправка QA_REQUEST с отметкой "[Ticket run]"
  await this.sendMessage(
    QA,
    QA_REQUEST,
    { taskId: relatedTaskId, report: ticketReport + "\n\n[Ticket run]" },
    message.id
  );
}
```

### 2.6 Tools (executeCommand, readFile, writeFile)

**Cloud Mode (Docker):**
```typescript
// lib/agents/tools.ts:286
export function createCloudExecuteCommandTool(projectId: string, executionSessionId?: string) {
  return tool({
    description: "Execute shell command inside Docker container. Working dir: /app/projects/[projectId]",
    parameters: z.object({
      command: z.string(),
      reason: z.string().optional()
    }),
    execute: async ({ command, reason }) => {
      const cwd = getProjectDir(projectId);
      
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000, // 120 seconds
          env: { CI: process.env.CI || "1" }
        });
        
        return { success: true, exitCode: 0, stdout, stderr };
      } catch (error: any) {
        await handleCommandError(projectId, command, stderr || error.message, executionSessionId);
        return {
          success: false,
          exitCode: error.code || 1,
          stdout,
          stderr
        };
      }
    }
  });
}
```

**Local Mode (через sync client):**
```typescript
// lib/agents/tools.ts:175
export function createExecuteCommandTool(projectId: string, executionSessionId?: string) {
  return tool({
    description: "Execute shell command via sync client (approval required unless auto-approve)",
    parameters: z.object({
      command: z.string(),
      reason: z.string().optional()
    }),
    execute: async ({ command, reason }) => {
      // 1. Создание SyncCommand записи
      const response = await fetch(`${APP_URL}/api/sync/command`, {
        method: 'POST',
        body: JSON.stringify({ projectId, command, reason })
      });
      
      const commandId = (await response.json()).commandId;
      
      // 2. Ожидание выполнения (polling)
      const maxAttempts = 120;
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const command = await prisma.syncCommand.findUnique({
          where: { id: commandId }
        });
        
        if (command.status === "COMPLETED" || command.status === "FAILED" || command.status === "REJECTED") {
          return {
            success: command.status === "COMPLETED",
            exitCode: command.exitCode,
            stdout: command.stdout,
            stderr: command.stderr
          };
        }
        
        attempts++;
      }
      
      return { success: false, error: "Timeout" };
    }
  });
}
```

### 2.7 Race Condition Protection

**Защита от гонок (Session Manager):**
```typescript
// lib/execution/session-manager.ts:196
async checkRetryLimit(sessionId: string, errorSignature: string) {
  const session = await this.getSession(sessionId);
  const retries = session.retryCounter.get(errorSignature) || 0;
  
  // 1. Лимит retry для одной ошибки
  if (retries > 3) {
    return { shouldPause: true, reason: `Failed to fix issue after 3 attempts` };
  }
  
  // 2. Обнаружение повторяющихся ошибок (infinite loop)
  if (errorSignature === session.lastErrorSignature) {
    return { 
      shouldPause: true, 
      reason: "Same error occurred twice in a row. Possible infinite loop detected." 
    };
  }
  
  // 3. Инкремент счетчика
  await this.incrementRetryCounter(sessionId, errorSignature);
  return { shouldPause: false };
}
```

**Применение в ExecutionAgent:**
```typescript
// lib/agents/execution-agent.ts:119
async handleError(taskId: string, errorMessage: string, errorType: string) {
  const errorSignature = this.createErrorSignature(taskId, errorMessage); // SHA256 hash
  const sessionManager = ExecutionSessionManager.getInstance();
  
  await sessionManager.incrementRetryCounter(this.config.sessionId, errorSignature);
  
  const { shouldPause, reason } = await sessionManager.checkRetryLimit(
    this.config.sessionId, 
    errorSignature
  );
  
  if (shouldPause) {
    await sessionManager.pauseSession(this.config.sessionId);
    this.pause();
    return false;
  }
  
  return true; // Продолжить выполнение
}
```

---

## Phase 3: Quality Assurance (QA & Feedback Loop)

### 3.1 QA Agent Flow

**Обработка QA_REQUEST:**
```typescript
// lib/agents/qa.ts:32
export async function verifyTaskCompletion(taskId: string, reportContent: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { 
      plan: { include: { project: true } },
      comments: { orderBy: { createdAt: "desc" }, take: 5 }
    }
  });
  
  const vc = task.verificationCriteria as {
    artifacts?: string[];
    manualCheck?: string;
    automatedCheck?: string;
  };
  
  // 1. GSD Goal-Backward Verification Protocol
  const system = `You are a strict QA Specialist following GSD methodology.
  
  ### CRITICAL RUNTIME CONTEXT
  - You are running inside a Docker Container.
  - The Code is on User's Host Machine.
  - YOU DO NOT HAVE DIRECT ACCESS TO THE FILE SYSTEM.
  
  ### GSD VERIFICATION PROTOCOL
  
  #### STEP 1: READ VERIFICATION CRITERIA
  Extract verificationCriteria from task:
  - **Artifacts**: File paths that must exist
  - **automatedCheck**: Commands that must succeed (tests, builds)
  - **manualCheck**: What must be verified manually
  
  #### STEP 2: COLLECT EVIDENCE FROM REPORT
  For each criteria point, search for evidence:
  
  **A. For Artifacts:**
  - Look for \`ls -la\` output showing file exists
  - Look for full file content in report (code blocks)
  - Look for file creation logs
  
  **B. For automatedCheck:**
  - Look for test execution logs (PASS, ✓, All tests passed)
  - Look for build success messages
  - Look for command output from specified automatedCheck
  
  **C. For manualCheck:**
  - Look for textual confirmation ("I verified X", "Y works as expected")
  - Look for screenshot descriptions
  
  #### STEP 3: VALIDATE EVIDENCE
  - **Artifacts**: Sufficient if file is mentioned OR full content shown OR ls output shows it
  - **automatedCheck**: Sufficient if logs show successful execution OR no errors
  - **manualCheck**: Sufficient if user explicitly confirms OR describes expected behavior
  
  #### STEP 4: MAKE DECISION
  **APPROVE (status: "APPROVED"):**
  - ALL verificationCriteria points have sufficient evidence
  - No visible syntax/logic errors
  - No errors in logs
  
  **REJECT (status: "REJECTED"):**
  - AT LEAST ONE verificationCriteria point has NO evidence
  - Evidence contradicts criteria
  - Visible syntax/logic errors
  
  ### HEADLESS / DOCKER: manualCheck requiring browser
  - Executor runs in a container/headless environment. It CANNOT open a real browser.
  - If **Artifacts** and **automatedCheck** BOTH have sufficient evidence, and **manualCheck** ONLY requires "open in browser", "screenshot", or "visual confirmation", then **APPROVE**.
  - In reasoning, state: manualCheck requires browser/visual verification which is not available — deferred to user.
  
  ### TICKET RUN: automatedCheck skipped
  - If report contains **"[Ticket run]"** and states that **"automatedCheck from the original task was skipped"**, do NOT require automatedCheck evidence.
  - APPROVE when: (1) Artifacts have evidence, and (2) report describes implementation.
  - The original automatedCheck may fail on modified output (e.g., HTML with spans); that is expected.
  `;
  
  const prompt = `
    ${projectStateContext}
    
    === TASK INFORMATION ===
    Task Title: ${task.title}
    Description: ${task.description}
    
    === VERIFICATION CRITERIA (from Architect) ===
    ${vc.artifacts ? `[Artifacts]\nExpected files:\n${vc.artifacts.map(a => `  - ${a}`).join('\n')}` : ''}
    ${vc.manualCheck ? `[manualCheck]\n${vc.manualCheck}` : ''}
    ${vc.automatedCheck ? `[automatedCheck]\n${vc.automatedCheck}` : ''}
    
    === EXECUTOR REPORT (evidence) ===
    ${reportContent}
    
    Follow GSD Verification Protocol to decide if this task is COMPLETE.
    
    **CRITICAL RULE**: If ANY criteria point has NO evidence in report — REJECT with:
    "Verification Failed. Missing evidence for: [criteria name]. Please provide [specific evidence needed]."
  `;
  
  // 2. Вызов LLM для QA
  const result = await generateText({
    model,
    system,
    prompt,
    tools: createAgentTools(project.id),
    temperature: 0.1
  });
  
  // 3. Парсинг результата
  const qaResult = qaVerificationSchema.parse(JSON.parse(result.text));
  const { status, reasoning, confidence } = qaResult;
  
  // 4. Double-check для низкоуверенного REJECTED
  const LOW_CONFIDENCE_THRESHOLD = 0.7;
  if (status === "REJECTED" && confidence < LOW_CONFIDENCE_THRESHOLD) {
    const second = await generateText({
      system,
      prompt: prompt + "\n\n[SECOND OPINION] Re-evaluate. If evidence is borderline, prefer APPROVED."
    });
    const secondResult = qaVerificationSchema.parse(JSON.parse(second.text));
    if (secondResult.status === "APPROVED") {
      // Используем second opinion
      await addSystemComment(taskId, "✅ После повторной проверки: решение изменено на APPROVED.\n\n" + secondResult.reasoning);
      return { ...secondResult, finalStatus: project.requireApproval ? "WAITING_APPROVAL" : "DONE" };
    }
  }
  
  // 5. Вычисление finalStatus
  const computedFinalStatus = status === "APPROVED"
    ? project.requireApproval ? "WAITING_APPROVAL" : "DONE"
    : "REJECTED";
  
  // 6. Обновление статуса задачи
  await prisma.task.update({
    where: { id: taskId },
    data: { status: computedFinalStatus }
  });
  
  // 7. Debug Summary при REJECTED
  if (status === "REJECTED") {
    const debugSummary = await analyzeRejectReason({
      projectId: project.id,
      taskId,
      qaReasoning: reasoning,
      verificationCriteria: vc,
      executorReport: reportContent
    });
    
    await prisma.comment.create({
      data: {
        taskId,
        content: `🐛 Debug Summary (GSD)\n\n<symptoms>\nexpected: ${debugSummary.symptoms.expected}\nactual: ${debugSummary.symptoms.actual}\nmissing_evidence: ${debugSummary.symptoms.missing_evidence}\n</symptoms>`,
        authorRole: "QA"
      }
    });
  }
  
  return {
    taskId,
    status, // APPROVED | REJECTED
    finalStatus, // DONE | WAITING_APPROVAL | REJECTED
    reasoning,
    confidence
  };
}
```

### 3.2 TeamLead Agent Flow

**Обработка QA_RESPONSE:**
```typescript
// lib/agents/team-lead-agent.ts:36
async handleQAResponse(message: AgentMessage) {
  const { taskId, finalStatus, ticketId } = message.payload;
  
  // 1. Обновление статуса тикета (если есть)
  if (ticketId) {
    const ticketStatus = finalStatus === "DONE" ? "DONE" : "REJECTED";
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: ticketStatus }
    });
  }
  
  // 2. Trigger следующей задачи (если DONE)
  if (finalStatus === "DONE" && !ticketId) {
    await this.triggerNextTask(taskId);
  }
  
  // 3. Quick Review (replan) для следующих задач
  const result = await quickReview(projectId, taskId);
  // Если нужно обновить следующие 2 задачи - обновляет их description
  
  return { acknowledged: true };
}
```

### 3.3 Ticket System Flow

**Создание тикета:**
```typescript
// app/api/tickets/route.ts:34
export async function POST(request: Request) {
  const { projectId, title, description, relatedTaskId } = body;
  
  // Создается вручную пользователем через UI
  const ticket = await prisma.ticket.create({
    data: {
      projectId,
      title,
      description,
      relatedTaskId,
      status: "OPEN"
    }
  });
  
  return { success: true, ticket };
}
```

**Обработка тикета воркером:**
```typescript
// app/api/execution-sessions/run/route.ts:71
if (openTickets.length > 0) {
  const ticket = openTickets[0];
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: "IN_PROGRESS" }
  });
  
  const result = await agent.executeTicket(currentTicket);
  const nextStatus = result.success ? "DONE" : "REJECTED";
  
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: nextStatus }
  });
  
  return; // Один ticket за run
}
```

**Статусы Ticket:**
- `OPEN`: Создан, ожидает обработки
- `IN_PROGRESS`: Обрабатывается агентом
- `DONE`: Успешно выполнен (QA approved)
- `REJECTED`: Отклонен QA

### 3.4 Статусы Task (State Machine)

```
┌─────────────────────────────────────────────────────────┐
│  TODO                                                  │
│  ├─ IN_PROGRESS (при запуске выполнения)             │
│  │     ├─ DONE (если QA APPROVED и !requireApproval)│
│  │     ├─ WAITING_APPROVAL (если QA APPROVED и   │
│  │     │    requireApproval=true)                         │
│  │     │     ├─ DONE (если пользователь approved)   │
│  │     │     └─ REVIEW (если пользователь rejected)  │
│  │     └─ REJECTED (если QA REJECTED)             │
│  │           └─ TODO (при quick review/replan)       │
│  └─ REVIEW (если критический crash)                    │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 4: Reflection (Живые Инсайты)

### 4.1 Reflexologist Agent Flow

**Запуск рефлексологии:**
```typescript
// lib/agents/reflexologist.ts:34
export async function runReflexologistForSession(options: RunReflexologistOptions) {
  const { projectId, sessionId, planId, mode = "final", maxInsights = 3 } = options;
  
  const session = await prisma.executionSession.findUnique({
    where: { id: sessionId },
    include: { project: true }
  });
  
  // 1. Сбор данных за последний час
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  const logs = await prisma.executionLog.findMany({
    where: {
      sessionId,
      createdAt: { gte: oneHourAgo }
    },
    orderBy: { createdAt: "asc" },
    take: 150
  });
  
  const planTasks = planId
    ? await prisma.task.findMany({
        where: { planId },
        select: { id: true, title: true }
      })
    : [];
  
  const taskIds = planTasks.map(t => t.id);
  
  const comments = taskIds.length > 0
    ? await prisma.comment.findMany({
        where: { taskId: { in: taskIds } },
        orderBy: { createdAt: "asc" },
        take: 100
      })
    : [];
  
  // 2. Экстракция QA outcomes
  const qaOutcomes = logs
    .filter(log => (log.metadata as any)?.eventType === "task_qa_completed")
    .map(log => ({
      taskId: (log.metadata as any).data?.taskId,
      status: (log.metadata as any).data?.status,
      message: log.message
    }));
  
  const qaAndDevopsComments = comments.filter(c =>
    ["QA", "DEVOPS"].includes(c.authorRole as string)
  );
  
  const metadata = (session.metadata as Record<string, any>) || {};
  const retrySummary = {
    retryCounter: metadata.retryCounter ?? {},
    lastErrorSignature: metadata.lastErrorSignature ?? null
  };
  
  // 3. Проверка сигналов для incremental mode
  const hasSignals =
    qaOutcomes.length > 0 ||
    Object.keys(retrySummary.retryCounter || {}).length > 0 ||
    logs.some(l => l.type === "error");
  
  if (!hasSignals && mode === "incremental") {
    console.log("[Reflexologist] Skipping incremental run – no strong signals");
    return;
  }
  
  // 4. Формирование контекста для LLM
  const executionContext = {
    projectId,
    sessionId,
    planId: planId ?? session.planId ?? null,
    mode,
    logsSummary: logs.map(log => {
      const eventType = (log.metadata as any)?.eventType ?? "unknown";
      const type = log.type;
      const ts = log.createdAt.toISOString();
      const msg = log.message.length > 400 ? log.message.slice(0, 397) + "..." : log.message;
      return `[${ts}] [${eventType}] [${type}] ${msg}`;
    }),
    qaOutcomes,
    retrySummary,
    commentsSummary: qaAndDevopsComments.map(c => {
      const ts = c.createdAt.toISOString();
      const role = c.authorRole;
      const content = c.content.length > 600 ? c.content.slice(0, 597) + "..." : c.content;
      return `[${ts}] [${role}] ${content}`;
    })
  };
  
  // 5. Вызов LLM для генерации инсайтов
  const systemPrompt = `You are a Senior Staff Engineer analyzing development execution logs.
  
  Your job:
  - Identify NON-OBVIOUS, HIGH-LEVEL, REUSABLE INSIGHTS about development workflow, tooling, or verification process.
  - Focus on ROOT CAUSES and SYSTEMIC PATTERNS, not single failures.
  
  Very important rules:
  1) DO NOT restate obvious facts like "Task failed" or "QA rejected task".
  2) DO NOT describe individual logs or events.
  3) ONLY produce insights that can improve FUTURE runs across many projects.
  4) Prefer patterns that appear multiple times (e.g. repeated errors, repeated QA rejections for similar reasons).
  5) If available data is noisy or insufficient, you MUST return an empty array.
  
  Output MUST be JSON array with 0-${maxInsights} objects.
  Each object:
  - "title": short human-readable name
  - "summary":2-4 sentences explaining pattern and root cause
  - "category": ["TOOLING", "WORKFLOW", "QA_PROCESS", "ARCHITECTURE", "DOCUMENTATION", "MISC"]
  - "severity": ["low", "medium", "high"]
  - "appliesTo": { projectId, planId?, sessionId? }
  - "recommendation":2-5 sentences with specific improvements
  - "fingerprint": stable identifier (e.g. "writeFile-missing-parent-dir")
  - "tags": array of short tags
  `;
  
  const userPrompt = `Here is structured execution context as JSON:\n\n${JSON.stringify(executionContext, null, 2)}\n\nAnalyze and return insights array.`;
  
  const resolvedProvider = resolveProvider(project.aiProvider || undefined);
  const resolvedModel = project.aiModel || "gpt-4o-mini";
  
  let rawText: string;
  if (resolvedProvider === "zai") {
    rawText = await generateTextZai({
      systemPrompt,
      userMessage: userPrompt,
      model: resolvedModel,
      temperature: 0.1,
      maxTokens: 2048
    });
  } else {
    const result = await generateText({
      model: getModel(resolvedProvider, resolvedModel),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.1,
      maxTokens: 2048
    });
    rawText = result.text ?? "";
  }
  
  // 6. Парсинг инсайтов
  const cleaned = rawText.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/m, "$1").trim();
  const parsed = InsightArraySchema.parse(JSON.parse(cleaned));
  
  if (parsed.length === 0) {
    console.log("[Reflexologist] LLM returned no insights");
    return;
  }
  
  // 7. Сохранение уникальных инсайтов (по fingerprint)
  let createdCount = 0;
  for (const insight of parsed) {
    const fingerprint = insight.fingerprint || `${insight.category}:${insight.title}`.toLowerCase().slice(0, 120);
    
    const existing = await prisma.globalInsight.findFirst({
      where: { projectId, fingerprint }
    });
    
    if (existing) continue; // Skip duplicates
    
    await prisma.globalInsight.create({
      data: {
        projectId,
        planId: planId ?? session.planId ?? undefined,
        sessionId,
        title: insight.title,
        content: insight.summary,
        category: insight.category,
        severity: insight.severity,
        recommendation: insight.recommendation,
        fingerprint,
        tags: insight.tags ?? []
      }
    });
    
    createdCount++;
  }
  
  // 8. Логирование результатов
  await prisma.executionLog.create({
    data: {
      sessionId,
      type: "info",
      message: `[Reflexologist] Generated ${createdCount} insights (${mode} run)`,
      metadata: {
        eventType: "reflexologist_run",
        data: { projectId, sessionId, planId, mode, count: createdCount }
      }
    }
  });
}
```

**Триггеры запуска:**
1. **Incremental mode:** Каждые 5 задач в Legacy Worker (`run/route.ts:299-307`)
2. **Final mode:** При завершении всех задач (`run/route.ts:405-418`, `run-ahp/route.ts:304-318`)

### 4.2 Global Insights

**Модель GlobalInsight:**
```prisma
model GlobalInsight {
  id            String   @id @default(cuid())
  content       String   @db.Text
  tags          String[]
  embedding     String?  @db.Text
  projectId     String?
  project       Project? @relation(...)
  planId        String?
  sessionId     String?
  category      String?
  severity      String?
  fingerprint   String?  @unique
  title         String?
  recommendation String?  @db.Text
  createdAt     DateTime @default(now())
}
```

**Использование в декомпозиции:**
```typescript
// app/api/decompose-idea/route.ts:92-93
async function buildSystemPrompt(ideaText: string, baseProjectId: string | null) {
  const globalInsights = await searchGlobalInsights(ideaText, 5);
  
  if (globalInsights.length === 0) {
    return basePrompt;
  }
  
  const insightsText = globalInsights
    .map((insight, i) => `${i + 1}. ${insight.content} (tags: ${insight.tags.join(", ")})`)
    .join("\n");
  
  return `${basePrompt}
  
  УЧИТ ОПЫТ ПРОШЛЫХ ПРОЕКТОВ:
  ${insightsText}
  
  Не повторяй старых ошибок и учись на предыдущем опыте!`;
}
```

---

## ФИНАЛЬНЫЙ БЛОК: Уязвимые места для тестирования

### 1. **LLM JSON Parsing** (Критично!)

**Где:**
- `app/api/decompose-idea/route.ts:234` - парсинг планов из LLM
- `app/api/generate-tasks/route.ts:164` - парсинг задач
- `lib/agents/task-executor-agent.ts:158` - парсинг execution plan
- `lib/agents/qa.ts:303` - парсинг QA результата

**Проблемы:**
- LLM может вернуть невалидный JSON
- JSON может содержать markdown блоки
- Типы данных могут не соответствовать схеме
- Retry логика сложная (до 3 попыток)

**Тесты:**
- `test:LLMResponseParsing` - мок-ответы с невалидным JSON
- `test:RetryLogic` - проверка что retry работает корректно
- `test:SchemaValidation` - Zod схемы catch все invalid responses

### 2. **Shell Command Execution & Verification** (Критично!)

**Где:**
- `lib/agents/tools.ts:286` - `createCloudExecuteCommandTool`
- `lib/agents/tools.ts:175` - `createExecuteCommandTool` (sync client)
- `lib/agents/task-executor-agent.ts:248` - создание `.ai-temp-check.sh`
- `lib/agents/task-executor-agent.ts:256` - `ls -la` для artifacts

**Проблемы:**
- Команды могут зависать (timeout 120s)
- Специальные символы в командах (quotes, `!`, `$`) ломают shell escaping
- `ls -la` может не показать файл если права не те
- `.ai-temp-check.sh` может не создаться или не выполниться
- Headless/Docker ограничения (нет доступа к localhost:3000)

**Тесты:**
- `test:CommandEscaping` - команды с спецсимволами
- `test:ArtifactVerification` - проверка файлов которые не существуют
- `test:AutomatedCheckFailure` - команды которые возвращают exit code != 0
- `test:TimeoutHandling` - команды которые зависают
- `test:HeadlessLimitations` - проверка что QA корректно обрабатывает отсутствие доступа к browser/localhost

### 3. **Database Transactions & Race Conditions** (Критично!)

**Где:**
- `app/api/generate-tasks/route.ts:197` - создание задач + зависимостей
- `lib/agents/task-executor-agent.ts:249` - обновление task + создание comments
- `app/api/execution-sessions/run-ahp/route.ts:151` - обновление task status + создание message

**Проблемы:**
- Concurrent updates к одной задаче
- Deadlock в транзакциях
- Отсутствие UNIQUE constraint на (taskId, dependsOnId)
- Race condition между `findNextTask` и `task.update(IN_PROGRESS)`

**Тесты:**
- `test:ConcurrentTaskUpdates` - 2 воркера пытаются обновить одну задачу
- `test:TransactionRollback` - частичный rollback транзакции
- `test:DependencyGraphIntegrity` - циклические зависимости
- `test:TaskStatusTransition` - невозможные переходы (DONE → TODO без approve)

### 4. **QA Verification Logic** (Высокий приоритет)

**Где:**
- `lib/agents/qa.ts:32` - `verifyTaskCompletion`
- `lib/agents/qa.ts:308` - double-check для low-confidence REJECTED
- `lib/agents/qa.ts:363` - debug summary generation

**Проблемы:**
- False negatives: QA отклоняет валидные задачи
- False positives: QA approves невалидные задачи
- Headless exception не срабатывает корректно
- Ticket run exception сложная для понимания QA
- Manual check требует "открыть браузер" в headless среде

**Тесты:**
- `test:QAArtifactEvidence` - artifacts есть в отчете (ls -la, file content)
- `test:QAAutomatedCheckEvidence` - test/build logs показывают PASS
- `test:QAManualCheckHeadless` - manual check требует browser
- `test:QATicketRunException` - ticket run пропускает automatedCheck
- `test:QALowConfidenceRetry` - double-check меняет REJECTED на APPROVED
- `test:QAFalseNegative` - отклонение валидной задачи

### 5. **Message Bus & Agent Coordination** (Средний приоритет)

**Где:**
- `lib/agents/task-executor-agent.ts:24` - `handleTaskRequest`
- `lib/agents/task-executor-agent.ts:397` - `handleTicketRequest`
- `lib/execution/agent-factory.ts:8` - `createAgentForRole`

**Проблемы:**
- Message может быть PENDING бесконечно
- Agent не получает сообщения (network timeout)
- CorrelationId mismatch между запросом и ответом
- Deadlock между агентами (A → B → A)

**Тесты:**
- `test:MessageDelivery` - сообщение не доходит до агента
- `test:CorrelationIdMismatch` - ответ не соответствует запросу
- `test:AgentDeadlock` - два агента ожидают друг друга
- `test:MessageTimeout` - агент обрабатывает слишком долго

---

## Приоритеты тестирования (P0 - P3)

| Приоритет | Уязвимое место | Почему критично | Тип тестов |
|-----------|------------------|-----------------|-------------|
| **P0** | LLM JSON Parsing | Блокирует всю систему если парсинг fails | Integration |
| **P0** | Shell Command Execution | Блокирует выполнение задач, может повредить проект | Integration |
| **P1** | Database Transactions | Коррумпирует состояние БД, race conditions | Integration + Unit |
| **P1** | QA Verification Logic | False positives/negatives блокируют pipeline | Integration |
| **P2** | Message Bus Coordination | Редкие deadlock scenarios, сложно воспроизвести | Integration |
| **P3** | Reflexologist Insights | Не блокирует, но ухудшает качество новых проектов | Unit + Integration |

---

## Дополнительные наблюдения

### A. Различия между Legacy и AHP Worker

| Аспект | Legacy Worker | AHP Worker |
|--------|---------------|--------------|
| Архитектура | Монолитный ExecutionAgent | Распределенная система агентов |
| Message passing | Прямые вызовы методов | Через AgentMessage bus |
| Параллелизм | Последовательный (по задачам) | Параллельный (по агентам) |
| Error handling | try-catch в worker | retryCounter в SessionManager |
| Ticket handling | Один ticket за run | Через message bus |

### B. Verification Criteria Generation

**Место генерации:** `app/api/generate-tasks/route.ts:95-127`

**Поля:**
```typescript
verificationCriteria: {
  artifacts: string[],      // Пути к файлам: ["src/app/api/auth/route.ts"]
  manualCheck: string,      // "Open localhost:3000, click Login button"
  automatedCheck: string,   // "npm run test", "npm run build"
}
```

**Использование:**
- Architect генерирует при создании задач
- TaskExecutor проверяет artifacts (ls -la, head -n 200)
- TaskExecutor выполняет automatedCheck (.ai-temp-check.sh)
- QA проверяет что все 3 поля имеют evidence в отчете

### C. Error Signatures & Retry Logic

**Signature:** `SHA256(taskId:errorMessage).substring(0, 16)`

**Правила:**
1. Если retries > 3 для одной ошибки → PAUSE
2. Если та же ошибка 2 раза подряд → PAUSE (infinite loop)
3. Иначе → increment retry counter и продолжить

**Применение:**
- `ExecutionAgent.handleError` (tools.ts:154)
- `handleCommandError` (tools.ts:154)
- `SessionManager.checkRetryLimit` (session-manager.ts:196)

---

## Заключение

Система `ai-orchestrator` представляет собой сложный пайплайн из 4 фаз:

1. **Inception:** Идея → 3 плана → выбранный план → N задач с зависимостями
2. **Dispatch:** Execution Session (Legacy или AHP) выбирает и выполняет задачи
3. **QA:** Goal-Backward Verification проверяет artifacts, automatedCheck, manualCheck
4. **Reflection:** Reflexologist генерирует инсайты для улучшения будущих проектов

**Критичные choke points:**
1. LLM JSON Parsing (любое изменение в LLM ответе ломает систему)
2. Shell Command Execution (timeout, escaping, permissions)
3. Database Transactions (race conditions, deadlock)
4. QA Verification Logic (false positives/negatives блокируют progress)

**Рекомендации по тестированию:**
- Начать с P0 (LLM parsing, Shell execution)
- Добавить mock слои для LLM и shell commands
- Использовать transaction rollback тесты
- Создать edge case scenarios для QA (headless, ticket run, low-confidence)
- Добавить load testing для message bus

---

**Общее количество проанализированных файлов:** 70+  
**Количество моделей Prisma:** 10 (Project, Plan, Task, Ticket, ExecutionSession, AgentMessage, GlobalInsight, TaskDependency, Comment, ExecutionLog)  
**Количество агентов:** 3 (TaskExecutorAgent, QAAgent, TeamLeadAgent)  
**Количество воркеров:** 2 (Legacy, AHP)
