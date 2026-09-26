<!--
  WorkflowWorkbench.vue —— 工作流模式（第五模式 wf，路由 /workflow）

  两种形态（复用 four-mode-workspace 的 lead 机制，右下角悬浮切换）：
  - 运行模式 human：左=可运行工作流与历史，中=运行表单 + 运行面板，右=任务对话
  - AI 模式 ai：对话居中，运行面板收到右栏（本页只做排布切换，助手与工具化调用后续批次接入）

  共享会话：右栏直接用 chatStore 的 ChatMessageList / ChatInputArea，
  与办公/开发/运维/安全是同一个会话，手动跑出来的结果可以在对话里接着聊。
-->
<template>
  <div
    class="wf-page"
    :class="[`is-lead-${lead}`, { 'is-side-collapsed': sideCollapsed, 'is-chat-collapsed': chatCollapsed }]"
    :style="{ '--wf-side-w': sideW + 'px', '--wf-chat-w': chatW + 'px', '--wf-main-w': viewW + 'px' }"
  >
    <header class="wf-top">
      <span class="wf-badge" title="工作流模式（切换请用顶栏模式下拉）">
        <el-icon :size="13"><Connection /></el-icon>工作流模式
      </span>
      <span class="wf-hint">选一个工作流 → 填入参 → 运行，节点级进度实时可见</span>
      <span class="wf-spacer"></span>
      <!-- 三屏收起/展开（与开发模式同款交互：图标按钮 + 拖拽条） -->
      <button class="wf-icon-btn" :class="{ on: !sideCollapsed }" :title="sideCollapsed ? '展开工作流列表' : '收起工作流列表'" @click="toggleSidebar">
        <el-icon :size="13"><Fold v-if="!sideCollapsed" /><Expand v-else /></el-icon>
      </button>
      <button class="wf-icon-btn" :class="{ on: !chatCollapsed }" :title="chatCollapsed ? '展开对话' : '收起对话'" @click="toggleChat">
        <el-icon :size="13"><ChatDotRound v-if="!chatCollapsed" /><Expand v-else /></el-icon>
      </button>
      <!-- 形态切换：**收进顶栏**，不用右下角悬浮。
           悬浮位（LeadToggle 默认 right:16 / bottom:16）在本模式正好压在
           对话栏的发送按钮上（对话栏就在最右），两者叠在一起没法点。
           收进这一组图标按钮后，它和其它模式仍是同一个组件、同一个 lead 语义。
           「刷新」已由它取代：本页三栏的取数都有各自的触发点
           （切工作流、切形态、运行完成都会重新拉），单独一个刷新按钮是冗余的。 -->
      <LeadToggle class="wf-lead" :model-value="lead" mode="wf" @update:model-value="onLeadChange" />
    </header>

    <div class="wf-body">
      <!-- ===== 左栏：可运行工作流 + 运行历史 ===== -->
      <aside class="wf-side">
        <input v-model="keyword" class="wf-search" placeholder="搜索工作流…" />

        <div class="wf-sec">可运行工作流（{{ filtered.length }}）</div>
        <div class="wf-list">
          <div
            v-for="a in filtered"
            :key="a.id"
            class="wf-item"
            :class="{ active: a.id === selectedId }"
            @click="select(a.id)"
          >
            <span class="wf-item-name" :title="a.description || a.name">{{ a.name }}</span>
            <span class="wf-item-meta">{{ a.nodeCount }} 节点</span>
            <span
              v-if="a.lastRun"
              class="wf-dot"
              :class="`is-${a.lastRun.status}`"
              :title="`最近一次：${a.lastRun.status}`"
            ></span>
          </div>
          <div v-if="!filtered.length" class="wf-empty">暂无工作流型智能体</div>
        </div>

        <!-- 运行历史（折叠抽屉，默认收起）。
             放在**左栏列表下方**：它和「可运行工作流」是同一件事的两个时间面
             —— 上面能跑什么、下面跑过什么。原先放在中栏顶部会挤占运行表单。 -->
        <div class="wf-hist">
          <div class="wf-hist-head" @click="histOpen = !histOpen">
            <el-icon :size="12"><Clock /></el-icon>
            <span>运行历史（{{ wf.runs.value.length }}）</span>
            <span class="wf-hist-spacer"></span>
            <el-icon :size="12"><ArrowDown v-if="histOpen" /><ArrowRight v-else /></el-icon>
          </div>
          <!-- 收起时用一行摘要交代最近一次，不必展开也有信息 -->
          <div v-if="!histOpen && latestRun" class="wf-hist-latest">
            最近：{{ latestRun.agentName || latestRun.agentId }} · {{ runStatusText(latestRun.status) }} · {{ timeAgo(latestRun.createdAt) }}
          </div>
          <div v-if="histOpen" class="wf-hist-body">
            <div
              v-for="r in wf.runs.value"
              :key="r.id"
              class="wf-hist-item"
              :class="{ active: r.id === viewingRunId }"
              :title="r.error || ''"
              @click="viewRun(r)"
            >
              <span class="wf-dot" :class="`is-${r.status}`"></span>
              <span class="wf-hist-name">{{ r.agentName || r.agentId }}</span>
              <span class="wf-hist-status">{{ runStatusText(r.status) }}</span>
              <span class="wf-hist-time">{{ timeAgo(r.createdAt) }}</span>
            </div>
            <div v-if="!wf.runs.value.length" class="wf-empty">暂无运行记录</div>
          </div>
        </div>
      </aside>

      <!-- 拖拽条：列表 ↔ 中栏（收起时不渲染，避免留下不可见的空节点） -->
      <div v-if="!sideCollapsed" class="rs-handle is-side-handle" :class="{ dragging: sideR.dragging.value }" @mousedown="sideR.startDrag($event, 'left')"></div>

      <!-- AI 形态额外给运行台一条拖拽条（它在右侧，方向 left；对话收起时不渲染） -->
      <div v-if="lead === 'ai' && !chatCollapsed" class="rs-handle is-view-handle" :class="{ dragging: viewR.dragging.value }" @mousedown="viewR.startDrag($event, 'left')"></div>

      <!-- ===== 中栏（human）/ 右栏（ai）：运行台 ===== -->
      <section class="wf-main">
        <div v-if="!current" class="wf-blank">
          <el-icon :size="28"><Connection /></el-icon>
          <p>从左侧选择一个工作流</p>
        </div>

        <div v-else class="wf-run">
          <div class="wf-run-head">
            <div>
              <div class="wf-run-title">{{ current.name }}</div>
              <div class="wf-run-desc">{{ current.description || '（无描述）' }}</div>
            </div>
            <!-- 用 runNormal 包一层：直接把 run 挂到 @click 会把 PointerEvent 当 force 传进去，
                 导致「点运行」等价于「强制跳过预检」—— 必须显式包装 -->
            <button class="wf-btn primary" :disabled="starting" @click="runNormal">
              {{ starting ? '启动中…' : '运行' }}
            </button>
          </div>

          <div class="wf-form">
            <div v-if="!current.fields.length" class="wf-form-empty">该工作流未声明入参，可直接运行</div>
            <div v-for="f in current.fields" :key="f.key" class="wf-field">
              <label class="wf-label">
                {{ f.label || f.key }}
                <span v-if="f.required" class="wf-req">*</span>
              </label>
              <el-input
                v-if="f.type === 'string' && !isLong(f)"
                v-model="form[f.key]"
                size="small"
                :placeholder="f.description || f.key"
              />
              <el-input
                v-else-if="f.type === 'string'"
                v-model="form[f.key]"
                size="small"
                type="textarea"
                :rows="3"
                :placeholder="f.description || f.key"
              />
              <el-input-number v-else-if="f.type === 'number'" v-model="form[f.key]" size="small" />
              <el-switch v-else-if="f.type === 'boolean'" v-model="form[f.key]" size="small" />
              <el-input
                v-else
                v-model="form[f.key]"
                size="small"
                type="textarea"
                :rows="2"
                :placeholder="`${f.type}（JSON）`"
              />
            </div>
          </div>

          <div v-if="current.overrides.length" class="wf-override">
            <div class="wf-override-head" @click="overrideOpen = !overrideOpen">
              <span>覆盖节点配置（{{ current.overrides.length }}）</span>
              <el-icon :size="12"><ArrowDown v-if="overrideOpen" /><ArrowRight v-else /></el-icon>
            </div>
            <div v-if="overrideOpen" class="wf-override-body">
              <div v-for="o in current.overrides" :key="o.nodeId" class="wf-override-node">
                <div class="wf-override-title">
                  <span class="wf-node-type">{{ o.nodeType }}</span>
                  <span>{{ o.label || o.nodeId }}</span>
                </div>
                <div v-for="f in o.fields" :key="o.nodeId + '.' + f.key" class="wf-field is-inline">
                  <label class="wf-label">{{ f.label }}</label>

                  <!-- 模型：从平台下的模型列表选（不再让用户手打 modelId） -->
                  <el-select
                    v-if="f.control === 'model'"
                    v-model="overrideForm[o.nodeId][f.key]"
                    size="small"
                    clearable
                    filterable
                    placeholder="保持画布默认"
                    class="wf-ctl"
                  >
                    <!-- value 必须是主键 m.id：运行时按主键解析模型，写 m.modelId（API 名）
                         会导致「画布选着模型却报模型不存在」（短剧流水线的真实故障）。 -->
                    <el-option
                      v-for="m in modelsForPlatform(effectivePlatformOf(o))"
                      :key="m.id"
                      :value="m.id"
                      :label="`${m.alias || m.modelId}${m.type && m.type !== 'llm' ? ' · ' + m.type : ''}`"
                    />
                  </el-select>

                  <!-- 平台 -->
                  <el-select
                    v-else-if="f.control === 'platform'"
                    v-model="overrideForm[o.nodeId][f.key]"
                    size="small"
                    clearable
                    placeholder="保持画布默认"
                    class="wf-ctl"
                    @change="onOverridePlatformChange(o)"
                  >
                    <el-option v-for="p in platformStore.platforms" :key="p.id" :value="p.id" :label="p.name" />
                  </el-select>

                  <!-- 数值：温度/长度/迭代上限 -->
                  <el-input-number
                    v-else-if="f.control === 'number'"
                    v-model="overrideForm[o.nodeId][f.key]"
                    size="small"
                    :placeholder="currentHint(f)"
                    class="wf-ctl"
                  />

                  <el-switch v-else-if="f.control === 'boolean'" v-model="overrideForm[o.nodeId][f.key]" size="small" />

                  <el-input v-else v-model="overrideForm[o.nodeId][f.key]" size="small" :placeholder="currentHint(f)" class="wf-ctl" />

                  <span class="wf-current">{{ currentHint(f) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 预检未通过：逐条列出问题 + 允许「我知道，继续跑」 -->
          <div v-if="preflightIssues.length" class="wf-issues">
            <div class="wf-issues-title">
              <el-icon :size="13"><WarningFilled /></el-icon>
              运行前检查未通过（{{ preflightIssues.length }} 项）
            </div>
            <div v-for="(it, i) in preflightIssues" :key="i" class="wf-issue">
              <span class="wf-issue-code">{{ issueLabel(it.code) }}</span>
              <span class="wf-issue-msg">{{ it.msg }}</span>
              <span v-if="it.nodeId" class="wf-issue-node">节点 {{ it.nodeId }}</span>
            </div>
            <div class="wf-issues-actions">
              <button class="wf-btn" @click="preflightIssues = []">知道了，我去改</button>
              <button class="wf-btn" :disabled="starting" @click="runAnyway">忽略警告，仍然运行</button>
            </div>
          </div>

          <!-- 非阻断提示（不拦启动） -->
          <div v-else-if="warnings.length" class="wf-warns">
            <span v-for="(w, i) in warnings" :key="i">提示：{{ w.msg }}</span>
          </div>

          <div v-if="runId" class="wf-monitor">
            <RunMonitor :key="runId" :run-id="runId" @finish="onFinish" />
          </div>

          <DebugInspector
            v-if="current"
            :key="current.id"
            :agent="current"
            :inputs="collectedInputs()"
            :node-overrides="collectedOverrides()"
          />
        </div>
      </section>

      <!-- 拖拽条：中栏 ↔ 对话栏（任一侧收起时不渲染） -->
      <div v-if="!chatCollapsed" class="rs-handle is-chat-handle" :class="{ dragging: chatR.dragging.value }" @mousedown="chatR.startDrag($event, 'right')"></div>

      <!-- ===== 对话栏：human 在右、ai 居中 ===== -->
      <section class="wf-chat">
        <!-- 会话列表（与办公/开发模式一致：对话栏顶部管会话，不是工作流）。
             工作流挂载入口在输入框上方（见下方 wf-agent-bar）。
             二者分工：顶部 = 在哪个会话里聊；下方 = 这个会话的助手能用哪些工作流。 -->
        <div class="wf-conv-bar">
          <el-dropdown trigger="click" placement="bottom-start" popper-class="wf-conv-popper" @command="onConvCommand">
            <button class="wf-conv-trigger" type="button" :title="currentConvTitle">
              <el-icon :size="13"><ChatLineSquare /></el-icon>
              <span class="wf-conv-name">{{ currentConvTitle }}</span>
              <el-icon :size="10"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="__new__">
                  <span class="wf-conv-new"><el-icon :size="12"><Plus /></el-icon>新建任务</span>
                </el-dropdown-item>
                <el-dropdown-item
                  v-for="c in chat.store.conversations"
                  :key="c.id"
                  :command="c.id"
                  :divided="false"
                >
                  <span class="wf-conv-item" :class="{ on: c.id === chat.store.currentConvId }">
                    <span class="wf-conv-title">{{ c.title || '未命名任务' }}</span>
                    <el-icon v-if="c.id === chat.store.currentConvId" :size="12" class="wf-conv-check"><Check /></el-icon>
                  </span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <ChatMessageList />
        <!-- 挂载给助手：把工作流以 wf_<id> 工具的形式交给当前会话的助手调用。
             **放在输入框正上方**是对的位置 —— 它改变的是「这条会话里助手能干什么」，
             与「发消息」是同一件事的两面。
             这里曾放过一个「切换运行台目标工作流」的下拉，与左栏列表功能完全重复
             （都只调 select()），已移除：选来跑用左栏，交给助手用这里，动作不重叠。 -->
        <div class="wf-agent-bar">
          <WorkflowPicker />
        </div>
        <ChatInputArea />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ArrowDown, ArrowRight, WarningFilled, Clock, Fold, Expand, ChatDotRound, ChatLineSquare, Plus, Check } from '@element-plus/icons-vue';
import ChatMessageList from '../components/chat/ChatMessageList.vue';
import ChatInputArea from '../components/chat/ChatInputArea.vue';
import LeadToggle from '../components/workbench/LeadToggle.vue';
import RunMonitor from '../components/workflow/RunMonitor.vue';
import DebugInspector from '../components/workflow/DebugInspector.vue';
import WorkflowPicker from '../components/workflow/WorkflowPicker.vue';
import { useWorkflowStore } from '../stores/workflow';
import type { WorkflowAgentItem, WorkflowRunItem, OverridableNodeDef, PreflightIssue } from '../stores/workflow';
import { usePlatformStore } from '../stores/platform';
import { useAgentStore } from '../stores/agent';
import { leadOf, setLead, type LeadMode } from '../stores/mode';
import { useResizable } from '../composables/useResizable';
import { useChat } from '../composables/chat/useChat';

const wf = useWorkflowStore();
const platformStore = usePlatformStore();
// 会话列表要用 useChat 单例（与 ChatMessageList / ChatInputArea 同一个实例）
const chat = useChat();
const agentStore = useAgentStore();

/**
 * 工作流模式下 harness 智能体固定为「工作流助手」。
 *
 * 用户明确：这个模式里不该能换助手 —— 换了就会出现「拿 AI 短剧导演 / 日常办公助手
 * 去跑工作流」的错配，而它的提示词与工具集都不对口（工作流助手才挂 wf_* 工具、
 * 才有补参与节点排障的提示词）。
 *
 * 只锁定 UI 不够（用户看到的仍是旧名字），必须**进入本页就切过去**。
 * App.vue 的模式切换兜底只在「切模式那一刻」生效，覆盖不到「本来就在 wf 里」的情况。
 */
const FIXED_AGENT_ID = 'a_builtin_workflow_assistant';
function ensureFixedAgent() {
  // 该内置智能体尚未 seed（旧库/未升级）时不动，避免把会话绑到不存在的 id
  if (!agentStore.agents.some((a: { id: string }) => a.id === FIXED_AGENT_ID)) return;
  if (agentStore.selectedId === FIXED_AGENT_ID) return;
  chat.onAgentSwitch(FIXED_AGENT_ID);
}

const keyword = ref('');
const selectedId = ref('');
const form = reactive<Record<string, any>>({});
const overrideForm = reactive<Record<string, Record<string, any>>>({});
const overrideOpen = ref(false);
const starting = ref(false);
const runId = ref('');
const viewingRunId = ref('');
/** 预检未通过的问题清单（逐条展示，替代只弹一句「启动失败」） */
const preflightIssues = ref<PreflightIssue[]>([]);
/** 非阻断提示（如「没有输出节点」） */
const warnings = ref<PreflightIssue[]>([]);

/** 当前主导方（human = 运行模式 / ai = AI 模式）。与 dev/ops/sec 同一套 lead 语义。 */
const lead = computed(() => leadOf('wf'));

/**
 * 形态切换。
 * 用显式 handler 而不是 computed 的 setter：LeadToggle 是
 * `:model-value` + `@update:model-value` 的受控组件（与 dev/ops/sec 一致），
 * 走 computed setter 会让 @update:model-value 找不到对应的处理函数。
 * 只改 lead —— 会话、终端、运行记录全部保活（三栏都在，只换排布与伸缩关系）。
 */
function onLeadChange(v: LeadMode) {
  setLead('wf', v);
}

/** 运行历史抽屉（默认收起，中栏主区留给运行台） */
const histOpen = ref(false);
const latestRun = computed<WorkflowRunItem | null>(() => wf.runs.value[0] || null);

// ===== 三屏拖拽 + 收起（与开发模式同一套 useResizable / .rs-handle）=====
const sideR = useResizable('wf_sidebar', 260, 180, 420);
const chatR = useResizable('wf_chat', 352, 280, 720);
// 运行台在 AI 形态下是右固定栏，宽度同样可拖（human 形态它是 flex:1，此变量不生效）
const viewR = useResizable('wf_main_ai', 400, 320, 720);
const sideW = sideR.width;
const chatW = chatR.width;
const viewW = viewR.width;

/**
 * 两屏收起（列表 / 对话），localStorage 记录状态，刷新后保持。
 *
 * **运行台不提供收起**（用户拍板）：它是这个模式的主动作区，
 * 收掉之后页面只剩"选工作流"和"聊天"，工作流模式就没有存在意义了。
 * 因此这里只有 side / chat 两个开关；旧的 `view` 字段已移除。
 */
const COLLAPSE_KEY = 'yz:wf:collapsed';
type CollapseState = { side: boolean; chat: boolean };
const collapse = ref<CollapseState>(readCollapse());
function readCollapse(): CollapseState {
  try {
    const v = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}');
    // 旧版存过 { side, view, chat }，多出来的 view 直接忽略（读到也不报错）
    return { side: !!v.side, chat: !!v.chat };
  } catch { return { side: false, chat: false }; }
}
function writeCollapse() {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapse.value)); } catch { /* 隐私模式忽略 */ }
}
const sideCollapsed = computed(() => collapse.value.side);
const chatCollapsed = computed(() => collapse.value.chat);

