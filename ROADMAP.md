# Air Launcher Roadmap

Air Launcher is a fast, polished desktop launcher for applications published in the owner's public GitHub repositories. The current recommended stack is Tauri + Rust for the desktop/backend layer and React + TypeScript for the UI.

The project should not be rewritten to another language unless the product goals change significantly. Tauri keeps the app lightweight and fast, while React gives enough flexibility to build a polished launcher interface.

## Product Direction

- Show only the owner's public GitHub repositories.
- Prefer repositories that have GitHub Releases.
- Download release assets, install them locally, and launch installed apps.
- Keep the UI fast, beautiful, and focused on a library/launcher experience.
- Avoid GitHub OAuth or private repository access for the first version.

## Release Asset Policy

Every public Air Launcher release should keep the manual asset list small and predictable:

- Keep one portable EXE named like `Air.Launcher_<version>_portable_x64.exe`.
- Keep one setup installer named like `Air.Launcher_<version>_x64-setup.exe`.
- Do not upload MSI when setup EXE is present.
- Do not upload a portable ZIP unless it contains more than the single portable EXE.
- Self-update must choose only portable EXE or portable ZIP assets and must ignore setup, installer, and MSI assets.
- GitHub-generated source archives are expected and do not count as launcher install assets.

This keeps safe update behavior deterministic and makes the download choice obvious for users.

## Release 0.2.0: Fluent Design

Goal: ship a focused design/UX release with Figma as the source of truth before code changes.

Figma source of truth:

- Create or update `Air Launcher Fluent Redesign` in Figma before implementing UI changes.
- Cover the five main screens: Library, Installed, Favorites, Settings, and About.
- Include light, dark, and auto-theme examples.
- Include key states: loading, empty, error, hover, selected, active version, update available, and rollback/update.
- Do not use Canva for app UI design; Figma is the UI/layout/spec artifact.

UI direction:

- Keep a practical Windows 11 Fluent style: Segoe UI, compact layout, mica-like surfaces, calm borders, 8px controls, 12px panels.
- Header contains only the logo, `Air Launcher`, and the update/check action.
- Sidebar uses icon + label navigation without explanatory subtitles.
- Library keeps update discovery inside the existing Library filter; do not restore a separate Updates sidebar page.
- Repository cards should feel closer to a Windows app list: compact metadata, clear status chips, and stronger primary actions.

UX polishing:

- GitHub errors show a short reason and one clear retry action.
- Empty Library and no-release states should feel intentional, not broken.
- Settings keeps autosave, visible saving/saved/error status, and no save button.
- About focuses on current launcher version, launcher releases, active state, update, rollback, and retry.
- Add lightweight micro-interactions for navigation, cards, modals, banners, and theme changes while respecting `prefers-reduced-motion`.

Implementation notes:

- Keep the current Tauri + Rust + React + TypeScript stack.
- Do not add a heavy UI framework.
- Do not change GitHub owner/public repository logic, install/update backend, self-update backend, or release behavior for this design release unless a user-facing message needs to be shortened.
- Main code work should stay around CSS tokens, layout/sidebar/header styles, repository cards, segmented controls, settings panels, about release rows, and modal styling.
- Bump the app version to `0.2.0` only after the Figma design is approved, implemented, verified, and a Windows EXE is built.

Release checklist:

- Figma visual review: Library, Library empty/error/loading, Installed, Favorites, Settings light/dark/auto, About launcher versions.
- Code checks: `npx tsc --noEmit`, production frontend build outside Git, `cargo check` with external `cargo-target`, Tauri EXE build, EXE smoke-test.
- Visual QA: light theme, dark theme, auto theme, `1000x700` minimum desktop window, wide desktop viewport, no overlapping text in buttons/cards/sidebar.

## UI/UX Roadmap To 1.0.0

Goal: make Air Launcher feel like a stable Windows 11 desktop launcher, not a development utility. The path to `1.0.0` is UI-led but keeps the current Tauri + Rust + React stack and the public-repository-only product model.

### 0.2.11: Live Refresh Polish

- `Бібліотека -> Оновити` refreshes GitHub repositories, installed app statuses, latest versions, and update badges as one predictable manual action.
- `About -> Версії лаунчера -> Оновити` always clears GitHub cache and reloads launcher releases.
- Refresh actions show clear states: `Оновлюємо...`, `Оновлено о ...`, and `Помилка оновлення`.
- After install/update/rollback, affected lists should update without requiring a tab restart.

