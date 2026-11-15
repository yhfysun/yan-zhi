<script setup lang="ts">
// 传统文化 · 创作台（创作实践）：自拟对句评分 + 写诗评分。
// 评分引擎直接用 @yan-zhi/shared 的 scanCoupletFree / scanPoem / pingzeLine
// （口径：按普通话近似 1/2 声平、3/4 声仄 —— UI 必须显示一行小字标注，见 .cul-st-caliber）。
// 布局契约：输入区固定顶部、结果区独立滚动；浅色极简，类名用私有 cul-st-* 前缀。
// 保存作品走独立 localStorage key（yz.learning.culture.poems.v1），绝不混用其他进度 key。
import { ref } from 'vue';
import {
  scanCoupletFree,
  scanPoem,
  pingzeLine,
  type CoupletFreeResult,
  type PoemForm,
  type PoemScanResult,
  type PingzeLine,
} from '@yan-zhi/shared';
import NoteQuickCreateDialog from '../../notes/NoteQuickCreateDialog.vue';

// ===== 子 Tab =====
const subTab = ref<'couplet' | 'poem'>('couplet');

// ===== 对句区 =====
const COUPLET_PRESETS = ['风来花自舞', '白日依山尽', '天上明月', '雨'];
const coupletUpper = ref('');
const coupletLower = ref('');
const coupletResult = ref<CoupletFreeResult | null>(null);
const coupletToneA = ref<PingzeLine | null>(null);
const coupletToneB = ref<PingzeLine | null>(null);
const coupletHint = ref('');

function pickPreset(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v) {
    coupletUpper.value = v;
    coupletResult.value = null;
    coupletToneA.value = null;
    coupletToneB.value = null;
  }
}

function scoreCouplet() {
  if (!coupletUpper.value.trim() || !coupletLower.value.trim()) {
    coupletHint.value = '先把上联和下联都填上。';
    coupletResult.value = null;
    return;
  }
  coupletHint.value = '';
  coupletResult.value = scanCoupletFree(coupletUpper.value, coupletLower.value);
  // 逐字平仄标注：上下联各一排「平/仄」小徽标（未知字标「？」）
  coupletToneA.value = pingzeLine(coupletUpper.value);
  coupletToneB.value = pingzeLine(coupletLower.value);
}

// ===== 写诗区 =====
const poemForm = ref<PoemForm>('五言绝句');
const poemLines = ref<string[]>(['', '', '', '']);
const poemResult = ref<PoemScanResult | null>(null);
const poemHint = ref('');

function scorePoem() {
  if (!poemLines.value.some((s) => s.trim())) {
    poemHint.value = '至少写一句再评分。';
    poemResult.value = null;
    return;
  }
  poemHint.value = '';
  poemResult.value = scanPoem(poemLines.value, poemForm.value);
}

// ===== 保存作品（独立 key：yz.learning.culture.poems.v1） =====
const POEMS_KEY = 'yz.learning.culture.poems.v1';
type SavedPoem = { id: string; form: PoemForm; lines: string[]; score: number; at: string };
const saveHint = ref('');

function readPoems(): SavedPoem[] {
  try {
    const raw = localStorage.getItem(POEMS_KEY);
    return raw ? (JSON.parse(raw) as SavedPoem[]) : [];
  } catch { return []; }
}

function savePoem() {
  const r = poemResult.value;
  if (!r) return;
  const list = readPoems();
  list.push({
    id: `poem_${Date.now()}`,
    form: poemForm.value,
    lines: poemLines.value.map((s) => s.trim()).filter(Boolean),
    score: r.score,
    at: new Date().toISOString(),
  });
  try {
    localStorage.setItem(POEMS_KEY, JSON.stringify(list));
    saveHint.value = `已保存，共 ${list.length} 篇。`;
  } catch {
    saveHint.value = '本地存储不可用，未保存。';
  }
}