/**
 * 收起用 display:none（加 is-collapsed 类），**不是把宽度设 0**。
 *
 * 为什么不用宽度 0（开发模式那套在这个页面会坏）：
 *   1) `.wf-side` 有 border-right、`.wf-main` 有 padding 14px 16px，
 *      `box-sizing: border-box` 下宽度 0 仍会占 1px / 32px（实测：收起后 main 还剩 33px）；
 *   2) 展开时无处记住用户拖过的宽度，只能硬编码回默认值（实测 340 被重置成 260）。
 * 用 display:none 之后宽度值原样留着，展开即恢复用户拖拽的宽度。
 */
function toggleSidebar() {
  collapse.value.side = !collapse.value.side;
  writeCollapse();
}
function toggleChat() {
  collapse.value.chat = !collapse.value.chat;
  writeCollapse();
}

/** 状态中文名（与 RunMonitor 保持同一套口径） */
function runStatusText(s: string): string {
  const m: Record<string, string> = {
    running: '运行中', completed: '已完成', failed: '失败', aborted: '已取消', paused: '断点暂停',
  };
  return m[s] || s;
}

// ===== 会话列表（对话栏顶部；与办公/开发模式一致，管会话而不是工作流）=====
// 注意：conversations / currentConvId 都在 chat store 上（chat.store.xxx），
// 不在 useChat 的返回根上（那是 composable，store 是它内部的 pinia）。
const currentConvTitle = computed(() => {
  const c = chat.store.conversations.find((x: { id: string }) => x.id === chat.store.currentConvId);
  return c?.title || (chat.store.currentConvId ? '未命名任务' : '新建任务');
});

