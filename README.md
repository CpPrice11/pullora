# Pullora

Pullora - desktop-лаунчер для Windows 11 на Tauri, Rust і React. Він знаходить застосунки у публічних GitHub Releases, встановлює portable-версії, підтримує setup/MSI installer-flow, керує локальною бібліотекою та оновленнями.

Інтерфейс за замовчуванням українською. Англійська мова також підтримується для всіх основних екранів і повідомлень.

## Можливості

- `Store` для глобального пошуку публічних GitHub-проєктів.
- `Library` з фільтрами, деталями застосунку, локальними версіями та install wizard.
- Portable-first встановлення: portable EXE та архіви з EXE рекомендовані; setup/MSI залишаються ручним варіантом.
- Запуск, rollback, видалення, перевірка оновлень і self-update самого лаунчера.
- Store App Details: перегляд repo metadata, релізів, assets, stable/prerelease каналу та release notes перед встановленням.
- Теми, глобальний фон лаунчера, українська й англійська мови.

## Store Details

Store details-вікно відкривається з hero, карток, browse row і preview panel. Воно показує опис проєкту, owner/repo, мову, теми, локальний installed state, список релізів, stable/prerelease toggle, assets, тип файлу, розмір, downloads і release notes preview. Релізи завантажуються тільки після відкриття details-вікна, щоб не збільшувати автоматичні GitHub-запити.

## Файли Релізу

Кожен GitHub release Pullora має містити тільки два завантажувані assets:

- `Pullora_<version>_portable_x64.exe` - portable-версія та шлях self-update.
- `Pullora_<version>_x64-setup.exe` - setup installer.

MSI та portable ZIP assets не публікуються без окремого рішення.

## Розробка

Стек: Tauri 2, Rust, React, TypeScript, CSS і Vite.

```bash
npm ci
npm run dev
npm run build
cd src-tauri && cargo check
npm run tauri-build
```

Перевірка metadata та release-readiness:

```powershell
npm run check:release -- -Version 5.2.1 -RcReadiness -SkipArtifacts
```

## Release Policy

- Build artifacts не зберігаються в Git.
- Релізні файли зберігаються у `C:\Users\sasha\OneDrive\Документи\Projects\Pullora Builds\<version>`.
- Перед user-facing release виконуються `npm run build`, `cargo check`, `npm run tauri-build`, release-check і smoke-test portable EXE.
- GitHub release після публікації перевіряється на наявність тільки portable EXE і setup EXE.

Поточний напрям розвитку описаний у [ROADMAP.md](ROADMAP.md).

Додаткові стабілізаційні документи:

- [Release Process](docs/RELEASE_PROCESS.md)
- [Regression Matrix](docs/REGRESSION_MATRIX.md)
- [Design Guidelines](docs/DESIGN_GUIDELINES.md)
