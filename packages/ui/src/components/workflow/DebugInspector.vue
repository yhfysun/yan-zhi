<!--
  DebugInspector.vue —— 单节点调试（抄 Dify 的 step-run）
  - 运行到指定节点：从入口跑到该节点后暂停，拿到到断点为止的所有节点输出
  - 改变量：编辑任意节点的输出快照，然后「从此节点继续」—— 不重跑上游，省 LLM 调用
  - 单跑节点：只跑选中的那一个节点（用当前快照当上下文）
  快照只存在后端内存（随运行 30 分钟），刷新页面/重启服务后调试会话需重开。
-->
<template>
  <div class="dbg">
    <div class="dbg-head" @click="open = !open">
      <span>单节点调试</span>
      <el-icon :size="12"><ArrowDown v-if="open" /><ArrowRight v-else /></el-icon>
    </div>

    <div v-if="open" class="dbg-body">
      <div class="dbg-row">
        <el-select v-model="stopAt" size="small" placeholder="选择节点" style="width: 240px">
          <el-option
            v-for="n in agent.nodes"
            :key="n.id"
            :value="n.id"
            :label="`${n.type} · ${n.label || n.id}`"
          />
        </el-select>
        <button class="dbg-btn primary" :disabled="busy || !stopAt" @click="runTo">运行到此节点</button>
        <span v-if="debugRunId" class="dbg-runid" :title="debugRunId">调试会话 {{ debugRunId.slice(0, 12) }}…</span>
      </div>

      <div v-if="!snapshots.length" class="dbg-empty">
        选一个节点点「运行到此节点」，之后可以在这里改输出、从任意节点继续
      </div>

      <div v-else class="dbg-snaps">
        <div v-for="s in snapshots" :key="s.nodeId" class="dbg-snap">
          <div class="dbg-snap-head" @click="toggle(s.nodeId)">
            <span class="dbg-snap-id">{{ s.nodeId }}</span>
            <span class="dbg-snap-preview">{{ preview(s.output) }}</span>
            <button class="dbg-btn" @click.stop="runOne(s.nodeId)">单跑</button>
            <button class="dbg-btn" @click.stop="continueFrom(s.nodeId)">从此继续</button>
          </div>
          <div v-if="expanded === s.nodeId" class="dbg-snap-body">
            <textarea v-model="drafts[s.nodeId]" class="dbg-text" rows="4" spellcheck="false"></textarea>
            <div class="dbg-hint">改完点「从此继续」—— 下游会用新值跑，上游不重跑</div>
          </div>
        </div>
      </div>

      <div v-if="errorMsg" class="dbg-error">{{ errorMsg }}</div>
      <div class="dbg-tip">
        注意：code 节点内部报错不会中断流程（引擎会吞掉并返回 null），看起来像「没报错但结果不对」。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import { useWorkflowStore } from '../../stores/workflow';
import type { DebugSnapshot, WorkflowAgentItem } from '../../stores/workflow';

const props = defineProps<{
  agent: WorkflowAgentItem;
  inputs: Record<string, unknown>;
  nodeOverrides?: Record<string, Record<string, unknown>>;
}>();

const wf = useWorkflowStore();

const open = ref(false);
const stopAt = ref('');
const debugRunId = ref('');
const snapshots = ref<DebugSnapshot[]>([]);
const drafts = ref<Record<string, string>>({});
const expanded = ref('');
const busy = ref(false);
const errorMsg = ref('');

watch(() => props.agent.id, () => reset());

function reset() {
  stopAt.value = '';
  debugRunId.value = '';
  snapshots.value = [];
  drafts.value = {};
  expanded.value = '';
  errorMsg.value = '';
}

