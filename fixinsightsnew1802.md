# Изменения жизненного цикла инсайтов (18.02.2026)

Отчёт по доработке: инсайты накапливаются только во время выполнения проекта, при удалении проекта не генерируются новые и уже накопленные сохраняются.

---

## 1. Цель изменений

- **Инсайты формируются только в живом проекте** — по мере выполнения задач и в конце сессий через Рефлексолога (`runReflexologistForSession`). При удалении проекта новые инсайты не создаются.
- **При удалении проекта инсайты сохраняются** — записи `GlobalInsight`, связанные с проектом, не удаляются; у них обнуляется `projectId` (SET NULL), чтобы они оставались в глобальной аналитике (`/api/insights`, `InsightsModal`).
- **Текущий код не ломаем** — логика удаления проекта (транзакция с удалением планов, задач, файлов и т.д.) сохранена; убрана только генерация инсайтов в момент DELETE.

---

## 2. Изменения в Prisma-схеме

**Файл:** `prisma/schema.prisma`

**Было:**
- Связь `GlobalInsight.project` с `onDelete: Cascade` — при удалении проекта БД каскадно удаляла все связанные инсайты.

**Стало:**
- Связь изменена на `onDelete: SetNull`:
  - `project  Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)`
- При удалении проекта строки в `GlobalInsight` остаются; в колонке `projectId` выставляется `NULL`. Навигационное поле `Project.globalInsights` без изменений.

---

## 3. Удаление генерации инсайтов при DELETE проекта

**Файл:** `app/api/projects/[id]/route.ts`

**Удалено:**
- Импорты: `generateText` (ai), `z` (zod), `getModel`, `getProviderApiKey`, `resolveProvider` (lib/ai/providers), `generateEmbeddings` (lib/rag/embeddings).
- Константа `insightsSchema` (zod-схема для парсинга ответа LLM).
- В хендлере `DELETE`:
  - Загрузка проекта с `include: { plans: { include: { tasks: { include: { comments: true } } } } }` — больше не нужна для анализа.
  - Переменная `learnedInsights`.
  - Весь блок `try { ... } catch (analysisError) ...`, в котором:
    - формировался `plansInfo` и `analysisPrompt` по планам/таскам/комментам;
    - вызывался LLM (`generateText`) для получения 3–5 инсайтов;
    - парсинг ответа через `insightsSchema`;
    - при успехе — `generateEmbeddings` и вставка в `GlobalInsight` через `prisma.$executeRaw` (INSERT с id, content, tags, embedding, createdAt).

**Оставлено / изменено:**
- Проверка существования проекта: `prisma.project.findUnique({ where: { id } })` — без `include`.
- Транзакция `prisma.$transaction` без изменений: по-прежнему удаляются комментарии, зависимости, сущности, файлы, таски, планы, syncCommand, tokenUsage, сам проект.
- Ответ: `NextResponse.json({ success: true })` — поле `learnedInsights` из ответа убрано.
- Функция `parseGithubRepo` и хендлер `PATCH` не трогались.

В итоге DELETE проекта только удаляет проект и связанные сущности; инсайты в момент удаления не создаются.

---

## 4. Миграция БД

**Файл:** `prisma/migrations/20260218100000_global_insight_keep_on_project_delete/migration.sql`

**Содержимое:**
- Удаление старого внешнего ключа (если есть):  
  `ALTER TABLE "GlobalInsight" DROP CONSTRAINT IF EXISTS "GlobalInsight_projectId_fkey";`
- Добавление нового FK с поведением при удалении проекта:  
  `ALTER TABLE "GlobalInsight" ADD CONSTRAINT "GlobalInsight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;`

Применение: `npx prisma migrate deploy` (или `npx prisma migrate dev` локально). После миграции при удалении проекта у записей `GlobalInsight` с этим `projectId` в БД выставляется `projectId = NULL`, строки не удаляются.

---

## 5. Поведение остального кода

- **Рефлексолог** (`lib/agents/reflexologist.ts`) и вызовы из `app/api/execution-sessions/run/route.ts` не менялись — инсайты по-прежнему создаются по мере задач и в конце сессии.
- **GET /api/projects/[id]/insights** — фильтрует по `projectId` (и опционально planId/sessionId); для удалённого проекта эндпоинт не вызывается, но данные в таблице остаются.
- **GET /api/insights** — возвращает все инсайты без фильтра по проекту; инсайты с `projectId = null` (после удаления проекта) продолжают отдаваться, доработок не требовалось.
- **InsightsModal, InsightsPanel, SessionSummaryModal** — без изменений.

---

## 6. Итог

- Инсайты создаются только «вживую» (Рефлексолог при выполнении сессий).
- При удалении проекта новые инсайты не генерируются.
- Накопленные инсайты сохраняются: у них обнуляется `projectId`, они остаются в БД и доступны через `/api/insights` и глобальный UI.
