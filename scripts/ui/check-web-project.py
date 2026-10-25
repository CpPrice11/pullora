"""A curated website opens its URL instead of entering any installation flow."""
import json
import runpy
from pathlib import Path

from playwright.sync_api import sync_playwright

BASELINE = runpy.run_path('scripts/ui/capture-visual-baseline.py')
OUTPUT = Path('.artifacts/ui/screens')
SITE = 'https://cpprice11.github.io/warframe-arsenal/'


def check(page, language, theme, width, *, view_mode='cards'):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
    BASELINE['seed_cache'](page)
    page.add_init_script('window.__PULLORA_TEST_LANGUAGE__ = ' + json.dumps(language))
    page.add_init_script('''(() => {
      const cache = window.__PULLORA_TEST_GITHUB_CACHE__;
      const repos = cache['owner:cpprice11:1:false'].data.items;
      repos.push({...repos[0], id:3, name:'warframe-arsenal', full_name:'CpPrice11/warframe-arsenal',
        description:'Warframe adversary weapon catalog — Ukrainian and English reference with owner editing.',
        homepage:null, website_url:'https://cpprice11.github.io/warframe-arsenal/'});
      window.__WEB_CALLS__ = [];
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command,args={}) => {
        window.__WEB_CALLS__.push({command,args});
        if(command === 'open_website_url' && window.__WEB_FAIL__) throw 'PULLORA_ERROR:errors.commandFailed';
        return invoke(command,args);
      };
    })()''')
    BASELINE['open_library'](page)
    if view_mode == 'table':
        page.locator('.library-view-toggle button').nth(1).click()
        page.locator('tr.repo-card').first.wait_for()
    card = page.locator('.repo-card').filter(has=page.locator('.repo-name', has_text='warframe-arsenal'))
    visit = 'Відвідати' if language == 'uk' else 'Visit'
    website = 'Вебсайт' if language == 'uk' else 'Website'
    assert card.locator('.repo-primary-action').inner_text() == visit
    assert card.locator('.repo-status').inner_text() == website
    assert card.locator('input[type=checkbox]').count() == 0
    page.keyboard.press('Tab')
    card.locator('.repo-primary-action').focus()
    assert card.locator('.repo-primary-action').evaluate("el=>el.matches(':focus-visible')")
    card.locator('.repo-primary-action').press('Enter')
    assert page.evaluate('window.__WEB_CALLS__.filter(x=>x.command==="open_website_url").at(-1).args.url') == SITE
    assert not page.locator('.release-modal').count()
    card.locator('.repo-more-action').click()
    menu = page.locator('.repo-context-menu')
    assert menu.get_by_role('menuitem', name=visit, exact=True).count() == 1
    assert menu.get_by_role('menuitem', name='Версії' if language == 'uk' else 'Versions', exact=True).count() == 0
    menu.get_by_role('menuitem', name=visit, exact=True).click()
    card.locator('.repo-name button').click()
    details = page.locator('.library-catalog-details')
    details.locator('.library-hero').wait_for()
    assert details.locator('.library-inline-panel--versions').count() == 0
    for button in details.locator('.hero-primary-btn').all():
        assert button.inner_text() == visit
        if button.is_visible():
            button.click()
    assert details.locator('.hero-primary-btn:visible').count() > 0
    assert details.get_by_text('Не встановлено' if language == 'uk' else 'Not installed', exact=True).count() == 0
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=OUTPUT / f'web-project-{view_mode}-{theme}-{language}-{width}.png')
    assert not page.evaluate('window.__WEB_CALLS__.some(x=>["get_releases","plan_release_installation","start_download"].includes(x.command)&&x.args.repo==="warframe-arsenal")')
    details.press('Escape')
    page.evaluate('window.__WEB_FAIL__ = true')
    card.locator('.repo-primary-action').click()
    page.locator('.library-toast[role=alert]').wait_for()
    assert not page.locator('.release-modal').count()
    assert not errors, errors


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = BASELINE['launch_browser'](playwright)
        for theme in ('dark', 'light'):
            for language in ('uk', 'en'):
                width = 1280 if language == 'uk' else 1000
                page = browser.new_page(viewport={'width':width,'height':720}, color_scheme=theme)
                check(page, language, theme, width)
                page.close()
        browser.close()
    print('[web-project] 4 appearance states, card/menu/details/keyboard/error, no installer calls: ok')
