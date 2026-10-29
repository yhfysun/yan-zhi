/**
 * 插件桌面窗口 + 桌面外壳（openspec/changes/desktop-manager P0-0）。
 *
 * 这一层是**通用能力**，与「桌面管理」业务无关：
 *  · resolvePluginWindowRequest —— 校验插件窗口请求（插件 id / 入口白名单 / 权限）
 *  · createIconSession          —— 系统图标显隐的会话状态机（谁隐藏的、谁负责恢复）
 *  · HELPER_CS                  —— Win32 助手（Progman/WorkerW/SetParent/图标显隐），
 *                                 由 main.cjs 用 csc 运行时编译（与 GDI 抓屏同一条管线）
 *
 * ★ 本文件保持零 electron 依赖（纯 node + 字符串常量），供 node --test 直接测。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { safeJoin, pluginDirCandidates, PLUGIN_ID_RE } = require('./plugin-protocol.cjs');

const PLACEMENTS = new Set(['desktop', 'overlay', 'normal']);
const ENTRY_RE = /\.html?$/i;
const REQUIRED_PERM = 'desktop-shell';

/**
 * 校验插件窗口请求。
 * @param dirs { builtin: string, installed: string } —— 插件包根目录（测试可注入）
 * @param opts { pluginId, entry, placement }
 * @returns {{ok:true, pluginId, entry, placement, url, absPath, manifest}|{ok:false, error}}
 */
function resolvePluginWindowRequest(dirs, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const pluginId = String(o.pluginId || '');
  const entry = String(o.entry || '');
  const placement = String(o.placement || 'normal');

  if (!PLUGIN_ID_RE.test(pluginId)) return { ok: false, error: 'invalid-plugin-id' };
  if (!PLACEMENTS.has(placement)) return { ok: false, error: 'invalid-placement' };
  if (!entry || path.isAbsolute(entry) || !ENTRY_RE.test(entry)) {
    return { ok: false, error: 'invalid-entry' };
  }

  const bases = [dirs && dirs.installed, dirs && dirs.builtin].filter(Boolean);
  for (const base of bases) {
    const dir = path.join(base, pluginId);
    const manifestFile = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestFile)) continue;

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    } catch {
      return { ok: false, error: 'bad-manifest' };
    }
    const perms = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    if (!perms.includes(REQUIRED_PERM)) return { ok: false, error: 'permission-denied' };

    const absPath = safeJoin(dir, entry);
    if (!absPath) return { ok: false, error: 'entry-outside-plugin' };
    if (!fs.existsSync(absPath)) return { ok: false, error: 'entry-not-found' };

    return {
      ok: true,
      pluginId,
      entry,
      placement,
      absPath,
      url: 'yz://plugin/' + pluginId + '/' + entry.replace(/^\/+/, ''),
      manifest,
    };
  }
  return { ok: false, error: 'plugin-not-installed' };
}

/** 插件目录候选（main.cjs 用；测试直接传 dirs 绕过） */
function resolveDirsFor({ mainDir, resourcesPath, isPackaged }) {
  return pluginDirCandidates({ mainDir, resourcesPath, isPackaged });
}

/** 助手输出解析：取最后一行非空 JSON；失败返回 null（绝不抛） */
function parseHelperLine(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const v = JSON.parse(lines[i]);
      if (v && typeof v === 'object') return v;
    } catch { /* 继续往前找 */ }
  }
  return null;
}

/**
 * 系统图标显隐的会话状态机。
 *
 * 规则（对应设计 §3.4）：
 *  · 只有「本会话把图标从可见切到隐藏」才认领所有权（hiddenByUs=true）；
 *  · 启动时已是隐藏且不是我们干的 → 只记录 hiddenAtStartup，**退出时不恢复**（否则会替别人改桌面）；
 *  · 用户/插件显式要求显示 → 无论谁隐藏的都可以恢复，并清空所有权。
 */
function createIconSession() {
  return {
    hiddenByUs: false,
    hiddenAtStartup: false,
    /** 启动自检：已是隐藏且非本会话所为 → 记下来，不认领 */
    noteStartup(currentVisible) {
      if (currentVisible === false && !this.hiddenByUs) this.hiddenAtStartup = true;
    },
    /** 申请隐藏：当前可见才认领（返回是否发生了切换） */
    onHideRequested(currentVisible) {
      if (currentVisible) {
        this.hiddenByUs = true;
        this.hiddenAtStartup = false;
        return true;
      }
      return false;
    },
    /** 申请显示：当前隐藏才需要切换 */
    onShowRequested(currentVisible) {
      if (currentVisible) return false;
      this.hiddenByUs = false;
      this.hiddenAtStartup = false;
      return true;
    },
    shouldRestore() {
      return this.hiddenByUs;
    },
    markRestored() {
      this.hiddenByUs = false;
      this.hiddenAtStartup = false;
    },
  };
}

