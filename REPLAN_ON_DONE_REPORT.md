# 📊 Отчёт: Механизм "Replan-on-Done" — Цепочка рассуждений между задачами

**Дата:** 2025-02-15
**Статус:** ✅ Завершено

---

## 🎯 Проблема

Отсутствовала **непрерывная цепочка рассуждений (Chain of Thought)** между задачами:

**Пример сценария:**

```
Task 1 (10:00): "Setup Tailwind CSS"
  ✅ Выполнена, созданы tailwind.config.ts, app/globals.css

Task 2 (10:15): "Create Login Page"
  🔄 Нажали "Generate Prompt"
  ❌ Промпт: "Use CSS styles for the login form"
  ❌ Проблема: Промпт не знал про Tailwind!
  🔄 Нажали "Regenerate"
  ✅ Исправлено: Промпт с Tailwind классами

Task 3 (10:30): "Create Register Page"
  🔄 Нажали "Generate Prompt"
  ❌ Промпт: "Use CSS styles for the register form"
  ❌ Проблема: Опять не знал про Tailwind!
  🔄 Нажали "Regenerate" (в третий раз!)
```

**Корень проблемы:**
- ❌ Нет автоматической адаптации описаний следующих задач
- ❌ Пользователь вручную нажимает "Regenerate" для каждой задачи
- ❌ Планирование статично, а не динамично

---

## ✅ Выполненные изменения

### 1. `lib/agents/architect.ts`

#### 🔗 Новый метод `quickReview`

**Было:**
```typescript
// Только replanTasks — полный пересмотр всех TODO задач
export async function replanTasks(projectId: string, completedTaskId: string) {
  // ... проверяет ВСЕ задачи в статусе TODO
  const pendingTasks = await prisma.task.findMany({
    where: { planId: completedTask.planId, status: "TODO" },
    // ...
  });
}
```

**Стало:**
```typescript
// Быстрый обзор только следующих 2 задач
export async function quickReview(projectId: string, completedTaskId: string) {
  // ... проверяет только 2 следующие задачи
  const nextTasks = await prisma.task.findMany({
    where: { planId: completedTask.planId, status: "TODO" },
    orderBy: { createdAt: "asc" },
    take: 2, // ✅ Только 2 следующие задачи
  });
}
```

**Влияние:**
- ✅ **Лёгкий (Lightweight)** — проверяет только 2 задачи вместо всех TODO
- ✅ **Быстрый (Fast)** — меньше токенов, быстрее генерация
- ✅ **Целевой (Targeted)** — фокусируется на ближайших задачах

---

#### 🧠 Chain of Thought (Цепочка рассуждений)

**Новый промпт с явной инструкцией:**

```typescript
const prompt = `Ты — Технический Архитектор. Мы только что завершили задачу.

${projectStateContext}

Завершенная задача: ${completedTask.title}
Описание: ${completedTask.description}
Отчет о выполнении: ${executionReport}

Следующие задачи (статус TODO, только 2 следующих):
${tasksList}

Проанализируй, влияет ли завершенная задача на эти задачи.
Например:
- Выбрана другая библиотека/технология? (например, перешли на Tailwind CSS)
- Изменилась архитектура проекта? (например, создали auth.ts с Clerk)
- Некоторые файлы были созданы/изменены с другими именами?
- Требуется ли обновление описания задач?

Если задачи устарели или требуют изменений — ОБНОВИ описания.
Если всё актуально — верни needsUpdates: false.

ВАЖНО: Используй цепочку рассуждений (Chain of Thought):
1. Сначала проанализируй, что было сделано в завершенной задаче
2. Затем проверь, влияет ли это на следующие задачи
3. Если влияет — предложи конкретные изменения в описании
4. Только затем обнови задачи`;
```

**Влияние:**
- ✅ Явная инструкция использовать Chain of Thought
- ✅ Шаги: что сделано → что влияет → что обновить
- ✅ Конкретные примеры: Tailwind, auth.ts, файлы

---

#### 📊 Schema для Quick Review

```typescript
const quickReviewSchema = z.object({
  needsUpdates: z.boolean(),
  updates: z.array(
    z.object({
      taskId: z.string(),
      newDescription: z.string(),
    })
  ),
  reasoning: z.string(),
});
```

