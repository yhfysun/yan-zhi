// B 轨工具：toolchain —— 外部安全工具探测（detect）+ 受控执行（run）。
// 设计原则：
//   1. 未安装不阻塞 —— detect 返回清单，缺失的给出安装建议，A 轨自研能力自动顶上；
//   2. 只跑白名单二进制，参数数组化传给 spawn（shell:false），杜绝元字符注入；
//   3. 命令再过一遍 sec-lab-guard 的 DANGEROUS_PATTERNS，双重保险。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isDangerous, capOutput } from '../sec-lab-guard.js';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface ExternalTool {
  name: string;
  /** 候选可执行名（按序探测） */
  bin: string[];
  /** Windows 下的常见安装路径（兜底） */
  winPaths?: string[];
  /** 对应能力描述（未安装时提示用哪个 A 轨工具替代） */
  capability: string;
  /** 安装建议 */
  install: string;
  /** 默认参数构造（受控，不接受任意参数拼接） */
  buildArgs?: (params: RunParams) => string[];
  parse?: (stdout: string) => { findings: Finding[]; raw?: unknown };
}

export interface RunParams {
  tool: string;
  target: string;
  ports?: string;
  /** 附加参数（受白名单与字符校验约束） */
  extraArgs?: string[];
  timeoutMs: number;
}

/** 允许执行的外部工具白名单 —— 不在此表内的二进制一律拒绝 */
export const TOOLCHAIN: Record<string, ExternalTool> = {
  nmap: {
    name: 'nmap',
    bin: ['nmap'],
    winPaths: ['C:\\Program Files (x86)\\Nmap\\nmap.exe', 'C:\\Program Files\\Nmap\\nmap.exe'],
    capability: '端口扫描 / 服务识别（A 轨替代：portscan）',
    install: 'Windows: https://nmap.org/download.html ；Debian/Ubuntu: apt install nmap ；macOS: brew install nmap',
    buildArgs: (p) => ['-sV', '-T4', '--open', '-Pn', p.ports ? `-p${p.ports}` : '-F', p.target],
    parse: (stdout) => {
      const findings: Finding[] = [];
      const rows: Array<{ port: string; state: string; service: string; version: string }> = [];
      for (const line of stdout.split('\n')) {
        const m = /^(\d+)\/(tcp|udp)\s+(\w+)\s+(\S+)\s*(.*)$/.exec(line.trim());
        if (m) rows.push({ port: `${m[1]}/${m[2]}`, state: m[3], service: m[4], version: (m[5] || '').trim() });
      }
      if (rows.length) {
        findings.push({
          title: `nmap 发现 ${rows.length} 个开放端口`,
          severity: 'info',
          detail: rows.map((r) => `${r.port} ${r.service} ${r.version}`.trim()).join(', ').slice(0, 1000),
        });
      }
      return { findings, raw: { rows } };
    },
  },
  nuclei: {
    name: 'nuclei',
    bin: ['nuclei'],
    capability: '模板化漏洞扫描（A 轨替代：webprobe 的指纹规则子集）',
    install: 'go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest 或下载 release',
    buildArgs: (p) => ['-u', p.target, '-json', '-silent', '-severity', 'medium,high,critical'],
    parse: (stdout) => {
      const findings: Finding[] = [];
      const items: unknown[] = [];
      for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const j = JSON.parse(line) as { info?: { name?: string; severity?: string }; matched?: string; template?: string };
          items.push(j);
          findings.push({
            title: j.info?.name || j.template || 'nuclei 命中',
            severity: (['info', 'low', 'medium', 'high', 'critical'].includes(j.info?.severity || '')
              ? j.info?.severity
              : 'medium') as Finding['severity'],
            detail: `matched: ${j.matched || '-'}`,
            evidence: j.matched,
          });
        } catch { /* 非 JSON 行忽略 */ }
      }
      return { findings, raw: { items } };
    },
  },
  nikto: {
    name: 'nikto',
    bin: ['nikto'],
    capability: 'Web 服务器综合扫描（A 轨替代：webprobe）',
    install: 'apt install nikto / brew install nikto',
    buildArgs: (p) => ['-h', p.target, '-Format', 'txt', '-nointeractive'],
  },
  whatweb: {
    name: 'whatweb',
    bin: ['whatweb'],
    capability: 'Web 指纹识别（A 轨替代：recon/http）',
    install: 'apt install whatweb / brew install whatweb',
    buildArgs: (p) => ['-v', p.target],
  },
  ffuf: {
    name: 'ffuf',
    bin: ['ffuf'],
    capability: '目录与参数爆破（A 轨替代：webprobe 路径探测）',
    install: 'go install github.com/ffuf/ffuf/v2@latest',
  },
  sqlmap: {
    name: 'sqlmap',
    bin: ['sqlmap'],
    capability: 'SQL 注入检测（侵入级，需交战模式）',
    install: 'apt install sqlmap / brew install sqlmap',
  },
  hydra: {
    name: 'hydra',
    bin: ['hydra'],
    capability: '弱口令检测（侵入级，需交战模式）',
    install: 'apt install hydra / brew install hydra',
  },
  masscan: {
    name: 'masscan',
    bin: ['masscan'],
    capability: '高速端口扫描（A 轨替代：portscan）',
    install: 'apt install masscan / brew install masscan',
  },
};