// ===== 记到笔记（预填首句为标题、全诗 + 评分为正文） =====
const noteVisible = ref(false);
const noteTitle = ref('');
const noteContent = ref('');
const noteCategory = ref('');

function openPoemNote() {
  const lines = poemLines.value.map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return;
  const r = poemResult.value;
  noteTitle.value = `${lines[0]}…`;
  noteContent.value = `${lines.join('\n')}${r ? `\n\n评分 ${r.score} 分：${r.summary}` : ''}`;
  noteCategory.value = '我的创作';
  noteVisible.value = true;
}
</script>

<template>
  <section class="cul-studio">
    <!-- 子 Tab：极简，无图标 -->
    <nav class="cul-st-tabs" aria-label="创作类型">
      <button type="button" class="cul-st-tab" :class="{ active: subTab === 'couplet' }" @click="subTab = 'couplet'">对句</button>
      <button type="button" class="cul-st-tab" :class="{ active: subTab === 'poem' }" @click="subTab = 'poem'">写诗</button>
    </nav>

    <!-- 输入区：固定顶部不滚 -->
    <div v-if="subTab === 'couplet'" class="cul-st-inputs">
      <select class="cul-st-preset" aria-label="示例出句" @change="pickPreset">
        <option value="" disabled selected>选一个示例出句，或直接手输上联</option>
        <option v-for="p in COUPLET_PRESETS" :key="p" :value="p">{{ p }}</option>
      </select>
      <input v-model="coupletUpper" class="cul-st-upper" placeholder="上联（出句）" aria-label="上联">
      <input
        v-model="coupletLower"
        class="cul-st-lower"
        placeholder="下联（对句）"
        aria-label="下联"
        @keyup.enter="scoreCouplet"
      >
      <button type="button" class="cul-st-score-btn" @click="scoreCouplet">评分</button>
      <p v-if="coupletHint" class="cul-st-hint">{{ coupletHint }}</p>
    </div>

    <div v-else class="cul-st-inputs">
      <select v-model="poemForm" class="cul-st-form" aria-label="体裁">
        <option value="五言绝句">五言绝句</option>
        <option value="七言绝句">七言绝句</option>
      </select>
      <input
        v-for="i in 4"
        :key="i"
        v-model="poemLines[i - 1]"
        class="cul-st-poem-line"
        :placeholder="`第 ${i} 句`"
        :aria-label="`第 ${i} 句`"
      >
      <button type="button" class="cul-st-score-btn cul-st-poem-score" @click="scorePoem">评分</button>
      <p v-if="poemHint" class="cul-st-hint">{{ poemHint }}</p>
    </div>

    <!-- 结果区：独立滚动 -->
    <div class="cul-st-result">
      <!-- 对句结果卡 -->
      <article v-if="subTab === 'couplet' && coupletResult" class="cul-st-card">
        <div class="cul-st-score">
          <b class="cul-st-score-num">{{ coupletResult.score }}</b>
          <span>分</span>
          <p class="cul-st-summary">{{ coupletResult.summary }}</p>
        </div>
        <ul class="cul-st-checks">
          <li :class="{ ok: coupletResult.lengthOk, bad: !coupletResult.lengthOk }">
            字数 {{ coupletResult.lenA }} / {{ coupletResult.lenB }}{{ coupletResult.lengthOk ? '' : '——上下联字数要相等' }}
          </li>
          <li v-if="coupletResult.lengthOk" :class="{ ok: coupletResult.tonePairOk, bad: !coupletResult.tonePairOk }">
            {{ coupletResult.firstMismatch ?? '逐字平仄相对' }}
          </li>
          <li :class="{ ok: coupletResult.endOk, bad: !coupletResult.endOk }">
            仄起平收：{{ coupletResult.endOk ? '上联仄收、下联平收' : '上联末字宜仄、下联末字宜平' }}
          </li>
          <li :class="{ ok: coupletResult.dupOk, bad: !coupletResult.dupOk }">
            重字检查：{{ coupletResult.dupOk ? '同位无重字' : '有同位重字，换一个字试试' }}
          </li>
        </ul>
        <div v-if="coupletToneA && coupletToneB" class="cul-st-tones">
          <div class="cul-st-tone-line">
            <span class="cul-st-tone-text">{{ coupletUpper }}</span>
            <span class="cul-st-tone-chars">
              <i
                v-for="(c, i) in coupletToneA.chars"
                :key="`a${i}`"
                :class="{ ping: c.tone === '平', ze: c.tone === '仄' }"
              >{{ c.tone === '未知' ? '？' : c.tone }}</i>
            </span>
          </div>
          <div class="cul-st-tone-line">
            <span class="cul-st-tone-text">{{ coupletLower }}</span>
            <span class="cul-st-tone-chars">
              <i
                v-for="(c, i) in coupletToneB.chars"
                :key="`b${i}`"
                :class="{ ping: c.tone === '平', ze: c.tone === '仄' }"
              >{{ c.tone === '未知' ? '？' : c.tone }}</i>
            </span>
          </div>
        </div>
        <p class="cul-st-caliber">按普通话近似口径评分，仅供参考</p>
      </article>

      <!-- 写诗结果卡 -->
      <template v-if="subTab === 'poem'">
        <article v-if="poemResult" class="cul-st-card">
          <div class="cul-st-score">
            <b class="cul-st-score-num">{{ poemResult.score }}</b>
            <span>分</span>
            <p class="cul-st-summary">{{ poemResult.summary }}</p>
          </div>
          <ul class="cul-st-checks">
            <li :class="{ ok: poemResult.formOk, bad: !poemResult.formOk }">
              句数 {{ poemResult.lineCount }} / {{ poemResult.requiredLines }}
            </li>
            <li :class="{ ok: poemResult.charsPerLineOk, bad: !poemResult.charsPerLineOk }">
              每句字数：{{ poemResult.charsPerLineOk ? '合格' : '有句子字数不对' }}
            </li>
            <li class="cul-st-rhyme" :class="{ ok: poemResult.rhymeOk, bad: !poemResult.rhymeOk }">
              押韵：{{ poemResult.rhymeKey ? `韵部 ${poemResult.rhymeKey}` : '待定' }} · {{ poemResult.rhymeOk ? '通过' : '未通过' }}
            </li>
            <li :class="{ ok: poemResult.pingzeWarn === 0, bad: poemResult.pingzeWarn > 0 }">
              平仄提示：{{ poemResult.pingzeWarn }} 处（只提示不判死）
            </li>
          </ul>
          <ul v-if="poemResult.issues.length" class="cul-st-issues">
            <li v-for="(it, i) in poemResult.issues" :key="i">{{ it.detail }}</li>
          </ul>
          <div class="cul-st-poem-tones">
            <div v-for="(ln, i) in poemResult.lines" :key="i" class="cul-st-tone-line">
              <span class="cul-st-tone-text">{{ ln.text }}</span>
              <span class="cul-st-tone-chars">
                <i
                  v-for="(c, ci) in ln.chars"
                  :key="ci"
                  class="cul-st-poem-tone-ch"
                  :class="{ ping: c.tone === '平', ze: c.tone === '仄' }"
                >{{ c.tone === '未知' ? '？' : c.tone }}</i>
              </span>
            </div>
          </div>
          <p class="cul-st-caliber">按普通话近似口径评分，仅供参考</p>
        </article>

        <div class="cul-st-ops">
          <button type="button" class="cul-st-save" :disabled="!poemResult" @click="savePoem">保存作品</button>
          <button type="button" class="cul-st-note-btn" @click="openPoemNote">记到笔记</button>
          <span v-if="saveHint" class="cul-st-hint">{{ saveHint }}</span>
        </div>
      </template>
    </div>

    <NoteQuickCreateDialog
      v-model:visible="noteVisible"
      :title="noteTitle"
      :content="noteContent"
      :category-name="noteCategory"
    />
  </section>
