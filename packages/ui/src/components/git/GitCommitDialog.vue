<template>
  <el-dialog
    v-model="visible"
    :title="amend ? '提交更改（追加到上次提交）' : '提交更改'"
    width="860px"
    top="6vh"
    class="git-commit-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="gcd" v-loading="loading">
      <!-- 头部：仓库切换 + 分支 + 统计 -->
      <div class="gcd-head">
        <el-select
          v-if="repos && repos.length > 1"
          v-model="currentRepo"
          size="small"
          class="gcd-repo-select"
          @change="onRepoChange"
        >
          <el-option v-for="r in repos" :key="r.path" :label="r.name" :value="r.path" />
        </el-select>
        <span v-else class="gcd-repo-name">{{ repoName }}</span>
        <span class="gcd-branch" :title="`当前分支 ${branch}`">
          <el-icon :size="12"><Share /></el-icon>{{ branch || '无分支' }}
        </span>
        <span class="gcd-spacer"></span>
        <span class="gcd-count">已选中 <b>{{ selectedCount }}</b> 个文件（共 {{ files.length }}）</span>
        <button class="gcd-link" @click="selectAll">全选</button>
        <button class="gcd-link" @click="invertSelection">反选</button>
        <button class="gcd-link" @click="selectNone">全不选</button>
      </div>

      <div class="gcd-filter">
        <el-input v-model="filter" size="small" placeholder="按文件名或目录过滤…" clearable class="gcd-filter-input">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <button class="gcd-link" @click="expandAll">展开</button>
        <button class="gcd-link" @click="collapseAll">折叠</button>
      </div>

      <!-- 变更文件树（IDEA 式） -->
      <div class="gcd-list">
        <GitTreeRow
          v-for="node in tree"
          :key="node.id"
          :node="node"
          :depth="0"
          :selected="selected"
          :expanded-key="expandedKey"
          :collapsed="collapsed"
          :filter="filter"
          :diff-loading="diffLoading"
          :expanded-diff="expandedDiff"
          @open-menu="openMenu"
          @expand="toggleExpand"
          @toggle-file="toggleFile"
          @toggle-dir="toggleDirChecked"
          @toggle-collapse="toggleCollapse"
        />
        <div v-if="!tree.length" class="gcd-empty">
          {{ files.length ? '没有匹配的文件' : '工作区没有待提交的变更' }}
        </div>
      </div>

      <!-- 提交信息 -->
      <div class="gcd-msg">
        <div class="gcd-msg-head">
          <span class="gcd-label">提交信息</span>
          <el-dropdown v-if="recentMessages.length" trigger="click" placement="bottom-start" @command="onPickHistory">
            <button class="gcd-history-btn" title="历史提交信息">
              历史<el-icon :size="10"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="(m, i) in recentMessages" :key="i" :command="m"
                  :title="m"
                >
                  <span class="gcd-history-item">{{ m.split('\n')[0] }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <span class="gcd-spacer"></span>
          <el-dropdown trigger="click" placement="top-end" @command="onRuleChange">
            <button class="gcd-rule-btn">
              {{ currentRuleLabel }}
              <el-icon :size="10"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="r in AI_COMMIT_RULES" :key="r.value" :command="r.value"
                  :class="{ 'is-active': ai.rule.value === r.value }"
                >
                  <div class="gcd-rule-item">
                    <span class="gcd-rule-label">
                      {{ r.label }}
                      <el-icon v-if="ai.rule.value === r.value" class="gcd-rule-check"><Check /></el-icon>
                    </span>
                    <span class="gcd-rule-desc">{{ r.desc }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div class="gcd-msg-wrap">
          <el-input
            v-model="message"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="提交信息（Ctrl+Enter 提交，Ctrl+Shift+Enter 提交并推送）"
            @keydown.ctrl.enter.prevent="doCommit(false)"
            @keydown.ctrl.shift.enter.prevent="doCommit(true)"
          />
          <button
            class="gcd-ai-btn"
            :disabled="aiLoading || !selectedCount"
            :title="selectedCount ? 'AI 填充提交信息' : '请先勾选文件'"
            @click="doAiFill"
          >
            <el-icon v-if="aiLoading" class="is-loading"><Loading /></el-icon>
            <el-icon v-else><MagicStick /></el-icon>
            <span>AI 填充</span>
          </button>
        </div>

        <!-- 自定义提示词 -->
        <div v-if="ai.rule.value === 'custom'" class="gcd-custom">
          <div class="gcd-custom-head">
            <span>自定义提示词</span>
            <span class="gcd-spacer"></span>
            <button class="gcd-link" @click="resetCustom">恢复默认</button>
          </div>
          <el-input
            v-model="ai.customRule.value"
            type="textarea" :rows="2" resize="none"
            placeholder="例如：使用中文，格式为【类型】描述，类型包括 新增 / 修复 / 优化 / 文档，不超过 50 字"
            @change="persistCustom"
          />
        </div>

        <label class="gcd-amend">
          <el-checkbox v-model="amend" size="small" />
          <span>追加到上次提交（amend）</span>
        </label>
      </div>
    </div>

    <template #footer>
      <div class="gcd-foot">
        <span class="gcd-foot-tip" v-if="conflictCount">
          <el-icon><WarningFilled /></el-icon>存在 {{ conflictCount }} 个冲突文件，需先解决
        </span>
        <span class="gcd-spacer"></span>
        <button class="gcd-btn" @click="close">取消</button>
        <button class="gcd-btn ghost" :disabled="!canCommit" @click="doCommit(true)">提交并推送</button>
        <button class="gcd-btn primary" :disabled="!canCommit" @click="doCommit(false)">提交</button>
      </div>
    </template>
  </el-dialog>

  <!-- 右键菜单 -->
  <Teleport to="body">
    <div
      v-if="menu.visible"
      class="gcd-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      @click.stop @contextmenu.prevent
    >
      <div class="gcd-menu-item" @click="menuViewDiff">
        <el-icon><View /></el-icon><span>查看差异</span>
      </div>
      <div class="gcd-menu-item" @click="menuStage">
        <el-icon><Plus /></el-icon><span>{{ menu.file?.staged ? '取消暂存' : '暂存此文件' }}</span>
      </div>
      <div class="gcd-menu-divider" />
      <div class="gcd-menu-item" @click="menuCopyPath">
        <el-icon><CopyDocument /></el-icon><span>复制路径</span>
      </div>
      <div class="gcd-menu-item danger" @click="menuRevert">
        <el-icon><RefreshLeft /></el-icon><span>还原此文件</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Share, Search, Check, ArrowDown, MagicStick, Loading,
  View, Plus, CopyDocument, RefreshLeft, WarningFilled,
} from '@element-plus/icons-vue';
import { useGitStore, type GitNumstatEntry, type GitStatusFile } from '../../stores/git';
import { useGitAi, AI_COMMIT_RULES } from '../../composables/git/useGitAi';
import GitTreeRow from './GitTreeRow.vue';

interface ChangedFile {
  key: string;
  path: string;
  dir: string;
  name: string;
  statusChar: string;
  statusClass: string;
  staged: boolean;
  added: number;
  deleted: number;
  /** 未跟踪的聚合目录项（git 未展开，如 "path/to/dir/"）；不可 diff / 提交，仅占位提示 */
  isDirEntry?: boolean;
}

/** 树节点：目录可折叠，文件为叶子 */
interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  /** 目录：子树内文件总数 */
  fileCount: number;
  /** 目录：子树内已选中文件数 */
  selCount: number;
  /** 文件叶子 */
  file?: ChangedFile;
}

