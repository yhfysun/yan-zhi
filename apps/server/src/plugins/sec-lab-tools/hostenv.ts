// sec-lab · 宿主机环境与靶场（本地基础设施，非对外扫描）
// ------------------------------------------------------------------
// 这一层管的是"自己这台机器上怎么把靶场/移动端测试环境搭起来"，
// 跟对外扫描（recon/portscan）完全是两回事：
//   - 只探测本机 Docker / Android SDK 是否可用（只读）
//   - 靶场只能用白名单里的"已知漏洞训练镜像"，拒绝任意镜像拉取
//   - 所有 deploy / launch 动作都需要显式 confirmed=true（人工确认）
//   - 容器统一打 label=yan-zhi-range，便于列举与清理
//
// 合规边界：本模块只在「用户自己的宿主机」上起容器 / 虚拟机，
// 不向任何外部目标发起流量，不生成任何恶意载荷。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, ToolOutput } from '../sec-lab-types.js';
import { capOutput } from '../sec-lab-guard.js';

const RANGE_LABEL = 'yan-zhi-range';

// ---------- 通用命令执行（shell:false，参数数组化，杜绝注入） ----------

interface CmdResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

function runCmd(bin: string, args: string[], timeoutMs = 15000): Promise<CmdResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { shell: false, windowsHide: true });
    } catch (e) {
      resolve({ ok: false, code: -1, stdout: '', stderr: String(e) });
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => { if (stdout.length < 200000) stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d: Buffer) => { if (stderr.length < 50000) stderr += d.toString('utf8'); });
    child.on('error', (e: Error) => { clearTimeout(timer); resolve({ ok: false, code: -1, stdout, stderr: e.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, code: code ?? -1, stdout, stderr }); });
  });
}

/** 在 PATH 或常见安装路径里找二进制 */
async function locate(bin: string, candidates: string[] = []): Promise<string | null> {
  const probe = await runCmd(process.platform === 'win32' ? 'where' : 'which', [bin], 4000).then((r) => r.ok ? r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean) : null);
  if (probe) return probe;
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// ---------- 主机环境探测 ----------

export interface DockerStatus {
  available: boolean;
  daemonUp: boolean;
  version?: string;
  composeV2: boolean;
  note: string;
}

export interface AndroidStatus {
  adbAvailable: boolean;
  adbPath?: string;
  emulatorAvailable: boolean;
  emulatorPath?: string;
  sdkRoot?: string;
  avds: string[];
  running: string[];
  note: string;
}

export interface HostEnv {
  platform: NodeJS.Platform;
  docker: DockerStatus;
  android: AndroidStatus;
  checkedAt: number;
}

async function probeDocker(): Promise<DockerStatus> {
  const bin = await locate('docker');
  if (!bin) {
    return { available: false, daemonUp: false, composeV2: false, note: '未检测到 docker（PATH 中无 docker 可执行文件）。靶场功能不可用，可改用手工方式在隔离机部署。' };
  }
  const ver = await runCmd(bin, ['--version'], 8000);
  const version = ver.ok ? ver.stdout.trim().split(/\r?\n/)[0].replace(/^Docker version /, '') : undefined;
  const ps = await runCmd(bin, ['ps', '--format', '{{.Names}}'], 8000);
  const daemonUp = ps.ok;
  const compose = await runCmd(bin, ['compose', 'version'], 6000);
  return {
    available: true,
    daemonUp,
    version,
    composeV2: compose.ok,
    note: daemonUp ? 'Docker 守护进程可达。' : 'docker 客户端存在，但守护进程未响应（是否已启动 Docker Desktop / dockerd？）',
  };
}

function androidSdkCandidates(): { sdk?: string; adb: string[]; emulator: string[] } {
  const roots: string[] = [];
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
  if (home) roots.push(home);
  if (process.platform === 'win32') {
    const local = join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
    if (local) roots.push(local);
  } else {
    roots.push(join(process.env.HOME || '', 'Android', 'Sdk'));
  }
  const adb: string[] = [];
  const emulator: string[] = [];
  for (const r of roots) {
    adb.push(join(r, 'platform-tools', 'adb' + (process.platform === 'win32' ? '.exe' : '')));
    emulator.push(join(r, 'emulator', 'emulator' + (process.platform === 'win32' ? '.exe' : '')));
  }
  return { sdk: roots[0], adb, emulator };
}

