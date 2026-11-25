import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RemoteControlAgent, selfProcNames } from '../apps/server/src/plugins/remote-control-agent.ts';

if (process.platform !== 'win32') {
  console.log('SKIP: Windows only');
  process.exit(0);
}

const token = randomUUID();
const file = path.join(os.tmpdir(), `yz-computer-control-${token}.txt`);
const source = path.join(os.tmpdir(), `yz-computer-control-${token}.cs`);
const exe = path.join(os.tmpdir(), `yz-computer-control-${token}.exe`);
const marker = `resident-input-${Date.now()}`;
fs.writeFileSync(file, '', 'utf8');
fs.writeFileSync(source, `
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class Program {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool altTab);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [STAThread]
  static void Main(string[] args) {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    var form = new Form {
      Text = "YZ Computer Control Test ${token}",
      Width = 900,
      Height = 620,
      StartPosition = FormStartPosition.CenterScreen,
      TopMost = true,
      KeyPreview = true
    };
    var box = new TextBox {
      Dock = DockStyle.Fill,
      Multiline = true,
      Font = new System.Drawing.Font("Microsoft YaHei UI", 20f),
      ScrollBars = ScrollBars.Vertical
    };
    form.Controls.Add(box);
    form.Shown += delegate {
      form.Activate();
      form.BringToFront();
      uint ignored;
      uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
      uint mine = GetCurrentThreadId();
      if (fgThread != 0 && fgThread != mine) AttachThreadInput(mine, fgThread, true);
      SwitchToThisWindow(form.Handle, true);
      SetForegroundWindow(form.Handle);
      box.Focus();
    };
    form.KeyDown += delegate(object sender, KeyEventArgs e) {
      if (e.Control && e.KeyCode == Keys.S) {
        File.WriteAllText(args[0], box.Text);
        e.SuppressKeyPress = true;
      }
    };
    Application.Run(form);
  }
}
`, 'utf8');

function powershell(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  }).trim();
}

function findWindow(fragment) {
  const encoded = Buffer.from(fragment, 'utf8').toString('base64');
  const raw = powershell(`
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class YzFindWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder t, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  public static string Find(string fragment) {
    IntPtr found = IntPtr.Zero; string title = ""; uint pid = 0; RECT rect = new RECT();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder t = new StringBuilder(512); GetWindowText(h, t, 512);
      if (t.ToString().IndexOf(fragment, StringComparison.OrdinalIgnoreCase) < 0) return true;
      RECT r; if (!GetWindowRect(h, out r)) return true;
      found = h; title = t.ToString(); GetWindowThreadProcessId(h, out pid); rect = r; return false;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return "null";
    return "{\\"hwnd\\":" + found.ToInt64() + ",\\"pid\\":" + pid + ",\\"title\\":\\"" + title.Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\"") + "\\",\\"rect\\":{\\"x\\":" + rect.L + ",\\"y\\":" + rect.T + ",\\"width\\":" + (rect.R-rect.L) + ",\\"height\\":" + (rect.B-rect.T) + "}}";
  }
}
'@
$fragment = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))
[YzFindWindow]::Find($fragment)
`);
  return raw && raw !== 'null' ? JSON.parse(raw) : null;
}

function activate(target) {
  powershell(`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class YzActivate {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
}
'@
$h = [IntPtr]${Number(target.hwnd)}
[YzActivate]::ShowWindow($h, 9) | Out-Null
[YzActivate]::SetForegroundWindow($h) | Out-Null
$ws = New-Object -ComObject WScript.Shell
$ws.AppActivate(${Number(target.pid)}) | Out-Null
`);
}

