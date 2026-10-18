// 本机主机安全基线（Host Baseline，2026-10-18）—— 防御侧，只读。
//
// 与 baseline.ts 的分工：
//   baseline.ts 走网络看远端（HTTP 安全头 / TLS / Cookie）；
//   这里看本机自己（账号策略 / SMBv1 / RDP / UAC / Defender / 防火墙 / SSH / 审计）。
//   等保 2.0 / CIS 里"远程核查看不到"的那部分（账号策略、审计日志），就是这里补的。
//
// 合规边界（硬约束）：
//   - 只执行固定白名单的只读命令（shell:false、参数数组、不拼接任何用户输入）；
//   - 只读文件：/etc/ssh/sshd_config 的内容、/etc/shadow 的权限位；
//   - 不修改任何设置、不发起任何外部流量 —— 这是"体检"，不是"治病"；
//   - 查不到的项如实标 skip（无权限 / 命令不存在 / 输出无法解析），不假装通过。
import { readFileSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import type { Finding, Severity, ToolOutput } from '../sec-lab-types.js';
import { runCmd } from './hostenv.js';

export type CheckStatus = 'ok' | 'fail' | 'skip';

export interface HostCheck {
  id: string;
  title: string;
  status: CheckStatus;
  /** 失败时的严重度（ok / skip 不进 findings） */
  severity: Severity;
  detail: string;
  remediation?: string;
}

/** runHostBaseline 采集到的原始输出（纯数据，assess 函数可脱离环境单测） */
export interface HostRaw {
  platform: string;
  /** net accounts 原文（Windows） */
  netAccounts?: string;
  /** PowerShell 输出：True / False */
  smb1?: string;
  /** 注册表 fDenyTSConnections：1=禁用 RDP */
  rdp?: string;
  /** 注册表 EnableLUA：1=UAC 开启 */
  uac?: string;
  /** PowerShell 输出：True / False */
  defender?: string;
  /** 形如 "Domain=True" 的多行 */
  firewallProfiles?: string;
  /** /etc/ssh/sshd_config 原文（Linux） */
  sshd?: string;
  /** /etc/shadow 权限位（八进制字符串，如 "640"） */
  shadowMode?: string;
  /** active / inactive */
  firewallActive?: string;
  /** active / inactive */
  auditdActive?: string;
  /** sysctl net.ipv4.ip_forward：0 / 1 */
  ipForward?: string;
}

// ---------- 纯解析（单测锚点） ----------

export interface SshdConfig {
  permitRootLogin?: string;
  passwordAuthentication?: string;
  port?: string;
}

/** 解析 sshd_config：跳过注释/空行，键大小写不敏感，首次出现生效（与 sshd 一致）。 */
export function parseSshdConfig(text: string): SshdConfig {
  const out: SshdConfig = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [k, ...rest] = t.split(/\s+/);
    if (!rest.length) continue;
    const key = k.toLowerCase();
    const val = rest.join(' ').toLowerCase();
    if (key === 'permitrootlogin' && out.permitRootLogin === undefined) out.permitRootLogin = val;
    if (key === 'passwordauthentication' && out.passwordAuthentication === undefined) out.passwordAuthentication = val;
    if (key === 'port' && out.port === undefined) out.port = val;
  }
  return out;
}

export interface NetAccounts {
  minLength?: number;
  /** 原始值：数字 或 Never/从不 */
  lockoutThreshold?: string;
}

/** 解析 net accounts。输出随系统语言本地化，英文/中文标签都试一遍；都认不出就留 undefined（skip）。 */
export function parseNetAccounts(text: string): NetAccounts {
  const out: NetAccounts = {};
  const s = String(text || '');
  const m1 = s.match(/Minimum password length[^\d]*(\d+)/i) || s.match(/密码长度最小值[^\d]*(\d+)/);
  if (m1) out.minLength = Number(m1[1]);
  const m2 = s.match(/Lockout threshold\s+(\S+)/i) || s.match(/锁定阈值\s*[:：]?\s*(\S+)/);
  if (m2) out.lockoutThreshold = m2[1];
  return out;
}

// ---------- 判定（纯函数，单测锚点） ----------

function mk(
  id: string, title: string, status: CheckStatus, severity: Severity,
  detail: string, remediation?: string,
): HostCheck {
  return { id, title, status, severity, detail, remediation };
}

