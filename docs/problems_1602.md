# Проблемы E2E Auto Execution — детальный отчёт (16.02.2025)

Документ описывает попытки починки сценария «идея → планы → задачи → Auto Execution», что уже сделано и что по-прежнему не работает.

---

## Ожидаемое поведение

1. Пользователь вводит идею (например, «создай hello world»)
2. Появляются 3 плана, пользователь выбирает один
3. Генерируются задачи
4. Нажимает **Start Auto Execution**
5. В консоли Execution видно: агент берёт задачу, генерирует план, выполняет шаги (writeFile и т.д.), пишет отчёт, QA проверяет
6. При открытии задачи в UI видны: сгенерированный промпт и отчёт (комментарий)

---

## Что сейчас наблюдается

### Консоль Execution (работает)

```
Task started: Реализовать статическую HTML-страницу с приветствием
[AI] Generating execution plan...
[AI] Plan generated. 2 steps to perform.
Auto-approve enabled - commands will execute automatically
[AI] The project requires a static HTML page...
[AI] Executing step 1: writeFile with params...
[AI] Step 1 completed.
Report generated, sending to QA for verification.
Task completed: Реализовать статическую HTML-страницу с приветствием (success)
```

Логи приходят, агент отрабатывает, шаги выполняются.

### Задача в UI (не работает)

При открытии задачи в sheet:

- **Промпт:** пусто («промпт не сгенерирован»)
- **Отчёт:** нет комментария с отчётом

---

## Что уже исправлено (итерации)

### Итерация 1: E2E-базовые исправления

| # | Проблема | Исправление | Файл |
|---|----------|-------------|------|
| 1 | Планы не парсятся (JSON с markdown/пояснениями) | `extractJson` ищет блок `\`\`\`json` в любой позиции; ослаблено требование «ровно 3 плана» | `lib/ai/parse.ts` |
| 2 | Воркер берёт только TODO → 0 задач при IN_PROGRESS | При 0 TODO сбрасываем IN_PROGRESS → TODO перед загрузкой | `app/api/execution-sessions/run/route.ts` |
| 3 | Нет логов агента в консоли | Добавлены `emitEvent("info", ...)` для шагов | `lib/agents/execution-agent.ts` |
| 4 | Files: бесконечный Loading | AbortController + таймаут 15 с, обработка ошибок | `components/PlanPageClient.tsx` |
| 5 | INTERNAL_APP_URL при локальном порте 3002 | Fallback `http://127.0.0.1:${PORT \|\| 3000}` | `execution-sessions/start`, `session-manager` |

### Итерация 2: Сохранение промпта и отчёта

| # | Проблема | Исправление | Файл |
|---|----------|-------------|------|
| 1 | Промпт не сохранялся | `generateTaskPrompt(task.id, false, false)` вместо `skipSave: true` | `run/route.ts` |
| 2 | Отчёт мог теряться | Воркер дополнительно сохраняет `result.report` как комментарий | `run/route.ts` |
| 3 | Ошибка сохранения комментария замалчивалась | При ошибке `prisma.comment.create` — `throw` | `execution-agent.ts` |

---

## Гипотеза: почему в UI всё ещё пусто

### 1. Промпт — кэш на фронте

**Цепочка данных:**

- `PlanPageClient` получает `initialTasks` с сервера (SSR)
- `tasks` хранятся в `useState`, обновляются через `onTaskUpdate`
- `onTaskUpdate` из `ExecutionConsole` передаёт только `{ taskId, status }`
- `handleTaskUpdate` обновляет только статус:

```ts
setTasks((prev) =>
  prev.map((t) => (t.id === update.taskId ? { ...t, status: update.status } : t))
);
```

- `generatedPrompt` при этом не обновляется
- `TaskDetailSheet` получает `task` из пропсов (тот же объект из `tasks`)

**Итог:** в БД промпт уже есть, но фронт продолжает показывать старые данные из `initialTasks`.

**Что нужно:** при переходе задачи в DONE (или при открытии sheet) делать refetch задачи и обновлять `generatedPrompt` в state.

### 2. Комментарии — должны подгружаться

- `TaskDetailSheet` при открытии вызывает `loadComments()` → `GET /api/comments?taskId=...`
- Опрос каждые 3 секунды
- Если отчёт сохранён в БД, он должен появиться в комментариях

**Возможные причины отсутствия отчёта:**

- Ошибка при `prisma.comment.create` (сейчас мы делаем `throw`, ошибка будет в логах)
- Пользователь открыл задачу до сохранения комментария и не дождался следующего поллинга
- Дублирование: агент и воркер оба пишут комментарий — возможны коллизии или дубли, если логика где-то фильтрует

### 3. Режим cloud и writeFile

