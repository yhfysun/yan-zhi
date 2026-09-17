<template>
  <div
    class="input-area"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="input-box" :class="{ focused: inputFocused, 'is-dragover': dragOver }">

      <div class="input-agent-bar">
        <el-dropdown trigger="click" placement="bottom-start" popper-class="agent-switch-popper" @command="onAgentSwitch">
          <div class="agent-trigger" @click.stop>
            <span class="agent-trigger-avatar"><el-icon :size="14"><component :is="agentIconOf(agentStore.selectedAgent?.id, agentStore.selectedAgent?.name)" /></el-icon></span>
            <span class="agent-trigger-name">{{ agentStore.selectedAgent?.name || '选择智能体' }}</span>
            <el-icon class="agent-trigger-caret"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="ag in agentStore.chatAgents"
                :key="ag.id"
                :command="ag.id"
                :class="{ 'is-active': ag.id === agentStore.selectedId }"
              >
                <div class="agent-opt">
                  <span class="agent-opt-avatar"><el-icon :size="16"><component :is="agentIconOf(ag.id, ag.name)" /></el-icon></span>
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
            <el-icon><Setting /></el-icon>
          </el-button>
        </el-tooltip>
        <!-- 场景标识（新会话草稿态显示，随首条消息注入场景提示词后不再出现） -->
        <div
          v-if="currentScene && !store.currentConvId"
          class="scene-chip"
          :style="{ '--scene-color': currentScene.color }"
          :title="currentScene.desc"
        >
          <el-icon :size="12"><component :is="currentScene.icon" /></el-icon>
          <span class="scene-chip-label">{{ currentScene.label }}</span>
          <el-icon class="scene-chip-close" :size="10" @click="clearScene"><Close /></el-icon>
        </div>
      </div>

      <!-- 追加消息队列：任务运行中发送的消息堆叠在输入框上方。
           限高 + 可滚动，逐条可「立即发送 / 编辑 / 删除」；任务收尾后未发出的会自动补发。 -->
      <div v-if="queuedList.length > 0" class="queue-panel">
        <div class="queue-head">
          <el-icon :size="12"><Clock /></el-icon>
          <span class="queue-head-text">{{ queuedList.length }} 条追加消息 · 任务本轮结束后自动发送</span>
        </div>
        <div class="queue-list">
          <div v-for="(q, i) in queuedList" :key="q.id" class="queue-item">
            <span class="queue-idx">{{ i + 1 }}</span>
            <div class="queue-text">{{ q.content }}</div>
            <div class="queue-actions">
              <el-tooltip content="立即发送（下一轮调用大模型时带上）" placement="top">
                <button type="button" class="queue-btn" aria-label="立即发送" @click="sendQueuedNow(q.id)">
                  <el-icon :size="13"><Promotion /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="编辑（回到输入框）" placement="top">
                <button type="button" class="queue-btn" aria-label="编辑" @click="editQueued(q.id)">
                  <el-icon :size="13"><EditPen /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <button type="button" class="queue-btn danger" aria-label="删除" @click="removeQueued(q.id)">
                  <el-icon :size="13"><Delete /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>

      <el-input
        ref="inputRef"
        v-model="input"
        type="textarea"
        :autosize="{ minRows: 3, maxRows: 12 }"
        :placeholder="isCodeMode ? '描述代码任务，Enter 发送，Shift+Enter 换行；输入 / 打开命令，@ 引用文件' : '输入消息，Enter 发送，Shift+Enter 换行；输入 / 打开命令，@ 引用文件'"
        @keydown.enter.exact="onEnter"
        @keydown.up="onKeyUp"
        @keydown.down="onKeyDown"
        @keydown.esc="onEsc"
        @paste="onPaste"
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
                v-for="(ag, i) in agentStore.chatAgents"
                :key="ag.id"
                class="cmd-menu-item"
                :class="{ active: i === slashIndex }"
                @click="pickSlashAgent(ag)"
              >
                <span class="cmd-opt-avatar"><el-icon :size="15"><component :is="agentIconOf(ag.id, ag.name)" /></el-icon></span>
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
                  <span class="plus-menu-ic"><el-icon><component :is="agentIconOf(agentStore.selectedAgent?.id, agentStore.selectedAgent?.name)" /></el-icon></span>
                  <div class="plus-menu-info">
                    <div class="plus-menu-label">助手</div>
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
              <Teleport to="body">
              <transition name="plus-sub-fade">
                <div v-if="hoverSub" class="plus-menu plus-menu-sub" :style="{ top: subTop + 'px', left: subLeft + 'px' }" @mouseenter="cancelCloseSub">
                  <template v-if="hoverSub === 'agents'">
                    <div
                      v-for="ag in agentStore.chatAgents"
                      :key="ag.id"
                      class="plus-menu-item"
                      :class="{ 'is-active': ag.id === agentStore.selectedId }"
                      @click="pickPlusAgent(ag.id)"
                    >
                      <span class="plus-menu-ic"><el-icon><component :is="agentIconOf(ag.id, ag.name)" /></el-icon></span>
                      <div class="plus-menu-info">
                        <div class="plus-menu-label">{{ ag.name }}</div>
                        <div class="plus-menu-desc">{{ ag.description || '未填写描述' }}</div>
                      </div>
                      <el-icon v-if="ag.id === agentStore.selectedId" class="plus-menu-check"><Check /></el-icon>
                    </div>
                    <div class="plus-menu-item" @click="closePlus(() => openEditAgent(agentStore.selectedAgent))">
                      <span class="plus-menu-ic"><el-icon><EditPen /></el-icon></span>
                      <div class="plus-menu-info"><div class="plus-menu-label">编辑当前助手</div></div>
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
              </Teleport>
            </div>
          </el-popover>
          <!-- 截图按钮（对齐微信设计）：主体点击即框选；右侧小箭头下拉 =
               「截图时隐藏本应用窗口」勾选项 + 快捷键设置入口。tooltip 带快捷键。 -->
          <div v-if="canScreenshot" class="shot-btn-group">
            <el-tooltip :content="shotTooltip" placement="top">
              <el-button size="small" circle class="ctx-btn shot-main" :disabled="snipping" @click="startScreenshot">
                <el-icon><Camera /></el-icon>
              </el-button>
            </el-tooltip>
            <el-dropdown trigger="click" placement="top-end" popper-class="shot-menu-popper" @command="onShotMenu">
              <button type="button" class="shot-caret" :disabled="snipping" aria-label="截图设置">
                <el-icon><ArrowDown /></el-icon>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="toggleHideApp">
                    <span class="shot-menu-row">
                      <span>截图时隐藏本应用窗口</span>
                      <el-icon v-if="shotHideApp" class="shot-menu-check"><Check /></el-icon>
                    </span>
                  </el-dropdown-item>
                  <el-dropdown-item command="openSettings" divided>
                    <span class="shot-menu-row"><span>截图快捷键设置…</span></span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <div class="toolbar-mobile-selects">
          <el-popover v-model:visible="agentPopOpen" placement="top" trigger="click" :width="220" :show-arrow="false">
            <template #reference>
              <el-button size="small" circle>
                <el-icon><User /></el-icon>
              </el-button>
            </template>
            <div class="pop-select-list">
              <div
                v-for="ag in agentStore.chatAgents"
                :key="ag.id"
                class="pop-select-item"
                :class="{ active: ag.id === agentStore.selectedId }"
                @click="onAgentSwitch(ag.id); agentStore.selectAgent(ag.id); agentPopOpen = false"
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

          <el-popover v-model:visible="modelPopOpenCompact" placement="top" trigger="click" :width="240" :show-arrow="false">
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
                  @click="pickModel(m.id)"
                >
                  <span>{{ m.alias || m.modelId }}</span>
                </div>
              </template>
            </div>
          </el-popover>
        </div>

        <div class="toolbar-right">
          <!-- 会话级工具权限：选择值持久化到 conversation.permission_mode，后端按此裁剪/拦截写类工具 -->
          <el-popover placement="top-end" :width="250" trigger="click" :show-arrow="false">
            <template #reference>
              <!-- 注意：tooltip 不能套在 button 外层——会吃掉事件导致 popover 点不开。
                   同模型下拉的坑，见下方 model-select-btn 注释。改用 title 属性。 -->
              <button type="button" class="model-select-btn perm-select-btn" :class="{ 'perm-readonly': store.permissionMode === 'readonly' }" title="工具权限：限制智能体能执行的操作范围">
                <el-icon :size="13"><Lock /></el-icon>
                <span class="model-select-name">{{ permissionLabel }}</span>
                <el-icon :size="11"><ArrowDown /></el-icon>
              </button>
            </template>
            <div class="pop-select-list">
              <div
                v-for="p in PERMISSION_OPTIONS"
                :key="p.value"
                class="pop-select-item"
                :class="{ active: store.permissionMode === p.value }"
                @click="onPermissionChange(p.value)"
              >
                <div class="pop-perm-info">
                  <span>{{ p.label }}</span>
                  <span class="pop-perm-desc">{{ p.desc }}</span>
                </div>
                <el-icon v-if="store.permissionMode === p.value" class="pop-perm-check"><Check /></el-icon>
              </div>
            </div>
          </el-popover>
          <el-popover v-model:visible="modelPopOpen" placement="top-end" :width="260" trigger="click" :show-arrow="false">
            <template #reference>
              <!-- 注意：tooltip 不能套在 button 外层——会吃掉事件导致 popover 点不开。
                   改为让 popover 直接持有 button，tooltip 走 title 属性。 -->
              <button type="button" class="model-select-btn" :title="`模型：${currentModelName}`">
                <el-icon :size="13"><Cpu /></el-icon>
                <span class="model-select-name">{{ currentModelName }}</span>
                <el-icon :size="11"><ArrowDown /></el-icon>
              </button>
            </template>
            <div class="pop-select-list pop-select-models">
              <!-- 几百个模型的平台靠搜索定位；平台分组可整体折叠，收起后只留一行标题 -->
              <el-input
                v-model="modelSearch"
                size="small"
                placeholder="搜索模型"
                clearable
                class="pop-model-search"
              >
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <div class="pop-model-scroll">
                <template v-for="g in filteredModelGroups" :key="g.platformId">
                  <div class="pop-select-label pop-model-group" @click="togglePlatformGroup(g.platformId)">
                    <el-icon :size="12" class="pop-model-caret">
                      <ArrowDown v-if="isPlatformExpanded(g.platformId)" />
                      <ArrowRight v-else />
                    </el-icon>
                    <span class="pop-model-platform">{{ g.platformName }}</span>
                    <span class="pop-model-count">{{ g.models.length }}</span>
                  </div>
                  <template v-if="isPlatformExpanded(g.platformId)">
                    <div
                      v-for="m in g.models"
                      :key="m.id"
                      class="pop-select-item pop-select-model"
                      :class="{ active: m.id === selectedModelId }"
                      @mouseenter="openCtxPanel(m, $event)"
                      @mouseleave="scheduleCloseCtxPanel"
                      @click="pickModel(m.id)"
                    >
                      <span class="pop-select-name">{{ m.alias || m.modelId }}</span>
                      <span class="pop-select-ctx">{{ formatContextWindow(m.contextWindow) }}</span>
                    </div>
                  </template>
                </template>
                <div v-if="!filteredModelGroups.length" class="pop-model-empty">没有匹配的模型</div>
              </div>
            </div>
          </el-popover>
          <!-- 模型项 hover → 左侧弹出上下文窗口快捷设置（与顶栏模型菜单共用同一面板组件） -->
          <Teleport to="body">
            <transition name="plus-sub-fade">
              <div
                v-if="ctxPanelModel"
                ref="ctxPanelEl"
                class="ctx-panel-pop"
                :style="{ top: ctxPanelTop + 'px', left: ctxPanelLeft + 'px' }"
                @mouseenter="cancelCloseCtxPanel"
                @mouseleave="scheduleCloseCtxPanel"
              >
                <ModelContextPanel
                  :name="ctxPanelModel.alias || ctxPanelModel.modelId"
                  :context-window="ctxPanelModel.contextWindow"
                  @change="onCtxWindowChange"
                />
              </div>
            </transition>
          </Teleport>
          <el-tooltip content="新建任务" placement="top">
            <el-button size="small" circle class="new-task-btn" @click="startNewChat()">
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

    <!-- 附件 chip：hover 弹出固定尺寸预览卡（图片等比例缩放 / PDF 首页 / 表格 / 文本 / Word） -->
    <div v-if="uploadedFiles.length > 0" class="file-chips">
      <el-popover
        v-for="(f, idx) in uploadedFiles"
        :key="idx"
        placement="top"
        trigger="hover"
        :width="320"
        :show-after="260"
        :hide-after="60"
        :show-arrow="false"
        popper-class="atp-popper"
      >
        <template #reference>
          <div class="file-chip">
            <el-icon class="file-chip-icon" :style="{ color: fileTypeMeta(f.name).color }">
              <component :is="fileTypeMeta(f.name).icon" />
            </el-icon>
            <span class="file-chip-name">{{ f.name }}</span>
            <span class="file-chip-size">{{ formatSize(f.size) }}</span>
            <el-button size="small" link class="file-chip-remove" @click="removeFile(idx)">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </template>
        <AttachmentPreview :file="f" />
      </el-popover>
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
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import type { Component } from 'vue';
import { ElMessage } from 'element-plus';
import {
  FolderOpened, ArrowDown, ArrowRight, Connection, Files, UploadFilled, User, EditPen, Cpu, Setting, Plus, Camera,
  Promotion, Close, Lock, Check, Picture, Document, Tickets, Box, VideoCamera, Headset, Memo, ChatDotRound,
  Operation, Search, Link, Delete, Clock,
} from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import AttachmentPreview from './AttachmentPreview.vue';
import ModelContextPanel from './ModelContextPanel.vue';
import { useCodeStore } from '../../stores/code';
import { useSettingsStore, usePlatformStore } from '../../stores';
import { formatContextWindow } from '../../utils/context-window';
import { resolveAgentIcon as agentIconOf } from '../../utils/agentIcon';
import type { Model } from '@yan-zhi/shared';
import { useRouter } from 'vue-router';

