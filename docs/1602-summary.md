# Сессия 1602 - Direct Execution Mode Integration

## Дата: 16 февраля 2026
## Статус: В РАЗРАБОТКЕ

---

## 1. Проблема с tools.ts

### Симптомы
- Файл `lib/agents/tools.ts` содержал дублирующиеся функции
- Ошибка компиляции TypeScript

### Решение
Восстановлен оригинальный файл из `lib/agents/tools.ts.original` с добавлениями:
- Импорты для ExecutionSessionManager
- Helper-функции: `createErrorSignature()` и `handleCommandError()`
- Обновлены сигнатуры функций с параметром `executionSessionId`
- Добавлены вызовы `handleCommandError` в блоках catch

### Код добавленных функций
```typescript
function createErrorSignature(command: string, errorMessage: string): string {
  const signature = `${command}:${errorMessage}`;
  return createHash('sha256').update(signature).digest('hex').substring(0, 16);
}

async function handleCommandError(projectId: string, command: string, errorMessage: string, executionSessionId?: string): Promise<void> {
  if (!executionSessionId) {
    console.warn(`[Tools] Command error for '${command}' but no executionSessionId was provided.`);
    return;
  }
  const errorSignature = createErrorSignature(command, errorMessage);
  const sessionManager = ExecutionSessionManager.getInstance();

  await sessionManager.incrementRetryCounter(executionSessionId, errorSignature);

  const { shouldPause, reason } = await sessionManager.checkRetryLimit(executionSessionId, errorSignature);

  if (shouldPause) {
    await sessionManager.pauseSession(executionSessionId, reason);
  }
}
```

---

## 2. Исправление UI Графа Задач

### Проблема
Граф задач отображался некорректно:
- Задачи "обрезались"
- Связи улетали за пределы контейнера
- Конфликт стилей с Tailwind

### Файлы изменены
- `components/TaskGraph.tsx`
- `components/TaskListClient.tsx`

### Решение
```typescript
// TaskGraph.tsx - исправленный контейнер
return (
  <div className="h-[600px] w-full overflow-hidden rounded-lg">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      className="bg-slate-50"
      // ... другие пропсы
    ></ReactFlow>
  </div>
);

// TaskListClient.tsx - wrapper с фиксированной высотой
{viewMode === "graph" ? (
  <div className="h-[600px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
    <ReactFlowProvider>
      <TaskGraph tasks={taskItems} onTaskClick={handleTaskClick} />
    </ReactFlowProvider>
  </div>
) : (...)}
```

---

## 3. Реализация UI Direct Execution Mode

### Созданные файлы
- `components/PlanPageClient.tsx` - клиентская обёртка с переключением режимов
- `components/ui/progress.tsx` - компонент прогресс-бара

### Изменённые файлы
- `app/project/[id]/plan/[planId]/page.tsx` - интегрирован PlanPageClient

### Функционал
1. **Tabs-переключатель**: "Planning" / "Execution"
2. **Режим Execution**:
   - Слева (30%): компактный список задач с прогресс-баром
   - Справа (70%): ExecutionConsole с логами
   - Кнопка "Start Auto Execution"
3. **StartExecutionModal**: настройка auto-approve и лимита стоимости

---

## 4. Проблема с API Route (/api/execution-sessions/start)

### Симптом
- Ошибка 404 при вызове `/api/execution-sessions/start`
- Файл `route.ts` находился в `/api/execution-sessions/`, но вызывался `/api/execution-sessions/start`

### Причина
Next.js App Router использует структуру папок для определения URL:
- Файл `route.ts` в папке `/api/execution-sessions/` обрабатывает URL `/api/execution-sessions`
- Для URL `/api/execution-sessions/start` нужен файл `start/route.ts`

