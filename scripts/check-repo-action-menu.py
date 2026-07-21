from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / 'scripts' / 'capture-visual-baseline.py'
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ('dark', 'light')


def load_baseline():
    spec = importlib.util.spec_from_file_location('pullora_visual_baseline', BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('Не вдалося завантажити visual baseline helper')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_menu(page: Page, baseline, theme: str, width: int, height: int) -> dict:
    baseline.seed_cache(page)
    baseline.open_library(page)

    card = page.locator('.repo-card:visible').first
    card.click(button='right')
    menu = page.locator('.repo-context-menu .project-actions-popover:visible')
    menu.wait_for()

    submenu_trigger = menu.locator('.repo-actions-submenu-trigger').first
    submenu_trigger.hover()
    submenu = menu.locator('.repo-actions-submenu-panel:visible')
    submenu.wait_for()

    trigger_style = submenu_trigger.evaluate(
        """el => {
            const style = getComputedStyle(el)
            return { display: style.display, justifyContent: style.justifyContent }
        }"""
    )
    assert trigger_style == {'display': 'flex', 'justifyContent': 'space-between'}, trigger_style

    menu_box = menu.bounding_box()
    submenu_box = submenu.bounding_box()
    assert menu_box is not None and submenu_box is not None
    assert submenu_box['x'] >= 0 and submenu_box['y'] >= 0, submenu_box
    assert submenu_box['x'] + submenu_box['width'] <= width + 1, submenu_box
    assert submenu_box['y'] + submenu_box['height'] <= height + 1, submenu_box

    page.keyboard.press('Escape')
    submenu.wait_for(state='hidden')

    return {'theme': theme, 'viewport': [width, height], 'trigger': trigger_style}


def main() -> None:
    baseline = load_baseline()
    results: list[dict] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in THEMES:
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={'width': width, 'height': height},
                    color_scheme=theme,
                    locale='uk-UA',
                )
                page = context.new_page()
                results.append(check_menu(page, baseline, theme, width, height))
                context.close()
        browser.close()
    print(json.dumps({'checks': len(results), 'results': results}, ensure_ascii=False))


if __name__ == '__main__':
    main()
