// 高危动作逐条审批门（ExecutionGate）的纯逻辑测试（2026-10-17）。
//
// 这组测试防的是"闸门看起来有、实际可绕过"：
//   · 哪些动作必须审批（不能漏 shell / 侵入验证）；
//   · 内容哈希是否真的绑定参数（改一个参数必须换票）；
//   · 票是否一次性、是否超时自动拒；
//   · 三档策略是否符合口径（ask 全批 / auto_review 只读外部工具自动 / full_access 全放）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  APPROVAL_TTL_MS, autoReviewAllowed, decideApproval, highRiskKind,
  makeApproval, pruneApprovals, requiresExecutionApproval, resolveApprovalGate,
  approvalHash, type ExecutionApproval,
} from '../src/plugins/sec-lab-tools/approvals.js';
import { secLabModule } from '../src/plugins/sec-lab.js';
import { markTrustedHumanCall } from '../src/plugins/sec-lab-guard.js';

const T0 = 1760000000000;

const SQLI = { target: 'https://lab.example.com:8443/item?id=1', confirmed: true };
const NMAP = { action: 'run', tool: 'nmap', target: '10.0.0.5', ports: '80,443' };
const SQLMAP = { action: 'run', tool: 'sqlmap', target: '10.0.0.5', confirmed: true };

function approve(list: ExecutionApproval[], id: string, at = T0 + 100): ExecutionApproval[] {
  const r = decideApproval(list, id, 'approve', 'operator', undefined, at);
  if (!r.ok) throw new Error(r.reason);
  return r.list;
}

describe('高危动作识别', () => {
  it('shell / 容器 / 侵入验证进审批门，普通扫描不进', () => {
    expect(highRiskKind('toolchain', { action: 'detect' })).toBeNull();
    expect(highRiskKind('toolchain', NMAP)).toBe('shell');
    expect(highRiskKind('range_deploy', { template: 'dvwa' })).toBe('shell');
    expect(highRiskKind('android_launch', { avd: 'pixel' })).toBe('shell');
    expect(highRiskKind('verify_sqli', SQLI)).toBe('intrusive');
    expect(highRiskKind('verify_ssrf', { target: 'https://lab.example.com/x' })).toBe('intrusive');
    expect(highRiskKind('brute', { protocol: 'http', target: 'https://lab.example.com' })).toBe('intrusive');
    expect(highRiskKind('portscan', { target: '10.0.0.5' })).toBeNull();
    expect(requiresExecutionApproval('webprobe', { target: 'x' })).toBe(false);
  });

  it('auto_review 只自动放行只读外部工具，sqlmap/hydra 仍要人工', () => {
    expect(autoReviewAllowed('toolchain', NMAP)).toBe(true);
    expect(autoReviewAllowed('toolchain', SQLMAP)).toBe(false);
    expect(autoReviewAllowed('toolchain', { action: 'run', tool: 'hydra' })).toBe(false);
    expect(autoReviewAllowed('range_deploy', { template: 'dvwa' })).toBe(false);
  });
});

describe('内容哈希绑定动作参数', () => {
  it('参数键顺序 / confirmed 不影响哈希（同一动作原样重试稳定）', () => {
    const a = approvalHash('toolchain', { action: 'run', tool: 'nmap', target: '10.0.0.5', ports: '443' });
    const b = approvalHash('toolchain', { ports: '443', target: '10.0.0.5', tool: 'nmap', action: 'run', confirmed: true });
    expect(a).toBe(b);
  });

  it('改任何一个参数（含 URL 路径）都是另一条动作', () => {
    expect(approvalHash('toolchain', NMAP)).not.toBe(approvalHash('toolchain', { ...NMAP, ports: '22' }));
    expect(approvalHash('verify_sqli', SQLI)).not.toBe(approvalHash('verify_sqli', { ...SQLI, target: 'https://lab.example.com/other?id=1' }));
  });
});

