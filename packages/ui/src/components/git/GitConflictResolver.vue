<!--
  GitConflictResolver.vue — 冲突解决（设计参考 IntelliJ IDEA 的 Merge Revisions）

  IDEA 的关键做法（本次对齐）：
    · 三向视图：左 = 我的版本（HEAD）、中 = 基线（BASE / 共同祖先）、右 = 传入版本（MERGE_HEAD）。
      BASE 是最关键的一屏 —— 它解释「两边各自改了什么」。原实现只有左右两屏，用户判断不了谁改了什么。
    · 逐块取舍：IDEA 的 ◀ / ▶ 箭头作用在「当前差异块」上，而不是整文件二选一。
      本次落成每块一行的 左侧 / 双方 / 右侧 三键（原实现只能整文件「采用我的/采用传入」）。
    · 自动套用非冲突改动（IDEA 的 Apply Non-Conflicting Changes）：
      落成「全部接受左侧 / 全部接受右侧」，且**只对非冲突块生效**，与 IDEA 语义一致。
    · 行级对齐（IDEA 的 Align Changes in Side-by-Side Diff）：三列按行号一一对应，
      差异处用空白补位，而不是各列独立滚动导致看串行。
    · 结果区可编辑，保存即标记已解决（保持原有链路不变）；仍有冲突标记时保存前二次确认。
    · 三列宽度与侧栏宽度可拖动；支持全屏。

  实现说明：不再依赖工作区里的 <<<<<<< 冲突标记来切块，而是**直接对三个版本做 diff3 风格对齐**
  （base→ours、base→theirs 各自求 LCS 差异，再按 base 区间归并成「改动组」）。
  这与 IDEA 的实现路径一致，且在没有 diff3 标记（||| 样式）时同样能得到 BASE 内容。
