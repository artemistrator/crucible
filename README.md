# AI Orchestrator

**AI-powered project management and development automation system that transforms ideas into structured development plans.**

AI Orchestrator decomposes ideas into tasks, manages projects using AI agents, implements RAG for context management, provides web search capabilities, and learns from past projects. Features auto-execution mode for hands-off task completion.

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Next.js API Routes, Vercel AI SDK (OpenAI, Anthropic, Z.ai) |
| **Database** | PostgreSQL with pgvector, Prisma ORM |
| **Infrastructure** | Docker Compose |
| **CLI** | TypeScript, Commander.js, Axios |
| **External** | Tavily API (web search), OpenAI Embeddings |

---

## Key Features

### 1. AI Decomposition

- **Idea → Plans**: Enter an idea in natural language, get 3 architectural plans with different tech stacks
- **Plan → Tasks**: Automatic task decomposition with dependencies and verification criteria
- **Global Memory**: AI learns from deleted projects and applies insights to new projects
- **Smart Complexity**: Automatic project size estimation (S/M/L/XL)

### 2. Smart Task Management

- **Kanban Board**: TODO → IN_PROGRESS → REVIEW → WAITING_APPROVAL → DONE
- **Human-in-the-Loop**: Optional approval gate before tasks move to DONE
- **Agent Assignment**: Frontend, Backend, DevOps, Teamlead, Cursor, QA agents
- **Dependency Graph**: Visualize and manage task dependencies with @xyflow/react
- **Detailed Prompts**: AI-generated coding prompts for each task

### 3. Auto Execution Mode

- **Fully Automated**: Execution agent picks up tasks and completes them automatically
- **Real-time Console**: Live terminal view with command execution and AI responses
- **Cost Control**: Set spending limits for execution sessions
- **Pause/Resume**: Control execution flow at any time
- **Command Approval**: Optional manual approval for each command

### 4. QA Code Review

- **Web Search**: Tavily API integration for up-to-date documentation
- **File Reading**: QA agent reads project files via `readFile` tool
- **Strict Verification**: Rejects tasks without concrete evidence (test logs, build output)
- **Debug Analysis**: Automatic failure analysis and specific feedback

### 5. RAG & Context

- **File Sync**: Real-time file synchronization with RAG embeddings
- **Vector Search**: pgvector-based semantic search across project files
- **Code Entities**: Automatic extraction of classes, functions, imports
- **Global Context**: Project-level rules and context for all agents

### 6. Dynamic Replanning

- **Architect Agent**: Updates remaining tasks based on completed work
- **Impact Analysis**: Automatically adjusts dependent tasks
- **ADR Generation**: Architecture Decision Records for plan changes

### 7. FinOps - Cost Tracking

- **Automatic Tracking**: All AI calls logged with tokens and cost
- **Project Dashboard**: Per-project cost breakdown
- **Global Billing**: `/api/billing` for total expenses
- **Model Comparison**: Track costs across different AI providers

### 8. CLI Tool

Command-line interface for integrating external projects:

```bash
# Initialize connection
orchestrator init

# Get next task
orchestrator task next

# Report progress
orchestrator report <taskId> --content "Work done..." --file path/to/file.ts

# Mark task complete
orchestrator done <taskId>

# Get AI prompt for task
orchestrator prompt <taskId>
```

---

## Installation & Setup

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd ai-orchestrator
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

**Required Variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL URL with pgvector | ✅ |
| `OPENAI_API_KEY` | OpenAI API key | For OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key | For Claude |
| `ZAI_API_KEY` | Z.ai (GLM) API key | For Z.ai |
| `TAVILY_API_KEY` | Tavily API key | For web search |

### 3. Docker Deployment

```bash
# First time (clean database)
docker compose down -v
docker compose up -d --build

# Subsequent runs
docker compose up -d --build
```

**Services:**
- App: http://localhost:3002
- Adminer (DB UI): http://localhost:8081
- PostgreSQL: localhost:5433

### 4. Database Migrations

Migrations run automatically on first start. For manual updates:

```bash
docker compose exec app npx prisma db push
```

### 5. Sync Client Modes & Env

- **Host sync-client (recommended for local dev):**
  - Run `node sync-client.js` from the downloaded kit on your host machine.
  - By default it connects to `http://localhost:3002/api/sync` (exported from docker).
  - You can override with `--url http://localhost:3002/api/sync`.
