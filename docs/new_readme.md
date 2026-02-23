# AI Orchestrator - Полная документация системы

## 📋 Содержание

1. [Введение и обзор проекта](#введение-и-обзор-проекта)
2. [Архитектура системы](#архитектура-системы)
3. [Агенты системы](#агенты-системы)
4. [RAG система](#rag-система)
5. [QA система](#qa-система)
6. [Полный процесс выполнения проекта](#полный-процесс-выполнения-проекта)
7. [Типы сообщений и коммуникация](#типы-сообщений-и-коммуникация)
8. [Инструменты агентов](#инструменты-агентов)
9. [Execution Modes](#execution-modes)
10. [Обработка ошибок и retry логика](#обработка-ошибок-и-retry-логика)
11. [API Endpoints](#api-endpoints)
12. [Датамодели](#датамодели)
13. [Технологический стек](#технологический-стек)

---

## Введение и обзор проекта

### Назначение системы

**AI Orchestrator** — это сложная многоагентная AI система для автоматизированной разработки программного обеспечения. Система способна:

- Принимать идеи проектов от пользователей
- Автоматически генерировать планы реализации
- Разбивать планы на конкретные задачи с зависимостями
- Выполнять задачи автономно через распределенных агентов
- Проверять качество выполненной работы с помощью строгого QA
- Учиться на ошибках через RAG (Retrieval-Augmented Generation)
- Создавать баг-тикеты для исправления ошибок
- Автоматически исправлять ошибки и повторять попытки

### Ключевые особенности

| Особенность | Описание |
|------------|-----------|
| **Agent Hive Protocol (AHP)** | Распределенные агенты сотрудничают асинхронно через центральный Message Bus |
| **Strict Gating** | Задачи (и их баг-тикеты) должны пройти QA проверку перед продолжением |
| **Long-Term Memory (RAG)** | Past failures (Global Insights) векторизуются и инжектируются в промпты для предотвращения повторных ошибок |
| **Self-Correction** | Агенты могут автономно идентифицировать, логировать и создавать тикеты для багов, затем исправлять их на основе QA обратной связи |
| **Dual Execution Modes** | AHP (параллельное выполнение) vs Legacy (последовательное выполнение) |
| **Human-in-the-Loop** | Необязательное одобрение команд, ручной review |

### Технологический стек

```
Frontend:     Next.js 14 (App Router)
Backend:      Next.js API Routes
Database:     PostgreSQL с pgvector (векторный поиск)
ORM:          Prisma
AI Providers:  OpenAI, Anthropic, Z.ai
Embeddings:   OpenAI text-embedding-3-small (1536 dimensions)
Type System:   TypeScript
Styling:      Tailwind CSS + shadcn/ui
```

---

## Архитектура системы

### Agent Hive Protocol (AHP)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Hive Protocol                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────┐
         │       Message Bus (Database)       │
         │     - AgentMessage table           │
         │     - Async communication          │
         │     - Status tracking            │
         └──────────────────────────────────────┘
                    │           │           │
        ┌───────────┘           │           └───────────┐
        ▼                       ▼                       ▼
  ┌──────────┐         ┌────────────┐         ┌──────────┐
  │TEAMLEAD │         │TASK_EXECUTOR│         │   QA     │
  └──────────┘         └────────────┘         └──────────┘
        ▲                       ▲                       ▲
        │                       │                       │
        └───────────────────────────────────────────────┘
```

### Компоненты архитектуры

```
ai-orchestrator/
├── app/                          # Next.js App Router
│   ├── api/                       # API Routes
│   │   ├── execution-sessions/      # Авто-execution endpoints
│   │   ├── projects/              # Project CRUD
│   │   ├── tasks/                 # Task management
│   │   ├── tickets/               # Bug tracking
│   │   ├── decompose-idea/        # Idea → Plans
│   │   ├── generate-tasks/        # Plan → Tasks
│   │   ├── sync/                  # File sync
│   │   ├── insights/              # Global insights (RAG)
│   │   └── ai-agent/             # Unified AI endpoint
│   ├── project/[id]/              # Project detail pages
│   └── admin/                    # Admin dashboard
├── components/                    # React Components
│   ├── StartExecutionModal.tsx    # "Start Auto Execute" modal
│   ├── ExecutionConsole.tsx       # Real-time execution logs
│   ├── TaskListClient.tsx         # Task board
│   └── AgentStreamPanel.tsx       # Agent communication view
├── lib/                          # Core Logic
│   ├── agents/                    # Agent implementations
│   │   ├── base-agent.ts          # Base class for all agents
│   │   ├── team-lead-agent.ts     # Orchestrator
│   │   ├── task-executor-agent.ts # Task execution
│   │   ├── qa-agent.ts            # Quality assurance
│   │   ├── css-agent.ts           # CSS styling
│   │   ├── reflexologist.ts       # Learning system
│   │   ├── architect.ts           # Planning & replanning
│   │   ├── tools.ts              # Agent tools
│   │   └── prompt-generator.ts    # Prompt generation
│   ├── execution/                  # Execution system
│   │   ├── message-bus.ts         # Async message passing
│   │   ├── agent-factory.ts       # Agent creation
│   │   ├── session-manager.ts     # Session lifecycle
│   │   ├── file-logger.ts        # File logging
│   │   └── sse-store.ts          # Server-sent events
│   ├── rag/                       # RAG implementation
│   │   ├── index.ts              # Main RAG pipeline
│   │   ├── search.ts             # Semantic search
│   │   ├── embeddings.ts         # Embedding generation
│   │   ├── chunk.ts             # Text chunking
│   │   └── store.ts             # Vector DB operations
│   ├── ai/                        # AI providers
│   │   ├── providers.ts          # OpenAI/Anthropic/Z.ai
│   │   └── call.ts              # Usage tracking
│   └── sync/                      # File synchronization
├── prisma/                       # Database schema
│   └── schema.prisma             # Complete data model
└── projects/                      # Generated project code
```

### Flow данных через систему

```
┌─────────────┐    1. Idea    ┌─────────────┐
│   User     │──────────────►│  Architect  │
└─────────────┘              └──────┬──────┘
                                   │ 2. Plans
                                   ▼
                            ┌─────────────┐
                            │  Architect  │
                            └──────┬──────┘
                                   │ 3. Tasks
                                   ▼
                            ┌─────────────┐
                            │  TeamLead   │
                            └──────┬──────┘
                                   │ 4. TASK_REQUEST
                                   ▼
                            ┌─────────────┐
                            │  Executor   │
                            └──────┬──────┘
                                   │ 5. QA_REQUEST
                                   ▼
                            ┌─────────────┐
                            │     QA     │
                            └──────┬──────┘
                                   │ 6. QA_RESPONSE
                                   ▼
                            ┌─────────────┐
                            │  TeamLead   │
                            └─────────────┘
                                   │
                     7a. APPROVED → Next task
                     7b. REJECTED → TICKET_REQUEST
                                   ▼
                            ┌─────────────┐
                            │  Executor   │
                            └──────┬──────┘
                                   │ 8. Fix & QA_REQUEST
                                   ▼
                            ┌─────────────┐
                            │     QA     │
                            └──────┬──────┘
                                   │ 9. Final QA_RESPONSE
                                   ▼
                            ┌─────────────┐
                            │  TeamLead   │
                            └──────┬──────┘
                                   │ 10. Reflexologist
                                   ▼
                            ┌─────────────┐
                            │ GlobalInsight│
                            └─────────────┘
```

---

## Агенты системы

### 1. TEAMLEAD (Оркестратор)

**Файл:** `lib/agents/team-lead-agent.ts`

**Ответственность:** Управляет потоком задач, отправляет `TASK_REQUEST` / `TICKET_REQUEST`, обрабатывает `QA_RESPONSE`

**Коммуникационные цели:**
- Отправляет: `TASK_REQUEST` → TASK_EXECUTOR
- Отправляет: `TICKET_REQUEST` → TASK_EXECUTOR
- Получает: `QA_RESPONSE` от QA
- Получает: `STYLE_RESPONSE` от CSS
- Отправляет: `ARCHITECT_REQUEST` → ARCHITECT (опционально)

**Основные функции:**

```typescript
class TeamLeadAgent extends BaseAgent {
  // Обработка QA результата
  private async handleQAResponse(message: AgentMessage) {
    const { taskId, finalStatus, ticketId, reasoning } = message.payload;

    if (finalStatus === "DONE") {
      if (ticketId) {
        // Закрываем тикет
        await prisma.ticket.update({
          where: { id: ticketId },
          data: { status: "DONE" }
        });
      } else {
        // Запускаем следующую задачу
        await this.triggerNextTask(taskId);
      }
    } else if (finalStatus === "REJECTED") {
      if (ticketId) {
        // Повторный запуск тикета (max 3 попыток)
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
        if (ticket.retryCount < 3) {
          await prisma.ticket.update({
            where: { id: ticketId },
            data: {
              status: "OPEN",
              retryCount: ticket.retryCount + 1,
              description: ticket.description + "\n\n--- FAILED QA RETRY ---\n" + reasoning
            }
          });
        } else {
          await prisma.ticket.update({
            where: { id: ticketId },
            data: { status: "REJECTED" }
          });
        }
      } else {
        // Создаем новый баг-тикет
        await prisma.ticket.create({
          data: {
            projectId,
            relatedTaskId: taskId,
            title: `QA Rejection: ${task.title}`,
            description: reasoning,
            status: "OPEN"
          }
        });
      }
    }
  }

  // Запуск следующей задачи
  private async triggerNextTask(completedTaskId: string) {
    const completedTask = await prisma.task.findUnique({
      where: { id: completedTaskId },
      select: { planId: true }
    });

    const nextTask = await prisma.task.findFirst({
      where: {
        planId: completedTask.planId,
        status: "TODO"
      },
      orderBy: { createdAt: "asc" }
    });

    if (nextTask) {
      await this.sendMessage(
        nextTask.executorAgent || AgentRole.TASK_EXECUTOR,
        MessageType.TASK_REQUEST,
        { taskId: nextTask.id }
      );
    }
  }
}
```

**Типичные действия:**
- Прием результата QA (APPROVED/REJECTED)
- Управление состоянием тикетов
- Создание новых тикетов при REJECT без существующего тикета
- Запуск следующей задачи после APPROVED

---

### 2. TASK_EXECUTOR (Исполнитель задач)

**Файл:** `lib/agents/task-executor-agent.ts`

**Ответственность:** Генерирует планы выполнения, выполняет задачи, отправляет `QA_REQUEST`

**Коммуникационные цели:**
- Получает: `TASK_REQUEST` от TEAMLEAD
- Получает: `TICKET_REQUEST` от TEAMLEAD
- Отправляет: `QA_REQUEST` → QA
- Отправляет: `STYLE_REQUEST` → CSS (для CSS файлов)

**Основные функции:**

```typescript
class TaskExecutorAgent extends BaseAgent {
  // Обработка запроса на выполнение задачи
  private async handleTaskRequest(message: AgentMessage) {
    const { taskId } = message.payload;

    // 1. Загружаем задачу
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { plan: { include: { project: true } } }
    });

    // 2. Генерируем детальный промпт (если нет)
    let instructions = task.generatedPrompt || await generateTaskPrompt(taskId);

    // 3. Получаем контекст проекта
    const projectContext = await getCompactProjectContext(projectId);

    // 4. Создаем инструменты
    const tools = createAgentTools(projectId, sessionId, mode);

    // 5. Генерируем план выполнения через LLM
    const planSystemPrompt = `You are an experienced software engineer...
    Available tools: executeCommand, readFile, writeFile, searchKnowledge, webSearch.
    CRITICAL RULES:
    - NO PLACEHOLDERS: No "// rest of code", "<!-- existing code -->", "..."
    - FULL OVERWRITE: writeFile OVERWRITES entire file
    - READ BEFORE WRITE: Must readFile before modifying existing file
    - PATH FORMAT: No "./" prefixes, use relative paths
    `;

    const aiResult = await generateText({
      model: getModel(provider, model),
      system: planSystemPrompt,
      prompt: `Create an execution plan for: ${task.title}\nInstructions: ${instructions}`,
      temperature: 0.1,
      maxTokens: 4000
    });

    // 6. Парсим план JSON
    const plan = JSON.parse(aiResult.text);
    // { "steps": [ { "thought": "..." }, { "toolName": "writeFile", "params": {...} }, ... ] }

    // 7. Выполняем шаги
    for (const step of plan.steps) {
      if (step.thought) {
        this.log("info", `🧠 ${step.thought}`);
      } else if (step.toolName) {
        const tool = tools[step.toolName];
        const result = await tool.execute(step.params);
        this.log("info", `✅ ${step.toolName} completed`);

        // Если CSS файл - делегируем CSS агенту
        if (step.toolName === "writeFile" && step.params.filePath.endsWith('.css')) {
          await this.sendMessage(
            AgentRole.CSS,
            MessageType.STYLE_REQUEST,
            { taskId, filePath: step.params.filePath, content: step.params.content }
          );
        }
      }
    }

    // 8. Фаза верификации
    const vc = task.verificationCriteria;
    if (vc) {
      // Запускаем ls -la для артефактов
      for (const artifact of vc.artifacts) {
        await tools.executeCommand.execute({
          command: `ls -la "${artifact}"`,
          reason: `Verify artifact: ${artifact}`
        });
        await tools.executeCommand.execute({
          command: `head -n 200 "${artifact}"`,
          reason: `Artifact content: ${artifact}`
        });
      }

      // Запускаем automatedCheck
      if (vc.automatedCheck) {
        await tools.executeCommand.execute({
          command: `cat > .ai-temp-check.sh << 'EOF'\n${vc.automatedCheck}\nEOF\nsh .ai-temp-check.sh`,
          reason: "Run automatedCheck"
        });
      }
    }

    // 9. Формируем отчет и отправляем QA
    const reportText = generateReport(results, verificationOutput);
    await this.sendMessage(
      AgentRole.QA,
      MessageType.QA_REQUEST,
      { taskId, report: reportText }
    );
  }

  // Обработка запроса на исправление бага (тикета)
  private async handleTicketRequest(message: AgentMessage) {
    const { ticketId, relatedTaskId } = message.payload;

    // 1. Загружаем тикет и оригинальную задачу
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    const originalTask = await prisma.task.findUnique({ where: { id: relatedTaskId } });

    // 2. Регенерируем промпт с учетом требований тикета
    const extraRequirement =
      `Ticket "${ticket.title}": ${ticket.description}\n` +
      `Adapt your instructions to address this requirement from the ticket.`;

    const instructions = await generateTaskPrompt(
      relatedTaskId,
      true,  // isRetry
      false, // isInteractive
      extraRequirement
    );

    // 3. Выполняем ту же логику, что и для обычной задачи
    // (генерация плана, выполнение шагов, верификация)

    // 4. Отправляем QA_REQUEST с ticketId в payload
    await this.sendMessage(
      AgentRole.QA,
      MessageType.QA_REQUEST,
      { taskId: relatedTaskId, report: reportText, ticketId }
    );
  }
}
```

**Типичный поток выполнения:**

```
1. Получаем TASK_REQUEST
   ↓
2. Загружаем задачу из БД
   ↓
3. Генерируем детальный промпт
   ↓
4. Получаем контекст проекта (RAG search)
   ↓
5. Генерируем план выполнения через LLM
   ↓
6. Выполняем шаги плана:
   - readFile (чтение существующих файлов)
   - writeFile (запись файлов)
   - executeCommand (npm install, npm test, npm run build, etc.)
   - searchKnowledge (RAG search в GlobalInsights)
   - webSearch (поиск документации)
   ↓
7. Для CSS файлов - делегируем CSS агенту
   ↓
8. Фаза верификации:
   - ls -la для каждого артефакта
   - head -n 200 для каждого артефакта
   - выполнение automatedCheck
   ↓
9. Формируем отчет с VERIFICATION EVIDENCE
   ↓
10. Отправляем QA_REQUEST
```

---

### 3. CSS (Стилист)

**Файл:** `lib/agents/css-agent.ts`

**Ответственность:** Анализирует и улучшает CSS, отправляет `STYLE_RESPONSE`

**Коммуникационные цели:**
- Получает: `STYLE_REQUEST` от TASK_EXECUTOR
- Отправляет: `STYLE_RESPONSE` → TASK_EXECUTOR

**Основные функции:**

```typescript
class CSSAgent extends BaseAgent {
  async processMessage(message: AgentMessage) {
    if (message.eventType !== MessageType.STYLE_REQUEST) return;

    const { taskId, filePath, content } = message.payload;

    // Анализируем CSS и предлагаем улучшения
    const improvedContent = await this.analyzeAndImproveCSS(content);

    await this.sendMessage(
      message.sourceAgent,
      MessageType.STYLE_RESPONSE,
      {
        taskId,
        filePath,
        improvedContent,
        reasoning: "Applied CSS best practices and improvements"
      }
    );
  }
}
```

---

### 4. QA (Quality Assurance)

**Файл:** `lib/agents/qa.ts`

**Ответственность:** Проверяет выполнение задачи с использованием **GSD (Goal-Backward Verification)** методологии

**Коммуникационные цели:**
- Получает: `QA_REQUEST` от TASK_EXECUTOR
- Отправляет: `QA_RESPONSE` → TEAMLEAD

**Основные функции:**

```typescript
async function verifyTaskCompletion(taskId: string, reportContent: string) {
  // 1. Загружаем задачу
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { plan: { include: { project: true } } }
  });

  const vc = task.verificationCriteria;
  // vc = {
  //   artifacts: ["src/app/page.tsx", "src/components/TodoList.tsx"],
  //   automatedCheck: "npm run build && npm test",
  //   manualCheck: "Open http://localhost:3000 and verify Todo list appears"
  // }

  // 2. GSD VERIFICATION PROTOCOL

  // STEP 1: READ VERIFICATION CRITERIA
  const requiredArtifacts = vc.artifacts || [];
  const requiredChecks = vc.automatedCheck;
  const requiredManual = vc.manualCheck;

  // STEP 2: COLLECT EVIDENCE FROM REPORT
  const hasArtifactEvidence = requiredArtifacts.every(artifact => {
    return reportContent.includes(artifact) ||
           reportContent.includes(`ls -la "${artifact}"`) ||
           reportContent.includes(`head -n 200 "${artifact}"`);
  });

  const hasAutomatedCheckEvidence = requiredChecks
    ? (reportContent.includes("PASS") ||
       reportContent.includes("✓") ||
       reportContent.includes("Build success") ||
       reportContent.includes("Compiled successfully"))
    : true;

  const hasManualCheckEvidence = requiredManual
    ? (reportContent.includes("verified") ||
       reportContent.includes("I confirmed") ||
       reportContent.includes("works as expected"))
    : true;

  // HEADLESS EXCEPTION
  // Если manualCheck требует browser/screenshot, но Artifacts + automatedCheck есть
  const isHeadlessManualCheck =
    requiredManual &&
    (requiredManual.includes("browser") ||
     requiredManual.includes("screenshot") ||
     requiredManual.includes("visual"));

  if (isHeadlessManualCheck && hasArtifactEvidence && hasAutomatedCheckEvidence) {
    // APPROVE с пометкой, что manualCheck отложен
    return {
      status: "APPROVED",
      reasoning: "Artifacts and automatedCheck satisfied. Manual check requires browser/visual verification which is not available in headless environment — deferred to user.",
      confidence: 0.9
    };
  }

  // TICKET RUN EXCEPTION
  // Если отчет содержит "[Ticket run]" и automatedCheck был пропущен
  const isTicketRun = reportContent.includes("[Ticket run]") &&
                    reportContent.includes("automatedCheck from the original task was skipped");

  if (isTicketRun && hasArtifactEvidence) {
    // APPROVE без требования automatedCheck
    return {
      status: "APPROVED",
      reasoning: "Ticket run; automatedCheck skipped per ticket-run rule. Artifacts satisfied; evidence from report.",
      confidence: 0.9
    };
  }

  // STEP 3: VALIDATE EVIDENCE
  let allCriteriaMet = hasArtifactEvidence &&
                     hasAutomatedCheckEvidence &&
                     hasManualCheckEvidence;

  // STEP 4: MAKE DECISION
  if (allCriteriaMet) {
    // APPROVE
    const reasoning = `
      ✓ Artifacts: All required files found in ls output or content shown.
      ✓ automatedCheck: ${requiredChecks ? "Commands succeeded with PASS/Build success" : "Not required"}
      ✓ manualCheck: ${requiredManual ? "Confirmed in report" : "Not required"}
    `.trim();

    return {
      status: "APPROVED",
      reasoning,
      confidence: 0.95
    };
  } else {
    // REJECT
    const missingCriteria = [];

    if (!hasArtifactEvidence) {
      missingCriteria.push(`[Artifacts] Missing evidence for files: ${requiredArtifacts.join(", ")}`);
    }
    if (!hasAutomatedCheckEvidence && requiredChecks) {
      missingCriteria.push(`[automatedCheck] Missing evidence of successful test/build execution`);
    }
    if (!hasManualCheckEvidence && requiredManual) {
      missingCriteria.push(`[manualCheck] Missing confirmation of manual verification`);
    }

    const reasoning =
      `Verification Failed. Missing evidence for:\n${missingCriteria.join("\n")}\n\n` +
      `Please provide specific evidence for each criteria point.`;

    return {
      status: "REJECTED",
      reasoning,
      confidence: 0.9
    };
  }
}
```

**GSD Verification Protocol (строгий):**

```
┌─────────────────────────────────────────────────────────┐
│  STEP 1: READ VERIFICATION CRITERIA                 │
├─────────────────────────────────────────────────────────┤
│  - Artifacts: Файлы, которые должны существовать     │
│  - automatedCheck: Команды, которые должны пройти    │
│  - manualCheck: Что нужно проверить вручную          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 2: COLLECT EVIDENCE FROM REPORT              │
├─────────────────────────────────────────────────────────┤
│  A. Для Artifacts:                                 │
│     - ls -la output showing file exists               │
│     - Full file content in code blocks               │
│     - cat command with file content                  │
│     - File creation logs                            │
│                                                     │
│  B. Для automatedCheck:                             │
│     - Test execution logs (PASS, ✓)                │
│     - Build success messages                         │
│     - Command output from automatedCheck             │
│     - npm/yarn output showing success                │
│                                                     │
│  C. Для manualCheck:                                │
│     - Textual confirmation ("I verified X")         │
│     - Screenshot descriptions                        │
│     - UI behavior descriptions                       │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 3: VALIDATE EVIDENCE (TRUTH CHECK)         │
├─────────────────────────────────────────────────────────┤
│  - Artifacts: Sufficient if file mentioned OR shown   │
│  - automatedCheck: Sufficient if logs show success     │
│  - manualCheck: Sufficient if explicit confirmation   │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  STEP 4: MAKE DECISION                            │
├─────────────────────────────────────────────────────────┤
│  APPROVE when:                                     │
│  ✓ ALL verificationCriteria have sufficient evidence    │
│  ✓ No visible syntax/logic errors                  │
│  ✓ No errors in logs                              │
│                                                     │
│  REJECT when:                                      │
│  ✓ AT LEAST ONE criteria has NO evidence           │
│  ✓ Evidence contradicts criteria                   │
│  ✓ Visible syntax/logic errors                     │
│  ✓ Report contains no code/logs at all              │
└─────────────────────────────────────────────────────────┘
```

**Исключения:**

1. **HEADLESS EXCEPTION:**
   ```
   Если manualCheck только просит "open in browser", "screenshot",
   или "visual confirmation", и Artifacts + automatedCheck
   имеют доказательства → APPROVE с пометкой отложенной проверки
   ```

2. **TICKET RUN EXCEPTION:**
   ```
   Если отчет содержит "[Ticket run]" и
   "automatedCheck from the original task was skipped"
   → APPROVE когда Artifacts имеют доказательства
   ```

---

### 5. REFLEXOLOGIST (Система обучения)

**Файл:** `lib/agents/reflexologist.ts`

**Ответственность:** Анализирует execution logs, генерирует `GlobalInsight` embeddings для RAG

**Коммуникация:** Внутренняя/логирование

**Триггеры:**
- **Incremental:** Каждые 5 выполненных задач
- **Final:** В конце сессии

**Основные функции:**

```typescript
export async function runReflexologistForSession(options: RunReflexologistOptions) {
  const { projectId, sessionId, planId, mode = "final", maxInsights = 3 } = options;

  // 1. Собираем данные для анализа
  const logs = await prisma.executionLog.findMany({
    where: { sessionId },
    take: 150,
    orderBy: { createdAt: "asc" }
  });

  const planTasks = planId ? await prisma.task.findMany({
    where: { planId },
    select: { id: true, title: true }
  }) : [];

  const taskIds = planTasks.map(t => t.id);

  const comments = taskIds.length > 0 ? await prisma.comment.findMany({
    where: { taskId: { in: taskIds } },
    take: 100,
    orderBy: { createdAt: "asc" }
  }) : [];

  // 2. Формируем структурированный контекст
  const executionContext = {
    projectId,
    sessionId,
    planId,
    mode,
    logsSummary: logs.map(log => {
      const eventType = log.metadata?.eventType ?? "unknown";
      return `[${log.createdAt}] [${eventType}] [${log.type}] ${log.message}`;
    }),
    qaOutcomes: logs.filter(l => l.metadata?.eventType === "task_qa_completed").map(l => ({
      taskId: l.metadata.data?.taskId,
      status: l.metadata.data?.status,
      message: l.message
    })),
    retrySummary: session.metadata?.retryCounter ?? {},
    commentsSummary: comments.filter(c => ["QA", "DEVOPS"].includes(c.authorRole)).map(c =>
      `[${c.createdAt}] [${c.authorRole}] ${c.content}`
    )
  };

  // 3. Запрашиваем у LLM инсайты
  const systemPrompt = `You are a Senior Staff Engineer analyzing development execution logs.

  Your job:
  - Identify NON-OBVIOUS, HIGH-LEVEL, REUSABLE INSIGHTS
  - Focus on ROOT CAUSES and SYSTEMIC PATTERNS

  Very important rules:
  1) DO NOT restate obvious facts like "Task failed"
  2) DO NOT describe individual logs or events
  3) ONLY produce insights that can improve FUTURE runs
  4) Prefer patterns that appear multiple times

  Output MUST be JSON array of 0 to ${maxInsights} objects with:
  - "title": short human-readable name
  - "summary": 2-4 sentences explaining pattern and root cause
  - "category": one of ["TOOLING", "WORKFLOW", "QA_PROCESS", "ARCHITECTURE", "DOCUMENTATION", "MISC"]
  - "severity": one of ["low", "medium", "high"]
  - "recommendation": 2-5 sentences with specific improvements
  - "fingerprint": stable identifier for this pattern
  - "tags": array of short tags

  If you cannot find any reusable insights, return [].
  `;

  const result = await generateText({
    model: getModel(provider, model),
    system: systemPrompt,
    prompt: `Analyze this context: ${JSON.stringify(executionContext, null, 2)}`,
    temperature: 0.1
  });

  // 4. Парсим и сохраняем инсайты
  const parsed = JSON.parse(result.text);

  for (const insight of parsed) {
    // Дедупликация по fingerprint
    const existing = await prisma.globalInsight.findFirst({
      where: { projectId, fingerprint: insight.fingerprint }
    });

    if (existing) continue;

    // Генерируем embedding для семантического поиска
    const textToEmbed = `${insight.title}\n${insight.summary}\n${insight.recommendation}`;
    const vector = await generateEmbedding(textToEmbed);

    // Сохраняем инсайт
    await prisma.globalInsight.create({
      data: {
        projectId,
        planId,
        sessionId,
        title: insight.title,
        content: insight.summary,
        category: insight.category,
        severity: insight.severity,
        recommendation: insight.recommendation,
        fingerprint: insight.fingerprint,
        tags: insight.tags ?? [],
        embedding: JSON.stringify(vector)
      }
    });
  }
}
```

**Примеры сгенерированных инсайтов:**

```json
[
  {
    "title": "Missing Directories Before writeFile",
    "summary": "When agents try to write files to non-existent directories (e.g., src/app/api/auth/route.ts), the writeFile tool fails with ENOENT. This pattern appears across multiple tasks when creating nested file structures.",
    "category": "TOOLING",
    "severity": "high",
    "recommendation": "Before any writeFile operation, always execute 'mkdir -p <directory>' for the parent directory. Add this as a best practice rule in the execution plan generation prompt.",
    "fingerprint": "writeFile-missing-parent-dir",
    "tags": ["writeFile", "filesystem", "missing-directories"]
  },
  {
    "title": "QA Rejects for Missing Test Evidence",
    "summary": "Tasks with automatedCheck='npm run test' are frequently rejected because the execution report doesn't show test output. The test command runs but the output isn't captured in the verification evidence.",
    "category": "QA_PROCESS",
    "severity": "medium",
    "recommendation": "After running automatedCheck commands, always execute a follow-up command to explicitly capture and display the test output, such as 'npm run test 2>&1 | tee test-output.txt && cat test-output.txt'.",
    "fingerprint": "qa-reject-missing-test-evidence",
    "tags": ["qa", "testing", "verification"]
  }
]
```

---

### 6. ARCHITECT (Планировщик)

**Файл:** `lib/agents/architect.ts`

**Ответственность:** Разбивает идеи на планы, генерирует задачи с зависимостями, обновляет verification criteria, ре-планирует

**Коммуникация:**
- Получает: `ARCHITECT_REQUEST` от TEAMLEAD (опционально)

**Основные функции:**

```typescript
// 1. Разложение идеи на 3 плана
export async function decomposeIdea(ideaText: string, context: string) {
  const systemPrompt = `You are an experienced software architect.
  Your job: Generate 3 DISTINCT plans for implementing the given idea.

  Each plan should include:
  - techStack: Technology choices (framework, database, styling, etc.)
  - estimatedComplexity: "L", "M", or "H"
  - estimatedTime: Estimated time (e.g., "2-3 hours", "4-6 hours")
  - reasoning: Why this stack makes sense
  - prosCons: Pros and cons of this approach

  Make each plan UNIQUE and COMPELLING.
  `;

  const result = await generateText({
    model: getModel(provider, model),
    system: systemPrompt,
    prompt: `Idea: ${ideaText}\nContext: ${context}`,
    temperature: 0.7
  });

  // Парсим и сохраняем 3 плана
  const plans = parsePlansFromResponse(result.text);

  for (const plan of plans) {
    await prisma.plan.create({
      data: {
        projectId,
        title: plan.title,
        description: plan.description,
        techStack: plan.techStack,
        estimatedComplexity: plan.complexity,
        estimatedTime: plan.time,
        reasoning: plan.reasoning,
        prosCons: plan.prosCons,
        relevanceScore: calculateRelevance(plan)
      }
    });
  }
}

// 2. Генерация задач из плана
export async function generateTasksFromPlan(planId: string) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });

  // Поиск релевантных GlobalInsights (RAG)
  const relevantInsights = await searchGlobalInsights(
    `Implementing ${plan.title} with ${plan.techStack}`,
    limit: 5
  );

  const insightsBlock = relevantInsights.map(i =>
    `- ${i.title}: ${i.recommendation}`
  ).join('\n');

  const systemPrompt = `You are a project planner.
  Break down the following plan into specific, actionable tasks.

  CRITICAL LESSONS FROM PAST PROJECTS (Global Insights):
  ${insightsBlock}

  Make sure to address these lessons in your task breakdown!

  Each task should include:
  - title: Clear task name
  - description: What needs to be done
  - executorAgent: TASK_EXECUTOR, BACKEND, DEVOPS, or CSS
  - dependencies: Array of task indices this depends on
  - verificationCriteria:
    - artifacts: Array of file paths that should exist
    - automatedCheck: Command to run (tests, build, etc.)
    - manualCheck: What to verify manually
  `;

  const result = await generateText({
    model: getModel(provider, model),
    system: systemPrompt,
    prompt: `Plan: ${plan.title}\nTech Stack: ${plan.techStack}\nDescription: ${plan.description}`,
    temperature: 0.3
  });

  const tasks = parseTasksFromResponse(result.text);

  // Сохраняем задачи с зависимостями
  for (const task of tasks) {
    const createdTask = await prisma.task.create({
      data: {
        planId,
        title: task.title,
        description: task.description,
        executorAgent: task.executorAgent,
        verificationCriteria: task.verificationCriteria
      }
    });

    // Создаем зависимости
    for (const depIndex of task.dependencies) {
      await prisma.taskDependency.create({
        data: {
          taskId: createdTask.id,
          dependsOnId: tasks[depIndex].id
        }
      });
    }
  }
}

// 3. Ре-планирование после завершения задачи
export async function replanTasks(projectId: string, completedTaskId: string) {
  const completedTask = await prisma.task.findUnique({
    where: { id: completedTaskId },
    include: {
      plan: { include: { project: true } },
      comments: { take: 1, orderBy: { createdAt: 'desc' } }
    }
  });

  const pendingTasks = await prisma.task.findMany({
    where: { planId: completedTask.planId, status: "TODO" },
    orderBy: { createdAt: "asc" }
  });

  const systemPrompt = `You are a Technical Architect. We just completed a task.

  Analyze if the completed task impacts remaining tasks.
  For example:
  - Different library/technology chosen?
  - Project architecture changed?
  - Some tasks are now redundant?
  - Tasks need clarification?
  - Verification criteria need updates?

  If updates needed, return:
  - needsReplan: true
  - updates: Array of task updates
  - reasoning: Explanation
  `;

  const result = await generateText({
    model: getModel(provider, model),
    system: systemPrompt,
    prompt: `
      Completed task: ${completedTask.title}
      Execution report: ${completedTask.comments[0]?.content}

      Pending tasks:
      ${pendingTasks.map(t => `- ${t.title}: ${t.description}`).join('\n')}
    `,
    temperature: 0.3
  });

  const parsed = JSON.parse(result.text);

  if (parsed.needsReplan) {
    for (const update of parsed.updates) {
      await prisma.task.update({
        where: { id: update.taskId },
        data: {
          title: update.newTitle,
          description: update.newDescription,
          verificationCriteria: update.newVerificationCriteria
        }
      });
    }
  }
}
```

---

## RAG система

### Компоненты RAG

| Компонент | Файл | Назначение |
|-----------|--------|-----------|
| **index.ts** | `lib/rag/index.ts` | Основной RAG pipeline: чанкование, генерация эмбеддингов, хранение |
| **search.ts** | `lib/rag/search.ts` | Семантический поиск по файлам и GlobalInsights |
| **embeddings.ts** | `lib/rag/embeddings.ts` | OpenAI text-embedding-3-small интеграция |
| **chunk.ts** | `lib/rag/chunk.ts` | Текстовое чанкование с overlap |
| **store.ts** | `lib/rag/store.ts` | Операции с векторной БД (pgvector) |

### RAG Flow

```
┌─────────────────────────────────────────────────────────┐
│           File Upload / Project Creation               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌───────────────────────────────┐
        │  Parse File (parser.ts)     │
        └───────────┬───────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │  Chunk Text (chunk.ts)       │
        │  - 1000 tokens per chunk     │
        │  - 200 tokens overlap        │
        └───────────┬───────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │ Generate Embeddings         │
        │ (OpenAI text-embedding-3-small)│
        │ 1536-dimensional vectors    │
        └───────────┬───────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │ Store in FileEmbedding table  │
        │ (pgvector)                  │
        └───────────────────────────────┘
                          │
                          ▼
        ┌───────────────────────────────┐
        │ Query: searchGlobalInsights() │
        │ → cosine similarity → top N    │
        └───────────┬───────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │ Inject into Prompts           │
        │ (Architect, Executor)         │
        └───────────────────────────────┘
```

### Чанкование текста

```typescript
// lib/rag/chunk.ts
export function chunkText(text: string, maxTokens = 1000, chunkOverlap = 200): string[] {
  const chunkSize = maxTokens * 4; // 1 token ≈ 4 characters
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
    const chunk = text.slice(i, i + chunkSize);
    chunks.push(chunk.trim());
  }

  return chunks.filter(Boolean);
}

// Пример:
// Input: "This is a long text that needs to be chunked..."
// Output (maxTokens=50, overlap=10):
//   Chunk 1: "This is a long text that needs to be..."
//   Chunk 2: "needs to be chunked into multiple..."
//   Chunk 3: "into multiple parts for processing..."
```

### Генерация эмбеддингов

```typescript
// lib/rag/index.ts
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embedMany } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");

  const result = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: texts
  });

  // result.embeddings = [
  //   [0.023, -0.045, 0.123, ..., 0.089],  // 1536 dimensions
  //   [-0.034, 0.012, -0.089, ..., -0.056],
  //   ...
  // ]

  // Track usage
  await trackEmbeddingUsage(projectId, "text-embedding-3-small", result.usage.promptTokens);

  return result.embeddings;
}
```

### Семантический поиск

```typescript
// lib/rag/search.ts
export async function searchSimilar(
  projectId: string,
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Генерируем embedding для query
  const queryVector = await generateEmbedding(trimmed);
  // queryVector = [0.023, -0.045, 0.123, ..., 0.089] (1536 dimensions)

  // Ищем в GlobalInsights
  const allInsights = await prisma.globalInsight.findMany({
    where: { embedding: { not: null } },
    select: { id: true, title: true, category: true, recommendation: true, content: true, embedding: true }
  });

  // Вычисляем cosine similarity для каждого инсайта
  const scored: Array<{ insight: any; score: number }> = [];

  for (const insight of allInsights) {
    const vec = JSON.parse(insight.embedding);
    const score = cosineSimilarity(queryVector, vec);
    // score ∈ [0, 1], higher = more similar

    if (score > 0.5) {
      scored.push({ insight, score });
    }
  }

  // Сортируем по убыванию score и берем top N
  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return top.map(({ insight, score }) => ({
    title: insight.title,
    category: insight.category,
    recommendation: insight.recommendation,
    content: insight.content,
    similarity: score
  }));
}

// Cosine similarity formula:
// score = (A · B) / (||A|| * ||B||)
// where A · B = sum(A[i] * B[i])
//       ||A|| = sqrt(sum(A[i]^2))
```

### GlobalInsight Schema

```prisma
model GlobalInsight {
  id            String   @id @default(cuid())
  content       String   @db.Text              // Summary of the insight
  tags          String[]                         // Short tags like ["writeFile", "filesystem"]
  embedding     String?  @db.Text             // JSON-serialized vector (1536 dims)
  projectId     String?
  project       Project?  @relation(fields: [projectId], references: [id])
  planId        String?
  sessionId     String?
  category      String?                         // TOOLING, WORKFLOW, QA_PROCESS, etc.
  severity      String?                         // low, medium, high
  title         String?                         // Short human-readable name
  recommendation String?  @db.Text             // Actionable recommendation
  fingerprint   String?  @unique             // Stable ID for deduplication
  createdAt     DateTime @default(now())
}
```

### Использование в промптах

```typescript
// lib/agents/prompt-generator.ts
export async function generateTaskPrompt(taskId: string, isRetry: boolean, isInteractive: boolean, extraRequirement?: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const project = task.plan.project;

  // Поиск релевантных GlobalInsights
  const relevantInsights = await searchGlobalInsights(
    `Task: ${task.title}\nDescription: ${task.description}`,
    limit: 3
  );

  const insightsBlock = relevantInsights.length > 0
    ? `
### CRITICAL LESSONS FROM PAST PROJECTS (Global Insights)
${relevantInsights.map(i => `
- **${i.title}** (${i.category}, ${i.severity} severity):
  ${i.summary}
  Recommendation: ${i.recommendation}
`).join('\n')}
` : '';

  const systemPrompt = `You are an expert software engineer.

${insightsBlock}

${extraRequirement ? `
### ADDITIONAL REQUIREMENT FROM TICKET
${extraRequirement}
` : ''}

Task: ${task.title}
Description: ${task.description}
Tech Stack: ${task.plan.techStack}

Generate a detailed execution plan...
`;

  return systemPrompt;
}
```

---

## QA система

### GSD (Goal-Backward Verification) Methodology

```
┌─────────────────────────────────────────────────────────┐
│           VERIFICATION CRITERIA (from Architect)      │
├─────────────────────────────────────────────────────────┤
│  artifacts: ["src/app/page.tsx", "src/api/..."]   │
│  automatedCheck: "npm run build && npm test"         │
│  manualCheck: "Open http://localhost:3000"         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌───────────────────────────────┐
        │  Executor generates REPORT    │
        │  (VERIFICATION EVIDENCE)     │
        └───────────┬───────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│         QA Agent verifies EVIDENCE                    │
│         Following GSD Protocol                        │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │   DECISION: APPROVED / REJECTED  │
        └───────────┬───────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│   APPROVED      │    │   REJECTED      │
│                │    │                │
│ - All criteria │    │ - Missing       │
│   have evidence│    │   evidence     │
│                │    │                │
│ Task → DONE    │    │ Ticket → OPEN  │
└──────────────────┘    └──────────────────┘
```

### Verification Criteria Structure

```typescript
interface VerificationCriteria {
  artifacts: string[];           // File paths that must exist
  automatedCheck: string;        // Commands that must succeed
  manualCheck: string;          // What to verify manually
}

// Пример:
{
  artifacts: [
    "src/app/page.tsx",
    "src/components/TodoList.tsx",
    "src/components/TodoItem.tsx",
    "src/lib/todoStore.ts"
  ],
  automatedCheck: "npm run build && npm test",
  manualCheck: "Open http://localhost:3000 and verify: (1) Todo list is visible, (2) Can add new todos, (3) Can delete todos, (4) Can toggle todos as complete"
}
```

### QA Verification Flow

```typescript
// lib/agents/qa.ts
async function verifyTaskCompletion(taskId: string, reportContent: string) {
  // 1. Load task and verification criteria
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const vc = task.verificationCriteria;

  // 2. STEP 1: READ VERIFICATION CRITERIA
  const requiredArtifacts = vc.artifacts || [];
  const requiredAutomatedCheck = vc.automatedCheck;
  const requiredManualCheck = vc.manualCheck;

  // 3. STEP 2: COLLECT EVIDENCE FROM REPORT

  // A. Check for Artifacts evidence
  const artifactEvidence = requiredArtifacts.map(artifact => {
    const hasLsOutput = reportContent.includes(`ls -la "${artifact}"`);
    const hasFileContent = reportContent.includes(`head -n 200 "${artifact}"`);
    const hasFileMention = reportContent.includes(artifact);

    return {
      artifact,
      hasEvidence: hasLsOutput || hasFileContent || hasFileMention
    };
  });

  // B. Check for automatedCheck evidence
  const hasTestEvidence = reportContent.toLowerCase().includes("test") &&
                         (reportContent.includes("PASS") ||
                          reportContent.includes("✓") ||
                          reportContent.includes("All tests passed"));

  const hasBuildEvidence = reportContent.toLowerCase().includes("build") &&
                          (reportContent.includes("Build success") ||
                           reportContent.includes("Compiled successfully") ||
                           reportContent.includes("✓ built"));

  const hasAutomatedCheckEvidence = requiredAutomatedCheck
    ? (hasTestEvidence || hasBuildEvidence || !reportContent.includes("FAILED"))
    : true;

  // C. Check for manualCheck evidence
  const hasManualCheckEvidence = requiredManualCheck
    ? (reportContent.includes("verified") ||
       reportContent.includes("confirmed") ||
       reportContent.includes("works as expected"))
    : true;

  // 4. STEP 3: VALIDATE EVIDENCE (TRUTH CHECK)

  const allArtifactsHaveEvidence = artifactEvidence.every(ae => ae.hasEvidence);
  const allCriteriaMet = allArtifactsHaveEvidence &&
                       hasAutomatedCheckEvidence &&
                       hasManualCheckEvidence;

  // 5. EXCEPTIONS

  // HEADLESS EXCEPTION
  const isHeadlessManualCheck = requiredManualCheck &&
    (requiredManualCheck.includes("browser") ||
     requiredManualCheck.includes("screenshot") ||
     requiredManualCheck.includes("visual"));

  if (isHeadlessManualCheck && allArtifactsHaveEvidence && hasAutomatedCheckEvidence) {
    return {
      status: "APPROVED",
      reasoning: "Artifacts and automatedCheck satisfied. Manual check requires browser/visual verification which is not available in headless environment — deferred to user.",
      confidence: 0.9
    };
  }

  // TICKET RUN EXCEPTION
  const isTicketRun = reportContent.includes("[Ticket run]") &&
                    reportContent.includes("automatedCheck from the original task was skipped");

  if (isTicketRun && allArtifactsHaveEvidence) {
    return {
      status: "APPROVED",
      reasoning: "Ticket run; automatedCheck skipped per ticket-run rule. Artifacts satisfied; evidence from report.",
      confidence: 0.9
    };
  }

  // 6. STEP 4: MAKE DECISION

  if (allCriteriaMet) {
    const reasoning = artifactEvidence.map(ae =>
      `✓ Artifacts: ${ae.artifact} - ${ae.hasEvidence ? "Found in report" : "MISSING"}`
    ).join('\n') +
    (requiredAutomatedCheck ? `\n✓ automatedCheck: ${hasAutomatedCheckEvidence ? "Commands succeeded" : "FAILED"}` : "") +
    (requiredManualCheck ? `\n✓ manualCheck: ${hasManualCheckEvidence ? "Confirmed" : "MISSING confirmation"}` : "");

    return {
      status: "APPROVED",
      reasoning,
      confidence: 0.95
    };
  } else {
    const missingCriteria = [];
    if (!allArtifactsHaveEvidence) {
      const missing = artifactEvidence.filter(ae => !ae.hasEvidence).map(ae => ae.artifact);
      missingCriteria.push(`[Artifacts] Missing evidence for files: ${missing.join(", ")}`);
    }
    if (!hasAutomatedCheckEvidence && requiredAutomatedCheck) {
      missingCriteria.push(`[automatedCheck] Missing evidence of successful test/build execution`);
    }
    if (!hasManualCheckEvidence && requiredManualCheck) {
      missingCriteria.push(`[manualCheck] Missing confirmation of manual verification`);
    }

    return {
      status: "REJECTED",
      reasoning: `Verification Failed. Missing evidence for:\n${missingCriteria.join("\n")}\n\nPlease provide specific evidence for each criteria point.`,
      confidence: 0.9
    };
  }
}
```

### Auto-Retry Logic

```typescript
const LOW_CONFIDENCE_THRESHOLD = 0.7;

let parsedData = await runOneQA();

// Low-confidence REJECTED → request second opinion
if (parsedData.status === "REJECTED" && parsedData.confidence < LOW_CONFIDENCE_THRESHOLD) {
  try {
    const second = await runOneQA(
      prompt + "\n\n[SECOND OPINION] Re-evaluate. If evidence is borderline or partially present for criteria, prefer APPROVED."
    );

    if (second.status === "APPROVED") {
      parsedData = second;  // Override with second opinion
    }
  } catch (e) {
    // Keep original decision if second opinion fails
  }
}

// Final decision
const finalStatus = parsedData.status === "APPROVED"
  ? (project.requireApproval ? "WAITING_APPROVAL" : "DONE")
  : "REJECTED";

await prisma.task.update({
  where: { id: taskId },
  data: { status: finalStatus }
});
```

---

## Полный процесс выполнения проекта

### Обзор: "Start Auto Execute" → Завершение

```
┌─────────────────────────────────────────────────────────────────┐
│                  USER CLICKS "START EXECUTION"                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       1. START EXECUTION MODAL                             │
│  - Engine: AHP (parallel) or Legacy (sequential)           │
│  - Auto-approve: enable/disable manual approval            │
│  - Cost limit: max USD to spend                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       2. POST /api/execution-sessions/start              │
│  - projectId, planId, costLimit, autoApprove, engine     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       3. CREATE EXECUTION SESSION                           │
│  - status: "RUNNING"                                     │
│  - metadata: { autoApprove, executionMode, engine }        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       4. INITIALIZE WORKSPACE                              │
│  - initProjectWorkspace(projectId)                          │
│  - ensureSyncClientRunning(projectId, mode)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       5. FIRE-AND-FORGET: TRIGGER WORKER                │
│  - If AHP: POST /api/execution-sessions/run-ahp        │
│  - If Legacy: POST /api/execution-sessions/run             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       [AHP MODE] - AGENT HIVE PROTOCOL DISPATCHER         │
├─────────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────┐       │
│  │  Loop (max 500 iterations)                   │       │
│  │                                                │       │
│  │  a) Check if session complete                     │       │
│  │  b) Fetch pending/processing messages             │       │
│  │  c) If none: find next task/ticket           │       │
│  │     → Create TASK_REQUEST or TICKET_REQUEST    │       │
│  │  d) Group messages by targetAgent              │       │
│  │  e) Create agents in parallel                │       │
│  │  f) Process messages                         │       │
│  │  g) Wait 1 second, repeat                  │       │
│  └──────────────────────────────────────────────────┘       │
│                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Детальный AHP Dispatcher Loop