### Решение
Создана правильная структура:
```
app/api/execution-sessions/
├── start/
│   └── route.ts     # POST /api/execution-sessions/start
├── run/
│   └── route.ts     # Воркер для выполнения задач
├── [sessionId]/
│   ├── events/route.ts   # SSE для логов
│   ├── pause/route.ts    # Пауза сессии
│   ├── resume/route.ts   # Возобновление
│   └── stop/route.ts     # Остановка
```

---

## 5. Потеря данных в БД

### Причина
Команда `docker compose down -v` с флагом `-v` удаляет named volumes:
- `db_data` - данные PostgreSQL
- `app_node_modules` - кэш node_modules

### Последствия
- Все проекты удалены
- База данных пустая
- Таблицы существуют, но данных нет

### Восстановление
Данные НЕВОЗМОЖНО восстановить. Флаг `-v` физически удаляет тома с диска.

### Рекомендации на будущее
```bash
# ✅ Безопасный перезапуск (сохраняет данные):
docker compose down
docker compose up -d

# ✅ Пересборка с сохранением данных:
docker compose down
docker compose build app
docker compose up -d

# ❌ ОПАСНО - удаляет данные:
docker compose down -v

# Для бэкапа:
docker exec ai-orchestrator-db-1 pg_dump -U orchestrator orchestrator > backup.sql
```

---

## 6. Главная проблема: Отсутствие Execution Worker

### Симптом
- API создаёт сессию (200 OK)
- В логах: `"Started session cmloybch2000gau7xrf8jvxfh"`
- Но НИЧЕГО не происходит - команды не генерируются, код не пишется

### Причина
**Был создан API для сессий, но НЕ БЫЛО компонента, который бы ЗАПУСКАЛ ExecutionAgent!**

Система создавала запись в БД и на этом всё заканчивалось.

### Решение: Создан Execution Worker

**Файл: `app/api/execution-sessions/run/route.ts`**

```typescript
async function runExecutionSession(sessionId: string) {
  try {
    const session = await prisma.executionSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    const tasks = await prisma.task.findMany({
      where: {
        planId: session.planId || undefined,
        status: "TODO",
      },
      orderBy: { createdAt: "asc" },
    });

    const agent = new ExecutionAgent({
      projectId: session.projectId,
      planId: session.planId || "",
      sessionId: session.id,
      autoApprove: (session.metadata as Record<string, any>)?.autoApprove || false,
      onLog: (level, message) => {
        console.log(`[ExecutionAgent/${sessionId}] [${level}] ${message}`);
      },
    });

    for (const task of tasks) {
      await agent.executeTask(task.id);
    }
  } catch (error) {
    console.error(`[Worker] Error running session ${sessionId}:`, error);
  }
}

export async function POST(request: NextRequest) {
  const { sessionId } = await request.json();
  runExecutionSession(sessionId);
  return NextResponse.json({ success: true, sessionId });
}
```

### Обновлённый start endpoint (`app/api/execution-sessions/start/route.ts`)

```typescript
export async function POST(request: NextRequest) {
  // ... создание сессии ...

  // Запуск воркера
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/execution-sessions/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      sessionId: session.id,
      autoApprove: autoApprove || false
    }),
  });

  return NextResponse.json({ sessionId: session.id, ... });
}
```

---

## 7. Архитектура Direct Execution Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Orchestrator Backend                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   UI (Execution Console)                                          │
│        │                                                         │
│        ▼                                                         │
│   POST /api/execution-sessions/start                             │
│        │                                                         │
│        ▼                                                         │
│   Создаёт сессию в БД                                           │
│        │                                                         │
│        ▼                                                         │
│   POST /api/execution-sessions/run  (воркер)                     │
│        │                                                         │
│        ▼                                                         │
│   ExecutionAgent ──► AI Model (GPT-4/ZAI)                       │
│        │                                                         │
│        ▼                                                         │
│   Создаёт команды (WRITE_FILE, SHELL)                            │
│        │                                                         │
│        ▼                                                         │
│   SyncCommand в БД                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────┐
              │     Sync Client (отдельная        │
              │     программа на клиенте)          │
              │     - Polling БД                  │
              │     - Выполняет команды           │
              │     - Записывает stdout/stderr    │
              └───────────────────────────────────┘
