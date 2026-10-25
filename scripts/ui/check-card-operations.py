"""Exercise inline card operations through the real UI and a mocked Tauri bridge."""
import json
import runpy
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

catalog = runpy.run_path('scripts/ui/check-library-catalog.py')
baseline = catalog['baseline']
contrast = catalog['contrast_checks']
output = Path('.artifacts/ui/screens')


def prepare(page, language='uk', initial=False):
    catalog['prepare'](page, language)
    page.add_init_script('window.__CARD_INITIAL__ = ' + json.dumps(initial))
    page.add_init_script("""(() => {
      const download = {id:'inline-download',fileName:'app-portable.exe',owner:'cpprice11',repo:'steam-achievement-manager',
        tag:'v0.2.3',progress:37,totalSize:100000000,downloadedSize:37000000,status:'downloading',stage:'downloading'};
      window.__CARD_DOWNLOAD__ = download;
      window.__PULLORA_TEST_GITHUB_CACHE__['owner:cpprice11:1:false'].data.items[0].updated_at='2026-10-24T00:00:00Z';
      window.__CARD_DOWNLOAD_HANDLERS__ = [];
      window.__CARD_EMIT__ = (change) => {
        Object.assign(window.__CARD_DOWNLOAD__, change);
        for (const id of window.__CARD_DOWNLOAD_HANDLERS__) {
          window.__TAURI_INTERNALS__.runCallback(id, {event:'download-progress',id,payload:{...window.__CARD_DOWNLOAD__}});
        }
      };
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'plugin:event|listen' && args.event === 'download-progress') window.__CARD_DOWNLOAD_HANDLERS__.push(args.handler);
        if (command === 'get_downloads') return window.__CARD_INITIAL__ ? [{...download}] : [];
        if (command === 'list_default_project_icons' || command === 'get_default_project_screenshots') return [];
        if (command === 'start_download') {
          window.__CATALOG_CALLS__.push({command,args});
          window.__CARD_EMIT__({status:'downloading',stage:'downloading',progress:37});
          return download.id;
        }
        if (command === 'cancel_download') {
          window.__CATALOG_CALLS__.push({command,args});
          if (window.__CARD_CANCEL_ERROR__) throw 'PULLORA_ERROR:errors.commandFailed';
          return;
        }
        if (command === 'list_owner_repositories' && window.__CARD_CATALOG_ERROR__) throw 'Network offline';
        return invoke(command,args);
      };
    })()""")


def card(page):
    return page.locator('.repo-card').filter(has=page.locator('.repo-name', has_text='steam-achievement-manager'))


def batch_cancel(page):
    page.locator('.library-refresh-btn').click()
    card(page).locator('.repo-update-version').wait_for()
    card(page).locator('.repo-primary-action').click()
    card(page).get_by_role('progressbar').wait_for()
    card(page).locator('.repo-cancel-download').click()
    card(page).get_by_role('progressbar').wait_for(state='detached')
    page.locator('.library-sidebar-filter-nav').get_by_role('button', name='Оновлення', exact=True).click()
    page.wait_for_function("document.querySelector('.updates-center')?.getAttribute('aria-busy') === 'false'")


def restored_completion(page):
    page.evaluate("""() => {
      const apps=window.__PULLORA_TEST_INSTALLED_APPS__;
      apps[0].activeVersion='v0.2.3';
      apps[0].versions.push({...apps[0].versions[0],tag:'v0.2.3'});
      window.__CARD_EMIT__({status:'completed',stage:'completed',progress:100,downloadedSize:100000000});
    }""")
    page.wait_for_function("Array.from(document.querySelectorAll('.repo-card')).find(el=>el.textContent.includes('steam-achievement-manager')).querySelector('.repo-installed-version').textContent.includes('v0.2.3')")


def inline_states(page, language):
    app = card(page)
    progress = app.get_by_role('progressbar')
    progress.wait_for()
    assert progress.get_attribute('aria-valuenow') == '37'
    assert not app.locator('.repo-primary-action').count()
    app.locator('.repo-more-action').click()
    assert page.locator('.repo-context-menu [role=menuitem]').first.is_disabled()
    page.keyboard.press('Escape')
    for stage in ('queued', 'downloading', 'verifying', 'extracting', 'installing', 'launchChecking'):
        page.evaluate('(stage) => window.__CARD_EMIT__({stage})', stage)
        cancel = app.locator('.repo-cancel-download')
        if stage in ('queued', 'downloading'):
            cancel.wait_for()
        else:
            cancel.wait_for(state='detached')
        assert progress.get_attribute('aria-valuetext')
        assert app.evaluate('el => el.scrollWidth <= el.clientWidth + 1')
    page.evaluate("window.__CARD_EMIT__({stage:'downloading',totalSize:0})")
    page.wait_for_function("document.querySelector('.repo-operation-track')?.getAttribute('aria-valuenow') === null")
    page.evaluate("window.__CARD_EMIT__({stage:'downloading',totalSize:100000000})")
    page.wait_for_function("document.querySelector('.repo-operation-track')?.getAttribute('aria-valuenow') === '37'")
    page.add_script_tag(path='.codex-tools/axe/package/axe.min.js')
    issues = page.evaluate("""async () => (await axe.run(document.querySelector('.library-page'), {
      runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}
    })).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))""")
    assert not issues, issues
    session = page.context.new_cdp_session(page)
    session.send('DOM.enable')
    session.send('CSS.enable')
    canvas = contrast['resolved_canvas'](page)
    for selector in ('.repo-operation-label', '.repo-operation-size', '.library-catalog-status'):
        contrast['assert_text_contrast'](session, page.locator(selector).first, canvas, selector)
    contrast['assert_focus_contrast'](page, session, app.locator('.repo-cancel-download'), canvas, 'cancel download')
    session.detach()
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')


