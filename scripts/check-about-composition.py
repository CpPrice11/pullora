from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "scripts" / "capture-visual-baseline.py"
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")
MOCK_CURRENT_VERSION = "5.16.1"
MOCK_LATEST_VERSION = "5.10.1"


def load_baseline():
    spec = importlib.util.spec_from_file_location("pullora_visual_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load visual baseline helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_source_contract() -> None:
    source = (ROOT / "src/pages/AboutPage.tsx").read_text(encoding="utf-8")
    page_styles = (ROOT / "src/pages/PageStyles.css").read_text(encoding="utf-8")
    theme_styles = (ROOT / "src/styles/Cinematic.css").read_text(encoding="utf-8")
    ordered_fragments = (
        '<div className="page about-page">',
        '<h2 className="visually-hidden">{t(\'about.title\')}</h2>',
        '<section className="about-hero">',
        '<h3>Pullora</h3>',
        '<div className="about-hero-meta">',
        'className={`about-launcher-status about-launcher-status--${launcherStatus}`}',
        '<span className="about-installation-mode">',
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
    assert "CloseIcon" in source and "MoreHorizontalIcon" in source and "StatusIcon" in source
    assert "from '../components/ui/Icons'" in source
    assert source.count('<CloseIcon className="dialog-close-icon" />') == 3
    assert 'className="about-launcher-status-icon"' in source
    assert "<StatusIcon kind={actionToastToneRef.current} />" in source
    assert "about-launcher-status-dot" not in source
    assert "window.confirm" not in source
    assert 'role="alertdialog"' in source
    assert "storageInfo.updateCacheCount + Math.max(storageInfo.backupCount - 1, 0)" in source
    assert "t('about.cleanupFiles')" in source
    assert "formatBytes(storageInfo.cleanupBytes, language)" in source
    hero_start = source.index('<section className="about-hero">')
    hero_end = source.index('</section>', hero_start)
    panel_meta_start = source.index('<span className="about-panel-meta">')
    panel_meta_end = source.index('</span>', panel_meta_start)
    assert "t('refresh.updatedAt'" in source[hero_start:hero_end]
    assert "refresh.updatedAt" not in source[panel_meta_start:panel_meta_end]
    assert "{canInstallLatest && (" in source
    assert "{hasNewerRelease && (" not in source
    assert 'disabled={updating}' in source
    assert 'disabled={!canInstallLatest || updating}' not in source
    assert "import appIcon" in source
    assert '<img src={appIcon} alt="" />' in source
    assert "font-family" not in source
    assert "data-theme" not in source
    assert "border-radius: var(--surface-radius-shell);" in page_styles

    theme_about_rules = re.findall(
        r"([^{}]*data-theme='light'[^{}]*about[^{}]*)\{([^{}]*)\}",
        page_styles,
    )
    forbidden_layout_properties = {
        "align-content", "align-items", "align-self", "bottom", "display", "flex",
        "flex-basis", "flex-direction", "flex-flow", "flex-grow", "flex-shrink",
        "flex-wrap", "font-size", "gap", "grid", "grid-area", "grid-auto-columns",
        "grid-auto-flow", "grid-auto-rows", "grid-column", "grid-row",
        "grid-template", "grid-template-areas", "grid-template-columns",
        "grid-template-rows", "height", "inset", "justify-content", "justify-items",
        "justify-self", "left", "line-height", "margin", "max-height", "max-width",
        "min-height", "min-width", "order", "overflow", "padding", "position",
        "right", "top", "transform", "width",
    }
    assert theme_about_rules
    for selector, body in theme_about_rules:
        properties = {
            declaration.split(":", 1)[0].strip()
            for declaration in body.split(";")
            if ":" in declaration
        }
        forbidden = properties & forbidden_layout_properties
        assert not forbidden, {"selector": selector.strip(), "layoutProperties": sorted(forbidden)}

    hero_rule = re.search(
        r":root\[data-theme\] \.cinematic-shell \.about-hero\s*\{([^}]*)\}",
        theme_styles,
    )
    mark_rule = re.search(
        r":root\[data-theme\] \.cinematic-shell \.about-hero-mark\s*\{([^}]*)\}",
        theme_styles,
    )
    assert hero_rule is not None
    assert "inset 0 1px 0" in hero_rule.group(1)
    assert "var(--surface-shadow)" in hero_rule.group(1)
    assert mark_rule is not None
    assert "inset 0 1px 0" in mark_rule.group(1)
    assert "var(--color-primary)" in mark_rule.group(1)
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
    hidden_heading = root.locator(":scope > .visually-hidden")
    hero = root.locator(":scope > .about-hero")
    grid = root.locator(":scope > .about-grid")
    panel = grid.locator(":scope > .about-panel-wide")
    hero_mark = hero.locator(":scope > .about-hero-mark")
    hero_main = hero.locator(":scope > .about-hero-main")
    hero_actions = hero.locator(":scope > .about-hero-actions")
    product_name = hero_main.locator(":scope > h3")
    product_description = hero_main.locator(":scope > p")
    version_meta = hero_main.locator(":scope > .about-hero-meta")
    launcher_status = version_meta.locator(":scope > .about-launcher-status")
    status_title = launcher_status.locator(":scope > strong")
    version_relation = launcher_status.locator(":scope > span:last-child")
    installation_mode = version_meta.locator(":scope > .about-installation-mode")
    action_buttons = hero_actions.locator(":scope > button")
    heading = panel.locator(":scope > .about-version-heading")
    filters = heading.locator(".about-version-filters")
    toolbar = panel.locator(":scope > .about-panel-toolbar")
    release = panel.locator(".about-release-link").first

    assert hidden_heading.count() == hero.count() == grid.count() == panel.count() == 1
    assert hidden_heading.inner_text().strip()
    assert hero_mark.count() == hero_main.count() == hero_actions.count() == 1
    assert product_name.count() == product_description.count() == version_meta.count() == 1
    assert launcher_status.count() == status_title.count() == version_relation.count() == 1
    assert installation_mode.count() <= 1
    assert action_buttons.count() in (2, 3)
    assert heading.count() == filters.count() == toolbar.count() == release.count() == 1

    assert product_name.inner_text().strip() == "Pullora"
    assert product_description.inner_text().strip()
    assert status_title.inner_text().strip()
    assert MOCK_CURRENT_VERSION in version_relation.inner_text()
    assert MOCK_LATEST_VERSION in version_relation.inner_text()
    assert launcher_status.get_attribute("role") == "status"
    assert launcher_status.get_attribute("aria-live") == "polite"
    assert action_buttons.nth(-2).is_enabled() and action_buttons.nth(-1).is_enabled()
    action_labels = [action_buttons.nth(index).inner_text().strip() for index in range(2)]
    assert all(action_labels) and action_labels[0] != action_labels[1], action_labels

    action_buttons.nth(0).focus()
    page.keyboard.press("Tab")
    assert action_buttons.nth(1).evaluate("el => el === document.activeElement")

    boxes = {
        "root": rounded_box(root),
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

    assert boxes["hero"]["y"] <= boxes["grid"]["y"]
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

    background = page.locator(".cinematic-background.is-active")
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
            "status": status_title.inner_text().strip(),
            "versions": version_relation.inner_text().strip(),
            "actions": action_labels,
        },
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return
    from playwright.sync_api import sync_playwright

    baseline = load_baseline()
    results = []
    with sync_playwright() as playwright:
        browser = baseline.launch_browser(playwright)
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