-->
<template>
  <el-dialog
    v-model="visible"
    :title="title || '解决冲突'"
    :width="fullscreen ? '98%' : '1240px'"
    :top="fullscreen ? '1vh' : '4vh'"
    class="git-conflict-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="gcf" :class="{ 'is-fullscreen': fullscreen }" v-loading="loading">
      <div class="gcf-body">
        <!-- 左：冲突文件列表（宽度可拖） -->
        <aside class="gcf-side" :style="{ width: sideW + 'px' }">
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

        <div class="gcf-hdiv" title="拖动调整宽度" @mousedown="startSideDrag" />

        <!-- 右：三向冲突区 -->
        <section class="gcf-main" v-if="current">
          <div class="gcf-main-head">
            <span class="gcf-path" :title="current">{{ current }}</span>
            <span class="gcf-spacer" />
            <button class="gcf-btn sm" :disabled="!hasNonConflict" @click="acceptAll('left')">
              <el-icon :size="11"><DArrowLeft /></el-icon>全部接受左侧
            </button>
            <button class="gcf-btn sm" :disabled="!hasNonConflict" @click="acceptAll('right')">
              <el-icon :size="11"><DArrowRight /></el-icon>全部接受右侧
            </button>
            <span class="gcf-sep" />
            <button class="gcf-btn sm" @click="toggleFullscreen" :title="fullscreen ? '退出全屏' : '全屏'">
              <el-icon :size="11"><ScaleToOriginal v-if="fullscreen" /><FullScreen v-else /></el-icon>
              {{ fullscreen ? '退出全屏' : '全屏' }}
            </button>
          </div>

          <!-- 视图切换：三向对比 / 合并结果 -->
          <div class="gcf-tabs">
            <button class="gcf-tab" :class="{ on: pane === 'merge' }" @click="pane = 'merge'">
              三向对比
              <em v-if="conflictCount" class="gcf-badge warn">{{ conflictCount }} 处冲突</em>
              <em v-else class="gcf-badge ok">已无冲突</em>
            </button>
            <button class="gcf-tab" :class="{ on: pane === 'result' }" @click="pane = 'result'">
              合并结果
            </button>
            <span class="gcf-spacer" />
            <span class="gcf-hint">按块选择，或直接编辑结果区；块操作会按块重建结果</span>
          </div>

          <!-- ===== 三向对比（行级对齐，三列宽度可拖）===== -->
          <div v-show="pane === 'merge'" class="gcf-merge">
            <div ref="colsRef" class="gcf-cols" :style="{ '--c1': colW1 + 'px', '--c2': colW2 + 'px' }">
              <!-- 左：我的版本 -->
              <div class="gcf-col">
                <div class="gcf-col-head ours">
                  <span>我的版本</span><span class="gcf-col-sub">HEAD</span>
                  <span class="gcf-spacer" />
                  <span class="gcf-col-tag">{{ versionLineCount.ours }} 行</span>
                </div>
                <div class="gcf-col-body" ref="body1Ref" @scroll="onColScroll(1)">
                  <div
                    v-for="(r, i) in rows" :key="'o' + i"
                    class="gcf-line" :class="rowSideClass(r, 'ours')"
                  >
                    <span class="gcf-num">{{ r.oursNum ?? '' }}</span>
                    <span class="gcf-text">{{ r.ours }}</span>
                  </div>
                </div>
              </div>

              <div class="gcf-vdiv" title="拖动调整宽度" @mousedown="startColDrag(1, $event)" />

              <!-- 中：基线（IDEA 的 Base —— 两边改动的参照物） -->
              <div class="gcf-col">
                <div class="gcf-col-head base">
                  <span>基线</span><span class="gcf-col-sub">BASE</span>
                  <span class="gcf-spacer" />
                  <span class="gcf-col-tag">{{ versionLineCount.base }} 行</span>
                </div>
                <div class="gcf-col-body" ref="body2Ref" @scroll="onColScroll(2)">
                  <div
                    v-for="(r, i) in rows" :key="'b' + i"
                    class="gcf-line" :class="rowSideClass(r, 'base')"
                  >
                    <span class="gcf-num">{{ r.baseNum ?? '' }}</span>
                    <span class="gcf-text">{{ r.base }}</span>
                  </div>
                </div>
              </div>

              <div class="gcf-vdiv" title="拖动调整宽度" @mousedown="startColDrag(2, $event)" />

              <!-- 右：传入版本 -->
              <div class="gcf-col">
                <div class="gcf-col-head theirs">
                  <span>传入版本</span><span class="gcf-col-sub">MERGE_HEAD</span>
                  <span class="gcf-spacer" />
                  <span class="gcf-col-tag">{{ versionLineCount.theirs }} 行</span>
                </div>
                <div class="gcf-col-body" ref="body3Ref" @scroll="onColScroll(3)">
                  <div
                    v-for="(r, i) in rows" :key="'t' + i"
                    class="gcf-line" :class="rowSideClass(r, 'theirs')"
                  >
                    <span class="gcf-num">{{ r.theirsNum ?? '' }}</span>
                    <span class="gcf-text">{{ r.theirs }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 逐块取舍：一行 = 一个改动组 -->
            <div class="gcf-actions">
              <div class="gcf-actions-head">
                <span>改动块（{{ groups.length }}）</span>
                <span class="gcf-spacer" />
                <span class="gcf-legend"><i class="lg-conflict" />冲突</span>
                <span class="gcf-legend"><i class="lg-non" />仅一侧改动</span>
              </div>
              <div class="gcf-action-list">
                <div
                  v-for="(g, i) in groups" :key="'g' + i"
                  class="gcf-action-row"
                  :class="{ 'is-conflict': g.conflict }"
                >
                  <span class="gcf-action-idx">#{{ i + 1 }}</span>
                  <span class="gcf-action-kind" :class="g.conflict ? 'warn' : 'ok'">
                    {{ g.conflict ? '冲突' : '非冲突' }}
                  </span>
                  <span class="gcf-action-desc" :title="g.desc">{{ g.desc }}</span>
                  <span class="gcf-spacer" />
                  <button
                    class="gcf-pick" :class="{ on: choices[i] === 'left' }"
                    title="接受左侧（我的版本）"
                    @click="take(i, 'left')"
                  >◀ 左侧</button>
                  <button
                    class="gcf-pick" :class="{ on: choices[i] === 'both' }"
                    title="两侧都保留"
                    @click="take(i, 'both')"
                  >双方</button>
                  <button
                    class="gcf-pick" :class="{ on: choices[i] === 'right' }"
                    title="接受右侧（传入版本）"
                    @click="take(i, 'right')"
                  >右侧 ▶</button>
                </div>
                <div v-if="!groups.length" class="gcf-empty">两个版本没有差异，可直接保存</div>
              </div>
            </div>
          </div>

          <!-- ===== 合并结果：可直接编辑 ===== -->
          <div v-show="pane === 'result'" class="gcf-result">
            <div class="gcf-pane-head">合并结果（可直接编辑，保存后标记为已解决）</div>
            <el-input
              v-model="result"
              type="textarea"
              :rows="fullscreen ? 26 : 15"
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
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Check, WarningFilled, DArrowLeft, DArrowRight, FullScreen, ScaleToOriginal,
} from '@element-plus/icons-vue';
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
const fullscreen = ref(false);
const pane = ref<'merge' | 'result'>('merge');
/** 逐块选择：key = 改动组序号 → 取值来源 */
const choices = ref<Record<number, 'left' | 'right' | 'both'>>({});

