<template>
  <div class="input-area">
    <div class="input-box" :class="{ focused: inputFocused }">

      <div class="input-agent-bar">
        <el-dropdown trigger="click" placement="bottom-start" popper-class="agent-switch-popper" @command="onAgentSwitch">
          <div class="agent-trigger" @click.stop>
            <span class="agent-trigger-avatar">{{ (agentStore.selectedAgent?.name || '?').slice(0, 1) }}</span>
            <span class="agent-trigger-name">{{ agentStore.selectedAgent?.name || '选择智能体' }}</span>
            <el-icon class="agent-trigger-caret"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="ag in agentStore.agents"
                :key="ag.id"
                :command="ag.id"
                :class="{ 'is-active': ag.id === agentStore.selectedId }"
              >
                <div class="agent-opt">
                  <span class="agent-opt-avatar">{{ (ag.name || '?').slice(0, 1) }}</span>
                  <div class="agent-opt-info">
                    <span class="agent-opt-name">
                      <el-icon v-if="ag.isDefault" class="agent-opt-lock"><Lock /></el-icon>
                      {{ ag.name }}
                    </span>
                    <span class="agent-opt-desc">{{ ag.description || '未填写描述' }}</span>
                  </div>
                  <el-icon v-if="ag.id === agentStore.selectedId" class="agent-opt-check"><Check /></el-icon>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-tooltip content="编辑当前智能体" placement="top">
          <el-button size="small" circle class="agent-edit-btn" @click="openEditAgent(agentStore.selectedAgent)">
            <el-icon><EditPen /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <el-input
        ref="inputRef"
        v-model="input"
        type="textarea"
        :autosize="{ minRows: 3, maxRows: 12 }"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行；输入 / 打开命令，@ 引用文件"
        @keydown.enter.exact="onEnter"
        @keydown.up="onKeyUp"
        @keydown.down="onKeyDown"
        @keydown.esc="onEsc"
        :disabled="store.streaming"
        @focus="inputFocused = true"
        @blur="inputFocused = false"
        class="input-textarea"
      />

      <!-- 命令 / 文件引用浮层 -->
      <transition name="cmd-fade">
        <div v-if="slashMenuOpen || atMenuOpen" class="cmd-menu" @mousedown.prevent>
          <!-- D2 命令菜单 -->
          <template v-if="slashMenuOpen">
            <template v-if="slashMode === 'command'">
              <div
                v-for="(c, i) in filteredCommands"
                :key="c.cmd"
                class="cmd-menu-item"
                :class="{ active: i === slashIndex }"
                @click="enterSlashCommand(c.cmd)"
              >
                <el-icon class="cmd-menu-icon"><component :is="c.icon" /></el-icon>
                <div class="cmd-menu-info">
                  <div class="cmd-menu-label">{{ c.cmd }}</div>
                  <div class="cmd-menu-desc">{{ c.hint }}</div>
                </div>
              </div>
            </template>
            <template v-else-if="slashMode === 'agent'">
              <div
                v-for="(ag, i) in agentStore.agents"
                :key="ag.id"
                class="cmd-menu-item"
                :class="{ active: i === slashIndex }"
                @click="pickSlashAgent(ag)"
              >
                <span class="cmd-opt-avatar">{{ (ag.name || '?').slice(0, 1) }}</span>
                <div class="cmd-menu-info">
                  <div class="cmd-menu-label">{{ ag.name }}</div>
                  <div class="cmd-menu-desc">{{ ag.description || '—' }}</div>
                </div>
              </div>
            </template>
            <template v-else-if="slashMode === 'model'">
              <template v-for="g in modelGroups" :key="g.platformId">
                <div class="cmd-menu-group">{{ g.platformName }}</div>
                <div
                  v-for="(m, i) in g.models"
                  :key="m.id"
                  class="cmd-menu-item"
                  :class="{ active: (flatModelOffset(g) + i) === slashIndex }"
                  @click="pickSlashModel(m)"
                >
                  <el-icon class="cmd-menu-icon"><Cpu /></el-icon>
                  <span class="cmd-menu-label">{{ m.alias || m.modelId }}</span>
                </div>
              </template>
            </template>
          </template>
          <!-- D3 文件引用 -->
          <template v-else-if="atMenuOpen">
            <div class="cmd-menu-head">
              <span>引用工作区文件</span>
              <span class="cmd-menu-hint">@ 模糊匹配 · 回车引用</span>
            </div>
            <div
              v-for="(f, i) in atFileList"
              :key="f.path"
              class="cmd-menu-item"
              :class="{ active: i === atIndex }"
              @click="pickAtFile(f)"
            >
              <el-icon class="cmd-menu-icon" :style="{ color: fileTypeMeta(f.name).color }">
                <component :is="fileTypeMeta(f.name).icon" />
              </el-icon>
              <span class="cmd-menu-label">{{ f.name }}</span>
            </div>
            <div v-if="atFileList.length === 0" class="cmd-menu-empty">无匹配文件，可先在文件管理中上传</div>
          </template>
        </div>
      </transition>

      <div class="input-toolbar">
        <div class="toolbar-left">
          <el-popover v-model:visible="plusOpen" placement="top-start" :width="264" trigger="click" :show-arrow="false" popper-class="plus-menu-popper">
            <template #reference>
              <el-button size="small" circle class="ctx-btn plus-btn" :class="{ 'is-active': plusOpen }">
                <el-icon><Plus /></el-icon>
              </el-button>
            </template>
            <div class="plus-menu-wrap" @mouseleave="scheduleCloseSub">
              <div class="plus-menu">
                <div class="plus-menu-item" :class="{ 'has-sub-open': hoverSub === 'agents' }" @mouseenter="openSub('agents', $event)" @click="openSub('agents', $event)">
                  <span class="plus-menu-ic agent">{{ (agentStore.selectedAgent?.name || '?').slice(0, 1) }}</span>
                  <div class="plus-menu-info">
                    <div class="plus-menu-label">专家</div>
                    <div class="plus-menu-desc">{{ agentStore.selectedAgent?.name || '选择智能体' }}</div>
                  </div>
                  <el-icon class="plus-menu-arrow"><ArrowRight /></el-icon>
                </div>
                <div class="plus-menu-item" :class="{ 'has-sub-open': hoverSub === 'skills' }" @mouseenter="openSub('skills', $event)" @click="openSub('skills', $event)">
                  <span class="plus-menu-ic"><el-icon><Files /></el-icon></span>
                  <div class="plus-menu-info">
                    <div class="plus-menu-label">技能 · Skill</div>
                    <div class="plus-menu-desc">{{ mountedSkillIds.length ? `已挂载 ${mountedSkillIds.length} 个` : '未挂载' }}</div>
                  </div>
                  <el-icon class="plus-menu-arrow"><ArrowRight /></el-icon>
                </div>
                <div class="plus-menu-item" @mouseenter="closeSubNow" @click="closePlus(() => { showMount = true; })">
                  <span class="plus-menu-ic"><el-icon><Connection /></el-icon></span>
                  <div class="plus-menu-info">
                    <div class="plus-menu-label">连接器 · MCP</div>
                    <div class="plus-menu-desc">{{ store.mountedMcpServers.length ? `已挂载 ${store.mountedMcpServers.length} 个` : '未挂载' }}</div>
                  </div>
                </div>
                <div class="plus-menu-item" :class="{ 'has-sub-open': hoverSub === 'modes' }" @mouseenter="openSub('modes', $event)" @click="openSub('modes', $event)">
                  <span class="plus-menu-ic"><el-icon><Operation /></el-icon></span>
                  <div class="plus-menu-info">
                    <div class="plus-menu-label">模式</div>
                    <div class="plus-menu-desc">{{ modesDesc }}</div>
                  </div>
                  <el-icon class="plus-menu-arrow"><ArrowRight /></el-icon>
                </div>
                <div class="plus-menu-divider"></div>
                <div class="plus-menu-item" @mouseenter="closeSubNow" @click="closePlus(triggerFileUpload)">
                  <span class="plus-menu-ic"><el-icon><UploadFilled /></el-icon></span>
                  <div class="plus-menu-info"><div class="plus-menu-label">上传文件</div></div>
                </div>
                <div class="plus-menu-item" @mouseenter="closeSubNow" @click="closePlus(() => { showWorkspaceDir = true; })">
                  <span class="plus-menu-ic"><el-icon><FolderOpened /></el-icon></span>
                  <div class="plus-menu-info">
                    <div class="plus-menu-label">工作目录</div>
                    <div class="plus-menu-desc">{{ hasWorkspaceDir ? workspaceDir : '未设置' }}</div>
                  </div>
                </div>
                <div class="plus-menu-divider"></div>
                <div class="plus-menu-item" @mouseenter="closeSubNow" @click="closePlus(() => startNewChat())">
                  <span class="plus-menu-ic"><el-icon><EditPen /></el-icon></span>
                  <div class="plus-menu-info"><div class="plus-menu-label">新建任务</div></div>
                </div>
                <div class="plus-menu-item" @mouseenter="closeSubNow" @click="closePlus(openPlatformConfig)">
                  <span class="plus-menu-ic"><el-icon><Setting /></el-icon></span>
                  <div class="plus-menu-info"><div class="plus-menu-label">配置模型平台</div></div>
                </div>
              </div>
              <!-- hover 右侧弹出的子菜单（专家列表 / 模式开关） -->
              <transition name="plus-sub-fade">
                <div v-if="hoverSub" class="plus-menu plus-menu-sub" :style="{ top: subTop + 'px' }" @mouseenter="cancelCloseSub">
                  <template v-if="hoverSub === 'agents'">
                    <div
                      v-for="ag in agentStore.agents"
                      :key="ag.id"
                      class="plus-menu-item"
                      :class="{ 'is-active': ag.id === agentStore.selectedId }"
                      @click="pickPlusAgent(ag.id)"
                    >
                      <span class="plus-menu-ic agent">{{ (ag.name || '?').slice(0, 1) }}</span>
                      <div class="plus-menu-info">
                        <div class="plus-menu-label">{{ ag.name }}</div>
                        <div class="plus-menu-desc">{{ ag.description || '未填写描述' }}</div>
                      </div>
                      <el-icon v-if="ag.id === agentStore.selectedId" class="plus-menu-check"><Check /></el-icon>
                    </div>
                    <div class="plus-menu-item" @click="closePlus(() => openEditAgent(agentStore.selectedAgent))">
                      <span class="plus-menu-ic"><el-icon><EditPen /></el-icon></span>
                      <div class="plus-menu-info"><div class="plus-menu-label">编辑当前专家</div></div>
                    </div>
                  </template>
                  <template v-else-if="hoverSub === 'skills'">
                    <div class="plus-sub-search" @mousedown.stop>
                      <el-input v-model="skillSearch" placeholder="搜索技能" size="small" :prefix-icon="Search" clearable />
                    </div>
                    <div class="plus-sub-list">
                      <div
                        v-for="s in filteredSkillStore"
                        :key="s.id"
                        class="plus-menu-item"
                        :class="{ 'is-active': mountedSkillIds.includes(s.id) }"
                        @click="toggleSkillMount(s.id)"
                      >
                        <span class="plus-menu-ic"><el-icon><Files /></el-icon></span>
                        <div class="plus-menu-info">
                          <div class="plus-menu-label">{{ s.name }}</div>
                          <div class="plus-menu-desc">{{ s.description || '—' }}</div>
                        </div>
                        <el-icon v-if="mountedSkillIds.includes(s.id)" class="plus-menu-check"><Check /></el-icon>
                      </div>
                      <div v-if="!filteredSkillStore.length" class="plus-menu-empty">无匹配技能</div>
                    </div>
                    <div class="plus-menu-item" @click="closePlus(() => { showSkills = true; })">
                      <span class="plus-menu-ic"><el-icon><Setting /></el-icon></span>
                      <div class="plus-menu-info"><div class="plus-menu-label">管理技能</div></div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="plus-menu-item" @click.stop>
                      <span class="plus-menu-ic"><el-icon><ChatDotRound /></el-icon></span>
                      <div class="plus-menu-info">
                        <div class="plus-menu-label">深度思考</div>
                        <div class="plus-menu-desc">推理更充分，回答稍慢</div>
                      </div>
                      <el-switch v-model="store.thinkingMode" size="small" @click.stop />
                    </div>
                    <div class="plus-menu-item" @click.stop>
                      <span class="plus-menu-ic"><el-icon><Tickets /></el-icon></span>
                      <div class="plus-menu-info">
                        <div class="plus-menu-label">计划</div>
                        <div class="plus-menu-desc">先出计划，再逐项执行</div>
                      </div>
                      <el-switch v-model="store.planMode" size="small" @click.stop />
                    </div>
                    <div class="plus-menu-item" @click.stop>
                      <span class="plus-menu-ic"><el-icon><Memo /></el-icon></span>
                      <div class="plus-menu-info">
                        <div class="plus-menu-label">仅回答</div>
                        <div class="plus-menu-desc">不调用工具，直接作答</div>
                      </div>
                      <el-switch v-model="store.answerOnly" size="small" @click.stop />
                    </div>
                  </template>
                </div>
              </transition>
            </div>
          </el-popover>
        </div>

        <div class="toolbar-mobile-selects">
          <el-popover placement="top" trigger="click" :width="220" :show-arrow="false">
            <template #reference>
              <el-button size="small" circle>
                <el-icon><User /></el-icon>
              </el-button>
            </template>
            <div class="pop-select-list">
              <div
                v-for="ag in agentStore.agents"
                :key="ag.id"
                class="pop-select-item"
                :class="{ active: ag.id === agentStore.selectedId }"
                @click="onAgentSwitch(ag.id); agentStore.selectAgent(ag.id)"
              >
                <el-icon v-if="ag.isDefault" style="font-size:12px"><Lock /></el-icon>
                <span>{{ ag.name }}</span>
              </div>
            </div>
          </el-popover>

          <el-tooltip content="编辑当前智能体" placement="top">
            <el-button size="small" circle @click="openEditAgent(agentStore.selectedAgent)">
              <el-icon><EditPen /></el-icon>
            </el-button>
          </el-tooltip>

          <el-popover placement="top" trigger="click" :width="240" :show-arrow="false">
            <template #reference>
              <el-button size="small" circle>
                <el-icon><Cpu /></el-icon>
              </el-button>
            </template>
            <div class="pop-select-list">
              <template v-for="g in modelGroups" :key="g.platformId">
                <div class="pop-select-label">{{ g.platformName }}</div>
                <div
                  v-for="m in g.models"
                  :key="m.id"
                  class="pop-select-item"
                  :class="{ active: m.id === selectedModelId }"
                  @click="onModelChange(m.id)"
                >
                  <span>{{ m.alias || m.modelId }}</span>
                </div>
              </template>
            </div>
          </el-popover>
        </div>

        <div class="toolbar-right">
          <el-popover placement="top-end" :width="240" trigger="click" :show-arrow="false">
            <template #reference>
              <button type="button" class="model-select-btn">
                <el-icon :size="13"><Cpu /></el-icon>
                <span class="model-select-name">{{ currentModelName }}</span>
                <el-icon :size="11"><ArrowDown /></el-icon>
              </button>
            </template>
            <div class="pop-select-list">
              <template v-for="g in modelGroups" :key="g.platformId">
                <div class="pop-select-label">{{ g.platformName }}</div>
                <div
                  v-for="m in g.models"
                  :key="m.id"
                  class="pop-select-item"
                  :class="{ active: m.id === selectedModelId }"
                  @click="onModelChange(m.id)"
                >
                  <span>{{ m.alias || m.modelId }}</span>
                </div>
              </template>
            </div>
          </el-popover>
          <el-tooltip content="新建任务" placement="top">
            <el-button size="small" circle @click="startNewChat()">
              <el-icon><EditPen /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="store.streaming ? '停止任务' : '发送 (Enter)'" placement="top">
            <span>
              <el-button v-if="!store.streaming" type="primary" :icon="Promotion" :disabled="(!input.trim() && uploadedFiles.length === 0 && quotedUrls.length === 0) || !selectedModelId" @click="send" circle class="send-btn" />
              <el-button v-else type="danger" :icon="Close" @click="stopChat" circle class="send-btn stop-btn" />
            </span>
          </el-tooltip>
        </div>
      </div>
    </div>

    <div v-if="uploadedFiles.length > 0" class="file-chips">
      <div v-for="(f, idx) in uploadedFiles" :key="idx" class="file-chip">
        <el-icon class="file-chip-icon" :style="{ color: fileTypeMeta(f.name).color }">
          <component :is="fileTypeMeta(f.name).icon" />
        </el-icon>
        <span class="file-chip-name">{{ f.name }}</span>
        <span class="file-chip-size">{{ formatSize(f.size) }}</span>
        <el-button size="small" link class="file-chip-remove" @click="removeFile(idx)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <div v-if="selectedWorkFiles.length > 0" class="file-chips ref-chips">
      <div v-for="f in selectedWorkFiles" :key="f.path" class="file-chip ref-chip">
        <el-icon class="file-chip-icon" :style="{ color: fileTypeMeta(f.name).color }">
          <component :is="fileTypeMeta(f.name).icon" />
        </el-icon>
        <span class="file-chip-name">{{ f.name }}</span>
        <el-button size="small" link class="file-chip-remove" @click="toggleFileSelect(f.path)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <div v-if="quotedUrls.length > 0" class="file-chips url-chips">
      <div v-for="q in quotedUrls" :key="q.url" class="file-chip ref-chip url-chip">
        <el-icon class="file-chip-icon url-chip-icon"><Link /></el-icon>
        <span class="file-chip-name">{{ q.name }}</span>
        <el-tooltip :content="q.url" placement="top">
          <span class="url-chip-host">{{ q.url }}</span>
        </el-tooltip>
        <el-button size="small" link class="file-chip-remove" @click="removeQuotedUrl(q.url)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <div v-if="inputTooLong" class="long-input-hint">内容较长（{{ input.length }} 字），发送时将自动转为附件</div>

    <input ref="fileInputRef" type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.py,.js,.ts,.vue,.html,.css,.xml,.yaml,.yml,.log,.doc,.docx,.xlsx,.pptx,.zip" style="display:none" @change="handleFileChange" />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Component } from 'vue';
