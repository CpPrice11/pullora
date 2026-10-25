"""UI regression for format preservation + read-only periodic reconciliation.

The Tauri bridge is synthetic; the Rust policy and file checks have native tests.
"""
import runpy
from pathlib import Path
from playwright.sync_api import sync_playwright

quick = runpy.run_path('scripts/ui/check-quick-install.py', run_name='installation_fixture')
baseline = quick['baseline']
output = Path('.artifacts/ui/screens')

def prepare(page, language='uk'):
    quick['prepare'](page, language)
    page.add_init_script(r"""(() => {
      window.__PULLORA_TEST_GITHUB_CACHE__['owner:cpprice11:1:false'].data.items.splice(2);
      window.__PULLORA_TEST_INSTALLED_APPS__.push({owner:'CpPrice11',repo:'fandom-translator',name:'fandom-translator',activeVersion:'v1.0.0',
        versions:[{tag:'v1.0.0',installedAt:'2026-10-25T00:00:00Z',executable:'App.exe',installDir:'C:\\Programs\\Fandom',assetName:'Old-setup.exe',installKind:'installer',sizeBytes:1000}]});
      window.__SYNC_CANDIDATE__=null;
      window.__SYNC_SCANS__=0;
      const invoke=window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
        if(command==='get_installation_snapshot') {
          window.__SYNC_SCANS__++;
          if(window.__SYNC_SCAN_FAILURE__) throw 'PULLORA_ERROR:errors.discoveryFailed';
          if(window.__SYNC_HOLD__) await new Promise(resolve=>window.__SYNC_RESOLVE__=resolve);
        }
        if(command==='discover_installed_apps') return window.__SYNC_CANDIDATE__ ? [window.__SYNC_CANDIDATE__] : [];
        if(command==='adopt_installed_app') {window.__CATALOG_CALLS__.push({command,args});return;}
        return invoke(command,args);
      };
    })()""")

def fandom(page): return quick['app'](page)

def health(page, status):
    page.evaluate("status=>{window.__PULLORA_TEST_INSTALLATION_HEALTH__=[{owner:'CpPrice11',repo:'fandom-translator',status}];window.dispatchEvent(new Event('focus'))}", status)

def open_versions(page, language='uk'):
    fandom(page).locator('.repo-more-action').click()
    page.get_by_role('menuitem',name='Versions' if language=='en' else 'Версії',exact=True).click()
    page.get_by_role('dialog').wait_for()
    page.locator('[data-wizard-step=version]').wait_for()
    page.locator('.release-action-primary').click()
    page.locator('.release-asset-card').filter(has_text='App-x64-setup.exe').wait_for()

