<script setup lang="ts">
import { computed } from 'vue';
import type {
  AlgorithmAnimationFrame,
  AlgorithmAnimationNode,
} from './algorithm-animations';

const props = defineProps<{
  frame: AlgorithmAnimationFrame;
}>();

const values = computed(() => props.frame.values || []);
const active = computed(() => new Set(props.frame.active || []));
const comparing = computed(() => new Set(props.frame.compare || []));
const done = computed(() => new Set(props.frame.done || []));
const visited = computed(() => new Set(props.frame.visited || []));
const frontier = computed(() => new Set(props.frame.frontier || []));
const maxValue = computed(() => Math.max(1, ...values.value));

const heapNodes = computed<AlgorithmAnimationNode[]>(() => {
  const positions = [
    [260, 40],
    [140, 130],
    [380, 130],
    [70, 230],
    [210, 230],
    [310, 230],
    [450, 230],
  ];
  return values.value.slice(0, positions.length).map((value, index) => ({
    id: String(index),
    label: String(value),
    x: positions[index][0],
    y: positions[index][1],
    parent: index > 0 ? String(Math.floor((index - 1) / 2)) : undefined,
  }));
});

function barStyle(index: number): Record<string, string> {
  const value = values.value[index] || 0;
  return {
    '--scene-bar-height': `${Math.max(24, Math.round((value / maxValue.value) * 150))}px`,
  };
}

function findNode(id: string): AlgorithmAnimationNode | undefined {
  return props.frame.nodes?.find((node) => node.id === id);
}

function lineFrom(edge: { from: string; to: string }) {
  return findNode(edge.from);
}

function lineTo(edge: { from: string; to: string }) {
  return findNode(edge.to);
}

function gridValue(row: number, column: number): string {
  const value = props.frame.matrix?.[row]?.[column];
  return value === null || value === undefined ? '·' : String(value);
}

function cellClass(row: number, column: number): Record<string, boolean> {
  return {
    active: props.frame.activeCell?.[0] === row && props.frame.activeCell?.[1] === column,
    filled: props.frame.matrix?.[row]?.[column] !== null && props.frame.matrix?.[row]?.[column] !== undefined,
  };
}
</script>