```

---

## 8. Как работает система

### 1. Создание задач
1. Пользователь создаёт проект и идею
2. AI генерирует план с задачами (через `/api/generate-tasks`)
3. Задачи сохраняются в БД со статусом `TODO`

### 2. Запуск Direct Execution
1. Пользователь переходит на страницу плана
2. Переключается на вкладку **"Execution"**
3. Нажимает **"Start Auto Execution"**
4. Выбирает настройки:
   - **Auto-approve**: автоматически подтверждать команды
   - **Cost limit**: лимит расходов (опционально)
5. Нажимает **"Start Execution"**

### 3. Выполнение задач
1. Создаётся сессия в таблице `ExecutionSession`
2. Воркер запускает `ExecutionAgent`
3. AI агент:
   - Получает задачи со статусом `TODO`
   - Анализирует задачу
   - Генерирует план выполнения
   - Создаёт команды через `createExecuteCommandTool` / `createWriteFileTool`
   - Команды сохраняются в таблице `SyncCommand`

### 4. Sync Client (КРИТИЧЕСКИ ВАЖНО!)
**Без Sync Client команды НЕ выполняются!**

Sync Client - это отдельная программа, которая должна работать на компьютере пользователя:
- Подключается к БД оркестратора
- Опрашивает таблицу `SyncCommand` каждые 2 секунды
- Выполняет команды на локальной машине
- Записывает результаты (stdout/stderr) обратно в БД

### 5. Результаты
- AI агент проверяет статус команд
- Обновляет статус задач (`TODO` → `IN_PROGRESS` → `DONE`)
- Логи отображаются в Execution Console через SSE

---

## 9. Файлы созданные в этой сессии

### Новые файлы
1. `components/PlanPageClient.tsx` - UI компонент с переключением режимов
2. `components/ui/progress.tsx` - компонент прогресс-бара
3. `app/api/execution-sessions/start/route.ts` - API запуска сессии
4. `app/api/execution-sessions/run/route.ts` - воркер выполнения
5. `docs/FINAL_TEST.md` - тест-кейс для проверки защиты от циклов
6. `docs/DIRECT_EXECUTION_README.md` - инструкция использования

### Изменённые файлы
1. `lib/agents/tools.ts` - восстановлен + добавлены helper-функции
2. `components/TaskGraph.tsx` - исправлена высота контейнера
3. `components/TaskListClient.tsx` - добавлен wrapper для графа
4. `app/project/[id]/plan/[planId]/page.tsx` - интегрирован PlanPageClient
5. `app/api/execution-sessions/route.ts` - перенесён в `start/route.ts`

---

## 10. Текущие проблемы

### Требуется Sync Client
Система создана, но для реальной работы нужен Sync Client:
- Генерирует команды в БД
- Но команды некому выполнять на клиентской машине

### Что нужно сделать
1. Создать/запустить Sync Client на машине пользователя
2. Настроить подключение к БД (порт 5433)
3. Forward порт БД если Sync Client удалённый

---

## 11. Команды для работы

```bash
# Перезапуск с сохранением данных
cd /Users/artem/Desktop/cursor-diriger/ai-orchestrator
docker compose down
docker compose up -d

# Проверка логов
docker logs ai-orchestrator-app-1 -f

# Проверка БД
docker exec ai-orchestrator-db-1 psql -U orchestrator -d orchestrator

# Проверка API
curl -X POST http://localhost:3002/api/execution-sessions/start \
  -H "Content-Type: application/json" \
  -d '{"projectId":"your-project-id"}'
