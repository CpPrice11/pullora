from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "scripts" / "capture-visual-baseline.py"
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")
CURRENT_VERSION = "v5.12.0"


def load_baseline():
    spec = importlib.util.spec_from_file_location("pullora_visual_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load visual baseline helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def asset(asset_id: int, name: str) -> dict:
    return {
        "id": asset_id,
        "name": name,
        "browser_download_url": f"https://example.com/{name}",
        "size": 88_080_384,
        "content_type": "application/octet-stream",
        "download_count": 12,
    }


def release(release_id: int, tag: str, *, portable: bool = True, checksum: bool = True) -> dict:
    assets = []
    if portable:
        assets.append(asset(release_id * 10, f"Pullora_{tag}_portable_x64.exe"))
    if checksum:
        assets.append(asset(release_id * 10 + 1, "SHA256SUMS.txt"))
    return {
        "id": release_id,
        "tag_name": tag,
        "name": tag,
        "html_url": f"https://github.com/CpPrice11/pullora/releases/tag/{tag}",
        "draft": False,
        "prerelease": False,
        "published_at": "2026-07-18T10:00:00Z",
        "body": "Stable release",
        "assets": assets,
    }


def seed_release_matrix(page: Page, baseline) -> None:
    baseline.seed_cache(page)
    releases = [
        release(5130, "v5.13.0"),
        release(5120, CURRENT_VERSION),
        release(5101, "v5.10.1"),
        release(599, "v5.9.9", checksum=False),
    ]
    payload = json.dumps({"releases": releases}, ensure_ascii=False)
    page.add_init_script(
        script="""
        (() => {
          const { releases } = JSON.parse(__PAYLOAD__);
          window.__PULLORA_TEST_RELEASES__ = {
            ...(window.__PULLORA_TEST_RELEASES__ ?? {}),
            'cpprice11/pullora': releases,
          };
        })()
        """.replace("__PAYLOAD__", json.dumps(payload)),
    )


def check_source_contract() -> None:
    source = (ROOT / "src/pages/AboutPage.tsx").read_text(encoding="utf-8")
    styles = (ROOT / "src/pages/PageStyles.css").read_text(encoding="utf-8")
    tokens = (ROOT / "src/styles/Cinematic.css").read_text(encoding="utf-8")

    assert "const releaseFilters: AboutReleaseFilter[] = ['all', 'rollback', 'current']" in source
    assert 'aria-pressed={releaseFilter === filter}' in source
    assert 'aria-label={t(\'about.launcherActions\')}' in source
    assert 'disabled={!storageInfo || storageInfo.cleanupBytes === 0}' in source
    for status in ("current", "newer", "older", "missing"):
        assert f"about-release-link--${{statusClass}}" in source
        assert f"about-release-status ${{statusClass}}" in source
        assert f"'{status}'" in source

    for token in (
        "--segmented-background",
        "--segmented-border",
        "--segmented-text",
        "--segmented-active-background",
        "--segmented-active-text",
        "--about-status-current",
        "--about-status-success",
        "--about-status-success-text",
        "--about-status-error",
    ):
        definition_count = len(re.findall(rf"^\s*{re.escape(token)}\s*:", tokens, re.MULTILINE))
        assert definition_count == 2, (token, definition_count)
        assert f"var({token})" in styles, token

    assert ":root[data-theme='light'] .cinematic-shell .segmented-control" not in styles
    assert ":root[data-theme='light'] .about-release-active-badge" not in styles
    print("[about-release-controls] source contract: ok")


def rounded_box(locator) -> dict:
    box = locator.bounding_box()
    assert box is not None
    return {key: round(value, 2) for key, value in box.items()}


def open_about(page: Page, baseline) -> None:
    seed_release_matrix(page, baseline)
    baseline.open_library(page)
    page.locator(".nav-item").nth(2).click()
    page.locator(".about-page").wait_for()
    page.locator(".about-release-link").first.wait_for()


def assert_status_token(page: Page, status: str, token: str) -> None:
    row = page.locator(f".about-release-link--{status}")
    status_badge = row.locator(f".about-release-status.{status}")
    assert row.count() == status_badge.count() == 1, status
    colors = status_badge.evaluate(
        """(el, tokenName) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${tokenName})`;
          el.appendChild(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          return { actual: getComputedStyle(el).color, expected };
        }""",
        token,
    )
    assert colors["actual"] == colors["expected"], {status: colors}


def inspect_controls(page: Page, width: int, height: int) -> dict:
    panel = page.locator(".about-panel-wide")
    filters = panel.locator(".about-version-filters")
    filter_buttons = filters.locator(":scope > button")
    toolbar = panel.locator(":scope > .about-panel-toolbar")
    toolbar_buttons = toolbar.locator(":scope > button")
    rows = panel.locator(".about-release-link")

    assert filter_buttons.count() == 3
    assert toolbar_buttons.count() == 2
    assert toolbar_buttons.nth(0).is_enabled()
    assert toolbar_buttons.nth(1).is_disabled()
    assert rows.count() == 4
    assert filter_buttons.nth(0).get_attribute("aria-pressed") == "true"
    assert filter_buttons.nth(1).get_attribute("aria-pressed") == "false"
    assert filter_buttons.nth(2).get_attribute("aria-pressed") == "false"

    assert_status_token(page, "current", "--color-primary")
    assert_status_token(page, "newer", "--color-success")
    assert_status_token(page, "older", "--color-text-secondary")
    assert_status_token(page, "missing", "--color-error")
    assert panel.locator(".about-release-link--current .about-release-active-badge").count() == 1

    filter_buttons.nth(2).click()
    assert rows.count() == 1
    assert rows.first.locator(".about-release-title > span").first.inner_text().strip() == CURRENT_VERSION
    assert filter_buttons.nth(2).get_attribute("aria-pressed") == "true"

    filter_buttons.nth(1).click()
    assert rows.count() == 1
    assert rows.first.locator(".about-release-title > span").first.inner_text().strip() == "v5.10.1"
    assert filter_buttons.nth(1).get_attribute("aria-pressed") == "true"

    filter_buttons.nth(0).click()
    assert rows.count() == 4
    filter_buttons.nth(0).focus()
    page.keyboard.press("Tab")
    assert filter_buttons.nth(1).evaluate("el => el === document.activeElement")

    overflow = panel.evaluate(
        "el => ({ panel: el.scrollWidth - el.clientWidth, page: el.closest('.about-page').scrollWidth - el.closest('.about-page').clientWidth })"
    )
    assert overflow["panel"] <= 1 and overflow["page"] <= 1, overflow

    return {
        "viewport": [width, height],
        "filters": rounded_box(filters),
        "toolbar": rounded_box(toolbar),
        "firstRelease": rounded_box(rows.first),
        "labels": [filter_buttons.nth(index).inner_text().strip() for index in range(3)],
        "overflow": overflow,
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
                results.append({"theme": theme, **inspect_controls(page, width, height)})
                context.close()
        browser.close()

    for width, height in VIEWPORTS:
        dark = next(item for item in results if item["theme"] == "dark" and item["viewport"] == [width, height])
        light = next(item for item in results if item["theme"] == "light" and item["viewport"] == [width, height])
        for key in ("filters", "toolbar", "firstRelease"):
            assert dark[key] == light[key], {"viewport": [width, height], "key": key, "dark": dark[key], "light": light[key]}
        assert dark["labels"] == light["labels"]

    print(json.dumps({"checks": len(results), "viewports": VIEWPORTS}, ensure_ascii=False))


if __name__ == "__main__":
    main()
