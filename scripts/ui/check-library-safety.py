"""Real UI + synthetic native responses. Native process/registry/hash tests run separately."""
import runpy
from pathlib import Path
from playwright.sync_api import sync_playwright

catalog=runpy.run_path('scripts/ui/check-library-catalog.py')
baseline=catalog['baseline']
output=Path('.artifacts/ui/screens')

def prepare(page,language):
    catalog['prepare'](page,language)
    page.add_init_script(r"""(() => {
      window.__PULLORA_TEST_GITHUB_CACHE__['owner:cpprice11:1:false'].data.items.splice(2);
      window.__SAFETY_RUNTIME__=[{owner:'CpPrice11',repo:'steam-achievement-manager',running:true,uncertain:false}];
      window.__SAFETY_LISTENERS__=[];
      window.__SAFETY_DOWNLOADS__=[];
      window.__SAFETY_ADOPTED__=false;
      window.__SAFETY_RUNTIME_CALLS__=0;
      const candidate={owner:'CpPrice11',repo:'fandom-translator',version:'v1.30.25',
        executablePath:"C:\\Programs\\Fandom Wiki Translator\\Fandom Wiki Translator.exe",installDir:"C:\\Programs\\Fandom Wiki Translator"};
      window.__SAFETY_EMIT__=(change)=>{
        const d=window.__SAFETY_DOWNLOADS__[0]; Object.assign(d,change);
        for(const id of window.__SAFETY_LISTENERS__) window.__TAURI_INTERNALS__.runCallback(id,{event:'download-progress',id,payload:{...d}});
      };
      window.__SAFETY_CANDIDATE__=candidate;
      const invoke=window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
        if(command==='plugin:event|listen' && args.event==='download-progress') window.__SAFETY_LISTENERS__.push(args.handler);
        if(command==='get_app_runtime_states') { window.__SAFETY_RUNTIME_CALLS__++; return structuredClone(window.__SAFETY_RUNTIME__); }
        if(command==='discover_installed_apps') return window.__SAFETY_ADOPTED__ ? [] : [{...candidate}];
        if(command==='get_downloads') return structuredClone(window.__SAFETY_DOWNLOADS__);
        if(command==='adopt_installed_app') {
          window.__CATALOG_CALLS__.push({command,args});
          if(window.__SAFETY_STALE__) throw 'PULLORA_ERROR:errors.discoveryInvalid';
          window.__SAFETY_ADOPTED__=true;
          window.__PULLORA_TEST_INSTALLED_APPS__.push({name:'fandom-translator',owner:candidate.owner,repo:candidate.repo,activeVersion:candidate.version,
            versions:[{tag:candidate.version,installedAt:'2026-10-25T00:00:00Z',executable:candidate.executablePath,installDir:candidate.installDir,installKind:'external',sizeBytes:0}]});
          return;
        }
        if(command==='uninstall_app') {
          window.__CATALOG_CALLS__.push({command,args});
          if(window.__SAFETY_GUARD__) throw 'PULLORA_ERROR:errors.appRunning';
          window.__SAFETY_ADOPTED__=false;
          window.__PULLORA_TEST_INSTALLED_APPS__=window.__PULLORA_TEST_INSTALLED_APPS__.filter(app=>app.repo!==args.repo);
          return;
        }
        if(command==='start_download') {
          window.__CATALOG_CALLS__.push({command,args});
          if(window.__SAFETY_GUARD__) throw 'PULLORA_ERROR:errors.appRunning';
          return 'safety-start';
        }
        if(command==='list_default_project_icons' || command==='get_default_project_screenshots') return [];
        return invoke(command,args);
      };
    })()""")

def card(page,name):
    return page.locator('.repo-card').filter(has=page.locator('.repo-name',has_text=name))

