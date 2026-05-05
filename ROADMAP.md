# Air Launcher Roadmap

Air Launcher is a fast, polished desktop launcher for applications published in the owner's public GitHub repositories. The current recommended stack is Tauri + Rust for the desktop/backend layer and React + TypeScript for the UI.

The project should not be rewritten to another language unless the product goals change significantly. Tauri keeps the app lightweight and fast, while React gives enough flexibility to build a polished launcher interface.

## Product Direction

- Show only the owner's public GitHub repositories.
- Prefer repositories that have GitHub Releases.
- Download release assets, install them locally, and launch installed apps.
- Keep the UI fast, beautiful, and focused on a library/launcher experience.
- Avoid GitHub OAuth or private repository access for the first version.

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
