// sec-lab 工具统一输出契约（A 轨自研与 B 轨外部工具解析后共用）
// 目的：模型读得懂（结构化文本）、前端渲染得了（findings 数组）、报告出得来（severity 分级）。
import type { RiskLevel } from './sec-lab-guard.js';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface Finding {
  title: string;
  severity: Severity;
  detail: string;
  remediation?: string;
  /** 证据（响应片段 / 探测结果），会被报告脱敏处理 */
  evidence?: string;
}

export interface ToolOutput {
  tool: string;
  target: string;
  risk: RiskLevel;
  summary: string;
  findings: Finding[];
  /** 原始结构化数据（前端表格用） */
  raw?: unknown;
  truncated?: boolean;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
  info: '信息',
};

/** 渲染给模型的文本：摘要 + 分级发现项 + 结构化数据（JSON 截断后附加） */
export function renderOutput(o: ToolOutput): string {
  const lines: string[] = [];
  lines.push(`[${o.tool}] target=${o.target} risk=${o.risk}`);
  lines.push(`摘要：${o.summary}`);
  if (o.findings.length) {
    lines.push('');
    lines.push(`发现项（${o.findings.length}）：`);
    for (const f of o.findings) {
      lines.push(`- [${SEVERITY_LABEL[f.severity]}] ${f.title}`);
      lines.push(`  ${f.detail}`);
      if (f.remediation) lines.push(`  修复建议：${f.remediation}`);
    }
  } else {
    lines.push('');
    lines.push('未发现明显问题（或目标未响应探测）。');
  }
  if (o.raw !== undefined) {
    let json = JSON.stringify(o.raw, null, 2);
    if (json.length > 6000) json = json.slice(0, 6000) + '\n...[数据过长已截断]';
    lines.push('');
    lines.push('结构化数据：');
    lines.push(json);
  }
  return lines.join('\n');
}

/** 严重度排序（报告与表格按严重度降序） */
export function sortFindings<T extends Finding>(findings: T[]): T[] {
  const order: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  return [...findings].sort((a, b) => order[b.severity] - order[a.severity]);
}
