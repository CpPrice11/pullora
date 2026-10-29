"""Custom artwork survives catalog cards/table and uses the actual crop shape."""
import json
import runpy
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright

catalog = runpy.run_path('scripts/ui/check-library-catalog.py')
baseline = catalog['baseline']
output = Path('.artifacts/ui/screens')
preview = 'data:image/svg+xml,' + quote('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><path fill="white" d="M0 0h600v400H0z"/><path fill="black" d="M600 0h600v400H600z"/><path fill="#0780ff" d="M0 400h600v400H0z"/><path fill="#ff8822" d="M600 400h600v400H600z"/></svg>')


def prepare(page, language, broken=False):
    catalog['prepare'](page, language)
    page.add_init_script('window.__ART_PREVIEW__ = ' + json.dumps(preview))
    page.add_init_script('window.__ART_START_BROKEN__ = ' + json.dumps(broken))
    page.route('**/__art/missing.png',lambda route:route.fulfill(status=200,content_type='image/png',body=b'not-an-image'))
    page.add_init_script("""(() => {
      const art = {owner:'CpPrice11',repo:'steam-achievement-manager',coverPath:'/__art/cover.png',
        coverDataUrl:window.__ART_PREVIEW__,backgroundPath:'/__art/background.png',backgroundDataUrl:window.__ART_START_BROKEN__?'/__art/missing.png':window.__ART_PREVIEW__,
        coverCrop:{focusX:0.1,focusY:0.4,zoom:1.1},backgroundCrop:{focusX:0.25,focusY:0.7,zoom:1.4},updatedAt:''};
      const invoke=window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke=async(command,args)=>{
        if(command==='plugin:dialog|open') return '/__art/replacement.png';
        if(command==='set_project_art_asset_command') {art.backgroundPath=args.sourcePath;art.backgroundDataUrl=window.__ART_PREVIEW__;art.backgroundCrop=args.crop;return structuredClone(art);}
        if(command==='list_project_art_assets') return [structuredClone(art)];
        if(command==='get_project_art_preview') return window.__ART_PREVIEW__;
        if(command==='set_project_art_crop_command') {art[args.kind+'Crop']=args.crop;return structuredClone(art);}
        if(command==='clear_project_art_asset_command') {art.backgroundPath=null;art.backgroundDataUrl=null;return structuredClone(art);}
        return invoke(command,args);
      };
    })()""")


def submenu(page, card, language):
    trigger=card.locator('.repo-more-action')
    trigger.scroll_into_view_if_needed()
    page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    trigger.click()
    page.locator('.repo-context-menu').get_by_role('menuitem', name='Фон' if language=='uk' else 'Background', exact=True).hover()
    return page.locator('.repo-actions-submenu-panel:visible')


