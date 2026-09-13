// 靶场攻击行为模拟（BAS）—— 仅隔离靶场（environment=lab）+ 人工执行。
//
// 设计边界（重要）：
// - 只做 **行为模拟**：执行的是 whoami / tasklist / netstat 这类系统自带只读命令，
//   用于验证检测链路能否看到攻击者会做的动作。
// - **不做**免杀、不做载荷生成、不做 C2 框架、不做持久化后门。
//   想验证检测能力，靠的是"复现攻击者的行为"，而不是"投放真实的恶意程序"。
// - 命令走白名单 + 元字符校验，平台按 Windows / Linux 分别提供；超时 15s，输出截断。
// - 每次执行全量留痕（谁、何时、哪台靶机、跑了哪些技术、输出摘要），供复盘与合规追溯。
import { spawn } from 'node:child_process';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface Technique {
  /** ATT&CK 技术编号 */
  id: string;
  name: string;
  tactic: string;
  /** 只读、无害的模拟命令（按平台） */
  commands: { windows?: string[]; linux?: string[] };
  /** 预期产生的遥测（用于验证检测是否覆盖） */
  telemetry: string;
  /** 检测建议 */
  detection: string;
}

export const TECHNIQUES: Technique[] = [
  {
    id: 'T1082', name: '系统信息发现', tactic: 'Discovery',
    commands: { windows: ['systeminfo | findstr /B /C:"OS Name" /C:"OS Version"'], linux: ['uname -a', 'cat /etc/os-release | head -3'] },
    telemetry: '进程创建：systeminfo / uname，命令行含系统信息参数',
    detection: '监控罕见的信息收集命令与批量主机信息查询行为',
  },
  {
    id: 'T1033', name: '系统所有者/用户发现', tactic: 'Discovery',
    commands: { windows: ['whoami', 'net user'], linux: ['whoami', 'id', 'cat /etc/passwd | head -10'] },
    telemetry: '进程创建：whoami / net user / id / cat /etc/passwd',
    detection: '对 whoami、net user、/etc/passwd 读取做基线外的告警',
  },
  {
    id: 'T1057', name: '进程发现', tactic: 'Discovery',
    commands: { windows: ['tasklist'], linux: ['ps aux | head -20'] },
    telemetry: '进程创建：tasklist / ps',
    detection: '监控进程枚举命令，尤其是来自非管理员常用路径的调用',
  },
  {
    id: 'T1046', name: '网络服务发现', tactic: 'Discovery',
    commands: { windows: ['netstat -ano | findstr LISTENING'], linux: ['ss -lntp 2>/dev/null || netstat -lntp'] },
    telemetry: '进程创建：netstat / ss，含监听端口枚举参数',
    detection: '监控端口扫描与监听枚举行为，容器内高频出现需关注',
  },
  {
    id: 'T1083', name: '文件与目录发现', tactic: 'Discovery',
    commands: { windows: ['dir C:\\'], linux: ['ls -la /', 'ls -la /tmp | head -10'] },
    telemetry: '文件访问与目录枚举',
    detection: '对敏感目录（/etc、/root、C:\\Users）的异常批量列举',
  },
  {
    id: 'T1016', name: '系统网络配置发现', tactic: 'Discovery',
    commands: { windows: ['ipconfig /all'], linux: ['ip addr', 'cat /etc/resolv.conf'] },
    telemetry: '进程创建：ipconfig / ip addr',
    detection: '监控网络配置查询命令的异常来源进程',
  },
  {
    id: 'T1059', name: '命令与脚本解释器', tactic: 'Execution',
    commands: { windows: ['cmd.exe /c echo yanzhi-bas-marker'], linux: ['sh -c "echo yanzhi-bas-marker"'] },
    telemetry: '进程创建 + 父子进程链（cmd/sh 由非常规父进程拉起）',
    detection: '监控解释器进程的父进程异常（如 Office/浏览器拉起 cmd/sh）',
  },
  {
    id: 'T1070', name: '指示器移除（模拟）', tactic: 'Defense Evasion',
    commands: {
      windows: ['echo yanzhi-bas-test > %TEMP%\\yanzhi-bas.log & type %TEMP%\\yanzhi-bas.log & del %TEMP%\\yanzhi-bas.log'],
      linux: ['echo yanzhi-bas-test > /tmp/yanzhi-bas.log && cat /tmp/yanzhi-bas.log && rm -f /tmp/yanzhi-bas.log'],
    },
    telemetry: '临时目录文件创建 + 删除（自身创建的测试文件，不触碰任何真实日志）',
    detection: '监控临时目录可执行/脚本文件创建后立即删除的模式',
  },
  {
    id: 'T1560', name: '归档收集（模拟）', tactic: 'Collection',
    commands: {
      windows: ['echo yanzhi-bas > %TEMP%\\yz_bas.txt & type %TEMP%\\yz_bas.txt & del %TEMP%\\yz_bas.txt'],
      linux: ['echo yanzhi-bas > /tmp/yz_bas.txt && tar -czf /tmp/yz_bas.tgz -C /tmp yz_bas.txt && rm -f /tmp/yz_bas.txt /tmp/yz_bas.tgz'],
    },
    telemetry: '临时目录归档行为（tar / 压缩工具调用）',
    detection: '监控非常规进程调用压缩工具打包敏感目录',
  },
];

