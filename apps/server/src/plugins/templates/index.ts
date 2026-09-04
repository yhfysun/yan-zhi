// 内置插件源码模板：导出功能的数据源。
// 内置插件以内存模块注册，运行时无法反序列化源码，故在此维护与源码同步的模板副本。
// 注意：修改对应插件源码时须同步更新此处的模板字符串。
import type { PluginManifest } from '@yan-zhi/core';

export interface PluginTemplate {
  manifest: PluginManifest;
  /** 插件主入口源码（TypeScript） */
  code: string;
  readme: string;
}

const GIT_EXPLORER_CODE = `// git-explorer 内置插件：manifest + 入口模块（注册 git 工具供 LLM 调用）
import type { PluginManifest, PluginModule } from '@yan-zhi/core';
import { gitService } from '../services/git.js';

export const gitExplorerManifest: PluginManifest = {
  id: 'git-explorer',
  name: 'Git 文件管理',
  version: '1.0.0',
  description: '文件树浏览、Git 状态/差异/提交管理，对话中可打开目录',
  permissions: ['fs', 'shell', 'git'],
  contributes: {
    tools: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_file_tree'],
  },
};

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export const gitExplorerModule: PluginModule = {
  activate: (ctx) => {
    ctx.registerTool({
      name: 'git_status',
      description: '获取指定 Git 仓库的当前状态（变更文件、暂存区等）',
      inputSchema: {
        type: 'object',
        properties: { repo: { type: 'string', description: '仓库绝对路径' } },
        required: ['repo'],
      },
      execute: async (args) => textResult(await gitService.status(String(args.repo))),
    });

    ctx.registerTool({
      name: 'git_diff',
      description: '获取 Git 差异内容',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          file: { type: 'string', description: '指定文件路径（可选）' },
          staged: { type: 'boolean', description: '是否仅看暂存区差异' },
        },
        required: ['repo'],
      },
      execute: async (args) =>
        textResult(
          await gitService.diff(String(args.repo), {
            file: args.file as string | undefined,
            staged: !!args.staged,
          }),
        ),
    });

    ctx.registerTool({
      name: 'git_log',
      description: '获取 Git 提交历史',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          branch: { type: 'string' },
          n: { type: 'number', description: '条数，默认 50' },
        },
        required: ['repo'],
      },
      execute: async (args) =>
        textResult(
          await gitService.log(String(args.repo), {
            branch: args.branch as string | undefined,
            n: args.n as number | undefined,
          }),
        ),
    });

    ctx.registerTool({
      name: 'git_commit',
      description: '提交变更到 Git 仓库',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          message: { type: 'string', description: '提交信息' },
          files: { type: 'array', items: { type: 'string' }, description: '要暂存并提交的文件（可选，不传则提交所有已暂存）' },
        },
        required: ['repo', 'message'],
      },
      execute: async (args) => {
        await gitService.commit(String(args.repo), String(args.message), args.files as string[] | undefined);
        return textResult({ ok: true });
      },
    });

    ctx.registerTool({
      name: 'git_file_tree',
      description: '获取仓库目录文件树（带 Git 状态标注）',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          path: { type: 'string', description: '子目录相对路径（可选）' },
        },
        required: ['repo'],
      },
      execute: async (args) =>
        textResult(await gitService.fileTree(String(args.repo), (args.path as string) || '')),
    });

    ctx.log('git-explorer 插件已激活，注册 5 个 git 工具');
  },
};
`;

