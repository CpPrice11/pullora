# Процес релізу Pullora

Pullora випускається лише для Windows. GitHub Release містить portable EXE, setup EXE, підпис updater, `SHA256SUMS.txt` і `latest.json`.

## Перевірки перед релізом

- Закрити разом усі roadmap-пункти з однаковою версією.
- Звірити версію в `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` та fallback в `AboutPage`.
- Переконатися, що Library та install metadata залишаються локальними.
- У release-папці мають бути тільки portable EXE, setup EXE, підпис updater, `SHA256SUMS.txt` і `latest.json`.

## Команди

```powershell
npm run build
cd src-tauri
cargo check
cd ..
npm run check:release -- -Version <version> -SkipArtifacts -SkipSmokeTest -RcReadiness
$env:CI = "true"
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$env:USERPROFILE\.tauri\pullora-updater.key"
npm run tauri-build -- --config src-tauri/tauri.release.conf.json
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PATH
Remove-Item Env:CI
```

Після перенесення EXE у `Pullora Builds\<version>`:

```powershell
npm run check:release -- -Version <version>
npm run check:release -- -Version <version> -SkipSmokeTest -CheckGitHubRelease
```

`check:release` створює `SHA256SUMS.txt` для обох EXE та `latest.json` для встановленої Pullora. Portable-збірка звіряє GitHub-репозиторій, тег, ім’я asset, SHA-256 і тип файла, а потім повторно перевіряє SHA-256 безпосередньо перед і після заміни поточного EXE. Встановлена Pullora перевіряє криптографічний підпис setup-пакета через офіційний Tauri updater і оновлює компоненти у пасивному режимі.

Приватний updater-ключ зберігається поза репозиторієм у `%USERPROFILE%\.tauri\pullora-updater.key`. У GitHub Actions його вміст має бути записаний у secret `TAURI_SIGNING_PRIVATE_KEY`. Втрата ключа унеможливить оновлення вже встановлених копій через вбудований updater.

## Імена артефактів

- `Pullora_<version>_portable_x64.exe`
- `Pullora_<version>_x64-setup.exe`
- `Pullora_<version>_x64-setup.exe.sig`
- `SHA256SUMS.txt`
- `latest.json`

MSI, ZIP та артефакти інших платформ не входять у поточну release-policy. Portable-самоновлення вимкнене без `SHA256SUMS.txt`, а встановлене — без підписаного setup-пакета та `latest.json`.
