<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowRight,
  Check,
  ClipboardList,
  GitCompare,
  MessageSquareText,
  Puzzle,
  ScanLine,
  ShieldAlert,
} from 'lucide-vue-next';
import MedicalAnatomyGame from './MedicalAnatomyGame.vue';
import MedicalAtlas from './MedicalAtlas.vue';

type SyntheticCase = {
  id: string;
  title: string;
  label: string;
  facts: string;
  safety: string;
  observations: readonly string[];
  tcmLens: string;
  westernLens: string;
  question: string;
};

const props = defineProps<{
  courseName: string;
}>();

const emit = defineEmits<{
  'goto-lesson': [];
}>();

const SYNTHETIC_CASES: readonly SyntheticCase[] = [
  {
    id: 'chest-pressure',
    title: '病例 A · 活动中的胸部压迫感',
    label: '急救情境',
    facts: '58 岁合成病例。活动中出现胸骨后压榨感约 20 分钟，伴冷汗、恶心，休息后没有缓解记录。',
    safety: '这是教学病例。现实中若有人正在出现胸痛、呼吸困难、晕厥或意识改变，应立即联系当地急救系统。',
    observations: ['起病时间与活动关系', '胸部不适性质与持续时间', '冷汗、恶心、呼吸困难', '既往心血管病史与当前用药'],
    tcmLens: '教材可讨论“胸痹”相关传统描述和证候词汇，但不得据此排除心肌梗死，也不得用经典条文替代急救。',
    westernLens: '教材应优先识别急症风险，建立时间轴、生命体征和危险信号；诊断与处理由有资质的急救和医疗机构完成。',
    question: '哪些事实必须在就医沟通中讲清，哪些课程结论绝不能变成现场处置指令？',
  },
  {
    id: 'fever-cough',
    title: '病例 B · 持续三天的发热咳嗽',
    label: '门诊讨论情境',
    facts: '24 岁合成病例。发热、咳嗽三天，最高体温 38.2°C，呼吸平稳，无胸痛、意识改变或明显脱水表现记录。',
    safety: '教学病例不判断真实发热者的紧急程度。高龄、孕产期、免疫低下、呼吸费力或持续恶化等情况需要专业评估。',
    observations: ['体温曲线与测量方式', '咳嗽、痰液和呼吸状态', '接触史、旅行史与既往病史', '是否自行用药及效果'],
    tcmLens: '传统材料会记录寒热、汗出、口渴、舌象等证候信息；这些词只能作为学习记录，不能替代病原学、血常规或影像判断。',
    westernLens: '西医路径会区分症状控制、病因鉴别、检查指征和抗菌药使用条件；不是每个发热咳嗽都需要同一种检查或药物。',
    question: '同一组发热咳嗽信息，在两种路径里分别会追问什么，又都不能跳过什么？',
  },
  {
    id: 'chronic-followup',
    title: '病例 C · 慢病随访记录',
    label: '随访整理情境',
    facts: '62 岁合成病例。长期管理血糖，近一周记录了饮食、运动和多次家庭测量值；网络文章建议自行停用一种处方药。',
    safety: '教学病例提醒：不能根据课程或网络文章自行停药、减量或换药。用药变化必须由负责治疗的医生或药师评估。',
    observations: ['测量时间、设备与记录完整性', '饮食、活动和睡眠变化', '处方药、非处方药与保健品', '低血糖或其他不适记录'],
    tcmLens: '可学习传统理论如何描述饮食、情志与体质，但不能把“调理”写成停用慢病药物的理由。',
    westernLens: '可学习随访指标、依从性、药物相互作用和个体化目标；一次读数不等于治疗结论，需结合趋势和专业评估。',
    question: '怎样把随访记录整理给医生，同时不替医生决定药物？',
  },
] as const;

