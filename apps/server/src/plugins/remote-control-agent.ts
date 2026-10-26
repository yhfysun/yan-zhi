// remote-control · 常驻 C# 注入代理进程。
// ------------------------------------------------------------------
// 为什么是常驻进程：computer-use 每条输入指令都要起一个 PowerShell（单次 300-800ms），
// 远控里点一下卡半秒完全不可用。本进程由 Node 启动后长驻：
//   stdin  收 JSON 行指令（点击/移动/滚轮/按键/整串输入 + JPEG 回退采集）
//   stdout 出帧与事件（B<长度>\n + 原始字节 = JPEG；T<json>\n = 文本事件）
// 注入走 user32（进程已热，<10ms）；采集仅作 WebRTC 不可用时的回退通道。
//
// C# 面向 PowerShell 5.1 的 C# 5 编译器（Add-Type / CodeDom，不可传 /unsafe）：
//   - 不用字符串插值 / null 条件 / 表达式体成员，out 变量先声明再传
//   - 不用 unsafe：缩略图哈希走 Marshal.Copy
//   - 不用 volatile double（非法）：缩放参数用 int 百分比
// 文本参数一律走 JSON + UTF8 stdin，不拼 shell 命令行（无注入面）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** stdout 帧解析事件 */
export interface AgentEvent {
  i: number;
  ok: boolean;
  blocked?: boolean;
  title?: string;
  error?: string;
  [k: string]: unknown;
}

/**
 * 纯函数流解析器（供单测）：把 stdout 字节流切成 {events, frames}。
 * 协议：`T<json>\n` 文本事件；`B<字节数>\n` 后跟定长原始字节 = 二进制帧。
 * 帧内可能出现任意字节（含 \n 与 "T"/"B" 前缀），必须按长度消费，不能按行猜。
 */
export function createAgentStreamParser(): {
  push: (chunk: Buffer) => { events: AgentEvent[]; frames: Buffer[] };
} {
  let buf: Buffer = Buffer.alloc(0);
  return {
    push(chunk: Buffer) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const events: AgentEvent[] = [];
      const frames: Buffer[] = [];
      for (;;) {
        const nl = buf.indexOf(0x0a);
        if (nl < 0) break;
        const header = buf.slice(0, nl).toString('utf8');
        if (header.startsWith('T')) {
          buf = buf.slice(nl + 1);
          try {
            events.push(JSON.parse(header.slice(1)) as AgentEvent);
          } catch {
            events.push({ i: -1, ok: false, error: `bad event: ${header.slice(1, 80)}` });
          }
          continue;
        }
        if (header.startsWith('B')) {
          const len = Number(header.slice(1));
          if (!Number.isInteger(len) || len < 0) {
            // 坏头：丢到这个换行为止，避免死循环
            buf = buf.slice(nl + 1);
            events.push({ i: -1, ok: false, error: `bad frame header: ${header.slice(0, 40)}` });
            continue;
          }
          if (buf.length < nl + 1 + len) break; // 帧未到齐，等下一段
          frames.push(Buffer.from(buf.slice(nl + 1, nl + 1 + len)));
          buf = buf.slice(nl + 1 + len);
          continue;
        }
        // 空行/未知前缀：跳过（PowerShell 偶发的启动横幅等）
        buf = buf.slice(nl + 1);
      }
      return { events, frames };
    },
  };
}

/** 授权码字符集：去掉 0/O/1/l/I 的易混淆字符 */
export const PAIR_CODE_CHARSET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 生成 `xxxx-xxxx` 形态的随机授权码（无易混淆字符） */
export function generatePairCode(rand: () => number = Math.random): string {
  const pick = () => PAIR_CODE_CHARSET[Math.floor(rand() * PAIR_CODE_CHARSET.length)];
  const g = Array.from({ length: 4 }, pick).join('');
  const t = Array.from({ length: 4 }, pick).join('');
  return `${g}-${t}`;
}

/** 归一化授权码：去空格/横线/下划线，小写，用于比对 */
export function normalizePairCode(s: string): string {
  return String(s || '').toLowerCase().replace(/[\s\-_]/g, '');
}

