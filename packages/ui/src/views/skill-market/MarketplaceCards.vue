<template>
  <div class="mp-home">
    <MarketplaceShell title="Skill 商店" subtitle="浏览本地与远程 Skill 商城">
      <div class="mp-card-grid">
        <MarketplaceCard variant="local" @click="$router.push('/skills/local')">
          <template #icon><el-icon :size="28"><Files /></el-icon></template>
          <template #title>本地商城</template>
          <template #description>内置 Skill · 自定义 Skill</template>
          <template #meta>{{ localCount }} 个 Skill</template>
          <template #actions><el-icon><ArrowRight /></el-icon></template>
        </MarketplaceCard>

        <MarketplaceCard
          v-for="s in remoteSources"
          :key="s.id"
          variant="remote"
          @click="$router.push('/skills/remote-' + s.id)"
        >
          <template #icon><el-icon :size="28"><Monitor /></el-icon></template>
          <template #title>{{ s.name }}</template>
          <template #description>{{ s.base_url }}</template>
          <template #meta>远程商城</template>
          <template #actions>
            <el-button size="small" circle @click="testSource(s.id)"><el-icon><Link /></el-icon></el-button>
            <el-button size="small" circle type="danger" @click="delSource(s.id)"><el-icon><Delete /></el-icon></el-button>
          </template>
        </MarketplaceCard>

        <MarketplaceCard variant="add" @click="showAdd = true">
          <template #icon><el-icon :size="28"><Plus /></el-icon></template>
          <template #title>添加远程商城</template>
          <template #description>连接远程 Skill 源</template>
        </MarketplaceCard>
      </div>
    </MarketplaceShell>

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
import MarketplaceShell from '../../components/marketplace/MarketplaceShell.vue';
import MarketplaceCard from '../../components/marketplace/MarketplaceCard.vue';
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
.mp-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 16px; }

@media (max-width: 767px) {
  .mp-home { padding: 0 !important; width: 100%; }
  .mp-card-grid { grid-template-columns: minmax(0, 1fr) !important; gap: 12px; width: 100%; }
}

</style>
