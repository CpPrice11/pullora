from __future__ import annotations

import base64
import json
import runpy
import sys
from pathlib import Path

if "--static" not in sys.argv:
    from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE = {} if "--static" in sys.argv else runpy.run_path(
    str(ROOT / "scripts" / "capture-visual-baseline.py")
)
VIEWPORTS = ((1000, 700, 1), (1280, 720, 1.25), (1920, 1080, 1.5))
DENSITIES = (
    ("normal", "compact", "0.86"),
    ("normal", "comfortable", "1"),
    ("normal", "spacious", "1.12"),
    ("compact", "compact", "0.86"),
    ("compact", "comfortable", "1"),
    ("compact", "spacious", "1.12"),
)
FOCUS = ("23%", "68%")


def svg_data_url(width: int, height: int, colors: tuple[str, str]) -> str:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}"><defs><linearGradient id="g">'
        f'<stop stop-color="{colors[0]}"/><stop offset="1" stop-color="{colors[1]}"/>'
        f'</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>'
    )
    payload = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{payload}"


HERO_BACKGROUND = svg_data_url(1600, 900, ("#193c66", "#9d4f88"))
HERO_COVER = svg_data_url(512, 512, ("#55d6ff", "#17243a"))


def css_rule(source: str, selector: str) -> str:
    start = source.rfind(selector)
    assert start >= 0, f"Missing CSS selector: {selector}"
    block_start = source.find("{", start)
    block_end = source.find("}", block_start)
    assert block_start >= 0 and block_end >= 0
    return source[block_start + 1:block_end]


def check_source_contract() -> None:
    styles = (ROOT / "src" / "pages" / "PageStyles.css").read_text(encoding="utf-8")
    app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
    layout = (ROOT / "src" / "components" / "Layout" / "Layout.tsx").read_text(encoding="utf-8")
    library_page = (ROOT / "src" / "features" / "library" / "LibraryPage.tsx").read_text(encoding="utf-8")
    library_hero = (ROOT / "src" / "features" / "library" / "components" / "LibraryHero.tsx").read_text(encoding="utf-8")
    hero_selector = ".cinematic-shell .library-page .library-hero {"
    background_selector = ".cinematic-shell .library-page .library-hero-background {"
    final_background_start = styles.rfind(background_selector)
    hero_rule = css_rule(styles[:final_background_start], hero_selector)
    background_rule = css_rule(
        styles,
        background_selector,
    )
    cover_rule = css_rule(
        styles,
        ".cinematic-shell .library-page .library-hero--art .library-hero-cover img,",
    )

    for fragment in (
        "background-image: var(--library-hero-background, none)",
        "background-position: var(--art-focus-x, 50%) var(--art-focus-y, 50%)",
        "background-repeat: no-repeat",
        "background-size: cover",
        "transform: scale(var(--art-zoom, 1))",
    ):
        assert fragment in background_rule, {"missing": fragment, "rule": background_rule}
    for fragment in ("display: block", "object-fit: cover", "object-position: center center"):
        assert fragment in cover_rule, {"missing": fragment, "rule": cover_rule}

    for fragment in ("isolation: isolate", "overflow: hidden"):
        assert fragment in hero_rule, {"missing": fragment, "rule": hero_rule}

    assert app.count("backgroundImage={visibleBackground}") == 1
    assert "backgroundImage={visibleBackground}" in app
    assert "className={`cinematic-background" in layout
    assert "backgroundImage: toCssUrl(backgroundImage)" in layout
    assert "launcherBackground" not in library_page
    assert "fallbackToCover: false" in library_page
    assert '<div className="library-hero-background" style={backgroundStyle}' in library_hero
    assert "<section\n      style={backgroundStyle}" not in library_hero

    assert ":root[data-theme='light'] .library-hero-background {" not in styles
    assert ":root[data-theme='light'] .cinematic-shell .library-page .library-hero-background," not in styles
    print("[library-hero-art] source contract: ok")


def apply_project_art(page: Page) -> None:
    page.locator(".library-hero").evaluate(
        """(hero, art) => {
          hero.classList.remove('library-hero--fallback');
          hero.classList.add('library-hero--art');
          hero.querySelector('.library-hero-background')
            .style.setProperty('--library-hero-background', `url("${art.background}")`);
          const background = hero.querySelector('.library-hero-background');
          background.style.setProperty('--art-focus-x', art.focusX);
          background.style.setProperty('--art-focus-y', art.focusY);
          background.style.setProperty('--art-zoom', '1');
          const cover = hero.querySelector('.library-hero-cover img');
          cover.style.setProperty('--art-focus-x', '50%');
          cover.style.setProperty('--art-focus-y', '50%');
          cover.style.setProperty('--art-zoom', '1');
          hero.querySelector('.library-hero-cover img').src = art.cover;
        }""",
        {
            "background": HERO_BACKGROUND,
            "cover": HERO_COVER,
            "focusX": FOCUS[0],
            "focusY": FOCUS[1],
        },
    )
    page.locator(".library-hero-cover img").evaluate(
        "img => img.complete ? Promise.resolve() : new Promise(resolve => img.addEventListener('load', resolve, { once: true }))"
    )