```

---

## 12. Заметки

### Prisma Schema
Модель `ExecutionSession` добавлена в `prisma/schema.prisma`:
```prisma
model ExecutionSession {
  id          String   @id @default(cuid())
  projectId    String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  planId      String?
  status      String   @default("RUNNING")
  costLimit   Float?
  currentCost Float    @default(0)
  metadata    Json?    @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Защита от циклов
- После 3-х неудачных попыток выполнить одну команду с одинаковой ошибкой
- Сессия автоматически ставится на паузу
- В логах появляется: `"Execution paused: Failed to fix command..."`

---

## 14. Финализация UI Direct Execution Mode

### Дата: 16 февраля 2026

### Изменённые файлы

1. **`components/PlanPageClient.tsx`** - Обновлённый UI с вкладками
2. **`components/ExecutionConsole.tsx`** - Терминал в стиле VS Code
3. **`components/ui/switch.tsx`** - Новый компонент Switch

### Новый дизайн вкладки Execution

#### Header с управлением
```tsx
<div className="flex items-center justify-between px-1 mb-4">
  <div className="flex items-center gap-4">
    {/* Auto-Approve Toggle */}
    <div className="flex items-center gap-2">
      <Switch id="auto-approve" checked={autoApprove} onCheckedChange={setAutoApprove} />
      <label htmlFor="auto-approve" className="text-sm flex items-center gap-1 text-slate-600 cursor-pointer">
        <Shield className="h-4 w-4" />
        Auto-Approve
      </label>
    </div>
    
    {/* Cost Indicator */}
    <div className="flex items-center gap-2 text-sm">
      <DollarSign className="h-4 w-4 text-slate-400" />
      <span className="text-slate-600">$0.0025</span>
      <span className="text-slate-400">/</span>
      <span className="text-slate-600 font-medium">$5.00</span>
    </div>
    <Progress value={(currentCost / costLimit) * 100} className="w-24 h-2" />
  </div>
  
  {/* Control Buttons */}
  <div className="flex items-center gap-2">
    {!isExecutionStarted ? (
      <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
        <Play className="h-4 w-4" />
        Start Auto Execution
      </Button>
    ) : (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-2">
          <Square className="h-4 w-4" />
          Stop
        </Button>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      </div>
    )}
  </div>
</div>
```

### Компонент ExecutionConsole (VS Code Terminal Style)

#### Особенности:
1. **Чёрный фон** (`bg-[#1e1e1e]`) как в VS Code
2. **Моноширинный шрифт** для терминала
3. **Поддержка ANSI цветов** для логов
4. **Ввод внизу** для команд пользователя
5. **Палитра быстрых команд**

#### Код терминала:
```tsx
<div className="h-full flex flex-col bg-[#1e1e1e] rounded-lg overflow-hidden border border-slate-700">
  {/* Header */}
  <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-[#3c3c3c]">
    <div className="flex items-center gap-2">
      <Terminal className="h-4 w-4 text-slate-400" />
      <span className="text-sm text-slate-300">TERMINAL</span>
      {isRunning && (
        <Badge variant="outline" className="bg-green-900/30 border-green-700 text-green-400 text-xs">
          <span className="w-2 h-2 rounded-full bg-green-400 mr-1.5 animate-pulse" />
          Running
        </Badge>
      )}
    </div>
  </div>

  {/* Quick Commands Palette */}
  {showCommandPalette && (
    <div className="bg-[#252526] border-b border-[#3c3c3c] px-2 py-2">
      <div className="flex flex-wrap gap-1">
        {commonCommands.map((cmd) => (
          <button
            key={cmd.cmd}
            onClick={() => setInputValue(cmd.cmd)}
            className="px-2 py-1 text-xs bg-[#3c3c3c] text-slate-300 rounded hover:bg-[#4c4c4c]"
          >
            {cmd.label}
          </button>
        ))}
      </div>
    </div>
  )}

  {/* Log Output */}
  <ScrollArea className="flex-1">
    <div className="p-3 space-y-3 font-mono text-sm">
      {logs.map((log, idx) => (
        <div key={idx} className="flex gap-2">
          <span className="text-slate-500 select-none w-20 flex-shrink-0">
            [{formatTimestamp(new Date(log.timestamp || Date.now()))}]
          </span>
          <span className={log.type === "error" ? "text-red-400" : "text-slate-400"}>
            {log.message || log.data?.message}
          </span>
        </div>
      ))}
    </div>
  </ScrollArea>

  {/* Input Field */}
  <div className="border-t border-[#3c3c3c] bg-[#1e1e1e] p-2">
    <div className="flex items-center gap-2 bg-[#252526] rounded px-3 py-1.5 border border-[#3c3c3c] focus-within:border-blue-500">
      <span className="text-green-400 text-sm font-mono">{">"}</span>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
        placeholder="Enter command or message..."
        className="flex-1 bg-transparent text-slate-200 placeholder-slate-500 text-sm font-mono focus:outline-none"
      />
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-white">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  </div>
</div>
```

### ANSI Color Support

```tsx
function parseAnsiColors(text: string): React.ReactNode[] {
  const colors: Record<string, string> = {
    '30': 'text-black',
    '31': 'text-red-500',
    '32': 'text-green-500',
    '33': 'text-yellow-500',
    '34': 'text-blue-500',
    '35': 'text-magenta-500',
    '36': 'text-cyan-500',
    '37': 'text-white',
    '90': 'text-slate-500',
    '91': 'text-red-400',
    '92': 'text-green-400',
    '93': 'text-yellow-400',
    '94': 'text-blue-400',
    '95': 'text-magenta-400',
    '96': 'text-cyan-400',
    '97': 'text-slate-100',
  };

  // Parse ANSI escape codes and return colored spans
  // ...
}
```

### Split Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Planning] [Execution]                                     │
├─────────────────────────────────────────────────────────────┤
│  [Start] [Stop] | Auto-Approve | $0.00 / $5.00           │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│  Tasks                   │  ┌────────────────────────────┐  │
│  ─────────               │  │ TERMINAL                 │  │
│  ☑ Task 1               │  │ [14:32:15] Ready...       │  │
│  ○ Task 2               │  │ [14:32:18] > npm install  │  │
│  ○ Task 3               │  │ [14:32:20] ✔ Completed    │  │
│                          │  │ [14:32:25] > npm run dev │  │
│                          │  │                          │  │
│  2/5 Done               │  │ >_ [input here...]       │  │
│                          │  └────────────────────────────┘  │
└──────────────────────────┴──────────────────────────────────┘
       30%                          70%
```

### Quick Commands Palette

Пользователь может нажать "Commands" и увидеть быстрые команды:
- Run tests → `npm test`
- Build project → `npm run build`
- Start dev server → `npm run dev`
- Lint code → `npm run lint`
- Install dependencies → `npm install`

---

## 16. Sync Client Heartbeat System

### Дата: 16 февраля 2026

### Созданные файлы

1. **`app/api/sync/heartbeat/route.ts`** - API для мониторинга статуса Sync Client
2. **`components/SyncStatus.tsx`** - Компонент индикатора статуса
3. **`components/ui/tooltip.tsx`** - Компонент Tooltip
4. **`prisma/schema.prisma`** - Добавлено поле `lastSeen` в модель Project

### API: POST /api/sync/heartbeat

```typescript
// Sync client должен отправлять каждые 5 секунд:
fetch('/api/sync/heartbeat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: 'your-project-id' })
});

