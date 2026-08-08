from __future__ import annotations

import runpy
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASELINE = runpy.run_path("scripts/capture-visual-baseline.py")
BASE_URL = BASELINE["BASE_URL"]
SECTIONS = (
    ("Загальне", "settings-general"),
    ("Журнал подій", "settings-events"),
    ("Обслуговування", "settings-maintenance"),
)
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
EXPECTED_GROUP_COUNTS = {
    "settings-general": 5,
    "settings-events": 0,
    "settings-maintenance": 0,
}


def css_rule(source: str, selector: str) -> str:
    start = source.find(selector)
    assert start >= 0, f"Missing CSS selector: {selector}"
    block_start = source.find("{", start)
    block_end = source.find("}", block_start)
    assert block_start >= 0 and block_end >= 0, f"Incomplete CSS rule: {selector}"
    return source[start:block_end]


def check_settings_surface_source_contract() -> None:
    root = Path(__file__).resolve().parent.parent
    cinematic = (root / "src/styles/Cinematic.css").read_text(encoding="utf-8")
    pages = (root / "src/pages/PageStyles.css").read_text(encoding="utf-8")

    assert "settings-open .settings-workspace" not in cinematic
    assert "--density-scale:" not in cinematic
    assert "settings-content--installation" not in cinematic
    assert "settings-content--updates" not in cinematic
    assert ".interval-input-control" not in cinematic
    assert ".interval-input-control" not in pages
    for source, selector, expected in (
        (cinematic, ".cinematic-shell .settings-workspace", ("var(--surface-1)", "blur(var(--surface-blur))", "var(--surface-radius-shell)")),
        (cinematic, ".cinematic-shell .settings-page .settings-nav", ("var(--surface-2)", "var(--surface-border)")),
        (cinematic, ".cinematic-shell .settings-page .settings-content", ("var(--surface-2)",)),
        (cinematic, ".cinematic-shell .settings-page .settings-section", ("var(--surface-3)", "var(--surface-border)", "var(--surface-radius-panel)")),
        (pages, ".settings-page .settings-form", ("var(--surface-1)", "blur(var(--surface-blur))", "var(--surface-radius-shell)")),
        (pages, ".settings-page .settings-nav", ("var(--surface-2)", "var(--surface-border)")),
        (pages, ".settings-page .settings-content", ("var(--surface-2)",)),
        (pages, ".settings-page .settings-section", ("var(--surface-3)", "var(--surface-border)", "var(--surface-radius-panel)")),
    ):
        rule = css_rule(source, selector)
        for fragment in expected:
            assert fragment in rule, {"selector": selector, "missing": fragment, "rule": rule}

    print("[settings-surfaces] source contract: ok")


def install_settings_mock(page):
    page.add_init_script(
        script=r"""
        (() => {
          const callbacks = new Map();
          const commands = [];
          const calls = [];
          let callbackId = 1;
          let settingsUpdateCount = 0;
          let settings = {
            version: 2,
            installationPath: 'C:\\PulloraApps',
            includePrereleases: false,
            assetStrategy: 'portableFirst',
            githubOwner: 'CpPrice11',
            githubToken: null,
            theme: 'auto',
            language: 'uk',
            appearance: {
              preset: 'github',
              density: 'compact',
              surfaceTransparency: 42,
              surfaceBlur: 12,
            },
          };
          const launcherArt = new Map([
            ['global-light', {
              owner: '__pullora__',
              repo: 'global-light',
              backgroundPath: 'C:\\art\\light-bg.png',
              updatedAt: '2026-07-18T00:00:00Z',
            }],
            ['global-dark', {
              owner: '__pullora__',
              repo: 'global-dark',
              backgroundPath: 'C:\\art\\dark-bg.png',
              updatedAt: '2026-07-18T00:00:00Z',
            }],
          ]);
          let eventLog = [
            '[2026-07-18T10:00:00Z] launch CpPrice11/demo@v1: launched C:\\Users\\tester\\AppData\\Local\\Pullora\\Apps\\A very long application folder\\demo.exe',
            '[2026-07-18T10:01:00Z] install CpPrice11/demo@v2: download failed\nC:\\Temp\\package.zip\nAccess denied',
            '[2026-07-18T10:02:00Z] install CpPrice11/demo@v2: download canceled',
            '[2026-07-18T10:03:00Z] install CpPrice11/demo@v2: download started',
          ];
          window.__PULLORA_SETTINGS_TEST__ = {
            get updateCount() { return settingsUpdateCount; },
            get commands() { return [...commands]; },
            get calls() { return structuredClone(calls); },
            get settings() { return structuredClone(settings); },
            get launcherBackgrounds() {
              return Object.fromEntries(
                [...launcherArt.entries()].map(([key, art]) => [key, art.backgroundPath ?? null]),
              );
            },
            setEventLog(entries) { eventLog = structuredClone(entries); },
          };
          window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
          window.__TAURI_INTERNALS__ = {
            transformCallback(callback, once = false) {
              const id = callbackId++;
              callbacks.set(id, value => {
                if (once) callbacks.delete(id);
                callback?.(value);
              });
              return id;
            },
            unregisterCallback(id) { callbacks.delete(id); },
            runCallback(id, value) { callbacks.get(id)?.(value); },
            convertFileSrc(path) { return path; },
            async invoke(command, args = {}) {
              if (command === 'plugin:event|listen') return args.handler;
              if (command === 'plugin:event|unlisten') return null;
              commands.push(command);
              calls.push({ command, args: structuredClone(args) });
              if (command === 'get_settings') return structuredClone(settings);
              if (command === 'update_settings') {
                settings = structuredClone(args.newSettings);
                settingsUpdateCount += 1;
                return null;
              }
              if (command === 'set_installation_path') {
                settings.installationPath = args.path?.trim() || 'C:\\Users\\tester\\AppData\\Local\\Pullora\\Apps';
                return settings.installationPath;
              }
              if (command === 'validate_installation_path') return { ok: true, status: 'ok' };
              if (command === 'is_first_launch') return false;
            if (command === 'get_event_log') return structuredClone(eventLog);
            if (command === 'get_github_rate_limit_status') {
              return {
                core: { remaining: null, limit: null, resetAt: null },
                search: { remaining: null, limit: null, resetAt: null },
              };
            }
            if (command === 'get_launcher_storage_info') {
              return {
                launcherDir: 'C:\\Users\\tester\\AppData\\Local\\Pullora',
                updateCachePath: 'C:\\Users\\tester\\AppData\\Local\\Pullora\\updates',
                backupPath: 'C:\\Users\\tester\\AppData\\Local\\Pullora\\backups',
                cleanupBytes: 4096,
                updateCacheCount: 2,
                backupCount: 1,
              };
            }
            if (command === 'cleanup_launcher_update_files') {
              return {
                launcherDir: 'C:\\Users\\tester\\AppData\\Local\\Pullora',
                updateCachePath: 'C:\\Users\\tester\\AppData\\Local\\Pullora\\updates',
                backupPath: 'C:\\Users\\tester\\AppData\\Local\\Pullora\\backups',
                cleanupBytes: 0,
                updateCacheCount: 0,
                backupCount: 0,
              };
            }
              if (command === 'get_project_art_asset') {
                if (args.owner === '__pullora__') {
                  return structuredClone(launcherArt.get(args.repo) ?? null);
                }
                return null;
              }
              if (command === 'clear_project_art_asset_command') {
                const current = launcherArt.get(args.repo) ?? {
                  owner: args.owner,
                  repo: args.repo,
                  updatedAt: '2026-07-18T00:00:00Z',
                };
                const cleared = { ...current, backgroundPath: null, backgroundDataUrl: null };
                launcherArt.set(args.repo, cleared);
                return structuredClone(cleared);
              }
              if (['get_downloads', 'get_installed_apps', 'get_favorites', 'get_library_folders', 'list_project_art_assets'].includes(command)) return [];
              return null;
            },
          };
        })();
        """
    )