def wake(page,states):
    page.evaluate('(states)=>{window.__SAFETY_RUNTIME__=states;window.dispatchEvent(new Event("focus"))}',states)

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
                prepare(page,language)
                baseline['open_library'](page)
                sam=card(page,'steam-achievement-manager')
                fandom=card(page,'fandom-translator')
                sam.locator('.repo-runtime-status').wait_for()
                assert sam.locator('.repo-primary-action').is_disabled()
                sam.locator('.repo-more-action').scroll_into_view_if_needed()
                page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                sam.locator('.repo-more-action').click()
                assert page.locator('.repo-context-menu .danger-menu-item').is_disabled()
                page.keyboard.press('Escape')
                fandom.locator('.repo-discovered').wait_for()
                assert 'v1.30.25' in fandom.locator('.repo-discovered').inner_text()
                assert page.evaluate('window.__SAFETY_CANDIDATE__.installDir') in fandom.locator('.repo-discovered-path').inner_text()
                assert not page.evaluate("window.__CATALOG_CALLS__.some(c=>c.command==='adopt_installed_app')")
                assert page.locator('.repo-card').count()==2
                page.evaluate('document.querySelectorAll("*").forEach(el=>{if(el.scrollTop) el.scrollTop=0})')
                page.screenshot(path=output/f'library-safety-{theme}-{language}-{width}.png')
                fandom.locator('.repo-discovered button').click()
                fandom.locator('.repo-discovered').wait_for(state='detached')
                assert not page.evaluate("window.__CATALOG_CALLS__.some(c=>c.command==='start_download')")
                fandom.locator('.repo-more-action').scroll_into_view_if_needed()
                page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                fandom.locator('.repo-more-action').click()
                page.locator('.repo-context-menu .danger-menu-item').click()
                dialog=page.get_by_role('alertdialog')
                dialog.wait_for()
                assert ('Files stay in place' if language=='en' else 'Файли залишаться на місці') in dialog.inner_text()
                assert page.evaluate('window.__SAFETY_CANDIDATE__.installDir') in dialog.locator('.uninstall-confirm-path').inner_text()
                dialog.locator('.uninstall-danger-btn').click()
                dialog.wait_for(state='detached')
                fandom.locator('.repo-discovered').wait_for()
                assert not page.evaluate("window.__CATALOG_CALLS__.some(c=>/remove_dir|copy|delete_file/.test(c.command))")
                page.evaluate("""() => {
                  window.__SAFETY_DOWNLOADS__=[{id:'hash-test',owner:'CpPrice11',repo:'fandom-translator',fileName:'App.exe',sourceUrl:'https://github.com/CpPrice11/fandom-translator/releases/download/v1/App.exe',tag:'v1',
                    status:'downloading',stage:'verifying',progress:100,totalSize:1000,downloadedSize:1000,checksumStatus:'pending'}];
                  window.__SAFETY_EMIT__({});
                }""")
                fandom.locator('.repo-checksum').wait_for()
                for status in ('verified','unavailable','failed'):
                    page.evaluate('(s)=>window.__SAFETY_EMIT__({checksumStatus:s})',status)
                    expected={'verified':('SHA-256 перевірено','SHA-256 verified'),
                        'unavailable':('Контрольну суму не опубліковано','No checksum published'),
                        'failed':('Перевірку SHA-256 не пройдено','SHA-256 verification failed')}[status][language=='en']
                    page.wait_for_function('(text)=>document.querySelector(".repo-checksum")?.textContent===text',arg=expected)
                page.evaluate("window.__SAFETY_EMIT__({status:'failed',stage:'failed',error:'PULLORA_ERROR:errors.appChecksumMismatch'})")
                fandom.locator('.repo-install-recovery').last.wait_for()
                assert 'PULLORA_ERROR' not in fandom.inner_text()
                assert 'SHA-256' in fandom.inner_text()
                page.add_script_tag(path='.codex-tools/axe/package/axe.min.js')
                issues=page.evaluate("""async()=> (await axe.run(document.querySelector('.library-page'),{
                  runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}
                })).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))""")
                assert not issues,issues
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                assert not errors,errors
                page.close(); cases+=1
    page=browser.new_page(viewport={'width':1280,'height':720})
    prepare(page,'uk'); baseline['open_library'](page)
    sam=card(page,'steam-achievement-manager'); fandom=card(page,'fandom-translator')
    wake(page,[{'owner':'CpPrice11','repo':'steam-achievement-manager','running':False,'uncertain':True}])
    page.wait_for_function("document.querySelector('.repo-runtime-status')?.textContent==='Стан невідомий'")
    assert sam.locator('.repo-primary-action').is_disabled()
    wake(page,[])
    page.wait_for_function("!Array.from(document.querySelectorAll('.repo-card')).find(c=>c.textContent.includes('steam-achievement-manager')).querySelector('.repo-primary-action').disabled")
    page.locator('.library-refresh-btn').click()
    sam.locator('.repo-update-version').wait_for()
    page.evaluate('window.__SAFETY_GUARD__=true')
    sam.locator('.repo-primary-action').click()
    page.locator('.library-toast[role=alert]').wait_for()
    assert 'Програма запущена' in page.locator('.library-toast[role=alert]').inner_text()
    page.evaluate('window.__SAFETY_STALE__=true')
    fandom.locator('.repo-discovered button').click()
    page.wait_for_function("document.querySelector('.library-toast[role=alert]')?.textContent.includes('більше не вдалося')")
    assert fandom.locator('.repo-discovered button').is_enabled()
    # Local polling pauses in hidden documents; it does not check GitHub releases.
    page.evaluate("""() => {Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__SAFETY_HIDDEN__});window.__SAFETY_HIDDEN__=true;document.dispatchEvent(new Event('visibilitychange'))}""")
    count=page.evaluate('window.__SAFETY_RUNTIME_CALLS__')
    page.wait_for_timeout(3300)
    assert page.evaluate('window.__SAFETY_RUNTIME_CALLS__')==count
    page.evaluate("window.__SAFETY_HIDDEN__=false;document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_function('(count)=>window.__SAFETY_RUNTIME_CALLS__>count',arg=count)
    page.close(); browser.close()
print(f'[library-safety] {cases} appearance cases + native-guard/stale-detection/unknown-state/polling flows: PASS (mocked bridge)')
