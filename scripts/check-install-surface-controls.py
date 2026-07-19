from __future__ import annotations

import runpy
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


BASELINE = runpy.run_path("scripts/capture-visual-baseline.py")


def css_rule(source: str, selector: str) -> str:
    start = source.find(selector)
    assert start >= 0, f"Missing CSS selector: {selector}"
    block_start = source.find("{", start)
    block_end = source.find("}", block_start)
    assert block_start >= 0 and block_end >= 0, f"Incomplete CSS rule: {selector}"
    return source[start:block_end]


def check_source_contract() -> None:
    root = Path(__file__).resolve().parent.parent
    modal = (root / "src/components/Modal/Modal.css").read_text(encoding="utf-8")
    library = (root / "src/features/library/components/SearchComponents.css").read_text(encoding="utf-8")
    contracts = (
        (modal, ".cinematic-shell .release-modal--wizard", ("var(--surface-1)", "blur(var(--surface-blur))")),
        (library, ".cinematic-shell .release-modal--wizard > .modal-header", ("var(--surface-2)", "var(--surface-border)")),
        (library, ".cinematic-shell .release-modal--wizard > .release-body", ("var(--surface-1)",)),
        (library, ".cinematic-shell .release-modal--wizard .release-nav-actions", ("var(--surface-2)",)),
        (library, ".cinematic-shell .release-modal--wizard .release-version-card", ("var(--surface-3)", "var(--surface-border)")),
    )
    for source, selector, expected in contracts:
        rule = css_rule(source, selector)
        for fragment in expected:
            assert fragment in rule, {"selector": selector, "missing": fragment, "rule": rule}
    print("[install-surfaces] source contract: ok")


def click_range(page: Page, selector: str, value: int) -> None:
    control = page.locator(selector)
    control.scroll_into_view_if_needed()
    box = control.bounding_box()
    assert box
    limits = control.evaluate("el => ({ min: Number(el.min), max: Number(el.max) })")
    ratio = (value - limits["min"]) / (limits["max"] - limits["min"])
    usable_width = max(1, box["width"] - 18)
    page.mouse.click(box["x"] + 9 + usable_width * ratio, box["y"] + box["height"] / 2)
    page.wait_for_function(
        "([controlSelector, expected]) => document.querySelector(controlSelector)?.value === String(expected)",
        arg=[selector, value],
    )


def open_install(page: Page) -> None:
    page.locator(".nav-item").nth(0).click()
    page.locator(".library-page").wait_for()
    page.locator(".library-ops-action-row .hero-primary-btn").click()
    page.locator(".release-modal--wizard").wait_for()
    page.wait_for_function(
        """() => {
          const modal = document.querySelector('.release-modal--wizard');
          const body = modal?.querySelector('.release-body');
          return Boolean(modal?.querySelector('.release-version-card'))
            && body
            && getComputedStyle(body).display === 'block';
        }"""
    )
    page.locator(".release-modal--wizard").evaluate(
        """
        element => new Promise(resolve => {
          const body = element.querySelector('.release-body');
          element.scrollTop = 0;
          if (body) body.scrollTop = 0;
          element.focus({ preventScroll: true });
          requestAnimationFrame(() => requestAnimationFrame(() => {
            element.scrollTop = 0;
            if (body) body.scrollTop = 0;
            resolve();
          }));
        })
        """
    )


def set_surface_controls(page: Page, transparency: int, blur: int) -> None:
    modal = page.locator(".release-modal--wizard")
    if modal.is_visible():
        modal.locator(".close-btn").click()
        modal.wait_for(state="hidden")
    page.locator(".nav-item").nth(1).click()
    page.locator(".settings-page").wait_for()
    click_range(page, "#surfaceTransparency", transparency)
    click_range(page, "#surfaceBlur", blur)
    open_install(page)


def surface_state(page: Page) -> dict:
    return page.evaluate(
        """
        () => {
          const read = selector => {
            const element = document.querySelector(selector);
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return {
              background: style.backgroundColor,
              border: style.borderColor,
              filter: style.backdropFilter,
              box: [box.x, box.y, box.width, box.height].map(value => Math.round(value)),
            };
          };
          const root = getComputedStyle(document.documentElement);
          const background = document.querySelector('.cinematic-background');
          return {
            opacity: root.getPropertyValue('--surface-opacity').trim(),
            blur: root.getPropertyValue('--surface-blur').trim(),
            launcherBackgroundVisible: background.classList.contains('is-visible'),
            launcherBackgroundOpacity: Number(getComputedStyle(background).opacity),
            overlay: read('.modal-overlay'),
            modal: read('.release-modal--wizard'),
            header: read('.release-modal--wizard > .modal-header'),
            steps: read('.release-modal--wizard > .release-wizard-steps'),
            body: read('.release-modal--wizard > .release-body'),
            card: read('.release-modal--wizard .release-version-card'),
            footer: read('.release-modal--wizard .release-nav-actions'),
          };
        }
        """
    )


def alpha(color: str) -> float:
    if "/" in color:
        value = color.rsplit("/", 1)[-1].rstrip(" )").strip()
        return float(value.removesuffix("%")) / (100 if value.endswith("%") else 1)
    if color.startswith("rgba("):
        return float(color.removeprefix("rgba(").removesuffix(")").split(",")[-1])
    return 1.0


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    checks = 0
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in ("dark", "light"):
            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                color_scheme=theme,
                locale="uk-UA",
            )
            page = context.new_page()
            BASELINE["seed_cache"](page)
            BASELINE["open_library"](page)
            BASELINE["apply_custom_background"](page)
            open_install(page)
            initial = surface_state(page)
            geometry = {key: initial[key]["box"] for key in ("modal", "header", "steps", "body", "footer")}

            opacity_states = {}
            for transparency in (0, 40, 80):
                set_surface_controls(page, transparency, 12)
                state = surface_state(page)
                assert state["opacity"] == f"{100 - transparency}%", state
                assert state["launcherBackgroundVisible"] and state["launcherBackgroundOpacity"] > 0
                current_geometry = {key: state[key]["box"] for key in geometry}
                assert current_geometry == geometry, {
                    "expectedGeometry": geometry,
                    "actualGeometry": current_geometry,
                    "state": state,
                }
                assert "12px" in state["overlay"]["filter"]
                assert "12px" in state["modal"]["filter"]
                opacity_states[transparency] = state
                checks += 1

            for surface in ("modal", "header", "body", "card", "footer"):
                assert (
                    alpha(opacity_states[0][surface]["background"])
                    > alpha(opacity_states[40][surface]["background"])
                    > alpha(opacity_states[80][surface]["background"])
                ), {surface: opacity_states}

            for blur in (0, 12, 32):
                set_surface_controls(page, 40, blur)
                state = surface_state(page)
                assert state["blur"] == f"{blur}px", state
                assert f"blur({blur}px)" in state["overlay"]["filter"]
                assert f"blur({blur}px)" in state["modal"]["filter"]
                checks += 1

            context.close()
        browser.close()
    print(f"[install-surfaces] checks={checks}: ok")


if __name__ == "__main__":
    main()