def error_and_motion(page):
    app = card(page)
    page.evaluate('window.__CARD_CANCEL_ERROR__ = true')
    app.locator('.repo-cancel-download').click()
    page.locator('.library-toast[role=alert]').wait_for()
    assert app.locator('.repo-cancel-download').is_enabled()
    assert app.get_by_role('progressbar').count() == 1
    # Remove only the baseline helper's animation override to inspect production motion.
    page.evaluate("""() => Array.from(document.querySelectorAll('style')).find(el=>el.textContent.includes('.library-diagnostics{display:none!important}'))?.remove()""")
    page.add_style_tag(content='*:not(.repo-operation-fill),*::before,*::after{animation:none!important;transition:none!important}.library-diagnostics{display:none!important}')
    page.emulate_media(reduced_motion='no-preference')
    fill = app.locator('.repo-operation-fill')
    assert fill.evaluate('el => getComputedStyle(el).transitionProperty') == 'transform'
    assert fill.evaluate('el => parseFloat(getComputedStyle(el).transitionDuration)') <= 0.3
    before = app.get_by_role('progressbar').bounding_box()
    page.evaluate('window.__CARD_EMIT__({progress:77})')
    page.wait_for_function("Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.repo-operation-fill')).transform).a - .77) < .001")
    assert app.get_by_role('progressbar').bounding_box() == before, (before, app.get_by_role('progressbar').bounding_box())
    page.emulate_media(reduced_motion='reduce')
    reduced = fill.evaluate('el => ({duration:getComputedStyle(el).transitionDuration, property:getComputedStyle(el).transitionProperty,matches:matchMedia("(prefers-reduced-motion: reduce)").matches})')
    assert reduced['matches'] and 'transform' not in reduced['property'] and 'all' not in reduced['property'], reduced
    page.evaluate('window.__CARD_EMIT__({progress:42})')
    page.wait_for_function("document.querySelector('.repo-operation-track').getAttribute('aria-valuenow') === '42'")
    assert abs(fill.evaluate('el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a') - .42) < .001
    page.evaluate('window.__CARD_CANCEL_ERROR__ = false')
    app.locator('.repo-cancel-download').focus()
    page.keyboard.press('Enter')
    page.wait_for_function("document.activeElement?.classList.contains('repo-primary-action')")
    assert not app.get_by_role('progressbar').count()


def freshness(page, language):
    footer = page.locator('.library-catalog-status')
    assert ('завантажено' if language == 'uk' else 'loaded at') in footer.inner_text()
    page.evaluate('window.__CARD_CATALOG_ERROR__ = true')
    page.locator('.library-refresh-btn').click()
    page.wait_for_function("document.querySelector('.library-catalog-status')?.textContent.includes('Показано збережені')")
    assert page.locator('.repo-card').count() == 7


if __name__ == '__main__':
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = baseline['launch_browser'](p)
        if '--restored-only' not in sys.argv:
            page = browser.new_page(viewport={'width':1280,'height':720})
            prepare(page)
            baseline['open_library'](page)
            batch_cancel(page)
            page.close()
        page = browser.new_page(viewport={'width':1280,'height':720})
        prepare(page, initial=True)
        baseline['open_library'](page)
        restored_completion(page)
        page.close()
        if '--focused' not in sys.argv and '--restored-only' not in sys.argv:
            for theme in ('dark', 'light'):
                for language in ('uk', 'en'):
                    for width, height in ((1000,700),(1280,720),(1920,1080)):
                        page = browser.new_page(viewport={'width':width,'height':height},color_scheme=theme)
                        errors = []
                        page.on('pageerror',lambda error: errors.append(str(error)))
                        page.on('console',lambda message: errors.append(message.text) if message.type == 'error' else None)
                        page.on('response',lambda response: errors.append(f'HTTP {response.status}: {response.url}') if response.status >= 500 else None)
                        prepare(page,language,initial=True)
                        baseline['open_library'](page)
                        inline_states(page,language)
                        page.screenshot(path=output / f'operations-{theme}-{language}-{width}.png')
                        if theme == 'dark' and language == 'uk' and width == 1280:
                            error_and_motion(page)
                            freshness(page,language)
                        assert not errors,errors
                        page.close()
            page = browser.new_page(viewport={'width':1180,'height':900},color_scheme='dark')
            prepare(page,'en',initial=True)
            baseline['open_library'](page)
            page.screenshot(path=output / 'S01.png')
            page.close()
        browser.close()
    print('[card-operations] lifecycle regressions: ok; full run also covers 12 theme/language/viewport states, axe, progress, focus, motion, offline status')
