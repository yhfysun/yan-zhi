// 言智安全体检报告模板（P4 收尾，方案 6.4）。
//
// ★ 与通用导出（sec-lab.buildReportMarkdown）的分工：通用报告是平铺的「发现项清单」，
//   给智能体逐条修；体检报告按资产分类组织（源码 / Electron 配置 / 运行时 / 制品），
//   先给结论再给清单 —— 两类读者要的东西不一样，硬合成一个模板两头不讨好。
// ★ 分类靠 ruleId 前缀与作业 kind：self 作业里 self-electron-* 是静态配置审计、
//   self-runtime-* 是运行时探测、其余（源码规则 / 依赖 / env）归源码；
//   package/url 作业整体落单桶。新增 ruleId 前缀时分类器要跟着认。
// ★ 脱敏在出口：正文所有文本过 maskSecrets —— 输出层脱敏是硬约束，不假设上游干净。
import type { ScanFinding, ScanJob } from '../types.js';
import { SEVERITY_ORDER } from '../types.js';
import { maskSecrets } from '../redact.js';

export type SelfAssetClass = 'source' | 'electron' | 'runtime' | 'package';

const CLASS_LABEL: Record<SelfAssetClass, string> = {
  source: '源码（规则 + 依赖）',
  electron: 'Electron 配置',
  runtime: '运行时',
  package: '制品（安装包）',
};

const CLASS_ORDER: SelfAssetClass[] = ['source', 'electron', 'runtime', 'package'];

const SEV_LABEL: Record<string, string> = {
  critical: '严重', high: '高危', medium: '中危', low: '低危', info: '信息',
};

const sevLabel = (s: string): string => SEV_LABEL[s] || s;

/** kind=self 时按 ruleId 前缀分桶；其他 kind 整体落一桶（模板对它们退化为单分类报告） */
export function classifyFinding(kind: ScanJob['kind'], ruleId: string): SelfAssetClass {
  if (kind === 'package') return 'package';
  if (kind === 'url') return 'runtime';
  if (kind === 'self') {
    if (ruleId.startsWith('self-electron-')) return 'electron';
    if (ruleId.startsWith('self-runtime-')) return 'runtime';
    return 'source';
  }
  return 'source';
}

function bySeverityThenLocation(a: ScanFinding, b: ScanFinding): number {
  const d = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
  return d !== 0 ? d : a.location.localeCompare(b.location);
}

function verdictOf(active: ScanFinding[]): string {
  const hi = active.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
  const mid = active.filter((f) => f.severity === 'medium').length;
  if (hi > 0) return `需要优先处理：高危及以上 ${hi} 条。`;
  if (mid > 0) return `建议尽快排期：中危 ${mid} 条，无高危及以上。`;
  if (active.length > 0) return `基本健康：仅剩低危/信息 ${active.length} 条，按常规节奏跟进。`;
  return '健康：没有需要处理的发现。';
}

