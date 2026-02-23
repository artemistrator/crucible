# 📊 Отчёт: Кнопка "Regenerate Prompt" - Контекстно осознанная регенерация

**Дата:** 2025-02-15
**Статус:** ✅ Завершено

---

## 🎯 Проблема

Кнопка "Regenerate Prompt" работала в "вакууме":
1. **Кеш промптов:** При повторной генерации возвращался старый промпт из БД
2. **Устаревший контекст:** Не учитывались последние выполненные задачи
3. **Нет адаптации:** Промпт генерировался на основе плана, а не реального состояния проекта

**Пример сценария:**

```
Task 1 (10:00): "Setup Tailwind CSS"
  ✅ Выполнена, созданы tailwind.config.ts, app/globals.css

Task 2 (10:05): "Create Login Page"
  🔄 Нажали "Generate Prompt" → Промпт без Tailwind
  🔄 Нажали "Regenerate" → Тот же старый промпт (из кеша)
  ❌ Проблема: Промпт не знал про Tailwind!
```

---

## ✅ Выполненные изменения

### 1. `lib/agents/prompt-generator.ts`

#### 🔗 Добавлен параметр `forceRegenerate`

**Было:**
```typescript
export async function generateTaskPrompt(taskId: string): Promise<string> {
  // ...
  if (task.generatedPrompt) {
    return task.generatedPrompt; // ❌ Всегда возвращает кеш
  }
}
```

**Стало:**
```typescript
export async function generateTaskPrompt(taskId: string, forceRegenerate: boolean = false): Promise<string> {
  // ...
  // ✅ Возвращает кеш только если forceRegenerate = false
  if (task.generatedPrompt && !forceRegenerate) {
    return task.generatedPrompt;
  }

  // ✅ Свежий запрос в БД для project context
  const projectContext = await getCompactProjectContext(project.id);
}
```

**Влияние:**
- ✅ По умолчанию (первая генерация) использует кеш
- ✅ При `forceRegenerate: true` игнорирует кеш
- ✅ Всегда делает свежий запрос `getCompactProjectContext`
- ✅ Получает актуальный контекст проекта

---

### 2. `app/api/generate-coding-prompt/route.ts`

#### 📥 Обновлено для принятия `forceRegenerate`

**Было:**
```typescript
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";

  const prompt = await generateTaskPrompt(taskId);
}
```

**Стало:**
```typescript
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  const forceRegenerate = typeof body?.forceRegenerate === "boolean" ? body.forceRegenerate : false;

  const prompt = await generateTaskPrompt(taskId, forceRegenerate);
}
```

**Влияние:**
- ✅ Принимает параметр `forceRegenerate` из фронтенда
- ✅ Передаёт его в функцию `generateTaskPrompt`
- ✅ Безопасная валидация типа (`boolean`)

---

### 3. `components/TaskDetailSheet.tsx`

#### 🖱️ Обновлена логика кнопки "Regenerate"

**Было:**
```typescript
async function handleGeneratePrompt() {
  // ...
  const response = await fetch("/api/generate-coding-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: task.id }), // ❌ Нет forceRegenerate
  });
}
```

**Стало:**
```typescript
async function handleGeneratePrompt() {
  // ...
  // ✅ Force regenerate if prompt already exists
  const forceRegenerate = !!task.generatedPrompt;

  const response = await fetch("/api/generate-coding-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: task.id, forceRegenerate }),
  });
}
```

**Влияние:**
- ✅ При первой генерации (`task.generatedPrompt === null`): `forceRegenerate = false`
- ✅ При "Regenerate" (`task.generatedPrompt !== null`): `forceRegenerate = true`
- ✅ Одна и та же кнопка для обеих операций

---

## 🔍 Что делает `getCompactProjectContext`

При каждой генерации (включая Regenerate) вызывается свежий запрос:

```typescript
const projectContext = await getCompactProjectContext(project.id);
```

**Включает:**

### 1. Project Information
- Project ID
- Idea (описание)
- GitHub Repo
- Require Approval

### 2. Active Phase
- Phase Name (план)
- Tech Stack (технологии)
- Description
- Complexity

### 3. Completed Tasks (до 5 последних)
```
[DONE] Setup Tailwind CSS
  Tailwind configured for project with custom theme.
```

### 4. Current Blockers
- Задачи в IN_PROGRESS 🔄
- Задачи в REVIEW 🔍

### 5. Upcoming Tasks (до 5 предстоящих)
```
[TODO] Create Login Page
  Executor: FRONTEND
```

### 6. Key Architecture Decisions (ADR)
```
[001-initial-architecture] 2025-02-15
[002-tailwind-css] 2025-02-15
```

### 7. Additional Context
- Глобальный контекст проекта

---

## 📊 Сравнение до/после

| Аспект | До (v1.0) | После (v2.0) |
|--------|------------|--------------|
| Кеш промптов | Всегда возвращался | Игнорируется при `forceRegenerate: true` |
| Контекст проекта | Только при первой генерации | Свежий запрос при каждой генерации |
| Completed Tasks | Не учитывались | До 5 последних включены в контекст |
| ADR | Не учитывались | Включены в Project State |
| Regenerate кнопка | Возвращала старый промпт | Генерирует новый с актуальным контекстом |

---

## 🚀 Пример работы

### Сценарий: Перехожу на Tailwind CSS

