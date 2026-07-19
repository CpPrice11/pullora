from __future__ import annotations

import json
import os
from pathlib import Path
from time import time

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, sync_playwright


BASE_URL = os.environ.get("PULLORA_TEST_BASE_URL", "http://127.0.0.1:4173")
OUTPUT_DIR = Path("docs/visual-baseline/design-contract")
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")
EXPECTED_LIBRARY_PANES = {
    (1000, 700): [
        {"x": 37, "y": 95, "width": 380, "height": 568},
        {"x": 431, "y": 95, "width": 524, "height": 568},
    ],
    (1280, 720): [
        {"x": 37, "y": 95, "width": 380, "height": 588},
        {"x": 431, "y": 95, "width": 804, "height": 588},
    ],
    (1920, 1080): [
        {"x": 37, "y": 95, "width": 380, "height": 948},
        {"x": 431, "y": 95, "width": 1444, "height": 948},
    ],
}


def repo(repo_id: int, name: str, description: str, language: str) -> dict:
    return {
        "id": repo_id,
        "name": name,
        "full_name": f"CpPrice11/{name}",
        "owner": {
            "login": "CpPrice11",
            "avatar_url": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' rx='18' fill='%23f4f4f4'/><path d='M22 26h52v14H58v36H38V40H22z' fill='%23cbbb58'/></svg>",
        },
        "description": description,
        "stargazers_count": 42 if repo_id == 1 else 19,
        "updated_at": "2026-07-16T10:00:00Z",
        "html_url": f"https://github.com/CpPrice11/{name}",
        "language": language,
        "topics": ["desktop", "launcher"],
        "has_releases": True,
        "fork": False,
        "archived": False,
        "private": False,
    }


def release(tag: str) -> dict:
    return {
        "id": 100,
        "tag_name": tag,
        "name": tag,
        "html_url": "https://github.com/CpPrice11/demo/releases/latest",
        "draft": False,
        "prerelease": False,
        "published_at": "2026-07-16T10:00:00Z",
        "body": "Stable release",
        "assets": [
            {
                "id": 101,
                "name": f"Pullora_{tag}_portable_x64.exe",
                "browser_download_url": "https://example.com/pullora.exe",
                "size": 88_080_384,
                "content_type": "application/octet-stream",
                "download_count": 12,
            }
        ],
    }


def seed_cache(page: Page) -> None:
    now = int(time() * 1000)
    expires = now + 6 * 60 * 60 * 1000
    repositories = [
        repo(1, "steam-achievement-manager", "Компактний менеджер досягнень Steam для Windows.", "JavaScript"),
        repo(2, "fandom-translator", "Desktop-перекладач для сторінок Fandom і Warframe Wiki.", "TypeScript"),
    ]
    cache = {
        "owner:cpprice11:1:false": {
            "cachedAt": now,
            "expiresAt": expires,
            "data": {"items": repositories, "page": 1, "has_more": False},
        },
        "releases:cpprice11/steam-achievement-manager": {
            "cachedAt": now,
            "expiresAt": expires,
            "data": [release("v0.2.3")],
        },
        "releases:cpprice11/fandom-translator": {
            "cachedAt": now,
            "expiresAt": expires,
            "data": [release("v1.0.0")],
        },
        "releases:cpprice11/pullora": {
            "cachedAt": now,
            "expiresAt": expires,
            "data": [release("v5.10.1")],
        },
    }
    serialized_cache = json.dumps(cache, ensure_ascii=False)
    page.add_init_script(
        script=f"localStorage.setItem('pullora.github.api-cache.v2', JSON.stringify({serialized_cache}))"
    )


def open_library(page: Page) -> None:
    for attempt in range(5):
        try:
            page.goto(BASE_URL, wait_until="domcontentloaded")
            break
        except PlaywrightError:
            if attempt == 4:
                raise
            page.wait_for_timeout(300)
    page.wait_for_load_state("networkidle")
    skip = page.locator(".modal-actions .secondary-btn")
    if skip.is_visible():
        skip.click()
    page.get_by_text("steam-achievement-manager", exact=True).first.wait_for()
    page.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important}.library-diagnostics{display:none!important}")
    page.mouse.move(0, 0)