- UI вызывает `/api/execution-sessions/start` с `executionMode: "cloud"`
- `createWriteFileTool` создаёт `SyncCommand` и ждёт завершения
- Sync-клиент должен быть запущен у пользователя, иначе команда может не выполниться или зависнуть
- Но логи показывают «Step 1 completed» → для текущего теста writeFile отрабатывает (sync либо эмулируется, либо подключён)

---

## Архитектура потока (текущая)

```
[Start Auto Execution]
       │
       ▼
POST /api/execution-sessions/start
       │ planId, projectId, executionMode: "cloud"
       │
       ├─► sessionManager.createSession()
       │
       └─► fetch(INTERNAL_APP_URL + /api/execution-sessions/run)
              fire-and-forget
       │
       ▼
runExecutionSession(sessionId)
       │
       ├─► Reset IN_PROGRESS → TODO (если 0 TODO)
       ├─► Load tasks (status: TODO)
       │
       └─► for each task:
              ├─► generateTaskPrompt(id, false, false)  → prisma.task.update(generatedPrompt)
              ├─► agent.executeTask(id, prompt)
              │      ├─► emitEvent(task_started)
              │      ├─► LLM: план шагов
              │      ├─► emitEvent(info, steps...)
              │      ├─► tools: writeFile, executeCommand
              │      ├─► prisma.comment.create(report)  ← агент
              │      └─► emitEvent(task_completed)
              │
              ├─► prisma.comment.create(report)  ← fallback воркера
              └─► verifyTaskCompletion(report)
                     └─► QA: addSystemComment, LLM проверка, task.status = DONE/...
```

**Фронт:**

```
PlanPageClient
  tasks (state) ← initialTasks (SSR), onTaskUpdate только { status }
  │
  ├─► TaskItem (клик) → setSelectedTaskId
  │
  └─► TaskDetailSheet (task={...tasks.find(id)})
        ├─► generatedPrompt ← task.generatedPrompt (из state, не refetch)
        └─► loadComments() → GET /api/comments
```

---

## Рекомендации по следующим шагам

### Приоритет 1: Refetch задачи при смене статуса / открытии

1. **Вариант A:** при `onTaskUpdate({ taskId, status: "DONE" })` дополнительно делать `GET /api/tasks/[taskId]` и обновлять задачу в `tasks` (в т.ч. `generatedPrompt`).
2. **Вариант B:** при открытии `TaskDetailSheet` вызывать `GET /api/tasks/[taskId]` и подменять `task` на свежие данные.

### Приоритет 2: Проверка БД

- Через Adminer/psql: после выполнения задачи проверить
  - `Task.generatedPrompt` — заполнен ли
  - `Comment` — есть ли запись с `authorRole: "DEVOPS"` и текстом отчёта
- Если в БД всё есть, а в UI нет — причина в фронте (кэш, отсутствие refetch).

### Приоритет 3: Логирование

- В `run/route.ts` после `generateTaskPrompt` логировать, что промпт сохранён
- После `prisma.comment.create` в воркере — логировать success/fail
- При ошибке — полный stack trace

---

## Файлы, задействованные в потоке

| Файл | Роль |
|------|------|
| `app/api/execution-sessions/start/route.ts` | Создание сессии, fire-and-forget вызов run |
| `app/api/execution-sessions/run/route.ts` | Воркер: prompt, execute, report, QA |
| `lib/agents/execution-agent.ts` | Выполнение задачи, логи, сохранение отчёта |
| `lib/agents/prompt-generator.ts` | Генерация и сохранение промпта |
| `lib/agents/tools.ts` | writeFile (SyncCommand), executeCommand |
| `components/PlanPageClient.tsx` | Управление tasks, handleTaskUpdate, FileTree |
| `components/ExecutionConsole.tsx` | Поллинг логов, onTaskUpdate({ taskId, status }) |
| `components/TaskDetailSheet.tsx` | Отображение задачи, loadComments, generatedPrompt из props |
| `app/api/comments/route.ts` | GET/POST комментариев |
| `app/project/[id]/plan/[planId]/page.tsx` | SSR: загрузка tasks с generatedPrompt |

---

## Чек-лист для отладки

1. [ ] Проверить в БД после выполнения: `SELECT "generatedPrompt" FROM "Task" WHERE id = ?`
2. [ ] Проверить: `SELECT * FROM "Comment" WHERE "taskId" = ? AND "authorRole" = 'DEVOPS'`
3. [ ] При открытии задачи смотреть Network: уходит ли `GET /api/comments?taskId=...`
4. [ ] Добавить refetch задачи при status=DONE или при открытии sheet
5. [ ] Проверить логи сервера на ошибки `prisma.comment.create` и `prisma.task.update`
