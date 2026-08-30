<template>
  <div ref="rootRef" class="kb-graph" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="kb-graph-head">
      <span class="section-label">{{ isEntityMode ? '实体关系图谱（点实体查看来源切片）' : '关系图谱（库 → 文档 → 分片）' }}</span>
      <div class="kb-graph-actions">
        <el-button size="small" type="primary" :icon="MagicStick" :loading="extractingNow" @click="extractGraph">{{ isEntityMode ? '重新提取实体图谱' : '提取实体图谱' }}</el-button>
        <el-button size="small" :icon="Refresh" @click="load">刷新</el-button>
        <el-button size="small" :icon="Search" @click="fitView">适应</el-button>
        <el-button size="small" :icon="ZoomIn" @click="zoomIn">+</el-button>
        <el-button size="small" :icon="ZoomOut" @click="zoomOut">−</el-button>
        <el-button size="small" :type="isFullscreen ? 'primary' : ''" :icon="isFullscreen ? Aim : FullScreen" :title="isFullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen" />
      </div>
    </div>

    <div v-if="loading" class="kb-graph-body"><el-skeleton :rows="4" animated /></div>
    <el-empty v-else-if="!isEntityMode && graph.nodes.length === 0" description="无节点，添加文档后自动生成" :image-size="60" />
    <div v-else class="kb-graph-body">
      <VueFlow
        v-model:nodes="vfNodes"
        v-model:edges="vfEdges"
        :default-viewport="{ x: 0, y: 0, zoom: 0.8 }"
        fit-view-on-init
        :min-zoom="0.3"
        :max-zoom="2"
        @node-click="onNodeClick"
      >
        <template #node-base="props">
          <div class="kb-node kb-node-base">{{ props.label }}</div>
        </template>
        <template #node-doc="props">
          <div class="kb-node kb-node-doc">{{ props.label }}</div>
        </template>
        <template #node-chunk="props">
          <div class="kb-node kb-node-chunk" :class="{ selected: selectedId === props.id }">
            <div class="kb-chunk-index">{{ props.label }}</div>
            <div class="kb-chunk-sub">{{ props.data?.sub }}</div>
          </div>
        </template>
        <template #node-entity="props">
          <div class="kb-node kb-node-entity" :class="{ selected: selectedId === props.id }">
            <div class="kb-entity-name">{{ props.label }}</div>
            <div class="kb-entity-desc">{{ props.data?.desc }}</div>
          </div>
        </template>
        <template #edge-label="{ data }">{{ data }}</template>
      </VueFlow>
      <!-- 点击分片展示内容（回退模式） -->
      <div v-if="selectedChunk" class="kb-chunk-panel">
        <div class="kb-chunk-panel-head">
          <b>{{ selectedChunk.docName || selectedChunk.label }}</b>
          <el-button size="small" text @click="selectedChunk = null">×</el-button>
        </div>
        <pre class="kb-chunk-panel-body">{{ selectedChunk.content }}</pre>
      </div>
      <!-- 点击实体展示描述 + 关联的来源切片 -->
      <div v-if="entityInfo" class="kb-chunk-panel">
        <div class="kb-chunk-panel-head">
          <b>实体：#{{ entityInfo.name }}</b>
          <el-button size="small" text @click="entityInfo = null">×</el-button>
        </div>
        <div class="kb-entity-panel-body">
          <div v-if="entityInfo.description" class="kb-entity-about">{{ entityInfo.description }}</div>
          <div class="kb-entity-slices-label">来源切片（{{ entityInfo.chunks.length }} 个）：</div>
          <div v-if="entityInfo.chunks.length === 0" style="color:var(--color-text-secondary);font-size:12px">暂无关联切片</div>
          <div v-for="(c, i) in entityInfo.chunks" :key="c.id" class="kb-entity-slice">
            <div class="kb-entity-slice-title">片 {{ c.chunkIndex }} · {{ c.docId?.slice(0, 8) || '' }}</div>
            <pre class="kb-entity-slice-body">{{ c.content }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { VueFlow, useVueFlow, type Node, type Edge } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import { Refresh, Search, ZoomIn, ZoomOut, MagicStick, FullScreen, Aim } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client';

const props = defineProps<{ baseId: string }>();

const rootRef = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
function toggleFullscreen() {
  const el = rootRef.value;
  if (!el) return;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
}
function handleFsChange() {
  isFullscreen.value = document.fullscreenElement === rootRef.value;
  if (isFullscreen.value) nextTick(() => fitView());
}
onMounted(() => document.addEventListener('fullscreenchange', handleFsChange));
onUnmounted(() => document.removeEventListener('fullscreenchange', handleFsChange));

const loading = ref(false);
// 提取状态按知识库 keyed：提取 A 库不影响 B 库，切换库状态自动跟着当前库走
const extractingByBase = ref<Record<string, boolean>>({});
const extractingNow = computed(() => !!extractingByBase.value[props.baseId]);
const graph = ref<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
const vfNodes = ref<Node[]>([]);
const vfEdges = ref<Edge[]>([]);
const selectedId = ref('');
const selectedChunk = ref<any>(null);
// 实体图谱模式
const isEntityMode = ref(false);
const entityInfo = ref<any>(null); // 当前点中的实体 {name, description, chunks:[{...}]}

// 轻量自适应分层布局（零依赖）。
// 三列：base x=0，doc x=280，chunk x=600。
// 以 base 为一组：组内 doc 纵向对齐到其首个 chunk 顶部，列内按内容估算高度累加，组间留间距；内容多自动撑开、不重叠，配合 fitView 整体自适应。
const COL_BASE = 0, COL_DOC = 300, COL_CHUNK = 620;
const ROW_GAP = 30, GRP_GAP = 44;
function estH(n: any): number {
  if (n.type === 'chunk') {
    const sub = n.sub || '';
    const lines = Math.ceil(sub.length / 22) || 1;
    return Math.max(40, 52 + lines * 15); // 分片摘要自适应高度
  }
  return 42; // base/doc
}
function layout(gnodes: any[], gedges: any[]): { nodes: Node[]; edges: Edge[] } {
  const get = (id: string) => gnodes.find((x) => x.id === id);
  // 关系：doc->base、chunk->doc
  const docBase: Record<string, string> = {};
  const chunkDoc: Record<string, string> = {};
  for (const e of gedges) {
    if (e.target.startsWith('d:')) docBase[e.target] = e.source;
    else if (e.target.startsWith('c:')) chunkDoc[e.target] = e.source;
  }
  const baseDocs: Record<string, string[]> = {};
  for (const n of gnodes) if (n.type === 'doc') (baseDocs[docBase[n.id] || ''] ||= []).push(n.id);
  const docChunks: Record<string, string[]> = {};
  for (const n of gnodes) if (n.type === 'chunk') (docChunks[chunkDoc[n.id] || ''] ||= []).push(n.id);

  const pos: Record<string, { x: number; y: number }> = {};
  let groupCursor = 12;
  const bases = gnodes.filter((n) => n.type === 'base');
  for (const base of bases) {
    const docs = baseDocs[base.id] || [];
    pos[base.id] = { x: COL_BASE, y: groupCursor };
    let baseSpan = Math.max(estH(base), 24);
    let docY = groupCursor;
    for (const docId of docs) {
      const doc = get(docId);
      if (!doc) continue;
      const chunks = docChunks[docId] || [];
      const chunkSpan = chunks.reduce((s, cid) => s + estH(get(cid)) + ROW_GAP, 0);
      pos[docId] = { x: COL_DOC, y: docY }; // doc 对齐到其 chunks 顶部
      let cy = docY;
      for (const cid of chunks) { pos[cid] = { x: COL_CHUNK, y: cy }; cy += estH(get(cid)) + ROW_GAP; }
      docY += Math.max(chunkSpan > 0 ? chunkSpan : estH(doc), estH(doc)) + GRP_GAP;
      baseSpan = Math.max(baseSpan, chunkSpan);
    }
    groupCursor = Math.max(docY + 16, groupCursor + baseSpan + GRP_GAP);
  }
  const nodes: Node[] = gnodes.map((n) => {
    const p = pos[n.id] || { x: 0, y: 0 };
    return {
      id: n.id, type: n.type, position: { x: p.x, y: p.y },
      label: n.label,
      data: { sub: n.sub || '', _content: n.content, _docName: n.docName },
    };
  });
  const edges: Edge[] = gedges.map((e, i) => ({
    id: `e${i}`, source: e.source, target: e.target, animated: true, data: '',
  }));
  return { nodes, edges };
}

// 实体图谱网格布局：实体按行排布（每行最多约 4 个），按行高累加 y，避免重叠。
function layoutEntities(entities: any[], relations: any[]): { nodes: Node[]; edges: Edge[] } {
  const NODE_W = 190, NODE_H = 64, GX = 60, GY = 40, PER_ROW = 4;
  const nodes: Node[] = [];
  const pos: Record<string, { x: number; y: number }> = {};
  entities.forEach((e, i) => {
    pos[e.name] = { x: (i % PER_ROW) * (NODE_W + GX) + 10, y: Math.floor(i / PER_ROW) * (NODE_H + GY) + 10 };
  });
  for (const e of entities) {
    nodes.push({ id: `ent:${e.id}`, type: 'entity', position: pos[e.name] || { x: 0, y: 0 }, label: e.name, data: { desc: e.description || '', chunkIds: e.chunkIds || [] } });
  }
  const edges: Edge[] = relations.map((r, i) => ({
    id: `er${i}`, source: `ent:${r.sourceId}`, target: `ent:${r.targetId}`, animated: true,
    label: r.relation || '相关', data: r.relation || '',
  }));
  return { nodes, edges };
}

async function load() {
  if (!props.baseId) return;
  loading.value = true;
  let g: any = null;
  try {
    const eg = await api.get<any>(`/kb/${props.baseId}/entity-graph`);
    if (!('error' in eg)) {
      const d = (eg as any).data;
      if (d && Array.isArray(d.entities) && d.entities.length > 0) {
        isEntityMode.value = true;
        entityInfo.value = null;
        selectedChunk.value = null;
        // 关联 source/target 到实体 id
        const idByName = new Map(d.entities.map((e: any) => [e.name, e.id]));
        const rels = (d.relations || []).map((r: any) => ({ ...r, sourceId: idByName.get(r.source), targetId: idByName.get(r.target) })).filter((r: any) => r.sourceId && r.targetId);
        const laid = layoutEntities(d.entities, rels);
        // 存实体->chunks 映射供点击回溯
        entityChunkMap.value = new Map(d.entities.map((e: any) => [e.name, e.chunkIds || []]));
        allChunks.value = d.chunks || [];
        vfNodes.value = laid.nodes;
        vfEdges.value = laid.edges;
        loading.value = false;
        return;
      }
    }
  } catch {}
  // 无实体 → 回退 库/文档/分片 图
  isEntityMode.value = false;
  let res = await api.get<any>(`/kb/${props.baseId}/graph`);
  loading.value = false;
  if ('error' in res) return;
  g = (res as any).data || { nodes: [], edges: [] };
  graph.value = g;
  const laid = layout(g.nodes || [], g.edges || []);
  vfNodes.value = laid.nodes;
  vfEdges.value = laid.edges;
  selectedChunk.value = null;
  entityInfo.value = null;
}

// 实体模式数据（点击实体回溯切片用）
const entityChunkMap = ref<Map<string, string[]>>(new Map());
const allChunks = ref<any[]>([]);

async function extractGraph() {
  const base = props.baseId;
  extractingByBase.value = { ...extractingByBase.value, [base]: true };
  try {
    await api.post(`/kb/${base}/graph/extract`, {});
    ElMessage.success('已开始增量提取实体图谱（本地模型处理中，可稍后刷新）');
    // 稍等片刻后重载（本地模型可能较慢，这里只是尝试立即刷新）
    await load();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '提取失败');
  } finally {
    extractingByBase.value = { ...extractingByBase.value, [base]: false };
  }
}

