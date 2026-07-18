from __future__ import annotations

import runpy

from playwright.sync_api import Page, sync_playwright


BASELINE = runpy.run_path("scripts/capture-visual-baseline.py")
TRANSPARENCY_VALUES = (0, 40, 80)
BLUR_VALUES = (0, 12, 32)


def set_surface_controls(page: Page, transparency: int, blur: int) -> None:
    page.get_by_role("button", name="Налаштування").click()
    page.get_by_role("heading", name="Налаштування").wait_for()
    page.locator("#surfaceTransparency").fill(str(transparency))
    page.locator("#surfaceBlur").fill(str(blur))
    page.get_by_role("button", name="Бібліотека").click()
    page.locator(".library-sam-list-pane").wait_for()
    page.locator(".library-hero").wait_for()
    page.locator(".library-ops-panel").wait_for()


def surface_snapshot(page: Page) -> dict:
    return page.evaluate(
        """
        () => {
          const style = selector => {
            const element = document.querySelector(selector);
            return element ? getComputedStyle(element) : null;
          };
          const background = selector => style(selector)?.backgroundColor ?? null;
          return {
            rootSurface: getComputedStyle(document.documentElement).getPropertyValue('--surface-1').trim(),
            listBackground: background('.library-sam-list-pane'),
            detailsBackground: background('.library-sam-details-pane'),
            listFilter: style('.library-sam-list-pane')?.backdropFilter ?? null,
            detailsFilter: style('.library-sam-details-pane')?.backdropFilter ?? null,
            toolstripBackground: background('.library-toolstrip'),
            heroBackground: background('.library-hero'),
            operationsBackground: background('.library-ops-panel'),
            inlinePanelBackground: background('.library-inline-panel'),
            innerCardBackground: background('.library-ops-grid > div'),
          };
        }
        """
    )


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        checks = 0
        for theme in ("dark", "light"):
            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                color_scheme=theme,
                locale="uk-UA",
            )
            page = context.new_page()
            BASELINE["seed_cache"](page)
            BASELINE["open_library"](page)
            backgrounds: dict[int, str] = {}

            for transparency in TRANSPARENCY_VALUES:
                for blur in BLUR_VALUES:
                    set_surface_controls(page, transparency, blur)
                    snapshot = surface_snapshot(page)
                    expected_filter = f"blur({blur}px) saturate(1.08)"
                    assert snapshot["listFilter"] == expected_filter, snapshot
                    assert snapshot["detailsFilter"] == expected_filter, snapshot
                    assert snapshot["listBackground"] == snapshot["detailsBackground"], snapshot
                    assert snapshot["toolstripBackground"] == snapshot["heroBackground"], snapshot
                    assert snapshot["heroBackground"] == snapshot["operationsBackground"], snapshot
                    if snapshot["inlinePanelBackground"] is not None:
                        assert snapshot["operationsBackground"] == snapshot["inlinePanelBackground"], snapshot
                    if blur == BLUR_VALUES[0]:
                        backgrounds[transparency] = snapshot["listBackground"]

                    BASELINE["apply_custom_background"](page)
                    custom_snapshot = surface_snapshot(page)
                    assert custom_snapshot["listBackground"] == snapshot["listBackground"], custom_snapshot
                    assert custom_snapshot["detailsBackground"] == snapshot["detailsBackground"], custom_snapshot
                    checks += 1

            assert len(set(backgrounds.values())) == len(TRANSPARENCY_VALUES), {
                "theme": theme,
                "backgrounds": backgrounds,
            }
            context.close()
        browser.close()
    print(f"[library-surface-controls] checks={checks}: ok")


if __name__ == "__main__":
    main()
