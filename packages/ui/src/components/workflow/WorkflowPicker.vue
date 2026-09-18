<!--
  WorkflowPicker.vue —— 工作流模式输入框旁的「可用工作流」选择器

  为什么不是「会话智能体下拉」：工作流型智能体没有 system_prompt、没有工具，
  当会话智能体会静默退化成闲聊（不报错、DAG 永不启动）。所以工作流**不进智能体下拉**，
  而是以「挂载为工具」的形式交给工作流助手调用 —— 这个组件就是这个挂载入口。

  挂载 = 把 wf_<agentId> 写进会话 builtin_tool_ids_json，后端拼工具清单时只发这一批，
  模型按工具 schema 强约束传参（比让它自己猜入参稳）。
-->
<template>
  <div class="wfp">
    <el-popover
      v-model:visible="open"
      trigger="click"
      placement="top-start"
      :width="316"
      popper-class="wfp-popper"
    >
      <template #reference>
        <!-- 与 chat.css 的 .agent-trigger 同规格（主色 10% 底 + 主色图标 + 13px/600），
             位置也在输入框上方，保证与本项目其它模式的输入区观感一致。 -->
        <button class="wfp-trigger" type="button" :title="triggerTitle">
          <span class="wfp-avatar"><el-icon :size="14"><Connection /></el-icon></span>
          <span class="wfp-trigger-label">可用工作流</span>
          <span v-if="mountedIds.length" class="wfp-badge">{{ mountedIds.length }}</span>
          <el-icon class="wfp-caret" :size="12"><ArrowDown /></el-icon>
        </button>
      </template>

      <div class="wfp-panel">
        <div class="wfp-head">
          <span>选给助手用（已选 {{ mountedIds.length }}/{{ MAX }}）</span>
          <span v-if="atLimit" class="wfp-warn">已达上限</span>
        </div>
        <input v-model="keyword" class="wfp-search" placeholder="搜索工作流…" />
        <div class="wfp-list">
          <label
            v-for="w in filtered"
            :key="w.id"
            class="wfp-item"
            :class="{ 'is-off': !mountedIds.includes(toolNameOf(w.id)) && atLimit }"
          >
            <input
              type="checkbox"
              :checked="mountedIds.includes(toolNameOf(w.id))"
              :disabled="!mountedIds.includes(toolNameOf(w.id)) && atLimit"
              @change="toggle(w.id)"
            />
            <span class="wfp-item-main">
              <span class="wfp-item-name">{{ w.name }}</span>
              <!-- 描述单行省略；完整内容走原生 title（hover 可见） -->
              <span class="wfp-item-desc" :title="w.description || ''">{{ w.description || `${w.nodeCount} 个节点` }}</span>
            </span>
            <span v-if="w.lastRun" class="wfp-dot" :class="`is-${w.lastRun.status}`"></span>
          </label>
          <div v-if="!filtered.length" class="wfp-empty">暂无工作流</div>
        </div>
        <div class="wfp-foot">
          勾选后助手就能调用它（工具名 wf_&lt;id&gt;）；取消勾选即收回。
          入参由工作流自己声明，助手会按字段名传值。
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Connection, ArrowDown } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useWorkflowStore } from '../../stores/workflow';
import { useChatStore } from '../../stores/chat';
import { MAX_WF_TOOLS_PER_CONVERSATION as MAX } from './workflow-constants';

const wf = useWorkflowStore();
const chat = useChatStore();

const open = ref(false);
const keyword = ref('');

function toolNameOf(agentId: string): string {
  return `wf_${agentId}`;
}

/** 当前会话已挂载的 wf_* 工具 */
const mountedIds = computed<string[]>(() => {
  const conv = chat.conversations.find((c) => c.id === chat.currentConvId);
  const ids: string[] = (conv?.builtinToolIds as string[] | undefined) || [];
  return ids.filter((x) => typeof x === 'string' && x.startsWith('wf_'));
});

const atLimit = computed(() => mountedIds.value.length >= MAX);

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  if (!k) return wf.agents.value;
  return wf.agents.value.filter(
    (a) => a.name.toLowerCase().includes(k) || (a.description || '').toLowerCase().includes(k),
  );
});

const triggerTitle = computed(() =>
  mountedIds.value.length
    ? `已挂载 ${mountedIds.value.length} 个工作流给助手`
    : '选几个工作流给助手用',
);

/**
 * 勾选/取消。
 * 写入会话级 builtinToolIds（与 agent 级挂载合并，见 chat.getMergedMounts）。
 * 上限校验后端也有一道（routes/conversations.ts），这里先拦是给即时反馈。
 */
