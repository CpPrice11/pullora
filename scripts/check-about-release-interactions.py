from __future__ import annotations

import json
import re
import runpy
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page


ROOT = Path(__file__).resolve().parent.parent
CONTROLS = runpy.run_path(str(ROOT / "scripts" / "check-about-release-controls.py"))
BASELINE = None if "--static" in sys.argv else CONTROLS["load_baseline"]()
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))


def check_source_contract() -> None:
    about = (ROOT / "src" / "pages" / "AboutPage.tsx").read_text(encoding="utf-8")
    app_styles = (ROOT / "src" / "App.css").read_text(encoding="utf-8")
    focus_hook = (ROOT / "src" / "hooks" / "useModalFocus.ts").read_text(encoding="utf-8")
    styles = (ROOT / "src" / "pages" / "PageStyles.css").read_text(encoding="utf-8")

    for fragment in (
        "const notesReturnFocusRef = useRef<HTMLButtonElement | null>(null)",
        "returnFocusRef: notesReturnFocusRef",
        "notesReturnFocusRef.current = releaseMenuTriggerRef.current",
        "notesRelease && createPortal(",
        "document.querySelector('.layout') ?? document.body",
    ):
        assert fragment in about, fragment
    assert ".project-actions-menu.about-release-menu-portal" in styles
    assert "position: fixed" in styles
    for fragment in (
        "transition: color var(--motion-normal);",
        "transition: opacity var(--motion-normal), transform var(--motion-normal);",
        "transition: opacity var(--motion-menu), transform var(--motion-menu);",
        "about-release-menu-portal--up",
        "@starting-style",
    ):
        assert fragment in styles or fragment in about, fragment
    assert "@keyframes about-toast-enter" not in styles
    assert "@keyframes about-menu-enter" not in styles
    assert ".about-toast.is-visible" in styles
    for fragment in (
        "@media (prefers-reduced-motion: reduce)",
        "animation-duration: 0.001ms !important;",
        "transition-duration: 80ms !important;",
        "transition-property: background-color, border-color, color, box-shadow, opacity !important;",
    ):
        assert fragment in app_styles, fragment
    forbidden_layout_property = re.compile(
        r"(?:^|[;{\s])(width|height|top|right|bottom|left|inset|margin|padding|grid|flex)[-\w]*\s*:",
        re.MULTILINE,
    )
    for name, source in (
        ("fluent-fade-up", app_styles),
        ("fluent-overlay-in", app_styles),
        ("fluent-dialog-in", app_styles),
    ):
        start = source.index(f"@keyframes {name}")
        opening = source.index("{", start)
        depth = 0
        for end in range(opening, len(source)):
            depth += source[end] == "{"
            depth -= source[end] == "}"
            if depth == 0:
                break
        assert not forbidden_layout_property.search(source[opening:end + 1]), name
    for fragment in (
        "returnFocusRef?: RefObject<HTMLElement>",
        "const focusTarget = returnFocusRef?.current ?? previousFocus",
        "focusTarget && document.contains(focusTarget)",
    ):
        assert fragment in focus_hook, fragment
    print("[about-release-interactions] source contract: ok")


def open_about(page: Page, *, enable_motion_test_styles: bool = True) -> None:
    CONTROLS["seed_release_matrix"](page, BASELINE)
    BASELINE.open_library(page)
    page.locator(".nav-item").nth(2).click()
    page.locator(".about-page").wait_for()
    page.locator(".about-release-link--older").first.wait_for()
    if enable_motion_test_styles:
        page.add_style_tag(
            content="""
              .about-launcher-status-icon { transition: color var(--motion-normal) !important; }
              .about-toast {
                transition: opacity var(--motion-normal), transform var(--motion-normal) !important;
              }
              .about-release-menu-portal .project-actions-popover {
                transition: opacity var(--motion-menu), transform var(--motion-menu) !important;
              }
            """
        )
    else:
        page.evaluate(
            """() => [...document.querySelectorAll('style')]
              .find(style => style.textContent?.includes('animation:none!important'))?.remove()"""
        )


def rounded_box(locator) -> dict:
    box = locator.bounding_box()
    assert box is not None
    return {key: round(value, 2) for key, value in box.items()}


def assert_focused(locator) -> None:
    assert locator.evaluate("el => el === document.activeElement")


def assert_motion_duration(locator, property_name: str) -> int:
    duration = locator.evaluate(
        """(el, propertyName) => {
          const value = getComputedStyle(el)[propertyName].split(',')[0].trim();
          return value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
        }""",
        property_name,
    )
    rounded = round(duration)
    assert 150 <= rounded <= 250, {property_name: duration}
    return rounded


def assert_reduced_motion(locator, property_name: str) -> None:
    durations = locator.evaluate(
        """(el, propertyName) => getComputedStyle(el)[propertyName]
          .split(',')
          .map(value => value.trim())
          .map(value => value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000)""",
        property_name,
    )
    assert max(durations) <= 1, {property_name: durations}


def assert_reduced_transition(locator) -> None:
    duration = locator.evaluate(
        """el => {
          const value = getComputedStyle(el).transitionDuration.split(',')[0].trim();
          return value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
        }"""
    )
    assert 75 <= duration <= 85, {"transitionDuration": duration}
    properties = {
        value.strip()
        for value in locator.evaluate("el => getComputedStyle(el).transitionProperty").split(",")
    }
    assert properties <= {"background-color", "border-color", "color", "box-shadow", "opacity"}, properties


