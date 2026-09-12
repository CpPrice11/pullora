from __future__ import annotations

import re
import runpy
from pathlib import Path

from playwright.sync_api import Locator, Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE = runpy.run_path(str(ROOT / "scripts" / "capture-visual-baseline.py"))
THEMES = ("dark", "light")
BACKGROUNDS = ("standard", "custom")
COLOR_PATTERN = re.compile(r"(?:rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-fA-F]{3,8})")


def parse_color(value: str) -> tuple[float, float, float, float]:
    value = value.strip().lower()
    if value == "transparent":
        return 0.0, 0.0, 0.0, 0.0
    if value.startswith("#"):
        digits = value[1:]
        if len(digits) in (3, 4):
            digits = "".join(channel * 2 for channel in digits)
        assert len(digits) in (6, 8), value
        channels = [int(digits[index:index + 2], 16) / 255 for index in range(0, len(digits), 2)]
        return channels[0], channels[1], channels[2], channels[3] if len(channels) == 4 else 1.0

    numbers = [float(part) for part in re.findall(r"[\d.]+", value)]
    if value.startswith("color(srgb"):
        red, green, blue = numbers[:3]
        return red, green, blue, numbers[3] if len(numbers) > 3 else 1.0
    if value.startswith("rgb"):
        red, green, blue = (channel / 255 for channel in numbers[:3])
        return red, green, blue, numbers[3] if len(numbers) > 3 else 1.0
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
    channels = [
        channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
        for channel in color[:3]
    ]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast(first, second) -> float:
    lighter, darker = sorted((luminance(first), luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def resolved_canvas(page: Page):
    return parse_color(page.locator("html").evaluate(
        "el => { const probe = document.createElement('span'); document.body.appendChild(probe); "
        "probe.style.backgroundColor = 'var(--surface-canvas)'; const value = getComputedStyle(probe).backgroundColor; "
        "probe.remove(); return value }"
    ))


def fallback_background(locator: Locator, canvas):
    layers = locator.evaluate(
        """el => {
          const colors = []
          for (let node = el; node; node = node.parentElement) {
            const color = getComputedStyle(node).backgroundColor
            if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') colors.push(color)
          }
          return colors
        }"""
    )
    background = canvas
    for value in reversed(layers):
        background = composite(parse_color(value), background)
    return [background]


def rendered_backgrounds(session, locator: Locator, canvas):
    background_image = locator.evaluate("el => getComputedStyle(el).backgroundImage")
    gradient_colors = [parse_color(value) for value in COLOR_PATTERN.findall(background_image)]
    if gradient_colors:
        parent_background = fallback_background(locator.locator("xpath=.."), canvas)[0]
        return [
            composite(color, parent_background) if color[3] < 1 else color
            for color in gradient_colors
        ]

    probe = f"contrast-{id(locator)}"
    locator.evaluate("(el, value) => el.dataset.contrastProbe = value", probe)
    try:
        document = session.send("DOM.getDocument", {"depth": 0})
        node = session.send("DOM.querySelector", {
            "nodeId": document["root"]["nodeId"],
            "selector": f'[data-contrast-probe="{probe}"]',
        })
        result = session.send("CSS.getBackgroundColors", {"nodeId": node["nodeId"]})
        backgrounds = []
        for value in result.get("backgroundColors", []):
            color = parse_color(value)
            backgrounds.append(composite(color, canvas) if color[3] < 1 else color)
        return backgrounds or fallback_background(locator, canvas)
    finally:
        locator.evaluate("el => delete el.dataset.contrastProbe")


def assert_text_contrast(session, locator: Locator, canvas, label: str) -> float:
    locator.wait_for()
    style = locator.evaluate(
        "el => { const s = getComputedStyle(el); return { color: s.color, size: parseFloat(s.fontSize), weight: parseInt(s.fontWeight) || 400 } }"
    )
    minimum = 3.0 if style["size"] >= 24 or (style["size"] >= 18.66 and style["weight"] >= 700) else 4.5
    backgrounds = rendered_backgrounds(session, locator, canvas)
    foreground = parse_color(style["color"])
    ratios = [contrast(composite(foreground, background), background) for background in backgrounds]
    ratio = min(ratios)
    assert ratio >= minimum, {
        "component": label,
        "contrast": round(ratio, 2),
        "minimum": minimum,
        "foreground": style["color"],
        "backgrounds": backgrounds,
    }
    return ratio


def assert_focus_contrast(page: Page, session, locator: Locator, canvas, label: str) -> float:
    locator.focus()
    page.keyboard.press("Tab")
    page.keyboard.press("Shift+Tab")
    style = locator.evaluate(
        "el => { const s = getComputedStyle(el); return { color: s.outlineColor, width: parseFloat(s.outlineWidth), kind: s.outlineStyle } }"
    )
    assert locator.evaluate("el => el.matches(':focus-visible')"), label
    assert style["kind"] != "none" and style["width"] >= 2, {"component": label, **style}
    parent = locator.locator("xpath=..")
    ratio = min(contrast(parse_color(style["color"]), background) for background in rendered_backgrounds(session, parent, canvas))
    assert ratio >= 3.0, {"component": label, "focusContrast": round(ratio, 2), "minimum": 3.0}
    return ratio


def assert_disabled(locator: Locator, label: str) -> None:
    locator.wait_for()
    assert locator.is_disabled(), label
    opacity = float(locator.evaluate("el => getComputedStyle(el).opacity"))
    assert 0.35 <= opacity <= 0.75, {"component": label, "opacity": opacity}


def assert_color(locator: Locator, expected: str, label: str) -> None:
    actual = locator.evaluate("el => getComputedStyle(el).color")
    assert actual == expected, {"component": label, "expected": expected, "actual": actual}


def collect_console_error(errors: list[object], message) -> None:
    if message.type != "error":
        return
    location = message.location
    if (
        message.text == "Failed to load resource: the server responded with a status of 404 (Not Found)"
        and location.get("url", "").endswith("/favicon.ico")
    ):
        return
    errors.append({"text": message.text, "location": location})


def check_page(page: Page, theme: str, background: str) -> int:
    errors: list[object] = []
    http_errors: list[str] = []
    page.on("console", lambda message: collect_console_error(errors, message))
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("response", lambda response: http_errors.append(f"{response.status} {response.url}") if response.status >= 400 else None)
    BASELINE["seed_cache"](page)
    BASELINE["open_library"](page)
    if background == "custom":
        BASELINE["apply_custom_background"](page)

    assert page.locator("html").get_attribute("data-theme") == theme
    assert page.locator(".layout").evaluate("el => el.classList.contains('has-custom-background')") == (background == "custom")
    canvas = resolved_canvas(page)
    session = page.context.new_cdp_session(page)
    session.send("DOM.enable")
    session.send("CSS.enable")
    checks = 0

    scenario = f"{theme}/{background}"
    strong_text = "rgb(17, 24, 39)" if theme == "light" else "rgb(255, 255, 255)"
    for label, locator in (
        ("Library heading", page.locator(".library-hero h2")),
        ("Library muted description", page.locator(".library-hero-description")),
        ("Library primary action", page.locator(".library-ops-action-row .hero-primary-btn")),
        ("Library card title", page.locator(".repo-card:visible h3").first),
    ):
        assert_text_contrast(session, locator, canvas, f"{scenario} {label}")
        checks += 1
    assert_color(page.locator(".search-input").first, strong_text, f"{scenario} Library strong text")
    checks += 1
    assert_focus_contrast(page, session, page.locator(".library-ops-action-row .hero-primary-btn"), canvas, f"{scenario} Library primary focus")
    checks += 1

    card = page.locator(".repo-card:visible").first
    card.click(button="right")
    menu_item = page.locator(".project-actions-popover:visible").get_by_role("menuitem").first
    assert_text_contrast(session, menu_item, canvas, f"{scenario} Repository menu item")
    page.keyboard.press("Escape")
    checks += 1

    page.get_by_role("button", name="Налаштування").click()
    page.get_by_role("heading", name="Налаштування", exact=True).wait_for()
    for label, locator in (
        ("Settings information card", page.locator(".settings-source-summary-copy p").first),
        ("Settings select", page.locator("#theme")),
        ("Settings input", page.locator("#installPath")),
        ("Settings secondary action", page.locator(".settings-background-action--edit").first),
    ):
        assert_text_contrast(session, locator, canvas, f"{scenario} {label}")
        checks += 1
    page.get_by_role("button", name="Перевірити", exact=True).click()
    status = page.locator("#installPath-status")
    assert_text_contrast(session, status, canvas, f"{scenario} Settings status")
    checks += 1

    page.get_by_role("button", name="Про застосунок").click()
    page.get_by_role("heading", name="Про застосунок", exact=True).wait_for()
    assert_color(page.locator(".about-hero-main h3"), strong_text, f"{scenario} About strong text")
    assert_color(page.locator(".about-release-version").first, strong_text, f"{scenario} About release strong text")
    checks += 2
    for label, locator in (
        ("About muted description", page.locator(".about-hero-main > p")),
        ("About status", page.locator(".about-launcher-status strong")),
        ("About information card", page.locator(".about-release-link").first),
    ):
        assert_text_contrast(session, locator, canvas, f"{scenario} {label}")
        checks += 1
    assert_disabled(page.get_by_role("button", name="Очистити"), f"{scenario} About disabled action")
    checks += 1

    page.get_by_role("button", name="Бібліотека").click()
    page.locator(".library-ops-action-row .hero-primary-btn").click()
    modal = page.locator(".release-modal--wizard")
    modal.wait_for()
    for label, locator in (
        ("Install dialog heading", modal.locator(".release-wizard-heading")),
        ("Install information card", modal.locator(".release-version-main span").first),
        ("Install status", modal.locator(".release-status-pill").first),
        ("Install primary action", modal.locator(".release-action-primary")),
    ):
        assert_text_contrast(session, locator, canvas, f"{scenario} {label}")
        checks += 1
    modal.locator(".release-action-primary").click()
    secondary = modal.locator(".release-secondary-btn").first
    assert_text_contrast(session, secondary, canvas, f"{scenario} Install secondary action")
    checks += 1
    assert_focus_contrast(page, session, modal.locator(".release-action-primary"), canvas, f"{scenario} Install primary focus")
    checks += 1

    assert errors == [] and http_errors == [], {
        "theme": theme,
        "background": background,
        "browserErrors": errors,
        "httpErrors": http_errors,
    }
    session.detach()
    return checks


def main() -> None:
    checks = 0
    with sync_playwright() as playwright:
        browser = BASELINE["launch_browser"](playwright)
        for theme in THEMES:
            for background in BACKGROUNDS:
                context = browser.new_context(
                    viewport={"width": 1280, "height": 720},
                    color_scheme=theme,
                    locale="uk-UA",
                    reduced_motion="reduce",
                )
                page = context.new_page()
                checks += check_page(page, theme, background)
                context.close()
        browser.close()
    print(f"[rendered-contrast] scenarios={len(THEMES) * len(BACKGROUNDS)}, checks={checks}: ok")


if __name__ == "__main__":
    main()