import {
  FolderOpened, ArrowDown, ArrowRight, Connection, Files, UploadFilled, User, EditPen, Cpu, Setting, Plus,
  Promotion, Close, Lock, Check, Picture, Document, Tickets, Box, VideoCamera, Headset, Memo, ChatDotRound,
  Operation, Search, Link,
} from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';

const {
  inputFocused, workspaceDir, hasWorkspaceDir, clearWorkspaceDir, showWorkspaceDir, showMount, store, showSkills, mountedSkillIds,
  skillStore, skillSearch, filteredSkillStore, toggleSkillMount,
  triggerFileUpload, input, send, agentStore, onAgentSwitch, openEditAgent, modelGroups,
  selectedModelId, onModelChange, openPlatformConfig, startNewChat, uploadedFiles, stopChat,
  formatSize, removeFile, fileInputRef, handleFileChange,
  workspaceFiles, selectedFilePaths, toggleFileSelect,
  quotedUrls, removeQuotedUrl, LONG_INPUT_THRESHOLD,
} = useChat();

const inputTooLong = computed(() => input.value.length > LONG_INPUT_THRESHOLD);

// ===== 「+」聚合菜单（对齐 WorkBuddy：专家/模式 hover 右侧弹出子菜单，其余点击触发） =====
const plusOpen = ref(false);
function closePlus(fn?: () => void) { fn?.(); plusOpen.value = false; hoverSub.value = null; }
function pickPlusAgent(id: string) { onAgentSwitch(id); closePlus(); }

