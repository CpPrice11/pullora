# AI Agent Roadmap Air Launcher

## Напрям

AI Agent roadmap описує opt-in beta `AI Workspace`: робоче середовище для коду і задач через встановлений офіційний Codex. Base launcher має працювати незалежно від AI Workspace, а Air Launcher не зберігає OpenAI API key або інші Codex secrets.

Незмінні правила:

- Codex runtime і авторизація належать Codex.
- Air Launcher працює як shell/orchestrator поверх доступного Codex app-server.
- Library/install metadata не змішується з AI Workspace registry.
- Якщо Codex protocol або метод недоступний, UI показує unavailable/unsupported без ламання базового chat-flow.
- Git commit/push/PR виконуються через чат або Codex Desktop, а не окремими небезпечними кнопками лаунчера.

## v3.0.0 - AI Workspace Beta

Готовий обсяг:

- Sidebar-розділ `AI Workspace` після Library з beta-onboarding і перевіркою системного Codex.
- Rust adapter для `codex app-server --listen stdio://`, JSON-RPC подій, запитів, approvals, зупинки і помилки з'єднання.
- Налаштування beta, статусу Codex і типового каталогу workspaces без збереження секретів.
- Реєстр workspaces, додавання локальної папки, clone GitHub URL або репозиторію з Library, unlink і підтверджене видалення створеного clone.
- Сесії Codex, streaming chat, текст та зображення, модель, reasoning effort, collaboration mode і approval policy.
- Панель activity для команд/подій/запитів дозволів, запуск review та переривання активної задачі.
- Відкриття workspace в Codex Desktop як fallback/handoff і toast завершення або збою фонової задачі.

Beta-обмеження:

- `app-server` є experimental protocol, тож доступність функцій залежить від установленого Codex.
- Одна сесія працює з одним основним workspace.
- Multi-root, realtime/voice і cloud flows відкладаються до стабільної підтримки Codex protocol.

## v3.1.0 - Runtime Reliability

- Докладніші стани compatibility/auth/reconnect.
- Ясні повідомлення для runtime missing, installed but stopped, protocol unavailable, auth required.
- Відновлення активного turn після повторного відкриття розділу.
- Кращий reconnect після аварійного завершення app-server.
- Runtime diagnostics panel із версією, executable path, protocol status і останньою помилкою.
- QA матриця для аварійного завершення app-server і відмов permissions.

## v3.2.0 - Agent Activity & Approvals

- Окремі activity-вкладки для commands, diff і approvals.
- Кращий timeline для turn lifecycle: queued, running, waiting approval, completed, failed, interrupted.
- Більш зрозумілі approval cards із ризиком, cwd, command і результатом.
- Фільтри activity за типом події.
- Копіювання diagnostic details для bug reports.
- QA: command approval, denial, interrupt, failed command, long-running command.

## v3.3.0 - Workspace Comfort

- Покращене керування недавніми workspaces та threads.
- Відновлення draft і вкладень.
- Компактний режим для невеликих вікон.
- Вдосконалений drawer activity.
- Pin/favorite workspaces.
- Кращий unlink/delete-created-clone confirmation.
- QA: local folder, clone URL, clone from Library, unlink, delete clone, restore draft.

## v3.4.0 - Codex Extensions

- Керування доступними `Skills`, `Plugins`, `Apps` і `MCP`, лише якщо відповідні методи наявні в app-server.
- Зрозумілий стан unavailable/unsupported без ламання базового chat-flow.
- Read-only list доступних capabilities.
- Capability-specific diagnostics і help text.
- Безпечне увімкнення extension features як opt-in.

## v3.5.0 - Multi-session Foundation

- Підготовка UI/data model для кількох sessions без обов'язкового multi-root.
- Recent threads list із пошуком.
- Session metadata: workspace, model, created/updated, status.
- Safe cleanup старих або failed sessions.
- QA: кілька threads в одному workspace, switch thread, restore state.

## v4.0.0 - Stable AI Workspace

- Повна ревізія beta limitations.
- Стабільний runtime compatibility matrix.
- Документований troubleshooting для Codex runtime/auth/protocol.
- Regression matrix для workspace registry, threads, streaming, approvals, Desktop handoff.
- Рішення, що лишається beta, а що стає stable.

## Майбутні Напрями

- Multi-root sessions після стабілізації одиночного workspace.
- Realtime/voice flows лише за наявності стабільної підтримки Codex protocol.
- Remote/cloud flows лише якщо Codex офіційно підтримує безпечний flow.
- Rich diff viewer, якщо protocol дає стабільні diff events.
- PR/review helpers без прямого автоматичного push за замовчуванням.

## QA Для AI Agent Releases

- `npm run build`
- `cargo check`
- AI Workspace disabled/enabled
- Runtime missing/installed/running/crashed
- Login/logout/account status
- Local folder workspace
- Clone URL workspace
- Clone from Library
- Thread/new turn/streaming response
- Image attachment
- Approval request allow/deny
- Interrupt active task
- Desktop fallback/handoff
- Unlink/delete-created-clone confirmation
