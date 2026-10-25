"""One-click library installation against the real UI and a synthetic native bridge.

Does not execute installers, copy to Program Files, or interact with real UAC.
"""
import runpy
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

catalog = runpy.run_path('scripts/ui/check-library-catalog.py')
baseline = catalog['baseline']
output = Path('.artifacts/ui/screens')


def prepare(page, language='uk'):
    catalog['prepare'](page, language)
    page.add_init_script(r"""(() => {
      window.__QUICK_MODE__ = 'portable';
      window.__QUICK_DOWNLOADS__ = [];
      window.__QUICK_LISTENERS__ = [];
      window.__QUICK_EMIT__ = (change) => {
        const download = window.__QUICK_DOWNLOADS__.at(-1);
        Object.assign(download, change);
        for (const id of window.__QUICK_LISTENERS__) {
          window.__TAURI_INTERNALS__.runCallback(id, {event:'download-progress',id,payload:{...download}});
        }
      };
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args={}) => {
        if (command === 'plugin:event|listen' && args.event === 'download-progress') window.__QUICK_LISTENERS__.push(args.handler);
        if (command === 'get_settings') return {...await invoke(command,args), installationPath:'C:\\Program Files\\Pullora\\Apps'};
        if (command === 'validate_installation_path') return {ok:true,status:'elevationRequired'};
        if (command === 'get_downloads') return structuredClone(window.__QUICK_DOWNLOADS__);
        if (command === 'list_default_project_icons' || command === 'get_default_project_screenshots') return [];
        if (command === 'get_releases' && args.repo === 'fandom-translator') {
          if (window.__QUICK_MODE__ === 'network') throw 'Network unavailable';
          if (window.__QUICK_HOLD__) await new Promise(resolve=>{window.__QUICK_RESOLVE__=resolve});
          const asset = (name,id) => ({id,name,size:1000000,content_type:'application/octet-stream',download_count:1,
            browser_download_url:`https://github.com/CpPrice11/fandom-translator/releases/download/v9.0.0/${name}`});
          const packages = {
            portable:['App-x64-portable.exe','App-x64-setup.exe','App-arm64-portable.exe'],
            zip:['App-windows-x64-update.zip','App-windows-x64.zip','App-x64-setup.exe'],
            setup:['App-x64-setup.exe'],
            ambiguous:['App-one-portable.exe','App-two-portable.exe'],
            wrong:['App-arm64-portable.exe','App-linux.zip'],
          };
          const stable = {id:901,tag_name:'v9.0.0',name:'Synthetic test release',html_url:'https://github.com/CpPrice11/fandom-translator',
            published_at:'2026-10-25T00:00:00Z',draft:false,prerelease:false,body:'Test data',assets:(packages[window.__QUICK_MODE__]??[]).map(asset)};
          const result = window.__QUICK_MODE__ === 'none' ? [] : [{...stable,id:902,tag_name:'v10-beta',prerelease:true},stable];
          (window.__PULLORA_TEST_NATIVE_RELEASES__??={})[`${args.owner.toLowerCase()}/${args.repo.toLowerCase()}`]=result;
          return result;
        }
        if (command === 'start_download') {
          window.__CATALOG_CALLS__.push({command,args});
          const id = `quick-${window.__QUICK_DOWNLOADS__.length}`;
          window.__QUICK_DOWNLOADS__.push({id,fileName:args.fileName,sourceUrl:args.url,owner:args.owner,repo:args.repo,tag:args.tag,
            status:'pending',stage:'queued',progress:0,downloadedSize:0,totalSize:args.size});
          window.__QUICK_EMIT__({});
          return id;
        }
        if (command === 'cancel_download') {
          window.__CATALOG_CALLS__.push({command,args});
          window.__QUICK_DOWNLOADS__ = window.__QUICK_DOWNLOADS__.filter(x=>x.id!==args.id);
          return;
        }
        return invoke(command,args);
      };
    })()""")


def app(page):
    return page.locator('.repo-card').filter(has=page.locator('.repo-name', has_text='fandom-translator'))


def calls(page):
    return page.evaluate("window.__CATALOG_CALLS__.filter(x=>x.command==='start_download' && x.args.repo==='fandom-translator')")


def start(page, mode='portable'):
    page.evaluate('(mode)=>window.__QUICK_MODE__=mode', mode)
    app(page).locator('.repo-primary-action').click()