// hover 子菜单：记录触发行 offsetTop，子菜单绝对定位对齐该行
const hoverSub = ref<'agents' | 'modes' | 'skills' | null>(null);
const subTop = ref(0);
let subCloseTimer: ReturnType<typeof setTimeout> | undefined;
function openSub(kind: 'agents' | 'modes' | 'skills', evt: MouseEvent) {
  if (subCloseTimer) { clearTimeout(subCloseTimer); subCloseTimer = undefined; }
  if (kind === 'skills') skillSearch.value = '';
  const el = evt.currentTarget as HTMLElement;
  if (hoverSub.value === kind && subTop.value === el.offsetTop) return;
  hoverSub.value = kind;
  subTop.value = el.offsetTop;
}
function closeSubNow() { hoverSub.value = null; }
function scheduleCloseSub() {
  // 延迟关闭，留出指针移入子菜单的时间
  if (subCloseTimer) clearTimeout(subCloseTimer);
  subCloseTimer = setTimeout(() => { hoverSub.value = null; }, 150);
}
function cancelCloseSub() {
  if (subCloseTimer) { clearTimeout(subCloseTimer); subCloseTimer = undefined; }
}
watch(plusOpen, (v) => { if (!v) closeSubNow(); });

const modesDesc = computed(() => {
  const on: string[] = [];
  if (store.thinkingMode) on.push('深度思考');
  if (store.planMode) on.push('计划');
  if (store.answerOnly) on.push('仅回答');
  return on.length ? on.join(' · ') : '默认';
});
const currentModelName = computed(() => {
  for (const g of modelGroups.value) {
    const m = g.models.find((x) => x.id === selectedModelId.value);
    if (m) return m.alias || m.modelId;
  }
  return '选择模型';
});