- **Server sync-client (inside container, auto-start):**
  - Controlled by env flags:
    - `SYNC_CLIENT_AUTOSTART=true` — allow server to spawn sync-client processes per project.
    - `NEXT_PUBLIC_SYNC_CLIENT_AUTOSTART=true` — UI hint that sync-client is started on the server side.
  - Inside docker the app listens on `http://app:3000`; `INTERNAL_APP_URL` is set accordingly.

---

## CLI Setup

Navigate to CLI directory and install dependencies:

```bash
cd cli
npm install
npm run build
```

**Usage:**

```bash
# Link globally (optional)
npm link

# Or run directly
npm run dev <command>
```

**Workflow:**
1. `orchestrator init` - Configure project connection
2. `orchestrator task next` - Fetch current task
3. Work on task...
4. `orchestrator report <taskId> --content "..."` - Submit progress
5. `orchestrator done <taskId>` - Mark complete

---

## Auto Execution

Start automated task execution from the web UI:

1. Open project plan page
2. Click "Start Execution" button
3. Configure:
   - **Auto-approve**: Skip command confirmations
   - **Cost limit**: Maximum spending for session
4. Monitor progress in the Execution Console

The execution agent will:
1. Pick up pending tasks
2. Generate detailed prompts
3. Execute commands
4. Verify completion via QA
5. Move to next task

---

## API Endpoints

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/decompose-idea` | Create project + 3 plans |
| `POST` | `/api/generate-tasks` | Generate tasks from plan |
| `POST` | `/api/generate-coding-prompt` | Get task prompt |
| `POST` | `/api/upload` | Upload files |
| `GET`/`POST` | `/api/tasks` | Task CRUD |
| `POST` | `/api/tasks/[taskId]/approve` | Approve task completion |
| `GET` | `/api/tasks/[taskId]/qa-logs` | QA verification logs |

### Execution Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/execution-sessions/start` | Start auto execution |
| `POST` | `/api/execution-sessions/[id]/pause` | Pause execution |
| `POST` | `/api/execution-sessions/[id]/resume` | Resume execution |
| `POST` | `/api/execution-sessions/[id]/stop` | Stop execution |
| `GET` | `/api/execution-sessions/[id]/logs` | Get execution logs |
| `POST` | `/api/execution-sessions/chat` | Send message to AI |

### Integration Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/webhooks/github` | GitHub webhooks |
| `GET` | `/api/mcp/tasks` | MCP: Get tasks |
| `POST` | `/api/ide` | IDE integration |
| `POST` | `/api/sync` | File sync |
| `POST` | `/api/sync/command` | Create command |

### Other Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/billing` | Global billing stats |
| `GET` | `/api/insights` | Learned insights |
| `GET` | `/api/projects/[id]/billing` | Project billing |

---

## Agent Tools

- `searchKnowledge` - RAG search across project files
- `webSearch` - Internet search via Tavily API
- `readFile` - Read file contents
- `executeCommand` - Execute shell commands
- `findRelatedFiles` - Find code dependencies

---

## Project Structure

