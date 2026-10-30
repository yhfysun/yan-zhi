/**
 * 扫描护栏单测（P1）。
 *
 * 钉住三件事：
 *  1. 本地扫描（源码/制品/自有资产）不需要登记 scope，但危险命令黑名单仍然生效；
 *  2. URL 扫描必须命中授权范围，且风险级不能超过该范围允许的上限；
 *  3. 「自有资产」由服务端匹配，外部 URL / 外部路径永远不算。
 */
import { describe, it, expect } from 'vitest';
import { guard, TOOL_RISK, DEFAULT_SEC_CONFIG, type ScopeEntry } from '../src/plugins/sec-lab-guard';
import { matchSelfAsset, type SelfAsset } from '../src/plugins/sec-lab-tools/scan/self/assets';

const base = { config: DEFAULT_SEC_CONFIG, scopes: [] as ScopeEntry[] };

function scope(partial: Partial<ScopeEntry>): ScopeEntry {
  return {
    id: 's1', type: 'domain', value: 'example.com', authorizedBy: 'test',
    maxRisk: 'active', ...partial,
  };
}

describe('扫描工具的风险分级', () => {
  it('本地扫描为 passive，URL 与自主体检为 active', () => {
    expect(TOOL_RISK.scan_source).toBe('passive');
    expect(TOOL_RISK.scan_package).toBe('passive');
    expect(TOOL_RISK.scan_url).toBe('active');
    expect(TOOL_RISK.scan_self).toBe('active');
  });
});

describe('guard · 本地扫描不需 scope', () => {
  it('源码 / 安装包 / 自有资产 / 作业查询免登记', () => {
    for (const tool of ['scan_source', 'scan_package', 'scan_self', 'scan_status', 'scan_report', 'scan_baseline', 'self_assets']) {
      const r = guard({ ...base, tool });
      expect(r.ok, `${tool} 应放行`).toBe(true);
    }
  });

  it('免登记不等于免黑名单：危险命令仍被拒', () => {
    const r = guard({ ...base, tool: 'scan_source', command: 'sqlmap -u http://x --os-shell' });
    expect(r.ok).toBe(false);
  });
});

describe('guard · URL 扫描必须授权', () => {
  it('未登记目标被拒', () => {
    const r = guard({ ...base, tool: 'scan_url', target: 'https://example.com' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('授权');
  });

  it('已登记且风险级足够时放行', () => {
    const r = guard({ ...base, tool: 'scan_url', target: 'https://example.com', scopes: [scope({})] });
    expect(r.ok).toBe(true);
  });

  it('范围只允许 passive 时拒绝 active 的 URL 扫描', () => {
    const r = guard({
      ...base, tool: 'scan_url', target: 'https://example.com',
      scopes: [scope({ maxRisk: 'passive' })],
    });
    expect(r.ok).toBe(false);
  });

  it('授权过期后拒绝', () => {
    const r = guard({
      ...base, tool: 'scan_url', target: 'https://example.com',
      scopes: [scope({ expiresAt: Date.now() - 1000 })],
    });
    expect(r.ok).toBe(false);
  });
});

describe('自有资产匹配（服务端计算）', () => {
  const assets: SelfAsset[] = [
    { id: 'repo', kind: 'repo', value: 'C:\\work\\ai-assistant', label: '仓库' },
    { id: 'build', kind: 'build', value: 'C:\\work\\ai-assistant\\dist', label: '产物' },
    { id: 'rt', kind: 'runtime', value: 'http://127.0.0.1:3001', label: '本机服务' },
  ];

  it('仓库内路径与构建产物命中', () => {
    expect(matchSelfAsset('C:\\work\\ai-assistant\\apps\\server', assets)?.id).toBe('repo');
    // 最具体的命中优先
    expect(matchSelfAsset('C:\\work\\ai-assistant\\dist\\app.asar', assets)?.id).toBe('build');
  });

  it('本机固定端口命中，其他端口不命中', () => {
    expect(matchSelfAsset('http://localhost:3001/api', assets)?.id).toBe('rt');
    expect(matchSelfAsset('http://127.0.0.1:8080/', assets)).toBeNull();
  });

  it('外部 URL 与仓库外路径永远不算自有资产', () => {
    expect(matchSelfAsset('https://example.com', assets)).toBeNull();
    expect(matchSelfAsset('C:\\Windows\\System32', assets)).toBeNull();
  });
});
