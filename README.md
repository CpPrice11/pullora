# Pullora

Pullora — настільний лаунчер для Windows 11 на Tauri, Rust і React. Він знаходить застосунки у публічних GitHub Releases, встановлює та оновлює їх, а також керує локальною бібліотекою версій.

Інтерфейс доступний українською та англійською мовами.

## Можливості

- бібліотека застосунків із пошуком, фільтрами, папками й обраним;
- встановлення portable EXE, архівів з EXE та setup/MSI;
- запуск, оновлення, відкат і видалення локальних версій;
- ручна перевірка оновлень застосунків і самої Pullora;
- перевірка релізних файлів за SHA-256;
- світла й темна теми, власні фони, прозорість і розмиття підкладок;
- українська та англійська локалізації.

## Релізні файли

Кожен підтримуваний реліз Pullora містить:

- `Pullora_<version>_portable_x64.exe` — portable-версію та джерело self-update;
- `Pullora_<version>_x64-setup.exe` — інсталятор;
- `SHA256SUMS.txt` — контрольні суми обох EXE.

На сторінці Releases зберігаються лише актуальні стабільні версії з повним набором перевірених файлів.

## Розробка

```bash
npm ci
npm run dev
npm run build
cd src-tauri && cargo check
npm run tauri-build
```

Перевірка готовності релізу:

```powershell
npm run check:release -- -Version <version> -RcReadiness -SkipArtifacts
```

Перед публікацією виконуються frontend build, Rust checks/tests, Tauri build, release-check і smoke-test portable EXE.

## Документація

- [Актуальний roadmap](docs/roadmaps/PRODUCT_IMPROVEMENT_ROADMAP.md)
- [Процес релізу](docs/RELEASE_PROCESS.md)
- [Матриця регресій](docs/REGRESSION_MATRIX.md)
- [Правила дизайну](docs/DESIGN_GUIDELINES.md)
