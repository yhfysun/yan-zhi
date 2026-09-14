// computer-use 内置插件：智能体操作本机（鼠标/键盘/窗口/截图）。
// 形态与 git-explorer 一致（manifest + 入口模块），默认 disabled 注册，需在插件管理页手动开启。
// 实现：Windows PowerShell(-EncodedCommand) + Win32 P/Invoke，零原生依赖；nut-js 适配器留待后续。
// 护栏：desktop-input 权限声明 / 10 分钟滚动窗口操作上限 / 危险组合键与命令黑名单 /
//       本应用自身窗口点击默认拒绝 / 全操作审计（plugin_storage.audit）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPluginManager } from '@yan-zhi/core';
import type { McpCallResult, PluginManifest, PluginModule } from '@yan-zhi/core';
import type { ShellAdapter } from '@yan-zhi/core';
import { db } from '../db.js';
import { serverState } from '../state.js';

export const computerUseManifest: PluginManifest = {
  id: 'computer-use',
  name: '电脑使用',
  version: '0.1.0',
  category: '操作',
  description:
    '智能体可操作本机软件：鼠标点击、键盘输入/快捷键、窗口激活、截屏、启动应用（Windows 全量支持；macOS 基础支持需辅助功能权限）；系统管理：安装/卸载应用、强制删除残留文件、注册表键清理（高危操作全部需用户确认后传 confirm:true 才执行）；默认关闭，需手动开启',
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
      'computer_list_processes',
      'computer_list_installed_apps',
      'computer_uninstall_app',
      'computer_install_app',
      'computer_force_delete',
      'computer_registry_delete',
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
/** 急停标志：Ctrl+Alt+Esc（桌面端 globalShortcut → POST /panic）触发后置位并禁用插件 */
let panicActive = false;

const OP_WINDOW_MS = 10 * 60 * 1000;

function checkLimit(): void {
  if (panicActive) throw new Error('急停已触发（Ctrl+Alt+Esc），输入工具已冻结。请在「插件管理」页手动重新启用插件');
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

// ---------- 截图临时区与定期清理 ----------
// 截图统一落 <DATA_DIR>/screenshots（临时区）：流式期间 UI 经
// GET /api/plugin/computer-use/screenshots/:name 内嵌展示；任务结束后 UI 不再展示，
// 文件由清理器在 30 分钟后回收。模型要长期保留的截图（有工作目录的任务）在截图时
// 传 save_as 复制一份进工作目录，不受清理影响——「工具结果即用即弃，显式保存才留存」。
const SCREENSHOT_NAME_RE = /^screenshot-\d+\.png$/;
const SCREENSHOT_REAP_MS = 30 * 60 * 1000;
const SCREENSHOT_SCAN_MS = 5 * 60 * 1000;
let reapTimer: ReturnType<typeof setInterval> | null = null;

function screenshotsDir(): string {
  return process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'screenshots')
    : path.resolve('screenshots');
}

/** 清理临时区中过期的截图（只删自己命名规则的文件，别的文件一律不碰） */
function reapOldScreenshots(): void {
  try {
    const dir = screenshotsDir();
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      if (!SCREENSHOT_NAME_RE.test(name)) continue;
      const file = path.join(dir, name);
      try {
        const st = fs.statSync(file);
        if (st.isFile() && now - st.mtimeMs > SCREENSHOT_REAP_MS) fs.rmSync(file, { force: true });
      } catch { /* 单个文件失败不影响其余 */ }
    }
  } catch { /* 清理失败静默，不影响主流程 */ }
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
  public static string ListWindowsAll() {
    var sb = new StringBuilder();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var t = new StringBuilder(512); GetWindowText(h, t, 512);
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
  public static bool ActivateByPid(uint pid) {
    bool ok = false;
    EnumWindows((h, l) => {
      uint wp; GetWindowThreadProcessId(h, out wp);
      if (wp == pid && IsWindowVisible(h)) {
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
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    throw new Error('computer-use 插件当前支持 Windows / macOS');
  }
  if (process.platform !== 'win32') {
    // macOS 不走 PowerShell（此函数在 mac 分支不会被调用），防御性返回
    throw new Error('ps() 仅用于 Windows');
  }
  // Windows 下 shell 适配器经 cmd.exe 拼接整条命令行（上限 8191 字符），
  // -EncodedCommand 的 base64 还会把脚本再膨胀 1.33 倍，脚本稍长即报
  // "The command line is too long"。改为写临时 .ps1 用 -File 执行，命令行只剩一个短路径。
  const file = path.join(os.tmpdir(), `yz-cu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`);
  // 带 UTF-8 BOM 写入：Windows PowerShell 5.1 对无 BOM 文件按 ANSI 解析，中文会乱码。
  // 并前置声明输出编码：PS 5.1 管道输出默认 OEM 码页（GBK），中文标题/名称会变成乱码
  const PREAMBLE = 'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}\n';
  fs.writeFileSync(file, '\uFEFF' + PREAMBLE + script, 'utf8');
  try {
    return await shell.exec(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `"${file}"`],
      { timeout },
    );
  } finally {
    try { fs.unlinkSync(file); } catch { /* 清理失败不影响结果 */ }
  }
}

// ---------- macOS 执行层（osascript / screencapture / open，需系统授予辅助功能权限） ----------
const MAC = process.platform === 'darwin';

async function osa(shell: ShellAdapter, script: string, timeout = 15000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const r = await shell.exec('osascript', ['-e', script], { timeout });
  if (r.exitCode !== 0 && /assistive|accessib|not allowed/i.test(r.stderr)) {
    throw new Error(`macOS 辅助功能权限未授予：系统设置 → 隐私与安全性 → 辅助功能，允许本应用后重试`);
  }
  return r;
}

function osaStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const MAC_KEYCODE: Record<string, number> = {
  enter: 36, return: 36, tab: 48, esc: 53, escape: 53, space: 49,
  backspace: 51, delete: 51, forwarddelete: 117,
  home: 115, end: 119, pageup: 116, pagedown: 121,
  up: 126, down: 125, left: 123, right: 124,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97,
  f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
};

/** mac 组合键 → AppleScript（ctrl 直觉映射为 command） */
function buildMacKeyScript(keys: string[]): string {
  const MODS: Record<string, string> = { ctrl: 'command down', control: 'command down', alt: 'option down', shift: 'shift down' };
  const mods: string[] = [];
  let action = '';
  for (const raw of keys) {
    const k = raw.trim().toLowerCase();
    if (!k) continue;
    if (MODS[k]) { mods.push(MODS[k]); continue; }
    if (action) throw new Error('macOS 一次只支持一个主键');
    if (MAC_KEYCODE[k] != null) action = `key code ${MAC_KEYCODE[k]}`;
    else if (k.length === 1) action = `keystroke "${osaStr(k)}"`;
    else throw new Error(`不支持的按键: ${raw}`);
  }
  if (!action) throw new Error('keys 不能为空');
  return `tell application "System Events" to ${action}${mods.length ? ` using {${mods.join(', ')}}` : ''}`;
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
    panicActive = false;
    maxOps = Number((ctx.config as Record<string, unknown> | undefined)?.maxOps) || 200;
    allowSelfWindowClick = !!(ctx.config as Record<string, unknown> | undefined)?.allowSelfWindowClick;

    // 截图临时区清理器：启用即扫一次，之后每 5 分钟扫一次（模块级单例定时器，防止重复启用叠加）
    reapOldScreenshots();
    if (!reapTimer) {
      reapTimer = setInterval(reapOldScreenshots, SCREENSHOT_SCAN_MS);
      if (typeof reapTimer.unref === 'function') reapTimer.unref();
    }

    // 后端路由：/api/plugin/computer-use/*
    // POST /panic —— 急停入口（桌面端 globalShortcut Ctrl+Alt+Esc 调用）：冻结输入工具并禁用插件（恢复=手动重新启用）
    // GET  /audit —— 操作审计记录（插件页「记录」按钮）
    ctx.registerBackendRoute((raw) => {
      const r = raw as {
        post: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
        get: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
      };
      r.post('/panic', (_req, res) => {
        if (getPluginManager().get('computer-use')?.state !== 'enabled') {
          res.json({ error: 'computer-use 插件未启用，无需急停' });
          return;
        }
        panicActive = true;
        ctx.log('!!! 急停触发（Ctrl+Alt+Esc）：输入工具已冻结，插件即将禁用');
        void getPluginManager()
          .disable('computer-use')
          .catch(() => undefined);
        res.json({ data: { ok: true, message: '急停已生效，computer-use 插件已禁用（可在插件管理页重新启用）' } });
      });
      r.get('/audit', (_req, res) => {
        // 未启用时明确拒绝（路由禁用后仍挂载），历史记录仍在 plugin_storage，重新启用即可查看
        if (getPluginManager().get('computer-use')?.state !== 'enabled') {
          res.json({ error: 'computer-use 插件未启用，启用后可查看操作记录' });
          return;
        }
        try {
          const row = db
            .prepare("SELECT value FROM plugin_storage WHERE plugin_id = 'computer-use' AND key = 'audit'")
            .get() as { value: string | null } | undefined;
          const ops = row?.value ? (JSON.parse(row.value) as unknown[]) : [];
          res.json({ data: { panic: panicActive, ops } });
        } catch (e) {
          res.json({ error: (e as Error).message });
        }
      });
      // 截图临时区访问：GET /screenshots/:name —— 流式期间 UI 内嵌展示截图用。
      // 文件名白名单 + 解析后必须仍在临时区内（防路径穿越）；本地模式无 token 放行
      // （与 /api/plugin-assets 一致，<img> 可直接引用）；no-store 避免展示已回收文件的缓存。
      r.get('/screenshots/:name', (req, res) => {
        const name = String((req as { params?: Record<string, string> }).params?.name || '');
        if (!SCREENSHOT_NAME_RE.test(name)) {
          (res as unknown as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: '非法文件名' });
          return;
        }
        const dir = screenshotsDir();
        const file = path.join(dir, name);
        if (!file.startsWith(dir) || !fs.existsSync(file)) {
          (res as unknown as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '截图不存在或已清理' });
          return;
        }
        (res as unknown as {
          setHeader: (k: string, v: string) => void;
          sendFile: (p: string) => void;
        }).setHeader('Content-Type', 'image/png');
        (res as unknown as { setHeader: (k: string, v: string) => void; sendFile: (p: string) => void }).setHeader('Cache-Control', 'no-store');
        (res as unknown as { setHeader: (k: string, v: string) => void; sendFile: (p: string) => void }).sendFile(file);
      });
    });

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

    // -- 截屏：临时区保存 + 返回路径/坐标偏移/screenshotUrl（UI 流式期间内嵌展示）；
    //    模型本身看不到画面，需紧跟 image_analyze 完成视觉识别 --
    ctx.registerTool({
      name: 'computer_screenshot',
      description:
        '截取整个虚拟屏幕，保存为 PNG 并返回绝对路径与坐标偏移信息（offsetX/offsetY 为虚拟屏幕原点，单屏时为 0）。' +
        '注意：本工具只返回文件路径，你无法直接看到画面——需要识别屏幕内容或定位界面元素（按钮/输入框/聊天窗口等）时，' +
        '必须紧接着调用 image_analyze 工具（path=返回的文件路径，prompt=描述你要找的元素及其位置）完成视觉识别，再按识别结果操作。可用 computer_list_windows 了解窗口布局。' +
        '临时截图约 30 分钟后自动清理；如需长期保留且任务已设置工作目录，传 save_as（相对工作目录的路径，如 "shots/登录页.png"）同时存一份到工作目录',
      inputSchema: {
        type: 'object',
        properties: {
          save_as: { type: 'string', description: '可选。相对工作目录的保存路径（如 shots/登录页.png）；任务未设置工作目录时忽略此参数' },
        },
      },
      execute: (args) =>
        runOp(
          'screenshot',
          async () => {
            const dir = screenshotsDir();
            await (await import('node:fs/promises')).mkdir(dir, { recursive: true });
            const file = path.join(dir, `screenshot-${Date.now()}.png`);
            const screenshotUrl = `/api/plugin/computer-use/screenshots/${path.basename(file)}`;
            // 显式保留：save_as + 已设置工作目录 → 复制一份到工作目录（校验不越界），临时区副本照旧等待回收
            let keptTo: string | undefined;
            const saveAs = String((args as Record<string, unknown>)?.save_as || '').trim();
            const wsRoot = serverState.workspaceDir?.trim() ? path.resolve(serverState.workspaceDir.trim()) : '';
            if (saveAs && wsRoot) {
              const target = path.resolve(wsRoot, saveAs);
              if (target !== wsRoot && target.startsWith(wsRoot + path.sep)) {
                await (await import('node:fs/promises')).mkdir(path.dirname(target), { recursive: true });
                await (await import('node:fs/promises')).copyFile(file, target);
                keptTo = target;
              }
            }
            if (MAC) {
              const r = await ctx.adapter.shell!.exec('screencapture', ['-x', file], { timeout: 30000 });
              if (r.exitCode !== 0) throw new Error(`截屏失败: ${r.stderr || r.stdout}`);
              return textResult({
                file, screenshotUrl, offsetX: 0, offsetY: 0,
                ...(keptTo ? { keptTo } : {}),
                note: 'macOS：屏幕坐标与截图像素坐标一致（主屏）。screenshotUrl 供对话界面流式期间展示，与识别无关',
                nextStep: `你看不到画面，请立即调用 image_analyze(path="${file}", prompt="描述屏幕内容并给出你要操作的界面元素的位置") 完成视觉识别后再操作`,
              });
            }
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
              file, screenshotUrl,
              offsetX: Number(ox),
              offsetY: Number(oy),
              width: Number(w),
              height: Number(h),
              ...(keptTo ? { keptTo } : {}),
              note: '坐标说明：鼠标工具使用屏幕坐标。单屏时与截图像素坐标一致；多屏时需将截图像素坐标加上 offsetX/offsetY。screenshotUrl 供对话界面流式期间展示，与识别无关',
              nextStep: `你看不到画面，请立即调用 image_analyze(path="${file}", prompt="描述屏幕内容并给出你要操作的界面元素的位置") 完成视觉识别后再操作`,
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
            if (MAC) {
              if (button !== 'left' || double) {
                throw new Error('macOS 适配 v1 仅支持左键单击（右键/双击暂不支持）');
              }
              const r = await osa(ctx.adapter.shell!, `tell application "System Events" to click at {${x}, ${y}}`);
              if (r.exitCode !== 0) throw new Error(`点击失败: ${r.stderr || r.stdout}`);
              return textOut(`OK: click @ (${x}, ${y})`);
            }
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
            if (MAC) throw new Error('macOS 适配 v1 不支持纯鼠标移动（可改用 mouse_click）');
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
            if (MAC) throw new Error('macOS 适配 v1 不支持鼠标拖拽');
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
            if (MAC) throw new Error('macOS 适配 v1 不支持滚轮模拟');
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
            if (MAC) {
              if (/[^\x00-\x7F]/.test(text)) {
                throw new Error('macOS keystroke 不支持非 ASCII 字符（中文等），请改用剪贴板粘贴');
              }
              const r = await osa(ctx.adapter.shell!, `tell application "System Events" to keystroke "${osaStr(text)}"`);
              if (r.exitCode !== 0) throw new Error(`键入失败: ${r.stderr || r.stdout}`);
              return textOut(`OK: typed ${text.length} chars`);
            }
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
              if (MAC) {
                const script = buildMacKeyScript(keys);
                const r = await osa(ctx.adapter.shell!, script);
                if (r.exitCode !== 0) throw new Error(`按键失败: ${r.stderr || r.stdout}`);
                return textOut(`OK: pressed ${keys.join('+')}`);
              }
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
      description:
        '枚举当前可见顶层窗口（分页返回：默认第 1 页、每页 20 条，翻页传 page=2、3…，先看 total/totalPages）。' +
        '返回按进程聚合的 apps 摘要 + windows 当前页明细。可用 processName 过滤（如 "WeChat"），用 pageSize 控制每页条数；每个窗口含 pid/进程名/exe路径/标题/矩形。' +
        'windows 为空但有运行中的目标程序时，看 noTitleWindows/noTitleCount：可见但标题读不到的窗口（常见于目标程序以更高权限运行、UIPI 拦截标题读取，或托盘窗口）会列在那里，可按 pid 用 computer_activate_window 激活。' +
        '配套 computer_list_processes（运行中的程序）与 computer_list_installed_apps（已安装应用）可辅助"先查再操作"',
      inputSchema: {
        type: 'object',
        properties: {
          processName: { type: 'string', description: '只返回该进程名的窗口（如 WeChat、notepad），不区分大小写，子串匹配' },
          page: { type: 'number', description: '页码，从 1 开始，默认 1' },
          pageSize: { type: 'number', description: '每页窗口数，默认 20，最大 100' },
        },
      },
      execute: (args) =>
        runOp(
          'list_windows',
          async () => {
            if (MAC) {
              const r = await osa(
                ctx.adapter.shell!,
                'tell application "System Events" to get name of every application process whose background only is false',
              );
              if (r.exitCode !== 0) throw new Error(`窗口枚举失败: ${r.stderr || r.stdout}`);
              const names = r.stdout.trim().split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
              return textResult({
                windows: names.map((n) => ({ process: n, title: n })),
                note: 'macOS v1 仅返回前台应用进程名（可将其作为 activate_window 的 title 使用）',
              });
            }
            const procFilter = args.processName ? String(args.processName) : '';
            const pageN = Math.max(1, Math.floor(Number(args.page) || 1));
            const pageSizeN = Math.min(100, Math.max(5, Math.floor(Number(args.pageSize) || 20)));
            const filterJson = JSON.stringify({ processName: procFilter });
            const script = `${PS_BASE}
$filterJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Arg(filterJson)}'))
$page = [int]${pageN}
$pageSize = [int]${pageSizeN}
$fo = $filterJson | ConvertFrom-Json
$procFilter = if ($fo.processName) { $fo.processName } else { $null }
$lines = [CU]::ListWindowsAll() -split ([string][char]10) | Where-Object { $_ }
$pids = @()
foreach ($l in $lines) { $pids += [int]($l -split ([string][char]9))[0] }
$procMap = @{}
if ($pids.Count -gt 0) {
  Get-Process -Id ($pids | Select-Object -Unique) -ErrorAction SilentlyContinue | ForEach-Object { $procMap[[string]$_.Id] = @{ name = $_.ProcessName; exePath = $_.Path } }
}
$all = @()
$noTitle = @()
foreach ($l in $lines) {
  $p = $l -split ([string][char]9), 3
  $r = $p[2] -split ','
  $m = $procMap[[string]$p[0]]
  if ([string]$p[1] -eq '') {
    $noTitle += [pscustomobject]@{ pid = [int]$p[0]; process = $m.name; rect = @{ left = [int]$r[0]; top = [int]$r[1]; right = [int]$r[2]; bottom = [int]$r[3] } }
    continue
  }
  $all += [pscustomobject]@{ pid = [int]$p[0]; process = $m.name; exePath = $m.exePath; title = $p[1]; rect = @{ left = [int]$r[0]; top = [int]$r[1]; right = [int]$r[2]; bottom = [int]$r[3] } }
}
if ($procFilter) { $all = @($all | Where-Object { $_.process -and $_.process -like "*$procFilter*" }) }
$apps = $all | Group-Object process | Select-Object @{ n = 'process'; e = { $_.Name } }, @{ n = 'windowCount'; e = { $_.Count } } | Sort-Object process
$out = @($all | Select-Object -First ($page * $pageSize) | Select-Object -Last $pageSize)
[pscustomobject]@{ total = @($all).Count; page = $page; pageSize = $pageSize; totalPages = [math]::Ceiling(@($all).Count / $pageSize); apps = $apps; windows = $out; noTitleCount = @($noTitle).Count; noTitleWindows = @($noTitle | Select-Object -First 12) } | ConvertTo-Json -Compress -Depth 4`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(`窗口枚举失败: ${r.stderr || r.stdout}`);
            let result: unknown = { total: 0, apps: [], windows: [] };
            try {
              const parsed = JSON.parse(r.stdout.trim() || '{}');
              result = parsed && typeof parsed === 'object' ? parsed : { total: 0, apps: [], windows: [] };
            } catch {
              throw new Error('窗口枚举输出解析失败');
            }
            return textResult(result);
          },
          {},
        ),
    });

    // -- 激活窗口 --
    ctx.registerTool({
      name: 'computer_activate_window',
      description: '将窗口前置激活。传 pid（优先，来自 computer_list_windows/list_processes）或 title（标题包含匹配，不区分大小写）；pid 激活失败会自动退回按 title 匹配',
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
            if (MAC) {
              let appName = title || '';
              if (pid != null) {
                const ps1 = await ctx.adapter.shell!.exec('ps', ['-p', String(pid), '-o', 'comm=']);
                if (ps1.exitCode !== 0 || !ps1.stdout.trim()) throw new Error(`未找到进程 pid=${pid}`);
                appName = path.basename(ps1.stdout.trim());
              }
              if (!appName) throw new Error('macOS 激活需要 pid 或应用名（title 参数）');
              const r = await osa(ctx.adapter.shell!, `tell application "${osaStr(appName)}" to activate`);
              if (r.exitCode !== 0) throw new Error(`激活失败（应用 "${appName}" 可能未安装或未运行）: ${r.stderr || r.stdout}`);
              return textOut(`OK: activated app "${appName}"`);
            }
            const script = `${PS_BASE}
$pidArg = ${pid != null ? pid : '0'}
$title = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Arg(title ?? '')}'))
$ok = $false
if ($pidArg -gt 0) {
  try {
    $p = Get-Process -Id $pidArg -ErrorAction Stop
    $h = $p.MainWindowHandle
    if ($h -ne [IntPtr]::Zero) {
      [CU]::ShowWindow($h, 9) | Out-Null
      [CU]::SetForegroundWindow($h) | Out-Null
      $ok = $true
    }
  } catch {}
  if (-not $ok) { $ok = [CU]::ActivateByPid([uint32]$pidArg) }
}
if (-not $ok -and $title) { $ok = [CU]::ActivateByTitle($title) }
if (-not $ok) { Write-Output 'NOT_FOUND'; exit 1 }
Write-Output 'OK'`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.stdout.includes('NOT_FOUND')) {
              throw new Error(
                `未找到目标窗口（pid=${pid ?? ''} title=${title ?? ''}）。` +
                `可先用 computer_list_windows(processName=...) 或 computer_list_processes(nameFilter=...) 查到有效 pid/标题再激活`,
              );
            }
            if (r.exitCode !== 0) {
              // 脚本执行失败（环境/语法等），保留原始报错，不再伪装成"未找到窗口"
              throw new Error(`激活执行失败: ${r.stderr || r.stdout || `exitCode=${r.exitCode}`}`);
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
              if (MAC) {
                const r = /[/\\]/.test(target)
                  ? await ctx.adapter.shell!.exec('open', [target])
                  : await ctx.adapter.shell!.exec('open', ['-a', target]);
                if (r.exitCode !== 0) throw new Error(`启动失败: ${r.stderr || r.stdout}`);
                return textOut(`OK: started ${target}`);
              }
              const script = `${PS_BASE}
$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Arg(target)}'))
$name = [System.IO.Path]::GetFileNameWithoutExtension($target)
$candidates = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -eq $name -or ($_.Path -and ([System.IO.Path]::GetFileNameWithoutExtension($_.Path)) -eq $name)
}
if ($candidates) {
  $proc = $candidates[0]
  $h = $proc.MainWindowHandle
  if ($h -eq [IntPtr]::Zero) {
    $ok = [CU]::ActivateByPid([uint32]$proc.Id)
    if (-not $ok) { Write-Output ('RUNNING_NO_WINDOW' + [string][char]9 + $proc.Id); exit 0 }
  } else {
    [CU]::ShowWindow($h, 9) | Out-Null
    [CU]::SetForegroundWindow($h) | Out-Null
  }
  Write-Output ('ALREADY_RUNNING' + [string][char]9 + $proc.Id)
} else {
  Start-Process -FilePath $target
  Write-Output 'STARTED'
}`;
              const r = await ps(ctx.adapter.shell!, script);
              if (r.exitCode !== 0) throw new Error(`启动失败: ${r.stderr || r.stdout}`);
              const outLine = (r.stdout || '').trim();
              if (outLine.startsWith('ALREADY_RUNNING')) {
                const pidv = outLine.split(String.fromCharCode(9))[1] || '';
                return textOut(`OK: ${target} 已在运行，已激活其窗口（pid ${pidv}），未重复启动`);
              }
              if (outLine.startsWith('RUNNING_NO_WINDOW')) {
                const pidv = outLine.split(String.fromCharCode(9))[1] || '';
                return textOut(`OK: ${target} 已在运行（pid ${pidv}）但无可见窗口可激活（可能是托盘程序）`);
              }
              return textOut(`OK: started ${target}`);
            },
            { target },
          );
        } catch (e) {
          return Promise.resolve(errResult(e));
        }
      },
    });

    // -- 已安装应用列表（含安装目录 / 主程序路径） --
    ctx.registerTool({
      name: 'computer_list_installed_apps',
      description:
        '列出本机已安装的应用（来自卸载注册表）：名称 / 版本 / 发布者 / 安装目录 / 主程序 exe 路径。' +
        '这是"应用目录"，配合 computer_open_app 使用——拿不准目标叫什么、exe 路径在哪时先查它，避免盲目启动',
      inputSchema: {
        type: 'object',
        properties: {
          nameFilter: { type: 'string', description: '按名称子串过滤（如 微信、WeChat、Office），不区分大小写' },
          limit: { type: 'number', description: '最多返回条数，默认 250，最大 500' },
        },
      },
      execute: (args) =>
        runOp(
          'list_installed_apps',
          async () => {
            if (MAC) {
              const r = await osa(ctx.adapter.shell!, 'tell application "System Events" to get name of every application process whose background only is false');
              if (r.exitCode !== 0) throw new Error(`应用枚举失败: ${r.stderr || r.stdout}`);
              return textResult({ apps: r.stdout.trim().split(',').map((s) => s.trim()).filter(Boolean).map((n) => ({ name: n })), note: 'macOS v1 仅返回已运行应用名，安装清单暂不可用' });
            }
            const nameFilter = args.nameFilter ? String(args.nameFilter) : '';
            const limitN = Math.min(500, Math.max(1, Number(args.limit) || 250));
            const script = `$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$out = @()
foreach ($p in $paths) {
  Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
    $icon = ($_.DisplayIcon -replace ',.*$','') -replace '"',''
    $out += [pscustomobject]@{
      name = $_.DisplayName
      version = $_.DisplayVersion
      publisher = $_.Publisher
      installLocation = $_.InstallLocation
      exePath = $icon
    }
  }
}
$filtered = $out | Where-Object { $_.name -like "*${nameFilter}*" }
$filtered | Sort-Object name | Select-Object -First ${limitN} | ConvertTo-Json -Compress -Depth 3`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(`应用枚举失败: ${r.stderr || r.stdout}`);
            let apps: unknown = [];
            try {
              const parsed = JSON.parse(r.stdout.trim() || '[]');
              apps = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              throw new Error('应用枚举输出解析失败');
            }
            return textResult({ apps });
          },
          {},
        ),
    });

    // -- 运行中程序清单 --
    ctx.registerTool({
      name: 'computer_list_processes',
      description:
        '列出本机正在运行的程序（进程）：pid / 进程名 / exe 完整路径 / 主窗口标题 / 内存占用。' +
        '这是"已运行程序清单"，配合 computer_open_app 的"智能打开"使用——先用它确认目标是否已运行、拿到进程名/路径，再决定激活还是启动',
      inputSchema: {
        type: 'object',
        properties: {
          nameFilter: { type: 'string', description: '按进程名/路径子串过滤（如 WeChat、chrome），不区分大小写' },
          limit: { type: 'number', description: '最多返回条数，默认 200，最大 500' },
        },
      },
      execute: (args) =>
        runOp(
          'list_processes',
          async () => {
            if (MAC) {
              const r = await osa(ctx.adapter.shell!, 'tell application "System Events" to get name of every application process whose background only is false');
              if (r.exitCode !== 0) throw new Error(`进程枚举失败: ${r.stderr || r.stdout}`);
              const names = r.stdout.trim().split(',').map((s) => s.trim()).filter(Boolean);
              return textResult({ processes: names.map((n) => ({ name: n })), note: 'macOS v1 仅返回前台应用进程名' });
            }
            const nameFilter = args.nameFilter ? String(args.nameFilter) : '';
            const limitN = Math.min(500, Math.max(1, Number(args.limit) || 200));
            const script = `Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "*${nameFilter}*" -or ($_.Path -and $_.Path -like "*${nameFilter}*") } | ForEach-Object {
  [pscustomobject]@{
    pid = $_.Id
    name = $_.ProcessName
    exePath = $_.Path
    mainWindowTitle = $_.MainWindowTitle
    memoryMB = [math]::Round($_.WorkingSet / 1MB, 1)
  }
} | Sort-Object name | Select-Object -First ${limitN} | ConvertTo-Json -Compress -Depth 3`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(`进程枚举失败: ${r.stderr || r.stdout}`);
            let processes: unknown = [];
            try {
              const parsed = JSON.parse(r.stdout.trim() || '[]');
              processes = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              throw new Error('进程枚举输出解析失败');
            }
            return textResult({ processes });
          },
          {},
        ),
    });

    // ===== 系统管理类工具（高危：必须先经用户确认，参数 confirm=true 才执行） =====

    /** 高危操作确认闸门：未确认直接报错，引导智能体先 confirm_user */
    function requireConfirm(args: Record<string, unknown>, what: string): void {
      if (args.confirm !== true) {
        throw new Error(
          `${what} 属于高危操作：必须先向用户确认（建议调用 confirm_user 列出将执行的操作与影响），用户同意后在参数中传 confirm: true 再执行`,
        );
      }
    }

    // -- 卸载应用 --
    ctx.registerTool({
      name: 'computer_uninstall_app',
      description:
        '卸载本机已安装的应用（高危，需用户确认）。先用 computer_list_installed_apps 查到确切应用名，向用户确认后传 confirm: true。' +
        '流程：优先 winget 静默卸载；失败则查卸载注册表用 QuietUninstallString/UninstallString 兜底（可能弹出卸载向导窗口，需用户完成）。' +
        '卸载后可用 computer_list_installed_apps(nameFilter=应用名) 复核是否消失。卸载安全软件/驱动等系统关键组件必须逐项向用户确认',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '应用名称或 winget 包 id（来自 computer_list_installed_apps / winget list）' },
          confirm: { type: 'boolean', description: '必须先向用户确认后传 true' },
        },
        required: ['target', 'confirm'],
      },
      execute: (args) => {
        try {
          const target = String(args.target ?? '').trim();
          if (!target) throw new Error('target 不能为空');
          if (/[&|;<>\^%"\n\r*?]/.test(target)) throw new Error('target 含非法字符（不允许 shell 元字符/通配符）');
          requireConfirm(args, `卸载应用「${target}」`);
          if (process.platform !== 'win32') throw new Error('仅支持 Windows');
          return runOp(
            'uninstall_app',
            async () => {
              const tB64 = b64Arg(target);
              const wingetScript = `${PS_BASE}
$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${tB64}'))
winget uninstall --name $target --silent --accept-source-agreements 2>&1 | ForEach-Object { "$_" }
Write-Output ("WINGET_EXIT=" + $LASTEXITCODE)`;
              let r = await ps(ctx.adapter.shell!, wingetScript, 300000);
              if (/WINGET_EXIT=0/.test(r.stdout || '')) {
                return textOut(`OK: winget 已静默卸载「${target}」，建议 computer_list_installed_apps 复核`);
              }
              // 兜底：卸载注册表的 QuietUninstallString / UninstallString
              const regScript = `${PS_BASE}
$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${tB64}'))
$paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
$hit = Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq $target } | Select-Object -First 1
if (-not $hit) { Write-Output 'NOT_FOUND'; exit 1 }
$cmd = if ($hit.QuietUninstallString) { $hit.QuietUninstallString } else { $hit.UninstallString }
if (-not $cmd) { Write-Output 'NO_UNINSTALL_STRING'; exit 1 }
Write-Output ('FOUND' + [string][char]9 + $cmd)
Invoke-Expression $cmd 2>&1 | ForEach-Object { "$_" }
Write-Output ("UNINST_EXIT=" + $LASTEXITCODE)`;
              r = await ps(ctx.adapter.shell!, regScript, 600000);
              const out = (r.stdout || '') + (r.stderr || '');
              if (out.includes('NOT_FOUND')) throw new Error(`winget 与卸载注册表中都未找到「${target}」，请用 computer_list_installed_apps 核对确切名称`);
              if (out.includes('NO_UNINSTALL_STRING')) throw new Error(`「${target}」没有可用的卸载命令，可能需手动卸载`);
              const cmd = out.split(String.fromCharCode(9))[1]?.split('\n')[0] || '';
              return textOut(`OK: 已执行「${target}」的卸载程序${cmd ? `（${cmd.slice(0, 120)}）` : ''}。如弹出向导窗口请用户完成剩余步骤，之后 computer_list_installed_apps 复核`);
            },
            { target },
          );
        } catch (e) {
          return Promise.resolve(errResult(e));
        }
      },
    });

    // -- 安装应用 --
    ctx.registerTool({
      name: 'computer_install_app',
      description:
        '安装应用到本机（高危，需用户确认）。安装来源必须先经用户认可（winget 官方源或用户提供的安装包），传 confirm: true 才执行。' +
        '支持三种方式：① winget 包 id/名称（推荐，静默安装，先 --id 后 --name 自动重试）；② 本地 .msi 绝对路径（msiexec /qn 静默）；' +
        '③ 本地 .exe 绝对路径（必须传 installArgs 提供该安装器的静默参数，如 /S、/verysilent——参数因安装器而异禁止猜测，不确定时改用 winget 或让用户手动完成安装向导）。' +
        '安装完成后建议 computer_list_installed_apps(nameFilter=应用名) 复核',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'winget 包 id/名称，或本地安装包绝对路径（.msi/.exe）' },
          installArgs: { type: 'string', description: '仅本地 .exe 需要：安装器静默参数（如 /S）' },
          confirm: { type: 'boolean', description: '必须先向用户确认后传 true' },
        },
        required: ['target', 'confirm'],
      },
      execute: (args) => {
        try {
          const target = String(args.target ?? '').trim();
          const installArgs = args.installArgs != null ? String(args.installArgs).trim() : '';
          if (!target) throw new Error('target 不能为空');
          requireConfirm(args, `安装应用「${target}」`);
          if (process.platform !== 'win32') throw new Error('仅支持 Windows');
          return runOp(
            'install_app',
            async () => {
              const tB64 = b64Arg(target);
              if (/\.msi$/i.test(target) || /\.exe$/i.test(target)) {
                if (!/^[A-Za-z]:[\\/]/.test(target) && !target.startsWith('\\\\')) throw new Error('本地安装包必须用绝对路径');
                if (!fs.existsSync(target)) throw new Error(`安装包不存在: ${target}`);
                if (/\.msi$/i.test(target)) {
                  const script = `${PS_BASE}
$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${tB64}'))
Start-Process msiexec.exe -ArgumentList '/i', ('"' + $p + '"'), '/qn' -Wait -PassThru | ForEach-Object { Write-Output ("MSI_EXIT=" + $_.ExitCode) }`;
                  const r = await ps(ctx.adapter.shell!, script, 600000);
                  const code = (r.stdout || '').match(/MSI_EXIT=(-?\d+)/)?.[1];
                  if (code === '0') return textOut(`OK: msiexec 静默安装完成: ${target}，建议 computer_list_installed_apps 复核`);
                  throw new Error(`msiexec 退出码 ${code ?? '未知'}（可能需管理员权限，或该包不支持静默安装）: ${(r.stderr || '').slice(-200)}`);
                }
                if (!installArgs) {
                  throw new Error('.exe 安装器的静默参数因产品而异（/S、/verysilent、/qn 等），禁止猜测：请先确认安装器类型并传 installArgs，或改用 winget，或让用户手动完成安装向导');
                }
                if (/[&|;<>\^%\n\r]/.test(installArgs)) throw new Error('installArgs 含非法字符');
                const script = `${PS_BASE}
$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${tB64}'))
$a = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64Arg(installArgs)}'))
Start-Process -FilePath $p -ArgumentList $a -Wait -PassThru | ForEach-Object { Write-Output ("EXE_EXIT=" + $_.ExitCode) }`;
                const r = await ps(ctx.adapter.shell!, script, 600000);
                const code = (r.stdout || '').match(/EXE_EXIT=(-?\d+)/)?.[1] ?? '未知';
                return textOut(`OK: 已执行安装器（退出码 ${code}）: ${target}，建议 computer_list_installed_apps 复核`);
              }
              // winget（先 --id 后 --name）
              const mk = (selector: string) => `${PS_BASE}
$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${tB64}'))
winget install ${selector} $target --silent --accept-package-agreements --accept-source-agreements 2>&1 | ForEach-Object { "$_" }
Write-Output ("WINGET_EXIT=" + $LASTEXITCODE)`;
              let r = await ps(ctx.adapter.shell!, mk('--id'), 600000);
              if (!/WINGET_EXIT=0/.test(r.stdout || '')) r = await ps(ctx.adapter.shell!, mk('--name'), 600000);
              if (/WINGET_EXIT=0/.test(r.stdout || '')) return textOut(`OK: winget 静默安装完成: ${target}，建议 computer_list_installed_apps 复核`);
              throw new Error(`winget 安装失败: ${((r.stdout || '') + (r.stderr || '')).slice(-400)}`);
            },
            { target, installArgs: installArgs || undefined },
          );
        } catch (e) {
          return Promise.resolve(errResult(e));
        }
      },
    });

    // -- 强制删除 --
    ctx.registerTool({
      name: 'computer_force_delete',
      description:
        '强制删除文件/目录（高危且不可恢复——不进回收站，需用户确认并逐条列出路径）。用于普通删除失败的场景：卸载残留、拒绝访问、被占用目录。' +
        '流程：Remove-Item -Force 失败后 takeown + icacls 接管权限再删。' +
        '护栏：仅接受单个绝对路径（禁止通配符 * ?）；禁止删除驱动器根目录、C:\\Windows 整棵子树、用户主目录/桌面/下载/文档目录本身；删除前请用户关闭占用该文件的程序',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要删除的文件或目录绝对路径（单个，无通配符）' },
          confirm: { type: 'boolean', description: '必须先向用户确认后传 true' },
        },
        required: ['path', 'confirm'],
      },
      execute: (args) => {
        try {
          const p = String(args.path ?? '').trim();
          if (!p) throw new Error('path 不能为空');
          if (/[*?]/.test(p)) throw new Error('禁止通配符（* ?），一次只能删一个明确路径');
          if (!/^[A-Za-z]:[\\/]/.test(p) && !p.startsWith('\\\\')) throw new Error('仅支持绝对路径（盘符或 UNC）');
          requireConfirm(args, `强制删除「${p}」（不可恢复，不进回收站）`);
          if (process.platform !== 'win32') throw new Error('仅支持 Windows');
          const norm = p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
          const segs = norm.split('\\').filter(Boolean);
          if (segs.length <= 1) throw new Error(`禁止删除驱动器根目录: ${p}`);
          const prof = (os.homedir() || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
          const denyExact = new Set<string>([
            'c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata', 'c:\\users',
            ...(prof ? [prof, `${prof}\\desktop`, `${prof}\\documents`, `${prof}\\downloads`] : []),
          ]);
          if (denyExact.has(norm)) throw new Error(`禁止删除系统/用户基础目录本身: ${p}（可删除其内部的具体文件/子目录）`);
          if (prof && (prof === norm || prof.startsWith(norm + '\\'))) throw new Error('禁止删除用户主目录及其上级目录');
          if (segs[0] === 'c:' && segs[1] === 'windows') throw new Error('禁止删除 C:\\Windows 子树（系统文件）；系统盘清理请用磁盘清理/存储感知');
          return runOp(
            'force_delete',
            async () => {
              const pB64 = b64Arg(p);
              const script = `${PS_BASE}
$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${pB64}'))
if (-not (Test-Path -LiteralPath $p)) { Write-Output 'NOT_FOUND'; exit 0 }
$ErrorActionPreference = 'Continue'
Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
if (-not (Test-Path -LiteralPath $p)) { Write-Output 'OK_PLAIN'; exit 0 }
takeown /f "$p" /r /d y | Out-Null
icacls "$p" /grant "*S-1-5-32-544:(OI)(CI)F" /t /c | Out-Null
Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
if (-not (Test-Path -LiteralPath $p)) { Write-Output 'OK_FORCED' } else { Write-Output 'STILL_EXISTS' }`;
              const r = await ps(ctx.adapter.shell!, script, 300000);
              const out = (r.stdout || '').trim();
              if (out.includes('NOT_FOUND')) return textOut(`OK: 路径本就不存在: ${p}`);
              if (out.includes('OK_PLAIN')) return textOut(`OK: 已删除: ${p}`);
              if (out.includes('OK_FORCED')) return textOut(`OK: 已接管权限并强制删除: ${p}`);
              throw new Error(`删除失败（文件可能被程序独占占用）：${p}。请让用户关闭占用程序（或重启电脑）后重试；可用 computer_list_processes 查相关进程`);
            },
            { path: p },
          );
        } catch (e) {
          return Promise.resolve(errResult(e));
        }
      },
    });

    // -- 注册表键/值删除（残留清理） --
    ctx.registerTool({
      name: 'computer_registry_delete',
      description:
        '删除注册表键或值（高危，需用户确认），主要用于卸载残留清理等场景。删除前自动导出 .reg 备份到 DATA_DIR/registry-backups/（误删可双击 .reg 恢复）。' +
        '护栏：仅支持 HKLM:\\ 与 HKCU:\\ 下的具体子键（完整路径）；禁止 SYSTEM/SAM/SECURITY/HARDWARE 等关键子树与根节点/聚合节点本身；一次只删一个键或一个值，禁止通配符；已运行程序不受影响，需重启才生效',
      inputSchema: {
        type: 'object',
        properties: {
          keyPath: { type: 'string', description: '注册表键完整路径，如 HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{GUID}' },
          valueName: { type: 'string', description: '可选：只删该键下的某个值（不传则删除整个键及子键）' },
          confirm: { type: 'boolean', description: '必须先向用户确认后传 true' },
        },
        required: ['keyPath', 'confirm'],
      },
      execute: (args) => {
        try {
          const kp = String(args.keyPath ?? '').trim();
          const vn = args.valueName != null ? String(args.valueName).trim() : '';
          if (!kp) throw new Error('keyPath 不能为空');
          if (/[*?]/.test(kp)) throw new Error('禁止通配符');
          if (!/^HK(LM|CU):\\/i.test(kp)) throw new Error('仅支持 HKLM:\\ 与 HKCU:\\ 开头的键路径（HKCR/HKU 暂不开放）');
          requireConfirm(args, `删除注册表${vn ? `值「${kp}」下的「${vn}」` : `键「${kp}」及其全部子键`}（删除前自动导出 .reg 备份）`);
          if (process.platform !== 'win32') throw new Error('仅支持 Windows');
          const norm = kp.replace(/\//g, '\\').replace(/\\+$/, '');
          const normL = norm.toLowerCase();
          const denyPrefix = ['hklm:\\system', 'hklm:\\sam', 'hklm:\\security', 'hklm:\\hardware', 'hklm:\\bcd00000000'];
          if (denyPrefix.some((d) => normL.startsWith(d))) throw new Error(`禁止操作系统关键子树: ${kp}`);
          const denyRoots = [
            'hklm:', 'hklm:\\', 'hklm:\\software', 'hklm:\\software\\microsoft',
            'hklm:\\software\\microsoft\\windows', 'hklm:\\software\\microsoft\\windows\\currentversion',
            'hklm:\\software\\wow6432node', 'hklm:\\software\\classes',
            'hkcu:', 'hkcu:\\', 'hkcu:\\software', 'hkcu:\\software\\microsoft', 'hkcu:\\software\\classes',
          ];
          if (denyRoots.includes(normL)) throw new Error('禁止删除根节点/关键聚合节点本身，请指定到具体应用或设置的子键');
          const depth = normL.replace(/^hk(lm|cu):\\/, '').split('\\').filter(Boolean).length;
          if (depth < 2) throw new Error('路径层级过浅，请指定到更具体的子键');
          return runOp(
            'registry_delete',
            async () => {
              const backupDir = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'registry-backups') : path.resolve('registry-backups');
              fs.mkdirSync(backupDir, { recursive: true });
              const safeName = norm.replace(/[:\\]/g, '_').slice(-120) || 'key';
              const backupFile = path.join(backupDir, `${safeName}-${Date.now()}.reg`);
              const kB64 = b64Arg(norm);
              const bkB64 = b64Arg(backupFile);
              const vB64 = b64Arg(vn);
              const script = `${PS_BASE}
$k = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${kB64}'))
$bk = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${bkB64}'))
$vn = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${vB64}'))
if (-not (Test-Path -LiteralPath $k)) { Write-Output 'NOT_FOUND'; exit 0 }
$kReg = $k.Replace('HKLM:\\', 'HKLM\\').Replace('HKCU:\\', 'HKCU\\')
reg.exe export "$kReg" "$bk" /y | Out-Null
if (-not (Test-Path -LiteralPath $bk)) { Write-Output 'BACKUP_FAILED'; exit 1 }
if ($vn) { Remove-ItemProperty -LiteralPath $k -Name $vn -Force -ErrorAction Stop }
else { Remove-Item -LiteralPath $k -Recurse -Force -ErrorAction Stop }
if (Test-Path -LiteralPath $k) { Write-Output 'STILL_EXISTS' } else { Write-Output 'DELETED' }`;
              const r = await ps(ctx.adapter.shell!, script, 120000);
              const out = (r.stdout || '').trim();
              if (out.includes('NOT_FOUND')) return textOut(`OK: 注册表键本就不存在: ${kp}`);
              if (out.includes('BACKUP_FAILED')) throw new Error(`删除前备份导出失败，已中止删除: ${kp}`);
              if (out.includes('DELETED')) return textOut(`OK: 已删除${vn ? `值 ${vn} @ ` : ''}${kp}。备份（可双击恢复）: ${backupFile}`);
              if (out.includes('STILL_EXISTS')) throw new Error(`删除未生效（可能被系统占用或权限不足）: ${kp}`);
              throw new Error(`删除失败: ${kp}，输出: ${((r.stdout || '') + (r.stderr || '')).slice(-200)}`);
            },
            { keyPath: kp, valueName: vn || undefined },
          );
        } catch (e) {
          return Promise.resolve(errResult(e));
        }
      },
    });

    ctx.log(`computer-use 插件已激活（maxOps=${maxOps}/10min，allowSelfWindowClick=${allowSelfWindowClick}），注册 16 个 computer_* 工具（含 4 个需确认的系统管理工具）`);
  },
  deactivate: async () => {
    // 停止清理器（临时截图文件保留到下次启用再回收，避免禁用期间误删用户还想看的图）
    if (reapTimer) { clearInterval(reapTimer); reapTimer = null; }
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
