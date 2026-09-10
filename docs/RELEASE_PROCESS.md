# Процес релізу Pullora

Pullora випускається лише для Windows. GitHub Release містить portable EXE, setup EXE, підпис Tauri updater, `SHA256SUMS.txt` і `latest.json`.

## Політика підпису й перевірки

- Публічні EXE не мають Authenticode-підпису.
- Встановлена Pullora приймає оновлення лише з чинним підписом Tauri updater.
- Portable-версія не замінює власний EXE й відкриває офіційний GitHub Release.
- Release gate перевіряє точний набір артефактів, SHA-256 обох EXE та непорожній updater-підпис.
- GitHub Actions сканує EXE через Microsoft Defender, коли він доступний на runner. Виявлення або карантин зупиняє публікацію.
- Виключення антивіруса й вимкнення Windows Security не входять до процесу релізу.

Unsigned-файл може отримати попередження SmartScreen або блокування Smart App Control. SHA-256 підтверджує цілісність завантаження, але не створює репутацію видавця.

## Перевірки перед релізом

- Закрити roadmap-пункти версії.
- Звірити версію в `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` та fallback в `AboutPage`.
- Переконатися, що Library та install metadata залишаються локальними.
- Переконатися, що GitHub repository secret `TAURI_SIGNING_PRIVATE_KEY` містить первинний updater-ключ.
- У release-папці мають бути лише п'ять дозволених артефактів.

## Локальні перевірки

```powershell
npm ci
npm run build
npm run check:release -- -Version <version> -SkipArtifacts -SkipSmokeTest -RcReadiness
```

Rust/Tauri перевіряються в GitHub Actions, оскільки Smart App Control на основній машині блокує локальний Rust toolchain. Захист заради збірки не вимикати.

## Публікація

```powershell
git tag v<version>
git push origin main
git push origin v<version>
```

Push тега запускає `.github/workflows/release.yml`. Workflow виконує frontend, Rust tests, Tauri build, збирає п'ять артефактів, перевіряє їх, за можливості сканує EXE Microsoft Defender, публікує GitHub Release і повторно звіряє завантажені SHA-256.

## Імена артефактів

- `Pullora_<version>_portable_x64.exe`
- `Pullora_<version>_x64-setup.exe`
- `Pullora_<version>_x64-setup.exe.sig`
- `SHA256SUMS.txt`
- `latest.json`

MSI, ZIP та артефакти інших платформ не входять у release-policy. Приватний updater-ключ не зберігається в репозиторії й не є Authenticode certificate. Його втрата унеможливить оновлення вже встановлених копій через вбудований updater.
