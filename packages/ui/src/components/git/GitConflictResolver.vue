<template>
  <el-dialog
    v-model="visible"
    :title="title || '解决冲突'"
    width="980px"
    top="5vh"
    class="git-conflict-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="gcf" v-loading="loading">
      <div class="gcf-body">
        <!-- 左：冲突文件列表 -->
        <aside class="gcf-side">
          <div class="gcf-side-head">
            <span>冲突文件</span>
            <span class="gcf-spacer"></span>
            <span class="gcf-progress">{{ resolvedCount }}/{{ files.length }}</span>
          </div>
          <div class="gcf-file-list">
            <div
              v-for="f in files" :key="f"
              class="gcf-file"
              :class="{ active: f === current, done: resolved[f] }"
              @click="pick(f)"
            >
              <el-icon :size="12" class="gcf-file-icon">
                <Check v-if="resolved[f]" /><WarningFilled v-else />
              </el-icon>
              <span class="gcf-file-name" :title="f">{{ f }}</span>
            </div>
            <div v-if="!files.length" class="gcf-empty">没有冲突文件</div>
          </div>
          <div class="gcf-side-foot">
            <button class="gcf-link danger" @click="doAbort">中止合并，回到合并前</button>
          </div>
        </aside>

        <!-- 右：三向内容 -->
        <section class="gcf-main" v-if="current">
          <div class="gcf-main-head">
            <span class="gcf-path">{{ current }}</span>
            <span class="gcf-spacer"></span>
            <button class="gcf-btn sm" @click="useOurs">采用我的版本</button>
            <button class="gcf-btn sm" @click="useTheirs">采用传入版本</button>
            <button class="gcf-btn sm" @click="useBoth">保留双方</button>
          </div>

          <div class="gcf-panes">
            <div class="gcf-pane">
              <div class="gcf-pane-head ours">我的版本（HEAD）</div>
              <pre class="gcf-code">{{ versions.ours || '（无此文件）' }}</pre>
            </div>
            <div class="gcf-pane">
              <div class="gcf-pane-head theirs">传入版本（MERGE_HEAD）</div>
              <pre class="gcf-code">{{ versions.theirs || '（无此文件）' }}</pre>
            </div>
          </div>

          <div class="gcf-result">
            <div class="gcf-pane-head">合并结果（可直接编辑，保存后标记为已解决）</div>
            <el-input
              v-model="result"
              type="textarea"
              :rows="9"
              resize="none"
              class="gcf-editor"
              spellcheck="false"
            />
          </div>
        </section>
        <section v-else class="gcf-main gcf-main-empty">选择左侧文件开始解决冲突</section>
      </div>
    </div>

    <template #footer>
      <div class="gcf-foot">
        <span class="gcf-foot-tip" v-if="resolvedCount < files.length">
          还有 {{ files.length - resolvedCount }} 个文件待解决
        </span>
        <span class="gcf-foot-tip ok" v-else>全部冲突已解决，可以提交了</span>
        <span class="gcf-spacer"></span>
        <button class="gcf-btn" @click="close">关闭</button>
        <button class="gcf-btn primary" :disabled="!current || saving" @click="saveCurrent">
          保存并标记已解决
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Check, WarningFilled } from '@element-plus/icons-vue';
import { useGitStore } from '../../stores/git';

const props = defineProps<{
  modelValue: boolean;
  repo: string;
  files: string[];
  title?: string;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'resolved', payload: { file: string }): void;
  (e: 'aborted'): void;
}>();

const gitStore = useGitStore();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const loading = ref(false);
const saving = ref(false);
const current = ref('');
const versions = ref<{ base: string; ours: string; theirs: string }>({ base: '', ours: '', theirs: '' });
const result = ref('');
const resolved = ref<Record<string, boolean>>({});
const resolvedCount = computed(() => Object.values(resolved.value).filter(Boolean).length);

watch(
  () => [props.modelValue, props.files] as const,
  ([open, files]) => {
    if (!open) return;
    resolved.value = {};
    result.value = '';
    versions.value = { base: '', ours: '', theirs: '' };
    current.value = files && files.length ? files[0] : '';
    if (current.value) void loadVersions(current.value);
  },
  { immediate: true },
);