// ===== D2 `/` 命令菜单 =====
type SlashMode = 'command' | 'agent' | 'model';

const slashMenuOpen = ref(false);
const slashMode = ref<SlashMode>('command');
const slashQuery = ref('');
const slashIndex = ref(0);

const COMMANDS: Array<{ cmd: string; hint: string; icon: Component }> = [
  { cmd: '/agent', hint: '切换当前对话智能体', icon: User },
  { cmd: '/model', hint: '切换使用的模型', icon: Cpu },
  { cmd: '/skill', hint: '挂载 / 卸载 Skill', icon: Files },
  { cmd: '/dir', hint: '设置工作目录', icon: FolderOpened },
  { cmd: '/new', hint: '新建会话', icon: Plus },
];

const filteredCommands = computed(() => {
  const q = slashQuery.value.trim();
  if (!q) return COMMANDS;
  return COMMANDS.filter((c) => c.cmd.includes(q) || c.hint.includes(q));
});

const flatModels = computed<Array<{ id: string; name: string }>>(() => {
  const arr: Array<{ id: string; name: string }> = [];
  for (const g of modelGroups.value) {
    for (const m of g.models) arr.push({ id: m.id, name: m.alias || m.modelId });
  }
  return arr;
});

// 某个 platform 分组在扁平模型列表中的起始下标，用于高亮对应项
const modelGroupOffset = new Map<string, number>();
function flatModelOffset(g: { platformId: string }) {
  if (!modelGroupOffset.has(g.platformId)) {
    let acc = 0;
    for (const gg of modelGroups.value) {
      if (gg.platformId === g.platformId) { modelGroupOffset.set(g.platformId, acc); break; }
      acc += gg.models.length;
    }
  }
  return modelGroupOffset.get(g.platformId) || 0;
}