def boxes(page):
    return page.locator(
        ".settings-page-header, .settings-workspace, .settings-nav"
    ).evaluate_all(
        "els => els.map(el => { const box = el.getBoundingClientRect(); return "
        "{ className: el.className, x: box.x, y: box.y, width: box.width, height: box.height } })"
    )


def element_geometry(page, selector):
    return page.locator(selector).evaluate(
        """
        element => {
          const box = element.getBoundingClientRect();
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            bottom: box.bottom,
            borderRadius: getComputedStyle(element).borderRadius,
          };
        }
        """
    )


def composition(box_list):
    header, workspace, navigation = box_list
    return {
        "header": header,
        "workspace": {key: workspace[key] for key in ("x", "y", "width")},
        "navigation": {key: navigation[key] for key in ("x", "y", "width")},
    }


def navigation_state(page):
    return page.locator(".settings-nav").evaluate(
        """
        nav => {
          const bounds = nav.getBoundingClientRect();
          const reset = nav.querySelector('.settings-nav-reset')?.getBoundingClientRect();
          return {
            flexDirection: getComputedStyle(nav).flexDirection,
            clientWidth: nav.clientWidth,
            scrollWidth: nav.scrollWidth,
            clientHeight: nav.clientHeight,
            scrollHeight: nav.scrollHeight,
            resetBottomGap: reset ? bounds.bottom - reset.bottom : null,
            buttonsInside: [...nav.querySelectorAll('button')].every(button => {
              const box = button.getBoundingClientRect();
              return box.left >= bounds.left && box.right <= bounds.right + 1
                && box.top >= bounds.top && box.bottom <= bounds.bottom + 1;
            }),
          };
        }
        """
    )


def field_group_state(page, panel_id):
    return page.locator(f"#{panel_id}").evaluate(
        """
        panel => {
          const panelBounds = panel.getBoundingClientRect();
          const groups = [...panel.querySelectorAll('.form-group')];
          const controls = 'input, select, textarea, button';
          const labelsAssociated = [...panel.querySelectorAll('label')].every(label => {
            const group = label.closest('.form-group');
            if (!group) return false;
            if (label.htmlFor) {
              const target = document.getElementById(label.htmlFor);
              return Boolean(target && panel.contains(target) && target.closest('.form-group') === group);
            }
            return Boolean(label.querySelector(controls) || group.querySelector('button'));
          });
          const labelsBeforeControls = [...panel.querySelectorAll('label')].every(label => {
            const group = label.closest('.form-group');
            const control = label.htmlFor
              ? document.getElementById(label.htmlFor)
              : label.querySelector(controls) || group?.querySelector('button');
            return Boolean(control && (label.contains(control)
              || label.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING));
          });
          return {
            groupCount: groups.length,
            labelsAssociated,
            labelsBeforeControls,
            groupsHaveControls: groups.every(group => Boolean(group.querySelector(controls))),
            helpTextsGrouped: [...panel.querySelectorAll('.form-group .help-text')]
              .every(help => Boolean(help.closest('.form-group'))),
            groupsInside: groups.every(group => {
              const box = group.getBoundingClientRect();
              return box.left >= panelBounds.left - 1 && box.right <= panelBounds.right + 1;
            }),
            hasHeading: Boolean(panel.querySelector('h3')),
          };
        }
        """
    )


