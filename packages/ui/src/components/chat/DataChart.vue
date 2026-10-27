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
import { splitByMagnitude } from './chart-scale';

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
const AXIS_LABEL_COLOR = '#94a3b8';
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  borderColor: '#e2e8f0',
  borderWidth: 1,
  padding: [8, 10] as [number, number],
  textStyle: { color: '#334155', fontSize: 12 },
  extraCssText: 'box-shadow: 0 8px 24px rgba(15,23,42,.12); border-radius: 8px;',
};

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
      tooltip: {
        trigger: 'item',
        ...TOOLTIP_STYLE,
        valueFormatter: (v) => (typeof v === 'number' ? v.toLocaleString() : String(v)),
      },
      legend: { type: 'scroll', bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11, color: '#64748b' } },
      series: [{
        type: 'pie',
        radius: ['42%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        minAngle: 2,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
        labelLine: { length: 10, length2: 8, lineStyle: { color: '#cbd5e1' } },
        label: {
          formatter: (p: { name?: string; value?: unknown }) => {
            const v = Number(p.value) || 0;
            return `${p.name ?? ''} ${((v / total) * 100).toFixed(1)}%`;
          },
          fontSize: 11,
          color: '#475569',
        },
        data: data.points.map((p) => ({ name: p.key, value: sum(p.values) })),
      }],
    };
  }

  // 多指标量级悬殊时（如 调用次数 vs Token 总量）拆左右两根 Y 轴，否则小指标会被压平
  const maxima = data.series.map((_, i) =>
    data.points.reduce((m, p) => Math.max(m, Math.abs(Number(p.values[i]) || 0)), 0),
  );
  const { axisOf, dual } = splitByMagnitude(maxima);
  const axisNameOf = (idx: number): string => {
    const names = data.series.filter((_, i) => axisOf[i] === idx);
    if (!names.length) return '';
    const joined = names.join(' / ');
    return joined.length > 18 ? `${names[0]} 等 ${names.length} 项` : joined;
  };

  const series = data.series.map((name, i) => ({
    name,
    type: spec.kind === 'bar' ? ('bar' as const) : spec.kind === 'scatter' ? ('scatter' as const) : ('line' as const),
    data: data.points.map((p) => p.values[i] ?? 0),
    yAxisIndex: axisOf[i] ?? 0,
    smooth: spec.kind === 'line' || spec.kind === 'area' ? 0.25 : false,
    areaStyle: spec.kind === 'area' ? { opacity: 0.16 } : undefined,
    showSymbol: spec.kind === 'scatter' || data.points.length <= 40,
    symbol: 'circle',
    symbolSize: spec.kind === 'scatter' ? 9 : 6,
    lineStyle: { width: 2 },
    barMaxWidth: 36,
    itemStyle: spec.kind === 'bar' ? { borderRadius: [4, 4, 0, 0] } : undefined,
    emphasis: { focus: 'series' as const },
  }));

  const axisNameStyle = { fontSize: 11, color: AXIS_LABEL_COLOR };
  const measureName = data.measure || spec.measure;
  const valueAxisBase = {
    type: 'value' as const,
    nameLocation: 'end' as const,
    nameGap: 14,
    nameTextStyle: { ...axisNameStyle, fontSize: 10 },
    axisLabel: spec.percent
      ? { formatter: '{value}%', fontSize: 11, color: AXIS_LABEL_COLOR }
      : { fontSize: 11, color: AXIS_LABEL_COLOR },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: '#eef2f7', type: 'dashed' as const } },
  };
  const yAxis = dual
    ? [
        { ...valueAxisBase, name: axisNameOf(0) },
        {
          ...valueAxisBase,
          name: axisNameOf(1),
          position: 'right' as const,
          splitLine: { show: false },
          axisLine: { show: true, lineStyle: { color: '#e2e8f0' } },
        },
      ]
    : {
        ...valueAxisBase,
        // 多系列时图例已说明各自口径，轴上再堆一串度量名只会挡住左上角
        name: multi ? '' : (spec.percent ? `${measureName}（%）` : measureName),
      };

  return {
    color: PALETTE,
    tooltip: {
      trigger: 'axis',
      ...TOOLTIP_STYLE,
      axisPointer: {
        type: spec.kind === 'bar' ? 'shadow' : 'line',
        lineStyle: { color: '#cbd5e1' },
        shadowStyle: { color: 'rgba(148, 163, 184, 0.10)' },
      },
      ...(spec.percent ? { valueFormatter: (v) => (typeof v === 'number' ? pct(v) : String(v)) } : {}),
    },
    legend: multi
      ? { type: 'scroll', bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 6, textStyle: { fontSize: 11, color: '#64748b' } }
      : undefined,
    grid: { left: 12, right: dual ? 30 : 20, top: dual ? 36 : 30, bottom: multi ? 64 : 54, containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      name: spec.dim,
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: axisNameStyle,
      axisLabel: {
        show: true,
        hideOverlap: true,
        rotate: categories.length > 8 ? 30 : 0,
        fontSize: 11,
        color: AXIS_LABEL_COLOR,
        margin: 10,
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    yAxis,
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