```
ai-orchestrator/
├── app/
│   ├── api/                    # API Routes
│   │   ├── ai-agent/          # Unified AI agent endpoint
│   │   ├── billing/           # Global billing
│   │   ├── comments/          # Comments CRUD
│   │   ├── decompose-idea/    # Idea decomposition
│   │   ├── download-kit/      # Quick start kit download
│   │   ├── execution-sessions/# Auto execution API
│   │   ├── files/             # File management
│   │   ├── generate-coding-prompt/
│   │   ├── generate-tasks/
│   │   ├── ide/               # IDE integration
│   │   ├── insights/          # Global insights
│   │   ├── mcp/               # MCP endpoints
│   │   ├── projects/          # Projects CRUD & billing
│   │   ├── sync/              # File sync & commands
│   │   ├── tasks/             # Tasks CRUD, QA logs, approve
│   │   └── webhooks/          # GitHub webhooks
│   ├── debug-console/         # Debug console page
│   ├── project/[id]/          # Project pages
│   ├── layout.tsx
│   └── page.tsx
├── components/                 # UI Components
│   ├── BillingDashboard.tsx
│   ├── ExecutionConsole.tsx   # Auto execution terminal
│   ├── GenerateTasksButton.tsx
│   ├── InsightsModal.tsx
│   ├── PlanList.tsx
│   ├── ProjectContextSheet.tsx
│   ├── ProjectSidebar.tsx
│   ├── StartExecutionModal.tsx # Execution config modal
│   ├── SyncStatus.tsx
│   ├── TaskDetailSheet.tsx
│   ├── TaskGraph.tsx
│   ├── TaskListClient.tsx
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── agents/                # AI Agents
│   │   ├── architect.ts       # Plan creation & replanning
│   │   ├── debug.ts           # Failure analysis
│   │   ├── doc-writer.ts      # ADR generation
│   │   ├── execution-agent.ts # Auto task execution
│   │   ├── project-context.ts # Context gathering
│   │   ├── prompt-generator.ts
│   │   ├── qa.ts              # Quality assurance
│   │   └── tools.ts           # Agent tools
│   ├── ai/                    # AI providers & pricing
│   │   ├── call.ts
│   │   ├── parse.ts
│   │   ├── pricing.ts
│   │   ├── providers.ts
│   │   └── zai.ts
│   ├── execution/             # Execution session management
│   │   ├── session-manager.ts
│   │   └── sse-store.ts
│   ├── rag/                   # RAG system
│   │   ├── chunk.ts
│   │   ├── embeddings.ts
│   │   ├── index.ts
│   │   ├── parser.ts
│   │   ├── search.ts
│   │   └── store.ts
│   ├── prisma.ts
│   ├── project-workspace.ts
│   ├── qa-logger.ts
│   └── utils.ts
├── prisma/
│   └── schema.prisma          # Database schema
├── public/
│   ├── sync-client.js         # Legacy sync client
│   ├── sync-init.js           # Legacy sync init
│   └── uploads/               # Uploaded files
├── cli/                       # Command-line interface
│   ├── index.ts              # CLI entry point
│   ├── docs/
│   │   └── AI_AGENTS_GUIDE.md
│   └── package.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

---

## Database Schema

**Core Models:**
- `Project` - Project container with idea, context, settings
- `Plan` - Architectural plans with tech stack
- `Task` - Tasks with status, executor, verification criteria
- `TaskDependency` - Task relationships
- `Comment` - Task comments
- `ProjectFile` - Uploaded files
- `FileEmbedding` - Vector embeddings for RAG
- `CodeEntity` - Extracted code entities
- `CodeDependency` - Code relationships
- `GlobalInsight` - Learned lessons from deleted projects
- `TokenUsage` - AI usage tracking
- `SyncCommand` - Commands for client execution
- `ExecutionSession` - Auto execution sessions
- `ExecutionLog` - Execution session logs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                           │
│  Task Lists | Task Graph | Billing | Execution Console      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js)                        │
│  decompose-idea | generate-tasks | qa-check | execution     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI Agents                                   │
│  ┌──────────┐ ┌──────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │
│  │Architect │ │  QA  │ │Prompt   │ │  Doc   │ │Execution│   │
│  │Agent     │ │Agent │ │Generator│ │Writer  │ │ Agent   │   │
│  └──────────┘ └──────┘ └─────────┘ └────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ PostgreSQL  │  │  pgvector   │  │  File Embeddings │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  External Services                           │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐         │
│  │ OpenAI  │ │Anthropic │ │  Z.ai   │ │ Tavily   │         │
│  └─────────┘ └──────────┘ └─────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Client Integration                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │ CLI Tool    │ │ Sync Client │ │   Cursor IDE  │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

For enterprise deployment:

- **Authentication**: SSO (OAuth2/OIDC), role-based access
- **Multi-tenancy**: Organization isolation, quotas
- **Observability**: Logging, metrics (Prometheus), tracing
- **Security**: API key management, rate limiting
- **Scaling**: Queue-based processing (Bull, SQS)
- **Backup**: Automated database backups

---

## License

MIT

---

---

# AI Orchestrator (Русская версия)

**AI-система управления проектами и автоматизации разработки, превращающая идеи в структурированные планы.**

AI Orchestrator декомпозирует идеи в задачи, управляет проектами с помощью AI-агентов, использует RAG для управления контекстом, предоставляет возможности веб-поиска и обучается на прошлых проектах. Включает режим автоматического выполнения задач.

---

## Технологический стек

| Слой | Технологии |
|------|------------|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Next.js API Routes, Vercel AI SDK (OpenAI, Anthropic, Z.ai) |
| **Database** | PostgreSQL с pgvector, Prisma ORM |
| **Инфраструктура** | Docker Compose |
| **CLI** | TypeScript, Commander.js, Axios |
| **Внешние сервисы** | Tavily API (веб-поиск), OpenAI Embeddings |

---

## Основные возможности

### 1. AI Декомпозиция

- **Идея → Планы**: Введите идею естественным языком, получите 3 архитектурных плана с разными технологическими стеками
- **План → Задачи**: Автоматическая декомпозиция с зависимостями и критериями верификации
- **Глобальная память**: AI учится на удаленных проектах и применяет инсайты к новым проектам
- **Умная оценка сложности**: Автоматическая оценка размера проекта (S/M/L/XL)

### 2. Умное управление задачами

- **Канбан доска**: TODO → IN_PROGRESS → REVIEW → WAITING_APPROVAL → DONE
- **Human-in-the-Loop**: Опциональное подтверждение перед переходом в DONE
- **Назначение агентов**: Frontend, Backend, DevOps, Teamlead, Cursor, QA агенты
- **Граф зависимостей**: Визуализация и управление зависимостями задач через @xyflow/react
- **Детальные промпты**: AI-генерация промптов для кодинга для каждой задачи

### 3. Режим автоматического выполнения

- **Полная автоматизация**: Execution agent берет задачи и выполняет их автоматически
- **Консоль в реальном времени**: Живой терминал с выполнением команд и ответами AI
- **Контроль затрат**: Установка лимитов расходов на сессии выполнения
- **Пауза/Возобновление**: Контроль выполнения в любой момент
- **Подтверждение команд**: Опциональное ручное подтверждение каждой команды

### 4. QA Code Review

- **Веб-поиск**: Интеграция Tavily API для актуальной документации
- **Чтение файлов**: QA агент читает файлы проекта через инструмент `readFile`
- **Строгая верификация**: Отклонение задач без конкретных доказательств (логи тестов, вывод сборки)
- **Анализ ошибок**: Автоматический анализ отказов и конкретная обратная связь

### 5. RAG и контекст

- **Синхронизация файлов**: Реальтайм синхронизация файлов с RAG эмбеддингами
- **Векторный поиск**: Семантический поиск по файлам проекта на базе pgvector
- **Сущности кода**: Автоматическое извлечение классов, функций, импортов
- **Глобальный контекст**: Проектные правила и контекст для всех агентов

### 6. Динамическое перепланирование

- **Архитектор**: Обновление оставшихся задач на основе выполненной работы
- **Анализ влияния**: Автоматическая корректировка зависимых задач
- **Генерация ADR**: Architecture Decision Records для изменений плана

### 7. FinOps — учет затрат

- **Автоматический трекинг**: Все вызовы AI логируются с токенами и стоимостью
- **Дашборд проекта**: Детализация затрат по проекту
- **Глобальный биллинг**: `/api/billing` для общих расходов
- **Сравнение моделей**: Отслеживание затрат между разными AI провайдерами

### 8. CLI инструмент

Командная строка для интеграции внешних проектов:

```bash
# Инициализация подключения
orchestrator init

