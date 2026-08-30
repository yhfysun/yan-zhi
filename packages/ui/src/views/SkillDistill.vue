<template>
  <div class="page distill-page">
    <header class="page-header">
      <h2 class="page-title">Skill 蒸馏</h2>
      <span class="page-sub">从对话记录蒸馏出可复用的 Skill · 三屏工作台</span>
    </header>

    <div class="three-pane">
      <!-- ============ 左屏：对话记录选择 ============ -->
      <aside class="pane pane-left glass-card">
        <div class="pane-header">
          <div class="pane-title">
            <el-icon><ChatDotRound /></el-icon>
            <span>对话记录</span>
          </div>
          <el-input
            v-model="convSearch"
            placeholder="搜索会话"
            size="small"
            clearable
            class="pane-search"
          />
        </div>

        <!-- 会话列表 -->
        <div class="conv-list">
          <div
            v-for="conv in filteredConversations"
            :key="conv.id"
            class="conv-item"
            :class="{ active: selectedConvId === conv.id }"
            @click="selectConv(conv.id)"
          >
            <el-icon><ChatDotRound /></el-icon>
            <span class="conv-title">{{ conv.title }}</span>
          </div>
          <el-empty v-if="filteredConversations.length === 0" :image-size="40" description="无会话" />
        </div>

        <!-- 消息勾选列表 -->
        <div class="msg-section">
          <div class="msg-section-title">
            <span>消息勾选</span>
            <el-tag size="small" type="primary" effect="plain">已选 {{ selectedMessages.length }}</el-tag>
          </div>
          <div v-if="!selectedConvId" class="msg-empty">
            <el-empty :image-size="50" description="请先选择会话" />
          </div>
          <div v-else class="msg-check-list">
            <div
              v-for="msg in convMessages"
              :key="msg.id"
              class="msg-check-item"
              :class="`role-${msg.role}`"
            >
              <el-checkbox v-model="msgChecked[msg.id]" />
              <span class="msg-check-role">{{ msg.role === 'user' ? '用户' : '助手' }}</span>
              <pre class="msg-check-content">{{ (msg.content || '').slice(0, 160) }}{{ (msg.content || '').length > 160 ? '...' : '' }}</pre>
            </div>
          </div>
        </div>

        <!-- 底部计数 -->
        <div class="pane-footer">
          <span class="footer-count">
            <el-icon><MagicStick /></el-icon>
            已勾选 <b>{{ selectedMessages.length }}</b> 条
          </span>
          <el-button
            size="small"
            type="primary"
            :disabled="selectedMessages.length === 0"
            @click="doDistill"
            :loading="distilling"
          >
            蒸馏
          </el-button>
        </div>
      </aside>

      <!-- ============ 中屏：模型配置 + 蒸馏指令 + 任务列表 ============ -->
      <main class="pane pane-center">
        <!-- 区域 1：模型配置（可折叠） -->
        <section class="glass-card section section-config">
          <div class="section-head" @click="configCollapsed = !configCollapsed">
            <div class="section-title">
              <el-icon><Setting /></el-icon>
              <span>模型配置</span>
            </div>
            <el-icon class="collapse-icon">
              <ArrowDown v-if="configCollapsed" /><ArrowUp v-else />
            </el-icon>
          </div>
          <transition name="collapse">
            <div v-show="!configCollapsed" class="section-body">
              <el-form label-width="100px" size="small" class="config-form">
                <el-form-item label="系统提示词">
                  <div class="prompt-editor">
                    <el-input
                      v-model="distillStore.config.systemPrompt"
                      type="textarea"
                      :rows="6"
                      placeholder="蒸馏智能体的系统提示词"
                    />
                    <el-button size="small" text @click="distillStore.resetPrompt()">恢复默认</el-button>
                  </div>
                </el-form-item>
                <div class="config-row">
                  <el-form-item label="temperature">
                    <el-input-number v-model="distillStore.config.temperature" :min="0" :max="2" :step="0.1" size="small" />
                  </el-form-item>
                  <el-form-item label="topP">
                    <el-input-number v-model="distillStore.config.topP" :min="0" :max="1" :step="0.05" size="small" />
                  </el-form-item>
                  <el-form-item label="maxTokens">
                    <el-input-number v-model="distillStore.config.maxTokens" :min="256" :max="8192" :step="256" size="small" />
                  </el-form-item>
                </div>
                <div class="config-row">
                  <el-form-item label="蒸馏平台">
                    <el-select v-model="distillStore.config.platformId" placeholder="默认平台" clearable size="small" style="width: 100%">
                      <el-option v-for="p in platformStore.platforms" :key="p.id" :label="p.name" :value="p.id" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="蒸馏模型">
                    <el-select
                      v-model="distillStore.config.modelId"
                      placeholder="默认模型"
                      clearable
                      size="small"
                      style="width: 100%"
                      :disabled="!availableModels.length"
                    >
                      <el-option v-for="m in availableModels" :key="m.id" :label="m.alias || m.modelId" :value="m.id" />
                    </el-select>
                  </el-form-item>
                </div>
                <div class="config-actions">
                  <el-button type="primary" size="small" @click="saveConfig">保存配置</el-button>
                  <el-button size="small" @click="distillStore.resetPrompt()">恢复默认提示词</el-button>
                </div>
              </el-form>
            </div>
          </transition>
        </section>

        <!-- 区域 2：蒸馏指令输入框 -->
        <section class="glass-card section section-instruction">
          <div class="section-head">
            <div class="section-title">
              <el-icon><EditPen /></el-icon>
              <span>蒸馏指令</span>
            </div>
            <el-tag size="small" type="info" effect="plain">
              {{ selectedMessages.length }} 条消息待蒸馏
            </el-tag>
          </div>
          <div class="section-body">
            <el-input
              v-model="refineInstruction"
              type="textarea"
              :rows="4"
              placeholder="输入蒸馏指令，或直接点击右屏「一键生成 Skill」..."
              class="instruction-input"
            />
            <div class="instruction-actions">
              <el-button
                type="primary"
                :icon="MagicStick"
                :loading="distilling"
                :disabled="selectedMessages.length === 0"
                @click="doDistill"
              >
                蒸馏选中消息
              </el-button>
              <el-button
                :icon="EditPen"
                :loading="refining"
                :disabled="!currentPreviewMd"
                @click="doRefineCurrent"
              >
                改造当前 Skill
              </el-button>
              <el-button
                v-if="refineInstruction.trim()"
                :icon="Close"
                @click="refineInstruction = ''"
              >
                清空指令
              </el-button>
            </div>
          </div>
        </section>

        <!-- 区域 3：蒸馏任务列表（可折叠） -->
        <section class="glass-card section section-tasks">
          <div class="section-head" @click="tasksCollapsed = !tasksCollapsed">
            <div class="section-title">
              <el-icon><List /></el-icon>
              <span>蒸馏任务</span>
              <el-tag size="small" effect="plain">{{ distillStore.tasks.length }}</el-tag>
            </div>
            <div class="head-actions" @click.stop>
              <el-button v-if="distillStore.tasks.length" size="small" text @click="distillStore.clearTasks()">清空</el-button>
              <el-icon class="collapse-icon">
                <ArrowDown v-if="tasksCollapsed" /><ArrowUp v-else />
              </el-icon>
            </div>
          </div>
          <transition name="collapse">
            <div v-show="!tasksCollapsed" class="section-body">
              <el-empty v-if="distillStore.tasks.length === 0" :image-size="60" description="还没有蒸馏任务，去左屏勾选消息或使用一键生成" />
              <div class="task-list">
                <div
                  v-for="task in distillStore.tasks"
                  :key="task.id"
                  class="task-card"
                  :class="{ expanded: expandedTaskId === task.id }"
                >
                  <div class="task-card-header" @click="toggleExpand(task.id)">
                    <el-tag :type="statusTagType(task.status)" size="small" effect="dark">
                      {{ statusLabel(task.status) }}
                    </el-tag>
                    <span class="task-title">{{ task.title }}</span>
                    <span class="task-time">{{ formatTime(task.createdAt) }}</span>
                    <el-icon class="task-chevron">
                      <ArrowDown v-if="expandedTaskId !== task.id" /><ArrowUp v-else />
                    </el-icon>
                  </div>

                  <div v-if="expandedTaskId === task.id" class="task-detail">
                    <div class="task-detail-grid">
                      <!-- 源对话 -->
                      <div class="task-source">
                        <div class="detail-label">源对话记录</div>
                        <div class="source-msgs">
                          <div
                            v-for="(m, i) in task.sourceMessages"
                            :key="i"
                            class="source-msg"
                            :class="`role-${m.role}`"
                          >
                            <span class="source-msg-role">{{ m.role === 'user' ? '用户' : '助手' }}</span>
                            <pre class="source-msg-content">{{ m.content || '(空)' }}</pre>
                          </div>
                        </div>
                      </div>

                      <!-- 蒸馏结果 -->
                      <div class="task-result">
                        <div class="detail-label">蒸馏结果（Skill Markdown）</div>
                        <pre v-if="task.resultMd" class="result-md">{{ task.resultMd }}</pre>
                        <el-empty v-else :image-size="40" description="无结果" />
                        <div v-if="task.error" class="task-error">{{ task.error }}</div>
                      </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="task-actions" v-if="task.status === 'done'">
                      <el-input
                        v-model="refineInputs[task.id]"
                        type="textarea"
                        :rows="2"
                        placeholder="改造指令，如：增加触发词、让输出更简洁..."
                        class="refine-input"
                      />
                      <div class="task-btns">
                        <el-button size="small" @click="doRefine(task.id)" :loading="refiningId === task.id" :disabled="!refineInputs[task.id]?.trim()">
                          <el-icon><EditPen /></el-icon> 改造
                        </el-button>
                        <el-button size="small" @click="doRedistill(task.id)" :loading="refiningId === task.id">
                          <el-icon><Refresh /></el-icon> 重新蒸馏
                        </el-button>
                        <el-button size="small" type="success" @click="doSave(task.id)" :loading="savingId === task.id">
                          <el-icon><Check /></el-icon> 保存到 Skill 商店
                        </el-button>
                        <el-button size="small" type="danger" @click="distillStore.removeTask(task.id)">
                          <el-icon><Delete /></el-icon> 删除
                        </el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </section>
      </main>

      <!-- ============ 右屏：Skill 预览 ============ -->
      <aside class="pane pane-right glass-card">
        <!-- 顶部：一键生成 Skill 按钮 -->
        <div class="generate-section">
          <el-button
            class="generate-btn"
            type="primary"
            size="large"
            :icon="MagicStick"
            :loading="generating"
            @click="doOneClickGenerate"
          >
            {{ generating ? '生成中...' : '一键生成 Skill' }}
          </el-button>
          <div class="generate-hint">
            <span v-if="selectedMessages.length > 0">将基于左屏 {{ selectedMessages.length }} 条消息蒸馏</span>
            <span v-else-if="refineInstruction.trim()">将基于中屏蒸馏指令生成</span>
            <span v-else>请先勾选消息或输入蒸馏指令</span>
          </div>
        </div>

        <!-- 切换：已保存 Skill / 蒸馏结果 -->
        <div class="preview-switch">
          <el-radio-group v-model="rightViewMode" size="small">
            <el-radio-button value="saved">已保存 Skill</el-radio-button>
            <el-radio-button value="distill">蒸馏结果</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 列表 / 预览内容 -->
        <div class="preview-body">
          <!-- 已保存 Skill 列表 -->
          <template v-if="rightViewMode === 'saved'">
            <el-input
              v-model="skillSearch"
              placeholder="搜索 name 或 description"
              size="small"
              clearable
              class="preview-search"
            />
            <div class="skill-list">
              <div
                v-for="s in sortedFilteredSkills"
                :key="s.id"
                class="skill-item"
                :class="{ active: selectedSkillId === s.id }"
                @click="selectSkill(s.id)"
              >
                <div class="skill-item-head">
                  <span class="skill-item-name">{{ s.name }}</span>
                  <span class="skill-dot" :class="{ on: s.enabled }" :title="s.enabled ? '已启用' : '已禁用'"></span>
                </div>
                <div class="skill-item-desc">{{ s.description || '(无描述)' }}</div>
                <div class="skill-item-tags">
                  <el-tag size="small" :type="s.source === 'local' ? 'success' : 'info'" effect="plain">
                    {{ s.source === 'local' ? '本地' : '市场' }}
                  </el-tag>
                  <el-tag v-if="s.isPublic" size="small" type="warning" effect="plain">已发布</el-tag>
                </div>
              </div>
              <el-empty
                v-if="sortedFilteredSkills.length === 0"
                :image-size="60"
                description="还没有已保存的 Skill"
              />
            </div>
          </template>

          <!-- 蒸馏结果列表 -->
          <template v-else>
            <div class="skill-list">
              <div
                v-for="task in doneDistillTasks"
                :key="task.id"
                class="skill-item"
                :class="{ active: selectedTaskId === task.id }"
                @click="selectedTaskId = task.id"
              >
                <div class="skill-item-head">
                  <span class="skill-item-name">{{ task.title }}</span>
                  <el-tag size="small" type="success" effect="plain">蒸馏</el-tag>
                </div>
                <div class="skill-item-desc">{{ (task.resultMd || '').slice(0, 60) }}{{ (task.resultMd || '').length > 60 ? '...' : '' }}</div>
                <div class="skill-item-tags">
                  <span class="task-time-small">{{ formatTime(task.createdAt) }}</span>
                </div>
              </div>
              <el-empty
                v-if="doneDistillTasks.length === 0"
                :image-size="60"
                description="还没有蒸馏结果"
              />
            </div>
          </template>
        </div>

        <!-- 预览详情 + 操作 -->
        <div class="preview-detail">
          <div v-if="!currentPreviewMd" class="preview-detail-empty">
            <el-empty :image-size="60" description="请选择一个 Skill 或蒸馏结果" />
          </div>
          <div v-else class="preview-detail-content">
            <!-- front-matter -->
            <div class="skill-section">
              <div class="detail-label">Front-matter</div>
              <div class="fm-grid">
                <div class="fm-row">
                  <span class="fm-key">name</span>
                  <span class="fm-val">{{ currentParsed.name }}</span>
                </div>
                <div class="fm-row">
                  <span class="fm-key">description</span>
                  <span class="fm-val">{{ currentParsed.description || '(无)' }}</span>
                </div>
                <div class="fm-row">
                  <span class="fm-key">triggers</span>
                  <div class="fm-triggers">
                    <el-tag
                      v-for="t in (currentParsed.triggers || [])"
                      :key="t"
                      size="small"
                      effect="plain"
                      class="fm-trigger-tag"
                    >{{ t }}</el-tag>
                    <span v-if="!(currentParsed.triggers && currentParsed.triggers.length)" class="fm-val">(无)</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- body 预览 -->
            <div class="skill-section">
              <div class="detail-label">Body（Markdown 原文）</div>
              <pre class="skill-body-md">{{ currentParsed.body || '(空)' }}</pre>
            </div>

            <!-- 改造结果预览（如果有） -->
            <transition name="refine-slide">
              <div v-if="refinedMd" class="refine-result">
                <div class="detail-label">改造结果预览</div>
                <pre class="refine-result-md">{{ refinedMd }}</pre>
              </div>
            </transition>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="preview-actions">
          <el-button
            size="small"
            type="success"
            :icon="Check"
            :loading="savingAsNew"
            :disabled="!currentPreviewMd"
            @click="doSaveCurrentAsSkill"
          >
            保存到 Skill 商店
          </el-button>
          <el-button
            size="small"
            type="primary"
            :icon="Refresh"
            :loading="applying"
            :disabled="!selectedSkill || !refinedMd"
            @click="doApplyUpdate"
          >
            应用更新
          </el-button>
          <el-button
            v-if="rightViewMode === 'saved' && selectedSkill"
            size="small"
            :type="selectedSkill.isPublic ? 'warning' : 'primary'"
            :icon="selectedSkill.isPublic ? Download : Upload"
            @click="onTogglePublic"
          >
            {{ selectedSkill.isPublic ? '下架' : '发布' }}
          </el-button>
          <el-button
            v-if="rightViewMode === 'saved' && selectedSkill"
            size="small"
            :icon="selectedSkill.enabled ? CircleClose : CircleCheck"
            @click="onToggleEnabled(!selectedSkill.enabled)"
          >
            {{ selectedSkill.enabled ? '禁用' : '启用' }}
          </el-button>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue';