// Frontend проверяет статус:
const response = await fetch('/api/sync/heartbeat?projectId=your-project-id');
const { isConnected, lastSeen, status } = await response.json();
// status: "connected" | "disconnected"
```

### Frontend: Индикатор статуса

```tsx
import { SyncStatusIndicator, SyncStatusButton } from "@/components/SyncStatus";

// Простой индикатор (иконка + статус)
<SyncStatusIndicator projectId={projectId} />

// Кнопка с автоматической блокировкой
<SyncStatusButton projectId={projectId} isDisabled={false} />
```

### Визуальный индикатор

```
🔴 Disconnected (серый/красный) → lastSeen > 10 сек назад
   └── Подсказка: "Run: node sync-client.js locally"

🟢 Connected (зелёный) → lastSeen < 10 сек назад
   └── Подсказка: "Sync client active (last seen: 2s ago)"
```

### Блокировка кнопки Start

Кнопка **"Start Auto Execution"** автоматически блокируется если Sync Client не подключён:

```tsx
// SyncStatusButton автоматически проверяет статус
<SyncStatusButton 
  projectId={projectId}
  isDisabled={false}  // Дополнительная блокировка
/>

// При наведении показывает подсказку
```

### Схема Prisma

```prisma
model Project {
  // ...
  lastSeen        DateTime?    @default(now())  // ← Новое поле
}
```

### Как это работает

```
┌─────────────────────────────────────────────────────────┐
│                    Sync Client (на клиенте)              │
│                                                  │
│   setInterval(() => {                             │
│     fetch('/api/sync/heartbeat', {               │
│       method: 'POST',                            │
│       body: JSON.stringify({ projectId })        │
│     })                                           │
│   }, 5000)  // каждые 5 секунд                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Backend API                             │
│                                                  │
│   POST /api/sync/heartbeat                        │
│   → Обновляет lastSeen в БД                       │
│                                                  │
│   GET /api/sync/heartbeat?projectId=xxx          │
│   → Проверяет: now - lastSeen < 10000ms          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Frontend UI                              │
│                                                  │
│   🔴 Disconnected (если isConnected === false)    │
│   🟢 Connected (если isConnected === true)        │
│                                                  │
│   Кнопка Start автоматически DISABLED              │
└─────────────────────────────────────────────────────────┘
```

### Интеграция в UI

```
┌─────────────────────────────────────────────────────────┐
│  [Planning] [Execution]                               │
├─────────────────────────────────────────────────────────┤
│  🔴 Disconnected  | Auto-Approve | $0.00 / $5.00    │
│                                                          │
│  [Start Auto Execution] ← Кнопка активна только       │
│                     когда Sync Client подключён        │
└─────────────────────────────────────────────────────────┘
```

---

## 17. Chat Integration в Execution Console

### Дата: 16 февраля 2026

### Созданные файлы

1. **`app/api/execution-sessions/chat/route.ts`** - API для обработки сообщений
2. **`components/ExecutionConsole.tsx`** - Обновлённый терминал с чатом

### Новая функциональность

Пользователь может писать в терминале:
- Команды (`npm install`, `npm run dev`)
- Сообщения агентам ("Поправь стили кнопки", "добавь новую страницу")

### UI чата

```
[14:32:15] ➤ User: Поправь стили кнопки
[14:32:16] 🤖 AI: Понял! Давайте посмотрим на текущие стили...
[14:32:17] 🤖 AI: Нашёл компонент Button.tsx, добавляю Tailwind классы
[14:32:18] ● Command: npm run lint
[14:32:20] ✔ Command completed
```

### Типы сообщений

| Тип | Префикс | Цвет | Описание |
|-----|---------|------|---------|
| User | `➤ User:` | Зелёный | Сообщение пользователя |
| AI | `🤖 AI:` | Синий | Ответ агента |
| System | `◆ System:` | Фиолетовый | Системные сообщения |
| Command | `● Command:` | Серый | Выполняемая команда |
| Error | `✖ Error:` | Красный | Ошибки |

### API: POST /api/execution-sessions/chat

```typescript
// Отправка сообщения:
fetch('/api/execution-sessions/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session-id',
    message: 'Поправь стили',
    projectId: 'project-id'
  })
});
```

### Flow обработки сообщений

```
┌─────────────────────────────────────────────────────────┐
│                   User Input                              │
│   Пользователь пишет: "Поправь стили кнопки"        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              ExecutionConsole.tsx                      │
│   Добавляет сообщение в local state                  │
│   Отправляет POST /api/execution-sessions/chat     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              POST /api/execution-sessions/chat        │
│   Создаёт ExecutionAgent                            │
│   Вызывает agent.handleUserMessage(message)          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│               ExecutionAgent.handleUserMessage          │
│   Получает контекст проекта                          │
│   Генерирует ответ через AI                          │
│   Отправляет событие agent_message                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              SSE Event → Frontend                       │
│   ExecutionConsole получает событие                    │
│   Добавляет ответ в лог (тип: "ai")                 │
└─────────────────────────────────────────────────────────┘
```

### Пример взаимодействия

```
> npm install                    ← Команда
[14:32:05] ● Command: npm install
[14:32:08] ✔ Command completed

