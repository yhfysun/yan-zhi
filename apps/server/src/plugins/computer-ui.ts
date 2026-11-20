/**
 * computer-use 的 Windows UI Automation 层。
 *
 * 纯函数只负责构造 PowerShell 和解释回执，便于在没有图形界面的测试环境验证。
 * 真正的执行仍由 computer-use.ts 通过现有 PowerShell 通道完成。
 */

export interface UiNode {
  ref: string;
  runtimeId: string;
  name: string;
  automationId: string;
  controlType: string;
  className: string;
  value: string;
  depth: number;
  enabled: boolean;
  offscreen: boolean;
  keyboardFocusable: boolean;
  focused: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiTreeQuery {
  pid: number;
  titleContains?: string;
  maxDepth?: number;
  maxNodes?: number;
  includeOffscreen?: boolean;
}

export interface UiActionQuery {
  action: 'click' | 'set_value' | 'focus';
  pid: number;
  titleContains?: string;
  ref?: string;
  name?: string;
  controlType?: string;
  nameContains?: string;
  automationId?: string;
  value?: string;
}

export interface UiActionResult {
  ok?: boolean;
  action?: string;
  method?: string;
  ref?: string;
  name?: string;
  controlType?: string;
  value?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  error?: string;
}

function toBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function uiTreeRevision(nodes: UiNode[]): string {
  let h = 2166136261;
  const src = nodes.map((n) => `${n.runtimeId}|${n.controlType}|${n.name}|${n.value || ''}`).join('\n');
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `uia_${(h >>> 0).toString(16)}_${nodes.length}`;
}

/**
 * PowerShell `-File` 接受一个参数，路径本身已经由 shell adapter 作为独立 argv
 * 传递，不能再手工包一层双引号；否则 Windows PowerShell 会把引号当成路径字符。
 */
export function buildPowerShellFileArgs(file: string): string[] {
  return [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', file,
  ];
}

/** 生成 Windows UIA 控件树脚本，输出一行 JSON。 */
export function buildWindowsUiTreeScript(query: UiTreeQuery): string {
  const cfg = toBase64Json({
    ...query,
    maxDepth: Math.max(0, Math.min(12, Math.floor(Number(query.maxDepth) || 6))),
    maxNodes: Math.max(1, Math.min(600, Math.floor(Number(query.maxNodes) || 300))),
  });
  return `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$cfg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${cfg}')) | ConvertFrom-Json
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$root = $AE::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, [int]$cfg.pid)
$wins = $root.FindAll($TS::Children, $cond)
$target = $null
foreach ($w in $wins) {
  if (-not $cfg.titleContains -or $w.Current.Name -like ('*' + [string]$cfg.titleContains + '*')) {
    $target = $w
    break
  }
}
if (-not $target) { throw ('未找到 pid=' + $cfg.pid + ' 的窗口') }
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$global:yzNodes = New-Object System.Collections.ArrayList
$global:yzCount = 0
function Add-YzNode([System.Windows.Automation.AutomationElement]$el, [int]$depth) {
  if ($global:yzCount -ge [int]$cfg.maxNodes) { return }
  try {
    if (-not [bool]$cfg.includeOffscreen -and $el.Current.IsOffscreen) { return }
    $rid = @($el.GetRuntimeId()) -join '.'
    $r = $el.Current.BoundingRectangle
    $value = ''
    try {
      $vp = $null
      if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
        $value = [string]([System.Windows.Automation.ValuePattern]$vp).Current.Value
      }
    } catch {}
    $global:yzCount++
    [void]$global:yzNodes.Add([ordered]@{
      ref = ('uia:' + $rid)
      runtimeId = $rid
      name = [string]$el.Current.Name
      automationId = [string]$el.Current.AutomationId
      controlType = ([string]$el.Current.ControlType.ProgrammaticName).Replace('ControlType.', '')
      className = [string]$el.Current.ClassName
      value = $value
      depth = $depth
      enabled = [bool]$el.Current.IsEnabled
      offscreen = [bool]$el.Current.IsOffscreen
      keyboardFocusable = [bool]$el.Current.IsKeyboardFocusable
      focused = [bool]$el.Current.HasKeyboardFocus
      x = [int][Math]::Round($r.X)
      y = [int][Math]::Round($r.Y)
      width = [int][Math]::Round($r.Width)
      height = [int][Math]::Round($r.Height)
    })
  } catch { return }
  if ($depth -ge [int]$cfg.maxDepth) { return }
  try { $child = $walker.GetFirstChild($el) } catch { $child = $null }
  while ($child -ne $null -and $global:yzCount -lt [int]$cfg.maxNodes) {
    Add-YzNode $child ($depth + 1)
    try { $child = $walker.GetNextSibling($child) } catch { $child = $null }
  }
}
Add-YzNode $target 0
$revisionSrc = ($global:yzNodes | ForEach-Object { ([string]$_.runtimeId + '|' + [string]$_.controlType + '|' + [string]$_.name) }) -join "\`n"
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($revisionSrc)))).Replace('-', '').ToLowerInvariant()
[ordered]@{
  ok = $true
  pid = [int]$cfg.pid
  title = [string]$target.Current.Name
  revision = ('uia_' + $hash.Substring(0, 16) + '_' + $global:yzNodes.Count)
  nodes = @($global:yzNodes)
} | ConvertTo-Json -Depth 8 -Compress`;
}

/** 生成 Windows UIA 语义动作脚本。优先使用控件模式，失败后才坐标点击。 */
export function buildWindowsUiActionScript(query: UiActionQuery): string {
  const cfg = toBase64Json(query);
  return `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class YzUiNative {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
$cfg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${cfg}')) | ConvertFrom-Json
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$root = $AE::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, [int]$cfg.pid)
$wins = $root.FindAll($TS::Children, $cond)
$target = $null
foreach ($w in $wins) {
  if (-not $cfg.titleContains -or $w.Current.Name -like ('*' + [string]$cfg.titleContains + '*')) { $target = $w; break }
}
if (-not $target) { throw ('未找到 pid=' + $cfg.pid + ' 的窗口') }
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$global:yzFound = $null
function Find-YzNode([System.Windows.Automation.AutomationElement]$el) {
  if ($global:yzFound -ne $null) { return }
  $rid = @($el.GetRuntimeId()) -join '.'
  $ct = ([string]$el.Current.ControlType.ProgrammaticName).Replace('ControlType.', '')
  $match = $true
  if ($cfg.ref) { $match = $match -and (('uia:' + $rid) -eq [string]$cfg.ref -or $rid -eq [string]$cfg.ref) }
  if ($cfg.name) { $match = $match -and ($el.Current.Name -eq [string]$cfg.name) }
  if ($cfg.nameContains) { $match = $match -and ($el.Current.Name -like ('*' + [string]$cfg.nameContains + '*')) }
  if ($cfg.automationId) { $match = $match -and ($el.Current.AutomationId -eq [string]$cfg.automationId) }
  if ($cfg.controlType) { $match = $match -and ($ct -eq [string]$cfg.controlType) }
  if ($match -and ($cfg.ref -or $cfg.name -or $cfg.nameContains -or $cfg.automationId -or $cfg.controlType)) {
    $global:yzFound = $el
    return
  }
  try { $child = $walker.GetFirstChild($el) } catch { $child = $null }
  while ($child -ne $null -and $global:yzFound -eq $null) {
    Find-YzNode $child
    try { $child = $walker.GetNextSibling($child) } catch { $child = $null }
  }
}
Find-YzNode $target
if ($global:yzFound -eq $null) { throw '未找到匹配的 UI Automation 元素；请重新调用 computer_get_ui_tree 获取最新 ref' }
$el = $global:yzFound
$rid = @($el.GetRuntimeId()) -join '.'
$r = $el.Current.BoundingRectangle
$value = ''
try {
  $vp = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
    $value = [string]([System.Windows.Automation.ValuePattern]$vp).Current.Value
  }
} catch {}
$bounds = [ordered]@{ x=[int][Math]::Round($r.X); y=[int][Math]::Round($r.Y); width=[int][Math]::Round($r.Width); height=[int][Math]::Round($r.Height) }
$method = ''
if ([string]$cfg.action -eq 'click') {
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) {
    ([System.Windows.Automation.InvokePattern]$p).Invoke(); $method = 'InvokePattern'
  } elseif ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) {
    ([System.Windows.Automation.TogglePattern]$p).Toggle(); $method = 'TogglePattern'
  } elseif ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) {
    ([System.Windows.Automation.SelectionItemPattern]$p).Select(); $method = 'SelectionItemPattern'
  } elseif ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$p)) {
    $ec = [System.Windows.Automation.ExpandCollapsePattern]$p
    if ($ec.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Expanded) { $ec.Collapse() } else { $ec.Expand() }
    $method = 'ExpandCollapsePattern'
  } else {
    $cx = [int]($r.X + $r.Width / 2); $cy = [int]($r.Y + $r.Height / 2)
    [YzUiNative]::SetCursorPos($cx, $cy) | Out-Null
    Start-Sleep -Milliseconds 60
    [YzUiNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [YzUiNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    $method = 'coordinate-fallback'
  }
} elseif ([string]$cfg.action -eq 'set_value') {
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
    ([System.Windows.Automation.ValuePattern]$p).SetValue([string]$cfg.value); $method = 'ValuePattern'
  } elseif ($el.TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern, [ref]$p)) {
    ([System.Windows.Automation.LegacyIAccessiblePattern]$p).SetValue([string]$cfg.value); $method = 'LegacyIAccessiblePattern'
  } else { throw '该控件不支持 ValuePattern/LegacyIAccessiblePattern，无法直接设值' }
} elseif ([string]$cfg.action -eq 'focus') {
  $el.SetFocus(); $method = 'SetFocus'
} else { throw ('不支持的 UIA 动作: ' + [string]$cfg.action) }
Start-Sleep -Milliseconds 120
$value = ''
try {
  $vp = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
    $value = [string]([System.Windows.Automation.ValuePattern]$vp).Current.Value
  }
} catch {}
[ordered]@{
  ok = $true
  action = [string]$cfg.action
  method = $method
  ref = ('uia:' + $rid)
  name = [string]$el.Current.Name
  controlType = ([string]$el.Current.ControlType.ProgrammaticName).Replace('ControlType.', '')
  value = $value
  bounds = $bounds
} | ConvertTo-Json -Depth 6 -Compress`;
}

export function parseUiActionOutput(stdout: string): UiActionResult {
  const text = String(stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text) return { error: 'UIA 动作没有返回结果' };
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : { error: text };
  } catch {
    return { error: text };
  }
}