</template>

<style scoped>
.cul-studio { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; }

/* 子 Tab */
.cul-st-tabs {
  flex: 0 0 auto;
  display: inline-flex;
  gap: 2px;
  align-self: flex-start;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--glass-bg);
  padding: 2px;
}
.cul-st-tab { border: 0; border-radius: 999px; background: transparent; color: var(--color-text-secondary); padding: 5px 18px; font-size: 12px; cursor: pointer; }
.cul-st-tab.active { background: color-mix(in srgb, var(--color-primary) 12%, transparent); color: var(--color-primary); font-weight: 700; }

/* 输入区（固定顶部） */
.cul-st-inputs {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--glass-bg);
  padding: 12px;
}
.cul-st-preset, .cul-st-form { border: 1px solid var(--color-border); border-radius: 6px; padding: 7px 8px; font-size: 12px; background: var(--glass-bg-hover); color: var(--color-text); }
.cul-st-upper, .cul-st-lower, .cul-st-poem-line { border: 1px solid var(--color-border); border-radius: 6px; padding: 8px 10px; font-size: 14px; background: var(--glass-bg-hover); color: var(--color-text); }
.cul-st-poem-line { font-family: "Songti SC", "STSong", "SimSun", "Noto Serif SC", serif; }
.cul-st-score-btn { align-self: flex-start; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-primary-soft); color: var(--color-primary); padding: 7px 18px; font-size: 12px; cursor: pointer; }
.cul-st-hint { margin: 0; color: var(--color-text-tertiary); font-size: 11px; }