Поправь стили кнопки           ← Сообщение пользователя
[14:32:10] ➤ User: Поправь стили кнопки
[14:32:11] 🤖 AI: Понял! Давайте посмотрим на текущие стили кнопки в проекте.
[14:32:12] 🤖 AI: Нашёл компонент Button.tsx, добавлю современные стили...
[14:32:13] ● Command: npm run lint
[14:32:15] ✔ Command completed
```

### Быстрые команды

Палитра быстрых команд:
- `npm test` - Запуск тестов
- `npm run build` - Сборка проекта
- `npm run dev` - Запуск dev сервера
- `npm run lint` - Проверка линтера
- `npm install` - Установка зависимостей

---

## 18. Sync Client Heartbeat Integration

### Дата: 16 февраля 2026 (обновление)

### Изменённый файл: `public/sync-client.js`

Добавлена функциональность heartbeat в существующий sync-client:

```javascript
// Новые константы
const HEARTBEAT_API_URL = '/heartbeat';
const HEARTBEAT_INTERVAL = 5000;
const HEARTBEAT_TIMEOUT = 10000;
let heartbeatInterval = null;
let lastHeartbeatTime = null;

// Функция отправки heartbeat
async function sendHeartbeat(projectId, apiUrl) {
  try {
    const heartbeatUrl = apiUrl.replace(/\/$/, '') + HEARTBEAT_API_URL;
    const response = await fetch(heartbeatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });

    if (response.ok) {
      lastHeartbeatTime = Date.now();
      const data = await response.json();
      console.log(`[SyncClient] Heartbeat sent: ${new Date(data.lastSeen).toLocaleTimeString()}`);
    }
  } catch (error) {
    console.warn(`[SyncClient] Heartbeat error: ${error.message}`);
  }
}