describe('审批票据生命周期', () => {
  it('第一次请求进 pending；同动作重复请求幂等（不刷多条）', () => {
    const first = resolveApprovalGate([], 'toolchain', NMAP, 'ask', T0);
    expect(first.result.kind).toBe('pending');
    expect(first.list).toHaveLength(1);
    if (first.result.kind !== 'pending') return;

    const second = resolveApprovalGate(first.list, 'toolchain', NMAP, 'ask', T0 + 10);
    expect(second.result.kind).toBe('pending');
    if (second.result.kind !== 'pending') return;
    expect(second.result.approval.id).toBe(first.result.approval.id);
    expect(second.list).toHaveLength(1);
  });

  it('★ 未批准前永远 pending，不会自动放行', () => {
    let list: ExecutionApproval[] = [];
    for (let i = 0; i < 5; i++) {
      const r = resolveApprovalGate(list, 'verify_sqli', SQLI, 'ask', T0 + i * 1000);
      expect(r.result.kind).toBe('pending');
      list = r.list;
    }
    expect(list).toHaveLength(1);
  });

  it('批准后原样重试放行，且票一次性消费', () => {
    const first = resolveApprovalGate([], 'toolchain', NMAP, 'ask', T0);
    if (first.result.kind !== 'pending') throw new Error('setup failed');
    const list = approve(first.list, first.result.approval.id);

    const run = resolveApprovalGate(list, 'toolchain', NMAP, 'ask', T0 + 200);
    expect(run.result.kind).toBe('approved');
    expect(run.list).toHaveLength(0); // 已消费

    const again = resolveApprovalGate(run.list, 'toolchain', NMAP, 'ask', T0 + 300);
    expect(again.result.kind).toBe('pending'); // 下一次要重新批
    expect(again.list).toHaveLength(1);
  });

  it('批准只对完全相同的参数有效（改参数不认）', () => {
    const first = resolveApprovalGate([], 'toolchain', NMAP, 'ask', T0);
    if (first.result.kind !== 'pending') throw new Error('setup failed');
    const list = approve(first.list, first.result.approval.id);
    const changed = resolveApprovalGate(list, 'toolchain', { ...NMAP, ports: '22' }, 'ask', T0 + 200);
    expect(changed.result.kind).toBe('pending');
  });

  it('拒绝票消费后返回 rejected，并阻止重试', () => {
    const first = resolveApprovalGate([], 'verify_ssrf', SQLI, 'ask', T0);
    if (first.result.kind !== 'pending') throw new Error('setup failed');
    const dec = decideApproval(first.list, first.result.approval.id, 'reject', 'operator', '证据不足', T0 + 100);
    if (!dec.ok) throw new Error(dec.reason);
    const run = resolveApprovalGate(dec.list, 'verify_ssrf', SQLI, 'ask', T0 + 200);
    expect(run.result.kind).toBe('rejected');
    expect(run.list).toHaveLength(0);
  });

  it('★ 超时自动拒：pending 过期后变 expired，再请求是新票', () => {
    const first = resolveApprovalGate([], 'range_deploy', { template: 'dvwa' }, 'ask', T0);
    if (first.result.kind !== 'pending') throw new Error('setup failed');
    const expired = pruneApprovals(first.list, T0 + APPROVAL_TTL_MS + 1);
    expect(expired[0].status).toBe('expired');

    const again = resolveApprovalGate(expired, 'range_deploy', { template: 'dvwa' }, 'ask', T0 + APPROVAL_TTL_MS + 2);
    expect(again.result.kind).toBe('pending');
    if (again.result.kind !== 'pending') return;
    expect(again.result.approval.id).toBe(first.result.approval.id); // 同一动作稳定 id
    expect(again.list.find((a) => a.status === 'expired')).toBeTruthy();
  });

  it('★ 批准票也会过期（10 分钟后原样重试要重新批）', () => {
    const first = resolveApprovalGate([], 'toolchain', NMAP, 'ask', T0);
    if (first.result.kind !== 'pending') throw new Error('setup failed');
    const list = approve(first.list, first.result.approval.id, T0 + 100);
    const late = resolveApprovalGate(list, 'toolchain', NMAP, 'ask', T0 + 100 + APPROVAL_TTL_MS + 1);
    expect(late.result.kind).toBe('pending');
  });
});

