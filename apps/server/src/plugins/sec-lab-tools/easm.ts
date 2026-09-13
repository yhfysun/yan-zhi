// 自有资产暴露面监控（EASM 的合规形态）。
//
// 边界：**只扫确认归属自己的资产**。
// - 公网资产必须先登记归属证据（备案号 / 证书主体 / 域名注册信息）并通过 verify，
//   且对应 scope 条目要带 ownershipVerified=true，否则护栏直接拒绝扫描。
// - 不做"公网随机目标批量扫描"——那是对第三方基础设施的无差别探测，
//   既违法（《网络安全法》27 条）也会把自己的出口 IP 送进威胁情报库。
// - 价值点：持续快照 + 差异比对，第一时间发现"什么时候多了一个公网端口/子域"。
import { randomUUID } from 'node:crypto';
import type { Finding, ToolOutput } from '../sec-lab-types.js';
import { runRecon } from './recon.js';
import { runPortScan } from './portscan.js';

export interface Asset {
  id: string;
  /** 域名 / IP / CIDR */
  value: string;
  type: 'domain' | 'ip' | 'cidr';
  /** 归属团队或负责人 */
  owner: string;
  /** 归属证据（公网资产必填） */
  evidence?: string;
  /** 归属是否已验证 */
  verified: boolean;
  verifiedAt?: number;
  /** 环境：public=公网（需验证）；internal=内网；lab=靶场 */
  environment: 'public' | 'internal' | 'lab';
  createdAt: number;
  note?: string;
}

export interface Snapshot {
  id: string;
  assetId: string;
  at: number;
  /** 开放端口列表 */
  ports: Array<{ port: number; service?: string }>;
  /** 子域列表 */
  subdomains: string[];
  /** A 记录 */
  ips: string[];
  findings: number;
}

export interface EasmParams {
  action: 'add' | 'list' | 'verify' | 'snapshot' | 'diff';
  value?: string;
  type?: 'domain' | 'ip' | 'cidr';
  owner?: string;
  evidence?: string;
  environment?: 'public' | 'internal' | 'lab';
  assetId?: string;
  note?: string;
  timeoutMs?: number;
}

type Deps = {
  loadAssets: () => Promise<Asset[]>;
  saveAssets: (a: Asset[]) => Promise<void>;
  loadSnapshots: () => Promise<Snapshot[]>;
  saveSnapshots: (s: Snapshot[]) => Promise<void>;
};

