# Pullora Store Roadmap

## Напрям

Pullora Store має розвиватися як Windows-first app store для застосунків, які публікують installable assets у GitHub Releases. Основа натхненна Komi Store: не просто список репозиторіїв, а discovery-шар для реальних застосунків з release picker, install latest, filters, library state і безпечними попередженнями.

Pullora лишається самостійним продуктом:

- фокус на Windows desktop;
- GitHub Releases як основне джерело;
- portable-first встановлення;
- setup/MSI installer-flow як підтримуваний, але явно позначений варіант;
- українська й англійська в UI;
- без Android/APK/Shizuku/Dhizuku та без обов'язкового backend на першому етапі.

## Принципи Store

- Store показує в першу чергу installable apps, а не просто популярні repos.
- Installable Windows assets: `.exe`, `.msi`, portable `.exe`, `.zip`, `.tar.gz`, `.tgz`, `.tar.xz`, `.tar.bz2`, якщо всередині є `.exe`.
- GitHub auto-generated source archives не вважаються installable.
- Для кожного asset потрібно визначати тип: `Portable`, `Installer`, `Archive`, `Unsupported`.
- `Install latest` має бути основною дією, але release picker лишається доступним для downgrade/reinstall.
- Користувач завжди бачить source repo, publisher/owner, file name, size і тип asset перед встановленням.
- Pullora не гарантує безпеку сторонніх installers; це має бути явно сказано в UI та документації.
- Store не має ламати Library: встановлені програми, updates і favorites мають лишатися локально доступними навіть при GitHub/API проблемах.

## Поточна База

- Є Store page з hero, carousel, categories, browse tabs і install modal.
- Є GitHub search/catalog hooks, favorites, local installed state і project art.
- Є release selector для вибору релізу й asset.
- Є portable/archive install flow.
- Є setup/MSI installer support з запуском зовнішнього майстра і реєстрацією знайденого EXE.
- Є локальна бібліотека installed apps, updates, launch, uninstall, switch version.

## v5.1.0 - Store Foundation [Closed]

Мета: перетворити Store з GitHub catalog UI на installable app store.

- Додати єдиний asset classifier для Store і backend install flow.
- Фільтрувати Store results за installable assets, а не тільки за `has_releases`.
- Ігнорувати source code archives.
- Додати Store sections:
  - Recommended
  - Trending
  - Hot Releases
  - Most Popular
  - Recently Updated
  - Recently Released
  - Favorites
  - Installed / Updates
- Додати `Install latest` як primary action для картки.
- Показувати badges: `Portable`, `Installer`, `Archive`, `Unsupported`.
- Додати installability cache, щоб не перевіряти ті самі repos повторно без потреби.
- Якщо GitHub API недоступний, показувати cached Store state і зрозумілий offline/rate-limit стан.

Прогрес:

- Єдиний backend classifier тепер використовується і для Store release-фільтра, і для download/install flow; repos без installable `.exe`, `.msi` або archive asset більше не проходять як installable тільки через наявність release assets.
- Store installability cache зберігає результати перевірки releases локально на 6 годин, використовує stale fallback при GitHub/API помилці й очищується через manual refresh.
- Store home отримав додаткові roadmap-секції `Trending`, `Hot Releases` і `Recently Released`; release-секції використовують backend `releasesOnly` фільтр з installable asset classifier.
- `Install latest` тепер відкриває release selector із вже вибраним latest installable tag зі Store installability check; картки, hero і preview показують цей latest tag.
- Store home показує локальні секції `Installed from library` і `Favorites`, коли ці проєкти вже відомі каталогу; вони використовують ті самі картки, installability badges і actions.
- GitHub rate-limit/offline стани більше не губляться: Store зберігає вже показаний каталог або fallback sections і показує явний degraded-state банер замість тихого скидання.
- Asset badges у Store hero, cards, row view і preview використовують спільну логіку: `Portable`, `Installer`, `Archive` показуються для installable assets, а `Unsupported` з'являється тільки після надійної release-перевірки без installable asset; degraded GitHub/API state не маскується як unsupported.
- Browse tab `З релізами` використовує backend `releasesOnly`, а installable-only flow покрито classifier tests для `.exe`, `.msi`, archive, source archive і unsupported assets.
- `Installed / Updates` узгоджено без дублювання Store: Store показує локальні Installed/Favorites discovery-секції, а updates-state лишається в Library/Updates Center.

