// computer-use 内置插件：智能体操作本机（鼠标/键盘/窗口/截图）。
// 形态与 git-explorer 一致（manifest + 入口模块），默认 disabled 注册，需在插件管理页手动开启。
// 实现：Windows PowerShell(-EncodedCommand) + Win32 P/Invoke，零原生依赖；nut-js 适配器留待后续。
// 护栏：desktop-input 权限声明 / 10 分钟滚动窗口操作上限 / 危险组合键与命令黑名单 /
//       本应用自身窗口点击默认拒绝 / 全操作审计（plugin_storage.audit）。
import path from 'node:path';
import type { McpCallResult, PluginManifest, PluginModule } from '@yan-zhi/core';
import type { ShellAdapter } from '@yan-zhi/core';

export const computerUseManifest: PluginManifest = {
  id: 'computer-use',
  name: '电脑使用',
  version: '0.1.0',
  description:
    '智能体可操作本机软件：鼠标点击/拖拽、键盘输入/快捷键、窗口枚举与激活、截屏、启动应用（仅 Windows；默认关闭，需手动开启）',
  permissions: ['desktop-input', 'shell'],
  contributes: {
    tools: [
      'computer_screenshot',
      'computer_mouse_click',
      'computer_mouse_move',
      'computer_mouse_drag',
      'computer_scroll',
      'computer_type',
      'computer_press_key',
      'computer_list_windows',
      'computer_activate_window',
      'computer_open_app',
    ],
  },
  config: {
    type: 'object',
    properties: {
      maxOps: { type: 'number', description: '10 分钟窗口内最大输入操作次数', default: 200 },
      allowSelfWindowClick: { type: 'boolean', description: '允许操作本应用自身窗口（默认禁止）', default: false },
    },
  },
};

// ---------- 护栏状态（模块级） ----------
let opCount = 0;
let lastOpAt = 0;
let maxOps = 200;
let allowSelfWindowClick = false;

const OP_WINDOW_MS = 10 * 60 * 1000;

function checkLimit(): void {
  const now = Date.now();
  if (now - lastOpAt > OP_WINDOW_MS) opCount = 0;
  if (opCount >= maxOps) {
    throw new Error(`输入操作已达上限（${maxOps} 次 / 10 分钟）。请稍后重试，或在插件配置中调整 maxOps 后重新启用插件。`);
  }
}

function recordOp(): void {
  opCount++;
  lastOpAt = Date.now();
}

/** 危险组合键黑名单（小写、修饰符排序后匹配） */
const DENIED_KEY_COMBOS = new Set([
  'alt+f4',
  'ctrl+alt+del',
  'ctrl+alt+delete',
  'ctrl+shift+esc',
  'ctrl+shift+escape',
]);

/** open_app 进程名黑名单 */
const DENIED_APPS = new Set([
  'shutdown', 'logoff', 'restart', 'taskkill', 'tskill', 'format', 'diskpart',
  'cipher', 'vssadmin', 'bcdedit', 'rundll32', 'reg', 'regedit', 'regsvr32',
]);

function assertComboAllowed(keys: string[]): void {
  const norm = keys.map((k) => k.trim().toLowerCase()).filter(Boolean).sort().join('+');
  if (!norm) throw new Error('keys 不能为空');
  if (keys.some((k) => /^(win|super|meta|windows)$/.test(k.trim().toLowerCase()))) {
    throw new Error('不允许使用 Win 键组合（黑名单）');
  }
  if (DENIED_KEY_COMBOS.has(norm)) throw new Error(`组合键 "${norm}" 在黑名单中，已拒绝`);
}