import {
  EditPen, Refresh, Check, Delete, MagicStick, ArrowDown, ArrowUp, ChatDotRound,
  Upload, Download, Close, Setting, List, CircleClose, CircleCheck,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useDistillStore, useChatStore, usePlatformStore, useAuthStore, useSkillStore } from '../stores';
import { api } from '../api/client';

const distillStore = useDistillStore();
const chatStore = useChatStore();
const platformStore = usePlatformStore();
const authStore = useAuthStore();
const skillStore = useSkillStore();

// 中屏折叠状态
const configCollapsed = ref(false);
const tasksCollapsed = ref(false);

// 蒸馏任务展开
const expandedTaskId = ref<string>('');
const refineInputs = reactive<Record<string, string>>({});
const refiningId = ref('');
const savingId = ref('');

// 左屏：从对话选记录
const convSearch = ref('');
const selectedConvId = ref('');
const convMessages = ref<any[]>([]);
const msgChecked = reactive<Record<string, boolean>>({});
const distilling = ref(false);

// 中屏：蒸馏指令
const refineInstruction = ref('');
const refining = ref(false);
const refinedMd = ref('');
const applying = ref(false);
const savingAsNew = ref(false);

// 右屏
const rightViewMode = ref<'saved' | 'distill'>('saved');
const skillSearch = ref('');
const selectedSkillId = ref('');
const selectedTaskId = ref('');
const generating = ref(false);

