// sec-lab 工具结果 → findings 卡片数据（P2）。
// 只认 JSON 里的 findings 数组；其它工具输出原样忽略，不影响聊天渲染。

export interface SecFinding {
  title: string;
  severity?: string;
  detail?: string;
  remediation?: string;
  evidence?: string;
  tool?: string;
  target?: string;
  at?: number;
}

const MAX = 20;

export function parseSecFindings(result: unknown): SecFinding[] {
  if (!result) return [];
  let obj: any = result;
  if (typeof result === 'string') {
    const s = result.trim();
    if (!s.startsWith('{') && !s.startsWith('[')) return [];
    try { obj = JSON.parse(s); } catch { return []; }
  }
  const list = Array.isArray(obj?.findings) ? obj.findings : [];
  return list
    .filter((f: any) => f && typeof f.title === 'string')
    .slice(0, MAX);
}