# Получить следующую задачу
orchestrator task next

# Отчет о прогрессе
orchestrator report <taskId> --content "Работа выполнена..." --file path/to/file.ts

# Отметить задачу выполненной
orchestrator done <taskId>

# Получить AI промпт для задачи
orchestrator prompt <taskId>
```

---

## Установка и настройка

### 1. Клонирование репозитория

```bash
git clone <your-repo-url>
cd ai-orchestrator
```

### 2. Настройка окружения

```bash
cp .env.example .env
```

**Обязательные переменные:**

| Переменная | Описание | Обязательно |
|------------|----------|-------------|
| `DATABASE_URL` | URL PostgreSQL с pgvector | ✅ |
| `OPENAI_API_KEY` | Ключ OpenAI API | Для OpenAI |
| `ANTHROPIC_API_KEY` | Ключ Anthropic | Для Claude |
| `ZAI_API_KEY` | Ключ Z.ai (GLM) | Для Z.ai |
| `TAVILY_API_KEY` | Ключ Tavily | Для веб-поиска |

### 3. Развертывание через Docker

```bash
# Первый запуск (чистая база)
docker compose down -v
docker compose up -d --build

# Последующие запуски
docker compose up -d --build
```

**Сервисы:**
- Приложение: http://localhost:3002
- Adminer (DB UI): http://localhost:8081
- PostgreSQL: localhost:5433

### 4. Миграции базы данных

Миграции выполняются автоматически при первом запуске. Для ручного обновления:

```bash
docker compose exec app npx prisma db push
```

---

## Настройка CLI

Перейдите в директорию CLI и установите зависимости:

```bash
cd cli
npm install
npm run build
```

**Использование:**

```bash
# Глобальная ссылка (опционально)
npm link

