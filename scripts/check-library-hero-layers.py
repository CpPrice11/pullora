from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "scripts" / "capture-visual-baseline.py"
OUTPUT_DIR = ROOT / "docs" / "visual-baseline" / "design-contract"
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")


def load_baseline():
    spec = importlib.util.spec_from_file_location("pullora_visual_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Не вдалося завантажити visual baseline helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rounded_box(locator) -> dict:
    box = locator.bounding_box()
    assert box is not None
    return {key: round(value, 2) for key, value in box.items()}


def assert_same_box(expected: dict, actual: dict, label: str) -> None:
    for key in ("x", "y", "width", "height"):
        assert abs(expected[key] - actual[key]) <= 0.5, {
            "layer": label,
            "property": key,
            "hero": expected,
            "actual": actual,
        }


def inspect_layers(page: Page) -> dict:
    hero = page.locator(".library-hero")
    background = hero.locator(":scope > .library-hero-background")
    gradient = hero.locator(":scope > .library-hero-gradient")
    accent = hero.locator(":scope > .library-hero-accent")
    content = hero.locator(":scope > .library-hero-content")

    assert background.count() == gradient.count() == accent.count() == content.count() == 1
    assert content.evaluate("el => getComputedStyle(el).display") == "contents"
    assert hero.evaluate("el => getComputedStyle(el).overflow") == "hidden"
    assert hero.evaluate("el => getComputedStyle(el, '::before').content") in ("none", "normal")
    assert hero.evaluate("el => getComputedStyle(el, '::after').content") in ("none", "normal")
    assert page.locator(".library-page").evaluate(
        "el => el.style.getPropertyValue('--library-hero-background')"
    ) == ""
    assert page.locator(".layout").evaluate(
        "el => el.style.getPropertyValue('--library-hero-background')"
    ) == ""

    hero_box = rounded_box(hero)
    layer_boxes = {
        "background": rounded_box(background),
        "gradient": rounded_box(gradient),
        "accent": rounded_box(accent),
    }
    inner_box = layer_boxes["background"]
    assert 0 <= inner_box["x"] - hero_box["x"] <= 1.5
    assert 0 <= inner_box["y"] - hero_box["y"] <= 1.5
    assert 0 <= hero_box["x"] + hero_box["width"] - inner_box["x"] - inner_box["width"] <= 1.5
    assert 0 <= hero_box["y"] + hero_box["height"] - inner_box["y"] - inner_box["height"] <= 1.5
    for label, box in layer_boxes.items():
        assert_same_box(inner_box, box, label)

    cover_box = rounded_box(hero.locator(".library-hero-cover"))
    main_box = rounded_box(hero.locator(".library-hero-main"))
    for label, box in (("cover", cover_box), ("main", main_box)):
        assert box["x"] >= hero_box["x"] - 0.5, {label: box, "hero": hero_box}
        assert box["y"] >= hero_box["y"] - 0.5, {label: box, "hero": hero_box}
        assert box["x"] + box["width"] <= hero_box["x"] + hero_box["width"] + 0.5
        assert box["y"] + box["height"] <= hero_box["y"] + hero_box["height"] + 0.5

    z_indexes = hero.locator(
        ".library-hero-background, .library-hero-gradient, .library-hero-accent, .library-hero-cover, .library-hero-main"
    ).evaluate_all("els => Object.fromEntries(els.map(el => [el.className, getComputedStyle(el).zIndex]))")
    assert int(z_indexes["library-hero-background"]) < int(z_indexes["library-hero-cover"])
    assert int(z_indexes["library-hero-gradient"]) < int(z_indexes["library-hero-main"])
    assert int(z_indexes["library-hero-accent"]) < int(z_indexes["library-hero-main"])

    global_before = page.locator(".cinematic-background").evaluate(
        "el => ({ backgroundImage: getComputedStyle(el).backgroundImage, opacity: getComputedStyle(el).opacity })"
    )
    root_before = hero.evaluate("el => getComputedStyle(el).backgroundImage")
    gradient_before = gradient.evaluate("el => getComputedStyle(el).backgroundImage")
    cover_before = hero.locator(".library-hero-cover img").get_attribute("src")
    background.evaluate(
        "el => el.style.setProperty('--library-hero-background', 'linear-gradient(rgb(12, 34, 56), rgb(12, 34, 56))')"
    )
    local_background = background.evaluate("el => getComputedStyle(el).backgroundImage")
    assert "rgb(12, 34, 56)" in local_background, local_background
    assert page.locator(".library-page").evaluate(
        "el => getComputedStyle(el).getPropertyValue('--library-hero-background')"
    ) == ""
    assert hero.evaluate("el => getComputedStyle(el).backgroundImage") == root_before
    assert gradient.evaluate("el => getComputedStyle(el).backgroundImage") == gradient_before
    assert hero.locator(".library-hero-cover img").get_attribute("src") == cover_before
    assert page.locator(".cinematic-background").evaluate(
        "el => ({ backgroundImage: getComputedStyle(el).backgroundImage, opacity: getComputedStyle(el).opacity })"
    ) == global_before
    background.evaluate("el => el.style.removeProperty('--library-hero-background')")

    operations_box = rounded_box(page.locator(".library-ops-panel"))
    overview_box = rounded_box(page.locator(".library-inline-overview-grid"))
    assert page.locator(".library-inline-panel--versions").count() == 1
    assert page.locator(".library-inline-panel--details").count() == 1

    return {
        "hero": hero_box,
        "layers": layer_boxes,
        "cover": cover_box,
        "main": main_box,
        "operations": operations_box,
        "overview": overview_box,
        "zIndexes": z_indexes,
    }


def check_context(page: Page, theme: str, width: int, height: int, baseline) -> dict:
    baseline.seed_cache(page)
    baseline.open_library(page)
    normal = inspect_layers(page)
    page.screenshot(path=OUTPUT_DIR / f"library-hero-layers-{theme}-{width}x{height}-normal.png")

    page.locator(".library-ops-action-row .hero-primary-btn").click()
    page.locator(".release-modal").wait_for()
    page.locator(".release-modal .close-btn").click()
    page.locator(".release-modal").wait_for(state="hidden")

    page.locator(".library-density-toggle button").nth(1).click()
    page.locator(".library-page.library-density-compact").wait_for()
    compact = inspect_layers(page)
    page.screenshot(path=OUTPUT_DIR / f"library-hero-layers-{theme}-{width}x{height}-compact.png")
    return {"theme": theme, "viewport": [width, height], "normal": normal, "compact": compact}


def main() -> None:
    baseline = load_baseline()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
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
                results.append(check_context(page, theme, width, height, baseline))
                context.close()
        browser.close()

    for width, height in VIEWPORTS:
        dark = next(item for item in results if item["theme"] == "dark" and item["viewport"] == [width, height])
        light = next(item for item in results if item["theme"] == "light" and item["viewport"] == [width, height])
        assert dark["normal"]["hero"] == light["normal"]["hero"]
        assert dark["compact"]["hero"] == light["compact"]["hero"]
        assert dark["normal"]["operations"] == light["normal"]["operations"]
        assert dark["normal"]["overview"] == light["normal"]["overview"]
        assert dark["compact"]["operations"] == light["compact"]["operations"]
        assert dark["compact"]["overview"] == light["compact"]["overview"]
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
