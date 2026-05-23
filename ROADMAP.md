# Roadmap Air Launcher після v2.2.0

## Summary

Air Launcher вже пройшов базовий шлях до стабільного GitHub Releases launcher: cinematic UI, Library-first навігація, Settings modal, install wizard, portable-first policy, App details, Updates filter, self-update flow, release automation і accessibility pass.

Поточна база: `v2.2.0`.

Головний фокус наступних релізів: зробити лаунчер не більшим, а надійнішим, зрозумілішим і приємнішим у щоденному використанні. Стек не змінюється: Tauri + Rust + React + TypeScript + CSS.

## Product Direction

- Air Launcher лишається polished GitHub release launcher.
- Не розширюємо продукт у повноцінний local app manager.
- Не додаємо marketplace, GitHub OAuth, private repos або multi-owner catalogs без окремого рішення.
- Українська лишається мовою за замовчуванням.
- Усі нові UI-рядки додаються українською й англійською.
- Release assets лишаються тільки двома файлами: portable EXE і setup EXE.

## Completed Baseline

### v2.0.0 - Stable GitHub Launcher

- Cinematic Library UI став основним.
- Sidebar спрощено до Library, Settings, About.
- Settings винесено у modal overlay.
- Install wizard працює за portable-first policy.
- App details показує локальні версії, шляхи, health status і release notes.
- About підтримує self-update і rollback лаунчера.
- Release process має чисту asset policy.

### v2.0.1 - UI Polish Patch

- Settings стали компактнішими.
- Library toolbar і hero стали легшими.
- About release rows ущільнено.
- Кнопки уніфіковано.
- Виправлено текст asset strategy: portable EXE / архіви спочатку.

### v2.0.2 - Modal Layout Polish

- Виправлено ширину й overflow для Details і Release wizard.
- Прибрано небажаний горизонтальний скрол у вузьких станах.
- Довгі paths, asset names і release notes краще поводяться в modal.

### v2.0.3 - Details & Wizard Polish

- Details modal став читабельнішим для довгих шляхів.
- Додано copy actions для install path і executable path.
- Release wizard отримав контекстні підказки для кроків.

### v2.1.0 - Accessibility & Responsive Polish

- Меню дій у Library і hero отримали коректні ARIA menu semantics.
- Release wizard позначає активний крок.
- Settings nav краще пов’язаний із секціями.
- Додано accessibility labels для копіювання шляхів.

### v2.1.1 - Modal Keyboard Polish

- Додано спільний focus trap для модалок.
- Tab і Shift+Tab лишають focus всередині dialog.
- Focus повертається на попередній елемент після закриття.
- Початковий focus ставиться на природну дію або поле.
- Escape не закриває критичні first-run/install/self-update стани випадково.

### v2.2.0 - Library Trust Polish

- Додано компактний trust/status block для Library.
- Об'єднано стан даних, перевірку версій, cache/offline/rate-limit і partial check в одному місці.
- Empty state фільтра `Оновлення` тепер пояснює, чи все актуальне, ще перевіряється, або частину версій не вдалося перевірити.
- Додано retry actions для проблем GitHub/latest versions і повторного читання installed store.
- Прибрано дублювання дрібних статусів навколо кнопки refresh і під списком репозиторіїв.

## Next Milestones

### v2.3.0 - Install Engine 2 Recovery

Мета: зробити встановлення ще більш передбачуваним і recovery-oriented.

Scope:

- Попередня валідація asset до старту download.
- Чіткіші пояснення для unsupported/setup/MSI assets.
- Кращий пошук EXE в архівах із nested folders.
- Recovery message для archive without EXE.
- UI-дія cleanup для partial installs, temp downloads і backups.
- Не реєструвати неповні або підозрілі installs як healthy.

Done when:

- Користувач розуміє, чому файл не можна встановити автоматично.
- Невдалий install не лишає “напіввстановлену” програму.
- Cleanup доступний без ручного пошуку папок.

### v2.4.0 - App Details Local Versions Polish

Мета: App details має стати надійним місцем для керування локальними версіями.

Scope:

- Чистіша таблиця локальних версій.
- Кращі actions для activate, rollback, delete version, open folder.
- Health status із короткою причиною проблеми.
- Copy buttons для важливих шляхів лишаються компактними.
- Long asset names не перекривають actions.
- Release notes preview має стабільну висоту і зрозуміле expand/collapse.

Done when:

- З довгими назвами asset/version нічого не ламається.
- Користувач чітко бачить активну версію.
- Recovery або repair action очевидний, якщо EXE не знайдено.

### v2.5.0 - Update Flow Hardening

Мета: updates у Library мають бути безпечними, зрозумілими й не нервувати користувача.

Scope:

- Per-app update confirmation для batch update.
- Skip/dismiss update з можливістю повернути пропущені.
- Recovery після failed update.
- Batch update тільки для portable EXE або архівів.
- Setup/MSI лишаються ручним варіантом.
- Після update Library state оновлюється без ручного refresh.

Done when:

- Batch update не запускає непідтримувані assets.
- Failed update має зрозумілий шлях відновлення.
- Filter `Оновлення` не показує застарілий стан.

### v2.6.0 - Responsive QA Pass

Мета: закрити залишкові layout edge cases після нових деталей Library і App details.

Scope:

- 1280x720.
- Narrow viewport.
- Wide desktop.
- Довгі repo names.
- Довгі owner/repo paths.
- Довгі asset names.
- Українська й англійська.
- Dark, light, auto theme.

Done when:

- Немає горизонтального скролу там, де його не має бути.
- Текст не перекриває buttons/actions.
- Modal content не “випадає” за межі viewport.