def select_state(page, selector):
    return page.locator(selector).evaluate(
        """
        select => {
          const style = getComputedStyle(select);
          const label = document.querySelector(`label[for="${select.id}"]`);
          return {
            value: select.value,
            options: [...select.options].map(option => ({
              value: option.value,
              label: option.textContent.trim(),
              disabled: option.disabled,
            })),
            labelled: Boolean(label && label.textContent.trim()),
            style: {
              backgroundColor: style.backgroundColor,
              borderColor: style.borderColor,
              borderRadius: style.borderRadius,
              color: style.color,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              minHeight: style.minHeight,
            },
          };
        }
        """
    )


def check_select_contract(page):
    page.get_by_role("button", name="Загальне", exact=True).click()
    page.locator("#settings-general").wait_for()
    theme_select = page.locator("#theme")
    language_select = page.locator("#language")
    assert [option["value"] for option in select_state(page, "#theme")["options"]] == [
        "light", "dark", "auto"
    ]
    assert [option["value"] for option in select_state(page, "#language")["options"]] == [
        "uk", "en"
    ]
    assert select_state(page, "#theme")["labelled"]
    assert select_state(page, "#language")["labelled"]

    theme_select.focus()
    assert theme_select.evaluate("el => el === document.activeElement")
    theme_select.press("Alt+ArrowDown")
    page.keyboard.press("Escape")
    assert theme_select.evaluate("el => el === document.activeElement")
    theme_select.select_option("light")
    page.wait_for_function(
        "document.documentElement.dataset.theme === 'light' && "
        "getComputedStyle(document.querySelector('.cinematic-background')).backgroundImage.includes('light-bg.png')"
    )
    assert page.locator("html").get_attribute("data-theme") == "light"
    theme_select.select_option("auto")
    assert theme_select.input_value() == "auto"

    language_select.focus()
    language_select.press("Alt+ArrowDown")
    page.keyboard.press("Escape")
    assert language_select.evaluate("el => el === document.activeElement")
    language_select.select_option("en")
    page.get_by_role("heading", name="Settings", exact=True).wait_for()
    assert language_select.input_value() == "en"
    language_select.select_option("uk")
    page.get_by_role("heading", name="Налаштування", exact=True).wait_for()

    language_select.evaluate("el => el.blur()")
    page.mouse.move(0, 0)
    page.wait_for_timeout(200)
    theme_style = select_state(page, "#theme")["style"]
    language_style = select_state(page, "#language")["style"]
    theme_style.pop("borderColor")
    language_style.pop("borderColor")
    assert theme_style == language_style, {"theme": theme_style, "language": language_style}


def root_appearance_state(page):
    return page.locator("html").evaluate(
        """
        root => ({
          theme: root.dataset.theme,
          preference: root.dataset.themePreference,
          densityScale: root.style.getPropertyValue('--density-scale').trim(),
          surfaceOpacity: root.style.getPropertyValue('--surface-opacity').trim(),
          surfaceBlur: root.style.getPropertyValue('--surface-blur').trim(),
        })
        """
    )


def check_appearance_contract(page, target_theme):
    page.get_by_role("button", name="Загальне", exact=True).click()
    page.locator("#settings-general").wait_for()

    background = page.locator(".cinematic-background")
    page.wait_for_function(
        "document.querySelector('.cinematic-background')?.classList.contains('is-visible')"
    )
    theme_select = page.locator("#theme")

    theme_select.select_option("light")
    page.wait_for_function(
        "document.documentElement.dataset.theme === 'light' && "
        "getComputedStyle(document.querySelector('.cinematic-background')).backgroundImage.includes('light-bg.png')"
    )
    assert "light-bg.png" in background.evaluate("el => getComputedStyle(el).backgroundImage")
    light_state = root_appearance_state(page)
    assert light_state["densityScale"] == "0.86", light_state

    theme_select.select_option("dark")
    page.wait_for_function(
        "document.documentElement.dataset.theme === 'dark' && "
        "getComputedStyle(document.querySelector('.cinematic-background')).backgroundImage.includes('dark-bg.png')"
    )
    assert "dark-bg.png" in background.evaluate("el => getComputedStyle(el).backgroundImage")
    theme_select.select_option(target_theme)
    page.wait_for_function(
        "theme => document.documentElement.dataset.theme === theme",
        arg=target_theme,
    )


def surface_state(page):
    return page.evaluate(
        """
        () => {
          const alpha = value => {
            if (!value || value === 'transparent') return 0;
            const comma = value.match(/^rgba?\([^)]*,\s*([\d.]+)\)$/);
            if (comma && value.startsWith('rgba')) return Number(comma[1]);
            const slash = value.match(/\/\s*([\d.]+)(%)?/);
            if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
            return 1;
          };
          const read = selector => {
            const element = document.querySelector(selector);
            if (!element) throw new Error(`Missing surface: ${selector}`);
            const style = getComputedStyle(element);
            return {
              alpha: alpha(style.backgroundColor),
              backgroundColor: style.backgroundColor,
              backgroundImage: style.backgroundImage,
              backdropFilter: style.backdropFilter,
            };
          };
          return {
            background: read('.cinematic-background'),
            workspace: read('.settings-workspace'),
            navigation: read('.settings-nav'),
            content: read('.settings-content'),
            panel: read('.settings-content > section'),
          };
        }
        """
    )


def set_density(page, density):
    page.evaluate(
        """
        density => {
          const appearance = window.__PULLORA_SETTINGS_TEST__.settings.appearance;
          window.dispatchEvent(new CustomEvent('pullora-settings-change', {
            detail: { appearance: { ...appearance, density } },
          }));
        }
        """,
        density,
    )
    expected = {"compact": "0.86", "comfortable": "1", "spacious": "1.12"}[density]
    page.wait_for_function(
        "expected => document.documentElement.style.getPropertyValue('--density-scale').trim() === expected",
        arg=expected,
    )


