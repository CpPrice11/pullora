# AI Agent Roadmap Pullora

## Напрям

AI Agent roadmap описує opt-in beta `AI Workspace`: робоче середовище для коду і задач через встановлений офіційний Codex. Base launcher має працювати незалежно від AI Workspace, а Pullora не зберігає OpenAI API key або інші Codex secrets.

Незмінні правила:

- Codex runtime і авторизація належать Codex.
- Pullora працює як shell/orchestrator поверх доступного Codex app-server.
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

## v3.1.0 - Runtime Reliability [Closed]

Перший спільний v3.1.0 slice після Library polish:

- Додано Runtime diagnostics card із installed/running/protocol/path/auth/last error.
- Runtime crash/disconnect подія одразу переводить UI у disconnected state і показує останню помилку.

Другий спільний v3.1.0 slice:

- Header runtime status розрізняє connected, installed but stopped і disconnected/missing.
- Додано copy diagnostics для runtime troubleshooting і bug reports.

Третій спільний v3.1.0 slice:

- Runtime failure додається в activity як окрема подія з detail.
- Error states отримали reconnect/check action, а reconnect оновлює recent і workspace threads.

Фінальний closing patch:

- Runtime Reliability scope закрито для переходу до `v3.2.0`: diagnostics, copy diagnostics, missing/stopped/connected states, reconnect recovery і runtime failure activity готові.
- Залишковий QA: runtime missing, installed/stopped, app-server crash, auth missing, permission denial.

## v3.2.0 - Agent Activity & Approvals [Closed]

Спільний v3.2.0 patch:

- Activity entries класифікуються як command, diff, approval, runtime або turn.
- Activity tabs тепер фільтрують entries для changes, terminal і approvals.
- Timeline status показує event/queued/running/waiting/completed/failed/interrupted.
- Approval cards отримали status badge і copy activity diagnostics.
- Залишковий QA: command approval, denial, interrupt, failed command, long-running command.

## v3.3.0 - Workspace Comfort [Closed]

- Покращене керування недавніми workspaces та threads.
- Відновлення draft і вкладень.
- Компактний режим для невеликих вікон.
- Вдосконалений drawer activity.
- Pin/favorite workspaces.
- Кращий unlink/delete-created-clone confirmation.
- QA: local folder, clone URL, clone from Library, unlink, delete clone, restore draft.

Спільний v3.3.0 patch:

- AI Workspace відновлює останній вибраний workspace після перезапуску сторінки.
- Composer autosaves draft text і attachment paths окремо для активного workspace/thread.
- При поверненні до workspace/thread draft автоматично відновлюється, а UI показує компактну дію clear draft.
- Existing recent threads і workspace lists збережені без змішування з Library metadata або Codex secrets.
- Залишковий QA: local folder, clone URL, clone from Library, restore draft, clear draft, send after restore.

## v3.4.0 - Codex Extensions [Closed]

- Керування доступними `Skills`, `Plugins`, `Apps` і `MCP`, лише якщо відповідні методи наявні в app-server.
- Зрозумілий стан unavailable/unsupported без ламання базового chat-flow.
- Read-only list доступних capabilities.
- Capability-specific diagnostics і help text.
- Безпечне увімкнення extension features як opt-in.

Спільний v3.4.0 patch:

- Settings -> AI Workspace отримав read-only Codex capabilities panel.
- Capability probe перевіряє experimental list methods для models, threads, skills, plugins, apps і MCP без автоматичного увімкнення extensions.
- Unsupported/unavailable methods показуються як unavailable із diagnostic detail, не ламаючи базовий chat-flow.
- Base AI Workspace registry і Library metadata не змішуються.
- Залишковий QA: runtime missing, runtime connected, unsupported methods, auth missing, reconnect.

## v3.5.0 - Multi-session Foundation [Closed]

- Підготовка UI/data model для кількох sessions без обов'язкового multi-root.
- Recent threads list із пошуком.
- Session metadata: workspace, model, created/updated, status.
- Safe cleanup старих або failed sessions.
- QA: кілька threads в одному workspace, switch thread, restore state.

Фінальний roadmap-closing patch:

- AI Workspace отримав session search для recent і workspace threads.
- Recent/workspace session rows показують title, path/time metadata і active state.
- Draft restore з `v3.3.0` доповнено safe cleanup локальних drafts без видалення Codex sessions або workspace files.
- Multi-session foundation лишається single-workspace runtime-safe, без примусового multi-root.
- Залишковий QA: кілька threads, search, switch thread, restore draft, clear all drafts.

## v4.0.0 - Stable AI Workspace [Closed]

- Повна ревізія beta limitations.
- Стабільний runtime compatibility matrix.
- Документований troubleshooting для Codex runtime/auth/protocol.
- Regression matrix для workspace registry, threads, streaming, approvals, Desktop handoff.
- Рішення, що лишається beta, а що стає stable.

Фінальний roadmap-closing patch:

- AI Workspace stabilization покрита `docs/REGRESSION_MATRIX.md` із runtime/auth/workspace/thread/approval/handoff сценаріями.
- Codex capabilities лишаються read-only diagnostics; extensions не вмикаються автоматично.
- Runtime ownership, auth ownership і no-secret rule лишаються незмінними.
- AI Workspace лишається opt-in beta за статусом UI, але core shell/recovery/session comfort стабілізовані для `v4.0.0`.

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
