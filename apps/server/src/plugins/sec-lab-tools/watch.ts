// 定时巡检（sec-lab P3，2026-10-17）。
//
// ★ 定位：把"定期看看资产有没有多出端口/子域"从人工动作变成后台动作。
// ★ 实现边界：进程内定时器（`unref()` 不阻止进程退出），**不做持久化调度** ——
//   重启后需要重新 start。真要跨重启应该接本仓已有的 scheduled-tasks，
//   而不是在插件里再造一个调度器（两套调度必然互相踩）。
// ★ 每次巡检都走与手工命令**同一套** recon / portscan（含护栏与审计口径）。
import { runRecon } from './recon.js';
import { runPortScan } from './portscan.js';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface WatchEntry {
  target: string;
  intervalMin: number;
  startedAt: number;
  lastRunAt: number;
  lastPorts: number[];
  lastSubs: string[];
  runs: number;
}

const watchers = new Map<string, { timer: ReturnType<typeof setInterval>; entry: WatchEntry }>();

/** 插件卸载时必须清掉所有定时器，否则进程里会留下"幽灵巡检"。 */
export function stopAllWatchers(): void {
  for (const [, w] of watchers) clearInterval(w.timer);
  watchers.clear();
}

export function listWatchers(): WatchEntry[] {
  return [...watchers.values()].map((w) => w.entry);
}

export interface WatchDiff {
  newPorts: number[];
  newSubs: string[];
}

/** 纯函数：与上一次的端口/子域集合比对（便于单测，不碰网络）。 */
export function diffWatch(prev: { ports: number[]; subs: string[] }, next: { ports: number[]; subs: string[] }): WatchDiff {
  const p = new Set(prev.ports);
  const s = new Set(prev.subs);
  return {
    newPorts: next.ports.filter((x) => !p.has(x)),
    newSubs: next.subs.filter((x) => !s.has(x)),
  };
}

async function probe(target: string, timeoutMs: number): Promise<{ ports: number[]; subs: string[]; findings: Finding[] }> {
  const findings: Finding[] = [];
  const recon = await runRecon({ target, timeoutMs, actions: ['subdomain'] }).catch(() => null);
  const scan = await runPortScan({ target, ports: 'common', concurrency: 60, timeoutMs, banner: false }).catch(() => null);

  // 与 recon / portscan 的 raw 形状对齐：subdomains = [{host, ips}]；results = [{port, state}]
  const rawSubs = (recon?.raw as { subdomains?: Array<{ host?: string }> } | undefined)?.subdomains || [];
  const subs = rawSubs.map((x) => String(x?.host || '')).filter(Boolean);
  const rawResults = (scan?.raw as { results?: Array<{ port?: number; state?: string }> } | undefined)?.results || [];
  const ports = rawResults.filter((r) => r.state === 'open').map((r) => Number(r.port)).filter((n) => Number.isFinite(n));

  if (recon) findings.push(...recon.findings);
  if (scan) findings.push(...scan.findings);
  return { ports, subs, findings };
}

export interface WatchParams {
  action: 'start' | 'stop' | 'list' | 'tick';
  target?: string;
  intervalMin?: number;
  timeoutMs?: number;
}

/**
 * `onFindings` 由插件注入：把巡检发现写进同一份 findings / 审计。
 * ★ 不让 watch 自己持有存储 —— 否则"手工命令的发现"和"巡检的发现"会落在两处。
 */
