<template>
  <div class="orm">
    <div v-if="!relations.length" class="orm-empty">还没有关联关系。可手工添加，或点「推断关联」按命名生成候选。</div>
    <template v-else>
      <svg class="orm-svg" viewBox="0 0 640 360" role="img" aria-label="本体关联关系图">
        <defs>
          <marker v-for="c in EDGE_COLORS" :id="`orm-arrow-${c.key}`" :key="c.key"
                  viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" :fill="c.color" />
          </marker>
        </defs>

        <g v-for="(e, i) in edges" :key="`e${i}`">
          <path v-if="e.self" :d="e.d" fill="none" :stroke="e.color" stroke-width="1.6" :marker-end="`url(#orm-arrow-${e.key})`" />
          <line v-else :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
                :stroke="e.color" stroke-width="1.6" :marker-end="`url(#orm-arrow-${e.key})`" />
          <text :x="e.lx" :y="e.ly" class="orm-edge-label" :fill="e.color">{{ e.type }}</text>
        </g>

        <g v-for="n in nodes" :key="n.code">
          <circle :cx="n.x" :cy="n.y" :r="30"
                  :class="['orm-node', { current: n.code === currentCode }]" />
          <text :x="n.x" :y="n.y + 4" class="orm-node-name">{{ n.label }}</text>
          <text :x="n.x" :y="n.y + 46" class="orm-node-code">{{ n.code }}</text>
        </g>
      </svg>

      <div v-if="risky.length" class="orm-risk">
        <div class="orm-risk-head">
          <span class="orm-risk-title">扇出风险</span>
          <span class="orm-risk-count">{{ risky.length }} 条</span>
        </div>
        <p>一对多 / 多对多关联在「一」侧做聚合时，会因多行匹配被放大成重复计数。聚合查询请从多的一侧发起，或先聚合再关联。</p>
        <ul>
          <li v-for="(r, i) in risky" :key="i">
            <code class="dw-mono">{{ r.source }}.{{ r.sourceAttr }}</code>
            <span class="orm-risk-type">{{ r.type }}</span>
            <code class="dw-mono">{{ r.target }}.{{ r.targetAttr }}</code>
          </li>
        </ul>
      </div>

      <table class="orm-table">
        <thead>
          <tr><th style="width:90px">类型</th><th>连接</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in relations" :key="`r${i}`">
            <td><span class="orm-type" :data-type="r.type">{{ r.type }}</span></td>
            <td>
              <code class="dw-mono">{{ r.source }}.{{ r.sourceAttr }}</code>
              <span class="orm-arrow">→</span>
              <code class="dw-mono">{{ r.target }}.{{ r.targetAttr }}</code>
              <div v-if="r.via" class="orm-via">经中间表 {{ r.via.table }}（{{ r.via.sourceColumn }} → {{ r.via.targetColumn }}）</div>
            </td>
            <td class="orm-desc">{{ r.description || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface RelationLike {
  source: string;
  type: string;
  target: string;
  sourceAttr: string;
  targetAttr: string;
  via?: { table: string; sourceColumn: string; targetColumn: string };
  description?: string;
}

const props = defineProps<{
  relations: RelationLike[];
  currentCode?: string;
  names?: Record<string, string>;
}>();

const EDGE_COLORS = [
  { key: 'n1', type: 'N:1', color: '#2563eb' },
  { key: '1n', type: '1:N', color: '#b4710a' },
  { key: 'nn', type: 'N:N', color: '#d6336c' },
  { key: '11', type: '1:1', color: '#0e9f8f' },
];
const CENTER = { x: 320, y: 170 };
const R = 118;
const NODE_R = 30;

function colorKey(type: string): string {
  return EDGE_COLORS.find((c) => c.type === type)?.key || 'n1';
}
function colorOf(type: string): string {
  return EDGE_COLORS.find((c) => c.type === type)?.color || '#8e93a6';
}

const codes = computed(() => {
  const set = new Set<string>();
  for (const r of props.relations) { if (r.source) set.add(r.source); if (r.target) set.add(r.target); }
  if (props.currentCode) set.add(props.currentCode);
  return [...set];
});

const nodes = computed(() => {
  const list = codes.value;
  const n = Math.max(1, list.length);
  return list.map((code, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const label = props.names?.[code] || code;
    return {
      code,
      label: label.length > 8 ? `${label.slice(0, 8)}…` : label,
      x: CENTER.x + Math.cos(angle) * R,
      y: CENTER.y + Math.sin(angle) * R,
    };
  });
});

const edges = computed(() => {
  const byCode = new Map(nodes.value.map((n) => [n.code, n]));
  return props.relations
    .map((r) => {
      const a = byCode.get(r.source);
      const b = byCode.get(r.target);
      if (!a || !b) return null;
      if (a.code === b.code) {
        const d = `M ${a.x - 10} ${a.y - NODE_R} C ${a.x - 46} ${a.y - NODE_R - 46}, ${a.x + 46} ${a.y - NODE_R - 46}, ${a.x + 10} ${a.y - NODE_R}`;
        return { self: true, d, key: colorKey(r.type), color: colorOf(r.type), type: r.type, lx: a.x, ly: a.y - NODE_R - 26 };
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      return {
        self: false,
        x1: a.x + ux * NODE_R, y1: a.y + uy * NODE_R,
        x2: b.x - ux * (NODE_R + 2), y2: b.y - uy * (NODE_R + 2),
        key: colorKey(r.type), color: colorOf(r.type), type: r.type,
        lx: (a.x + b.x) / 2, ly: (a.y + b.y) / 2 - 6,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
});

const risky = computed(() => props.relations.filter((r) => r.type === '1:N' || r.type === 'N:N'));
</script>

<style scoped>
.orm { display: flex; flex-direction: column; gap: 12px; }
.orm-empty { text-align: center; color: var(--color-text-secondary); padding: 28px 0; font-size: 13px; }
.orm-svg { width: 100%; height: auto; background: var(--glass-bg, rgba(127,127,127,.05)); border-radius: 10px; }
.orm-node { fill: var(--glass-bg, #f2f2f5); stroke: var(--glass-border, #d8d8e0); stroke-width: 1.2; }
.orm-node.current { fill: #f1ecfe; stroke: #7c3aed; stroke-width: 2; }
.orm-node-name { font-size: 11px; text-anchor: middle; fill: var(--color-text, #222); }
.orm-node-code { font-size: 9.5px; text-anchor: middle; fill: var(--color-text-secondary, #777); }
.orm-edge-label { font-size: 10px; text-anchor: middle; font-weight: 600; }
.orm-risk { border: 1px solid #f0ddb6; background: #fdf3e2; border-radius: 10px; padding: 10px 12px; }
.orm-risk-head { display: flex; align-items: center; gap: 8px; }
.orm-risk-title { font-size: 13px; font-weight: 600; color: #b4710a; }
.orm-risk-count { font-size: 11px; color: #b4710a; }
.orm-risk p { margin: 6px 0; font-size: 12px; color: #6b5326; line-height: 1.6; }
.orm-risk ul { margin: 0; padding-left: 18px; font-size: 12px; }
.orm-risk-type { margin: 0 6px; color: #b4710a; font-weight: 600; }
.orm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.orm-table th, .orm-table td { border-bottom: 1px solid var(--glass-border); padding: 7px 8px; text-align: left; vertical-align: top; }
.orm-table th { color: var(--color-text-secondary); font-weight: 500; }
.orm-type { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--glass-bg, rgba(127,127,127,.12)); }
.orm-type[data-type="1:N"], .orm-type[data-type="N:N"] { color: #b4710a; }
.orm-arrow { margin: 0 6px; color: var(--color-text-secondary); }
.orm-via { font-size: 11px; color: var(--color-text-secondary); margin-top: 3px; }
.orm-desc { color: var(--color-text-secondary); }
</style>
