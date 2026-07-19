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
    cinematic = (root / "src/styles/Cinematic.css").read_text(encoding="utf-8")
    pages = (root / "src/pages/PageStyles.css").read_text(encoding="utf-8")
    contracts = (
        (cinematic, ":root[data-theme] .cinematic-shell .about-hero,", ("var(--surface-1)", "blur(var(--surface-blur))")),
        (pages, ".cinematic-shell .about-release-link", ("var(--surface-2)", "var(--surface-border)")),
        (pages, ".about-release-orb", ("var(--surface-3)", "var(--surface-border)")),
    )
    for source, selector, expected in contracts:
        rule = css_rule(source, selector)
        for fragment in expected:
            assert fragment in rule, {"selector": selector, "missing": fragment, "rule": rule}
    print("[about-surfaces] source contract: ok")


def click_range(page: Page, selector: str, value: int) -> None:
    control = page.locator(selector)
    control.scroll_into_view_if_needed()
    box = control.bounding_box()
    assert box
    limits = control.evaluate("el => ({ min: Number(el.min), max: Number(el.max) })")
    ratio = (value - limits["min"]) / (limits["max"] - limits["min"])
    usable_width = max(1, box["width"] - 18)
    page.mouse.click(
        box["x"] + 9 + usable_width * ratio,
        box["y"] + box["height"] / 2,
    )
    page.wait_for_function(
        "([controlSelector, expected]) => document.querySelector(controlSelector)?.value === String(expected)",
        arg=[selector, value],
    )


def open_about(page: Page) -> None:
    page.get_by_role("button", name="Про застосунок").click()
    page.get_by_role("heading", name="Про застосунок").wait_for()
    page.locator(".about-release-link").first.wait_for()


def set_surface_controls(page: Page, transparency: int, blur: int) -> None:
    page.get_by_role("button", name="Налаштування").click()
    page.get_by_role("heading", name="Налаштування").wait_for()
    click_range(page, "#surfaceTransparency", transparency)
    click_range(page, "#surfaceBlur", blur)
    open_about(page)


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
            hero: read('.about-hero'),
            panel: read('.about-panel'),
            release: read('.about-release-link'),
            orb: read('.about-release-orb'),
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

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        checks = 0
        for theme in ("dark", "light"):
            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                color_scheme=theme,
                locale="uk-UA",
            )
            page = context.new_page()
            BASELINE["seed_cache"](page)
            BASELINE["open_library"](page)
            open_about(page)
            BASELINE["apply_custom_background"](page)
            initial = surface_state(page)
            geometry = {key: initial[key]["box"] for key in ("hero", "panel", "release")}

            opacity_states = {}
            for transparency in (0, 40, 80):
                set_surface_controls(page, transparency, 12)
                state = surface_state(page)
                assert state["opacity"] == f"{100 - transparency}%", state
                assert state["launcherBackgroundVisible"] and state["launcherBackgroundOpacity"] > 0
                assert {key: state[key]["box"] for key in geometry} == geometry, state
                assert "12px" in state["hero"]["filter"]
                assert "12px" in state["panel"]["filter"]
                assert state["release"]["filter"] == "none"
                opacity_states[transparency] = state
                checks += 1

            for surface in ("hero", "panel", "release", "orb"):
                assert (
                    alpha(opacity_states[0][surface]["background"])
                    > alpha(opacity_states[40][surface]["background"])
                    > alpha(opacity_states[80][surface]["background"])
                ), {surface: opacity_states}

            for blur in (0, 12, 32):
                set_surface_controls(page, 40, blur)
                state = surface_state(page)
                assert state["blur"] == f"{blur}px", state
                if blur == 0:
                    assert state["hero"]["filter"].startswith("blur(0px)")
                    assert state["panel"]["filter"].startswith("blur(0px)")
                else:
                    assert f"{blur}px" in state["hero"]["filter"]
                    assert f"{blur}px" in state["panel"]["filter"]
                checks += 1

            context.close()
        browser.close()
    print(f"[about-surfaces] checks={checks}: ok")


if __name__ == "__main__":
    main()
