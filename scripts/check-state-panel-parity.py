from __future__ import annotations

import runpy
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE = runpy.run_path(str(ROOT / "scripts" / "capture-visual-baseline.py"))
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")


def check_source_contract() -> None:
    source = (ROOT / "src/components/State/StatePanel.css").read_text(encoding="utf-8")
    assert ".sam-shell" not in source
    for selector in (
        ".cinematic-shell .state-panel",
        ".cinematic-shell .state-panel--error",
        ".cinematic-shell .state-skeleton-card",
        ":root[data-theme='light'] .cinematic-shell .state-panel",
    ):
        assert selector in source, {"missingStatePanelSelector": selector}
    print("[state-panel-parity] source contract: ok")


def mount_fixture(page: Page) -> None:
    page.locator(".layout").evaluate(
        """layout => {
          const host = document.createElement('section')
          host.className = 'state-panel-parity-fixture'
          host.style.cssText = 'position:fixed;right:24px;top:92px;bottom:24px;width:min(620px,calc(100vw - 48px));display:grid;align-content:start;gap:12px;overflow:auto;z-index:20'
          host.innerHTML = `
            <div class="state-panel state-panel--empty" role="status">
              <div class="state-panel-mark" aria-hidden="true"><span></span></div>
              <div class="state-panel-content"><h3>Нічого не знайдено</h3><p>Змініть фільтр або пошуковий запит.</p></div>
              <button class="secondary-btn state-panel-action" type="button">Скинути</button>
            </div>
            <div class="state-panel state-panel--error" role="alert">
              <div class="state-panel-mark" aria-hidden="true"><span>!</span></div>
              <div class="state-panel-content"><h3>Не вдалося завантажити</h3><p>Спробуйте ще раз.</p></div>
              <button class="secondary-btn state-panel-action" type="button">Повторити</button>
            </div>
            <div class="state-panel state-panel--loading" role="status" aria-busy="true">
              <div class="state-skeleton-card"><span class="state-skeleton-icon"></span><span class="state-skeleton-line state-skeleton-line--wide"></span><span class="state-skeleton-line"></span><span class="state-skeleton-action"></span></div>
              <div class="state-skeleton-card"><span class="state-skeleton-icon"></span><span class="state-skeleton-line state-skeleton-line--wide"></span><span class="state-skeleton-line"></span><span class="state-skeleton-action"></span></div>
            </div>`
          layout.appendChild(host)
        }"""
    )


def state(page: Page) -> dict:
    return page.evaluate(
        """() => {
          const read = selector => {
            const element = document.querySelector(selector)
            const style = getComputedStyle(element)
            const box = element.getBoundingClientRect()
            return {
              background: style.background,
              borderColor: style.borderColor,
              borderRadius: style.borderRadius,
              borderLeftWidth: style.borderLeftWidth,
              boxShadow: style.boxShadow,
              color: style.color,
              box: [box.x, box.y, box.width, box.height].map(value => Math.round(value)),
            }
          }
          return {
            shell: document.querySelector('.layout')?.className,
            empty: read('.state-panel-parity-fixture .state-panel--empty'),
            error: read('.state-panel-parity-fixture .state-panel--error'),
            loading: read('.state-panel-parity-fixture .state-panel--loading'),
            mark: read('.state-panel-parity-fixture .state-panel--empty .state-panel-mark'),
            skeleton: read('.state-panel-parity-fixture .state-skeleton-card'),
            action: read('.state-panel-parity-fixture .state-panel-action'),
          }
        }"""
    )


def main() -> None:
    check_source_contract()
    results: dict[tuple[int, int], dict[str, dict]] = {}
    checks = 0
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in THEMES:
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme=theme,
                    locale="uk-UA",
                )
                page = context.new_page()
                BASELINE["seed_cache"](page)
                BASELINE["open_library"](page)
                mount_fixture(page)
                current = state(page)
                assert "cinematic-shell" in current["shell"] and "sam-shell" not in current["shell"], current
                assert current["error"]["borderLeftWidth"] == "4px", current
                assert current["skeleton"]["background"] != "rgba(0, 0, 0, 0)", current
                for key in ("empty", "error", "skeleton"):
                    x, y, item_width, item_height = current[key]["box"]
                    assert x >= 0 and y >= 0 and x + item_width <= width + 1 and item_height > 0, current

                action = page.locator(".state-panel-parity-fixture .state-panel-action").first
                action.focus()
                page.keyboard.press("Tab")
                page.keyboard.press("Shift+Tab")
                focus = action.evaluate(
                    "el => { const style = getComputedStyle(el); return { visible: el.matches(':focus-visible'), width: parseFloat(style.outlineWidth), style: style.outlineStyle } }"
                )
                assert focus["visible"] and focus["style"] != "none" and focus["width"] >= 2, focus

                geometry = {key: current[key]["box"] for key in ("empty", "error", "loading", "mark", "skeleton", "action")}
                if theme == "dark":
                    results[(width, height)] = {"geometry": geometry, "styles": current}
                else:
                    assert geometry == results[(width, height)]["geometry"], {
                        "viewport": [width, height],
                        "dark": results[(width, height)]["geometry"],
                        "light": geometry,
                    }
                checks += 1
                context.close()
        browser.close()
    print(f"[state-panel-parity] checks={checks}: ok")


if __name__ == "__main__":
    main()