function assertAppAllowed(target: string): void {
  const t = target.trim();
  if (!t) throw new Error('target 不能为空');
  if (/[&|;<>\^%"\n\r]/.test(t)) throw new Error('target 含非法字符（不允许 shell 元字符）');
  const base = path.basename(t, '.exe').toLowerCase();
  if (DENIED_APPS.has(base)) throw new Error(`应用 "${base}" 在黑名单中，已拒绝`);
}

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function textOut(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function errResult(e: unknown) {
  return { content: [{ type: 'text' as const, text: String((e as Error)?.message || e) }], isError: true as const };
}

// ---------- PowerShell 执行层 ----------
/** 公共头 + Win32 P/Invoke 类型（每次操作独立进程，需重复注入） */
const PS_BASE = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CU {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder t, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  public static string ListWindows() {
    var sb = new StringBuilder();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var t = new StringBuilder(512); GetWindowText(h, t, 512);
      if (t.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      RECT r; GetWindowRect(h, out r);
      if (r.R - r.L <= 0 || r.B - r.T <= 0) return true;
      sb.Append(pid).Append('\\t').Append(t).Append('\\t').Append(r.L).Append(',').Append(r.T).Append(',').Append(r.R).Append(',').Append(r.B).Append('\\n');
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
  }
  public static string RectAt(int x, int y) {
    string found = "";
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      RECT r; GetWindowRect(h, out r);
      if (x >= r.L && x < r.R && y >= r.T && y < r.B) {
        var t = new StringBuilder(512); GetWindowText(h, t, 512);
        uint pid; GetWindowThreadProcessId(h, out pid);
        found = pid + "\\t" + t;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static bool ActivateByTitle(string title) {
    bool ok = false;
    EnumWindows((h, l) => {
      var t = new StringBuilder(512); GetWindowText(h, t, 512);
      if (t.ToString().IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0 && IsWindowVisible(h)) {
        ShowWindow(h, 9); SetForegroundWindow(h); ok = true; return false;
      }
      return true;
    }, IntPtr.Zero);
    return ok;
  }
}
'@`;

/** 文本参数统一走 base64 传输，规避 shell:true 拼参引号/注入问题 */
function b64Arg(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

function numArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`参数 ${name} 必须是数字`);
  return Math.round(n);
}

async function ps(
  shell: ShellAdapter,
  script: string,
  timeout = 20000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (process.platform !== 'win32') {
    throw new Error('computer-use 插件当前仅支持 Windows（macOS 适配规划中）');
  }
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return shell.exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
    { timeout },
  );
}

/** 本应用自身进程名列表（用于自窗点击拒绝） */
function selfProcNames(): string[] {
  const names = new Set<string>(['yan-zhi', 'yanzhi', '言智', 'electron', 'node']);
  try {
    names.add(path.basename(process.execPath, '.exe').toLowerCase());
  } catch {
    /* ignore */
  }
  return Array.from(names);
}

function clickScript(x: number, y: number, button: 'left' | 'right' | 'middle', double: boolean): string {
  const down = button === 'right' ? 0x0008 : button === 'middle' ? 0x0020 : 0x0002;
  const up = button === 'right' ? 0x0010 : button === 'middle' ? 0x0040 : 0x0004;
  const clicks = double ? 2 : 1;
  const press = Array.from({ length: clicks })
    .map(() => `[CU]::mouse_event(${down},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 40; [CU]::mouse_event(${up},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60;`)
    .join('\n');
  return `${PS_BASE}
$selfNames = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Arg(JSON.stringify(selfProcNames()))}')) | ConvertFrom-Json
$allowSelf = ${allowSelfWindowClick ? '$true' : '$false'}
$hit = [CU]::RectAt(${x}, ${y})
if ($hit) {
  $parts = $hit -split ([string][char]9), 2
  $pname = ''
  try { $pname = (Get-Process -Id $parts[0] -ErrorAction Stop).ProcessName } catch {}
  if (-not $allowSelf) {
    if ($selfNames -contains $pname -or $parts[1] -match '言智|yan-zhi|yanzhi') {
      Write-Output ('BLOCKED' + [string][char]9 + $parts[1])
      exit 2
    }
  }
}
[CU]::SetCursorPos(${x}, ${y}) | Out-Null
Start-Sleep -Milliseconds 80
${press}
Write-Output 'OK'`;
}

export const computerUseModule: PluginModule = {
  activate: (ctx) => {
    maxOps = Number((ctx.config as Record<string, unknown> | undefined)?.maxOps) || 200;
    allowSelfWindowClick = !!(ctx.config as Record<string, unknown> | undefined)?.allowSelfWindowClick;

    /** 统一操作入口：护栏检查 → 执行 → 计数 → 审计 */
    const runOp = async (
      op: string,
      fn: () => Promise<McpCallResult>,
      auditDetail: Record<string, unknown>,
    ): Promise<McpCallResult> => {
      try {
        checkLimit();
        const result = await fn();
        recordOp();
        try {
          const list = (await ctx.storage.get<Array<unknown>>('audit')) || [];
          list.push({ t: Date.now(), op, detail: auditDetail });
          await ctx.storage.set('audit', list.slice(-100));
        } catch {
          /* 审计失败不阻断操作 */
        }
        return result;
      } catch (e) {
        return errResult(e);
      }
    };

    // -- 截屏：返回保存路径与坐标偏移（LLM 无图视觉通道，路径可 @ 引用/预览） --
    ctx.registerTool({
      name: 'computer_screenshot',
      description:
        '截取整个虚拟屏幕，保存为 PNG 并返回绝对路径与坐标偏移信息（offsetX/offsetY 为虚拟屏幕原点，单屏时为 0）。可用 computer_list_windows 了解窗口布局',
      inputSchema: { type: 'object', properties: {} },
      execute: (args) =>
        runOp(
          'screenshot',
          async () => {
            const dir = process.env.DATA_DIR || path.resolve('screenshots');
            await (await import('node:fs/promises')).mkdir(dir, { recursive: true });
            const file = path.join(dir, `screenshot-${Date.now()}.png`);
            const script = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, (New-Object System.Drawing.Size($b.Width, $b.Height)))
$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ('OK' + [string][char]9 + $b.X + [string][char]9 + $b.Y + [string][char]9 + $b.Width + [string][char]9 + $b.Height)`;
            const r = await ps(ctx.adapter.shell!, script, 30000);
            if (r.exitCode !== 0) throw new Error(`截屏失败: ${r.stderr || r.stdout}`);
            const [, ox, oy, w, h] = r.stdout.trim().split(String.fromCharCode(9));
            return textResult({
              file,
              offsetX: Number(ox),
              offsetY: Number(oy),
              width: Number(w),
              height: Number(h),
              note: '坐标说明：鼠标工具使用屏幕坐标。单屏时与截图像素坐标一致；多屏时需将截图像素坐标加上 offsetX/offsetY。',
            });
          },
          {},
        ),
    });

    // -- 鼠标点击 --
    ctx.registerTool({
      name: 'computer_mouse_click',
      description: '在屏幕坐标 (x, y) 处点击鼠标。默认左键单击；button 可选 left/right/middle；double=true 为双击。本应用自身窗口默认拒绝操作',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '屏幕 X 坐标（截图像素坐标 + offsetX）' },
          y: { type: 'number', description: '屏幕 Y 坐标（截图像素坐标 + offsetY）' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: '默认 left' },
          double: { type: 'boolean', description: '是否双击，默认 false' },
        },
        required: ['x', 'y'],
      },
      execute: (args) => {
        const x = numArg(args.x, 'x');
        const y = numArg(args.y, 'y');
        const button = (args.button as 'left' | 'right' | 'middle') || 'left';
        const double = !!args.double;
        return runOp(
          'mouse_click',
          async () => {
            const r = await ps(ctx.adapter.shell!, clickScript(x, y, button, double));
            if (r.exitCode === 2 || r.stdout.startsWith('BLOCKED')) {
              throw new Error(`目标点落在本应用自身窗口（${r.stdout.split(String.fromCharCode(9))[1] || ''}），已拒绝。如确需操作请在插件配置开启 allowSelfWindowClick`);
            }
            if (r.exitCode !== 0) throw new Error(`点击失败: ${r.stderr || r.stdout}`);
            return textOut(`OK: ${button}${double ? ' double ' : ' '}click @ (${x}, ${y})`);
          },
          { x, y, button, double },
        );
      },
    });

    // -- 鼠标移动 --
    ctx.registerTool({
      name: 'computer_mouse_move',
      description: '将鼠标指针移动到屏幕坐标 (x, y)（不点击）',
      inputSchema: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
      },
      execute: (args) => {
        const x = numArg(args.x, 'x');
        const y = numArg(args.y, 'y');
        return runOp(
          'mouse_move',
          async () => {
            const r = await ps(ctx.adapter.shell!, `${PS_BASE}\n[CU]::SetCursorPos(${x}, ${y}) | Out-Null\nWrite-Output 'OK'`);
            if (r.exitCode !== 0) throw new Error(`移动失败: ${r.stderr || r.stdout}`);
            return textOut(`OK: moved to (${x}, ${y})`);
          },
          { x, y },
        );
      },
    });

    // -- 拖拽 --
    ctx.registerTool({
      name: 'computer_mouse_drag',
      description: '按住左键从 (fromX, fromY) 拖拽到 (toX, toY)，用于移动文件、滑动选择等',
      inputSchema: {
        type: 'object',
        properties: {
          fromX: { type: 'number' }, fromY: { type: 'number' },
          toX: { type: 'number' }, toY: { type: 'number' },
        },
        required: ['fromX', 'fromY', 'toX', 'toY'],
      },
      execute: (args) => {
        const fx = numArg(args.fromX, 'fromX');
        const fy = numArg(args.fromY, 'fromY');
        const tx = numArg(args.toX, 'toX');
        const ty = numArg(args.toY, 'toY');
        return runOp(
          'mouse_drag',
          async () => {
            const steps = Math.min(60, Math.max(5, Math.round(Math.hypot(tx - fx, ty - fy) / 10)));
            const script = `${PS_BASE}
[CU]::SetCursorPos(${fx}, ${fy}) | Out-Null
Start-Sleep -Milliseconds 100
[CU]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 120
for ($i = 1; $i -le ${steps}; $i++) {
  $cx = ${fx} + [int]((${tx} - ${fx}) * $i / ${steps})
  $cy = ${fy} + [int]((${ty} - ${fy}) * $i / ${steps})
  [CU]::SetCursorPos($cx, $cy) | Out-Null
  Start-Sleep -Milliseconds 15
}
Start-Sleep -Milliseconds 80
[CU]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
Write-Output 'OK'`;
            const r = await ps(ctx.adapter.shell!, script, 30000);
            if (r.exitCode !== 0) throw new Error(`拖拽失败: ${r.stderr || r.stdout}`);
            return textOut(`OK: dragged (${fx}, ${fy}) -> (${tx}, ${ty})`);
          },
          { fromX: fx, fromY: fy, toX: tx, toY: ty },
        );
      },
    });

    // -- 滚动 --
    ctx.registerTool({
      name: 'computer_scroll',
      description: '在坐标 (x, y) 处滚动滚轮。direction: up/down；notches 格数（默认 3）',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number' }, y: { type: 'number' },
          direction: { type: 'string', enum: ['up', 'down'] },
          notches: { type: 'number', description: '默认 3' },
        },
        required: ['x', 'y', 'direction'],
      },
      execute: (args) => {
        const x = numArg(args.x, 'x');
        const y = numArg(args.y, 'y');
        const direction = args.direction === 'down' ? 'down' : 'up';
        const notches = Math.min(20, Math.max(1, Number(args.notches) || 3));
        return runOp(
          'scroll',
          async () => {
            const delta = direction === 'up' ? 120 : -120;
            const script = `${PS_BASE}
[CU]::SetCursorPos(${x}, ${y}) | Out-Null
Start-Sleep -Milliseconds 60
for ($i = 0; $i -lt ${notches}; $i++) {
  [CU]::mouse_event(0x0800,0,0,${delta},[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
}
Write-Output 'OK'`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(`滚动失败: ${r.stderr || r.stdout}`);
            return textOut(`OK: scrolled ${direction} x${notches} @ (${x}, ${y})`);
          },
          { x, y, direction, notches },
        );
      },
    });

    // -- 键入文本 --
    ctx.registerTool({
      name: 'computer_type',
      description: '向前台窗口键入文本（模拟键盘输入）。输入前请确认目标窗口已激活',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: '要键入的文本' } },
        required: ['text'],
      },
      execute: (args) => {
        const text = String(args.text ?? '');
        if (!text) return Promise.resolve(errResult(new Error('text 不能为空')));
        return runOp(
          'type',
          async () => {
            const script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Arg(text)}'))
$text = [regex]::Replace($text, '([+^%~(){}\\[\\]])', '{$1}')
[System.Windows.Forms.SendKeys]::SendWait($text)
Write-Output 'OK'`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(`键入失败: ${r.stderr || r.stdout}`);
            return textOut(`OK: typed ${text.length} chars`);
          },
          { length: text.length },
        );
      },
    });
    // -- 组合键 --
    ctx.registerTool({
      name: 'computer_press_key',
      description:
        '按下组合键，如 keys=["ctrl","c"]、["alt","tab"]、["f5"]。支持修饰符 ctrl/alt/shift 与 enter/tab/esc/方向键/f1-f12 等。Win 键、Alt+F4、Ctrl+Alt+Del 等危险组合已列入黑名单',
      inputSchema: {
        type: 'object',
        properties: { keys: { type: 'array', items: { type: 'string' }, description: '按键序列，如 ["ctrl","shift","t"]' } },
        required: ['keys'],
      },
      execute: (args) => {
        try {
          const keys = Array.isArray(args.keys) ? args.keys.map(String) : [];
          assertComboAllowed(keys);
          return runOp(
            'press_key',
            async () => {
              const sendKeysSeq = buildSendKeys(keys).replace(/'/g, "''");
              const script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${sendKeysSeq}')
Write-Output 'OK'`;
              const r = await ps(ctx.adapter.shell!, script);
              if (r.exitCode !== 0) throw new Error(`按键失败: ${r.stderr || r.stdout}`);
              return textOut(`OK: pressed ${keys.join('+')}`);
            },
            { keys },
          );
        } catch (e) {
          return Promise.resolve(errResult(e));
        }
      },
    });

    // -- 窗口枚举 --
    ctx.registerTool({
      name: 'computer_list_windows',
      description: '枚举当前所有可见顶层窗口（pid/进程名/标题/矩形区域），用于定位点击目标',
      inputSchema: { type: 'object', properties: {} },
      execute: () =>
        runOp(
          'list_windows',
          async () => {
            const script = `${PS_BASE}
$lines = [CU]::ListWindows() -split ([string][char]10) | Where-Object { $_ }
$pids = @()
foreach ($l in $lines) { $pids += [int]($l -split ([string][char]9))[0] }
$procMap = @{}
if ($pids.Count -gt 0) {
  Get-Process -Id ($pids | Select-Object -Unique) -ErrorAction SilentlyContinue | ForEach-Object { $procMap[[string]$_.Id] = $_.ProcessName }
}
$out = @()
$i = 0
foreach ($l in $lines) {
  if ($i -ge 50) { break }
  $p = $l -split ([string][char]9), 3
  $r = $p[2] -split ','
  $out += [pscustomobject]@{ pid = [int]$p[0]; process = $procMap[[string]$p[0]]; title = $p[1]; rect = @{ left = [int]$r[0]; top = [int]$r[1]; right = [int]$r[2]; bottom = [int]$r[3] } }
  $i++
}
$out | ConvertTo-Json -Compress -Depth 3`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(`窗口枚举失败: ${r.stderr || r.stdout}`);
            let windows: unknown = [];
            try {
              const parsed = JSON.parse(r.stdout.trim() || '[]');
              windows = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              throw new Error('窗口枚举输出解析失败');
            }
            return textResult({ windows });
          },
          {},
        ),
    });

    // -- 激活窗口 --
    ctx.registerTool({
      name: 'computer_activate_window',
      description: '将窗口前置激活。传 pid（computer_list_windows 返回）或 title（标题包含匹配，不区分大小写）',
      inputSchema: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: '进程 ID' },
          title: { type: 'string', description: '窗口标题（包含匹配）' },
        },
      },
      execute: (args) => {
        const pid = args.pid != null ? numArg(args.pid, 'pid') : null;
        const title = args.title != null ? String(args.title) : null;
        if (pid == null && !title) return Promise.resolve(errResult(new Error('pid 与 title 至少传一个')));
        return runOp(
          'activate_window',
          async () => {
            let script: string;
            if (pid != null) {
              script = `${PS_BASE}
$p = Get-Process -Id ${pid} -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Output 'NO_WINDOW'; exit 1 }
[CU]::ShowWindow($h, 9) | Out-Null
[CU]::SetForegroundWindow($h) | Out-Null
Write-Output 'OK'`;
            } else {
              script = `${PS_BASE}
$title = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Arg(title!)}'))
$ok = [CU]::ActivateByTitle($title)
if (-not $ok) { Write-Output 'NOT_FOUND'; exit 1 }
Write-Output 'OK'`;
            }
            const r = await ps(ctx.adapter.shell!, script);
            if (r.stdout.includes('NO_WINDOW') || r.stdout.includes('NOT_FOUND') || r.exitCode !== 0) {
              throw new Error(`未找到目标窗口（pid=${pid ?? ''} title=${title ?? ''}）`);
            }
            return textOut(`OK: activated ${pid != null ? `pid ${pid}` : `title ~ ${title}`}`);
          },
          { pid, title },
        );
      },
    });

    // -- 启动应用 --
    ctx.registerTool({
      name: 'computer_open_app',
      description:
        '启动本机应用（如 notepad、mspaint、calc 或 exe 绝对路径）。仅支持启动，不支持传参；危险命令（shutdown/taskkill/format 等）已列入黑名单',
      inputSchema: {
        type: 'object',
        properties: { target: { type: 'string', description: '应用名或 exe 绝对路径' } },
        required: ['target'],
      },
      execute: (args) => {
        try {
          const target = String(args.target ?? '').trim();
          assertAppAllowed(target);
          return runOp(
            'open_app',
            async () => {
              const script = `$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Arg(target)}'))
Start-Process -FilePath $target
Write-Output 'OK'`;
              const r = await ps(ctx.adapter.shell!, script);
              if (r.exitCode !== 0) throw new Error(`启动失败: ${r.stderr || r.stdout}`);
              return textOut(`OK: started ${target}`);
            },
            { target },
          );
        } catch (e) {
          return Promise.resolve(errResult(e));
        }
      },
    });

    ctx.log(`computer-use 插件已激活（maxOps=${maxOps}/10min，allowSelfWindowClick=${allowSelfWindowClick}），注册 10 个 computer_* 工具`);
  },
};

/** keys 数组 → SendKeys 序列（先经黑名单校验） */
function buildSendKeys(keys: string[]): string {
  const MOD: Record<string, string> = { ctrl: '^', control: '^', alt: '%', shift: '+' };
  const KEY: Record<string, string> = {
    enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}',
    space: ' ', backspace: '{BS}', delete: '{DEL}', del: '{DEL}', insert: '{INS}',
    home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
    up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
    break: '{BREAK}', capslock: '{CAPSLOCK}',
  };
  let seq = '';
  for (const raw of keys) {
    const k = raw.trim().toLowerCase();
    if (!k) continue;
    if (MOD[k]) { seq += MOD[k]; continue; }
    if (KEY[k]) { seq += KEY[k]; continue; }
    if (/^f([1-9]|1[0-6])$/.test(k)) { seq += `{${k.toUpperCase()}}`; continue; }
    if (k.length === 1) { seq += k; continue; }
    throw new Error(`不支持的按键: ${raw}`);
  }
  return seq;
}