def inspect_interactions(page: Page, width: int, height: int) -> dict:
    release = page.locator(".about-release-link--older").first
    trigger = release.locator(".project-actions-trigger")
    open_release = release.locator(".about-release-actions > .secondary-btn")

    launcher_status_icon = page.locator(".about-launcher-status-icon")
    assert "color" in launcher_status_icon.evaluate("el => getComputedStyle(el).transitionProperty")
    status_motion = assert_motion_duration(launcher_status_icon, "transitionDuration")

    trigger.click()
    menu_portal = page.locator(".about-release-menu-portal")
    menu = menu_portal.get_by_role("menu")
    items = menu.get_by_role("menuitem")
    menu_portal.wait_for()
    assert items.count() == 2
    assert_focused(items.nth(0))
    assert menu_portal.evaluate("el => el.parentElement === document.body")
    assert menu_portal.evaluate("el => getComputedStyle(el).position === 'fixed'")
    assert menu_portal.evaluate("el => getComputedStyle(el).zIndex") == "90"
    menu_motion = assert_motion_duration(menu, "transitionDuration")
    assert menu.evaluate("el => getComputedStyle(el).transitionProperty") == "opacity, transform"

    page.keyboard.press("End")
    assert_focused(items.nth(1))
    page.keyboard.press("Home")
    assert_focused(items.nth(0))
    page.keyboard.press("ArrowDown")
    assert_focused(items.nth(1))
    page.keyboard.press("ArrowUp")
    assert_focused(items.nth(0))

    page.wait_for_timeout(menu_motion)

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
    assert overlay.evaluate("el => getComputedStyle(el).zIndex") == "1000"
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

    open_release.click()
    assert page.locator(".confirm-modal").count() == 0

    page.evaluate(
        """() => {
          const toast = document.createElement('div');
          toast.className = 'about-toast about-toast--success is-visible';
          toast.dataset.motionTest = 'toast';
          toast.textContent = 'Готово';
          document.body.appendChild(toast);
        }"""
    )
    toast = page.locator('[data-motion-test="toast"]')
    toast_motion = assert_motion_duration(toast, "transitionDuration")
    assert toast.evaluate("el => getComputedStyle(el).opacity") == "1"
    assert toast.evaluate("el => getComputedStyle(el).transform") == "matrix(1, 0, 0, 1, 0, 0)"
    toast.evaluate("el => el.remove()")

    return {
        "viewport": [width, height],
        "menu": menu_box,
        "notes": notes_box,
        "motion": {
            "status": status_motion,
            "toast": toast_motion,
            "menu": menu_motion,
        },
    }


def inspect_reduced_motion(page: Page) -> None:
    assert_reduced_motion(page.locator(".about-page"), "animationDuration")
    assert_reduced_motion(page.locator(".about-panel").first, "animationDuration")
    assert_reduced_transition(page.locator(".about-launcher-status-icon"))
    assert_reduced_transition(page.locator(".about-release-link--older").first)

    trigger = page.locator(".about-release-link--older").first.locator(".project-actions-trigger")
    trigger.click()
    menu = page.locator(".about-release-menu-portal [role=menu]")
    menu.wait_for()
    assert_reduced_transition(menu)

    page.evaluate(
        """() => {
          const toast = document.createElement('div');
          toast.className = 'about-toast about-toast--success is-visible';
          toast.dataset.motionTest = 'reduced-toast';
          toast.textContent = 'Готово';
          document.body.appendChild(toast);
        }"""
    )
    toast = page.locator('[data-motion-test="reduced-toast"]')
    assert_reduced_transition(toast)
    assert toast.evaluate("el => getComputedStyle(el).opacity") == "1"
    assert toast.evaluate("el => getComputedStyle(el).transform") == "none"
    toast.evaluate("el => el.remove()")

    menu.get_by_role("menuitem").first.click()
    notes = page.locator(".about-notes-modal")
    notes.wait_for()
    assert_reduced_motion(notes, "animationDuration")
    assert_reduced_motion(notes.locator("xpath=parent::*"), "animationDuration")


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    from playwright.sync_api import sync_playwright

    results = []
    with sync_playwright() as playwright:
        browser = BASELINE.launch_browser(playwright)
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
        for theme in ("dark", "light"):
            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                color_scheme=theme,
                reduced_motion="reduce",
                locale="uk-UA",
            )
            page = context.new_page()
            open_about(page, enable_motion_test_styles=False)
            inspect_reduced_motion(page)
            context.close()
        browser.close()

    for width, height in VIEWPORTS:
        dark = next(item for item in results if item["theme"] == "dark" and item["viewport"] == [width, height])
        light = next(item for item in results if item["theme"] == "light" and item["viewport"] == [width, height])
        for key in ("menu", "notes"):
            assert dark[key] == light[key], {
                "viewport": [width, height],
                "key": key,
                "dark": dark[key],
                "light": light[key],
            }

    print(json.dumps({"checks": len(results) + 2, "viewports": VIEWPORTS, "reducedMotion": 2}, ensure_ascii=False))


if __name__ == "__main__":
    main()
