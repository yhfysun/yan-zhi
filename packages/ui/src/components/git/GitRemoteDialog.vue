<template>
  <el-dialog
    v-model="visible"
    title="远程仓库地址"
    width="620px"
    class="git-remote-dialog"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="grm">
      <div class="grm-repo" :title="repo">
        <el-icon><Box /></el-icon>
        <span class="grm-repo-path">{{ repo }}</span>
      </div>

      <div v-if="loading" class="grm-hint">读取中…</div>

      <template v-else>
        <div v-if="!remotes.length" class="grm-empty">
          该仓库还没有配置远程地址。添加一个 <b>origin</b> 之后，推送与拉取才有目标。
        </div>

        <div v-for="r in remotes" :key="r.name" class="grm-row">
          <div class="grm-row-head">
            <span class="grm-name">{{ r.name }}</span>
            <span v-if="isDirty(r.name)" class="grm-dirty">未保存</span>
            <span class="grm-spacer" />
            <button class="grm-btn" title="复制拉取地址" @click="copyUrl(r.fetchUrl)">复制</button>
            <button class="grm-btn" :disabled="busy" @click="doRename(r)">重命名</button>
            <button class="grm-btn danger" :disabled="busy" @click="doRemove(r)">删除</button>
          </div>

          <div class="grm-field">
            <label>拉取地址</label>
            <el-input v-model="draftOf(r.name).fetchUrl" size="small" spellcheck="false" />
          </div>
          <div class="grm-field">
            <label>推送地址</label>
            <el-input
              v-model="draftOf(r.name).pushUrl"
              size="small"
              spellcheck="false"
              placeholder="与拉取地址相同时可留空"
            />
          </div>

          <div class="grm-row-foot">
            <!-- fetch 与 push 指向不同仓库（拉官方、推内网）时才会用到它 -->
            <button class="grm-btn" :disabled="busy || !isDirty(r.name)" @click="doSavePushOnly(r)">
              只改推送到
            </button>
            <button class="grm-btn primary" :disabled="busy || !isDirty(r.name)" @click="doSave(r)">
              保存
            </button>
          </div>

          <!-- 地址里带 user:token@ 时给一句提醒：它会被显示与复制出去 -->
          <div v-if="hasInlineCredential(r.fetchUrl) || hasInlineCredential(r.pushUrl)" class="grm-warn">
            该地址内嵌了明文凭据（<code>user:token@</code>），会被显示、复制到剪贴板，也可能被截图带出去。
            建议改成普通地址并交给凭据管理器（<code>git config credential.helper</code>）。
          </div>
        </div>

        <div class="grm-add">
          <div class="grm-add-title">新增远程</div>
          <div class="grm-add-row">
            <el-input v-model="newName" size="small" placeholder="名称，如 origin" class="grm-add-name" />
            <el-input
              v-model="newUrl"
              size="small"
              spellcheck="false"
              placeholder="地址，如 https://github.com/acme/app.git"
              @keyup.enter="doAdd"
            />
            <button class="grm-btn primary" :disabled="busy || !newName.trim() || !newUrl.trim()" @click="doAdd">
              添加
            </button>
          </div>
          <div class="grm-hint">支持 https / git@host:path / ssh:// / 本地路径（镜像仓库）。</div>
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 远程仓库地址弹窗：查看 / 修改 / 新增 / 重命名 / 删除。
 *
 * ★ 为什么需要（2026-10-16 用户实报「git 缺少远程 url 查看和修改」）：
 *   面板此前只能看到「远程分支」——地址本身既看不到也不能改。用户想确认自己推的是哪个仓库、
 *   或把 origin 从 GitHub 换到内网 GitLab，只能离开应用去敲命令行。
 *
 * ★ 编辑用**草稿副本**（drafts）而不是直接改列表项：原始列表留着做"脏"判定
 *   （只有改过的行才允许保存），也避免把界面上未保存的输入当成仓库的真实状态。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Box } from '@element-plus/icons-vue';
import { useGitStore, type GitRemote } from '../../stores/git';
import { hasInlineCredential } from '../../utils/gitRemoteCredential';

