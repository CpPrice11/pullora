import './PageStyles.css'

function AboutPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Про застосунок</h2>
          <p className="page-subtitle">
            Air Launcher допомагає встановлювати й запускати програми з публічних GitHub Releases.
          </p>
        </div>
      </div>

      <div className="about-grid">
        <section className="about-panel">
          <h3>Що це</h3>
          <p>
            Легкий десктопний лаунчер для твоїх публічних репозиторіїв GitHub.
            Він показує проєкти з релізами, завантажує файли релізу, встановлює
            їх локально і запускає активну версію.
          </p>
        </section>

        <section className="about-panel">
          <h3>Принципи</h3>
          <ul>
            <li>Працюємо тільки з публічними репозиторіями налаштованого власника.</li>
            <li>Пріоритет для portable ZIP, потім EXE або MSI.</li>
            <li>Build-файли не зберігаються в Git-проєкті.</li>
            <li>Установка має бути безпечною: partial-директорії, відкат і локальні логи.</li>
          </ul>
        </section>

        <section className="about-panel">
          <h3>Версія</h3>
          <dl className="about-facts">
            <div>
              <dt>Застосунок</dt>
              <dd>Air Launcher</dd>
            </div>
            <div>
              <dt>Версія</dt>
              <dd>0.1.0</dd>
            </div>
            <div>
              <dt>Стек</dt>
              <dd>Tauri, Rust, React, TypeScript</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}

export default AboutPage
