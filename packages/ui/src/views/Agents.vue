<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">智能体编排</h2>
        <p class="page-sub">用工作流画布串联 LLM、工具与代码节点，构建可复用的智能体</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="createAgent">新建智能体</el-button>
    </header>

    <div v-loading="loading" class="agent-grid">
      <template v-if="loading">
        <el-skeleton v-for="n in 4" :key="n" animated style="padding:16px">
          <template #template><el-skeleton-item variant="text" style="width:60%" /><el-skeleton-item variant="text" style="width:40%" /><el-skeleton-item variant="rect" style="height:40px;margin-top:8px" /></template>
        </el-skeleton>
      </template>
      <el-card
        v-for="agent in store.agents"
        :key="agent.id"
        class="agent-card"
        :class="{ 'is-default': agent.isDefault }"
        shadow="hover"
      >
        <div class="agent-card-head" @click="openCanvas(agent.id)">
          <div class="agent-avatar">{{ (agent.name || '?').slice(0, 2) }}</div>
          <div class="agent-info">
            <div class="agent-name">
              <el-icon v-if="agent.isDefault" class="lock-icon"><Lock /></el-icon>
              {{ agent.name }}
            </div>
            <div class="agent-desc">{{ agent.description || '暂无描述' }}</div>
          </div>
        </div>
        <div class="agent-meta">
          <el-tag size="small" type="info">{{ agent.workflow.nodes.length }} 节点</el-tag>
          <el-tag size="small" type="info">{{ agent.workflow.edges.length }} 连线</el-tag>
          <span class="agent-time">{{ formatTime(agent.updatedAt) }}</span>
        </div>
        <div class="agent-actions" @click.stop>
          <el-button text size="small" :icon="EditPen" @click="editAgent(agent)">编辑</el-button>
          <el-button text size="small" :icon="Setting" @click="openCanvas(agent.id)">设计</el-button>
          <el-button v-if="!agent.isDefault" text size="small" type="danger" :icon="Delete" @click="remove(agent)">删除</el-button>
        </div>
      </el-card>
    </div>

    <el-empty v-if="!loading && store.agents.length === 0" description="还没有智能体，点击右上角新建">
      <el-button type="primary" :icon="Plus" @click="createAgent">立即创建</el-button>
    </el-empty>

    <AgentEditDialog v-model="showEdit" :agent="editing" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, EditPen, Delete, Setting, Lock } from '@element-plus/icons-vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useAgentStore } from '../stores/agent';
import type { Agent } from '@ai-assistant/shared';
import AgentEditDialog from '../components/AgentEditDialog.vue';

const router = useRouter();
const store = useAgentStore();

const loading = ref(false);
const showEdit = ref(false);
const editing = ref<Agent | null>(null);

onMounted(async () => {
  loading.value = true;
  try {
    await store.loadAgents();
  } finally {
    loading.value = false;
  }
});

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openCanvas(id: string) {
  router.push(`/agents/${id}`);
}

function createAgent() {
  editing.value = null;
  showEdit.value = true;
}

function editAgent(agent: Agent) {
  editing.value = agent;
  showEdit.value = true;
}

function onSaved(_id: string) {
  showEdit.value = false;
}

function onDeleted(_id: string) {
  showEdit.value = false;
}

async function remove(agent: Agent) {
  await ElMessageBox.confirm(`确定删除智能体「${agent.name}」？此操作不可恢复。`, '确认删除', {
    type: 'warning',
  });
  await store.deleteAgent(agent.id);
  ElMessage.success('已删除');
}
</script>

<style scoped>
.page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
.page-title { font-size: 20px; font-weight: 600; margin: 0; }
.page-sub { font-size: 13px; color: var(--color-text-secondary); margin: 6px 0 0; }
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.agent-card { background: var(--glass-bg); backdrop-filter: var(--glass-filter); transition: transform 0.2s, box-shadow 0.2s; }
.agent-card:hover { transform: translateY(-2px); }
.agent-card.is-default { border: 1.5px solid rgba(59,130,246,0.3); }
.agent-card-head { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; }
.agent-avatar {
  width: 48px; height: 48px; border-radius: 12px;
  background: linear-gradient(135deg, #8B5CF6, #6366F1);
  color: white; display: flex; align-items: center; justify-content: center;
  font-weight: 700; flex-shrink: 0;
}
.agent-info { flex: 1; min-width: 0; }
.agent-name {
  font-weight: 600; font-size: 15px;
  display: flex; align-items: center; gap: 4px;
}
.agent-name .lock-icon { font-size: 12px; color: var(--color-text-secondary); }
.agent-desc { font-size: 12px; color: var(--color-text-secondary); margin: 4px 0 0; line-height: 1.4; }
.agent-meta { display: flex; align-items: center; gap: 6px; margin: 12px 0 8px; flex-wrap: wrap; }
.agent-time { font-size: 11px; color: var(--color-text-secondary); margin-left: auto; }
.agent-actions { display: flex; gap: 4px; border-top: 1px solid var(--color-border-light); padding-top: 8px; }
</style>