function slashListLength(): number {
  if (slashMode.value === 'agent') return agentStore.agents.length;
  if (slashMode.value === 'model') return flatModels.value.length;
  return filteredCommands.value.length;
}

function enterSlashCommand(cmd: string) {
  if (cmd === '/agent') { slashMode.value = 'agent'; slashIndex.value = 0; return; }
  if (cmd === '/model') { slashMode.value = 'model'; slashIndex.value = 0; return; }
  slashMenuOpen.value = false;
  input.value = '';
  if (cmd === '/skill') showSkills.value = true;
  else if (cmd === '/dir') showWorkspaceDir.value = true;
  else if (cmd === '/new') startNewChat();
}

function pickSlashAgent(ag: { id: string }) {
  onAgentSwitch(ag.id);
  slashMenuOpen.value = false;
  input.value = '';
}

function pickSlashModel(m: { id: string }) {
  onModelChange(m.id);
  slashMenuOpen.value = false;
  input.value = '';
}

function executeSlashActive() {
  if (slashMode.value === 'agent') {
    const ag = agentStore.agents[slashIndex.value];
    if (ag) pickSlashAgent(ag);
  } else if (slashMode.value === 'model') {
    const m = flatModels.value[slashIndex.value];
    if (m) pickSlashModel(m);
  } else {
    const c = filteredCommands.value[slashIndex.value];
    if (c) enterSlashCommand(c.cmd);
  }
}

