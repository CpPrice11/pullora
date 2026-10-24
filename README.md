# Pullora

Pullora доступний усім як настільний лаунчер застосунків [CpPrice11](https://github.com/CpPrice11) для Windows 11. Автор розвиває його насамперед для себе та власного використання: встановлення, оновлення й запуску своїх програм із GitHub Releases.

Каталог прив'язаний до `CpPrice11`. Користуватися лаунчером може кожен; обліковий запис автора для цього не потрібен. Інтерфейс підтримує українську та англійську мови.

[Завантажити актуальний реліз](https://github.com/CpPrice11/pullora/releases/latest) · [Іконки та скриншоти](https://github.com/CpPrice11/pullora-assets)

## Можливості

- Бібліотека з пошуком, фільтрами, папками й обраним.
- Встановлення portable EXE та архівів із запускним файлом; окремий шлях для setup/MSI.
- Запуск програм, перевірка оновлень, перемикання встановлених версій і видалення.
- Кнопка оновлення бібліотеки після публікації нового GitHub Release.
- Перевірка релізних файлів за SHA-256.
- Світла й темна теми, власні фони та обкладинки, кадрування, прозорість і рівні ефектів.

## Завантаження та оновлення

На [сторінці Releases](https://github.com/CpPrice11/pullora/releases/latest) є два варіанти:

| Файл | Призначення |
| --- | --- |
| `Pullora_<version>_x64-setup.exe` | Інсталятор. Встановлена Pullora використовує підписаний механізм Tauri updater. |
| `Pullora_<version>_portable_x64.exe` | Portable-версія. Для її оновлення лаунчер відкриває офіційний GitHub Release; файл замінюється вручну. |
| `SHA256SUMS.txt` | Контрольні суми обох EXE. |
| `Pullora_<version>_x64-setup.exe.sig`, `latest.json` | Підпис і відомості для автоматичного оновлення встановленої версії. |

EXE не мають Authenticode-підпису, тому Windows може показати попередження або заблокувати запуск. Підпис Tauri updater перевіряє оновлення встановленої Pullora; він не є підписом видавця Windows. Політика перевірки файлів описана в [процесі релізу](docs/RELEASE_PROCESS.md).

## Каталог і зображення

Pullora показує застосунки `CpPrice11` і працює з їхніми публічними GitHub Releases. Встановлені версії, папки, обране й налаштування зберігаються на комп'ютері користувача.

Репозиторій [pullora-assets](https://github.com/CpPrice11/pullora-assets) містить типові іконки та призначений також для скриншотів цих програм. Зараз у ньому є три іконки; справжні скриншоти ще не додані. Джерела й умови використання зображень наведені в [SOURCES.md](https://github.com/CpPrice11/pullora-assets/blob/main/SOURCES.md).

Підключення цього сховища, галерея в подробицях і нові самодостатні картки реалізовані локально та ще не входять до опублікованого `v5.22.1`. Перевірки frontend пройдено; нативна збірка й перевірка встановленого застосунку залишаються перед випуском. Власні зображення зберігатимуть пріоритет над типовими.

## Розробка

Стек: Tauri 2, Rust, React, TypeScript і Vite. Для нативної збірки потрібні інструменти розробки Windows.

```powershell
npm ci
npm run dev
```

Перевірки та збірка:

```powershell
npm run build
npm run test:components
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri-build
```

Підготовку артефактів, release gate і smoke-test описано в [RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md). Зміни документації не означають випуск нової версії.

## Документація

- [Дорожня карта та стан робіт](docs/roadmaps/PRODUCT_IMPROVEMENT_ROADMAP.md)
- [Процес релізу](docs/RELEASE_PROCESS.md)
- [Матриця регресій](docs/REGRESSION_MATRIX.md)
- [Правила дизайну](docs/DESIGN_GUIDELINES.md)
- [Сховище зображень та формат маніфесту](https://github.com/CpPrice11/pullora-assets#readme)

## English

Pullora is a publicly available Windows 11 launcher for CpPrice11's applications. The author develops it primarily for their own use, and anyone can download and use it. The catalog is fixed to `CpPrice11`; the UI supports Ukrainian and English. Applications are installed from public GitHub Releases, while installed versions and user settings stay on the user's computer.

Installed copies use the signed Tauri updater. Portable copies open the official release page and are updated manually. The EXE files are not Authenticode-signed. The public [pullora-assets](https://github.com/CpPrice11/pullora-assets) repository stores application icons and will also hold screenshots. Its launcher integration, screenshot gallery, and revised application cards are local work that has not yet shipped in `v5.22.1`.
