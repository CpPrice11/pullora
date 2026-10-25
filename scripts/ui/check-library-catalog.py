"""Exercise the card catalog with a mocked Tauri bridge, using the real UI."""
from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

baseline = runpy.run_path("scripts/ui/capture-visual-baseline.py")
contrast_checks = runpy.run_path("scripts/ui/check-rendered-contrast.py")
OUTPUT = Path(".artifacts/ui/screens")


def prepare(page, language="uk", *, reset_view=True):
    page.route("**/favicon.ico", lambda route: route.fulfill(status=204))
    baseline["seed_cache"](page)
    baseline["seed_installed_update"](page, reset_view=reset_view)
    page.add_init_script("window.__PULLORA_TEST_LANGUAGE__ = " + json.dumps(language))
    page.add_init_script("""(() => {
      const cache = window.__PULLORA_TEST_GITHUB_CACHE__;
      const repos = cache['owner:cpprice11:1:false'].data.items;
      repos[0].homepage = 'https://example.com/steam?from=github&lang=uk';
      for (let i = 3; i <= 7; i++) {
        repos.push({ ...repos[1], id: i, name: i === 3 ? 'a-very-long-application-name-that-needs-to-wrap-in-a-small-card' : `example-app-${i}`,
          full_name: `CpPrice11/example-app-${i}`,
          description: i === 4 ? null : 'Example description for the automated layout test. A longer second sentence must fit in two lines.',
          homepage: i === 5 ? 'javascript:alert(1)' : null });
      }
      window.__CATALOG_CALLS__ = [];
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        window.__CATALOG_CALLS__.push({ command, args });
        if (command === 'open_website_url' && window.__WEBSITE_ERROR__) throw 'PULLORA_ERROR:errors.commandFailed';
        return invoke(command, args);
      };
    })()""")


def geometry(page, expected_columns):
    page.locator(".repo-card").first.wait_for()
    assert page.locator(".repo-card").count() == 7
    assert not page.locator(".library-catalog-details").count()
    columns = page.locator(".library-folder-section-items").first.evaluate(
        "el => getComputedStyle(el).gridTemplateColumns.split(' ').length"
    )
    assert columns == expected_columns, columns
    for card in page.locator(".repo-card").all():
        assert card.bounding_box()["height"] >= 200
        assert card.locator(".repo-description").is_visible()
        assert card.locator(".repo-status").is_visible()
        assert card.locator(".repo-primary-action").is_visible()
        assert card.locator("a").count() == (2 if card.locator(".repo-name").inner_text() == "steam-achievement-manager" else 1)
        assert card.get_attribute("role") == "group"
        assert card.locator("input[type=checkbox]").count() == 1
        assert card.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
        assert card.locator('.repo-primary-action').evaluate("el => el.getBoundingClientRect().bottom <= el.closest('.repo-card').getBoundingClientRect().bottom")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "horizontal overflow"


