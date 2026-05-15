# Air Launcher

Air Launcher — легкий десктопний лаунчер для застосунків, які публікуються через публічні GitHub репозиторії та GitHub Releases.

Інтерфейс підтримує українську й англійську мови, працює у Windows 11 Fluent стилі та фокусується на простому сценарії: знайти публічний реліз, встановити, запустити, оновити або відкотити версію.

## Можливості

- Показує публічні репозиторії вибраного GitHub owner, у яких є релізи.
- Не показує сам `air-launcher` у бібліотеці застосунків.
- Встановлює застосунки з GitHub Releases.
- Підтримує запуск, оновлення, відновлення і видалення локальних версій.
- Має обране, встановлені застосунки, фільтр оновлень у бібліотеці.
- Підтримує portable self-update самого лаунчера з About.
- Має світлу, темну й auto тему.

## Який файл скачувати

У релізах Air Launcher вручну додаються тільки два assets:

- `Air.Launcher_<version>_portable_x64.exe` — portable-версія для запуску без інсталятора і для safe/self-update лаунчера.
- `Air.Launcher_<version>_x64-setup.exe` — один ручний встановлювач для користувачів, яким потрібна інсталяція.

GitHub автоматично додає `Source code (zip)` і `Source code (tar.gz)`. Це нормально, але Air Launcher не використовує їх як install/update assets.

MSI і дублюючий portable ZIP не публікуються, якщо portable EXE і setup EXE достатні.

## Як користуватись

1. Завантаж `Air.Launcher_<version>_portable_x64.exe` або setup EXE з останнього релізу.
2. Запусти Air Launcher.
3. У Settings перевір GitHub owner і папку встановлення.
4. У Library натисни `Оновити`, щоб перечитати публічні репозиторії та релізи.
5. Встановлюй або запускай застосунки з карток.
6. У About можна оновити або відкотити сам лаунчер через portable asset.

## Розробка

Встановити залежності:

```bash
npm ci
```

Запустити frontend:

```bash
npm run dev
```

Запустити Tauri застосунок у dev-режимі:

```bash
npm run tauri-dev
```

Перевірити TypeScript:

```bash
npx tsc --noEmit
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

Зібрати desktop-застосунок:

```bash
npm run tauri-build
```

## Релізна політика

- Версію треба піднімати перед збіркою EXE.
- Build artifacts зберігаються поза Git-папкою.
- GitHub release має містити тільки portable EXE і один setup EXE.
- Portable asset використовується для safe/self-update лаунчера.
- Setup asset потрібен тільки для ручної інсталяції.

## Стек

- Tauri 2
- Rust
- React
- TypeScript
- Vite

## Документація

Детальний roadmap і acceptance checklist збережені в [ROADMAP.md](ROADMAP.md).
