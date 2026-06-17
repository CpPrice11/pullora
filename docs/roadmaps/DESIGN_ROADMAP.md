# Design Roadmap Pullora

## Напрям

Pullora має бути простим, швидким і не перевантаженим лаунчером із власною візуальною ідентичністю: GitHub-style compact library, живий project-art фон і гнучкий Theme Editor для користувачів, які хочуть налаштовувати інтерфейс під себе.

Принципи дизайну:

- Головний екран показує тільки те, що допомагає знайти, встановити, оновити або запустити програму.
- Технічні деталі ховаються в деталях програми, drawer або налаштуваннях.
- Дефолтний дизайн має бути красивим без ручного налаштування.
- Гнучка кастомізація не повинна ускладнювати базовий UX.
- Українська і англійська мають однаково добре виглядати в інтерфейсі.
- Desktop-first, але без поломок на вузькому viewport.

## v3.0.4 - Design System Base

Готовий обсяг:

- GitHub-style базова палітра.
- Окрема вкладка `Вигляд` у налаштуваннях.
- Пресети інтерфейсу: GitHub Dark, GitHub Light, Midnight Glass, Custom.
- Налаштування кольорів, шрифту, розміру, radius, density.
- Custom CSS поверх теми.
- Persist appearance settings у config.

## v3.1.0 - Simple Library [Closed]

Мета: зробити головний екран чистішим і швидшим для щоденного використання.

Перший slice після v3.0.4:

- Картки Library ущільнені: менше висота, відступи, метадані й опис.
- На картці лишився один primary action.
- Другорядні дії перенесені в `...`, щоб список не виглядав перевантаженим.

Другий slice після v3.0.5:

- Search/filter/sort зібрані в один компактний Library toolstrip.
- Поле пошуку, фільтри і sort вирівняні по висоті, з акуратним responsive fallback.

Третій slice після v3.1.0:

- Library trust/status panel має чіткіший статусний маркер і менше прихованих recovery дій.
- Empty/no-owner/no-match стани стали більш actionable без додаткового UI-шуму.

Четвертий slice після v3.1.0:

- Hover/focus на картці тепер підсвічує project-art preview у hero без додаткового кліку.
- Статуси карток отримали тонкий rail, щоб installed/update/available читались швидше на 1280x720.

Фінальний closing patch:

- Simple Library scope закрито: cards, primary actions, secondary menu, compact toolstrip, actionable states, hover/selected preview і status rail готові.
- Залишкова перевірка перед релізом: 1280x720, українська/англійська, dark/light/custom appearance.

## v3.2.0 - Project Details Drawer [Closed]

Мета: прибрати перевантаження з карток і перенести деталі в окрему панель.

Спільний v3.2.0 patch:

- App Details перетворено на right-side drawer-style surface.
- Overview, paths, release notes і versions згруповані як компактні секції без повернення деталей на картку.
- Primary/secondary actions лишаються у details panel, dangerous дії мають existing confirmation modals.
- Залишковий QA: 1000x700, 1280x720, long names/paths, keyboard close/focus.

## v3.3.0 - Air Identity [Closed]

Мета: додати власну ізюминку, не перевантажуючи UI.

- Живий фон від вибраного або hovered проєкту.
- М'який blur/overlay для читабельності.
- Fallback gradient, якщо project art відсутній.
- Колірний accent від мови/теми/іконки проєкту.
- Плавні переходи між фонами.
- Налаштування сили blur, затемнення і видимості фону.

Спільний v3.3.0 patch:

- Library тепер передає project-art background активного/hovered hero проєкту в головний cinematic фон.
- Якщо background відсутній, використовується cover як м'який project-art fallback; якщо project art немає, лишається базовий Air gradient.
- Існуючі blur/overlay/transition шари Layout працюють і для живого Library preview, зберігаючи читабельність UI.
- Розширені налаштування blur/dim/background visibility лишаються для Theme Editor Pro, щоб не перевантажувати базовий v3.3.0 UI.
- Залишковий QA: без project art, cover-only art, custom launcher background, dark/light/custom appearance.

## v3.4.0 - Theme Editor Pro [Closed]

Мета: довести кастомізацію до рівня Fandom Translator, але простіше для звичайного користувача.

- Export/import теми в JSON.
- Reset окремо для теми, не всіх налаштувань.
- Live preview без закриття налаштувань.
- Більше пресетів: Minimal Black, OLED, Classic Blue, Soft Light.
- Окремі налаштування: card opacity, background blur, sidebar width.
- Валідація custom CSS або safe warning при помилках.
- Кнопка `Скопіювати CSS змінні`.

Спільний v3.4.0 patch:

