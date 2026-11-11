<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowRight, Bug, CheckCircle2, ChevronDown, FlaskConical, GitBranch, ShieldCheck, Terminal } from 'lucide-vue-next';
import { api } from '../../api/client';
import SecurityCodeExample from './SecurityCodeExample.vue';

type SecurityCodeVariant = { language: string; bad: string; good: string; note: string };
type SecurityCode = SecurityCodeVariant & { context?: string; variants?: SecurityCodeVariant[] };
type SecurityLab = { target: string; tools: string[]; steps: string[]; expected: string };
type SecurityModule = {
  id: string; title: string; summary: string; useCase?: string; explanation?: string; topics: string[];
  risk: string; control: string; code?: SecurityCode; lab?: SecurityLab;
};
type SecurityPath = {
  id: string; name: string; level: '入门' | '进阶' | '高级'; description: string;
  audience: string; prerequisites: string[]; nextPathIds: string[]; tags: string[]; modules: SecurityModule[];
};

const props = withDefaults(defineProps<{ pathId?: string }>(), { pathId: '' });
const emit = defineEmits<{ 'select-path': [id: string] }>();
const PROGRESS_KEY = 'yz_security_progress_v1';
const paths = ref<SecurityPath[]>([]);
const loading = ref(true);
const error = ref('');
const expandedModule = ref('');
const completed = ref<Record<string, boolean>>({});

function unwrap<T>(r: unknown): T | null {
  if (r && typeof r === 'object' && 'data' in r) return (r as { data: T }).data;
  return null;
}
function restoreProgress() {
  try { completed.value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { completed.value = {}; }
}
function persistProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed.value)); } catch { /* ignore */ }
}
async function loadPaths() {
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get<{ data: SecurityPath[] }>('/learning/security/paths');
    paths.value = unwrap<SecurityPath[]>(r) || [];
    const active = activePath.value;
    expandedModule.value = active?.modules[0]?.id || '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '安全路线加载失败';
  } finally {
    loading.value = false;
  }
}
const activePath = computed(() =>
  paths.value.find((path) => path.id === props.pathId) || paths.value[0] || null,
);
const prerequisites = computed(() => activePath.value
  ? paths.value.filter((path) => activePath.value?.prerequisites.includes(path.id))
  : []);
const nextPaths = computed(() => activePath.value
  ? paths.value.filter((path) => activePath.value?.nextPathIds.includes(path.id))
  : []);
const completedCount = computed(() => activePath.value
  ? activePath.value.modules.filter((mod) => completed.value[mod.id]).length
  : 0);
const progressPct = computed(() => activePath.value
  ? Math.round((completedCount.value / Math.max(1, activePath.value.modules.length)) * 100)
  : 0);
function selectPath(id: string) {
  emit('select-path', id);
  const path = paths.value.find((item) => item.id === id);
  expandedModule.value = path?.modules[0]?.id || '';
}
function toggleModule(id: string) {
  expandedModule.value = expandedModule.value === id ? '' : id;
}
function setCompleted(id: string, value: boolean) {
  completed.value = { ...completed.value, [id]: value };
  persistProgress();
  ElMessage.success(value ? '模块已完成' : '已取消完成');
}

watch(() => props.pathId, () => {
  expandedModule.value = activePath.value?.modules[0]?.id || '';
});
watch(completed, persistProgress, { deep: true });
onMounted(() => {
  restoreProgress();
  void loadPaths();
});
</script>