// ---------------------------------------------------------------------------
// C# 源码（内嵌）。协议见文件头注释。
// ---------------------------------------------------------------------------
const CS = `
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public class RcAgent
{
  // ---- Win32 ----
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder t, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetCursorInfo(out CURSORINFO ci);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc proc, IntPtr data);
  [DllImport("user32.dll", EntryPoint = "GetMonitorInfoW", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr hMon, ref MONITORINFO info);
  public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, ref RECT rect, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [StructLayout(LayoutKind.Sequential)]
  public struct CURSORINFO { public int cbSize; public int flags; public IntPtr hCursor; public POINT pt; }
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public INPUTUNION u; }

  const uint MOUSE_LEFT_DOWN = 0x0002, MOUSE_LEFT_UP = 0x0004;
  const uint MOUSE_RIGHT_DOWN = 0x0008, MOUSE_RIGHT_UP = 0x0010;
  const uint MOUSE_MIDDLE_DOWN = 0x0020, MOUSE_MIDDLE_UP = 0x0040;
  const uint MOUSE_WHEEL = 0x0800;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const uint KEYEVENTF_UNICODE = 0x0004;
  const uint INPUT_KEYBOARD = 1;

  static JavaScriptSerializer js = new JavaScriptSerializer();
  static object outLock = new object();
  static object capLock = new object();
  static Stream so;
  static bool allowSelf = false;
  static HashSet<string> selfNames = new HashSet<string>(new string[] { "yan-zhi", "yanzhi", "electron", "node" });
  // 回退采集线程参数（跨线程读写：int 与 bool 赋值原子，volatile 保证可见性）
  static volatile bool streaming = false;
  static volatile int frameScalePct = 100;
  static volatile int frameQuality = 60;
  static volatile int frameFps = 10;
  static volatile bool changedOnly = true;
  static volatile int frameMon = -1; // 采集目标显示器（-1=整个虚拟桌面）
  static ulong lastHash = 0;

  // 显示器枚举（进程已 SetProcessDPIAware：矩形即物理像素，与注入坐标同系）
  static List<Rectangle> monList = new List<Rectangle>();
  static List<bool> monPrimary = new List<bool>();
  static MonitorEnumProc monCb; // 静态持有防 GC 回调被回收
  static void RefreshMonitors()
  {
    monList.Clear();
    monPrimary.Clear();
    monCb = new MonitorEnumProc(OnMonitorEnum);
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, monCb, IntPtr.Zero);
  }
  static bool OnMonitorEnum(IntPtr hMon, IntPtr hdc, ref RECT r, IntPtr data)
  {
    MONITORINFO mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (GetMonitorInfo(hMon, ref mi))
    {
      monList.Add(Rectangle.FromLTRB(mi.rcMonitor.Left, mi.rcMonitor.Top, mi.rcMonitor.Right, mi.rcMonitor.Bottom));
      monPrimary.Add((mi.dwFlags & 1) != 0);
    }
    return true;
  }
  // mon>=0 → 该显示器 bounds（越界回退虚拟屏）；mon<0 → 整个虚拟桌面
  static Rectangle CaptureRect(int mon)
  {
    if (mon >= 0)
    {
      RefreshMonitors();
      if (mon < monList.Count) return monList[mon];
    }
    return VirtualRect();
  }

  public static void Run()
  {
    try { SetProcessDPIAware(); } catch {}
    so = Console.OpenStandardOutput();
    Console.InputEncoding = Encoding.UTF8;
    string line;
    while ((line = Console.ReadLine()) != null)
    {
      line = line.Trim();
      if (line.Length == 0) continue;
      Dictionary<string, object> m;
      try { m = js.Deserialize<Dictionary<string, object>>(line); }
      catch (Exception e) { EmitEvent(Err(-1, "bad json: " + e.Message)); continue; }
      if (m == null) continue;
      if (String.Equals(GetStr(m, "op"), "exit")) break;
      try { Handle(m); } catch (Exception e) { EmitEvent(Err(GetId(m), "op failed: " + e.Message)); }
    }
    streaming = false;
  }

  static void Handle(Dictionary<string, object> m)
  {
    string op = GetStr(m, "op");
    int id = GetId(m);
    if (op == "config") { ApplyConfig(m); EmitEvent(Ok(id)); return; }
    if (op == "ping") { EmitEvent(Ok(id)); return; }
    if (op == "monitors") { EmitEvent(MonitorsInfo(id)); return; }
    if (op == "screensize") { EmitEvent(ScreenInfo(id, GetInt(m, "mon", -1))); return; }
    if (op == "cursor") { EmitEvent(CursorInfo(id)); return; }
    if (op == "click") { DoClick(GetInt(m, "x"), GetInt(m, "y"), GetStr(m, "button", "left"), GetBool(m, "double"), id); return; }
    if (op == "down") { PressAt(GetInt(m, "x"), GetInt(m, "y"), GetStr(m, "button", "left"), true); EmitEvent(Ok(id)); return; }
    if (op == "up") { PressAt(GetInt(m, "x"), GetInt(m, "y"), GetStr(m, "button", "left"), false); EmitEvent(Ok(id)); return; }
    if (op == "move") { SetCursorPos(GetInt(m, "x"), GetInt(m, "y")); EmitEvent(Ok(id)); return; }
    if (op == "wheel") { DoWheel(m, id); return; }
    if (op == "key") { DoKey(m, id); return; }
    if (op == "type") { DoType(m, id); return; }
    if (op == "frame") { CaptureOnce(GetDouble(m, "scale", frameScalePct / 100.0), (int)GetDouble(m, "quality", frameQuality), id, GetInt(m, "mon", -1)); return; }
    if (op == "stream") { ApplyStream(m); EmitEvent(Ok(id)); return; }
    EmitEvent(Err(id, "unknown op: " + op));
  }

  static void ApplyConfig(Dictionary<string, object> m)
  {
    if (m.ContainsKey("allowSelf")) allowSelf = GetBool(m, "allowSelf");
    if (m.ContainsKey("selfNames") && m["selfNames"] is ArrayList)
    {
      selfNames = new HashSet<string>();
      foreach (object o in (ArrayList)m["selfNames"]) selfNames.Add(((string)o).ToLower());
    }
  }

  static void ApplyStream(Dictionary<string, object> m)
  {
    int fps = (int)GetDouble(m, "fps", 0);
    frameScalePct = (int)GetDouble(m, "scale", 1.0) * 100;
    frameQuality = (int)GetDouble(m, "quality", 60);
    changedOnly = GetBool(m, "changedOnly", true);
    if (m.ContainsKey("mon")) { int nm = GetInt(m, "mon", -1); if (nm != frameMon) { frameMon = nm; lastHash = 0; } }
    if (fps > 0 && !streaming)
    {
      frameFps = fps;
      streaming = true;
      lastHash = 0;
      Thread t = new Thread(new ThreadStart(StreamLoop));
      t.IsBackground = true;
      t.Start();
    }
    else if (fps <= 0) { streaming = false; }
    else { frameFps = fps; }
  }

  static void StreamLoop()
  {
    bool lastFailed = false;
    while (streaming)
    {
      int interval = Math.Max(33, 1000 / Math.Max(1, frameFps));
      try { CaptureOnce(frameScalePct / 100.0, frameQuality, 0, frameMon); lastFailed = false; }
      catch (Exception e)
      {
        // 连续失败只报一次（i=0 事件走 Node 侧 onEvent），避免按帧率刷屏
        if (!lastFailed) { lastFailed = true; EmitEvent(Err(0, "stream-loop: " + e.Message)); }
      }
      Thread.Sleep(interval);
    }
  }

  // ---- 输入 ----
  static string SelfHitAt(int x, int y)
  {
    POINT p = new POINT(); p.X = x; p.Y = y;
    IntPtr h = WindowFromPoint(p);
    if (h == IntPtr.Zero) return null;
    h = GetAncestor(h, 2);
    if (h == IntPtr.Zero) return null;
    StringBuilder sb = new StringBuilder(512);
    GetWindowText(h, sb, 512);
    string title = sb.ToString();
    uint pid; GetWindowThreadProcessId(h, out pid);
    string pname = "";
    try { pname = Process.GetProcessById((int)pid).ProcessName.ToLower(); } catch {}
    if (selfNames.Contains(pname)) return title;
    if (title.IndexOf("言智", StringComparison.Ordinal) >= 0) return title;
    if (title.ToLower().IndexOf("yan-zhi", StringComparison.Ordinal) >= 0) return title;
    return null;
  }

  static void PressAt(int x, int y, string button, bool down)
  {
    SetCursorPos(x, y);
    uint f = button == "right" ? (down ? MOUSE_RIGHT_DOWN : MOUSE_RIGHT_UP)
           : button == "middle" ? (down ? MOUSE_MIDDLE_DOWN : MOUSE_MIDDLE_UP)
           : (down ? MOUSE_LEFT_DOWN : MOUSE_LEFT_UP);
    mouse_event(f, 0, 0, 0, UIntPtr.Zero);
  }

  static void DoClick(int x, int y, string button, bool dbl, int id)
  {
    if (!allowSelf)
    {
      string hit = SelfHitAt(x, y);
      if (hit != null)
      {
        Dictionary<string, object> ev = Err(id, "目标点落在本应用自身窗口，已拒绝");
        ev["blocked"] = true; ev["title"] = hit;
        EmitEvent(ev);
        return;
      }
    }
    SetCursorPos(x, y);
    Thread.Sleep(30);
    int clicks = dbl ? 2 : 1;
    for (int i = 0; i < clicks; i++)
    {
      PressAt(x, y, button, true);
      Thread.Sleep(30);
      PressAt(x, y, button, false);
      Thread.Sleep(40);
    }
    EmitEvent(Ok(id));
  }

  static void DoWheel(Dictionary<string, object> m, int id)
  {
    int x = GetInt(m, "x"), y = GetInt(m, "y");
    int delta = (int)GetDouble(m, "delta", -120);
    SetCursorPos(x, y);
    Thread.Sleep(20);
    mouse_event(MOUSE_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
    EmitEvent(Ok(id));
  }

  static byte VkOf(string k)
  {
    k = k.Trim().ToLower();
    if (k.Length == 1)
    {
      char c = k[0];
      if (c >= 'a' && c <= 'z') return (byte)('A' + (c - 'a'));
      if (c >= '0' && c <= '9') return (byte)c;
      switch (c)
      {
        case ' ': return 0x20; case '.': return 0xBE; case ',': return 0xBC;
        case '/': return 0xBF; case ';': return 0xBA; case '\\'': return 0xDE;
        case '[': return 0xDB; case ']': return 0xDD; case '-': return 0xBD;
        case '=': return 0xBB; case '\\\\': return 0xDC; case '\`': return 0xC0;
      }
    }
    switch (k)
    {
      case "enter": case "return": return 0x0D;
      case "tab": return 0x09;
      case "esc": case "escape": return 0x1B;
      case "space": return 0x20;
      case "backspace": return 0x08;
      case "delete": case "forwarddelete": return 0x2E;
      case "insert": return 0x2D;
      case "home": return 0x24;
      case "end": return 0x23;
      case "pageup": return 0x21;
      case "pagedown": return 0x22;
      case "up": return 0x26; case "down": return 0x28; case "left": return 0x25; case "right": return 0x27;
      case "shift": return 0x10; case "ctrl": case "control": return 0x11; case "alt": return 0x12;
      case "printscreen": return 0x2C;
      case "apps": return 0x5D; // 键盘菜单键（不是 Win 键）
      case "plus": case "+": return 0xBB;
      case "numpad0": return 0x60; case "numpad1": return 0x61; case "numpad2": return 0x62;
      case "numpad3": return 0x63; case "numpad4": return 0x64; case "numpad5": return 0x65;
      case "numpad6": return 0x66; case "numpad7": return 0x67; case "numpad8": return 0x68;
      case "numpad9": return 0x69;
    }
    if (k.Length == 2 && k[0] == 'f' && k[1] >= '1' && k[1] <= '9')
      return (byte)(0x6F + (k[1] - '0'));
    if (k.Length == 3 && k[0] == 'f' && k[1] == '1' && k[2] >= '0' && k[2] <= '2')
      return (byte)(0x79 + (k[2] - '0'));
    throw new ArgumentException("unsupported key: " + k);
  }

  static void DoKey(Dictionary<string, object> m, int id)
  {
    object ko;
    m.TryGetValue("keys", out ko);
    ArrayList keys = ko as ArrayList;
    if (keys == null || keys.Count == 0) { EmitEvent(Err(id, "keys 不能为空")); return; }
    List<byte> seq = new List<byte>();
    foreach (object o in keys) seq.Add(VkOf((string)o));
    for (int i = 0; i < seq.Count; i++) keybd_event(seq[i], 0, 0, UIntPtr.Zero);
    for (int i = seq.Count - 1; i >= 0; i--) keybd_event(seq[i], 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    EmitEvent(Ok(id));
  }

  static void DoType(Dictionary<string, object> m, int id)
  {
    string text = GetStr(m, "text", "");
    if (text.Length == 0) { EmitEvent(Ok(id)); return; }
    List<INPUT> inputs = new List<INPUT>();
    foreach (char ch in text)
    {
      if (ch == '\\n' || ch == '\\r')
      {
        if (ch == '\\n') AddVk(inputs, 0x0D);
        continue;
      }
      if (ch <= 31 || ch == 127) continue; // 控制字符不注入
      INPUT down = new INPUT(); down.type = INPUT_KEYBOARD;
      down.u.ki.wVk = 0; down.u.ki.wScan = ch; down.u.ki.dwFlags = KEYEVENTF_UNICODE;
      inputs.Add(down);
      INPUT up = new INPUT(); up.type = INPUT_KEYBOARD;
      up.u.ki.wVk = 0; up.u.ki.wScan = ch; up.u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
      inputs.Add(up);
    }
    if (inputs.Count > 0)
    {
      INPUT[] arr = inputs.ToArray();
      uint sent = SendInput((uint)arr.Length, arr, (int)Marshal.SizeOf(typeof(INPUT)));
      if (sent != arr.Length)
      {
        int err = Marshal.GetLastWin32Error();
        EmitEvent(Err(id, "SendInput 部分失败: " + sent + "/" + arr.Length + " err=" + err + " size=" + Marshal.SizeOf(typeof(INPUT))));
        return;
      }
    }
    EmitEvent(Ok(id));
  }

  static void AddVk(List<INPUT> inputs, byte vk)
  {
    INPUT d = new INPUT(); d.type = INPUT_KEYBOARD; d.u.ki.wVk = vk; inputs.Add(d);
    INPUT u = new INPUT(); u.type = INPUT_KEYBOARD; u.u.ki.wVk = vk; u.u.ki.dwFlags = KEYEVENTF_KEYUP; inputs.Add(u);
  }

  // ---- 采集（回退通道）----
  static Rectangle VirtualRect()
  {
    return new Rectangle(
      GetSystemMetrics(76), GetSystemMetrics(77),
      GetSystemMetrics(78), GetSystemMetrics(79));
  }

  static void CaptureOnce(double scale, int quality, int id, int mon)
  {
    lock (capLock)
    {
      Rectangle r = CaptureRect(mon);
      if (r.Width <= 0 || r.Height <= 0) { EmitEvent(Err(id, "虚拟屏尺寸无效")); return; }
      double sc = scale <= 0 ? 1.0 : scale;
      int w = Math.Max(1, (int)(r.Width * sc));
      int h = Math.Max(1, (int)(r.Height * sc));
      using (Bitmap full = new Bitmap(r.Width, r.Height))
      {
        using (Graphics g = Graphics.FromImage(full))
        {
          g.CopyFromScreen(r.X, r.Y, 0, 0, new Size(r.Width, r.Height));
        }
        Bitmap target = full;
        bool scaled = w != r.Width || h != r.Height;
        if (scaled)
        {
          target = new Bitmap(w, h);
          using (Graphics g = Graphics.FromImage(target))
          {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
            g.DrawImage(full, 0, 0, w, h);
          }
        }
        try
        {
          ulong hash = ThumbHash(target);
          if (changedOnly && id == 0 && hash == lastHash) { return; } // 画面未变不推帧
          lastHash = hash;
          ImageCodecInfo jpg = FindJpeg();
          EncoderParameters ep = new EncoderParameters(1);
          ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
          using (MemoryStream ms = new MemoryStream())
          {
            target.Save(ms, jpg, ep);
            EmitBinary(ms.ToArray());
          }
        }
        finally { if (scaled) target.Dispose(); }
      }
    }
    if (id > 0) EmitEvent(Ok(id));
  }

  static ulong ThumbHash(Bitmap b)
  {
    using (Bitmap t = new Bitmap(b, new Size(24, 14)))
    {
      BitmapData d = t.LockBits(new Rectangle(0, 0, 24, 14), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      try
      {
        int bytes = Math.Abs(d.Stride) * 14;
        byte[] px = new byte[bytes];
        Marshal.Copy(d.Scan0, px, 0, bytes);
        int stride = d.Stride;
        ulong h = 14695981039346656037UL;
        for (int y = 0; y < 14; y++)
        {
          int row = y * stride;
          for (int x = 0; x < 24; x++)
          {
            int o = row + x * 4;
            byte v = (byte)((px[o] + px[o + 1] + px[o + 2]) / 3);
            h ^= v; h *= 1099511628211UL;
          }
        }
        return h;
      }
      finally { t.UnlockBits(d); }
    }
  }

  static ImageCodecInfo FindJpeg()
  {
    ImageCodecInfo[] codecs = ImageCodecInfo.GetImageEncoders();
    foreach (ImageCodecInfo c in codecs) if (c.FormatID == ImageFormat.Jpeg.Guid) return c;
    throw new InvalidOperationException("jpeg codec missing");
  }

  // ---- 状态事件 ----
  static Dictionary<string, object> ScreenInfo(int id, int mon)
  {
    Rectangle r = CaptureRect(mon);
    Dictionary<string, object> ev = Ok(id);
    ev["x"] = r.X; ev["y"] = r.Y; ev["w"] = r.Width; ev["h"] = r.Height;
    return ev;
  }

  // 显示器清单（多显示器选择用）：monitors=单屏列表，virtual=整个虚拟桌面，current=当前采集目标
  static Dictionary<string, object> MonitorsInfo(int id)
  {
    RefreshMonitors();
    ArrayList arr = new ArrayList();
    for (int i = 0; i < monList.Count; i++)
    {
      Rectangle r = monList[i];
      Dictionary<string, object> d = new Dictionary<string, object>();
      d["id"] = i.ToString();
      d["label"] = "显示器 " + (i + 1);
      d["primary"] = monPrimary[i];
      d["x"] = r.X; d["y"] = r.Y; d["w"] = r.Width; d["h"] = r.Height;
      arr.Add(d);
    }
    Rectangle v = VirtualRect();
    Dictionary<string, object> virt = new Dictionary<string, object>();
    virt["id"] = "virtual"; virt["label"] = "整个桌面"; virt["primary"] = false;
    virt["x"] = v.X; virt["y"] = v.Y; virt["w"] = v.Width; virt["h"] = v.Height;
    Dictionary<string, object> ev = Ok(id);
    ev["monitors"] = arr;
    ev["virtual"] = virt;
    ev["current"] = frameMon;
    return ev;
  }

  static Dictionary<string, object> CursorInfo(int id)
  {
    CURSORINFO ci = new CURSORINFO(); ci.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
    bool ok = GetCursorInfo(out ci);
    Dictionary<string, object> ev = Ok(id);
    ev["x"] = ci.pt.X; ev["y"] = ci.pt.Y; ev["visible"] = ok && ci.flags != 0;
    return ev;
  }

  static Dictionary<string, object> Ok(int id)
  {
    Dictionary<string, object> d = new Dictionary<string, object>();
    d["i"] = id; d["ok"] = true;
    return d;
  }

  static Dictionary<string, object> Err(int id, string msg)
  {
    Dictionary<string, object> d = new Dictionary<string, object>();
    d["i"] = id; d["ok"] = false; d["error"] = msg;
    return d;
  }

  static int GetId(Dictionary<string, object> m)
  {
    try { return Convert.ToInt32(m["i"]); } catch { return 0; }
  }

  static string GetStr(Dictionary<string, object> m, string k, string def)
  {
    object v; if (m != null && m.TryGetValue(k, out v) && v is string) return (string)v;
    return def;
  }
  static string GetStr(Dictionary<string, object> m, string k) { return GetStr(m, k, ""); }

  static double GetDouble(Dictionary<string, object> m, string k, double def)
  {
    object v; if (m != null && m.TryGetValue(k, out v) && v != null)
    {
      try { return Convert.ToDouble(v); } catch {}
    }
    return def;
  }
  static int GetInt(Dictionary<string, object> m, string k) { return (int)GetDouble(m, k, 0); }
  static int GetInt(Dictionary<string, object> m, string k, int def) { return (int)GetDouble(m, k, def); }

  static bool GetBool(Dictionary<string, object> m, string k, bool def)
  {
    object v; if (m != null && m.TryGetValue(k, out v) && v is bool) return (bool)v;
    return def;
  }
  static bool GetBool(Dictionary<string, object> m, string k) { return GetBool(m, k, false); }

  static void EmitEvent(Dictionary<string, object> ev)
  {
    byte[] b = Encoding.UTF8.GetBytes("T" + js.Serialize(ev) + "\\n");
    lock (outLock) { so.Write(b, 0, b.Length); so.Flush(); }
  }

  static void EmitBinary(byte[] frame)
  {
    byte[] head = Encoding.UTF8.GetBytes("B" + frame.Length + "\\n");
    lock (outLock) { so.Write(head, 0, head.Length); so.Write(frame, 0, frame.Length); so.Flush(); }
  }
}
`;