async function onConvCommand(cmd: string) {
  if (cmd === '__new__') {
    await chat.startNewChat();
    return;
  }
  await chat.selectConv(cmd);
}

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  if (!k) return wf.agents.value;
  return wf.agents.value.filter(
    (a: WorkflowAgentItem) => a.name.toLowerCase().includes(k) || a.description.toLowerCase().includes(k),
  );
});

const current = computed<WorkflowAgentItem | null>(
  () => wf.agents.value.find((a) => a.id === selectedId.value) || null,
);

function isLong(f: { type: string; description?: string }): boolean {
  // 描述里带「段落/长文本」或 key 像 content/text/body 的走多行输入
  const d = (f.description || '').toLowerCase();
  return /段落|长文本|多行/.test(d);
}

/** 取某个覆盖节点里「平台」字段的值（模型下拉要按平台过滤，否则列出全平台模型太乱） */
function platformKeyOf(o: OverridableNodeDef): string {
  const pf = o.fields.find((x) => x.control === 'platform');
  return pf?.key || 'platformId';
}

/**
 * 该节点实际生效的平台：优先本次覆盖值，否则用画布上的当前值。
 *
 * 不能拿「模型字段自己的 current」当平台（原先就是这么写的）：那是模型 id，
 * 拿去过滤平台只会得到空列表，下拉看起来像坏了。平台与模型是两个字段，各取各的。
 */
