<!--
  页面指令管理（P1 列表/编辑 + P2 脚本型与执行记录）。

  一条指令 = 站点匹配 + 内容；内容有两种：
    · 任务描述（kind='task'）：命中后由页面对话面板发进会话，由模型在这一页上执行；
    · 脚本（kind='script'，P2）：命中后**在这一页里直接跑 JS**，结果回填面板。
      ★ 脚本默认**每次执行都要确认**（用户拍板口径）；要免确认必须两件事同时成立：
        ① 浏览器设置里打开「允许信任脚本指令」（显式开关，默认关）；
        ② 这条指令被标了「信任」。内置/导入来源的脚本永远不允许免确认
        （内容随版本变，用户信任的是当时那段脚本）。
      ★ 每次脚本执行都会落审计（只记元信息：谁/何时/哪个页/成没成/耗时/结果摘要，不存页面内容）。

  内置指令（source=builtin）：内容随版本走，只能停用不能改/删。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="640px"
    class="el-dialog--sm"
    append-to-body
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
  >
    <!-- ===== 执行记录（审计）===== -->
    <template v-if="view === 'runs'">
      <div class="pc-list-head">
        <span class="pc-list-sub">
          {{ runsFor ? `「${runsFor}」的执行记录` : '全部执行记录' }}（{{ runsWarning ? 0 : runs.length }} 条）
        </span>
        <el-button size="small" @click="view = 'list'">返回</el-button>
      </div>
      <div v-if="runsWarning" class="pc-warning">⚠️ {{ runsWarning }}</div>
      <div v-else-if="!runs.length" class="pc-empty">还没有执行记录</div>
      <div v-for="r in runs" :key="r.id" class="pc-run" :class="{ 'is-fail': r.status !== 'ok' }">
        <div class="pc-run-head">
          <span class="pc-run-name">{{ r.command_name || r.command_id }}</span>
          <el-tag size="small" :type="r.status === 'ok' ? 'success' : 'danger'" effect="plain">
            {{ r.status === 'ok' ? '成功' : (r.status === 'aborted' ? '已中止' : '失败') }}
          </el-tag>
          <span class="pc-run-time">{{ formatTime(r.started_at) }}</span>
          <span class="pc-run-dur" v-if="r.duration_ms != null">{{ r.duration_ms }}ms</span>
        </div>
        <div class="pc-run-sub">{{ r.host || r.url || '(未知页面)' }}</div>
        <div class="pc-run-sub" v-if="r.result_digest">结果摘要：{{ r.result_digest }}</div>
        <div class="pc-run-err" v-if="r.error">错误：{{ r.error }}</div>
      </div>
    </template>

    <!-- ===== 编辑/新建 ===== -->
    <template v-else-if="form">
      <el-form label-width="96px" label-position="left">
        <el-form-item label="类型">
          <el-radio-group v-model="form.kind" :disabled="editing">
            <el-radio value="task">任务描述</el-radio>
            <el-radio value="script">脚本</el-radio>
          </el-radio-group>
          <div class="pc-var-hint">任务描述交给模型在这一页上做；脚本直接在这一页里执行（适合批量取数 / 循环检查）。</div>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" maxlength="60" placeholder="如：提取本页表格" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" maxlength="200" placeholder="一行说明（鼠标悬停时展示）" />
        </el-form-item>
        <el-form-item :label="form.kind === 'script' ? '脚本' : '指令内容'">
          <el-input
            v-model="form.body" type="textarea" :rows="form.kind === 'script' ? 8 : 5"
            :maxlength="form.kind === 'script' ? 64000 : 4000" show-word-limit
            :class="{ 'pc-mono': form.kind === 'script' }"
            :placeholder="form.kind === 'script'
              ? 'JS：可写语句并 return 结果，例如 return Array.from(document.querySelectorAll(\'a[href]\')).map(a => a.href)'
              : '要 AI 在这一页做什么，例如：把这一页的主表格结构化成 markdown 表格输出'"
          />
          <div class="pc-var-hint">
            可用变量：<code>${url}</code> <code>${title}</code> <code>${host}</code> <code>${selection}</code>
            <code>${input:提示}</code>（运行前弹框问你一次）
            <template v-if="form.kind === 'script'">；脚本里另有只读对象 <code>ctx</code>（同这四个值，已 Object.freeze）</template>
          </div>
        </el-form-item>
        <el-form-item label="站点匹配">
          <el-input v-model="form.match_host" placeholder="* = 所有站点；或 example.com / *.example.com" />
        </el-form-item>
        <el-form-item label="URL 正则">
          <el-input v-model="form.match_url" placeholder="可留空。填了就只按它匹配（优先于站点匹配）" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item v-if="form.kind === 'script'" label="信任">
          <el-switch v-model="form.trust" :disabled="!trustAllowed || editingIsBuiltin" @change="onTrustChange" />
          <div class="pc-var-hint">
            <template v-if="editingIsBuiltin">内置脚本指令永远每次确认（内容随版本更新，信任的应是当时那段脚本）。</template>
            <template v-else-if="!trustAllowed">需先在「浏览器设置」里打开「允许信任脚本指令」，才能给单条指令免确认。</template>
            <template v-else>打开后这条指令执行时不再弹确认 —— 只在你确定它内容不会变时使用。</template>
          </div>
        </el-form-item>
      </el-form>
      <div class="pc-form-tip" v-if="editing && editingIsBuiltin">内置指令的内容随版本更新，不能编辑；如需去掉，把它停用即可。</div>
      <div class="pc-form-tip" v-else-if="form.kind === 'script' && !editing">
        新建的脚本指令默认「每次执行都要确认」；内置/导入来源的脚本永远如此，不能改。
      </div>
    </template>

    <!-- ===== 列表 ===== -->
    <template v-else>
      <div class="pc-list-head">
        <span class="pc-list-sub">
          共 {{ store.list.length }} 条<span v-if="url">，当前页命中 {{ matchedIds.size }} 条</span>
        </span>
        <span>
          <el-button size="small" @click="openRuns()">执行记录</el-button>
          <el-button size="small" type="primary" @click="openCreate">新建指令</el-button>
        </span>
      </div>
      <div v-if="store.warning" class="pc-warning">⚠️ {{ store.warning }}</div>
      <div v-if="!store.list.length" class="pc-empty">
        {{ store.loading ? '加载中…' : '还没有任何指令，点右上「新建指令」建一条' }}
      </div>
      <div v-for="c in store.list" :key="c.id" class="pc-row" :class="{ 'is-hit': matchedIds.has(c.id) }">
        <div class="pc-row-main">
          <div class="pc-row-title">
            <span class="pc-name">{{ c.name }}</span>
            <el-tag v-if="c.kind === 'script'" size="small" type="warning" effect="plain">脚本</el-tag>
            <el-tag v-if="c.kind === 'script' && !needsConfirm(c)" size="small" type="danger" effect="plain">已信任 · 免确认</el-tag>
            <el-tag v-if="isBuiltin(c)" size="small" type="info" effect="plain">内置</el-tag>
            <el-tag v-if="matchedIds.has(c.id)" size="small" effect="plain">当前页命中</el-tag>
          </div>
          <div class="pc-row-desc">{{ c.description || c.body }}</div>
          <div class="pc-row-match">匹配：{{ matchLabel(c) }}</div>
        </div>
        <div class="pc-row-ops">
          <el-switch
            :model-value="enabledOf(c)" size="small"
            @update:model-value="(v: any) => onToggle(c, !!v)"
          />
          <el-button size="small" text @click="openRuns(c)">记录</el-button>
          <el-button
            size="small" text :disabled="isBuiltin(c)"
            :title="isBuiltin(c) ? '内置指令不可编辑（内容随版本更新）' : ''" @click="openEdit(c)"
          >编辑</el-button>
          <el-button
            size="small" text type="danger" :disabled="isBuiltin(c)"
            :title="isBuiltin(c) ? '内置指令不可删除，可停用' : ''" @click="onDelete(c)"
          >删除</el-button>
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="view === 'form' && form">
        <el-button @click="view = 'list'">返回</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
      <el-button v-else-if="view === 'runs'" @click="view = 'list'">返回</el-button>
      <el-button v-else @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePageCommandsStore, type PageCommandRun } from '../../stores/page-commands';