- Appearance отримав Theme Editor Pro actions: export JSON, import JSON, reset only theme, copy CSS variables.
- Theme import нормалізує palette/font/radius/density і не змінює Library owner, install path або update preferences.
- CSS variable export генерується з тих самих values, які застосовуються live theme engine.
- Existing presets/colors/custom CSS лишаються в одному компактному Appearance flow.
- Залишковий QA: export/import invalid JSON, reset theme, copy CSS variables, custom CSS.

## v3.5.0 - Responsive Polish [Closed]

Мета: зробити інтерфейс зручним на різних розмірах вікна.

- Компактний layout для вузького viewport.
- Sidebar переходить у icon-only режим.
- Drawer адаптується до modal/fullscreen на малих екранах.
- Картки не ламаються при довгих назвах.
- Перевірка 1000x700, 1280x720, 1920x1080.
- Покращення keyboard focus states.

Фінальний roadmap-closing patch:

- Settings owner/source cards, Theme Editor actions і Maintenance diagnostics отримали responsive card styling.
- Додано глобальний `:focus-visible` style для keyboard navigation.
- Existing sidebar/layout responsive rules збережені; додаткові card/input styles не ламають 1000x700 flow.
- Залишковий QA: 1000x700, 1280x720, 1920x1080, keyboard focus.

## v3.6.0 - Motion & Feedback [Closed]

Мета: зробити інтерфейс живішим, але без зайвої анімації.

- Єдина система motion tokens.
- Toast notifications у стабільному стилі.
- Skeleton loading для бібліотеки, деталей і версій.
- Мікроанімації для install/update/launch.
- Reduced motion support.
- Чіткі empty/error/offline стани.

Фінальний roadmap-closing patch:

- Додано global reduced-motion handling через `prefers-reduced-motion`.
- Local AI draft cleanup додає activity feedback entry замість прихованої silent action.
- Existing toast/status/skeleton/error states збережені як єдина feedback система без додаткового visual noise.
- Install/update progress і maintenance actions вже мають explicit status/recovery states після попередніх slices.
- Залишковий QA: reduced motion, toast visibility, loading/error/empty states.

## v4.0.0 - Design Stabilization [Closed]

Мета: стабільний дизайн-реліз після перевірки всіх основних сценаріїв.

- Повна ревізія всіх сторінок під єдиний design system.
- Прибрати застарілі Fluent-style залишки, якщо вони конфліктують зі GitHub/Pullora identity.
- Уніфікувати buttons, inputs, cards, modals, drawers.
- QA dark/light/custom themes.
- QA українська/англійська.
- QA без project art і з project art.
- Документувати правила дизайну для майбутніх змін.

Фінальний roadmap-closing patch:

- Додано `docs/DESIGN_GUIDELINES.md` із правилами GitHub-style compact UI, Pullora identity, focus/reduced-motion і Theme Editor boundaries.
- Appearance, Maintenance і Library surfaces приведені до спільних card/chip/action patterns.
- Project-art фон, custom background, presets і custom CSS лишаються сумісними.
- Roadmap milestones до `v4.0.0` закриті; backlog лишається для future optional enhancements.

## GitHub + Pullora Roadmap

Ціль: довести Pullora до цілісного `GitHub + Pullora` інтерфейсу. GitHub задає структуру, простоту, Library/Settings UX і темну палітру; Pullora задає workstation-щільність, плоскі панелі, тонкі borders, статусні rails і таблиці. Старий cinematic/glass feeling більше не є ціллю.

Поточні проблеми за скрінами:

- Settings все ще виглядає як floating glass/modal поверх застосунку, а не як повноцінний workspace.
- Є змішання мов у visible labels: `SOURCE SUMMARY`, `FAVORITE`, `ACTIVE REPO`, `SOURCE REPO`, `PORTABLE + SETUP`, `WINDOWS ONLY` поруч з українським UI.
- Частина Settings контенту обрізається або ховається в незручному scroll, особливо `Вигляд` і `Обслуговування`.
- Ліва навігація Settings займає багато місця, а права content-area місцями виглядає порожньою або стиснутою.
- Library стала ближчою до Pullora, але right details panel все ще занадто hero/marketing-oriented; GitHub Library більше схожа на compact app header + action row + facts/status grid.
- У UI одночасно присутні SAM tables, GitHub colors, старі modal cards, blur/glow і великі rounded panels.
- Checkbox/range/select місцями мають browser/default look і вибиваються з системи.
- На великих екранах лишається зайвий порожній простір, особливо в Library нижче списку.

### v4.5.0 - Settings GitHub/Pullora Redesign

Статус: закрито в межах combined GitHub + Pullora pass для `v5.0.0`; залишкові design-backlog покращення не блокують Store/Base roadmap.

Перший пріоритет: Settings.

