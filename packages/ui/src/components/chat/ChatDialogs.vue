<template>
  <el-dialog v-model="snapshotDialog" title="查看提示词" width="780px" class="snapshot-dialog">
    <el-tabs v-model="snapshotActiveTab" type="card">
      <el-tab-pane v-for="s in currentSnapshots" :key="s.id" :label="s.label" :name="s.id">
        <pre class="snapshot-body">{{ s.content }}</pre>
      </el-tab-pane>
    </el-tabs>
    <el-empty v-if="currentSnapshots.length === 0" description="没有找到提示词数据" :image-size="80" />
  </el-dialog>

  <AgentEditDialog v-model="showAgentEdit" :agent="editingAgent" @saved="onAgentSaved" @deleted="onAgentDeleted" />

  <WorkspaceDirDialog v-model="showWorkspaceDir" :current-path="workspaceDir" @selected="onWorkspaceDirSelected" />

  <el-dialog

    v-model="platformConfigDialogVisible"
    :title="platformConfigEditId ? '编辑模型平台' : '配置模型平台'"
    width="560px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="platform-config-dialog"
    @close="onPlatformConfigClose"
  >
    <el-form label-width="96px" class="platform-config-form">
      <el-form-item label="平台名称">
        <el-input v-model="platformConfigForm.name" placeholder="如：OpenAI / DeepSeek" />
      </el-form-item>
      <el-form-item label="协议">
        <!-- 目录厂商平台（preset）：协议/API URL 是厂商文档常量，编辑态只读 -->
        <el-select v-model="platformConfigForm.protocol" :disabled="presetLocked">
          <el-option label="OpenAI" value="openai" />
          <el-option label="Anthropic" value="anthropic" />
          <el-option label="自定义" value="custom" />
        </el-select>
      </el-form-item>
      <el-form-item label="API URL">
        <el-input v-model="platformConfigForm.apiUrl" :disabled="presetLocked" placeholder="https://api.openai.com" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="platformConfigForm.apiKey" type="password" show-password :placeholder="platformConfigEditId ? '留空则不修改' : 'sk-...'" />
      </el-form-item>
      <template v-if="!platformConfigEditId">
        <el-form-item label="模型 ID">
          <el-input v-model="platformConfigForm.modelId" :placeholder="cfgFetched.length ? '可从拉取列表勾选，或手动填写' : '如：gpt-4o-mini / deepseek-chat'" />
        </el-form-item>
        <el-form-item label="模型别名">
          <el-input v-model="platformConfigForm.alias" placeholder="可选，展示在模型列表中的名称" />
        </el-form-item>
        <el-form-item label="上下文窗口">
          <el-input-number v-model="platformConfigForm.contextWindow" :min="1024" :max="1000000" :step="1024" />
        </el-form-item>
      </template>
    </el-form>

    <!-- 测试连接 / 拉取模型：与「模型平台」页同一套口径（2026-10-18 用户实报「拉取模型的怎么没了」） -->
    <StatusActionBar :status="cfgStatus" :status-type="cfgStatusType">
      <el-button :loading="cfgTesting" :icon="Connection" @click="cfgTest">测试连接</el-button>
      <!-- 新增态：预拉远程列表勾选带入；编辑态：直接全量同步（去重安全） -->
      <el-button v-if="!platformConfigEditId" :loading="cfgFetching" :icon="Download" @click="cfgFetch">拉取模型列表</el-button>
      <el-button v-else :loading="cfgSyncing" :icon="Download" @click="cfgSync">拉取远程模型</el-button>
    </StatusActionBar>

    <!-- 新增态拉取结果：勾选后随保存一起创建（不勾 = 回退手填的模型 ID） -->
    <div v-if="!platformConfigEditId && cfgFetched.length > 0" class="cfg-fetched">
      <el-checkbox
        :model-value="cfgCheckedIds.length > 0 && cfgCheckedIds.length === cfgFetched.length"
        :indeterminate="cfgCheckedIds.length > 0 && cfgCheckedIds.length < cfgFetched.length"
        @change="cfgCheckAll"
      >全选（{{ cfgCheckedIds.length }}/{{ cfgFetched.length }}）</el-checkbox>
      <el-checkbox-group v-model="cfgCheckedIds" class="cfg-fetched-list">
        <el-checkbox v-for="m in cfgFetched" :key="m.id" :value="m.id">
          <span class="cfg-fetched-id">{{ m.id }}</span>
        </el-checkbox>
      </el-checkbox-group>
    </div>

    <template #footer>
      <el-button @click="onPlatformConfigCancel">取消</el-button>
      <el-button type="primary" :loading="platformConfigSaving" @click="onPlatformConfigSubmit(cfgCheckedIds)">{{ platformConfigEditId ? '保存' : '保存并创建' }}</el-button>
    </template>
  </el-dialog>

  <DistillDialog v-model:visible="showDistill" :messages="distillMessages" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Connection, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useChat } from '../../composables/chat/useChat';
