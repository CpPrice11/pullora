# Air Launcher

Air Launcher - desktop launcher для Windows 11 на Tauri, Rust і React. Він знаходить застосунки у GitHub Releases, встановлює portable-версії, керує оновленнями та має beta-середовище `AI Workspace` для роботи з кодом через офіційний Codex.

Інтерфейс за замовчуванням українською; англійська підтримується для всіх екранів і повідомлень.

## Можливості

- `Library` з фільтрами, hero-карткою, деталями застосунку та install wizard.
- Portable-first встановлення: portable EXE та архіви з EXE рекомендовані; setup/MSI лишаються ручним варіантом.
- Локальні версії, запуск, rollback, видалення, self-update і очищення старих версій лаунчера.
- `AI Workspace` beta: локальні папки, clone GitHub-репозиторію, спільні Codex sessions, streaming chat, зображення, activity/approvals/review і handoff у Codex Desktop.
- Теми, глобальний фон лаунчера й українська/англійська мови.

## AI Workspace Beta

`v3.0.0` додає opt-in розділ `AI Workspace` у sidebar. Він використовує вже встановлений офіційний `codex.exe` та experimental `codex app-server --listen stdio://`.

- Air Launcher не вбудовує Codex і не записує OpenAI API key у власні налаштування.
- Авторизацією та історією сесій керує Codex; у Settings можна перевірити runtime, передати ключ без збереження або відкрити Codex Desktop.
- Workspaces мають окремий реєстр від Library-застосунків. Типовий каталог clone змінюється в Settings.
- Видалення workspace за замовчуванням лише відв'язує папку. Видалити файли можна окремо лише для clone, створеного лаунчером, із підтвердженням.
- Приватні GitHub clone покладаються на системний Git і Git Credential Manager.

Через experimental протокол окремі можливості можуть залежати від установленої версії Codex. При несумісності роботу можна продовжити в офіційному Codex Desktop.

## Файли Релізу

Кожен GitHub release Air Launcher містить лише два завантажувані assets:

- `Air.Launcher_<version>_portable_x64.exe` - portable-версія і шлях self-update.
- `Air.Launcher_<version>_x64-setup.exe` - один setup installer.

MSI і portable ZIP assets не публікуються без окремого рішення.

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
npm run check:release -- -Version 3.0.0 -RcReadiness -SkipArtifacts
```

## Release Policy

- Build artifacts не зберігаються в Git.
- Релізні файли зберігаються у `C:\Users\sasha\OneDrive\Документи\Projects\Air Launcher Builds\<version>`.
- Перед user-facing release виконуються `npm run build`, `cargo check`, `npm run tauri-build`, release-check і smoke-test portable EXE.
- GitHub release після публікації перевіряється на наявність лише portable EXE і setup EXE.

Поточний напрям розвитку описаний у [ROADMAP.md](ROADMAP.md).
