# AI Orchestrator - Implementation Summary

## Обзор

В этой сессии мы внедрили три ключевые функции для улучшения AI-оркестратора:

1. **Visual Orchestration** - интерактивный граф задач
2. **AI-TDD Pipeline** - выполнение команд на клиенте
3. **Code Knowledge Graph** - понимание структуры кода

---

## 1. Visual Orchestration (Граф задач)

### Цель
Отображать задачи в виде интерактивного графа вместо простого списка, чтобы видеть поток работы как на ладони.

### Что реализовано

#### Компонент: `components/TaskGraph.tsx`

**Библиотеки:**
- `@xyflow/react` - для визуализации графов
- `dagre` - для автоматической раскладки узлов

**Функциональность:**
- Превращает `tasks` в `nodes` с автоматическим позиционированием
- Превращает `dependencies` в `edges` (стрелочки связей)
- Цветовая кодировка по статусу:
  - `DONE`: Зеленый (border-emerald-500, bg-emerald-50)
  - `IN_PROGRESS`: Синий с анимацией pulse (border-blue-500)
  - `REVIEW`: Оранжевый (border-amber-500)
  - `WAITING_APPROVAL`: Фиолетовый (border-violet-500)
  - `TODO`: Серый
- Отображение внутри узла:
  - Заголовок задачи
  - Иконка агента-исполнителя (⚛️ Frontend, 🔧 Backend, 🚀 DevOps, 👑 Teamlead)
- Auto-Layout с помощью dagre:
  - Направление: сверху вниз (TB)
  - Автоматическое позиционирование без наложений
- Professional UI элементы:
  - `Background` - сетка на фоне
  - `Controls` - зум и панорамирование
  - `MiniMap` - мини-карта графа с цветовой индикацией

#### Интеграция: `components/TaskListClient.tsx`

**Изменения:**
- Добавлен переключатель между режимами: **"List View"** vs **"Graph View"**
- По умолчанию открывается Graph View
- Graph View занимает всю высоту экрана
- Кнопки с иконками `GitGraph` и `List` для переключения

#### Интеграция: `app/project/[id]/plan/[planId]/page.tsx`

**Изменения:**
- Изменен макет страницы для лучшего отображения графа
- Увеличена ширина контейнера (`max-w-7xl`)
- Добавлен динамический `flex-1` для section с задачами

### Использование

Пользователь может переключаться между двумя режимами:
1. **Graph View** - визуализация зависимостей между задачами
2. **List View** - традиционный список задач

Граф позволяет мгновенно увидеть:
- Какие задачи блокируют другие задачи
- Поток выполнения от начальных к конечным задачам
- Статус каждой задачи визуально

---

## 2. AI-TDD Pipeline (Выполнение команд)

### Цель
Дать оркестратору возможность просить клиента выполнить команды (тесты, линтинг, сборку) и получать результаты.

### Что реализовано

#### База данных: `prisma/schema.prisma`

**Новые модели:**

```prisma
enum CommandStatus {
  PENDING
  EXECUTING
  COMPLETED
  FAILED
}

model SyncCommand {
  id        String        @id @default(cuid())
  projectId String
  project   Project       @relation(fields: [projectId], references: [id])
  command   String
  reason    String?
  status    CommandStatus @default(PENDING)
  stdout    String?       @db.Text
  stderr    String?       @db.Text
  exitCode  Int?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
}
```

#### API: `app/api/sync/command/route.ts`

**GET `/api/sync/command?projectId=...`**
- Клиент опрашивает этот эндпоинт (Long Polling)
- Возвращает следующую команду для выполнения
- При выдаче команды меняет статус на `EXECUTING`

**POST `/api/sync/command`**
- Создает новую команду для выполнения (используется агентом)
- Body: `{ projectId, command, reason }`
- Или отправляет результат выполнения (используется клиентом)
- Body: `{ commandId, stdout, stderr, exitCode }`

#### Клиент: `public/sync-client.js`

**Новые фичи:**
- **Command Polling** - опрос сервера каждые 3 секунды
- **User Approval** - спрашивает подтверждение перед выполнением:
  ```
  🤖 AI хочет выполнить: `npm test`
  📝 Reason: Проверка написанного кода
  ✅ Allow? (y/n):
  ```
- **--auto-approve** флаг для автоматического выполнения
- **Command Execution** - выполняет команды через `child_process.exec`
- **Result Reporting** - отправляет stdout/stderr обратно на сервер
- **Graceful Shutdown** - корректное завершение с очисткой ресурсов