def density_metrics(page):
    page.get_by_role("button", name="Загальне", exact=True).click()
    page.locator("#settings-general").wait_for()
    general = page.evaluate(
        """
        () => {
          const box = selector => document.querySelector(selector).getBoundingClientRect();
          const style = selector => getComputedStyle(document.querySelector(selector));
          return {
            navHeight: box('.settings-nav button').height,
            inputHeight: box('#theme').height,
            secondaryHeight: box('.launcher-background-theme .secondary-btn').height,
            contentPadding: Number.parseFloat(style('.settings-content').paddingTop),
            sectionPadding: Number.parseFloat(style('.settings-content > section').paddingTop),
          };
        }
        """
    )
    page.get_by_role("button", name="Журнал подій", exact=True).click()
    page.locator(".settings-event-log-list li").first.wait_for()
    events = page.evaluate(
        """
        () => {
          const list = document.querySelector('.settings-event-log-list');
          const item = list.querySelector('li');
          return {
            eventGap: Number.parseFloat(getComputedStyle(list).gap),
            eventHeight: item.getBoundingClientRect().height,
            eventPadding: Number.parseFloat(getComputedStyle(item).paddingTop),
          };
        }
        """
    )
    return {**general, **events}


def preview_range_value(page, selector, value, css_variable, expected_value):
    control = page.locator(selector)
    control.scroll_into_view_if_needed()
    control.fill(str(value))
    try:
        page.wait_for_function(
            "([controlSelector, name, controlValue, expected]) => "
            "document.querySelector(controlSelector)?.value === String(controlValue) && "
            "document.documentElement.style.getPropertyValue(name).trim() === expected",
            arg=[selector, css_variable, value, expected_value],
            timeout=5_000,
        )
    except PlaywrightTimeoutError as error:
        actual = page.evaluate(
            """
            ([controlSelector, variable]) => ({
              control: document.querySelector(controlSelector)?.value,
              variable: document.documentElement.style.getPropertyValue(variable).trim(),
              theme: document.documentElement.dataset.theme,
            })
            """,
            [selector, css_variable],
        )
        raise AssertionError({
            "selector": selector,
            "requested": value,
            "expected": expected_value,
            "actual": actual,
        }) from error


def drag_range_control(page, selector, target_ratio):
    control = page.locator(selector)
    control.scroll_into_view_if_needed()
    box = control.bounding_box()
    assert box, {"selector": selector, "reason": "missing bounding box"}
    limits = control.evaluate(
        "el => ({ min: Number(el.min), max: Number(el.max), value: Number(el.value) })"
    )
    usable_width = max(1, box["width"] - 18)
    start_ratio = (limits["value"] - limits["min"]) / (limits["max"] - limits["min"])
    start_x = box["x"] + 9 + usable_width * start_ratio
    target_x = box["x"] + 9 + usable_width * target_ratio
    y = box["y"] + box["height"] / 2
    hit_target = page.evaluate(
        "([x, y]) => document.elementFromPoint(x, y)?.id ?? null",
        [start_x, y],
    )
    assert hit_target == selector.removeprefix("#"), {
        "selector": selector,
        "hitTarget": hit_target,
    }
    page.mouse.move(start_x, y)
    page.mouse.down()
    page.mouse.move(target_x, y, steps=8)
    page.mouse.up()
    page.wait_for_timeout(350)
    actual = int(control.input_value())
    assert actual != limits["value"], {
        "selector": selector,
        "before": limits["value"],
        "after": actual,
    }
    return actual


