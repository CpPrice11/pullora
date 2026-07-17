from __future__ import annotations

import runpy
from pathlib import Path

from playwright.sync_api import sync_playwright


baseline = runpy.run_path("scripts/capture-visual-baseline.py")
seed_cache = baseline["seed_cache"]
open_library = baseline["open_library"]
OUTPUT_DIR = Path("docs/visual-baseline/design-contract")
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")


def assert_native_select(select) -> None:
    assert select.evaluate("el => el.tagName === 'SELECT'")
    assert select.evaluate("el => el.labels?.length === 1")
    select.focus()
    assert select.evaluate("el => el === document.activeElement")
    assert select.evaluate("el => el.matches(':focus-visible')")


def option_values(select) -> list[str]:
    return select.locator("option").evaluate_all("options => options.map(option => option.value)")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for theme in THEMES:
        for width, height in VIEWPORTS:
            context = browser.new_context(
                viewport={"width": width, "height": height},
                color_scheme=theme,
                locale="uk-UA",
            )
            page = context.new_page()
            seed_cache(page)
            open_library(page)
            suffix = f"{theme}-{width}x{height}"

            sort_select = page.locator(".library-sort-control select")
            assert_native_select(sort_select)
            initial_sort = sort_select.input_value()
            sort_select.press("End" if initial_sort != "updated" else "Home")
            assert sort_select.input_value() != initial_sort
            sort_select.select_option(initial_sort)
            sort_select.focus()
            sort_select.press("Alt+ArrowDown")
            page.screenshot(path=OUTPUT_DIR / f"library-select-native-open-{suffix}.png")
            page.keyboard.press("Escape")
            assert sort_select.evaluate("el => el === document.activeElement")

            filter_buttons = page.locator(".library-sidebar-filter-nav .library-sidebar-nav-btn")
            assert filter_buttons.count() == 4
            filter_buttons.nth(1).click()
            assert filter_buttons.nth(1).get_attribute("aria-pressed") == "true"
            filter_buttons.first.click()
            assert filter_buttons.first.get_attribute("aria-pressed") == "true"

            search = page.locator("#library-search")
            search.fill("fandom")
            page.locator(".repo-card:visible").first.wait_for()
            assert page.locator(".repo-card:visible").count() == 1
            search.fill("")
            page.wait_for_function("document.querySelectorAll('.repo-card').length >= 2")

            density_buttons = page.locator(".library-density-toggle button")
            assert density_buttons.count() == 2
            density_buttons.nth(1).click()
            page.locator(".library-page.library-density-compact").wait_for()
            assert density_buttons.nth(1).get_attribute("aria-pressed") == "true"
            density_buttons.first.click()
            page.locator(".library-page.library-density-normal").wait_for()
            assert density_buttons.first.get_attribute("aria-pressed") == "true"

            page.get_by_role("button", name="Налаштування").click()
            page.get_by_role("heading", name="Налаштування").wait_for()

            theme_select = page.locator("#theme")
            language_select = page.locator("#language")
            assert_native_select(theme_select)
            assert_native_select(language_select)
            assert option_values(theme_select) == ["light", "dark", "auto"]
            assert option_values(language_select) == ["uk", "en"]

            theme_select.focus()
            theme_select.press("Alt+ArrowDown")
            page.screenshot(path=OUTPUT_DIR / f"settings-select-native-open-{suffix}.png")
            page.keyboard.press("Escape")
            assert theme_select.evaluate("el => el === document.activeElement")

            page.get_by_role("button", name="Оновлення").click()
            asset_select = page.locator("#assetStrategy")
            assert_native_select(asset_select)
            assert option_values(asset_select) == ["portableFirst", "installerFirst", "manual"]

            context.close()

    browser.close()

print("[selects] native semantics, labels, keyboard, focus, values and visual matrix: ok")
