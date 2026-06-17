# Feature Roadmap Pullora

## Напрям

Base Features roadmap описує розвиток Pullora як GitHub Releases launcher без AI-залежностей. Цей напрям відповідає за Library, встановлення, оновлення, локальні версії, favorites, налаштування, maintenance і надійний release flow.

Принципи:

- Основний сценарій має бути швидким: знайти застосунок, встановити, оновити або запустити.
- Portable-first flow лишається передбачуваним і безпечним.
- Setup EXE підтримується як окремий інсталятор, але не змішується з portable version registry.
- GitHub API/cache має деградувати м'яко: cached/offline/partial стани без блокування локальної бібліотеки.
- Усі destructive дії мають мати зрозуміле підтвердження і recovery path.

## Поточна База

- Завантаження публічних репозиторіїв GitHub owner з releases.
- Фільтри Library, installed/favorites/update states.
- Встановлення portable EXE або архівів як локальних версій.
- Вибір release asset через release selector.
- Локальний реєстр встановлених застосунків і активних версій.
- Запуск, switch version, uninstall version/app.
- Favorites registry.
- Auto-update checks для встановлених застосунків.
- About page з версіями самого лаунчера і rollback/update flow.
- GitHub cache і maintenance дії.

## v3.1.0 - Library Reliability [Closed]

Перший slice після v3.0.4:

- Library cards стали компактнішими.
- На картці лишився один primary action, а другорядні дії перенесені в меню `...`.
- `Launch`, `Versions`, details, cover actions і uninstall доступні без перевантаження картки.

Другий slice після v3.0.5:

- Search, filter і sort у Library об'єднані в компактний toolstrip.
- Контроли мають стабільнішу висоту й краще складаються на вузьких екранах.

Третій slice після v3.1.0:

- Trust/status panel отримав явний статусний маркер і inline retry для проблемних станів.
- No-owner і no-match стани отримали прямі дії: відкрити Settings або скинути фільтри.

Четвертий slice після v3.1.0:

- Hover/focus на Library card одразу оновлює hero preview для швидкого перегляду project art.
- Картки отримали компактний статусний rail для installed/update/available без додаткового текстового шуму.

Фінальний closing patch:

- GitHub/API diagnostics винесені в Settings -> Maintenance з copy diagnostics і cache actions.
- `v3.1.0` вважається закритим для переходу до спільного `v3.2.0`; залишковий QA: offline, rate limit, empty owner, owner without releases, cached data.

## v3.2.0 - Version Management [Closed]

Спільний v3.2.0 patch:

- App Details показує компактний version history із active/newest/older/missing states.
- Version rows показують install kind, asset name і missing executable warning.
- Repair flow лишається через install/update action, але missing executable тепер помітний у summary і version row.
- Switch-version confirmation лишається через dedicated modal.
- Залишковий QA: install v1, install v2, switch, delete inactive, delete active, repair.

## v3.3.0 - Install / Update Polish [Closed]

- Чіткіший multi-step progress: queued, downloading, verifying, extracting, detecting executable, registering.
- Краще пояснення installer/setup assets і unsupported assets.
- Покращити cancel/retry після failed download.
- Додати recovery notes після невдалого install/update.
- Уніфікувати кнопки install/update/download у release selector.
- QA: portable EXE, ZIP, unsupported asset, failed network, cancel, retry.

Спільний v3.3.0 patch:

- Progress panel отримав текстове пояснення активного stage: queued, downloading, verifying, extracting, detecting executable, registering, completed або failed.
- Failed install/update тепер показує recovery checklist: retry, choose another asset, cleanup incomplete installs.
- Release selector зберігає існуючий wizard flow і recovery actions, але result/progress стали зрозумілішими без додаткового modal clutter.
- Версію застосунку піднято до `3.3.0`.
- Залишковий QA: portable EXE, ZIP, unsupported asset, failed network, cancel, retry.

## v3.4.0 - Recovery & Maintenance [Closed]

- Окремий maintenance dashboard: cache, backups, partial installs, logs.
- Safe cleanup незавершених встановлень із підсумком, що буде видалено.
- Відкрити папки: installs, update cache, backups/config.
- Експорт diagnostic summary для bug reports.
- Більш зрозуміле reset settings без видалення встановлених застосунків.
- QA: cleanup empty/non-empty, inaccessible folders, reset, cache clear.

Спільний v3.4.0 patch:

- Settings -> Maintenance тепер показує storage diagnostics для launcher folder, update cache, backups і cleanable size.
- Додані direct actions: refresh diagnostics, open launcher folder, open update cache, open backups, cleanup old launcher files.
- Maintenance diagnostics copy включає storage paths/counts/cleanup bytes разом із GitHub/API context.
- Existing API cache clear і full settings reset лишаються окремими діями без зміни встановлених застосунків.
- Залишковий QA: empty/non-empty cache, unavailable folders, cleanup confirmation, copy diagnostics.

## v3.5.0 - Settings & GitHub Sources [Closed]

- Покращити owner/source налаштування.
- Підготувати foundation для кількох GitHub owners або custom repository list.
- Краще пояснити GitHub token/rate-limit, якщо буде додано token flow.
- Зберігати source-specific cache metadata.
- QA: owner change, cache invalidation, no network, invalid owner.

Фінальний roadmap-closing patch:

- Settings -> General отримав source summary для активного GitHub owner.
- Додано recent owner chips як foundation для майбутніх multi-source сценаріїв без зміни поточної single-owner моделі.
- Owner change продовжує очищати GitHub cache, щоб source switch не змішував cached data.
- GitHub token/rate-limit пояснення зафіксоване як source-scoped future flow.
- Залишковий QA: owner change, recent owner selection, cache invalidation, invalid owner.

## v4.0.0 - Stable Launcher Core [Closed]

- Повна ревізія base launcher сценаріїв без AI.
- Уніфікація install/update/uninstall confirmation dialogs.
- Стабільний recovery path для всіх filesystem операцій.
- Документований release process.
- Regression matrix для Library, Installed, Favorites, About update center і Settings.

Фінальний roadmap-closing patch:

- Core version піднято до `4.0.0`.
- Додано `docs/RELEASE_PROCESS.md` із Windows-only release policy, artifact names і release gate commands.
- Додано `docs/REGRESSION_MATRIX.md` для Library, install/versioning, Settings/Maintenance, About self-update і UI QA.
- Maintenance, install/update recovery, version management, source settings і release checks тепер мають documented stabilization path.
- Backlog лишається як future ideas, але roadmap milestones до `v4.0.0` закриті.

## Backlog

- Multiple GitHub owners.
- Custom repository pin list.
- Local-only app entries.
- Download speed/ETA.
- Optional checksums/signature metadata, якщо доступно в release.
- Better app icon/cover management.
- Command palette для швидкого запуску.

## Backlog Progress

- [Done] Import/export installed registry додано в Settings -> Maintenance: експорт пише локальний registry у JSON, імпорт валідує той самий формат і замінює тільки metadata встановлених застосунків без видалення файлів на диску.

## QA Для Base Features Releases

- `npm run build`
- `cargo check`
- `npm run tauri-build`
- `npm run check:release -- -Version <version> -RcReadiness`
- smoke-test portable EXE
- Library: online/offline/cached/rate-limit/no-owner
- Install: portable EXE, archive, unsupported asset, failed/cancelled download
- Installed: launch, switch, uninstall version, uninstall app, repair
- Favorites: add/remove/refresh/install update
- About: current version, update, rollback, no portable asset
- Settings: owner, install path, updates, maintenance, reset
