# Air Launcher

Air Launcher — легкий desktop launcher для Windows 11, який знаходить програми в публічних GitHub repositories, встановлює їх із GitHub Releases, запускає, оновлює й допомагає керувати локальними версіями.

Поточний фокус продукту: polished GitHub release launcher. До `2.0.0` проєкт не розширюється в локальний app manager, marketplace або клієнт для private repositories.

## Можливості

- Показує публічні repositories вибраного GitHub owner, у яких є releases.
- Не показує сам `air-launcher` у бібліотеці застосунків.
- Встановлює portable EXE та архіви з GitHub Releases.
- Показує setup/MSI assets як другорядні ручні файли з попередженням.
- Має install wizard: версія, файл, підтвердження, прогрес, результат.
- Підтримує запуск, оновлення, rollback і видалення локальних версій.
- Має Library-first cinematic UI з фільтрами Installed, Favorites, Updates і Available.
- Підтримує portable self-update самого лаунчера з About.
- Підтримує українську й англійську мови; українська є мовою за замовчуванням.

## Який файл завантажувати

У кожному публічному release Air Launcher вручну публікуються тільки два assets:

- `Air.Launcher_<version>_portable_x64.exe` — portable-версія для запуску без інсталятора та для safe/self-update лаунчера.
- `Air.Launcher_<version>_x64-setup.exe` — один setup installer для ручної інсталяції.

Не додавати MSI, portable ZIP або дублікати setup/portable assets, якщо це прямо не потрібно. GitHub автоматично додає `Source code (zip)` і `Source code (tar.gz)`; Air Launcher не використовує їх як install/update assets.

## Як користуватись

1. Завантаж `Air.Launcher_<version>_portable_x64.exe` або setup EXE з останнього release.
2. Запусти Air Launcher.
3. У Settings перевір GitHub owner і папку встановлення.
4. У Library натисни `Оновити`, щоб перечитати публічні repositories та releases.
5. Встановлюй або запускай застосунки з карток Library.
6. У About можна оновити або відкотити сам лаунчер через portable asset.

## Розробка

Стек не переписуємо:

- Tauri 2
- Rust
- React
- TypeScript
- CSS
- Vite

Встановити залежності:

```bash
npm ci
```

Запустити frontend:

```bash
npm run dev
```

Запустити Tauri в dev-режимі:

```bash
npm run tauri-dev
```

Перевірити frontend:

```bash
npm run build
```

Перевірити Rust/Tauri backend:

```bash
cd src-tauri
cargo check
```

Зібрати production desktop app:

```bash
npm run tauri-build
```

Release safety check:

```bash
npm run check:release -- -Version 1.8.0 -SkipSmokeTest
```

Full local release check after build and GitHub release publishing:

```bash
npm run check:release -- -Version 1.8.0 -CheckGitHubRelease
```

## Release Policy

- Build artifacts не зберігати в Git.
- Зібрані файли зберігати в `C:\Users\sasha\OneDrive\Документи\Projects\Air Launcher Builds\<version>`.
- Перед user-facing UI/UX або app behavior release перевірити:
  - `npm run build`
  - `cargo check`
  - `npm run tauri-build`
  - smoke-test portable EXE
- GitHub release має містити тільки:
  - portable EXE
  - один setup EXE
- MSI/ZIP assets не додавати без окремого рішення.

## Roadmap

Актуальна дорога до `2.0.0`, QA matrix і release checklist збережені в [ROADMAP.md](ROADMAP.md).