with sync_playwright() as p:
    browser=baseline['launch_browser'](p)
    cases=0
    for theme in ('dark','light'):
        for language in ('uk','en'):
            for width,height in ((1000,700),(1280,720),(1920,1080)):
                page=browser.new_page(viewport={'width':width,'height':height},color_scheme=theme)
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
                prepare(page,language); baseline['open_library'](page)
                fandom(page).locator('.repo-primary-action').wait_for()
                before=page.evaluate("window.__CATALOG_CALLS__.filter(c=>c.command==='get_releases').length")
                health(page,'missing')
                fandom(page).locator('.repo-installation-status').wait_for()
                assert fandom(page).locator('.repo-primary-action').inner_text()==('Reinstall' if language=='en' else 'Встановити повторно')
                assert 'v1.0.0' in fandom(page).inner_text()
                assert page.evaluate("window.__PULLORA_TEST_INSTALLED_APPS__.some(a=>a.repo==='fandom-translator')")
                # Simulate an installation appearing between two local scans. Never auto-connect it.
                page.evaluate("""() => {window.__SYNC_CANDIDATE__={owner:'CpPrice11',repo:'fandom-translator',version:'v2',executablePath:'C:/Programs/New/App.exe',installDir:'C:/Programs/New'};window.dispatchEvent(new Event('focus'))}""")
                fandom(page).locator('.repo-discovered').wait_for()
                assert not page.evaluate("window.__CATALOG_CALLS__.some(c=>c.command==='adopt_installed_app')")
                assert page.evaluate("window.__CATALOG_CALLS__.filter(c=>c.command==='get_releases').length")==before
                page.evaluate('document.querySelectorAll("*").forEach(el=>{if(el.scrollTop)el.scrollTop=0})')
                page.screenshot(path=output/f'installation-sync-{theme}-{language}-{width}.png')
                # Files return externally: Launch returns without reinstallation or losing metadata.
                page.evaluate('window.__SYNC_CANDIDATE__=null')
                health(page,'ready')
                fandom(page).locator('.repo-installation-status').wait_for(state='detached')
                assert fandom(page).locator('.repo-primary-action').inner_text()==('Launch' if language=='en' else 'Запустити')
                health(page,'unavailable')
                page.wait_for_function("document.querySelectorAll('.repo-installation-status').length===1")
                assert fandom(page).locator('.repo-primary-action').is_disabled()
                health(page,'missing')
                page.wait_for_function("!Array.from(document.querySelectorAll('.repo-card')).find(c=>c.textContent.includes('fandom-translator')).querySelector('.repo-primary-action').disabled")
                page.add_script_tag(path='.codex-tools/axe/package/axe.min.js')
                issues=page.evaluate("""async()=> (await axe.run(document.querySelector('.library-page'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))""")
                assert not issues,issues
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                fandom(page).locator('.repo-primary-action').click()
                fandom(page).get_by_role('progressbar').wait_for()
                assert quick['calls'](page)[0]['args']['fileName']=='App-x64-setup.exe'
                assert quick['calls'](page)[0]['args']['preferExistingInstall']
                assert not page.get_by_role('dialog').count()
                assert not errors,errors
                page.close();cases+=1

    page=browser.new_page(viewport={'width':1280,'height':720})
    prepare(page);baseline['open_library'](page)
    open_versions(page)
    page.wait_for_function("Array.from(document.querySelectorAll('.release-asset-card')).some(b=>b.textContent.includes('App-x64-setup.exe')&&!b.disabled)")
    assert page.locator('.release-asset-card').filter(has_text='App-x64-portable.exe').is_disabled()
    assert page.locator('.release-asset-card').filter(has_text='App-arm64-portable.exe').is_disabled()
    assert 'Зберігаємо поточний тип' in page.get_by_role('dialog').inner_text()
    page.keyboard.press('Escape')
    page.get_by_role('dialog').wait_for(state='detached')
    page.evaluate("window.__QUICK_MODE__='wrong'")
    health(page,'missing')
    fandom(page).locator('.repo-primary-action').click()
    page.locator('.library-toast[role=alert]').wait_for()
    assert not quick['calls'](page)
    assert 'поточного типу' in page.locator('.library-toast[role=alert]').inner_text()
    # Scan errors preserve the last complete snapshot.
    page.evaluate("window.__SYNC_SCAN_FAILURE__=true;window.dispatchEvent(new Event('focus'))")
    page.get_by_text('Не вдалося прочитати список встановлених програм Windows.',exact=True).wait_for()
    assert 'v1.0.0' in fandom(page).inner_text()
    page.evaluate('window.__SYNC_SCAN_FAILURE__=false')
    # One local scan at a time, even during a burst of focus events.
    page.evaluate("window.__SYNC_HOLD__=true;window.dispatchEvent(new Event('focus'))")
    page.wait_for_function('Boolean(window.__SYNC_RESOLVE__)')
    held=page.evaluate('window.__SYNC_SCANS__')
    page.evaluate("for(let i=0;i<8;i++)window.dispatchEvent(new Event('focus'))")
    assert page.evaluate('window.__SYNC_SCANS__')==held
    page.evaluate('window.__SYNC_HOLD__=false;window.__SYNC_RESOLVE__()')
    page.get_by_text('Не вдалося прочитати список встановлених програм Windows.',exact=True).wait_for(state='detached')
    health(page,'missing')
    fandom(page).locator('.repo-name button').click()
    details=page.locator('.library-catalog-details')
    details.wait_for()
    assert details.locator('.hero-primary-btn').count()==2
    assert all(button.inner_text()=='Встановити повторно' for button in details.locator('.hero-primary-btn').all())
    health(page,'unavailable')
    page.wait_for_function("Array.from(document.querySelectorAll('.library-catalog-details .hero-primary-btn')).every(button=>button.disabled)")
    assert all(button.inner_text()=='Не вдалося перевірити файли програми' for button in details.locator('.hero-primary-btn').all())
    page.locator('.library-catalog-details-toolbar button').click()
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__SYNC_HIDDEN__});window.__SYNC_HIDDEN__=true;document.dispatchEvent(new Event('visibilitychange'))")
    count=page.evaluate('window.__SYNC_SCANS__')
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    page.wait_for_timeout(100)
    assert page.evaluate('window.__SYNC_SCANS__')==count
    page.evaluate("window.__SYNC_HIDDEN__=false;document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_function('(count)=>window.__SYNC_SCANS__>count',arg=count)
    # Native health polling is local; a real periodic tick must not query GitHub.
    count=page.evaluate('window.__SYNC_SCANS__')
    api_count=page.evaluate("window.__CATALOG_CALLS__.filter(c=>c.command==='get_releases').length")
    page.wait_for_function('(count)=>window.__SYNC_SCANS__>count',arg=count,timeout=35000)
    assert page.evaluate("window.__CATALOG_CALLS__.filter(c=>c.command==='get_releases').length")==api_count
    page.close();browser.close()
print(f'[installation-sync] {cases} appearance/axe cases + preserved format/manual picker/missing/return/error/polling: PASS (synthetic bridge)')
