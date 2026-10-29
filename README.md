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

Починаючи з `v5.23.0`, Pullora використовує типові іконки та галерею зі сховища, показує статус запущених програм і дозволяє підключати знайдені Windows-інсталяції. Власні зображення мають пріоритет над типовими.

У `v5.23.0` додано встановлення останнього stable portable EXE або повного ZIP одним натисканням із прогресом у картці. setup/MSI лишається запасним варіантом. Стандартна папка нових налаштувань: `C:\Program Files\Pullora\Apps`; збережені шляхи та попередні встановлення не переносяться. Для захищених операцій із файлами може знадобитися підтвердження Windows.

## Розробка

У `v5.23.0` є швидкий запуск із системного трея та перемикач подання бібліотеки «Картки / Таблиця» з двома іконками. Він замінює компактний режим і зберігає вибір після перезапуску. Обидва подання використовують спільні пошук, папки, дії та прогрес. Меню трея запускає встановлені застосунки, відкриває Warframe Arsenal, показує або приховує вікно й завершує Pullora; у `v5.24.0` хрестик змінено на приховування в трей, а «Вийти» повністю завершує програму.

У `v5.23.0` оновлення також зберігають тип встановлення: EXE, ZIP або інсталятор. Бібліотека автоматично звіряє наявність файлів і Windows-інсталяцій; зниклі програми позначає для відновлення, зберігаючи їхні записи. Підключення знайденої програми потребує явної дії. Ця логіка реалізована на Rust.

У `v5.24.0`: дату релізу додано в картки й таблицю; невідома дата не замінюється датою коміту. Пауза й продовження доступні в картках і списку завантажень. Продовження використовує HTTP Range та сильний ETag; без підтримки або при зміні файла завантаження починається заново. Після перезапуску Pullora залишається звичайний повтор незавершеної операції. Сповіщення перевіряють встановлені програми кожні 30 хвилин роботи Pullora, зберігають історію надісланих версій і вимикаються в налаштуваннях. Windows може приглушувати їх; автоматичного встановлення оновлень немає.

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

- [Структура файлів і правила розміщення](docs/PROJECT_STRUCTURE.md)

- [Як підготувати застосунок до встановлення й оновлень через Pullora](docs/APP_UPDATE_INTEGRATION.md)
- [Дорожня карта та стан робіт](docs/roadmaps/PRODUCT_IMPROVEMENT_ROADMAP.md)
- [Процес релізу](docs/RELEASE_PROCESS.md)
- [Матриця регресій](docs/REGRESSION_MATRIX.md)
- [Правила дизайну](docs/DESIGN_GUIDELINES.md)
- [Сховище зображень та формат маніфесту](https://github.com/CpPrice11/pullora-assets#readme)

## English

Version `v5.23.0` adds native tray quick launch and an icon-only Cards / Table switch, replacing compact mode. The selected view persists across restarts; search, folders, actions, and progress are shared. The tray can launch installed apps, visit Warframe Arsenal, show or hide the window, and exit Pullora. In `v5.24.0`, closing the window hides Pullora in the tray; Exit quits the app.

Application authors: see the [packaging and update integration guide](docs/APP_UPDATE_INTEGRATION.md), including checksum generation and a GitHub Actions example.

Pullora is a publicly available Windows 11 launcher for CpPrice11's applications. The author develops it primarily for their own use, and anyone can download and use it. The catalog is fixed to `CpPrice11`; the UI supports Ukrainian and English. Applications are installed from public GitHub Releases, while installed versions and user settings stay on the user's computer.

Installed copies use the signed Tauri updater. Portable copies open the official release page and are updated manually. The EXE files are not Authenticode-signed. The public [pullora-assets](https://github.com/CpPrice11/pullora-assets) repository stores application icons and will also hold screenshots. Version `v5.23.0` includes its launcher integration, screenshot gallery, and revised application cards.

Version `v5.24.0` adds release dates, pause/resume, and optional Windows update notifications. Resume uses HTTP Range with a strong ETag; unsupported or changed downloads restart safely. Restarting Pullora still uses the existing retry flow. Notifications check installed apps every 30 minutes while Pullora runs, remember notified versions, and can be disabled in Settings. Windows may silence them. Updates are not installed automatically.
