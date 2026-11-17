$ErrorActionPreference = 'Stop'

$candidates = New-Object 'System.Collections.Generic.List[string]'
$seen = @{}
$debug = $env:RESOLVE_NODE_DEBUG -eq '1'

function Add-Candidate {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }

    $expanded = [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))
    $key = $expanded.ToLowerInvariant()
    if ($seen.ContainsKey($key)) {
        return
    }

    $seen[$key] = $true
    [void]$candidates.Add($expanded)
}

function Get-VersionKey {
    param([string]$Name)

    $raw = $Name -replace '^[vV]', ''
    $raw = ($raw -split '[-+]', 2)[0]
    try {
        return [version]$raw
    } catch {
        return [version]'0.0.0'
    }
}

function Add-VersionRoot {
    param([string]$Root)

    if ([string]::IsNullOrWhiteSpace($Root) -or -not (Test-Path -LiteralPath $Root -PathType Container)) {
        return
    }

    $versions = Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^[vV]?\d+(\.\d+){1,2}([-+].*)?$' } |
        Sort-Object `
            @{ Expression = { Get-VersionKey $_.Name }; Descending = $true }, `
            @{ Expression = { $_.LastWriteTimeUtc }; Descending = $true }

    foreach ($version in $versions) {
        Add-Candidate (Join-Path $version.FullName 'node.exe')
        Add-Candidate (Join-Path $version.FullName 'installation\node.exe')
    }
}

function Get-ToolHome {
    param([string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and $command.Source) {
        return Split-Path -Parent $command.Source
    }
    return $null
}

function Add-NvmHome {
    param([string]$Root)

    if ([string]::IsNullOrWhiteSpace($Root)) {
        return
    }

    Add-Candidate (Join-Path $Root 'node.exe')
    Add-VersionRoot $Root

    $settings = Join-Path $Root 'settings.txt'
    if (-not (Test-Path -LiteralPath $settings -PathType Leaf)) {
        return
    }

    try {
        foreach ($line in Get-Content -LiteralPath $settings -ErrorAction Stop) {
            if ($line -match '^\s*root\s*:\s*(.+?)\s*$') {
                Add-VersionRoot $Matches[1]
            } elseif ($line -match '^\s*path\s*:\s*(.+?)\s*$') {
                Add-Candidate (Join-Path $Matches[1] 'node.exe')
            }
        }
    } catch {
        # Ignore malformed third-party version manager settings.
    }
}

# Respect a Node already selected by the current terminal.
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nodeCommand -and $nodeCommand.Source) {
    Add-Candidate $nodeCommand.Source
}

# fnm: the default alias is useful, but an installed newer runtime is preferred.
if ($env:FNM_MULTISHELL_PATH) {
    Add-Candidate (Join-Path $env:FNM_MULTISHELL_PATH 'node.exe')
}
$fnmHomes = @()
if ($env:FNM_DIR) {
    $fnmHomes += $env:FNM_DIR
}
$fnmHome = Get-ToolHome 'fnm.exe'
if ($fnmHome) {
    $fnmHomes += $fnmHome
}
foreach ($toolHome in ($fnmHomes | Select-Object -Unique)) {
    Add-VersionRoot (Join-Path $toolHome 'node-versions')
    Add-Candidate (Join-Path $toolHome 'aliases\default\node.exe')
}

# nvm-windows and the legacy nvm-for-windows layout.
$nvmHomes = @()
if ($env:NVM_HOME) {
    $nvmHomes += $env:NVM_HOME
}
$nvmHome = Get-ToolHome 'nvm.exe'
if ($nvmHome) {
    $nvmHomes += $nvmHome
}
if ($env:APPDATA) {
    $nvmHomes += (Join-Path $env:APPDATA 'nvm')
}
foreach ($toolHome in ($nvmHomes | Select-Object -Unique)) {
    Add-NvmHome $toolHome
}
if ($env:NVM_SYMLINK) {
    Add-Candidate (Join-Path $env:NVM_SYMLINK 'node.exe')
}

# Codex/WorkBuddy managed runtimes. Version directory names may include a suffix.
if ($env:USERPROFILE) {
    Add-VersionRoot (Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions')
}

# Common standalone installations and other version managers.
foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, ${env:ProgramW6432})) {
    if ($root) {
        Add-Candidate (Join-Path $root 'nodejs\node.exe')
    }
}
if ($env:LOCALAPPDATA) {
    Add-Candidate (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    Add-Candidate (Join-Path $env:LOCALAPPDATA 'Volta\bin\node.exe')
}
if ($env:USERPROFILE) {
    Add-Candidate (Join-Path $env:USERPROFILE '.volta\bin\node.exe')
}

$fallback = $null
foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        if ($debug) { [Console]::Error.WriteLine("skip missing: $candidate") }
        continue
    }

    try {
        $rawVersion = [string](& $candidate -p "process.versions.node" 2>$null)
        $rawVersion = $rawVersion.Trim()
        if ($LASTEXITCODE -ne 0 -or -not $rawVersion) {
            if ($debug) { [Console]::Error.WriteLine("skip failed: $candidate") }
            continue
        }
        $version = [version]$rawVersion
    } catch {
        if ($debug) { [Console]::Error.WriteLine("skip error: $candidate ($($_.Exception.Message))") }
        continue
    }

    if ($debug) { [Console]::Error.WriteLine("candidate: $candidate ($version)") }

    # pnpm 11 requires Node >= 22.13, while the project itself supports >= 20.
    if ($version -ge [version]'22.13.0') {
        Write-Output $candidate
        exit 0
    }
    if (-not $fallback -and $version -ge [version]'20.0.0') {
        $fallback = $candidate
    }
}

if ($fallback) {
    Write-Output $fallback
    exit 0
}

exit 1