```typescript
// app/api/execution-sessions/run-ahp/route.ts

async function runAHPDispatcher(sessionId: string) {
  const session = await prisma.executionSession.findUnique({
    where: { id: sessionId },
    include: { project: true }
  });

  const autoApprove = session.metadata.autoApprove || false;

  // Reset stuck IN_PROGRESS tasks
  await prisma.task.updateMany({
    where: {
      planId: session.planId,
      status: "IN_PROGRESS"
    },
    data: { status: "TODO" }
  });

  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // Step a: Check if session complete
    const isComplete = await isSessionComplete(sessionId);
    if (isComplete) {
      console.log(`Session ${sessionId} is complete`);
      break;
    }

    // Step b: Fetch pending/processing messages
    const pendingMessages = await prisma.agentMessage.findMany({
      where: {
        sessionId,
        status: { in: [MessageStatus.PENDING, MessageStatus.PROCESSING] }
      },
      orderBy: { createdAt: "asc" }
    });

    // Step c: If none, find next task/ticket
    if (pendingMessages.length === 0) {
      const nextItem = await findNextTask(session.projectId, session.planId);

      if (!nextItem) {
        console.log("No more tasks/tickets to process");
        break;
      }

      if (nextItem.type === "ticket") {
        // Create TICKET_REQUEST
        await prisma.ticket.update({
          where: { id: nextItem.data.id },
          data: { status: "IN_PROGRESS" }
        });

        await messageBus.postMessage({
          sessionId,
          sourceAgent: AgentRole.TEAMLEAD,
          targetAgent: nextItem.data.relatedTaskId
            ? (await prisma.task.findUnique({ where: { id: nextItem.data.relatedTaskId } }))?.executorAgent
            : AgentRole.TASK_EXECUTOR,
          eventType: MessageType.TICKET_REQUEST,
          payload: {
            ticketId: nextItem.data.id,
            relatedTaskId: nextItem.data.relatedTaskId
          }
        });
      } else {
        // Create TASK_REQUEST
        await prisma.task.update({
          where: { id: nextItem.data.id },
          data: { status: "IN_PROGRESS" }
        });

        await messageBus.postMessage({
          sessionId,
          sourceAgent: AgentRole.TEAMLEAD,
          targetAgent: nextItem.data.executorAgent || AgentRole.TASK_EXECUTOR,
          eventType: MessageType.TASK_REQUEST,
          payload: { taskId: nextItem.data.id }
        });
      }

      continue;  // Go to next iteration
    }

    // Step d: Group messages by targetAgent
    const pendingOnly = pendingMessages.filter(m => m.status === MessageStatus.PENDING);
    const messagesByAgent = groupBy(pendingOnly, "targetAgent");

    // Step e: Create agents in parallel
    const agentPromises = Object.entries(messagesByAgent).map(
      async ([agentRole, messages]) => {
        const agent = createAgentForRole(
          agentRole as AgentRole,
          sessionId,
          session.projectId,
          autoApprove,
          config.onLog,
          config.mode
        );

        // Step f: Process messages
        await agent.run();
      }
    );

    // Step g: Wait and repeat
    await Promise.allSettled(agentPromises);
    await new Promise(resolve => setTimeout(resolve, ITERATION_PAUSE_MS));
  }

  // Finalize session
  await finalizeSession(sessionId, session.projectId, session.planId);
}
```