const STATUS_CLASS: Record<string, string> = {
  M: 'modified', A: 'added', D: 'deleted', '?': 'untracked', R: 'renamed', U: 'conflict',
};
const UNMERGED = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
const MAX_DIFF_CHARS = 24000;

const props = defineProps<{
  modelValue: boolean;
  repo: string;
  repos?: Array<{ path: string; name: string }>;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'committed', payload: { pushed: boolean }): void;
}>();

const gitStore = useGitStore();
const ai = useGitAi();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});
const currentRepo = ref(props.repo);
const loading = ref(false);
const busy = ref(false);
const aiLoading = ref(false);
const filter = ref('');
const branch = ref('');
const message = ref('');
const amend = ref(false);
const files = ref<ChangedFile[]>([]);
const selected = ref<Record<string, boolean>>({});
const expandedKey = ref('');
const expandedDiff = ref('');
const diffLoading = ref(false);

const repoName = computed(() => currentRepo.value.split(/[\\/]/).filter(Boolean).pop() || '仓库');
/** 按文件名/目录路径过滤后的文件（保持原顺序，树的顺序在 buildTree 内统一排序） */
const filteredFiles = computed(() => {
  const k = filter.value.trim().toLowerCase();
  return k ? files.value.filter((f) => f.path.toLowerCase().includes(k)) : files.value;
});
/** 树的展开集合：key = 节点路径，默认全展开 */
const collapsed = ref<Record<string, boolean>>({});