// ===== D3 `@` 文件引用 =====
const atMenuOpen = ref(false);
const atQuery = ref('');
const atIndex = ref(0);

const atFileList = computed(() => {
  const q = atQuery.value.toLowerCase();
  const list = q ? workspaceFiles.value.filter((f) => f.name.toLowerCase().includes(q)) : workspaceFiles.value;
  return list.slice(0, 20);
});

const selectedWorkFiles = computed(() => {
  return [...selectedFilePaths.value]
    .map((p) => workspaceFiles.value.find((w) => w.path === p))
    .filter((f): f is { name: string; path: string; size: number; isDir: boolean } => !!f);
});

function pickAtFile(f: { name: string; path: string }) {
  toggleFileSelect(f.path);
  input.value = input.value.replace(/@([^\s@]*)$/, '').trimEnd();
  atMenuOpen.value = false;
}

// ===== 键盘 / 触发 =====
function onEnter(e: KeyboardEvent) {
  // 中文输入法组合态（isComposing / keyCode 229）：回车是「确认候选词」，不是发送。
  // 若不拦截，用户用 Enter 选词时会误触发发送，表现为「问一条自动再发一条」。
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  if (slashMenuOpen.value) { executeSlashActive(); return; }
  if (atMenuOpen.value) {
    const f = atFileList.value[atIndex.value];
    if (f) pickAtFile(f);
    return;
  }
  if (!store.streaming) send();
}