### Обработка задачи (Task Executor Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│            TASK_EXECUTOR RECEIVES TASK_REQUEST               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       1. LOAD TASK FROM DATABASE                            │
│  - title, description, verificationCriteria                  │
│  - plan → project (aiProvider, aiModel)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       2. GENERATE DETAILED PROMPT                           │
│  - Use prompt-generator.ts                                  │
│  - Search GlobalInsights (RAG) for relevant lessons        │
│  - Inject insights into prompt                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       3. GET PROJECT CONTEXT                               │
│  - File structure, dependencies, entities                   │
│  - Related files (via CodeDependency table)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       4. CREATE AGENT TOOLS                                │
│  - executeCommand (run shell commands)                     │
│  - readFile (read project files)                           │
│  - writeFile (write/overwrite files)                        │
│  - searchKnowledge (RAG search in GlobalInsights)          │
│  - generateText (call LLM)                                 │
│  - webSearch (search documentation)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       5. GENERATE EXECUTION PLAN VIA LLM                   │
│  System prompt with:                                       │
│  - Project context                                        │
│  - Task description                                      │
│  - CRITICAL LESSONS from GlobalInsights                     │
│  - Available tools                                        │
│  - CRITICAL RULES (no placeholders, full overwrite, etc.)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       6. PARSE PLAN (JSON)                                │
│  {                                                         │
│    "steps": [                                              │
│      { "thought": "I need to see package.json" },          │
│      { "toolName": "readFile", "params": { "filePath": "package.json" } },│
│      { "thought": "Now install dependencies" },             │
│      { "toolName": "executeCommand", "params": { "command": "npm install" } }│
│    ]                                                        │
│  }                                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       7. EXECUTE STEPS                                     │
│  For each step:                                            │
│    - If "thought": log to console                           │
│    - If "toolName": execute tool with params                │
│    - Capture result (stdout, stderr, exitCode)               │
│    - Log result                                             │
│    - If writeFile with .css → send STYLE_REQUEST to CSS     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       8. VERIFICATION PHASE                                │
│  For each artifact:                                         │
│    - ls -la "<artifact>" (prove file exists)               │
│    - head -n 200 "<artifact>" (show content)               │
│  For automatedCheck:                                        │
│    - Execute command via .ai-temp-check.sh                  │
│  Capture all outputs in report                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       9. GENERATE REPORT                                   │
│  - Tool outputs (readFile, writeFile, executeCommand)       │
│  - === VERIFICATION EVIDENCE ===                          │
│    - Artifacts Check                                       │
│    - Automated Check                                       │
│    - HEADLESS MODE TRIGGERED (for manualCheck)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       10. SEND QA_REQUEST                                  │
│  targetAgent: QA                                           │
│  payload: { taskId, report }                               │
└─────────────────────────────────────────────────────────────────┘
```

### QA Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│            QA AGENT RECEIVES QA_REQUEST                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       1. LOAD TASK AND VERIFICATION CRITERIA             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       2. GSD STEP 1: READ CRITERIA                      │
│  - artifacts: ["src/app/page.tsx", ...]                   │
│  - automatedCheck: "npm run build && npm test"             │
│  - manualCheck: "Open http://localhost:3000"              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       3. GSD STEP 2: COLLECT EVIDENCE FROM REPORT        │
│  A. Artifacts:                                           │
│     - Search for ls -la output                            │
│     - Search for file content (head -n 200)                │
│     - Search for file mentions                             │
│  B. automatedCheck:                                       │
│     - Search for "PASS", "✓", "Build success"            │
│  C. manualCheck:                                          │
│     - Search for "verified", "confirmed", "works"          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       4. CHECK EXCEPTIONS                                  │
│  - HEADLESS EXCEPTION: browser/screenshot only?             │
│  - TICKET RUN EXCEPTION: automatedCheck skipped?           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       5. GSD STEP 3: VALIDATE EVIDENCE                 │
│  - All artifacts have evidence?                            │
│  - automatedCheck succeeded?                              │
│  - manualCheck confirmed?                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       6. GSD STEP 4: MAKE DECISION                      │
│  If ALL evidence sufficient → APPROVED                       │
│  If ANY evidence missing → REJECTED                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│       7. SEND QA_RESPONSE                                 │
│  targetAgent: TEAMLEAD                                    │
│  payload: { taskId, status, reasoning, confidence }       │
└─────────────────────────────────────────────────────────────────┘
```

