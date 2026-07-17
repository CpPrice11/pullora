from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "scripts" / "capture-visual-baseline.py"
OUTPUT_DIR = ROOT / "docs" / "visual-baseline" / "design-contract"
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")


def load_baseline():
    spec = importlib.util.spec_from_file_location("pullora_visual_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Не вдалося завантажити visual baseline helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def visual_style(page: Page, selector: str) -> dict:
    return page.locator(selector).first.evaluate(
        """el => {
            const style = getComputedStyle(el)
            return {
                background: style.background,
                borderColor: style.borderColor,
                boxShadow: style.boxShadow,
                color: style.color,
                outlineColor: style.outlineColor,
                outlineStyle: style.outlineStyle,
                outlineWidth: style.outlineWidth,
            }
        }"""
    )


def assert_panel_below_results(page: Page) -> dict:
    results = page.locator(".library-sam-list-pane .search-results")
    panel = page.locator(".library-bulk-actions")
    results_box = results.bounding_box()
    panel_box = panel.bounding_box()
    assert results_box is not None and panel_box is not None
    assert results_box["height"] > 40, {"results": results_box, "panel": panel_box}
    assert results_box["y"] + results_box["height"] <= panel_box["y"] + 1, {
        "results": results_box,
        "panel": panel_box,
    }

    cards = page.locator(".repo-card:visible")
    cards.last.scroll_into_view_if_needed()
    last_box = cards.last.bounding_box()
    assert last_box is not None
    assert last_box["y"] + last_box["height"] <= results_box["y"] + results_box["height"] + 1, {
        "lastCard": last_box,
        "results": results_box,
    }
    return {"results": results_box, "panel": panel_box}


def focus_card_with_keyboard(page: Page):
    page.evaluate("document.activeElement instanceof HTMLElement && document.activeElement.blur()")
    for _ in range(40):
        page.keyboard.press("Tab")
        if page.evaluate("document.activeElement?.matches('.repo-card')"):
            return page.locator(".repo-card:focus")
    raise AssertionError("Клавіатурний фокус не дійшов до картки бібліотеки")


def check_context(page: Page, theme: str, width: int, height: int, baseline) -> dict:
    baseline.seed_cache(page)
    baseline.open_library(page)

    cards = page.locator(".repo-card:visible")
    assert cards.count() >= 2

    active_filter = page.locator(".library-sidebar-filter-nav .library-sidebar-nav-btn.active")
    inactive_filter = page.locator(".library-sidebar-filter-nav .library-sidebar-nav-btn:not(.active)").first
    assert active_filter.get_attribute("aria-pressed") == "true"
    assert visual_style(page, ".library-sidebar-filter-nav .library-sidebar-nav-btn.active") != visual_style(
        page, ".library-sidebar-filter-nav .library-sidebar-nav-btn:not(.active)"
    )

    current = page.locator(".repo-card.selected:visible")
    assert current.count() == 1
    assert current.get_attribute("aria-current") == "true"
    idle_card = page.locator(".repo-card:not(.selected):visible").first
    assert idle_card.get_attribute("aria-current") is None

    selected_style = visual_style(page, ".repo-card.selected:visible")
    idle_style = visual_style(page, ".repo-card:not(.selected):not(.bulk-selected):visible")
    assert selected_style != idle_style, {"selected": selected_style, "idle": idle_style}

    bulk_card = idle_card
    bulk_card.click(modifiers=["Control"])
    assert bulk_card.get_attribute("aria-pressed") == "true"
    assert "bulk-selected" in (bulk_card.get_attribute("class") or "")
    assert bulk_card.locator(".repo-bulk-selection-mark").is_visible()
    bulk_style = visual_style(page, ".repo-card.bulk-selected:visible")
    assert bulk_style != idle_style, {"bulk": bulk_style, "idle": idle_style}

    focused_card = focus_card_with_keyboard(page)
    focus_state = focused_card.evaluate(
        """el => {
            const style = getComputedStyle(el)
            return {
                isFocused: el === document.activeElement,
                focusVisible: el.matches(':focus-visible'),
                outlineStyle: style.outlineStyle,
                outlineWidth: parseFloat(style.outlineWidth),
            }
        }"""
    )
    assert focus_state["isFocused"] and focus_state["focusVisible"], focus_state
    assert focus_state["outlineStyle"] != "none" and focus_state["outlineWidth"] >= 2, focus_state

    normal_height = cards.first.evaluate("el => el.getBoundingClientRect().height")
    normal_geometry = assert_panel_below_results(page)
    page.screenshot(path=OUTPUT_DIR / f"library-card-states-{theme}-{width}x{height}-normal.png")

    density_buttons = page.locator(".library-density-toggle button")
    density_buttons.nth(1).click()
    page.locator(".library-page.library-density-compact").wait_for()
    compact_height = cards.first.evaluate("el => el.getBoundingClientRect().height")
    assert compact_height < normal_height, {"normal": normal_height, "compact": compact_height}
    compact_geometry = assert_panel_below_results(page)
    page.screenshot(path=OUTPUT_DIR / f"library-card-states-{theme}-{width}x{height}-compact.png")

    cards.first.focus()
    page.keyboard.press("Control+a")
    assert page.locator(".repo-card.bulk-selected:visible").count() == cards.count()
    page.keyboard.press("Escape")
    page.locator(".library-bulk-actions").wait_for(state="hidden")
    assert page.locator(".repo-card.bulk-selected:visible").count() == 0

    return {
        "theme": theme,
        "viewport": [width, height],
        "normalCardHeight": normal_height,
        "compactCardHeight": compact_height,
        "normalGeometry": normal_geometry,
        "compactGeometry": compact_geometry,
        "focus": focus_state,
        "activeFilter": visual_style(page, ".library-sidebar-filter-nav .library-sidebar-nav-btn.active"),
        "inactiveFilter": visual_style(page, ".library-sidebar-filter-nav .library-sidebar-nav-btn:not(.active)"),
    }


def main() -> None:
    baseline = load_baseline()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
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
                results.append(check_context(page, theme, width, height, baseline))
                context.close()
        browser.close()
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