def interactions(page):
    first = page.locator(".repo-card").filter(has=page.locator(".repo-name", has_text="steam-achievement-manager"))
    first.locator("a").first.click()
    assert page.evaluate("window.__CATALOG_CALLS__.some(x => x.command === 'open_website_url')")
    assert not page.locator(".library-catalog-details").count()
    first.locator("a").last.click()
    assert page.evaluate("window.__CATALOG_CALLS__.some(x => x.command === 'open_external_url')")

    title = first.locator(".repo-name button")
    title.click()
    details = page.locator(".library-catalog-details")
    details.wait_for()
    assert details.locator(".library-hero").is_visible()
    details.locator(".library-catalog-details-toolbar button").click()
    assert title.evaluate("el => el === document.activeElement")
    title.click()
    page.locator('#library-search').fill('steam')
    assert page.locator('#library-search').evaluate('el => el === document.activeElement')
    assert not page.locator('.library-catalog-details').count()
    page.locator('#library-search').fill('')

    more = first.locator(".repo-more-action")
    more.scroll_into_view_if_needed()
    page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    more.click()
    page.locator('.repo-context-menu [role="menu"]').wait_for()
    page.keyboard.press("Escape")
    assert more.evaluate("el => el === document.activeElement")

    first.locator("input[type=checkbox]").check()
    assert "bulk-selected" in first.get_attribute("class")
    first.focus()
    page.keyboard.press("Control+a")
    assert page.locator('.repo-card input:checked').count() == 7
    page.keyboard.press("Escape")
    assert page.locator('.repo-card input:checked').count() == 0

    page.locator('.library-refresh-btn').click()
    first.locator('.repo-update-version').wait_for()
    assert 'v0.2.3' in first.locator('.repo-update-version').inner_text()
    first.locator('.repo-primary-action').click()
    page.wait_for_function("window.__CATALOG_CALLS__.some(x => x.command === 'start_download')")
    page.locator('.library-sidebar-filter-nav button[aria-label="Оновлення"]').click()
    page.locator('.updates-center').wait_for()
    page.locator('.library-sidebar-filter-nav button').first.click()

    page.locator(".repo-card").filter(has=page.locator(".repo-name", has_text="fandom-translator")).locator(".repo-primary-action").click()
    page.wait_for_function("window.__CATALOG_CALLS__.some(x => x.command === 'start_download' && x.args.repo === 'fandom-translator')")
    assert not page.locator(".release-modal").count()
    assert not page.locator(".library-catalog-details").count()

    page.locator("#library-search").fill("no-matching-application")
    assert page.locator(".repo-card").count() == 0
    assert page.locator('.state-panel--empty, .state-panel.empty, .state-panel[data-kind="empty"]').count() or page.locator('.state-panel').is_visible()
    page.locator("#library-search").fill("")
    page.evaluate("window.__WEBSITE_ERROR__ = true")
    first.locator("a").first.click()
    page.locator('.library-toast[role="alert"]').wait_for()


def accessibility(page):
    session = page.context.new_cdp_session(page)
    session.send('DOM.enable')
    session.send('CSS.enable')
    canvas = contrast_checks['resolved_canvas'](page)
    for selector in ('.repo-name button', '.repo-description', '.repo-owner', '.repo-status', '.repo-meta', '.repo-card-links a', '.repo-primary-action'):
        contrast_checks['assert_text_contrast'](session, page.locator(selector).first, canvas, selector)
    contrast_checks['assert_focus_contrast'](page, session, page.locator('.repo-primary-action').first, canvas, 'card primary focus')
    session.detach()


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checks = 0
    with sync_playwright() as playwright:
        browser = baseline["launch_browser"](playwright)
        focused = '--focused' in sys.argv
        for theme in (("dark",) if focused else ("dark", "light")):
            for language in (("uk",) if focused else ("uk", "en")):
                for width, height, columns in (((1280, 720, 3),) if focused else ((1000, 700, 2), (1280, 720, 3), (1920, 1080, 4))):
                    page = browser.new_page(viewport={"width": width, "height": height}, color_scheme=theme)
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
                    prepare(page, language)
                    baseline["open_library"](page)
                    page.screenshot(path=OUTPUT / f"catalog-{theme}-{language}-{width}.png")
                    geometry(page, columns)
                    if width == 1280:
                        accessibility(page)
                        baseline['apply_custom_background'](page)
                        accessibility(page)
                        page.screenshot(path=OUTPUT / f'catalog-custom-{theme}-{language}.png')
                        baseline['clear_custom_background'](page)
                    assert not page.locator('.library-density-toggle').count()
                    assert page.locator('.library-view-toggle button').count() == 2
                    if width == 1280 and theme == "dark" and language == "uk":
                        interactions(page)
                    assert not errors, errors
                    page.close()
                    checks += 1
        browser.close()
    print(f"[library-catalog] {checks} theme/language/viewport scenarios + view controls and interactions: ok")
