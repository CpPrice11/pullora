from __future__ import annotations

import io
import json
import os
import runpy
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE_HELPER = runpy.run_path(str(ROOT / "scripts" / "capture-visual-baseline.py"))
CURRENT_URL = os.environ.get("PULLORA_CURRENT_URL", "http://127.0.0.1:4173")
REFERENCE_URL = os.environ.get("PULLORA_REFERENCE_URL", "http://127.0.0.1:4174")
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")
LANGUAGES = ("uk", "en")
SCREENS = {
    "library": (
        ".library-sam-list-pane",
        ".library-sam-details-pane",
        ".library-hero",
        ".library-ops-panel",
    ),
    "settings": (
        ".settings-page-header",
        ".settings-workspace",
        ".settings-nav",
        ".settings-content",
    ),
    "about": (
        ".about-hero",
        ".about-panel-wide",
        ".about-release-link",
    ),
    "install": (
        ".release-modal--wizard > .modal-header",
        ".release-wizard-steps",
        ".release-body",
        ".release-nav-actions",
    ),
}
PARITY_REGISTRY = {
    "Library": (
        "check-library-card-states.py",
        "check-library-density.py",
        "check-library-hero-layers.py",
        "check-library-hero-art-parity.py",
        "check-library-surface-controls.py",
        "check-bulk-menu.py",
        "check-destructive-dialog.py",
    ),
    "Install": (
        "check-release-selector-layout.py",
        "check-install-surface-controls.py",
    ),
    "Settings": (
        "check-settings-composition.py",
        "check-select-controls.py",
    ),
    "About": (
        "check-about-composition.py",
        "check-about-release-controls.py",
        "check-about-release-interactions.py",
        "check-about-surface-controls.py",
        "check-about-background-continuity.py",
        "check-launcher-update-safety.py",
    ),
}


def check_source_contract() -> None:
    scripts = ROOT / "scripts"
    for area, checks in PARITY_REGISTRY.items():
        assert checks, area
        for check in checks:
            source = scripts / check
            assert source.is_file(), f"{area}: missing {check}"
            text = source.read_text(encoding="utf-8")
            assert "assert " in text, f"{area}: {check} has no assertions"

    readme = (ROOT / "docs" / "visual-baseline" / "design-contract" / "README.md").read_text(
        encoding="utf-8"
    )
    for heading in (
        "## Реєстр parity-доказів v5.11.0",
        "## Дозволені локальні відмінності від v5.10.1",
    ):
        assert heading in readme, heading
    for area in PARITY_REGISTRY:
        assert f"**{area}**" in readme, area
    print("[v5.11-gates] source registry: ok")