### TeamLead Decision Flow

```
┌─────────────────────────────────────────────────────────────────┐
│         TEAMLEAD RECEIVES QA_RESPONSE                    │
│         status: APPROVED or REJECTED                      │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│     APPROVED            │   │     REJECTED            │
├──────────────────────────┤   ├──────────────────────────┤
│ If ticketId exists:     │   │ If ticketId exists:     │
│ - ticket.status = DONE   │   │ - retryCount++         │
│                        │   │ - if retryCount < 3:    │
│ If no ticketId:        │   │   ticket.status = OPEN   │
│ - task.status = DONE    │   │ - else: ticket.status =  │
│ - triggerNextTask()     │   │     REJECTED            │
└──────────────────────────┘   │                        │
                              │ If no ticketId:        │
                              │ - Create new ticket    │
                              │ - ticket.status = OPEN   │
                              │ - ticket.relatedTaskId = │
                              │   taskId               │
                              └──────────────────────────┘
```

### Ticket Fix Flow

```
┌─────────────────────────────────────────────────────────────────┐
│         TEAMLEAD CREATED TICKET (QA REJECTED)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  AHP DISPATCHER FINDS OPEN TICKET                         │
│  (tickets have priority over tasks)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CREATE TICKET_REQUEST → TASK_EXECUTOR                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TASK_EXECUTOR HANDLES TICKET                             │
│  1. Load ticket and original task                         │
│  2. Regenerate prompt with ticket requirement               │
│  3. Generate execution plan                              │
│  4. Execute steps                                       │
│  5. Verification phase (artifacts only - automatedCheck    │
│     was skipped in ticket run)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SEND QA_REQUEST (with ticketId)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  QA VERIFIES TICKET FIX                                 │
│  - Uses TICKET RUN EXCEPTION: automatedCheck not required   │
│  - Only checks Artifacts evidence                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TEAMLEAD HANDLES QA_RESPONSE FOR TICKET                  │
│  - If APPROVED: ticket.status = DONE                      │
│  - If REJECTED: retryCount++, reopen or REJECT           │
└─────────────────────────────────────────────────────────────────┘
```

