# Реалізація карток Pullora

## R03 — резервні релізи, 2026-10-25

Погоджений перший пункт реалізовано на Rust: `github/public_release.rs` + get_releases fallback для quota/429/rate403. Anonymous client, pinned tag, bounded128KiB GNU/BSD SHA manifests; старі releases збережені й API ETag очищений. Немає пакетів без SHA у резервному шляху. Чинні SHA parser/HTTP helpers повторно використані download/checksum.rs. Native CPU/package policy не дублюється. Public metadata не вигадує size/date/notes; picker використовує локалізовані unavailable стани. Native79tests і live2repos PASS; frontend4states/quick12/build PASS. Без публікації, трея чи встановлення реальних app packages. SAM/Fandom зараз без SHA manifests, отже fallback для їх нових пакетів не працює.

## 2026-10-25: R02, два погоджені доповнення

Вибір пакетів перенесено в `storage/installation_policy.rs`: новий install лишає portable/ZIP у пріоритеті, update зберігає EXE, ZIP або installer. Підключені Windows-інсталяції використовують installer. Native plan повертає допустимі файли й рекомендацію, ручний picker блокує інші формати. Неоднозначність потребує вибору, відсутність потрібного формату не запускає інший. `start_download` перевіряє saved format до checksum і повторно під mutation lock. Bulk лишається portable-only. Старі TS selectors видалені; нових залежностей немає.

Read-only `local_installations` повертає installed/discovered/health одним snapshot. UI звіряється при вході, focus/visibility та кожні30s visible; приховане вікно не опитується, запити не перекриваються й не звертаються до GitHub. Зниклий EXE дає Needs repair/Reinstall, access uncertainty — блокування launch; файли повернулися — знову звичайний Launch. Записи бібліотеки не видаляються. Підключення іншої знайденої інсталяції замість missing можливе лише явною дією. Реконструкція шляху спільна з running-app inspection; UNC/traversal/reparse не обходяться. Зовнішня зміна версії на тому самому шляху поки не переписує історію версій.

PASS:47actual-source native tests, full application cargo check --tests, tsc/components, i18n946/946, contrast32, Vite production, rustfmt, diffcheck. Новий `check-installation-sync.py`:12appearance/axe cases і додаткові format/manual/reinstall/scanerror/single-flight/details/real30s/noAPI/hidden flows. Повторно quick-install12, R01safety12, card lifecycle, focused catalog PASS. Консоль чиста; darkUK1280/lightEN1000 screenshots переглянуті. Browser bridge синтетичний; core tests виконують фактичний Rust окремо від Tauri GUI.

Ponytail-review: видалено дубльоване TS ranking, спільні path/can_connect helpers замінили повтори, зайвий registry scan в adopt прибрано. Версія5.22.1, HEADc378da0; усе функціонально локально. Нативний GUI/install/UAC gate лишається відкритим через попередній loader0xc0000139. Реліз не виконано; прискорення без benchmark не заявляється.

## 2026-10-25: R01, три погоджені доповнення