<template>
  <div class="algorithm-scene-canvas" :data-scene-kind="frame.kind" role="img" :aria-label="frame.operation || '算法过程'">
    <div v-if="frame.kind === 'bars'" class="scene-bars-wrap">
      <div class="scene-bars">
        <div
          v-for="(value, index) in values"
          :key="`${index}-${value}`"
          class="scene-bar-column"
          :class="{
            active: active.has(index),
            comparing: comparing.has(index),
            done: done.has(index),
            found: frame.found && active.has(index),
          }"
        >
          <span v-if="frame.found && active.has(index)" class="scene-found">找到</span>
          <div class="scene-bar" :style="barStyle(index)"><b>{{ value }}</b></div>
          <small>{{ index }}</small>
          <em v-if="frame.mid === index">mid</em>
          <em v-else-if="frame.left === index">L</em>
          <em v-else-if="frame.right === index">R</em>
        </div>
      </div>
      <div v-if="frame.target !== undefined" class="scene-search-target">
        <span>目标 {{ frame.target }}</span>
        <small>绿色表示已确认，红色描边表示本轮比较。</small>
      </div>
    </div>

    <div v-else-if="frame.kind === 'linked-list'" class="scene-linked">
      <div class="scene-linked-flow">
        <template v-for="(node, index) in frame.nodes || []" :key="node.id">
          <div
            class="scene-linked-node"
            :class="{
              current: frame.current === node.id,
              previous: frame.previous === node.id,
              done: frame.doneNodes?.includes(node.id),
            }"
          >
            <span>{{ node.id }}</span>
            <b>{{ node.label }}</b>
            <small>next → {{ frame.next?.[node.id] ?? 'null' }}</small>
          </div>
          <i v-if="index < (frame.nodes?.length || 0) - 1" aria-hidden="true">···</i>
        </template>
      </div>
      <div class="scene-pointer-legend">
        <span><i class="current" />当前节点</span>
        <span><i class="previous" />已反转链头</span>
        <span><i class="done" />已掉头</span>
      </div>
    </div>

    <div v-else-if="frame.kind === 'stack-queue'" class="scene-linear">
      <section :class="{ focused: frame.focusArea === 'stack' }">
        <header><span>栈 · LIFO</span><b>{{ frame.operation }}</b></header>
        <div class="scene-stack">
          <div v-for="(value, index) in [...(frame.stack || [])].reverse()" :key="`${index}-${value}`">
            <b>{{ value }}</b>
            <small>{{ (frame.stack?.length || 0) - index === frame.stack?.length ? 'top' : index === 0 ? 'bottom' : '' }}</small>
          </div>
          <span v-if="!frame.stack?.length">空栈</span>
        </div>
      </section>
      <section :class="{ focused: frame.focusArea === 'queue' }">
        <header><span>队列 · FIFO</span><b>{{ frame.operation }}</b></header>
        <div class="scene-queue">
          <div v-for="(value, index) in frame.queue || []" :key="`${index}-${value}`">
            <small>{{ index === 0 ? 'front' : index === (frame.queue?.length || 0) - 1 ? 'rear' : `#${index}` }}</small>
            <b>{{ value }}</b>
          </div>
          <span v-if="!frame.queue?.length">空队列</span>
        </div>
      </section>
    </div>

    <svg
      v-else-if="frame.kind === 'tree' || frame.kind === 'graph' || frame.kind === 'heap'"
      class="scene-graph"
      viewBox="0 0 520 285"
      aria-hidden="true"
    >
      <g class="scene-edges">
        <template v-if="frame.kind === 'tree'">
          <line
            v-for="node in (frame.nodes || []).filter((item) => item.parent)"
            :key="`${node.parent}-${node.id}`"
            :x1="findNode(node.parent || '')?.x || 0"
            :y1="findNode(node.parent || '')?.y || 0"
            :x2="node.x"
            :y2="node.y"
          />
        </template>
        <template v-else-if="frame.kind === 'graph'">
          <line
            v-for="edge in frame.edges || []"
            :key="`${edge.from}-${edge.to}`"
            :x1="lineFrom(edge)?.x || 0"
            :y1="lineFrom(edge)?.y || 0"
            :x2="lineTo(edge)?.x || 0"
            :y2="lineTo(edge)?.y || 0"
          />
        </template>
        <template v-else>
          <line
            v-for="node in heapNodes.filter((item) => item.parent)"
            :key="`${node.parent}-${node.id}`"
            :x1="heapNodes.find((item) => item.id === node.parent)?.x || 0"
            :y1="heapNodes.find((item) => item.id === node.parent)?.y || 0"
            :x2="node.x"
            :y2="node.y"
          />
        </template>
      </g>

      <g v-if="frame.kind === 'tree' || frame.kind === 'graph'" class="scene-nodes">
        <g
          v-for="node in frame.nodes || []"
          :key="node.id"
          :transform="`translate(${node.x} ${node.y})`"
          :class="{
            active: frame.activeNode === node.id,
            visited: visited.has(node.id),
            frontier: frontier.has(node.id),
          }"
        >
          <circle r="25" />
          <text text-anchor="middle" dominant-baseline="central">{{ node.label }}</text>
          <text v-if="frame.activeNode === node.id" y="38" class="scene-node-label" text-anchor="middle">处理中</text>
          <text v-else-if="visited.has(node.id)" y="38" class="scene-node-label" text-anchor="middle">已访问</text>
          <text v-else-if="frontier.has(node.id)" y="38" class="scene-node-label" text-anchor="middle">待访问</text>
        </g>
      </g>

      <g v-else class="scene-nodes heap">
        <g
          v-for="node in heapNodes"
          :key="node.id"
          :transform="`translate(${node.x} ${node.y})`"
          :class="{
            active: active.has(Number(node.id)),
            done: done.has(Number(node.id)),
          }"
        >
          <circle r="25" />
          <text text-anchor="middle" dominant-baseline="central">{{ node.label }}</text>
          <text y="37" class="scene-node-label" text-anchor="middle">[{{ node.id }}]</text>
        </g>
      </g>
    </svg>

    <div v-else-if="frame.kind === 'hash'" class="scene-hash">
      <div
        v-for="bucket in frame.buckets || []"
        :key="bucket.index"
        class="scene-hash-row"
        :class="{ active: frame.activeBucket === bucket.index }"
      >
        <b>#{{ bucket.index }}</b>
        <div>
          <span v-for="value in bucket.values" :key="value">{{ value }}</span>
          <small v-if="!bucket.values.length">空</small>
        </div>
      </div>
    </div>

    <div v-else-if="frame.kind === 'grid'" class="scene-grid-scroll">
      <table class="scene-dp-grid">
        <thead>
          <tr>
            <th />
            <th v-for="column in frame.columns || []" :key="`col-${column}`">{{ column || '∅' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in frame.rows || []" :key="`row-${rowIndex}`">
            <th>{{ row || '∅' }}</th>
            <td
              v-for="(_, columnIndex) in frame.columns || []"
              :key="`cell-${rowIndex}-${columnIndex}`"
              :class="cellClass(rowIndex, columnIndex)"
            >
              {{ gridValue(rowIndex, columnIndex) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="scene-window">
      <div class="scene-window-tokens">
        <span
          v-for="(token, index) in frame.tokens || []"
          :key="`${index}-${token}`"
          :class="{
            inside: index >= (frame.windowLeft || 0) && index <= (frame.windowRight || 0),
            edge: index === frame.windowLeft || index === frame.windowRight,
            duplicate: frame.duplicate && index === frame.windowRight,
          }"
        >
          <b>{{ token }}</b>
          <small>{{ index }}</small>
        </span>
      </div>
      <div class="scene-window-metrics">
        <span>当前窗口 <b>{{ frame.windowLength }}</b></span>
        <span>历史最长 <b>{{ frame.bestLength }}</b></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.algorithm-scene-canvas {
  display: grid;
  min-height: 280px;
  align-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background:
    linear-gradient(color-mix(in srgb, var(--color-primary) 5%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 5%, transparent) 1px, transparent 1px),
    color-mix(in srgb, var(--color-surface) 94%, var(--color-bg-muted));
  background-size: 24px 24px;
}

.scene-bars-wrap {
  min-width: 0;
  padding: 22px 16px 14px;
}
.scene-bars {
  display: grid;
  min-height: 196px;
  grid-template-columns: repeat(10, minmax(18px, 1fr));
  gap: clamp(3px, 1.2vw, 10px);
  align-items: end;
}
.scene-bar-column {
  position: relative;
  display: grid;
  min-width: 0;
  justify-items: center;
  align-content: end;
  gap: 5px;
}
.scene-bar {
  position: relative;
  width: 100%;
  height: var(--scene-bar-height);
  min-height: 24px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 36%, var(--color-border));
  border-radius: 5px 5px 2px 2px;
  background: color-mix(in srgb, var(--color-primary) 18%, var(--color-surface));
  transition: height .28s ease, background .2s ease, transform .2s ease;
}
.scene-bar b {
  position: absolute;
  top: -20px;
  left: 50%;
  color: var(--color-text-secondary);
  font-size: 10px;
  transform: translateX(-50%);
}
.scene-bar-column > small { color: var(--color-text-tertiary); font-size: 8px; }
.scene-bar-column > em {
  position: absolute;
  bottom: -18px;
  color: var(--color-primary);
  font-size: 8px;
  font-style: normal;
  font-weight: 700;
}
.scene-bar-column.active .scene-bar {
  border-color: #b45309;
  background: color-mix(in srgb, #f59e0b 23%, var(--color-surface));
  transform: translateY(-3px);
}
.scene-bar-column.comparing .scene-bar { box-shadow: 0 0 0 2px color-mix(in srgb, #b45309 35%, transparent); }
.scene-bar-column.done .scene-bar { border-color: color-mix(in srgb, #0f766e 56%, var(--color-border)); }
.scene-bar-column.found .scene-bar {
  border-color: #0f766e;
  background: color-mix(in srgb, #0f766e 24%, var(--color-surface));
}
.scene-found {
  position: absolute;
  top: -42px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #0f766e;
  color: var(--color-surface);
  font-size: 8px;
  white-space: nowrap;
}
.scene-search-target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 18px;
  padding-top: 9px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 74%, transparent);
  color: var(--color-text-secondary);
  font-size: 9px;
}
.scene-search-target small { color: var(--color-text-tertiary); font-size: 8px; }

.scene-linked { padding: 22px 18px; }
.scene-linked-flow { display: flex; align-items: center; overflow-x: auto; padding: 26px 4px 12px; }
.scene-linked-flow > i { flex: 0 0 18px; color: var(--color-text-tertiary); font-style: normal; text-align: center; }
.scene-linked-node {
  display: grid;
  min-width: 92px;
  min-height: 76px;
  place-items: center;
  gap: 2px;
  padding: 9px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  transition: transform .2s ease, border-color .2s ease;
}
.scene-linked-node > span { color: var(--color-text-tertiary); font-size: 8px; }
.scene-linked-node > b { font-size: 19px; }
.scene-linked-node > small { color: var(--color-text-secondary); font-size: 8px; white-space: nowrap; }
.scene-linked-node.current { border-color: #b45309; transform: translateY(-4px); }
.scene-linked-node.previous { border-color: #0f766e; }
.scene-linked-node.done { background: color-mix(in srgb, #0f766e 8%, var(--color-surface)); }
.scene-pointer-legend { display: flex; flex-wrap: wrap; gap: 10px; color: var(--color-text-tertiary); font-size: 8px; }
.scene-pointer-legend span { display: inline-flex; align-items: center; gap: 4px; }
.scene-pointer-legend i { width: 7px; height: 7px; border-radius: 50%; background: var(--color-border); }
.scene-pointer-legend i.current { background: #b45309; }
.scene-pointer-legend i.previous { background: #0f766e; }
.scene-pointer-legend i.done { background: #4d7c72; }

.scene-linear {
  display: grid;
  grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
  gap: 12px;
  padding: 16px;
}
.scene-linear > section {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
}
.scene-linear > section.focused { border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border)); }
.scene-linear header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.scene-linear header span { color: var(--color-primary); font-size: 9px; font-weight: 700; }
.scene-linear header b { color: var(--color-text-tertiary); font-size: 8px; }
.scene-stack { display: flex; min-height: 170px; flex-direction: column-reverse; justify-content: flex-start; gap: 4px; }
.scene-stack > div,
.scene-queue > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
}
.scene-stack > div { min-height: 36px; padding: 0 9px; }
.scene-stack small,
.scene-queue small { color: var(--color-text-tertiary); font-size: 8px; }
.scene-queue { display: flex; min-height: 94px; align-items: center; gap: 6px; overflow-x: auto; }
.scene-queue > div { min-width: 60px; min-height: 62px; flex-direction: column; justify-content: center; }
.scene-stack > span,
.scene-queue > span { color: var(--color-text-tertiary); font-size: 9px; }

.scene-graph { display: block; width: 100%; max-height: 310px; padding: 12px; }
.scene-edges line { stroke: color-mix(in srgb, var(--color-text-tertiary) 42%, transparent); stroke-width: 2; }
.scene-nodes circle {
  fill: var(--color-surface);
  stroke: color-mix(in srgb, var(--color-primary) 34%, var(--color-border));
  stroke-width: 2;
  transition: fill .2s ease, stroke .2s ease, transform .2s ease;
}
.scene-nodes text { fill: var(--color-text); font-size: 15px; font-weight: 700; }
.scene-nodes .scene-node-label { fill: var(--color-text-tertiary); font-size: 8px; font-weight: 500; }
.scene-nodes g.frontier circle { stroke: #b45309; stroke-dasharray: 4 3; }
.scene-nodes g.visited circle { fill: color-mix(in srgb, #0f766e 12%, var(--color-surface)); stroke: #0f766e; }
.scene-nodes g.active circle { fill: color-mix(in srgb, #f59e0b 19%, var(--color-surface)); stroke: #b45309; }
.scene-nodes g.active { filter: drop-shadow(0 6px 8px color-mix(in srgb, #b45309 18%, transparent)); }
.scene-nodes.heap g.done circle { fill: color-mix(in srgb, #0f766e 11%, var(--color-surface)); stroke: #0f766e; }
.scene-nodes.heap g.active circle { fill: color-mix(in srgb, #f59e0b 17%, var(--color-surface)); stroke: #b45309; }

.scene-hash { display: grid; gap: 5px; padding: 17px; }
.scene-hash-row {
  display: grid;
  min-height: 38px;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
}
.scene-hash-row.active { border-color: #b45309; background: color-mix(in srgb, #f59e0b 8%, var(--color-surface)); }
.scene-hash-row > b { color: var(--color-text-tertiary); font: 9px/1 ui-monospace, "SFMono-Regular", Consolas, monospace; }
.scene-hash-row > div { display: flex; gap: 5px; overflow-x: auto; }
.scene-hash-row span { padding: 3px 7px; border-radius: 999px; background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface)); color: var(--color-primary); font-size: 8px; white-space: nowrap; }
.scene-hash-row small { color: var(--color-text-tertiary); font-size: 8px; }

.scene-grid-scroll { max-width: 100%; overflow-x: auto; padding: 16px; }
.scene-dp-grid { border-collapse: collapse; margin: 0 auto; font: 9px/1 ui-monospace, "SFMono-Regular", Consolas, monospace; }
.scene-dp-grid th,
.scene-dp-grid td {
  width: 34px;
  min-width: 34px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  color: var(--color-text-secondary);
  text-align: center;
}
.scene-dp-grid th { background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface)); color: var(--color-primary); }
.scene-dp-grid td.filled { background: color-mix(in srgb, var(--color-surface) 92%, var(--color-primary)); }
.scene-dp-grid td.active { outline: 2px solid #b45309; outline-offset: -2px; background: color-mix(in srgb, #f59e0b 14%, var(--color-surface)); color: var(--color-text); font-weight: 700; }

.scene-window { padding: 22px 16px; }
.scene-window-tokens { display: flex; justify-content: center; gap: 5px; overflow-x: auto; padding: 18px 2px 8px; }
.scene-window-tokens > span {
  display: grid;
  min-width: 36px;
  min-height: 50px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-tertiary);
  transition: transform .2s ease, border-color .2s ease, background .2s ease;
}
.scene-window-tokens > span.inside { border-color: #0f766e; background: color-mix(in srgb, #0f766e 9%, var(--color-surface)); color: var(--color-text); }
.scene-window-tokens > span.edge { transform: translateY(-5px); }
.scene-window-tokens > span.duplicate { border-color: #b42318; background: color-mix(in srgb, #b42318 8%, var(--color-surface)); }
.scene-window-tokens b { font-size: 14px; }
.scene-window-tokens small { font-size: 7px; }
.scene-window-metrics { display: flex; justify-content: center; gap: 18px; margin-top: 8px; color: var(--color-text-tertiary); font-size: 9px; }
.scene-window-metrics b { color: var(--color-primary); }

@media (max-width: 620px) {
  .algorithm-scene-canvas { min-height: 240px; }
  .scene-bars-wrap { padding: 18px 8px 12px; }
  .scene-bars { min-height: 168px; gap: 3px; }
  .scene-bar-column > em { display: none; }
  .scene-search-target { align-items: flex-start; flex-direction: column; }
  .scene-linear { grid-template-columns: 1fr; }
  .scene-stack { min-height: 110px; }
  .scene-linked { padding: 16px 10px; }
  .scene-linked-node { min-width: 82px; }
  .scene-graph { padding: 6px 0; }
  .scene-hash { padding: 12px 8px; }
  .scene-dp-grid th,
  .scene-dp-grid td { width: 30px; min-width: 30px; height: 29px; }
  .scene-window { padding: 16px 10px; }
  .scene-window-tokens { justify-content: flex-start; }
}

@media (max-width: 360px) {
  .scene-dp-grid th,
  .scene-dp-grid td { width: 26px; min-width: 26px; height: 27px; }
}

@media (prefers-reduced-motion: reduce) {
  .scene-bar,
  .scene-linked-node,
  .scene-nodes circle,
  .scene-window-tokens > span { transition: none; }
}
</style>
