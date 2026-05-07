# Air Launcher

Air Launcher — легкий десктопний лаунчер для застосунків, які публікуються через публічні репозиторії GitHub і GitHub Releases.

Проєкт використовує:

- Tauri 2 для десктопної оболонки та нативних можливостей.
- Rust для доступу до GitHub, завантажень, локального сховища, розпакування й запуску застосунків.
- React, TypeScript і Vite для інтерфейсу.

## Напрям проєкту

Air Launcher створюється як персональний лаунчер для публічних GitHub-релізів:

- показує тільки публічні репозиторії власника `CpPrice11`, у яких є релізи;
- встановлює файли з GitHub Releases;
- запускає встановлені застосунки з бібліотеки;
- підтримує оновлення, відкат версій і portable self-update самого лаунчера;
- тримає швидкий, акуратний і легкий інтерфейс у стилі Windows 11 Fluent.

Детальний план і журнал прогресу збережені в [ROADMAP.md](ROADMAP.md).

## Який файл скачувати

У релізах Air Launcher має бути тільки два ручні assets:

- `Air.Launcher_<version>_portable_x64.exe` — portable-версія для запуску без інсталятора і для safe/self-update лаунчера.
- `Air.Launcher_<version>_x64-setup.exe` — один ручний встановлювач для користувачів, яким потрібна інсталяція.

GitHub автоматично додає `Source code (zip)` і `Source code (tar.gz)`. Це нормально, вони не використовуються лаунчером як install/update assets.

Не додаємо окремий MSI або дублюючий portable ZIP, якщо в архіві немає нічого крім EXE.

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

Локально перевірений EXE збирається окремо від Git-папки, щоб у репозиторій не потрапляли build-артефакти.

Поточна release policy:

- один portable EXE для safe/self-update;
- один setup EXE для ручного встановлення;
- без MSI, якщо setup EXE вже є;
- без portable ZIP, якщо portable EXE достатній;
- version bump робиться перед збіркою релізного EXE.

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