### 0.3.0: App Cards Redesign

- Redesign Library and Installed cards into one compact Windows app-list pattern.
- Each card shows name, owner/repo, active/latest version, status, and one primary action.
- Statuses must be unambiguous: available, installed, update available, repair needed, downloading.
- Verify long names and version tags at `1000x700` and wide desktop sizes.

Status: implemented in `0.3.0`.

### 0.4.0: Release Selector UX

- Redesign release selection around version status and asset clarity.
- Show assets as human-readable types: portable, setup, archive, unsupported.
- Explain which asset will be installed before download starts.
- Show download, extract/install, success, retry, and cancel states consistently.

Status: implemented in `0.4.0`.

### 0.5.0: Settings Cleanup

- Reorganize Settings into folders, GitHub, updates, appearance, language, and reset.
- Keep autosave visible with saving/saved/error states and no save button.
- Add an install-folder validation action with OK, inaccessible, and no-write-permission states.
- Theme and language changes apply immediately.

Status: implemented in `0.5.0`.

### 0.6.0: About / Self Update Final UX

- Keep About focused on current launcher version and launcher release actions.
- Show current, newer, older, and portable-unavailable states clearly.
- Replace browser confirm with a proper confirmation modal before self-update or rollback.
- Failed self-update should show recovery guidance.

Status: implemented in `0.6.0`.

### 0.7.0: Empty / Error / Loading States

- Unify empty states for Library, Installed, Favorites, and About releases.
- Unify error banners around short reason, one primary action, and optional details.
- Use skeleton cards for Library/Installed and reserve spinners for short inline actions.

Status: implemented in `0.7.0`.

### 0.8.0: Navigation And Motion

- Finish Fluent navigation with compact sidebar, active indicator, hover/press states, and visible keyboard focus.
- Add microanimations for page transitions, cards, modals, banners, and theme changes.
- Respect `prefers-reduced-motion`.

Status: implemented in `0.8.0`.

### 0.9.0: Visual QA And Accessibility Pass

- Ensure all buttons have accessible labels and keyboard focus is visible.
- Verify contrast in light, dark, and auto themes.
- QA Ukrainian and English text, long repo names, long version tags, `1000x700`, and wide desktop.
- Remove duplicated controls, dead CSS, unnecessary helper text, and noisy badges.

Status: implemented in `0.9.0`.

### 1.0.0: Stable UI Release

- Freeze the UI contracts: one Library refresh, About owns launcher versions, install/update/repair/rollback use consistent language and states.
- Update README screenshots and user instructions.
- Add a short UI acceptance checklist to this roadmap.
- Ship only the portable EXE and one setup EXE release asset.

Status: implemented in `1.0.0`.

UI acceptance checklist:

- Library has one manual refresh action; updates remain a Library filter, not a separate sidebar page.
- About owns launcher versions, portable self-update, rollback, refresh, and recovery guidance.
- Install, update, repair, rollback, and launch errors use consistent Ukrainian/English state language.
- Settings autosave without a save button and never reset values when switching pages.
- Light, dark, and auto themes apply immediately.
- Ukrainian and English UI fit at `1000x700` and wide desktop sizes.
- Long repository names and long version tags wrap or truncate without overlapping controls.
- Keyboard focus is visible on primary actions, navigation, release rows, and cards.
- Release assets remain limited to portable EXE plus one setup EXE.

## Progress Log

Completed:

- Added this roadmap file.
- Added `githubOwner` to app settings.
- Added a Tauri command for loading public repositories from a configured owner.
- Added owner repository caching in the GitHub API cache.
- Reworked the first tab from generic GitHub Search into a Library view.
- Library now loads release-ready public repositories for the configured owner.
- Added local filtering and refresh for the Library view.
- Added installed status to Library repository cards.
- Added direct Launch action for installed apps from Library.
- Added install completion refresh so Library status updates after a download completes.
- Improved release asset preference to choose portable `.zip` files before direct `.exe` and `.msi` assets on Windows.
- Cleaned mojibake from the install and installed-app UI controls touched by this flow.
- Added update-aware Library badges by comparing installed active versions with latest GitHub releases.
- Extracted installed/update status into a shared Library status hook.
- Added Library filters for all, installed, updates, and available apps.
- Added Library sorting by recent updates, status, and name.
- Added real download cancellation so canceled downloads cannot finish installing in the background.
- Added partial install directories and backup/restore replacement for safe retries.
- Hardened ZIP and TAR extraction against unsafe archive paths.
- Added local logs for install and launch events in the app config directory.
- Improved launch failure messages with recovery guidance.
- Verified TypeScript, frontend production build, Rust check, and Tauri production build.
- Built a Windows production executable outside the Git folder:
  `C:\Users\sasha\OneDrive\Документи\Projects\Air Launcher Local Build\Air Launcher.exe`.
