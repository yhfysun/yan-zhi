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
  const rawEntry = String(o.entry || '');
  const placement = String(o.placement || 'normal');

  // 入口允许带查询串（如 frontend/widgets.html?layer=desktop）：路径部分照常校验/越界检查，
  // 查询串只拼到最终 URL 上 —— 否则「打开组件」这类带参数的入口会一律 invalid-entry。
  const qi = rawEntry.indexOf('?');
  const entry = qi >= 0 ? rawEntry.slice(0, qi) : rawEntry;
  const query = qi >= 0 ? rawEntry.slice(qi) : '';

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

    const rel = entry.replace(/^\/+/, '');
    // ★ 页面默认走本地 HTTP（与 API 同源）：yz:// 文档里加载自己的子资源会被 Chromium
    //   一律拒绝（模块 import / fetch 全报 Failed to fetch），围栏页因此只剩静态壳。
    //   传了 apiOrigin 就用 http；没传（纯逻辑测试）保持 yz:// 形态。
    const origin = String(o.apiOrigin || '').replace(/\/+$/, '');
    return {
      ok: true,
      pluginId,
      entry: rawEntry,
      placement,
      absPath,
      url: origin
        ? origin + '/api/plugin-assets/' + pluginId + '/' + rel + query
        : 'yz://plugin/' + pluginId + '/' + rel + query,
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
    /**
     * 直接认领隐藏态：桌面层窗口要求隐藏、但当前已是隐藏时用。
     * ★ 不认领会漏掉恢复 —— 页面在 load 时隐藏图标，如果那一刻读到的已是隐藏
     *   （例如上一次崩溃没收尾、或两次隐藏请求交叠），退出时 shouldRestore() 为 false，
     *   用户桌面就停在"没有图标"的状态（2026-10-29 实测踩到）。
     */
    claimHidden() {
      this.hiddenByUs = true;
      this.hiddenAtStartup = false;
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
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Microsoft.Win32;

class YzDesktop {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string win);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string win);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  // ★ 钉桌面层必须先把 WS_POPUP 改成 WS_CHILD：Electron 无边框窗口是 popup，
  //   直接 SetParent 会失败（GetParent 仍为 0），实测就是"钉不上、Win+D 空白"的根因。
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int idx);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int idx, IntPtr val);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  const int GWL_STYLE = -16;
  const long WS_CHILD = 0x40000000L;
  const long WS_POPUP = 0x80000000L;
  const uint SWP_NOSIZE = 0x0001, SWP_NOMOVE = 0x0002, SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010, SWP_FRAMECHANGED = 0x0020;
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr procId);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attachFrom, uint attachTo, bool attach);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetFocus();
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  const uint GA_ROOT = 2;
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  delegate bool EnumProc(IntPtr h, IntPtr l);

  /* ---- 文件图标：SHGetImageList 的 256px 巨图标 ----
     app.getFileIcon 在 Windows 上最大 48px，高 DPI 下按 CSS 像素放大就发虚。
     这里走系统 image list 的 jumbo 档（256px），拿的就是资源管理器自己那张图。 */
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct SHFILEINFO {
    public IntPtr hIcon;
    public int iIcon;
    public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);
  [DllImport("shell32.dll", EntryPoint = "#727")]
  static extern int SHGetImageList(int iImageList, ref Guid riid, out IImageList ppv);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr hIcon);
  const uint SHGFI_ICON = 0x100;
  const uint SHGFI_SYSICONINDEX = 0x4000;
  const int SHIL_JUMBO = 4;
  const int ILD_TRANSPARENT = 1;
  static readonly Guid IID_IImageList = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");

  static IntPtr JumboIcon(string file) {
    SHFILEINFO sfi = new SHFILEINFO();
    IntPtr ok = SHGetFileInfo(file, 0, ref sfi, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), SHGFI_SYSICONINDEX);
    if (ok == IntPtr.Zero) return IntPtr.Zero;
    IntPtr hIcon = IntPtr.Zero;
    Guid iid = IID_IImageList;
    IImageList list = null;
    try {
      if (SHGetImageList(SHIL_JUMBO, ref iid, out list) == 0 && list != null) {
        list.GetIcon(sfi.iIcon, ILD_TRANSPARENT, ref hIcon);
      }
    } catch { hIcon = IntPtr.Zero; }
    finally { if (list != null) Marshal.ReleaseComObject(list); }
    if (hIcon != IntPtr.Zero) return hIcon;
    // 兜底：没有 jumbo 资源的文件类型，取系统大图标（48px，仍是原生图）
    SHFILEINFO sfi2 = new SHFILEINFO();
    SHGetFileInfo(file, 0, ref sfi2, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), SHGFI_ICON);
    return sfi2.hIcon;
  }

  /** 非透明像素的包围盒（抗锯齿边缘用 alpha>8 判据；全透明则退回整图） */
  static Rectangle ContentBounds(Bitmap bmp) {
    int w = bmp.Width, h = bmp.Height;
    int minX = w, minY = h, maxX = -1, maxY = -1;
    BitmapData bd = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    try {
      byte[] buf = new byte[bd.Stride * h];
      Marshal.Copy(bd.Scan0, buf, 0, buf.Length);
      for (int y = 0; y < h; y++) {
        int row = y * bd.Stride;
        for (int x = 0; x < w; x++) {
          if (buf[row + x * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    } finally { bmp.UnlockBits(bd); }
    if (maxX < 0) return new Rectangle(0, 0, w, h);
    return new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
  }

  /** 取图标并落成 PNG；返回是否成功。输出为正方形、按内容裁切后的原生分辨率（超过 size 才缩）。 */
  static bool SaveFileIcon(string file, string outPath, int size) {
    IntPtr hIcon = JumboIcon(file);
    if (hIcon == IntPtr.Zero) return false;
    try {
      using (Icon ico = Icon.FromHandle(hIcon)) {
        // ★ jumbo 列表对只有 32/48px 图标的程序返回「256 画布 + 左上角小图」，
        //   直接存就是一个角上的小点。先按 alpha 内容裁切；再放进正方形画布居中
        //   （不放大：小图标保持原始像素，显示 48px 时 1:1 最清晰；大图标才缩到 size）。
        using (Bitmap src = ico.ToBitmap())
        using (Bitmap cut = src.Clone(ContentBounds(src), PixelFormat.Format32bppArgb)) {
          int longSide = Math.Max(cut.Width, cut.Height);
          int side = Math.Min(size, longSide);
          float k = (float)side / longSide;
          int w2 = Math.Max(1, (int)Math.Round(cut.Width * k));
          int h2 = Math.Max(1, (int)Math.Round(cut.Height * k));
          using (Bitmap bmp = new Bitmap(side, side, PixelFormat.Format32bppArgb)) {
            using (Graphics g = Graphics.FromImage(bmp)) {
              g.Clear(Color.Transparent);
              g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
              g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
              g.DrawImage(cut, new Rectangle((side - w2) / 2, (side - h2) / 2, w2, h2));
            }
            bmp.Save(outPath, ImageFormat.Png);
          }
        }
      }
    } finally { DestroyIcon(hIcon); }
    return true;
  }

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
    // ★ Win11（实测 2026-10-29）：发 0x052C 之后出现的是 **Progman 的子窗口 WorkerW**
    //   （壁纸层），没有经典的"顶部同级 WorkerW + SHELLDLL_DefView"结构。
    //   旧实现只认后者 → 永远 workerW=0 → 桌面层钉不上、Win+D 后空白。
    IntPtr progman = Progman();
    if (progman != IntPtr.Zero) {
      IntPtr child = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
      if (child != IntPtr.Zero) return child;
    }
    // 经典布局兜底：DefView 宿主窗口之后的同级 WorkerW
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
    // 0x052C 之后壁纸 WorkerW 是异步创建的，等久一点再找（120ms 实测不够稳）
    System.Threading.Thread.Sleep(300);
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

  /** 抢焦点并保持 attach（详见 Main 里 --focus 的说明）。先输出一行结果，再驻留。 */
  static int FocusAndHold(IntPtr target) {
    if (!IsWindow(target)) { Emit("{\"ok\":false,\"error\":\"not-a-window\"}"); return 2; }
    IntPtr root = GetAncestor(target, GA_ROOT);
    uint mine = GetCurrentThreadId();
    uint winThread = GetWindowThreadProcessId(target, IntPtr.Zero);
    IntPtr fgWin = GetForegroundWindow();
    uint fgThread = fgWin == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fgWin, IntPtr.Zero);
    bool atWin = false;
    bool atFg = false;
    // ★ 顺序不能反：先 attach「前台线程」，再 attach「窗口所属线程」。
    //   反过来（先窗口后前台）attach 也返回成功、GetFocus 也当场是我们，但 200ms 内
    //   焦点就被系统还给前台应用 —— 实测按键全落进别的应用。按这个顺序才稳。
    if (fgThread != 0 && fgThread != mine && fgThread != winThread) atFg = AttachThreadInput(mine, fgThread, true);
    if (winThread != 0 && winThread != mine) atWin = AttachThreadInput(mine, winThread, true);
    // ★ 必须先把这个窗口的顶层（桌面层就是 Progman）提成前台窗口：键盘只投给
    //   前台窗口所在队列的焦点窗口。只 SetFocus 的话焦点立刻被系统收回（实测：
    //   GetFocus 先是我们，几百毫秒后又是前台应用，按键全落到前台应用里）。
    //   效果等同于"点了一下桌面"——当前应用失活，这是桌面层本来该有的行为。
    bool fgOk = SetForegroundWindow(root);
    SetFocus(target);
    bool ok = GetFocus() == target;
    Emit("{\"ok\":" + (ok ? "true" : "false") + ",\"fgOk\":" + (fgOk ? "true" : "false")
      + ",\"attachedWin\":" + (atWin ? "true" : "false") + ",\"attachedFg\":" + (atFg ? "true" : "false")
      + (ok ? "" : ",\"error\":\"focus-not-taken\"") + "}");
    if (!ok) {
      if (atFg) AttachThreadInput(mine, fgThread, false);
      if (atWin) AttachThreadInput(mine, winThread, false);
      return 4;
    }
    // 焦点或前台被别的窗口拿走（用户点了别的应用）就收工；最长挂 8 小时兜底
    DateTime deadline = DateTime.UtcNow.AddHours(8);
    while (DateTime.UtcNow < deadline) {
      System.Threading.Thread.Sleep(200);
      if (!IsWindow(target)) break;
      if (GetFocus() != target) break;
      if (GetForegroundWindow() != root) break;
    }
    if (atFg) AttachThreadInput(mine, fgThread, false);
    if (atWin) AttachThreadInput(mine, winThread, false);
    return 0;
  }

  [STAThread]
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
        // ★ 钉 Progman 而不是 WorkerW（2026-10-29 真机）：Progman 下 DefView（桌面图标列表）
        //   与 WorkerW 是兄弟窗口，且 DefView **压在 WorkerW 之上**。钉在 WorkerW 里虽然
        //   看得见（图标隐藏后它透明），但整屏鼠标都被 DefView 吃掉 —— 表现就是
        //   "桌面层画出来了，按钮/图标全都点不动"。钉到 Progman 再提到兄弟序最前才收得到点击。
        string target = "progman";
        IntPtr host = Progman();
        if (host == IntPtr.Zero) {
          // 兜底：没有 Progman（极少数外壳）→ DefView 父窗口，再不行 → WorkerW
          IntPtr dv = DefView();
          host = dv != IntPtr.Zero ? GetParent(dv) : IntPtr.Zero;
          target = "defview-parent";
        }
        if (host == IntPtr.Zero) {
          IntPtr w = FindWorkerW();
          if (w == IntPtr.Zero) { SpawnWorkerW(); w = FindWorkerW(); }
          if (w != IntPtr.Zero) { host = w; target = "workerw"; }
        }
        if (host == IntPtr.Zero) { Emit("{\"ok\":false,\"error\":\"worker-w-not-found\"}"); return 3; }
        long style = GetWindowLongPtr(hwnd, GWL_STYLE).ToInt64();
        SetWindowLongPtr(hwnd, GWL_STYLE, new IntPtr((style & ~WS_POPUP) | WS_CHILD));
        SetParent(hwnd, host);
        // 这里**不能**带 SWP_NOZORDER：必须把自己提到兄弟序最前（HWND_TOP），
        // 否则仍被 DefView 盖住，鼠标事件一个都到不了。
        SetWindowPos(hwnd, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        bool ok = GetParent(hwnd) == host;
        Emit("{\"ok\":" + (ok ? "true" : "false") + ",\"workerW\":" + H(host) + ",\"target\":\"" + target + "\"}");
        return ok ? 0 : 4;
      }

      case "--unpin": {
        if (args.Length < 2) { Emit("{\"ok\":false,\"error\":\"missing-hwnd\"}"); return 2; }
        long raw2;
        if (!Int64.TryParse(args[1], out raw2)) { Emit("{\"ok\":false,\"error\":\"bad-hwnd\"}"); return 2; }
        IntPtr u = new IntPtr(raw2);
        SetParent(u, IntPtr.Zero);
        // 还原成普通顶层窗口（否则窗口留在子窗口状态，无法正常显示/交互）
        long st = GetWindowLongPtr(u, GWL_STYLE).ToInt64();
        SetWindowLongPtr(u, GWL_STYLE, new IntPtr((st & ~WS_CHILD) | WS_POPUP));
        Emit("{\"ok\":true}");
        return 0;
      }

      case "--icons-visible":
        Emit("{\"visible\":" + (IconsHidden() ? "false" : "true") + "}");
        return 0;

      case "--foreground":
        Emit("{\"hwnd\":" + H(GetForegroundWindow()) + ",\"fullscreen\":" + (ForegroundFullscreen() ? "true" : "false") + "}");
        return 0;

      /* 给桌面层窗口抢键盘焦点。
         桌面层是 Progman（explorer 线程）的 WS_CHILD 子窗口：鼠标点击照常到达，
         但子窗口永远不会成为「活动窗口」，Electron 的 win.focus()（SetForegroundWindow）
         对子窗口是空操作 —— 表现就是 Delete / F2 / Esc 这些键一个都不响应。
         Windows 的规则是「键盘消息只发给前台线程队列里的焦点窗口」，所以这里把本线程
         同时 attach 到窗口所属线程和前台线程，再 SetFocus，键盘才会落到这条队列上。
         attach 必须一直保持（一 detach 焦点就回 explorer 队列），因此这个进程是个
         「焦点看守」：先报一行结果，然后挂着，直到焦点被别的窗口拿走（或超时）才退出。 */
      case "--focus": {
        if (args.Length < 2) { Emit("{\"ok\":false,\"error\":\"missing-hwnd\"}"); return 2; }
        long rawFocus;
        if (!Int64.TryParse(args[1], out rawFocus)) { Emit("{\"ok\":false,\"error\":\"bad-hwnd\"}"); return 2; }
        return FocusAndHold(new IntPtr(rawFocus));
      }

      // --icon <源路径> <输出 png> [边长]
      case "--icon": {
        if (args.Length < 3) { Emit("{\"ok\":false,\"error\":\"missing-args\"}"); return 2; }
        int size = 256;
        if (args.Length > 3) {
          int parsed;
          if (Int32.TryParse(args[3], out parsed) && parsed >= 16 && parsed <= 256) size = parsed;
        }
        bool okIcon = false;
        try { okIcon = SaveFileIcon(args[1], args[2], size); }
        catch (Exception ex) { Emit("{\"ok\":false,\"error\":\"" + ex.GetType().Name + "\"}"); return 5; }
        Emit("{\"ok\":" + (okIcon ? "true" : "false") + ",\"size\":" + size + ",\"png\":\"" + args[2].Replace("\\", "\\\\") + "\"}");
        return okIcon ? 0 : 5;
      }

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

// IImageList：只声明到 GetIcon，**前面每个方法的顺序必须与 shell32 的 vtable 完全一致**
// （少声明尾部方法没关系，多/错顺序会直接访问到别的槽位）。
[ComImport, Guid("46EB5926-582E-4017-9FDF-E8998DAA0950"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IImageList {
  [PreserveSig] int Add(IntPtr hbmImage, IntPtr hbmMask, out int pi);
  [PreserveSig] int ReplaceIcon(int i, IntPtr hicon, out int pi);
  [PreserveSig] int SetOverlayImage(int iImage, int iOverlay);
  [PreserveSig] int Replace(int i, IntPtr hbmImage, IntPtr hbmMask);
  [PreserveSig] int AddMasked(IntPtr hbmImage, int crMask, out int pi);
  [PreserveSig] int Draw(IntPtr pimldp);
  [PreserveSig] int Remove(int i);
  [PreserveSig] int GetIcon(int i, int flags, ref IntPtr picon);
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