onMounted(async () => {
  await distillStore.loadConfig();
  await chatStore.loadConversations();
  await skillStore.loadSkills();
});

const availableModels = computed(() => {
  const pid = distillStore.config.platformId;
  return pid ? platformStore.models.filter((m) => m.platformId === pid) : platformStore.models;
});

const filteredConversations = computed(() => {
  if (!convSearch.value) return chatStore.conversations;
  const q = convSearch.value.toLowerCase();
  return chatStore.conversations.filter((c) => c.title.toLowerCase().includes(q));
});

const selectedMessages = computed(() => {
  return convMessages.value
    .filter((m) => msgChecked[m.id])
    .map((m) => ({ role: m.role, content: m.content || '' }));
});

// 已完成的蒸馏任务（用于右屏蒸馏结果列表）
const doneDistillTasks = computed(() =>
  distillStore.tasks.filter((t) => t.status === 'done' && t.resultMd),
);

// 当前选中的 Skill
const selectedSkill = computed(() => skillStore.skills.find((s) => s.id === selectedSkillId.value));

// 当前选中的蒸馏任务
const selectedDistillTask = computed(() =>
  distillStore.tasks.find((t) => t.id === selectedTaskId.value),
);

// 右屏当前预览的 Markdown
const currentPreviewMd = computed(() => {
  if (refinedMd.value) return refinedMd.value;
  if (rightViewMode.value === 'saved') {
    return selectedSkill.value ? skillStore.exportToMd(selectedSkill.value) : '';
  }
  return selectedDistillTask.value?.resultMd || '';
});

