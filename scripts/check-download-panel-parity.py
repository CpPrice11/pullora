from __future__ import annotations

import runpy
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE = runpy.run_path(str(ROOT / "scripts" / "capture-visual-baseline.py"))
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")


def check_source_contract() -> None:
    source = (ROOT / "src/components/Install/Install.css").read_text(encoding="utf-8")
    assert ".sam-shell" not in source
    for selector in (
        ".cinematic-shell .download-panel",
        ".cinematic-shell .download-item",
        ".cinematic-shell .download-step.current",
        ".cinematic-shell .download-recovery",
        ":root[data-theme='light'] .cinematic-shell .download-panel",
    ):
        assert selector in source, {"missingDownloadSelector": selector}
    print("[download-panel-parity] source contract: ok")


def mount_fixture(page: Page) -> None:
    page.locator(".layout").evaluate(
        """layout => {
          const host = document.createElement('section')
          host.className = 'download-panel-parity-fixture'
          host.style.cssText = 'position:fixed;right:24px;top:92px;bottom:24px;width:min(760px,calc(100vw - 48px));overflow:auto;z-index:20'
          host.innerHTML = `
            <section class="download-panel" aria-busy="true">
              <div class="download-panel-head"><h3 class="download-panel-title">Завантаження</h3><span class="download-panel-count">3</span></div>
              <div class="download-list">
                <article class="download-item download-item--downloading">
                  <div class="download-stage-mark" aria-hidden="true"><span>1</span></div>
                  <div class="download-header"><div class="download-title-block"><span class="download-status">Завантаження</span><span class="download-name">Pullora_active_portable_x64.exe</span></div><button class="cancel-btn" type="button">Скасувати</button></div>
                  <p class="download-stage-note">Отримання файлу з GitHub.</p>
                  <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:42%"></div></div>
                  <div class="download-timeline"><span class="download-step done">Файл</span><span class="download-step current">Перевірка</span><span class="download-step">Готово</span></div>
                  <div class="download-meta"><span>42 МБ</span><span class="download-pct">42%</span></div>
                </article>
                <article class="download-item download-item--completed">
                  <div class="download-stage-mark" aria-hidden="true"><span>2</span></div>
                  <div class="download-header"><div class="download-title-block"><span class="download-status">Завершено</span><span class="download-name">Pullora_ready_portable_x64.exe</span></div></div>
                  <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:100%"></div></div>
                  <div class="download-actions"><button class="download-action-btn primary" type="button">Запустити</button><button class="download-action-btn" type="button">Папка</button></div>
                </article>
                <article class="download-item download-item--failed">
                  <div class="download-stage-mark" aria-hidden="true"><span>3</span></div>
                  <div class="download-header"><div class="download-title-block"><span class="download-status">Помилка</span><span class="download-name">Pullora_failed_portable_x64.exe</span></div></div>
                  <div class="download-recovery" role="alert"><strong>Не вдалося завершити встановлення</strong><p>Повторіть спробу або виберіть інший файл.</p><ul class="download-recovery-steps"><li>Перевірте з’єднання</li></ul><div class="download-actions"><button class="download-action-btn primary" type="button">Повторити</button></div></div>
                </article>
              </div>
            </section>`
          layout.appendChild(host)
        }"""
    )


def state(page: Page) -> dict:
    return page.evaluate(
        """() => {
          const read = selector => {
            const element = document.querySelector(`.download-panel-parity-fixture ${selector}`)
            const style = getComputedStyle(element)
            const box = element.getBoundingClientRect()
            return {
              background: style.background,
              borderColor: style.borderColor,
              borderRadius: style.borderRadius,
              boxShadow: style.boxShadow,
              color: style.color,
              box: [box.x, box.y, box.width, box.height].map(value => Math.round(value)),
            }
          }
          return {
            shell: document.querySelector('.layout')?.className,
            panel: read('.download-panel'),
            active: read('.download-item--downloading'),
            completed: read('.download-item--completed'),
            failed: read('.download-item--failed'),
            recovery: read('.download-recovery'),
            stage: read('.download-stage-mark'),
            progress: read('.progress-bar-fill'),
            action: read('.download-action-btn.primary'),
          }
        }"""
    )


def main() -> None:
    check_source_contract()
    results: dict[tuple[int, int], dict] = {}
    checks = 0
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in THEMES:
            for width, height in VIEWPORTS:
                context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=theme, locale="uk-UA")
                page = context.new_page()
                BASELINE["seed_cache"](page)
                BASELINE["open_library"](page)
                mount_fixture(page)
                current = state(page)
                assert "cinematic-shell" in current["shell"] and "sam-shell" not in current["shell"], current
                assert current["recovery"]["borderColor"] != current["failed"]["borderColor"], current
                assert page.locator(".download-panel-parity-fixture .download-item--completed").count() == 1
                assert page.locator(".download-panel-parity-fixture .download-item--failed").count() == 1
                assert current["progress"]["background"] != "rgba(0, 0, 0, 0)", current
                for key in ("panel", "active", "completed", "failed", "recovery"):
                    x, y, item_width, item_height = current[key]["box"]
                    assert x >= 0 and y >= 0 and x + item_width <= width + 1 and item_height > 0, current

                action = page.locator(".download-panel-parity-fixture .download-action-btn.primary").first
                action.focus()
                page.keyboard.press("Tab")
                page.keyboard.press("Shift+Tab")
                focus = action.evaluate(
                    "el => { const style = getComputedStyle(el); return { visible: el.matches(':focus-visible'), width: parseFloat(style.outlineWidth), style: style.outlineStyle } }"
                )
                assert focus["visible"] and focus["style"] != "none" and focus["width"] >= 2, focus

                geometry = {key: current[key]["box"] for key in ("panel", "active", "completed", "failed", "recovery", "stage", "progress", "action")}
                if theme == "dark":
                    results[(width, height)] = geometry
                else:
                    assert geometry == results[(width, height)], {
                        "viewport": [width, height],
                        "dark": results[(width, height)],
                        "light": geometry,
                    }
                checks += 1
                context.close()
        browser.close()
    print(f"[download-panel-parity] checks={checks}: ok")


if __name__ == "__main__":
    main()