def check_general_reset_contract(page):
    page.get_by_role("button", name="Загальне", exact=True).click()
    page.locator("#settings-general").wait_for()
    page.locator("#theme").select_option("dark")
    page.locator("#language").select_option("en")
    page.wait_for_function(
        "window.__PULLORA_SETTINGS_TEST__.settings.theme === 'dark' && "
        "window.__PULLORA_SETTINGS_TEST__.settings.language === 'en' && "
        "document.documentElement.lang === 'en'"
    )
    before = page.evaluate("window.__PULLORA_SETTINGS_TEST__.settings")
    assert before["installationPath"] == "C:\\PulloraApps", before
    assert before["assetStrategy"] == "portableFirst", before
    assert before["appearance"]["surfaceTransparency"] != 42, before
    assert page.evaluate(
        "Object.values(window.__PULLORA_SETTINGS_TEST__.launcherBackgrounds).some(Boolean)"
    )

    page.wait_for_function(
        "window.__PULLORA_SETTINGS_TEST__.commands.includes('save_library_folders')"
    )
    folder_state = page.evaluate(
        "window.__PULLORA_SETTINGS_TEST__.calls.filter(call => "
        "call.command === 'save_library_folders').at(-1).args"
    )
    call_offset = page.evaluate("window.__PULLORA_SETTINGS_TEST__.calls.length")
    reset_trigger = page.get_by_role("button", name="Reset", exact=True)
    reset_trigger.click()
    dialog = page.get_by_role("alertdialog")
    dialog.wait_for()
    assert dialog.get_attribute("aria-describedby") == "settings-reset-description"
    cancel = dialog.get_by_role("button", name="Cancel", exact=True)
    page.wait_for_function(
        "el => el === document.activeElement",
        arg=cancel.element_handle(),
    )
    confirm = dialog.get_by_role("button", name="Reset", exact=True)
    confirm.focus()
    confirm.press("Tab")
    close = dialog.get_by_role("button", name="Close", exact=True)
    assert close.evaluate("el => el === document.activeElement")
    page.keyboard.press("Escape")
    dialog.wait_for(state="hidden")
    page.wait_for_function("el => el === document.activeElement", arg=reset_trigger.element_handle())

    reset_trigger.click()
    dialog.wait_for()
    page.wait_for_function("el => el === document.activeElement", arg=cancel.element_handle())
    update_count = page.evaluate("window.__PULLORA_SETTINGS_TEST__.updateCount")
    confirm.click()
    dialog.wait_for(state="hidden")
    page.wait_for_function(
        "count => window.__PULLORA_SETTINGS_TEST__.updateCount > count",
        arg=update_count,
    )

    after = page.evaluate("window.__PULLORA_SETTINGS_TEST__.settings")
    assert after["githubOwner"] == "CpPrice11", after
    assert after["theme"] == "auto", after
    assert after["language"] == "uk", after
    assert after["appearance"]["surfaceTransparency"] == 42, after
    assert after["appearance"]["surfaceBlur"] == 12, after
    assert after["appearance"]["density"] == "comfortable", after
    assert after["installationPath"].endswith("\\AppData\\Local\\Pullora\\Apps"), after
    assert after["includePrereleases"] == before["includePrereleases"], after
    assert after["assetStrategy"] == before["assetStrategy"], after
    assert page.evaluate(
        "Object.values(window.__PULLORA_SETTINGS_TEST__.launcherBackgrounds).every(value => value === null)"
    )
    reset_calls = page.evaluate(
        "offset => window.__PULLORA_SETTINGS_TEST__.calls.slice(offset)",
        call_offset,
    )
    reset_commands = [
        call["command"] for call in reset_calls if call["command"] != "save_library_folders"
    ]
    assert sorted(reset_commands) == sorted([
        "update_settings",
        "set_installation_path",
        "clear_project_art_asset_command",
        "clear_project_art_asset_command",
    ]), reset_commands
    assert all(
        call["args"] == folder_state
        for call in reset_calls
        if call["command"] == "save_library_folders"
    ), reset_calls


def check_settings_accessibility_contract(page):
    page.get_by_role("button", name=SECTIONS[0][0], exact=True).click()
    page.locator("#settings-general").wait_for()
    audit = page.locator(".settings-page").evaluate(
        """
        root => {
          const visible = element => element.getClientRects().length > 0;
          const controls = [...root.querySelectorAll('button, input, select, textarea, summary, a[href]')]
            .filter(visible);
          const nameOf = element => (
            element.getAttribute('aria-label')
            || [...(element.labels || [])].map(label => label.textContent.trim()).join(' ')
            || element.textContent.trim()
            || element.getAttribute('title')
            || ''
          );
          const ids = [...root.querySelectorAll('[id]')].map(element => element.id);
          return {
            unnamed: controls.filter(element => !nameOf(element)).map(element => element.outerHTML),
            positiveTabIndex: controls.filter(element => element.tabIndex > 0).map(element => element.outerHTML),
            duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
            brokenControls: [...root.querySelectorAll('[aria-controls]')]
              .filter(element => !document.getElementById(element.getAttribute('aria-controls')))
              .map(element => element.outerHTML),
          };
        }
        """
    )
    assert audit == {
        "unnamed": [],
        "positiveTabIndex": [],
        "duplicateIds": [],
        "brokenControls": [],
    }, audit

    general_button = page.get_by_role("button", name=SECTIONS[0][0], exact=True)
    events_button = page.get_by_role("button", name=SECTIONS[1][0], exact=True)
    general_button.focus()
    general_button.press("Tab")
    assert events_button.evaluate("el => el === document.activeElement")
    assert events_button.evaluate("el => el.matches(':focus-visible')")
    assert events_button.evaluate("el => getComputedStyle(el).outlineStyle !== 'none'")
    events_button.press("Enter")
    page.locator("#settings-events").wait_for()
    assert events_button.get_attribute("aria-current") == "page"

    general_button.focus()
    general_button.press("Enter")
    page.locator("#settings-general").wait_for()

    transparency = page.locator("#surfaceTransparency")
    transparency.focus()
    transparency.press("Home")
    assert transparency.evaluate("el => el.matches(':focus-visible')")
    assert transparency.input_value() == "0"
    transparency.press("ArrowRight")
    assert transparency.input_value() == "1"
    assert root_appearance_state(page)["surfaceOpacity"] == "99%"

    page.get_by_role("button", name="Перевірити", exact=True).click()
    status = page.locator("#installPath-status")
    status.wait_for()
    assert status.get_attribute("role") == "status"
    assert page.locator("#installPath").get_attribute("aria-describedby") == "installPath-status"
    assert page.locator("#installPath").get_attribute("aria-invalid") is None


def check_background_label_contract(page):
    page.get_by_role("button", name="Загальне", exact=True).click()
    page.locator("#settings-general").wait_for()
    assert page.get_by_text("Фон", exact=True).count() == 1
    assert page.get_by_text("Підкладки", exact=True).count() == 1
    for theme in ("Світла", "Темна"):
        edit = page.get_by_role("button", name=f"Редагувати фон — {theme}", exact=True)
        reset = page.get_by_role("button", name=f"Скинути фон — {theme}", exact=True)
        assert edit.inner_text() == "Редагувати"
        assert reset.inner_text() == "Скинути"