const {
  inputFocused, workspaceDir, hasWorkspaceDir, clearWorkspaceDir, showWorkspaceDir, showMount, store, showSkills, mountedSkillIds,
  skillStore, skillSearch, filteredSkillStore, toggleSkillMount,
  triggerFileUpload, input, inputRef, send, agentStore, onAgentSwitch, openEditAgent, modelGroups,
  currentScene, clearScene,
  selectedModelId, onModelChange, openPlatformConfig, startNewChat, uploadedFiles, stopChat,
  queuedList, sendQueuedNow, editQueued, removeQueued,
  formatSize, removeFile, fileInputRef, handleFileChange, addFiles,
  workspaceFiles, selectedFilePaths, toggleFileSelect,
  quotedUrls, removeQuotedUrl, LONG_INPUT_THRESHOLD,
} = useChat();

const isCodeMode = useCodeStore().codeModeActive;
const inputTooLong = computed(() => input.value.length > LONG_INPUT_THRESHOLD);

// ===== 会话级工具权限（只读/默认/全部放行）=====
// 选择持久化到 conversation.permission_mode；readonly 模式下后端会构建期裁剪写工具 + 运行时硬拦截
type PermissionMode = 'readonly' | 'default' | 'full';
const PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string; desc: string }> = [
  { value: 'default', label: '默认权限', desc: '正常执行所有工具' },
  { value: 'readonly', label: '只读', desc: '禁止写入/执行/委派，仅检索浏览' },
  { value: 'full', label: '全部放行', desc: '不做限制（等同默认）' },
];
const permissionLabel = computed(() =>
  PERMISSION_OPTIONS.find((p) => p.value === store.permissionMode)?.label || '默认权限',
);
function onPermissionChange(mode: PermissionMode) {
  void store.setPermissionMode(mode);
}

