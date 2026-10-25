"""Exercise default media in the real UI with a mocked native cache."""
import json
import runpy
from pathlib import Path

from playwright.sync_api import sync_playwright

catalog = runpy.run_path('scripts/ui/check-library-catalog.py')
baseline = catalog['baseline']
contrast = catalog['contrast_checks']
output = Path('.artifacts/ui/screens')
icon = Path('src-tauri/icons/128x128.png').read_bytes()
screenshot = icon


def prepare(page, language, custom=False, unavailable=False):
    catalog['prepare'](page, language)
    page.route('**/__media/*.png', lambda route: route.fulfill(
        status=200, content_type='image/png', body=screenshot if 'screen-' in route.request.url else icon,
    ))
    page.add_init_script('window.__CUSTOM_MEDIA__ = ' + json.dumps(custom))
    page.add_init_script('window.__MEDIA_UNAVAILABLE__ = ' + json.dumps(unavailable))
    page.add_init_script("""(() => {
      const repos = window.__PULLORA_TEST_GITHUB_CACHE__['owner:cpprice11:1:false'].data.items;
      repos.push({...repos[1], id: 991, name: 'pullora-assets', full_name:'CpPrice11/pullora-assets'});
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'list_default_project_icons') {
          window.__CATALOG_CALLS__.push({command, args});
          if (window.__MEDIA_UNAVAILABLE__) throw 'Network unavailable';
          return [{key:'cpprice11/steam-achievement-manager',iconPath:'/__media/icon-default.png'}];
        }
        if (command === 'get_default_project_screenshots') {
          window.__CATALOG_CALLS__.push({command, args});
          if (window.__MEDIA_UNAVAILABLE__) throw 'Network unavailable';
          return !window.__MEDIA_UNAVAILABLE__ && args.key === 'cpprice11/steam-achievement-manager'
            ? ['/__media/screen-1.png', '/__media/screen-2.png'] : [];
        }
        if (command === 'list_project_art_assets') {
          return window.__CUSTOM_MEDIA__ ? [{owner:'CpPrice11',repo:'steam-achievement-manager',
            coverPath:'/__media/icon-custom.png',backgroundPath:'/__media/background-custom.png',
            coverCrop:{focusX:0.2,focusY:0.7,zoom:1.2},backgroundCrop:{focusX:0.5,focusY:0.5,zoom:1},updatedAt:''}] : [];
        }
        if (command === 'clear_project_art_asset_command') {
          window.__CUSTOM_MEDIA__ = false;
          return {owner:'CpPrice11',repo:'steam-achievement-manager',coverPath:null,
            backgroundPath:'/__media/background-custom.png',
            coverCrop:{focusX:0.5,focusY:0.5,zoom:1},backgroundCrop:{focusX:0.5,focusY:0.5,zoom:1},updatedAt:''};
        }
        return invoke(command, args);
      };
    })()""")


def check_gallery(page, language, theme):
    first = page.locator('.repo-card').filter(has=page.locator('.repo-name', has_text='steam-achievement-manager'))
    first.locator('.repo-name button').click()
    gallery = page.locator('.project-gallery')
    gallery.wait_for()
    assert gallery.locator('li').count() == 2
    assert gallery.locator('h3').inner_text() == ('Скриншоти' if language == 'uk' else 'Screenshots')
    assert page.locator('.project-gallery img').first.evaluate('el => el.complete && el.naturalWidth > 0')
    thumbnail = gallery.get_by_role('button').first
    thumbnail.click()
    dialog = page.locator('.project-gallery-dialog')
    dialog.wait_for()
    close = dialog.get_by_role('button')
    page.wait_for_function("document.activeElement?.closest('.project-gallery-dialog') !== null")
    page.keyboard.press('Tab')
    assert close.evaluate('el => el === document.activeElement')
    page.keyboard.press('Shift+Tab')
    assert close.evaluate('el => el === document.activeElement')
    bounds = dialog.bounding_box()
    viewport = page.viewport_size
    assert bounds['x'] >= 0 and bounds['y'] >= 0
    assert bounds['x'] + bounds['width'] <= viewport['width'] + 1
    assert bounds['y'] + bounds['height'] <= viewport['height'] + 1
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.screenshot(path=output / f'gallery-dialog-{theme}-{language}-{viewport["width"]}.png')
    page.keyboard.press('Escape')
    dialog.wait_for(state='detached')
    assert thumbnail.evaluate('el => el === document.activeElement')
    assert page.locator('.library-catalog-details').is_visible(), 'Escape closed underlying details'
    session = page.context.new_cdp_session(page)
    session.send('DOM.enable')
    session.send('CSS.enable')
    canvas = contrast['resolved_canvas'](page)
    contrast['assert_text_contrast'](session, gallery.locator('h3'), canvas, 'gallery title')
    contrast['assert_focus_contrast'](page, session, thumbnail, canvas, 'gallery thumbnail')
    session.detach()
    page.screenshot(path=output / f'gallery-{theme}-{language}-{viewport["width"]}.png')


