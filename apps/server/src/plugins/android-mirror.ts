// android-mirror 内置插件：用 scrcpy 在电脑上镜像并操作安卓手机
//
// 设计口径：
//  · 画面交给我们内置的 scrcpy（tools/scrcpy/scrcpy.exe，5.0.1）自己渲染 —— 零解码成本，
//    延迟与官方一致；插件只负责「发现设备 / 配对 / 启动 / 断开 / 参数」与审计。
//  · adb 优先用 Android SDK 的 platform-tools（打包环境里一定有），其次 PATH。
//  · 只登记桌面端：手机 App 里没有 adb，也没有可执行文件。
import type { PluginManifest, PluginModule } from '@yan-zhi/core';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ID = 'android-mirror';
/** ESM 没有 __dirname：按模块自身位置定位，才能在「cwd 不是仓库根」时也找到 tools/scrcpy */
const HERE = path.dirname(fileURLToPath(import.meta.url));

interface DeviceInfo { serial: string; state: string; model?: string; product?: string }

/**
 * 仓库根：服务进程的 cwd 在桌面端里可能是 apps/server，也可能是别处，
 * 所以从 cwd 逐级上溯 + 从模块自身位置上溯，找到含 tools/scrcpy 或 packages/ui 的那一层。
 */
function findRepoRoot(): string {
  const starts = [process.cwd(), path.resolve(HERE, '..', '..', '..', '..')];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 4; i += 1) {
      if (fs.existsSync(path.join(dir, 'tools', 'scrcpy', 'scrcpy.exe')) || fs.existsSync(path.join(dir, 'packages', 'ui'))) {
        return dir;
      }
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return process.cwd();
}

function resolveAdb(): string {
  const localApp = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
  const candidates = [
    process.env.YZ_ADB,
    process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe') : '',
    process.env.ANDROID_SDK_ROOT ? path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe') : '',
    localApp ? path.join(localApp, 'Android', 'Sdk', 'platform-tools', 'adb.exe') : '',
    // 内置 scrcpy 自带一份 adb，最后兜底
    path.join(findRepoRoot(), 'tools', 'scrcpy', 'adb.exe'),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'adb';
}

function resolveScrcpy(): string {
  const root = findRepoRoot();
  const candidates = [
    process.env.YZ_SCRCPY,
    path.join(root, 'tools', 'scrcpy', 'scrcpy.exe'),
    path.join(process.cwd(), 'tools', 'scrcpy', 'scrcpy.exe'),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return '';
}

function runCmd(bin: string, args: string[], timeoutMs = 15000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      const out = `${stdout || ''}${stderr || ''}`.trim();
      resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, out });
    });
  });
}

function parseDevices(out: string): DeviceInfo[] {
  const lines = out.split(/\r?\n/);
  const list: DeviceInfo[] = [];
  const STATES = ['device', 'offline', 'unauthorized', 'recovery', 'sideload', 'bootloader'];
  for (const line of lines) {
    if (!line || /^List of devices/.test(line) || /^\*/.test(line)) continue;
    const toks = line.trim().split(/\s+/);
    // 无线调试的序列号里可能带空格（`adb-xxx (2)._adb-tls-connect._tcp device ...`），
    // 不能简单按「第一列=序列号、第二列=状态」切，按已知状态词定位分界。
    const stateIdx = toks.findIndex((t) => STATES.includes(t));
    if (stateIdx < 1) continue;
    const serial = toks.slice(0, stateIdx).join(' ');
    const state = toks[stateIdx];
    const rest = toks.slice(stateIdx + 1).join(' ');
    const grab = (k: string): string | undefined => {
      const mm = rest.match(new RegExp(`${k}:([^\\s]+)`));
      return mm?.[1];
    };
    list.push({ serial, state, model: grab('model'), product: grab('product') });
  }
  return list;
}

