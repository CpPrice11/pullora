param(
  [string]$Version = "",
  [string]$BuildRoot = "",
  [switch]$SkipArtifacts,
  [switch]$SkipSmokeTest,
  [switch]$RcReadiness,
  [switch]$CheckGitHubRelease,
  [string]$Repository = "CpPrice11/pullora"
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
  throw "[release-check] $Message"
}

function Read-Json($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "File not found: $Path"
  }
  Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Read-Text($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "File not found: $Path"
  }
  Get-Content -LiteralPath $Path -Raw
}

function Assert-Equal($Name, $Actual, $Expected) {
  if ($Actual -ne $Expected) {
    Fail "$Name is '$Actual', expected '$Expected'"
  }
  Write-Host "[ok] $Name = $Actual"
}

function Write-Sha256Manifest($Paths, $Destination) {
  $lines = @($Paths | ForEach-Object {
    $file = Get-Item -LiteralPath $_
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $($file.Name)"
  })
  [System.IO.File]::WriteAllText(
    $Destination,
    (($lines -join "`n") + "`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BuildRoot)) {
  $BuildRoot = Join-Path (Split-Path $root -Parent) "Pullora Builds"
}

Push-Location $root

try {
  $package = Read-Json "package.json"
  if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$package.version
  }
  if ([string]::IsNullOrWhiteSpace($Version)) {
    Fail "Version was not provided and package.json has no version"
  }

  $tag = "v$Version"
  Write-Host "[release-check] Checking Pullora $tag"

  Assert-Equal "package.json version" ([string]$package.version) $Version

  $packageLockText = Read-Text "package-lock.json"
  if ($packageLockText -notmatch '(?m)^\s*"version":\s*"([^"]+)",') {
    Fail "package-lock.json has no root version"
  }
  Assert-Equal "package-lock.json root version" $Matches[1] $Version
  if ($packageLockText -notmatch '(?ms)"packages":\s*\{\s*"":\s*\{.*?"version":\s*"([^"]+)"') {
    Fail "package-lock.json has no root package version"
  }
  Assert-Equal "package-lock package version" $Matches[1] $Version

  $cargoToml = Read-Text "src-tauri\Cargo.toml"
  if ($cargoToml -notmatch '(?m)^version\s*=\s*"([^"]+)"') {
    Fail "src-tauri\Cargo.toml has no package version"
  }
  Assert-Equal "Cargo.toml version" $Matches[1] $Version

  $cargoLock = Read-Text "src-tauri\Cargo.lock"
  if ($cargoLock -notmatch '(?ms)\[\[package\]\]\s+name = "app"\s+version = "([^"]+)"') {
    Fail "src-tauri\Cargo.lock has no app package"
  }
  Assert-Equal "Cargo.lock app version" $Matches[1] $Version

  $tauri = Read-Json "src-tauri\tauri.conf.json"
  Assert-Equal "tauri.conf.json version" ([string]$tauri.version) $Version

  $about = Read-Text "src\pages\AboutPage.tsx"
  if ($about -notmatch "FALLBACK_CURRENT_VERSION\s*=\s*'v$([regex]::Escape($Version))'") {
    Fail "AboutPage fallback is not v$Version"
  }
  Write-Host "[ok] AboutPage fallback = v$Version"

  if ($RcReadiness) {
    $releaseWorkflow = Read-Text ".github\workflows\release.yml"
    $windowsWorkflow = Read-Text ".github\workflows\windows-build.yml"
    $installedStore = Read-Text "src-tauri\src\storage\installed.rs"

    $blockedWorkflowPatterns = @(
      "softprops/action-gh-release",
      "tauri-apps/tauri-action",
      "x64-portable.zip",
      "Compress-Archive",
      "contents: write",
      "windows-latest",
      "node-version: 20",
      "node-version: '20'",
      "actions/checkout@v4",
      "actions/checkout@v5",
      "actions/setup-node@v4"
    )

    foreach ($pattern in $blockedWorkflowPatterns) {
      if ($releaseWorkflow -match [regex]::Escape($pattern)) {
        Fail "release.yml must be verification-only and must not contain '$pattern'"
      }
    }

    if ($releaseWorkflow -notmatch "Assert no MSI or ZIP release assets are produced") {
      Fail "release.yml must assert that MSI/ZIP assets are not produced"
    }
    if ($releaseWorkflow -match "(?m)^\s*runs-on:\s*windows-2025\s*$" -or $windowsWorkflow -match "(?m)^\s*runs-on:\s*windows-2025\s*$") {
      Fail "release workflows must use windows-2025-vs2026 instead of windows-2025"
    }
    if ($releaseWorkflow -notmatch "runs-on:\s*windows-2025-vs2026" -or $windowsWorkflow -notmatch "runs-on:\s*windows-2025-vs2026") {
      Fail "release workflows must pin Windows CI to windows-2025-vs2026"
    }
    if ($releaseWorkflow -notmatch "actions/checkout@v6" -or $windowsWorkflow -notmatch "actions/checkout@v6") {
      Fail "release workflows must use actions/checkout@v6"
    }
    if ($releaseWorkflow -notmatch "actions/setup-node@v6" -or $windowsWorkflow -notmatch "actions/setup-node@v6") {
      Fail "release workflows must use actions/setup-node@v6"
    }
    if ($releaseWorkflow -notmatch "node-version:\s*'24'" -or $windowsWorkflow -notmatch "node-version:\s*24") {
      Fail "release workflows must install Node.js 24"
    }
    if ($windowsWorkflow -notmatch "npm run check:release") {
      Fail "windows-build.yml must run release metadata checks"
    }
    if ($installedStore -notmatch "fn migrate_store") {
      Fail "installed store migration helper is missing"
    }
    if ($installedStore -notmatch "asset_name\.is_none" -or $installedStore -notmatch "install_kind\.is_none") {
      Fail "installed store migration must backfill asset_name and install_kind"
    }
    Write-Host "[ok] RC readiness checks passed"
  }

  if (-not $SkipArtifacts) {
    $buildDir = Join-Path $BuildRoot $Version
    if (-not (Test-Path -LiteralPath $buildDir)) {
      Fail "Build artifacts folder not found: $buildDir"
    }

    $portableName = "Pullora_${Version}_portable_x64.exe"
    $setupName = "Pullora_${Version}_x64-setup.exe"
    $portablePath = Join-Path $buildDir $portableName
    $setupPath = Join-Path $buildDir $setupName
    $checksumName = "SHA256SUMS.txt"
    $checksumPath = Join-Path $buildDir $checksumName

    if (-not (Test-Path -LiteralPath $portablePath)) {
      Fail "Portable EXE not found: $portablePath"
    }
    if (-not (Test-Path -LiteralPath $setupPath)) {
      Fail "Setup EXE not found: $setupPath"
    }

    Write-Sha256Manifest @($portablePath, $setupPath) $checksumPath
    Write-Host "[ok] SHA-256 manifest: $checksumName"

    $files = @(Get-ChildItem -LiteralPath $buildDir -File)
    $assetNames = @($files | ForEach-Object { $_.Name })
    $expectedNames = @($portableName, $setupName, $checksumName)
    $unexpected = @($assetNames | Where-Object { $_ -notin $expectedNames })
    if ($files.Count -ne 3 -or $unexpected.Count -gt 0) {
      Fail "Build folder must contain portable EXE, setup EXE, and SHA256SUMS.txt. Found: $($assetNames -join ', ')"
    }

    $blocked = @($files | Where-Object { $_.Extension -match '^\.(msi|zip)$' })
    if ($blocked.Count -gt 0) {
      Fail "MSI/ZIP artifacts are not allowed: $($blocked.Name -join ', ')"
    }

    Write-Host "[ok] Build artifacts: $($assetNames -join ', ')"

    if (-not $SkipSmokeTest) {
      Write-Host "[release-check] Smoke-testing portable EXE..."
      $smokeDir = Join-Path ([System.IO.Path]::GetTempPath()) "pullora-smoke-$([guid]::NewGuid().ToString('N'))"
      $smokePath = Join-Path $smokeDir $portableName
      $proc = $null
      try {
        New-Item -ItemType Directory -Path $smokeDir | Out-Null
        Copy-Item -LiteralPath $portablePath -Destination $smokePath
        $proc = Start-Process -FilePath $smokePath -PassThru -WindowStyle Hidden
        Start-Sleep -Seconds 6
        if ($proc.HasExited) {
          Fail "Portable EXE exited during smoke-test with code $($proc.ExitCode)"
        }
        Write-Host "[ok] Smoke-test portable EXE: Running"
      } finally {
        if ($proc -and -not $proc.HasExited) {
          Stop-Process -Id $proc.Id -Force
          $proc.WaitForExit()
        }
        if (Test-Path -LiteralPath $smokeDir) {
          Remove-Item -LiteralPath $smokeDir -Recurse -Force
        }
      }
    }
  }

  if ($CheckGitHubRelease) {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
      Fail "gh CLI was not found, cannot check GitHub release"
    }

    $json = gh release view $tag --repo $Repository --json assets,tagName | ConvertFrom-Json
    Assert-Equal "GitHub release tag" ([string]$json.tagName) $tag

    $releaseAssets = @($json.assets | ForEach-Object { $_.name })
    $expectedReleaseAssets = @(
      "Pullora_${Version}_portable_x64.exe",
      "Pullora_${Version}_x64-setup.exe",
      "SHA256SUMS.txt"
    )
    $unexpectedReleaseAssets = @($releaseAssets | Where-Object { $_ -notin $expectedReleaseAssets })
    if ($releaseAssets.Count -ne 3 -or $unexpectedReleaseAssets.Count -gt 0) {
      Fail "GitHub release must contain portable EXE, setup EXE, and SHA256SUMS.txt. Found: $($releaseAssets -join ', ')"
    }
    Write-Host "[ok] GitHub release assets: $($releaseAssets -join ', ')"
  }

  Write-Host "[release-check] Done: $tag"
} finally {
  Pop-Location
}