import { useSettingsStore } from '../../stores/settings';
import { isCommandEnabled, matchPageCommands, needsConfirm, type PageCommand } from '../../utils/pageCommand';

const props = withDefaults(defineProps<{ modelValue: boolean; url?: string }>(), { url: '' });
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const store = usePageCommandsStore();
const settingsStore = useSettingsStore();

/** 当前页命中的指令 id 集合（列表里打标，用户一眼看出"这条会不会出现在这页"） */
const matchedIds = computed(() => new Set(matchPageCommands(store.list, props.url || '').map((c) => c.id)));
/** 全局是否允许"信任脚本指令"（默认关；关着时单条指令的信任开关不可用） */
const trustAllowed = computed(() => !!settingsStore.settings.browserTrustScriptCommands);

type View = 'list' | 'form' | 'runs';
const view = ref<View>('list');

interface FormState {
  id: string;            // 空 = 新建
  kind: 'task' | 'script';
  name: string; description: string; body: string;
  match_host: string; match_url: string; enabled: boolean; trust: boolean;
}
const form = ref<FormState | null>(null);
const editing = ref(false);
const saving = ref(false);
const editingIsBuiltin = ref(false);

/** 执行记录（审计） */
const runs = ref<PageCommandRun[]>([]);
const runsWarning = ref('');
const runsFor = ref('');   // 指令名（空 = 全部）

