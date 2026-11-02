<template>
  <div class="sfc">
    <div class="sfc-head">
      <span class="sfc-title">安全发现</span>
      <span class="sfc-count">{{ findings.length }}</span>
      <span v-for="s in severitySummary" :key="s.key" class="sfc-chip" :data-sev="s.key">{{ s.label }} {{ s.n }}</span>
    </div>
    <div class="sfc-list">
      <div v-for="(f, i) in findings" :key="i" class="sfc-item" :data-sev="sevOf(f)">
        <span class="sfc-bar" />
        <div class="sfc-body">
          <div class="sfc-row">
            <span class="sfc-sev">{{ SEV_LABEL[sevOf(f)] }}</span>
            <span class="sfc-item-title">{{ f.title }}</span>
            <button type="button" class="sfc-toggle" @click="toggle(i)">{{ open[i] ? '收起' : '详情' }}</button>
          </div>
          <div v-if="metaOf(f)" class="sfc-meta">{{ metaOf(f) }}</div>
          <div v-if="open[i]" class="sfc-detail">
            <div v-if="f.detail">{{ f.detail }}</div>
            <div v-if="f.evidence" class="sfc-evidence">证据：{{ f.evidence }}</div>
            <div v-if="f.remediation" class="sfc-fix">修复：{{ f.remediation }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';

export interface SecFinding {
  title: string;
  severity?: string;
  detail?: string;
  remediation?: string;
  evidence?: string;
  tool?: string;
  target?: string;
  at?: number;
}

const props = defineProps<{ findings: SecFinding[] }>();

const SEV_LABEL: Record<string, string> = {
  critical: '严重', high: '高危', medium: '中危', low: '低危', info: '信息',
};

const open = reactive<Record<number, boolean>>({});
function toggle(i: number): void { open[i] = !open[i]; }

function sevOf(f: SecFinding): string {
  const s = String(f.severity || '').toLowerCase();
  return ['critical', 'high', 'medium', 'low', 'info'].includes(s) ? s : 'info';
}
function metaOf(f: SecFinding): string {
  return [f.tool, f.target].filter(Boolean).join(' · ');
}
const severitySummary = computed(() => {
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const n = new Map<string, number>();
  for (const f of props.findings) n.set(sevOf(f), (n.get(sevOf(f)) || 0) + 1);
  return order.filter((k) => n.get(k)).map((k) => ({ key: k, label: SEV_LABEL[k], n: n.get(k)! }));
});
</script>

<style scoped>
.sfc { margin: 8px 0 4px; border: 1px solid var(--glass-border); border-radius: 10px; overflow: hidden; }
.sfc-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--glass-bg, rgba(127,127,127,.06)); }
.sfc-title { font-size: 12px; font-weight: 600; }
.sfc-count { font-size: 11px; color: var(--color-text-secondary); }
.sfc-chip { font-size: 10.5px; padding: 0 6px; border-radius: 999px; border: 1px solid currentColor; }
.sfc-chip[data-sev="critical"] { color: #b91c1c; }
.sfc-chip[data-sev="high"] { color: #dc2626; }
.sfc-chip[data-sev="medium"] { color: #b4710a; }
.sfc-chip[data-sev="low"] { color: #2563eb; }
.sfc-chip[data-sev="info"] { color: #6b7280; }
.sfc-list { display: flex; flex-direction: column; }
.sfc-item { display: flex; gap: 0; border-top: 1px solid var(--glass-border); }
.sfc-bar { width: 3px; flex-shrink: 0; background: #6b7280; }
.sfc-item[data-sev="critical"] .sfc-bar { background: #b91c1c; }
.sfc-item[data-sev="high"] .sfc-bar { background: #dc2626; }
.sfc-item[data-sev="medium"] .sfc-bar { background: #d97706; }
.sfc-item[data-sev="low"] .sfc-bar { background: #2563eb; }
.sfc-body { flex: 1; min-width: 0; padding: 7px 10px; }
.sfc-row { display: flex; align-items: center; gap: 8px; }
.sfc-sev { font-size: 10.5px; font-weight: 600; flex-shrink: 0; }
.sfc-item[data-sev="critical"] .sfc-sev, .sfc-item[data-sev="high"] .sfc-sev { color: #dc2626; }
.sfc-item[data-sev="medium"] .sfc-sev { color: #b4710a; }
.sfc-item[data-sev="low"] .sfc-sev { color: #2563eb; }
.sfc-item[data-sev="info"] .sfc-sev { color: #6b7280; }
.sfc-item-title { font-size: 12.5px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sfc-toggle { border: none; background: transparent; color: var(--color-primary); font-size: 11.5px; cursor: pointer; flex-shrink: 0; }
.sfc-meta { font-size: 11px; color: var(--color-text-secondary); margin-top: 2px; }
.sfc-detail { font-size: 12px; margin-top: 5px; line-height: 1.6; color: var(--color-text-secondary); white-space: pre-wrap; }
.sfc-evidence { margin-top: 4px; font-family: var(--font-mono, monospace); font-size: 11px; }
.sfc-fix { margin-top: 4px; color: #047857; }
</style>