def main():
    with sync_playwright() as playwright:
        browser = baseline['launch_browser'](playwright)
        combinations = 0
        for theme in ('dark','light'):
            for language in ('uk','en'):
                for width,height in ((1000,700),(1280,720),(1920,1080)):
                    if '--focused' in sys.argv and (theme,language,width) != ('dark','uk',1280):
                        continue
                    page = browser.new_page(viewport={'width':width,'height':height}, color_scheme=theme)
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
                    prepare(page,language)
                    baseline['open_library'](page)
                    page.evaluate('window.__QUICK_HOLD__=true')
                    start(page)
                    page.wait_for_function("typeof window.__QUICK_RESOLVE__ === 'function'")
                    assert app(page).locator('.repo-primary-action').is_disabled()
                    assert not page.get_by_role('dialog').count()
                    page.evaluate('window.__QUICK_HOLD__=false;window.__QUICK_RESOLVE__()')
                    app(page).get_by_role('progressbar').wait_for()
                    assert len(calls(page)) == 1
                    assert calls(page)[0]['args']['fileName'] == 'App-x64-portable.exe'
                    assert calls(page)[0]['args']['tag'] == 'v9.0.0'
                    assert not calls(page)[0]['args']['preferExistingInstall']
                    assert not page.get_by_role('dialog').count()
                    page.evaluate("window.__QUICK_EMIT__({status:'failed',stage:'failed',error:'PULLORA_ERROR:errors.installElevationCancelled'})")
                    recovery = app(page).locator('.repo-install-recovery')
                    recovery.wait_for()
                    assert 'PULLORA_ERROR' not in recovery.inner_text()
                    assert recovery.locator('button').count()==1
                    assert recovery.locator('button').first.bounding_box()['height'] < 60
                    for icon in recovery.locator('.ui-icon').all():
                        assert icon.bounding_box()['height'] <= 20
                    page.add_script_tag(path='.codex-tools/axe/package/axe.min.js')
                    violations = page.evaluate("""async()=> (await axe.run(document.querySelector('.library-page'), {
                      runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}
                    })).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))""")
                    assert not violations, violations
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    page.screenshot(path=output/f'quick-install-{theme}-{language}-{width}.png')
                    app(page).locator('.repo-primary-action').click()
                    app(page).get_by_role('progressbar').wait_for()
                    assert len(calls(page))==2
                    # Completion is synthetic; the real native registry is not touched.
                    page.evaluate("""() => {
                      window.__PULLORA_TEST_INSTALLED_APPS__.push({name:'fandom-translator',owner:'CpPrice11',repo:'fandom-translator',activeVersion:'v9.0.0',
                        versions:[{tag:'v9.0.0',installedAt:'2026-10-25T00:00:00Z',executable:'App.exe',sizeBytes:1000000}]});
                      window.__QUICK_EMIT__({status:'completed',stage:'completed',progress:100});
                    }""")
                    app(page).get_by_role('button',name='Launch' if language=='en' else 'Запустити',exact=True).wait_for()
                    assert not errors,errors
                    page.close()
                    combinations += 1

        for mode, expected in [('zip','App-windows-x64.zip'),('setup','App-x64-setup.exe')]:
            page=browser.new_page(viewport={'width':1280,'height':720})
            prepare(page)
            baseline['open_library'](page)
            start(page,mode)
            app(page).get_by_role('progressbar').wait_for()
            assert calls(page)[0]['args']['fileName']==expected
            assert not page.get_by_role('dialog').count()
            page.close()

        for mode in ('ambiguous','wrong','none','network'):
            page=browser.new_page(viewport={'width':1280,'height':720})
            prepare(page)
            baseline['open_library'](page)
            start(page,mode)
            if mode in ('ambiguous','wrong'):
                page.get_by_role('dialog').wait_for()
                page.locator('.release-asset-card').first.wait_for()
                assert page.get_by_role('dialog').evaluate('el=>el.contains(document.activeElement)')
                assert page.locator('.release-action-primary').is_disabled()
                if mode == 'ambiguous':
                    page.locator('.release-asset-card').first.click()
                    page.locator('.release-action-primary').click()
                    page.locator('[data-wizard-step=confirm]').wait_for()
                    page.wait_for_function("!document.querySelector('.release-action-primary').disabled")
                    assert 'Program Files' in page.locator('.release-install-path').inner_text()
                    page.keyboard.press('Tab')
                    assert page.get_by_role('dialog').evaluate('el=>el.contains(document.activeElement)')
                page.keyboard.press('Escape')
                page.get_by_role('dialog').wait_for(state='detached')
            else:
                page.locator('.library-toast[role=alert]').wait_for()
            assert not calls(page)
            assert app(page).locator('.repo-primary-action').is_enabled()
            page.close()
        for language in ('uk','en'):
            page=browser.new_page(viewport={'width':1280,'height':720})
            prepare(page,language)
            baseline['open_library'](page)
            page.get_by_role('navigation').first.get_by_role('button',name='Settings' if language=='en' else 'Налаштування',exact=True).click()
            page.locator('#installPath').wait_for()
            page.get_by_role('button',name='Check' if language=='en' else 'Перевірити',exact=True).click()
            page.locator('#installPath-status.success').wait_for()
            assert page.locator('#installPath').get_attribute('aria-invalid') is None
            assert 'Windows' in page.locator('#installPath-status').inner_text()
            page.close()
        page=browser.new_page(viewport={'width':1280,'height':720})
        prepare(page)
        baseline['open_library'](page)
        trigger=app(page).locator('.repo-more-action')
        trigger.scroll_into_view_if_needed()
        page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        trigger.click()
        page.locator('.repo-context-menu [role=menu]').wait_for()
        page.get_by_role('menuitem',name='Версії',exact=True).click()
        page.locator('[data-wizard-step=version]').wait_for()
        page.keyboard.press('Escape')
        page.get_by_role('dialog').wait_for(state='detached')
        assert trigger.evaluate('el=>el===document.activeElement')
        page.close()
        browser.close()
    print(f'[quick-install] {combinations} appearance cases; portable/ZIP/setup, stable-only, busy, retry, completion, ambiguity, incompatible assets, missing releases and network failure: ok (mocked native)')


if __name__ == '__main__':
    main()