function onNodeClick(event: any) {
  const n = event.node;
  selectedId.value = n.id;
  selectedChunk.value = null;
  entityInfo.value = null;
  if (isEntityMode.value && n.id?.startsWith('ent:')) {
    // 点实体 → 展示描述 + 关联的来源切片
    const chunkIds = (n.data?.chunkIds || []) as string[];
    const chunks = chunkIds.map((cid) => allChunks.value.find((c) => c.id === cid)).filter(Boolean);
    entityInfo.value = { name: n.label, description: n.data?.desc || '', chunks };
    return;
  }
  if (n.id?.startsWith('c:') && n.data?._content !== undefined) {
    selectedChunk.value = { ...n.data, label: n.label, id: n.id, content: n.data._content, docName: n.data._docName };
  }
}

const { zoomIn, zoomOut, fitView } = useVueFlow();

watch(() => props.baseId, load, { immediate: true });
defineExpose({ load });
</script>

<style scoped>
.kb-graph { border: 1px solid var(--glass-border); border-radius: 12px; overflow: hidden; background: var(--glass-bg, rgba(255,255,255,0.5)); margin-top: 10px; }
.kb-graph.is-fullscreen { display: flex; flex-direction: column; background: var(--el-bg-color, #141414); }
.kb-graph.is-fullscreen .kb-graph-body { flex: 1; height: auto; }
.kb-graph-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; gap: 8px; }
.kb-graph-actions { display: flex; gap: 4px; }
.kb-graph-body { position: relative; height: 400px; }
.kb-graph-body :deep(.vue-flow) { height: 100%; width: 100%; }
.kb-node { font-size: 11px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--el-fill-color-blank, #fff); color: var(--color-text, #333); width: max-content; max-width: 300px; min-width: 72px; box-sizing: border-box; word-break: break-word; }
.kb-node-base { background: rgba(124,58,237,0.12); border-color: rgba(124,58,237,0.4); font-weight: 600; color: var(--color-primary); }
.kb-node-doc { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); font-weight: 500; }
.kb-node-chunk { cursor: pointer; background: rgba(59,130,246,0.06); font-weight: 400; }
.kb-node-chunk:hover { border-color: var(--color-primary); }
.kb-node-chunk.selected { border-color: var(--color-primary); box-shadow: 0 0 0 2px rgba(59,130,246,0.25); }
.kb-chunk-index { font-weight: 600; }
.kb-chunk-sub { font-size: 10px; color: var(--color-text-secondary); white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
.kb-chunk-panel { position: absolute; right: 10px; bottom: 10px; width: 60%; max-width: 420px; background: var(--el-bg-color-overlay, #fff); border: 1px solid var(--glass-border); border-radius: 10px; box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.4)); max-height: 45%; display: flex; flex-direction: column; }
.kb-chunk-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--glass-border); font-size: 12px; }
.kb-chunk-panel-body { margin: 0; padding: 8px 10px; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; overflow-y: auto; font-family: inherit; color: var(--color-text); }
.kb-node-entity { cursor: pointer; background: rgba(124,58,237,0.1); border-color: rgba(124,58,237,0.4); width: 180px; }
.kb-node-entity:hover { border-color: var(--color-primary); }
.kb-node-entity.selected { border-color: var(--color-primary); box-shadow: 0 0 0 2px rgba(124,58,237,0.3); }
.kb-entity-name { font-weight: 600; color: var(--color-primary); }
.kb-entity-desc { font-size: 10px; color: var(--color-text-secondary); white-space: pre-wrap; word-break: break-word; line-height: 1.4; margin-top: 2px; max-height: 40px; overflow: hidden; }
.kb-entity-panel-body { padding: 8px 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.kb-entity-about { font-size: 12px; color: var(--color-text); background: rgba(124,58,237,0.06); padding: 6px 8px; border-radius: 6px; }
.kb-entity-slices-label { font-size: 11px; color: var(--color-text-secondary); }
.kb-entity-slice { border: 1px solid var(--glass-border); border-radius: 6px; overflow: hidden; }
.kb-entity-slice-title { font-size: 11px; padding: 3px 6px; background: var(--glass-border, rgba(0,0,0,0.05)); color: var(--color-text-secondary); }
.kb-entity-slice-body { margin: 0; padding: 6px; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-height: 90px; overflow-y: auto; font-family: inherit; color: var(--color-text); }
</style>