const title = computed(() => {
  if (view.value === 'runs') return '脚本执行记录';
  if (view.value === 'form') return editing.value ? '编辑页面指令' : '新建页面指令';
  return '页面指令';
});

const isBuiltin = (c: PageCommand) => c.source === 'builtin';
const enabledOf = (c: PageCommand) => isCommandEnabled(c);

function matchLabel(c: PageCommand): string {
  if (c.match_url) return `URL 正则 ${c.match_url}`;
  return !c.match_host || c.match_host === '*' ? '所有站点' : c.match_host;
}
function formatTime(ts?: number | null): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

// 打开即拉一次（列表可能被别的窗口改过）
watch(() => props.modelValue, (v) => {
  if (v) {
    view.value = 'list';
    form.value = null;
    void store.load(true);
  }
});

async function openRuns(c?: PageCommand) {
  view.value = 'runs';
  runsFor.value = c ? c.name : '';
  runs.value = [];
  runsWarning.value = '';
  const r = await store.listRuns(c?.id, c ? 20 : 50);
  runs.value = r.rows;
  runsWarning.value = r.warning;
}

function openCreate() {
  editing.value = false;
  editingIsBuiltin.value = false;
  form.value = {
    id: '', kind: 'task', name: '', description: '', body: '',
    match_host: '*', match_url: '', enabled: true, trust: false,
  };
  view.value = 'form';
}

function openEdit(c: PageCommand) {
  editing.value = true;
  editingIsBuiltin.value = c.source === 'builtin';
  form.value = {
    id: c.id, kind: c.kind === 'script' ? 'script' : 'task',
    name: c.name, description: c.description || '', body: c.body,
    match_host: c.match_host || '*', match_url: c.match_url || '',
    enabled: isCommandEnabled(c),
    trust: c.kind === 'script' && !needsConfirm(c),
  };
  view.value = 'form';
}

