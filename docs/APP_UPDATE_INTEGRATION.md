# Підготовка застосунку до оновлень через Pullora

Ця інструкція описує, які файли публікувати в репозиторії застосунку, щоб Pullora могла встановлювати й оновлювати його з GitHub Releases. Назви `MyApp` і версія `v1.2.3` нижче є прикладами.

Вимоги звірено з поточним кодом Pullora. Встановлення одним натисканням, збереження формату пакета та резервне отримання релізів реалізовані локально й ще не входять до опублікованого `v5.22.1`. Стан випущеної версії описано в [README](../README.md).

## Мінімальний комплект

1. Публічний репозиторій застосунку в `CpPrice11`.
2. Опублікований stable GitHub Release з тегом на зразок `v1.2.3`.
3. Готовий Windows-пакет: самодостатній portable EXE, повний ZIP або setup/MSI.
4. Файл `SHA256SUMS.txt` із контрольними сумами готових пакетів, прикріплений до того самого релізу.
5. Узгоджена версія в тегу, назвах пакетів і відомостях самого застосунку.

Commit, Git tag або workflow artifact без GitHub Release не є пакетом для встановлення. Автоматично створені GitHub архіви `Source code` також не підходять.

## Назви та формати пакетів

Використовуй у назвах латинські літери, цифри, крапку, дефіс і підкреслення. Це стосується також тегів. Для резервного режиму пробіли, Unicode, `%`, `+`, вкладені шляхи й параметри URL не підтримуються. Явно вказуй архітектуру: `x64`, `arm64` або `x86`.

| Приклад asset | Вміст і поведінка |
| --- | --- |
| `MyApp-v1.2.3-windows-x64-portable.exe` | Один EXE з усім необхідним для запуску. Pullora копіює його й запускає як програму. |
| `MyApp-v1.2.3-windows-x64.zip` | Повна portable-збірка: основний EXE, бібліотеки та ресурси. Pullora розпаковує пакет. |
| `MyApp-v1.2.3-windows-x64-setup.exe` | Звичайний інсталятор зі штатними вікнами та системними підтвердженнями. |
| `MyApp-v1.2.3-windows-x64.msi` | Пакет Windows Installer, який запускається через `msiexec /i`. |

Для першого встановлення пріоритет має пакет із позначкою `portable`, далі звичайний EXE, повний ZIP і потім інсталятор. Якщо опублікувати одночасно portable EXE та portable ZIP з однаковим пріоритетом, Pullora може запропонувати вибір. Для одного натискання залишай один найкращий пакет на кожну архітектуру, наприклад portable EXE та запасний `setup.exe`.

Позначай інсталятор словом `setup` або `installer`, щоб він не визначався як звичайний EXE. Назви пакетів не повинні містити сторонніх позначок `update`, `updater`, `delta`, `source`, `src`, `debug`, `symbols` чи назв іншої платформи. Такі файли відсіюються з автоматичного встановлення. Службові updater-файли можна публікувати окремо, але вони не замінюють повний пакет.

З кожним релізом продовжуй випускати формат, у якому вже встановлено застосунок: EXE → EXE, ZIP → ZIP, інсталятор → інсталятор. Коли відповідного формату немає, Pullora зупиняє оновлення; прихованого переходу на інший формат не відбувається.

## Як упакувати portable-збірку

Перевір EXE на чистій Windows-машині без середовища розробки. Якщо поруч потрібні DLL, `resources`, WebView loader чи інші файли, постачай їх у повному ZIP або у справді самодостатньому portable EXE.

Рекомендована структура ZIP:

```text
MyApp.exe
resources/
required-library.dll
```

Основний EXE розмісти в корені. Pullora шукає виконуваний файл рекурсивно й надає перевагу меншій глибині; кілька EXE на одному рівні створюють неоднозначність. Допоміжні виконувані файли тримай у підкаталогах. Архів має містити повну програму, запускатися після розпакування та не містити абсолютних шляхів чи `..` у записах.

Дані користувача, налаштування, журнали й робочі бази зберігай у `%APPDATA%` або `%LOCALAPPDATA%`, окремо від папки версії. Стандартна папка нових встановлень Pullora: `C:\Program Files\Pullora\Apps`; звичайний користувач не повинен записувати дані в неї під час роботи програми. Перевір, що оновлення та видалення старої версії зберігають дані користувача.

