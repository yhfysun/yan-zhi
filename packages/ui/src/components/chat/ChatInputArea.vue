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
          <el-tooltip content="上传文件" placement="top">
            <el-button size="small" circle class="ctx-btn" @click="triggerFileUpload">
              <el-icon><UploadFilled /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="workspaceDir || '设置工作目录'" placement="top">
            <el-button size="small" circle class="ctx-btn" :class="{ 'is-active': hasWorkspaceDir }" @click="showWorkspaceDir = true">
              <el-icon><FolderOpened /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="MCP 工具" placement="top">
            <el-button size="small" circle class="ctx-btn" @click="showMount = true">
              <el-icon><Connection /></el-icon>
              <span v-if="store.mountedMcpServers.length" class="btn-badge">{{ store.mountedMcpServers.length }}</span>
            </el-button>
          </el-tooltip>
          <el-tooltip content="Skill" placement="top">
            <el-button size="small" circle class="ctx-btn" @click="showSkills = true">
              <el-icon><Files /></el-icon>
              <span v-if="mountedSkillIds.length" class="btn-badge">{{ mountedSkillIds.length }}</span>
            </el-button>
          </el-tooltip>

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
          <el-tooltip content="配置模型平台" placement="top">
            <el-button size="small" circle @click="openPlatformConfig">
              <el-icon><Setting /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="新建任务" placement="top">
            <el-button size="small" circle @click="startNewChat()">
              <el-icon><Plus /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="store.streaming ? '终止 (停止生成)' : '发送 (Enter)'" placement="top">
            <span>
              <el-button v-if="!store.streaming" type="primary" :icon="Promotion" :disabled="(!input.trim() && uploadedFiles.length === 0) || !selectedModelId" @click="send" circle class="send-btn" />
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

    <input ref="fileInputRef" type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.py,.js,.ts,.vue,.html,.css,.xml,.yaml,.yml,.log,.doc,.docx,.xlsx,.pptx,.zip" style="display:none" @change="handleFileChange" />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Component } from 'vue';
import {
  FolderOpened, ArrowDown, Connection, Files, UploadFilled, User, EditPen, Cpu, Setting, Plus,
  Promotion, Close, Lock, Check, Picture, Document, Tickets, Box, VideoCamera, Headset, Memo,
} from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';

const {
  inputFocused, workspaceDir, hasWorkspaceDir, clearWorkspaceDir, showWorkspaceDir, showMount, store, showSkills, mountedSkillIds,
  triggerFileUpload, input, send, agentStore, onAgentSwitch, openEditAgent, modelGroups,
  selectedModelId, onModelChange, openPlatformConfig, startNewChat, uploadedFiles, stopChat,
  formatSize, removeFile, fileInputRef, handleFileChange,
  workspaceFiles, selectedFilePaths, toggleFileSelect,
} = useChat();

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