const SCAFFOLD_CODE = `// 插件脚手架：复制本文件到 apps/server/src/plugins/<你的插件id>.ts，
// 在 apps/server/src/index.ts 中 registerBuiltin 注册即可。
// 已安装插件（.yzp）则只需 manifest.json + 编译后的 main 入口 JS。
import type { PluginManifest, PluginModule } from '@yan-zhi/core';

export const myPluginManifest: PluginManifest = {
  id: 'my-plugin',            // kebab-case，全局唯一
  name: '我的插件',
  version: '0.1.0',
  description: '一句话说明插件能力',
  // 可选权限：fs | shell | git | db | network | clipboard | desktop-input
  permissions: [],
  // 向 LLM 声明本插件注册的工具名（文档性，实际注册在 activate 里）
  contributes: {
    tools: ['my_tool_hello'],
  },
};

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export const myPluginModule: PluginModule = {
  activate: (ctx) => {
    // 1. 注册工具（LLM 可调用的执行体）
    ctx.registerTool({
      name: 'my_tool_hello',
      description: '示例工具：返回问候语',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: '要问候的名字' } },
        required: ['name'],
      },
      execute: async (args) => textResult({ hello: String(args.name) }),
    });

    // 2. 可选：挂后端 HTTP 路由（挂载在 /api/plugin/my-plugin/*）
    // ctx.registerBackendRoute((app) => {
    //   app.get('/ping', (_req: unknown, res: { json: (d: unknown) => void }) => res.json({ pong: true }));
    // });

    // 3. 可选：插件私有存储（按 plugin_id 持久化 KV）
    // await ctx.storage.set('lastRun', Date.now());
    // const last = await ctx.storage.get<number>('lastRun');

    // 4. 可选：事件（emit 发出，on 订阅；插件禁用时 dispose）
    // const off = ctx.on('some-event', (payload) => ctx.log('收到事件', payload));

    ctx.log('my-plugin 已激活');
  },
  deactivate: () => {
    // 清理非 Disposable 管理的资源（registerTool/registerBackendRoute 返回的句柄会自动 dispose）
  },
};
`;

const SCAFFOLD_README = `# yan-zhi 插件开发模板

## 两种形态
1. **内置插件**（源码随主程序）：把 main.ts 复制到 \`apps/server/src/plugins/<id>.ts\`，
   在 \`apps/server/src/index.ts\` 中 \`mgr.registerBuiltin(manifest, module)\` 注册。
2. **安装插件**（.yzp 包）：zip 包含 \`manifest.json\` + \`main\` 指定的入口 JS（CommonJS 或 ESM），
   在「插件管理」页安装。入口通过 \`module.exports\` / \`export\` 提供 \`{ activate, deactivate? }\`。

## PluginContext API（activate 注入）
- \`ctx.registerTool(def)\` — 注册 LLM 可调用工具，\`def.execute\` 返回 \`{ content: [{ type: 'text', text }] }\`
- \`ctx.registerBackendRoute(setup)\` — 挂后端路由，运行在 \`/api/plugin/<id>/*\`
- \`ctx.storage.get/set/delete\` — 按 plugin_id 持久化 KV
- \`ctx.adapter\` — 受权限过滤的平台能力（fs/shell/db 等，未声明的权限会被屏蔽）
- \`ctx.config\` — 插件配置（管理页「配置」编辑的 JSON）
- \`ctx.emit / ctx.on\` — 事件
- \`ctx.log\` — 日志

## 权限
manifest.permissions 声明后生效：fs / shell / git / db / network / clipboard / desktop-input。
desktop-input 允许控制本机鼠标键盘与截屏，属高危权限，启用时需用户确认。

## 参考实现
内置插件 git-explorer：注册工具 + 调用 service 的标准写法（可在插件管理页导出查看）。
`;

