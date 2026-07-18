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
    ("Встановлення", "settings-folders"),
    ("Оновлення", "settings-updates"),
    ("Журнал подій", "settings-events"),
    ("Обслуговування", "settings-maintenance"),
)
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
EXPECTED_GROUP_COUNTS = {
    "settings-general": 5,
    "settings-folders": 1,
    "settings-updates": 2,
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
    for source, selector, expected in (
        (cinematic, ".cinematic-shell .settings-workspace", ("var(--surface-1)", "blur(var(--surface-blur))")),
        (cinematic, ".cinematic-shell .settings-page .settings-nav", ("var(--surface-2)", "var(--surface-border)")),
        (cinematic, ".cinematic-shell .settings-page .settings-content", ("var(--surface-2)",)),
        (cinematic, ".cinematic-shell .settings-page .settings-section", ("var(--surface-3)", "var(--surface-border)")),
        (pages, ".settings-page .settings-form", ("var(--surface-1)", "blur(var(--surface-blur))")),
        (pages, ".settings-page .settings-nav", ("var(--surface-2)", "var(--surface-border)")),
        (pages, ".settings-page .settings-content", ("var(--surface-2)",)),
        (pages, ".settings-page .settings-section", ("var(--surface-3)", "var(--surface-border)")),
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
          window.__PULLORA_SETTINGS_TEST__ = {
            get updateCount() { return settingsUpdateCount; },
            get settings() { return structuredClone(settings); },
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
              if (command === 'get_settings') return structuredClone(settings);
              if (command === 'update_settings') {
                settings = structuredClone(args.newSettings);
                settingsUpdateCount += 1;
                return null;
              }
              if (command === 'is_first_launch') return false;
            if (command === 'get_event_log') {
              return [
                '2026-07-18T10:00:00Z settings.loaded',
                '2026-07-18T10:01:00Z settings.updated',
              ];
            }
            if (command === 'get_github_rate_limit_status') {
              return {
                core: { remaining: null, limit: null, resetAt: null },
                search: { remaining: null, limit: null, resetAt: null },
              };
            }
            if (command === 'get_launcher_storage_info') return null;
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
          return {
            flexDirection: getComputedStyle(nav).flexDirection,
            clientWidth: nav.clientWidth,
            scrollWidth: nav.scrollWidth,
            clientHeight: nav.clientHeight,
            scrollHeight: nav.scrollHeight,
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

    page.get_by_role("button", name="Оновлення", exact=True).click()
    page.locator("#settings-updates").wait_for()
    asset_select = page.locator("#assetStrategy")
    asset_state = select_state(page, "#assetStrategy")
    assert [option["value"] for option in asset_state["options"]] == [
        "portableFirst", "installerFirst", "manual"
    ]
    assert asset_state["labelled"]
    asset_select.focus()
    asset_select.press("Alt+ArrowDown")
    page.keyboard.press("Escape")
    assert asset_select.evaluate("el => el === document.activeElement")
    update_count = page.evaluate("window.__PULLORA_SETTINGS_TEST__.updateCount")
    asset_select.select_option("manual")
    page.wait_for_function(
        "count => window.__PULLORA_SETTINGS_TEST__.updateCount > count",
        arg=update_count,
    )
    assert asset_select.input_value() == "manual"
    assert page.evaluate("window.__PULLORA_SETTINGS_TEST__.settings.assetStrategy") == "manual"

    page.get_by_role("button", name="Загальне", exact=True).click()
    page.get_by_role("button", name="Оновлення", exact=True).click()
    assert page.locator("#assetStrategy").input_value() == "manual"
    asset_style = select_state(page, "#assetStrategy")["style"]
    page.get_by_role("button", name="Загальне", exact=True).click()
    assert select_state(page, "#theme")["style"] == select_state(page, "#language")["style"]
    assert select_state(page, "#theme")["style"] == asset_style


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
    page.wait_for_function("document.documentElement.dataset.theme === 'light'")
    assert "light-bg.png" in background.evaluate("el => getComputedStyle(el).backgroundImage")
    light_state = root_appearance_state(page)
    assert light_state["densityScale"] == "0.86", light_state

    theme_select.select_option("dark")
    page.wait_for_function("document.documentElement.dataset.theme === 'dark'")
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
            inputHeight: box('#githubOwner').height,
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
    last_error = None
    for _ in range(2):
        control.evaluate(
            """
            (element, nextValue) => {
              const valueSetter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                'value',
              ).set;
              valueSetter.call(element, String(nextValue));
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
            }
            """,
            value,
        )
        try:
            page.wait_for_function(
                "([name, expected]) => document.documentElement.style.getPropertyValue(name).trim() === expected",
                arg=[css_variable, expected_value],
                timeout=5_000,
            )
            return
        except PlaywrightTimeoutError as error:
            last_error = error

    if last_error:
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
        }) from last_error


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
        assert expected in surface_state(page)["workspace"]["backdropFilter"]

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
                page.get_by_role("button", name="Налаштування").click()
                page.get_by_role("heading", name="Налаштування").wait_for()
                assert page.locator(".settings-autosave-status").count() == 0
                assert page.locator(".settings-done-btn").count() == 0
                initial_boxes = composition(boxes(page))
                initial_navigation = navigation_state(page)
                assert initial_navigation["scrollWidth"] <= initial_navigation["clientWidth"] + 1
                assert initial_navigation["scrollHeight"] <= initial_navigation["clientHeight"] + 1
                assert initial_navigation["buttonsInside"], initial_navigation
                if width == 1000:
                    assert initial_navigation["flexDirection"] == "column", initial_navigation

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

                check_select_contract(page)
                check_appearance_contract(page, theme)
                check_surface_and_density_contract(page, theme)

                context.close()
        browser.close()
    print(f"[settings-composition] checks={checked}: ok")


if __name__ == "__main__":
    main()