// ════════════════════════════════════════════════════════════
//  diff3 风格三向对齐
// ═══════════════════════════════════════════════════════════
interface Hunk {
  /** base 侧区间 [aStart, aEnd)：纯插入时 aStart === aEnd */
  aStart: number;
  aEnd: number;
  /** 另一侧（ours/theirs）的替换区间 */
  bStart: number;
  bEnd: number;
}
interface ChangeGroup {
  aStart: number;
  aEnd: number;
  /** 该组内 base 的内容 */
  base: string[];
  /** 该组内左侧（ours）的最终内容 */
  ours: string[];
  /** 该组内右侧（theirs）的最终内容 */
  theirs: string[];
  conflict: boolean;
  desc: string;
}
interface MergeRow {
  base: string; ours: string; theirs: string;
  baseNum: number | null; oursNum: number | null; theirsNum: number | null;
  /** 该行所属改动组序号；-1 = 未改动上下文 */
  group: number;
  side: 'equal' | 'conflict' | 'ours' | 'theirs' | 'both';
}

/**
 * base → other 的行级差异，返回替换块。
 * 先剥离公共前后缀（真实场景改动很少，剥完核很小，DP 成本极低），
 * 再对核心区做 LCS；核心过大时放弃对齐（退化为「整段替换」），避免卡死。
 */
function diffHunks(a: string[], b: string[]): Hunk[] {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }

  const core = a.slice(s, ea);
  const coreB = b.slice(s, eb);
  const hunks: Hunk[] = [];
  const flush = (as: number, ae: number, bs: number, be: number) => {
    if (ae > as || be > bs) hunks.push({ aStart: s + as, aEnd: s + ae, bStart: s + bs, bEnd: s + be });
  };

  if (!core.length || !coreB.length || core.length * coreB.length > 2_000_000) {
    flush(0, core.length, 0, coreB.length);
    return hunks;
  }

  const n = core.length, m = coreB.length, W = m + 1;
  const dp = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = core[i] === coreB[j]
        ? dp[(i + 1) * W + (j + 1)] + 1
        : Math.max(dp[(i + 1) * W + j], dp[i * W + (j + 1)]);
    }
  }

  let ai = 0, bi = 0, sa = 0, sb = 0;
  while (ai < n || bi < m) {
    if (ai < n && bi < m && core[ai] === coreB[bi]) {
      flush(sa, ai, sb, bi);
      ai++; bi++; sa = ai; sb = bi;
    } else if (bi >= m || (ai < n && dp[(ai + 1) * W + bi] >= dp[ai * W + (bi + 1)])) {
      ai++;
    } else {
      bi++;
    }
  }
  flush(sa, ai, sb, bi);
  return hunks;
}

/** 在 base 区间内套用某一侧的改动，得到该侧在这一组里的最终内容 */
function applySide(base: string[], hunks: Hunk[], other: string[], aStart: number, aEnd: number): string[] {
  const own = hunks.filter((h) => h.aStart >= aStart && h.aEnd <= aEnd).sort((x, y) => x.aStart - y.aStart);
  const out: string[] = [];
  let p = aStart;
  for (const h of own) {
    for (let i = p; i < h.aStart; i++) out.push(base[i]);
    for (let i = h.bStart; i < h.bEnd; i++) out.push(other[i]);
    p = h.aEnd;
  }
  for (let i = p; i < aEnd; i++) out.push(base[i]);
  return out;
}

/** 三向归并：把两侧差异块按 base 区间合并成「改动组」 */
function buildGroups(base: string[], ours: string[], theirs: string[]): ChangeGroup[] {
  const hOurs = diffHunks(base, ours);
  const hTheirs = diffHunks(base, theirs);

  // 取所有块的 base 边界，凡相互重叠（含同点插入）的合成一组
  type Ev = { aStart: number; aEnd: number; side: 'ours' | 'theirs' };
  const evs: Ev[] = [
    ...hOurs.map((h) => ({ aStart: h.aStart, aEnd: h.aEnd, side: 'ours' as const })),
    ...hTheirs.map((h) => ({ aStart: h.aStart, aEnd: h.aEnd, side: 'theirs' as const })),
  ].sort((x, y) => (x.aStart - y.aStart) || (x.aEnd - y.aEnd));

  const groups: ChangeGroup[] = [];
  let i = 0;
  while (i < evs.length) {
    let aStart = evs[i].aStart;
    let aEnd = evs[i].aEnd;
    let j = i + 1;
    while (j < evs.length && evs[j].aStart <= aEnd) {   // 相邻/重叠即并入同组
      aEnd = Math.max(aEnd, evs[j].aEnd);
      j++;
    }
    const baseSlice = base.slice(aStart, aEnd);
    const oursSlice = applySide(base, hOurs, ours, aStart, aEnd);
    const theirsSlice = applySide(base, hTheirs, theirs, aStart, aEnd);

    const baseTxt = baseSlice.join('\n');
    const oursTxt = oursSlice.join('\n');
    const theirsTxt = theirsSlice.join('\n');
    const oursChanged = oursTxt !== baseTxt;
    const theirsChanged = theirsTxt !== baseTxt;
    // 双方都改了、且改得不一样 → 真冲突；否则是非冲突（可直接套用改动的那侧）
    const conflict = oursChanged && theirsChanged && oursTxt !== theirsTxt;

    let desc: string;
    if (conflict) {
      desc = `第 ${aStart + 1} 行起：两侧都改了同一处，需人工判断`;
    } else if (oursChanged) {
      desc = `第 ${aStart + 1} 行起：仅左侧改动`;
    } else if (theirsChanged) {
      desc = `第 ${aStart + 1} 行起：仅右侧改动`;
    } else {
      desc = `第 ${aStart + 1} 行起：两侧改动一致`;
    }
    groups.push({ aStart, aEnd, base: baseSlice, ours: oursSlice, theirs: theirsSlice, conflict, desc });
    i = j;
  }
  return groups;
}

