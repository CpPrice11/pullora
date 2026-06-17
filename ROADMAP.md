# Pullora Roadmaps

Pullora розвивається у трьох активних напрямах: базовий лаунчер, Pullora Store і дизайн. Цей файл є коротким індексом, а деталізовані плани винесені окремо.

## Напрями

- [Base Features](docs/roadmaps/FEATURE_ROADMAP.md) - Library, встановлення, оновлення, версії, favorites, maintenance і релізний flow.
- [Pullora Store](docs/roadmaps/STORE_ROADMAP.md) - Windows-first store для застосунків, які реально мають installable GitHub release assets.
- [Design](docs/roadmaps/DESIGN_ROADMAP.md) - UI/UX, GitHub-style простота, Pullora identity, project-art фон і гнучкий Theme Editor.

Архів:

- [AI Agent / Workspace](docs/roadmaps/AI_AGENT_ROADMAP.md) - напрям закрито й прибрано з активного продукту; не планувати нові роботи без окремого рішення.

## Загальні Правила

- Українська є мовою за замовчуванням, англійська підтримується для всіх нових UI-текстів.
- Release містить тільки portable EXE і один setup EXE.
- Store має показувати в першу чергу застосунки, які можна встановити: `.exe`, `.msi`, portable `.exe`, архіви з `.exe`.
- Source code archives з GitHub release не вважаються installable assets.
- Portable-first flow лишається дефолтним, але setup/MSI підтримуються як окремий installer-flow.
- Pullora не гарантує безпеку сторонніх релізів; перед встановленням потрібно показувати repo/source/asset і зрозуміле попередження.
- AI Workspace видалено з активного продукту; базові сценарії Store/Library не мають залежати від зовнішнього AI runtime.
- Дизайн-покращення мають зберігати простий головний сценарій: знайти, встановити, оновити або запустити програму.
- Якщо однаковий номер версії є в кількох roadmap-файлах, ці пункти плануються і виконуються разом як один release slice.

## Загальний QA Для User-Facing Releases

- `npm run build`
- `cargo check`
- `cargo clippy`
- `npm run tauri-build`
- `npm run check:release -- -Version <version> -RcReadiness`
- smoke-test portable EXE
- українська й англійська
- dark/light/auto і appearance presets
- 1000x700, 1280x720, 1920x1080
- Store: installable-only results, release picker, portable EXE, setup/MSI, archive, unsupported asset
- Release directory і GitHub release містять лише portable EXE та setup EXE

## Поточний Фокус

- Головний напрям зараз: `v5.2.0` App Details у [Pullora Store](docs/roadmaps/STORE_ROADMAP.md).
- `v5.1.0` Store Foundation закрито: installable asset classifier/cache, Store sections, Install latest із вибраним latest tag, локальні Installed/Favorites секції, degraded GitHub state, asset badges (`Portable`, `Installer`, `Archive`, `Unsupported`) і `releasesOnly` browse flow готові.
- Найближчий Store-крок: додати README preview, version-diff summary і ручне оновлення з cooldown у вже створене details-вікно Store project.
- Base Features зараз рухається малими backlog-slices; import/export installed registry уже додано як Settings -> Maintenance action.
- Design не є активним блокером для `v5.2.0`; нові дизайн-роботи варто відкривати тільки окремим рішенням.
- AI Workspace переведено в archived/removed state і більше не є активним roadmap-напрямом.

## Стан Roadmap

- Milestones до `v4.0.0` закриті в Base Features і Design roadmaps; AI Agent / Workspace archived після видалення з продукту.
- `v5.0.x` закріпив Pullora rename, Store foundation, release cleanup і installer support; `v5.1.0` закрив Store Foundation і відкрив шлях до App Details.
- Backlog items лишаються майбутніми optional enhancements і не блокують реліз, доки їх не перенесено в numbered milestone.
