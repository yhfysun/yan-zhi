// dns_lookup 内置工具 — DNS 解析（A/AAAA/CNAME/MX/TXT/NS/PTR 反查）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'SOA'] as const;
type DnsType = (typeof TYPES)[number];

export class DnsLookupTool implements BuiltInTool {
  name = 'dns_lookup';
  description = 'DNS resolution: query A / AAAA / CNAME / MX / TXT / NS / SRV / SOA records for a domain, or reverse PTR lookup for an IP (set type=PTR). Use for network diagnostics and reconnaissance of authorized targets.';

  inputSchema = {
    type: 'object',
    properties: {
      host: { type: 'string', description: 'Domain name, or an IP when type=PTR.' },
      type: { type: 'string', enum: [...TYPES], description: 'Record type (default A).' },
      timeout: { type: 'number', description: 'Timeout in ms (default 5000, max 30000).' },
    },
    required: ['host'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const host = (args.host as string)?.trim();
    if (!host) return { content: [{ type: 'text', text: 'Error: host is required' }], isError: true };
    const type = ((args.type as DnsType) || 'A').toUpperCase() as DnsType;
    const timeout = Math.min(Math.max(Number(args.timeout) || 5000, 500), 30000);

    let dns: typeof import('node:dns/promises');
    try { dns = await import('node:dns/promises'); } catch {
      return { content: [{ type: 'text', text: 'Error: dns_lookup 需要服务端或桌面端环境（Node dns）。浏览器端不支持。' }], isError: true };
    }

    const run = async (): Promise<string[]> => {
      switch (type) {
        case 'A': return (await dns.resolve4(host)).map((a) => `  ${host} -> ${a}`);
        case 'AAAA': return (await dns.resolve6(host)).map((a) => `  ${host} -> ${a}`);
        case 'CNAME': return (await dns.resolveCname(host)).map((c) => `  ${host} -> ${c}`);
        case 'MX': return (await dns.resolveMx(host)).sort((a, b) => a.priority - b.priority).map((m) => `  ${host} -> ${m.exchange} (priority ${m.priority})`);
        case 'TXT': return (await dns.resolveTxt(host)).map((t) => `  ${host} -> ${t.join('')}`);
        case 'NS': return (await dns.resolveNs(host)).map((n) => `  ${host} -> ${n}`);
        case 'PTR': return (await dns.reverse(host)).map((p) => `  ${host} -> ${p}`);
        case 'SRV': return (await dns.resolveSrv(host)).map((s) => `  ${host} -> ${s.name}:${s.port} (priority ${s.priority}, weight ${s.weight})`);
        case 'SOA': {
          const s = await dns.resolveSoa(host);
          return [`  ${host} SOA: ns=${s.nsname}, admin=${s.hostmaster}, serial=${s.serial}`];
        }
      }
    };

    try {
      const result = await Promise.race([
        run(),
        new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error(`解析超时 (${timeout}ms)`)), timeout)),
      ]);
      const lines = type === 'PTR'
        ? `PTR records for ${host}:\n${result.length > 0 ? result.join('\n') : '(无记录)'}`
        : `${type} records for ${host} (${result.length}):\n${result.join('\n')}`;
      return { content: [{ type: 'text', text: lines }] };
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      const code = err.code || '';
      const friendly: Record<string, string> = {
        ENOTFOUND: '域名不存在',
        ENODATA: '无该类型记录',
        ETIMEOUT: '解析超时',
        ESERVFAIL: '服务器解析失败',
      };
      return {
        content: [{ type: 'text', text: `解析失败: ${friendly[code] || err.message}${code ? ` (${code})` : ''}` }],
        isError: !['ENODATA'].includes(code),
      };
    }
  }
}
