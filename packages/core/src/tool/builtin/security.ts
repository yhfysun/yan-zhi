// security 内置工具 —— 授权范围内的网络安全侦察 / 合规审计（Python 版）。
// 底层调用随包分发的 python-scripts/security/security.py（requests + dnspython + 标准库）。
// 解释器走 python-runtime 桥：prod 用打包 python-build-standalone，dev/缺失回退系统 python。
// 仅提供被动侦察与合规审计（端口扫描 / HTTP 安全头 / TLS 证书 / DNS / 子域发现），
// 不含任何攻击性动作（DoS / 未授权爆破 / RCE / 恶意载荷）。使用者须对目标拥有合法授权。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPythonScript, runPythonScript } from './python-runtime';
import { capToolOutput } from './output-cap';

export class SecurityTool implements BuiltInTool {
  name = 'security';
  description = '授权范围内的网络安全侦察与合规审计（Python 版，仅限自有资产或已授权目标）。action: port_scan(TCP 端口扫描+服务推断) / http_headers(HTTP 安全响应头审计 HSTS/CSP/X-Frame-Options…) / ssl_check(TLS 证书有效期与颁发者审计) / dns_lookup(DNS 记录 A/AAAA/CNAME/MX/NS/TXT) / subdomain(字典子域发现，仅 DNS 解析)。不含任何攻击性动作。';

  inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['port_scan', 'http_headers', 'ssl_check', 'dns_lookup', 'subdomain'],
        description: '侦察/审计动作。',
      },
      host: { type: 'string', description: '目标主机（port_scan/ssl_check 用，IP 或域名）。必须授权目标。' },
      ports: { type: 'string', description: 'port_scan 端口规格："common" / "80,443" / "1-1024"。' },
      timeout: { type: 'number', description: '超时（port_scan 毫秒 / 其他秒）。' },
      concurrency: { type: 'number', description: 'port_scan 并发数（默认 200）。' },
      url: { type: 'string', description: 'http_headers 的目标 URL。' },
      port: { type: 'number', description: 'ssl_check 的端口（默认 443）。' },
      name: { type: 'string', description: 'dns_lookup 的域名。' },
      type: { type: 'string', description: 'dns_lookup 记录类型（A/AAAA/CNAME/MX/NS/TXT，默认 A）。' },
      domain: { type: 'string', description: 'subdomain 的父域名。' },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const action = args.action as string;
    const script = getPythonScript('security/security.py');
    if (!script) {
      return { content: [{ type: 'text', text: 'Error: 未找到 security.py 脚本（resources/python-tools 或 packages/core 开发目录）。' }], isError: true };
    }

    const argv: string[] = [action];
    try {
      switch (action) {
        case 'port_scan': {
          const host = args.host as string;
          if (!host) throw new Error('port_scan 需要 host 参数');
          argv.push('--host', host);
          if (args.ports) argv.push('--ports', String(args.ports));
          if (args.timeout) argv.push('--timeout', String(args.timeout));
          if (args.concurrency) argv.push('--concurrency', String(args.concurrency));
          break;
        }
        case 'http_headers': {
          const url = args.url as string;
          if (!url) throw new Error('http_headers 需要 url 参数');
          argv.push('--url', url);
          if (args.timeout) argv.push('--timeout', String(args.timeout));
          break;
        }
        case 'ssl_check': {
          const host = args.host as string;
          if (!host) throw new Error('ssl_check 需要 host 参数');
          argv.push('--host', host);
          if (args.port) argv.push('--port', String(args.port));
          if (args.timeout) argv.push('--timeout', String(args.timeout));
          break;
        }
        case 'dns_lookup': {
          const name = args.name as string;
          if (!name) throw new Error('dns_lookup 需要 name 参数');
          argv.push('--name', name);
          if (args.type) argv.push('--type', String(args.type));
          break;
        }
        case 'subdomain': {
          const domain = args.domain as string;
          if (!domain) throw new Error('subdomain 需要 domain 参数');
          argv.push('--domain', domain);
          break;
        }
        default:
          throw new Error(`未知 action: ${action}`);
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }

    try {
      const r = await runPythonScript(script, argv, { timeout: 120000 });
      const out = [r.stdout ? capToolOutput(r.stdout) : '', r.stderr ? '[stderr]\n' + capToolOutput(r.stderr) : '']
        .filter(Boolean)
        .join('\n') || '(无输出)';
      if (r.exitCode !== 0) {
        return { content: [{ type: 'text', text: `security ${action} 失败（exit ${r.exitCode}）：\n${out}` }], isError: true };
      }
      return { content: [{ type: 'text', text: out }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `security 执行异常: ${msg}` }], isError: true };
    }
  }
}