function effectivePlatformOf(o: OverridableNodeDef): string {
  const covered = overrideForm[o.nodeId]?.[platformKeyOf(o)];
  if (typeof covered === 'string' && covered) return covered;
  const pf = o.fields.find((x) => x.control === 'platform');
  return typeof pf?.current === 'string' ? pf.current : '';
}

/**
 * 平台变了就清掉该节点已选的模型覆盖值。
 *
 * 模型 id 是**平台内唯一**的，换了平台后旧模型 id 在新平台里不存在 ——
 * 不清的话会带着一个必然解析失败的模型去跑，正好又变成「模型不存在」。
 * 清空 = 回落到画布默认（画布上的模型与画布平台是一致的一对）。
 */
function onOverridePlatformChange(o: OverridableNodeDef) {
  const mk = o.fields.find((x) => x.control === 'model')?.key;
  if (mk) overrideForm[o.nodeId][mk] = '';
}

/** 某平台下的模型列表；平台为空时给全部（用户在画布上没绑平台的历史数据） */
function modelsForPlatform(platformId: unknown) {
  const pid = typeof platformId === 'string' ? platformId : '';
  const list = pid ? platformStore.models.filter((m) => m.platformId === pid) : platformStore.models;
  return list.filter((m) => !m.type || m.type === 'llm');
}