def check(page, language, theme, width):
    card=page.locator('[data-repo-key="cpprice11/steam-achievement-manager"]').first
    original_cover=card.locator('.owner-avatar img').get_attribute('src')
    zoom=1.4
    for mode in ('cards','table'):
        page.locator('.library-view-toggle button').nth(1 if mode=='table' else 0).click()
        card.scroll_into_view_if_needed()
        image=card.locator('.repo-card-background img')
        image.wait_for()
        page.wait_for_function("document.querySelector('.repo-card-background img')?.naturalWidth>0")
        assert float(image.evaluate("el=>getComputedStyle(el).getPropertyValue('--art-zoom').trim()"))==zoom
        assert card.locator('.repo-card-background').get_attribute('aria-hidden')=='true'
        bg=card.locator('.repo-card-background').bounding_box();box=card.bounding_box()
        assert abs(bg['width']-box['width'])<=2 and abs(bg['height']-box['height'])<=2, (bg,box)
        ratios=card.evaluate("""card=>{
          const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
          const context=canvas.getContext('2d');
          const rgba=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];};
          const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
          const scrim=rgba(getComputedStyle(card.querySelector('.repo-card-background'),'::after').backgroundColor);
          return [...card.querySelectorAll('.repo-name button,.repo-description,.repo-owner,.repo-card-links a,.repo-meta,.repo-table-version,.repo-table-date')].filter(el=>el.getClientRects().length&&getComputedStyle(el).display!=='none').map(el=>{
            const text=rgba(getComputedStyle(el).color);return Math.min(...[0,255].map(extreme=>{
              const bg=scrim.slice(0,3).map(v=>v*scrim[3]/255+extreme*(1-scrim[3]/255));
              const fg=text.slice(0,3).map((v,i)=>v*text[3]/255+bg[i]*(1-text[3]/255));
              const a=luminance(bg),b=luminance(fg);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
            }));
          });
        }""")
        assert ratios and min(ratios)>=4.5, ratios
        painted=card.screenshot()
        card.locator('.repo-card-background').evaluate("el=>el.style.visibility='hidden'")
        assert painted!=card.screenshot(), 'Custom image is hidden behind the surface'
        card.locator('.repo-card-background').evaluate("el=>el.style.visibility=''")
        assert card.locator('.owner-avatar img').get_attribute('src')==original_cover
        if mode=='table':
            assert card.locator(':scope > td').count()==6
            assert page.locator('tbody > :not(tr)').count()==0
        target_ratio=box['width']/box['height']
        submenu(page,card,language).get_by_role('menuitem',name='Редагувати' if language=='uk' else 'Edit',exact=True).click()
        dialog=page.locator('.art-crop-modal');dialog.wait_for()
        shape='card' if mode=='cards' else 'row'
        frame=dialog.locator('.art-crop-preview--'+shape);frame.wait_for()
        bounds=frame.bounding_box()
        assert abs(bounds['width']/bounds['height']-target_ratio)<0.03, (bounds,target_ratio)
        assert dialog.locator('.art-crop-target').inner_text()==({'card':'Картка застосунку','row':'Рядок таблиці'}[shape] if language=='uk' else {'card':'App card','row':'Table row'}[shape])
        if width==1280:
            page.add_script_tag(path='.codex-tools/axe/package/axe.min.js')
            violations=page.evaluate("async()=> (await axe.run(document.querySelector('.art-crop-modal'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations")
            assert not violations,violations
        frame.focus();frame.press('ArrowRight');frame.press('PageUp')
        dialog.get_by_role('button',name='Зберегти' if language=='uk' else 'Save',exact=True).click()
        dialog.wait_for(state='hidden')
        zoom=round(zoom+0.1,1)
        assert abs(float(image.evaluate("el=>getComputedStyle(el).getPropertyValue('--art-zoom').trim()"))-zoom)<0.001
        assert card.locator('.owner-avatar img').get_attribute('src')==original_cover
        submenu(page,card,language).get_by_role('menuitem',name='Редагувати' if language=='uk' else 'Edit',exact=True).click()
        dialog.wait_for()
        frame=dialog.locator('.art-crop-preview--'+shape);frame.wait_for()
        if width>=1280:
            frame.focus()
            for _ in range(30): frame.press('PageUp')
            for handle in frame.locator('.art-crop-handle').all():
                assert handle.evaluate('el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el}'), 'Crop handles overlap or are clipped'
            page.screenshot(path=output/f'project-crop-{shape}-{theme}-{language}-{width}.png')
            frame.press('Home')
            handle=frame.locator('.art-crop-handle--bottom-right').bounding_box()
            x=handle['x']+handle['width']/2;y=handle['y']+handle['height']/2
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x-30,y-30/target_ratio,steps=4);page.mouse.up()
            assert float(frame.evaluate("el=>getComputedStyle(el).getPropertyValue('--art-zoom').trim()"))>1, 'Pointer resize did not change crop'
        page.keyboard.press('Escape');dialog.wait_for(state='hidden')
        assert card.locator('.repo-more-action').evaluate('el=>el===document.activeElement') or card.evaluate('el=>el===document.activeElement')
        page.screenshot(path=output/f'project-background-{mode}-{theme}-{language}-{width}.png')
        if mode=='cards':
            page.locator('.repo-name button').filter(has_text='steam-achievement-manager').click()
            page.locator('.library-hero-background img').wait_for()
            assert page.locator('.library-hero-background img').get_attribute('src')==preview
            page.locator('.library-catalog-details-toolbar button').click()
    submenu(page,card,language).get_by_role('menuitem',name='Скинути' if language=='uk' else 'Reset',exact=True).click()
    assert card.locator('.repo-card-background').count()==0
    assert card.locator('.owner-avatar img').get_attribute('src')==original_cover
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')


if __name__=='__main__':
    output.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=baseline['launch_browser'](p)
        count=0
        for theme in ('dark','light'):
            for language in ('uk','en'):
                for width,height in ((1000,700),(1280,720),(1920,1080)):
                    page=browser.new_page(viewport={'width':width,'height':height},color_scheme=theme,reduced_motion='reduce')
                    errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
                    prepare(page,language);baseline['open_library'](page)
                    check(page,language,theme,width)
                    assert not errors,errors
                    page.close();count+=1
        page=browser.new_page(viewport={'width':1280,'height':720},color_scheme='dark')
        prepare(page,'uk',broken=True);baseline['open_library'](page)
        card=page.locator('[data-repo-key="cpprice11/steam-achievement-manager"]').first
        card.scroll_into_view_if_needed()
        page.wait_for_function("document.querySelector('.repo-card-background img')?.hidden===true")
        submenu(page,card,'uk').get_by_role('menuitem',name='Замінити',exact=True).click()
        dialog=page.locator('.art-crop-modal');dialog.wait_for()
        dialog.get_by_role('button',name='Зберегти',exact=True).click();dialog.wait_for(state='hidden')
        image=card.locator('.repo-card-background img');image.wait_for(state='visible')
        assert image.get_attribute('src')==preview and image.evaluate('el=>el.naturalWidth>0')
        page.close()
        browser.close()
    print(f'[project-backgrounds] {count} theme/language/viewport cases: card/table paint, crop, save, reset, keyboard, cover independence')