#### Инструмент агента: `lib/agents/tools.ts`

**Новый инструмент: `executeCommand`**

Параметры:
- `command: string` - shell команда (например, `npm test`)
- `reason: string` (опционально) - объяснение зачем нужна команда

Логика:
1. Создает запись в очереди команд со статусом `PENDING`
2. Ждет результата через polling loop (каждые 2 секунды, до 4 минут)
3. Проверяет статус команды в БД
4. Возвращает результат агенту:
   ```typescript
   {
     success: boolean,
     exitCode: number,
     stdout: string,
     stderr: string,
     duration: string
   }
   ```

### Архитектура

```
Агент → executeCommand("npm test", "Проверка кода")
  ↓
API → POST /api/sync/command (создает команду)
  ↓
Клиент → GET /api/sync/command (опрашивает каждые 3 сек)
  ↓
Клиент → показывает "🤖 AI хочет выполнить: npm test. Разрешить? (y/n)"
  ↓
Пользователь → нажимает "y"
  ↓
Клиент → child_process.exec("npm test")
  ↓
Клиент → POST /api/sync/command (отправляет stdout/stderr)
  ↓
Агент → получает результат выполнения
```

### Использование

**Запуск клиента:**
```bash
# С подтверждением
node public/sync-client.js

# Авто-подтверждение
node public/sync-client.js --auto-approve

# С кастомным URL
node public/sync-client.js --url https://my-api.com/api/sync --auto-approve
```

**Агент может выполнять:**
- Тесты: `npm test`
- Сборка: `npm run build`
- Линтинг: `npm run lint`
- Любые shell команды

---

## 3. Code Knowledge Graph (Граф кода)

### Цель
Понимать структуру кода (импорты, экспорты, классы), а не просто текст.

### Что реализовано

#### База данных: `prisma/schema.prisma`

**Новые модели:**

```prisma
enum EntityType {
  CLASS
  FUNCTION
  VARIABLE
  IMPORT
  EXPORT
  INTERFACE
  TYPE
}

enum DependencyType {
  IMPORTS
  CALLS
  EXTENDS
  IMPLEMENTS
  TYPE_OF
}

model CodeEntity {
  id         String     @id @default(cuid())
  fileId     String
  file       ProjectFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
  name       String
  type       EntityType
  startLine  Int
  endLine    Int
  signature  String?    @db.Text
  metadata   String?    @default("{}")
  createdAt  DateTime   @default(now())
  dependenciesAsSource  CodeDependency[] @relation("SourceEntity")
  dependenciesAsTarget  CodeDependency[] @relation("TargetEntity")
}

model CodeDependency {
  id          String     @id @default(cuid())
  sourceId    String
  source      CodeEntity @relation("SourceEntity", fields: [sourceId], references: [id])
  targetId    String
  target      CodeEntity @relation("TargetEntity", fields: [targetId], references: [id])
  type        DependencyType
  createdAt   DateTime   @default(now())
}
```

#### Парсер: `lib/rag/parser.ts`

**Функция: `parseCode(content: string, fileName: string)`**

Поддерживаемые языки:
- JavaScript / TypeScript (.js, .jsx, .ts, .tsx)
- Python (.py)

**Извлекаемые сущности:**
1. **IMPORT** - импорты модулей
   - `import { Button } from './Button'`
   - `const Button = require('./Button')`
2. **EXPORT** - экспорты по умолчанию
   - `export default class Button`
3. **CLASS** - классы
   - `class Button extends Component`
   - Определяет наследование (extends)
4. **FUNCTION** - функции и стрелочные функции
   - `function handleClick() {}`
   - `const handleClick = () => {}`
5. **INTERFACE** - интерфейсы (TS)
   - `interface Props {}`
6. **TYPE** - типы (TS)
   - `type ButtonProps = {}`

**Извлекаемые зависимости:**
1. **IMPORTS** - между файлами
2. **EXTENDS** - наследование классов
3. **IMPLEMENTS** - реализация интерфейсов

**Дополнительные функции:**
- `saveParsedCode()` - сохраняет сущности и связи в БД
- `deleteCodeEntities()` - очищает старые данные при обновлении файла
- `findEndLine()` - вычисляет диапазон строк для сущности
- `countNestedBraces()` - подсчитывает вложенные фигурные скобки

#### Интеграция: `app/api/sync/route.ts`

