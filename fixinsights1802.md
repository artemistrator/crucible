## Live Insights / Reflexologist – отчёт по реализации (18.02.2026)

### 1. Триггеры запуска Рефлексолога

- **Основной триггер**: в `app/api/execution-sessions/run/route.ts` после завершения плана и записи финального лога `session_stopped` добавлен вызов:
  - `await runReflexologistForSession({ projectId: session.projectId, sessionId: session.id, planId, mode: "final", maxInsights: 3 })`.
- **Инкрементальный триггер**: внутри цикла по задачам:
  - ввёл `processedTasksCount` и после успешного завершения QA инкрементирую счётчик;
  - каждые 5 задач выполняется fire-and-forget вызов:
    - `void runReflexologistForSession({ projectId: session.projectId, sessionId: session.id, planId, mode: "incremental", maxInsights: 3 })`.
- Логика обёрнута в `try/catch`, ошибки рефлексолога логируются, но **не ломают** основную сессию.

### 2. Агент `lib/agents/reflexologist.ts`

- Создан новый агент с публичной функцией:
  - `runReflexologistForSession({ projectId, sessionId, planId?, mode?, maxInsights? })`.
- **Сбор данных**:
  - `ExecutionLog`:
    - последние до 150 записей по `sessionId` за последний час, отсортированные по `createdAt asc`;
    - нормализованные строки вида `"[timestamp] [eventType] [type] message"`.
  - `Comment`:
    - по всем задачам текущего плана (если `planId` задан);
    - фильтр по ролям `QA` и `DEVOPS`, тримминг длинных текстов.
  - `ExecutionSession.metadata`:
    - берутся `retryCounter` и `lastErrorSignature`, уже сохраняемые `ExecutionSessionManager`.
  - Собирается единый `executionContext`:
    - `logsSummary`, `qaOutcomes` (из логов `task_qa_completed`), `retrySummary`, `commentsSummary`, а также `projectId/planId/sessionId/mode`.

- **Системный промпт**:
  - Строгий английский промпт в духе:
    - старший Staff Engineer;
    - ищет **неочевидные, многоразовые инсайты** и **root causes**;
    - запрещено пересказывать факты (`Task failed`) и отдельные события;
    - если данных мало/шумно — обязан вернуть пустой массив;
    - формат выхода: чистый JSON-массив 0–`maxInsights` объектов с полями:
      - `title`, `summary`, `category`, `severity`, `appliesTo`, `recommendation`, опциональные `fingerprint`, `tags`.
  - User-промпт передаёт сериализованный `executionContext`.

- **Вызов LLM**:
  - Используются те же провайдер/модель, что и у проекта:
    - `resolveProvider(project.aiProvider)` и `project.aiModel || "gpt-4o-mini"`;
  - Поддержка `zai` через `generateTextZai` и остальных через `generateText`.

- **Парсинг и валидация**:
  - `InsightSchema` и `InsightArraySchema` на `zod` строго валидируют JSON;
  - если парсинг ломается или массив пустой — агент записывает в лог и выходит без сайд-эффектов.

- **Сохранение в `GlobalInsight`**:
  - Для каждого инсайта:
    - генерируется `fingerprint` (если не задан) по схеме `"<category>:<title>".toLowerCase().slice(0, 120)`;
    - проверяется наличие существующей записи с тем же `projectId` и `fingerprint`:
      - если есть — инсайт пропускается (дедупликация по проекту);
      - если нет — создаётся новая `GlobalInsight`:
        - `projectId`, `planId`, `sessionId`;
        - `title`, `content` (из `summary`), `category`, `severity`, `recommendation`, `fingerprint`, `tags`.
  - После успешного прохода создаётся лог:
    - `ExecutionLog` с `eventType: "reflexologist_run"` и данными `{ projectId, sessionId, planId, mode, count }`.

### 3. Изменения в Prisma-модели `GlobalInsight`

- В `prisma/schema.prisma` расширен `model GlobalInsight`:
  - добавлены поля:
    - `projectId String?`
    - `project Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)`
    - `planId String?`
    - `sessionId String?`
    - `category String?`
    - `severity String?`
    - `fingerprint String? @unique`
    - `title String?`
    - `recommendation String? @db.Text`
  - существующее `content` используется как `summary`, `tags` — как тематики.
- Таким образом:
  - инсайты теперь можно фильтровать по проекту, плану, сессии и типам;
  - добавлена база для дедупликации по `fingerprint`.

### 4. API для выборки инсайтов проекта