const baseLines = computed(() => (versions.value.base || '').replace(/\r\n/g, '\n').split('\n'));
const oursLines = computed(() => (versions.value.ours || '').replace(/\r\n/g, '\n').split('\n'));
const theirsLines = computed(() => (versions.value.theirs || '').replace(/\r\n/g, '\n').split('\n'));

const groups = computed<ChangeGroup[]>(() => {
  // base 缺失时（无共同祖先）退化为「以 ours 为基线」，至少保证右侧改动可识别
  const b = versions.value.base ? baseLines.value : oursLines.value;
  return buildGroups(b, oursLines.value, theirsLines.value);
});

const conflictCount = computed(() => groups.value.filter((g) => g.conflict).length);
const hasNonConflict = computed(() => groups.value.some((g) => !g.conflict));

const versionLineCount = computed(() => ({
  ours: oursLines.value.length,
  base: baseLines.value.length,
  theirs: theirsLines.value.length,
}));

/** 三栏行级对齐：上下文 + 每个改动组补位成等长行 */
const rows = computed<MergeRow[]>(() => {
  const b = versions.value.base ? baseLines.value : oursLines.value;
  const out: MergeRow[] = [];
  let p = 0;
  // 行号：base 与 ours 的行号在未改动区段一一对应
  let baseNo = 1, oursNo = 1, theirsNo = 1;

  const pushEqual = (line: string) => {
    out.push({
      base: line, ours: line, theirs: line,
      baseNum: baseNo++, oursNum: oursNo++, theirsNum: theirsNo++,
      group: -1, side: 'equal',
    });
  };

  for (let gi = 0; gi < groups.value.length; gi++) {
    const g = groups.value[gi];
    for (let i = p; i < g.aStart; i++) pushEqual(b[i]);
    p = g.aEnd;

    const chosen = choices.value[gi];
    let side: MergeRow['side'] = 'equal';
    if (g.conflict) side = 'conflict';
    else if (g.ours.join('\n') !== g.base.join('\n') && g.theirs.join('\n') === g.base.join('\n')) side = 'ours';
    else if (g.theirs.join('\n') !== g.base.join('\n') && g.ours.join('\n') === g.base.join('\n')) side = 'theirs';
    else side = 'both';

    const n = Math.max(g.base.length, g.ours.length, g.theirs.length);
    for (let k = 0; k < n; k++) {
      const bL = g.base[k], oL = g.ours[k], tL = g.theirs[k];
      out.push({
        base: bL ?? '', ours: oL ?? '', theirs: tL ?? '',
        baseNum: bL !== undefined ? baseNo++ : null,
        oursNum: oL !== undefined ? oursNo++ : null,
        theirsNum: tL !== undefined ? theirsNo++ : null,
        group: gi,
        side: chosen ? 'both' : side,
      });
    }
  }
  for (let i = p; i < b.length; i++) pushEqual(b[i]);
  return out;
});

function rowSideClass(r: MergeRow, col: 'base' | 'ours' | 'theirs'): Record<string, boolean> {
  const num = col === 'base' ? r.baseNum : col === 'ours' ? r.oursNum : r.theirsNum;
  // 该列这一行没有内容（被另一侧的更多行挤出/补齐）→ 斜纹占位
  return {
    'is-gap': num === null,
    'is-conflict': r.side === 'conflict',
    'is-ours': r.side === 'ours' && col === 'ours',
    'is-theirs': r.side === 'theirs' && col === 'theirs',
    'is-both': r.side === 'both',
    'is-base-changed': r.side !== 'equal' && col === 'base' && r.base !== r.ours && r.base !== r.theirs,
  };
}