/** 侵入级工具：调用前需交战模式 + confirmed */
export const INTRUSIVE_TOOLS = new Set(['sqlmap', 'hydra']);

function probeBin(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const child = spawn(cmd, [bin], { shell: false, windowsHide: true });
    let out = '';
    child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      resolve(first || null);
    });
  });
}

/** 探测单个外部工具是否可用（PATH + Windows 常见安装路径） */
export async function detectTool(def: ExternalTool): Promise<{ name: string; available: boolean; path?: string; install: string; capability: string }> {
  for (const b of def.bin) {
    const p = await probeBin(b);
    if (p) return { name: def.name, available: true, path: p, install: def.install, capability: def.capability };
  }
  if (process.platform === 'win32' && def.winPaths) {
    for (const p of def.winPaths) {
      try {
        if (fs.existsSync(p)) return { name: def.name, available: true, path: p, install: def.install, capability: def.capability };
      } catch { /* ignore */ }
    }
  }
  return { name: def.name, available: false, install: def.install, capability: def.capability };
}

/** 探测全部白名单工具 */
export async function detectAll(): Promise<Array<{ name: string; available: boolean; path?: string; install: string; capability: string }>> {
  return Promise.all(Object.values(TOOLCHAIN).map(detectTool));
}

/** 参数字符校验：拒绝 shell 元字符（即便 shell:false 也防一层） */
const UNSAFE_ARG = /[;&|`$<>\\!\n\r]/;

export function validateArgs(args: string[]): string | null {
  for (const a of args) {
    if (UNSAFE_ARG.test(a)) return `参数含不安全字符，已拒绝：${a.slice(0, 80)}`;
  }
  return null;
}

/** 受控执行外部工具 */
export async function runExternal(p: RunParams, binPath: string): Promise<ToolOutput> {
  const def = TOOLCHAIN[p.tool];
  if (!def) throw new Error(`工具 ${p.tool} 不在白名单内`);
  const args = def.buildArgs ? def.buildArgs(p) : [p.target];
  if (p.extraArgs?.length) args.push(...p.extraArgs);

  const bad = validateArgs(args);
  if (bad) throw new Error(bad);
  const cmdline = `${p.tool} ${args.join(' ')}`;
  if (isDangerous(cmdline)) throw new Error(`命令命中危险黑名单，已拒绝：${cmdline.slice(0, 120)}`);

  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { shell: false, windowsHide: true, cwd: path.dirname(binPath) });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error(`${p.tool} 执行超时（${p.timeoutMs}ms）已终止`));
    }, p.timeoutMs);

    child.stdout?.on('data', (d: Buffer) => { if (stdout.length < 400000) stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d: Buffer) => { if (stderr.length < 100000) stderr += d.toString('utf8'); });
    child.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const parsed = def.parse ? def.parse(stdout) : { findings: [] as Finding[], raw: undefined };
      const capped = capOutput(stdout || stderr);
      resolve({
        tool: `toolchain:${p.tool}`,
        target: p.target,
        risk: INTRUSIVE_TOOLS.has(p.tool) ? 'intrusive' : 'active',
        summary: `${p.tool} 执行结束（exit ${code}）。${parsed.findings.length ? `解析出 ${parsed.findings.length} 项结果。` : '未解析出结构化结果，见原始输出。'}`,
        findings: parsed.findings.length
          ? parsed.findings
          : [{ title: `${p.tool} 原始输出`, severity: 'info', detail: capped.text.slice(0, 2000) }],
        raw: parsed.raw ?? { exitCode: code, stdout: capped.text.slice(0, 8000), stderr: stderr.slice(0, 2000) },
        truncated: capped.truncated,
      });
    });
  });
}
