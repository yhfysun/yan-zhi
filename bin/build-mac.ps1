﻿﻿param(
  [switch]$NoTrigger
)
$ErrorActionPreference = 'Stop'
$repo = 'yhfysun/yan-zhi'
$branch = 'dev0.1'
$wf = 'build-desktop.yml'
$outDir = Join-Path $PSScriptRoot '..\dist-download'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# 拿 token（复用 git 凭据）
$cred = "protocol=https`nhost=github.com`n" | git credential fill 2>$null
$t = (($cred | Select-String "^password=").ToString() -replace "^password=","")
if (-not $t) { Write-Output "无法获取 GitHub token"; exit 1 }
$headers = @{ Authorization = "Bearer $t"; Accept = "application/vnd.github+json" }

if (-not $NoTrigger) {
  Write-Output "触发 $wf @ $branch ..."
  $body = @{ ref = $branch } | ConvertTo-Json
  Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/workflows/$wf/dispatches" -Method Post -Headers $headers -Body $body -ContentType "application/json"
  Write-Output "已触发，等待 run 出现..."
  Start-Sleep 8
}

# 取最新 run
$run = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/runs?branch=$branch&per_page=1" -Headers $headers).workflow_runs[0]
$runId = $run.id
Write-Output "最新 run: $runId  状态: $($run.status)"

# 轮询直到完成
while ($run.status -ne 'completed') {
  Start-Sleep 15
  $run = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/runs/$runId" -Headers $headers)
  Write-Output "  状态: $($run.status) / $($run.conclusion)"
}
if ($run.conclusion -ne 'success') { Write-Output "构建失败: $($run.conclusion)"; exit 1 }

# 找 macOS-DMG artifact
$arts = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/actions/runs/$runId/artifacts" -Headers $headers).artifacts
$mac = $arts | Where-Object { $_.name -eq 'macOS-DMG' }
if (-not $mac) { Write-Output "未找到 macOS-DMG artifact，可用产物: $($arts.name -join ', ')"; exit 1 }
Write-Output "找到 macOS-DMG ($([math]::Round($mac.size_in_bytes/1MB,1)) MB)，获取下载 URL..."

# 代理拿重定向 URL（api.github.com 走系统代理），直连 CDN 下载
$resp = Invoke-WebRequest -Uri $mac.archive_download_url -Headers $headers -MaximumRedirection 0 -ErrorAction SilentlyContinue -UseBasicParsing
$cdn = $resp.Headers.Location
if (-not $cdn) { Write-Output "无法获取 CDN URL"; exit 1 }

$out = Join-Path $outDir 'macOS-DMG.zip'
Write-Output "直连 CDN 下载 -> $out"
Write-Output "（约 $([math]::Round($mac.size_in_bytes/1MB,1)) MB，断点续传，可 Ctrl+C 后重跑续传）"
curl.exe -L -C - -o $out $cdn
Write-Output "下载完成。解压 zip 得 .dmg："
Write-Output "  Expand-Archive -Path `"$out`" -DestinationPath `"$outDir`""