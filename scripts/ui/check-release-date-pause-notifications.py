"""Real UI, synthetic Tauri bridge; native HTTP/notification tests are separate."""
import runpy
from pathlib import Path
from playwright.sync_api import sync_playwright
operations=runpy.run_path('scripts/ui/check-card-operations.py')
baseline=operations['baseline']
output=Path('.artifacts/ui/screens')

def prepare(page,language):
    operations['prepare'](page,language,initial=True)
    page.add_init_script("""(() => {
      const cache=window.__PULLORA_TEST_GITHUB_CACHE__;
      cache['releases:cpprice11/steam-achievement-manager'].data[0].published_at='2025-04-05T10:00:00Z';
      cache['releases:cpprice11/fandom-translator'].data[0].published_at=null;
      localStorage.setItem('pullora.library.latestVersions.v1',JSON.stringify({'cpprice11/steam-achievement-manager':{checkedAt:Date.now(),latestVersion:'v0.2.3'}}));
      window.__RELEASE_LISTENERS__=[];
      const invoke=window.__TAURI_INTERNALS__.invoke;
      let settings;
      window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
        if(command==='plugin:event|listen' && args.event==='library-release-checked') window.__RELEASE_LISTENERS__.push(args.handler);
        if(command==='get_settings') return structuredClone(settings??await invoke(command,args));
        if(command==='update_settings') {if(window.__SETTINGS_FAIL__) throw 'PULLORA_ERROR:errors.commandFailed'; settings=structuredClone(args.newSettings);return;}
        if(command==='set_download_paused') {
          window.__CATALOG_CALLS__.push({command,args});
          if(window.__PAUSE_FAIL__) throw 'PULLORA_ERROR:errors.commandFailed';
          window.__CARD_EMIT__({paused:args.paused});return;
        }
        return invoke(command,args);
      };
    })()""")