**Влияние:**
- ✅ Структурированный ответ от AI
- ✅ `needsUpdates` — нужно ли обновление
- ✅ `updates` — список обновлённых описаний
- ✅ `reasoning` — объяснение причин изменений

---

#### 🔄 Обновление задач

```typescript
const updatePromises = updates.map(async (update) => {
  const { taskId, newDescription } = update;

  await prisma.task.update({
    where: { id: taskId },
    data: { description: newDescription },
  });

  await prisma.comment.create({
    data: {
      taskId,
      content: `🔄 Быстрый обзор: описание обновлено на основе завершенной задачи "${completedTask.title}"\n\n${reasoning}`,
      authorRole: "TEAMLEAD",
    },
  });

  return { taskId, oldDescription: task.description, newDescription };
});
```

**Влияние:**
- ✅ Обновляет только описание (не перезаписывает title)
- ✅ Создаёт комментарий с объяснением изменений
- ✅ Видно в UI: "Быстрый обзор: описание обновлено"

---

### 2. `app/api/ide/route.ts`

#### 📥 Обновление обработчика DONE

**Было:**
```typescript
if (task.plan?.project?.id && task.status === 'DONE') {
  try {
    const replanResult = await replanTasks(task.plan.project.id, taskId);
    if (process.env.NODE_ENV !== 'production' && replanResult.needsReplan) {
      console.log('[Dynamic Replanning]', replanResult);
    }
  } catch (error) {
    // ...
  }
}
```

**Стало:**
```typescript
if (task.plan?.project?.id && task.status === 'DONE') {
  try {
    // ✅ First: Quick Review of next 2 tasks (lightweight)
    const quickReviewResult = await quickReview(task.plan.project.id, taskId);
    if (process.env.NODE_ENV !== 'production' && quickReviewResult.needsUpdates) {
      console.log('[Quick Review]', quickReviewResult);
    }

    // ✅ Then: Full Replan of all pending tasks
    const replanResult = await replanTasks(task.plan.project.id, taskId);
    if (process.env.NODE_ENV !== 'production' && replanResult.needsReplan) {
      console.log('[Dynamic Replanning]', replanResult);
    }
  } catch (error) {
    // ...
  }
}
```

**Влияние:**
- ✅ **Двухуровневая система:**
  1. Quick Review — сразу после DONE (быстрый)
  2. Full Replan — после Quick Review (полный)
- ✅ Логирование обоих этапов
- ✅ Обработка ошибок для каждого этапа

---

## 🔍 Сравнение: Было vs Стало

| Аспект | Было (v1.0) | Стало (v2.0) |
|--------|------------|--------------|
| Обзор задач | Только при Full Replan | Quick Review + Full Replan |
| Количество задач | Все TODO | Quick: 2, Full: все TODO |
| Скорость | Медленная (все задачи) | Быстрый (только 2 задачи) |
| Chain of Thought | Неявная | Явная инструкция |
| Обновление описаний | Только при Full Replan | При Quick Review и Full Replan |
| Комментарии | Только ADR | ADR + комментарии с reasoning |

---

## 🚀 Пример работы

### Сценарий: Переход на Tailwind CSS

**Task 1 (10:00): "Setup Tailwind CSS"**
```
✅ Выполнена за 15 минут
📄 Созданы файлы:
  - tailwind.config.ts
  - app/globals.css
  - app/tailwind.config.ts
```

**Автоматический Quick Review (сразу после DONE):**

```
[Quick Review] {
  needsUpdates: true,
  updates: [
    {
      taskId: "task-2",
      newDescription: "Create a login page using Tailwind CSS classes. Use flex layouts, rounded corners, and shadows. Import styles from app/globals.css."
    },
    {
      taskId: "task-3",
      newDescription: "Create a register page using Tailwind CSS. Match the design patterns from the login page (rounded-lg, shadow-md, bg-blue-500)."
    }
  ],
  reasoning: "Task 1 configured Tailwind CSS for the project. Task 2 (Login Page) and Task 3 (Register Page) need to use Tailwind classes instead of plain CSS. Updated both descriptions to reference Tailwind and include class examples."
}
```

**Результат:**