function preview(v: unknown): string {
  if (v == null) return '（空）';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

function fillDrafts(list: DebugSnapshot[]) {
  const next: Record<string, string> = {};
  for (const s of list) next[s.nodeId] = typeof s.output === 'string' ? s.output : JSON.stringify(s.output, null, 2);
  drafts.value = next;
}

/** 把编辑框里的文本解析回变量值：能解析成 JSON 就用 JSON，否则当字符串 */
function parseOverrides(nodeId: string): Record<string, unknown> {
  const raw = drafts.value[nodeId];
  if (raw == null) return {};
  try { return { [nodeId]: JSON.parse(raw) }; } catch { return { [nodeId]: raw }; }
}

async function runTo() {
  if (!stopAt.value || busy.value) return;
  busy.value = true;
  errorMsg.value = '';
  try {
    const out = await wf.debugRunTo(props.agent.id, props.inputs, stopAt.value, props.nodeOverrides);
    debugRunId.value = out.runId;
    snapshots.value = out.snapshots || [];
    fillDrafts(snapshots.value);
    if (snapshots.value.length) expanded.value = snapshots.value[snapshots.value.length - 1].nodeId;
  } catch (e: any) {
    errorMsg.value = e?.message || '调试运行失败';
  } finally {
    busy.value = false;
  }
}

async function runOne(nodeId: string) {
  if (!debugRunId.value || busy.value) return;
  busy.value = true;
  try {
    const out = await wf.debugRunNode(debugRunId.value, nodeId, parseOverrides(nodeId));
    snapshots.value = out.snapshots || [];
    fillDrafts(snapshots.value);
    expanded.value = nodeId;
  } catch (e: any) {
    errorMsg.value = e?.message || '单节点运行失败';
  } finally {
    busy.value = false;
  }
}

async function continueFrom(nodeId: string) {
  if (!debugRunId.value || busy.value) return;
  busy.value = true;
  try {
    const out = await wf.debugContinue(debugRunId.value, nodeId, parseOverrides(nodeId));
    snapshots.value = out.snapshots || [];
    fillDrafts(snapshots.value);
  } catch (e: any) {
    errorMsg.value = e?.message || '继续运行失败';
  } finally {
    busy.value = false;
  }
}

function toggle(nodeId: string) {
  expanded.value = expanded.value === nodeId ? '' : nodeId;
}
</script>

<style scoped>
.dbg { margin-top: 16px; max-width: 760px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.dbg-head {
  display: flex; align-items: center; justify-content: space-between; padding: 7px 10px;
  font-size: 12px; cursor: pointer; background: var(--el-fill-color-lighter); border-radius: 8px 8px 0 0;
}
.dbg-body { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.dbg-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dbg-btn {
  font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--el-border-color); background: transparent; color: var(--el-text-color-regular);
}
.dbg-btn:hover:not(:disabled) { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.dbg-btn.primary { background: var(--el-color-primary); border-color: var(--el-color-primary); color: #fff; }
.dbg-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.dbg-runid { font-size: 11px; color: var(--el-text-color-secondary); font-family: var(--font-mono, monospace); }
.dbg-empty { font-size: 12px; color: var(--el-text-color-placeholder); padding: 4px 2px; }
.dbg-snaps { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow: auto; }
.dbg-snap { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.dbg-snap-head { display: flex; align-items: center; gap: 8px; padding: 5px 8px; font-size: 12px; cursor: pointer; }
.dbg-snap-id { font-family: var(--font-mono, monospace); flex: none; }
.dbg-snap-preview {
  flex: 1; color: var(--el-text-color-secondary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.dbg-snap-body { padding: 8px; border-top: 1px solid var(--el-border-color-lighter); }
.dbg-text {
  width: 100%; font-size: 12px; line-height: 1.5; font-family: var(--font-mono, monospace);
  border: 1px solid var(--el-border-color); border-radius: 6px; padding: 6px;
  background: transparent; color: var(--el-text-color-primary); resize: vertical;
}
.dbg-hint { font-size: 11px; color: var(--el-text-color-secondary); margin-top: 4px; }
.dbg-error { font-size: 12px; color: #a32d2d; background: #fef5f5; padding: 6px 8px; border-radius: 6px; }
.dbg-tip { font-size: 11px; color: var(--el-text-color-secondary); }
</style>