if __name__ == '__main__':
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = baseline['launch_browser'](p)
        count = 0
        for theme in ('dark', 'light'):
            for language in ('uk', 'en'):
                for width, height in ((1000, 700), (1280, 720), (1920, 1080)):
                    page = browser.new_page(viewport={'width':width, 'height':height}, color_scheme=theme, reduced_motion='reduce')
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                    prepare(page, language)
                    baseline['open_library'](page)
                    screenshot = page.screenshot()
                    assert page.locator('.repo-card').count() == 7, 'assets repository leaked into app catalog'
                    assert not page.evaluate("window.__CATALOG_CALLS__.some(x => x.command === 'get_default_project_screenshots')"), 'screenshots fetched before opening details'
                    first = page.locator('.repo-card').filter(has=page.locator('.repo-name', has_text='steam-achievement-manager'))
                    assert first.locator('.owner-avatar img').get_attribute('src') == '/__media/icon-default.png'
                    assert first.locator('img').evaluate('el => getComputedStyle(el).objectFit') == 'contain'
                    check_gallery(page, language, theme)
                    # Unavailable gallery on a different app; old images must not leak.
                    page.locator('.library-catalog-details-toolbar button').click()
                    page.locator('.repo-card').filter(has=page.locator('.repo-name', has_text='fandom-translator')).locator('.repo-name button').click()
                    assert not page.locator('.project-gallery').count()
                    page.locator('.library-refresh-btn').click()
                    page.wait_for_function("window.__CATALOG_CALLS__.some(x => x.command === 'list_default_project_icons' && x.args.refresh)")
                    assert not errors, errors
                    page.close()
                    count += 1
        for custom, unavailable in ((True, False), (False, True)):
            page = browser.new_page(viewport={'width':1280, 'height':720})
            prepare(page, 'uk', custom=custom, unavailable=unavailable)
            baseline['open_library'](page)
            first = page.locator('.repo-card').filter(has=page.locator('.repo-name', has_text='steam-achievement-manager'))
            image = first.locator('.owner-avatar img')
            if custom:
                assert image.get_attribute('src') == '/__media/icon-custom.png'
            else:
                assert image.get_attribute('src').startswith('data:image/svg+xml,')
            if custom:
                assert 'project-art-cover' in image.get_attribute('class')
                assert image.evaluate("el => el.style.getPropertyValue('--art-zoom')") == '1.2'
                first.locator('.repo-name button').click()
                assert page.locator('.library-hero-background img').get_attribute('src') == '/__media/background-custom.png'
                page.locator('.library-catalog-details-toolbar button').click()
                first.locator('.repo-more-action').scroll_into_view_if_needed()
                first.locator('.repo-more-action').click()
                page.get_by_role('menuitem', name='Обкладинка', exact=True).click()
                page.get_by_role('menuitem', name='Скинути', exact=True).click()
                page.wait_for_function("Array.from(document.querySelectorAll('.repo-card')).find(el => el.textContent.includes('steam-achievement-manager')).querySelector('img').getAttribute('src') === '/__media/icon-default.png'")
                first.locator('.repo-name button').click()
                assert page.locator('.library-hero-background img').get_attribute('src') == '/__media/background-custom.png', 'resetting cover removed custom background'
            else:
                assert not image.get_attribute('class')
                first.locator('.repo-name button').click()
                assert not page.locator('.project-gallery').count()
            page.close()
        browser.close()
    print(f'[default-media] {count} gallery theme/language/viewport cases; lazy loading, priority, refresh, focus, empty media: ok')