Використовуй сталу папку даних без номера версії, наприклад `%APPDATA%\CpPrice11\MyApp`. Якщо нова версія змінює формат даних, перед міграцією збережи резервну копію й окремо перевір повернення до попередньої версії.

Для однієї керованої portable-копії обери один механізм оновлення. Якщо власний updater програми самостійно замінить файли в зареєстрованій папці, номер версії в Pullora може залишитися попереднім. Лаунчер не визначає новий номер версії з довільного зміненого EXE.

## Setup/MSI та виявлення встановленої програми

Інсталятор має залишати робочий основний EXE, стабільну назву продукту й коректні відомості Windows Uninstall: `DisplayName`, `DisplayVersion`, `Publisher`, `InstallLocation`, `DisplayIcon`. Для власних програм використовуй узгодженого видавця `CpPrice11`.

Pullora запускає інсталятори у звичайному режимі. Вона не підставляє довільні silent-параметри й не гарантує встановлення стороннього setup у папку керованих portable-програм. Перевір фактичний шлях запуску після завершення інсталятора.

Окреме підключення вже встановленої програми зараз обмежене нативним каталогом Steam Achievement Manager, Fandom Wiki Translator та RecycleDesk. Для нового продукту потрібно додати відповідність назви продукту, репозиторію й основного EXE в [storage/discovery.rs](../src-tauri/src/storage/discovery.rs) та перевірити її. Самих полів реєстру для цієї функції недостатньо.

## SHA-256 та резервний режим

Створи `SHA256SUMS.txt` **після остаточної збірки пакета**. Якщо інсталятор підписується або перепаковується, обчислюй суму після цих операцій. Прикріпи цей файл як release asset поруч із пакетами. Файл у гілці `main` або в `pullora-assets` для цього не використовується.

Формат кожного рядка:

```text
<SHA-256 із 64 hex-символів>  <точна-назва-файла.exe>
```

Це схема формату, а не готова сума. Справжні значення генеруй із файлів. Рекомендоване кодування: UTF-8. Назва після хешу має збігатися з release asset, включно з регістром; не додавай префікс папки чи URL.

Звичайний шлях отримує метадані релізу та GitHub SHA-256 digest через API; за відсутності digest може використати опубліковані суми. При обмеженні API резервний шлях визначає останній реліз через `releases/latest` і читає файл сум із конкретного тега. У резервному режимі пропонуються тільки пакети з коректною SHA-256. Файл суми не є цифровим підписом видавця Windows.

Резервний режим також розуміє `SHA256SUMS` і `checksums.sha256`; стандарт для власних застосунків: **`SHA256SUMS.txt`**. Ліміт файла: 128 KiB, не більше 64 підтриманих Windows-пакетів. Конфліктні суми одного файла, некоректний хеш або недопустимі імена зупиняють цей шлях. Окремий `App.exe.sha256` може використовуватися звичайним шляхом, але не замінює загальний список для резервного.

## Приклад кроків GitHub Actions

Це фрагмент для **наявного Windows job після збірки**, не повний workflow. До початку цих кроків має бути виконаний checkout репозиторію, тег `vX.Y.Z` має існувати на GitHub, а каталог `release/` має містити тільки готові Windows EXE/MSI/ZIP поточної версії. Власну команду збірки застосунку додай перед фрагментом. У середовищі потрібен GitHub CLI. На рівні workflow або job задай дозвіл:

```yaml
permissions:
  contents: write
```

Після збірки додай такі `steps`:

