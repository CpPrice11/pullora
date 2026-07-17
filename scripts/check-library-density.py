from __future__ import annotations

import runpy

from playwright.sync_api import sync_playwright


baseline = runpy.run_path("scripts/capture-visual-baseline.py")
seed_cache = baseline["seed_cache"]
open_library = baseline["open_library"]
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))
THEMES = ("dark", "light")

VIEWPORT_CONTRACT = {
    (1000, 700): {
        "normal": {"sidebar": 380, "cardHeight": 32, "heroHeight": 280, "heroTitle": 24},
        "compact": {"sidebar": 280, "cardHeight": 26, "heroHeight": 210, "heroTitle": 24},
    },
    (1280, 720): {
        "normal": {"sidebar": 380, "cardHeight": 32, "heroHeight": 280, "heroTitle": 39.68},
        "compact": {"sidebar": 320, "cardHeight": 26, "heroHeight": 210, "heroTitle": 32},
    },
    (1920, 1080): {
        "normal": {"sidebar": 380, "cardHeight": 36.719, "heroHeight": 345.594, "heroTitle": 48},
        "compact": {"sidebar": 320, "cardHeight": 28, "heroHeight": 270, "heroTitle": 38},
    },
}

COMMON_CONTRACT = {
    "normal": {
        "workspace": [14, 16, 20],
        "toolstrip": [239, 12, 12],
        "controls": [44, 52, 44, 44],
        "controlFonts": [13, 14, 12, 12],
        "resultsPadding": [12, 18],
        "folder": [17, 31, 3, 16],
        "card": [4, 10, 24, 13, 15.6],
        "hero": [26, 28, 124],
        "details": [46, 14, 16],
    },
    "compact": {
        "workspace": [10, 10, 14],
        "toolstrip": [183, 8, 8],
        "controls": [34, 42, 34, 34],
        "controlFonts": [13, 14, 12, 12],
        "resultsPadding": [8, 10],
        "folder": [14, 25, 1, 13],
        "card": [2, 7, 22, 13, 15.6],
        "hero": [18, 18, 92],
        "details": [40, 8, 12],
    },
}


def rounded(value: float) -> float:
    return round(value, 3)


def metrics(page) -> dict:
    return page.evaluate(
        """() => {
            const read = selector => {
                const element = document.querySelector(selector)
                if (!element) throw new Error(`Missing density element: ${selector}`)
                const style = getComputedStyle(element)
                const box = element.getBoundingClientRect()
                const px = value => Number.parseFloat(value)
                return { style, box, px }
            }
            const workspace = read('.library-sam-workspace')
            const sidebar = read('.library-sam-list-pane')
            const detailsPane = read('.library-sam-details-pane')
            const toolstrip = read('.library-toolstrip')
            const filterButton = read('.library-sidebar-filter-nav .library-sidebar-nav-btn')
            const search = read('.library-sidebar-query-row .search-input')
            const densityButton = read('.library-density-toggle button')
            const sort = read('.library-sort-control select')
            const results = read('.search-results')
            const folderLabel = read('.library-folder-group-label')
            const folderHeader = read('.library-folder-section-header')
            const folderItems = read('.library-folder-section-items')
            const card = read('.repo-card')
            const avatar = read('.repo-card .owner-avatar')
            const repoName = read('.repo-card .repo-name')
            const hero = read('.library-hero')
            const heroCover = read('.library-hero-cover')
            const heroTitle = read('.library-github-header h2')
            const primaryAction = read('.library-ops-action-row .hero-primary-btn')
            const overview = read('.library-inline-overview-grid')
            const inlinePanel = read('.library-inline-panel')

            return {
                sidebar: sidebar.box.width,
                workspace: [workspace.px(workspace.style.gap), detailsPane.px(detailsPane.style.paddingTop), detailsPane.px(detailsPane.style.paddingRight)],
                toolstrip: [toolstrip.box.height, toolstrip.px(toolstrip.style.gap), toolstrip.px(toolstrip.style.paddingTop)],
                controls: [filterButton.box.height, search.box.height, densityButton.box.height, sort.box.height],
                controlFonts: [filterButton.px(filterButton.style.fontSize), search.px(search.style.fontSize), densityButton.px(densityButton.style.fontSize), sort.px(sort.style.fontSize)],
                resultsPadding: [results.px(results.style.paddingRight), results.px(results.style.paddingBottom)],
                folder: [folderLabel.box.height, folderHeader.box.height, folderItems.px(folderItems.style.gap), folderItems.px(folderItems.style.marginLeft)],
                cardHeight: card.box.height,
                card: [card.px(card.style.paddingTop), card.px(card.style.borderRadius), avatar.box.height, repoName.px(repoName.style.fontSize), repoName.px(repoName.style.lineHeight)],
                heroHeight: hero.box.height,
                heroTitle: heroTitle.px(heroTitle.style.fontSize),
                hero: [hero.px(hero.style.gap), hero.px(hero.style.paddingTop), heroCover.box.height],
                details: [primaryAction.box.height, overview.px(overview.style.gap), inlinePanel.px(inlinePanel.style.paddingTop)],
            }
        }"""
    )


def normalize(values: dict) -> dict:
    return {
        key: [rounded(item) for item in value] if isinstance(value, list) else rounded(value)
        for key, value in values.items()
    }


def expected(viewport: tuple[int, int], density: str) -> dict:
    result = dict(COMMON_CONTRACT[density])
    result.update(VIEWPORT_CONTRACT[viewport][density])
    return result


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    theme_contracts: dict[tuple[int, int], dict] = {}

    for theme in THEMES:
        for viewport in VIEWPORTS:
            width, height = viewport
            context = browser.new_context(
                viewport={"width": width, "height": height},
                color_scheme=theme,
                locale="uk-UA",
            )
            page = context.new_page()
            seed_cache(page)
            open_library(page)

            normal = normalize(metrics(page))
            assert normal == expected(viewport, "normal"), {"theme": theme, "viewport": viewport, "normal": normal}

            page.locator(".library-density-toggle button").nth(1).click()
            page.locator(".library-page.library-density-compact").wait_for()
            compact = normalize(metrics(page))
            assert compact == expected(viewport, "compact"), {"theme": theme, "viewport": viewport, "compact": compact}

            current = {"normal": normal, "compact": compact}
            if theme == "dark":
                theme_contracts[viewport] = current
            else:
                assert current == theme_contracts[viewport], {"viewport": viewport, "dark": theme_contracts[viewport], "light": current}
            context.close()

    browser.close()

print("[density] normal/compact geometry, spacing, avatars and typography: ok")