describe('三档策略与 engagementMode 合并', () => {
  it('ask：shell 与侵入都要人工批', () => {
    expect(resolveApprovalGate([], 'toolchain', NMAP, 'ask', T0).result.kind).toBe('pending');
    expect(resolveApprovalGate([], 'verify_sqli', SQLI, 'ask', T0).result.kind).toBe('pending');
  });

  it('auto_review：只读外部工具自动放行，侵入仍要人工', () => {
    expect(resolveApprovalGate([], 'toolchain', NMAP, 'auto_review', T0).result.kind).toBe('auto');
    expect(resolveApprovalGate([], 'toolchain', SQLMAP, 'auto_review', T0).result.kind).toBe('pending');
    expect(resolveApprovalGate([], 'range_deploy', { template: 'dvwa' }, 'auto_review', T0).result.kind).toBe('pending');
  });

  it('full_access：高危动作不逐条批，但仍在 guard 之后（本函数只返回 auto）', () => {
    expect(resolveApprovalGate([], 'toolchain', SQLMAP, 'full_access', T0).result.kind).toBe('auto');
    expect(resolveApprovalGate([], 'verify_ssrf', SQLI, 'full_access', T0).result.kind).toBe('auto');
  });

  it('非高危动作完全不进审批门', () => {
    const r = resolveApprovalGate([], 'portscan', { target: '10.0.0.5' }, 'ask', T0);
    expect(r.result.kind).toBe('none');
    expect(r.list).toHaveLength(0);
  });
});

describe('人工决策校验', () => {
  it('只有 pending 能决策；审批人必填；拒绝记录原因', () => {
    const a = makeApproval('toolchain', NMAP, T0);
    const noApprover = decideApproval([a], a.id, 'approve', '  ', undefined, T0 + 1);
    expect(noApprover.ok).toBe(false);

    const rejected = decideApproval([a], a.id, 'reject', 'operator', '', T0 + 1);
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.entry.status).toBe('rejected');
    expect(rejected.entry.rejectReason).toBe('未说明原因');

    const again = decideApproval(rejected.list, a.id, 'approve', 'operator', undefined, T0 + 2);
    expect(again.ok).toBe(false);
  });
});

describe('withGuard 接线：pending → 人工批准 → 原样重试放行', () => {
  let mem: Map<string, unknown>;
  let tools: any[];

  beforeEach(async () => {
    mem = new Map();
    mem.set('scopes', [{
      id: 's1', type: 'ip', value: '127.0.0.1', authorizedBy: 'test',
      maxRisk: 'intrusive', environment: 'lab',
    }]);
    mem.set('config', { engagementMode: true, approvalMode: 'ask' });
    tools = [];
    await secLabModule.activate({
      registerTool: (t: any) => { tools.push(t); },
      registerBackendRoute: () => { /* 单测不挂真路由 */ },
      storage: {
        get: async (k: string) => mem.get(k),
        set: async (k: string, v: unknown) => { mem.set(k, v); },
        delete: async (k: string) => { mem.delete(k); },
        remove: async (k: string) => { mem.delete(k); },
        keys: () => [...mem.keys()],
      },
      log: () => {},
    } as any);
  });

  afterEach(() => {
    secLabModule.deactivate();
  });

  it('★ agent 调用高危工具先 pending；批准后原样重试才执行，票一次性消费', async () => {
    const tool = tools.find((t) => t.name === 'verify_sqli');
    expect(tool).toBeTruthy();
    const args = { target: 'http://127.0.0.1:1/?id=1', confirmed: true };

    const first = await tool.execute(args);
    const text1 = first.content?.[0]?.text || '';
    expect(text1).toContain('高危动作需要人工逐条批准');

    const list = mem.get('approvals') as ExecutionApproval[];
    expect(list).toHaveLength(1);
    const dec = decideApproval(list, list[0].id, 'approve', 'operator');
    if (!dec.ok) throw new Error(dec.reason);
    mem.set('approvals', dec.list);

    const second = await tool.execute(args);
    const text2 = second.content?.[0]?.text || '';
    expect(text2).not.toContain('高危动作需要人工逐条批准');
    const after = (mem.get('approvals') as ExecutionApproval[]) || [];
    expect(after.filter((a) => a.status === 'approved')).toHaveLength(0); // 已消费
  });

  it('★ 人工点击（Symbol）不重复走逐条审批', async () => {
    const tool = tools.find((t) => t.name === 'verify_sqli');
    const args: Record<string, unknown> = { target: 'http://127.0.0.1:1/?id=1', confirmed: true };
    markTrustedHumanCall(args);

    const r = await tool.execute(args);
    const text = r.content?.[0]?.text || '';
    expect(text).not.toContain('高危动作需要人工逐条批准');
    expect(mem.get('approvals')).toBeUndefined();
  });
});