const props = defineProps<{ modelValue: boolean; repo: string }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  /** 真正改动过仓库（增 / 删 / 改 / 重命名）后通知外层重新拉取 */
  (e: 'changed'): void;
}>();

const gitStore = useGitStore();
const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const busy = ref(false);
const loading = ref(false);
/** 仓库里的真实远程（只读基准） */
const remotes = ref<GitRemote[]>([]);
/** 界面上的编辑副本，按远程名索引 */
const drafts = reactive<Record<string, { fetchUrl: string; pushUrl: string }>>({});
const newName = ref('');
const newUrl = ref('');

function draftOf(name: string): { fetchUrl: string; pushUrl: string } {
  if (!drafts[name]) drafts[name] = { fetchUrl: '', pushUrl: '' };
  return drafts[name];
}

/** 该行是否被改过（未改的行不允许保存，避免无意义的 git 调用） */
function isDirty(name: string): boolean {
  const orig = remotes.value.find((r) => r.name === name);
  const d = drafts[name];
  if (!orig || !d) return false;
  return d.fetchUrl.trim() !== orig.fetchUrl || d.pushUrl.trim() !== orig.pushUrl;
}

async function load(): Promise<void> {
  if (!props.repo) return;
  loading.value = true;
  try {
    const list = await gitStore.remoteList(props.repo);
    remotes.value = list;
    // 重建草稿：删掉已不存在的远程，其余用仓库当前值覆盖（重命名 / 删除后不留残影）
    for (const k of Object.keys(drafts)) if (!list.some((r) => r.name === k)) delete drafts[k];
    for (const r of list) drafts[r.name] = { fetchUrl: r.fetchUrl, pushUrl: r.pushUrl };
  } catch (e) {
    ElMessage.error((e as Error).message || '读取远程地址失败');
  } finally {
    loading.value = false;
  }
}

// immediate 是必须的：若父级把弹窗挂在「已打开」状态（懒挂载 / 路由直开），
// 没有它就没有 false→true 的变化，watch 永远不触发 —— 打开的是一个空列表。
// 关闭状态挂载时 v=false，下面这句不会真的发请求。
watch(visible, (v) => { if (v) void load(); }, { immediate: true });
watch(() => props.repo, () => { if (visible.value) void load(); });

async function copyUrl(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success('已复制地址');
  } catch {
    ElMessage.warning('复制失败，请手动选择地址复制');
  }
}

async function doSave(r: GitRemote): Promise<void> {
  const d = draftOf(r.name);
  const fetchUrl = d.fetchUrl.trim();
  const pushUrl = d.pushUrl.trim() || fetchUrl;
  if (!fetchUrl) { ElMessage.warning('拉取地址不能为空'); return; }
  busy.value = true;
  try {
    if (fetchUrl !== r.fetchUrl) {
      const res = await gitStore.remoteSetUrl(props.repo, r.name, fetchUrl, false);
      if ('error' in res) throw new Error(res.error);
    }
    if (pushUrl !== r.pushUrl) {
      const res = await gitStore.remoteSetUrl(props.repo, r.name, pushUrl, true);
      if ('error' in res) throw new Error(res.error);
    }
    ElMessage.success(`已更新 ${r.name}`);
    await load();
    emit('changed');
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败');
  } finally {
    busy.value = false;
  }
}

/** 只改推送地址（fetch/push 指向不同仓库的部署：拉官方、推内网） */
async function doSavePushOnly(r: GitRemote): Promise<void> {
  const d = draftOf(r.name);
  const pushUrl = d.pushUrl.trim() || d.fetchUrl.trim();
  if (!pushUrl) { ElMessage.warning('推送地址不能为空'); return; }
  busy.value = true;
  try {
    const res = await gitStore.remoteSetUrl(props.repo, r.name, pushUrl, true);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success(`已更新 ${r.name} 的推送地址`);
    await load();
    emit('changed');
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败');
  } finally {
    busy.value = false;
  }
}

