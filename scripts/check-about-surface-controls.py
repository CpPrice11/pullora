from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "scripts" / "capture-visual-baseline.py"
BACKGROUND_MODES = ("standard", "custom")


def load_baseline():
    spec = importlib.util.spec_from_file_location("pullora_visual_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load visual baseline helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def css_rule(source: str, selector: str) -> str:
    start = source.find(selector)
    assert start >= 0, f"Missing CSS selector: {selector}"
    block_start = source.find("{", start)
    block_end = source.find("}", block_start)
    assert block_start >= 0 and block_end >= 0, f"Incomplete CSS rule: {selector}"
    return source[start:block_end]


def check_source_contract() -> None:
    cinematic = (ROOT / "src/styles/Cinematic.css").read_text(encoding="utf-8")
    pages = (ROOT / "src/pages/PageStyles.css").read_text(encoding="utf-8")
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
    control.fill(str(value))
    assert control.input_value() == str(value)


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


def apply_background_mode(page: Page, background_mode: str, baseline) -> None:
    if background_mode == "custom":
        baseline.apply_custom_background(page)
    else:
        baseline.clear_custom_background(page)


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
          const layout = document.querySelector('.layout');
          const background = document.querySelector('.cinematic-background');
          return {
            opacity: root.getPropertyValue('--surface-opacity').trim(),
            blur: root.getPropertyValue('--surface-blur').trim(),
            customBackground: layout.classList.contains('has-custom-background'),
            layoutBackground: getComputedStyle(layout).backgroundImage,
            layoutBackgroundColor: getComputedStyle(layout).backgroundColor,
            launcherBackgroundVisible: background.classList.contains('is-visible'),
            launcherBackgroundImage: getComputedStyle(background).backgroundImage,
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


def surface_signature(state: dict) -> dict:
    return {
        "opacity": state["opacity"],
        "blur": state["blur"],
        **{
            surface: state[surface]
            for surface in ("hero", "panel", "release", "orb")
        },
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    from playwright.sync_api import sync_playwright

    baseline = load_baseline()

    with sync_playwright() as playwright:
        browser = baseline.launch_browser(playwright)
        checks = 0
        for theme in ("dark", "light"):
            theme_states = {}
            for background_mode in BACKGROUND_MODES:
                context = browser.new_context(
                    viewport={"width": 1280, "height": 720},
                    color_scheme=theme,
                    locale="uk-UA",
                )
                page = context.new_page()
                baseline.seed_cache(page)
                baseline.open_library(page)
                open_about(page)
                apply_background_mode(page, background_mode, baseline)

                initial = surface_state(page)
                assert initial["customBackground"] == (background_mode == "custom"), initial
                assert initial["layoutBackground"] != "none" or alpha(initial["layoutBackgroundColor"]) > 0, initial
                assert initial["launcherBackgroundVisible"] == (background_mode == "custom"), initial
                if background_mode == "custom":
                    assert initial["launcherBackgroundImage"] != "none", initial
                    assert initial["launcherBackgroundOpacity"] > 0, initial
                geometry = {key: initial[key]["box"] for key in ("hero", "panel", "release")}
                scenario_states = {}

                opacity_states = {}
                for transparency in (0, 40, 80):
                    set_surface_controls(page, transparency, 12)
                    apply_background_mode(page, background_mode, baseline)
                    state = surface_state(page)
                    assert state["opacity"] == f"{100 - transparency}%", state
                    assert state["customBackground"] == (background_mode == "custom"), state
                    assert state["launcherBackgroundVisible"] == (background_mode == "custom"), state
                    assert {key: state[key]["box"] for key in geometry} == geometry, state
                    assert "12px" in state["hero"]["filter"]
                    assert "12px" in state["panel"]["filter"]
                    assert state["release"]["filter"] == "none"
                    opacity_states[transparency] = state
                    scenario_states[("opacity", transparency)] = state
                    checks += 1

                for surface in ("hero", "panel", "release", "orb"):
                    assert (
                        alpha(opacity_states[0][surface]["background"])
                        > alpha(opacity_states[40][surface]["background"])
                        > alpha(opacity_states[80][surface]["background"])
                    ), {"background": background_mode, "surface": surface, "states": opacity_states}

                for blur in (0, 12, 32):
                    set_surface_controls(page, 40, blur)
                    apply_background_mode(page, background_mode, baseline)
                    state = surface_state(page)
                    assert state["blur"] == f"{blur}px", state
                    if blur == 0:
                        assert state["hero"]["filter"].startswith("blur(0px)")
                        assert state["panel"]["filter"].startswith("blur(0px)")
                    else:
                        assert f"{blur}px" in state["hero"]["filter"]
                        assert f"{blur}px" in state["panel"]["filter"]
                    scenario_states[("blur", blur)] = state
                    checks += 1

                theme_states[background_mode] = scenario_states
                context.close()

            for scenario, standard in theme_states["standard"].items():
                assert surface_signature(standard) == surface_signature(theme_states["custom"][scenario]), {
                    "theme": theme,
                    "scenario": scenario,
                    "standard": surface_signature(standard),
                    "custom": surface_signature(theme_states["custom"][scenario]),
                }
        browser.close()
    print(f"[about-surfaces] checks={checks}: ok")


if __name__ == "__main__":
    main()