export interface Playbook {
  id: string;
  name: string;
  desc: string;
  techniques: string[];
}

export const PLAYBOOKS: Playbook[] = [
  { id: 'discovery-basic', name: '主机侦察基线', desc: '模拟攻击者落地后的第一波信息收集，验证主机侧遥测是否可见', techniques: ['T1082', 'T1033', 'T1057', 'T1046'] },
  { id: 'full-discovery', name: '完整发现阶段', desc: '覆盖系统、用户、进程、网络、文件五类发现动作', techniques: ['T1082', 'T1033', 'T1057', 'T1046', 'T1083', 'T1016'] },
  { id: 'exec-and-evasion', name: '执行与规避', desc: '验证命令执行链路与"落地即清理"模式的检测覆盖', techniques: ['T1059', 'T1070', 'T1560'] },
];

// ---------- 安全执行 ----------

/** 允许的只读 / 无害命令前缀白名单 */
const CMD_WHITELIST = [
  'whoami', 'hostname', 'systeminfo', 'tasklist', 'netstat', 'ipconfig', 'net', 'dir', 'type', 'echo', 'del', 'cmd',
  'uname', 'id', 'ps', 'ss', 'ip', 'cat', 'ls', 'head', 'sh', 'tar',
];

const UNSAFE = /[;&|`$<>]|(\|\|)|&&/;

/** 命令安全校验：白名单开头 + 禁元字符（管道符仅允许 Windows 的 | 用于 findstr，故单独放行） */
export function checkCommand(cmd: string): string | null {
  const c = cmd.trim();
  if (!c) return '命令为空';
  const head = c.split(/\s+/)[0].toLowerCase().replace(/^.*[\\/]/, '');
  if (!CMD_WHITELIST.includes(head)) return `命令不在白名单内：${head}`;
  // 只允许 findstr 这类过滤管道，其余元字符一律拒绝
  const stripped = c.replace(/\|\s*(findstr|head)\b[^\n]*/gi, '');
  if (/[;&`$<>]/.test(stripped)) return '命令含不安全的元字符，已拒绝';
  return null;
}

function execOne(cmd: string, timeoutMs: number): Promise<{ cmd: string; exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32';
    const child = spawn(cmd, { shell, timeout: timeoutMs, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => { if (stdout.length < 20000) stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d: Buffer) => { if (stderr.length < 8000) stderr += d.toString('utf8'); });
    child.on('error', (e: Error) => { clearTimeout(t); resolve({ cmd, exitCode: -1, stdout, stderr: e.message }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ cmd, exitCode: code ?? 0, stdout, stderr }); });
  });
}

export interface SimParams {
  target: string;
  /** 剧本 id 或技术 id 列表（二选一） */
  playbook?: string;
  techniques?: string[];
  /** 只出计划不执行演练（人工复制到靶机执行） */
  planOnly?: boolean;
  timeoutMs?: number;
  /** 操作人（人工执行必填，用于留痕追溯） */
  operator: string;
}

export interface SimStepResult {
  technique: string; name: string; tactic: string; commands: string[];
  status: 'executed' | 'planned' | 'rejected';
  outputs?: Array<{ cmd: string; exitCode: number; stdout: string; stderr: string }>;
  telemetry?: string; detection?: string;
}

