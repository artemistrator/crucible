import Link from "next/link";
import {
  Lightbulb,
  Layout,
  ListTodo,
  Play,
  Shield,
  MessageSquare,
  FileText,
  GitBranch,
  Zap,
  Eye,
  FolderOpen,
  CheckSquare,
  Brain,
  Terminal,
  Wallet,
  HelpCircle,
  ChevronRight,
} from "lucide-react";

export const metadata = {
  title: "Справка — AI Orchestrator",
  description: "Руководство по использованию AI Orchestrator",
};

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Справка по AI Orchestrator
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Всё, что нужно знать для работы с сервисом
        </p>
      </div>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Что делает сервис
        </h2>
        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
          AI Orchestrator — это система управления проектами с ИИ-агентами. Вы описываете идею проекта
          на естественном языке, и сервис превращает её в структурированные планы и задачи. ИИ-агенты
          могут автоматически выполнять задачи, а QA-агент проверяет результат. Сервис учится на
          прошлых проектах и учитывает глобальный контекст при работе.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <Layout className="h-5 w-5 text-blue-500" />
          Основной рабочий процесс
        </h2>
        <ol className="space-y-4">
          <li className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              1
            </span>
            <div>
              <strong>Главная страница</strong> — введите идею проекта (что вы хотите построить).
              Нажмите «Генерировать планы», чтобы получить 3 архитектурных варианта с разными технологиями.
            </div>
          </li>
          <li className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              2
            </span>
            <div>
              <strong>Страница проекта</strong> — выберите один из планов и нажмите «Открыть задачи»
              или «Генерировать задачи», если их ещё нет. Задачи появятся в канбане с зависимостями.
            </div>
          </li>
          <li className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              3
            </span>
            <div>
              <strong>Страница плана</strong> — работайте с задачами: кликайте по ним, смотрите детали,
              переключайтесь между режимами Plan и Execute, запускайте авто-выполнение.
            </div>
          </li>
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <ListTodo className="h-5 w-5 text-emerald-500" />
          Канбан и статусы задач
        </h2>
        <p className="mb-4 text-slate-600 dark:text-slate-300">
          Задачи движутся по колонкам канбана:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { status: "To Do", desc: "Задача ждёт выполнения" },
            { status: "In Progress", desc: "Задача в работе" },
            { status: "In Review", desc: "Результат на проверке" },
            { status: "Waiting Approval", desc: "Ожидает вашего подтверждения" },
            { status: "Done", desc: "Задача завершена" },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="font-medium text-slate-900 dark:text-slate-100">{item.status}</span>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <Play className="h-5 w-5 text-violet-500" />
          Режимы Plan и Execute
        </h2>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
              <Eye className="h-4 w-4" />
              Plan (План)
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Режим просмотра и планирования. Слева — навигация по файлам (Workspace), по центру —
              список задач (Kanban) или граф зависимостей (Graph). Клик по задаче открывает карточку
              в выдвижной панели. Здесь вы изучаете план и можете редактировать задачи.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
              <Zap className="h-4 w-4" />
              Execute (Выполнение)
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Режим выполнения. Слева — Workspace (файлы проекта) и Tasks (задачи по статусам).
              По центру — консоль выполнения с логами и чатом с ИИ. Справа — панель выбранной задачи
              с вкладками Details, Agent, Output. Здесь запускается авто-выполнение и общение с агентом.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <FolderOpen className="h-4 w-4 text-amber-500" />
          Кнопки навигации (слева)
        </h2>
        <ul className="space-y-2">
          <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <FolderOpen className="h-4 w-4 text-slate-500" />
            <div>
              <strong>Workspace</strong> — дерево файлов проекта. Просмотр содержимого, навигация по структуре.
            </div>
          </li>
          <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <CheckSquare className="h-4 w-4 text-slate-500" />
            <div>
              <strong>Tasks</strong> — список задач, сгруппированных по статусам. Доступно только в режиме Execute.
            </div>
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <FileText className="h-4 w-4 text-cyan-500" />
          Вкладки панели задачи (справа)
        </h2>
        <ul className="space-y-2">
          <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <FileText className="h-4 w-4 text-slate-500" />
            <div>
              <strong>Details</strong> — описание, статус, исполнитель, ветка, промпт, зависимости.
            </div>
          </li>
          <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <Brain className="h-4 w-4 text-slate-500" />
            <div>
              <strong>Agent</strong> — переписка с ИИ-агентом по задаче.
            </div>
          </li>
          <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <Terminal className="h-4 w-4 text-slate-500" />
            <div>
              <strong>Output</strong> — логи QA-проверки задачи.
            </div>
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <GitBranch className="h-4 w-4 text-green-500" />
          Исполнители задач (агенты)
        </h2>
        <p className="mb-4 text-slate-600 dark:text-slate-300">
          У каждой задачи может быть назначен исполнитель — тип агента, который будет её выполнять:
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { role: "TASK_EXECUTOR", name: "Frontend", desc: "Фронтенд, UI, стили" },
            { role: "BACKEND", name: "Backend", desc: "API, серверная логика" },
            { role: "DEVOPS", name: "DevOps", desc: "Инфраструктура, деплой" },
            { role: "TEAMLEAD", name: "Teamlead", desc: "Архитектура, координация" },
            { role: "CURSOR", name: "Cursor", desc: "Интеграция с Cursor IDE" },
            { role: "QA", name: "QA", desc: "Проверка качества" },
          ].map((a) => (
            <div
              key={a.role}
              className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                {a.name}
              </span>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <Zap className="h-4 w-4 text-amber-500" />
          Авто-выполнение (Auto Execution)
        </h2>
        <p className="mb-4 text-slate-600 dark:text-slate-300">
          В режиме Execute нажмите кнопку запуска (зелёная кнопка с иконкой Play) рядом с переключателем
          Plan/Execute. Откроется модальное окно, где можно:
        </p>
        <ul className="list-inside list-disc space-y-2 text-slate-600 dark:text-slate-400">
          <li>Включить <strong>Auto-approve</strong> — команды выполняются без подтверждения</li>
          <li>Установить <strong>Cost limit</strong> — лимит расходов на сессию в долларах</li>
          <li>Выбрать режим <strong>Local</strong> или <strong>Cloud</strong></li>
        </ul>
        <p className="mt-4 text-slate-600 dark:text-slate-300">
          После старта Execution Agent автоматически берёт задачи, генерирует промпты, выполняет
          команды и отправляет результат на проверку QA. В консоли отображаются логи и чат с ИИ.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <MessageSquare className="h-5 w-5 text-indigo-500" />
          Project Context (Контекст проекта)
        </h2>
        <p className="mb-4 text-slate-600 dark:text-slate-300">
          На странице проекта кнопка <strong>Project Context</strong> открывает панель, где можно:
        </p>
        <ul className="list-inside list-disc space-y-2 text-slate-600 dark:text-slate-400">
          <li>Написать текстовый контекст — правила, требования, особенности проекта. ИИ использует это при генерации промптов и ответах.</li>
          <li>Указать GitHub-репозиторий — ссылку на репозиторий проекта для анализа.</li>
          <li>Загрузить файлы — дополнительные документы для контекста.</li>
          <li>Включить/выключить <strong>Require Approval</strong> — обязательное подтверждение перехода задачи в DONE.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <Shield className="h-5 w-5 text-emerald-500" />
          QA-проверка
        </h2>
        <p className="text-slate-600 dark:text-slate-300">
          QA-агент проверяет отчёты о выполнении задач. Он требует конкретных доказательств:
          логи тестов, вывод сборки, путь к созданным файлам. Задачи без доказательств отклоняются
          с разбором причин. Агент использует веб-поиск и чтение файлов проекта для проверки.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <Wallet className="h-5 w-5 text-slate-500" />
          Биллинг и расходы
        </h2>
        <p className="text-slate-600 dark:text-slate-300">
          На главной странице и в шапке отображается индикатор расходов. На странице проекта под
          заголовком «Идея проекта» — карточка с общей стоимостью и количеством токенов. Можно
          развернуть детализацию по моделям, действиям и истории использования.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          <HelpCircle className="h-5 w-5 text-slate-500" />
          Дополнительные возможности
        </h2>
        <ul className="space-y-2">
          <li><strong>Graph</strong> — переключатель List/Graph показывает задачи в виде графа зависимостей.</li>
          <li><strong>Карточка задачи</strong> — клик по задаче в канбане или графе открывает полную карточку с редактированием, диалогом с агентом, генерацией промпта.</li>
          <li><strong>Sync Status</strong> — индикатор подключения sync-client для синхронизации файлов и выполнения команд.</li>
          <li><strong>Copy ID</strong> — кнопки копирования ID проекта и задач в буфер обмена.</li>
        </ul>
      </section>

      <div className="mt-12 rounded-lg border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
