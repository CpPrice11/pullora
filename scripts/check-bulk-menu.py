from __future__ import annotations

import runpy
from pathlib import Path

from playwright.sync_api import Locator, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
OUTPUT_DIR = Path("docs/visual-baseline/design-contract")
baseline = runpy.run_path("scripts/capture-visual-baseline.py")
seed_cache = baseline["seed_cache"]
open_library = baseline["open_library"]


def assert_menu_in_viewport(portal: Locator, width: int, height: int) -> None:
    box = portal.bounding_box()
    assert box is not None
    assert box["x"] >= 0 and box["y"] >= 0, box
    assert box["x"] + box["width"] <= width + 1, box
    assert box["y"] + box["height"] <= height + 1, box


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

        card = page.locator(".repo-card:visible").first
        card.click(modifiers=["Control"])
        toolbar = page.locator(".library-bulk-actions")
        toolbar.wait_for()

        triggers = toolbar.locator(".library-bulk-menu-trigger")
        assert triggers.count() == 3

        for index in range(triggers.count()):
            trigger = triggers.nth(index)
            trigger.click()
            portal = page.locator(".library-bulk-menu-portal")
            portal.wait_for()

            assert portal.evaluate("el => el.parentElement?.classList.contains('layout')")
            assert_menu_in_viewport(portal, width, height)

            enabled_items = portal.locator('[role="menuitem"]:not(:disabled)')
            if enabled_items.count():
                assert enabled_items.first.evaluate("el => el === document.activeElement")
                page.keyboard.press("End")
                assert enabled_items.last.evaluate("el => el === document.activeElement")
            else:
                assert portal.get_by_role("menu").evaluate("el => el === document.activeElement")

            if index == triggers.count() - 1:
                OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=OUTPUT_DIR / f"library-bulk-overflow-{theme}-1000x700.png")

            page.keyboard.press("Escape")
            portal.wait_for(state="hidden")
            assert trigger.evaluate("el => el === document.activeElement")

        context.close()

    browser.close()

print("[bulk-menu] portal, viewport, keyboard, focus restore and icon trigger: ok")
