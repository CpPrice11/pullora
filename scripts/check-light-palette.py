from __future__ import annotations

import re
import runpy

from playwright.sync_api import Locator, sync_playwright


baseline = runpy.run_path("scripts/capture-visual-baseline.py")
seed_cache = baseline["seed_cache"]
open_library = baseline["open_library"]


def parse_color(value: str) -> tuple[float, float, float, float]:
    numbers = [float(part) for part in re.findall(r"[\d.]+", value)]
    if value.startswith("color(srgb"):
        red, green, blue = numbers[:3]
        alpha = numbers[3] if len(numbers) > 3 else 1.0
        return red, green, blue, alpha
    if value.startswith("rgb"):
        red, green, blue = (channel / 255 for channel in numbers[:3])
        alpha = numbers[3] if len(numbers) > 3 else 1.0
        return red, green, blue, alpha
    raise AssertionError(f"Unsupported color: {value}")


def composite(foreground, background):
    red, green, blue, alpha = foreground
    return (
        red * alpha + background[0] * (1 - alpha),
        green * alpha + background[1] * (1 - alpha),
        blue * alpha + background[2] * (1 - alpha),
        1.0,
    )


def luminance(color) -> float:
    channels = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in color[:3]]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast(first, second) -> float:
    lighter, darker = sorted((luminance(first), luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def resolved_tokens(page) -> dict[str, str]:
    return page.evaluate(
        """() => {
          const probe = document.createElement('span')
          document.body.appendChild(probe)
          const resolve = (property, cssProperty) => {
            probe.style[cssProperty] = `var(${property})`
            const value = getComputedStyle(probe)[cssProperty]
            probe.style[cssProperty] = ''
            return value
          }
          const values = {
            canvas: resolve('--surface-canvas', 'backgroundColor'),
            surface1: resolve('--surface-1', 'backgroundColor'),
            surface2: resolve('--surface-2', 'backgroundColor'),
            surface3: resolve('--surface-3', 'backgroundColor'),
            text: resolve('--color-text', 'color'),
            secondary: resolve('--color-text-secondary', 'color'),
            tertiary: resolve('--color-text-tertiary', 'color'),
            primary: resolve('--color-primary', 'backgroundColor'),
            primaryHover: resolve('--color-primary-dark', 'backgroundColor'),
          }
          probe.remove()
          return values
        }"""
    )


def assert_primary(button: Locator) -> None:
    style = button.evaluate(
        "el => { const style = getComputedStyle(el); return { color: style.color, background: style.backgroundImage } }"
    )
    assert style["color"] == "rgb(255, 255, 255)", style
    assert "linear-gradient" in style["background"], style
    button.hover()
    hover = button.evaluate(
        "el => { const style = getComputedStyle(el); return { color: style.color, background: style.backgroundImage } }"
    )
    assert hover["color"] == "rgb(255, 255, 255)", hover
    assert "linear-gradient" in hover["background"], hover


def assert_muted(locator: Locator, canvas, minimum: float = 4.5) -> None:
    locator.wait_for()
    color = parse_color(locator.evaluate("el => getComputedStyle(el).color"))
    assert contrast(color, canvas) >= minimum, {
        "text": locator.inner_text(),
        "contrast": contrast(color, canvas),
    }


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1280, "height": 720},
        color_scheme="light",
        locale="uk-UA",
    )
    page = context.new_page()
    seed_cache(page)
    open_library(page)

    assert page.locator("html").get_attribute("data-theme") == "light"
    tokens = resolved_tokens(page)
    canvas = parse_color(tokens["canvas"])
    text_colors = [parse_color(tokens[key]) for key in ("text", "secondary", "tertiary")]
    surfaces = [parse_color(tokens[key]) for key in ("surface1", "surface2", "surface3")]

    for surface in surfaces:
        assert 0.35 <= surface[3] <= 0.95, surface
        effective_surface = composite(surface, canvas)
        for text_color in text_colors:
            assert contrast(text_color, effective_surface) >= 4.5, {
                "text": text_color,
                "surface": effective_surface,
                "contrast": contrast(text_color, effective_surface),
            }

    white = parse_color("rgb(255, 255, 255)")
    assert contrast(white, parse_color(tokens["primary"])) >= 4.5
    assert contrast(white, parse_color(tokens["primaryHover"])) >= 4.5

    assert_primary(page.locator(".hero-primary-btn:visible").first)
    assert_muted(page.locator(".library-hero-description"), composite(surfaces[1], canvas))

    page.get_by_role("button", name="Налаштування").click()
    page.get_by_role("heading", name="Налаштування").wait_for()
    assert_muted(page.locator(".settings-page-header p"), composite(surfaces[0], canvas))
    assert_muted(page.locator(".help-text").first, composite(surfaces[1], canvas))

    page.get_by_role("button", name="Про застосунок").click()
    page.get_by_role("heading", name="Про застосунок").wait_for()
    assert_muted(page.locator(".about-hero-main > p"), composite(surfaces[0], canvas))
    about_disabled = page.get_by_role("button", name="Очистити")
    assert about_disabled.is_disabled()
    assert float(about_disabled.evaluate("el => getComputedStyle(el).opacity")) <= 0.6

    page.get_by_role("button", name="Бібліотека").click()
    page.locator(".hero-primary-btn:visible").first.click()
    page.locator(".release-modal").wait_for()
    assert_primary(page.locator(".release-action-primary"))
    assert_muted(page.locator(".release-wizard-context p"), composite(surfaces[1], canvas))
    disabled_step = page.locator(".release-step-pill:disabled").first
    assert float(disabled_step.evaluate("el => getComputedStyle(el).opacity")) <= 0.6

    context.close()
    browser.close()

print("[light-palette] primary, disabled, muted and translucent surface states: ok")