### Session Finalization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  ALL TASKS DONE AND NO OPEN TICKETS                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  AHP DISPATCHER DETECTS SESSION COMPLETE                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FINALIZE SESSION                                         │
│  - session.status = "STOPPED"                             │
│  - project.status = "COMPLETED"                          │
│  - Log completion event                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  RUN REFLEXOLOGIST (final mode)                          │
│  1. Fetch last 150 execution logs                        │
│  2. Fetch all QA outcomes                                │
│  3. Fetch all comments (QA, DEVOPS)                      │
│  4. Analyze patterns, root causes                        │
│  5. Generate 0-3 GlobalInsights                        │
│  6. Deduplicate by fingerprint                          │
│  7. Generate embeddings for insights                      │
│  8. Save to GlobalInsight table                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SESSION COMPLETE                                         │
│  - User can view logs                                    │
│  - User can download code                                 │
│  - Insights saved for future projects                      │
└─────────────────────────────────────────────────────────────────┘
```

### Пример полного потока

**Сценарий:** Пользователь хочет создать Todo приложение

```
1. USER: "Build a React Todo App with TypeScript"
   ↓
2. ARCHITECT: Generates 3 plans
   - Plan A: React + Vite + TypeScript
   - Plan B: Next.js + Prisma
   - Plan C: Vue 3 + Pinia
   ↓
3. USER: Selects Plan A
   ↓
4. ARCHITECT: Generates tasks
   Task 0: Initialize Vite project
   Task 1: Create Todo component
   Task 2: Implement add/delete functionality
   Task 3: Style with Tailwind CSS
   (Task 1 depends on 0, Task 2 depends on 1, Task 3 depends on 2)
   ↓
5. USER: Clicks "Start Execution"
   → Engine: AHP
   → Auto-approve: true
   → Cost limit: $5
   ↓
6. POST /api/execution-sessions/start
   → Creates session (status: RUNNING)
   → Initializes workspace
   → Starts sync-client
   → Triggers AHP dispatcher
   ↓
7. AHP DISPATCHER LOOP:
   ════════════════════════════════════════════════════════

   Iteration 1:
   - No pending messages
   - Find next task: Task 0 (status: TODO)
   - Create TASK_REQUEST → TASK_EXECUTOR
   - Task 0 status: IN_PROGRESS

   Iteration 2:
   - Pending messages: [TASK_REQUEST for Task 0]
   - Create TASK_EXECUTOR agent
   - Process TASK_REQUEST:
     * Generate execution plan: `npx create-vite . --template react-ts`
     * Execute: npx create-vite . --template react-ts
     * Verification: ls -la src/, src/main.tsx
     * Report: VERIFICATION EVIDENCE
   - Send QA_REQUEST → QA

   Iteration 3:
   - Pending messages: [QA_REQUEST for Task 0]
   - Create QA agent
   - Process QA_REQUEST:
     * Check artifacts: src/, src/main.tsx ✓
     * Check automatedCheck: N/A
     * Decision: APPROVED
   - Send QA_RESPONSE → TEAMLEAD

   Iteration 4:
   - Pending messages: [QA_RESPONSE for Task 0]
   - Create TEAMLEAD agent
   - Process QA_RESPONSE:
     * status: APPROVED, no ticketId
     * Task 0 status: DONE
     * triggerNextTask(): Task 1
   - Create TASK_REQUEST → TASK_EXECUTOR (Task 1)

   Iteration 5-6:
   - Process Task 1: Create Todo component
   - QA verification
   - APPROVED
   - Trigger Task 2

   Iteration 7-8:
   - Process Task 2: Add/delete functionality
   - QA verification: REJECTED (missing tests)
   - Create TICKET for Task 2

   Iteration 9:
   - Find next item: TICKET (priority)
   - Create TICKET_REQUEST → TASK_EXECUTOR

   Iteration 10-11:
   - Process Ticket: Add tests to Todo component
   - QA verification: APPROVED
   - Ticket status: DONE

   Iteration 12:
   - Trigger Task 3 (style with Tailwind)

   Iteration 13-14:
   - Process Task 3
   - QA verification: APPROVED
   - triggerNextTask(): No more tasks

   Iteration 15:
   - Check session complete: YES
   - Finalize session
   - Run Reflexologist (final)

   ════════════════════════════════════════════════════════
   ↓