QA:

- Store не показує repos без installable assets у installable-only режимі.
- `.exe`, `.msi`, `.zip` з EXE правильно класифікуються.
- Source code zip/tar.gz не пропонується для встановлення.
- Install latest відкриває release selector з правильним asset.
- Favorites і Installed state не губляться offline.
- `cargo test github::assets` проходить із тимчасовим `CARGO_TARGET_DIR`.

## v5.2.0 - App Details

Мета: зробити сторінку застосунку достатньою для рішення “чи встановлювати”.

- Додати detail view для Store project.
- Показувати README preview як “Про застосунок”.
- Показувати release notes для selected release.
- Показувати список усіх releases і installable assets.
- Додати stable/prerelease toggle.
- Додати summary “що змінилось” між installed version і target version.
- Показувати repo metadata: stars, forks, issues, license, language, topics, latest release date.
- Додати manual refresh з cooldown і дружнім retry-after state.

QA:

- README/release notes не ламають layout.
- Stable-only не показує prerelease за замовчуванням.
- Include prerelease працює окремо від глобальних settings, якщо буде app-level override.
- Version diff коректний для update, reinstall і downgrade.

## v5.3.0 - Library 2.0

Мета: Library має працювати як Apps screen у store, а не просто список встановлених repo.

- Розділити Library на секції:
  - Updates available
  - Installed
  - Pending / failed installs
  - Favorites
  - Recently viewed
- Додати link already installed app flow:
  - вибір EXE;
  - введення GitHub repo URL;
  - вибір matching release asset;
  - збереження зв'язку для updates.
- Додати repair flow для missing executable.
- Додати export/import локальної бібліотеки.
- Додати per-app preferred asset strategy: portable first, installer first, manual, asset name regex.

QA:

- Installed app з absolute EXE path запускається й відкриває правильну папку.
- Failed install видно в pending/failed секції з retry/cleanup.
- Link already installed app не перезаписує наявні versions без підтвердження.
- Export/import не губить active version, asset name, install kind.

## v5.4.0 - Safety & Trust

Мета: користувач має чітко розуміти, що саме він встановлює і з якого джерела.

- Додати pre-install safety panel:
  - owner/repo;
  - release tag;
  - asset name;
  - file type;
  - size;
  - external installer warning;
  - disclaimer про сторонні downloads.
- Показувати SHA-256 digest, якщо GitHub asset digest доступний.
- Додати warning для підозрілих назв assets: `setup` без repo-name match, unknown publisher, tiny/empty file, duplicate misleading names.
- Додати “Open GitHub release” як видиму secondary action.
- Додати diagnostics summary для failed install.

QA:

- Safety panel з'являється для portable, archive і installer.
- Installer має сильніше попередження, ніж portable.
- Unsupported assets не встановлюються автоматично.
- Digest відображається тільки якщо він реально доступний.

## v6.0.0 - Pullora Store Core

Мета: Store стає головним сценарієм Pullora.

- Додати локальний curated index cache без обов'язкового backend.
- Побудувати ranking для discovery:
  - stars;
  - recent release date;
  - recent repo activity;
  - installable asset quality;
  - Windows relevance;
  - installed/favorite history.
- Додати Recently viewed.
- Додати GitHub starred import.
- Додати collection-підхід: Developer Tools, AI Tools, Games, Desktop Apps, Utilities.
- Додати optional backend-ready abstraction, але без залежності від backend у desktop app.
- Підготувати Store documentation: how apps appear, supported assets, safety notice.

QA:

- Store usable без GitHub token.
- Store gracefully degrades при rate limit.
- Search, sections і install latest працюють на чистому профілі.
- Recently viewed і favorites локальні та не потребують акаунта.
- Release process лишається Windows-only з portable EXE і setup EXE.

## Backlog

- Multi-source support: GitHub, Codeberg, Forgejo.
- Download mirrors/proxy support.
- OAuth/device flow для GitHub starred/private visibility.
- Trust score / verified publisher.
- Signature verification, якщо publisher дає metadata.
- Winget/Scoop detection для вже встановлених apps.
- Markdown translation для README/release notes.
- Command palette для швидкого install/launch.