# Или запуск напрямую
npm run dev <command>
```

**Рабочий процесс:**
1. `orchestrator init` - Настройка подключения к проекту
2. `orchestrator task next` - Получение текущей задачи
3. Работа над задачей...
4. `orchestrator report <taskId> --content "..."` - Отправка прогресса
5. `orchestrator done <taskId>` - Отметка выполнения

---

## Автоматическое выполнение

Запуск автоматического выполнения задач из веб-интерфейса:

1. Откройте страницу плана проекта
2. Нажмите кнопку "Start Execution"
3. Настройте:
   - **Auto-approve**: Пропуск подтверждений команд
   - **Cost limit**: Максимальный бюджет сессии
4. Следите за прогрессом в Execution Console

Execution agent будет:
1. Брать ожидающие задачи
2. Генерировать детальные промпты
3. Выполнять команды
4. Верифицировать завершение через QA
5. Переходить к следующей задаче

---

## API Endpoints

### Основные endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/decompose-idea` | Создать проект + 3 плана |
| `POST` | `/api/generate-tasks` | Генерация задач из плана |
| `POST` | `/api/generate-coding-prompt` | Получить промпт задачи |
| `POST` | `/api/upload` | Загрузка файлов |
| `GET`/`POST` | `/api/tasks` | CRUD задач |
| `POST` | `/api/tasks/[taskId]/approve` | Подтвердить выполнение |
| `GET` | `/api/tasks/[taskId]/qa-logs` | Логи QA верификации |

### Endpoints выполнения

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/execution-sessions/start` | Запуск авто-выполнения |
| `POST` | `/api/execution-sessions/[id]/pause` | Пауза выполнения |
| `POST` | `/api/execution-sessions/[id]/resume` | Возобновление |
| `POST` | `/api/execution-sessions/[id]/stop` | Остановка |
| `GET` | `/api/execution-sessions/[id]/logs` | Получение логов |
| `POST` | `/api/execution-sessions/chat` | Отправка сообщения AI |

### Интеграционные endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/webhooks/github` | GitHub вебхуки |
| `GET` | `/api/mcp/tasks` | MCP: получить задачи |
| `POST` | `/api/ide` | IDE интеграция |
| `POST` | `/api/sync` | Синхронизация файлов |
| `POST` | `/api/sync/command` | Создание команды |

### Другие endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/billing` | Глобальная статистика |
| `GET` | `/api/insights` | Извлеченные инсайты |
| `GET` | `/api/projects/[id]/billing` | Биллинг проекта |

---

## Инструменты агентов

- `searchKnowledge` - RAG поиск по файлам проекта
- `webSearch` - Поиск в интернете через Tavily API
- `readFile` - Чтение содержимого файлов
- `executeCommand` - Выполнение shell команд
- `findRelatedFiles` - Поиск зависимостей кода

---

## Структура проекта