/** 「当前：xxx」提示 —— 告诉用户不覆盖会用画布上的哪个值 */
function currentHint(f: { key: string; control: string; current?: unknown }): string {
  const v = f.current;
  if (v === undefined || v === null || v === '') return '画布未设置';
  if (f.control === 'platform') {
    const p = platformStore.platforms.find((x) => x.id === v);
    return `当前：${p?.name || String(v)}`;
  }
  if (f.control === 'model') {
    // 兼容两种存量口径：主键 id（正确）与 API 名 model_id（历史数据），
    // 只认一种会让「当前」显示成裸 id 而不是模型名，用户没法核对。
    const key = String(v);
    const m = platformStore.models.find((x) => x.id === key) || platformStore.models.find((x) => x.modelId === key);
    return `当前：${m?.alias || m?.modelId || key}`;
  }
  return `当前：${String(v)}`;
}

function select(id: string) {
  if (selectedId.value === id) return;
  selectedId.value = id;
  runId.value = '';
  viewingRunId.value = '';
  const a = wf.agents.value.find((x: WorkflowAgentItem) => x.id === id);
  resetForm(a || null);
}

function resetForm(a: WorkflowAgentItem | null) {
  for (const k of Object.keys(form)) delete form[k];
  for (const k of Object.keys(overrideForm)) delete overrideForm[k];
  for (const f of a?.fields || []) {
    form[f.key] = f.default ?? (f.type === 'number' ? null : f.type === 'boolean' ? false : '');
  }
  for (const o of a?.overrides || []) {
    overrideForm[o.nodeId] = Object.fromEntries(o.fields.map((k) => [k, '']));
  }
  overrideOpen.value = false;
}

/** 表单 → 结构化入参（数字转 Number，array/object 尝试 JSON 解析，空值跳过） */
function collectedInputs(): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const f of current.value?.fields || []) {
    const v = form[f.key];
    if (v === '' || v == null) continue;
    if (f.type === 'number') inputs[f.key] = Number(v);
    else if (f.type === 'array' || f.type === 'object') {
      try { inputs[f.key] = JSON.parse(String(v)); } catch { inputs[f.key] = v; }
    } else inputs[f.key] = v;
  }
  return inputs;
}

/** 覆盖节点配置：留空表示用画布默认值，不进请求 */
function collectedOverrides(): Record<string, Record<string, unknown>> {
  const overrides: Record<string, Record<string, unknown>> = {};
  for (const [nodeId, kv] of Object.entries(overrideForm)) {
    const picked: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(kv || {})) {
      if (v === '' || v == null) continue;
      picked[k] = v;
    }
    if (Object.keys(picked).length) overrides[nodeId] = picked;
  }
  return overrides;
}

async function run(force = false) {
  if (!current.value || starting.value) return;
  starting.value = true;
  preflightIssues.value = [];
  try {
    const res = await wf.startRun(current.value.id, collectedInputs(), collectedOverrides(), force);
    runId.value = res.runId;
    viewingRunId.value = runId.value;
    warnings.value = res.warnings;
    await wf.loadRuns();
  } catch (e: any) {
    runId.value = '';
    // 预检未通过：逐条列出问题（不要只弹一句「启动失败」，用户不知道该改什么）
    const issues = (e as Error & { issues?: PreflightIssue[] }).issues;
    if (issues?.length) {
      preflightIssues.value = issues;
    } else {
      preflightIssues.value = [{ blocking: true, code: 'UNKNOWN', msg: e?.message || '启动失败' }];
    }
    console.error('[workflow] 启动失败', e?.message || e);
  } finally {
    starting.value = false;
  }
}

/** 用户看到问题后选择「我知道，继续跑」 */
async function runAnyway() {
  await run(true);
}

/** 正常「运行」入口（把 Event 参数挡在外面，避免被当成 force=true） */
async function runNormal() {
  await run(false);
}

function onFinish() {
  void wf.loadRuns();
}

function viewRun(r: WorkflowRunItem) {
  viewingRunId.value = r.id;
  runId.value = r.id;
  if (r.agentId && r.agentId !== selectedId.value) {
    selectedId.value = r.agentId;
    resetForm(wf.agents.value.find((a: WorkflowAgentItem) => a.id === r.agentId) || null);
  }
  if (r.inputs) {
    for (const [k, v] of Object.entries(r.inputs)) form[k] = v;
  }
}