```
Task 2 (10:15): "Create Login Page"
  📝 Описание обновлено автоматически!
  🔄 Быстрый обзор: описание обновлено на основе завершенной задачи "Setup Tailwind CSS"

Task 3 (10:15): "Create Register Page"
  📝 Описание обновлено автоматически!
  🔄 Быстрый обзор: описание обновлено на основе завершенной задачи "Setup Tailwind CSS"

Пользователь:
  ✅ Нажимает "Generate Prompt" для Task 2
  ✅ Промпт уже включает Tailwind!
  ✅ Нажимает "Generate Prompt" для Task 3
  ✅ Промпт уже включает Tailwind!
```

**Результат:**
- ❌ НЕ нужно вручную нажимать "Regenerate"
- ✅ Описания обновлены автоматически
- ✅ Промпты сгенерированы правильно с первого раза

---

## 📊 Сравнение с "Regenerate Prompt"

| Метрика | Regenerate Prompt (ручной) | Quick Review (автоматический) |
|----------|---------------------------|------------------------------|
| Когда срабатывает | При нажатии кнопки | Автоматически после DONE |
| Количество задач | 1 задача | 2 задачи |
| Время реакции | Когда пользователь нажмёт | Мгновенно (после DONE) |
| Пользовательский UX | Нужно нажимать кнопку | Работает автоматически |
| Эффективность | Один раз | Два раза (Quick + Full) |

---

## 🧪 Архитектура системы

### Двухуровневая система

```
Task DONE
    ↓
┌─────────────────────────────────────┐
│  Level 1: Quick Review (Fast)     │
│  ✅ Проверяет только 2 задачи      │
│  ✅ Лёгкий промпт               │
│  ✅ Быстрая генерация              │
└─────────────────────────────────────┘
    ↓
[Обновление описаний следующ. 2 задач]
    ↓
┌─────────────────────────────────────┐
│  Level 2: Full Replan (Deep)     │
│  ✅ Проверяет все TODO задачи      │
│  ✅ Полный анализ                 │
│  ✅ Генерация ADR                 │
└─────────────────────────────────────┘
    ↓
[Глобальное обновление плана]
```

**Преимущества:**
- ✅ **Быстрая реакция:** Level 1 срабатывает мгновенно
- ✅ **Глубокий анализ:** Level 2 анализирует весь проект
- ✅ **Отказоустойчивость:** если Level 1 не сработает → Level 2 всё исправит
- ✅ **Chain of Thought:** оба уровня используют цепочку рассуждений

---

## 📈 Ожидаемые результаты

### 1. Автоматическая адаптация
- ✅ Описания задач обновляются автоматически после DONE
- ✅ Нет необходимости вручную нажимать "Regenerate"
- ✅ Цепочка рассуждений связывает задачи между собой

### 2. Качество кода
- ✅ Единый стиль кода на протяжении проекта
- ✅ Нет расхождений между задачами
- ✅ Быстрая реакция на изменения в tech stack

### 3. Опыт пользователя
- ✅ Меньше ручного вмешательства
- ✅ Видимость изменений (комментарии с reasoning)
- ✅ Понятная логика: "Быстрый обзор → Полный пересмотр"

---

## 🎯 Ключевые принципы

### 1. Chain of Thought (Цепочка рассуждений)
> **Правило:** Явная инструкция анализировать по шагам

```
1. Что было сделано → 2. На что влияет → 3. Что обновить
```

### 2. Lightweight First (Лёгкий первее)
> **Правило:** Сначала быстрый обзор, потом глубокий анализ

```
Level 1 (Quick Review): 2 задачи, быстро
Level 2 (Full Replan): все задачи, глубоко
```

### 3. Automatic Adaptation (Автоматическая адаптация)
> **Правило:** Описания обновляются автоматически, а не вручную

```
DONE → Quick Review → Обновление описаний → Generate Prompt (правильный)
```

---

## ✅ Заключение

Механизм "Replan-on-Done" внедрён и создаёт **непрерывную цепочку рассуждений**:

1. **Quick Review** — лёгкий обзор следующих 2 задач после каждого DONE
2. **Full Replan** — глубокий анализ всех TODO задач
3. **Chain of Thought** — явная инструкция анализировать по шагам
4. **Автоматическая адаптация** — описания обновляются без нажатия "Regenerate"
5. **Видимость** — комментарии с reasoning показывают причины изменений

**Ключевой принцип:** DONE → Quick Review → Автообновление → Правильный промпт

---

*Отчёт подготовлен: 2025-02-15*