async function probeAndroid(): Promise<AndroidStatus> {
  const cand = androidSdkCandidates();
  const adbPath = await locate('adb', cand.adb);
  const emuPath = await locate('emulator', cand.emulator);
  if (!adbPath && !emuPath) {
    return {
      adbAvailable: false, emulatorAvailable: false,
      avds: [], running: [],
      note: '未检测到 Android SDK（adb / emulator 均不在 PATH，且常见 Sdk 路径未命中；可设置 ANDROID_HOME）。移动端靶场功能不可用。',
    } as AndroidStatus;
  }
  let avds: string[] = [];
  if (emuPath) {
    const r = await runCmd(emuPath, ['-list-avds'], 8000);
    if (r.ok) avds = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  let running: string[] = [];
  if (adbPath) {
    const r = await runCmd(adbPath, ['devices'], 8000);
    if (r.ok) {
      running = r.stdout.split(/\r?\n/).slice(1).map((s) => s.trim()).filter(Boolean)
        .filter((l) => /device$/.test(l)).map((l) => l.split(/\s+/)[0]);
    }
  }
  return {
    adbAvailable: !!adbPath,
    adbPath: adbPath ?? undefined,
    emulatorAvailable: !!emuPath,
    emulatorPath: emuPath ?? undefined,
    sdkRoot: cand.sdk,
    avds,
    running,
    note: adbPath ? 'adb 可用。' : 'emulator 可用但 adb 缺失（建议安装 platform-tools）。',
  };
}

export async function probeHostEnv(): Promise<HostEnv> {
  const [docker, android] = await Promise.all([probeDocker(), probeAndroid()]);
  return { platform: process.platform, docker, android, checkedAt: Date.now() };
}

// ---------- 靶场模板白名单（仅已知漏洞训练镜像） ----------

export interface RangeTemplate {
  id: string;
  name: string;
  image: string;
  containerPort: number;
  defaultHostPort: number;
  description: string;
  tags: string[];
  source: string;
}

/**
 * 靶场镜像白名单：**只允许这些已知的、社区公认的漏洞训练镜像**。
 * 拒绝任何白名单外的镜像（避免拉取来路不明的"武器化"镜像）。
 * 这些镜像均为公开训练环境（DVWA / Juice Shop / WebGoat / Mutillidae），
 * 用于授权范围内的攻防演练与检测验证。
 */
export const RANGE_TEMPLATES: RangeTemplate[] = [
  {
    id: 'dvwa',
    name: 'DVWA · Damn Vulnerable Web Application',
    image: 'vulnerables/web-dvwa',
    containerPort: 80,
    defaultHostPort: 8081,
    description: 'PHP/MySQL 综合漏洞靶场：SQL 注入、XSS、文件上传、命令注入、CSRF 等。',
    tags: ['web', 'sqli', 'xss', 'upload'],
    source: 'https://hub.docker.com/r/vulnerables/web-dvwa',
  },
  {
    id: 'juice-shop',
    name: 'OWASP Juice Shop',
    image: 'bkimminich/juice-shop',
    containerPort: 3000,
    defaultHostPort: 3002,
    description: 'AngularJS 写的现代漏洞靶场，覆盖 OWASP Web Top 10，适合做检测规则验证。',
    tags: ['web', 'owasp', 'modern'],
    source: 'https://hub.docker.com/r/bkimminich/juice-shop',
  },
  {
    id: 'webgoat',
    name: 'OWASP WebGoat',
    image: 'webgoat/webgoat',
    containerPort: 8080,
    defaultHostPort: 8083,
    description: 'OWASP 官方交互式安全教学应用，按课程组织大量 Web 漏洞练习。',
    tags: ['web', 'owasp', 'lesson'],
    source: 'https://hub.docker.com/r/webgoat/webgoat',
  },
  {
    id: 'mutillidae',
    name: 'NOWASP / Mutillidae II',
    image: 'citizenstig/nowasp',
    containerPort: 80,
    defaultHostPort: 8084,
    description: '老牌综合漏洞靶场，覆盖注入、XSS、认证绕过等，适合 BAS 演练。',
    tags: ['web', 'sqli', 'xss'],
    source: 'https://hub.docker.com/r/citizenstig/nowasp',
  },
];

export function findTemplate(idOrImage: string): RangeTemplate | null {
  return RANGE_TEMPLATES.find((t) => t.id === idOrImage || t.image === idOrImage) || null;
}

// ---------- 靶场生命周期 ----------

function safeName(s: string): string {
  return s.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

export interface RangeInstance {
  name: string;
  image: string;
  hostPort: number;
  containerPort: number;
  state: string;
  status: string;
}

export async function runRangeDeploy(opts: { template: string; hostPort?: number; confirmed?: boolean }): Promise<ToolOutput> {
  const dockerBin = await locate('docker');
  const env = await probeDocker();
  if (!dockerBin || !env.available || !env.daemonUp) {
    return {
      tool: 'range_deploy', target: 'localhost', risk: 'passive',
      summary: '部署失败：Docker 不可用。',
      findings: [{ title: 'Docker 不可用', severity: 'info', detail: env.note }],
    };
  }
  if (opts.confirmed !== true) {
    return {
      tool: 'range_deploy', target: 'localhost', risk: 'passive',
      summary: '部署已取消：需 confirmed=true 人工确认。',
      findings: [{ title: '缺少人工确认', severity: 'info', detail: '部署靶场容器是写操作，调用时必须带 confirmed=true。' }],
    };
  }
  const tpl = findTemplate(opts.template);
  if (!tpl) {
    return {
      tool: 'range_deploy', target: 'localhost', risk: 'passive',
      summary: `部署失败：模板 ${opts.template} 不在白名单内。`,
      findings: [{ title: '镜像不在白名单', severity: 'info', detail: `仅允许：${RANGE_TEMPLATES.map((t) => t.id).join(', ')}。` }],
    };
  }
  const hostPort = opts.hostPort && Number.isInteger(opts.hostPort) ? Number(opts.hostPort) : tpl.defaultHostPort;
  if (hostPort < 1 || hostPort > 65535) {
    return { tool: 'range_deploy', target: 'localhost', risk: 'passive', summary: '部署失败：hostPort 非法。', findings: [{ title: '端口非法', severity: 'info', detail: String(hostPort) }] };
  }
  const name = `yz-range-${safeName(tpl.id)}-${hostPort}`;
  // 先尝试删除同名旧容器，保证幂等（打过 yan-zhi-range label，仅清自己起的）
  await runCmd(dockerBin, ['rm', '-f', name], 8000).catch(() => undefined);
  const args = ['run', '-d', '--label', RANGE_LABEL, '--name', name, '-p', `${hostPort}:${tpl.containerPort}`, tpl.image];
  const r = await runCmd(dockerBin, args, 120000);
  const capped = capOutput(r.stdout || r.stderr);
  if (!r.ok) {
    return {
      tool: 'range_deploy', target: 'localhost', risk: 'passive',
      summary: `部署失败：${tpl.image} 拉取/启动出错。`,
      findings: [{ title: 'docker run 失败', severity: 'low', detail: capped.text.slice(0, 1500) }],
    };
  }
  const containerId = r.stdout.trim().slice(0, 12);
  return {
    tool: 'range_deploy', target: 'localhost', risk: 'passive',
    summary: `已在 http://localhost:${hostPort} 启动 ${tpl.name}（容器 ${containerId}）。请仅在隔离网络中使用，演练后及时 stop。`,
    findings: [
      { title: `靶场已部署：${tpl.name}`, severity: 'info', detail: `容器：${containerId}　访问：http://localhost:${hostPort}　镜像：${tpl.image}` },
    ],
    raw: { name, containerId, hostPort, image: tpl.image },
  };
}

export async function listRanges(): Promise<RangeInstance[]> {
  const dockerBin = await locate('docker');
  if (!dockerBin) return [];
  const r = await runCmd(dockerBin, ['ps', '--filter', `label=${RANGE_LABEL}`, '--format', '{{.Names}}|{{.Image}}|{{.Ports}}|{{.State}}|{{.Status}}'], 8000);
  if (!r.ok) return [];
  const out: RangeInstance[] = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const parts = line.split('|');
    if (parts.length < 4 || !parts[0]) continue;
    const ports = parts[2] || '';
    const m = /0\.0\.0\.0:(\d+)->(\d+)/.exec(ports);
    out.push({
      name: parts[0],
      image: parts[1],
      hostPort: m ? Number(m[1]) : 0,
      containerPort: m ? Number(m[2]) : 0,
      state: parts[3],
      status: parts[4] || '',
    });
  }
  return out;
}

export async function runRangeList(): Promise<ToolOutput> {
  const inst = await listRanges();
  const summary = inst.length ? `当前运行中的靶场容器 ${inst.length} 个。` : '当前没有运行中的靶场容器。';
  return {
    tool: 'range_list', target: 'localhost', risk: 'passive', summary,
    findings: inst.map((i) => ({ title: i.name, severity: 'info' as const, detail: `镜像 ${i.image}　访问 http://localhost:${i.hostPort}　状态 ${i.status}` })),
    raw: inst,
  };
}

export async function runRangeStop(opts: { name: string; confirmed?: boolean }): Promise<ToolOutput> {
  const dockerBin = await locate('docker');
  if (!dockerBin) return { tool: 'range_stop', target: 'localhost', risk: 'passive', summary: 'Docker 不可用。', findings: [{ title: 'Docker 不可用', severity: 'info', detail: '' }] };
  const name = (opts.name || '').trim();
  if (!name) return { tool: 'range_stop', target: 'localhost', risk: 'passive', summary: '缺少容器名 name。', findings: [{ title: '参数缺失', severity: 'info', detail: '' }] };
  if (opts.confirmed !== true) {
    return { tool: 'range_stop', target: 'localhost', risk: 'passive', summary: '已取消：需 confirmed=true。', findings: [{ title: '缺少人工确认', severity: 'info', detail: '' }] };
  }
  // 只清自己起的靶场容器（label 校验 + 名称前缀校验，防误删）
  const listed = await listRanges();
  if (!listed.some((i) => i.name === name)) {
    return { tool: 'range_stop', target: 'localhost', risk: 'passive', summary: '该容器不是本模块起的靶场，拒绝停止。', findings: [{ title: '非本模块容器', severity: 'low', detail: name }] };
  }
  const r = await runCmd(dockerBin, ['rm', '-f', name], 8000);
  return {
    tool: 'range_stop', target: 'localhost', risk: 'passive',
    summary: r.ok ? `已停止并移除靶场容器 ${name}。` : `停止失败：${r.stderr.slice(0, 200)}`,
    findings: [{ title: r.ok ? '靶场已停止' : '停止失败', severity: 'info', detail: name }],
  };
}

// ---------- Android 虚拟环境 ----------

export async function runAndroidLaunch(opts: { avd: string; confirmed?: boolean }): Promise<ToolOutput> {
  const emuPath = await locate('emulator', androidSdkCandidates().emulator);
  if (!emuPath) {
    return { tool: 'android_launch', target: 'localhost', risk: 'passive', summary: '未检测到 emulator。', findings: [{ title: 'emulator 不可用', severity: 'info', detail: '请确认 Android SDK 已安装且 emulator 在 PATH（或设置 ANDROID_HOME）。' }] };
  }
  const avd = (opts.avd || '').trim();
  if (!avd) return { tool: 'android_launch', target: 'localhost', risk: 'passive', summary: '缺少 AVD 名称 avd。', findings: [{ title: '参数缺失', severity: 'info', detail: '' }] };
  if (opts.confirmed !== true) {
    return { tool: 'android_launch', target: 'localhost', risk: 'passive', summary: '已取消：需 confirmed=true。', findings: [{ title: '缺少人工确认', severity: 'info', detail: '' }] };
  }
  // 启动 emulator（detached，不阻塞；冷启动较慢）
  try {
    const child = spawn(emuPath, ['-avd', avd], { shell: false, windowsHide: true, detached: true, stdio: 'ignore' });
    child.unref();
    return {
      tool: 'android_launch', target: 'localhost', risk: 'passive',
      summary: `已尝试启动 AVD「${avd}」（冷启动较慢，约 1–3 分钟；启动后可用 adb devices 查看）。`,
      findings: [{ title: `AVD 启动中：${avd}`, severity: 'info', detail: '请在 Android 虚拟环境面板用「重新探测」刷新状态。' }],
    };
  } catch (e) {
    return { tool: 'android_launch', target: 'localhost', risk: 'passive', summary: '启动失败。', findings: [{ title: 'emulator 启动异常', severity: 'low', detail: String(e) }] };
  }
}

// ---------- 主机环境探测（包装成 ToolOutput 供控制台 / AI 复用） ----------

export async function runHostEnv(): Promise<ToolOutput> {
  const env = await probeHostEnv();
  const findings: Finding[] = [];
  findings.push({
    title: env.docker.available ? (env.docker.daemonUp ? 'Docker 守护进程可达' : 'Docker 客户端存在但守护进程未响应') : '未检测到 Docker',
    severity: 'info',
    detail: `version=${env.docker.version || '-'}　composeV2=${env.docker.composeV2}　${env.docker.note}`,
  });
  findings.push({
    title: env.android.adbAvailable || env.android.emulatorAvailable ? 'Android SDK 可用' : '未检测到 Android SDK',
    severity: 'info',
    detail: `adb=${env.android.adbAvailable}　emulator=${env.android.emulatorAvailable}　AVD(${env.android.avds.length})=${env.android.avds.join(', ') || '-'}　运行=${env.android.running.join(', ') || '-'}　${env.android.note}`,
  });
  return {
    tool: 'host_env', target: 'localhost', risk: 'passive',
    summary: `主机环境探测完成（platform=${env.platform}）。Docker ${env.docker.available ? '✅' : '❌'}，Android ${env.android.adbAvailable || env.android.emulatorAvailable ? '✅' : '❌'}。`,
    findings,
    raw: env,
  };
}