function distributionOf(active: ScanFinding[]): string {
  if (!active.length) return '—';
  const counts = new Map<string, number>();
  for (const f of active) counts.set(f.severity, (counts.get(f.severity) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => (SEVERITY_ORDER[b[0] as keyof typeof SEVERITY_ORDER] || 0) -
      (SEVERITY_ORDER[a[0] as keyof typeof SEVERITY_ORDER] || 0))
    .map(([k, v]) => `${sevLabel(k)} ${v}`).join(' / ');
}

/** 覆盖面：挑资产识别 / 规则扫描 / Electron 配置 / 运行时探测四个阶段的注记 */
const COVERAGE_STAGES = ['资产识别', '规则扫描', 'Electron 配置', '运行时探测'];

function coverageLines(job: ScanJob): string[] {
  return job.stages
    .filter((s) => s.note && COVERAGE_STAGES.includes(s.name))
    .map((s) => `- ${s.name}：${maskSecrets(s.note || '')}`);
}

function categorySection(cls: SelfAssetClass, items: ScanFinding[]): string[] {
  const L: string[] = [`### ${CLASS_LABEL[cls]}（${items.length}）`, ''];
  for (const f of items) {
    L.push(`- **[${sevLabel(f.severity)}] ${maskSecrets(f.title)}** — \`${maskSecrets(f.location)}\``);
    const why = maskSecrets(f.detail || '').split('\n')[0]?.trim();
    if (why) L.push(`  - ${why.slice(0, 200)}`);
  }
  L.push('');
  return L;
}

function checklistLines(active: ScanFinding[]): string[] {
  const L: string[] = ['## 修复清单（按文件:行号 / 清单属性 / 端点）', ''];
  const sorted = [...active].sort(bySeverityThenLocation);
  sorted.forEach((f, i) => {
    L.push(`- [ ] ${i + 1}. **[${sevLabel(f.severity)}] ${maskSecrets(f.title)}**`);
    L.push(`  - 位置：${maskSecrets(f.location)}`);
    const ev = maskSecrets((f.evidence || '').replace(/\s+/g, ' ').trim()).slice(0, 300);
    if (ev) L.push(`  - 证据：${ev}`);
    if (f.remediation) L.push(`  - 修复：${maskSecrets(f.remediation)}`);
  });
  if (!sorted.length) L.push('- （无 —— 本次体检没有需要修复的条目）');
  L.push('');
  return L;
}

function retestLines(job: ScanJob, active: ScanFinding[], suppressed: number): string[] {
  const L: string[] = ['## 复测项', ''];
  L.push('1. 修复完成后重跑体检：`/scan-self`（控制台「言智体检」入口等价）。');
  L.push('2. 重跑前可把本次结果存为基线（`/scan-baseline`）：已确认接受的风险会被抑制，之后只报新增；' +
    '如要重新评估被抑制项，先清除对应基线。');
  if (suppressed > 0) {
    L.push(`3. 本次另有 ${suppressed} 条基线抑制项未列入正文；复测时它们仍被抑制，不代表已修复。`);
  }
  const hit = new Map<SelfAssetClass, Set<string>>();
  for (const f of active) {
    const cls = classifyFinding(job.kind, f.ruleId);
    const set = hit.get(cls) || new Set<string>();
    set.add(f.ruleId);
    hit.set(cls, set);
  }
  const classes = CLASS_ORDER.filter((c) => hit.has(c));
  if (classes.length) {
    const idx = L.filter((x) => /^\d+\. /.test(x)).length + 1;
    L.push(`${idx}. 逐类核对以下规则不再命中：`);
    for (const c of classes) {
      L.push(`   - ${CLASS_LABEL[c]}：${[...hit.get(c)!].sort().join('、')}`);
    }
  }
  L.push('');
  return L;
}

/** 言智安全体检报告：执行摘要 → 按资产分类 → 严重度分布 → 修复清单 → 复测项 */
export function buildSelfHealthReport(job: ScanJob): { text: string; count: number } {
  const active = job.findings.filter((f) => !f.suppressed);
  const suppressed = job.findings.length - active.length;
  const sorted = [...active].sort(bySeverityThenLocation);
  const L: string[] = [];

  L.push('# 言智安全体检报告', '');
  L.push(`- 生成时间：${new Date().toLocaleString('zh-CN')}`);
  L.push(`- 作业：${job.id}（${job.status}，${job.createdBy === 'human' ? '人工发起' : '智能体发起'}）`);
  L.push(`- 体检对象：${maskSecrets(job.target)}`);
  if (suppressed > 0) L.push(`- 基线抑制：${suppressed} 条（不进正文）`);
  L.push('');

  L.push('## 执行摘要', '');
  L.push(`- 结论：${verdictOf(active)}`);
  L.push(`- 发现项：${active.length}${active.length ? `（${distributionOf(active)}）` : ''}`);
  const cov = coverageLines(job);
  if (cov.length) { L.push('- 覆盖面：'); L.push(...cov.map((x) => `  ${x}`)); }
  const top = sorted.slice(0, 3);
  if (top.length) {
    L.push(`- 最需要关注：${top.map((f) => `${sevLabel(f.severity)}·${maskSecrets(f.title)}`).join('；')}`);
  }
  L.push('');

  L.push('## 按资产分类', '');
  const classes = CLASS_ORDER.filter((c) => sorted.some((f) => classifyFinding(job.kind, f.ruleId) === c));
  for (const c of classes) {
    L.push(...categorySection(c, sorted.filter((f) => classifyFinding(job.kind, f.ruleId) === c)));
  }
  if (!classes.length) L.push('（未发现需要处理的问题）', '');

  L.push('## 严重度分布', '');
  L.push(distributionOf(active), '');

  L.push(...checklistLines(active));
  L.push(...retestLines(job, active, suppressed));

  L.push('## 给智能体的执行说明', '');
  L.push('1. 只处理「修复清单」里的条目，不要顺手改清单之外的文件。');
  L.push('2. 每条按「位置 → 证据 → 修复」顺序处理；证据里的凭据已脱敏，实际值请到对应文件确认后再轮换。');
  L.push('3. 规则扫描可能误报：无法复现或确认为误报的条目，标注「误报」并说明理由，不要强行修改。');
  L.push('4. 完成一条就把 `[ ]` 改成 `[x]`，并在提交信息里带上条目编号。');
  L.push('5. 密钥类问题：改代码只是止血，必须提醒用户到对应控制台吊销并轮换。');
  L.push('');

  return { text: L.join('\n'), count: active.length };
}