// === generated:computer-use:start（由 scripts/sync-plugin-templates.mjs 生成，勿手改） ===
const COMPUTER_USE_CODE = `// computer-use 内置插件：智能体操作本机（鼠标/键盘/窗口/截图）。
// 形态与 git-explorer 一致（manifest + 入口模块），默认 disabled 注册，需在插件管理页手动开启。
// 实现：Windows PowerShell(-EncodedCommand) + Win32 P/Invoke，零原生依赖；nut-js 适配器留待后续。
// 护栏：desktop-input 权限声明 / 10 分钟滚动窗口操作上限 / 危险组合键与命令黑名单 /
//       本应用自身窗口点击默认拒绝 / 全操作审计（plugin_storage.audit）。
import path from 'node:path';
import type { McpCallResult, PluginManifest, PluginModule } from '@yan-zhi/core';
import type { ShellAdapter } from '@yan-zhi/core';
import { db } from '../db.js';

export const computerUseManifest: PluginManifest = {
  id: 'computer-use',
  name: '电脑使用',
  version: '0.1.0',
  description:
    '智能体可操作本机软件：鼠标点击、键盘输入/快捷键、窗口激活、截屏、启动应用（Windows 全量支持；macOS 基础支持需辅助功能权限；默认关闭，需手动开启）',
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
/** 急停标志：Ctrl+Alt+Esc（桌面端 globalShortcut → POST /panic）触发后置位并禁用插件 */
let panicActive = false;

const OP_WINDOW_MS = 10 * 60 * 1000;

function checkLimit(): void {
  if (panicActive) throw new Error('急停已触发（Ctrl+Alt+Esc），输入工具已冻结。请在「插件管理」页手动重新启用插件');
  const now = Date.now();
  if (now - lastOpAt > OP_WINDOW_MS) opCount = 0;
  if (opCount >= maxOps) {
    throw new Error(\`输入操作已达上限（\${maxOps} 次 / 10 分钟）。请稍后重试，或在插件配置中调整 maxOps 后重新启用插件。\`);
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
  if (DENIED_KEY_COMBOS.has(norm)) throw new Error(\`组合键 "\${norm}" 在黑名单中，已拒绝\`);
}

function assertAppAllowed(target: string): void {
  const t = target.trim();
  if (!t) throw new Error('target 不能为空');
  if (/[&|;<>\\^%"\\n\\r]/.test(t)) throw new Error('target 含非法字符（不允许 shell 元字符）');
  const base = path.basename(t, '.exe').toLowerCase();
  if (DENIED_APPS.has(base)) throw new Error(\`应用 "\${base}" 在黑名单中，已拒绝\`);
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
const PS_BASE = \`$ErrorActionPreference = 'Stop'
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
      sb.Append(pid).Append('\\\\t').Append(t).Append('\\\\t').Append(r.L).Append(',').Append(r.T).Append(',').Append(r.R).Append(',').Append(r.B).Append('\\\\n');
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
        found = pid + "\\\\t" + t;
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
'@\`;

/** 文本参数统一走 base64 传输，规避 shell:true 拼参引号/注入问题 */
function b64Arg(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

function numArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(\`参数 \${name} 必须是数字\`);
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
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return shell.exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
    { timeout },
  );
}

// ---------- macOS 执行层（osascript / screencapture / open，需系统授予辅助功能权限） ----------
const MAC = process.platform === 'darwin';

async function osa(shell: ShellAdapter, script: string, timeout = 15000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const r = await shell.exec('osascript', ['-e', script], { timeout });
  if (r.exitCode !== 0 && /assistive|accessib|not allowed/i.test(r.stderr)) {
    throw new Error(\`macOS 辅助功能权限未授予：系统设置 → 隐私与安全性 → 辅助功能，允许本应用后重试\`);
  }
  return r;
}

function osaStr(s: string): string {
  return s.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
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
    if (MAC_KEYCODE[k] != null) action = \`key code \${MAC_KEYCODE[k]}\`;
    else if (k.length === 1) action = \`keystroke "\${osaStr(k)}"\`;
    else throw new Error(\`不支持的按键: \${raw}\`);
  }
  if (!action) throw new Error('keys 不能为空');
  return \`tell application "System Events" to \${action}\${mods.length ? \` using {\${mods.join(', ')}}\` : ''}\`;
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
    .map(() => \`[CU]::mouse_event(\${down},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 40; [CU]::mouse_event(\${up},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60;\`)
    .join('\\n');
  return \`\${PS_BASE}
$selfNames = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('\${b64Arg(JSON.stringify(selfProcNames()))}')) | ConvertFrom-Json
$allowSelf = \${allowSelfWindowClick ? '$true' : '$false'}
$hit = [CU]::RectAt(\${x}, \${y})
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
[CU]::SetCursorPos(\${x}, \${y}) | Out-Null
Start-Sleep -Milliseconds 80
\${press}
Write-Output 'OK'\`;
}

export const computerUseModule: PluginModule = {
  activate: (ctx) => {
    panicActive = false;
    maxOps = Number((ctx.config as Record<string, unknown> | undefined)?.maxOps) || 200;
    allowSelfWindowClick = !!(ctx.config as Record<string, unknown> | undefined)?.allowSelfWindowClick;

    // 后端路由：/api/plugin/computer-use/*
    // POST /panic —— 急停入口（桌面端 globalShortcut Ctrl+Alt+Esc 调用）：冻结输入工具并禁用插件（恢复=手动重新启用）
    // GET  /audit —— 操作审计记录（插件页「记录」按钮）
    ctx.registerBackendRoute((raw) => {
      const r = raw as {
        post: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
        get: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
      };
      r.post('/panic', (_req, res) => {
        panicActive = true;
        ctx.log('!!! 急停触发（Ctrl+Alt+Esc）：输入工具已冻结，插件即将禁用');
        void import('@yan-zhi/core')
          .then(({ getPluginManager }) => getPluginManager().disable('computer-use'))
          .catch(() => undefined);
        res.json({ data: { ok: true, message: '急停已生效，computer-use 插件已禁用（可在插件管理页重新启用）' } });
      });
      r.get('/audit', (_req, res) => {
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
            const file = path.join(dir, \`screenshot-\${Date.now()}.png\`);
            if (MAC) {
              const r = await ctx.adapter.shell!.exec('screencapture', ['-x', file], { timeout: 30000 });
              if (r.exitCode !== 0) throw new Error(\`截屏失败: \${r.stderr || r.stdout}\`);
              return textResult({ file, offsetX: 0, offsetY: 0, note: 'macOS：屏幕坐标与截图像素坐标一致（主屏）' });
            }
            const script = \`Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, (New-Object System.Drawing.Size($b.Width, $b.Height)))
$bmp.Save('\${file}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ('OK' + [string][char]9 + $b.X + [string][char]9 + $b.Y + [string][char]9 + $b.Width + [string][char]9 + $b.Height)\`;
            const r = await ps(ctx.adapter.shell!, script, 30000);
            if (r.exitCode !== 0) throw new Error(\`截屏失败: \${r.stderr || r.stdout}\`);
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
            if (MAC) {
              if (button !== 'left' || double) {
                throw new Error('macOS 适配 v1 仅支持左键单击（右键/双击暂不支持）');
              }
              const r = await osa(ctx.adapter.shell!, \`tell application "System Events" to click at {\${x}, \${y}}\`);
              if (r.exitCode !== 0) throw new Error(\`点击失败: \${r.stderr || r.stdout}\`);
              return textOut(\`OK: click @ (\${x}, \${y})\`);
            }
            const r = await ps(ctx.adapter.shell!, clickScript(x, y, button, double));
            if (r.exitCode === 2 || r.stdout.startsWith('BLOCKED')) {
              throw new Error(\`目标点落在本应用自身窗口（\${r.stdout.split(String.fromCharCode(9))[1] || ''}），已拒绝。如确需操作请在插件配置开启 allowSelfWindowClick\`);
            }
            if (r.exitCode !== 0) throw new Error(\`点击失败: \${r.stderr || r.stdout}\`);
            return textOut(\`OK: \${button}\${double ? ' double ' : ' '}click @ (\${x}, \${y})\`);
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
            const r = await ps(ctx.adapter.shell!, \`\${PS_BASE}\\n[CU]::SetCursorPos(\${x}, \${y}) | Out-Null\\nWrite-Output 'OK'\`);
            if (r.exitCode !== 0) throw new Error(\`移动失败: \${r.stderr || r.stdout}\`);
            return textOut(\`OK: moved to (\${x}, \${y})\`);
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
            const script = \`\${PS_BASE}
[CU]::SetCursorPos(\${fx}, \${fy}) | Out-Null
Start-Sleep -Milliseconds 100
[CU]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 120
for ($i = 1; $i -le \${steps}; $i++) {
  $cx = \${fx} + [int]((\${tx} - \${fx}) * $i / \${steps})
  $cy = \${fy} + [int]((\${ty} - \${fy}) * $i / \${steps})
  [CU]::SetCursorPos($cx, $cy) | Out-Null
  Start-Sleep -Milliseconds 15
}
Start-Sleep -Milliseconds 80
[CU]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
Write-Output 'OK'\`;
            const r = await ps(ctx.adapter.shell!, script, 30000);
            if (r.exitCode !== 0) throw new Error(\`拖拽失败: \${r.stderr || r.stdout}\`);
            return textOut(\`OK: dragged (\${fx}, \${fy}) -> (\${tx}, \${ty})\`);
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
            const script = \`\${PS_BASE}
[CU]::SetCursorPos(\${x}, \${y}) | Out-Null
Start-Sleep -Milliseconds 60
for ($i = 0; $i -lt \${notches}; $i++) {
  [CU]::mouse_event(0x0800,0,0,\${delta},[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
}
Write-Output 'OK'\`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(\`滚动失败: \${r.stderr || r.stdout}\`);
            return textOut(\`OK: scrolled \${direction} x\${notches} @ (\${x}, \${y})\`);
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
              if (/[^\\x00-\\x7F]/.test(text)) {
                throw new Error('macOS keystroke 不支持非 ASCII 字符（中文等），请改用剪贴板粘贴');
              }
              const r = await osa(ctx.adapter.shell!, \`tell application "System Events" to keystroke "\${osaStr(text)}"\`);
              if (r.exitCode !== 0) throw new Error(\`键入失败: \${r.stderr || r.stdout}\`);
              return textOut(\`OK: typed \${text.length} chars\`);
            }
            const script = \`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('\${b64Arg(text)}'))
$text = [regex]::Replace($text, '([+^%~(){}\\\\[\\\\]])', '{$1}')
[System.Windows.Forms.SendKeys]::SendWait($text)
Write-Output 'OK'\`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(\`键入失败: \${r.stderr || r.stdout}\`);
            return textOut(\`OK: typed \${text.length} chars\`);
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
                if (r.exitCode !== 0) throw new Error(\`按键失败: \${r.stderr || r.stdout}\`);
                return textOut(\`OK: pressed \${keys.join('+')}\`);
              }
              const sendKeysSeq = buildSendKeys(keys).replace(/'/g, "''");
              const script = \`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('\${sendKeysSeq}')
Write-Output 'OK'\`;
              const r = await ps(ctx.adapter.shell!, script);
              if (r.exitCode !== 0) throw new Error(\`按键失败: \${r.stderr || r.stdout}\`);
              return textOut(\`OK: pressed \${keys.join('+')}\`);
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
            if (MAC) {
              const r = await osa(
                ctx.adapter.shell!,
                'tell application "System Events" to get name of every application process whose background only is false',
              );
              if (r.exitCode !== 0) throw new Error(\`窗口枚举失败: \${r.stderr || r.stdout}\`);
              const names = r.stdout.trim().split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
              return textResult({
                windows: names.map((n) => ({ process: n, title: n })),
                note: 'macOS v1 仅返回前台应用进程名（可将其作为 activate_window 的 title 使用）',
              });
            }
            const script = \`\${PS_BASE}
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
$out | ConvertTo-Json -Compress -Depth 3\`;
            const r = await ps(ctx.adapter.shell!, script);
            if (r.exitCode !== 0) throw new Error(\`窗口枚举失败: \${r.stderr || r.stdout}\`);
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
            if (MAC) {
              let appName = title || '';
              if (pid != null) {
                const ps1 = await ctx.adapter.shell!.exec('ps', ['-p', String(pid), '-o', 'comm=']);
                if (ps1.exitCode !== 0 || !ps1.stdout.trim()) throw new Error(\`未找到进程 pid=\${pid}\`);
                appName = path.basename(ps1.stdout.trim());
              }
              if (!appName) throw new Error('macOS 激活需要 pid 或应用名（title 参数）');
              const r = await osa(ctx.adapter.shell!, \`tell application "\${osaStr(appName)}" to activate\`);
              if (r.exitCode !== 0) throw new Error(\`激活失败（应用 "\${appName}" 可能未安装或未运行）: \${r.stderr || r.stdout}\`);
              return textOut(\`OK: activated app "\${appName}"\`);
            }
            let script: string;
            if (pid != null) {
              script = \`\${PS_BASE}
$p = Get-Process -Id \${pid} -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Output 'NO_WINDOW'; exit 1 }
[CU]::ShowWindow($h, 9) | Out-Null
[CU]::SetForegroundWindow($h) | Out-Null
Write-Output 'OK'\`;
            } else {
              script = \`\${PS_BASE}
$title = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('\${b64Arg(title!)}'))
$ok = [CU]::ActivateByTitle($title)
if (-not $ok) { Write-Output 'NOT_FOUND'; exit 1 }
Write-Output 'OK'\`;
            }
            const r = await ps(ctx.adapter.shell!, script);
            if (r.stdout.includes('NO_WINDOW') || r.stdout.includes('NOT_FOUND') || r.exitCode !== 0) {
              throw new Error(\`未找到目标窗口（pid=\${pid ?? ''} title=\${title ?? ''}）\`);
            }
            return textOut(\`OK: activated \${pid != null ? \`pid \${pid}\` : \`title ~ \${title}\`}\`);
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
                const r = /[/\\\\]/.test(target)
                  ? await ctx.adapter.shell!.exec('open', [target])
                  : await ctx.adapter.shell!.exec('open', ['-a', target]);
                if (r.exitCode !== 0) throw new Error(\`启动失败: \${r.stderr || r.stdout}\`);
                return textOut(\`OK: started \${target}\`);
              }
              const script = \`$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('\${b64Arg(target)}'))
Start-Process -FilePath $target
Write-Output 'OK'\`;
              const r = await ps(ctx.adapter.shell!, script);
              if (r.exitCode !== 0) throw new Error(\`启动失败: \${r.stderr || r.stdout}\`);
              return textOut(\`OK: started \${target}\`);
            },
            { target },
          );
        } catch (e) {
          return Promise.resolve(errResult(e));
        }
      },
    });

    ctx.log(\`computer-use 插件已激活（maxOps=\${maxOps}/10min，allowSelfWindowClick=\${allowSelfWindowClick}），注册 10 个 computer_* 工具\`);
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
    if (/^f([1-9]|1[0-6])$/.test(k)) { seq += \`{\${k.toUpperCase()}}\`; continue; }
    if (k.length === 1) { seq += k; continue; }
    throw new Error(\`不支持的按键: \${raw}\`);
  }
  return seq;
}
`;
// === generated:computer-use:end ===