const RUNNER = `$ErrorActionPreference = 'Stop'
$cs = [IO.File]::ReadAllText('<CS_PATH>', [Text.Encoding]::UTF8)
Add-Type -TypeDefinition $cs -ReferencedAssemblies @('System.Drawing','System.Web.Extensions')
[RcAgent]::Run()
`;

export interface AgentStartConfig {
  selfNames: string[];
  allowSelf: boolean;
}

interface PendingCall {
  resolve: (e: AgentEvent) => void;
  timer: NodeJS.Timeout;
}

/**
 * 子进程句柄用结构化类型：本仓库存在多版本 @types/node 共存的环境问题
 * （ChildProcess 的 EventEmitter 基类在此解析下缺 .on，ops-shell / sec-lab 同报错），
 * 结构化接口不依赖 ambient 声明的完整性，保证本文件类型检查零报错。
 */
interface AgentChild {
  stdin: NodeJS.WritableStream | null;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  pid?: number;
  kill: () => boolean;
  on: (ev: string, cb: (...args: unknown[]) => void) => unknown;
}

/**
 * 常驻代理进程句柄。启动即写临时 .cs/.ps1（UTF-8）→ spawn powershell。
 * 进程退出/异常由 onExit 上报，插件层负责按会话状态决定是否重启。
 */
