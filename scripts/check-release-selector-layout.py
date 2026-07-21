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
    pill = modal.locator(f'[data-wizard-step="{step}"]')
    pill.wait_for()
    assert pill.get_attribute("aria-current") == "step"
    assert "active" in (pill.get_attribute("class") or "").split()
    if expect_focus:
        page.wait_for_function("el => el === document.activeElement", arg=pill.element_handle())


def assert_action_hierarchy(actions) -> None:
    enabled_buttons = actions.locator("button:enabled")
    primary = actions.locator("button.release-action-primary:enabled")
    assert primary.count() == 1
    for index in range(enabled_buttons.count()):
        button = enabled_buttons.nth(index)
        if "release-action-primary" in (button.get_attribute("class") or "").split():
            continue
        classes = (button.get_attribute("class") or "").split()
        assert "release-secondary-btn" in classes or "release-github-link" in classes, classes


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
    version = modal.locator('[data-wizard-step="version"]')
    file = modal.locator('[data-wizard-step="file"]')
    confirm = modal.locator('[data-wizard-step="confirm"]')
    progress = modal.locator('[data-wizard-step="progress"]')
    result = modal.locator('[data-wizard-step="result"]')

    assert_current_step(page, modal, "version", expect_focus=False)
    assert file.is_disabled() and confirm.is_disabled() and progress.is_disabled() and result.is_disabled()
    assert_action_hierarchy(modal.locator(".release-nav-actions"))
    assert_actions_fit_viewport(page, modal)
    release_card = modal.locator(".release-version-card").first
    assert release_card.locator(".release-version-main span").first.inner_text().strip()
    assert release_card.locator(".release-stability-pill").count() == 1
    assert release_card.locator(".release-status-pill").count() == 2

    modal.locator(".release-nav-actions .release-action-primary").click()
    assert_current_step(page, modal, "file")
    assert confirm.is_disabled() and progress.is_disabled() and result.is_disabled()
    assert_action_hierarchy(modal.locator(".release-nav-actions"))
    assert_actions_fit_viewport(page, modal)
    asset_card = modal.locator(".release-asset-card").first
    assert asset_card.locator(".asset-kind").count() == 1
    assert asset_card.locator(".release-asset-size").inner_text().strip()
    assert asset_card.locator(".release-asset-architecture").inner_text().strip()
    assert asset_card.locator(".asset-compatibility").count() == 1
    page.screenshot(path=file_screenshot)

    modal.locator(".release-nav-actions .release-secondary-btn").click()
    assert_current_step(page, modal, "version")

    modal.locator(".release-nav-actions .release-action-primary").click()
    assert_current_step(page, modal, "file")
    modal.locator(".release-nav-actions .release-action-primary").click()
    assert_current_step(page, modal, "confirm")
    assert progress.is_disabled() and result.is_disabled()
    assert_action_hierarchy(modal.locator(".release-nav-actions"))
    assert_actions_fit_viewport(page, modal)
    assert modal.locator(".release-confirm-grid > div").count() == 6
    assert modal.locator(".release-confirm-grid").get_by_text("v1.0.0", exact=True).count() >= 1
    assert modal.locator(".release-install-path strong").inner_text().strip()
    warning = modal.locator(".release-confirm-warning[role='note']")
    assert warning.count() == 1
    warning.scroll_into_view_if_needed()
    page.screenshot(path=confirm_screenshot)

    modal.locator(".release-nav-actions .release-secondary-btn").click()
    assert_current_step(page, modal, "file")
    version.click()
    assert_current_step(page, modal, "version")