def run(page,language,theme,width):
    prepare(page,language);baseline['open_library'](page)
    app=operations['card'](page)
    app.locator('.repo-meta').filter(has_text='2025').wait_for()
    assert '2026' not in app.locator('.repo-meta').inner_text()
    original=page.evaluate('window.__CARD_DOWNLOAD__.downloadedSize')
    for table in (False,True):
        page.locator('.library-view-toggle button').nth(1 if table else 0).click()
        app=operations['card'](page)
        pause=app.get_by_role('button',name=('Призупинити завантаження' if language=='uk' else 'Pause download')+': app-portable.exe',exact=True)
        pause.scroll_into_view_if_needed();pause.focus();pause.press('Enter')
        resume=app.get_by_role('button',name=('Продовжити завантаження' if language=='uk' else 'Resume download')+': app-portable.exe',exact=True)
        resume.wait_for()
        assert ('На паузі' if language=='uk' else 'Paused') in app.inner_text()
        assert page.evaluate('window.__CARD_DOWNLOAD__.downloadedSize')==original
        assert not app.locator('.repo-primary-action').count()
        assert not page.locator('.release-modal').count()
        assert app.locator('.repo-card-operation').bounding_box()['width']>=110
        if table:
            assert app.bounding_box()['height']<220
            date=app.locator('.repo-table-date time');assert date.get_attribute('datetime')=='2025-04-05T10:00:00Z'
            assert page.locator('.repo-card').filter(has=page.locator('.repo-name',has_text='fandom-translator')).locator('.repo-table-date').inner_text()=='—'
        assert not app.evaluate('el=>el.scrollWidth>el.clientWidth+1')
        page.screenshot(path=output/f'pause-{table}-{theme}-{language}-{width}.png')
        resume.click();pause.wait_for()
    page.evaluate("window.__CARD_EMIT__({stage:'verifying'})")
    app.locator('.repo-pause-download').wait_for(state='detached')
    page.evaluate("window.__CARD_EMIT__({stage:'downloading'})")
    app.locator('.repo-pause-download').wait_for()
    page.evaluate('window.__PAUSE_FAIL__=true')
    app.scroll_into_view_if_needed()
    page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    app.locator('.repo-pause-download').click()
    page.locator('.library-toast[role=alert]').wait_for()
    assert not page.evaluate('window.__CARD_DOWNLOAD__.paused')
    page.evaluate('window.__PAUSE_FAIL__=false')
    # Native polling events update the visible release date without reopening Library.
    page.evaluate("""() => {for(const id of window.__RELEASE_LISTENERS__)window.__TAURI_INTERNALS__.runCallback(id,{event:'library-release-checked',id,payload:{owner:'CpPrice11',repo:'steam-achievement-manager',version:'v0.2.3',publishedAt:'2025-05-06T00:00:00Z'}});} """)
    page.wait_for_function("document.querySelector('[data-repo-key=\"cpprice11/steam-achievement-manager\"] .repo-table-date time')?.dateTime==='2025-05-06T00:00:00Z'")
    page.locator('.library-sidebar-filter-nav').get_by_role('button',name='Оновлення' if language=='uk' else 'Updates',exact=True).click()
    panel=page.locator('.download-panel');panel.wait_for()
    panel.locator('.repo-pause-download').click()
    page.wait_for_function("document.querySelector('.download-panel .download-status')?.textContent.includes('"+('На паузі' if language=='uk' else 'Paused')+"')")
    assert panel.locator('.download-stage-note').inner_text()==('Можна продовжити завантаження або скасувати його.' if language=='uk' else 'Resume the download when ready, or cancel it.')
    if width==1280:
        page.add_script_tag(path='.codex-tools/axe/package/axe.min.js')
        assert not page.evaluate("async()=> (await axe.run(document.querySelector('.download-panel'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations")
    page.screenshot(path=output/f'pause-panel-{theme}-{language}-{width}.png')
    panel.locator('.repo-pause-download').click()
    page.locator('.library-sidebar-filter-nav').get_by_role('button',name='Усі' if language=='uk' else 'All',exact=True).click()
    page.get_by_role('button',name='Налаштування' if language=='uk' else 'Settings',exact=True).first.click()
    checkbox=page.locator('#update-notifications');checkbox.wait_for();assert checkbox.is_checked()
    checkbox.uncheck();page.wait_for_function("window.__CATALOG_CALLS__.length>=0")
    assert not checkbox.is_checked()
    page.get_by_role('button',name='Бібліотека' if language=='uk' else 'Library',exact=True).first.click()
    page.get_by_role('button',name='Налаштування' if language=='uk' else 'Settings',exact=True).first.click()
    checkbox.wait_for();assert not checkbox.is_checked()
    page.evaluate('window.__SETTINGS_FAIL__=true');checkbox.click();page.wait_for_function("document.querySelector('#update-notifications')?.checked===false")
    page.evaluate('window.__SETTINGS_FAIL__=false');checkbox.check()
    if width==1280:
        page.add_script_tag(path='.codex-tools/axe/package/axe.min.js')
        violations=page.evaluate("async()=> (await axe.run(document.querySelector('#settings-general'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations")
        assert not violations,violations
    page.screenshot(path=output/f'notification-setting-{theme}-{language}-{width}.png')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')

if __name__=='__main__':
    output.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=baseline['launch_browser'](p);count=0
        for theme in ('dark','light'):
            for language in ('uk','en'):
                for width,height in ((1000,700),(1280,720),(1920,1080)):
                    page=browser.new_page(viewport={'width':width,'height':height},color_scheme=theme,reduced_motion='reduce')
                    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                    page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
                    run(page,language,theme,width);assert not errors,errors;page.close();count+=1
        browser.close()
    print(f'[release-date-pause-notifications] {count} cases: real release dates/unknown/native event, pause/resume/bytes/error/stage guard, keyboard, settings persistence/rollback, axe')