export class RemoteControlAgent {
  private child: AgentChild | null = null;
  private exited = true;
  private parser = createAgentStreamParser();
  private pending = new Map<number, PendingCall>();
  private nextId = 1;
  private tmpDir = '';
  onFrame: ((buf: Buffer) => void) | null = null;
  onEvent: ((e: AgentEvent) => void) | null = null;
  onExit: ((code: number) => void) | null = null;

  get running(): boolean {
    return !!this.child && !this.exited;
  }

  async start(config: AgentStartConfig): Promise<void> {
    if (process.platform !== 'win32') throw new Error('远控代理当前仅支持 Windows');
    if (this.child) return;
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-rc-'));
    const csPath = path.join(this.tmpDir, 'agent.cs');
    const ps1Path = path.join(this.tmpDir, 'runner.ps1');
    fs.writeFileSync(csPath, CS, 'utf8');
    fs.writeFileSync(ps1Path, RUNNER.replace('<CS_PATH>', csPath.replace(/'/g, "''")), 'utf8');
    this.exited = false;
    this.child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1Path],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    ) as unknown as AgentChild;
    this.child.stdout!.on('data', (chunk: Buffer) => this.onChunk(chunk));
    this.child.stderr!.on('data', (d: unknown) => {
      const s = String(d).trim();
      if (s) console.error('[remote-control-agent]', s.slice(0, 500));
    });
    this.child.on('exit', (...args: unknown[]) => {
      const code = typeof args[0] === 'number' ? args[0] : -1;
      this.child = null;
      this.exited = true;
      this.rejectAllPending('代理进程已退出');
      this.cleanupTmp();
      try {
        this.onExit?.(code);
      } catch {
        /* 回调异常不影响 */
      }
    });
    // config 必须第一帧就发：selfNames / allowSelf 决定点击护栏行为
    const cfg = await this.call({ op: 'config', selfNames: config.selfNames, allowSelf: config.allowSelf }, 20000);
    if (!cfg.ok) throw new Error(cfg.error || '代理进程启动失败');
  }

  private onChunk(chunk: Buffer): void {
    const { events, frames } = this.parser.push(chunk);
    for (const e of events) {
      const p = this.pending.get(e.i);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(e.i);
        p.resolve(e);
      } else {
        // 采集线程/主动上报类事件（i=0 或已超时的历史回执）
        try {
          this.onEvent?.(e);
        } catch {
          /* ignore */
        }
      }
    }
    for (const f of frames) {
      try {
        this.onFrame?.(f);
      } catch {
        /* ignore */
      }
    }
  }

