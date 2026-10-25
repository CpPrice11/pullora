# Перевірка Replica Pullora

## R03 — 2026-10-25

79повних native tests PASS, окремий ignored opt-in `public_release_live_smoke` PASS: forced core quota0, реальні public latest/manifest Pullora і RecycleDesk, по2Windows packages; checksum service читає SHA з fallback cache без API, історія й ключі збережені, ETag скинутий. HTTP fixtures покривають no Authorization,404/403/invalidUTF8/declared та streaming size bounds. Invalid filename/path/tag/host/hash/conflict і відсутність package fail closed. Не завантажували й не запускали EXE/MSI/ZIP.

`check-public-release-fallback.py` PASS4dark/light×UK/EN стани: old history + невідомі size/date/notes, selector/confirm, automatic start, indeterminate progress та SHA status; bridge synthetic. `check-quick-install.py` PASS12appearance+exceptions regression. Два репрезентативні PNG переглянуто. i18n949/contrast32/components/tsc/Vite/rustfmt/diffcheck PASS. Global N01 UI та реальний native install/UAC gate лишаються відкритими; цей результат їх не замінює.

## R02 — 2026-10-25

`scripts/ui/check-installation-sync.py`: PASS12 dark/light ×UK/EN ×1000×700/1280×720/1920×1080,12scopedaxe WCAG2/2.1 A/AA scans безviolations. Missing/returned/unknown files, preserved metadata, explicit discovery without auto-connect, installer remains installer on Reinstall; manual picker disables portable/foreign assets, absent format blocks download. Extra flows verify scan failure preserving last snapshot, coalesced focus burst, hidden pause, one actual30s visible poll without GitHub calls, and missing/unknown buttons in details. Console clean; representative final PNGs reviewed.

Regressions PASS: quick-install12 plus exceptions/Settings/menu, card lifecycle, catalog focused, R01safety12. Synthetic Tauri responses exercise the real production UI; native policy/file behavior is checked independently by47actual-source core tests, including saved-kind changes behind a stale UI plan, legacy portableZIP, ambiguity, CPU/partial-package rejection and file removal/return without changing installed registry bytes. Fullapplication cargo check --tests PASS. UI gate/i18n946/contrast32/tsc/build/rustfmt PASS.

Run with the same production-preview command below, replacing the script with `scripts/ui/check-installation-sync.py`. Full GUI, real setup/UAC and end-to-end native update remain unverified; prior loader0xc0000139 blocker is unchanged. No real apps installed/adopted/removed for this task.

## R01 — 2026-10-25, актуальний результат

`scripts/ui/check-library-safety.py`: PASS 12 dark/light × UK/EN × 1000×700 / 1280×720 / 1920×1080 станів. Реальний React UI, синтетичні Tauri-відповіді. Перевірено running/unknown і blocked controls, connect лише після явної дії, disconnect зі збереженням файлів, повторну native-відмову при застарілому frontend, pending/verified/unavailable/failed checksum, localized mismatch, паузу local polling у hidden document. 12 scoped axe WCAG2/2.1 A/AA scans без violations, console clean, без horizontal overflow. Темний UK1280 і світлий EN1000 знімки переглянуто; дані на них тестові.

Повторно PASS: quick-install12, card-operation lifecycle, focused catalog/compact interactions, tsc, components, i18n939/939, contrast32, Vite production, rustfmt. Для відтворення browser QA використати команду нижче з `scripts/ui/check-library-safety.py`.

Native: повний `cargo check --locked --lib --tests` PASS на GNU + portable LLVM-MinGW20261020. Ignored `.codex-tools/native-core-tests/Cargo.toml` через `.codex-tools/check-native.ps1 -Action test -Manifest .codex-tools/native-core-tests/Cargo.toml -ExtraArgs @('--quiet')` виконує 43 actual-source core tests: Windows processes і read-only registry, checksum parsing/tamper, external ownership, cache migration, storage/path/settings. Це окремий test graph із власним lock, не виконання повного Tauri test suite. Інструменти та target лежать у Temp, без системної інсталяції.

Повний application test EXE зібрався, але loader повертає 0xc0000139 до старту тестів. Старі записи про missing linker нижче є історією I01; актуальний blocker — native runtime. Не пройдені: GUI launch, справжній download→verify→install, IFileOperation/UAC approve/deny, standard-user credentials, ordinary child launch, Website та native media runtime. Release gate лишається відкритим.

## I01 — 2026-10-25

`scripts/ui/check-quick-install.py`: PASS 12 dark/light × uk/en × viewport cases, 12 scoped axe scans; portable/ZIP/setup, stable-only, preparation busy, error/retry/completion, ambiguity, foreign/update packages, missing releases, network error, path validation EN/UK та advanced version-menu focus. `--focused` залишає одну appearance-комбінацію та всі exception/Settings/menu flows. Для запуску замінити назву скрипта в команді нижче. Додатково повторено focused card-operation lifecycle і catalog/compact/interactions. Усі ці перевірки використовують synthetic native bridge.

Відкритий native gate: build і Rust tests; чистий/наявний Program Files root; UAC approve/deny для install/update/uninstall/cleanup; standard-user credentials; незмінені права launcher/child app і directory ACL; відсутній EXE/locked file/disk error; збережена активна версія після невдачі; interrupted-copy orphan recovery лише за явною дією; startup без UAC; старий custom path і installer-cache не стають новим default root. MSVC `link.exe` відсутній, тому ці сценарії НЕ виконані.

