// 目标状态快照与回滚（sec-lab P1，2026-10-17）。
//
// ★ 先澄清"回滚"在这里的**含义边界**：评估工具**不能**把远端目标改回去 ——
//   那本身就是破坏性操作，且超出"只读验证"的授权范围。这里的回滚 =
//   把**记录里的基线**切回某份历史快照，之后再 snapshot + diff 时以它为准。
//   用途：误把一次已知变更当成"新暴露面"时纠偏，而不是改目标。
// ★ 快照与资产本身复用 `easm.ts` 的存储（同一份 plugin_storage），不另起一套 ——
//   两套存储必然漂移（"asset list 有一份、state list 少一份"）。
import type { ToolOutput } from '../sec-lab-types.js';
import { runEasm, type Asset, type Snapshot } from './easm.js';

export interface StateDeps {
  loadAssets: () => Promise<Asset[]>;
  saveAssets: (a: Asset[]) => Promise<void>;
  loadSnapshots: () => Promise<Snapshot[]>;
  saveSnapshots: (s: Snapshot[]) => Promise<void>;
}

export interface TargetStateParams {
  action: 'list' | 'diff' | 'rollback';
  assetId?: string;
  value?: string;
  snapshotId?: string;
}

/** 资产记录上的附加字段（写在同一条记录里，随 assets 一起持久化） */
type AssetWithBaseline = Asset & { baselineSnapshotId?: string };

const fmt = (at: number) => new Date(at).toLocaleString('zh-CN');

export async function runTargetState(p: TargetStateParams, deps: StateDeps): Promise<ToolOutput> {
  const action = p.action || 'list';

  // diff 完全复用 easm 的实现：再写一遍"比上一份快照"的逻辑只会两边算得不一样
  if (action === 'diff') {
    return runEasm({ action: 'diff', assetId: p.assetId, value: p.value }, deps);
  }

  const assets = (await deps.loadAssets()) as AssetWithBaseline[];
  const snaps = await deps.loadSnapshots();

  if (action === 'list') {
    if (!assets.length) {
      return { tool: 'target_state', target: '', risk: 'passive', summary: '暂无资产。先用 /assets add 登记，再 /assets snapshot 打快照。', findings: [] };
    }
    const rows = assets.map((a) => {
      const list = snaps.filter((s) => s.assetId === a.id).sort((x, y) => x.at - y.at);
      const base = a.baselineSnapshotId
        ? list.find((s) => s.id === a.baselineSnapshotId)
        : list[list.length - 1];
      return `${a.value}（id=${a.id}）\n  快照 ${list.length} 份` +
        (base ? `，当前基线 ${base.id} @ ${fmt(base.at)}（${base.ports.length} 端口 / ${base.subdomains.length} 子域）` : '，尚无基线');
    });
    return {
      tool: 'target_state', target: '', risk: 'passive',
      summary: rows.join('\n'),
      findings: [],
      raw: assets.map((a) => ({
        id: a.id, value: a.value,
        snapshots: snaps.filter((s) => s.assetId === a.id).length,
        baselineSnapshotId: a.baselineSnapshotId || null,
      })),
    };
  }

  // rollback
  const asset = p.assetId
    ? assets.find((a) => a.id === p.assetId)
    : assets.find((a) => a.value === p.value);
  if (!asset) throw new Error('未找到资产：请给 assetId（/assets list 可见）或 value');
  const list = snaps.filter((s) => s.assetId === asset.id).sort((x, y) => x.at - y.at);
  if (!list.length) throw new Error(`资产 ${asset.value} 还没有任何快照，先跑 /assets snapshot`);
  const target = p.snapshotId ? list.find((s) => s.id === p.snapshotId) : list[list.length - 1];
  if (!target) throw new Error(`未找到快照 ${p.snapshotId}（该资产共 ${list.length} 份）`);

  asset.baselineSnapshotId = target.id;
  await deps.saveAssets(assets);

  return {
    tool: 'target_state', target: asset.value, risk: 'passive',
    summary: `已把 ${asset.value} 的基线切到快照 ${target.id}（${fmt(target.at)}：${target.ports.length} 端口 / ${target.subdomains.length} 子域）。\n下次 /assets diff 将以这份为基准。`,
    findings: [{
      title: '基线已切换', severity: 'info',
      detail: '本操作只改"记录里的基线"，不会改动远端目标本身——评估工具不具备也不应有回写目标的能力。',
    }],
    raw: { assetId: asset.id, baselineSnapshotId: target.id, snapshotAt: target.at },
  };
}
