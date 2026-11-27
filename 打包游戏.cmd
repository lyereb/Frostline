@echo off
setlocal DisableDelayedExpansion
set "WHACK_PACK_CONFIG=public\sdk.config.json"
set "WHACK_PACK_SOURCE=dist"
set "WHACK_PACK_ARCHIVE=release\Game.zip"

set "WHACK_PACK_SELF=%~f0"
set "result=1"
pushd "%~dp0" || goto end

rem Build with the project dependencies and the npm bundled with Node.js.
call npm.cmd run build || goto done

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -Command "$parts = [IO.File]::ReadAllText($env:WHACK_PACK_SELF) -split '(?m)^:PACK_SCRIPT\r?$', 2; & ([scriptblock]::Create($parts[1]))"
set "result=%errorlevel%"

:done
popd
:end
if /i not "%~1"=="--no-pause" pause
exit /b %result%

:PACK_SCRIPT
$ErrorActionPreference = 'Stop'

function Publish-File([string] $pending, [string] $destination) {
    if ([IO.File]::Exists($destination)) {
        [IO.File]::Replace($pending, $destination, [NullString]::Value)
    } else {
        [IO.File]::Move($pending, $destination)
    }
}

try {
    $configPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($env:WHACK_PACK_CONFIG)
    $source = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($env:WHACK_PACK_SOURCE)
    $archive = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($env:WHACK_PACK_ARCHIVE)
    if (-not [IO.File]::Exists((Join-Path $source 'index.html'))) {
        throw "The release directory must contain index.html: $source"
    }
    $prefix = $source.TrimEnd([char]'\') + '\'
    if ([IO.Path]::GetExtension($archive) -ne '.zip' -or
        $archive.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The output must be a .zip file outside the release directory.'
    }
    if ([IO.Directory]::Exists($archive)) {
        throw "A directory is blocking the output ZIP: $archive"
    }

    $rawConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
    $config = $rawConfig | ConvertFrom-Json
    if ($config -isnot [PSCustomObject] -or -not $rawConfig.TrimStart().StartsWith('{')) {
        throw "The SDK configuration must be a JSON object: $configPath"
    }
    $version = '1.00'
    if ($null -ne $config.PSObject.Properties['version']) {
        $version = $config.version
    }
    if ($version -isnot [string] -or [string]::IsNullOrWhiteSpace($version)) {
        throw "Set a non-empty version string in $configPath"
    }
    $versionJson = (ConvertTo-Json -InputObject @{ version = $version.Trim() } -Compress) + [Environment]::NewLine

    Add-Type -AssemblyName 'System.IO.Compression', 'System.IO.Compression.FileSystem'
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($archive))
    $versionFile = Join-Path $source 'version.json'
    $stamp = [Guid]::NewGuid().ToString('N')
    $pendingZip = "$archive.$stamp.tmp"
    $pendingVersion = "$versionFile.$stamp.tmp"
    $utf8 = [Text.UTF8Encoding]::new($false)

    try {
        $zip = [IO.Compression.ZipFile]::Open($pendingZip, [IO.Compression.ZipArchiveMode]::Create)
        try {
            Get-ChildItem -LiteralPath $source -Recurse -File -Force | ForEach-Object {
                $entry = $_.FullName.Substring($prefix.Length).Replace('\', '/')
                if ($entry -ne 'version.json') {
                    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                        $zip, $_.FullName, $entry, [IO.Compression.CompressionLevel]::Optimal)
                }
            }
            $writer = [IO.StreamWriter]::new($zip.CreateEntry('version.json').Open(), $utf8)
            try { $writer.Write($versionJson) } finally { $writer.Dispose() }
        } finally {
            $zip.Dispose()
        }
        [IO.File]::WriteAllText($pendingVersion, $versionJson, $utf8)
        Publish-File $pendingVersion $versionFile
        Publish-File $pendingZip $archive
    } finally {
        [IO.File]::Delete($pendingZip)
        [IO.File]::Delete($pendingVersion)
    }
    Write-Output "Version $($version.Trim())"
    Write-Output "Package ready at $archive"
} catch {
    [Console]::Error.WriteLine("Packaging failed: $($_.Exception.Message)")
    exit 1
}