8. REFLEXOLOGIST GENERATES INSIGHTS:
   Insight 1: "Always include unit tests when creating new components"
     Category: QA_PROCESS
     Severity: high
     Recommendation: "Add automatedCheck='npm test' for each component creation task"

   ↓
9. PROJECT COMPLETE
   - project.status = COMPLETED
   - Session logs available
   - Code downloadable
   - Insights saved for future projects
```

---

## Типы сообщений и коммуникация

### MessageType Enum

```typescript
enum MessageType {
  TASK_REQUEST,      // TeamLead → TaskExecutor
  TASK_RESPONSE,     // TaskExecutor → TeamLead (unused)
  TICKET_REQUEST,    // TeamLead → TaskExecutor (for bugs)
  TICKET_RESPONSE,   // TaskExecutor → TeamLead (unused)
  STYLE_REQUEST,      // TaskExecutor → CSS
  STYLE_RESPONSE,     // CSS → TaskExecutor
  QA_REQUEST,         // TaskExecutor → QA
  QA_RESPONSE,        // QA → TeamLead
  ARCHITECT_REQUEST, // TeamLead → Architect (unused)
  ARCHITECT_RESPONSE,// Architect → TeamLead (unused)
  USER_MESSAGE,      // Human → System
  AGENT_MESSAGE      // Inter-agent communication
}
```

### Message Status Lifecycle

```
PENDING → PROCESSING → PROCESSED
                     ↓
                   FAILED
```

### AgentMessage Schema

```prisma
model AgentMessage {
  id          String        @id @default(cuid())
  sessionId   String
  session     ExecutionSession @relation(fields: [sessionId], references: [id])

  sourceAgent AgentRole
  targetAgent AgentRole

  eventType   MessageType
  payload     Json          @default("{}")

  status      MessageStatus  @default(PENDING)

  correlationId String?    @unique   // For grouping related messages
  replyToId   String?
  replyTo     AgentMessage? @relation("MessageReplies", fields: [replyToId], references: [id])
  replies     AgentMessage[] @relation("MessageReplies")

  error       String?       @db.Text
  metadata    Json         @default("{}")

  createdAt   DateTime      @default(now())
  processedAt DateTime?
  updatedAt   DateTime      @updatedAt

  @@index([sessionId, status, targetAgent])
  @@index([correlationId])
  @@index([replyToId])
}
```

### Типичные потоки сообщений

#### Flow 1: Normal Task Execution

```
[TEAMLEAD] --TASK_REQUEST--> [TASK_EXECUTOR]
                              |
                              v
                       --QA_REQUEST--> [QA]
                              |
                              v
[TEAMLEAD] <--QA_RESPONSE-----|
                              |
                              v
                       --TASK_REQUEST--> [TASK_EXECUTOR] (next task)
```

#### Flow 2: Task Rejection with Ticket

```
[TEAMLEAD] --TASK_REQUEST--> [TASK_EXECUTOR]
                              |
                              v
                       --QA_REQUEST--> [QA]
                              |
                              v
[TEAMLEAD] <--QA_RESPONSE(REJECTED)-----|
                              |
                              v
                       --TICKET_REQUEST--> [TASK_EXECUTOR] (create ticket)
                              |
                              v
                       --QA_REQUEST--> [QA] (ticket fix)
                              |
                              v
[TEAMLEAD] <--QA_RESPONSE(APPROVED)-----|
                              |
                              v
                       ticket.status = DONE
                       triggerNextTask()
```

#### Flow 3: CSS Delegation

```
[TASK_EXECUTOR] --STYLE_REQUEST--> [CSS]
                                    |
                                    v
[TASK_EXECUTOR] <--STYLE_RESPONSE-----|
                                    |
                                    v
                           writeFile with improved CSS
```

### Message Bus Implementation

```typescript
// lib/execution/message-bus.ts
export class MessageBus {
  async postMessage(message: NewMessage): Promise<AgentMessage> {
    const correlationId = message.correlationId || this.generateCorrelationId();

    // Log message
    appendSessionLog(
      message.sessionId,
      "info",
      `\n📨 [${message.sourceAgent}] -> @${message.targetAgent}: Отправил ${message.eventType}`
    );

    // Store in database
    return await prisma.agentMessage.create({
      data: {
        sessionId: message.sessionId,
        sourceAgent: message.sourceAgent,
        targetAgent: message.targetAgent,
        eventType: message.eventType,
        payload: message.payload,
        correlationId,
        replyToId: message.replyToId,
        status: MessageStatus.PENDING,
      },
    });
  }

  async getPendingMessagesFor(
    sessionId: string,
    agentType: AgentRole
  ): Promise<AgentMessage[]> {
    return await prisma.agentMessage.findMany({
      where: {
        sessionId,
        targetAgent: agentType,
        status: MessageStatus.PENDING,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async markAsProcessing(messageId: string): Promise<void> {
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: { status: MessageStatus.PROCESSING },
    });
  }

  async markAsProcessed(
    messageId: string,
    responsePayload?: Record<string, unknown>
  ): Promise<void> {
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.PROCESSED,
        processedAt: new Date(),
        ...(responsePayload && { payload: responsePayload }),
      },
    });
  }

  async markAsFailed(messageId: string, error: string): Promise<void> {
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.FAILED,
        error,
      },
    });
  }
}
```

---

## Инструменты агентов

### Доступные инструменты

```typescript
// lib/agents/tools.ts
interface AgentTools {
  executeCommand: {
    execute(params: { command: string; reason?: string }): Promise<{
      success: boolean;
      stdout: string;
      stderr: string;
      exitCode: number | null;
    }>;
  };

  readFile: {
    execute(params: { filePath: string }): Promise<{
      success: boolean;
      content: string;
      error?: string;
    }>;
  };

  writeFile: {
    execute(params: { filePath: string; content: string }): Promise<{
      success: boolean;
      error?: string;
    }>;
  };

  generateText: {
    execute(params: { systemPrompt?: string; userMessage?: string; tools?: any[] }): Promise<{
      text: string;
      usage?: { promptTokens: number; completionTokens: number };
    }>;
  };

  searchGlobalInsights: {
    execute(params: { query: string; limit?: number }): Promise<{
      results: Array<{
        title: string;
        category: string;
        recommendation: string;
        content: string;
        similarity: number;
      }>;
    }>;
  };

  generateEmbedding: {
    execute(params: { text: string }): Promise<{
      embedding: number[];
    }>;
  };

  webSearch: {
    execute(params: { query: string }): Promise<{
      results: Array<{
        title: string;
        url: string;
        snippet: string;
      }>;
    }>;
  };
}
```

### executeCommand

```typescript
async function executeCommand(
  command: string,
  reason?: string,
  timeout = 60000
): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null }> {
  const sessionId = this.config.sessionId;
  const projectId = this.config.projectId;

  // Create SyncCommand entry
  const syncCommand = await prisma.syncCommand.create({
    data: {
      projectId,
      command,
      reason,
      type: "SHELL",
      status: CommandStatus.PENDING,
      requiresApproval: !this.config.autoApprove
    }
  });

  // Wait for approval (if not auto-approve)
  if (!this.config.autoApprove) {
    await waitForApproval(syncCommand.id);
  }

  // Update status to EXECUTING
  await prisma.syncCommand.update({
    where: { id: syncCommand.id },
    data: { status: CommandStatus.EXECUTING }
  });

  // Execute via sync-client or cloud mode
  const result = this.config.mode === "cloud"
    ? await executeInCloud(command, projectId)
    : await executeViaSyncClient(command, projectId);

  // Update SyncCommand with result
  await prisma.syncCommand.update({
    where: { id: syncCommand.id },
    data: {
      status: result.success ? CommandStatus.COMPLETED : CommandStatus.FAILED,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    }
  });

  return result;
}
```

### readFile

```typescript
async function readFile(filePath: string): Promise<{ success: boolean; content: string; error?: string }> {
  const projectDir = getProjectDir(this.config.projectId);
  const fullPath = path.join(projectDir, filePath);

  try {
    // Normalize path (security)
    const normalized = path.normalize(fullPath);
    if (!normalized.startsWith(projectDir)) {
      throw new Error("Access denied: path outside project directory");
    }

    const content = await fs.readFile(normalized, "utf-8");
    return { success: true, content };
  } catch (error) {
    return {
      success: false,
      content: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
```

### writeFile

```typescript
async function writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
  const projectDir = getProjectDir(this.config.projectId);
  const fullPath = path.join(projectDir, filePath);

  try {
    // Normalize path (security)
    const normalized = path.normalize(fullPath);
    if (!normalized.startsWith(projectDir)) {
      throw new Error("Access denied: path outside project directory");
    }

    // CRITICAL: OVERWRITES ENTIRE FILE
    // NO PLACEHOLDERS ALLOWED
    await fs.writeFile(normalized, content, "utf-8");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
```

### searchGlobalInsights

```typescript
async function searchGlobalInsights(
  query: string,
  limit = 5
): Promise<Array<{ title: string; category: string; recommendation: string; content: string; similarity: number }>> {
  // Generate embedding for query
  const queryVector = await generateEmbedding(query);

  // Fetch all insights with embeddings
  const allInsights = await prisma.globalInsight.findMany({
    where: { embedding: { not: null } },
    select: { id: true, title: true, category: true, recommendation: true, content: true, embedding: true }
  });

  // Calculate cosine similarity for each insight
  const scored = [];

  for (const insight of allInsights) {
    const vec = JSON.parse(insight.embedding);
    const score = cosineSimilarity(queryVector, vec);

    if (score > 0.5) {
      scored.push({ insight, score });
    }
  }

  // Sort by similarity and return top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ insight, score }) => ({
      title: insight.title,
      category: insight.category,
      recommendation: insight.recommendation,
      content: insight.content,
      similarity: score
    }));
}
```

### Инструменты и их использование

| Инструмент | Назначение | Пример использования | Ограничения |
|-----------|------------|-------------------|---------------|
| `executeCommand` | Выполнение shell команд | `npm install`, `npm test`, `npm run build` | Тайм-аут 60 сек |
| `readFile` | Чтение файлов проекта | Чтение `package.json`, `src/app.tsx` | Только внутри project dir |
| `writeFile` | Запись файлов | Создание/замена файлов | ПЕРЕЗАПИСЫВАЕТ весь файл, без плейсхолдеров |
| `generateText` | Вызов LLM | Генерация планов, кода | Ограничено maxTokens |
| `searchGlobalInsights` | RAG поиск в уроках | Поиск релевантных инсайтов | Нужен embedding |
| `webSearch` | Поиск в интернете | Поиск документации | Требуется Tavily API |

---

## Execution Modes

### Local Mode

**Описание:** Команды выполняются через **sync-client** на хост-машине пользователя

**Настройка:**
```typescript
executionMode = "local"
```

**Процесс:**
```
┌─────────────────────────────────────────────────────────┐
│         AGENT WANTS TO EXECUTE COMMAND             │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   CREATE SyncCommand (status: PENDING)            │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   IF NOT AUTO-APPROVE: WAIT FOR USER            │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   SYNC-CLIENT ON USER'S MACHINE POLLING            │
│   GET /api/sync/pending?projectId=xxx             │
│   → GETS SyncCommand                            │
│   → EXECUTES COMMAND LOCALLY                     │
│   → POST /api/sync/commandId/result             │
│   → SENDS stdout, stderr, exitCode               │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   UPDATE SyncCommand (status: COMPLETED/FAILED)     │
└─────────────────────────────────────────────────────────┘
```

**Требования:**
- `node sync-client.js` должен быть запущен на машине пользователя
- Пользователь одобряет команды (если не auto-approve)

**Плюсы:**
- Полный контроль над командами
- Возможность прерывания выполнения
- Нет ограничений по окружению

**Минусы:**
- Требует запущенного sync-client
- Зависит от соединения с клиентом

---

### Cloud Mode

**Описание:** Команды выполняются **внутри Docker контейнера** на сервере

**Настройка:**
```typescript
executionMode = "cloud"
```

**Процесс:**
```
┌─────────────────────────────────────────────────────────┐
│         AGENT WANTS TO EXECUTE COMMAND             │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   CREATE SyncCommand (status: PENDING)            │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   SERVER EXECUTES COMMAND DIRECTLY                  │
│   IN CONTAINER /projects/{projectId}/             │
│   → Executes: sh -c "{command}"                  │
│   → Captures stdout, stderr, exitCode            │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   UPDATE SyncCommand (status: COMPLETED/FAILED)     │
└─────────────────────────────────────────────────────────┘
```

**Требования:**
- Docker контейнер должен быть доступен
- Проект должен быть склонирован в `/projects/{projectId}/`

**Плюсы:**
- Не требует sync-client
- Полная автоматизация (headless)
- Быстрое выполнение на сервере

**Минусы:**
- Ограничения контейнера (например, нет браузера)
- Нет возможности ручного прерывания команд
- Может требовать специфического окружения

---

## Обработка ошибок и retry логика

### Ticket System

**Назначение:** Отслеживание багов от QA rejection

**Ticket Schema:**
```prisma
model Ticket {
  id             String       @id @default(cuid())
  projectId      String
  project        Project      @relation(fields: [projectId], references: [id])
  title          String
  description    String       @db.Text
  status         TicketStatus @default(OPEN)  // OPEN, IN_PROGRESS, DONE, REJECTED
  relatedTaskId  String?
  retryCount     Int          @default(0)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}
```

**Ticket Lifecycle:**

```
┌─────────────────────────────────────────────────────────┐
│   QA REJECTS TASK (no ticket exists)               │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   CREATE TICKET                                      │
│   - title: "QA Rejection: {task.title}"            │
│   - description: QA reasoning                         │
│   - relatedTaskId: taskId                           │
│   - status: OPEN                                    │
│   - retryCount: 0                                  │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   AHP PICKS TICKET (priority over tasks)           │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   TICKET_REQUEST → TASK_EXECUTOR                   │
│   ticket.status: IN_PROGRESS                        │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   TASK_EXECUTOR FIXES BUG                           │
│   - Regenerate prompt with ticket requirement         │
│   - Execute plan                                    │
│   - Send QA_REQUEST                                │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│   QA VERIFIES FIX                                 │
└─────────────────────────────────────────────────────────┘
                      │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌──────────────────┐   ┌──────────────────┐
│ APPROVED        │   │ REJECTED        │
├──────────────────┤   ├──────────────────┤
│ ticket.status = │   │ retryCount++    │
│   DONE           │   │ if retryCount < │
│                 │   │   3:           │
│ triggerNextTask │   │   status = OPEN  │
└──────────────────┘   │   else:         │
                       │   status =      │
                       │   REJECTED     │
                       └──────────────────┘
```

### Max Retries Logic

```typescript
const MAX_RETRIES = 3;

async function handleQAResponse(message: AgentMessage) {
  const { taskId, finalStatus, ticketId, reasoning } = message.payload;

  if (ticketId && finalStatus !== "DONE") {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { description: true, retryCount: true, relatedTaskId: true }
    });

    const retryCount = (ticket.retryCount ?? 0) + 1;

    if (retryCount > MAX_RETRIES) {
      // Exceeded max retries → reject ticket
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "REJECTED" }
      });

      this.log("info", `Ticket ${ticketId} REJECTED after ${retryCount} retries (max ${MAX_RETRIES})`);
    } else {
      // Reopen for retry
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: "OPEN",
          description: ticket.description + "\n\n--- FAILED QA RETRY ---\n" + reasoning,
          retryCount
        }
      });

      this.log("info", `Ticket ${ticketId} reopened for retry ${retryCount}/${MAX_RETRIES}`);
    }
  }
}
```

### Error Signature Tracking

```typescript
// Session Manager tracks recurring errors
interface RetrySummary {
  [signature: string]: number;  // Count of occurrences
}