def check_event_log_contract(page, width):
    page.get_by_role("button", name="Журнал подій", exact=True).click()
    items = page.locator(".settings-event-log-list li")
    items.first.wait_for()
    assert items.count() == 4
    for index, level in enumerate(("success", "error", "warning", "info")):
        assert items.nth(index).locator(f".settings-event-level.{level} .ui-icon").count() == 1
        assert items.nth(index).locator(".settings-event-level").inner_text().strip()
    assert items.first.locator(".settings-event-source").inner_text() == "Запуск застосунку"
    first_message = items.first.locator(".settings-event-message").inner_text()
    assert first_message == "launched", first_message
    assert items.nth(1).locator(".settings-event-message").inner_text() == "download failed"
    assert page.locator(".settings-event-log-list").evaluate(
        "el => el.scrollWidth <= el.clientWidth + 1"
    )

    details = items.first.locator("details")
    assert details.get_attribute("open") is None
    summary = details.locator("summary")
    summary.focus()
    assert summary.evaluate("el => el === document.activeElement")
    summary.press("Enter")
    assert details.get_attribute("open") is not None
    technical = details.locator("code").inner_text()
    assert "CpPrice11/demo@v1" in technical
    assert "A very long application folder" in technical

    error_details = items.nth(1).locator("details")
    assert error_details.get_attribute("open") is None
    error_details.locator("summary").click()
    error_technical = error_details.locator("code").inner_text()
    assert "C:\\Temp\\package.zip" in error_technical
    assert "Access denied" in error_technical
    assert "\n" in error_technical

    layout = items.first.evaluate(
        """
        item => {
          const time = item.querySelector('time').getBoundingClientRect();
          const message = item.querySelector('.settings-event-message').getBoundingClientRect();
          return {
            columns: getComputedStyle(item).gridTemplateColumns.split(' ').length,
            metadataAbove: message.top >= time.bottom - 1,
          };
        }
        """
    )
    if width == 1000:
        assert layout["columns"] == 3 and layout["metadataAbove"], layout
    if width == 1920:
        assert layout["columns"] == 4 and not layout["metadataAbove"], layout

    page.evaluate("window.__PULLORA_SETTINGS_TEST__.setEventLog([])")
    page.get_by_role("button", name="Оновити журнал", exact=True).click()
    page.get_by_text("Журнал поки порожній", exact=True).wait_for()
    assert items.count() == 0
    assert page.get_by_role("button", name="Оновити журнал", exact=True).is_enabled()


def check_maintenance_contract(page):
    page.get_by_role("button", name="Обслуговування", exact=True).click()
    section = page.locator("#settings-maintenance")
    section.wait_for()
    assert section.locator("h4").all_inner_texts() == ["Сховище", "Діагностика"]
    assert section.get_by_role("button", name="Експорт бібліотеки").count() == 0
    assert section.get_by_role("button", name="Імпорт бібліотеки").count() == 0
    assert section.evaluate("el => el.scrollWidth <= el.clientWidth + 1")

    cleanup = section.get_by_role("button", name="Очистити старі файли лаунчера", exact=True)
    cleanup.click()
    dialog = page.get_by_role("alertdialog", name="Очистити старі файли?")
    dialog.wait_for()
    assert "4" in dialog.locator("#settings-reset-description").inner_text()
    cancel = dialog.get_by_role("button", name="Скасувати", exact=True)
    page.wait_for_function("el => el === document.activeElement", arg=cancel.element_handle())
    page.keyboard.press("Escape")
    dialog.wait_for(state="hidden")

    cleanup.click()
    dialog.wait_for()
    dialog.get_by_role("button", name="Очистити", exact=True).click()
    dialog.wait_for(state="hidden")
    page.get_by_role("status").filter(has_text="Старі файли лаунчера очищено").wait_for()