async function loadVersions(path: string): Promise<void> {
  loading.value = true;
  try {
    // 并行取三版本 + 工作区当前内容（带冲突标记）
    const [v, work] = await Promise.all([
      gitStore.conflictVersions(props.repo, path),
      gitStore.readFile(props.repo, path).catch(() => ''),
    ]);
    versions.value = v;
    result.value = work || buildMerged(v.ours, v.theirs);
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}

function pick(path: string): void {
  if (path === current.value) return;
  current.value = path;
  void loadVersions(path);
}

/** 无工作区内容时：拼接 ours + theirs，让用户直接删减 */
function buildMerged(ours: string, theirs: string): string {
  return `${ours}\n${theirs}`;
}

function useOurs(): void { result.value = versions.value.ours; }
function useTheirs(): void { result.value = versions.value.theirs; }
function useBoth(): void {
  result.value = `${versions.value.ours}\n${versions.value.theirs}`;
}

async function saveCurrent(): Promise<void> {
  if (!current.value) return;
  saving.value = true;
  try {
    const res = await gitStore.resolveContent(props.repo, current.value, result.value);
    if ('error' in res) throw new Error(res.error);
    resolved.value = { ...resolved.value, [current.value]: true };
    ElMessage.success('已标记为已解决');
    emit('resolved', { file: current.value });
    // 自动跳到下一个未解决文件
    const next = props.files.find((f) => !resolved.value[f]);
    if (next) { current.value = next; await loadVersions(next); }
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    saving.value = false;
  }
}

async function doAbort(): Promise<void> {
  try {
    await ElMessageBox.confirm('中止合并会丢弃本次合并的所有改动，恢复到合并前的状态。', '中止合并', {
      confirmButtonText: '中止合并', cancelButtonText: '继续解决', type: 'warning',
    });
  } catch { return; }
  try {
    const res = await gitStore.abortMerge(props.repo);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success('已中止合并');
    emit('aborted');
    visible.value = false;
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

function close(): void { visible.value = false; }
</script>

<style scoped>
.gcf { display: flex; flex-direction: column; }
.gcf-body { display: flex; gap: 12px; min-height: 420px; }
.gcf-spacer { flex: 1; }

.gcf-side {
  width: 240px; flex-shrink: 0; display: flex; flex-direction: column;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 8px;
  background: var(--glass-bg-soft, #fbfaf7); overflow: hidden;
}
.gcf-side-head {
  display: flex; align-items: center; padding: 8px 10px; font-size: 12px;
  font-weight: 600; border-bottom: 1px solid var(--glass-border-soft, #f0eee8);
}
.gcf-progress { color: var(--color-text-muted, #9a9a9a); font-weight: 400; }
.gcf-file-list { flex: 1; overflow: auto; }
.gcf-file {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  font-size: 12px; cursor: pointer; border-bottom: 1px solid var(--glass-border-soft, #f0eee8);
}
.gcf-file:hover { background: var(--glass-bg-hover, #f5f3ee); }
.gcf-file.active { background: #fdf3ec; }
.gcf-file-icon { flex-shrink: 0; color: #b45309; }
.gcf-file.done .gcf-file-icon { color: #15803d; }
.gcf-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: "JetBrains Mono", monospace; }
.gcf-empty { padding: 20px; text-align: center; font-size: 12px; color: var(--color-text-muted, #9a9a9a); }
.gcf-side-foot { padding: 8px 10px; border-top: 1px solid var(--glass-border-soft, #f0eee8); }
.gcf-link {
  border: none; background: none; cursor: pointer; font-size: 11px;
  color: var(--color-text-soft, #6b6b6b); padding: 0;
}
.gcf-link.danger { color: #b91c1c; }
.gcf-link:hover { text-decoration: underline; }

.gcf-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.gcf-main-empty {
  align-items: center; justify-content: center; font-size: 13px;
  color: var(--color-text-muted, #9a9a9a);
  border: 1px dashed var(--glass-border, #e7e4dc); border-radius: 8px;
}
.gcf-main-head { display: flex; align-items: center; gap: 8px; }
.gcf-path {
  font-size: 12px; font-family: "JetBrains Mono", monospace;
  color: var(--color-text-soft, #6b6b6b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gcf-panes { display: flex; gap: 10px; min-height: 0; }
.gcf-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gcf-pane-head {
  font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px 6px 0 0;
  background: var(--glass-bg-soft, #f5f3ee); color: var(--color-text-soft, #6b6b6b);
}
.gcf-pane-head.ours { background: #eef2ff; color: #3730a3; }
.gcf-pane-head.theirs { background: #ecfdf5; color: #065f46; }
.gcf-code {
  margin: 0; flex: 1; height: 190px; overflow: auto; padding: 8px;
  font-family: "JetBrains Mono", monospace; font-size: 11px; line-height: 1.5;
  background: #fff; border: 1px solid var(--glass-border-soft, #f0eee8); border-radius: 0 0 6px 6px;
  white-space: pre; color: var(--color-text, #1a1a1a);
}
.gcf-result { display: flex; flex-direction: column; }
.gcf-editor :deep(textarea) {
  font-family: "JetBrains Mono", monospace; font-size: 11px; line-height: 1.5;
}

.gcf-foot { display: flex; align-items: center; gap: 8px; }
.gcf-foot-tip { font-size: 12px; color: var(--color-text-soft, #6b6b6b); }
.gcf-foot-tip.ok { color: #15803d; }
.gcf-btn {
  border: 1px solid var(--glass-border, #e7e4dc); background: #fff;
  border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer;
  color: var(--color-text, #1a1a1a);
}
.gcf-btn.sm { padding: 3px 8px; font-size: 12px; }
.gcf-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.gcf-btn.primary {
  background: var(--color-primary, #c2410c); border-color: var(--color-primary, #c2410c); color: #fff;
}
.gcf-btn.primary:hover:not(:disabled) { filter: brightness(1.06); color: #fff; }
.gcf-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