- Confirmed the generated executable starts without immediately crashing.

Current next step:

- Prepare a clean GitHub release flow: fix GitHub authentication, commit current changes, push the branch, and decide whether the first public artifact should be a portable EXE, installer, or both.

## MVP

The first useful version should support:

- Configure a GitHub username/owner in Settings.
- Fetch public repositories for that owner.
- Show repositories that have releases.
- Show latest release version, description, date, and downloadable assets.
- Install `.zip` or `.exe` assets from the latest release.
- Track installed applications locally.
- Run installed applications.
- Detect when a newer release is available.

## Phase 1: Product Core

Goal: the launcher shows the owner's public GitHub projects and understands release metadata.

- Add or verify GitHub owner configuration in Settings.
- Fetch public repositories for the configured owner.
- Filter repositories to projects that have releases.
- Optionally support a GitHub topic filter, such as `air-launcher`.
- Load latest release data for each supported repository.
- Display repository name, description, latest version, release date, and platform assets.
- Cache GitHub data locally so the app opens quickly.
- Refresh GitHub data in the background after startup.

## Phase 2: Install And Launch

Goal: users can install, update, and launch apps from release assets.

- Choose a default installation directory.
- Download selected release assets.
- Show reliable download progress.
- Support `.zip` extraction.
- Support direct `.exe` installation/copying.
- Detect the primary executable after extraction.
- Store installed app metadata locally.
- Add actions for `Install`, `Run`, `Update`, `Open Folder`, and `Uninstall`.
- Compare installed version with the latest release version.

## Phase 3: UI And UX Redesign

Goal: the launcher feels like a polished product, not a raw GitHub browser.

- Make the main screen a library of available applications.
- Use a clear sidebar: Library, Installed, Updates, Settings.
- Create application cards with useful statuses:
  - Not installed
  - Installed
  - Update available
  - Downloading
  - Ready
- Add search.
- Add filters for installed apps, available updates, and supported assets.
- Add sorting by latest update, installed first, name, and release status.
- Use a refined dark theme as the default.
- Add lightweight interaction states and transitions.
- Design useful empty states for no releases, no installed apps, and GitHub errors.

## Phase 4: Performance

Goal: startup and navigation should feel instant.

- Render cached data first.
- Refresh network data in the background.
- Avoid blocking the UI during downloads, extraction, and app launch.
- Limit parallel GitHub requests.
- Debounce search input.
- Keep React state focused and avoid unnecessary re-renders.
- Load detailed release asset data only when needed.

## Phase 5: Reliability

Goal: the launcher handles common failure cases gracefully.

- Handle GitHub rate limits.
- Handle missing releases and missing assets.
- Retry failed downloads where safe.
- Detect and clean up incomplete installations.
- Prevent launching the wrong executable after extraction.
- Add safe uninstall behavior.
- Add local error logs.
- Show clear user-facing error messages.

## Phase 6: Release System

Goal: Air Launcher itself can be built and released cleanly.

- Verify `tauri build` production output.
- Add GitHub Actions for Windows builds.
- Produce a release installer or executable.
- Add versioning rules.
- Add optional self-update support later.
- Create a README explaining how a repository should be structured to appear in Air Launcher.

## Next Recommended Work

Start with Phase 1 and Phase 2 before major visual polish:

1. Verify the current GitHub service and Rust commands.
2. Make Settings save a GitHub owner.
3. Fetch only that owner's public repositories.
4. Filter to repositories with releases.
5. Build a clean Library page from cached data.
6. Implement install/run/update for latest release assets.

Once the install/run flow works, move to the UI redesign. A beautiful launcher is worth polishing only after the core loop is dependable.