def rounded_box(locator) -> list[float]:
    box = locator.bounding_box()
    assert box is not None
    return [round(box[key], 2) for key in ("x", "y", "width", "height")]


def assert_centered_inset(inner: list[float], outer: list[float], label: str) -> None:
    left = inner[0] - outer[0]
    top = inner[1] - outer[1]
    right = outer[0] + outer[2] - inner[0] - inner[2]
    bottom = outer[1] + outer[3] - inner[1] - inner[3]
    assert all(0 <= value <= 2 for value in (left, top, right, bottom)), {
        label: inner,
        "outer": outer,
        "insets": [left, top, right, bottom],
    }


def set_density(page: Page, library_density: str, app_density: str, density_scale: str) -> None:
    page.locator(".library-page").evaluate(
        """(element, density) => {
          element.classList.remove('library-density-normal', 'library-density-compact');
          element.classList.add(`library-density-${density}`);
        }""",
        library_density,
    )
    page.locator("html").evaluate(
        "(element, scale) => element.style.setProperty('--density-scale', scale)",
        density_scale,
    )


def inspect_hero(
    page: Page,
    width: int,
    height: int,
    device_scale_factor: float,
    library_density: str,
    app_density: str,
) -> dict:
    hero = page.locator(".library-hero")
    background = hero.locator(":scope > .library-hero-background")
    cover = hero.locator(".library-hero-cover")
    image = cover.locator("img")
    styles = page.evaluate(
        """() => {
          const background = getComputedStyle(document.querySelector('.library-hero-background'));
          const image = getComputedStyle(document.querySelector('.library-hero-cover img'));
          return {
            backgroundImage: background.backgroundImage,
            backgroundPosition: background.backgroundPosition,
            backgroundRepeat: background.backgroundRepeat,
            backgroundSize: background.backgroundSize,
            imageDisplay: image.display,
            imageFit: image.objectFit,
            imagePosition: image.objectPosition,
          };
        }"""
    )

    assert styles["backgroundImage"].startswith('url("data:image/svg+xml;base64,'), styles
    expected_focus = f"{FOCUS[0]} {FOCUS[1]}"
    assert styles["backgroundPosition"] == expected_focus, styles
    assert styles["backgroundRepeat"] == "no-repeat", styles
    assert styles["backgroundSize"] == "cover", styles
    assert styles["imageDisplay"] == "block", styles
    assert styles["imageFit"] == "cover", styles
    assert styles["imagePosition"] == "50% 50%", styles

    boxes = {
        "hero": rounded_box(hero),
        "background": rounded_box(background),
        "cover": rounded_box(cover),
        "image": rounded_box(image),
    }
    assert_centered_inset(boxes["background"], boxes["hero"], "background")
    assert_centered_inset(boxes["image"], boxes["cover"], "image")
    assert page.viewport_size == {"width": width, "height": height}
    assert page.evaluate("window.devicePixelRatio") == device_scale_factor
    return {
        "viewport": [width, height],
        "scale": device_scale_factor,
        "libraryDensity": library_density,
        "appDensity": app_density,
        "styles": styles,
        "boxes": boxes,
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in ("dark", "light"):
            for width, height, device_scale_factor in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme=theme,
                    locale="uk-UA",
                    device_scale_factor=device_scale_factor,
                )
                page = context.new_page()
                BASELINE["seed_cache"](page)
                BASELINE["open_library"](page)
                apply_project_art(page)
                for library_density, app_density, density_scale in DENSITIES:
                    set_density(page, library_density, app_density, density_scale)
                    results.append({
                        "theme": theme,
                        **inspect_hero(
                            page,
                            width,
                            height,
                            device_scale_factor,
                            library_density,
                            app_density,
                        ),
                    })
                context.close()
        browser.close()

    for width, height, device_scale_factor in VIEWPORTS:
        for library_density, app_density, _density_scale in DENSITIES:
            matching = [
                item for item in results
                if item["viewport"] == [width, height]
                and item["scale"] == device_scale_factor
                and item["libraryDensity"] == library_density
                and item["appDensity"] == app_density
            ]
            dark = next(item for item in matching if item["theme"] == "dark")
            light = next(item for item in matching if item["theme"] == "light")
            assert dark["styles"] == light["styles"], {"dark": dark, "light": light}
            assert dark["boxes"] == light["boxes"], {"dark": dark, "light": light}

    print(json.dumps({"checks": len(results), "viewports": VIEWPORTS, "densities": DENSITIES}, ensure_ascii=False))


if __name__ == "__main__":
    main()
