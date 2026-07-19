from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path
from time import time

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
CONTROLS = runpy.run_path(str(ROOT / "scripts" / "check-about-release-controls.py"))
BASELINE = CONTROLS["load_baseline"]()
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
CURRENT_VERSION = "v5.11.0"


def release(release_id: int, tag: str, *, portable: bool = True, checksum: bool = True) -> dict:
    return CONTROLS["release"](
        release_id,
        tag,
        portable=portable,
        checksum=checksum,
    )


def seed_safety_matrix(page: Page) -> None:
    BASELINE.seed_cache(page)
    now = int(time() * 1000)
    releases = [
        release(5120, "v5.12.0"),
        release(5103, CURRENT_VERSION),
        release(5101, "v5.10.1"),
        release(599, "v5.9.9", checksum=False),
        release(598, "v5.9.8", portable=False),
    ]
    payload = json.dumps({"now": now, "releases": releases}, ensure_ascii=False)
    page.add_init_script(
        script="""
        (() => {
          const { now, releases } = JSON.parse(__PAYLOAD__);
          const key = 'pullora.github.api-cache.v2';
          const cache = JSON.parse(localStorage.getItem(key) || '{}');
          cache['releases:cpprice11/pullora'] = {
            cachedAt: now,
            expiresAt: now + 6 * 60 * 60 * 1000,
            data: releases,
          };
          localStorage.setItem(key, JSON.stringify(cache));
        })()
        """.replace("__PAYLOAD__", json.dumps(payload)),
    )


def check_source_contract() -> None:
    about = (ROOT / "src" / "pages" / "AboutPage.tsx").read_text(encoding="utf-8")
    service = (ROOT / "src" / "services" / "updates.ts").read_text(encoding="utf-8")
    backend = (ROOT / "src-tauri" / "src" / "commands" / "updates.rs").read_text(encoding="utf-8")

    for fragment in (
        "const CHECKSUM_MANIFEST_NAME = 'SHA256SUMS.txt'",
        "name.includes('setup')",
        "name.includes('installer')",
        "name.endsWith('.msi')",
        "const canActivate = Boolean(portableAsset && checksumAsset) && !isCurrent",
        "pendingAction.asset.browser_download_url",
        "pendingAction.asset.name",
        "pendingAction.checksumAsset.browser_download_url",
    ):
        assert fragment in about, fragment
    assert "'install_launcher_release'" in service

    for fragment in (
        'const CHECKSUM_MANIFEST_NAME: &str = "SHA256SUMS.txt";',
        "validate_versioned_release_asset_url(\n            &asset_url",
        "validate_versioned_release_asset_url(\n            &checksum_url",
        "download_launcher_bytes(&checksum_url, Some(MAX_CHECKSUM_MANIFEST_BYTES))",
        "verify_sha256(&asset_bytes, &expected_checksum)?;",
        "prepare_portable_launcher_asset(&downloaded_asset, &downloaded_exe, &update_dir)?;",
        "let script_path = fail_closed(&update_dir, preparation)?;",
        "Copy-Item -LiteralPath $backup -Destination $target -Force",
        "$restoredHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256)",
        "for (_, path) in backups.into_iter().skip(1)",
    ):
        assert fragment in backend, fragment
    print("[launcher-update-safety] source contract: ok")


def open_about(page: Page) -> None:
    seed_safety_matrix(page)
    BASELINE.open_library(page)
    page.locator(".nav-item").nth(2).click()
    page.locator(".about-page").wait_for()
    page.locator(".about-release-link").first.wait_for()


def check_ui(page: Page) -> dict:
    rows = page.locator(".about-release-link")
    assert rows.count() == 5

    newer = page.locator(".about-release-link--newer")
    current = page.locator(".about-release-link--current")
    older = page.locator(".about-release-link--older")
    missing = page.locator(".about-release-link--missing")
    assert newer.count() == current.count() == older.count() == 1
    assert missing.count() == 2
    assert current.locator(".about-release-active-badge").count() == 1
    assert current.locator(".about-release-actions > button").count() == 0
    assert newer.locator(".about-release-actions > .secondary-btn").is_enabled()
    assert older.locator(".about-release-actions > .secondary-btn").is_enabled()
    assert all(
        missing.nth(index).locator(".about-release-actions > .secondary-btn").is_disabled()
        for index in range(missing.count())
    )
    assert missing.locator(".about-release-warning").count() == 2

    for row in (newer, older):
        button = row.locator(".about-release-actions > .secondary-btn")
        button.click()
        dialog = page.locator(".confirm-modal")
        dialog.wait_for()
        assert dialog.locator(".confirm-facts > div").count() == 4
        assert dialog.locator(".confirm-list > li").count() == 3
        assert dialog.locator(".confirm-primary-btn").is_enabled()
        page.keyboard.press("Escape")
        dialog.wait_for(state="hidden")
        assert button.evaluate("el => el === document.activeElement")

    return {
        "rows": rows.count(),
        "missing": missing.count(),
        "warnings": missing.locator(".about-release-warning").count(),
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in ("dark", "light"):
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme=theme,
                    locale="uk-UA",
                )
                page = context.new_page()
                open_about(page)
                results.append({"theme": theme, "viewport": [width, height], **check_ui(page)})
                context.close()
        browser.close()

    print(json.dumps({"checks": len(results), "viewports": VIEWPORTS}, ensure_ascii=False))


if __name__ == "__main__":
    main()