- Новый роут: `app/api/projects/[id]/insights/route.ts`:
  - метод `GET`:
    - `params.id` — `projectId`;
    - query-параметры:
      - `planId?: string`,
      - `sessionId?: string`,
      - `limit?: number` (по умолчанию 20, максимум 100).
  - Строится `where`:
    - обязательный `projectId`;
    - опционально `planId`/`sessionId`.
  - Достаётся список `GlobalInsight`:
    - отсортирован по `createdAt desc`, ограничен `take: limit`.
  - Возвращается компактный объект:
    - `{ id, title, summary, category, severity, tags, createdAt, planId, sessionId, recommendation }`.

### 5. UI: отображение инсайтов и уведомления

#### 5.1. Левая панель `Insights` в `PlanPageClient`

- Создан новый компонент `components/InsightsPanel.tsx`:
  - пропсы: `{ projectId: string; planId?: string }`;
  - при маунте выполняет `fetch("/api/projects/{id}/insights?planId=...&limit=20")`;
  - показывает:
    - заголовок `Insights` с иконкой;
    - состояние загрузки/ошибок;
    - список карточек инсайтов:
      - `title` (если есть),
      - `summary`,
      - бэйджи `category`, `severity`, первые несколько `tags`,
      - дата,
      - блок `Recommendation` (если есть).

- В `PlanPageClient.tsx`:
  - расширен enum `leftTab` до `"workspace" | "tasks" | "insights"`;
  - в навигации слева (NAV) добавлена кнопка `Insights` (только в режиме `execution`):
    - использует иконку `Brain`;
    - если есть новые инсайты, рядом показывается маленькая светящаяся точка.
  - Контент левой панели:
    - `workspace` → `FileTree`;
    - `tasks` → списки задач по статусам;
    - `insights` → `<InsightsPanel projectId={projectId} planId={planId} />`.

#### 5.2. Связка ExecutionConsole ↔ Reflexologist

- В `ExecutionConsole.tsx`:
  - пропсы дополнены `onReflexologistRun?: () => void`;
  - при разборе новых логов:
    - если `metadata.eventType === "reflexologist_run"`, вызывается `onReflexologistRun?.()`.

- В `PlanPageClient.tsx`:
  - добавлено состояние `hasNewInsights`;
  - при создании `ExecutionConsole` передаётся:
    - `onReflexologistRun={() => setHasNewInsights(true)}`;
  - при переходе на вкладку `Insights` флаг `hasNewInsights` сбрасывается.

#### 5.3. Модальное окно Session Summary

- Новый компонент `components/SessionSummaryModal.tsx`:
  - пропсы: `{ projectId, sessionId, open, onOpenChange }`;
  - при открытии и наличии `sessionId` подтягивает инсайты:
    - `GET /api/projects/{projectId}/insights?sessionId={sessionId}&limit=5`;
  - показывает:
    - заголовок `Session Summary`;
    - если инсайтов нет — мягкий текст, что сессия прошла чисто;
    - если есть — карточки с `title`, `summary`, `category`, `severity`, `recommendation`.

- Интеграция в `PlanPageClient.tsx`:
  - добавлено состояние `showSessionSummary`;
  - изменён `handleSessionStopped`:
    - больше не сбрасывает `executionSessionId` сразу;
    - переводит `isExecutionStarted` в `false`;
    - открывает модалку `SessionSummaryModal`;
    - очищает `localStorage` ключ сессии.
  - ниже в JSX:
    - условный рендер:
      - если `executionSessionId` задан, показывается `SessionSummaryModal` с этим `sessionId`;
      - при закрытии модалки:
        - `setShowSessionSummary(false)` и `setExecutionSessionId(null)`.

### 6. Как это всё теперь работает вместе

1. Пользователь запускает авто-исполнение плана из `PlanPageClient` → создаётся `ExecutionSession`.
2. `runExecutionSession` выполняет задачи через `ExecutionAgent`, пишет логи и QA-статусы.
3. По мере выполнения задач каждые 5 задач (если есть ошибки/QA-события) и в конце сессии вызывается `runReflexologistForSession`.
4. Рефлексолог собирает соседний контекст (логи, комментарии, retry-статистику), вызывает LLM, получает 0–3 инсайта, сохраняет их в `GlobalInsight` и пишет лог `reflexologist_run`.
5. `ExecutionConsole`, который постоянно читает `ExecutionLog`, ловит `reflexologist_run` и сообщает об этом в `PlanPageClient`.
6. `PlanPageClient`:
   - помечает вкладку `Insights` индикатором `hasNewInsights`;
   - даёт пользователю отдельную панель Insights в левой колонке для просмотра глобальных инсайтов по плану;
   - по завершении сессии показывает `SessionSummaryModal` с инсайтами этой конкретной сессии.

В итоге, генерация инсайтов стала **проактивной и живой**, без привязки к удалению проекта, с чёткой связью между ExecutionLog/Comment/ExecutionSession и UI-представлением инсайтов для пользователя.