**Изменения:**
- После создания эмбеддингов запускается парсер
- `parseCode()` анализирует содержимое файла
- `saveParsedCode()` сохраняет результаты в БД
- При обновлении файла старые сущности удаляются

#### Поиск: `lib/rag/search.ts`

**Новая функция: `findRelatedFiles(fileId: string)`**

Находит файлы, которые связаны с данным файлом:
1. **Экспортирует** сущности, которые импортирует этот файл
2. **Импортирует** сущности, которые экспортирует этот файл
3. **Делит общие зависимости**

Возвращает:
```typescript
[
  {
    fileId: string,
    fileName: string,
    relationship: string,  // "imports Button from", "exports Button which is used by"
    entityName: string
  }
]
```

**Новая функция: `getFileEntities(fileId: string)`**

Получает все сущности в файле, отсортированные по типу и номеру строки:
- Для понимания структуры файла агентами

**Новая функция: `searchWithContext(projectId, query, primaryFileId?)`**

Обогащенный семантический поиск:
- Возвращает результаты поиска
- Добавляет контекст связанных файлов
- Агент видит не только релевантные чанки, но и файлы-соседи

#### Инструмент агента: `lib/agents/tools.ts`

**Новый инструмент: `findRelatedFiles`**

Позволяет агентам находить файлы, связанные с данным:

```typescript
const result = await findRelatedFiles("src/components/Button.tsx");
// {
//   filePath: "src/components/Button.tsx",
//   relatedFiles: [
//     { fileName: "src/Header.tsx", relationship: "imports Button from", entityName: "Button" },
//     { fileName: "src/Form.tsx", relationship: "imports Button from", entityName: "Button" }
//   ],
//   entities: [/* все сущности в Button.tsx */]
// }
```

### Использование в RAG

Когда агент работает с файлом:
1. Считывает содержимое файла
2. Может запросить `findRelatedFiles()` для понимания зависимостей
3. При поиске получает контекст связанных файлов
4. Понимает влияние изменений на другие файлы

**Пример диалога:**
```
Агент: "Я изменяю Button.tsx. Какие файлы затронуты?"
Инструмент: "Header.tsx импортирует Button, Form.tsx использует Button"
Агент: "Хорошо, проверю их тоже"
```

---

## Технические детали

### Зависимости

```json
{
  "@xyflow/react": "^12.10.0",
  "dagre": "^0.8.5",
  "@types/dagre": "^0.7.53"
}
```

### Миграции БД

```bash
# Применение миграций
npx prisma db push

# Или для разработки с миграциями
npx prisma migrate dev --name add_features
```

### Переменные окружения

```env
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_APP_URL="http://localhost:3002"
```

---

## Преимущества внедрения

### 1. Visual Orchestration
- **Интуитивность**: Граф нагляднее списка
- **Визуализация зависимостей**: Видно блокирующие задачи
- **Быстрая навигация**: Клик по узлу открывает детали
- **Professional UI**: С мини-картой и контролами

### 2. AI-TDD Pipeline
- **Реальное выполнение**: Тесты проходят на компьютере клиента
- **Безопасность**: Пользователь подтверждает каждую команду
- **Гибкость**: Можно запускать любые команды (не только тесты)
- **Автоматизация**: Режим авто-подтверждения для CI/CD

### 3. Code Knowledge Graph
- **Глубокое понимание**: Не просто текст, а структура кода
- **Умные изменения**: Агент видит влияние на другие файлы
- **Быстрый поиск**: Поиск с контекстом связанных файлов
- **Легкое масштабирование**: Работает с JS/TS/Python

---

## Следующие шаги (идеи для развития)

### Visual Orchestration
- Добавить фильтры по статусу и агенту
- Визуализация прогресса выполнения плана
- Экспорт графа в PNG/SVG

### AI-TDD Pipeline
- История выполненных команд
- Автоматическое повторение тестов при изменении файлов
- Визуализация coverage

### Code Knowledge Graph
- Парсинг большего числа языков (Go, Rust, Java)
- Анализ complexity кода
- Поиск по паттернам (например, "найди все Redux reducers")
- Автоматическое обнаружение дублирования кода

---

## Заключение

Все три функции успешно внедрены и протестированы:
- ✅ **Visual Orchestration** - интерактивный граф задач
- ✅ **AI-TDD Pipeline** - выполнение команд на клиенте
- ✅ **Code Knowledge Graph** - понимание структуры кода

Оркестратор стал более мощным и удобным инструментом для разработки с AI! 🚀
