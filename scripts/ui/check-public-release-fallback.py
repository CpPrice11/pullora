"""Render anonymous fallback metadata through the real picker and a synthetic native bridge."""
import runpy
from pathlib import Path
from playwright.sync_api import sync_playwright

QUICK = runpy.run_path('scripts/ui/check-quick-install.py')
BASELINE = QUICK['baseline']
OUTPUT = Path('.artifacts/ui/screens')


def prepare(page, language):
    QUICK['prepare'](page, language)
    page.add_init_script('''(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command,args={}) => {
        if(command === 'get_releases' && args.repo === 'fandom-translator') {
          const asset = (name,id)=>({id,name,size:0,content_type:'application/octet-stream',download_count:0,
            digest:'sha256:'+'a'.repeat(64),browser_download_url:`https://github.com/CpPrice11/fandom-translator/releases/download/v9.0.0/${name}`});
          const latest = {id:200000000000001,tag_name:'v9.0.0',name:'v9.0.0',html_url:'https://github.com/CpPrice11/fandom-translator/releases/tag/v9.0.0',
            published_at:null,draft:false,prerelease:false,body:null,
            assets:[asset('App-one-portable.exe',1),...(window.__PUBLIC_SINGLE__?[]:[asset('App-two-portable.exe',2)])]};
          const result = [latest,{...latest,id:42,tag_name:'v8.0.0',assets:[]}];
          (window.__PULLORA_TEST_NATIVE_RELEASES__??={})['cpprice11/fandom-translator']=result;
          return result;
        }
        return invoke(command,args);
      };
    })()''')


def check(page, theme, language, width):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    prepare(page, language)
    BASELINE['open_library'](page)
    card = QUICK['app'](page)
    more = card.locator('.repo-more-action')
    more.scroll_into_view_if_needed()
    more.click()
    page.get_by_role('menuitem', name='Версії' if language == 'uk' else 'Versions', exact=True).click()
    page.locator('[data-wizard-step=version]').wait_for()
    assert page.locator('.release-version-card').count() == 2
    assert page.locator('.release-version-card.active strong').inner_text() == 'v9.0.0'
    assert ('без дати' if language == 'uk' else 'no date') in page.locator('.release-version-card.active').inner_text()
    page.locator('.release-action-primary').click()
    page.locator('[data-wizard-step=file]').wait_for()
    assert page.locator('.release-asset-card').count() == 2
    unknown = 'Невідомо' if language == 'uk' else 'Unknown'
    assert page.locator('.release-asset-size').all_inner_texts() == [unknown,unknown]
    page.locator('.release-asset-card').first.click()
    page.locator('.release-action-primary').click()
    page.locator('[data-wizard-step=confirm]').wait_for()
    assert unknown in page.locator('.release-confirm-card').inner_text()
    assert page.locator('.release-confirm-card').evaluate('el => el.scrollWidth <= el.clientWidth + 1')
    page.screenshot(path=OUTPUT / f'public-release-{theme}-{language}-{width}.png')
    page.keyboard.press('Escape')
    page.get_by_role('dialog').wait_for(state='detached')
    page.evaluate('window.__PUBLIC_SINGLE__=true')
    card.locator('.repo-primary-action').click()
    card.get_by_role('progressbar').wait_for()
    assert card.get_by_role('progressbar').get_attribute('aria-valuenow') is None
    call = QUICK['calls'](page)[-1]['args']
    assert call['tag'] == 'v9.0.0' and call['size'] == 0
    assert call['url'].endswith('/v9.0.0/App-one-portable.exe')
    page.evaluate("window.__QUICK_EMIT__({status:'downloading',stage:'verifying',checksumStatus:'verified'})")
    card.get_by_text('SHA-256 перевірено' if language == 'uk' else 'SHA-256 verified', exact=True).wait_for()
    assert not errors, errors


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = BASELINE['launch_browser'](playwright)
        for theme in ('dark','light'):
            for language,width in [('uk',1280),('en',1000)]:
                page = browser.new_page(viewport={'width':width,'height':720},color_scheme=theme)
                check(page,theme,language,width)
                page.close()
        browser.close()
    print('[public-release] 4 states: cached history, missing date/size, picker, auto install and checksum UI: ok (mock bridge)')
