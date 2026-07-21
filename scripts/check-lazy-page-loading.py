from __future__ import annotations

import gzip
import json
import re
import runpy
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE = runpy.run_path(str(ROOT / "scripts" / "capture-visual-baseline.py"))


def check_source_contract() -> None:
    app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
    layout = (ROOT / "src" / "components" / "Layout" / "Layout.tsx").read_text(encoding="utf-8")
    library = (ROOT / "src" / "features" / "library" / "LibraryPage.tsx").read_text(encoding="utf-8")
    i18n = (ROOT / "src" / "i18n.tsx").read_text(encoding="utf-8")

    assert "const SettingsPage = lazy(() => import('./pages/SettingsPage'))" in app
    assert "const AboutPage = lazy(() => import('./pages/AboutPage'))" in app
    assert "<Suspense fallback={<LazyPageFallback />}>" in app
    assert "const mainContentRef = useRef<HTMLElement>(null)" in app
    assert "const scrollPositions = useRef<Record<NavigationTab, number>>" in app
    assert "contentKey" not in app
    assert "contentKey" not in layout
    assert "key={" not in layout
    assert "ref={mainRef}" in layout
    assert "const ReleaseSelector = lazy(() => import('../../components/Install/ReleaseSelector'))" in library
    assert "const FolderManager = lazy(() => import('./components/FolderManager'))" in library
    assert "const UninstallConfirmModal = lazy(() => import('./components/UninstallConfirmModal'))" in library
    assert "const LibraryBulkActions = lazy(" in library
    assert "import ReleaseSelector from" not in library
    assert "import FolderManager from" not in library
    assert "import UninstallConfirmModal from" not in library
    assert "import ukDictionary from './i18n/dictionaries/uk'" in i18n
    assert "import('./i18n/dictionaries/en')" in i18n

    assets = ROOT / "dist" / "assets"
    if assets.exists():
        names = {asset.name for asset in assets.glob("*.js")}
        assert any(name.startswith("SettingsPage-") for name in names), names
        assert any(name.startswith("AboutPage-") for name in names), names
        assert any(name.startswith("ReleaseSelector-") for name in names), names
        assert any(name.startswith("FolderManager-") for name in names), names
        assert any(name.startswith("UninstallConfirmModal-") for name in names), names
        assert any(name.startswith("LibraryBulkActions-") for name in names), names
        assert any(name.startswith("en-") for name in names), names

        index_html = (ROOT / "dist" / "index.html").read_text(encoding="utf-8")
        main_match = re.search(r'<script[^>]+src="/assets/(index-[^"]+\.js)"', index_html)
        assert main_match, index_html
        main_asset = assets / main_match.group(1)
        main_gzip_size = len(gzip.compress(main_asset.read_bytes(), compresslevel=9, mtime=0))
        assert main_gzip_size <= 90_000, main_gzip_size

    print("[lazy-pages] source contract and initial bundle budget: ok")


def set_library_scroll(page: Page) -> int:
    return page.locator(".library-sam-details-pane").evaluate(
        """
        element => {
          element.scrollTop = Math.min(220, Math.max(0, element.scrollHeight - element.clientHeight));
          return element.scrollTop;
        }
        """
    )


def assert_scroll(page: Page, expected: int) -> None:
    actual = page.locator(".library-sam-details-pane").evaluate("element => element.scrollTop")
    assert abs(actual - expected) <= 1, {"expected": expected, "actual": actual}


def check_navigation_state(page: Page) -> dict:
    BASELINE["seed_cache"](page)
    BASELINE["open_library"](page)

    page.get_by_role("button", name="Компактний", exact=True).click()
    library = page.locator(".library-page.library-density-compact")
    library.wait_for()
    library.evaluate("element => { element.dataset.lazyProbe = 'preserved' }")
    library_scroll = set_library_scroll(page)
    assert library_scroll > 0, library_scroll

    page.get_by_role("button", name="Налаштування", exact=True).click()
    page.get_by_role("heading", name="Налаштування", exact=True).wait_for()
    page.wait_for_timeout(0)
    assert page.locator(".library-page").get_attribute("data-lazy-probe") == "preserved"

    page.get_by_role("button", name="Про застосунок", exact=True).click()
    page.locator(".about-page").wait_for()
    page.wait_for_timeout(0)

    page.get_by_role("button", name="Бібліотека", exact=True).click()
    library.wait_for()
    assert page.locator(".library-page").get_attribute("data-lazy-probe") == "preserved"
    assert_scroll(page, library_scroll)

    return {"libraryScroll": library_scroll, "probe": "preserved"}


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in ("dark", "light"):
            context = browser.new_context(
                viewport={"width": 1000, "height": 700},
                color_scheme=theme,
                locale="uk-UA",
            )
            page = context.new_page()
            results.append({"theme": theme, **check_navigation_state(page)})
            context.close()
        browser.close()

    print(json.dumps({"checks": len(results), "results": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
