<template>
  <div class="remote-market">
    <header class="rm-header">
      <div class="rm-header-left">
        <el-button text @click="$router.push('/skills')"><el-icon><ArrowLeft /></el-icon> 商城首页</el-button>
        <h2 class="rm-title">{{ sourceName }}</h2>
      </div>
      <div class="rm-header-right">
        <el-input v-model="search" placeholder="搜索 Skill" style="width: 200px" clearable />
      </div>
    </header>

    <div v-if="loading" style="text-align:center;padding:60px 0">
      <el-icon class="loading-icon" :size="32"><Loading /></el-icon>
      <p>正在加载远程 Skill...</p>
    </div>

    <div v-else-if="items.length === 0" style="padding:60px 0;text-align:center;color:var(--color-text-secondary)">
      <el-empty description="该远程商城暂无 Skill" />
    </div>

    <div v-else class="skill-grid">
      <div v-for="item in filteredItems" :key="item.id" class="skill-card">
        <div class="card-top">
          <div class="card-icon"><el-icon :size="24"><Files /></el-icon></div>
          <div class="card-name" :title="item.name">{{ item.name }}</div>
          <el-tag v-if="item.category" size="small" type="info" effect="plain" class="card-tag">{{ item.category }}</el-tag>
        </div>
        <div class="card-bar">
          <span class="card-desc" :title="item.description">{{ item.description || '无描述' }}</span>
          <el-tooltip :content="isInstalled(item.name) ? '已安装' : '安装到本地'" placement="top">
            <el-button size="small" type="primary" circle :disabled="isInstalled(item.name)" @click="installRemote(item.id)">
              <el-icon :size="14"><Download /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
      <el-empty v-if="filteredItems.length === 0" description="无匹配 Skill" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Files, ArrowLeft, Loading, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useSkillStore } from '../../stores';
import { api } from '../../api/client';

const props = defineProps<{ sourceId: string }>();
const store = useSkillStore();

const search = ref('');
const loading = ref(false);
const items = ref<any[]>([]);
const sourceName = ref('远程商城');

onMounted(async () => {
  await store.loadSkills();
  loading.value = true;
  try {
    const r = await api.get<any>(`/skill-marketplace/${props.sourceId}/skills`);
    items.value = (r as any)?.data?.items || [];
    const rs = await api.get<any[]>('/skill-marketplace');
    if ('data' in rs) {
      const found = (rs.data as any[]).find((s: any) => s.id === props.sourceId);
      if (found) sourceName.value = found.name;
    }
  } catch {
    ElMessage.error('获取远程 Skill 列表失败');
  } finally {
    loading.value = false;
  }
});

const filteredItems = computed(() => {
  if (!search.value) return items.value;
  const q = search.value.toLowerCase();
  return items.value.filter((s: any) =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q)
  );
});

function isInstalled(name: string) {
  return store.skills.some(s => s.name === name);
}

async function installRemote(skillId: string) {
  try {
    await api.post(`/skill-marketplace/${props.sourceId}/install`, { skillId });
    await store.loadSkills();
    ElMessage.success('已安装到本地');
  } catch {
    ElMessage.error('安装失败');
  }
}
</script>

<style scoped>
.remote-market { padding: 24px; }

.rm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.rm-header-left { display: flex; align-items: center; gap: 12px; }
.rm-header-right { display: flex; align-items: center; gap: 8px; }
.rm-title { font-size: 20px; font-weight: 600; margin: 0; }

.loading-icon { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 12px; }
.skill-card {
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-radius: var(--radius-md);
  padding: 16px;
  transition: all 0.2s;
  min-width: 0;
  max-width: 100%;
}
.skill-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.06); border-color: rgba(59,130,246,0.2); }

.card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.card-icon { color: var(--color-primary); flex-shrink: 0; }
.card-name {
  font-weight: 600; font-size: 14px; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.card-bar { display: flex; align-items: center; gap: 8px; }
.card-desc {
  font-size: 12px; color: var(--color-text-secondary); flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.card-tag { flex-shrink: 0; }
.skill-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }

@media (max-width: 767px) {
  .remote-market { padding: 0 !important; width: 100%; }
  .rm-header { flex-direction: column; align-items: stretch; gap: 10px; padding: 14px; }
  .rm-header-right { width: 100%; }
  .rm-header-right .el-input { width: 100% !important; }
  .rm-title { font-size: 18px; }
  .skill-grid { grid-template-columns: minmax(0, 1fr) !important; gap: 10px; width: 100%; padding: 0 14px 14px; box-sizing: border-box; }
  .skill-card { width: 100%; max-width: 100%; box-sizing: border-box; }
}

</style>
