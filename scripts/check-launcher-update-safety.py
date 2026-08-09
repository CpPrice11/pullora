from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page


ROOT = Path(__file__).resolve().parent.parent
CONTROLS = runpy.run_path(str(ROOT / "scripts" / "check-about-release-controls.py"))
BASELINE = None if "--static" in sys.argv else CONTROLS["load_baseline"]()
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
CURRENT_VERSION = "v5.16.1"


def release(release_id: int, tag: str, *, portable: bool = True, checksum: bool = True) -> dict:
    return CONTROLS["release"](
        release_id,
        tag,
        portable=portable,
        checksum=checksum,
    )


def seed_safety_matrix(page: Page) -> None:
    BASELINE.seed_cache(page)
    releases = [
        release(5170, "v5.17.0"),
        release(5161, CURRENT_VERSION),
        release(5101, "v5.10.1"),
        release(599, "v5.9.9", checksum=False),
        release(598, "v5.9.8", portable=False),
    ]
    payload = json.dumps({"releases": releases}, ensure_ascii=False)
    page.add_init_script(
        script="""
        (() => {
          const { releases } = JSON.parse(__PAYLOAD__);
          window.__PULLORA_TEST_RELEASES__ = {
            ...(window.__PULLORA_TEST_RELEASES__ ?? {}),
            'cpprice11/pullora': releases,
          };
        })()
        """.replace("__PAYLOAD__", json.dumps(payload)),
    )


def check_source_contract() -> None:
    about = (ROOT / "src" / "pages" / "AboutPage.tsx").read_text(encoding="utf-8")
    service = (ROOT / "src" / "services" / "updates.ts").read_text(encoding="utf-8")
    backend = (ROOT / "src-tauri" / "src" / "commands" / "updates.rs").read_text(encoding="utf-8")
    downloads = (ROOT / "src-tauri" / "src" / "download" / "manager.rs").read_text(encoding="utf-8")
    tauri_config = (ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8")
    release_config = (ROOT / "src-tauri" / "tauri.release.conf.json").read_text(encoding="utf-8")

    for fragment in (
        "const CHECKSUM_MANIFEST_NAME = 'SHA256SUMS.txt'",
        "name.includes('setup')",
        "name.includes('installer')",
        "name.endsWith('.msi')",
        "onClick={() => void openReleaseInBrowser(release)}",
        "{t('about.openGitHubReleaseShort')}",
    ):
        assert fragment in about, fragment
    for fragment in (
        "getLauncherInstallationMode",
        "installLauncherUpdate",
        "about.updateInstalledDetail",
        "about.updatePortableDetail",
    ):
        assert fragment in about, fragment
    for fragment in ("get_launcher_installation_mode", "install_launcher_update"):
        assert fragment in service, fragment
        assert fragment in backend, fragment
    for fragment in (
        "tauri_plugin_updater::UpdaterExt",
        "apply_portable_update_if_requested",
        "PROCESS_SYNCHRONIZE",
        "SHA256SUMS.txt",
        "validate_versioned_release_asset_url",
    ):
        assert fragment in backend, fragment
    for fragment in (
        "https://github.com/CpPrice11/pullora/releases/latest/download/latest.json",
        '"installMode": "passive"',
        '"pubkey"',
    ):
        assert fragment in tauri_config, fragment
    assert '"createUpdaterArtifacts": true' in release_config
    for forbidden in ("powershell", "ExecutionPolicy", "Start-Process", ".ps1"):
        assert forbidden.lower() not in backend.lower(), forbidden
        assert forbidden.lower() not in downloads.lower(), forbidden
    assert "ShellExecuteExW" in downloads
    assert "SEE_MASK_NOCLOSEPROCESS" in downloads
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
        missing.nth(index).locator(".about-release-actions > .secondary-btn").is_enabled()
        for index in range(missing.count())
    )
    assert missing.locator(".about-release-warning").count() == 2

    for row in (newer, older, missing.nth(0), missing.nth(1)):
        button = row.locator(".about-release-actions > .secondary-btn")
        button.click()
        assert page.locator(".confirm-modal").count() == 0

    return {
        "rows": rows.count(),
        "missing": missing.count(),
        "warnings": missing.locator(".about-release-warning").count(),
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    from playwright.sync_api import sync_playwright

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