def check_surface_and_density_contract(page, theme):
    background = page.locator(".cinematic-background")
    for label, panel_id in SECTIONS:
        page.get_by_role("button", name=label, exact=True).click()
        page.locator(f"#{panel_id}").wait_for()
        state = surface_state(page)
        assert f"{theme}-bg.png" in state["background"]["backgroundImage"], state
        assert background.evaluate("el => el.classList.contains('is-visible')")
        assert float(background.evaluate("el => getComputedStyle(el).opacity")) > 0
        expected_blur = root_appearance_state(page)["surfaceBlur"]
        assert expected_blur in state["workspace"]["backdropFilter"], state
        for surface in ("workspace", "navigation", "content", "panel"):
            assert state[surface]["alpha"] < 1, {"section": label, **state}

    set_density(page, "compact")
    compact = density_metrics(page)
    set_density(page, "comfortable")
    comfortable = density_metrics(page)
    set_density(page, "spacious")
    spacious = density_metrics(page)
    for metric in compact:
        assert compact[metric] < comfortable[metric] < spacious[metric], {
            "metric": metric,
            "compact": compact,
            "comfortable": comfortable,
            "spacious": spacious,
        }
    set_density(page, "compact")
    appearance_state = root_appearance_state(page)
    assert appearance_state["theme"] == theme, appearance_state
    assert appearance_state["densityScale"] == "0.86", appearance_state

    page.get_by_role("button", name=SECTIONS[0][0], exact=True).click()
    page.locator("#settings-general").wait_for()
    transparency = page.locator("#surfaceTransparency")
    transparency_states = {}
    for value, opacity in ((0, "100%"), (40, "60%"), (80, "20%")):
        preview_range_value(
            page,
            "#surfaceTransparency",
            value,
            "--surface-opacity",
            opacity,
        )
        transparency_states[value] = surface_state(page)
        assert f"{theme}-bg.png" in transparency_states[value]["background"]["backgroundImage"]
    assert (
        transparency_states[0]["workspace"]["alpha"]
        > transparency_states[40]["workspace"]["alpha"]
        > transparency_states[80]["workspace"]["alpha"]
    ), transparency_states

    preview_range_value(page, "#surfaceTransparency", 0, "--surface-opacity", "100%")
    update_count = page.evaluate("window.__PULLORA_SETTINGS_TEST__.updateCount")
    transparency.focus()
    transparency.press("End")
    page.wait_for_function(
        "count => window.__PULLORA_SETTINGS_TEST__.updateCount > count",
        arg=update_count,
    )
    transparency_state = root_appearance_state(page)
    assert transparency.input_value() == "80"
    assert transparency_state["surfaceOpacity"] == "20%", transparency_state

    blur = page.locator("#surfaceBlur")
    for value in (0, 12, 32):
        expected = f"{value}px"
        preview_range_value(page, "#surfaceBlur", value, "--surface-blur", expected)
        backdrop_filter = surface_state(page)["workspace"]["backdropFilter"]
        if value == 0:
            assert "blur(" not in backdrop_filter or expected in backdrop_filter
        else:
            assert expected in backdrop_filter

    preview_range_value(page, "#surfaceBlur", 0, "--surface-blur", "0px")
    update_count = page.evaluate("window.__PULLORA_SETTINGS_TEST__.updateCount")
    blur.focus()
    blur.press("End")
    page.wait_for_function(
        "count => window.__PULLORA_SETTINGS_TEST__.updateCount > count",
        arg=update_count,
    )
    blur_state = root_appearance_state(page)
    assert blur.input_value() == "32"
    assert blur_state["surfaceBlur"] == "32px", blur_state
    assert "32px" in surface_state(page)["workspace"]["backdropFilter"]

    stored = page.evaluate("window.__PULLORA_SETTINGS_TEST__.settings")
    assert stored["appearance"]["surfaceTransparency"] == 80, stored
    dragged_transparency = drag_range_control(page, "#surfaceTransparency", 0.25)
    expected_opacity = f"{100 - dragged_transparency}%"
    page.wait_for_function(
        "expected => document.documentElement.style.getPropertyValue('--surface-opacity').trim() === expected",
        arg=expected_opacity,
    )
    stored = page.evaluate("window.__PULLORA_SETTINGS_TEST__.settings")
    assert stored["appearance"]["surfaceTransparency"] == dragged_transparency, stored
    assert stored["appearance"]["surfaceBlur"] == 32, stored
    assert stored["appearance"]["density"] == "compact", stored
    assert root_appearance_state(page)["densityScale"] == "0.86"

    reset_light = page.get_by_role("button", name="Скинути фон — Світла", exact=True)
    reset_dark = page.get_by_role("button", name="Скинути фон — Темна", exact=True)
    assert reset_light.count() == 1
    assert reset_dark.count() == 1
    reset_light.click()
    reset_light.wait_for(state="detached")
    assert reset_dark.count() == 1
    if theme == "light":
        assert "light-bg.png" not in background.evaluate("el => getComputedStyle(el).backgroundImage")
        page.locator("#theme").select_option("dark")
        page.wait_for_function("document.documentElement.dataset.theme === 'dark'")
    assert "dark-bg.png" in background.evaluate("el => getComputedStyle(el).backgroundImage")


def check_settings_baseline_matrix(page, theme, width, height, scale):
    page.get_by_role("button", name=SECTIONS[0][0], exact=True).click()
    page.locator("#settings-general").wait_for()
    states = {}
    background = page.locator(".cinematic-background")

    for density in ("comfortable", "compact"):
        set_density(page, density)
        for custom_background in (False, True):
            background.evaluate(
                "(el, visible) => el.classList.toggle('is-visible', visible)",
                custom_background,
            )
            state = page.evaluate(
                """
                () => {
                  const page = document.querySelector('.settings-page');
                  const workspace = document.querySelector('.settings-workspace');
                  const content = document.querySelector('.settings-content');
                  const section = document.querySelector('#settings-general');
                  const background = document.querySelector('.cinematic-background');
                  const pageBox = page.getBoundingClientRect();
                  const workspaceBox = workspace.getBoundingClientRect();
                  const contentBox = content.getBoundingClientRect();
                  const sectionBox = section.getBoundingClientRect();
                  const contentStyle = getComputedStyle(content);
                  const sectionStyle = getComputedStyle(section);
                  const backgroundStyle = getComputedStyle(background);
                  return {
                    dpr: window.devicePixelRatio,
                    page: pageBox.toJSON(),
                    workspace: workspaceBox.toJSON(),
                    pageOverflow: page.scrollWidth > page.clientWidth + 1,
                    contentOverflow: content.scrollWidth > content.clientWidth + 1,
                    sectionWidthGap: contentBox.width
                      - Number.parseFloat(contentStyle.paddingLeft)
                      - Number.parseFloat(contentStyle.paddingRight)
                      - sectionBox.width,
                    sectionPadding: Number.parseFloat(sectionStyle.paddingTop),
                    backgroundVisible: background.classList.contains('is-visible'),
                    backgroundOpacity: Number(backgroundStyle.opacity),
                    backgroundImage: backgroundStyle.backgroundImage,
                  };
                }
                """
            )
            assert abs(state["dpr"] - scale) < 0.01, state
            assert not state["pageOverflow"] and not state["contentOverflow"], state
            assert abs(state["sectionWidthGap"]) <= 1, state
            assert state["page"]["x"] >= 0 and state["page"]["right"] <= width + 1, state
            assert state["page"]["y"] >= 0 and state["page"]["bottom"] <= height + 1, state
            assert state["workspace"]["right"] <= width + 1, state
            assert state["workspace"]["bottom"] <= height + 1, state
            assert state["backgroundVisible"] is custom_background, state
            if custom_background:
                assert state["backgroundOpacity"] > 0, state
                assert f"{theme}-bg.png" in state["backgroundImage"], state
            else:
                assert state["backgroundOpacity"] == 0, state
            states[density] = state

    assert states["compact"]["sectionPadding"] < states["comfortable"]["sectionPadding"], states
    set_density(page, "compact")
    background.evaluate("el => el.classList.add('is-visible')")
    return 4


