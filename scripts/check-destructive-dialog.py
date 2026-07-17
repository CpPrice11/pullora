from __future__ import annotations

import runpy
from pathlib import Path

from playwright.sync_api import Locator, sync_playwright


OUTPUT_DIR = Path("docs/visual-baseline/design-contract")
baseline = runpy.run_path("scripts/capture-visual-baseline.py")
seed_cache = baseline["seed_cache"]
open_library = baseline["open_library"]


def open_cleanup_dialog(page) -> tuple[Locator, Locator]:
    more_trigger = page.locator(".library-bulk-menu--more .library-bulk-menu-trigger")
    more_trigger.click()
    menu = page.locator(".library-bulk-menu-portal")
    menu.wait_for()
    cleanup = menu.get_by_role("menuitem").first
    cleanup.evaluate(
        """el => {
          const propsKey = Object.keys(el).find(key => key.startsWith('__reactProps$'))
          const handler = propsKey ? el[propsKey]?.onClick : null
          const trigger = document.querySelector('.library-bulk-menu--more .library-bulk-menu-trigger')
          if (typeof handler !== 'function' || !(trigger instanceof HTMLButtonElement)) throw new Error('Missing test action')
          trigger.focus()
          trigger.click()
          handler()
        }"""
    )
    dialog = page.get_by_role("alertdialog")
    try:
        dialog.wait_for(timeout=3000)
    except Exception as error:
        state = page.locator("body").evaluate(
            "() => ({ dialogs: document.querySelectorAll('[role=alertdialog]').length, menus: document.querySelectorAll('[role=menu]').length, bulk: document.querySelectorAll('.library-bulk-actions').length })"
        )
        raise AssertionError(state) from error
    return more_trigger, dialog


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    for theme in ("dark", "light"):
        width, height = 1000, 700
        context = browser.new_context(
            viewport={"width": width, "height": height},
            color_scheme=theme,
            locale="uk-UA",
        )
        page = context.new_page()
        seed_cache(page)
        open_library(page)

        page.locator(".repo-card:visible").first.click(modifiers=["Control"])
        page.locator(".library-bulk-actions").wait_for()
        more_trigger, dialog = open_cleanup_dialog(page)

        overlay = page.locator(".modal-overlay.uninstall-overlay")
        assert overlay.evaluate("el => el.parentElement?.classList.contains('layout')")
        assert dialog.get_attribute("aria-modal") == "true"
        assert dialog.get_attribute("aria-busy") == "false"

        title_id = dialog.get_attribute("aria-labelledby")
        description_id = dialog.get_attribute("aria-describedby")
        assert title_id and dialog.locator(f'[id="{title_id}"]').inner_text().strip()
        assert description_id and dialog.locator(f'[id="{description_id}"]').inner_text().strip()

        cancel = dialog.get_by_role("button", name="Скасувати")
        danger = dialog.get_by_role("button", name="Очистити", exact=True)
        close = dialog.get_by_role("button", name="Закрити")
        assert cancel.evaluate("el => el === document.activeElement")
        assert close.locator("svg").get_attribute("aria-hidden") == "true"

        cancel.press("Tab")
        assert danger.evaluate("el => el === document.activeElement")
        danger.press("Tab")
        assert close.evaluate("el => el === document.activeElement")
        close.press("Shift+Tab")
        assert danger.evaluate("el => el === document.activeElement")

        box = dialog.bounding_box()
        assert box is not None
        assert box["x"] >= 0 and box["y"] >= 0
        assert box["x"] + box["width"] <= width + 1
        assert box["y"] + box["height"] <= height + 1

        danger_style = danger.evaluate(
            "el => { const style = getComputedStyle(el); return { background: style.backgroundColor, color: style.color } }"
        )
        assert danger_style["color"] == "rgb(255, 255, 255)", danger_style
        assert danger_style["background"] not in ("rgba(0, 0, 0, 0)", "rgb(248, 250, 252)"), danger_style

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=OUTPUT_DIR / f"library-destructive-overlay-{theme}-1000x700.png")

        page.keyboard.press("Escape")
        dialog.wait_for(state="hidden")
        assert more_trigger.evaluate("el => el === document.activeElement")

        more_trigger, dialog = open_cleanup_dialog(page)
        overlay = page.locator(".modal-overlay.uninstall-overlay")
        overlay.click(position={"x": 4, "y": 4})
        dialog.wait_for(state="hidden")
        assert more_trigger.evaluate("el => el === document.activeElement")

        context.close()

    browser.close()

print("[destructive-dialog] portal, semantics, safe focus, trap, close paths and theme states: ok")