export const androidMirrorManifest: PluginManifest = {
  id: ID,
  name: '安卓远控',
  version: '0.1.0',
  category: '操作',
  description:
    '把安卓手机实时镜像到电脑并直接操作（USB / 无线调试均可）：内置 scrcpy 5.0.1，支持选择设备、分辨率与码率、一键断开。画面由 scrcpy 独立窗口渲染，键盘鼠标直通手机。默认关闭，可在插件管理页启用。',
  permissions: ['shell'],
  contributes: {
    routes: [
      { path: '/android-mirror', name: 'android-mirror', component: 'views/plugin/AndroidMirror.vue', meta: { desktopOnly: true } },
    ],
    sidebar: [
      {
        id: 'android-mirror',
        icon: 'Iphone',
        route: '/android-mirror',
        label: '安卓远控',
        order: 61,
        when: 'desktop',
        moreGroup: 'connection',
        desc: '手机投屏与操作（scrcpy）',
      },
    ],
    tools: [],
  },
  config: {
    maxSize: { type: 'number', default: 1280, description: '画面最长边像素（越大越清晰，越吃带宽）' },
    bitRate: { type: 'number', default: 8000000, description: '视频码率（bps），默认 8 Mbps' },
    stayAwake: { type: 'boolean', default: true, description: '连接期间保持手机屏幕常亮' },
    turnScreenOff: { type: 'boolean', default: false, description: '连接时关掉手机屏幕（省电，画面仍在）' },
  },
};