export async function runEasm(p: EasmParams, deps: Deps): Promise<ToolOutput> {
  const target = p.value || p.assetId || p.action;

  // ---------- 登记 ----------
  if (p.action === 'add') {
    if (!p.value) throw new Error('add 需要提供 value');
    if (!p.owner) throw new Error('add 需要提供 owner（归属团队/负责人）');
    const env = p.environment || 'internal';
    if (env === 'public' && !p.evidence) {
      throw new Error('公网资产必须提供归属证据（备案号 / 证书主体 / 域名注册信息），否则不予登记——只扫确认属于自己的资产');
    }
    const assets = await deps.loadAssets();
    if (assets.some((a) => a.value === p.value)) throw new Error(`资产 ${p.value} 已登记`);
    const asset: Asset = {
      id: randomUUID(),
      value: p.value,
      type: p.type || (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(p.value) ? (p.value.includes('/') ? 'cidr' : 'ip') : 'domain'),
      owner: p.owner,
      evidence: p.evidence,
      verified: env !== 'public', // 内网/靶场默认已归属；公网必须显式 verify
      verifiedAt: env !== 'public' ? Date.now() : undefined,
      environment: env,
      createdAt: Date.now(),
      note: p.note,
    };
    assets.push(asset);
    await deps.saveAssets(assets);
    return {
      tool: 'asset_monitor', target: asset.value, risk: 'passive',
      summary: `已登记资产 ${asset.value}（${asset.environment}，归属 ${asset.owner}）${asset.verified ? '，归属已确认' : '，**待归属验证**'}。`,
      findings: asset.verified
        ? [{ title: '资产已登记', severity: 'info' as const, detail: `${asset.value} 归属 ${asset.owner}` }]
        : [{ title: '公网资产待归属验证', severity: 'medium' as const, detail: `证据：${asset.evidence || '(未填)'}。确认归属后调用 verify 通过验证，未验证前护栏禁止扫描。`, remediation: '核对证据后执行 asset_monitor(action=verify, assetId=...)' }],
      raw: { asset },
    };
  }

  // ---------- 列表 ----------
  if (p.action === 'list') {
    const assets = await deps.loadAssets();
    const snaps = await deps.loadSnapshots();
    return {
      tool: 'asset_monitor', target: 'all', risk: 'passive',
      summary: `已登记资产 ${assets.length} 个（已验证归属 ${assets.filter((a) => a.verified).length} 个），快照 ${snaps.length} 份。`,
      findings: assets.map((a) => ({
        title: `${a.value}（${a.environment}${a.verified ? ' · 已验证' : ' · 待验证'}）`,
        severity: (a.verified ? 'info' : 'medium') as Finding['severity'],
        detail: `归属 ${a.owner}${a.evidence ? `；证据 ${a.evidence}` : ''}；快照 ${snaps.filter((s) => s.assetId === a.id).length} 份`,
      })),
      raw: { assets, snapshotCount: snaps.length },
    };
  }

  // ---------- 归属验证 ----------
  if (p.action === 'verify') {
    if (!p.assetId) throw new Error('verify 需要提供 assetId');
    const assets = await deps.loadAssets();
    const a = assets.find((x) => x.id === p.assetId || x.value === p.assetId);
    if (!a) throw new Error(`未找到资产 ${p.assetId}`);
    if (a.environment === 'public' && !a.evidence && !p.evidence) {
      throw new Error('公网资产验证前必须补录归属证据');
    }
    if (p.evidence) a.evidence = p.evidence;
    a.verified = true;
    a.verifiedAt = Date.now();
    await deps.saveAssets(assets);
    return {
      tool: 'asset_monitor', target: a.value, risk: 'passive',
      summary: `资产 ${a.value} 归属验证通过（证据：${a.evidence || '内网/靶场资产'}），现已允许快照扫描。`,
      findings: [{ title: '归属验证通过', severity: 'info' as const, detail: `${a.value} → ${a.owner}`, remediation: '同步在授权范围（scope_add）中登记该目标并标记 ownershipVerified=true' }],
      raw: { asset: a },
    };
  }

  // ---------- 快照 ----------
  if (p.action === 'snapshot') {
    const assets = await deps.loadAssets();
    const a = assets.find((x) => x.id === p.assetId || x.value === (p.value || p.assetId));
    if (!a) throw new Error('snapshot 需要提供已登记的 assetId 或 value');
    if (!a.verified) {
      throw new Error(`资产 ${a.value} 尚未通过归属验证，禁止快照扫描。请先 verify。`);
    }
    const timeout = p.timeoutMs || 120000;
    const recon = await runRecon({ target: a.value, timeoutMs: timeout, actions: ['dns', 'tls', 'http', 'subdomain'] });
    const ps = await runPortScan({ target: a.value, ports: 'common', concurrency: 120, timeoutMs: timeout });
    const rawRecon = recon.raw as { dns?: { A?: string[] }; subdomains?: Array<{ host: string }> } | undefined;
    const rawPs = ps.raw as { results?: Array<{ port: number; service?: string; state: string }> } | undefined;
    const snap: Snapshot = {
      id: randomUUID(),
      assetId: a.id,
      at: Date.now(),
      ports: (rawPs?.results || []).filter((r) => r.state === 'open').map((r) => ({ port: r.port, service: r.service })),
      subdomains: (rawRecon?.subdomains || []).map((s) => s.host),
      ips: rawRecon?.dns?.A || [],
      findings: recon.findings.length + ps.findings.length,
    };
    const snaps = await deps.loadSnapshots();
    snaps.push(snap);
    await deps.saveSnapshots(snaps.slice(-500));
    return {
      tool: 'asset_monitor', target: a.value, risk: 'passive',
      summary: `资产 ${a.value} 快照完成：开放端口 ${snap.ports.length} 个、子域 ${snap.subdomains.length} 个、A 记录 ${snap.ips.length} 条。`,
      findings: [...recon.findings, ...ps.findings].slice(0, 20),
      raw: { snapshot: snap },
    };
  }

  // ---------- 差异比对 ----------
  const assets = await deps.loadAssets();
  const a = assets.find((x) => x.id === p.assetId || x.value === (p.value || p.assetId));
  if (!a) throw new Error('diff 需要提供 assetId 或 value');
  const all = await deps.loadSnapshots();
  const mine = all.filter((s) => s.assetId === a.id).sort((x, y) => y.at - x.at);
  if (mine.length < 2) {
    return {
      tool: 'asset_monitor', target: a.value, risk: 'passive',
      summary: `资产 ${a.value} 仅有 ${mine.length} 份快照，需至少 2 份才能比对。`,
      findings: [{ title: '快照不足', severity: 'info' as const, detail: '再跑一次 snapshot 后即可比对暴露面变化' }],
    };
  }
  const [cur, prev] = mine;
  const curPorts = new Set(cur.ports.map((x) => x.port));
  const prevPorts = new Set(prev.ports.map((x) => x.port));
  const newPorts = [...curPorts].filter((x) => !prevPorts.has(x)).sort((m, n) => m - n);
  const closedPorts = [...prevPorts].filter((x) => !curPorts.has(x)).sort((m, n) => m - n);
  const curSubs = new Set(cur.subdomains);
  const prevSubs = new Set(prev.subdomains);
  const newSubs = [...curSubs].filter((x) => !prevSubs.has(x));

  const findings: Finding[] = [];
  if (newPorts.length) {
    findings.push({
      title: `新增暴露端口：${newPorts.join(', ')}`,
      severity: 'high',
      detail: `与 ${new Date(prev.at).toLocaleString('zh-CN')} 的快照相比新增，确认是否为预期变更。`,
      evidence: JSON.stringify(cur.ports.filter((x) => newPorts.includes(x.port))),
      remediation: '非预期端口立即下线或加访问控制；预期变更请同步更新资产台账',
    });
  }
  if (newSubs.length) {
    findings.push({
      title: `新增子域：${newSubs.slice(0, 10).join(', ')}`,
      severity: 'medium',
      detail: `新增 ${newSubs.length} 个子域，确认是否为业务所需。`,
      remediation: '清理废弃子域，避免子域劫持与影子资产',
    });
  }
  if (closedPorts.length) {
    findings.push({ title: `端口已关闭：${closedPorts.join(', ')}`, severity: 'info', detail: '暴露面收敛，无需处理。' });
  }

  return {
    tool: 'asset_monitor', target: a.value, risk: 'passive',
    summary: newPorts.length || newSubs.length
      ? `发现暴露面变化：新增端口 ${newPorts.length} 个、新增子域 ${newSubs.length} 个，请核查是否为预期变更。`
      : '与上一份快照相比无暴露面变化。',
    findings: findings.length ? findings : [{ title: '无变化', severity: 'info', detail: '资产暴露面保持稳定' }],
    raw: { current: cur, previous: prev, newPorts, closedPorts, newSubs },
  };
}