/** 构建目录树：中间目录自动折叠为单链（idea 风格 compact middle package） */
function buildTree(list: ChangedFile[]): TreeNode[] {
  interface Raw {
    id: string; name: string; path: string; isDir: boolean;
    children: Map<string, Raw>; file?: ChangedFile;
  }
  const root: Raw = { id: '', name: '', path: '', isDir: true, children: new Map() };
  for (const f of list) {
    const segs = f.path.split('/').filter(Boolean);
    let cur = root;
    segs.forEach((seg, i) => {
      const isLeaf = i === segs.length - 1;
      const p = segs.slice(0, i + 1).join('/');
      let node = cur.children.get(seg);
      if (!node) {
        node = { id: p, name: seg, path: p, isDir: !isLeaf, children: new Map() };
        cur.children.set(seg, node);
      }
      if (isLeaf) { node.isDir = false; node.file = f; }
      cur = node;
    });
  }

  const toNodes = (r: Raw): TreeNode[] => {
    const arr: TreeNode[] = [];
    for (const raw of r.children.values()) {
      if (raw.isDir) {
        const children = toNodes(raw);
        arr.push({
          id: raw.id, name: raw.name, path: raw.path, isDir: true, children,
          fileCount: 0, selCount: 0,
        });
      } else if (raw.file) {
        arr.push({
          id: raw.id, name: raw.name, path: raw.path, isDir: false, children: [],
          fileCount: 1, selCount: selected.value[raw.file.key] ? 1 : 0, file: raw.file,
        });
      }
    }
    // 排序：目录在前，同类按名称
    arr.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return arr;
  };

  const nodes = toNodes(root);
  // 汇总目录计数 + 中间目录合并（仅一个子目录且自身无文件时，串成 a/b/c）
  const compact = (list2: TreeNode[]): TreeNode[] =>
    list2.map((n) => {
      if (!n.isDir) return n;
      let node = { ...n, children: compact(n.children) };
      while (node.children.length === 1 && node.children[0].isDir) {
        const child = node.children[0];
        node = {
          ...node,
          name: `${node.name}/${child.name}`,
          path: child.path,
          id: child.id,
          children: child.children,
        };
      }
      node.fileCount = node.children.reduce(
        (s, c) => s + (c.isDir ? c.fileCount : 1), 0,
      );
      node.selCount = node.children.reduce(
        (s, c) => s + (c.isDir ? c.selCount : (selected.value[c.file!.key] ? 1 : 0)), 0,
      );
      return node;
    });
  return compact(nodes);
}

const tree = computed<TreeNode[]>(() => buildTree(filteredFiles.value));
/** 折叠切换：写父组件 state（子组件不得直接改 prop） */
function toggleCollapse(id: string): void {
  collapsed.value = { ...collapsed.value, [id]: !collapsed.value[id] };
}
function expandAll(): void { collapsed.value = {}; }
function collapseAll(): void {
  const next: Record<string, boolean> = {};
  for (const f of files.value) {
    const segs = f.path.split('/').filter(Boolean);
    for (let i = 1; i < segs.length; i++) next[segs.slice(0, i).join('/')] = true;
  }
  collapsed.value = next;
}

const selectedCount = computed(() => Object.values(selected.value).filter(Boolean).length);
const conflictCount = computed(() => files.value.filter((f) => f.statusClass === 'conflict').length);
const canCommit = computed(
  () => !busy.value && selectedCount.value > 0 && (amend.value || !!message.value.trim()),
);
const currentRuleLabel = computed(
  () => AI_COMMIT_RULES.find((r) => r.value === ai.rule.value)?.label || '标准格式',
);

watch(() => props.repo, (v) => { if (v) currentRepo.value = v; });
watch(
  () => [props.modelValue, currentRepo.value] as const,
  ([open]) => { if (open) void load(); },
);