function timeAgo(ts: number): string {
  const d = Date.now() - (ts || 0);
  if (d < 60_000) return '刚刚';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`;
  return `${Math.floor(d / 86_400_000)} 天前`;
}

/** 问题类型的中文名（比裸 code 可读） */
function issueLabel(code: string): string {
  const map: Record<string, string> = {
    NO_NODES: '空工作流',
    NO_OUTPUT: '缺输出节点',
    DUP_NODE_ID: '节点 id 重复',
    DANGLING_EDGE: '连线悬空',
    LLM_NO_MODEL: '未选模型',
    MODEL_NOT_FOUND: '模型已失效',
    TOOL_NOT_REGISTERED: '工具不可用',
    INPUT_MISSING: '缺入参',
    INPUT_TYPE: '入参类型错',
    UNKNOWN: '启动失败',
  };
  return map[code] || code;
}

function reload() {
  void wf.loadAgents();
  void wf.loadRuns();
}

onMounted(() => {
  reload();
  if (!selectedId.value && wf.agents.value.length) select(wf.agents.value[0].id);
});

// 列表加载完自动选中第一个，省一次点击
watch(
  () => wf.agents.value.length,
  (n) => { if (n && !selectedId.value) select(wf.agents.value[0].id); },
);

// 进入工作流模式就把会话智能体锁到「工作流助手」。
// 两处都要盯：① 本页挂载时（本来就在 wf 里、或从别的模式切进来）
//            ② 智能体清单加载完（agents 为空时 ensureFixedAgent 会静默跳过）
onMounted(ensureFixedAgent);
watch(() => agentStore.agents.length, ensureFixedAgent);
</script>

<!-- 对话区样式来自 chat.css（与办公/开发模式同一份）：
     .messages 的 flex:1 / overflow-y / 内边距都在那里，不引就会「消息顶到最上沿 + 被上方条压住」。
     开发模式同样是 `<style src="./chat.css">` + `<style scoped>` 两条并存。 -->
<style src="./chat.css"></style>

<!-- ===== 浮层样式（必须非 scoped）=====
     el-dropdown / el-popover 的浮层会被 Teleport 到 body：
     scoped 的 data-v 属性不会跟到浮层节点上，写在 scoped 里等于没写。
     统一在这里用 `wf-* -popper` 前缀限定作用域，避免污染其它页面。 -->
<style>
/* 会话列表下拉（对话栏顶部）：同样限宽 + 单行省略 */
.wf-conv-popper .el-dropdown-menu { padding: 4px; }
.wf-conv-popper .el-dropdown-menu__item { padding: 0; border-radius: 8px; margin-bottom: 2px; line-height: normal; }
.wf-conv-popper .el-dropdown-menu__item:hover { background: transparent; }
.wf-conv-popper .wf-conv-new,
.wf-conv-popper .wf-conv-item {
  display: flex; align-items: center; gap: 8px;
  width: 300px; box-sizing: border-box; min-width: 0;
  padding: 7px 9px; border-radius: 8px;
}
.wf-conv-popper .el-dropdown-menu__item:not(.is-disabled):hover .wf-conv-new,
.wf-conv-popper .el-dropdown-menu__item:not(.is-disabled):hover .wf-conv-item {
  background: color-mix(in srgb, var(--color-primary, #7c3aed) 10%, transparent);
}
.wf-conv-popper .wf-conv-title {
  flex: 1; min-width: 0; font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wf-conv-popper .wf-conv-check { color: var(--color-primary, #7c3aed); flex-shrink: 0; }

/* 工作流挂载器浮层（左栏底部）：同样是 Teleport 出来的 */
.wfp-popper .wfp-panel { display: flex; flex-direction: column; gap: 8px; }
</style>

<style scoped>
.wf-page { display: flex; flex-direction: column; height: 100%; min-height: 0; position: relative; }
/* 窄屏堆叠后总高超过视口，整页滚动交给 .wf-body；此处只解除 height 锁定 */
@media (max-width: 900px) {
  .wf-page { height: auto; min-height: 100%; }
}
.wf-top {
  display: flex; align-items: center; gap: 10px; padding: 8px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter); flex: none;
}
.wf-badge {
  display: inline-flex; align-items: center; gap: 4px; font-size: 12px;
  padding: 2px 8px; border-radius: 10px; background: var(--el-fill-color); color: var(--el-text-color-regular);
}
.wf-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.wf-spacer { flex: 1; }
.wf-btn {
  font-size: 12px; padding: 4px 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--el-border-color); background: transparent; color: var(--el-text-color-regular);
}
.wf-btn:hover:not(:disabled) { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.wf-btn.primary { background: var(--el-color-primary); border-color: var(--el-color-primary); color: #fff; }
.wf-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* 顶栏图标按钮（三屏收起/展开，与开发模式的 cp-side-toggle 同款观感） */
.wf-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--el-border-color); background: transparent;
  color: var(--el-text-color-secondary);
}
.wf-icon-btn:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.wf-icon-btn.on { color: var(--el-text-color-regular); }

/* 收起：display:none（不动宽度值，展开即恢复用户拖过的宽度） */
.is-side-collapsed .wf-side { display: none; }
.is-chat-collapsed .wf-chat { display: none; }
/* 没有 .is-view-collapsed：运行台不提供收起（见上方 collapse 状态说明） */

/* ===== 工作流模式下，共享输入框的「智能体条」整条隐藏 =====
   那条 bar 放的是「会话智能体 + 编辑智能体 + 场景 chip」：
   - 智能体：本模式固定为工作流助手，显示它没有意义（用户拍板）；
   - 场景 chip：本模式的场景就是「工作流」，由模式本身决定，同样不必显示。
   ChatInputArea 是共享组件，不往里加模式特判；这里整条藏掉，
   由 .wf-agent-bar 位置的 WorkflowPicker 承担「把工作流交给助手」这件事。 */
.wf-chat :deep(.input-agent-bar) { display: none; }

/* 拖拽条（与开发模式共用一套观感，变量走统一 glass token） */
.rs-handle {
  flex: 0 0 6px; width: 6px; cursor: col-resize; position: relative; z-index: 6;
  background: transparent; transition: background 0.15s ease;
}
.rs-handle::after {
  content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 2px;
  transform: translateX(-50%); border-radius: 1px;
  background: var(--glass-border, #e7e4dc);
}
.rs-handle:hover, .rs-handle.dragging {
  background: color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent);
}
.rs-handle:hover::after, .rs-handle.dragging::after {
  background: var(--color-primary, #7c3aed); width: 3px;
}

.wf-body { flex: 1; min-height: 0; display: flex; }

/* 左栏：宽度由拖拽条驱动（收起时归零）；min-width:0 让 flex 能真正压到 0 */
.wf-side {
  flex: 0 0 var(--wf-side-w, 260px); width: var(--wf-side-w, 260px); min-width: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
}
.wf-search {
  margin: 10px; padding: 5px 10px; font-size: 12px; border-radius: 6px;
  border: 1px solid var(--el-border-color); background: transparent; color: var(--el-text-color-primary);
}
.wf-sec {
  padding: 6px 12px; font-size: 11px; color: var(--el-text-color-secondary);
  letter-spacing: 0.4px;
}
.wf-list { overflow: auto; padding: 0 8px; }

/* ===== 运行历史折叠抽屉 ===== */
/* 运行历史（左栏底部）。列表占满剩余高度，历史固定在下方、
   展开时最多吃 40% —— 避免历史一多就把工作流列表挤没。 */
.wf-hist {
  flex: none; max-height: 42%;
  display: flex; flex-direction: column; min-height: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.wf-hist-head {
  display: flex; align-items: center; gap: 6px; padding: 6px 14px;
  font-size: 12px; color: var(--el-text-color-secondary); cursor: pointer;
}
.wf-hist-head:hover { color: var(--el-color-primary); }
/* 收起态的一行摘要：窄栏下会很长，用省略号截断（完整内容靠 title） */
.wf-hist-latest {
  padding: 0 12px 8px; font-size: 11px; color: var(--el-text-color-placeholder);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wf-hist-spacer { flex: 1; }
/* 展开态：吃掉 .wf-hist 剩余高度（父级已限 max-height:42%），内部独立滚动 */
.wf-hist-body { flex: 1; min-height: 0; overflow: auto; padding: 0 8px 8px; }
.wf-hist-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px;
  font-size: 12px; cursor: pointer;
}
.wf-hist-item:hover { background: var(--el-fill-color-light); }
.wf-hist-item.active { background: var(--el-color-primary-light-9); }
.wf-hist-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-hist-status { flex: none; color: var(--el-text-color-secondary); }
.wf-hist-time { flex: none; font-size: 11px; color: var(--el-text-color-placeholder); }
.wf-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px;
  cursor: pointer; font-size: 13px;
}
.wf-item:hover { background: var(--el-fill-color-light); }
.wf-item.active { background: var(--el-color-primary-light-9); }
.wf-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-item-meta { font-size: 11px; color: var(--el-text-color-secondary); flex: none; }
.wf-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--el-text-color-secondary); }
.wf-dot.is-completed { background: #3b6d11; }
.wf-dot.is-failed { background: #a32d2d; }
.wf-dot.is-running { background: #185fa5; }
.wf-empty { font-size: 12px; color: var(--el-text-color-placeholder); padding: 10px 8px; }

/* 中栏（运行台）：宽度由变量驱动（AI 形态固定宽、human 形态 flex:1 撑满剩余） */
.wf-main {
  flex: 1 1 auto; min-width: 0; overflow: auto; padding: 14px 16px;
}
.wf-blank {
  height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: var(--el-text-color-placeholder); font-size: 13px;
}
.wf-run-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.wf-run-title { font-size: 15px; font-weight: 500; }
.wf-run-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.wf-run-head .wf-btn { margin-left: auto; flex: none; }
.wf-form { display: flex; flex-direction: column; gap: 10px; max-width: 640px; }
.wf-field { display: flex; flex-direction: column; gap: 4px; }
.wf-field.is-inline { flex-direction: row; align-items: center; gap: 8px; }
.wf-field.is-inline .wf-label { width: 120px; flex: none; }
.wf-label { font-size: 12px; color: var(--el-text-color-regular); }
.wf-req { color: #a32d2d; }
.wf-form-empty { font-size: 12px; color: var(--el-text-color-secondary); }

.wf-override { margin-top: 16px; max-width: 640px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.wf-override-head {
  display: flex; align-items: center; justify-content: space-between; padding: 7px 10px;
  font-size: 12px; cursor: pointer; background: var(--el-fill-color-lighter); border-radius: 8px 8px 0 0;
}
.wf-override-body { padding: 10px; display: flex; flex-direction: column; gap: 12px; }
.wf-override-title {
  font-size: 11px; color: var(--el-text-color-secondary); margin-bottom: 6px;
  display: flex; align-items: center; gap: 6px;
}
.wf-node-type {
  padding: 0 6px; border-radius: 4px; background: var(--el-fill-color);
  font-family: var(--font-mono, monospace);
}
.wf-ctl { flex: 1; min-width: 0; max-width: 260px; }
.wf-current { font-size: 11px; color: var(--el-text-color-secondary); flex: none; }

/* ===== 预检问题清单 ===== */
.wf-issues {
  margin-top: 16px; max-width: 760px; border: 1px solid #f09595; border-radius: 8px;
  background: #fef5f5; padding: 10px 12px;
}
.wf-issues-title {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: #a32d2d;
  margin-bottom: 8px;
}
.wf-issue {
  display: flex; align-items: baseline; gap: 8px; font-size: 12px; padding: 4px 0;
  border-top: 1px solid rgba(163, 45, 45, 0.12);
}
.wf-issue-code {
  flex: none; padding: 1px 6px; border-radius: 4px; background: #fcebeb; color: #a32d2d; font-size: 11px;
}
.wf-issue-msg { flex: 1; color: var(--el-text-color-primary); line-height: 1.6; }
.wf-issue-node { flex: none; font-size: 11px; color: var(--el-text-color-secondary); font-family: var(--font-mono, monospace); }
.wf-issues-actions { display: flex; gap: 8px; margin-top: 10px; }
.wf-warns {
  margin-top: 12px; max-width: 760px; display: flex; flex-direction: column; gap: 3px;
  font-size: 12px; color: #854f0b; background: #faeeda; padding: 8px 10px; border-radius: 8px;
}

.wf-monitor { margin-top: 18px; max-width: 760px; }

/* 对话栏：human 在右（宽度可拖拽），ai 在中间占主区 */
.wf-chat {
  flex: 0 0 var(--wf-chat-w, 352px); width: var(--wf-chat-w, 352px); min-width: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
}
/* 对话栏顶部：会话列表（替代原先的「可用工作流」条） */
.wf-conv-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; flex: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.wf-conv-trigger {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  max-width: 100%; padding: 3px 9px; border-radius: 12px;
  border: 1px solid var(--el-border-color); background: transparent;
  color: var(--el-text-color-regular); font-size: 12px;
}
.wf-conv-trigger:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.wf-conv-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.wf-conv-new { display: inline-flex; align-items: center; gap: 5px; }
.wf-conv-item { display: flex; align-items: center; gap: 8px; min-width: 180px; }
.wf-conv-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-conv-check { color: var(--el-color-primary); }

/* ===== 输入框上方：挂载给助手 =====
   与 chat.css 里 .input-agent-bar 同位置、同内边距，保证与其它模式的输入区观感一致。
   触发器自身的样式在 WorkflowPicker.vue（scoped 生效）；这里只管摆放。 */
.wf-agent-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px 0; flex: none; min-width: 0;
}

/* ===== 顶栏内的形态切换 =====
   LeadToggle 默认是右下角悬浮（absolute; right:16; bottom:16），
   在本模式会正好压在对话栏的发送按钮上（对话栏就在最右）。
   这里把 wrapper 与按钮都改成**静态内联**，收进顶栏图标组：
   高度对齐旁边的 .wf-icon-btn（26px），视觉上就是同一组控件。
   只覆盖定位相关属性，hover 浮出文案的行为保持不变。 */
.wf-top :deep(.lead-toggle-wrap) {
  position: static; right: auto; bottom: auto; z-index: auto;
}
.wf-top :deep(.lead-fab) {
  width: 26px; height: 26px;
  border-radius: 8px;
  box-shadow: none;
  background: transparent;
}
.wf-top :deep(.lead-fab:hover) {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}
/* 文案气泡要跟着静态定位走，否则会跑到顶栏外面 */
.wf-top :deep(.lead-fab-tip) {
  right: 0; bottom: auto; top: calc(100% + 6px);
}

/* ===== AI 形态：列表在左 · 对话占主区 · 运行台固定宽在右（与 human 镜像）=====
   早前的实现用 order 只把 chat 提到最前，结果运行台被夹在「对话 46%」与「列表 258px」
   之间只剩窄条，描述/字段全挤成一团（截图可见）。
   正解是交换 main 与 chat 的**位置与伸缩关系**，side 始终在最左。
   宽度全部走变量，拖拽与收起才有意义。 */
.is-lead-ai .wf-body { flex-direction: row; }
.is-lead-ai .wf-side { order: -1; }
.is-lead-ai .wf-chat {
  order: 0;
  flex: 1 1 auto; width: auto; min-width: 0;
  border-right: 1px solid var(--el-border-color-lighter);
}
.is-lead-ai .wf-main {
  order: 1;
  /* AI 形态下它是右固定栏 → 宽度也走变量，可以拖拽 */
  flex: 0 0 var(--wf-main-w, 400px); width: var(--wf-main-w, 400px); min-width: 0;
  border-left: 1px solid var(--el-border-color-lighter);
}

/* ===== 窄屏：三栏改纵向堆叠 =====
   本页三栏宽度全部走变量（side 260 / chat 352 / main 400），桌面端合理；
   但视口 <900px 时三者之和已超过可用宽度 → flex 把每一栏压到极窄
   （实测 640px 下中间栏只剩约 50px，描述与字段全被挤成竖排单字；
    400px 下更是整屏崩坏）。`.wf-main` 虽写了 `flex:1 1 auto; min-width:0` 能被压，
   但「能压」不等于「还能用」——所以窄屏不再横排。

   策略：纵向堆叠，每栏给足高度、各自内部滚动（不让整页滚，否则顶部工具条会被带走）。
   ⚠️ 必须连 `.is-lead-ai` 的变体一起覆盖：那几条选择器是 0,2,0 特异性，
   只写 `.wf-chat`（0,1,0）会被它们压过去，等于白改。 */
@media (max-width: 900px) {
  .wf-body {
    flex-direction: column;
    overflow-y: auto;
  }
  /* 堆叠态下拖拽条无意义（宽度不再由横排分配） */
  .wf-body .rs-handle { display: none; }

  .wf-side,
  .is-lead-ai .wf-side {
    order: 0;
    flex: none;
    width: 100%;
    max-height: 34vh;
    border-right: none;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .wf-list { max-height: 22vh; }

  .wf-main,
  .is-lead-ai .wf-main {
    order: 1;
    flex: none;
    width: 100%;
    min-height: 340px;
    max-height: none;
    border-left: none;
    border-right: none;
    padding: 12px 14px;
  }

  .wf-chat,
  .is-lead-ai .wf-chat {
    order: 2;
    flex: none;
    width: 100%;
    height: 60vh;
    min-height: 320px;
    border-right: none;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  /* 表单与控件在窄屏占满宽度，别留 640px 的硬上限 */
  .wf-form,
  .wf-override,
  .wf-monitor,
  .wf-issues,
  .wf-warns { max-width: 100%; }
  .wf-ctl { max-width: none; }
  /* 行内字段（标签 120px + 控件）在窄屏改为上下排列，否则控件被压到很窄 */
  .wf-field.is-inline { flex-direction: column; align-items: stretch; }
  .wf-field.is-inline .wf-label { width: auto; }
}

@media (max-width: 640px) {
  /* 顶栏：说明文字先收，保证模式徽标与图标按钮一排放得下 */
  .wf-top { flex-wrap: wrap; gap: 6px; padding: 6px 10px; }
  .wf-hint { display: none; }
  .wf-spacer { min-width: 0; }
  .wf-badge { font-size: 11px; padding: 2px 6px; }
  .wf-page { height: auto; min-height: 100%; }
  .wf-side { max-height: 30vh; }
  .wf-main { min-height: 300px; }
  .wf-chat { height: 66vh; }
  .wf-run-head { flex-wrap: wrap; gap: 8px; }
  .wf-run-head .wf-btn { margin-left: 0; }
}
</style>