/* 结果区（独立滚动） */
.cul-st-result { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.cul-st-card { display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: #fffdf8; padding: 16px; }
.cul-st-score { display: flex; align-items: baseline; gap: 6px; border-bottom: 1px solid rgba(44, 42, 38, .08); padding-bottom: 10px; }
.cul-st-score-num { font-size: 34px; font-weight: 700; color: var(--color-primary); font-variant-numeric: tabular-nums; line-height: 1; }
.cul-st-score > span { color: var(--color-text-tertiary); font-size: 11px; }
.cul-st-summary { margin: 0 0 0 10px; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.cul-st-checks { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.cul-st-checks li { font-size: 12px; color: var(--color-text-secondary); }
.cul-st-checks li.ok { color: #2e7d5b; }
.cul-st-checks li.bad { color: #b45309; }
.cul-st-issues { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.cul-st-issues li { font-size: 12px; color: #b45309; line-height: 1.6; }
.cul-st-caliber { margin: 0; color: var(--color-text-tertiary); font-size: 10px; }

/* 逐字平仄标注（平/仄双色小字，未知标「？」） */
.cul-st-tones, .cul-st-poem-tones { display: flex; flex-direction: column; gap: 10px; }
.cul-st-tone-line { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.cul-st-tone-text { font-family: "Songti SC", "STSong", "SimSun", "Noto Serif SC", serif; font-size: 16px; letter-spacing: .1em; color: var(--color-text); }
.cul-st-tone-chars { display: inline-flex; gap: 14px; }
.cul-st-tone-chars i, .cul-st-poem-tone-ch { font-style: normal; font-size: 10px; color: var(--color-text-tertiary); min-width: 1.2em; text-align: center; }
.cul-st-tone-chars i.ping, .cul-st-poem-tone-ch.ping { color: #2e7d5b; }
.cul-st-tone-chars i.ze, .cul-st-poem-tone-ch.ze { color: #b45309; }

/* 写诗操作行 */
.cul-st-ops { display: flex; align-items: center; gap: 8px; }
.cul-st-ops button { border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-text); padding: 7px 14px; font-size: 12px; cursor: pointer; }
.cul-st-ops button:disabled { opacity: .4; cursor: default; }
</style>
