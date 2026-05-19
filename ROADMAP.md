# Roadmap Air Launcher до 2.0.0

## Summary

Фокус `2.0.0`: polished GitHub release launcher. Проєкт лишається Tauri + Rust + React + TypeScript + CSS і не розширюється в локальний app manager, marketplace, GitHub OAuth або private repository client.

Темп: малі milestones. Кожен готовий user-facing UI/UX або app behavior блок може отримувати окремий minor/patch release. Documentation-only зміни не потребують desktop release.

Поточна база: `v1.1.14` має cinematic UI, Library-first навігацію, Settings modal, install wizard, portable-first install policy і release-процес із двома assets.

## Milestones

### v1.2.0 — Documentation & QA Baseline

Мета: привести документацію, release checklist і QA matrix до стану, з якого можна безпечно вести шлях до `2.0.0`.

- Очистити `README.md` і `ROADMAP.md` від mojibake.
- Замінити історичний roadmap до `1.0.0` на актуальний roadmap до `2.0.0`.
- Зафіксувати release asset policy: тільки portable EXE і один setup EXE.
- Зафіксувати manual QA matrix для install/update/rollback/release.
- Не змінювати runtime behavior застосунку.

### v1.3.0 — Library Reliability

Мета: Library має поводитися передбачувано навіть із кешем, rate limits і частковими помилками GitHub.

- Покращити стани GitHub rate limit, offline/network error і cached data.
- Показувати чіткі last refreshed timestamps для Library і update checks.
- Стабільно оновлювати installed/latest state після install, update і rollback без ручного restart сторінки.
- Зберегти Updates як filter у Library, не повертати окрему sidebar-сторінку.

### v1.4.0 — Install Engine 2

Мета: зробити встановлення більш надійним і recovery-oriented.

- Додати попередню валідацію release asset до старту download.
- Посилити пояснення unsupported/setup/MSI assets.
- Покращити пошук EXE в архівах, включно з nested folders.
- Додати recovery для archive without EXE.
- Додати UI-дію cleanup для partial installs, backups і temporary downloads.
- Ввести `installed_apps.json` store `version: 2` із backward migration з поточного формату.

### v1.5.0 — App Details & Versions

Мета: дати користувачу зрозумілий центр керування конкретним застосунком.

- Додати compact app details modal або details view.
- Показувати активну версію, локальні версії, install path, executable path і health status.
- Дати actions: launch, open folder, switch version, rollback, uninstall version.
- Показувати release notes/changelog preview для вибраної версії.
- Використовувати існуючі Tauri commands як основу; нові commands додавати вузько.

### v1.6.0 — Updates Center Inside Library

Мета: зробити оновлення потужнішими, не змінюючи Library-first модель.

- Посилити Library filter `Оновлення`.
- Додати batch check для installed apps.
- Додати `Оновити все` тільки для portable/auto-installable assets.
- Додати per-app confirmation перед update.
- Додати skip/dismiss update і recovery після невдалого update.

### v1.7.0 — Accessibility & Responsive Polish

Мета: прибрати дрібні UX-гострі кути перед release automation і RC.

- Повний keyboard-only pass для Library, Settings, About, Release wizard і menus.
- Перевірити focus states, aria labels, contrast і `prefers-reduced-motion`.
- Перевірити українську й англійську на довгих repo/version/asset names.
- Перевірити layout на `1280x720`, вузькому viewport і wide desktop.
- Прибрати overlap, clipping, layout shifts і зайві helper тексти.

### v1.8.0 — Release Automation & Safety

Мета: зробити release process менш ручним, але зберегти asset policy.

- Додати GitHub Actions для Windows build verification.
- Додати локальний release check script для version bump, assets, build folder і smoke-test.
- Перевіряти, що release assets лишаються portable EXE + setup EXE.
- Не публікувати MSI/ZIP без окремого рішення.

### v1.9.0 — 2.0 Release Candidate

Мета: стабілізувати contracts і пройти bug bash без великих нових features.

- Заморозити UI contracts і основні Tauri command contracts.
- Провести bug bash: install, update, rollback, uninstall, self-update, failed download, archive without EXE.
- Перевірити clean install і migration зі старих config/installed stores.
- Оновити README, screenshots або короткі user instructions, якщо вони відстануть від UI.

### v2.0.0 — Stable GitHub Launcher

Мета: випустити стабільний polished launcher.

- Документація актуальна.
- Install/update flow надійний і recovery-oriented.
- Library швидка й передбачувана.
- Settings не губить значення й autosave зрозумілий.
- Release assets чисті: portable EXE + setup EXE.
- Українська за замовчуванням, англійська повністю підтримана.

## Public Interfaces / Types

- `DownloadProgress` лишається stage-based contract із `v1.1.14`; нові поля додавати тільки optional.
- `installed_apps.json` переходить на `version: 2` тільки в milestone `v1.4.0`, із backward migration.
- Нові app details/health APIs мають бути вузькими: validate, repair/cleanup, open folder, switch version, uninstall version.
- Не додавати GitHub OAuth, private repos, marketplace, multi-owner catalogs або local app scanning до `2.0.0`.

## Manual QA Matrix

| Area | Scenario | Expected result |
| --- | --- | --- |
| Install | Portable EXE install | App installs, registers executable, appears installed in Library. |
| Install | ZIP with nested EXE | EXE is detected and registered. |
| Install | Reinstall same version | Existing version is replaced safely or re-registered without duplicate state. |
| Install | Update installed version | Active version changes, Library updates without manual refresh. |
| Install | Downgrade/rollback | Older version can become active and launch. |
| Assets | Unsupported asset | Asset is disabled or clearly unavailable. |
| Assets | Setup/MSI asset | Warning is shown; it is not treated as portable install. |
| Progress | Cancel during download | Download stops and does not finish installing in background. |
| Errors | Failed network/download | Recovery actions are visible; details are available under disclosure. |
| Errors | Archive without EXE | User gets clear recovery message; install is not registered as healthy. |
| UI | Ukrainian and English | New text exists in both languages and fits controls. |
| UI | 1280x720 and narrow viewport | No overlap, clipping, or whole-page scroll drift. |
| Release | Build artifacts | Files are copied to `Air Launcher Builds\<version>`, not committed. |
| Release | GitHub assets | Release contains only portable EXE and one setup EXE. |

## Release Checklist

Use this checklist for every user-facing UI/UX or app behavior release:

1. Bump version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and About fallback.
2. Run `npm run build`.
3. Run `cargo check` in `src-tauri`.
4. Run `npm run tauri-build`.
5. Copy `src-tauri\target\release\app.exe` to `Air Launcher Builds\<version>\Air.Launcher_<version>_portable_x64.exe`.
6. Copy setup EXE to `Air Launcher Builds\<version>\Air.Launcher_<version>_x64-setup.exe`.
7. Smoke-test portable EXE.
8. Commit and push source changes.
9. Create or update GitHub release.
10. Verify release assets: exactly portable EXE and setup EXE.

## Assumptions

- Українська є мовою за замовчуванням; усі нові UI strings мають українську й англійську версії.
- Стек лишається Tauri + Rust + React + TypeScript + CSS.
- Build files не зберігаються в Git.
- Documentation-only зміни не потребують desktop release, якщо не змінюють UI/UX або app behavior.
