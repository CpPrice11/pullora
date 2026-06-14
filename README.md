# Pullora

Pullora - desktop-лаунчер для Windows 11 на Tauri, Rust і React. Він знаходить застосунки у публічних GitHub Releases, встановлює portable-версії, керує оновленнями та має beta-розділ `AI Workspace` для роботи з кодом через офіційний Codex.

Інтерфейс за замовчуванням українською. Англійська мова також підтримується для всіх основних екранів і повідомлень.

## Можливості

- `Store` для глобального пошуку публічних GitHub-проєктів.
- `Library` з фільтрами, деталями застосунку, локальними версіями та install wizard.
- Portable-first встановлення: portable EXE та архіви з EXE рекомендовані; setup/MSI залишаються ручним варіантом.
- Запуск, rollback, видалення, перевірка оновлень і self-update самого лаунчера.
- `AI Workspace` beta: локальні папки, клонування GitHub-репозиторіїв, Codex sessions, streaming chat, зображення, activity, approvals, review і handoff у Codex Desktop.
- Теми, глобальний фон лаунчера, українська й англійська мови.

## AI Workspace Beta

`AI Workspace` використовує вже встановлений офіційний `codex.exe` та experimental `codex app-server --listen stdio://`.

- Pullora не вбудовує Codex і не зберігає OpenAI API key у власних налаштуваннях.
- Авторизацією та історією сесій керує Codex.
- У Settings можна перевірити runtime, передати ключ у Codex без збереження або відкрити Codex Desktop.
- Workspaces мають окремий реєстр від застосунків у Library.
- Видалення workspace за замовчуванням лише відв'язує папку. Файли можна видалити окремо тільки для clone, створеного лаунчером, із підтвердженням.
- Приватні GitHub clone покладаються на системний Git і Git Credential Manager.

Через experimental протокол окремі можливості можуть залежати від встановленої версії Codex. Якщо щось несумісне, роботу можна продовжити в офіційному Codex Desktop.

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
npm run check:release -- -Version 5.0.21 -RcReadiness -SkipArtifacts
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