async function load(): Promise<void> {
  const r = currentRepo.value;
  if (!r) return;
  loading.value = true;
  expandedKey.value = '';
  try {
    const [st, num] = await Promise.all([
      apiStatus(r),
      gitStore.fetchNumstat(r).catch(() => []),
    ]);
    const numMap = new Map(num.map((n) => [n.path, n]));
    branch.value = st.branch;
    const list: ChangedFile[] = [];
    for (const f of st.files) {
      const idx = f.index || ' ';
      const wd = f.working_dir || ' ';
      const merged = UNMERGED.has(idx + wd);
      const n = numMap.get(f.path);
      if (idx !== ' ' || merged) {
        list.push(mk(f.path, merged ? 'U' : idx, true, n?.added ?? 0, n?.deleted ?? 0));
      }
      if (wd !== ' ' && !merged) {
        list.push(mk(f.path, wd, false, n?.added ?? 0, n?.deleted ?? 0));
      }
    }
    files.value = dedupe(list);
    const sel: Record<string, boolean> = {};
    for (const f of files.value) sel[f.key] = true;
    selected.value = sel;
  } catch (e) {
    ElMessage.error((e as Error).message);
    files.value = [];
  } finally {
    loading.value = false;
  }
}

async function apiStatus(repo: string): Promise<{ branch: string; files: GitStatusFile[] }> {
  return gitStore.fetchStatusRaw(repo);
}

function mk(path: string, char: string, staged: boolean, added: number, deleted: number): ChangedFile {
  const seg = path.split('/');
  const name = seg.pop() || path;
  const isDirEntry = path.endsWith('/');
  return {
    key: (staged ? 'i:' : 'w:') + path,
    path,
    dir: seg.join('/'),
    name,
    statusChar: char,
    statusClass: STATUS_CLASS[char] || 'modified',
    staged,
    added,
    deleted,
    isDirEntry,
  };
}

/** 同一文件同时有暂存与未暂存改动时合并为一行（改动行数取合计，优先显示已暂存状态） */
function dedupe(list: ChangedFile[]): ChangedFile[] {
  const map = new Map<string, ChangedFile>();
  for (const f of list) {
    const prev = map.get(f.path);
    if (!prev) { map.set(f.path, { ...f }); continue; }
    prev.added += f.added;
    prev.deleted += f.deleted;
    if (f.staged) {
      prev.staged = true;
      prev.key = f.key;
      prev.statusChar = f.statusChar;
      prev.statusClass = f.statusClass;
    }
  }
  return Array.from(map.values());
}

function onRepoChange(): void {
  message.value = '';
  amend.value = false;
  collapsed.value = {};
  void load();
}

/** 收集树/子树内的全部文件叶子 */
function leavesOf(nodes: TreeNode[]): ChangedFile[] {
  const out: ChangedFile[] = [];
  const walk = (list: TreeNode[]): void => {
    for (const n of list) {
      if (n.isDir) walk(n.children);
      else if (n.file && !n.file.isDirEntry) out.push(n.file);
    }
  };
  walk(nodes);
  return out;
}

function selectAll(): void {
  const sel: Record<string, boolean> = {};
  for (const f of leavesOf(tree.value)) sel[f.key] = true;
  selected.value = { ...selected.value, ...sel };
}
function selectNone(): void {
  const sel = { ...selected.value };
  for (const f of leavesOf(tree.value)) delete sel[f.key];
  selected.value = sel;
}
function invertSelection(): void {
  const sel: Record<string, boolean> = {};
  for (const f of leavesOf(tree.value)) sel[f.key] = !selected.value[f.key];
  selected.value = { ...selected.value, ...sel };
}
function toggleFile(key: string, v: boolean): void {
  selected.value = { ...selected.value, [key]: v };
}
/** 目录级勾选：整棵子树一起选中 / 取消 */
function toggleDirChecked(node: TreeNode, v: boolean): void {
  const sel = { ...selected.value };
  for (const f of leavesOf([node])) sel[f.key] = v;
  selected.value = sel;
}
/** 目录三态：全选 / 半选 / 未选 */
function dirCheckedState(node: TreeNode): boolean | 'indeterminate' {
  if (node.selCount === 0) return false;
  return node.selCount >= node.fileCount ? true : 'indeterminate';
}

// ===== 历史提交信息（本地保存最近 10 条）=====
const LS_MSGS = 'yz:git:recent-messages';
const recentMessages = ref<string[]>(readRecent());
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_MSGS) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 10) : [];
  } catch { return []; }
}
function pushRecent(msg: string): void {
  if (!msg) return;
  const next = [msg, ...recentMessages.value.filter((m) => m !== msg)].slice(0, 10);
  recentMessages.value = next;
  try { localStorage.setItem(LS_MSGS, JSON.stringify(next)); } catch { /* ignore */ }
}
function onPickHistory(m: string): void { message.value = m; }