const selectedCaseId = ref(SYNTHETIC_CASES[0].id);
const activeWorkspace = ref<'case' | 'atlas' | 'game'>('case');
const checkedObservations = ref<string[]>([]);
const addedQuestion = ref('');
const summaryReady = ref(false);
const selectedCase = computed(() =>
  SYNTHETIC_CASES.find((item) => item.id === selectedCaseId.value) || SYNTHETIC_CASES[0],
);
const communicationSummary = computed(() => [
  `学习摘要 · ${props.courseName}`,
  `固定病例：${selectedCase.value.title}`,
  `教学标签：${selectedCase.value.label}`,
  `已核对：${checkedObservations.value.length ? checkedObservations.value.join('、') : '尚未勾选观察项'}`,
  `待向专业人员核对：${addedQuestion.value.trim() || selectedCase.value.question}`,
  '边界：合成病例，不构成对真人的诊断、处方、停药或急救指令。',
].join('\n'));

function selectCase(id: string) {
  selectedCaseId.value = id;
  checkedObservations.value = [];
  addedQuestion.value = '';
  summaryReady.value = false;
}

function toggleObservation(item: string) {
  checkedObservations.value = checkedObservations.value.includes(item)
    ? checkedObservations.value.filter((value) => value !== item)
    : [...checkedObservations.value, item];
  summaryReady.value = false;
}
</script>

<template>
  <section class="medical-studio" data-medical-studio>
    <header class="medical-studio-head">
      <div>
        <span>医学思考与沟通演练台 · {{ courseName }}</span>
        <h2>
          {{ activeWorkspace === 'case'
            ? '固定病例，双路径复盘'
            : activeWorkspace === 'atlas'
              ? '人体图鉴，先看位置再读病例'
              : '结构挑战，拼完再复盘' }}
        </h2>
        <p v-if="activeWorkspace === 'case'">所有病例均为预写合成资料。这里训练观察、提问与证据边界，不评估任何真实个人的病情。</p>
        <p v-else-if="activeWorkspace === 'atlas'">五层前视示意图帮助建立体表、器官、骨骼、血脉和经络的位置感；图鉴为教学简化，不是真人影像。</p>
        <p v-else>通过骨骼拼装、器官归位、穴位定位、动物对照、病程排序、术语与来源分拣，练习结构与证据关系；全部为示意模型，不做真实解剖操作。</p>
      </div>
      <ShieldAlert :size="26" aria-hidden="true" />
    </header>

    <nav class="medical-workspace-switcher" aria-label="医学实践工作区">
      <button
        type="button"
        :aria-pressed="activeWorkspace === 'case'"
        :class="{ active: activeWorkspace === 'case' }"
        @click="activeWorkspace = 'case'"
      >
        <ClipboardList :size="16" />病例演练
      </button>
      <button
        type="button"
        :aria-pressed="activeWorkspace === 'atlas'"
        :class="{ active: activeWorkspace === 'atlas' }"
        @click="activeWorkspace = 'atlas'"
      >
        <ScanLine :size="16" />人体图鉴
      </button>
      <button
        type="button"
        :aria-pressed="activeWorkspace === 'game'"
        :class="{ active: activeWorkspace === 'game' }"
        @click="activeWorkspace = 'game'"
      >
        <Puzzle :size="16" />解剖小游戏
      </button>
    </nav>

    <MedicalAtlas v-if="activeWorkspace === 'atlas'" />
    <MedicalAnatomyGame v-else-if="activeWorkspace === 'game'" />

    <template v-else>
    <nav class="medical-case-switcher" aria-label="选择合成病例">
      <button
        v-for="item in SYNTHETIC_CASES"
        :key="item.id"
        type="button"
        :class="{ active: item.id === selectedCaseId }"
        @click="selectCase(item.id)"
      >
        <span>{{ item.label }}</span>
        <b>{{ item.title }}</b>
      </button>
    </nav>

    <section class="medical-case-brief" aria-live="polite">
      <div>
        <span>{{ selectedCase.label }} · 合成病例</span>
        <h3>{{ selectedCase.title }}</h3>
        <p>{{ selectedCase.facts }}</p>
      </div>
      <aside>
        <ShieldAlert :size="18" aria-hidden="true" />
        <p>{{ selectedCase.safety }}</p>
      </aside>
    </section>

    <section class="medical-observation">
      <header>
        <ClipboardList :size="18" aria-hidden="true" />
        <div><span>观察与沟通</span><h3>先核对事实，再提出解释</h3></div>
      </header>
      <div class="medical-observation-grid">
        <fieldset>
          <legend>本病例需要核对</legend>
          <label v-for="item in selectedCase.observations" :key="item">
            <input
              type="checkbox"
              :checked="checkedObservations.includes(item)"
              @change="toggleObservation(item)"
            />
            <span>{{ item }}</span>
          </label>
        </fieldset>
        <label class="medical-question">
          <span>准备向专业人员核对的问题</span>
          <textarea
            v-model="addedQuestion"
            rows="5"
            maxlength="240"
            placeholder="只描述合成病例，不填写真人姓名、联系方式或可识别病历"
          />
          <small>{{ addedQuestion.length }} / 240</small>
        </label>
      </div>
    </section>

    <section class="medical-compare">
      <header>
        <GitCompare :size="18" aria-hidden="true" />
        <div><span>双路径解释</span><h3>并排看，不互相冒充</h3></div>
      </header>
      <div class="medical-compare-grid">
        <article>
          <span>中医学习视角</span>
          <b>证候、经典与整体反应</b>
          <p>{{ selectedCase.tcmLens }}</p>
        </article>
        <article>
          <span>西医学习视角</span>
          <b>机制、检查与危险分层</b>
          <p>{{ selectedCase.westernLens }}</p>
        </article>
      </div>
      <div class="medical-compare-rule">
        <b>共同底线</b>
        <span>急症先联系急救与专业医疗；不据课程诊断真人、开方、加量、停药或替代检查。</span>
      </div>
    </section>

    <section class="medical-communication">
      <header>
        <MessageSquareText :size="18" aria-hidden="true" />
        <div><span>就医沟通摘要</span><h3>事实、问题与边界分开写</h3></div>
      </header>
      <p>{{ selectedCase.question }}</p>
      <div class="medical-communication-actions">
        <button type="button" :disabled="checkedObservations.length < 2" @click="summaryReady = true">
          <Check :size="15" />生成学习摘要
        </button>
        <button type="button" @click="emit('goto-lesson')">
          回到课程<ArrowRight :size="15" />
        </button>
      </div>
      <pre v-if="summaryReady" aria-live="polite">{{ communicationSummary }}</pre>
      <small v-else>至少核对两项观察信息后生成；摘要只保存在当前页面。</small>
    </section>
    </template>
  </section>