<template>
  <section class="sec-workbench">
    <div v-if="loading" class="sec-loading">正在加载安全路线…</div>
    <div v-else-if="error" class="sec-error">{{ error }}</div>
    <template v-else-if="activePath">
      <header class="sec-hero">
        <div>
          <p class="sec-eyebrow">网络安全 · 独立科目</p>
          <h2>{{ activePath.name }}</h2>
          <p>{{ activePath.description }}</p>
        </div>
        <div class="sec-progress">
          <div class="sec-progress-ring" :style="{ '--pct': progressPct + '%' }"><b>{{ progressPct }}%</b></div>
          <span>{{ completedCount }} / {{ activePath.modules.length }} 模块</span>
        </div>
      </header>

      <div class="sec-branch-map" aria-label="安全分支路线">
        <button
          v-for="(path, index) in paths" :key="path.id"
          :class="{ active: path.id === activePath.id }"
          @click="selectPath(path.id)"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <b>{{ path.name }}</b>
          <i>{{ path.level }}</i>
          <ArrowRight v-if="index < paths.length - 1" :size="13" />
        </button>
      </div>

      <div class="sec-meta-row">
        <span><GitBranch :size="13" /> 先修：{{ prerequisites.length ? prerequisites.map((p) => p.name).join('、') : '无' }}</span>
        <span><ShieldCheck :size="13" /> 适合：{{ activePath.audience }}</span>
        <span v-for="tag in activePath.tags" :key="tag" class="sec-tag">{{ tag }}</span>
      </div>

      <div class="sec-modules">
        <article v-for="(mod, index) in activePath.modules" :key="mod.id" class="sec-module" :class="{ expanded: expandedModule === mod.id }">
          <header>
            <label class="sec-module-check" title="标记完成" @click.stop>
              <input type="checkbox" :checked="!!completed[mod.id]" @change="setCompleted(mod.id, ($event.target as HTMLInputElement).checked)" />
              <CheckCircle2 :size="16" />
            </label>
            <button class="sec-module-head" @click="toggleModule(mod.id)">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <div><b>{{ mod.title }}</b><p>{{ mod.summary }}</p></div>
              <ChevronDown :size="16" />
            </button>
          </header>

          <div v-if="expandedModule === mod.id" class="sec-module-body">
            <div class="sec-topics">
              <span v-for="topic in mod.topics" :key="topic">{{ topic }}</span>
            </div>
            <div class="sec-context-grid">
              <section><h3>使用案例</h3><p>{{ mod.useCase }}</p></section>
              <section><h3>原理说明</h3><p>{{ mod.explanation }}</p></section>
            </div>
            <div class="sec-risk-grid">
              <section class="attack">
                <h3><Bug :size="14" /> 攻击与风险</h3>
                <p>{{ mod.risk }}</p>
              </section>
              <section class="defense">
                <h3><ShieldCheck :size="14" /> 防御与控制</h3>
                <p>{{ mod.control }}</p>
              </section>
            </div>
            <SecurityCodeExample v-if="mod.code" v-bind="mod.code" />
            <section v-if="mod.lab" class="sec-lab">
              <header><FlaskConical :size="15" /><b>授权靶场实验</b><span>{{ mod.lab.target }}</span></header>
              <div class="sec-lab-tools">
                <Terminal :size="13" />
                <span v-for="tool in mod.lab.tools" :key="tool">{{ tool }}</span>
              </div>
              <ol>
                <li v-for="step in mod.lab.steps" :key="step">{{ step }}</li>
              </ol>
              <p><b>验收：</b>{{ mod.lab.expected }}</p>
            </section>
          </div>
        </article>
      </div>

      <footer v-if="nextPaths.length" class="sec-next">
        <span>完成后进入分支</span>
        <button v-for="path in nextPaths" :key="path.id" @click="selectPath(path.id)">
          {{ path.name }} <ArrowRight :size="14" />
        </button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.sec-workbench { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.sec-loading, .sec-error { min-height: 240px; display: flex; align-items: center; justify-content: center; color: var(--color-text-tertiary); }
.sec-error { color: #b91c1c; }
.sec-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; padding: 16px; }
.sec-eyebrow { margin: 0; color: #0f766e; font-size: 10px; font-weight: 700; letter-spacing: .4px; }
.sec-hero h2 { margin: 3px 0 4px; font-size: 20px; color: var(--color-text); }
.sec-hero p:last-child { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.sec-progress { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--color-text-tertiary); font-size: 10px; flex-shrink: 0; }
.sec-progress-ring { width: 58px; height: 58px; border-radius: 50%; background: conic-gradient(#0f766e var(--pct), #e2e8f0 0); display: grid; place-items: center; }
.sec-progress-ring::before { content: ""; grid-area: 1 / 1; width: 44px; height: 44px; border-radius: 50%; background: #f8fafc; }
.sec-progress-ring b { grid-area: 1 / 1; z-index: 1; color: #0f766e; font-size: 12px; }
.sec-branch-map { display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 5px; }
.sec-branch-map button { position: relative; min-width: 164px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 8px 24px 8px 9px; display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 1px 5px; text-align: left; cursor: pointer; }
.sec-branch-map button > span { grid-row: 1 / 3; align-self: center; color: #94a3b8; font-size: 11px; font-weight: 700; }
.sec-branch-map b { font-size: 11px; color: var(--color-text); white-space: nowrap; }
.sec-branch-map i { font-style: normal; font-size: 9px; color: var(--color-text-tertiary); }
.sec-branch-map button > svg { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); color: var(--color-text-tertiary); }
.sec-branch-map button.active { border-color: #0f766e; background: #ecfdf5; box-shadow: inset 3px 0 0 #0f766e; }
.sec-branch-map button.active > span, .sec-branch-map button.active b { color: #0f766e; }
.sec-meta-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; color: var(--color-text-tertiary); font-size: 10px; }
.sec-meta-row > span { display: inline-flex; align-items: center; gap: 3px; }
.sec-tag { border: 1px solid #99f6e4; border-radius: 999px; background: #f0fdfa; color: #0f766e; padding: 1px 6px; }
.sec-modules { display: flex; flex-direction: column; gap: 8px; }
.sec-module { border: 1px solid var(--color-border); border-radius: 9px; background: var(--glass-bg); overflow: hidden; }
.sec-module.expanded { border-color: #5eead4; }
.sec-module > header { display: flex; align-items: stretch; }
.sec-module-check { width: 42px; display: flex; align-items: center; justify-content: center; color: #94a3b8; cursor: pointer; border-right: 1px solid var(--color-border); }
.sec-module-check input { position: absolute; opacity: 0; pointer-events: none; }
.sec-module-check:has(input:checked) { color: #0f766e; background: #f0fdfa; }
.sec-module-head { flex: 1; display: grid; grid-template-columns: 28px minmax(0, 1fr) 20px; align-items: center; gap: 7px; border: 0; background: transparent; color: var(--color-text); text-align: left; padding: 10px; cursor: pointer; }
.sec-module-head > span { color: #94a3b8; font-size: 11px; font-weight: 700; }
.sec-module-head b { font-size: 13px; }
.sec-module-head p { margin: 2px 0 0; color: var(--color-text-tertiary); font-size: 11px; line-height: 1.5; }
.sec-module-head > svg { transition: transform .15s ease; color: var(--color-text-tertiary); }
.sec-module.expanded .sec-module-head > svg { transform: rotate(180deg); }
.sec-module-body { display: flex; flex-direction: column; gap: 10px; padding: 0 12px 12px 50px; }
.sec-topics { display: flex; gap: 5px; flex-wrap: wrap; }
.sec-topics span { border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #475569; padding: 2px 6px; font-size: 10px; }
.sec-context-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sec-context-grid section { border: 1px solid var(--color-border); border-radius: 7px; background: var(--glass-bg); padding: 8px 9px; }
.sec-context-grid h3 { margin: 0 0 3px; color: var(--color-text); font-size: 11px; }
.sec-context-grid p { margin: 0; color: var(--color-text-secondary); font-size: 11px; line-height: 1.65; }
.sec-risk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sec-risk-grid section { border-left: 3px solid; padding: 8px 9px; background: #f8fafc; }
.sec-risk-grid .attack { border-color: #f59e0b; }
.sec-risk-grid .defense { border-color: #0f766e; }
.sec-risk-grid h3 { display: flex; align-items: center; gap: 5px; margin: 0 0 3px; font-size: 11px; }
.sec-risk-grid p { margin: 0; color: var(--color-text-secondary); font-size: 11px; line-height: 1.6; }
.sec-lab { border: 1px dashed #f59e0b; border-radius: 8px; background: #fffbeb; padding: 9px 10px; }
.sec-lab > header { display: flex; align-items: center; gap: 5px; color: #92400e; }
.sec-lab > header b { font-size: 11px; }
.sec-lab > header span { margin-left: auto; color: #a16207; font-size: 10px; }
.sec-lab-tools { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 6px 0; color: #a16207; }
.sec-lab-tools span { border: 1px solid #fde68a; border-radius: 4px; background: #fff; padding: 1px 5px; font-size: 9px; }
.sec-lab ol { margin: 5px 0 7px; padding-left: 19px; color: #57534e; font-size: 11px; line-height: 1.6; }
.sec-lab > p { margin: 0; color: #92400e; font-size: 10px; line-height: 1.55; }
.sec-next { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--color-border); padding-top: 9px; }
.sec-next > span { color: var(--color-text-tertiary); font-size: 10px; }
.sec-next button { border: 1px solid #99f6e4; border-radius: 6px; background: #f0fdfa; color: #0f766e; padding: 4px 8px; font-size: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
@media (max-width: 900px) {
  .sec-hero { flex-direction: column; }
  .sec-risk-grid { grid-template-columns: 1fr; }
  .sec-context-grid { grid-template-columns: 1fr; }
  .sec-module-body { padding-left: 12px; }
  .sec-lab > header { align-items: flex-start; flex-wrap: wrap; }
  .sec-lab > header span { width: 100%; margin-left: 20px; }
}
</style>