- Статус Running/Unknown отримується через Windows process snapshot і повний шлях EXE усіх записаних версій. Локальне опитування кожні 3 секунди зупиняється у прихованому вікні. Update, switch, uninstall і повторний launch захищені також нативними перевірками; невідомий стан блокує зміни. Чужі процеси не завершуються.
- Read-only пошук Windows Uninstall у HKCU/HKLM, 32/64-bit, розпізнає Steam Achievement Manager, Fandom Wiki Translator та Recycle Desk. Картка пропонує явне підключення з версією та шляхом. Повторна native-перевірка відкидає застарілий вибір; зовнішні файли не копіюються. Disconnect видаляє лише запис бібліотеки. Portable-папки без Windows registration не скануються.
- Downloader бере SHA-256 із GitHub asset digest або опублікованого checksum-файла і перевіряє завантаження до extract/installer. Невідповідність зупиняє операцію; відсутність суми показується окремо й не видається за успішну перевірку. Маніфест обмежений 128 KiB, HTTPS, дозволеними GitHub hosts і timeout; auth-токен не передається. Cache v1 очищує тільки release-частину, що раніше втрачала digest.
- Використано вже наявний sha2 0.10.9 як пряму залежність. Основний Cargo.lock: лише два додані dependency names за I01/R01, без оновлення версій пакетів. Запис installed registry став атомарним; спільний короткий mutation lock закриває конфлікти launch/install/delete. Привілейованого сервісу, трея й нових frontend dependencies немає.
- Перевірки: TypeScript, component contracts, i18n 939/939, contrast32, production build, rustfmt і diff checks PASS. `check-library-safety.py`: 12 theme/language/viewport станів, scoped axe, running/unknown, stale native guards, explicit connect/disconnect, checksum states, hidden polling; bridge синтетичний. Попередні quick-install12, card lifecycle і focused catalog regressions PASS. Репрезентативні знімки перевірено окремо.
- Native environment відновлено portable LLVM-MinGW 20261020 у Temp, без системної інсталяції: archive SHA-256 fd5462b7f5d93b2ff981fcd3f9c7e427e47f3203c64ea91c27bcc444eebd74cd. Повний `cargo check --locked --lib --tests` PASS, виправлено Send/lifetime future у default_media. Окремий ignored harness імпортує фактичні storage/github/checksum модулі: 43 tests PASS, включно з реальним Windows process snapshot, read-only registry, tampered hash, cache migration і збереженням external EXE. Harness має власний ізольований lock; це не повний application suite.
- Повний application test EXE скомпільований, але Windows loader завершує його з 0xc0000139 до запуску тестів. GUI, IFileOperation/UAC approve/deny та реальна інсталяція залишаються неперевіреними. Це уточнює попередній linker blocker I01, а не закриває native runtime gate.
- Ponytail-review R01: зайві повторні refresh після adopt прибрані, повторно використано чинні cards/download/storage; інших обґрунтованих скорочень немає. Код ArtCraft не переносився. Усе локально, HEAD13cb9c6 і версія5.22.1; без commit/push/tag/release.

## 2026-10-25: I01, встановлення

- Звичайний Install/Update одразу обирає latest stable portable EXE/повний ZIP для архітектури Pullora; setup/MSI — fallback. Рівнозначні кандидати відкривають file step без автоматичного вибору. Старі версії доступні в меню. Bulk portable update збережено.
- Pending блокує повторні натискання. Прогрес і помилка з повтором/вибором іншого файла показуються в картці; після completed перечитується registry. Snapshot downloader не затирає новіші stream events.
- Стандартна папка Windows: `C:\Program Files\Pullora\Apps` у portable та installed режимах; збережені вибрані шляхи й наявні файли лишаються на місці. Валідація не створює захищених папок і не показує UAC. Download/extract відбуваються в наявному cache.
- Захищені copy/delete використовують Windows IFileOperation в окремій STA. Pullora та запуск програм не підвищуються, ACL не послаблюються. Версії мають окремі `tag.install-UUID` папки, запис у registry відбувається після copy/check. Невдала спроба не перезаписує попередню версію. Orphan recovery у Program Files запускається лише явною дією, без UAC при старті лаунчера. App uninstall групує захищені папки в одну Shell operation.
- `windows 0.61.3` уже був у Cargo.lock як transitive dependency; додано пряму залежність з COM/Shell features. Lock змінений на один рядок, версії пакетів не оновлені; frontend dependencies не додані.
- PASS: TypeScript, component checks, i18n 914/914, contrast32, Vite build, rustfmt, metadata --locked --offline, diff checks. `check-quick-install.py`: 12 theme/language/viewport cases з 12 scoped axe scans без WCAG2/2.1 A/AA violations; portable/ZIP/setup, busy, stable-only, failure/retry/completed, ambiguity/foreign/no-release/network, EN/UK path validation, version-menu focus. Focused card lifecycle та catalog regressions PASS. Знімки recovery dark/uk/1280 і light/en/1000 переглянуто. Дані й UAC відповідь синтетичні.
- BLOCKED: `cargo check --locked --offline --lib` зупиняється у build dependencies через відсутній `link.exe`. Окрема metadata-проба з попередніми rlib також недоступна: OneDrive cloud file provider error362. Новий Rust-код, справжній UAC approve/deny, copy/update/delete/recovery та запуск EXE ще не перевірені. Це не готовий Windows release. Версія5.22.1, без commit/push/tag/release.
- Окремо actual path_scope.rs і його test module пройшли rustc --test --emit=metadata (type check, без виконання). Фінальні recovery icons обмежені16px після візуального огляду; geometry guard і повторні12browsercases PASS. Це не перевірка COM/UAC. Ponytail review поточного diff: окремого privileged helper/service і ACL-конфігурації немає; повторно використано downloader, native Shell і вже наявний пакет Windows.

## 2026-10-24