// Generate signature from taskId + errorMessage
function generateErrorSignature(taskId: string, errorMessage: string): string {
  // Hash or simple concatenation
  return `${taskId}:${errorMessage.slice(0, 100)}`;
}

// Session metadata stores retryCounter
const sessionMetadata = {
  retryCounter: {
    "task_abc123:syntax error in line 45": 3,
    "task_def456:command not found": 2
  },
  lastErrorSignature: "task_abc123:syntax error in line 45"
};

// When error exceeds max retries, session pauses
if (retryCounter[signature] > MAX_ERROR_RETRIES) {
  await pauseSession(sessionId, `Too many retries for error: ${signature}`);
}
```

### Error Handling in Agents

```typescript
// Base Agent
async run(): Promise<void> {
  this.isRunning = true;

  try {
    const messages = await messageBus.getPendingMessagesFor(
      this.config.sessionId,
      this.config.agentRole
    );

    for (const message of messages) {
      if (this.isPaused) continue;
      if (!this.isRunning) break;

      try {
        await messageBus.markAsProcessing(message.id);

        const response = await this.processMessage(message);
        await messageBus.markAsProcessed(message.id, response);

        this.log("info", `[${this.config.agentRole}] Message processed: ${message.eventType}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        this.log("error", `[${this.config.agentRole}] Failed to process message: ${errorMsg}`);

        await messageBus.markAsFailed(message.id, errorMsg);
      }
    }
  } finally {
    this.isRunning = false;
  }
}
```

---

## API Endpoints

### Execution Sessions

#### Start Execution Session

```
POST /api/execution-sessions/start
```

**Request Body:**
```json
{
  "projectId": "clx123...",
  "planId": "clx456...",
  "costLimit": 5.0,
  "autoApprove": true,
  "executionMode": "local",
  "engine": "ahp"
}
```

**Response:**
```json
{
  "sessionId": "clx789...",
  "projectId": "clx123...",
  "status": "RUNNING",
  "costLimit": 5.0,
  "currentCost": 0,
  "engine": "ahp"
}
```

---

#### Run AHP Dispatcher

```
POST /api/execution-sessions/run-ahp
```

**Request Body:**
```json
{
  "sessionId": "clx789..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "AHP Dispatcher started",
  "sessionId": "clx789..."
}
```

---

#### Pause Session

```
POST /api/execution-sessions/[id]/pause
```

**Response:**
```json
{
  "success": true,
  "status": "PAUSED"
}
```

---

#### Resume Session

```
POST /api/execution-sessions/[id]/resume
```

**Response:**
```json
{
  "success": true,
  "status": "RUNNING"
}
```

---

#### Stop Session

```
POST /api/execution-sessions/[id]/stop
```

**Response:**
```json
{
  "success": true,
  "status": "STOPPED"
}
```

---

#### Get Session Events (SSE)

```
GET /api/execution-sessions/[id]/events
```

**Response:** Server-Sent Events stream

**Event Types:**
```typescript
type EventType =
  | "session_started"
  | "session_paused"
  | "session_resumed"
  | "session_stopped"
  | "task_started"
  | "task_completed"
  | "qa_started"
  | "qa_completed"
  | "ticket_created"
  | "ticket_completed"
  | "error"
  | "info";
```

---

#### Get Session Logs

```
GET /api/execution-sessions/[id]/logs
```

**Query Parameters:**
- `limit`: Number of logs to return (default: 100)
- `offset`: Offset for pagination

**Response:**
```json
{
  "logs": [
    {
      "id": "clx...",
      "type": "info",
      "message": "[TASK_EXECUTOR] Processing task...",
      "metadata": {
        "eventType": "task_started",
        "data": { "taskId": "clx..." }
      },
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

### Projects

#### Create Project

```
POST /api/projects
```

**Request Body:**
```json
{
  "ideaText": "Build a Todo app with React and TypeScript",
  "context": "I want a simple but functional Todo app...",
  "aiProvider": "openai",
  "aiModel": "gpt-4o-mini"
}
```

**Response:**
```json
{
  "id": "clx...",
  "ideaText": "Build a Todo app with React and TypeScript",
  "status": "IN_PROGRESS",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

---

#### Get Project

```
GET /api/projects/[id]
```

**Response:**
```json
{
  "id": "clx...",
  "ideaText": "...",
  "context": "...",
  "status": "IN_PROGRESS",
  "plans": [
    {
      "id": "clx...",
      "title": "React + Vite + TypeScript",
      "techStack": "React, Vite, TypeScript, Tailwind CSS",
      "selected": true
    }
  ],
  "tasks": [...],
  "tickets": [...],
  "executionSessions": [...]
}
```

---

### Tasks

#### Generate Tasks from Plan

```
POST /api/generate-tasks
```

**Request Body:**
```json
{
  "planId": "clx..."
}
```

**Response:**
```json
{
  "tasks": [
    {
      "id": "clx...",
      "planId": "clx...",
      "title": "Initialize Vite project",
      "description": "Run npx create-vite with React + TypeScript template",
      "status": "TODO",
      "executorAgent": "DEVOPS",
      "verificationCriteria": {
        "artifacts": ["package.json", "src/main.tsx"],
        "automatedCheck": "npm run build",
        "manualCheck": "Verify project structure is correct"
      }
    }
  ]
}
```

---

#### Approve Task (Manual)

```
POST /api/tasks/[id]/approve
```

**Response:**
```json
{
  "success": true,
  "status": "DONE"
}
```

---

#### Get Task QA Logs

```
GET /api/tasks/[id]/qa-logs
```

**Response:**
```json
{
  "qaLogs": [
    {
      "id": "clx...",
      "taskId": "clx...",
      "status": "APPROVED",
      "reasoning": "All criteria have sufficient evidence...",
      "confidence": 0.95,
      "createdAt": "2024-01-15T11:00:00Z"
    }
  ]
}
```

---

### Tickets

#### Get Tickets for Project

```
GET /api/tickets?projectId=clx...
```

**Response:**
```json
{
  "tickets": [
    {
      "id": "clx...",
      "projectId": "clx...",
      "title": "QA Rejection: Add delete functionality",
      "description": "Missing delete button on TodoItem...",
      "status": "OPEN",
      "relatedTaskId": "clx...",
      "retryCount": 0,
      "createdAt": "2024-01-15T12:00:00Z"
    }
  ]
}
```

---

### Ideas

#### Decompose Idea into Plans

```
POST /api/decompose-idea
```

**Request Body:**
```json
{
  "projectId": "clx...",
  "ideaText": "Build a Todo app",
  "context": "I want a simple but functional Todo app..."
}
```

**Response:**
```json
{
  "plans": [
    {
      "id": "clx...",
      "projectId": "clx...",
      "title": "React + Vite + TypeScript",
      "description": "Modern React with Vite for fast development...",
      "techStack": "React, Vite, TypeScript, Tailwind CSS",
      "estimatedComplexity": "L",
      "estimatedTime": "2-3 hours",
      "reasoning": "Vite provides fast dev server and HMR...",
      "prosCons": {
        "pros": [
          "Fast development with Vite",
          "TypeScript for type safety",
          "Tailwind for rapid styling"
        ],
        "cons": [
          "Requires npm/node"
        ]
      },
      "relevanceScore": 85
    },
    ...
  ]
}
```

---

### Sync (Sync Client)

#### Get Pending Commands

```
GET /api/sync/pending?projectId=clx...
```

**Response:**
```json
{
  "commands": [
    {
      "id": "clx...",
      "command": "npm install",
      "reason": "Install dependencies",
      "type": "SHELL",
      "status": "PENDING"
    }
  ]
}
```

---

#### Submit Command Result

```
POST /api/sync/[commandId]/result
```

**Request Body:**
```json
{
  "success": true,
  "stdout": "...",
  "stderr": "",
  "exitCode": 0
}
```

**Response:**
```json
{
  "success": true
}
```

---

### Insights

#### Search Global Insights

```
GET /api/insights/search?query=build+error&limit=5
```

**Response:**
```json
{
  "insights": [
    {
      "id": "clx...",
      "title": "Missing Dependencies in package.json",
      "category": "TOOLING",
      "severity": "high",
      "recommendation": "Always verify package.json includes all required dependencies before running npm install.",
      "content": "When agents forget to add dependencies...",
      "similarity": 0.85
    }
  ]
}
```

---

#### Get Global Insights for Project

```
GET /api/insights?projectId=clx...
```

**Response:**
```json
{
  "insights": [
    {
      "id": "clx...",
      "projectId": "clx...",
      "title": "...",
      "category": "...",
      "severity": "...",
      "recommendation": "...",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

## Датамодели

### Project

```prisma
model Project {
  id              String        @id @default(cuid())
  userId          String?
  ideaText        String
  context         String        @db.Text @default("")
  githubRepo      String?
  requireApproval Boolean       @default(false)
  aiProvider      String?
  aiModel         String?
  lastSeen        DateTime?     @default(now())
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  status          ProjectStatus @default(IN_PROGRESS)  // IN_PROGRESS, COMPLETED, ARCHIVED
  plans           Plan[]
  files           ProjectFile[]
  tokenUsages     TokenUsage[]
  syncCommands    SyncCommand[]
  executionSessions ExecutionSession[]
  tickets         Ticket[]
  globalInsights  GlobalInsight[]
}
```

### Plan

```prisma
model Plan {
  id                  String   @id @default(cuid())
  projectId           String
  project             Project  @relation(fields: [projectId], references: [id])
  title               String
  description         String?
  techStack           String
  relevanceScore      Int?
  selected            Boolean  @default(false)
  estimatedComplexity String?  @db.VarChar(2)  // "L", "M", "H"
  estimatedTime       String?  @db.VarChar(80)
  reasoning           String?  @db.Text
  prosCons            Json?
  createdAt           DateTime @default(now())
  tasks               Task[]
}
```

### Task

```prisma
model Task {
  id                  String            @id @default(cuid())
  planId              String
  plan                Plan              @relation(fields: [planId], references: [id])
  title               String
  description         String
  status              TaskStatus        @default(TODO)  // TODO, IN_PROGRESS, REVIEW, WAITING_APPROVAL, DONE, REJECTED
  executorAgent       AgentRole?        // TASK_EXECUTOR, BACKEND, DEVOPS, CSS
  observerAgent       AgentRole         @default(TEAMLEAD)
  generatedPrompt     String?           @db.Text
  branchName          String?
  verificationCriteria Json?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  comments            Comment[]
  dependencies        TaskDependency[]  @relation("TaskDependencies")
  dependents          TaskDependency[]  @relation("DependentTasks")
  tokenUsages         TokenUsage[]
  attachments         TaskAttachment[]
}
```

### Task Dependency

```prisma
model TaskDependency {
  id          String @id @default(cuid())
  taskId      String
  task        Task   @relation("TaskDependencies", fields: [taskId], references: [id])
  dependsOnId String
  dependsOn   Task   @relation("DependentTasks", fields: [dependsOnId], references: [id])
  createdAt   DateTime @default(now())

  @@unique([taskId, dependsOnId])
}
```

### Ticket

```prisma
model Ticket {
  id             String       @id @default(cuid())
  projectId      String
  project        Project      @relation(fields: [projectId], references: [id])
  title          String
  description    String       @db.Text
  status         TicketStatus @default(OPEN)  // OPEN, IN_PROGRESS, DONE, REJECTED
  relatedTaskId  String?
  retryCount     Int          @default(0)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}
```

### AgentRole Enum

```prisma
enum AgentRole {
  TASK_EXECUTOR
  BACKEND
  DEVOPS
  TEAMLEAD
  CURSOR
  QA
  CSS
}
```

### MessageType Enum

```prisma
enum MessageType {
  TASK_REQUEST
  TASK_RESPONSE
  TICKET_REQUEST
  TICKET_RESPONSE
  STYLE_REQUEST
  STYLE_RESPONSE
  QA_REQUEST
  QA_RESPONSE
  ARCHITECT_REQUEST
  ARCHITECT_RESPONSE
  USER_MESSAGE
  AGENT_MESSAGE
}
```

### ExecutionSession

```prisma
model ExecutionSession {
  id          String        @id @default(cuid())
  projectId    String
  project     Project       @relation(fields: [projectId], references: [id])
  planId      String?
  status      String        @default("RUNNING")  // RUNNING, PAUSED, STOPPED, ERROR
  costLimit   Float?
  currentCost Float         @default(0)
  metadata    Json?         @default("{}")
  engine      String?        @default("legacy")  // "legacy" or "ahp"
  startTime   DateTime?
  endTime     DateTime?
  totalSteps  Int?          @default(0)
  totalErrors Int?          @default(0)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  logs        ExecutionLog[]
  messages    AgentMessage[]
}
```

### AgentMessage

```prisma
model AgentMessage {
  id          String        @id @default(cuid())
  sessionId   String
  session     ExecutionSession @relation(fields: [sessionId], references: [id])

  sourceAgent AgentRole
  targetAgent AgentRole

  eventType   MessageType
  payload     Json         @default("{}")

  status      MessageStatus  @default(PENDING)  // PENDING, PROCESSING, PROCESSED, FAILED

  correlationId String?     @unique
  replyToId   String?
  replyTo     AgentMessage? @relation("MessageReplies", fields: [replyToId], references: [id])
  replies     AgentMessage[] @relation("MessageReplies")

  error       String?       @db.Text
  metadata    Json?        @default("{}")

  createdAt   DateTime      @default(now())
  processedAt DateTime?
  updatedAt   DateTime      @updatedAt

  @@index([sessionId, status, targetAgent])
  @@index([correlationId])
  @@index([replyToId])
}
```

### ExecutionLog

```prisma
model ExecutionLog {
  id        String   @id @default(cuid())
  sessionId String
  session   ExecutionSession @relation(fields: [sessionId], references: [id])
  type      String
  message   String   @db.Text
  metadata  Json?
  createdAt DateTime @default(now())
}
```

### GlobalInsight

```prisma
model GlobalInsight {
  id            String   @id @default(cuid())
  content       String   @db.Text
  tags          String[]
  embedding     String?  @db.Text
  projectId     String?
  project       Project?  @relation(fields: [projectId], references: [id])
  planId        String?
  sessionId     String?
  category      String?  // TOOLING, WORKFLOW, QA_PROCESS, ARCHITECTURE, DOCUMENTATION, MISC
  severity      String?  // low, medium, high
  title         String?
  recommendation String?  @db.Text
  fingerprint   String?  @unique
  createdAt     DateTime @default(now())
}
```

### SyncCommand

```prisma
model SyncCommand {
  id              String        @id @default(cuid())
  projectId       String
  project         Project       @relation(fields: [projectId], references: [id])
  command         String
  reason          String?
  type            String        @default("SHELL")
  filePath        String?
  fileContent     String?       @db.Text
  status          CommandStatus @default(PENDING)  // PENDING, APPROVED, EXECUTING, COMPLETED, FAILED, REJECTED, SKIPPED
  requiresApproval Boolean       @default(true)
  stdout          String?       @db.Text
  stderr          String?       @db.Text
  exitCode        Int?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}
```

### ProjectFile

```prisma
model ProjectFile {
  id          String          @id @default(cuid())
  projectId   String
  project     Project         @relation(fields: [projectId], references: [id])
  name        String
  url         String
  mimeType    String
  content     String?         @db.Text
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @default(now()) @updatedAt
  embeddings  FileEmbedding[]
  entities    CodeEntity[]
}
```

### FileEmbedding

```prisma
model FileEmbedding {
  id       String     @id @default(cuid())
  fileId   String
  file     ProjectFile @relation(fields: [fileId], references: [id])
  content  String     @db.Text
  embedding String?    @db.Text  // JSON-serialized vector (1536 dimensions)
}
```

### CodeEntity

```prisma
model CodeEntity {
  id         String     @id @default(cuid())
  fileId     String
  file       ProjectFile @relation(fields: [fileId], references: [id])
  name       String
  type       EntityType  // CLASS, FUNCTION, VARIABLE, IMPORT, EXPORT, INTERFACE, TYPE
  startLine  Int
  endLine    Int
  signature  String?    @db.Text
  metadata   String?    @default("{}")
  createdAt  DateTime   @default(now())
  dependenciesAsSource  CodeDependency[] @relation("SourceEntity")
  dependenciesAsTarget  CodeDependency[] @relation("TargetEntity")
}
```

### CodeDependency

```prisma
model CodeDependency {
  id          String     @id @default(cuid())
  sourceId    String
  source      CodeEntity @relation("SourceEntity", fields: [sourceId], references: [id])
  targetId    String
  target      CodeEntity @relation("TargetEntity", fields: [targetId], references: [id])
  type        DependencyType  // IMPORTS, CALLS, EXTENDS, IMPLEMENTS, TYPE_OF
  createdAt   DateTime   @default(now())
}
```

### TokenUsage

```prisma
model TokenUsage {
  id               String   @id @default(cuid())
  projectId        String
  project          Project  @relation(fields: [projectId], references: [id])
  taskId           String?
  task             Task?    @relation(fields: [taskId], references: [id])
  model            String
  promptTokens     Int
  completionTokens Int
  cost             Float
  actionType       String
  createdAt        DateTime @default(now())
}
```

---

## Технологический стек

### Frontend

| Технология | Версия | Назначение |
|-----------|--------|------------|
| **Next.js** | 14.x | React фреймворк с App Router |
| **React** | 18.x | UI библиотека |
| **TypeScript** | 5.x | Типизация |
| **Tailwind CSS** | 3.x | Стилизация |
| **shadcn/ui** | latest | UI компоненты |
| **Lucide Icons** | latest | Иконки |

### Backend

| Технология | Версия | Назначение |
|-----------|--------|------------|
| **Next.js API Routes** | 14.x | API endpoints |
| **TypeScript** | 5.x | Типизация |
| **Zod** | latest | Валидация данных |

### Database

| Технология | Версия | Назначение |
|-----------|--------|------------|
| **PostgreSQL** | 15.x | Основная БД |
| **pgvector** | latest | Векторный поиск |
| **Prisma ORM** | 5.x | ORM и миграции |

### AI / ML

| Технология | Версия | Назначение |
|-----------|--------|------------|
| **OpenAI API** | latest | LLM и embeddings |
| **Anthropic API** | latest | LLM (Claude) |
| **Z.ai API** | latest | LLM (альтернативный) |
| **AI SDK** (Vercel) | latest | Унифицированный интерфейс для AI провайдеров |
| **text-embedding-3-small** | latest | Embeddings (1536 dimensions) |
| **Tavily API** | latest | Web search |

### Инфраструктура

| Технология | Версия | Назначение |
|-----------|--------|------------|
| **Docker** | latest | Контейнеризация (cloud mode) |
| **Docker Compose** | latest | Управление контейнерами |
| **Node.js** | 20.x | Runtime |
| **npm** | 10.x | Package manager |

### Инструменты разработки

| Технология | Версия | Назначение |
|-----------|--------|------------|
| **ESLint** | latest | Линтинг |
| **Prettier** | latest | Форматирование |
| **Vitest** | latest | Unit тесты |
| **TypeScript Compiler** | 5.x | Проверка типов |

---

## Заключение

**AI Orchestrator** — это сложная, архитектурно выверенная система для автоматизированной разработки программного обеспечения с использованием множества AI агентов.

### Ключевые инновации:

1. **Agent Hive Protocol (AHP)** — Параллельное асинхронное выполнение агентов через Message Bus
2. **Strict QA с GSD методологией** — Предотвращение "hallucinated" завершений задач
3. **RAG с GlobalInsights** — Долгосрочная память для предотвращения повторных ошибок
4. **Dual Execution Modes** — AHP (параллельное) vs Legacy (последовательное)
5. **Human-in-the-Loop** — Необязательное одобрение команд и ручной review
6. **Self-Correction** — Автоматическое ре-планирование и создание тикетов для багов
7. **Cost Control** — Лимиты сессий и детальный tracking расходов

### Поток выполнения:

```
Idea → 3 Plans → Tasks → AHP Dispatcher → Parallel Agents
→ Execution → QA → TeamLead Decision → Next Task or Ticket Fix
→ Finalize → Reflexologist → GlobalInsights → Next Project Benefits
```

---

## Дополнительные ресурсы

- **AGENTS.md** — Архитектура агентов и роли
- **AUTO_SYNC_RAG_README.md** — RAG система
- **AUTO_SYNC_QUICKSTART.md** — Быстрый старт sync-client
- **QA_AGENT_README.md** — QA агент и GSD методология
- **TASK_DECOMPOSITION_README.md** — Разложение идей на задачи

---

*Документация сгенерирована автоматически на основе анализа кодовой базы AI Orchestrator.*
