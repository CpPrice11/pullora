from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
CONTROLS = runpy.run_path(str(ROOT / "scripts" / "check-about-release-controls.py"))
BASELINE = CONTROLS["load_baseline"]()
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))


def check_source_contract() -> None:
    about = (ROOT / "src" / "pages" / "AboutPage.tsx").read_text(encoding="utf-8")
    focus_hook = (ROOT / "src" / "hooks" / "useModalFocus.ts").read_text(encoding="utf-8")

    for fragment in (
        "const notesReturnFocusRef = useRef<HTMLButtonElement | null>(null)",
        "returnFocusRef: notesReturnFocusRef",
        "notesReturnFocusRef.current = releaseMenuTriggerRef.current",
        "notesRelease && createPortal(",
        "pendingAction && createPortal(",
        "document.querySelector('.layout') ?? document.body",
    ):
        assert fragment in about, fragment
    for fragment in (
        "returnFocusRef?: RefObject<HTMLElement>",
        "const focusTarget = returnFocusRef?.current ?? previousFocus",
        "focusTarget && document.contains(focusTarget)",
    ):
        assert fragment in focus_hook, fragment
    print("[about-release-interactions] source contract: ok")


def open_about(page: Page) -> None:
    CONTROLS["seed_release_matrix"](page, BASELINE)
    BASELINE.open_library(page)
    page.locator(".nav-item").nth(2).click()
    page.locator(".about-page").wait_for()
    page.locator(".about-release-link--older").wait_for()


def rounded_box(locator) -> dict:
    box = locator.bounding_box()
    assert box is not None
    return {key: round(value, 2) for key, value in box.items()}


def assert_focused(locator) -> None:
    assert locator.evaluate("el => el === document.activeElement")


def inspect_interactions(page: Page, width: int, height: int) -> dict:
    release = page.locator(".about-release-link--older")
    trigger = release.locator(".project-actions-trigger")
    activate = release.locator(".about-release-actions > .secondary-btn")

    trigger.click()
    menu_portal = page.locator(".about-release-menu-portal")
    menu = menu_portal.get_by_role("menu")
    items = menu.get_by_role("menuitem")
    menu_portal.wait_for()
    assert items.count() == 2
    assert_focused(items.nth(0))
    assert menu_portal.evaluate("el => el.parentElement === document.body")

    page.keyboard.press("End")
    assert_focused(items.nth(1))
    page.keyboard.press("Home")
    assert_focused(items.nth(0))
    page.keyboard.press("ArrowDown")
    assert_focused(items.nth(1))
    page.keyboard.press("ArrowUp")
    assert_focused(items.nth(0))

    menu_box = rounded_box(menu_portal)
    assert menu_box["x"] >= 0 and menu_box["y"] >= 0
    assert menu_box["x"] + menu_box["width"] <= width + 0.5
    assert menu_box["y"] + menu_box["height"] <= height + 0.5

    page.keyboard.press("Escape")
    menu_portal.wait_for(state="hidden")
    assert_focused(trigger)

    trigger.click()
    menu_portal.wait_for()
    menu_portal.get_by_role("menuitem").nth(0).click()
    notes = page.locator(".about-notes-modal")
    notes.wait_for()
    overlay = notes.locator("xpath=parent::*")
    assert overlay.evaluate(
        "el => el.classList.contains('modal-overlay') && el.classList.contains('about-dialog-overlay')"
    )
    assert overlay.evaluate("el => el.parentElement?.classList.contains('layout')")
    assert page.locator(".about-release-menu-portal").count() == 0

    notes_buttons = notes.locator("button:not([disabled])")
    page.wait_for_function("el => el.contains(document.activeElement)", arg=notes.element_handle())
    assert_focused(notes_buttons.nth(0))
    page.keyboard.press("Shift+Tab")
    assert_focused(notes_buttons.nth(notes_buttons.count() - 1))
    page.keyboard.press("Tab")
    assert_focused(notes_buttons.nth(0))
    notes_box = rounded_box(notes)

    page.keyboard.press("Escape")
    notes.wait_for(state="hidden")
    assert_focused(trigger)

    trigger.click()
    menu_portal.wait_for()
    menu_portal.get_by_role("menuitem").nth(0).click()
    notes.wait_for()
    notes.locator("xpath=parent::*").click(position={"x": 5, "y": 5})
    notes.wait_for(state="hidden")
    assert_focused(trigger)

    activate.click()
    confirm = page.locator(".confirm-modal")
    confirm.wait_for()
    confirm_overlay = confirm.locator("xpath=parent::*")
    assert confirm_overlay.evaluate("el => el.parentElement?.classList.contains('layout')")
    cancel = confirm.locator('[data-autofocus="true"]')
    primary = confirm.locator(".confirm-primary-btn")
    page.wait_for_function("el => el === document.activeElement", arg=cancel.element_handle())
    assert_focused(cancel)
    page.keyboard.press("Shift+Tab")
    assert_focused(confirm.locator(".confirm-close-btn"))
    page.keyboard.press("Shift+Tab")
    assert_focused(primary)
    page.keyboard.press("Tab")
    assert_focused(confirm.locator(".confirm-close-btn"))
    confirm_box = rounded_box(confirm)

    page.keyboard.press("Escape")
    confirm.wait_for(state="hidden")
    assert_focused(activate)

    return {
        "viewport": [width, height],
        "menu": menu_box,
        "notes": notes_box,
        "confirm": confirm_box,
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in ("dark", "light"):
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme=theme,
                    locale="uk-UA",
                )
                page = context.new_page()
                open_about(page)
                results.append({"theme": theme, **inspect_interactions(page, width, height)})
                context.close()
        browser.close()

    for width, height in VIEWPORTS:
        dark = next(item for item in results if item["theme"] == "dark" and item["viewport"] == [width, height])
        light = next(item for item in results if item["theme"] == "light" and item["viewport"] == [width, height])
        for key in ("menu", "notes", "confirm"):
            assert dark[key] == light[key], {
                "viewport": [width, height],
                "key": key,
                "dark": dark[key],
                "light": light[key],
            }

    print(json.dumps({"checks": len(results), "viewports": VIEWPORTS}, ensure_ascii=False))


if __name__ == "__main__":
    main()