```
ai-orchestrator/
├── app/
│   ├── api/                    # API Routes
│   │   ├── ai-agent/          # Unified AI agent endpoint
│   │   ├── billing/           # Глобальный биллинг
│   │   ├── comments/          # CRUD комментариев
│   │   ├── decompose-idea/    # Декомпозиция идей
│   │   ├── download-kit/      # Скачивание quick start kit
│   │   ├── execution-sessions/# API авто-выполнения
│   │   ├── files/             # Управление файлами
│   │   ├── generate-coding-prompt/
│   │   ├── generate-tasks/
│   │   ├── ide/               # IDE интеграция
│   │   ├── insights/          # Глобальные инсайты
│   │   ├── mcp/               # MCP endpoints
│   │   ├── projects/          # CRUD проектов и биллинг
│   │   ├── sync/              # Синхронизация и команды
│   │   ├── tasks/             # CRUD задач, QA логи, подтверждение
│   │   └── webhooks/          # GitHub вебхуки
│   ├── debug-console/         # Страница debug консоли
│   ├── project/[id]/          # Страницы проектов
│   ├── layout.tsx
│   └── page.tsx
├── components/                 # UI компоненты
│   ├── BillingDashboard.tsx
│   ├── ExecutionConsole.tsx   # Терминал авто-выполнения
│   ├── GenerateTasksButton.tsx
│   ├── InsightsModal.tsx
│   ├── PlanList.tsx
│   ├── ProjectContextSheet.tsx
│   ├── ProjectSidebar.tsx
│   ├── StartExecutionModal.tsx # Модалка настроек выполнения
│   ├── SyncStatus.tsx
│   ├── TaskDetailSheet.tsx
│   ├── TaskGraph.tsx
│   ├── TaskListClient.tsx
│   └── ui/                    # shadcn/ui компоненты
├── lib/
│   ├── agents/                # AI Агенты
│   │   ├── architect.ts       # Создание планов и перепланирование
│   │   ├── debug.ts           # Анализ ошибок
│   │   ├── doc-writer.ts      # Генерация ADR
│   │   ├── execution-agent.ts # Авто-выполнение задач
│   │   ├── project-context.ts # Сбор контекста
│   │   ├── prompt-generator.ts
│   │   ├── qa.ts              # Quality assurance
│   │   └── tools.ts           # Инструменты агентов
│   ├── ai/                    # AI провайдеры и прайсинг
│   │   ├── call.ts
│   │   ├── parse.ts
│   │   ├── pricing.ts
│   │   ├── providers.ts
│   │   └── zai.ts
│   ├── execution/             # Управление сессиями выполнения
│   │   ├── session-manager.ts
│   │   └── sse-store.ts
│   ├── rag/                   # RAG система
│   │   ├── chunk.ts
│   │   ├── embeddings.ts
│   │   ├── index.ts
│   │   ├── parser.ts
│   │   ├── search.ts
│   │   └── store.ts
│   ├── prisma.ts
│   ├── project-workspace.ts
│   ├── qa-logger.ts
│   └── utils.ts
├── prisma/
│   └── schema.prisma          # Схема базы данных
├── public/
│   ├── sync-client.js         # Legacy sync client
│   ├── sync-init.js           # Legacy sync init
│   └── uploads/               # Загруженные файлы
├── cli/                       # Командная строка
│   ├── index.ts              # Точка входа CLI
│   ├── docs/
│   │   └── AI_AGENTS_GUIDE.md
│   └── package.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

---

## Схема базы данных

**Основные модели:**
- `Project` - Контейнер проекта с идеей, контекстом, настройками
- `Plan` - Архитектурные планы с технологическим стеком
- `Task` - Задачи со статусом, исполнителем, критериями верификации
- `TaskDependency` - Связи между задачами
- `Comment` - Комментарии к задачам
- `ProjectFile` - Загруженные файлы
- `FileEmbedding` - Векторные эмбеддинги для RAG
- `CodeEntity` - Извлеченные сущности кода
- `CodeDependency` - Связи кода
- `GlobalInsight` - Извлеченные уроки из удаленных проектов
- `TokenUsage` - Трекинг использования AI
- `SyncCommand` - Команды для выполнения на клиенте
- `ExecutionSession` - Сессии авто-выполнения
- `ExecutionLog` - Логи сессий выполнения

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     Пользовательский интерфейс               │
│  Списки задач | Граф задач | Биллинг | Консоль выполнения   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js)                        │
│  декомпозиция | генерация задач | QA проверка | выполнение  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI Агенты                                   │
│  ┌──────────┐ ┌──────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │
│  │Архитектор│ │  QA  │ │Генератор│ │  Doc   │ │Выполнение│  │
│  │  Агент   │ │Агент │ │ Промптов│ │Writer  │ │  Агент  │   │
│  └──────────┘ └──────┘ └─────────┘ └────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Слой данных                                │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ PostgreSQL  │  │  pgvector   │  │  File Embeddings │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Внешние сервисы                             │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐         │
│  │ OpenAI  │ │Anthropic │ │  Z.ai   │ │ Tavily   │         │
│  └─────────┘ └──────────┘ └─────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Клиентская интеграция                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │ CLI Tool    │ │ Sync Client │ │   Cursor IDE  │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Следующие шаги

Для enterprise развертывания:

- **Аутентификация**: SSO (OAuth2/OIDC), ролевой доступ
- **Мульти-тенантность**: Изоляция по организациям, квоты
- **Наблюдаемость**: Логирование, метрики (Prometheus), трассировка
- **Безопасность**: Управление API ключами, rate limiting
- **Масштабирование**: Очередная обработка (Bull, SQS)
- **Резервное копирование**: Автоматические бэкапы БД

---

## Лицензия

MIT