def main() -> None:
    check_settings_surface_source_contract()
    if "--static" in sys.argv:
        return

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        checked = 0
        for theme in ("dark", "light"):
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme=theme,
                    locale="uk-UA",
                )
                page = context.new_page()
                install_settings_mock(page)
                BASELINE["seed_cache"](page)
                BASELINE["open_library"](page)
                library_page = element_geometry(page, ".library-page")
                library_surface = element_geometry(page, ".library-sam-list-pane")
                page.get_by_role("button", name="Налаштування").click()
                page.get_by_role("heading", name="Налаштування").wait_for()
                settings_page = element_geometry(page, ".settings-page")
                settings_workspace = element_geometry(page, ".settings-workspace")
                nav_labels = page.locator(
                    ".settings-nav button:not(.settings-nav-reset)"
                ).all_inner_texts()
                assert nav_labels == [label for label, _ in SECTIONS], nav_labels
                assert page.get_by_role("button", name="Встановлення", exact=True).count() == 0
                assert page.get_by_role("button", name="Оновлення", exact=True).count() == 0
                assert page.locator("#githubOwner").count() == 0
                owner_summary = page.locator(".settings-source-summary-owner")
                assert owner_summary.locator("strong").inner_text() == "CpPrice11"
                assert owner_summary.locator(
                    "input, select, textarea, [contenteditable='true']"
                ).count() == 0
                for dimension in ("x", "y", "width", "height"):
                    assert abs(settings_page[dimension] - library_page[dimension]) <= 1, {
                        "theme": theme,
                        "viewport": [width, height],
                        "dimension": dimension,
                        "library": library_page,
                        "settings": settings_page,
                    }
                assert abs(settings_workspace["x"] - settings_page["x"]) <= 1
                assert abs(settings_workspace["width"] - settings_page["width"]) <= 1
                assert abs(settings_workspace["bottom"] - settings_page["bottom"]) <= 1
                assert settings_workspace["borderRadius"] == library_surface["borderRadius"]
                assert page.locator(".settings-autosave-status").count() == 0
                assert page.locator(".settings-done-btn").count() == 0
                initial_boxes = composition(boxes(page))
                initial_navigation = navigation_state(page)
                assert initial_navigation["scrollWidth"] <= initial_navigation["clientWidth"] + 1
                assert initial_navigation["scrollHeight"] <= initial_navigation["clientHeight"] + 1
                assert initial_navigation["buttonsInside"], initial_navigation
                if width == 1000:
                    assert initial_navigation["flexDirection"] == "column", initial_navigation
                if initial_navigation["flexDirection"] == "column":
                    assert 0 <= initial_navigation["resetBottomGap"] <= 24, initial_navigation

                checked += check_settings_baseline_matrix(page, theme, width, height, 1)

                for label, panel_id in SECTIONS:
                    button = page.get_by_role("button", name=label, exact=True)
                    button.click()
                    page.locator(f"#{panel_id}").wait_for()
                    assert button.get_attribute("aria-current") == "page"
                    actual_boxes = composition(boxes(page))
                    assert actual_boxes == initial_boxes, {
                        "theme": theme,
                        "viewport": [width, height],
                        "section": label,
                        "expected": initial_boxes,
                        "actual": actual_boxes,
                    }
                    assert page.locator(".settings-page").evaluate(
                        "el => el.scrollWidth <= el.clientWidth + 1"
                    )
                    assert page.locator(".settings-content").evaluate(
                        "el => el.scrollWidth <= el.clientWidth + 1"
                    ), {
                        "theme": theme,
                        "viewport": [width, height],
                        "section": label,
                    }
                    current_navigation = navigation_state(page)
                    assert current_navigation["flexDirection"] == initial_navigation["flexDirection"]
                    assert current_navigation["clientWidth"] == initial_navigation["clientWidth"]
                    assert current_navigation["scrollWidth"] <= current_navigation["clientWidth"] + 1
                    assert current_navigation["scrollHeight"] <= current_navigation["clientHeight"] + 1
                    assert current_navigation["buttonsInside"], current_navigation
                    grouping = field_group_state(page, panel_id)
                    assert grouping["groupCount"] == EXPECTED_GROUP_COUNTS[panel_id], grouping
                    assert grouping["labelsAssociated"], grouping
                    assert grouping["labelsBeforeControls"], grouping
                    assert grouping["groupsHaveControls"], grouping
                    assert grouping["helpTextsGrouped"], grouping
                    assert grouping["groupsInside"], grouping
                    assert grouping["hasHeading"], grouping
                    checked += 1

                check_settings_accessibility_contract(page)
                check_select_contract(page)
                check_background_label_contract(page)
                check_appearance_contract(page, theme)
                check_surface_and_density_contract(page, theme)
                check_general_reset_contract(page)
                check_event_log_contract(page, width)
                check_maintenance_contract(page)

                context.close()

        for theme in ("dark", "light"):
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme=theme,
                    locale="uk-UA",
                    device_scale_factor=1.25,
                )
                page = context.new_page()
                install_settings_mock(page)
                BASELINE["seed_cache"](page)
                BASELINE["open_library"](page)
                page.get_by_role("button", name="Налаштування").click()
                page.get_by_role("heading", name="Налаштування").wait_for()
                checked += check_settings_baseline_matrix(page, theme, width, height, 1.25)
                context.close()
        browser.close()
    print(f"[settings-composition] checks={checked}: ok")


if __name__ == "__main__":
    main()