// 解析当前预览的 Markdown
const currentParsed = computed(() => {
  if (!currentPreviewMd.value) {
    return { name: '', description: '', triggers: [] as string[], body: '' };
  }
  return distillStore.parseSkillMd(currentPreviewMd.value);
});

const sortedFilteredSkills = computed(() => {
  let list = skillStore.skills;
  if (skillSearch.value) {
    const q = skillSearch.value.toLowerCase();
    list = list.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q),
    );
  }
  return [...list].sort((a, b) => {
    if (a.source === b.source) return 0;
    return a.source === 'local' ? -1 : 1;
  });
});

function toggleExpand(id: string) {
  expandedTaskId.value = expandedTaskId.value === id ? '' : id;
}

function statusTagType(status: string): 'info' | 'warning' | 'success' | 'danger' {
  return status === 'done' ? 'success' : status === 'running' ? 'warning' : status === 'failed' ? 'danger' : 'info';
}

function statusLabel(status: string): string {
  return status === 'done' ? '完成' : status === 'running' ? '蒸馏中' : status === 'failed' ? '失败' : '待处理';
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

async function saveConfig() {
  try {
    await distillStore.saveConfig();
    ElMessage.success('配置已保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  }
}

async function selectConv(convId: string) {
  selectedConvId.value = convId;
  convMessages.value = [];
  if (authStore.isLoggedIn) {
    const r = await api.get<any[]>(`/conversations/${convId}/messages`);
    if ('data' in r) convMessages.value = r.data as any[];
  } else {
    await chatStore.loadMessages(convId);
    convMessages.value = [...chatStore.currentMessages];
  }
  for (const m of convMessages.value) msgChecked[m.id] = false;
}

/** 蒸馏左屏勾选的消息 */
async function doDistill() {
  if (selectedMessages.value.length === 0) {
    ElMessage.warning('请勾选至少一条消息');
    return;
  }
  distilling.value = true;
  try {
    const conv = chatStore.conversations.find((c) => c.id === selectedConvId.value);
    const taskId = await distillStore.distill(selectedMessages.value, {
      title: `来自「${conv?.title || '会话'}」`,
    });
    ElMessage.success('蒸馏完成');
    // 自动切换右屏到蒸馏结果，并选中刚生成的任务
    rightViewMode.value = 'distill';
    selectedTaskId.value = taskId;
    // 清空勾选
    for (const m of convMessages.value) msgChecked[m.id] = false;
  } catch (e: any) {
    ElMessage.error(e?.message || '蒸馏失败');
  } finally {
    distilling.value = false;
  }
}

/** 一键生成 Skill */
async function doOneClickGenerate() {
  if (selectedMessages.value.length === 0 && !refineInstruction.value.trim()) {
    ElMessage.warning('请先勾选消息或输入蒸馏指令');
    return;
  }
  generating.value = true;
  try {
    if (selectedMessages.value.length > 0) {
      // 有勾选消息：直接蒸馏
      const conv = chatStore.conversations.find((c) => c.id === selectedConvId.value);
      const taskId = await distillStore.distill(selectedMessages.value, {
        title: refineInstruction.value.trim()
          ? `一键生成：${refineInstruction.value.slice(0, 20)}`
          : `来自「${conv?.title || '会话'}」`,
      });
      rightViewMode.value = 'distill';
      selectedTaskId.value = taskId;
      ElMessage.success('Skill 已生成');
    } else {
      // 没有勾选消息但有指令：用指令作为单条 user 消息蒸馏
      const taskId = await distillStore.distill(
        [{ role: 'user', content: refineInstruction.value }],
        { title: `指令生成：${refineInstruction.value.slice(0, 20)}` },
      );
      rightViewMode.value = 'distill';
      selectedTaskId.value = taskId;
      ElMessage.success('Skill 已生成');
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败');
  } finally {
    generating.value = false;
  }
}

async function doRefine(taskId: string) {
  const instruction = refineInputs[taskId];
  if (!instruction?.trim()) return;
  refiningId.value = taskId;
  try {
    await distillStore.refineSkill(taskId, instruction);
    refineInputs[taskId] = '';
    ElMessage.success('改造完成');
  } catch (e: any) {
    ElMessage.error(e?.message || '改造失败');
  } finally {
    refiningId.value = '';
  }
}

async function doRedistill(taskId: string) {
  refiningId.value = taskId;
  try {
    await distillStore.redistill(taskId);
    ElMessage.success('重新蒸馏完成');
  } catch (e: any) {
    ElMessage.error(e?.message || '蒸馏失败');
  } finally {
    refiningId.value = '';
  }
}

async function doSave(taskId: string) {
  savingId.value = taskId;
  try {
    const newId = await distillStore.saveAsSkill(taskId);
    ElMessage.success('已保存到 Skill 商店');
    // 切换到已保存视图并选中新保存的 Skill
    rightViewMode.value = 'saved';
    selectedSkillId.value = newId;
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    savingId.value = '';
  }
}

/** 改造当前右屏预览的 Skill */
async function doRefineCurrent() {
  const baseMd = currentPreviewMd.value;
  if (!baseMd) {
    ElMessage.warning('右屏没有可改造的 Skill');
    return;
  }
  if (!refineInstruction.value.trim()) {
    ElMessage.warning('请输入改造指令');
    return;
  }
  refining.value = true;
  try {
    const result = await distillStore.refineMd(baseMd, refineInstruction.value);
    refinedMd.value = result;
    ElMessage.success('改造完成，可继续改造或保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '改造失败');
  } finally {
    refining.value = false;
  }
}

/** 保存当前预览的 Markdown 到 Skill 商店 */
async function doSaveCurrentAsSkill() {
  const md = refinedMd.value || currentPreviewMd.value;
  if (!md) {
    ElMessage.warning('没有可保存的内容');
    return;
  }
  savingAsNew.value = true;
  try {
    const newId = await distillStore.saveMdAsSkill(md);
    ElMessage.success('已保存到 Skill 商店');
    refinedMd.value = '';
    rightViewMode.value = 'saved';
    selectedSkillId.value = newId;
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    savingAsNew.value = false;
  }
}

/** 应用更新到当前选中的已保存 Skill */
async function doApplyUpdate() {
  if (!selectedSkill.value || !refinedMd.value) return;
  applying.value = true;
  const skillId = selectedSkill.value.id;
  try {
    const parsed = distillStore.parseSkillMd(refinedMd.value);
    await skillStore.updateSkill(skillId, {
      description: parsed.description,
      bodyMd: parsed.body,
      triggers: parsed.triggers,
    });
    ElMessage.success('已应用更新到当前 Skill');
    refinedMd.value = '';
    selectedSkillId.value = skillId;
  } catch (e: any) {
    ElMessage.error(e?.message || '应用更新失败');
  } finally {
    applying.value = false;
  }
}

function selectSkill(id: string) {
  selectedSkillId.value = id;
  refinedMd.value = '';
}

async function doToggleEnabled(id: string, enabled: boolean) {
  try {
    await skillStore.toggleEnabled(id, enabled);
    ElMessage.success(enabled ? '已启用' : '已禁用');
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

function onToggleEnabled(v: boolean | string | number) {
  if (!selectedSkill.value) return;
  doToggleEnabled(selectedSkill.value.id, !!v);
}

async function doTogglePublic(id: string, isPublic: boolean) {
  try {
    await skillStore.togglePublic(id, isPublic);
    ElMessage.success(isPublic ? '已发布到商城' : '已下架');
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败');
  }
}

function onTogglePublic() {
  if (!selectedSkill.value) return;
  doTogglePublic(selectedSkill.value.id, !selectedSkill.value.isPublic);
}
</script>

<style scoped>
.distill-page { padding: 20px 24px; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.page-header { margin-bottom: 16px; flex-shrink: 0; }

/* ===== 三屏布局 ===== */
.three-pane {
  display: grid;
  grid-template-columns: 280px 1fr 380px;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.pane-left { padding: 12px; }
.pane-right { padding: 12px; }
.pane-center { gap: 12px; overflow-y: auto; padding-right: 4px; }

/* ===== 通用 section ===== */
.section { padding: 12px 14px; }
.section-head {
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; user-select: none;
}
.section-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 14px; font-weight: 600;
}
.section-title .el-tag { margin-left: 4px; }
.collapse-icon { color: var(--color-text-secondary); }
.section-body { margin-top: 10px; }
.head-actions { display: flex; align-items: center; gap: 6px; }

/* 折叠动画 */
.collapse-enter-active, .collapse-leave-active { transition: all 0.2s ease; }
.collapse-enter-from, .collapse-leave-to { opacity: 0; transform: translateY(-4px); }

/* ===== 左屏 ===== */
.pane-header { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; flex-shrink: 0; }
.pane-title { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; }
.pane-search { width: 100%; }

.conv-list {
  flex: 0 0 auto; max-height: 35%; overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
  margin-bottom: 10px;
}
.conv-item {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  transition: background 0.15s;
}
.conv-item:hover { background: var(--glass-bg-hover); }
.conv-item.active { background: rgba(124,58,237,0.1); color: var(--color-primary); }
.conv-item .conv-title {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: 13px;
}

.msg-section {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  border-top: 1px dashed var(--glass-border); padding-top: 8px;
}
.msg-section-title {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; font-weight: 600; margin-bottom: 8px;
}
.msg-empty { flex: 1; display: flex; align-items: center; justify-content: center; }
.msg-check-list {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
}
.msg-check-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 8px; border-radius: 6px; background: rgba(15,23,42,0.03);
}
.msg-check-item.role-user { border-left: 3px solid var(--color-primary); }
.msg-check-item.role-assistant { border-left: 3px solid var(--color-accent); }
.msg-check-role {
  font-size: 11px; font-weight: 600; color: var(--color-text-secondary);
  flex-shrink: 0; padding-top: 2px;
}
.msg-check-content {
  font-size: 12px; white-space: pre-wrap; word-break: break-word; flex: 1;
  font-family: inherit; color: var(--color-text-secondary); margin: 0;
}

.pane-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 10px; margin-top: 8px; border-top: 1px dashed var(--glass-border);
  flex-shrink: 0;
}
.footer-count {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px; color: var(--color-text-secondary);
}
.footer-count b { color: var(--color-primary); }

/* ===== 中屏：配置 ===== */
.config-form { max-width: 100%; }
.config-row { display: flex; gap: 12px; flex-wrap: wrap; }
.config-row .el-form-item { flex: 1; min-width: 160px; }
.prompt-editor { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.config-actions { display: flex; gap: 8px; margin-top: 4px; }

/* ===== 中屏：蒸馏指令 ===== */
.section-instruction .section-head { cursor: default; }
.instruction-input { width: 100%; }
.instruction-actions {
  display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;
}

/* ===== 中屏：任务列表 ===== */
.task-list { display: flex; flex-direction: column; gap: 10px; }
.task-card {
  padding: 12px 14px; border-radius: 8px;
  background: rgba(15,23,42,0.03); border: 1px solid var(--glass-border);
}
.task-card-header { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.task-title {
  font-weight: 600; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.task-time { font-size: 12px; color: var(--color-text-secondary); }
.task-chevron { color: var(--color-text-secondary); }

.task-detail { margin-top: 12px; }
.task-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.detail-label {
  font-size: 13px; font-weight: 600; color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.source-msgs {
  max-height: 220px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px;
}
.source-msg { padding: 6px 10px; border-radius: 6px; background: rgba(15,23,42,0.04); }
.source-msg.role-user { border-left: 3px solid var(--color-primary); }
.source-msg.role-assistant { border-left: 3px solid var(--color-accent); }
.source-msg-role { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); }
.source-msg-content {
  font-size: 12px; white-space: pre-wrap; word-break: break-word;
  margin-top: 2px; font-family: inherit; margin: 2px 0 0;
}
.result-md {
  background: rgba(15,23,42,0.04); padding: 12px; border-radius: 6px;
  font-family: "JetBrains Mono", monospace; font-size: 12px;
  max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word;
  margin: 0;
}
.task-error { color: var(--color-danger); font-size: 13px; margin-top: 8px; }

.task-actions { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.refine-input { width: 100%; }
.task-btns { display: flex; gap: 8px; flex-wrap: wrap; }

/* ===== 右屏 ===== */
.generate-section {
  display: flex; flex-direction: column; gap: 6px;
  padding-bottom: 10px; border-bottom: 1px dashed var(--glass-border);
  flex-shrink: 0;
}
.generate-btn { width: 100%; font-size: 15px; font-weight: 600; height: 44px; }
.generate-hint { font-size: 12px; color: var(--color-text-secondary); text-align: center; }

.preview-switch {
  display: flex; justify-content: center;
  padding: 10px 0; flex-shrink: 0;
}
.preview-switch .el-radio-group { width: 100%; }
.preview-switch .el-radio-button { width: 50%; }
.preview-switch .el-radio-button :deep(.el-radio-button__inner) { width: 100%; }

.preview-body {
  flex: 0 1 auto; max-height: 35%; display: flex; flex-direction: column;
  min-height: 100px;
}
.preview-search { margin-bottom: 8px; flex-shrink: 0; }
.skill-list {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
  min-height: 0;
}
.skill-item {
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  transition: background 0.15s;
  display: flex; flex-direction: column; gap: 4px;
  border: 1px solid transparent;
}
.skill-item:hover { background: var(--glass-bg-hover); }
.skill-item.active { background: rgba(124,58,237,0.1); border-color: rgba(124,58,237,0.3); }
.skill-item-head { display: flex; align-items: center; gap: 6px; }
.skill-item-name {
  font-weight: 600; font-size: 13px; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.skill-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-text-secondary); flex-shrink: 0; opacity: 0.4;
}
.skill-dot.on {
  background: var(--color-success, #22c55e); opacity: 1;
  box-shadow: 0 0 4px rgba(34,197,94,0.5);
}
.skill-item-desc {
  font-size: 12px; color: var(--color-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.skill-item-tags { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.task-time-small { font-size: 11px; color: var(--color-text-secondary); }

.preview-detail {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  border-top: 1px dashed var(--glass-border); padding-top: 10px; margin-top: 8px;
  overflow: hidden;
}
.preview-detail-empty { flex: 1; display: flex; align-items: center; justify-content: center; }
.preview-detail-content {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
  padding-right: 4px;
}

.skill-section { display: flex; flex-direction: column; }
.fm-grid {
  display: flex; flex-direction: column; gap: 6px;
  background: rgba(15,23,42,0.03); padding: 10px 12px; border-radius: 6px;
}
.fm-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; }
.fm-key {
  font-weight: 600; color: var(--color-text-secondary);
  min-width: 80px; flex-shrink: 0; font-family: "JetBrains Mono", monospace;
}
.fm-val { color: var(--color-text-primary); word-break: break-word; flex: 1; }
.fm-triggers { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; align-items: center; }

.skill-body-md {
  background: rgba(15,23,42,0.04); padding: 12px; border-radius: 6px;
  font-family: "JetBrains Mono", monospace; font-size: 12px;
  max-height: 240px; overflow: auto; white-space: pre-wrap; word-break: break-word;
  margin: 0;
}

.refine-result { display: flex; flex-direction: column; gap: 6px; }
.refine-result-md {
  background: rgba(15,23,42,0.04); padding: 12px; border-radius: 6px;
  font-family: "JetBrains Mono", monospace; font-size: 12px;
  max-height: 200px; overflow: auto; white-space: pre-wrap; word-break: break-word;
  margin: 0;
}

.preview-actions {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding-top: 10px; border-top: 1px dashed var(--glass-border);
  margin-top: 8px; flex-shrink: 0;
}
.preview-actions .el-button { flex: 1; min-width: 90px; }

/* 改造结果展开/收起动画 */
.refine-slide-enter-active, .refine-slide-leave-active { transition: all 0.25s ease; }
.refine-slide-enter-from, .refine-slide-leave-to { opacity: 0; transform: translateY(-6px); }

/* ===== 响应式：小屏幕上下堆叠 ===== */
@media (max-width: 1023px) {
  .three-pane {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    overflow-y: auto;
  }
  .pane { max-height: none; overflow: visible; }
  .pane-left { min-height: 360px; }
  .pane-center { overflow: visible; }
  .pane-right { min-height: 480px; }
  .conv-list { max-height: 200px; }
  .preview-body { max-height: 280px; }
}

@media (max-width: 767px) {
  .distill-page { padding: 12px; }
  .task-detail-grid { grid-template-columns: 1fr; }
  .config-row { flex-direction: column; }
  .config-row .el-form-item { min-width: 100%; }
}
</style>
