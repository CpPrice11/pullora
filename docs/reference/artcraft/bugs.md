# Відтворені дефекти та межі перевірки

## R02 — результати перевірки

Перший regression виявив, що initial install без сумісного пакета помилково завершувався помилкою до file-picker exception. Повернено попередню поведінку: first install переходить до вибору з disabled несумісними файлами; update без потрібного формату зупиняється. Після виправлення quick-install12 та exception flows PASS.

У новому UI-тесті manual picker спочатку очікував файл на кроці version; додано явний перехід version→file. Тест scan failure спочатку очікував raw synthetic text, який чинний error boundary закономірно локалізував; fixture змінено на errors.discoveryFailed і перевірку українського повідомлення. Ці дві початкові помилки тесту не є доказами дефектів продукту. Остаточний R02 прогін:12appearance/axe та додаткові flows PASS.

Зовнішнє оновлення програми на тому самому EXE-шляху не переписує історію її версій автоматично. Поточний обсяг R02 — існування файлів, нові/видалені інсталяції й збереження типу пакета. Повний native GUI/install/UAC gate залишається відкритим.

## R01 — актуальні докази й обмеження, 2026-10-25

- GitHub cache v1 зберігав releases без нового digest, а HTTP304 міг залишити їх такими. Виправлено міграцією release cache/ETag; owner catalog збережено. Actual-source migration test PASS.
- External version раніше потрапляла б у managed-delete path. Нове `installKind=external` відокремлює володіння: видаляється лише запис бібліотеки; actual-source ownership test зберігає EXE, browser confirmation пояснює це користувачу.
- Full application `cargo check --tests` тепер PASS. Full test binary не запускається: Windows loader 0xc0000139. Це відкритий runtime blocker, не помилка компіляції й не успішний native smoke.
- Початковий guard-тест очікував Update, хоча fixture ще показувала Launch: виправлено тестовий refresh перед натисканням. Початкові PNG мали зайві каталожні fixtures і прокручування після меню; fixture обмежено двома програмами й scroll скинуто перед capture. Ці збої не видаються за дефекти продукту. Остаточні 12 browser cases PASS.

Неперевірені GUI/UAC сценарії нижче залишаються відкритими; 43 виконані core tests не замінюють їх.

## BUG-002: snapshot після старту прибирав отриманий progress

Під час I01 regression bridge спочатку надсилає активну download-progress подію, а потім повертає порожній get_downloads snapshot. Після доданого перечитування стану useDownload замінював увесь список; `batch_cancel` не знаходив progressbar і завершувався timeout. Це відтворений frontend-конфлікт stream/snapshot у контрольованому bridge, не доказ того, що native API повертає порожній список після успішного старту.

Виправлення: snapshot після старту додає відсутні ID, зберігаючи вже отримані events. Актуальний focused lifecycle regression і нова 12-case install matrix PASS. Перший timeout меню версій був від scroll/position synchronization у тесті; після очікування стабільного scroll меню, Escape і focus-return пройшли без продуктової правки.

## BUG-001: після завершення відновленої операції картка залишалася зі старою версією

- Severity: S3, є обхід через ручне оновлення Library.
- Flow / case: F04-E3.
- Screen: S01.
- Build: локальний UI на базі `13cb9c6`, до виправлення `useBatchUpdates`.
- Browser: Microsoft Edge, 1280×720, mocked Tauri events.

Кроки:
1. Відкрити Library з уже активною операцією в `get_downloads`, не створеною поточним екземпляром batch hook.
2. Оновити тестові installed data й надіслати completed через `download-progress`.
3. Перевірити активну версію картки без ручного refresh.

Очікування: картка показує нову встановлену версію.

Факт до виправлення: версія залишалася попередньою; `restored_completion` завершився Timeout 30000ms. Це окремий валідний прогін з `--restored-only`.

Причина: оновлення локального стану запускалося лише після завершення jobs, створених поточним batch hook. Відновлена операція не мала такого запису.

Виправлення: одноразове перечитування installed state для кожного нового completed ID незалежно від того, звідки розпочато операцію. Busy-стан тепер залежить від фактичних активних операцій і запитів старту.

Доказ: `scripts/ui/check-card-operations.py::restored_completion`, поточний regression PASS. Статус: виправлено локально, не випущено.

## Уточнення тестових доказів

Перший тест скасування помилково вибирав Installed замість Updates. Його початковий timeout не є доказом дефекту застосунку. Селектор виправлено; актуальний regression підтвердив, що після скасування Updates більше не busy. У старій логіці знайдено залежність busy від списку jobs, з якого cancel не видаляв ID; її прибрано. Окремий runtime до виправлення для цієї причини не заявляється.

У тесті reduced motion перевіряється відсутність transform серед animated properties. Глобальна політика Pullora залишає 80ms для кольору й opacity; вимагати нульову тривалість усіх властивостей було помилкою тесту. Геометрія progress track стала, а transform у reduced motion змінюється миттєво.

## Неперевірене, не підтверджені bugs

- Нативне відкриття Website, реальний cancel downloader та файловий offline cache: native build заблокований інструментарієм Windows.
- Повний попередній release gate: його старі точні layout-контракти ще не перенесені на погоджену сітку.
- Screen-reader pass та runtime ArtCraft не виконані.

У виконаних frontend-сценаріях відкритих відтворених S1/S2 немає. Це твердження обмежене планом перевірки й не поширюється на неперевірені нативні функції.