</template>

<style scoped>
.medical-studio {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  background: var(--lv2-surface, #fff);
  color: var(--color-text, #17211e);
}

.medical-studio-head,
.medical-observation > header,
.medical-compare > header,
.medical-communication > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.medical-studio-head span,
.medical-observation header span,
.medical-compare header span,
.medical-communication header span {
  color: var(--lv2-accent, #1f6f5c);
  font-size: 9px;
  font-weight: 700;
}

.medical-studio-head h2,
.medical-observation h3,
.medical-compare h3,
.medical-communication h3 {
  margin: 4px 0 0;
  letter-spacing: 0;
}

.medical-studio-head h2 {
  font-size: 22px;
}

.medical-studio-head p,
.medical-case-brief p,
.medical-compare p,
.medical-communication p {
  margin: 7px 0 0;
  color: var(--lv2-muted, #748078);
  font-size: 11px;
  line-height: 1.75;
}

.medical-studio-head > svg {
  flex: 0 0 auto;
  color: var(--lv2-accent, #1f6f5c);
}

.medical-workspace-switcher {
  display: flex;
  gap: 6px;
}

.medical-workspace-switcher button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 13px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  font-size: 10px;
  cursor: pointer;
}

.medical-workspace-switcher button.active {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent, #1f6f5c);
  color: #fff;
  font-weight: 700;
}

.medical-case-switcher {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.medical-case-switcher button,
.medical-communication-actions button {
  min-height: 44px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-surface, #fff);
  color: inherit;
  cursor: pointer;
}

.medical-case-switcher button {
  padding: 9px 11px;
  text-align: left;
}

.medical-case-switcher button.active {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent-wash, var(--lv2-tint, #edf7f2));
}

.medical-case-switcher span,
.medical-case-brief span,
.medical-compare article span {
  display: block;
  color: var(--lv2-muted, #748078);
  font-size: 8px;
}

.medical-case-switcher b {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.45;
}

.medical-case-brief {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, .65fr);
  gap: 12px;
  padding: 15px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 8px;
  background: var(--lv2-card, #fafcfa);
}

.medical-case-brief h3 {
  margin: 5px 0 0;
  font-size: 17px;
}

.medical-case-brief aside {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px;
  border-left: 3px solid #b45309;
  background: #fff8ed;
}

.medical-case-brief aside svg {
  flex: 0 0 auto;
  color: #b45309;
}

.medical-case-brief aside p {
  margin: 0;
  color: #725d3c;
  font-size: 9px;
  line-height: 1.65;
}

.medical-observation,
.medical-compare,
.medical-communication {
  padding: 14px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 8px;
  background: var(--lv2-surface, #fff);
}

.medical-observation header,
.medical-compare header,
.medical-communication header {
  justify-content: flex-start;
}

.medical-observation header svg,
.medical-compare header svg,
.medical-communication header svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--lv2-accent, #1f6f5c);
}

.medical-observation h3,
.medical-compare h3,
.medical-communication h3 {
  font-size: 14px;
}

.medical-observation-grid,
.medical-compare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.medical-observation fieldset {
  min-width: 0;
  margin: 0;
  padding: 11px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
}

.medical-observation legend,
.medical-question > span {
  padding: 0 4px;
  color: var(--lv2-muted, #748078);
  font-size: 9px;
  font-weight: 700;
}

.medical-observation label {
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  color: var(--color-text, #17211e);
  font-size: 10px;
}

.medical-observation input {
  width: 17px;
  height: 17px;
  accent-color: var(--lv2-accent, #1f6f5c);
}

.medical-question {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 9px 10px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
}

.medical-question textarea {
  width: 100%;
  min-height: 122px;
  margin-top: 7px;
  resize: vertical;
  padding: 9px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 6px;
  background: var(--lv2-surface, #fff);
  color: var(--color-text, #17211e);
  font: inherit;
  font-size: 11px;
  line-height: 1.65;
}

.medical-question small {
  align-self: flex-end;
  margin-top: 4px;
  color: var(--lv2-muted, #748078);
  font-size: 8px;
}

.medical-compare article {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: var(--lv2-card, #fafcfa);
}

.medical-compare article b {
  display: block;
  margin-top: 5px;
  font-size: 12px;
}

.medical-compare-rule {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  margin-top: 10px;
  padding: 9px 11px;
  border-radius: 7px;
  background: #f7f2e9;
  color: #6b5637;
  font-size: 9px;
  line-height: 1.65;
}

.medical-communication-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.medical-communication-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 9px;
}

.medical-communication-actions button:first-child {
  border-color: var(--lv2-accent, #1f6f5c);
  background: var(--lv2-accent, #1f6f5c);
  color: #fff;
  font-weight: 700;
}

.medical-communication-actions button:disabled {
  cursor: not-allowed;
  opacity: .45;
}

.medical-communication pre {
  margin: 11px 0 0;
  padding: 11px;
  overflow-wrap: anywhere;
  border: 1px solid var(--lv2-line, #dbe3df);
  border-radius: 7px;
  background: #f8faf8;
  color: #405047;
  font: 10px/1.7 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: pre-wrap;
}

.medical-communication > small {
  display: block;
  margin-top: 8px;
  color: var(--lv2-muted, #748078);
  font-size: 9px;
}

@media (max-width: 900px) {
  .medical-studio {
    padding: 12px;
  }

  .medical-studio-head h2 {
    font-size: 19px;
  }

  .medical-case-switcher,
  .medical-case-brief,
  .medical-observation-grid,
  .medical-compare-grid {
    grid-template-columns: 1fr;
  }

  .medical-case-switcher button,
  .medical-observation label,
  .medical-communication-actions button {
    min-height: 44px;
  }

  .medical-studio-head p,
  .medical-case-brief p,
  .medical-compare p,
  .medical-communication p {
    font-size: 12px;
  }
}

@media (max-width: 360px) {
  .medical-studio-head {
    display: block;
  }

  .medical-studio-head > svg {
    display: none;
  }

  .medical-case-switcher button {
    padding: 8px;
  }
}
</style>