**Task 1 (10:00): "Setup Tailwind CSS"**
- Выполнена за 15 минут
- Созданы файлы:
  - `tailwind.config.ts`
  - `app/globals.css`
- Статус: DONE

**Task 2 (10:15): "Create Login Page"**

#### Первый раз (Generate Prompt):
```
API call: POST /api/generate-coding-prompt
Body: { taskId: "task-2", forceRegenerate: false }

✅ task.generatedPrompt === null
→ Генерация с Project State
→ Промпт включает Tailwind (видит Task 1)
```

**Результат:** Промпт правильно использует Tailwind.

#### Через 5 минут (Regenerate Prompt):
```
API call: POST /api/generate-coding-prompt
Body: { taskId: "task-2", forceRegenerate: true }

✅ task.generatedPrompt !== null (уже есть)
✅ forceRegenerate = true
→ Игнорирование кеша
→ Свежий запрос Project State
→ Новая генерация с актуальным контекстом
```

**Project State (свежий):**
```
## Completed Tasks (1)
- [DONE] Setup Tailwind CSS
  Tailwind configured for project with custom theme.

=== CURRENT TASK ===
Задача: Create Login Page

=== INSTRUCTIONS ===
Since "Setup Tailwind CSS" was completed, this login page
MUST use Tailwind CSS classes:
- `className="flex flex-col"` instead of `<div style="display:flex">`
- `bg-blue-500` for submit button
- `rounded-lg`, `shadow-md` for form container
```

**Результат:** Промпт адаптирован под Tailwind, даже если план его не упоминал.

---

## 🧪 Тестирование

### Проверка логики

```bash
✅ prompt-generator.ts:
   - forceRegenerate параметр: добавлен
   - Проверка кеша: обновлена (!forceRegenerate)
   - getCompactProjectContext: вызывается всегда

✅ generate-coding-prompt/route.ts:
   - forceRegenerate в body: принимается
   - Валидация типа: boolean
   - Передача в generateTaskPrompt: корректна

✅ TaskDetailSheet.tsx:
   - forceRegenerate переменная: добавлена
   - Логика: !!task.generatedPrompt
   - Body запроса: включает forceRegenerate
```

### Проверка потока данных

**Первая генерация:**
```
UI: "Сгенерировать промпт" → handleGeneratePrompt()
     ↓
forceRegenerate = !!task.generatedPrompt
  (task.generatedPrompt === null)
  → forceRegenerate = false
     ↓
Backend: generateTaskPrompt(taskId, false)
     ↓
if (task.generatedPrompt && !forceRegenerate)
  (task.generatedPrompt === null)
  → Не срабатывает → генерация!
     ↓
getCompactProjectContext(project.id)
     ↓
Свежий Project State + генерация промпта
```

**Regenerate:**
```
UI: "Перегенерировать" → handleGeneratePrompt()
     ↓
forceRegenerate = !!task.generatedPrompt
  (task.generatedPrompt !== null)
  → forceRegenerate = true
     ↓
Backend: generateTaskPrompt(taskId, true)
     ↓
if (task.generatedPrompt && !forceRegenerate)
  (task.generatedPrompt !== null && forceRegenerate === true)
  → Не срабатывает → генерация!
     ↓
getCompactProjectContext(project.id)
     ↓
Свежий Project State + новая генерация промпта
```

---

## 📈 Ожидаемые результаты

### 1. Контекстная осведомленность
- ✅ Каждая генерация (включая Regenerate) видит актуальный проект
- ✅ Completed Tasks всегда свежие
- ✅ ADR учитываются при каждом Regenerate

### 2. Адаптивные промпты
- ✅ При изменении tech stack → промпт адаптируется
- ✅ При добавлении библиотек → промпт учитывет их
- ✅ При выполнении задач → промпт знает что было сделано

### 3. Качество кода
- ✅ Нет расхождений между задачами
- ✅ Единый стиль кода
- ✅ Нет дублирования работы (не создаёт то, что уже есть)

---

## 🎯 Ключевые принципы

### 1. Свежий контекст
> **Правило:** Перед генерацией → свежий запрос в БД за Project State

```typescript
const projectContext = await getCompactProjectContext(project.id);
```

### 2. Управляемая регенерация
> **Правило:** Кеш используется по умолчанию, Regenerate игнорирует его

```typescript
if (task.generatedPrompt && !forceRegenerate) {
  return task.generatedPrompt; // Кеш для оптимизации
}
// ... генерация с fresh context
```

### 3. Контекстная осведомленность
> **Правило:** Сначала контекст, потом промпт

```
=== PROJECT STATE ===
{выполненные задачи, ADR, стек}

=== CURRENT TASK ===
{текущая задача}

=== INSTRUCTIONS ===
Generate with adaptation to Project State
```

---

## ✅ Заключение

Кнопка "Regenerate Prompt" теперь работает **контекстно осознанно**:

1. **Fresh Context** — каждый Regenerate делает свежий запрос в БД
2. **Smart Cache** — первая генерация использует кеш, Regenerate игнорирует его
3. **Adaptive Prompts** — промпты адаптируются под реальное состояние проекта
4. **Completed Tasks** — учитываются при каждом Regenerate
5. **ADR Awareness** — архитектурные решения включены в контекст

**Ключевой принцип:** Regenerate всегда смотрит на свежий проект state.

---

*Отчёт подготовлен: 2025-02-15*