async function toggleExpand(f: ChangedFile): Promise<void> {
  if (expandedKey.value === f.key) { expandedKey.value = ''; return; }
  expandedKey.value = f.key;
  expandedDiff.value = '';
  diffLoading.value = true;
  try {
    expandedDiff.value = await gitStore.diff(currentRepo.value, { file: f.path, staged: f.staged });
  } catch {
    expandedDiff.value = '';
  } finally {
    diffLoading.value = false;
  }
}

function selectedPaths(): string[] {
  return files.value
    .filter((f) => selected.value[f.key] && !f.isDirEntry)
    .map((f) => f.path);
}

function onRuleChange(v: string): void {
  ai.setRule(v);
}

function persistCustom(): void {
  ai.setCustomRule(ai.customRule.value);
}
function resetCustom(): void {
  ai.setCustomRule('');
}

async function doAiFill(): Promise<void> {
  const list = files.value
    .filter((f) => selected.value[f.key] && !f.isDirEntry)
    .slice(0, 40);
  if (!list.length) return;
  aiLoading.value = true;
  try {
    const parts = await Promise.all(
      list.map((f) => gitStore.diff(currentRepo.value, { file: f.path, staged: f.staged }).catch(() => '')),
    );
    const diff = parts.filter(Boolean).join('\n').slice(0, MAX_DIFF_CHARS);
    if (!diff.trim()) { ElMessage.warning('所选文件没有可分析的差异内容'); return; }
    message.value = await ai.generateCommitMessage(diff);
    ElMessage.success('已生成提交信息');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    aiLoading.value = false;
  }
}

async function doCommit(push: boolean): Promise<void> {
  if (!canCommit.value) return;
  const paths = selectedPaths();
  if (!paths.length) return;
  if (conflictCount.value) { ElMessage.error('存在冲突文件，请先解决冲突'); return; }
  busy.value = true;
  try {
    const r = currentRepo.value;
    const msg = message.value.trim();
    if (amend.value) {
      await gitStore.stageFiles(r, paths);
      const res = await gitStore.commitAmend(r, msg || undefined);
      if ('error' in res) throw new Error(res.error);
    } else {
      const res = await gitStore.commit(r, msg, paths);
      if ('error' in res) throw new Error(res.error);
    }
    if (push) {
      const res = await gitStore.push(r);
      if ('error' in res) throw new Error(res.error);
    }
    ElMessage.success(push ? '已提交并推送' : '已提交');
    pushRecent(msg);
    emit('committed', { pushed: push });
    close();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    busy.value = false;
  }
}

function close(): void {
  visible.value = false;
  menu.value.visible = false;
}

// ===== 右键菜单 =====
interface MenuFile extends ChangedFile {}
const menu = ref<{ visible: boolean; x: number; y: number; file: MenuFile | null }>({
  visible: false, x: 0, y: 0, file: null,
});
function openMenu(e: MouseEvent, f: ChangedFile): void {
  menu.value = { visible: true, x: e.clientX, y: e.clientY, file: f };
}
function closeMenu(): void { menu.value.visible = false; }
watch(() => menu.value.visible, (v) => {
  if (v) document.addEventListener('click', closeMenu);
  else document.removeEventListener('click', closeMenu);
});
onBeforeUnmount(() => document.removeEventListener('click', closeMenu));

function menuViewDiff(): void {
  const f = menu.value.file; closeMenu();
  if (f) void toggleExpand(f);
}
async function menuStage(): Promise<void> {
  const f = menu.value.file; closeMenu();
  if (!f) return;
  const res = f.staged
    ? await gitStore.unstageFiles(currentRepo.value, [f.path])
    : await gitStore.stageFiles(currentRepo.value, [f.path]);
  if ('error' in res) ElMessage.error(res.error);
  else void load();
}
function menuCopyPath(): void {
  const f = menu.value.file; closeMenu();
  if (!f) return;
  void navigator.clipboard?.writeText(f.path).then(() => ElMessage.success('已复制路径'));
}
async function menuRevert(): Promise<void> {
  const f = menu.value.file; closeMenu();
  if (!f) return;
  try {
    await ElMessageBox.confirm(`确认放弃 ${f.path} 的改动？此操作不可撤销。`, '还原文件', {
      confirmButtonText: '还原', cancelButtonText: '取消', type: 'warning',
    });
  } catch { return; }
  const res = await gitStore.restore(currentRepo.value, [f.path]);
  if ('error' in res) ElMessage.error(res.error);
  else { ElMessage.success('已还原'); void load(); }
}
</script>

