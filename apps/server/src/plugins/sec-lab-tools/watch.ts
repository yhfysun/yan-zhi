// 定时巡检（sec-lab P3，2026-10-17）。P4 收尾（2026-10-31）接入自有资产体检。
//
// ★ 定位：把"定期看看资产有没有变化"从人工动作变成后台动作。
// ★ 两种模式：
//   - network：recon + portscan，diff 新增端口 / 子域（原有行为）；
//   - self：目标由服务端判定为自有资产（仓库路径 / 本机固定端口）时，跑 scan_self 体检。
//     增量**复用编排层的指纹基线**：每轮 runScan 自动 suppressed 老指纹，本模块只转发新增项，
//     并在轮末用 upsertBaseline 滚动基线（不另造一套 diff）。
// ★ 进程内定时器（`unref()` 不阻止进程退出），**不做持久化调度** —— 重启后需要重新 start。
//   但体检基线落在 plugin_storage：重新 start 会沿用基线，老问题不会重报。
// ★ 每次巡检都走与手工命令**同一套**能力（含护栏与审计口径）。
import { runRecon } from './recon.js';
import { runPortScan } from './portscan.js';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export type WatchMode = 'network' | 'self';

/** 一轮自有资产体检的结果：findings 只含**未被基线抑制**的新增项，且已脱敏 */
export interface SelfCheckResult {
  findings: Finding[];
  summary: string;
  newFindings: number;
  totalFindings: number;
  suppressed: number;
  jobId: string;
}

/** 注入体检能力：返回 null 表示目标不是自有资产（交给 network 模式） */
export type SelfCheckFn = (target: string, timeoutMs: number) => Promise<SelfCheckResult | null>;

