from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "scripts" / "capture-visual-baseline.py"
OUTPUT_DIR = ROOT / "docs" / "visual-baseline" / "design-contract"
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")
DEFAULT_INSTALL_PATH = r"C:\Users\Tester\AppData\Local\Pullora\Apps"


def load_baseline():
    spec = importlib.util.spec_from_file_location("pullora_visual_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Не вдалося завантажити visual baseline helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rounded_box(locator) -> dict:
    box = locator.bounding_box()
    assert box is not None
    return {key: round(value, 2) for key, value in box.items()}


def assert_current_step(page: Page, modal, step: str, *, expect_focus: bool = True) -> None:
    heading = modal.locator(f'h3.release-wizard-heading[data-wizard-step="{step}"]')
    heading.wait_for(state="attached")
    assert heading.count() == 1
    assert heading.inner_text().strip()

    status = modal.locator(".release-wizard-status")
    assert status.count() == 1
    assert status.get_attribute("aria-live") == "polite"
    assert status.get_attribute("aria-atomic") == "true"
    assert heading.inner_text().strip() in status.inner_text().strip()

    if expect_focus:
        page.wait_for_function("el => el === document.activeElement", arg=heading.element_handle())


def assert_action_hierarchy(actions) -> None:
    enabled_buttons = actions.locator("button:enabled")
    primary = actions.locator("button.release-action-primary:enabled")
    assert primary.count() == 1
    for index in range(enabled_buttons.count()):
        button = enabled_buttons.nth(index)
        if "release-action-primary" in (button.get_attribute("class") or "").split():
            continue
        classes = (button.get_attribute("class") or "").split()
        assert "release-secondary-btn" in classes, classes

    primary_layout = primary.evaluate(
        """el => ({
            flexGrow: getComputedStyle(el).flexGrow,
            flexBasis: getComputedStyle(el).flexBasis,
            minHeight: getComputedStyle(el).minHeight,
            minWidth: getComputedStyle(el).minWidth,
        })"""
    )
    assert primary_layout == {
        "flexGrow": "0",
        "flexBasis": "auto",
        "minHeight": "42px",
        "minWidth": "0px",
    }, primary_layout

    secondary = actions.locator("button.release-secondary-btn:enabled").first
    if secondary.count() == 1:
        button_layouts = [
            button.evaluate(
                """el => ({
                    height: getComputedStyle(el).height,
                    paddingLeft: getComputedStyle(el).paddingLeft,
                    paddingRight: getComputedStyle(el).paddingRight,
                    flexGrow: getComputedStyle(el).flexGrow,
                    flexBasis: getComputedStyle(el).flexBasis,
                })"""
            )
            for button in (secondary, primary)
        ]
        assert button_layouts[0] == button_layouts[1], button_layouts


def assert_actions_fit_viewport(page: Page, modal) -> None:
    viewport = page.viewport_size
    assert viewport is not None
    modal_box = rounded_box(modal)
    controls = modal.locator(".release-nav-actions > button:visible, .release-nav-actions > a:visible")
    boxes = [rounded_box(controls.nth(index)) for index in range(controls.count())]

    for box in boxes:
        assert box["x"] >= modal_box["x"] - 0.5, box
        assert box["y"] >= modal_box["y"] - 0.5, box
        assert box["x"] + box["width"] <= modal_box["x"] + modal_box["width"] + 0.5, box
        assert box["y"] + box["height"] <= modal_box["y"] + modal_box["height"] + 0.5, box
        assert box["x"] >= 0 and box["y"] >= 0, box
        assert box["x"] + box["width"] <= viewport["width"] + 0.5, box
        assert box["y"] + box["height"] <= viewport["height"] + 0.5, box

    for left_index, left in enumerate(boxes):
        for right in boxes[left_index + 1:]:
            overlaps = not (
                left["x"] + left["width"] <= right["x"] + 0.5
                or right["x"] + right["width"] <= left["x"] + 0.5
                or left["y"] + left["height"] <= right["y"] + 0.5
                or right["y"] + right["height"] <= left["y"] + 0.5
            )
            assert not overlaps, {"left": left, "right": right}


def check_step_navigation(
    page: Page,
    modal,
    file_screenshot: Path,
    confirm_screenshot: Path,
) -> None:
    frame_box = rounded_box(modal)
    footer_box = rounded_box(modal.locator(".release-nav-actions"))
    assert_current_step(page, modal, "version", expect_focus=False)
    assert_action_hierarchy(modal.locator(".release-nav-actions"))
    assert_actions_fit_viewport(page, modal)
    release_card = modal.locator(".release-version-card").first
    assert release_card.locator(".release-version-main span").first.inner_text().strip()
    assert release_card.locator(".release-stability-pill").count() == 1
    assert release_card.locator(".release-status-pill").count() == 2
    badges = release_card.locator(".release-version-badges")
    badge_layout = badges.evaluate(
        """el => ({
            direction: getComputedStyle(el).flexDirection,
            wrap: getComputedStyle(el).flexWrap,
            tops: [...el.children].map((child) => Math.round(child.getBoundingClientRect().top)),
        })"""
    )
    assert badge_layout["direction"] == "row", badge_layout
    assert badge_layout["wrap"] == "nowrap", badge_layout
    assert len(set(badge_layout["tops"])) == 1, badge_layout
    summary = modal.locator(".release-selection-summary")
    assert summary.locator(".release-version-badges").count() == 0
    assert summary.locator(".release-summary-main strong").inner_text().strip()
    assert summary.locator("p").inner_text().strip()
    assert summary.locator(".release-summary-assets").inner_text().strip()

    modal.locator(".release-nav-actions .release-action-primary").click()
    assert_current_step(page, modal, "file")
    assert_action_hierarchy(modal.locator(".release-nav-actions"))
    assert_actions_fit_viewport(page, modal)
    assert modal.locator(".release-strategy-note").count() == 0
    asset_card = modal.locator(".release-asset-card").first
    assert asset_card.locator(":scope > .release-asset-main").count() == 1
    assert asset_card.locator(":scope > .release-asset-badges").count() == 1
    assert asset_card.locator(":scope > :not(.release-asset-main):not(.release-asset-badges)").count() == 0
    assert asset_card.locator(".release-asset-main > strong").inner_text().strip()
    assert asset_card.locator(".asset-kind").count() == 1
    assert asset_card.locator(".release-asset-size").inner_text().strip()
    assert asset_card.locator(".release-asset-architecture").inner_text().strip()
    assert asset_card.locator(".asset-compatibility").count() == 1
    assert asset_card.locator(".asset-recommended").count() == 1
    asset_badges = asset_card.locator(".release-asset-badges")
    asset_badge_layout = asset_badges.evaluate(
        """el => ({
            direction: getComputedStyle(el).flexDirection,
            wrap: getComputedStyle(el).flexWrap,
            tops: [...el.children].map((child) => Math.round(child.getBoundingClientRect().top)),
        })"""
    )
    assert asset_badge_layout["direction"] == "row", asset_badge_layout
    assert asset_badge_layout["wrap"] == "nowrap", asset_badge_layout
    assert len(set(asset_badge_layout["tops"])) == 1, asset_badge_layout
    summary_badges = modal.locator(".asset-summary > div")
    summary_badge_tops = summary_badges.evaluate(
        "el => [...el.children].map((child) => Math.round(child.getBoundingClientRect().top))"
    )
    assert len(set(summary_badge_tops)) == 1, summary_badge_tops
    assert rounded_box(modal) == frame_box
    assert rounded_box(modal.locator(".release-nav-actions")) == footer_box
    assert modal.locator(".release-installer-note").count() == 0
    installer_card = modal.locator(".release-asset-card--installer").first
    assert installer_card.count() == 1
    installer_card.click()
    installer_note = modal.locator(".release-installer-note")
    assert installer_note.count() == 1
    assert installer_note.locator("strong").inner_text().strip()
    assert installer_note.locator("p").inner_text().strip()
    asset_card.click()
    assert modal.locator(".release-installer-note").count() == 0
    page.screenshot(path=file_screenshot)

    modal.locator(".release-nav-actions .release-secondary-btn").click()
    assert_current_step(page, modal, "version")

    modal.locator(".release-nav-actions .release-action-primary").click()
    assert_current_step(page, modal, "file")
    modal.locator(".release-nav-actions .release-action-primary").click()
    assert_current_step(page, modal, "confirm")
    modal.locator(".release-nav-actions .release-action-primary:enabled").wait_for()
    assert_action_hierarchy(modal.locator(".release-nav-actions"))
    assert_actions_fit_viewport(page, modal)
    assert rounded_box(modal) == frame_box
    assert rounded_box(modal.locator(".release-nav-actions")) == footer_box
    facts = modal.locator(".release-confirm-grid > div")
    assert facts.count() == 6
    for index in range(facts.count()):
        fact = facts.nth(index)
        assert fact.locator(":scope > span").inner_text().strip()
        assert fact.locator(":scope > strong").inner_text().strip()
    assert modal.locator(".release-confirm-grid").get_by_text("v1.0.0", exact=True).count() >= 1
    install_path = modal.locator(".release-install-path")
    assert install_path.locator("#release-install-path-label").inner_text().strip()
    assert install_path.locator(":scope > strong").inner_text().strip() == DEFAULT_INSTALL_PATH
    assert install_path.locator(":scope > button").count() == 1
    assert modal.locator(".release-confirm-warning").count() == 0
    page.screenshot(path=confirm_screenshot)

    modal.locator(".release-nav-actions .release-secondary-btn").click()
    assert_current_step(page, modal, "file")
    modal.locator(".release-nav-actions .release-secondary-btn").click()
    assert_current_step(page, modal, "version")


def inspect_dialog(page: Page, width: int, height: int) -> dict:
    overlay = page.locator(".modal-overlay")
    modal = page.locator(".release-modal--wizard")
    header = modal.locator(".modal-header")
    body = modal.locator(".release-body")
    actions = modal.locator(".release-nav-actions")

    assert modal.get_attribute("role") == "dialog"
    assert modal.get_attribute("aria-modal") == "true"
    assert modal.get_attribute("aria-labelledby") == "release-selector-title"
    assert modal.locator("#release-selector-title").count() == 1
    assert header.locator(".release-github-link").count() == 1
    assert header.locator(".release-github-link").inner_text().strip() == "GitHub"
    assert modal.locator(".release-nav-actions .release-github-link").count() == 0

    overlay_box = rounded_box(overlay)
    modal_box = rounded_box(modal)
    header_box = rounded_box(header)
    body_box = rounded_box(body)
    actions_box = rounded_box(actions)

    assert overlay_box == {"x": 0, "y": 0, "width": width, "height": height}
    assert modal_box["x"] >= 0 and modal_box["y"] >= 0
    assert modal_box["x"] + modal_box["width"] <= width + 0.5
    assert modal_box["y"] + modal_box["height"] <= height + 0.5
    assert modal_box["width"] <= min(width * 0.94, 1040) + 1
    assert abs(modal_box["height"] - min(760, height * 0.9)) <= 1
    assert header_box["height"] <= 132

    assert header_box["y"] >= modal_box["y"]
    assert body_box["y"] >= header_box["y"] + header_box["height"] - 0.5
    assert actions_box["y"] >= body_box["y"] + body_box["height"] - 0.5
    assert actions_box["x"] >= body_box["x"] - 0.5
    assert actions_box["x"] + actions_box["width"] <= body_box["x"] + body_box["width"] + 0.5

    overflow = modal.evaluate(
        """el => {
            const body = el.querySelector('.release-body')
            const modalStyle = getComputedStyle(el)
            const bodyStyle = getComputedStyle(body)
            return {
                modalHorizontal: el.scrollWidth - el.clientWidth,
                modalOverflowY: modalStyle.overflowY,
                bodyHorizontal: body.scrollWidth - body.clientWidth,
                bodyOverflowY: bodyStyle.overflowY,
                bodyMaxHeight: bodyStyle.maxHeight,
                bodyOverscroll: bodyStyle.overscrollBehavior,
                actionsPosition: getComputedStyle(el.querySelector('.release-nav-actions')).position,
                actionsBottom: getComputedStyle(el.querySelector('.release-nav-actions')).bottom,
            }
        }"""
    )
    assert overflow["modalHorizontal"] <= 1, overflow
    assert overflow["modalOverflowY"] == "hidden", overflow
    assert overflow["bodyHorizontal"] <= 1, overflow
    assert overflow["bodyOverflowY"] == "auto", overflow
    assert overflow["bodyOverscroll"] == "contain", overflow
    assert overflow["actionsPosition"] == "static", overflow
    assert overflow["actionsBottom"] == "auto", overflow

    assert modal.locator(".release-wizard-steps, .release-step-pill, .release-wizard-context").count() == 0

    assert actions.get_by_role("button").count() == 1
    assert actions.get_by_role("button").first.is_enabled()

    focusable = modal.locator(
        'a[href], button:not([disabled]), textarea:not([disabled]), '
        'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    first_focusable = focusable.first
    last_focusable = focusable.last
    first_focusable.focus()
    page.keyboard.press("Shift+Tab")
    assert last_focusable.evaluate("el => el === document.activeElement")
    page.keyboard.press("Tab")
    assert first_focusable.evaluate("el => el === document.activeElement")

    body.evaluate(
        """el => {
            const panel = el.querySelector('.release-wizard-panel')
            const spacer = document.createElement('div')
            spacer.dataset.scrollContract = 'true'
            spacer.style.height = '900px'
            panel.prepend(spacer)
            el.scrollTop = 0
        }"""
    )
    page.wait_for_timeout(50)
    fixed_before = {
        "header": rounded_box(header),
        "actions": rounded_box(actions),
    }
    body.evaluate("el => { el.scrollTop = el.scrollHeight }")
    page.wait_for_timeout(50)
    fixed_after = {
        "header": rounded_box(header),
        "actions": rounded_box(actions),
    }
    assert fixed_before == fixed_after, {"before": fixed_before, "after": fixed_after}
    scrolled_actions = rounded_box(actions)
    scrolled_body = rounded_box(body)
    assert scrolled_actions["y"] >= scrolled_body["y"] + scrolled_body["height"] - 1
    body.evaluate(
        """el => {
            el.querySelector('[data-scroll-contract="true"]')?.remove()
            el.scrollTop = 0
        }"""
    )

    return {
        "modal": modal_box,
        "header": header_box,
        "body": body_box,
        "actions": actions_box,
        "overflow": overflow,
    }


def install_pending_download_mock(page: Page) -> None:
    page.add_init_script(
        script="""
        (() => {
          const callbacks = new Map()
          const listeners = new Map()
          let callbackId = 1
          let finishStartDownload

          const runCallback = (id, value) => callbacks.get(id)?.(value)
          window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
          window.__TAURI_INTERNALS__ = {
            transformCallback(callback, once = false) {
              const id = callbackId++
              callbacks.set(id, (value) => {
                if (once) callbacks.delete(id)
                callback?.(value)
              })
              return id
            },
            unregisterCallback(id) { callbacks.delete(id) },
            runCallback,
            convertFileSrc(path) { return path },
            async invoke(command, args = {}) {
              if (command === 'plugin:event|listen') {
                const eventListeners = listeners.get(args.event) ?? []
                eventListeners.push(args.handler)
                listeners.set(args.event, eventListeners)
                return args.handler
              }
              if (command === 'plugin:event|unlisten') return null
              if (command === 'list_owner_repositories') {
                const owner = String(args.owner ?? '').trim().toLowerCase()
                const cache = window.__PULLORA_TEST_GITHUB_CACHE__ ?? {}
                const key = `owner:${owner}:${args.page ?? 1}:${Boolean(args.releasesOnly)}`
                return structuredClone(cache[key]?.data ?? { items: [], page: 1, has_more: false })
              }
              if (command === 'get_releases') {
                const owner = String(args.owner ?? '').trim().toLowerCase()
                const repo = String(args.repo ?? '').trim().toLowerCase()
                const cache = window.__PULLORA_TEST_GITHUB_CACHE__ ?? {}
                const override = window.__PULLORA_TEST_RELEASES__?.[`${owner}/${repo}`]
                return structuredClone(override ?? cache[`releases:${owner}/${repo}`]?.data ?? [])
              }
              if (command === 'get_settings') {
                return {
                  version: 2,
                  installationPath: 'C:\\\\Users\\\\Tester\\\\AppData\\\\Local\\\\Pullora\\\\Apps',
                  includePrereleases: false,
                  assetStrategy: 'portableFirst',
                  githubOwner: 'CpPrice11',
                  githubToken: null,
                  theme: 'auto',
                  language: 'uk',
                }
              }
              if (command === 'is_first_launch') return false
              if (command === 'validate_installation_path') return { ok: true, status: 'ok' }
              if (command === 'set_installation_path') return args.path
              if (command === 'get_project_art_asset') return null
              if (['get_downloads', 'get_installed_apps', 'get_favorites', 'get_library_folders', 'list_project_art_assets'].includes(command)) return []
              if (command === 'start_download') {
                return new Promise((resolve) => { finishStartDownload = resolve })
              }
              return null
            },
          }

          window.__PULLORA_DOWNLOAD_TEST__ = {
            complete() {
              finishStartDownload?.('contract-download')
              window.setTimeout(() => {
                for (const handler of listeners.get('download-progress') ?? []) {
                  runCallback(handler, {
                    event: 'download-progress',
                    id: 1,
                    payload: {
                      id: 'contract-download',
                      fileName: 'Pullora_v1.0.0_portable_x64.exe',
                      progress: 100,
                      totalSize: 88080384,
                      downloadedSize: 88080384,
                      status: 'completed',
                      stage: 'completed',
                      owner: 'CpPrice11',
                      repo: 'fandom-translator',
                      tag: 'v1.0.0',
                      installPath: 'C:\\\\Users\\\\Tester\\\\AppData\\\\Local\\\\Pullora\\\\Apps',
                    },
                  })
                }
              }, 50)
            },
          }
        })()
        """
    )


def check_active_download_close_guard(page: Page, baseline) -> None:
    install_pending_download_mock(page)
    baseline.seed_cache(page)
    baseline.open_library(page)

    trigger = page.locator(".library-ops-action-row .hero-primary-btn")
    trigger.click()
    modal = page.locator(".release-modal--wizard")
    modal.wait_for()
    for _ in range(3):
        modal.locator(".release-nav-actions .release-action-primary").click()

    modal.locator('.release-wizard-heading[data-wizard-step="progress"]').wait_for(state="attached")
    assert modal.get_attribute("aria-busy") == "true"
    assert modal.locator(".close-btn").is_disabled()

    page.locator(".modal-overlay").evaluate("el => el.click()")
    assert modal.is_visible()
    page.keyboard.press("Escape")
    assert modal.is_visible()

    page.evaluate("window.__PULLORA_DOWNLOAD_TEST__.complete()")
    modal.locator('.release-wizard-heading[data-wizard-step="result"]').wait_for(state="attached")
    assert modal.get_attribute("aria-busy") == "false"
    page.locator(".modal-overlay").evaluate("el => el.click()")
    modal.wait_for(state="hidden")
    assert trigger.evaluate("el => el === document.activeElement")


def check_install_path_prevalidation(page: Page, baseline) -> None:
    baseline.seed_cache(page)
    baseline.open_library(page)
    page.evaluate("window.__PULLORA_TEST_INSTALL_PATH_VALIDATION_PENDING__ = true")

    page.locator(".library-ops-action-row .hero-primary-btn").click()
    modal = page.locator(".release-modal--wizard")
    modal.wait_for()
    modal.locator(".release-nav-actions .release-action-primary").click()
    modal.locator(".release-nav-actions .release-action-primary").click()

    install_path = modal.locator(".release-install-path")
    modal.locator('.release-install-path[aria-busy="true"]').wait_for()
    install_button = modal.locator(".release-nav-actions .release-action-primary")
    assert install_button.is_disabled()
    assert install_button.get_attribute("aria-busy") == "true"

    page.evaluate(
        "window.__PULLORA_TEST_RESOLVE_INSTALL_PATH_VALIDATION__({ ok: false, status: 'noWritePermission' })"
    )
    modal.locator('.release-install-path[aria-busy="false"]').wait_for()
    assert install_button.is_disabled()
    assert install_path.get_attribute("aria-invalid") == "true"
    assert install_path.get_attribute("aria-describedby") == "release-install-error"
    assert install_button.get_attribute("aria-describedby") == "release-install-error"
    assert modal.locator("#release-install-error[role='alert']").inner_text().strip()
    toast = page.locator("body > .library-toast--error[role='alert']")
    toast.wait_for()
    assert toast.inner_text().strip()
    assert toast.evaluate("el => Number(getComputedStyle(el).zIndex)") > modal.evaluate(
        "el => Number(getComputedStyle(el.parentElement).zIndex || getComputedStyle(el).zIndex)"
    )


def check_context(page: Page, theme: str, width: int, height: int, baseline) -> dict:
    baseline.seed_cache(page)
    baseline.open_library(page)
    trigger = page.locator(".library-ops-action-row .hero-primary-btn")
    trigger.click()
    page.locator(".release-modal--wizard").wait_for()
    geometry = inspect_dialog(page, width, height)
    check_step_navigation(
        page,
        page.locator(".release-modal--wizard"),
        OUTPUT_DIR / f"install-file-contract-{theme}-{width}x{height}.png",
        OUTPUT_DIR / f"install-confirm-contract-{theme}-{width}x{height}.png",
    )
    page.screenshot(path=OUTPUT_DIR / f"install-contract-{theme}-{width}x{height}.png")
    page.keyboard.press("Escape")
    page.locator(".release-modal").wait_for(state="hidden")
    assert trigger.evaluate("el => el === document.activeElement")

    trigger.click()
    page.locator(".release-modal--wizard").wait_for()
    page.locator(".modal-overlay").evaluate("el => el.click()")
    page.locator(".release-modal").wait_for(state="hidden")
    assert trigger.evaluate("el => el === document.activeElement")
    return {"theme": theme, "viewport": [width, height], **geometry}


def main() -> None:
    baseline = load_baseline()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in THEMES:
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme=theme,
                    locale="uk-UA",
                )
                page = context.new_page()
                results.append(check_context(page, theme, width, height, baseline))
                context.close()

        guard_context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            color_scheme="dark",
            locale="uk-UA",
        )
        check_active_download_close_guard(guard_context.new_page(), baseline)
        guard_context.close()

        validation_context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            color_scheme="dark",
            locale="uk-UA",
        )
        check_install_path_prevalidation(validation_context.new_page(), baseline)
        validation_context.close()
        browser.close()

    for width, height in VIEWPORTS:
        dark = next(item for item in results if item["theme"] == "dark" and item["viewport"] == [width, height])
        light = next(item for item in results if item["theme"] == "light" and item["viewport"] == [width, height])
        for key in ("modal", "header", "body", "actions"):
            assert dark[key] == light[key], {"viewport": [width, height], "key": key}
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
