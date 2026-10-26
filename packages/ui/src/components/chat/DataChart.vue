<!--
交互图表（P0 图表层）
- ECharts 按需注册（只引 4 种图 + 5 个组件），组件本身由工作台 async 引入 → 不进首屏。
- 只吃 ChartSpec + ChartData，不取数；toPng() 供导出 PNG / 后续 Word 复用。
-->
<template>
  <div ref="el" class="data-chart" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { use, init, type EChartsType } from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { LineChart, BarChart, PieChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartData, ChartSpec } from './chart-spec';

use([
  LineChart, BarChart, PieChart, ScatterChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
  CanvasRenderer,
]);

const props = defineProps<{ spec: ChartSpec; data: ChartData }>();

const el = ref<HTMLElement | null>(null);
const chart = ref<EChartsType | null>(null);
let observer: ResizeObserver | null = null;

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#6366f1', '#14b8a6'];

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function buildOption(spec: ChartSpec, data: ChartData): EChartsOption {
  const categories = data.points.map((p) => p.key);
  const multi = data.series.length > 1;
  const pct = (v: number) => `${v}%`;

  if (spec.kind === 'pie') {
    const total = data.points.reduce((s, p) => s + sum(p.values), 0) || 1;
    return {
      color: PALETTE,
      tooltip: { trigger: 'item', valueFormatter: (v) => (typeof v === 'number' ? `${v}` : String(v)) },
      legend: { type: 'scroll', bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        label: {
          formatter: (p: { name?: string; value?: unknown }) => {
            const v = Number(p.value) || 0;
            return `${p.name ?? ''} ${((v / total) * 100).toFixed(1)}%`;
          },
          fontSize: 11,
        },
        data: data.points.map((p) => ({ name: p.key, value: sum(p.values) })),
      }],
    };
  }

  const series = data.series.map((name, i) => ({
    name,
    type: spec.kind === 'bar' ? ('bar' as const) : spec.kind === 'scatter' ? ('scatter' as const) : ('line' as const),
    data: data.points.map((p) => p.values[i] ?? 0),
    smooth: spec.kind === 'line' || spec.kind === 'area',
    areaStyle: spec.kind === 'area' ? { opacity: 0.18 } : undefined,
    showSymbol: spec.kind === 'scatter' || data.points.length <= 40,
    symbolSize: spec.kind === 'scatter' ? 9 : 5,
    barMaxWidth: 40,
    emphasis: { focus: 'series' as const },
  }));

  return {
    color: PALETTE,
    tooltip: {
      trigger: 'axis',
      ...(spec.percent ? { valueFormatter: (v) => (typeof v === 'number' ? pct(v) : String(v)) } : {}),
    },
    legend: multi ? { type: 'scroll', bottom: 0 } : undefined,
    grid: { left: 8, right: 16, top: 20, bottom: multi ? 46 : 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { hideOverlap: true, rotate: categories.length > 8 ? 30 : 0, fontSize: 11 },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      axisLabel: spec.percent ? { formatter: '{value}%', fontSize: 11 } : { fontSize: 11 },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    series,
  };
}

function render() {
  if (!chart.value) return;
  chart.value.setOption(buildOption(props.spec, props.data), { notMerge: true });
}

function toPng(opts: { background?: string; pixelRatio?: number } = {}): string {
  if (!chart.value) return '';
  return chart.value.getDataURL({
    type: 'png',
    pixelRatio: opts.pixelRatio ?? 2,
    backgroundColor: opts.background ?? '#ffffff',
  });
}

function resize() {
  chart.value?.resize();
}

defineExpose({ toPng, resize });

onMounted(async () => {
  await nextTick();
  if (!el.value) return;
  chart.value = init(el.value, undefined, { renderer: 'canvas' });
  render();
  observer = new ResizeObserver(() => chart.value?.resize());
  observer.observe(el.value);
});

watch(() => [props.spec, props.data], render, { deep: true });

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart.value?.dispose();
  chart.value = null;
});
</script>

<style scoped>
.data-chart { width: 100%; height: 100%; min-height: 220px; }
</style>
