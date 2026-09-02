import { describe, it, expect } from 'vitest';

function parseLenientToolCall(jsonStr: string): { name: string; arguments: any } | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.name) return { name: parsed.name, arguments: parsed.arguments || {} };
  } catch {}
  try {
    const fixed = jsonStr
      .replace(/"\s*\[\s*"/g, '","')
      .replace(/'\s*:\s*'/g, '":"')
      .replace(/'\s*:\s*"/g, '":"')
      .replace(/"\s*:\s*'/g, '":"')
      .replace(/,\s*}/g, '}');
    const parsed = JSON.parse(fixed);
    if (parsed.name) return { name: parsed.name, arguments: parsed.arguments || {} };
  } catch {}
  const nameMatch = jsonStr.match(/"name"\s*:\s*"([^"]+)"/i);
  const argsMatch = jsonStr.match(/"arguments"\s*:\s*(\{[\s\S]*?\})/i);
  if (nameMatch) {
    let args: any = {};
    if (argsMatch) {
      try { args = JSON.parse(argsMatch[1]); } catch {
        try { args = JSON.parse(argsMatch[1].replace(/'\s*:\s*'/g, '":"').replace(/'\s*:/g, '":').replace(/:\s*'/g, ':"')); } catch {}
      }
    }
    return { name: nameMatch[1], arguments: args };
  }
  return null;
}

describe('parseLenientToolCall', () => {
  it('正常JSON直接解析', () => {
    const r = parseLenientToolCall('{"name":"web_search","arguments":{"query":"test"}}');
    expect(r).toEqual({ name: 'web_search', arguments: { query: 'test' } });
  });

  it('模型输出[替代逗号: {"name":"web_search"["arguments":...}', () => {
    const r = parseLenientToolCall('{"name":"web_search"["arguments":{"query":"2026年最值得入手的手机推荐","timeRange":"month"}}');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('web_search');
    expect(r!.arguments.query).toBe('2026年最值得入手的手机推荐');
  });

  it('正则兜底提取name和arguments', () => {
    const r = parseLenientToolCall('{"name":"web_search","arguments":{"query":"test"}}');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('web_search');
    expect(r!.arguments.query).toBe('test');
  });

  it('空参数', () => {
    const r = parseLenientToolCall('{"name":"list_sub_agents","arguments":{}}');
    expect(r).toEqual({ name: 'list_sub_agents', arguments: {} });
  });

  it('无arguments字段', () => {
    const r = parseLenientToolCall('{"name":"list_sub_agents"}');
    expect(r).toEqual({ name: 'list_sub_agents', arguments: {} });
  });
});