def inspect_dialog(page: Page, width: int, height: int) -> dict:
    overlay = page.locator(".modal-overlay")
    modal = page.locator(".release-modal--wizard")
    header = modal.locator(".modal-header")
    steps = modal.locator(".release-wizard-steps")
    context = modal.locator(".release-wizard-context")
    body = modal.locator(".release-body")
    actions = modal.locator(".release-nav-actions")

    assert modal.get_attribute("role") == "dialog"
    assert modal.get_attribute("aria-modal") == "true"
    assert modal.get_attribute("aria-labelledby") == "release-selector-title"
    assert modal.locator("#release-selector-title").count() == 1

    overlay_box = rounded_box(overlay)
    modal_box = rounded_box(modal)
    header_box = rounded_box(header)
    steps_box = rounded_box(steps)
    context_box = rounded_box(context)
    body_box = rounded_box(body)
    actions_box = rounded_box(actions)

    assert overlay_box == {"x": 0, "y": 0, "width": width, "height": height}
    assert modal_box["x"] >= 0 and modal_box["y"] >= 0
    assert modal_box["x"] + modal_box["width"] <= width + 0.5
    assert modal_box["y"] + modal_box["height"] <= height + 0.5
    assert modal_box["width"] <= min(width * 0.94, 1040) + 1
    assert modal_box["height"] <= height * 0.9 + 1

    assert header_box["y"] >= modal_box["y"]
    assert steps_box["y"] >= header_box["y"] + header_box["height"] - 0.5
    assert context_box["y"] >= steps_box["y"] + steps_box["height"] - 0.5
    assert body_box["y"] >= context_box["y"] + context_box["height"] - 0.5
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
            }
        }"""
    )
    assert overflow["modalHorizontal"] <= 1, overflow
    assert overflow["modalOverflowY"] == "hidden", overflow
    assert overflow["bodyHorizontal"] <= 1, overflow
    assert overflow["bodyOverflowY"] == "auto", overflow
    assert overflow["bodyOverscroll"] == "contain", overflow

    pills = modal.locator(".release-step-pill")
    assert pills.count() == 5
    assert pills.first.get_attribute("aria-current") == "step"
    assert pills.first.is_enabled()
    for index in range(1, pills.count()):
        assert pills.nth(index).is_disabled()

    assert actions.get_by_role("button").count() == 1
    assert actions.get_by_role("button").first.is_enabled()

    close_button = modal.locator(".close-btn")
    next_button = actions.get_by_role("button").first
    close_button.focus()
    page.keyboard.press("Shift+Tab")
    assert next_button.evaluate("el => el === document.activeElement")
    page.keyboard.press("Tab")
    assert close_button.evaluate("el => el === document.activeElement")

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
        "steps": rounded_box(steps),
        "context": rounded_box(context),
    }
    body.evaluate("el => { el.scrollTop = el.scrollHeight }")
    page.wait_for_timeout(50)
    fixed_after = {
        "header": rounded_box(header),
        "steps": rounded_box(steps),
        "context": rounded_box(context),
    }
    assert fixed_before == fixed_after, {"before": fixed_before, "after": fixed_after}
    scrolled_actions = rounded_box(actions)
    scrolled_body = rounded_box(body)
    assert scrolled_actions["y"] + scrolled_actions["height"] <= scrolled_body["y"] + scrolled_body["height"] + 1
    body.evaluate(
        """el => {
            el.querySelector('[data-scroll-contract="true"]')?.remove()
            el.scrollTop = 0
        }"""
    )

    return {
        "modal": modal_box,
        "header": header_box,
        "steps": steps_box,
        "context": context_box,
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
                  installationPath: 'C:\\\\PulloraApps',
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
                      installPath: 'C:\\\\PulloraApps',
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

    modal.locator('[data-wizard-step="progress"][aria-current="step"]').wait_for()
    assert modal.get_attribute("aria-busy") == "true"
    assert modal.locator(".close-btn").is_disabled()

    page.locator(".modal-overlay").evaluate("el => el.click()")
    assert modal.is_visible()
    page.keyboard.press("Escape")
    assert modal.is_visible()

    page.evaluate("window.__PULLORA_DOWNLOAD_TEST__.complete()")
    modal.locator('[data-wizard-step="result"][aria-current="step"]').wait_for()
    assert modal.get_attribute("aria-busy") == "false"
    page.locator(".modal-overlay").evaluate("el => el.click()")
    modal.wait_for(state="hidden")
    assert trigger.evaluate("el => el === document.activeElement")


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
        browser.close()

    for width, height in VIEWPORTS:
        dark = next(item for item in results if item["theme"] == "dark" and item["viewport"] == [width, height])
        light = next(item for item in results if item["theme"] == "light" and item["viewport"] == [width, height])
        for key in ("modal", "header", "steps", "context", "body", "actions"):
            assert dark[key] == light[key], {"viewport": [width, height], "key": key}
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
