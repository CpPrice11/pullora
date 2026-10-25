# Структура проєкту

```text
Pullora/
├── .github/workflows/       GitHub Actions
├── docs/                    документація, релізи й дорожні карти
│   └── reference/artcraft/  дослідження, специфікації та вихідні референси
├── scripts/
│   ├── checks/              перевірки локалізації, кольорів і компонентів
│   ├── ui/                  браузерні тести та засоби створення знімків
│   └── release/             перевірка й підготовка релізних файлів
├── src/                     React/TypeScript: відображення й взаємодія
├── src-tauri/               Rust/Tauri: логіка, Windows-інтеграція та іконки
├── .artifacts/              локальні знімки, порівняння й звіти; поза Git
├── .codex/                  локальна пам’ять і roadmap; поза Git
├── .codex-tools/            локальні інструменти; поза Git
├── dist/                    зібраний frontend; поза Git
└── node_modules/            встановлені залежності; поза Git
```

У корені залишаються README, AGENTS.md і конфігурації, потрібні Vite, npm, TypeScript та Tauri. Нові документи класти в `docs`, перевірки — у відповідну підпапку `scripts`. Згенеровані матеріали перевірок зберігати в `.artifacts`; контракт візуальних перевірок залишається в `docs/visual-baseline`.

Команди з README виконуються з кореня проєкту. `npm run build`, `npm run test:components` і `npm run check:release` використовують актуальні шляхи. Старі кеші Rust у `src-tauri/target*` не входять до Git.