/** 把采集到的原始输出判定为检查项（不跑任何命令，可单测）。 */
export function assessHostBaseline(raw: HostRaw): { checks: HostCheck[]; findings: Finding[]; score: number } {
  const checks: HostCheck[] = [];
  const truthy = (v?: string) => String(v || '').trim().toLowerCase() === 'true';
  const falsy = (v?: string) => String(v || '').trim().toLowerCase() === 'false';

  if (raw.platform === 'win32') {
    const na = parseNetAccounts(raw.netAccounts || '');
    if (na.minLength === undefined) {
      checks.push(mk('win_pwd_len', '密码最小长度', 'skip', 'medium', '无法解析 net accounts 输出（可能为本地化系统或权限不足）'));
    } else if (na.minLength >= 8) {
      checks.push(mk('win_pwd_len', '密码最小长度', 'ok', 'medium', `最小长度 ${na.minLength} 位（>=8）`));
    } else {
      checks.push(mk('win_pwd_len', '密码最小长度', 'fail', 'medium', `最小长度仅 ${na.minLength} 位（建议 >=8）`, '本地安全策略 -> 账户策略 -> 密码策略 -> 密码长度最小值 = 8 或更高'));
    }

    const lock = (na.lockoutThreshold || '').trim();
    if (!lock) {
      checks.push(mk('win_lockout', '账户锁定策略', 'skip', 'medium', '无法解析 net accounts 输出'));
    } else if (/never|从不|^0$/i.test(lock)) {
      checks.push(mk('win_lockout', '账户锁定策略', 'fail', 'medium', `锁定阈值 = ${lock}（等于永不锁定，可被无限次口令猜测）`, '本地安全策略 -> 账户锁定策略 -> 阈值设为 5~10 次，锁定时间 >=15 分钟'));
    } else {
      checks.push(mk('win_lockout', '账户锁定策略', 'ok', 'medium', `锁定阈值 = ${lock}`));
    }

    if (truthy(raw.smb1)) {
      checks.push(mk('win_smb1', 'SMBv1 协议', 'fail', 'high', 'SMBv1 已启用（WannaCry 等蠕虫的传播面）', '控制面板 -> 启用或关闭 Windows 功能 -> 取消「SMB 1.0/CIFS 文件共享支持」并重启；确认无老旧 NAS/打印机依赖后再关'));
    } else if (falsy(raw.smb1)) {
      checks.push(mk('win_smb1', 'SMBv1 协议', 'ok', 'high', 'SMBv1 已禁用'));
    } else {
      checks.push(mk('win_smb1', 'SMBv1 协议', 'skip', 'high', 'Get-SmbServerConfiguration 无输出（权限不足或系统版本不支持）'));
    }

    const rdp = String(raw.rdp || '').trim();
    if (rdp === '1') checks.push(mk('win_rdp', '远程桌面（RDP）', 'ok', 'low', 'RDP 已禁用'));
    else if (rdp === '0') checks.push(mk('win_rdp', '远程桌面（RDP）', 'fail', 'low', 'RDP 已启用（需确认仅限必要网段，并启用 NLA）', '如无远程管理需求：系统属性 -> 远程 -> 取消启用；必须用时：启用「仅允许运行使用网络级别身份验证的计算机连接」并用防火墙限制来源'));
    else checks.push(mk('win_rdp', '远程桌面（RDP）', 'skip', 'low', '无法读取注册表 fDenyTSConnections'));

    const uac = String(raw.uac || '').trim();
    if (uac === '1') checks.push(mk('win_uac', 'UAC 用户账户控制', 'ok', 'medium', 'UAC 已开启'));
    else if (uac === '0') checks.push(mk('win_uac', 'UAC 用户账户控制', 'fail', 'medium', 'UAC 已关闭（提权操作无确认）', '控制面板 -> 用户账户 -> 更改用户账户控制设置 -> 恢复默认级别，并确认注册表 EnableLUA=1'));
    else checks.push(mk('win_uac', 'UAC 用户账户控制', 'skip', 'medium', '无法读取注册表 EnableLUA'));

    if (truthy(raw.defender)) checks.push(mk('win_defender', 'Defender 实时防护', 'ok', 'high', '实时防护开启'));
    else if (falsy(raw.defender)) checks.push(mk('win_defender', 'Defender 实时防护', 'fail', 'high', '实时防护已关闭', 'Windows 安全中心 -> 病毒和威胁防护 -> 实时保护；若由第三方杀软接管属正常（确认第三方在运行）'));
    else checks.push(mk('win_defender', 'Defender 实时防护', 'skip', 'high', 'Get-MpComputerStatus 不可用（可能未安装 Defender）'));

    const fw = String(raw.firewallProfiles || '');
    if (!fw.trim()) {
      checks.push(mk('win_firewall', '防火墙配置文件', 'skip', 'medium', 'Get-NetFirewallProfile 无输出'));
    } else {
      const profiles = fw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const disabled = profiles.filter((p) => /false/i.test(p));
      const enabledCount = profiles.filter((p) => /true/i.test(p)).length;
      if (disabled.length) checks.push(mk('win_firewall', '防火墙配置文件', 'fail', 'medium', `以下配置文件未启用：${disabled.join('；')}`, 'Windows 安全中心 -> 防火墙和网络保护 -> 为域/专用/公用网络均开启防火墙'));
      else if (enabledCount) checks.push(mk('win_firewall', '防火墙配置文件', 'ok', 'medium', `${enabledCount} 个配置文件均启用`));
      else checks.push(mk('win_firewall', '防火墙配置文件', 'skip', 'medium', '防火墙配置输出无法解析'));
    }
  } else if (raw.platform === 'linux') {
    const ssh = parseSshdConfig(raw.sshd || '');
    const root = ssh.permitRootLogin;
    if (root === undefined) checks.push(mk('linux_sshd_root', 'SSH 禁止 root 直登', 'skip', 'high', 'sshd_config 未显式配置 PermitRootLogin（发行版默认值不一，无法判定）'));
    else if (root === 'yes') checks.push(mk('linux_sshd_root', 'SSH 禁止 root 直登', 'fail', 'high', 'PermitRootLogin yes（root 可直接口令/密钥登录）', 'sshd_config 改为 PermitRootLogin prohibit-password（或 no），重启 sshd'));
    else checks.push(mk('linux_sshd_root', 'SSH 禁止 root 直登', 'ok', 'high', `PermitRootLogin ${root}`));

    const pwd = ssh.passwordAuthentication;
    if (pwd === undefined) checks.push(mk('linux_sshd_pwd', 'SSH 口令认证', 'skip', 'medium', 'sshd_config 未显式配置 PasswordAuthentication'));
    else if (pwd === 'yes') checks.push(mk('linux_sshd_pwd', 'SSH 口令认证', 'fail', 'medium', 'PasswordAuthentication yes（可被口令爆破）', '条件允许时改为 PasswordAuthentication no 改用密钥登录；必须保留时配合 fail2ban 与强口令策略'));
    else checks.push(mk('linux_sshd_pwd', 'SSH 口令认证', 'ok', 'medium', `PasswordAuthentication ${pwd}`));

    if (!raw.shadowMode) checks.push(mk('linux_shadow', '/etc/shadow 权限', 'skip', 'medium', '无法读取 /etc/shadow 权限（非 root）'));
    else {
      const mode = parseInt(raw.shadowMode, 8);
      // ★ 发行版默认就是 640 root:shadow ——「组可读」是有意设计，不能算失败。
      //   失败判据：其他用户有任何权限（0o007），或组有写/执行（0o030）。
      const tooOpen = (mode & 0o007) !== 0 || (mode & 0o030) !== 0;
      if (!tooOpen) checks.push(mk('linux_shadow', '/etc/shadow 权限', 'ok', 'medium', `权限 ${raw.shadowMode}（其他用户无权限，符合发行版默认）`));
      else checks.push(mk('linux_shadow', '/etc/shadow 权限', 'fail', 'medium', `权限 ${raw.shadowMode} 过宽（其他用户可读，或组可写/执行）`, 'chmod 640 /etc/shadow && chgrp shadow /etc/shadow（发行版组名可能为 shadow）'));
    }

    if (raw.firewallActive === undefined) checks.push(mk('linux_firewall', '主机防火墙', 'skip', 'medium', 'firewalld / ufw 均不可用，无法判定'));
    else if (raw.firewallActive === 'active') checks.push(mk('linux_firewall', '主机防火墙', 'ok', 'medium', '防火墙已启用'));
    else checks.push(mk('linux_firewall', '主机防火墙', 'fail', 'medium', `防火墙未启用（${raw.firewallActive}）`, '启用 firewalld 或 ufw，并先放行 SSH 端口再启用（防止把自己锁在外面）'));

    if (raw.auditdActive === undefined) checks.push(mk('linux_auditd', '审计服务 auditd', 'skip', 'low', 'systemctl 不可用（非 systemd 系统）'));
    else if (raw.auditdActive === 'active') checks.push(mk('linux_auditd', '审计服务 auditd', 'ok', 'low', 'auditd 运行中'));
    else checks.push(mk('linux_auditd', '审计服务 auditd', 'fail', 'low', 'auditd 未运行（关键系统调用无审计记录）', '安装并启用 auditd；等保要求至少覆盖账户、权限、审计配置的变更事件'));

    if (raw.ipForward === undefined) checks.push(mk('linux_ipfwd', 'IP 转发', 'skip', 'low', '无法读取 net.ipv4.ip_forward'));
    else if (raw.ipForward === '0') checks.push(mk('linux_ipfwd', 'IP 转发', 'ok', 'low', 'IP 转发已关闭（非路由主机）'));
    else checks.push(mk('linux_ipfwd', 'IP 转发', 'fail', 'low', 'IP 转发已开启（若非路由器/容器宿主，属于不必要的暴露面）', 'sysctl -w net.ipv4.ip_forward=0 并写入 /etc/sysctl.d/ 持久化'));
  } else {
    checks.push(mk('platform', '平台支持', 'skip', 'info', `当前平台 ${raw.platform} 暂无本机基线检查项（已支持 Windows / Linux）`));
  }

  const findings: Finding[] = checks
    .filter((c) => c.status === 'fail')
    .map((c) => ({ title: `主机基线：${c.title}`, severity: c.severity, detail: c.detail, remediation: c.remediation }));

  const okN = checks.filter((c) => c.status === 'ok').length;
  const failN = checks.filter((c) => c.status === 'fail').length;
  const score = okN + failN === 0 ? 100 : Math.round((okN / (okN + failN)) * 100);
  return { checks, findings, score };
}

