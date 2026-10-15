param(
  [string]$TvIp = "192.168.100.15",
  [string]$Profile = "CCLOUD"
)

$ErrorActionPreference = "Stop"

$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
$sdb = "C:\tizen-studio\tools\sdb.exe"
$appId = "SiNamaTV01.SiNamaTV"
$targetSerial = "${TvIp}:26101"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "=== 1. Building web app ===" -ForegroundColor Cyan
Push-Location $projectRoot
try {
  npm run build
} finally {
  Pop-Location
}

Write-Host "=== 2. Packaging and signing with profile '$Profile' ===" -ForegroundColor Cyan
$outDir = Join-Path $projectRoot "build-wgt"
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path $outDir | Out-Null

$distDir = Join-Path $projectRoot "dist"
& $tizen package -t wgt -s $Profile -- $distDir -o $outDir

$wgt = Get-ChildItem -Path $outDir -Filter "*.wgt" | Select-Object -First 1
if (-not $wgt) {
  Write-Error "Failed to generate .wgt package"
  exit 1
}

# Rename to clean ASCII name without spaces
$cleanWgtPath = Join-Path $outDir "ccloud-tv.wgt"
if ($wgt.FullName -ne $cleanWgtPath) {
  Move-Item $wgt.FullName $cleanWgtPath -Force
}

Write-Host "WGT Package: $cleanWgtPath" -ForegroundColor Green

Write-Host "=== 3. Connecting to TV ($targetSerial) ===" -ForegroundColor Cyan
& $sdb connect $targetSerial

Write-Host "=== 4. Installing on TV ===" -ForegroundColor Cyan
& $tizen install -s $targetSerial -n "ccloud-tv.wgt" -- $outDir

Write-Host "=== 5. Launching app on TV ===" -ForegroundColor Cyan
& $sdb -s $targetSerial shell 0 was_execute $appId

Write-Host "Successfully installed and launched CCloud TV!" -ForegroundColor Green