// ===== 截图（桌面端专属）：调主进程全屏框选截图，结果作为图片附件加入输入框 =====
// 仅 electronAPI.screenshot 存在（桌面 preload 注入）时显示按钮；web / 移动端自动隐藏。
const canScreenshot = typeof window !== 'undefined' && !!(window as any).electronAPI?.screenshot;
const snipping = ref(false);

// ===== 截图按钮微信式设计：tooltip 带快捷键 + 下拉「隐藏窗口」开关 =====
const router = useRouter();
const settingsStore2 = useSettingsStore();
const shotHideApp = computed(() => settingsStore2.settings.screenshotHideApp !== false);
const shotTooltip = computed(() => {
  const acc = String(settingsStore2.settings.screenshotAccelerator ?? '')
    .replace(/Control/g, 'Ctrl').replace(/\+/g, '+');
  return acc ? `截图（${acc}）` : '截图';
});
function onShotMenu(cmd: string | number | object) {
  if (cmd === 'toggleHideApp') {
    void settingsStore2.update({ screenshotHideApp: !shotHideApp.value });
  } else if (cmd === 'openSettings') {
    void (router as any)?.push?.('/settings');
  }
}

async function startScreenshot() {
  if (snipping.value || !canScreenshot) return;
  snipping.value = true;
  try {
    // 先清掉可能残留的上一次框选会话（必备自愈：主进程侧已有同名兜底，
    // 这里让未升级的主进程也能被复用，避免「已有截图会话进行中」把用户卡死）
    try { await (window as any).electronAPI.screenshot.cancel(); } catch { /* 旧主进程无此接口，忽略 */ }
    // 截图时是否隐藏本应用窗口：设置页可关（用户想截自己界面里的内容）
    const hideApp = useSettingsStore().settings.screenshotHideApp !== false;
    const res = await (window as any).electronAPI.screenshot.capture({ hideApp });
    if (res?.ok && res.dataUrl) {
      const blob = await (await fetch(res.dataUrl)).blob();
      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `截图_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
      addFiles([new File([blob], name, { type: 'image/png' })]);
      inputRef.value?.focus();
    } else if (res && res.ok === false && !res.cancelled && res.error) {
      ElMessage.error(`截图失败：${res.error}`);
    }
    // 用户取消（cancelled）静默返回，不打扰
  } catch (err: any) {
    ElMessage.error(`截图失败：${err?.message || err}`);
  } finally {
    snipping.value = false;
  }
}

// ===== 「+」聚合菜单（对齐 WorkBuddy：专家/模式 hover 右侧弹出子菜单，其余点击触发） =====
const plusOpen = ref(false);
function closePlus(fn?: () => void) { fn?.(); plusOpen.value = false; hoverSub.value = null; }
function pickPlusAgent(id: string) { onAgentSwitch(id); closePlus(); }

// hover 子菜单：记录触发行 offsetTop，子菜单绝对定位对齐该行
const hoverSub = ref<'agents' | 'modes' | 'skills' | null>(null);
const subTop = ref(0);
const subLeft = ref(0);
let subCloseTimer: ReturnType<typeof setTimeout> | undefined;
function openSub(kind: 'agents' | 'modes' | 'skills', evt: MouseEvent) {
  if (subCloseTimer) { clearTimeout(subCloseTimer); subCloseTimer = undefined; }
  if (kind === 'skills') skillSearch.value = '';
  const el = evt.currentTarget as HTMLElement;
  const wrap = el.closest('.plus-menu-wrap') as HTMLElement | null;
  if (wrap) {
    const wr = wrap.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const subW = 260;
    subLeft.value = wr.right + 10 + subW > window.innerWidth ? wr.left - subW - 10 : wr.right + 10;
    subTop.value = Math.min(er.top, window.innerHeight - 400);
  }
  hoverSub.value = kind;
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

// ===== 模型上下文窗口快捷设置（hover 模型项 → 左侧浮层，对齐 WorkBuddy）=====
// 保存写回 model 表（platformStore.updateModel），与「配置模型平台」里的上下文窗口是同一个值
const platformStore = usePlatformStore();
const modelPopOpen = ref(false);
/** 窄屏工具条（toolbar-mobile-selects）里的模型按钮有独立浮层。
 *  两个 el-popover 绝不能共用同一个 visible：popover 内容 Teleport 到 body，
 *  被 display:none 藏起来的容器也照样渲染，点一次两边会同时弹出来。 */
const modelPopOpenCompact = ref(false);
/** 智能体下拉：点选后同样要主动收起（trigger=click 只在点浮层外部时才关） */
const agentPopOpen = ref(false);

/** 下拉搜索关键字：按别名 / 模型 id 过滤（有些平台动辄五六百个模型，只能靠搜） */
const modelSearch = ref('');
/** 折叠的平台分组 id：搜索状态下忽略折叠，命中项一律展开 */
const collapsedPlatforms = ref<string[]>([]);
function isPlatformExpanded(platformId: string): boolean {
  if (modelSearch.value.trim()) return true;
  return !collapsedPlatforms.value.includes(platformId);
}
function togglePlatformGroup(platformId: string) {
  if (modelSearch.value.trim()) return;
  const i = collapsedPlatforms.value.indexOf(platformId);
  if (i >= 0) collapsedPlatforms.value.splice(i, 1);
  else collapsedPlatforms.value.push(platformId);
}
/** 下拉里真正渲染的分组：先按关键字过滤，空的平台整组丢掉，命中多的排前面 */
const filteredModelGroups = computed(() => {
  const kw = modelSearch.value.trim().toLowerCase();
  const groups = modelGroups.value
    .map((g) => ({
      ...g,
      models: kw
        ? g.models.filter((m) => `${m.alias || ''} ${m.modelId}`.toLowerCase().includes(kw))
        : g.models,
    }))
    .filter((g) => g.models.length > 0);
  return kw ? groups.slice().sort((a, b) => b.models.length - a.models.length) : groups;
});

/**
 * 选中模型：切模型 + 立即收起下拉。
 * el-popover 的 trigger="click" 只在点击「浮层外部」时收起，点浮层内的模型项不会关，
 * 所以必须显式置 false（否则选中后下拉框一直挂在那挡住输入框）。
 * 两个浮层（桌面/窄屏）都要收，上下文窗口浮层是 Teleport 到 body 的独立层，一并收掉。
 */
function pickModel(modelId: string) {
  onModelChange(modelId);
  modelPopOpen.value = false;
  modelPopOpenCompact.value = false;
  closeCtxPanelNow();
}
const ctxPanelModelId = ref('');
const ctxPanelTop = ref(0);
const ctxPanelLeft = ref(0);
let ctxCloseTimer: ReturnType<typeof setTimeout> | undefined;

// 按 id 实时反查：updateModel 后 store 会重建 models 数组，持有旧对象引用会读不到新值
const ctxPanelModel = computed<Model | null>(() => {
  if (!ctxPanelModelId.value) return null;
  for (const g of modelGroups.value) {
    const m = g.models.find((x) => x.id === ctxPanelModelId.value);
    if (m) return m;
  }
  return null;
});

const CTX_PANEL_W = 244;
const CTX_PANEL_GAP = 10;

function openCtxPanel(m: Model, evt: MouseEvent) {
  cancelCloseCtxPanel();
  const el = evt.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  // 模型下拉贴右下角展开，优先往左弹；左边放不下再翻到右侧
  const left = r.left - CTX_PANEL_W - CTX_PANEL_GAP;
  ctxPanelLeft.value = left >= 8 ? left : Math.min(r.right + CTX_PANEL_GAP, window.innerWidth - CTX_PANEL_W - 8);
  ctxPanelTop.value = Math.max(8, Math.min(r.top - 6, window.innerHeight - 210));
  ctxPanelModelId.value = m.id;
}
function scheduleCloseCtxPanel() {
  if (ctxCloseTimer) clearTimeout(ctxCloseTimer);
  // 延迟关闭：留出指针从模型项移入浮层的时间
  ctxCloseTimer = setTimeout(() => { ctxPanelModelId.value = ''; }, 150);
}
function cancelCloseCtxPanel() {
  if (ctxCloseTimer) { clearTimeout(ctxCloseTimer); ctxCloseTimer = undefined; }
}
function closeCtxPanelNow() {
  cancelCloseCtxPanel();
  ctxPanelModelId.value = '';
}
async function onCtxWindowChange(tokens: number) {
  const m = ctxPanelModel.value;
  if (!m) return;
  try {
    await platformStore.updateModel(m.id, { contextWindow: tokens });
  } catch (err: any) {
    ElMessage.error(err?.message || '上下文窗口保存失败');
  }
}
// 下拉收起时一并收掉上下文窗口浮层、清掉搜索词（下次打开是干净列表）
watch(modelPopOpen, (v) => { if (!v) { closeCtxPanelNow(); modelSearch.value = ''; } });
watch(modelPopOpenCompact, (v) => { if (!v) closeCtxPanelNow(); });

// 浮层 Teleport 到 body，落在模型下拉的 popper 之外 —— el-popover 的「外部点击」判定
// 会把面板内的点击当成外部而收掉整个下拉。在 window 捕获阶段挡下（早于 document 层判定），
// 只阻止传播不影响默认行为，面板里的输入框仍可正常聚焦。
const ctxPanelEl = ref<HTMLElement | null>(null);
function onCtxPanelMousedownCapture(ev: MouseEvent) {
  const el = ctxPanelEl.value;
  if (!el) return;
  const t = ev.target as Node | null;
  if (t && (t === el || el.contains(t))) ev.stopPropagation();
}
watch(
  () => !!ctxPanelModel.value,
  (open) => {
    if (open) window.addEventListener('mousedown', onCtxPanelMousedownCapture, true);
    else window.removeEventListener('mousedown', onCtxPanelMousedownCapture, true);
  },
);
onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onCtxPanelMousedownCapture, true);
  cancelCloseCtxPanel();
});

// ===== D2 `/` 命令菜单 =====
type SlashMode = 'command' | 'agent' | 'model';

const slashMenuOpen = ref(false);
const slashMode = ref<SlashMode>('command');
const slashQuery = ref('');
const slashIndex = ref(0);

const COMMANDS: Array<{ cmd: string; hint: string; icon: Component }> = [
  { cmd: '/agent', hint: '切换当前任务智能体', icon: User },
  { cmd: '/model', hint: '切换使用的模型', icon: Cpu },
  { cmd: '/skill', hint: '挂载 / 卸载 Skill', icon: Files },
  { cmd: '/dir', hint: '设置工作目录', icon: FolderOpened },
  { cmd: '/new', hint: '新建任务', icon: Plus },
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
  if (slashMode.value === 'agent') return agentStore.chatAgents.length;
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
    const ag = agentStore.chatAgents[slashIndex.value];
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
  // 任务运行中不再拦：send() 内部会判断——本会话在跑就入队到输入框上方，
  // 切到别的会话则正常发送（此前这里直接 return，是「跑着就发不出消息」的根因）。
  send();
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

// ===== 剪贴板粘贴文件 / 图片：截图、从资源管理器复制的文件都会出现在 clipboardData.files 里。
// 有文件时拦截默认行为并走 addFiles（与拖拽/上传同一条路径）；纯文本粘贴不拦截，保持默认。
function onPaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files;
  if (files && files.length) {
    e.preventDefault();
    addFiles(files);
  }
}

// ===== 从系统文件管理器拖入 → 加入上传列表（桌面前端，原生 drop 即可拿到 File，与上传按钮同条路径） =====
// 不依赖 electronAPI（File 对象 + FileReader 都能拿到内容 + 文件名）。
// web 端同样支持（只是拿不到绝对路径），所以不强求 isElectron。
const isLikelyFileDrag = (e: DragEvent) =>
  Array.from(e.dataTransfer?.types || []).includes('Files');

const dragOver = ref(false);
let dragDepth = 0;

function onDragEnter(e: DragEvent) {
  if (!isLikelyFileDrag(e)) return;
  dragDepth += 1;
  dragOver.value = true;
}
function onDragOver(e: DragEvent) {
  if (!isLikelyFileDrag(e)) return;
  // dragover 持续触发，必须 preventDefault 才能在外部来源上 drop
  e.dataTransfer && (e.dataTransfer.dropEffect = 'copy');
}
function onDragLeave(e: DragEvent) {
  if (!isLikelyFileDrag(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragOver.value = false;
}
function onDrop(e: DragEvent) {
  const files = e.dataTransfer?.files;
  if (files && files.length) addFiles(files);
  dragDepth = 0;
  dragOver.value = false;
}
// 兜底：拖出窗口 / 异常情况下未能正确配对 dragleave，重置遮罩
function onWindowDragEnd() {
  dragDepth = 0;
  dragOver.value = false;
}
onMounted(() => {
  window.addEventListener('dragend', onWindowDragEnd);
  window.addEventListener('drop', onWindowDragEnd);
  // 全局截图热键：ipcRenderer.on 是按进程累加的监听器，组件重复挂载会导致一次热键
  // 触发 N 次；这里用 window 上的标记保证整个渲染进程只绑一次。
  if (canScreenshot) {
    const w = window as any;
    if (!w.__yzShotHotkeyBound) {
      w.__yzShotHotkeyBound = true;
      w.electronAPI.screenshot.onHotkey(() => { void startScreenshot(); });
      void syncScreenshotHotkey();
    }
  }
});

// 把本地保存的快捷键同步给主进程：主进程启动时只注册了内置默认值，用户改过的组合
// 必须在这里补注册。先读再比对，避免每次挂载都 unregister/register 造成抖动。
async function syncScreenshotHotkey() {
  try {
    const api = (window as any).electronAPI?.screenshot;
    if (!api) return;
    const wanted = String(useSettingsStore().settings.screenshotAccelerator ?? 'Control+Alt+A');
    const cur = await api.getAccelerator();
    if ((cur?.accelerator || '') === wanted) return;
    const r = await api.setAccelerator(wanted);
    if (r && r.ok === false && r.error) console.warn('[截图快捷键]', r.error);
  } catch {
    /* 热键同步失败不阻断界面 */
  }
}
onBeforeUnmount(() => {
  window.removeEventListener('dragend', onWindowDragEnd);
  window.removeEventListener('drop', onWindowDragEnd);
});
</script>

<style scoped>
/* 拖入文件悬停：input 容器边框/背景轻微变化（沿用主题朱砂色） */
.input-box.is-dragover {
  border-color: var(--color-primary, #c2410c) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary, #c2410c) 14%, transparent) !important;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.input-area {
  border-radius: 14px;
  /* 让 input-box 的边框过渡看起来更自然 */
  display: flex;
  flex-direction: column;
}

/* ===== 追加消息队列（任务运行中，堆叠在输入框上方）===== */
.queue-panel {
  margin: 8px 0 6px;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  background: var(--color-surface, rgba(127, 127, 127, 0.05));
  overflow: hidden;
  flex: 0 0 auto;
}
.queue-head {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  font-size: 11.5px;
  color: var(--color-text-secondary, #8a8f98);
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.06));
}
.queue-head-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 高度可控的关键：限高约 3 条，超出内部滚动，绝不把输入区撑高 */
.queue-list {
  max-height: 130px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
/* 细滚动条：只写 ::-webkit-*。不要同时写 scrollbar-width/color ——
   Chromium 121+ 一设标准属性就禁用 ::-webkit-scrollbar，反而变成粗条。 */
.queue-list::-webkit-scrollbar { width: 6px; }
.queue-list::-webkit-scrollbar-track { background: transparent; }
.queue-list::-webkit-scrollbar-thumb {
  background: rgba(127, 127, 127, 0.28);
  border-radius: 3px;
}
.queue-list::-webkit-scrollbar-thumb:hover { background: rgba(127, 127, 127, 0.45); }

.queue-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 6px 7px;
  border-radius: 8px;
  background: var(--color-bg-subtle, rgba(127, 127, 127, 0.05));
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.06));
}
.queue-idx {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--color-primary, #c2410c);
  color: #fff;
  font-size: 10px;
  line-height: 15px;
  text-align: center;
}
.queue-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--color-text, #1f2328);
  white-space: pre-wrap;
  word-break: break-word;
  /* 单条最多 2 行，超长省略——完整内容点「编辑」回到输入框查看 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.queue-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 2px;
}
.queue-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #8a8f98);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.queue-btn:hover {
  background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent);
  color: var(--color-primary, #c2410c);
}
.queue-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.scene-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  margin-left: 6px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--scene-color);
  background: color-mix(in srgb, var(--scene-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--scene-color) 28%, transparent);
  white-space: nowrap;
  /* 窄屏兜底：允许被压缩，文字走省略号，避免整行溢出到右侧面板上 */
  min-width: 0;
  flex-shrink: 1;
  overflow: hidden;
}
.scene-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scene-chip-close {
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}
.scene-chip-close:hover { opacity: 1; }
/* 极窄：先收起场景文字只留图标+关闭，把宽度让给智能体名 */
@container inputbar (max-width: 480px) {
  .scene-chip { padding: 0 6px; }
  .scene-chip-label { display: none; }
}
</style>

<!-- 附件 hover 预览浮层外壳：el-popper 会 teleport 到 body，样式必须写在非 scoped 块里 -->
<style>
/* ⚠️ 用固定色而非 --glass-* 变量：皮肤模式下玻璃 token 是半透明的，
   预览卡下面会透出弹窗底图，白底内容会变脏。这里只要一层干净投影。 */
.atp-popper.el-popper {
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24) !important;
}
.atp-popper.el-popper.is-light {
  background-image: none !important;
}
</style>