/** 打开"信任"必须过一次**风险确认**：这不是普通开关，等于把一条可执行脚本变成一键按钮 */
async function onTrustChange(v: boolean | string | number) {
  if (!v || !form.value) return;
  try {
    await ElMessageBox.confirm(
      '打开后，这条脚本指令执行时**不再弹确认**，会直接在这一页里跑。<br>'
      + '脚本能读取本页内容与登录态、发起请求、修改并提交表单 —— 只在你确定它内容不会变时使用。',
      '确认信任该脚本指令',
      { dangerouslyUseHTMLString: true, confirmButtonText: '仍然信任', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    form.value.trust = false;   // 取消 → 回退开关
  }
}

async function onSave() {
  const f = form.value;
  if (!f) return;
  if (!f.name.trim()) { ElMessage.warning('指令名称必填'); return; }
  if (!f.body.trim()) { ElMessage.warning(f.kind === 'script' ? '脚本内容必填' : '指令内容必填'); return; }
  if (f.kind === 'script' && f.trust && !trustAllowed.value) {
    ElMessage.warning('需先在「浏览器设置」里允许信任脚本指令');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      kind: f.kind,
      body: f.body.trim(),
      match_host: f.match_host.trim() || '*',
      match_url: f.match_url.trim() || null,
      enabled: f.enabled,
      // ★ 只有显式 true 才发（服务端只在收到 trust:true 时才会把 need_confirm 置 0）
      trust: f.kind === 'script' && f.trust,
    };
    const r = f.id ? await store.update(f.id, payload) : await store.create(payload);
    if (!r.ok) { ElMessage.error(r.msg); return; }
    ElMessage.success(f.id ? '已保存' : '已新建');
    view.value = 'list';
    form.value = null;
  } finally {
    saving.value = false;
  }
}

async function onToggle(c: PageCommand, enabled: boolean) {
  const r = await store.update(c.id, { enabled });
  if (!r.ok) ElMessage.error(r.msg);
}

async function onDelete(c: PageCommand) {
  try {
    await ElMessageBox.confirm(`删除指令「${c.name}」？`, '删除页面指令', { type: 'warning' });
  } catch { return; }   // 用户取消
  const r = await store.remove(c.id);
  if (!r.ok) ElMessage.error(r.msg);
  else ElMessage.success('已删除');
}
</script>

<style scoped>
.pc-list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.pc-list-sub { font-size: 12px; color: var(--el-text-color-secondary, #909399); }
.pc-warning {
  font-size: 12px; color: var(--el-color-warning, #e6a23c);
  background: var(--el-color-warning-light-9, #fdf6ec); padding: 6px 10px; border-radius: 6px; margin-bottom: 8px;
}
.pc-empty { font-size: 13px; color: var(--el-text-color-secondary, #909399); padding: 24px 0; text-align: center; }
.pc-row {
  display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 8px; margin-bottom: 6px;
}
.pc-row.is-hit { border-color: var(--el-color-primary-light-5, #a0cfff); background: var(--el-color-primary-light-9, #ecf5ff); }
.pc-row-main { flex: 1; min-width: 0; }
.pc-row-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pc-name { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary, #303133); }
.pc-row-desc { font-size: 12px; color: var(--el-text-color-secondary, #909399); margin-top: 3px; white-space: pre-wrap; word-break: break-word; }
.pc-row-match { font-size: 11px; color: var(--el-text-color-placeholder, #a8abb2); margin-top: 3px; }
.pc-row-ops { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.pc-var-hint { font-size: 11px; color: var(--el-text-color-placeholder, #a8abb2); margin-top: 4px; line-height: 1.6; }
.pc-var-hint code { background: var(--el-fill-color-light, #f5f7fa); padding: 0 3px; border-radius: 3px; }
.pc-form-tip { font-size: 12px; color: var(--el-text-color-secondary, #909399); line-height: 1.6; }
:deep(.pc-mono textarea) { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; }

/* 执行记录（审计） */
.pc-run { border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; }
.pc-run.is-fail { border-color: var(--el-color-danger-light-5, #fab6b6); }
.pc-run-head { display: flex; align-items: center; gap: 8px; }
.pc-run-name { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary, #303133); }
.pc-run-time { font-size: 11px; color: var(--el-text-color-secondary, #909399); margin-left: auto; }
.pc-run-dur { font-size: 11px; color: var(--el-text-color-placeholder, #a8abb2); }
.pc-run-sub { font-size: 12px; color: var(--el-text-color-secondary, #909399); margin-top: 3px; word-break: break-all; }
.pc-run-err { font-size: 12px; color: var(--el-color-danger, #f56c6c); margin-top: 3px; word-break: break-word; }
</style>
