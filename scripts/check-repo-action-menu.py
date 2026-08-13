from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / 'scripts' / 'capture-visual-baseline.py'
OUTPUT_DIR = ROOT / 'docs' / 'visual-baseline' / 'design-contract'
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ('dark', 'light')
TEST_FOLDERS = [
    {
        'id': f'folder-{index}',
        'name': f'{index + 1:02d} · Дуже довга локалізована назва папки / Very long localized folder name',
        'repoKeys': ['cpprice11/steam-achievement-manager' if index % 2 else 'cpprice11/fandom-translator'],
    }
    for index in range(60)
]


def load_baseline():
    spec = importlib.util.spec_from_file_location('pullora_visual_baseline', BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('Не вдалося завантажити visual baseline helper')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_menu(page: Page, baseline, theme: str, width: int, height: int, scale: float) -> dict:
    baseline.seed_cache(page)
    page.add_init_script(
        script=f"window.__PULLORA_TEST_LIBRARY_FOLDERS__ = {json.dumps(TEST_FOLDERS, ensure_ascii=False)}",
    )
    baseline.open_library(page)

    card = page.locator('.repo-card:visible').first
    layout_before = page.locator(
        '.library-sam-workspace, .library-sam-list-pane, .library-sam-details-pane'
    ).evaluate_all(
        """elements => elements.map(element => {
            const rect = element.getBoundingClientRect()
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        })"""
    )
    card_before = card.evaluate(
        """element => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
                className: element.className,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                background: style.background,
                borderColor: style.borderColor,
                opacity: style.opacity,
                transform: style.transform,
            }
        }"""
    )
    assert len(page.context.pages) == 1
    card.evaluate(
        "(element, point) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: point.x, clientY: point.y }))",
        {'x': width - 2, 'y': height - 2},
    )
    portal = page.locator('.repo-context-menu:visible')
    menu = page.locator('.repo-context-menu .project-actions-popover:visible')
    menu.wait_for()

    assert portal.evaluate("el => el.parentElement?.id") == 'app-overlay-root'
    assert portal.evaluate("el => getComputedStyle(el).position") == 'fixed'

    portal_box = portal.bounding_box()
    assert portal_box is not None
    assert portal_box['x'] >= 8 and portal_box['y'] >= 8, portal_box
    assert portal_box['x'] + portal_box['width'] <= width - 8 + 1, portal_box
    assert portal_box['y'] + portal_box['height'] <= height - 8 + 1, portal_box
    suffix = f'{theme}-{width}x{height}-scale{round(scale * 100)}'
    page.screenshot(path=OUTPUT_DIR / f'repo-menu-normal-root-{suffix}.png')

    submenu_trigger = menu.locator('.repo-actions-submenu-trigger').first
    submenu_trigger.hover()
    submenu = page.locator('#app-overlay-root > .repo-actions-submenu-panel:visible')
    submenu.wait_for()

    assert submenu.evaluate("el => el.parentElement?.id") == 'app-overlay-root'
    assert submenu.evaluate("el => getComputedStyle(el).position") == 'fixed'

    surface_styles = page.locator('.repo-context-menu .project-actions-popover:visible, .repo-actions-submenu-panel:visible').evaluate_all(
        """elements => elements.map(element => {
            const style = getComputedStyle(element)
            return {
                background: style.background,
                borderColor: style.borderColor,
                boxShadow: style.boxShadow,
                backdropFilter: style.backdropFilter,
            }
        })"""
    )
    assert len(surface_styles) == 2
    assert surface_styles[0] == surface_styles[1], surface_styles

    trigger_style = submenu_trigger.evaluate(
        """el => {
            const style = getComputedStyle(el)
            return { display: style.display, justifyContent: style.justifyContent }
        }"""
    )
    assert trigger_style == {'display': 'flex', 'justifyContent': 'space-between'}, trigger_style

    submenu_box = submenu.bounding_box()
    assert submenu_box is not None
    assert submenu_box['x'] >= 8 and submenu_box['y'] >= 8, submenu_box
    assert submenu_box['x'] + submenu_box['width'] <= width - 8 + 1, submenu_box
    assert submenu_box['y'] + submenu_box['height'] <= height - 8 + 1, submenu_box
    assert submenu_box['x'] + submenu_box['width'] < portal_box['x'], (portal_box, submenu_box)
    layout_after = page.locator(
        '.library-sam-workspace, .library-sam-list-pane, .library-sam-details-pane'
    ).evaluate_all(
        """elements => elements.map(element => {
            const rect = element.getBoundingClientRect()
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        })"""
    )
    card_after = card.evaluate(
        """element => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
                className: element.className,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                background: style.background,
                borderColor: style.borderColor,
                opacity: style.opacity,
                transform: style.transform,
            }
        }"""
    )
    assert layout_after == layout_before, (layout_before, layout_after)
    assert card_after == card_before, (card_before, card_after)
    assert len(page.context.pages) == 1
    page.screenshot(path=OUTPUT_DIR / f'repo-menu-normal-add-{suffix}.png')

    remove_trigger = menu.locator('.repo-actions-submenu-trigger').nth(1)
    remove_trigger.hover()
    submenu.wait_for()
    page.screenshot(path=OUTPUT_DIR / f'repo-menu-normal-remove-{suffix}.png')
    submenu_trigger.hover()
    submenu.wait_for()

    submenu_trigger.focus()
    page.keyboard.press('ArrowRight')
    page.wait_for_function("() => document.activeElement?.closest('.repo-actions-submenu-panel')")
    assert submenu.get_by_role('menuitem').first.evaluate('el => el === document.activeElement')
    page.keyboard.press('ArrowLeft')
    submenu.wait_for(state='hidden')
    assert submenu_trigger.evaluate('el => el === document.activeElement')

    edge_points = ((12, 12), (width - 2, 12), (12, height - 2), (width - 2, height - 2))
    submenu_trigger_count = menu.locator('.repo-actions-submenu-trigger').count()
    assert submenu_trigger_count == 4, submenu_trigger_count
    for trigger_index in range(submenu_trigger_count):
        for x, y in edge_points:
            card.evaluate(
                "(element, point) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: point.x, clientY: point.y }))",
                {'x': x, 'y': y},
            )
            current_portal_box = portal.bounding_box()
            trigger = menu.locator('.repo-actions-submenu-trigger').nth(trigger_index)
            trigger.hover()
            submenu.wait_for()
            current_submenu_box = submenu.bounding_box()
            assert current_portal_box is not None and current_submenu_box is not None
            assert current_submenu_box['x'] >= 8 and current_submenu_box['y'] >= 8, current_submenu_box
            assert current_submenu_box['x'] + current_submenu_box['width'] <= width - 8 + 1, current_submenu_box
            assert current_submenu_box['y'] + current_submenu_box['height'] <= height - 8 + 1, current_submenu_box
            submenu_items = submenu.get_by_role('menuitem').count()
            assert submenu_items >= 30 if trigger_index < 2 else submenu_items >= 1
            scroll_metrics = submenu.evaluate('el => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight })')
            assert scroll_metrics['clientHeight'] <= height - 16
            if scroll_metrics['scrollHeight'] > height - 16:
                assert scroll_metrics['scrollHeight'] > scroll_metrics['clientHeight']
            assert submenu.evaluate('el => el.scrollWidth <= el.clientWidth')
            if x > width / 2:
                assert current_submenu_box['x'] + current_submenu_box['width'] < current_portal_box['x'], (current_portal_box, current_submenu_box)
            else:
                assert current_submenu_box['x'] > current_portal_box['x'] + current_portal_box['width'], (current_portal_box, current_submenu_box)

    first_position = (portal_box['x'], portal_box['y'])
    card.evaluate(
        "(element, point) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: point.x, clientY: point.y }))",
        {'x': 12, 'y': 12},
    )
    moved_box = portal.bounding_box()
    assert moved_box is not None
    assert (moved_box['x'], moved_box['y']) != first_position, moved_box

    submenu_trigger.hover()
    submenu.wait_for()

    menu_box = menu.bounding_box()
    submenu_box = submenu.bounding_box()
    assert menu_box is not None and submenu_box is not None
    assert submenu_box['x'] > menu_box['x'] + menu_box['width'], (menu_box, submenu_box)

    other_card = page.locator('.repo-card:visible').nth(1)
    other_card.evaluate(
        "(element, point) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: point.x, clientY: point.y }))",
        {'x': width // 2, 'y': height // 2},
    )
    assert page.locator('.repo-context-menu:visible').count() == 1
    assert page.locator('.repo-actions-submenu-panel:visible').count() == 0

    page.keyboard.press('Escape')
    portal.wait_for(state='hidden')
    assert other_card.evaluate('el => el === document.activeElement')

    card.press('Shift+F10')
    menu.wait_for()
    page.wait_for_function("() => document.activeElement?.closest('.project-actions-popover')")
    assert menu.get_by_role('menuitem').first.evaluate('el => el === document.activeElement')
    page.locator('body').dispatch_event('pointerdown')
    portal.wait_for(state='hidden')
    assert card.evaluate('el => el === document.activeElement')

    card.press('Shift+F10')
    menu.wait_for()
    page.wait_for_function("() => document.activeElement?.closest('.project-actions-popover')")
    menu.get_by_role('menuitem').nth(1).click()
    portal.wait_for(state='hidden')
    assert card.evaluate('el => el === document.activeElement')

    card.press('Shift+F10')
    menu.wait_for()
    page.wait_for_function("() => document.activeElement?.closest('.project-actions-popover')")
    page.evaluate("window.dispatchEvent(new Event('resize'))")
    portal.wait_for(state='hidden')
    assert card.evaluate('el => el === document.activeElement')

    card.press('Shift+F10')
    menu.wait_for()
    page.wait_for_function("() => document.activeElement?.closest('.project-actions-popover')")
    page.evaluate("window.dispatchEvent(new Event('scroll'))")
    portal.wait_for(state='hidden')
    assert card.evaluate('el => el === document.activeElement')

    page.get_by_role('switch', name='Компактний').click()
    page.locator('.library-page.library-density-compact').wait_for()
    card.evaluate(
        "(element, point) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: point.x, clientY: point.y }))",
        {'x': width - 2, 'y': height - 2},
    )
    menu.wait_for()
    page.screenshot(path=OUTPUT_DIR / f'repo-menu-compact-root-{suffix}.png')
    menu.locator('.repo-actions-submenu-trigger').first.hover()
    submenu.wait_for()
    page.screenshot(path=OUTPUT_DIR / f'repo-menu-compact-add-{suffix}.png')
    menu.locator('.repo-actions-submenu-trigger').nth(1).hover()
    submenu.wait_for()
    page.screenshot(path=OUTPUT_DIR / f'repo-menu-compact-remove-{suffix}.png')
    page.keyboard.press('Escape')
    portal.wait_for(state='hidden')

    return {'theme': theme, 'viewport': [width, height], 'scale': scale, 'trigger': trigger_style, 'edgeChecks': 8}


def main() -> None:
    baseline = load_baseline()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        cases = [(*viewport, 1) for viewport in VIEWPORTS] + [(1920, 1080, 1.25)]
        for theme in THEMES:
            for width, height, scale in cases:
                context = browser.new_context(
                    viewport={'width': width, 'height': height},
                    device_scale_factor=scale,
                    color_scheme=theme,
                    locale='uk-UA',
                )
                page = context.new_page()
                results.append(check_menu(page, baseline, theme, width, height, scale))
                context.close()
        browser.close()
    print(json.dumps({'checks': len(results), 'results': results}, ensure_ascii=False))


if __name__ == '__main__':
    main()
