# Air Launcher Roadmaps

Air Launcher розвивається у трьох паралельних напрямах: базовий лаунчер, AI Agent / Workspace і дизайн. Цей файл є коротким індексом, а деталізовані плани винесені окремо.

## Напрями

- [Base Features](FEATURE_ROADMAP.md) - Library, встановлення, оновлення, версії, favorites, maintenance і релізний flow.
- [AI Agent / Workspace](AI_AGENT_ROADMAP.md) - Codex runtime, workspaces, sessions, approvals, activity і agent extensions.
- [Design](DESIGN_ROADMAP.md) - UI/UX, Steam-style простота, Air identity, project-art фон і гнучкий Theme Editor.

## Загальні Правила

- Українська є мовою за замовчуванням, англійська підтримується для всіх нових UI-текстів.
- Release містить тільки portable EXE і один setup EXE.
- Air Launcher не зберігає OpenAI/Codex secrets; авторизація і runtime належать Codex.
- Library/install metadata не змішується з AI Workspace metadata.
- Базові функції лаунчера не мають залежати від доступності AI Workspace.
- Дизайн-покращення мають зберігати простий головний сценарій: знайти, встановити, оновити або запустити програму.
- Якщо однаковий номер версії є в кількох roadmap-ах, ці пункти плануються і виконуються разом як один release slice.

## Загальний QA Для User-Facing Releases

- `npm run build`
- `cargo check`
- `npm run tauri-build`
- `npm run check:release -- -Version <version> -RcReadiness`
- smoke-test portable EXE
- Українська й англійська
- dark/light/auto і appearance presets
- 1000x700, 1280x720, 1920x1080
- Release directory і GitHub release містять лише portable EXE та setup EXE
