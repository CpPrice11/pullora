# Visual baseline Pullora

Ця директорія фіксує чинний дизайн-контракт Pullora: композицію `v5.10.1`/`v5.9.0` разом із явно погодженими локальними багфіксами `v5.11.0`. Вона не є дозволом на редизайн.

Знімки генерує `scripts/capture-visual-baseline.py` у headless Chromium із детермінованими тестовими GitHub-даними. Скрипт не запускає Tauri-вікно й не читає користувацьку бібліотеку.

Поточне покриття:

- Library, Settings, About та Install;
- темна й світла теми;
- 1000×700, 1280×720 та 1920×1080;
- normal density зі стандартним фоном;
- Library у compact density;
- власний глобальний фон у Library, Settings, About та Install;
- контекстне меню картки, overflow-меню релізу About, bulk overflow і destructive overlay у відкритому стані;
- перевірка меж viewport, початкового фокуса, `Shift+F10`, `Escape` і повернення фокуса;
- перевірка однакової геометрії sidebar і hero card між темами;
- перевірка синьої primary-кнопки з білим текстом у світлій темі.
- перевірка computed styles світлої теми для primary, disabled, muted-тексту та напівпрозорих поверхонь.
- нативні select-контроли Library і Settings у стані виклику/focus для обох тем і трьох розмірів.

Системний popup нативного `<select>` малюється Chromium/Windows поза DOM і не входить у headless screenshot. Його label, опції, клавіатура, focus-visible, контрольоване значення та закриття через `Escape` перевіряє `scripts/check-select-controls.py`.

Окремі hero-фон і обкладинка перевіряються `scripts/check-library-hero-art-parity.py`: тема не змінює їхню геометрію, а зміна одного виду artwork не підміняє інший або глобальний фон.

## Реєстр parity-доказів v5.11.0

- **Library** — стани карток, normal/compact, шари hero, незалежність artwork, surface-контроли, bulk overflow і destructive dialog.
- **Install** — композиція чотирьох етапів, active-download guard і спільні surface-контроли.
- **Settings** — композиція, навігація, autosave, reset, щільність, фони, повзунки та нативні select-контроли.
- **About** — композиція, product header, фільтри й статуси релізів, меню, portal-діалоги, surface-контроли, фоновий continuity, SHA-256 і rollback.

Фінальний `scripts/check-ui-release.py` послідовно запускає актуальні headless-сценарії Library, Install, Settings і About. Матриця перевіряє геометрію, теми, viewport, accessible names, labels, dialog semantics, focus-visible, відсутність позитивного `tabindex`, горизонтального overflow і підтримку української та англійської.

## Дозволені локальні відмінності від v5.10.1

Ці зміни були явно замовлені та не вважаються редизайном:

- світла primary-кнопка Library має синій фон і білий текст замість чорного по чорному;
- cover, hero-фон і глобальні фони тем розділені; hero/cover мають однакові position і geometry в обох темах;
- sidebar, головна область і панель дії вирівняні без зміни канонічної сітки;
- контекстні, bulk і About overflow-меню виходять через portal, не обрізаються та повертають фокус;
- destructive, release notes і update/rollback діалоги використовують portal, focus trap та спільний фоновий surface-контракт;
- зовнішня висота Install-frame може адаптуватися до sticky header/body scroll-контракту; header більше не зміщується через початковий focus, а його розмір і координати steps/body/actions залишаються еталонними;
- Settings зберігає у фоні без autosave-індикатора й кнопки «Готово», має локальну кнопку «Скинути» для секції «Загальне»;
- прозорість, розмиття, щільність і окремі фони тем застосовуються однаково до Library, Settings, About та Install;
- About отримав поведінкові фільтри, статуси й захист SHA-256/portable/rollback без зміни базової композиції.

Будь-яка інша різниця в геометрії понад 2 px блокує завершення gate-перевірки.
