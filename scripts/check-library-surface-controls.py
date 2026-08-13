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
        (
            cinematic,
            ":root[data-theme] .cinematic-shell .library-page .library-sam-list-pane,",
            ("var(--surface-1)", "blur(var(--surface-blur))"),
        ),
        (
            cinematic,
            ":root[data-theme] .cinematic-shell .library-page .library-toolstrip,",
            ("var(--surface-2)", "backdrop-filter: none"),
        ),
        (
            pages,
            ".cinematic-shell .library-page .library-play-status,",
            ("var(--surface-3)", "var(--surface-border)"),
        ),
        (
            cinematic,
            ".cinematic-shell .library-play-status span,",
            ("var(--color-text-secondary)",),
        ),
        (
            cinematic,
            ".cinematic-shell .library-play-status strong {",
            ("var(--color-text)",),
        ),
    )
    for source, selector, expected in contracts:
        rule = css_rule(source, selector)
        for fragment in expected:
            assert fragment in rule, {"selector": selector, "missing": fragment, "rule": rule}
    print("[library-surfaces] source contract: ok")


def click_range(page: Page, selector: str, value: int) -> None:
    control = page.locator(selector)
    control.scroll_into_view_if_needed()
    control.fill(str(value))
    assert control.input_value() == str(value)


def open_library(page: Page) -> None:
    page.locator(".nav-item").nth(0).click()
    page.locator(".library-page").wait_for()
    page.locator(".library-hero").wait_for()
    page.locator(".library-inline-panel--versions").wait_for()


def set_surface_controls(page: Page, transparency: int, blur: int) -> None:
    page.locator(".nav-item").nth(1).click()
    page.locator(".settings-page").wait_for()
    click_range(page, "#surfaceTransparency", transparency)
    click_range(page, "#surfaceBlur", blur)
    open_library(page)


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
            sidebar: read('.library-sam-list-pane'),
            details: read('.library-sam-details-pane'),
            toolstrip: read('.library-toolstrip'),
            playStatus: read('.library-play-status'),
            hero: read('.library-hero'),
            operations: read('.library-ops-panel'),
            inlinePanel: read('.library-inline-panel--versions'),
          };
        }
        """
    )


def play_status_contrast(page: Page) -> dict:
    return page.locator(".library-play-status").first.evaluate(
        """
        element => {
          const parse = value => {
            const numbers = [...value.matchAll(/[\d.]+/g)].map(match => Number(match[0]));
            if (value.startsWith('color(srgb')) return [...numbers.slice(0, 3), numbers[3] ?? 1];
            if (value.startsWith('rgb')) return [...numbers.slice(0, 3).map(value => value / 255), numbers[3] ?? 1];
            throw new Error(`Unsupported color: ${value}`);
          };
          const composite = (foreground, background) => [
            foreground[0] * foreground[3] + background[0] * (1 - foreground[3]),
            foreground[1] * foreground[3] + background[1] * (1 - foreground[3]),
            foreground[2] * foreground[3] + background[2] * (1 - foreground[3]),
            1,
          ];
          const luminance = color => color.slice(0, 3)
            .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
            .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
          const contrast = (first, second) => {
            const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
            return (lighter + 0.05) / (darker + 0.05);
          };
          const resolve = property => {
            const probe = document.createElement('span');
            probe.style.color = `var(${property})`;
            document.querySelector('.cinematic-shell').appendChild(probe);
            const value = getComputedStyle(probe).color;
            probe.remove();
            return value;
          };
          const style = getComputedStyle(element);
          const canvas = parse(resolve('--surface-canvas'));
          const background = composite(parse(style.backgroundColor), canvas);
          const labelColor = getComputedStyle(element.querySelector('span')).color;
          const valueColor = getComputedStyle(element.querySelector('strong')).color;
          return {
            labelColor,
            valueColor,
            secondaryToken: resolve('--color-text-secondary'),
            textToken: resolve('--color-text'),
            labelContrast: contrast(parse(labelColor), background),
            valueContrast: contrast(parse(valueColor), background),
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
            initial = surface_state(page)
            geometry = {
                key: initial[key]["box"]
                for key in ("sidebar", "details", "hero", "operations", "inlinePanel")
            }

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
                assert "12px" in state["sidebar"]["filter"]
                assert "12px" in state["details"]["filter"]
                for inner in ("toolstrip", "playStatus", "hero", "operations", "inlinePanel"):
                    assert state[inner]["filter"] == "none", {inner: state[inner]}
                status_contrast = play_status_contrast(page)
                assert status_contrast["labelColor"] == status_contrast["secondaryToken"], status_contrast
                assert status_contrast["valueColor"] == status_contrast["textToken"], status_contrast
                assert status_contrast["labelContrast"] >= 4.5, status_contrast
                assert status_contrast["valueContrast"] >= 4.5, status_contrast
                opacity_states[transparency] = state
                checks += 1

            for surface in ("sidebar", "details", "toolstrip", "playStatus", "hero", "operations", "inlinePanel"):
                assert (
                    alpha(opacity_states[0][surface]["background"])
                    > alpha(opacity_states[40][surface]["background"])
                    > alpha(opacity_states[80][surface]["background"])
                ), {surface: opacity_states}

            for blur in (0, 12, 32):
                set_surface_controls(page, 40, blur)
                state = surface_state(page)
                assert state["blur"] == f"{blur}px", state
                assert f"blur({blur}px)" in state["sidebar"]["filter"]
                assert f"blur({blur}px)" in state["details"]["filter"]
                checks += 1

            context.close()
        browser.close()
    print(f"[library-surfaces] checks={checks}: ok")


if __name__ == "__main__":
    main()