def apply_custom_background(page: Page) -> None:
    page.locator(".layout").evaluate("el => el.classList.add('has-custom-background')")
    page.locator(".cinematic-background").evaluate(
        "el => { el.classList.add('is-visible'); el.style.backgroundImage = 'radial-gradient(circle at 72% 14%, rgba(85, 196, 255, .72), transparent 34%), linear-gradient(135deg, #14263a, #382b4c 55%, #0b1724)' }"
    )


def capture(page: Page, theme: str, width: int, height: int) -> dict:
    suffix = f"{theme}-{width}x{height}"
    normal_card_height = page.locator(".repo-card:visible").first.evaluate(
        "el => el.getBoundingClientRect().height"
    )
    page.screenshot(path=OUTPUT_DIR / f"library-{suffix}.png")

    page.get_by_role("button", name="Налаштування").click()
    page.get_by_role("heading", name="Налаштування").wait_for()
    page.screenshot(path=OUTPUT_DIR / f"settings-{suffix}.png")

    page.get_by_role("button", name="Про застосунок").click()
    page.get_by_role("heading", name="Про застосунок").wait_for()
    page.screenshot(path=OUTPUT_DIR / f"about-{suffix}.png")

    about_menu_triggers = page.locator(".about-release-menu .project-actions-trigger")
    about_menu_trigger = about_menu_triggers.first
    for index in range(about_menu_triggers.count()):
        candidate = about_menu_triggers.nth(index)
        candidate_box = candidate.bounding_box()
        if candidate_box and candidate_box["y"] >= 0 and candidate_box["y"] + candidate_box["height"] <= height:
            about_menu_trigger = candidate
            break
    about_menu_box = None
    if about_menu_trigger.is_visible():
        about_menu_trigger.evaluate("el => el.click()")
        about_menu = page.locator(".about-release-menu-portal")
        about_menu.wait_for()
        assert about_menu.get_by_role("menuitem").first.evaluate("el => el === document.activeElement")
        about_menu_box = about_menu.bounding_box()
        assert about_menu_box is not None
        assert about_menu_box["x"] >= 0 and about_menu_box["y"] >= 0
        assert about_menu_box["x"] + about_menu_box["width"] <= width
        assert about_menu_box["y"] + about_menu_box["height"] <= height + 1, {
            "box": about_menu_box,
            "viewport": [width, height],
        }
        page.locator(".layout-content").evaluate("el => { el.scrollTop = 0 }")
        page.evaluate("window.scrollTo(0, 0)")
        about_menu.evaluate(
            "(el, top) => { el.style.position = 'absolute'; el.style.top = `${top}px`; el.style.transform = 'none' }",
            max(8, height - about_menu_box["height"] - 16),
        )
        page.screenshot(path=OUTPUT_DIR / f"about-overflow-{suffix}.png")
        page.keyboard.press("Escape")
        about_menu.wait_for(state="hidden")
        assert about_menu_trigger.evaluate("el => el === document.activeElement")

    page.get_by_role("button", name="Бібліотека").click()
    page.get_by_text("steam-achievement-manager", exact=True).first.wait_for()
    page.locator(".hero-primary-btn:visible").first.click()
    page.locator(".release-modal").wait_for()
    page.screenshot(path=OUTPUT_DIR / f"install-{suffix}.png")
    page.locator(".release-modal .close-btn").click()

    page.get_by_role("button", name="Компактний").click()
    page.locator(".library-page.library-density-compact").wait_for()
    compact_card_height = page.locator(".repo-card:visible").first.evaluate(
        "el => el.getBoundingClientRect().height"
    )
    assert compact_card_height < normal_card_height, {
        "normal": normal_card_height,
        "compact": compact_card_height,
    }
    page.mouse.move(0, 0)
    page.screenshot(path=OUTPUT_DIR / f"library-compact-{suffix}.png")

    apply_custom_background(page)
    page.screenshot(path=OUTPUT_DIR / f"library-compact-custom-{suffix}.png")

    repo_card = page.locator(".repo-card:visible").first
    repo_card.click(button="right")
    menu = page.locator(".repo-context-menu")
    menu.wait_for()
    first_menu_item = menu.get_by_role("menuitem").first
    first_menu_item.wait_for()
    assert first_menu_item.evaluate("el => el === document.activeElement")
    menu_box = menu.bounding_box()
    assert menu_box is not None
    assert menu_box["x"] >= 0 and menu_box["y"] >= 0
    assert menu_box["x"] + menu_box["width"] <= width
    assert menu_box["y"] + menu_box["height"] <= height
    page.screenshot(path=OUTPUT_DIR / f"library-context-menu-custom-{suffix}.png")
    page.keyboard.press("Escape")
    menu.wait_for(state="hidden")
    assert repo_card.evaluate("el => el === document.activeElement")

    repo_card.press("Shift+F10")
    menu.wait_for()
    assert menu.get_by_role("menuitem").first.evaluate("el => el === document.activeElement")
    page.keyboard.press("Escape")
    menu.wait_for(state="hidden")
    assert repo_card.evaluate("el => el === document.activeElement")

    page.get_by_role("button", name="Налаштування").click()
    page.get_by_role("heading", name="Налаштування").wait_for()
    apply_custom_background(page)
    settings_background = page.locator(".cinematic-background").evaluate(
        "el => { const style = getComputedStyle(el); return { opacity: Number(style.opacity), filter: style.filter } }"
    )
    assert settings_background["opacity"] >= 0.5, settings_background
    page.screenshot(path=OUTPUT_DIR / f"settings-custom-{suffix}.png")

    page.get_by_role("button", name="Про застосунок").click()
    page.get_by_role("heading", name="Про застосунок").wait_for()
    apply_custom_background(page)
    page.screenshot(path=OUTPUT_DIR / f"about-custom-{suffix}.png")

    page.get_by_role("button", name="Бібліотека").click()
    page.locator(".hero-primary-btn:visible").first.click()
    page.locator(".release-modal").wait_for()
    apply_custom_background(page)
    page.screenshot(path=OUTPUT_DIR / f"install-custom-{suffix}.png")

    return {
        "normalCardHeight": normal_card_height,
        "compactCardHeight": compact_card_height,
        "contextMenu": menu_box,
        "aboutMenu": about_menu_box,
        "settingsBackground": settings_background,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    geometry: list[dict] = []
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
                seed_cache(page)
                open_library(page)
                pane_boxes = page.locator(".library-sam-list-pane, .library-sam-details-pane").evaluate_all(
                    "els => els.map(el => { const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height } })"
                )
                assert pane_boxes == EXPECTED_LIBRARY_PANES[(width, height)], {
                    "theme": theme,
                    "viewport": [width, height],
                    "expected": EXPECTED_LIBRARY_PANES[(width, height)],
                    "actual": pane_boxes,
                }
                boxes = page.locator(".library-sam-list-pane, .library-hero").evaluate_all(
                    "els => els.map(el => ({className: el.className, ...el.getBoundingClientRect().toJSON()}))"
                )
                primary_style = page.locator(".hero-primary-btn:visible").first.evaluate(
                    "el => { const style = getComputedStyle(el); return { background: style.backgroundImage, color: style.color, borderColor: style.borderColor } }"
                )
                if theme == "light":
                    assert primary_style["color"] == "rgb(255, 255, 255)", primary_style
                    assert "rgb(0, 103, 192)" in primary_style["background"], primary_style
                geometry.append({
                    "theme": theme,
                    "viewport": [width, height],
                    "boxes": boxes,
                    "primaryStyle": primary_style,
                })
                variants = capture(page, theme, width, height)
                geometry[-1]["variants"] = variants
                context.close()
        browser.close()
    print(json.dumps(geometry, ensure_ascii=False))


if __name__ == "__main__":
    main()
