# Build popup.js automatically when any popup/*.js file changes (except popup.js itself)
# Requires: Node.js

# This script uses PowerShell's FileSystemWatcher to monitor changes and runs the build script

# USAGE: powershell -ExecutionPolicy Bypass -File watch-popup.ps1

$popupDir = Join-Path $PSScriptRoot 'popup'
$buildScript = Join-Path $PSScriptRoot 'build-popup.js'
$lastTimes = @{}

Write-Host "Watching $popupDir for changes. Press Ctrl+C to stop."

while ($true) {
    $files = Get-ChildItem $popupDir -Filter *.js | Where-Object { $_.Name -ne 'popup.js' }
    foreach ($file in $files) {
        if (-not $lastTimes.ContainsKey($file.FullName) -or $lastTimes[$file.FullName] -ne $file.LastWriteTime) {
            $lastTimes[$file.FullName] = $file.LastWriteTime
            Write-Host "Detected change in $($file.Name), rebuilding popup.js..."
            node $buildScript
        }
    }
    Start-Sleep -Milliseconds 500
}