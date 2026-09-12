param(
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$server = Start-Process -FilePath 'node' -ArgumentList @(
  'node_modules/vite/bin/vite.js',
  'preview',
  '--host',
  '127.0.0.1',
  '--port',
  $Port
) -PassThru -WindowStyle Hidden

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {}
    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) {
    throw "Vite preview did not start on port $Port"
  }

  $env:PULLORA_TEST_BASE_URL = "http://127.0.0.1:$Port"
  python scripts/check-rendered-contrast.py
  if ($LASTEXITCODE -ne 0) {
    throw 'Rendered contrast verification failed'
  }
} finally {
  if (-not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}