S01: реалізовано full-width картковий каталог на чинному Tauri/Rust/React. Картки містять опис, посилання, статус, версії та основну дію. Папки й контекстні дії збережено. Подробиці відкривають наявну inline-панель за запитом. S02/Table не входить до погодженої реалізації.

`homepage` додано як необов'язкове поле frontend/Rust-моделі; старі cache записи сумісні. Website відкривається окремою HTTPS-командою; GitHub-only обмеження чинної команди не послаблено. Платних сервісів, нових залежностей застосунку, зміни бренду чи релізу немає. `package.json` і `package-lock.json` збережено; залежності відновлено через npm ci для точного lockfile.

## Перевірено

- EN/UK: 900 ключів у кожній локалі, duplicates=0.
- TypeScript, component contracts, 32 статичні WCAG-пари, rustfmt і production Vite build пройшли.
- Playwright/Edge: 12 комбінацій dark/light × uk/en × 1000×700 / 1280×720 / 1920×1080. Normal/compact, перенесення довгих назв і двох рядків опису, відсутність горизонтального overflow, дії посилань, focus після деталей/меню, bulk, install, one-click update, Updates center, empty та failure toast.
- Rendered contrast і focus перевіряються через наявні CDP-helper-и. Консоль тестових сценаріїв без помилок. Знімки темної й світлої тем переглянуто візуально.
- Ті самі text/focus-пари проходять на власному фоні. Останній focused regression підтвердив збереження focus у пошуку й стабільне меню після scroll; меню фокусує item із `preventScroll`.
- Impeccable detector повернув `[]`; Ponytail diff-review не потребував нових залежностей чи абстракцій.

## Обмеження перевірки

Tauri bridge у браузерному прогоні імітується. Реальне відкриття зовнішнього браузера через нову Windows-команду не перевірено. `cargo test --locked --offline --lib website_links_accept_only_https_without_credentials` зупинився на відсутньому `link.exe`; стан захисту Windows не змінювали.

Повний попередній 25-script release gate не заявляється пройденим. Його точні density/pane baseline-контракти описують колишню постійну sidebar/details-композицію й потребують міграції перед релізом. Нові картки перевіряє окремий `check-library-catalog.py`; component contracts оновлено під нову семантику.

`clone-screens/catalog-*.png` містять виключно тестові дані, включно із синтетичними назвами, описами та example.com. Вони слугують доказом верстки, а не поточним реальним каталогом Pullora.

## 2026-10-24: продовження S01

Користувач доручив продовжити Replica з ArtCraft. Додано inline operation block у зоні основної дії: етап, числовий progress, обсяг і скасування queued/downloading; без pause/resume. Однакові stage/percent/cancel helpers використовуються в картці та наявному DownloadProgressPanel. Під час операції основна дія в меню недоступна. Cancel обробляє failure і повертає keyboard focus; незавершений запит блокує повторне натискання.

Нижній рядок показує час завантаження Library, loading або повідомлення про збережені дані при помилці. Він не називає відповідь backend cache гарантовано свіжою. Нових фонових запитів немає.

Busy-стан batch виводиться з фактичних активних операцій і старту запитів; cancel видаляє job. Завершення кожного нового completed ID перечитує встановлені версії, включно з операціями, відновленими після повернення до Library. Відтворений stale-version defect і обмеження первинного cancel-тесту наведені в `bugs.md`.

Пройдено: TypeScript, component checks, 909/909 i18n, 32 WCAG theme pairs, production build. `check-card-operations.py`: 12 dark/light × UK/EN × viewport сценаріїв, 12 scoped axe WCAG 2/2.1 A/AA scans без violations, stage/cancel/unknown-size/focus/motion/offline перевірки та два lifecycle regressions. `check-library-catalog.py` і `check-default-media.py` повторно пройшли свої12комбінацій кожен, без console errors. Репрезентативні screenshots переглянуто.

Ponytail-review: прибрано дубльовану локальну reduced-motion media rule на користь спільного контракту; зайву залежність busy від job-map замінено фактичними операціями. Нових app dependencies немає; axe встановлено лише як gitignored QA tool. Поточна motion-перевірка: transform-only, 120ms existing token, сталий track rectangle, відсутність transform transition в reduced motion.

`test-plan.md` і `parity.md` завершують frontend-перевірку цього етапу. Feature matrix:94,3%,9/9must; edge/layout score34,1/100 чесно показує іншу композицію Pullora. Native QA та release gate лишаються відкритими. Функціональні зміни залишені локально; тегів і випуску немає.