### v2.7.0 - Release Safety & Tooling

Мета: зробити релізи ще менш ручними, але зберегти контроль над assets.

Scope:

- Посилити `check:release`.
- Перевіряти відсутність MSI/ZIP у release assets.
- Перевіряти імена portable/setup файлів.
- Перевіряти About fallback version.
- Додати короткий локальний pre-release summary.
- За потреби додати script для копіювання build artifacts.

Done when:

- Перед release легко побачити, що саме буде опубліковано.
- Build artifacts не потрапляють у Git.
- GitHub release містить тільки portable EXE і setup EXE.

### v2.8.0 - Documentation Refresh

Мета: привести README і user-facing docs до фактичного UI після `v2.x`.

Scope:

- Оновити README.
- Описати portable-first install policy.
- Описати self-update і rollback.
- Описати Library filters.
- Описати troubleshooting для GitHub rate limit/offline/cache.
- Описати release asset policy.

Done when:

- Новий користувач розуміє, що робить Air Launcher.
- Docs не обіцяють функцій, яких немає.
- Release process описаний без застарілих версій.

### v2.9.0 - Stability Candidate

Мета: bug bash без великих нових features.

Scope:

- Install portable EXE.
- Install ZIP із nested EXE.
- Reinstall same version.
- Update installed version.
- Downgrade/rollback.
- Failed network/download.
- Archive without EXE.
- Unsupported asset.
- Setup/MSI warning.
- Self-update.
- Rollback launcher.
- Clean install.
- Migration зі старих settings/installed stores.

Done when:

- Всі основні flows проходять manual QA.
- Немає критичних layout regressions.
- Release assets чисті.

### v3.0.0 - Mature GitHub Release Launcher

Мета: позначити стабільну зрілу версію після `2.x` hardening.

Scope:

- Library надійна й чесно показує стан даних.
- Install/update/recovery flows стабільні.
- App details достатньо сильний для повсякденного керування версіями.
- Accessibility і keyboard flow не мають очевидних прогалин.
- Docs актуальні.
- Release automation захищає asset policy.

Non-goals:

- Marketplace.
- Private repositories.
- GitHub OAuth.
- Multi-owner catalogs.
- Повноцінний local app manager.
- Автоматичний запуск setup/MSI як основний install path.

## Release Policy

User-facing UI/UX або app behavior changes отримують patch/minor release.

Documentation-only зміни не потребують desktop release, якщо не змінюють UI, app behavior або release artifacts.

Для кожного release лишати тільки:

- `Air.Launcher_<version>_portable_x64.exe`
- `Air.Launcher_<version>_x64-setup.exe`

Не додавати MSI або ZIP assets без окремого рішення.

## Release Checklist

1. Bump version у `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, About fallback.
2. Run `npm run build`.
3. Run `cargo check` у `src-tauri`.
4. Run `npm run tauri-build`.
5. Copy `src-tauri\target\release\app.exe` у `Air Launcher Builds\<version>\Air.Launcher_<version>_portable_x64.exe`.
6. Copy setup EXE у `Air Launcher Builds\<version>\Air.Launcher_<version>_x64-setup.exe`.
7. Smoke-test portable EXE.
8. Run `npm run check:release -- -Version <version> -RcReadiness`.
9. Commit and push.
10. Create GitHub release.
11. Verify GitHub release assets: exactly portable EXE and setup EXE.
12. Wait for GitHub Actions: Windows build verification and Release.

## Manual QA Matrix

| Area | Scenario | Expected result |
| --- | --- | --- |
| Library | Fresh GitHub data | Status shows updated time and checked versions clearly. |
| Library | GitHub offline | Cached/offline state is explicit and has retry action. |
| Library | Rate limit | Rate limit is explained and does not look like a normal empty state. |
| Library | Partial version checks | User sees how many checks failed. |
| Install | Portable EXE install | App installs, registers executable, appears installed in Library. |
| Install | ZIP with nested EXE | EXE is detected and registered. |
| Install | Reinstall same version | Existing version is replaced or re-registered without duplicate state. |
| Install | Update installed version | Active version changes and Library updates without manual refresh. |
| Install | Downgrade/rollback | Older version can become active and launch. |
| Assets | Unsupported asset | Asset is disabled or clearly unavailable. |
| Assets | Setup/MSI asset | Warning is shown; it is not treated as portable install. |
| Progress | Cancel during download | Download stops and does not finish installing in background. |
| Errors | Failed network/download | Recovery actions are visible; technical details are available. |
| Errors | Archive without EXE | Clear recovery message; install is not registered as healthy. |
| Details | Long paths | Paths wrap/copy without breaking layout. |
| Details | Long asset names | Actions remain visible and usable. |
| Keyboard | Modal Tab loop | Focus stays inside modal and returns after close. |
| UI | Ukrainian and English | New text exists in both languages and fits controls. |
| UI | 1280x720 and narrow viewport | No overlap, clipping, or whole-page scroll drift. |
| Release | Build artifacts | Files are copied to `Air Launcher Builds\<version>`, not committed. |
| Release | GitHub assets | Release contains only portable EXE and one setup EXE. |

## Engineering Rules

- Use existing Tauri + Rust + React + TypeScript + CSS stack.
- Prefer existing local patterns over new abstractions.
- Keep new types backward compatible where possible.
- New `DownloadProgress` fields should be optional unless a milestone explicitly changes the contract.
- Do not delete user changes.
- Do not commit build artifacts.
- Use `apply_patch` for manual file edits.

## Current Next Step

Recommended next implementation milestone: `v2.3.0 - Install Engine 2 Recovery`.