import { usePlatformStore } from '../../stores';
import StatusActionBar from '../common/StatusActionBar.vue';
import AgentEditDialog from '../AgentEditDialog.vue';
import WorkspaceDirDialog from '../WorkspaceDirDialog.vue';
import DistillDialog from '../DistillDialog.vue';

const {
  snapshotDialog, snapshotActiveTab, currentSnapshots, showAgentEdit, editingAgent, onAgentSaved,
  onAgentDeleted, showWorkspaceDir, workspaceDir, onWorkspaceDirSelected,
  store, platformConfigDialogVisible, platformConfigEditId, platformConfigForm, platformConfigSaving,
  onPlatformConfigCancel, onPlatformConfigSubmit, onPlatformConfigClose, showDistill, distillMessages,
} = useChat();

const platformStore = usePlatformStore();

// ── 测试连接 / 拉取模型（口径与 Models.vue 同源：store.testPlatformConfig / fetchModelsPreview / fetchRemoteModels） ──
/** 编辑目录厂商平台（preset）：协议/API URL 只读（厂商文档常量，服务端同样拦截） */
const presetLocked = computed(() => {
  const p = platformStore.platforms.find((x) => x.id === platformConfigEditId.value);
  return !!p?.isBuiltin && !!p?.presetKey;
});

const cfgTesting = ref(false);
const cfgStatus = ref('');
const cfgStatusType = ref<'ok' | 'err'>('ok');
const cfgFetching = ref(false);
const cfgSyncing = ref(false);
const cfgFetched = ref<Array<{ id: string; type?: string }>>([]);
const cfgCheckedIds = ref<string[]>([]);

async function cfgTest() {
  const f = platformConfigForm.value;
  if (!f.apiUrl.trim()) { ElMessage.warning('请先填写 API URL'); return; }
  cfgTesting.value = true;
  cfgStatus.value = '';
  try {
    // 编辑态无明文 Key：带 platformId 让后端回退 Token 池轮换（与 Models.vue 同口径）
    const r = await platformStore.testPlatformConfig({
      apiUrl: f.apiUrl.trim(), apiKey: f.apiKey.trim(), platformId: platformConfigEditId.value || undefined,
    });
    cfgStatus.value = r.ok ? `${r.msg}（${r.durationMs}ms）` : r.msg;
    cfgStatusType.value = r.ok ? 'ok' : 'err';
    if (r.ok) ElMessage.success(r.msg); else ElMessage.error(r.msg);
  } finally {
    cfgTesting.value = false;
  }
}

async function cfgFetch() {
  const f = platformConfigForm.value;
  if (!f.apiUrl.trim()) { ElMessage.warning('请先填写 API URL'); return; }
  cfgFetching.value = true;
  cfgStatus.value = '';
  cfgFetched.value = [];
  cfgCheckedIds.value = [];
  try {
    const r = await platformStore.fetchModelsPreview({ apiUrl: f.apiUrl.trim(), apiKey: f.apiKey.trim() });
    if (r.ok) {
      cfgFetched.value = r.models;
      cfgCheckedIds.value = r.models.map((m: { id: string }) => m.id);
      cfgStatus.value = r.msg;
      cfgStatusType.value = 'ok';
      ElMessage.success(`拉取到 ${r.models.length} 个模型`);
    } else {
      cfgStatus.value = r.msg;
      cfgStatusType.value = 'err';
      ElMessage.error(r.msg);
    }
  } finally {
    cfgFetching.value = false;
  }
}

/** 编辑态：全量同步远程模型（fetchRemoteModels 去重安全：同名启用、新增入库、多余隐藏） */
async function cfgSync() {
  const id = platformConfigEditId.value;
  if (!id) return;
  cfgSyncing.value = true;
  cfgStatus.value = '';
  try {
    const ids = await platformStore.fetchRemoteModels(id);
    cfgStatus.value = `已同步 ${ids.length} 个远程模型`;
    cfgStatusType.value = 'ok';
    ElMessage.success(`已同步 ${ids.length} 个远程模型`);
  } catch (e: any) {
    cfgStatus.value = '拉取失败: ' + (e?.message || e);
    cfgStatusType.value = 'err';
    ElMessage.error('拉取失败: ' + (e?.message || e));
  } finally {
    cfgSyncing.value = false;
  }
}

function cfgCheckAll(v: any) {
  cfgCheckedIds.value = v ? cfgFetched.value.map((m) => m.id) : [];
}
</script>

<style scoped>
.cfg-fetched {
  margin-top: 8px;
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  padding: 8px 12px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--color-bg-secondary);
}
.cfg-fetched-list { display: flex; flex-direction: column; gap: 2px; }
.cfg-fetched-id { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 12px; }
</style>