/** yz-desktop.exe 源码（csc 运行时编译，输出 JSON 行） */
const HELPER_CS = String.raw`
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32;

class YzDesktop {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string win);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string win);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  delegate bool EnumProc(IntPtr h, IntPtr l);

  [StructLayout(LayoutKind.Sequential)]
  struct RECT { public int L; public int T; public int R; public int B; }

  [StructLayout(LayoutKind.Sequential)]
  struct MONITORINFO {
    public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
  }

  /** 前台窗口是否铺满所在显示器（用于悬浮层组件自动隐藏） */
  static bool ForegroundFullscreen() {
    try {
      IntPtr fg = GetForegroundWindow();
      if (fg == IntPtr.Zero) return false;
      RECT r;
      if (!GetWindowRect(fg, out r)) return false;
      IntPtr mon = MonitorFromWindow(fg, 2); // MONITOR_DEFAULTTONEAREST
      MONITORINFO mi = new MONITORINFO();
      mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      if (!GetMonitorInfo(mon, ref mi)) return false;
      return r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
    } catch { return false; }
  }

  const uint WM_COMMAND = 0x0111;
  const uint CMD_TOGGLE_DESKTOP_ICONS = 0x7402;
  const uint MSG_SPAWN_WORKERW = 0x052C;

  static IntPtr Progman() { return FindWindow("Progman", null); }

  static IntPtr DefView() {
    IntPtr p = Progman();
    if (p != IntPtr.Zero) {
      IntPtr v = FindWindowEx(p, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (v != IntPtr.Zero) return v;
    }
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      IntPtr v = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (v != IntPtr.Zero) { found = v; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  static IntPtr ListView() {
    IntPtr v = DefView();
    if (v == IntPtr.Zero) return IntPtr.Zero;
    return FindWindowEx(v, IntPtr.Zero, "SysListView32", "FolderView");
  }

  static IntPtr FindWorkerW() {
    IntPtr result = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      IntPtr v = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (v != IntPtr.Zero) {
        IntPtr w = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
        if (w != IntPtr.Zero) { result = w; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }

  static void SpawnWorkerW() {
    IntPtr p = Progman();
    if (p == IntPtr.Zero) return;
    IntPtr dummy;
    SendMessageTimeout(p, MSG_SPAWN_WORKERW, IntPtr.Zero, IntPtr.Zero, 0, 1500, out dummy);
    System.Threading.Thread.Sleep(120);
  }

  static bool IconsHidden() {
    try {
      using (RegistryKey k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced")) {
        if (k == null) return false;
        object v = k.GetValue("HideIcons");
        return v != null && Convert.ToInt32(v) == 1;
      }
    } catch { return false; }
  }

  static void ToggleIcons() {
    IntPtr target = DefView();
    if (target == IntPtr.Zero) target = Progman();
    if (target == IntPtr.Zero) return;
    IntPtr dummy;
    SendMessageTimeout(target, WM_COMMAND, (IntPtr)CMD_TOGGLE_DESKTOP_ICONS, IntPtr.Zero, 0, 1500, out dummy);
  }

  static void Emit(string s) { Console.Out.WriteLine(s); }
  static long H(IntPtr p) { return p.ToInt64(); }

  static int Main(string[] args) {
    string cmd = args.Length > 0 ? args[0] : "";
    switch (cmd) {
      case "--progman":
        Emit("{\"progman\":" + H(Progman()) + ",\"defView\":" + H(DefView()) + ",\"listView\":" + H(ListView()) + ",\"workerW\":" + H(FindWorkerW()) + "}");
        return 0;

      case "--spawn-workerw": {
        SpawnWorkerW();
        IntPtr w = FindWorkerW();
        Emit("{\"workerW\":" + H(w) + "}");
        return w == IntPtr.Zero ? 3 : 0;
      }

      case "--pin": {
        if (args.Length < 2) { Emit("{\"ok\":false,\"error\":\"missing-hwnd\"}"); return 2; }
        long raw;
        if (!Int64.TryParse(args[1], out raw)) { Emit("{\"ok\":false,\"error\":\"bad-hwnd\"}"); return 2; }
        IntPtr hwnd = new IntPtr(raw);
        if (!IsWindow(hwnd)) { Emit("{\"ok\":false,\"error\":\"not-a-window\"}"); return 2; }
        IntPtr w = FindWorkerW();
        if (w == IntPtr.Zero) { SpawnWorkerW(); w = FindWorkerW(); }
        if (w == IntPtr.Zero) { Emit("{\"ok\":false,\"error\":\"worker-w-not-found\"}"); return 3; }
        SetParent(hwnd, w);
        bool ok = GetParent(hwnd) == w;
        Emit("{\"ok\":" + (ok ? "true" : "false") + ",\"workerW\":" + H(w) + "}");
        return ok ? 0 : 4;
      }

      case "--unpin": {
        if (args.Length < 2) { Emit("{\"ok\":false,\"error\":\"missing-hwnd\"}"); return 2; }
        long raw2;
        if (!Int64.TryParse(args[1], out raw2)) { Emit("{\"ok\":false,\"error\":\"bad-hwnd\"}"); return 2; }
        SetParent(new IntPtr(raw2), IntPtr.Zero);
        Emit("{\"ok\":true}");
        return 0;
      }

      case "--icons-visible":
        Emit("{\"visible\":" + (IconsHidden() ? "false" : "true") + "}");
        return 0;

      case "--foreground":
        Emit("{\"hwnd\":" + H(GetForegroundWindow()) + ",\"fullscreen\":" + (ForegroundFullscreen() ? "true" : "false") + "}");
        return 0;

      case "--toggle-icons": {
        bool want = args.Length > 1 && args[1] == "1";
        bool hidden = IconsHidden();
        if (hidden == want) ToggleIcons();
        System.Threading.Thread.Sleep(80);
        Emit("{\"visible\":" + (IconsHidden() ? "false" : "true") + "}");
        return 0;
      }

      default:
        Emit("{\"error\":\"unknown-command\"}");
        return 2;
    }
  }
}
`;

module.exports = {
  PLACEMENTS,
  REQUIRED_PERM,
  resolvePluginWindowRequest,
  resolveDirsFor,
  parseHelperLine,
  createIconSession,
  HELPER_CS,
};