```yaml
- name: Generate package checksums
  shell: pwsh
  run: |
    $ErrorActionPreference = 'Stop'
    $directory = Join-Path $env:GITHUB_WORKSPACE 'release'
    $packages = @(Get-ChildItem -LiteralPath $directory -File |
      Where-Object { $_.Extension -in '.exe', '.msi', '.zip' } |
      Sort-Object Name)
    if ($packages.Count -eq 0) { throw 'No Windows packages in release/' }

    $lines = @($packages | ForEach-Object {
      if ($_.Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
        throw "Unsupported asset name: $($_.Name)"
      }
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
      '{0}  {1}' -f $hash.ToLowerInvariant(), $_.Name
    })
    [IO.File]::WriteAllLines(
      (Join-Path $directory 'SHA256SUMS.txt'),
      [string[]]$lines,
      [Text.UTF8Encoding]::new($false))

- name: Publish stable packages and checksums
  shell: pwsh
  env:
    GH_TOKEN: ${{ github.token }}
    GH_REPO: ${{ github.repository }}
  run: |
    $ErrorActionPreference = 'Stop'
    $tag = $env:GITHUB_REF_NAME
    if ($tag -cnotmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') {
      throw 'This example publishes stable vX.Y.Z tags only'
    }
    $directory = Join-Path $env:GITHUB_WORKSPACE 'release'
    $assets = @(Get-ChildItem -LiteralPath $directory -File |
      Where-Object { $_.Extension -in '.exe', '.msi', '.zip' } |
      Select-Object -ExpandProperty FullName)
    $assets += Join-Path $directory 'SHA256SUMS.txt'

    gh release create $tag @assets --verify-tag --draft --title $tag --generate-notes
    if ($LASTEXITCODE -ne 0) { throw 'Release upload failed; stop before publishing' }
    gh release edit $tag --draft=false --latest
    if ($LASTEXITCODE -ne 0) { throw 'Release publication failed' }
```

Спочатку створюється draft і завантажуються файли. Після успішного завершення завантаження реліз публікується як Latest. Якщо реліз для цього тега вже існує, приклад зупиниться; він не замінює файли старого релізу. Для змінених пакетів випускай нову версію. Релізи RC/beta оформлюй як prerelease в окремому процесі.

Якщо застосунок має власний updater, додай до публікації також потрібні йому метадані та підписи. Для **оновлення самої встановленої Pullora** потрібні `latest.json` і `.sig`, як описано в [RELEASE_PROCESS.md](RELEASE_PROCESS.md). Це окремий контракт; іншим програмам ці файли для роботи через Pullora не потрібні. Усі приватні ключі залишаються в GitHub Secrets або іншому призначеному сховищі секретів.

## Перевірка перед випуском

- Версії в тегу, пакетах і застосунку збігаються; stable реліз опублікований і є Latest.
- Є повний пакет правильної архітектури та формат для користувачів попередньої версії.
- Пакети запускаються на чистій Windows; ZIP містить усі залежності й один основний EXE в корені.
- SHA-256 обчислені після всіх змін файлів; завантажені з GitHub копії дають ті самі суми.
- `releases/latest` веде на потрібний тег, а `releases/latest/download/SHA256SUMS.txt` повертає саме файл сум.
- Чисте встановлення, оновлення попередньої версії та повторний запуск зберігають дані користувача.
- Під час роботи програми Pullora блокує її заміну; після закриття оновлення продовжується за явною дією.
- Встановлення в Program Files і відмова UAC перевірені окремо; захист Windows не вимикається.

Перевірку проведи спочатку в тестовій папці або віртуальній машині. Зміна публічного релізу та реальне встановлення не виконуються самим додаванням цієї інструкції.

## English summary

Publish a public stable GitHub Release with a consistent `vX.Y.Z` tag, a complete Windows package and `SHA256SUMS.txt` attached to the same release. Use ASCII asset names with an explicit CPU architecture. Prefer one unambiguous portable package; retain the installed package format across updates. ZIPs must include all runtime files and one main EXE at the root. Keep user data outside the installation/version directory.

The API fallback requires a published checksum manifest, validates the latest release's repository and tag, and offers only packages bound to SHA-256 entries. It does not invent missing sizes, dates or release notes. Setup/MSI keeps its normal installer prompts. Existing-install discovery is currently restricted to three explicitly mapped products. These local launcher changes have not shipped in `v5.22.1`.

## Джерела й реалізація

- [GitHub: посилання на релізи](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases).
- [GitHub CLI: release create](https://cli.github.com/manual/gh_release_create) та [release edit](https://cli.github.com/manual/gh_release_edit).
- [Вибір формату й архітектури](../src-tauri/src/storage/installation_policy.rs), [класифікація пакетів](../src-tauri/src/github/assets.rs).
- [Резервне отримання релізу](../src-tauri/src/github/public_release.rs), [перевірка SHA-256](../src-tauri/src/download/checksum.rs).
- [Розпакування, запуск інсталятора та пошук EXE](../src-tauri/src/download/manager.rs).
- [Типові іконки та скриншоти](https://github.com/CpPrice11/pullora-assets#readme) зберігаються окремо від релізних пакетів.
