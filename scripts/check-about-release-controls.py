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
TRANSITION_VIEWPORTS = ((1060, 720), (1061, 720), (1120, 720), (1121, 720), (1279, 720))
THEMES = ("dark", "light")
CURRENT_VERSION = "v5.16.1"


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


def release(
    release_id: int,
    tag: str,
    *,
    portable: bool = True,
    checksum: bool = True,
    body: str = "Stable release",
) -> dict:
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
        "body": body,
        "assets": assets,
    }


def seed_release_matrix(page: Page, baseline, language: str = "uk") -> None:
    baseline.seed_cache(page)
    unsafe_notes = (
        '<img src="x" onerror="window.__pulloraNotesXss = true"> '
        '<script>window.__pulloraNotesXss = true</script> '
        '[unsafe link](javascript:window.__pulloraNotesXss=true) '
    )
    releases = [
        release(
            5170,
            "v5.17.0",
            body=unsafe_notes + " ".join(f"Release note {index}." for index in range(1, 90)),
        ),
        release(5161, CURRENT_VERSION),
        release(5101, "v5.10.1"),
        release(5100, f"v5.10.0-{'long-release-name-' * 12}"),
        release(580, "v5.8.0"),
        release(570, "v5.7.0"),
        release(560, "v5.6.0"),
        release(599, "v5.9.9", checksum=False),
    ]
    payload = json.dumps({"releases": releases, "language": language}, ensure_ascii=False)
    page.add_init_script(
        script="""
        (() => {
          const { releases, language } = JSON.parse(__PAYLOAD__);
          window.__PULLORA_TEST_LANGUAGE__ = language;
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
    layout = (ROOT / "src/components/Layout/Layout.tsx").read_text(encoding="utf-8")

    assert "const releaseFilters: AboutReleaseFilter[] = ['all', 'rollback', 'current']" in source
    assert 'aria-pressed={releaseFilter === filter}' in source
    assert 'className="about-filter-count" aria-live="polite"' in source
    assert "t('about.availableCount', { count: filteredReleases.length })" in source
    assert "onAction={() => setReleaseFilter('all')}" in source
    assert 'aria-label={t(\'about.launcherActions\')}' in source
    assert 'disabled={!storageInfo || storageInfo.cleanupBytes === 0}' in source
    assert "portableAsset.name" not in source
    assert "about-release-portable-badge" not in source
    assert "about.portableShort" not in source
    assert 'className="about-release-version" title={release.tag_name}' in source
    assert '<MoreHorizontalIcon className="menu-overflow-icon" />' in source
    assert 'aria-controls={menuOpen ? releaseMenuId : undefined}' in source
    assert 'id={releaseMenuId}' in source
    assert 'className="about-notes-meta"' in source
    assert 'dateTime={notesRelease.published_at ?? undefined}' in source
    assert "dangerouslySetInnerHTML" not in source
    assert "\n                          ...\n" not in source
    assert ".cinematic-shell .page.about-page" in styles
    assert ".cinematic-shell .about-grid {\n  max-width: none;" in styles
    assert re.search(r"\.about-hero\s*\{[^}]*max-width:\s*none;", styles)
    assert 'className={`layout-content layout-content--${activeTab}`}' in layout
    assert "padding: 30px 36px 36px;" in tokens
    assert re.search(
        r"\.cinematic-shell \.layout-content--about\s*\{[^}]*"
        r"padding-inline:\s*clamp\(28px, 2\.8125vw, 36px\);",
        tokens,
        re.DOTALL,
    )
    assert "text-overflow: ellipsis" in styles
    assert "grid-template-columns: minmax(0, clamp(320px, 34vw, 520px)) minmax(112px, 160px);" in styles
    assert "min-width: 136px;" in styles
    assert ".cinematic-shell .about-release-asset" not in styles
    for status in ("current", "newer", "older"):
        assert f"about-release-link--${{statusClass}}" in source
        assert f"about-release-status ${{statusClass}}" in source
        assert f"'{status}'" in source
    assert "about-release-link--missing" not in source
    assert "about-release-status.missing" not in styles
    assert ".about-release-link::before" not in styles
    assert re.search(r"\.about-notes-body p\s*\{[^}]*max-width:\s*70ch;", styles, re.DOTALL)

    for token in (
        "--segmented-background",
        "--segmented-border",
        "--segmented-text",
        "--segmented-active-background",
        "--segmented-active-text",
        "--about-status-current",
        "--about-status-success",
        "--about-status-success-text",
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


def open_about(page: Page, baseline, language: str = "uk") -> None:
    seed_release_matrix(page, baseline, language)
    baseline.open_library(page)
    page.locator(".nav-item").nth(2).click()
    page.locator(".about-page").wait_for()
    page.locator(".about-release-link").first.wait_for()
    page.wait_for_function("language => document.documentElement.lang === language", arg=language)


def assert_status_token(page: Page, status: str, token: str) -> None:
    row = page.locator(f".about-release-link--{status}")
    status_badge = row.locator(f".about-release-status.{status}")
    assert row.count() == status_badge.count() > 0, status
    colors = status_badge.evaluate_all(
        """(elements, tokenName) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${tokenName})`;
          elements[0].appendChild(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          return { actual: elements.map(el => getComputedStyle(el).color), expected };
        }""",
        token,
    )
    assert all(color == colors["expected"] for color in colors["actual"]), {status: colors}


def inspect_controls(page: Page, width: int, height: int) -> dict:
    about_page = page.locator(".about-page")
    layout_content = page.locator(".layout-content")
    hero = page.locator(".about-hero")
    panel = page.locator(".about-panel-wide")
    heading = panel.locator(":scope > .about-version-heading")
    filters = panel.locator(".about-version-filters")
    filter_count = panel.locator(".about-filter-count")
    filter_buttons = filters.locator(":scope > button")
    toolbar = panel.locator(":scope > .about-panel-toolbar")
    toolbar_buttons = toolbar.locator(":scope > button")
    release_list = panel.locator(":scope > .about-release-list")
    rows = panel.locator(".about-release-link")
    launcher_status = page.locator(".about-launcher-status")

    assert filter_buttons.count() == 3
    assert toolbar_buttons.count() == 2
    assert toolbar_buttons.nth(0).is_enabled()
    assert toolbar_buttons.nth(1).is_disabled()
    assert rows.count() == 8
    for index in range(rows.count()):
        assert ".exe" not in rows.nth(index).locator(".about-release-date").inner_text().lower()
    assert filter_buttons.nth(0).get_attribute("aria-pressed") == "true"
    assert filter_buttons.nth(1).get_attribute("aria-pressed") == "false"
    assert filter_buttons.nth(2).get_attribute("aria-pressed") == "false"
    assert filter_count.inner_text().strip().endswith("8")
    selected_background = filter_buttons.nth(0).evaluate("el => getComputedStyle(el).backgroundColor")
    idle_background = filter_buttons.nth(1).evaluate("el => getComputedStyle(el).backgroundColor")
    assert selected_background != idle_background

    assert_status_token(page, "current", "--about-status-current")
    assert_status_token(page, "newer", "--about-status-success")
    assert_status_token(page, "older", "--color-text-secondary")
    assert panel.locator(".about-release-link--current .about-release-active-badge").count() == 1

    first_menu_trigger = rows.first.locator(".project-actions-trigger")
    assert first_menu_trigger.locator("svg.menu-overflow-icon").count() == 1
    assert not first_menu_trigger.inner_text().strip()
    first_menu_trigger.click()
    portal = page.locator("body > .about-release-menu-portal")
    portal.wait_for()
    menu = portal.locator('[role="menu"]')
    assert first_menu_trigger.get_attribute("aria-expanded") == "true"
    assert first_menu_trigger.get_attribute("aria-controls") == menu.get_attribute("id")
    assert menu.locator('[role="menuitem"]').count() == 2
    page.wait_for_function(
        "menuId => document.activeElement?.closest('[role=menu]')?.id === menuId",
        arg=menu.get_attribute("id"),
    )
    page.keyboard.press("End")
    assert menu.locator('[role="menuitem"]').nth(1).evaluate("el => el === document.activeElement")
    portal_box = rounded_box(portal)
    assert portal_box["x"] >= 8 and portal_box["x"] + portal_box["width"] <= width - 8 + 0.5
    assert portal_box["y"] >= 8 and portal_box["y"] + portal_box["height"] <= height - 8 + 0.5
    page.keyboard.press("Escape")
    portal.wait_for(state="detached")
    assert first_menu_trigger.evaluate("el => el === document.activeElement")

    first_menu_trigger.click()
    portal.wait_for()
    portal.locator('[role="menuitem"]').first.click()
    notes_modal = page.locator(".about-notes-modal")
    notes_modal.wait_for()
    notes_heading = notes_modal.locator("#about-notes-title")
    notes_meta = notes_modal.locator(".about-notes-meta")
    notes_date = notes_meta.locator("time")
    notes_body = notes_modal.locator(".about-notes-body")
    notes_copy = notes_body.locator("p")
    github_action = notes_modal.locator(".about-notes-actions > button").first
    expected_heading = "Що змінилось" if page.locator("html").get_attribute("lang") == "uk" else "What changed"
    assert notes_heading.inner_text().strip() == expected_heading
    assert "v5.17.0" in notes_meta.inner_text()
    assert notes_date.get_attribute("datetime") == "2026-07-18T10:00:00Z"
    assert notes_date.inner_text().strip()
    assert notes_body.evaluate("el => getComputedStyle(el).overflowY") in ("auto", "scroll")
    assert notes_body.evaluate("el => el.scrollHeight > el.clientHeight")
    assert notes_copy.locator("img, script, a").count() == 0
    assert page.evaluate("window.__pulloraNotesXss") is None
    copy_measure = notes_copy.evaluate(
        "el => ({ maxWidth: getComputedStyle(el).maxWidth, width: el.getBoundingClientRect().width })"
    )
    assert copy_measure["maxWidth"] != "none" and copy_measure["width"] <= 560.5, copy_measure
    assert "GitHub" in github_action.inner_text() and len(github_action.inner_text().strip()) > len("GitHub")
    page.keyboard.press("Escape")
    notes_modal.wait_for(state="detached")
    assert first_menu_trigger.evaluate("el => el === document.activeElement")

    first_row = rows.first
    row_box = rounded_box(first_row)
    main_box = rounded_box(first_row.locator(".about-release-main"))
    title_box = rounded_box(first_row.locator(".about-release-title"))
    version_box = rounded_box(first_row.locator(".about-release-version"))
    status_box = rounded_box(first_row.locator(".about-release-status"))
    date_box = rounded_box(first_row.locator(".about-release-date"))
    actions_box = rounded_box(first_row.locator(".about-release-actions"))
    row_visual = first_row.evaluate(
        """el => ({
          borderRadius: getComputedStyle(el).borderRadius,
          versionFontSize: getComputedStyle(el.querySelector('.about-release-version')).fontSize,
        })"""
    )
    assert actions_box["x"] >= main_box["x"] + main_box["width"] - 0.5
    assert actions_box["y"] >= row_box["y"] and actions_box["y"] + actions_box["height"] <= row_box["y"] + row_box["height"] + 0.5
    if width > 1120:
        title_center = title_box["y"] + title_box["height"] / 2
        date_center = date_box["y"] + date_box["height"] / 2
        assert abs(title_center - date_center) <= 1, {"title": title_box, "date": date_box}
        assert version_box["x"] + version_box["width"] <= status_box["x"] + 0.5
        assert status_box["x"] + status_box["width"] <= date_box["x"] + 0.5
        assert date_box["x"] + date_box["width"] <= actions_box["x"] + 0.5

        column_edges = []
        for index in range(min(3, rows.count())):
            release_row = rows.nth(index)
            release_status = rounded_box(release_row.locator(".about-release-status"))
            release_date = rounded_box(release_row.locator(".about-release-date"))
            release_actions = rounded_box(release_row.locator(".about-release-actions"))
            column_edges.append(
                (
                    release_status["x"] + release_status["width"],
                    release_date["x"] + release_date["width"],
                    release_actions["x"] + release_actions["width"],
                )
            )
        for edge_index in range(3):
            assert max(edges[edge_index] for edges in column_edges) - min(edges[edge_index] for edges in column_edges) <= 1
    else:
        assert date_box["y"] >= title_box["y"] + title_box["height"] - 0.5, {"title": title_box, "date": date_box}

    filter_buttons.nth(2).click()
    assert rows.count() == 1
    assert rows.first.locator(".about-release-title > span").first.inner_text().strip() == CURRENT_VERSION
    assert filter_buttons.nth(2).get_attribute("aria-pressed") == "true"
    assert filter_count.inner_text().strip().endswith("1")

    filter_buttons.nth(1).click()
    assert rows.count() == 6
    assert rows.first.locator(".about-release-title > span").first.inner_text().strip() == "v5.10.1"
    assert filter_buttons.nth(1).get_attribute("aria-pressed") == "true"
    assert filter_count.inner_text().strip().endswith("6")

    filter_buttons.nth(0).click()
    assert rows.count() == 8
    assert filter_count.inner_text().strip().endswith("8")
    long_version = panel.locator(".about-release-version").filter(has_text="long-release-name").first
    assert long_version.evaluate("el => el.scrollWidth > el.clientWidth")
    assert long_version.get_attribute("title") == long_version.inner_text().strip()
    action_box = rounded_box(long_version.locator("xpath=ancestor::*[contains(@class, 'about-release-link')]").locator(".about-release-actions"))
    long_row_box = rounded_box(long_version.locator("xpath=ancestor::*[contains(@class, 'about-release-link')]"))
    assert action_box["x"] + action_box["width"] <= long_row_box["x"] + long_row_box["width"] + 0.5
    filter_buttons.nth(0).focus()
    page.keyboard.press("Tab")
    assert filter_buttons.nth(1).evaluate("el => el === document.activeElement")

    overflow = panel.evaluate(
        "el => ({ panel: el.scrollWidth - el.clientWidth, page: el.closest('.about-page').scrollWidth - el.closest('.about-page').clientWidth })"
    )
    assert overflow["panel"] <= 1 and overflow["page"] <= 1, overflow

    localized_status = launcher_status.inner_text().strip()
    localized_status_overflow = launcher_status.evaluate("el => el.scrollWidth - el.clientWidth")
    assert len(localized_status) >= 40, localized_status
    assert localized_status_overflow <= 1, localized_status_overflow

    scroll = layout_content.evaluate(
        """el => ({
          overflowY: getComputedStyle(el).overflowY,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          range: el.scrollHeight - el.clientHeight,
        })"""
    )
    assert scroll["overflowY"] in ("auto", "scroll"), scroll

    page_box = rounded_box(about_page)
    content_box = rounded_box(layout_content)
    content_client_width = layout_content.evaluate("el => el.clientWidth")
    hero_box = rounded_box(hero)
    panel_box = rounded_box(panel)
    heading_box = rounded_box(heading)
    toolbar_box = rounded_box(toolbar)
    release_list_box = rounded_box(release_list)
    visible_release_count = rows.evaluate_all(
        """elements => elements.filter(element => {
          const box = element.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= window.innerHeight;
        }).length"""
    )
    left_gutter = page_box["x"] - content_box["x"]
    right_gutter = content_box["x"] + content_client_width - page_box["x"] - page_box["width"]
    assert abs(left_gutter - right_gutter) <= 1, {
        "viewport": width,
        "content": content_box,
        "content_client_width": content_client_width,
        "left_gutter": left_gutter,
        "right_gutter": right_gutter,
        "page": page_box,
    }
    if width == 1920:
        assert page_box["width"] >= 1800, page_box
        for region in (hero_box, toolbar_box):
            assert region["y"] >= 0 and region["y"] + region["height"] <= height, region
        assert visible_release_count >= 8, {
            "viewport": width,
            "visibleReleaseCount": visible_release_count,
            "releaseList": release_list_box,
        }
        assert row_box["height"] >= 64
        assert float(row_visual["versionFontSize"].removesuffix("px")) >= 17
    assert hero_box["x"] == panel_box["x"], (hero_box, panel_box)
    assert hero_box["x"] + hero_box["width"] == panel_box["x"] + panel_box["width"], (hero_box, panel_box)
    inner_guides = (heading_box, toolbar_box, release_list_box)
    assert max(box["x"] for box in inner_guides) - min(box["x"] for box in inner_guides) <= 1, inner_guides
    assert max(box["x"] + box["width"] for box in inner_guides) - min(
        box["x"] + box["width"] for box in inner_guides
    ) <= 1, inner_guides

    return {
        "viewport": [width, height],
        "page": page_box,
        "hero": hero_box,
        "heading": heading_box,
        "filters": rounded_box(filters),
        "toolbar": toolbar_box,
        "releaseList": release_list_box,
        "visibleReleaseCount": visible_release_count,
        "firstRelease": rounded_box(rows.first),
        "releaseMetrics": {
            "rowHeight": row_box["height"],
            "borderRadius": row_visual["borderRadius"],
            "versionFontSize": row_visual["versionFontSize"],
            "statusDateGap": round(date_box["x"] - status_box["x"] - status_box["width"], 2),
        },
        "releaseLayout": "columns" if width > 1120 else "stacked",
        "labels": [filter_buttons.nth(index).inner_text().strip() for index in range(3)],
        "localizedStatusLength": len(localized_status),
        "overflow": overflow,
        "scroll": scroll,
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
                    reduced_motion="reduce",
                )
                page = context.new_page()
                open_about(page, baseline)
                results.append({"theme": theme, **inspect_controls(page, width, height)})
                context.close()

        scale_results = []
        scale_scenarios = (
            ("uk", 100, 1920, 1080, 1),
            ("en", 100, 1920, 1080, 1),
            ("uk", 125, 1536, 864, 1.25),
            ("en", 125, 1536, 864, 1.25),
        )
        expected_labels = {
            "uk": ["Усі", "Старі", "Поточна"],
            "en": ["All", "Older", "Current"],
        }
        for language, scale, width, height, device_scale_factor in scale_scenarios:
            context = browser.new_context(
                viewport={"width": width, "height": height},
                screen={"width": 1920, "height": 1080},
                device_scale_factor=device_scale_factor,
                color_scheme="dark",
                locale="en-US" if language == "en" else "uk-UA",
                reduced_motion="reduce",
            )
            page = context.new_page()
            open_about(page, baseline, language)
            result = inspect_controls(page, width, height)
            assert result["labels"] == expected_labels[language], result["labels"]
            if scale == 125:
                assert result["scroll"]["range"] > 0, result["scroll"]
                layout_content = page.locator(".layout-content")
                layout_content.evaluate("el => { el.scrollTop = el.scrollHeight }")
                assert layout_content.evaluate("el => el.scrollTop") > 0
                layout_content.evaluate("el => { el.scrollTop = 0 }")
            scale_results.append({
                "language": language,
                "scale": scale,
                "deviceScaleFactor": device_scale_factor,
                **result,
            })
            context.close()

        transition_results = []
        for width, height in TRANSITION_VIEWPORTS:
            context = browser.new_context(
                viewport={"width": width, "height": height},
                color_scheme="dark",
                locale="uk-UA",
                reduced_motion="reduce",
            )
            page = context.new_page()
            open_about(page, baseline)
            transition_results.append(inspect_controls(page, width, height))
            context.close()
        browser.close()

    for width, height in VIEWPORTS:
        dark = next(item for item in results if item["theme"] == "dark" and item["viewport"] == [width, height])
        light = next(item for item in results if item["theme"] == "light" and item["viewport"] == [width, height])
        for key in ("heading", "filters", "toolbar", "releaseList", "firstRelease"):
            assert dark[key] == light[key], {"viewport": [width, height], "key": key, "dark": dark[key], "light": light[key]}
        assert dark["labels"] == light["labels"]

    for theme in THEMES:
        medium = next(item for item in results if item["theme"] == theme and item["viewport"] == [1280, 720])
        wide = next(item for item in results if item["theme"] == theme and item["viewport"] == [1920, 1080])
        assert wide["releaseMetrics"]["statusDateGap"] > medium["releaseMetrics"]["statusDateGap"]
        for key in ("rowHeight", "borderRadius", "versionFontSize"):
            assert wide["releaseMetrics"][key] == medium["releaseMetrics"][key], {
                "theme": theme,
                "key": key,
                "medium": medium["releaseMetrics"],
                "wide": wide["releaseMetrics"],
            }

    transition_matrix = [
        next(item for item in results if item["theme"] == "dark" and item["viewport"] == [1000, 700]),
        *transition_results,
        next(item for item in results if item["theme"] == "dark" and item["viewport"] == [1280, 720]),
    ]
    assert transition_matrix[0]["releaseLayout"] == "stacked"
    assert transition_matrix[-1]["releaseLayout"] == "columns"
    for item in transition_matrix:
        assert item["overflow"]["panel"] <= 1 and item["overflow"]["page"] <= 1, item
    for lower_width, upper_width in ((1060, 1061), (1120, 1121), (1279, 1280)):
        lower = next(item for item in transition_matrix if item["viewport"][0] == lower_width)
        upper = next(item for item in transition_matrix if item["viewport"][0] == upper_width)
        page_width_delta = upper["page"]["width"] - lower["page"]["width"]
        assert abs(page_width_delta - 1) <= 4, {
            "breakpoint": [lower_width, upper_width],
            "lower": lower["page"],
            "upper": upper["page"],
        }

    print(json.dumps({
        "checks": len(results),
        "viewports": VIEWPORTS,
        "fullHdScaleChecks": scale_results,
        "transitionChecks": transition_matrix,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