// ---------- 采集（只读固定命令） ----------

export async function runHostBaseline(): Promise<ToolOutput> {
  const raw: HostRaw = { platform: process.platform };

  if (process.platform === 'win32') {
    const ps = (cmd: string) => runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], 12000);
    const [net, smb1, rdp, uac, defender, fw] = await Promise.all([
      runCmd('net', ['accounts'], 8000),
      ps('(Get-SmbServerConfiguration).EnableSMB1Protocol'),
      ps('(Get-ItemProperty "HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server").fDenyTSConnections'),
      ps('(Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System").EnableLUA'),
      ps('(Get-MpComputerStatus).RealTimeProtectionEnabled'),
      ps('Get-NetFirewallProfile | ForEach-Object { "$($_.Name)=$($_.Enabled)" }'),
    ]);
    if (net.ok) raw.netAccounts = net.stdout;
    if (smb1.ok) raw.smb1 = smb1.stdout;
    if (rdp.ok) raw.rdp = rdp.stdout;
    if (uac.ok) raw.uac = uac.stdout;
    if (defender.ok) raw.defender = defender.stdout;
    if (fw.ok) raw.firewallProfiles = fw.stdout;
  } else if (process.platform === 'linux') {
    try { raw.sshd = readFileSync('/etc/ssh/sshd_config', 'utf-8'); } catch { /* 无权限/无文件 -> skip */ }
    try { raw.shadowMode = (statSync('/etc/shadow').mode & 0o777).toString(8); } catch { /* 读不到 -> skip */ }

    const fw = await runCmd('systemctl', ['is-active', 'firewalld'], 5000);
    if (fw.ok && fw.stdout.trim() === 'active') raw.firewallActive = 'active';
    else {
      const ufw = await runCmd('ufw', ['status'], 5000);
      if (/status:\s*active/i.test(ufw.stdout)) raw.firewallActive = 'active';
      else if (ufw.ok || fw.ok) raw.firewallActive = 'inactive';
    }

    const ad = await runCmd('systemctl', ['is-active', 'auditd'], 5000);
    if (ad.ok) raw.auditdActive = ad.stdout.trim() || undefined;

    const ipf = await runCmd('sysctl', ['-n', 'net.ipv4.ip_forward'], 5000);
    if (ipf.ok) raw.ipForward = ipf.stdout.trim();
  }

  const { checks, findings, score } = assessHostBaseline(raw);
  const okN = checks.filter((c) => c.status === 'ok').length;
  const failN = checks.filter((c) => c.status === 'fail').length;
  const skipN = checks.filter((c) => c.status === 'skip').length;
  return {
    tool: 'host_baseline',
    target: `localhost(${hostname()})`,
    risk: 'passive',
    summary: `本机主机基线得分 ${score}/100　通过 ${okN}　失败 ${failN}　无法核查 ${skipN}（平台 ${raw.platform}；只读核查，未做任何修改）`,
    findings,
    raw: { platform: raw.platform, hostname: hostname(), score, checks },
  };
}
