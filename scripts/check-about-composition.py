from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "scripts" / "capture-visual-baseline.py"
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")


def load_baseline():
    spec = importlib.util.spec_from_file_location("pullora_visual_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load visual baseline helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_source_contract() -> None:
    source = (ROOT / "src/pages/AboutPage.tsx").read_text(encoding="utf-8")
    ordered_fragments = (
        '<div className="page about-page">',
        '<div className="page-header">',
        '<section className="about-hero">',
        '<h3>Pullora</h3>',
        '<div className="about-hero-meta">',
        '<span className="about-current-version-chip">',
        '<div className="about-hero-actions"',
        'onClick={openLauncherFolder}',
        'onClick={openLatestRelease}',
        '<div className="about-grid">',
        '<section className="about-panel about-panel-wide">',
        '<div className="about-release-list">',
    )
    positions = [source.find(fragment) for fragment in ordered_fragments]
    assert all(position >= 0 for position in positions), dict(zip(ordered_fragments, positions))
    assert positions == sorted(positions), positions
    assert "about-workspace" not in source
    assert "about-page-frame" not in source
    print("[about-composition] source contract: ok")


def rounded_box(locator) -> dict:
    box = locator.bounding_box()
    assert box is not None
    return {key: round(value, 2) for key, value in box.items()}


def assert_inside(inner: dict, outer: dict, label: str) -> None:
    assert inner["x"] >= outer["x"] - 0.5, {label: inner, "outer": outer}
    assert inner["y"] >= outer["y"] - 0.5, {label: inner, "outer": outer}
    assert inner["x"] + inner["width"] <= outer["x"] + outer["width"] + 0.5, {
        label: inner,
        "outer": outer,
    }
    assert inner["y"] + inner["height"] <= outer["y"] + outer["height"] + 0.5, {
        label: inner,
        "outer": outer,
    }


def open_about(page: Page, baseline) -> None:
    baseline.seed_cache(page)
    baseline.open_library(page)
    baseline.apply_custom_background(page)
    page.locator(".nav-item").nth(2).click()
    page.locator(".about-page").wait_for()
    page.locator(".about-release-link").first.wait_for()


def inspect_composition(page: Page, width: int, height: int) -> dict:
    root = page.locator(".about-page")
    header = root.locator(":scope > .page-header")
    hero = root.locator(":scope > .about-hero")
    grid = root.locator(":scope > .about-grid")
    panel = grid.locator(":scope > .about-panel-wide")
    hero_mark = hero.locator(":scope > .about-hero-mark")
    hero_main = hero.locator(":scope > .about-hero-main")
    hero_actions = hero.locator(":scope > .about-hero-actions")
    product_name = hero_main.locator(":scope > h3")
    product_description = hero_main.locator(":scope > p")
    version_meta = hero_main.locator(":scope > .about-hero-meta")
    version_values = version_meta.locator(":scope > span")
    current_version = version_meta.locator(":scope > .about-current-version-chip")
    action_buttons = hero_actions.locator(":scope > button")
    heading = panel.locator(":scope > .about-version-heading")
    filters = heading.locator(".about-version-filters")
    toolbar = panel.locator(":scope > .about-panel-toolbar")
    release = panel.locator(".about-release-link").first

    assert header.count() == hero.count() == grid.count() == panel.count() == 1
    assert hero_mark.count() == hero_main.count() == hero_actions.count() == 1
    assert product_name.count() == product_description.count() == version_meta.count() == 1
    assert current_version.count() == 1 and version_values.count() == 2
    assert action_buttons.count() == 2
    assert heading.count() == filters.count() == toolbar.count() == release.count() == 1

    assert product_name.inner_text().strip() == "Pullora"
    assert product_description.inner_text().strip()
    assert all(version_values.nth(index).inner_text().strip() for index in range(version_values.count()))
    assert all(":" in version_values.nth(index).inner_text() for index in range(version_values.count()))
    assert action_buttons.nth(0).is_enabled() and action_buttons.nth(1).is_enabled()
    action_labels = [action_buttons.nth(index).inner_text().strip() for index in range(2)]
    assert all(action_labels) and action_labels[0] != action_labels[1], action_labels

    action_buttons.nth(0).focus()
    page.keyboard.press("Tab")
    assert action_buttons.nth(1).evaluate("el => el === document.activeElement")

    boxes = {
        "root": rounded_box(root),
        "header": rounded_box(header),
        "hero": rounded_box(hero),
        "heroMark": rounded_box(hero_mark),
        "heroMain": rounded_box(hero_main),
        "heroActions": rounded_box(hero_actions),
        "grid": rounded_box(grid),
        "panel": rounded_box(panel),
        "heading": rounded_box(heading),
        "filters": rounded_box(filters),
        "toolbar": rounded_box(toolbar),
        "release": rounded_box(release),
    }

    assert boxes["header"]["y"] <= boxes["hero"]["y"] <= boxes["grid"]["y"]
    for label in ("heroMark", "heroMain", "heroActions"):
        assert_inside(boxes[label], boxes["hero"], label)
    for label in ("heading", "filters", "toolbar", "release"):
        assert_inside(boxes[label], boxes["panel"], label)
    assert_inside(boxes["panel"], boxes["grid"], "panel")

    overflow = root.evaluate(
        """el => ({
          root: el.scrollWidth - el.clientWidth,
          content: el.closest('.layout-content').scrollWidth - el.closest('.layout-content').clientWidth,
        })"""
    )
    assert overflow["root"] <= 1 and overflow["content"] <= 1, overflow

    background = page.locator(".cinematic-background")
    assert background.evaluate("el => el.classList.contains('is-visible')")
    assert float(background.evaluate("el => getComputedStyle(el).opacity")) > 0

    viewport = page.viewport_size
    assert viewport == {"width": width, "height": height}
    return {
        "viewport": [width, height],
        "boxes": boxes,
        "overflow": overflow,
        "productHeader": {
            "name": product_name.inner_text().strip(),
            "versions": [version_values.nth(index).inner_text().strip() for index in range(2)],
            "actions": action_labels,
        },
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return
    baseline = load_baseline()
    results = []
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
                open_about(page, baseline)
                results.append({"theme": theme, **inspect_composition(page, width, height)})
                context.close()
        browser.close()

    for width, height in VIEWPORTS:
        dark = next(item for item in results if item["theme"] == "dark" and item["viewport"] == [width, height])
        light = next(item for item in results if item["theme"] == "light" and item["viewport"] == [width, height])
        assert dark["boxes"] == light["boxes"], {
            "viewport": [width, height],
            "dark": dark["boxes"],
            "light": light["boxes"],
        }
        assert dark["productHeader"] == light["productHeader"]

    print(json.dumps({"checks": len(results), "viewports": VIEWPORTS}, ensure_ascii=False))


if __name__ == "__main__":
    main()