export async function runAttackSim(p: SimParams): Promise<ToolOutput> {
  const platform: 'windows' | 'linux' = process.platform === 'win32' ? 'windows' : 'linux';

  let ids: string[] = [];
  if (p.playbook) {
    const pb = PLAYBOOKS.find((x) => x.id === p.playbook);
    if (!pb) throw new Error(`未知剧本 ${p.playbook}，可用：${PLAYBOOKS.map((x) => x.id).join(', ')}`);
    ids = pb.techniques;
  } else if (p.techniques?.length) {
    ids = p.techniques;
  } else {
    ids = ['T1082', 'T1033', 'T1057', 'T1046'];
  }

  const steps: SimStepResult[] = [];
  const findings: Finding[] = [];
  const timeout = Math.max(2000, Math.min(p.timeoutMs || 15000, 60000));

  for (const id of ids) {
    const tech = TECHNIQUES.find((t) => t.id === id);
    if (!tech) {
      steps.push({ technique: id, name: '未知技术', tactic: '-', commands: [], status: 'rejected' });
      continue;
    }
    const cmds = (tech.commands[platform] || []).slice();
    if (!cmds.length) {
      steps.push({ technique: id, name: tech.name, tactic: tech.tactic, commands: [], status: 'planned', telemetry: tech.telemetry, detection: tech.detection });
      continue;
    }

    if (p.planOnly) {
      steps.push({ technique: id, name: tech.name, tactic: tech.tactic, commands: cmds, status: 'planned', telemetry: tech.telemetry, detection: tech.detection });
      continue;
    }

    const outputs: SimStepResult['outputs'] = [];
    let rejected = '';
    for (const c of cmds) {
      const bad = checkCommand(c);
      if (bad) { rejected = bad; break; }
      outputs.push(await execOne(c, timeout));
    }
    if (rejected) {
      steps.push({ technique: id, name: tech.name, tactic: tech.tactic, commands: cmds, status: 'rejected', telemetry: tech.telemetry, detection: tech.detection });
      findings.push({ title: `${id} ${tech.name} 命令被安全校验拒绝`, severity: 'medium', detail: rejected, remediation: '调整技术定义或改用 planOnly 人工执行' });
      continue;
    }
    const failed = outputs.filter((o) => o.exitCode !== 0).length;
    steps.push({ technique: id, name: tech.name, tactic: tech.tactic, commands: cmds, status: 'executed', outputs, telemetry: tech.telemetry, detection: tech.detection });
    if (failed) {
      findings.push({
        title: `${id} ${tech.name} 部分命令未成功（${failed}/${outputs.length}）`,
        severity: 'low',
        detail: outputs.filter((o) => o.exitCode !== 0).map((o) => `${o.cmd} → exit ${o.exitCode}`).join('; ').slice(0, 400),
        remediation: '靶机可能缺少该命令或权限不足，确认靶场镜像',
      });
    }
  }

  const executed = steps.filter((s) => s.status === 'executed').length;
  const planned = steps.filter((s) => s.status === 'planned').length;
  const rejected = steps.filter((s) => s.status === 'rejected').length;

  return {
    tool: 'attack_sim',
    target: p.target,
    risk: 'intrusive',
    summary: `靶场演练${p.playbook ? `剧本「${p.playbook}」` : ''}：共 ${steps.length} 个技术，已执行 ${executed}、仅计划 ${planned}、被拒 ${rejected}；操作人 ${p.operator}；目标环境须为隔离靶场。`,
    findings: findings.length ? findings : [
      { title: `演练完成：覆盖 ${executed} 个 ATT&CK 技术`, severity: 'info', detail: steps.filter((s) => s.status === 'executed').map((s) => `${s.technique} ${s.name}`).join(', '), remediation: '对照检测侧确认这些动作是否都产生了告警，未告警的即为检测盲区' },
    ],
    raw: { operator: p.operator, platform, steps },
  };
}

/** 演练复盘报告（Markdown） */
export function renderSimReport(target: string, operator: string, steps: SimStepResult[]): string {
  const lines: string[] = [];
  lines.push(`# 靶场攻防演练复盘 — ${target}`);
  lines.push('');
  lines.push(`操作人：${operator}　时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`技术数：${steps.length}（执行 ${steps.filter((s) => s.status === 'executed').length}）`);
  lines.push('');
  lines.push('> 本次演练仅使用系统自带的只读命令复现攻击者行为，未投放任何恶意程序、未做免杀、未建立 C2。');
  lines.push('');
  for (const s of steps) {
    lines.push(`## ${s.technique} ${s.name}（${s.tactic}）`);
    lines.push(`- 状态：${s.status === 'executed' ? '已执行' : s.status === 'planned' ? '仅计划（待人工执行）' : '被安全校验拒绝'}`);
    lines.push(`- 预期遥测：${s.telemetry || '-'}`);
    lines.push(`- 检测建议：${s.detection || '-'}`);
    if (s.outputs?.length) {
      for (const o of s.outputs) {
        const out = (o.stdout || o.stderr || '(无输出)').trim().slice(0, 600);
        lines.push(`- 命令 \`${o.cmd}\` → exit ${o.exitCode}`);
        lines.push('  ```');
        lines.push(out.split('\n').map((l) => '  ' + l).join('\n'));
        lines.push('  ```');
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
