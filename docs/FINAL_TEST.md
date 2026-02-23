# FINAL_TEST.md

## Тест-кейс: Проверка защиты от циклов (Cycle Protection) в Direct Execution Mode

### Цель
Проверить, что система автоматически ставит сессию на паузу после 3-х неудачных попыток выполнить одну и ту же команду с одинаковой ошибкой.

### Предусловия
- Приложение запущено и работает
- Docker-контейнеры собраны (`docker compose build` успешно)
- Проект сконфигурирован с подключением к БД

### Шаги

1. **Создайте новую задачу** с командой, которая намеренно вызовет ошибку:
   ```
   npm install non-existent-package-12345
   ```

2. **Запустите Direct Execution** для этой задачи

3. **Наблюдайте за поведением системы** в логах:
   ```
   [Tools] Command error: npm install non-existent-package-12345 -> npm ERR! code ENOENT
   [ExecutionSessionManager] Incrementing retry counter for session {sessionId}, signature {signature}
   ```

4. **Повторите попытку** выполнения той же задачи 2-3 раза (агент будет пытаться исправить ошибку)

### Ожидаемый результат

После **3-й попытки** с идентичной ошибкой:

1. В логах появится:
   ```
   [ExecutionSessionManager] Retry limit reached for signature {signature}
   [ExecutionSessionManager] Execution paused: Failed to fix command 'npm install non-existent-package-12345' after 3 attempts. The same error occurred repeatedly.
   ```

2. Статус сессии изменится на `PAUSED`

3. В интерфейсе пользователь увидит уведомление:
   ```
   Execution paused: Failed to fix command after 3 attempts
   ```

### Критерии успеха

- ✅ Сессия автоматически ставится на паузу
- ✅ В логах видно трекинг ошибок через сигнатуры
- ✅ Сообщение содержит информацию о причине паузы
- ✅ Система не уходит в бесконечный цикл

### Технические детали реализации

| Компонент | Файл | Роль |
|-----------|------|------|
| Сигнатура ошибки | `lib/agents/tools.ts:142-145` | `createErrorSignature()` |
| Обработчик ошибок | `lib/agents/tools.ts:147-162` | `handleCommandError()` |
| Session Manager | `lib/execution/session-manager.ts` | `incrementRetryCounter()`, `checkRetryLimit()`, `pauseSession()` |
| Интеграция | `lib/agents/tools.ts:168` | `createExecuteCommandTool(projectId, executionSessionId)` |

### Как проверить в UI

1. Откройте проект
2. Перейдите во вкладку Execution
3. Запустите задачу с ошибочной командой
4. Наблюдайте статус в реальном времени
5. После 3-й неудачи статус изменится на "Paused"
