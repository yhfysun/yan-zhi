// 信息图围栏块解析（AntV Infographic）
//
// 模型按约定输出 ```infographic 围栏，聊天消息在渲染前把围栏块抽出来，
// 交给 InfographicBlock 就地渲染（SVG），围栏本身从 markdown 里剥掉。
// 这样不需要新增工具协议，正文/流式/历史消息都能复用。

export interface InfographicBlock {
  /** 信息图语法全文（首行 infographic <template>） */
  syntax: string;
  /** 卡片标题：优先取 data.title，其次模板名 */
  title?: string;
}

// 只匹配成对的围栏：流式输出到一半（没有结尾 ```）时原样保留，不误吞正文
const FENCE_RE = /```infographic[ \t]*\r?\n([\s\S]*?)```/g;

function titleOf(syntax: string): string | undefined {
  const title = syntax.match(/^\s*title\s+(.+)$/m);
  if (title) return title[1].trim();
  const tpl = syntax.match(/^infographic\s+(\S+)/);
  return tpl ? tpl[1] : undefined;
}

export function extractInfographicBlocks(markdown: string): InfographicBlock[] {
  const out: InfographicBlock[] = [];
  for (const m of String(markdown || '').matchAll(FENCE_RE)) {
    const syntax = (m[1] || '').trim();
    if (!syntax) continue;
    const title = titleOf(syntax);
    out.push({ syntax, ...(title ? { title } : {}) });
  }
  return out;
}

export function stripInfographicBlocks(markdown: string): string {
  return String(markdown || '')
    .replace(FENCE_RE, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