// Запуск heartbeat loop
function startHeartbeatLoop(projectId, apiUrl) {
  sendHeartbeat(projectId, apiUrl);
  heartbeatInterval = setInterval(() => sendHeartbeat(projectId, apiUrl), HEARTBEAT_INTERVAL);
}
```

### Обновлённый вывод help

```
$ node sync-client.js --help

Usage: node sync-client.js [options]

Options:
  --url <url>        Custom API URL (default: http://localhost:3000/api/sync)
  --auto-approve     Automatically approve all commands (default: false)
  --help, -h         Show this help

Features:
  - File watching with chokidar
  - Heartbeat sent every 5s to /heartbeat
  - Command polling every 3s
  - Auto-approve mode for hands-free execution
```

### Проверка работы

```bash
# Запуск sync-client (требует настройки .orchestrator файла)
cd /Users/artem/Desktop/cursor-diriger/ai-orchestrator
npm run sync:install
npm run sync:watch

# Или с auto-approve
npm run sync:watch:auto
```

---

## 19. TODO

- [x] Добавлена поддержка heartbeat в sync-client.js
- [ ] Протестировать полный цикл выполнения
- [ ] Добавить обработку ошибок AI
- [ ] Оптимизировать polling Sync Client
- [ ] Добавить webhooks для уведомлений
- [ ] Протестировать интеграцию Sync Client + Backend + Frontend