function focusTestTextbox(pid) {
  const raw = powershell(`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$root = $AE::RootElement
$byPid = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, ${Number(pid)})
$win = $root.FindFirst($TS::Children, $byPid)
if (-not $win) { throw 'test window not found' }
$all = $win.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$edit = $null
foreach ($candidate in $all) {
  if ($candidate.Current.IsKeyboardFocusable) { $edit = $candidate; break }
}
if (-not $edit) { throw 'test editable control not found' }
$edit.SetFocus()
Start-Sleep -Milliseconds 150
if (-not $edit.Current.HasKeyboardFocus) { throw 'test edit did not receive keyboard focus' }
$r = $edit.Current.BoundingRectangle
[ordered]@{ x=[int]$r.X; y=[int]$r.Y; width=[int]$r.Width; height=[int]$r.Height } | ConvertTo-Json -Compress
`);
  return JSON.parse(raw);
}

function foregroundHwnd() {
  const raw = powershell(`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class YzForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
[YzForeground]::GetForegroundWindow().ToInt64()
`);
  return Number(raw);
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

const csc = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
].find((candidate) => fs.existsSync(candidate));
if (!csc) throw new Error('未找到 csc.exe');
execFileSync(csc, [
  '/nologo',
  `/out:${exe}`,
  '/r:System.Windows.Forms.dll',
  '/r:System.Drawing.dll',
  source,
], { windowsHide: true, timeout: 30_000 });

const child = spawn(exe, [file], {
  detached: true,
  stdio: 'ignore',
  windowsHide: false,
});
child.unref();

let target = null;
for (let i = 0; i < 40 && !target; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  target = findWindow(token);
}
if (!target) {
  try { fs.rmSync(file, { force: true }); } catch {}
  try { fs.rmSync(source, { force: true }); } catch {}
  try { fs.rmSync(exe, { force: true }); } catch {}
  throw new Error('未找到临时控制测试窗口');
}

let agent = null;
try {
  agent = new RemoteControlAgent();
  await agent.start({
    selfNames: selfProcNames(),
    selfPid: process.pid,
    allowSelf: false,
  });
  await agent.call({ op: 'key', keys: ['Alt'] }, 8_000);
  activate(target);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const x = Math.round(target.rect.x + target.rect.width / 2);
  const y = Math.round(target.rect.y + Math.min(target.rect.height - 40, 120));
  await agent.call({ op: 'move', x, y }, 8_000);
  const durations = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = performance.now();
    const event = await agent.call({ op: 'click', x, y, button: 'left', double: false }, 8_000);
    if (!event.ok) throw new Error(event.error || 'click failed');
    durations.push(performance.now() - t0);
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (foregroundHwnd() !== Number(target.hwnd)) {
    throw new Error('临时测试窗口未获得前台焦点，已中止输入以避免误敲其它应用');
  }

  const typeStart = performance.now();
  const typed = await agent.call({ op: 'type', text: marker }, 8_000);
  if (!typed.ok) throw new Error(typed.error || 'type failed');
  durations.push(performance.now() - typeStart);

  const keyStart = performance.now();
  const savedKey = await agent.call({ op: 'key', keys: ['Control', 's'] }, 8_000);
  if (!savedKey.ok) throw new Error(savedKey.error || 'save key failed');
  durations.push(performance.now() - keyStart);
  await new Promise((resolve) => setTimeout(resolve, 700));

  const saved = fs.readFileSync(file, 'utf8');
  if (!saved.includes(marker)) throw new Error(`文件内容未写入：${saved.slice(0, 120)}`);
  const measuredP95 = p95(durations);
  if (measuredP95 > 200) throw new Error(`热态输入 P95=${measuredP95.toFixed(1)}ms，超过 200ms 目标`);

  console.log(JSON.stringify({
    ok: true,
    samples: durations.map((value) => Math.round(value)),
    p95Ms: Math.round(measuredP95),
    verified: 'click + unicode text + Ctrl+S + file content',
  }, null, 2));
} finally {
  try { agent?.stop(); } catch {}
  try {
    process.kill(Number(target.pid));
  } catch {
    try { execFileSync('taskkill.exe', ['/PID', String(target.pid), '/T', '/F'], { windowsHide: true, timeout: 10_000 }); } catch {}
  }
  fs.rmSync(file, { force: true });
  fs.rmSync(source, { force: true });
  try { fs.rmSync(exe, { force: true }); } catch {}
}