async function doAdd(): Promise<void> {
  const name = newName.value.trim();
  const url = newUrl.value.trim();
  if (!name || !url) return;
  busy.value = true;
  try {
    const res = await gitStore.remoteAdd(props.repo, name, url);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success(`已添加远程 ${name}`);
    newName.value = '';
    newUrl.value = '';
    await load();
    emit('changed');
  } catch (e) {
    ElMessage.error((e as Error).message || '添加失败');
  } finally {
    busy.value = false;
  }
}

async function doRemove(r: GitRemote): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除远程 ${r.name}？只解除关联，本地提交与分支不受影响。`,
      '删除远程',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  busy.value = true;
  try {
    const res = await gitStore.remoteRemove(props.repo, r.name);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success(`已删除远程 ${r.name}`);
    await load();
    emit('changed');
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败');
  } finally {
    busy.value = false;
  }
}

async function doRename(r: GitRemote): Promise<void> {
  let next = '';
  try {
    const { value } = await ElMessageBox.prompt('新的远程名称', `重命名 ${r.name}`, {
      inputValue: r.name,
      confirmButtonText: '重命名',
      cancelButtonText: '取消',
      inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空'),
    });
    next = String(value || '').trim();
  } catch {
    return; // 用户取消
  }
  if (!next || next === r.name) return;
  busy.value = true;
  try {
    const res = await gitStore.remoteRename(props.repo, r.name, next);
    if ('error' in res) throw new Error(res.error);
    ElMessage.success(`已重命名为 ${next}`);
    await load();
    emit('changed');
  } catch (e) {
    ElMessage.error((e as Error).message || '重命名失败');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.grm { display: flex; flex-direction: column; gap: 10px; }
.grm-repo {
  display: flex; align-items: center; gap: 6px; padding-bottom: 8px;
  border-bottom: 1px solid var(--glass-border-soft, #f0eee8);
  font-size: 12px; color: var(--color-text-soft, #6b6b6b);
}
.grm-repo-path {
  font-family: "JetBrains Mono", monospace; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.grm-empty {
  padding: 10px 12px; border: 1px dashed var(--glass-border, #e7e4dc); border-radius: 8px;
  font-size: 12px; line-height: 1.6; color: var(--color-text-soft, #6b6b6b);
}
.grm-row {
  display: flex; flex-direction: column; gap: 6px; padding: 10px 12px;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 8px;
  background: var(--glass-bg-soft, #fbfaf7);
}
.grm-row-head { display: flex; align-items: center; gap: 8px; }
.grm-name { font-size: 13px; font-weight: 600; font-family: "JetBrains Mono", monospace; }
.grm-dirty { font-size: 10px; padding: 0 5px; border-radius: 8px; background: #fdf3ec; color: #c2410c; }
.grm-spacer { flex: 1; }
.grm-field { display: flex; align-items: center; gap: 8px; }
.grm-field label {
  flex-shrink: 0; width: 56px; font-size: 12px; color: var(--color-text-soft, #6b6b6b);
}
.grm-row-foot { display: flex; justify-content: flex-end; gap: 6px; }
.grm-add { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; }
.grm-add-title { font-size: 12px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.grm-add-row { display: flex; gap: 6px; align-items: center; }
.grm-add-name { width: 150px; flex-shrink: 0; }
.grm-btn {
  flex-shrink: 0; padding: 4px 10px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 6px; background: #fff;
}
.grm-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.grm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.grm-btn.danger:hover:not(:disabled) { border-color: #b91c1c; color: #b91c1c; }
.grm-btn.primary {
  border-color: var(--color-primary, #c2410c); background: var(--color-primary, #c2410c); color: #fff;
}
.grm-btn.primary:hover:not(:disabled) { filter: brightness(1.06); color: #fff; }
.grm-hint { font-size: 11px; line-height: 1.6; color: var(--color-text-tertiary, #999); }
.grm-warn {
  padding: 6px 8px; border-radius: 6px; font-size: 11px; line-height: 1.6;
  background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
}
.grm-warn code { font-family: "JetBrains Mono", monospace; font-size: 10px; }
</style>
