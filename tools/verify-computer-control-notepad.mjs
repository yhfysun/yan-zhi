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

const file = path.join(os.tmpdir(), `yz-computer-notepad-${randomUUID()}.txt`);
const marker = `notepad-${Date.now()}`;
fs.writeFileSync(file, '', 'utf8');

const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
  encoding: 'utf8',
  windowsHide: true,
  timeout: 20_000,
}).trim();

function findWindow(fragment) {
  const encoded = Buffer.from(fragment, 'utf8').toString('base64');
  const raw = ps(`
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class YzFindNotepad {
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
      RECT r; GetWindowRect(h, out r); found = h; title = t.ToString();
      GetWindowThreadProcessId(h, out pid); rect = r; return false;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return "null";
    return "{\\"hwnd\\":" + found.ToInt64() + ",\\"pid\\":" + pid + ",\\"title\\":\\"" + title.Replace("\\"", "\\\\\\"") + "\\",\\"rect\\":{\\"x\\":" + rect.L + ",\\"y\\":" + rect.T + ",\\"width\\":" + (rect.R-rect.L) + ",\\"height\\":" + (rect.B-rect.T) + "}}";
  }
}
'@
$fragment = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))
[YzFindNotepad]::Find($fragment)
`);
  return raw && raw !== 'null' ? JSON.parse(raw) : null;
}

const child = spawn('notepad.exe', [file], { detached: true, stdio: 'ignore', windowsHide: false });
child.unref();

let target = null;
for (let i = 0; i < 40 && !target; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  target = findWindow(path.basename(file));
}
if (!target) throw new Error('未找到测试记事本窗口');

let agent = null;
try {
  ps(`
$ws = New-Object -ComObject WScript.Shell
$ws.AppActivate(${target.pid}) | Out-Null
`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  agent = new RemoteControlAgent();
  await agent.start({ selfNames: selfProcNames(), selfPid: process.pid, allowSelf: false });
  const x = Math.round(target.rect.x + target.rect.width / 2);
  const y = Math.round(target.rect.y + Math.min(target.rect.height - 60, 150));
  await agent.call({ op: 'click', x, y, button: 'left', double: false }, 8_000);
  const typed = await agent.call({ op: 'type', text: marker }, 8_000);
  if (!typed.ok) throw new Error(typed.error || 'type failed');
  const saved = await agent.call({ op: 'key', keys: ['Control', 's'] }, 8_000);
  if (!saved.ok) throw new Error(saved.error || 'save failed');
  await new Promise((resolve) => setTimeout(resolve, 600));
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(marker)) throw new Error(`记事本文件内容未写入：${text.slice(0, 120)}`);
  console.log(JSON.stringify({ ok: true, verified: 'notepad click + unicode text + Ctrl+S' }, null, 2));
} finally {
  try { agent?.stop(); } catch {}
  try { process.kill(Number(target.pid)); } catch {}
  fs.rmSync(file, { force: true });
}