export const PLUGIN_TEMPLATES: Record<string, PluginTemplate> = {
  'git-explorer': {
    manifest: {
      id: 'git-explorer',
      name: 'Git 文件管理',
      version: '1.0.0',
      description: '文件树浏览、Git 状态/差异/提交管理，对话中可打开目录',
      permissions: ['fs', 'shell', 'git'],
      contributes: { tools: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_file_tree'] },
    },
    code: GIT_EXPLORER_CODE,
    readme: '内置插件 git-explorer 源码：registerTool 注册 git 工具 + 调用 server service 的标准写法。',
  },
  'computer-use': {
    manifest: {
      id: 'computer-use',
      name: '电脑使用',
      version: '0.1.0',
      description:
        '智能体可操作本机软件：鼠标点击、键盘输入/快捷键、窗口激活、截屏、启动应用（Windows 全量支持；macOS 基础支持需辅助功能权限；默认关闭，需手动开启）',
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
    },
    code: COMPUTER_USE_CODE,
    readme: [
      '# computer-use 内置插件源码',
      '',
      '智能体操作本机（鼠标/键盘/窗口/截屏）的完整参考实现，重点可参考：',
      '',
      '- 10 个 `computer_*` 工具的 inputSchema 与 execute 写法',
      '- PowerShell `-EncodedCommand`（UTF-16LE base64）执行系统命令，规避参数注入',
      '- Win32 P/Invoke（Add-Type）：SetCursorPos / mouse_event / EnumWindows / GetWindowRect',
      '- 护栏模式：滚动窗口操作上限（checkLimit）、危险组合键与进程黑名单（BLOCKED_KEYS/BLOCKED_PROCS）、',
      '  自窗点击拒绝（RectAt + 进程名比对）、全操作审计（ctx.storage + ctx.log）',
      '- panic 急停与 /audit 后端路由（registerBackendRoute 挂载在 /api/plugin/computer-use/*）',
      '- macOS osascript 分支（screencapture / cliclick 不可用时的降级路径）',
      '',
      'desktop-input 属高危权限：安装/启用需用户手动确认，智能体无法自行启用。',
    ].join('\n'),
  },
  template: {
    manifest: {
      id: 'my-plugin',
      name: '插件开发模板',
      version: '0.1.0',
      description: '新插件脚手架：registerTool / registerBackendRoute / storage / 事件 用法示例',
      permissions: [],
      contributes: { tools: ['my_tool_hello'] },
    },
    code: SCAFFOLD_CODE,
    readme: SCAFFOLD_README,
  },
};