- Переробити Settings з floating/glass modal у повноцінний GitHub-like settings workspace.
- Зробити компактну ліву навігацію секцій і широку праву content-area.
- Прибрати надмірні blur, rounding, glow і modal shadows.
- Виправити обрізання контенту в `Вигляд` і `Обслуговування`.
- Зробити нормальний внутрішній scroll тільки для правої content-area.
- Уніфікувати controls: checkbox, range, select, input, buttons.
- Привести labels до української або послідовного technical English.
- Зберегти Theme Editor, install path і maintenance logic без зміни поведінки.

### v4.6.0 - Library GitHub-Like Layout

Статус: закрито в межах combined GitHub + Pullora pass для `v5.0.0`; залишкові layout polish задачі лишаються optional backlog.

- Зменшити hero-feeling у правій details panel.
- Зробити GitHub Library-like structure: compact app header, action row, facts table, status/activity blocks.
- Вирівняти list/details panes по висоті й щільності.
- Прибрати зайвий порожній простір знизу.
- Зробити repo rows ще ближчими до GitHub list: app/source/status/version/actions без перевантаження.
- Перевірити 1000x700, 1280x720, 1920x1080 і narrow fallback.

### v4.7.0 - Visual Token Cleanup

Статус: закрито одним combined patch у `v5.0.0`.

- Перевести основні кольори на GitHub-inspired базу:
  - shell: `#171a21`, `#1b2838`
  - panel: `#16202d`, `#2a475e`
  - active blue: `#66c0f4`
  - muted text: сіро-синій GitHub tone
- Залишити Pullora geometry: flat panels, thin borders, dense tables, square-ish controls.
- Прибрати або ізолювати legacy `cinematic-shell` CSS, який більше не використовується активним shell.
- Уніфікувати buttons, pills, status chips, badges, cards і shared panels.

### v4.8.0 - Modals And Release Flow UI

Статус: закрито одним combined patch у `v5.0.0`.

- Переробити ReleaseSelector у GitHub/Pullora wizard: clear steps, assets table, summary pane.
- Переробити App Details modal або перевести його у side panel, якщо це краще для GitHub-like UX.
- Уніфікувати confirmation dialogs, uninstall/switch version modals.
- Зробити portable/setup/unsupported warnings компактними й зрозумілими.
- Перевірити keyboard focus, Escape close, scroll lock і long file/version names.

### v4.9.0 - Removed Scope

Статус: archived після видалення AI Workspace з активного продукту.

- AI Workspace більше не є частиною design roadmap.
- Нові дизайн-роботи мають фокусуватися на Store, Library, Settings, About і release/install flow.

### v5.0.0 - Cohesive Workstation Release

Статус: фінальний roadmap-closing patch.

- Фінальний pass по Library, Settings, About, modals і shared states.
- Повна language consistency перевірка.
- Повна responsive перевірка desktop/mobile/narrow window.
- Accessibility pass: focus states, keyboard navigation, aria labels, reduced motion.
- Видалити мертвий або неактивний legacy CSS, якщо це безпечно.
- Оновити `docs/DESIGN_GUIDELINES.md` під фінальну GitHub + Pullora систему.

Фінальний combined patch `v5.0.0`:

- Закриває `v4.7.0`, `v4.8.0`, `v4.9.0` і `v5.0.0` одним релізом.
- Вирівнює active dark tokens на GitHub base: `#171a21`, `#1b2838`, `#16202d`, `#2a475e`, `#66c0f4`.
- Ізолює legacy cinematic CSS через active `.sam-shell` overrides замість ризикованого видалення старих блоків.
- Уніфікує release wizard, App Details, confirmations, Updates Center і shared modals у flat SAM geometry.
- Зберігає Windows-only release policy і два assets: portable EXE + setup EXE.

Постійні правила для цих design releases:

- Windows-only.
- GitHub Release має містити тільки portable EXE і setup EXE.
- Linux/Arch напрям не повертати.
- AI Workspace не є активним напрямом Pullora.
- Після кожного release patch: bump version, build/checks, Tauri artifacts, GitHub Release, Actions verification, стислий опис змін українською.

## Backlog

- Card view / list view перемикач.
- Обкладинки застосунків у Library.
- Accent extraction з project art.
- Compact command palette.
- Mini mode для швидкого запуску встановлених програм.
- Theme marketplace/local theme folder.
- Animated background тільки як opt-in.
- High contrast accessibility preset.

## QA Для Design Releases

- `npm run build`
- `cargo check`
- dark/light/auto
- усі appearance presets
- custom CSS увімкнено/порожній/помилковий
- українська й англійська
- 1000x700, 1280x720, 1920x1080
- без project art і з project art
- keyboard navigation
- hover/focus/disabled states
- release artifacts: portable EXE і setup EXE