function onKeyUp(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (slashMenuOpen.value || atMenuOpen.value) { e.preventDefault(); moveIndex(-1); }
}
function onKeyDown(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (slashMenuOpen.value || atMenuOpen.value) { e.preventDefault(); moveIndex(1); }
}
function onEsc() { slashMenuOpen.value = false; atMenuOpen.value = false; }

function moveIndex(delta: number) {
  if (slashMenuOpen.value) {
    const len = slashListLength();
    if (len > 0) slashIndex.value = (slashIndex.value + delta + len) % len;
  } else if (atMenuOpen.value) {
    const len = atFileList.value.length;
    if (len > 0) atIndex.value = (atIndex.value + delta + len) % len;
  }
}

watch(input, (val) => {
  const s = val.match(/^\/(\w*)$/);
  if (s) {
    slashMode.value = 'command';
    slashQuery.value = s[1];
    slashIndex.value = 0;
    slashMenuOpen.value = true;
    atMenuOpen.value = false;
  } else {
    slashMenuOpen.value = false;
  }
  const a = val.match(/@([^\s@]*)$/);
  if (a) {
    atQuery.value = a[1];
    atIndex.value = 0;
    atMenuOpen.value = true;
  } else {
    atMenuOpen.value = false;
  }
});

// ===== 文件类型 → 图标 + 着色（沿用右侧面板 tab 配色体系） =====
const FILE_TYPE_META: Record<string, { icon: Component; color: string }> = {
  image: { icon: Picture, color: '#22c55e' },
  code: { icon: Document, color: '#3b82f6' },
  data: { icon: Tickets, color: '#10b981' },
  doc: { icon: Memo, color: '#f59e0b' },
  archive: { icon: Box, color: '#8b5cf6' },
  video: { icon: VideoCamera, color: '#ef4444' },
  audio: { icon: Headset, color: '#ec4899' },
  other: { icon: Files, color: '#94a3b8' },
};

const EXT_GROUP: Record<string, string> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', vue: 'code', py: 'code', java: 'code', go: 'code', rs: 'code',
  c: 'code', cpp: 'code', h: 'code', html: 'code', css: 'code', scss: 'code', less: 'code', json: 'code',
  xml: 'code', yaml: 'code', yml: 'code', sh: 'code', sql: 'code', php: 'code', rb: 'code', kt: 'code', swift: 'code',
  csv: 'data', xlsx: 'data', xls: 'data',
  md: 'doc', txt: 'doc', pdf: 'doc', doc: 'doc', docx: 'doc', ppt: 'doc', pptx: 'doc', rtf: 'doc', log: 'doc',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio',
};

function fileTypeMeta(name: string) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return FILE_TYPE_META[EXT_GROUP[ext] || 'other'];
}
</script>