<style scoped>
.gcd { display: flex; flex-direction: column; gap: 10px; }

.gcd-head { display: flex; align-items: center; gap: 8px; }
.gcd-repo-select { width: 200px; }
.gcd-repo-name { font-size: 13px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.gcd-branch {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; padding: 2px 8px; border-radius: 10px;
  background: var(--glass-bg-soft, #f5f3ee); color: var(--color-text-soft, #6b6b6b);
  font-family: "JetBrains Mono", monospace;
}
.gcd-spacer { flex: 1; }
.gcd-count { font-size: 12px; color: var(--color-text-soft, #6b6b6b); }
.gcd-count b { color: var(--color-primary, #c2410c); }
.gcd-link {
  border: none; background: none; cursor: pointer; font-size: 12px;
  color: var(--color-primary, #c2410c); padding: 0 2px;
}
.gcd-link:hover { text-decoration: underline; }

.gcd-filter { display: flex; align-items: center; gap: 8px; }
.gcd-filter-input { flex: 1; }

.gcd-list {
  border: 1px solid var(--glass-border, #e7e4dc);
  border-radius: 8px; max-height: 320px; overflow: auto;
  background: var(--glass-bg-soft, #fbfaf7);
}
.gcd-empty { padding: 28px; text-align: center; font-size: 12px; color: var(--color-text-muted, #9a9a9a); }

.gcd-msg { display: flex; flex-direction: column; gap: 8px; }
.gcd-msg-head { display: flex; align-items: center; }
.gcd-label { font-size: 12px; font-weight: 600; color: var(--color-text, #1a1a1a); }
.gcd-history-btn {
  display: inline-flex; align-items: center; gap: 3px; margin-left: 6px;
  border: none; background: none; cursor: pointer; font-size: 11px;
  color: var(--color-text-muted, #9a9a9a); padding: 0 2px;
}
.gcd-history-btn:hover { color: var(--color-primary, #c2410c); }
.gcd-history-item {
  display: block; max-width: 420px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; font-size: 12px;
}
.gcd-rule-btn {
  display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid var(--glass-border, #e7e4dc); background: #fff;
  border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer;
  color: var(--color-text-soft, #6b6b6b);
}
.gcd-rule-btn:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.gcd-rule-item { display: flex; flex-direction: column; gap: 2px; }
.gcd-rule-label { font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
.gcd-rule-check { color: var(--color-primary, #c2410c); }
.gcd-rule-desc { font-size: 11px; color: var(--color-text-muted, #9a9a9a); }

.gcd-msg-wrap { position: relative; }
.gcd-ai-btn {
  position: absolute; right: 8px; bottom: 8px;
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid #f0d9c8; background: #fdf3ec; color: #c2410c;
  border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer;
}
.gcd-ai-btn:hover:not(:disabled) { background: #fae7da; border-color: #e8b79c; }
.gcd-ai-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.gcd-custom { border: 1px dashed var(--glass-border, #e7e4dc); border-radius: 8px; padding: 8px; }
.gcd-custom-head {
  display: flex; align-items: center; font-size: 12px;
  color: var(--color-text-soft, #6b6b6b); margin-bottom: 6px;
}

.gcd-amend { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-soft, #6b6b6b); }

.gcd-foot { display: flex; align-items: center; gap: 8px; }
.gcd-foot-tip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #b91c1c; }
.gcd-btn {
  border: 1px solid var(--glass-border, #e7e4dc); background: #fff;
  color: var(--color-text, #1a1a1a); border-radius: 6px;
  padding: 5px 14px; font-size: 13px; cursor: pointer;
}
.gcd-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.gcd-btn.primary {
  background: var(--color-primary, #c2410c); border-color: var(--color-primary, #c2410c); color: #fff;
}
.gcd-btn.primary:hover:not(:disabled) { filter: brightness(1.06); color: #fff; }
.gcd-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.gcd-menu {
  position: fixed; z-index: 4000; min-width: 168px;
  background: #fff; border: 1px solid var(--glass-border, #e7e4dc);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1); padding: 4px;
}
.gcd-menu-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  font-size: 13px; cursor: pointer; border-radius: 6px; color: var(--color-text, #1a1a1a);
}
.gcd-menu-item:hover { background: var(--glass-bg-hover, #f5f3ee); }
.gcd-menu-item.danger { color: #b91c1c; }
.gcd-menu-divider { height: 1px; background: var(--glass-border-soft, #f0eee8); margin: 4px 0; }
</style>