def open_app(page: Page, base_url: str, language: str) -> None:
    BASELINE_HELPER["seed_cache"](page)
    page.goto(base_url, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    skip = page.locator(".modal-actions .secondary-btn")
    if skip.is_visible():
        skip.click()
    page.get_by_text("steam-achievement-manager", exact=True).first.wait_for()
    page.add_style_tag(
        content="*,*::before,*::after{animation:none!important;transition:none!important}.library-diagnostics{display:none!important}"
    )
    page.evaluate(
        "language => window.dispatchEvent(new CustomEvent('pullora-language-change', { detail: { language } }))",
        language,
    )
    page.wait_for_function("language => document.documentElement.lang === language", arg=language)


def open_screen(page: Page, screen: str) -> None:
    if screen == "library":
        page.locator(".library-page").wait_for()
    elif screen == "settings":
        page.locator(".nav-item").nth(1).click()
        page.locator(".settings-page").wait_for()
    elif screen == "about":
        page.locator(".nav-item").nth(2).click()
        page.locator(".about-page").wait_for()
        page.locator(".about-release-link").first.wait_for()
    elif screen == "install":
        page.locator(".hero-primary-btn:visible").first.click()
        page.locator(".release-modal--wizard").wait_for()
        page.locator(".release-version-card").first.wait_for()
        page.locator(".release-nav-actions").first.wait_for()
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
    else:
        raise AssertionError(screen)


def rounded_box(locator) -> dict:
    box = locator.first.evaluate(
        "el => { const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height } }"
    )
    return {key: round(value, 1) for key, value in box.items()}


def audit_accessibility(page: Page, screen: str, language: str) -> dict:
    audit = page.evaluate(
        """
        () => {
          const visible = element => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
          };
          const name = element =>
            element.getAttribute('aria-label') ||
            (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ') ||
            element.labels?.[0]?.textContent ||
            element.textContent ||
            element.getAttribute('title') || '';
          const interactives = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="menuitem"]')]
            .filter(visible);
          const unnamed = interactives.filter(element => !name(element).trim()).map(element => element.outerHTML.slice(0, 160));
          const positiveTabindex = [...document.querySelectorAll('[tabindex]')]
            .filter(element => Number(element.getAttribute('tabindex')) > 0)
            .map(element => element.outerHTML.slice(0, 160));
          const unlabeledFields = [...document.querySelectorAll('input,select,textarea')]
            .filter(visible)
            .filter(element => !name(element).trim())
            .map(element => element.outerHTML.slice(0, 160));
          const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(element => ({
            modal: element.getAttribute('aria-modal'),
            labelled: Boolean(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')),
          }));
          const root = document.querySelector('.layout-content');
          return {
            interactiveCount: interactives.length,
            unnamed,
            positiveTabindex,
            unlabeledFields,
            dialogs,
            horizontalOverflow: root ? Math.max(0, root.scrollWidth - root.clientWidth) : 0,
          };
        }
        """
    )
    assert not audit["unnamed"], {screen: audit["unnamed"]}
    assert not audit["positiveTabindex"], {screen: audit["positiveTabindex"]}
    assert not audit["unlabeledFields"], {screen: audit["unlabeledFields"]}
    assert audit["horizontalOverflow"] <= 1, {screen: audit["horizontalOverflow"]}
    for dialog in audit["dialogs"]:
        assert dialog["modal"] == "true" and dialog["labelled"], {screen: dialog}

    page.keyboard.press("Tab")
    focus = page.evaluate(
        """
        () => {
          const element = document.activeElement;
          const style = getComputedStyle(element);
          return {
            tag: element?.tagName,
            outlineStyle: style.outlineStyle,
            outlineWidth: Number.parseFloat(style.outlineWidth),
            outlineColor: style.outlineColor,
          };
        }
        """
    )
    assert focus["tag"] not in (None, "BODY"), {screen: focus}
    assert focus["outlineStyle"] != "none" and focus["outlineWidth"] >= 2, {screen: focus}

    motion = page.locator(".modal-content:visible, .page:visible").first.evaluate(
        """
        element => {
          const style = getComputedStyle(element);
          const durations = `${style.animationDuration},${style.transitionDuration}`
            .split(',')
            .map(value => value.trim().endsWith('ms') ? Number.parseFloat(value) / 1000 : Number.parseFloat(value));
          return Math.max(...durations.filter(Number.isFinite), 0);
        }
        """
    )
    assert motion <= 0.01, {screen: motion}

    nav = page.locator(".nav-label").all_inner_texts()
    expected = "Library" if language == "en" else "Бібліотека"
    assert any(expected in item for item in nav), {language: nav}
    return {**audit, "focus": focus, "maxMotionSeconds": motion}


def screen_state(page: Page, screen: str, language: str) -> dict:
    selectors = SCREENS[screen]
    boxes = {}
    for selector in selectors:
        locator = page.locator(selector)
        assert locator.count() > 0, {screen: selector}
        boxes[selector] = rounded_box(locator)
    screenshot = page.screenshot(animations="disabled")
    accessibility = audit_accessibility(page, screen, language)
    return {"boxes": boxes, "screenshot": screenshot, "accessibility": accessibility}


def geometry_delta(selector: str, reference: dict, current: dict) -> float:
    keys = ("x", "width", "height") if selector == ".release-modal--wizard > .modal-header" else (
        "x",
        "y",
        "width",
        "height",
    )
    return max(abs(reference[key] - current[key]) for key in keys)


def pixel_difference(reference: bytes, current: bytes) -> float:
    before = Image.open(io.BytesIO(reference)).convert("RGB")
    after = Image.open(io.BytesIO(current)).convert("RGB")
    assert before.size == after.size
    difference = ImageChops.difference(before, after)
    changed = sum(1 for pixel in difference.get_flattened_data() if max(pixel) > 12)
    return round(changed / (before.width * before.height), 4)


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    results = []
    with sync_playwright() as playwright:
        themes = ("dark",) if "--debug-install" in sys.argv else THEMES
        viewports = ((1920, 1080),) if "--debug-install" in sys.argv else VIEWPORTS
        languages = ("en",) if "--debug-install" in sys.argv else LANGUAGES
        screens = {"install": SCREENS["install"]} if "--debug-install" in sys.argv else SCREENS
        for theme in themes:
            for width, height in viewports:
                for language in languages:
                    browser = playwright.chromium.launch(headless=True)
                    try:
                        for screen, selectors in screens.items():
                            states = {}
                            for version, base_url in (("reference", REFERENCE_URL), ("current", CURRENT_URL)):
                                context = browser.new_context(
                                    viewport={"width": width, "height": height},
                                    color_scheme=theme,
                                    locale="en-US" if language == "en" else "uk-UA",
                                    reduced_motion="reduce",
                                )
                                page = context.new_page()
                                open_app(page, base_url, language)
                                open_screen(page, screen)
                                states[version] = screen_state(page, screen, language)
                                context.close()

                            deltas = {
                                selector: geometry_delta(
                                    selector,
                                    states["reference"]["boxes"][selector],
                                    states["current"]["boxes"][selector],
                                )
                                for selector in selectors
                            }
                            assert max(deltas.values()) <= 2, {
                                "theme": theme,
                                "viewport": [width, height],
                                "language": language,
                                "screen": screen,
                                "deltas": deltas,
                                "reference": states["reference"]["boxes"],
                                "current": states["current"]["boxes"],
                            }
                            results.append(
                                {
                                    "theme": theme,
                                    "viewport": [width, height],
                                    "language": language,
                                    "screen": screen,
                                    "maxGeometryDelta": max(deltas.values()),
                                    "pixelDifference": pixel_difference(
                                        states["reference"]["screenshot"],
                                        states["current"]["screenshot"],
                                    ),
                                }
                            )
                    finally:
                        browser.close()

    print(
        json.dumps(
            {
                "checks": len(results),
                "maxGeometryDelta": max(item["maxGeometryDelta"] for item in results),
                "pixelDifferenceByScreen": {
                    screen: {
                        "min": min(item["pixelDifference"] for item in results if item["screen"] == screen),
                        "max": max(item["pixelDifference"] for item in results if item["screen"] == screen),
                    }
                    for screen in screens
                },
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
