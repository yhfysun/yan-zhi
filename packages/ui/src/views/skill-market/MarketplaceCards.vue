<template>
  <div class="mp-home">
    <div class="mp-header">
      <h2 class="mp-title">Skill 商店</h2>
    </div>

    <div class="mp-card-grid">
      <!-- 本地商城卡片（置顶、强调色） -->
      <div class="market-card local-card" @click="$router.push('/skills/local')">
        <div class="card-icon-wrap">
          <el-icon :size="28"><Files /></el-icon>
        </div>
        <div class="card-body">
          <div class="card-name">本地商城</div>
          <div class="card-desc">内置 Skill · 自定义 Skill</div>
          <div class="card-meta">{{ localCount }} 个 Skill</div>
        </div>
        <div class="card-arrow"><el-icon><ArrowRight /></el-icon></div>
      </div>

      <!-- 远程商城卡片 -->
      <div v-for="s in remoteSources" :key="s.id" class="market-card remote-card" @click="$router.push('/skills/remote-' + s.id)">
        <div class="card-icon-wrap remote">
          <el-icon :size="28"><Monitor /></el-icon>
        </div>
        <div class="card-body">
          <div class="card-name">{{ s.name }}</div>
          <div class="card-url">{{ s.base_url }}</div>
          <div class="card-meta">远程商城</div>
        </div>
        <div class="card-ops" @click.stop>
          <el-button size="small" circle @click="testSource(s.id)"><el-icon><Link /></el-icon></el-button>
          <el-button size="small" circle type="danger" @click="delSource(s.id)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </div>

      <!-- 添加远程商城卡片（虚线、+） -->
      <div class="market-card add-card" @click="showAdd = true">
        <div class="card-icon-wrap add">
          <el-icon :size="28"><Plus /></el-icon>
        </div>
        <div class="card-body">
          <div class="card-name">添加远程商城</div>
          <div class="card-desc">连接远程 Skill 源</div>
        </div>
      </div>
    </div>

    <!-- 添加远程商城弹窗 -->
    <el-dialog v-model="showAdd" title="添加远程 Skill 商城" width="460px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="如: 官方Skill源" /></el-form-item>
        <el-form-item label="URL"><el-input v-model="form.baseUrl" placeholder="http://192.168.1.100:3001" /></el-form-item>
        <el-form-item label="认证">
          <el-select v-model="form.authType" style="width:100%">
            <el-option label="无认证" value="none" />
            <el-option label="Bearer Token" value="bearer" />
            <el-option label="API Key" value="api-key" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.authType !== 'none'" label="凭证">
          <el-input v-model="form.authValue" :placeholder="form.authType === 'bearer' ? 'Token' : 'API Key'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="addSource">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Files, ArrowRight, Monitor, Link, Delete, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useSkillStore } from '../../stores';
import { api } from '../../api/client';

const store = useSkillStore();
const showAdd = ref(false);
const remoteSources = ref<any[]>([]);
const form = ref({ name: '', baseUrl: '', authType: 'none' as string, authValue: '' });

const localCount = computed(() => store.skills.length);

async function loadRemoteSources() {
  try { const r = await api.get<any[]>('/skill-marketplace'); remoteSources.value = (r as any).data || []; } catch {}
}

async function addSource() {
  if (!form.value.name || !form.value.baseUrl) { ElMessage.warning('名称和 URL 为必填项'); return; }
  const authConfig: any = {};
  if (form.value.authType === 'bearer') authConfig.token = form.value.authValue;
  else if (form.value.authType === 'api-key') authConfig.apiKey = form.value.authValue;
  await api.post('/skill-marketplace', { name: form.value.name, baseUrl: form.value.baseUrl, authType: form.value.authType, authConfig });
  showAdd.value = false;
  form.value = { name: '', baseUrl: '', authType: 'none', authValue: '' };
  await loadRemoteSources(); ElMessage.success('已添加');
}

async function testSource(id: string) {
  const r = await api.post<any>(`/skill-marketplace/${id}/test`);
  const payload: any = (r as any).error ? { ok: false, error: (r as any).error } : ((r as any).data ?? r);
  ElMessage[payload.ok ? 'success' : 'error'](payload.ok ? '连接成功' : (payload.error || '连接失败'));
}

async function delSource(id: string) {
  try { await ElMessageBox.confirm('删除该远程源？', '提示', { type: 'warning' }); await api.delete(`/skill-marketplace/${id}`); await loadRemoteSources(); ElMessage.success('已删除'); } catch {}
}

onMounted(() => { store.loadSkills(); loadRemoteSources(); });
</script>

<style scoped>
.mp-home { padding: 24px; }
.mp-header { margin-bottom: 24px; }
.mp-title { font-size: 22px; font-weight: 700; margin: 0; }

.mp-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 16px; }

.market-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  min-width: 0;
  max-width: 100%;
}
.market-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.06); }

.local-card { border-color: rgba(124, 58, 237, 0.3); }
.local-card:hover { border-color: rgba(124, 58, 237, 0.5); box-shadow: 0 4px 20px rgba(124, 58, 237, 0.1); }

.card-icon-wrap {
  width: 52px; height: 52px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(124, 58, 237, 0.1); color: #7c3aed;
  flex-shrink: 0;
}
.card-icon-wrap.remote { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.card-icon-wrap.add { background: rgba(148, 163, 184, 0.1); color: #94a3b8; }

.card-body { flex: 1; min-width: 0; }
.card-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.card-desc { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 4px; }
.card-url {
  font-size: 12px; font-family: "JetBrains Mono", monospace;
  color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-bottom: 4px;
}
.card-meta { font-size: 12px; color: var(--color-text-secondary); opacity: 0.8; }

.card-arrow { color: var(--color-text-secondary); flex-shrink: 0; }

.card-ops { display: flex; gap: 4px; flex-shrink: 0; }

.add-card { background: var(--el-fill-color-light); }
.add-card:hover { border-color: var(--color-primary); background: var(--el-fill-color-blank); }

@media (max-width: 767px) {
  .mp-home { padding: 0 !important; width: 100%; }
  .mp-header { display: none; }
  .mp-title { font-size: 20px; }
  .mp-card-grid { grid-template-columns: minmax(0, 1fr) !important; gap: 12px; width: 100%; }
  .market-card { width: 100%; max-width: 100%; box-sizing: border-box; padding: 16px; }
}

</style>
