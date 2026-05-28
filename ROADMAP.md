# Roadmap Air Launcher після v3.0.0

## Напрям

Air Launcher лишається polished GitHub Releases launcher, але з `v3.0.0` отримує opt-in beta `AI Workspace`: робоче середовище для коду і задач через встановлений офіційний Codex. Стек не змінюється: Tauri + Rust + React + TypeScript + CSS.

Незмінні правила:

- Українська є мовою за замовчуванням, англійська підтримується для всіх нових UI-текстів.
- Codex runtime і авторизація належать Codex; Air Launcher не зберігає OpenAI API key.
- Library/install metadata не змішується з реєстром AI Workspace.
- Release містить тільки portable EXE і один setup EXE.

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
- Git commit/push/PR виконуються через чат або Codex Desktop, а не окремими кнопками лаунчера.

## Наступні Milestones

### v3.1.0 - Runtime Reliability

- Докладніші стани compatibility/auth/reconnect.
- Відновлення активного turn після повторного відкриття розділу.
- Окремі activity-вкладки для команд, diff і approvals.
- QA матриця для аварійного завершення app-server і відмов permissions.

### v3.2.0 - Codex Extensions

- Керування доступними `Skills`, `Plugins`, `Apps` і `MCP`, лише якщо відповідні методи наявні в app-server.
- Зрозумілий стан unavailable/unsupported без ламання базового chat-flow.

### v3.3.0 - Workspace Comfort

- Покращене керування недавніми workspaces та threads.
- Відновлення draft і вкладень.
- Компактний режим для невеликих вікон та вдосконалений drawer activity.

### Майбутні Напрями

- Multi-root sessions після стабілізації одиночного workspace.
- Realtime/voice і remote/cloud flows лише за наявності стабільної підтримки Codex protocol.

## QA Для User-Facing Releases

- `npm run build`
- `cargo check`
- `npm run tauri-build`
- `npm run check:release -- -Version <version> -RcReadiness`
- smoke-test portable EXE
- Українська й англійська, dark/light/auto, 1280x720 і вузький viewport
- AI Workspace: runtime missing/installed, login/logout, local folder, clone URL/Library, thread/new turn, image, stream, approval, review, Desktop fallback, unlink/delete-confirmed
- Release directory і GitHub release містять лише portable EXE та setup EXE