async function toggle(agentId: string) {
  if (!chat.currentConvId) {
    ElMessage.warning('请先发送一条消息创建会话，再挂载工作流');
    return;
  }
  const name = toolNameOf(agentId);
  const current: string[] = (() => {
    const conv = chat.conversations.find((c) => c.id === chat.currentConvId);
    return ((conv?.builtinToolIds as string[] | undefined) || []).slice();
  })();
  let next: string[];
  if (current.includes(name)) {
    next = current.filter((x) => x !== name);
  } else {
    if (mountedIds.value.length >= MAX) {
      ElMessage.warning(`一次最多挂载 ${MAX} 个工作流（挂太多会让模型难以选择）`);
      return;
    }
    next = [...current, name];
  }
  await chat.updateConversation(chat.currentConvId, { builtinToolIds: next } as any);
  const w = wf.agents.value.find((a) => a.id === agentId);
  ElMessage.success(`${w?.name || agentId} 已${next.includes(name) ? '挂载给助手' : '取消挂载'}`);
}

onMounted(() => {
  if (!wf.agents.value.length) void wf.loadAgents();
});
</script>

<style scoped>
/* 只放**触发器**的样式：它渲染在本组件 DOM 内，scoped 正常生效。
   规格逐项对齐 chat.css 的 .agent-trigger —— 两者同处输入框上方，
   形态不一致会一眼看出是"外挂"的控件。 */
.wfp-trigger {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 3px 8px 3px 4px; border-radius: 8px; cursor: pointer;
  transition: background .15s ease; user-select: none;
  max-width: 200px; min-width: 0; flex-shrink: 1;
  border: none; background: transparent;
  font-family: inherit;
}
.wfp-trigger:hover { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
/* 与 .agent-trigger-avatar / .plus-menu-ic 同一视觉规范：主色 10% 底 + 主色图标 */
.wfp-avatar {
  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}
.wfp-trigger-label {
  font-size: 13px; font-weight: 600; color: var(--color-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wfp-caret { font-size: 12px; color: var(--color-text-secondary); flex-shrink: 0; }
/* 计数：纯文本，**不加填充底色**。
   实心主色徽标在这条轻量工具条上太重（视觉焦点从"可用工作流"跑到数字上），
   与 .agent-trigger 的整条无底色基调也不一致。 */
.wfp-badge {
  flex: none; font-size: 12px; font-weight: 500;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>

<!-- ⚠️ 浮层样式必须**非 scoped**：
     el-popover 的内容被 Teleport 到 body，scoped 的 data-v 属性不会跟过去，
     写在 scoped 里等于没写（现象：列表行高错乱、描述溢出、看起来"没有样式"）。
     用 .wfp-popper 前缀限定作用域，避免污染其它页面。 -->
<style>
.wfp-popper .wfp-panel { display: flex; flex-direction: column; gap: 8px; }
.wfp-popper .wfp-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.wfp-popper .wfp-warn { color: #854f0b; }
.wfp-popper .wfp-search {
  padding: 4px 8px; font-size: 12px; border-radius: 6px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank, transparent);
  color: var(--el-text-color-primary);
}
.wfp-popper .wfp-search:focus { outline: none; border-color: var(--el-color-primary); }
.wfp-popper .wfp-list { max-height: 260px; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.wfp-popper .wfp-item {
  display: flex; align-items: center; gap: 8px;
  /* 限宽：描述长短差异大，交给内容撑会让浮层忽宽忽窄 */
  width: 300px; box-sizing: border-box; min-width: 0;
  padding: 6px 8px; border-radius: 8px; cursor: pointer;
}
.wfp-popper .wfp-item:hover { background: var(--el-fill-color-light); }
.wfp-popper .wfp-item.is-off { opacity: 0.5; cursor: not-allowed; }
/* min-width:0 是省略号生效的前提 */
.wfp-popper .wfp-item-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.wfp-popper .wfp-item-name {
  font-size: 13px; color: var(--color-text, var(--el-text-color-primary));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wfp-popper .wfp-item-desc {
  font-size: 11px; color: var(--el-text-color-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wfp-popper .wfp-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--el-text-color-secondary); }
.wfp-popper .wfp-dot.is-completed { background: #67c23a; }
.wfp-popper .wfp-dot.is-failed { background: #f56c6c; }
.wfp-popper .wfp-empty { font-size: 12px; color: var(--el-text-color-placeholder); padding: 8px; }
.wfp-popper .wfp-foot {
  font-size: 11px; color: var(--el-text-color-secondary); line-height: 1.6;
  border-top: 1px solid var(--el-border-color-lighter); padding-top: 8px;
}
</style>