/** 非冲突块「自动套用」该取哪一侧：只按真正改动的那侧取，两侧都改（且一致）随便取一侧 */
function autoSide(g: ChangeGroup): 'left' | 'right' {
  const baseTxt = g.base.join('\n');
  const oursChanged = g.ours.join('\n') !== baseTxt;
  const theirsChanged = g.theirs.join('\n') !== baseTxt;
  if (oursChanged && !theirsChanged) return 'left';
  if (theirsChanged && !oursChanged) return 'right';
  return 'left'; // 两侧一致（或都没改）→ 取任一侧等价
}

/** 合并结果文本：逐块按选择重建（未选的冲突块保留标记，避免静默丢改动） */
function buildResult(): string {
  const b = versions.value.base ? baseLines.value : oursLines.value;
  const parts: string[] = [];
  let p = 0;
  for (let gi = 0; gi < groups.value.length; gi++) {
    const g = groups.value[gi];
    for (let i = p; i < g.aStart; i++) parts.push(b[i]);
    p = g.aEnd;

    const chosen = choices.value[gi];
    if (chosen === 'left') parts.push(...g.ours);
    else if (chosen === 'right') parts.push(...g.theirs);
    else if (chosen === 'both') {
      // 两侧都保留：分别成段（过滤掉空段），再一起压入
      const bothSlices = [g.ours, g.theirs].filter((x) => x.length > 0 && x.join('') !== '');
      for (const slice of bothSlices) parts.push(...slice);
    } else if (g.conflict) {
      parts.push('<<<<<<< HEAD', ...g.ours, '=======', ...g.theirs, '>>>>>>> MERGE_HEAD');
    } else {
      // ★ 非冲突自动套用：必须按「真正改动的那一侧」取
      //   （曾固定取 g.ours，导致「只有右侧改动」的块把改动静默丢掉）
      parts.push(...(autoSide(g) === 'right' ? g.theirs : g.ours));
    }
  }
  for (let i = p; i < b.length; i++) parts.push(b[i]);
  return parts.join('\n');
}

function take(i: number, side: 'left' | 'right' | 'both'): void {
  choices.value = { ...choices.value, [i]: side };
  result.value = buildResult();
}

/** 批量接受某一侧：**仅非冲突块**（对齐 IDEA 的 Apply Non-Conflicting Changes）
 *  注意：非冲突块里「改动其实发生在另一侧」时，仍按**实际改动侧**套用，
 *  否则「全部接受左侧」会把仅右侧改动的块改回 base，静默丢掉右侧改动。 */
function acceptAll(side: 'left' | 'right'): void {
  if (!hasNonConflict.value) {
    ElMessage.info('没有可直接套用的非冲突改动，请逐块选择');
    return;
  }
  const next: Record<number, 'left' | 'right' | 'both'> = { ...choices.value };
  let n = 0;
  groups.value.forEach((g, i) => {
    if (g.conflict) return;
    // 两侧都有改动（且一致）时用用户指定的侧；只有一侧改动时用实际改动侧
    const baseTxt = g.base.join('\n');
    const oursChanged = g.ours.join('\n') !== baseTxt;
    const theirsChanged = g.theirs.join('\n') !== baseTxt;
    next[i] = oursChanged && theirsChanged ? side : autoSide(g);
    n++;
  });
  choices.value = next;
  result.value = buildResult();
  ElMessage.success(`已套用 ${n} 处非冲突改动（${side === 'left' ? '左侧' : '右侧'}）`);
}

// ════════════════════════════════════════════════════════════
//  三列同步滚动
// ════════════════════════════════════════════════════════════
/**
 * 三列各自是滚动容器（横向滚动独立、互不干扰），纵向需要同步 ——
 * 这是 IDEA 的 Synchronize Scrolling：滚一列，另外两列跟着走，否则行级对齐就白做了。
 * 用 syncing 标志防回环（否则 A→B→A 互相触发会抖动）。
 */
const body1Ref = ref<HTMLElement | null>(null);
const body2Ref = ref<HTMLElement | null>(null);
const body3Ref = ref<HTMLElement | null>(null);
let syncing = false;

function onColScroll(which: 1 | 2 | 3): void {
  if (syncing) return;
  syncing = true;
  const src = which === 1 ? body1Ref.value : which === 2 ? body2Ref.value : body3Ref.value;
  if (!src) { syncing = false; return; }
  const top = src.scrollTop;
  for (const el of [body1Ref.value, body2Ref.value, body3Ref.value]) {
    if (el && el !== src && el.scrollTop !== top) el.scrollTop = top;
  }
  // 下一帧再解锁：滚动赋值触发的 scroll 事件在同步队列内派发，立即解锁仍会回环
  requestAnimationFrame(() => { syncing = false; });
}