  /** 发送指令并等待对应 id 的回执 */
  call(op: Record<string, unknown>, timeout = 8000): Promise<AgentEvent> {
    if (!this.running) return Promise.reject(new Error('代理进程未运行'));
    const id = this.nextId++;
    const msg = JSON.stringify({ ...op, i: id });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`代理指令超时: ${String(op.op)}`));
      }, timeout);
      this.pending.set(id, { resolve, timer });
      try {
        this.child!.stdin!.write(msg + '\n', 'utf8');
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  /** 发后不管（stream/高频输入指令不排队等待回执） */
  fire(op: Record<string, unknown>): void {
    if (!this.running) return;
    const id = this.nextId++;
    try {
      this.child!.stdin!.write(JSON.stringify({ ...op, i: id }) + '\n', 'utf8');
    } catch {
      /* 进程已死，onExit 兜底 */
    }
  }

  stop(): void {
    if (!this.child) return;
    try {
      this.child.kill();
    } catch {
      /* ignore */
    }
    this.child = null;
    this.exited = true;
    this.rejectAllPending('代理进程已停止');
    this.cleanupTmp();
  }

  private rejectAllPending(msg: string): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ i: -1, ok: false, error: msg });
    }
    this.pending.clear();
  }

  private cleanupTmp(): void {
    try {
      if (this.tmpDir) fs.rmSync(this.tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    this.tmpDir = '';
  }
}

/** 本应用自身进程名（传给代理做自窗点击拦截） */
export function selfProcNames(): string[] {
  const names = new Set<string>(['yan-zhi', 'yanzhi', 'electron', 'node']);
  try {
    names.add(path.basename(process.execPath, '.exe').toLowerCase());
  } catch {
    /* ignore */
  }
  return Array.from(names);
}

/** 设备令牌（白名单免确认凭据，64 位十六进制） */
export function newDeviceToken(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}
