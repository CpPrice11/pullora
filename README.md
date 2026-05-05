# Air Launcher

Air Launcher — легкий десктопний лаунчер для застосунків, які публікуються через публічні репозиторії GitHub і GitHub Releases.

Проєкт використовує:

- Tauri 2 для десктопної оболонки та нативних можливостей.
- Rust для доступу до GitHub, завантажень, локального сховища, розпакування й запуску застосунків.
- React, TypeScript і Vite для інтерфейсу.

## Напрям проєкту

Air Launcher створюється як персональний лаунчер для публічних GitHub-релізів:

- вказуєш GitHub owner у налаштуваннях;
- бачиш тільки публічні репозиторії цього власника, у яких є релізи;
- встановлюєш файли з GitHub Releases;
- запускаєш встановлені застосунки з бібліотеки;
- отримуєш швидкий, акуратний і легкий інтерфейс.

Детальний план і журнал прогресу збережені в [ROADMAP.md](ROADMAP.md).

## Розробка

Встановити залежності:

```bash
npm ci
```

Запустити Vite frontend:

```bash
npm run dev
```

Запустити Tauri-застосунок у dev-режимі:

```bash
npm run tauri-dev
```

Зібрати frontend:

```bash
npm run build
```

Перевірити Rust/Tauri backend:

```bash
cd src-tauri
cargo check
```

Зібрати десктопний застосунок:

```bash
npm run tauri-build
```

## Релізи

GitHub Actions release workflow збирає Windows-артефакти, коли пушиться тег формату `v*`.

Приклад:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Перший локально перевірений EXE збирається окремо від Git-папки, щоб у репозиторій не потрапляли build-артефакти.

## Структура репозиторію

У Git зберігаються:

- вихідний код;
- Tauri icons і конфігурація;
- `package-lock.json`;
- `src-tauri/Cargo.lock`;
- roadmap і документація.

Ігноруються:

- `node_modules/`;
- `dist/`;
- `src-tauri/target/`;
- `src-tauri/gen/`;
- IDE-папки на кшталт `.vs/`, `.vscode/`, `.idea/`;
- локальні assistant/tool налаштування на кшталт `.claude/`;
- зібрані локальні артефакти, зокрема `*.exe`.