// ════════════════════════════════════════════════════════════
//  宽度拖动
// ════════════════════════════════════════════════════════════
const sideW = ref(240);
const colW1 = ref(340);
const colW2 = ref(300);
const colsRef = ref<HTMLElement | null>(null);

function dragX(
  startVal: number, e: MouseEvent, min: number,
  maxVal: () => number, apply: (v: number) => void, onEnd?: () => void,
): void {
  const startX = e.clientX;
  const onMove = (ev: MouseEvent) => {
    const v = Math.round(startVal + (ev.clientX - startX));
    apply(Math.max(min, Math.min(maxVal(), v)));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onEnd?.();
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
}

function startSideDrag(e: MouseEvent): void {
  dragX(sideW.value, e, 160, () => Math.max(240, window.innerWidth * 0.4), (v) => { sideW.value = v; });
}

/** idx=1 → 拖第 1 根分隔条（左列宽）；idx=2 → 第 2 根（中列宽） */
function startColDrag(idx: 1 | 2, e: MouseEvent): void {
  const cols = colsRef.value;
  const total = cols ? cols.getBoundingClientRect().width : window.innerWidth * 0.6;
  const MIN = 110;
  if (idx === 1) {
    dragX(colW1.value, e, MIN, () => Math.max(MIN, total - colW2.value - MIN - 16), (v) => { colW1.value = v; });
  } else {
    dragX(colW2.value, e, MIN, () => Math.max(MIN, total - colW1.value - MIN - 16), (v) => { colW2.value = v; });
  }
}

/** 窄容器保护：按比例把三列宽收进容器，否则右列会被挤没 */
function clampColsToContainer(): void {
  const cols = colsRef.value;
  if (!cols) return;
  const total = cols.getBoundingClientRect().width;
  if (total <= 0) return;
  const MIN = 110;
  const avail = total - MIN - 16;
  const sum = colW1.value + colW2.value;
  if (sum > avail && sum > 0) {
    const k = Math.max(MIN * 2, avail) / sum;
    colW1.value = Math.max(MIN, Math.round(colW1.value * k));
    colW2.value = Math.max(MIN, Math.round(colW2.value * k));
  }
}

function toggleFullscreen(): void {
  fullscreen.value = !fullscreen.value;
  void nextTick(clampColsToContainer);
}

// ═══════════════════════════════════════════════════════════
//  生命周期
// ═══════════════════════════════════════════════════════════
watch(
  () => [props.modelValue, props.files] as const,
  ([open, files]) => {
    if (!open) return;
    resolved.value = {};
    result.value = '';
    versions.value = { base: '', ours: '', theirs: '' };
    choices.value = {};
    pane.value = 'merge';
    current.value = files && files.length ? files[0] : '';
    if (current.value) void loadVersions(current.value);
  },
  { immediate: true },
);

/** 三版本加载完 → 初始化合并结果（非冲突自动套用，冲突保留标记） */
watch([groups, () => versions.value], () => {
  // 仅在没有用户干预（无 choices）且结果为空时初始化，避免覆盖用户编辑
  if (Object.keys(choices.value).length) return;
  if (!versions.value.ours && !versions.value.theirs) return;
  result.value = buildResult();
}, { immediate: true });

async function loadVersions(path: string): Promise<void> {
  loading.value = true;
  try {
    const [v, work] = await Promise.all([
      gitStore.conflictVersions(props.repo, path),
      gitStore.readFile(props.repo, path).catch(() => ''),
    ]);
    versions.value = v;
    // 工作区内容优先（用户可能已手工改过一部分）
    result.value = work || buildResult();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
    await nextTick();
    clampColsToContainer();
  }
}

function pick(path: string): void {
  if (path === current.value) return;
  current.value = path;
  choices.value = {};
  void loadVersions(path);
}

async function saveCurrent(): Promise<void> {
  if (!current.value) return;
  // 结果里还有冲突标记时提醒（IDEA 同样会拦这种「未真正解决」的提交）
  if (/^<{7}/m.test(result.value)) {
    try {
      await ElMessageBox.confirm('合并结果里仍有冲突标记（<<<<<<<），确定保存吗？', '仍有冲突标记', {
        confirmButtonText: '仍然保存', cancelButtonText: '回去继续改', type: 'warning',
      });
    } catch { return; }
  }
  saving.value = true;
  try {
    const res = await gitStore.resolveContent(props.repo, current.value, result.value);
    if ('error' in res) throw new Error(res.error);
    resolved.value = { ...resolved.value, [current.value]: true };
    ElMessage.success('已标记为已解决');
    emit('resolved', { file: current.value });
    const next = props.files.find((f) => !resolved.value[f]);
    if (next) { current.value = next; choices.value = {}; await loadVersions(next); }
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

onBeforeUnmount(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});
</script>

<style scoped>
.gcf { display: flex; flex-direction: column; }
.gcf-body { display: flex; gap: 0; min-height: 520px; height: 70vh; }
.gcf.is-fullscreen .gcf-body { height: 82vh; }
.gcf-spacer { flex: 1; }
.gcf-sep { width: 1px; height: 14px; background: var(--glass-border, #e7e4dc); }

/* ===== 左侧文件列表 ===== */
.gcf-side {
  flex-shrink: 0; display: flex; flex-direction: column;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 8px;
  background: var(--glass-bg-soft, #fbfaf7); overflow: hidden;
}
.gcf-hdiv { flex: 0 0 7px; cursor: col-resize; position: relative; }
.gcf-hdiv::after {
  content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 2px;
  transform: translateX(-50%); background: transparent; transition: background 0.15s;
}
.gcf-hdiv:hover::after { background: var(--color-primary, #4f46e5); }
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
.gcf-link { border: none; background: none; cursor: pointer; font-size: 11px; color: var(--color-text-soft, #6b6b6b); padding: 0; }
.gcf-link.danger { color: #b91c1c; }
.gcf-link:hover { text-decoration: underline; }

/* ===== 主区 ===== */
.gcf-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding-left: 10px; }
.gcf-main-empty {
  align-items: center; justify-content: center; font-size: 13px;
  color: var(--color-text-muted, #9a9a9a);
  border: 1px dashed var(--glass-border, #e7e4dc); border-radius: 8px;
}
.gcf-main-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gcf-path {
  font-size: 12px; font-family: "JetBrains Mono", monospace;
  color: var(--color-text-soft, #6b6b6b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 42%;
}

/* ===== 视图切换 ===== */
.gcf-tabs { display: flex; align-items: center; gap: 6px; }
.gcf-tab {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--glass-border, #e7e4dc); background: #fff; border-radius: 6px;
  padding: 3px 10px; font-size: 12px; cursor: pointer; color: var(--color-text-soft, #6b6b6b);
}
.gcf-tab.on {
  border-color: var(--color-primary, #4f46e5);
  color: var(--color-primary, #4f46e5);
  background: color-mix(in srgb, var(--color-primary, #4f46e5) 8%, transparent);
  font-weight: 600;
}
.gcf-badge { font-style: normal; font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.gcf-badge.warn { background: rgba(239, 68, 68, 0.14); color: #b91c1c; }
.gcf-badge.ok { background: rgba(16, 185, 129, 0.14); color: #047857; }
.gcf-hint { font-size: 11px; color: var(--color-text-muted, #9a9a9a); }

/* ===== 三向对齐区 ===== */
.gcf-merge { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.gcf-cols {
  display: grid;
  grid-template-columns: minmax(110px, var(--c1, 340px)) 7px minmax(110px, var(--c2, 300px)) 7px minmax(110px, 1fr);
  flex: 1;
  min-height: 0;
  /* 关键：grid 行必须能收缩（默认 auto 会撑高，列内滚动条就不出现） */
  grid-template-rows: minmax(0, 1fr);
  border: 1px solid var(--glass-border-soft, #f0eee8);
  border-radius: 8px;
  overflow: hidden;
}
.gcf-col { display: flex; flex-direction: column; min-width: 0; }
.gcf-col-head {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; font-size: 11px; font-weight: 600; flex-shrink: 0;
  background: var(--glass-bg-soft, #f5f3ee); color: var(--color-text-soft, #6b6b6b);
}
.gcf-col-head.ours { background: #eef2ff; color: #3730a3; }
.gcf-col-head.base { background: #f5f3ee; color: #57534e; }
.gcf-col-head.theirs { background: #ecfdf5; color: #065f46; }
.gcf-col-sub { font-weight: 400; opacity: 0.7; font-size: 10px; }
.gcf-col-tag { font-size: 10px; font-weight: 400; opacity: 0.75; }
/* 每列：表头固定，体区纵向滚动（三列同步，见 onColScroll）；横向各自滚动 */
.gcf-col-body { flex: 1; min-height: 0; overflow: auto; background: #fff; }
.gcf-vdiv { cursor: col-resize; background: var(--glass-border-soft, #f0eee8); position: relative; transition: background 0.15s; }
.gcf-vdiv::after { content: ''; position: absolute; inset: 0 -2px; }
.gcf-vdiv:hover { background: var(--color-primary, #4f46e5); }

/* 行：固定行高保证三列严格对齐 */
.gcf-line {
  display: flex; align-items: stretch;
  height: 18px; line-height: 18px; width: max-content; min-width: 100%;
}
.gcf-num {
  flex: 0 0 40px; width: 40px; padding: 0 5px 0 0; text-align: right;
  font-size: 10px; color: var(--el-text-color-placeholder, #94a3b8);
  background: var(--glass-bg-soft, #f7f5f0);
  border-right: 1px solid var(--glass-border-soft, #f0eee8);
  box-sizing: border-box;
  position: sticky; left: 0; z-index: 1;
}
.gcf-text {
  flex: 1 0 auto; padding: 0 10px 0 5px;
  white-space: pre; font-family: "JetBrains Mono", monospace; font-size: 11px;
  color: var(--color-text, #1a1a1a);
}
/* 行状态着色 */
.gcf-line.is-gap { background: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(15, 23, 42, 0.03) 4px, rgba(15, 23, 42, 0.03) 8px); }
.gcf-line.is-conflict .gcf-text { background: rgba(239, 68, 68, 0.1); color: #b91c1c; }
.gcf-line.is-ours .gcf-text { background: rgba(16, 185, 129, 0.1); color: #047857; }
.gcf-line.is-theirs .gcf-text { background: rgba(16, 185, 129, 0.1); color: #047857; }
.gcf-line.is-both .gcf-text { background: rgba(79, 70, 229, 0.08); color: #3730a3; }
.gcf-line.is-base-changed .gcf-text { background: rgba(15, 23, 42, 0.05); color: #57534e; }

/* ===== 逐块取舍 ===== */
.gcf-actions {
  flex-shrink: 0; max-height: 34%; display: flex; flex-direction: column;
  border: 1px solid var(--glass-border-soft, #f0eee8); border-radius: 8px;
  background: var(--glass-bg-soft, #fbfaf7); overflow: hidden;
}
.gcf-actions-head {
  display: flex; align-items: center; gap: 10px; padding: 5px 8px;
  font-size: 11px; font-weight: 600; color: var(--color-text-soft, #6b6b6b);
  border-bottom: 1px solid var(--glass-border-soft, #f0eee8);
}
.gcf-legend { display: inline-flex; align-items: center; gap: 4px; font-weight: 400; }
.gcf-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.lg-conflict { background: rgba(239, 68, 68, 0.35); }
.lg-non { background: rgba(16, 185, 129, 0.3); }
.gcf-action-list { flex: 1; overflow: auto; }
.gcf-action-row {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px;
  font-size: 12px; border-bottom: 1px solid var(--glass-border-soft, #f4f2ec);
}
.gcf-action-row:last-child { border-bottom: none; }
.gcf-action-row.is-conflict { background: rgba(239, 68, 68, 0.05); }
.gcf-action-idx { font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--color-text-muted, #9a9a9a); min-width: 26px; }
.gcf-action-kind { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; }
.gcf-action-kind.warn { background: rgba(239, 68, 68, 0.14); color: #b91c1c; }
.gcf-action-kind.ok { background: rgba(16, 185, 129, 0.14); color: #047857; }
.gcf-action-desc { font-size: 11px; color: var(--color-text-soft, #6b6b6b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
.gcf-pick {
  border: 1px solid var(--glass-border, #e7e4dc); background: #fff; border-radius: 5px;
  padding: 2px 8px; font-size: 11px; cursor: pointer; flex-shrink: 0;
  color: var(--color-text, #1a1a1a);
}
.gcf-pick:hover { border-color: var(--color-primary, #4f46e5); color: var(--color-primary, #4f46e5); }
.gcf-pick.on {
  border-color: var(--color-primary, #4f46e5);
  background: color-mix(in srgb, var(--color-primary, #4f46e5) 12%, transparent);
  color: var(--color-primary, #4f46e5);
  font-weight: 600;
}

/* ===== 结果区 ===== */
.gcf-result { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.gcf-pane-head {
  font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px 6px 0 0;
  background: var(--glass-bg-soft, #f5f3ee); color: var(--color-text-soft, #6b6b6b);
}
.gcf-editor { flex: 1; min-height: 0; }
.gcf-editor :deep(textarea) {
  font-family: "JetBrains Mono", monospace; font-size: 11px; line-height: 1.5;
  height: 100% !important;
}

/* ===== 底栏 ===== */
.gcf-foot { display: flex; align-items: center; gap: 8px; }
.gcf-foot-tip { font-size: 12px; color: var(--color-text-soft, #6b6b6b); }
.gcf-foot-tip.ok { color: #15803d; }
.gcf-btn {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--glass-border, #e7e4dc); background: #fff;
  border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer;
  color: var(--color-text, #1a1a1a);
}
.gcf-btn.sm { padding: 3px 8px; font-size: 12px; }
.gcf-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.gcf-btn.primary { background: var(--color-primary, #c2410c); border-color: var(--color-primary, #c2410c); color: #fff; }
.gcf-btn.primary:hover:not(:disabled) { filter: brightness(1.06); color: #fff; }
.gcf-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>