export const androidMirrorModule: PluginModule = {
  activate: (ctx) => {
    let child: ChildProcess | null = null;
    let runningSerial = '';
    let lastError = '';
    let log: (msg: string) => void = () => undefined;

    const cfg = (): { maxSize: number; bitRate: number; stayAwake: boolean; turnScreenOff: boolean } => {
      const c = ctx.config || {};
      return {
        maxSize: Math.max(480, Math.min(2560, Number(c.maxSize) || 1280)),
        bitRate: Math.max(1000000, Math.min(50000000, Number(c.bitRate) || 8000000)),
        stayAwake: c.stayAwake !== false,
        turnScreenOff: c.turnScreenOff === true,
      };
    };

    const stopScrcpy = (): void => {
      if (!child) return;
      try {
        child.kill();
      } catch { /* ignore */ }
      child = null;
      runningSerial = '';
    };

    ctx.registerBackendRoute((raw) => {
      const r = raw as {
        get: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
        post: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
      };
      const body = (req: unknown): Record<string, unknown> => {
        const b = (req as { body?: unknown }).body;
        return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
      };

      r.get('/status', async (_req, res) => {
        try {
          const adb = resolveAdb();
          const scrcpy = resolveScrcpy();
          let devices: DeviceInfo[] = [];
          let adbOk = false;
          try {
            const { code, out } = await runCmd(adb, ['devices', '-l'], 8000);
            adbOk = code === 0 || out.includes('List of devices');
            devices = parseDevices(out);
          } catch { /* adb 不可用 */ }
          let scrcpyVersion = '';
          if (scrcpy) {
            try {
              const { out } = await runCmd(scrcpy, ['--version'], 8000);
              scrcpyVersion = (out.split(/\r?\n/)[0] || '').trim();
            } catch { /* ignore */ }
          }
          res.json({
            data: {
              adb,
              adbOk,
              devices,
              scrcpy,
              scrcpyOk: !!scrcpy,
              scrcpyVersion,
              running: child ? { serial: runningSerial, pid: child.pid } : null,
              lastError,
              settings: cfg(),
            },
          });
        } catch (e) {
          res.json({ error: `状态读取失败: ${(e as Error)?.message || e}` });
        }
      });

      r.post('/connect', async (req, res) => {
        const serial = String(body(req).serial || '').trim();
        if (!serial) {
          res.json({ error: '缺少设备序列号' });
          return;
        }
        const scrcpy = resolveScrcpy();
        if (!scrcpy) {
          res.json({ error: '未找到 scrcpy（期望 tools/scrcpy/scrcpy.exe）。请在插件目录运行 scripts/fetch-scrcpy.mjs 或手动安装。' });
          return;
        }
        if (child) {
          res.json({ error: `已有会话在运行（${runningSerial}），请先断开` });
          return;
        }
        const s = cfg();
        lastError = '';
        const args = [
          '-s', serial,
          '--max-size', String(s.maxSize),
          // scrcpy 5.x 把 --bit-rate 改成了 --video-bit-rate（旧名直接报 unknown option）
          '--video-bit-rate', String(s.bitRate),
          '--window-title', `言智 · 安卓远控（${serial}）`,
        ];
        if (s.stayAwake) args.push('--stay-awake');
        if (s.turnScreenOff) args.push('--turn-screen-off');
        try {
          // ADB 环境变量让 scrcpy 复用我们解析到的那个 adb（否则它会用自带 adb 另起一个
          // adb server，和 SDK 那套抢 5037 端口，无线调试连接会被踢掉）
          const proc = spawn(scrcpy, args, {
            windowsHide: false,
            detached: false,
            // 输出必须接住：scrcpy 参数错误/设备掉线都是打一行到 stderr 就退出，
            // 用 ignore 的话用户在界面上只会看到「没反应」
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ADB: resolveAdb() },
          });
          proc.stdout?.on('data', (d) => log(`[scrcpy] ${String(d).trim()}`));
          proc.stderr?.on('data', (d) => {
            lastError = String(d).trim().slice(0, 300);
            log(`[scrcpy] ${lastError}`);
          });
          child = proc;
          runningSerial = serial;
          log(`[android-mirror] scrcpy 启动 serial=${serial} pid=${proc.pid ?? '?'}`);
          proc.on('exit', (code) => {
            log(`[android-mirror] scrcpy 退出 code=${code} serial=${serial}`);
            if (child === proc) {
              child = null;
              runningSerial = '';
            }
          });
          proc.on('error', (e) => {
            log(`[android-mirror] scrcpy 启动失败: ${(e as Error).message}`);
            if (child === proc) {
              child = null;
              runningSerial = '';
            }
          });
          void ctx.storage.set('last-serial', serial).catch(() => undefined);
          res.json({ data: { ok: true, pid: proc.pid ?? null, serial } });
        } catch (e) {
          res.json({ error: `启动 scrcpy 失败: ${(e as Error).message}` });
        }
      });

      r.post('/disconnect', async (_req, res) => {
        stopScrcpy();
        res.json({ data: { ok: true } });
      });

      // 无线配对（Android 11+）：手机「开发者选项 → 无线调试 → 使用配对码配对」
      r.post('/wireless/pair', async (req, res) => {
        const b = body(req);
        const host = String(b.host || '').trim();
        const port = Number(b.port) || 0;
        const code = String(b.code || '').trim();
        if (!host || !port || !code) {
          res.json({ error: '需要手机 IP、配对端口和 6 位配对码' });
          return;
        }
        const { code: exit, out } = await runCmd(resolveAdb(), ['pair', `${host}:${port}`, code], 30000);
        if (/Successfully paired/i.test(out) || exit === 0) res.json({ data: { ok: true, out } });
        else res.json({ error: out || '配对失败', out });
      });

      r.post('/wireless/connect', async (req, res) => {
        const b = body(req);
        const host = String(b.host || '').trim();
        const port = Number(b.port) || 0;
        if (!host || !port) {
          res.json({ error: '需要手机 IP 和调试端口' });
          return;
        }
        const { out } = await runCmd(resolveAdb(), ['connect', `${host}:${port}`], 20000);
        if (/connected/i.test(out)) res.json({ data: { ok: true, out } });
        else res.json({ error: out || '连接失败', out });
      });

      r.post('/wireless/disconnect', async (_req, res) => {
        const { out } = await runCmd(resolveAdb(), ['disconnect'], 10000);
        res.json({ data: { ok: true, out } });
      });
    });

    log = ctx.log;
  },
};
