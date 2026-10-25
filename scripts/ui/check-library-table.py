"""Table uses the catalog's shared actions; no native installations are performed."""
import runpy
from pathlib import Path
from playwright.sync_api import sync_playwright

catalog = runpy.run_path('scripts/ui/check-library-catalog.py')
operations = runpy.run_path('scripts/ui/check-card-operations.py')
web_project = runpy.run_path('scripts/ui/check-web-project.py')
baseline = catalog['baseline']
output = Path('.artifacts/ui/screens')


def table(page):
    page.locator('.library-view-toggle button').nth(1).click()
    page.locator('table.library-table').first.wait_for()
    assert not page.locator('.library-density-toggle').count()
    assert page.locator('.library-view-toggle button svg').count() == 2
    assert not page.locator('.library-view-toggle').inner_text().strip()
    assert page.locator('.library-view-toggle button').nth(1).get_attribute('aria-pressed') == 'true'
    assert page.locator('tbody > tr.repo-card').count() == 7
    assert page.locator('.library-table thead th').count() == 6
    assert page.locator('.library-table tbody > :not(tr)').count() == 0
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    for row in page.locator('tr.repo-card').all():
        assert row.locator(':scope > td').count() == 6
        assert row.bounding_box()['height'] < 220
        assert row.locator('.repo-card-heading').is_visible()
        assert row.locator('.repo-status').is_visible()
        assert row.locator('.repo-more-action').is_visible()
    return page.locator('tr.repo-card').filter(has=page.locator('.repo-name', has_text='steam-achievement-manager'))


def interactions(page):
    row = table(page)
    title = row.locator('.repo-name button')
    title.click()
    page.locator('.library-catalog-details').wait_for()
    page.locator('.library-catalog-details-toolbar button').click()
    assert title.evaluate('el => el === document.activeElement')
    more = row.locator('.repo-more-action')
    more.click()
    page.locator('.repo-context-menu [role=menu]').wait_for()
    page.keyboard.press('Escape')
    assert more.evaluate('el => el === document.activeElement')
    row.locator('input[type=checkbox]').check()
    row.focus()
    page.keyboard.press('Control+a')
    assert page.locator('tr.repo-card input:checked').count() == 7
    page.keyboard.press('Escape')
    assert not page.locator('tr.repo-card input:checked').count()
    row.focus()
    page.keyboard.press('Shift+F10')
    page.locator('.repo-context-menu [role=menu]').wait_for()
    page.keyboard.press('Escape')
    assert row.evaluate('el => el === document.activeElement')
    page.locator('#library-search').fill('steam')
    assert page.locator('tr.repo-card').count() == 1
    page.locator('#library-search').fill('')
    section = page.locator('.library-folder-section-header').first
    section.click()
    assert not page.locator('table').count()
    section.click()
    assert page.locator('tr.repo-card').count() == 7
    row.locator('a').last.click()
    assert page.evaluate("window.__CATALOG_CALLS__.some(x=>x.command==='open_external_url')")
    page.wait_for_function("JSON.parse(localStorage.getItem('pullora-library-view-v1')).viewMode === 'table'")
    baseline['open_library'](page)
    assert page.locator('tr.repo-card').count() == 7
    page.locator('.library-view-toggle button').first.click()
    assert page.locator('article.repo-card').count() == 7
    assert not page.locator('table').count()


def tray_error(page, language):
    catalog['prepare'](page, language)
    page.add_init_script("""(() => {
      window.__TRAY_LISTENERS__ = new Set();
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command,args={}) => {
        if(command==='plugin:event|listen' && args.event==='tray-action-error') window.__TRAY_LISTENERS__.add(args.handler);
        if(command==='plugin:event|unlisten') window.__TRAY_LISTENERS__.delete(args.eventId);
        return invoke(command,args);
      };
    })()""")
    baseline['open_library'](page)
    page.wait_for_function('window.__TRAY_LISTENERS__.size === 1')
    page.evaluate("""() => {
      const id = [...window.__TRAY_LISTENERS__][0];
      window.__TAURI_INTERNALS__.runCallback(id, {id,event:'tray-action-error',payload:'PULLORA_ERROR:errors.commandFailed'});
    }""")
    toast = page.locator('.library-toast[role=alert]')
    toast.wait_for()
    assert 'PULLORA_ERROR' not in toast.inner_text()
    assert not page.locator('.release-modal').count()


if __name__ == '__main__':
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = baseline['launch_browser'](p)
        for theme in ('dark', 'light'):
            for language in ('uk', 'en'):
                for width, height in ((1000, 700), (1280, 720), (1920, 1080)):
                    page = browser.new_page(viewport={'width':width, 'height':height}, color_scheme=theme)
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                    operations['prepare'](page, language, initial=True)
                    baseline['open_library'](page)
                    table(page)
                    operations['inline_states'](page, language)
                    page.screenshot(path=output / f'table-{theme}-{language}-{width}.png')
                    if width == 1280:
                        baseline['apply_custom_background'](page)
                        page.screenshot(path=output / f'table-custom-{theme}-{language}.png')
                    assert not errors, errors
                    page.close()
        page = browser.new_page(viewport={'width':1280,'height':720})
        catalog['prepare'](page, reset_view=False)
        baseline['open_library'](page)
        interactions(page)
        page.close()
        for language in ('uk', 'en'):
            page = browser.new_page(viewport={'width':1000,'height':700})
            web_project['check'](page, language, 'dark', 1000, view_mode='table')
            page.close()
            page = browser.new_page(viewport={'width':1000,'height':700})
            tray_error(page, language)
            page.close()
        browser.close()
    print('[library-table] 12 appearances, shared progress, axe, keyboard, selection, search, collapse, persistence, cards: ok')
