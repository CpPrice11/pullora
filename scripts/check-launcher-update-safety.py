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


def seed_safety_matrix(page: Page, installation_mode: str) -> None:
    BASELINE.seed_cache(page)
    releases = [
        release(5170, "v5.17.0"),
        release(5161, CURRENT_VERSION),
        release(5101, "v5.10.1"),
        release(599, "v5.9.9", checksum=False),
        release(598, "v5.9.8", portable=False),
    ]
    payload = json.dumps({"releases": releases, "installationMode": installation_mode}, ensure_ascii=False)
    page.add_init_script(
        script="""
        (() => {
          const { releases, installationMode } = JSON.parse(__PAYLOAD__);
          window.__PULLORA_TEST_INSTALLATION_MODE__ = installationMode;
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
        "onClick={() => void openReleaseInBrowser(release)}",
        "installationMode === 'portable'",
        "void openReleaseInBrowser(latestRelease)",
        "'about.downloadUpdate'",
        "{t('about.openGitHubReleaseShort')}",
    ):
        assert fragment in about, fragment
    for fragment in (
        "getLauncherInstallationMode",
        "installLauncherUpdate",
        "about.updateInstalledDetail",
        "onEscape: pendingUpdate && !updating ? () => setPendingUpdate(null) : undefined",
        "onClick={() => !updating && setPendingUpdate(null)}",
    ):
        assert fragment in about, fragment
    for fragment in ("get_launcher_installation_mode", "install_launcher_update"):
        assert fragment in service, fragment
        assert fragment in backend, fragment
    for fragment in (
        "tauri_plugin_updater::UpdaterExt",
        'command_error("errors.portableLauncherUpdateManual")',
        "install_registered_launcher_update",
        'command_error("errors.launcherUpdateVersionMismatch")',
        "download_and_install",
    ):
        assert fragment in backend, fragment
    update_command = backend[
        backend.index("pub async fn install_launcher_update"):backend.index("fn validate_version")
    ]
    assert update_command.index("is_portable()") < update_command.index("install_registered_launcher_update")
    assert update_command.index("launcherUpdateVersionMismatch") < update_command.index("download_and_install")
    assert "std::process::Command" not in update_command
    for forbidden in (
        "apply_portable_update_if_requested",
        "--apply-portable-update",
        "PROCESS_SYNCHRONIZE",
        "validate_portable_update_paths",
        "install_portable_launcher_update",
    ):
        assert forbidden not in backend, forbidden
    for fragment in (
        "https://github.com/CpPrice11/pullora/releases/latest/download/latest.json",
        '"installMode": "passive"',
        '"pubkey"',
    ):
        assert fragment in tauri_config, fragment
    assert '"pubkey": ""' not in tauri_config
    assert '"createUpdaterArtifacts": true' in release_config
    for forbidden in ("powershell", "ExecutionPolicy", "Start-Process", ".ps1"):
        assert forbidden.lower() not in backend.lower(), forbidden
        assert forbidden.lower() not in downloads.lower(), forbidden
    assert "ShellExecuteExW" in downloads
    assert "SEE_MASK_NOCLOSEPROCESS" in downloads
    print("[launcher-update-safety] source contract: ok")


def open_about(page: Page, installation_mode: str) -> None:
    seed_safety_matrix(page, installation_mode)
    BASELINE.open_library(page)
    page.locator(".nav-item").nth(2).click()
    page.locator(".about-page").wait_for()
    page.locator(".about-release-link").first.wait_for()


def check_ui(page: Page, installation_mode: str) -> dict:
    rows = page.locator(".about-release-link")
    assert rows.count() == 5

    newer = page.locator(".about-release-link--newer")
    current = page.locator(".about-release-link--current")
    older = page.locator(".about-release-link--older")
    assert newer.count() == current.count() == 1
    assert older.count() == 3
    assert current.locator(".about-release-active-badge").count() == 1
    assert current.locator(".about-release-actions > button").count() == 0
    assert newer.locator(".about-release-actions > .secondary-btn").is_enabled()
    assert all(
        older.nth(index).locator(".about-release-actions > .secondary-btn").is_enabled()
        for index in range(older.count())
    )
    assert page.locator(".about-release-warning").count() == 0

    for row in (newer, older.nth(0), older.nth(1), older.nth(2)):
        button = row.locator(".about-release-actions > .secondary-btn")
        button.click()
        assert page.locator(".confirm-modal").count() == 0

    update_action = page.locator(".about-hero-actions .release-action-primary")
    assert update_action.is_visible()
    if installation_mode == "portable":
        assert update_action.inner_text().strip() == "Завантажити Pullora"
        update_action.click()
        assert page.locator(".confirm-modal").count() == 0
    else:
        assert update_action.inner_text().strip() == "Оновити Pullora"
        update_action.click()
        confirm = page.locator(".confirm-modal")
        confirm.wait_for()
        facts = confirm.locator(".confirm-facts > div")
        assert facts.count() == 3
        assert CURRENT_VERSION in facts.nth(0).inner_text()
        assert "v5.17.0" in facts.nth(1).inner_text()
        assert "Встановлена" in facts.nth(2).inner_text()
        assert "перезапуститься" in confirm.inner_text()
        close_action = confirm.locator(".confirm-close-btn")
        cancel_action = confirm.locator(".modal-actions .secondary-btn")
        primary_action = confirm.locator(".confirm-primary-btn")
        page.wait_for_function(
            "selector => document.activeElement === document.querySelector(selector)",
            arg=".confirm-modal .modal-actions .secondary-btn",
        )
        close_action.focus()
        page.keyboard.press("Shift+Tab")
        assert primary_action.evaluate("el => el === document.activeElement")
        page.keyboard.press("Tab")
        assert close_action.evaluate("el => el === document.activeElement")
        page.keyboard.press("Escape")
        confirm.wait_for(state="hidden")
        assert update_action.evaluate("el => el === document.activeElement")

        update_action.click()
        confirm.wait_for()
        primary_action = confirm.locator(".confirm-primary-btn")
        primary_action.click()
        assert primary_action.get_attribute("aria-busy") == "true"
        assert close_action.is_disabled() and cancel_action.is_disabled() and primary_action.is_disabled()
        confirm.locator("xpath=parent::*").click(position={"x": 5, "y": 5})
        assert confirm.is_visible()
        page.keyboard.press("Escape")
        assert confirm.is_visible()
        page.keyboard.press("Tab")
        assert confirm.evaluate("el => el === document.activeElement")

    return {
        "rows": rows.count(),
        "older": older.count(),
        "warnings": page.locator(".about-release-warning").count(),
        "installationMode": installation_mode,
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    from playwright.sync_api import sync_playwright

    results = []
    with sync_playwright() as playwright:
        browser = BASELINE.launch_browser(playwright)
        for installation_mode in ("portable", "installed"):
            for theme in ("dark", "light"):
                for width, height in VIEWPORTS:
                    context = browser.new_context(
                        viewport={"width": width, "height": height},
                        color_scheme=theme,
                        locale="uk-UA",
                    )
                    page = context.new_page()
                    open_about(page, installation_mode)
                    results.append({
                        "theme": theme,
                        "viewport": [width, height],
                        **check_ui(page, installation_mode),
                    })
                    context.close()
        browser.close()

    print(json.dumps({"checks": len(results), "viewports": VIEWPORTS}, ensure_ascii=False))


if __name__ == "__main__":
    main()