export async function runWatch(
  p: WatchParams,
  onFindings: (target: string, findings: Finding[], summary: string) => Promise<void>,
): Promise<ToolOutput> {
  const action = p.action || 'list';

  if (action === 'list') {
    const list = listWatchers();
    return {
      tool: 'watch', target: '', risk: 'passive',
      summary: list.length
        ? list.map((w) => `${w.target}　每 ${w.intervalMin} 分钟　已跑 ${w.runs} 次　上次 ${new Date(w.lastRunAt).toLocaleString('zh-CN')}`).join('\n')
        : '没有运行中的巡检。用 /watch start <target> [--intervalMin=30] 启动。',
      findings: [],
      raw: list,
    };
  }

  if (action === 'stop') {
    const t = String(p.target || '');
    if (!t) {
      stopAllWatchers();
      return { tool: 'watch', target: '', risk: 'passive', summary: '已停止全部巡检。', findings: [] };
    }
    const w = watchers.get(t);
    if (!w) throw new Error(`没有针对 ${t} 的巡检`);
    clearInterval(w.timer);
    watchers.delete(t);
    return { tool: 'watch', target: t, risk: 'passive', summary: `已停止 ${t} 的巡检。`, findings: [] };
  }

  const target = String(p.target || '').trim();
  if (!target) throw new Error('要给目标：/watch start <target>');
  const timeoutMs = Math.min(Math.max(p.timeoutMs ?? 60000, 5000), 300000);

  if (action === 'tick') {
    const cur = watchers.get(target)?.entry;
    const next = await probe(target, timeoutMs);
    const diff = cur
      ? diffWatch({ ports: cur.lastPorts, subs: cur.lastSubs }, { ports: next.ports, subs: next.subs })
      : { newPorts: next.ports, newSubs: next.subs };
    const extras: Finding[] = [];
    if (diff.newPorts.length) {
      extras.push({ title: `巡检发现新增端口：${diff.newPorts.join(', ')}`, severity: 'medium', detail: `目标 ${target}`, remediation: '确认是否为新上线服务；非预期变更应回溯发布记录。' });
    }
    if (diff.newSubs.length) {
      extras.push({ title: `巡检发现新增子域：${diff.newSubs.join(', ')}`, severity: 'medium', detail: `目标 ${target}`, remediation: '影子资产是接管与钓鱼的常见入口，确认归属后纳入资产台账。' });
    }
    const all = [...next.findings, ...extras];
    if (watchers.has(target)) {
      const e = watchers.get(target)!.entry;
      e.lastRunAt = Date.now(); e.lastPorts = next.ports; e.lastSubs = next.subs; e.runs++;
    }
    await onFindings(target, all, `巡检 ${target}：${next.ports.length} 端口 / ${next.subs.length} 子域，新增 ${diff.newPorts.length + diff.newSubs.length} 项`);
    return {
      tool: 'watch', target, risk: 'active',
      summary: `巡检完成：${next.ports.length} 个开放端口 / ${next.subs.length} 个子域\n新增端口 ${diff.newPorts.length} 个，新增子域 ${diff.newSubs.length} 个`,
      findings: all,
      raw: { ports: next.ports, subs: next.subs, diff },
    };
  }

  // start
  if (watchers.has(target)) throw new Error(`${target} 已在巡检中，先 /watch stop ${target}`);
  const intervalMin = Math.min(Math.max(Number(p.intervalMin) || 30, 5), 1440);
  const first = await probe(target, timeoutMs);
  const entry: WatchEntry = {
    target, intervalMin, startedAt: Date.now(), lastRunAt: Date.now(),
    lastPorts: first.ports, lastSubs: first.subs, runs: 1,
  };
  await onFindings(target, first.findings, `巡检启动基线：${first.ports.length} 端口 / ${first.subs.length} 子域`);
  const timer = setInterval(() => {
    void (async () => {
      try {
        await runWatch({ action: 'tick', target, timeoutMs }, onFindings);
      } catch { /* 单次失败等下一轮，不因一次网络抖动停掉整个巡检 */ }
    })();
  }, intervalMin * 60000);
  timer.unref?.();
  watchers.set(target, { timer, entry });

  return {
    tool: 'watch', target, risk: 'active',
    summary: `巡检已启动：${target}，每 ${intervalMin} 分钟一次。\n基线：${first.ports.length} 个端口 / ${first.subs.length} 个子域。\n` +
      '★ 定时器在进程内，重启后需要重新 start；跨重启请接 scheduled-tasks。',
    findings: first.findings,
    raw: { intervalMin, entry },
  };
}