Дата: 2026-10-24. База: `13cb9c6` і локальні функціональні зміни. Середовище: production Vite preview, системний Microsoft Edge, Python Playwright; Tauri bridge та дані імітуються.

Перевіряється погоджений S01 і чинні функції Pullora. Мобільний продукт, акаунти інших користувачів, платежі та Table не входять до цього desktop-завдання. Основні розміри: 1000×700, 1280×720, 1920×1080. Порівняльний знімок: 1180×900, як у наданого Grid-референсу.

| Case | Flow | Тип | Дії | Очікування | Перевірка | Результат |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | Каталог | happy | Відкрити Library, перемкнути compact | 2/3/4 колонки; описи й основні дії видимі | check-library-catalog.py | PASS |
| F01-E1 | Каталог | long/empty | Довга назва, довгий і відсутній опис, порожній пошук | Перенесення й empty state без overflow | check-library-catalog.py | PASS |
| F01-E2 | Каталог | freshness | Оновити каталог; повторити з недоступною мережею | Час завантаження або повідомлення про збережені дані | check-card-operations.py | PASS |
| F02-H1 | Картка → дія | happy | Install/Update/GitHub/Website | Викликається відповідна чинна команда; інші дії не запускаються | check-library-catalog.py | PASS bridge |
| F02-N1 | Посилання | negative | Відсутній/invalid Website та помилка команди | Некоректна адреса прихована; збій показано | component + catalog | PASS frontend; native BLOCKED |
| F03-H1 | Подробиці | keyboard | Відкрити, закрити, почати пошук | Коректний focus, панель не краде пошук | check-library-catalog.py | PASS |
| F03-E1 | Меню/вибір | keyboard | Escape, Ctrl+A, checkbox, прокручування | Повернення focus і збережені bulk/menu flows | check-library-catalog.py | PASS |
| F04-H1 | Операція | happy | Події queued/downloading/verifying/extracting/installing/launchChecking | Етап, відсоток, обсяг, progressbar; Cancel лише в дозволених етапах | check-card-operations.py | PASS bridge |
| F04-E1 | Операція | unknown/limits | Невідомий розмір, NaN, негативний і завеликий progress | Без вигаданого відсотка; числові межі 0..100 | component + card operations | PASS |
| F04-E2 | Операція | cancel | Запустити й скасувати оновлення; відкрити Updates | Прогрес прибраний, центр більше не busy | check-card-operations.py | PASS bridge |
| F04-E3 | Операція | restored | Отримати вже активну операцію при вході, потім completed | Встановлена версія оновлюється без ручного refresh | check-card-operations.py | PASS bridge |
| F04-N1 | Операція | failure | Команда скасування повертає помилку | Повідомлення; прогрес збережений, Cancel знову доступний | check-card-operations.py | PASS bridge |
| F04-E4 | Операція | focus/motion | Cancel клавіатурою; змінити progress; reduced motion | Focus повертається; геометрія стала, рух лише transform; reduced motion прибирає його | check-card-operations.py | PASS |
| F05-H1 | Медіа | happy | Default icon, custom cover, reset, gallery | Пріоритет власного зображення; reset не видаляє фон | check-default-media.py | PASS bridge |
| F05-E1 | Галерея | keyboard/empty | Збільшення, Tab/Shift+Tab/Escape, інший застосунок без screenshots | Focus trap/return; немає порожнього блоку й чужих знімків | check-default-media.py | PASS |
| F05-N1 | Медіа | offline | Native media command недоступна | Аватар/fallback; каталог працює; assets repo прихований | check-default-media.py | PASS frontend; real cache BLOCKED |

Усі три browser-скрипти виконано на dark/light × uk/en × трьох розмірах: 36 комбінацій, із додатковими interaction/regression-сценаріями. Консоль і HTTP 5xx перевіряються в новому прогоні операцій. Axe-core 4.10.3 просканував Library у 12 станах для WCAG 2/2.1 A/AA без порушень; rendered text/focus contrast перевірено окремо. Це не ручний screen-reader audit.

## Запуск

Використовуються вже встановлені Python Playwright і Edge. Axe-core 4.10.3 з офіційного npm archive розпаковано лише до gitignored `.codex-tools/axe/package/axe.min.js`; залежності застосунку не змінені.

```powershell
$env:PYTHONPATH = '.codex-tools/python'
$env:PULLORA_TEST_BROWSER_EXECUTABLE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
python <webapp-testing>/scripts/with_server.py --server 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort' --port 4173 -- python -u scripts/ui/check-card-operations.py
```

Перед цим потрібна production-збірка. `--focused` у `check-card-operations.py` запускає лише lifecycle regressions без повної матриці. `check-library-catalog.py` і `check-default-media.py` перевіряють попередні сценарії окремо. Шлях `<webapp-testing>` означає каталог установленого скіла, а `python` має вказувати на runtime з Playwright.

## Межі

Реальне встановлення, cancel у нативному downloader, Website через ShellExecuteW та offline media cache не перевірені. MSVC linker відсутній, GNU toolchain неповний; попередню помилку native build не повторювали без змін середовища. Старий 25-script release gate ще потребує міграції layout baseline. Browser PASS не є дозволом на випуск EXE.