export interface WatchEntry {
  target: string;
  mode: WatchMode;
  intervalMin: number;
  startedAt: number;
  lastRunAt: number;
  nextRunAt: number;
  lastPorts: number[];
  lastSubs: string[];
  /** self 模式：上次体检摘要（一行，已脱敏） */
  lastSummary?: string;
  lastNewFindings?: number;
  lastTotalFindings?: number;
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

/** 重启失效是硬语义：工具描述、list 输出、方案文档三处必须一致地讲清楚。 */
export const WATCH_RESTART_NOTE =
  '★ 定时器在进程内：应用重启后巡检列表会清空，需重新 /watch start <target> 恢复（已落库的体检基线保留，老问题不会重报）。';

function timeText(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN');
}

function clampInterval(v: unknown): number {
  return Math.min(Math.max(Number(v) || 30, 5), 1440);
}

function describe(w: WatchEntry): string {
  if (w.mode === 'self') {
    const head = `${w.target}　体检　每 ${w.intervalMin} 分钟　已跑 ${w.runs} 次　` +
      `上次 ${timeText(w.lastRunAt)}（新增 ${w.lastNewFindings ?? 0} / 共 ${w.lastTotalFindings ?? 0}）　` +
      `下次 ${timeText(w.nextRunAt)}`;
    return w.lastSummary ? `${head}\n  ${w.lastSummary}` : head;
  }
  return `${w.target}　每 ${w.intervalMin} 分钟　已跑 ${w.runs} 次　上次 ${timeText(w.lastRunAt)}　下次 ${timeText(w.nextRunAt)}`;
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
 * `selfCheck` 也由插件注入：体检怎么做（扫描 / 基线 / 脱敏）属于扫描层，watch 只负责调度与增量转发。
 */
export async function runWatch(
  p: WatchParams,
  onFindings: (target: string, findings: Finding[], summary: string) => Promise<void>,
  selfCheck?: SelfCheckFn,
): Promise<ToolOutput> {
  const action = p.action || 'list';

  if (action === 'list') {
    const list = listWatchers();
    const body = list.length
      ? list.map(describe).join('\n')
      : '没有运行中的巡检。用 /watch start <target> [--intervalMin=30] 启动（目标是仓库路径 / 本机固定端口时跑自有资产体检）。';
    return {
      tool: 'watch', target: '', risk: 'passive',
      summary: `${body}\n\n${WATCH_RESTART_NOTE}`,
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
    const intervalMin = clampInterval(p.intervalMin ?? cur?.intervalMin);

    // 自有资产优先：selfCheck 返回 null 才回到网络巡检（判定在服务端，不看调用方声明）
    const self = selfCheck ? await selfCheck(target, timeoutMs) : null;
    if (self) {
      const now = Date.now();
      const nextRunAt = now + intervalMin * 60000;
      if (cur) {
        cur.lastRunAt = now; cur.nextRunAt = nextRunAt; cur.runs++;
        cur.lastSummary = self.summary;
        cur.lastNewFindings = self.findings.length;
        cur.lastTotalFindings = self.totalFindings;
      }
      await onFindings(target, self.findings, `巡检体检 ${target}：${self.summary}`);
      return {
        tool: 'watch', target, risk: 'active',
        summary: `体检完成：${self.summary}\n下次 ${timeText(nextRunAt)}`,
        findings: self.findings,
        raw: { mode: 'self', ...self },
      };
    }

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
    const now = Date.now();
    if (cur) {
      cur.lastRunAt = now; cur.nextRunAt = now + intervalMin * 60000; cur.runs++;
      cur.lastPorts = next.ports; cur.lastSubs = next.subs;
    }
    await onFindings(target, all, `巡检 ${target}：${next.ports.length} 端口 / ${next.subs.length} 子域，新增 ${diff.newPorts.length + diff.newSubs.length} 项`);
    return {
      tool: 'watch', target, risk: 'active',
      summary: `巡检完成：${next.ports.length} 个开放端口 / ${next.subs.length} 个子域\n新增端口 ${diff.newPorts.length} 个，新增子域 ${diff.newSubs.length} 个\n下次 ${timeText(now + intervalMin * 60000)}`,
      findings: all,
      raw: { ports: next.ports, subs: next.subs, diff },
    };
  }

  // start
  if (watchers.has(target)) throw new Error(`${target} 已在巡检中，先 /watch stop ${target}`);
  const intervalMin = clampInterval(p.intervalMin);

  const self = selfCheck ? await selfCheck(target, timeoutMs) : null;
  if (self) {
    const now = Date.now();
    const entry: WatchEntry = {
      target, mode: 'self', intervalMin, startedAt: now, lastRunAt: now,
      nextRunAt: now + intervalMin * 60000,
      lastPorts: [], lastSubs: [],
      lastSummary: self.summary,
      lastNewFindings: self.findings.length,
      lastTotalFindings: self.totalFindings,
      runs: 1,
    };
    await onFindings(target, self.findings, `巡检启动体检：${self.summary}`);
    const timer = setInterval(() => {
      void (async () => {
        try {
          await runWatch({ action: 'tick', target, timeoutMs }, onFindings, selfCheck);
        } catch { /* 单次失败等下一轮，不因一次抖动停掉整个巡检 */ }
      })();
    }, intervalMin * 60000);
    timer.unref?.();
    watchers.set(target, { timer, entry });

    return {
      tool: 'watch', target, risk: 'active',
      summary: `巡检已启动（自有资产体检）：${target}，每 ${intervalMin} 分钟一次。\n` +
        `本次：${self.summary}\n下次：${timeText(entry.nextRunAt)}\n${WATCH_RESTART_NOTE}`,
      findings: self.findings,
      raw: { mode: 'self', intervalMin, entry },
    };
  }

  const first = await probe(target, timeoutMs);
  const now = Date.now();
  const entry: WatchEntry = {
    target, mode: 'network', intervalMin, startedAt: now, lastRunAt: now,
    nextRunAt: now + intervalMin * 60000,
    lastPorts: first.ports, lastSubs: first.subs, runs: 1,
  };
  await onFindings(target, first.findings, `巡检启动基线：${first.ports.length} 端口 / ${first.subs.length} 子域`);
  const timer = setInterval(() => {
    void (async () => {
      try {
        await runWatch({ action: 'tick', target, timeoutMs }, onFindings, selfCheck);
      } catch { /* 单次失败等下一轮，不因一次网络抖动停掉整个巡检 */ }
    })();
  }, intervalMin * 60000);
  timer.unref?.();
  watchers.set(target, { timer, entry });

  return {
    tool: 'watch', target, risk: 'active',
    summary: `巡检已启动：${target}，每 ${intervalMin} 分钟一次。\n基线：${first.ports.length} 个端口 / ${first.subs.length} 个子域。\n下次：${timeText(entry.nextRunAt)}\n${WATCH_RESTART_NOTE}`,
    findings: first.findings,
    raw: { mode: 'network', intervalMin, entry },
  };
}
