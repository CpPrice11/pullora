# Design Roadmap Air Launcher

## Напрям

Air Launcher має бути простим, швидким і не перевантаженим лаунчером із власною візуальною ідентичністю: Steam-style compact library, живий project-art фон і гнучкий Theme Editor для користувачів, які хочуть налаштовувати інтерфейс під себе.

Принципи дизайну:

- Головний екран показує тільки те, що допомагає знайти, встановити, оновити або запустити програму.
- Технічні деталі ховаються в деталях програми, drawer або налаштуваннях.
- Дефолтний дизайн має бути красивим без ручного налаштування.
- Гнучка кастомізація не повинна ускладнювати базовий UX.
- Українська і англійська мають однаково добре виглядати в інтерфейсі.
- Desktop-first, але без поломок на вузькому viewport.

## v3.0.4 - Design System Base

Готовий обсяг:

- Steam-style базова палітра.
- Окрема вкладка `Вигляд` у налаштуваннях.
- Пресети інтерфейсу: Steam Dark, Steam Light, Midnight Glass, Custom.
- Налаштування кольорів, шрифту, розміру, radius, density.
- Custom CSS поверх теми.
- Persist appearance settings у config.

## v3.1.0 - Simple Library

Мета: зробити головний екран чистішим і швидшим для щоденного використання.

Перший slice після v3.0.4:

- Картки Library ущільнені: менше висота, відступи, метадані й опис.
- На картці лишився один primary action.
- Другорядні дії перенесені в `...`, щоб список не виглядав перевантаженим.

- Переробити картки застосунків у компактніший формат.
- Залишити на картці тільки основні дії: Запустити, Встановити, Оновити.
- Другорядні дії перенести в `...` або деталі.
- Візуально розділити статуси: встановлено, доступно, оновлення, помилка.
- Зробити search/filter панель меншою і стабільною по висоті.
- Додати hover/selected state з project-art preview.
- Перевірити читабельність на 1280x720.

## v3.2.0 - Project Details Drawer

Мета: прибрати перевантаження з карток і перенести деталі в окрему панель.

- Правий drawer для деталей застосунку.
- Версії, assets, GitHub metadata і uninstall дії всередині drawer.
- Чіткий primary action залежно від стану: Install, Launch, Update.
- Вкладки або секції: Overview, Versions, Files, Advanced.
- Підтвердження небезпечних дій без `window.confirm`.
- Анімація відкриття без втрати продуктивності.

## v3.3.0 - Air Identity

Мета: додати власну ізюминку, не перевантажуючи UI.

- Живий фон від вибраного або hovered проєкту.
- М'який blur/overlay для читабельності.
- Fallback gradient, якщо project art відсутній.
- Колірний accent від мови/теми/іконки проєкту.
- Плавні переходи між фонами.
- Налаштування сили blur, затемнення і видимості фону.

## v3.4.0 - Theme Editor Pro

Мета: довести кастомізацію до рівня Fandom Translator, але простіше для звичайного користувача.

- Export/import теми в JSON.
- Reset окремо для теми, не всіх налаштувань.
- Live preview без закриття налаштувань.
- Більше пресетів: Minimal Black, OLED, Classic Blue, Soft Light.
- Окремі налаштування: card opacity, background blur, sidebar width.
- Валідація custom CSS або safe warning при помилках.
- Кнопка `Скопіювати CSS змінні`.

## v3.5.0 - Responsive Polish

Мета: зробити інтерфейс зручним на різних розмірах вікна.

- Компактний layout для вузького viewport.
- Sidebar переходить у icon-only режим.
- Drawer адаптується до modal/fullscreen на малих екранах.
- Картки не ламаються при довгих назвах.
- Перевірка 1000x700, 1280x720, 1920x1080.
- Покращення keyboard focus states.

## v3.6.0 - Motion & Feedback

Мета: зробити інтерфейс живішим, але без зайвої анімації.

- Єдина система motion tokens.
- Toast notifications у стабільному стилі.
- Skeleton loading для бібліотеки, деталей і версій.
- Мікроанімації для install/update/launch.
- Reduced motion support.
- Чіткі empty/error/offline стани.

## v4.0.0 - Design Stabilization

Мета: стабільний дизайн-реліз після перевірки всіх основних сценаріїв.

- Повна ревізія всіх сторінок під єдиний design system.
- Прибрати застарілі Fluent-style залишки, якщо вони конфліктують зі Steam/Air identity.
- Уніфікувати buttons, inputs, cards, modals, drawers.
- QA dark/light/custom themes.
- QA українська/англійська.
- QA без project art і з project art.
- Документувати правила дизайну для майбутніх змін.

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
