<template>
  <div class="chat-page" :class="{ 'conv-collapsed': convCollapsed, 'drawer-open': drawerOpen }">
    <div v-if="drawerOpen" class="drawer-overlay" @click="drawerOpen = false"></div>

    <aside class="sidebar">
      <div class="sidebar-tabs">
        <div class="sb-tab" :class="{ active: sideTab === 'agent' }" @click="sideTab = 'agent'">
          <el-icon><User /></el-icon> 智能体
        </div>
        <div class="sb-tab" :class="{ active: sideTab === 'chat' }" @click="sideTab = 'chat'">
          <el-icon><ChatDotRound /></el-icon> 会话
        </div>
      </div>

      <div v-if="sideTab === 'agent'" class="agent-list">
        <div class="agent-item add-agent" @click="openCreateAgent">
          <el-icon><Plus /></el-icon> 新建智能体
        </div>
        <div
          v-for="ag in agentStore.agents"
          :key="ag.id"
          class="agent-item"
          :class="{ active: ag.id === agentStore.selectedId }"
          @click="agentStore.selectAgent(ag.id)"
        >
          <div class="agent-avatar">{{ ag.name.slice(0, 1) }}</div>
          <div class="agent-info">
            <div class="agent-name">
              <el-icon v-if="ag.isDefault" class="lock-icon"><Lock /></el-icon>
              {{ ag.name }}
            </div>
            <div class="agent-summary">{{ ag.description || '无描述' }}</div>
          </div>
          <el-button class="agent-edit-btn" text size="small" circle @click.stop="openEditAgent(ag)">
            <el-icon><EditPen /></el-icon>
          </el-button>
        </div>
      </div>

      <div v-else class="conv-list">
        <div class="conv-header">
          <el-input v-model="search" placeholder="搜索会话" size="small" clearable :prefix-icon="Search" />
          <div class="conv-header-row">
            <el-button type="primary" size="small" plain @click="startNewChat" style="flex:1">
              <el-icon><Plus /></el-icon> 新建
            </el-button>
            <el-button size="small" @click="batchMode = !batchMode" :type="batchMode ? 'warning' : ''">
              {{ batchMode ? '取消' : '批量' }}
            </el-button>
          </div>
        </div>
        <div class="conv-items">
          <div
            v-for="conv in filteredConversations"
            :key="conv.id"
            class="conv-item"
            :class="{ active: conv.id === store.currentConvId, pinned: conv.pinned, selecting: batchMode }"
            @click="batchMode ? toggleConvSelect(conv.id) : (drawerOpen = false, selectConv(conv.id))"
            @contextmenu.prevent="!batchMode && openConvMenu($event, conv)"
            @dblclick="!batchMode && startRename(conv)"
          >
            <el-checkbox v-if="batchMode" :model-value="selectedConvIds.has(conv.id)" @click.stop @change="toggleConvSelect(conv.id)" />
            <el-icon class="pin-icon" v-if="conv.pinned"><Star /></el-icon>
            <el-icon v-else-if="!batchMode"><ChatDotRound /></el-icon>
            <span v-if="renamingId !== conv.id" class="conv-title">{{ conv.title }}</span>
            <el-input
              v-else
              v-model="renamingTitle"
              size="small"
              @click.stop
              @blur="commitRename"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="renamingId = ''"
              ref="renameInputRef"
            />
          </div>
          <el-empty v-if="filteredConversations.length === 0" :description="search ? '无匹配会话' : '新建会话开始对话'" :image-size="50" />
        </div>
        <div v-if="batchMode && selectedConvIds.size > 0" class="batch-bar">
          <span>已选 {{ selectedConvIds.size }} 个</span>
          <el-button size="small" :disabled="filteredConversations.length === 0" @click="batchSelectAll">全选</el-button>
          <el-button size="small" type="danger" @click="batchDeleteConvs">删除选中</el-button>
        </div>
      </div>
    </aside>

    <div class="conv-toggle" @click="convCollapsed = !convCollapsed">
      <el-icon><Fold v-if="!convCollapsed" /><Expand v-else /></el-icon>
    </div>

    <section class="chat-main">
      <div class="chat-topbar">
        <el-button class="hamburger-btn" text circle @click="drawerOpen = !drawerOpen">
          <el-icon :size="20"><Expand /></el-icon>
        </el-button>
        <span class="conv-title-display">{{ currentConv?.title || '新对话' }}</span>
        <div class="chat-topbar-actions">
          <el-tooltip content="文件管理" placement="bottom">
            <el-button size="small" circle @click="filePanelOpen = !filePanelOpen" :type="filePanelOpen ? 'primary' : ''">
              <el-icon><FolderOpened /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <div class="messages" ref="messagesRef">
        <div v-for="(round, ri) in messageRounds" :key="ri" :class="['round-group']" :data-round="ri">
          <!-- 用户消息 -->
          <!-- 用户消息 -->
          <div v-if="round.user" class="msg msg-user">
            <div class="msg-avatar avatar-user"><el-icon><User /></el-icon></div>
            <div class="msg-body">
              <div class="msg-meta">
                <span class="msg-role-name">你</span>
                <span v-if="round.user.createdAt" class="msg-time">{{ formatTime(round.user.createdAt) }}</span>
              </div>
              <div
                v-if="round.user.content"
                class="msg-block"
                :class="{ 'msg-collapsed': collapsedMessages[round.user.id] }"
                @click="collapsedMessages[round.user.id] ? toggleMsgCollapse(round.user.id) : null"
              >
                <div v-show="!collapsedMessages[round.user.id]">
                  <div v-if="round.user.content" class="msg-content" v-html="renderMarkdown(round.user.content)" @click="handleContentClick"></div>
                </div>
                <div v-show="collapsedMessages[round.user.id]" class="msg-collapsed-placeholder">
                  <span class="collapsed-line">{{ (round.user.content || '').replace(/\n/g, ' ').slice(0, 120) }}</span>
                  <span class="collapsed-hint">点击展开</span>
                </div>
              </div>
              <div class="msg-actions">
                <el-tooltip content="复制" placement="top"><el-button text size="small" circle @click="copyMsg(round.user)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
                <el-tooltip content="编辑" placement="top"><el-button text size="small" circle @click="editMsg(round.user)"><el-icon><EditPen /></el-icon></el-button></el-tooltip>
                <el-tooltip content="删除" placement="top"><el-button text size="small" circle @click="delMsg(round.user)"><el-icon><Delete /></el-icon></el-button></el-tooltip>
                <el-tooltip v-if="debugMode" content="请求快照" placement="top"><el-button text size="small" circle @click="openSnapshotDialog(round.user)"><el-icon><View /></el-icon></el-button></el-tooltip>
                <el-tooltip content="折叠" placement="top"><el-button text size="small" circle @click.stop="toggleMsgCollapse(round.user.id)"><el-icon><Fold /></el-icon></el-button></el-tooltip>
              </div>
            </div>
          </div>

          <!-- 智能体统一回复卡片 -->
          <div v-if="round.finalAssistant || round.steps.length > 0" class="msg msg-assistant">
            <div class="msg-avatar avatar-assistant" :class="{ streaming: isLastRoundStreaming(round, ri) }"><el-icon><ChatDotRound /></el-icon></div>
            <div class="msg-body">
              <div class="agent-response-card" :class="{ 'msg-collapsed': collapsedMessages[round.finalAssistant?.id || ''] }" @click="collapsedMessages[round.finalAssistant?.id || ''] ? toggleMsgCollapse(round.finalAssistant?.id || '') : null">
                <div v-show="collapsedMessages[round.finalAssistant?.id || '']" class="msg-collapsed-placeholder">
                  <span class="collapsed-line">{{ (round.finalAssistant?.content || '').replace(/\n/g, ' ').slice(0, 120) }}</span>
                  <span class="collapsed-hint">点击展开</span>
                </div>
                <div v-show="!collapsedMessages[round.finalAssistant?.id || '']">
                <!-- 最终回答（始终可见） -->
                <div class="agent-response-body">
                  <div v-if="round.finalAssistant?.reasoningContent && !round.hasAgentProcess" class="msg-reasoning">
                    <div class="reasoning-header" @click="toggleReasoning('agent-fa-' + ri)">
                      <el-icon><CaretRight v-if="!expandedReasoning['agent-fa-' + ri]" /><CaretBottom v-else /></el-icon>
                      <span>思考过程</span>
                    </div>
                    <div v-show="expandedReasoning['agent-fa-' + ri]" class="reasoning-body">{{ round.finalAssistant.reasoningContent }}</div>
                  </div>
                  <div v-if="round.finalAssistant?.content" class="msg-content" v-html="renderMarkdown(round.finalAssistant.content)" @click="handleContentClick"></div>
                <div v-else-if="isLastRoundStreaming(round, ri)" class="msg-content streaming"><span class="cursor">▋</span></div>
              </div>

              <!-- 智能体内部处理过程（可折叠） -->
                <div v-if="round.hasAgentProcess" class="agent-process-header" @click="toggleAgentProcess('round-' + ri)">
                  <el-icon :size="14" class="agent-process-icon">
                    <CaretRight v-if="!expandedAgentProcess['round-' + ri]" />
                    <CaretBottom v-else />
                  </el-icon>
                  <span>智能体思考过程</span>
                  <span class="agent-process-stats">({{ round.agentStats?.reasoningCount || 0 }} 次推理，{{ round.agentStats?.toolCallCount || 0 }} 个工具调用)</span>
                  <el-icon :size="12" class="agent-process-chevron">
                    <ArrowDown v-if="!expandedAgentProcess['round-' + ri]" />
                    <ArrowRight v-else />
                  </el-icon>
                </div>
                <div v-if="round.hasAgentProcess" v-show="expandedAgentProcess['round-' + ri]" class="agent-process-steps">
                  <div v-for="(step, si) in round.steps" :key="'agent-step-' + ri + '-' + si" class="agent-step">
                    <div v-if="step.reasoningContent" class="msg-reasoning">
                      <div class="reasoning-header" @click="toggleReasoning('agent-step-' + ri + '-' + si)">
                        <el-icon><CaretRight v-if="!expandedReasoning['agent-step-' + ri + '-' + si]" /><CaretBottom v-else /></el-icon>
                        <span>推理 {{ si + 1 }}</span>
                      </div>
                      <div v-show="expandedReasoning['agent-step-' + ri + '-' + si]" class="reasoning-body">{{ step.reasoningContent }}</div>
                    </div>
                    <div v-if="step.partialContent" class="agent-step-partial" v-html="renderMarkdown(step.partialContent)"></div>
                    <div v-if="step.toolCalls.length" class="msg-reasoning" style="background:rgba(15,23,42,0.03);border-color:rgba(15,23,42,0.08)">
                      <div class="reasoning-header" @click="toggleStepTools('agent-step-' + ri + '-' + si)" style="color:var(--color-text-secondary)">
                        <el-icon :size="14" class="tool-group-dot" :class="getStepToolGroupClass(step)">
                          <Loading v-if="isStepToolsRunning(step)" class="is-loading" />
                          <CircleCheck v-else-if="!isStepToolsError(step)" />
                          <CircleClose v-else />
                        </el-icon>
                        <span>调用 {{ step.toolCalls.length }} 个工具</span>
                        <el-icon :size="12" style="margin-left:auto;color:var(--color-text-secondary)">
                          <ArrowDown v-if="expandedStepTools['agent-step-' + ri + '-' + si] !== false" />
                          <ArrowRight v-else />
                        </el-icon>
                      </div>
                      <div v-show="expandedStepTools['agent-step-' + ri + '-' + si] !== false" class="tool-group-body" style="margin-top:6px;border-top:1px solid rgba(15,23,42,0.06);padding-top:6px">
                        <div v-for="(tc, idx) in step.toolCalls" :key="idx" class="tool-item">
                          <div class="tool-item-header" @click="toggleTool('agent-step-' + ri + '-' + si + '-' + idx)">
                            <div class="tool-item-left">
                              <el-icon :size="12" class="tool-item-status" :class="getStepToolStatusClass(step, tc.id)">
                                <CircleCheck v-if="getStepToolResult(step, tc.id) && !isStepToolError(step, tc.id)" />
                                <CircleClose v-else-if="isStepToolError(step, tc.id)" />
                                <Loading v-else class="is-loading" />
                              </el-icon>
                              <span class="tool-item-server">{{ resolveToolDisplay(tc).server }}</span>
                              <code class="tool-item-fn">{{ resolveToolDisplay(tc).tool }}</code>
                            </div>
                            <el-icon :size="12" class="tool-item-chevron">
                              <ArrowDown v-if="expandedTools['agent-step-' + ri + '-' + si + '-' + idx]" />
                              <ArrowRight v-else />
                            </el-icon>
                          </div>
                          <div v-show="expandedTools['agent-step-' + ri + '-' + si + '-' + idx]" class="tool-item-body">
                            <div class="tool-item-section">
                              <div class="tool-item-label">参数</div>
                              <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                            </div>
                            <div v-if="getStepToolResult(step, tc.id)" class="tool-item-section">
                              <div class="tool-item-label">结果</div>
                              <pre class="tool-item-json" :class="{ 'tool-item-json-error': isStepToolError(step, tc.id) }">{{ getStepToolResult(step, tc.id) }}</pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- 兼容无 step 结构的老数据 -->
                  <div v-if="!round.steps.length && round.allToolCalls.length" class="agent-old-tools">
                    <div class="msg-reasoning">
                      <div class="reasoning-header" @click="toggleToolGroup('round-' + ri)">
                        <el-icon :size="14" class="tool-group-dot" :class="getToolGroupStatusClass(null, round.allToolCalls)">
                          <Loading v-if="isToolGroupRunning(round.allToolCalls)" class="is-loading" />
                          <CircleCheck v-else-if="!isToolGroupError(round.allToolCalls)" />
                          <CircleClose v-else />
                        </el-icon>
                        <span>工具调用 ({{ round.allToolCalls.length }})</span>
                        <el-icon :size="12" style="margin-left:auto;color:var(--color-text-secondary)">
                          <ArrowDown v-if="!expandedToolGroups['round-' + ri]" />
                          <ArrowRight v-else />
                        </el-icon>
                      </div>
                      <div v-show="!expandedToolGroups['round-' + ri]" class="tool-group-body" style="margin-top:6px;border-top:1px dashed rgba(139,92,246,0.12);padding-top:6px">
                        <div v-for="(tc, idx) in round.allToolCalls" :key="idx" class="tool-item">
                          <div class="tool-item-header" @click="toggleTool('round-' + ri + '-' + idx)">
                            <div class="tool-item-left">
                              <el-icon :size="12" class="tool-item-status" :class="getToolStatusClass(tc.id)">
                                <CircleCheck v-if="getToolResult(tc.id) && !isToolError(tc.id)" />
                                <CircleClose v-else-if="isToolError(tc.id)" />
                                <Loading v-else class="is-loading" />
                              </el-icon>
                              <span class="tool-item-server">{{ resolveToolDisplay(tc).server }}</span>
                              <code class="tool-item-fn">{{ resolveToolDisplay(tc).tool }}</code>
                            </div>
                            <el-icon :size="12" class="tool-item-chevron">
                              <ArrowDown v-if="expandedTools['round-' + ri + '-' + idx]" />
                              <ArrowRight v-else />
                            </el-icon>
                          </div>
                          <div v-show="expandedTools['round-' + ri + '-' + idx]" class="tool-item-body">
                            <div class="tool-item-section">
                              <div class="tool-item-label">参数</div>
                              <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                            </div>
                            <div v-if="getToolResult(tc.id)" class="tool-item-section">
                              <div class="tool-item-label">结果</div>
                              <pre class="tool-item-json" :class="{ 'tool-item-json-error': isToolError(tc.id) }">{{ getToolResult(tc.id) }}</pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>

              </div>

              <div class="msg-actions msg-actions-assistant">
                <el-tooltip content="复制" placement="top"><el-button text size="small" circle @click="copyMsg(round.finalAssistant!)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
                <el-tooltip content="重新生成" placement="top"><el-button text size="small" circle :disabled="store.streaming" @click="regenerateMsg"><el-icon><Refresh /></el-icon></el-button></el-tooltip>
                <el-tooltip content="删除" placement="top"><el-button text size="small" circle @click="delMsg(round.finalAssistant!)"><el-icon><Delete /></el-icon></el-button></el-tooltip>
                <el-tooltip content="折叠" placement="top"><el-button text size="small" circle @click.stop="toggleMsgCollapse(round.finalAssistant!.id)"><el-icon><Fold /></el-icon></el-button></el-tooltip>
              </div>
            </div>
          </div>
        </div>

        <el-empty v-if="store.currentMessages.length === 0 && !store.streaming && selectedModelId" description="输入消息开始对话" />

        <div v-if="store.currentMessages.length === 0 && !store.streaming && !selectedModelId" class="welcome-card">
          <div class="welcome-icon"><el-icon :size="56"><ChatDotRound /></el-icon></div>
          <h2>欢迎使用 AI 助手</h2>
          <p v-if="platformStore.platforms.length === 0">请先配置模型平台，点击下方按钮开始</p>
          <p v-else>请在下方面板选择模型，然后开始对话</p>
          <div class="welcome-actions" v-if="platformStore.platforms.length > 0">
            <el-button @click="input = '帮我写一段 Python 代码'; $nextTick(() => { const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement; if (ta) ta.focus(); })">帮我写一段 Python 代码</el-button>
            <el-button @click="input = '解释什么是机器学习'; $nextTick(() => { const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement; if (ta) ta.focus(); })">解释什么是机器学习</el-button>
            <el-button @click="input = '帮我分析这个项目的结构'; $nextTick(() => { const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement; if (ta) ta.focus(); })">帮我分析这个项目的结构</el-button>
          </div>
          <el-button type="primary" size="large" round @click="$router.push('/models')" style="margin-top:8px">
            <el-icon><Setting /></el-icon> 配置模型
          </el-button>
        </div>
      </div>

      <div v-if="showScrollBottom || showScrollTop" class="scroll-nav">
        <button v-if="showScrollTop" class="scroll-nav-btn" @click="scrollToTop" title="回到顶部">
          <el-icon :size="18"><ArrowUp /></el-icon>
        </button>
        <button v-if="showScrollBottom" class="scroll-nav-btn" @click="scrollToBottom" title="回到底部">
          <el-icon :size="18"><ArrowDown /></el-icon>
        </button>
      </div>

      <!-- 右侧消息导航指示器 -->
      <div v-if="userRoundIndices.length > 1" class="round-nav">
        <div
          v-for="(ri, idx) in userRoundIndices"
          :key="ri"
          class="round-nav-dash"
          :class="{ active: ri === activeNavRound }"
          :title="'跳到提问 #' + (idx + 1)"
          @click="scrollToRound(ri)"
        >
          <span class="dash-line" />
        </div>
      </div>

      <div class="input-area">
        <div class="input-box" :class="{ focused: inputFocused }">
          <el-input
            v-model="input"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            @keydown.enter.exact.prevent="store.streaming ? null : send()"
            :disabled="store.streaming"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
            class="input-textarea"
          />
          <div class="input-toolbar">
            <div class="toolbar-agent">
              <div class="minimal-select agent-switch" @click.stop>
                <el-select v-model="agentStore.selectedId" placeholder="选择智能体" size="small" popper-class="minimal-popper" @change="onAgentSwitch">
                  <el-option
                    v-for="ag in agentStore.agents"
                    :key="ag.id"
                    :label="ag.name"
                    :value="ag.id"
                  >
                    <span style="display:flex;align-items:center;gap:6px">
                      <el-icon v-if="ag.isDefault" style="font-size:12px"><Lock /></el-icon>
                      <span>{{ ag.name }}</span>
                    </span>
                  </el-option>
                </el-select>
                <el-icon class="select-icon"><User /></el-icon>
              </div>
              <el-tooltip content="编辑当前智能体" placement="top">
                <el-button size="small" circle @click="openEditAgent(agentStore.selectedAgent)">
                  <el-icon><EditPen /></el-icon>
                </el-button>
              </el-tooltip>
            </div>

            <div class="minimal-select model-select" @click.stop>
              <el-icon class="select-icon"><Cpu /></el-icon>
              <el-select
                v-model="selectedModelId"
                placeholder="选择模型"
                filterable
                size="small"
                popper-class="minimal-popper"
                @change="onModelChange"
              >
                <el-option-group
                  v-for="g in modelGroups"
                  :key="g.platformId"
                  :label="g.platformName"
                >
                  <el-option
                    v-for="m in g.models"
                    :key="m.id"
                    :label="m.alias || m.modelId"
                    :value="m.id"
                  >
                    <span>{{ m.alias || m.modelId }}</span>
                    <span style="font-size:11px;color:#94a3b8;margin-left:6px">{{ m.modelId }}</span>
                  </el-option>
                </el-option-group>
              </el-select>
            </div>

            <!-- mobile-only: icon buttons to popover agent / model list -->
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

            <div class="toolbar-icons">
              <el-tooltip content="MCP 工具" placement="top">
                <el-button size="small" circle @click="showMount = true">
                  <el-icon><Connection /></el-icon>
                </el-button>
              </el-tooltip>
              <el-badge :value="mountedSkillIds.length" :hidden="mountedSkillIds.length === 0" type="primary">
                <el-tooltip content="Skill" placement="top">
                  <el-button size="small" circle @click="showSkills = true">
                    <el-icon><Files /></el-icon>
                  </el-button>
                </el-tooltip>
              </el-badge>
              <el-tooltip :content="`工作目录: ${workspaceDir}`" placement="top">
                <el-button size="small" @click="showWorkspaceDir = true">
                  <el-icon style="margin-right:4px"><FolderOpened /></el-icon>
                  <span class="workspace-dir-label">{{ workspaceDir.split('/').pop() || workspaceDir }}</span>
                </el-button>
              </el-tooltip>
              <el-tooltip content="上传文件" placement="top">
                <el-button size="small" circle @click="triggerFileUpload">
                  <el-icon><UploadFilled /></el-icon>
                </el-button>
              </el-tooltip>
            </div>

            <div class="toolbar-more">
              <el-popover placement="top" trigger="click" :width="160" :show-arrow="false">
                <template #reference>
                  <el-button size="small" circle>
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                </template>
                <div class="more-menu">
                  <div class="more-item" @click="showMount = true">
                    <el-icon><Connection /></el-icon><span>MCP 工具</span>
                  </div>
                  <div class="more-item" @click="showSkills = true">
                    <el-icon><Files /></el-icon><span>Skill {{ mountedSkillIds.length ? '(' + mountedSkillIds.length + ')' : '' }}</span>
                  </div>
                  <div class="more-item" @click="showWorkspaceDir = true">
                    <el-icon><FolderOpened /></el-icon><span>工作目录</span>
                  </div>
                  <div class="more-item" @click="triggerFileUpload">
                    <el-icon><UploadFilled /></el-icon><span>上传文件</span>
                  </div>
                </div>
              </el-popover>
            </div>

            <div class="toolbar-right">
              <el-tooltip content="新建会话" placement="top">
                <el-button size="small" circle :disabled="store.streaming" @click="startNewChat">
                  <el-icon><Plus /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="store.streaming ? '终止 (停止生成)' : '发送 (Enter)'" placement="top">
                <span>
                  <el-button v-if="!store.streaming" type="primary" :icon="Promotion" :disabled="(!input.trim() && uploadedFiles.length === 0) || !selectedModelId" @click="send" circle class="send-btn" />
                  <el-button v-else type="danger" :icon="Close" @click="stopChat" circle class="send-btn" />
                </span>
              </el-tooltip>
            </div>
          </div>
        </div>

        <div v-if="uploadedFiles.length > 0" class="file-chips">
          <div v-for="(f, idx) in uploadedFiles" :key="idx" class="file-chip">
            <span class="file-chip-icon">📄</span>
            <span class="file-chip-name">{{ f.name }}</span>
            <span class="file-chip-size">{{ formatSize(f.size) }}</span>
            <el-button size="small" link class="file-chip-remove" @click="removeFile(idx)">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>

        <input ref="fileInputRef" type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.py,.js,.ts,.vue,.html,.css,.xml,.yaml,.yml,.log,.doc,.docx,.xlsx,.pptx,.zip" style="display:none" @change="handleFileChange" />
      </div>

      <aside class="file-panel" :class="{ open: filePanelOpen }">
        <div class="file-panel-header">
          <span class="file-panel-title">文件管理</span>
          <div class="file-panel-header-actions">
            <el-button size="small" circle @click="triggerFilePanelUpload">
              <el-icon><UploadFilled /></el-icon>
            </el-button>
            <el-button size="small" circle @click="filePanelOpen = false">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>
        <el-input v-model="fileSearch" placeholder="搜索文件..." size="small" clearable :prefix-icon="Search" class="file-panel-search" />
        <div class="file-panel-list">
          <div v-for="f in filteredFiles" :key="f.path" class="file-panel-item"
            :class="{ selected: selectedFilePaths.has(f.path) }"
            @click="previewFile(f)" @contextmenu.prevent="toggleFileSelect(f.path)">
            <el-icon :size="16" class="file-item-icon"><Files /></el-icon>
            <div class="file-item-info">
              <span class="file-item-name">{{ f.name }}</span>
              <span class="file-item-meta">{{ formatSize(f.size) }}</span>
            </div>
            <el-button size="small" text circle class="file-item-delete" @click.stop="deleteFileItem(f)">
              <el-icon :size="14"><Delete /></el-icon>
            </el-button>
          </div>
          <el-empty v-if="workspaceFiles.length === 0" description="暂无文件" :image-size="40" />
          <el-empty v-else-if="filteredFiles.length === 0 && fileSearch" description="无匹配文件" :image-size="40" />
        </div>
        <input ref="filePanelUploadRef" type="file" multiple style="display:none" @change="handleFilePanelUpload" />
      </aside>
    </section>

    <el-dialog v-model="showMount" title="挂载 MCP 工具" width="600px" class="mount-dialog">
      <div class="mount-body">
        <div v-if="mountableServers.length === 0" class="mount-empty">
          <el-empty description="暂无 MCP 服务，请先添加并连接服务" :image-size="80">
            <el-button type="primary" size="small" @click="showMount = false; $router.push('/mcp')">前往配置</el-button>
          </el-empty>
        </div>
        <template v-else>
          <el-input v-model="mountSearch" placeholder="搜索工具名称..." size="small" clearable :prefix-icon="Search" class="mount-search" />
          <div v-for="s in mountableServers" :key="s.id" class="mount-server-group">
            <div class="mount-server-header" @click="toggleServerCollapse(s.id)">
              <div class="mount-server-info">
                <el-icon :size="14" class="mount-collapse-icon" :class="{ collapsed: collapsedServers[s.id] }">
                  <ArrowDown v-if="!collapsedServers[s.id]" /><ArrowRight v-else />
                </el-icon>
                <el-icon :size="14"><Connection /></el-icon>
                <span class="mount-server-name">{{ s.name }}</span>
                <el-tag v-if="s.status !== 'connected'" size="small" type="warning" effect="plain">离线</el-tag>
                <span class="mount-server-count">{{ (mcpStore.tools[s.id] || []).length }} 工具</span>
              </div>
              <el-button size="small" link type="primary" @click.stop="toggleAllTools(s.id)">
                {{ isAllToolsMounted(s.id) ? '取消全选' : '全选' }}
              </el-button>
            </div>
            <div v-show="!collapsedServers[s.id]" class="mount-tool-list">
              <div v-for="t in filteredTools(s.id)" :key="t.name" class="mount-tool-item">
                <div class="mount-tool-check" :class="{ checked: isToolMounted(s.id, t.name) }" @click="toggleMountTool(s.id, t.name)">
                  <el-icon v-if="isToolMounted(s.id, t.name)"><Check /></el-icon>
                </div>
                <div class="mount-tool-info" @click="toggleMountTool(s.id, t.name)">
                  <span class="mount-tool-name">
                    {{ t.name }}
                    <span v-if="t.alias" class="mount-tool-global-alias">[{{ t.alias }}]</span>
                  </span>
                  <span class="mount-tool-desc" :title="t.description">{{ t.description || '无描述' }}</span>
                  <span v-if="t.remark" class="mount-tool-remark" :title="t.remark">{{ t.remark }}</span>
                </div>
                <input
                  class="mount-tool-alias"
                  :value="toolAliasMap[s.id]?.[t.name] || ''"
                  placeholder="覆盖别名"
                  @click.stop
                  @input="(e: any) => setToolAlias(s.id, t.name, e.target.value)"
                />
              </div>
              <div v-if="filteredTools(s.id).length === 0" class="mount-no-match">无匹配工具</div>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="showMount = false">取消</el-button>
        <el-button type="primary" @click="saveMount">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showSkills" title="挂载 Skill" width="540px" class="skill-mount-dialog" :close-on-click-modal="false">
      <el-input v-model="skillSearch" placeholder="搜索 Skill 名称或描述..." size="small" clearable :prefix-icon="Search" class="skill-mount-search" />
      <div class="skill-mount-body">
        <el-checkbox-group v-model="mountedSkillIds">
          <div
            v-for="s in filteredSkillStore"
            :key="s.id"
            :class="['skill-card-item', { active: mountedSkillIds.includes(s.id), disabled: !s.enabled }]"
            @click="s.enabled && toggleSkillMount(s.id)"
          >
            <div class="skill-card-left">
              <div class="skill-card-check" :class="{ checked: mountedSkillIds.includes(s.id) }">
                <el-icon v-if="mountedSkillIds.includes(s.id)" :size="12"><Check /></el-icon>
              </div>
              <div class="skill-card-icon"><el-icon :size="18"><Files /></el-icon></div>
            </div>
            <div class="skill-card-info">
              <span class="skill-card-name">{{ s.name }}</span>
              <el-tooltip :content="s.description || '无描述'" placement="top" :show-after="400" :hide-after="0" effect="dark">
                <span class="skill-card-desc">{{ s.description || '无描述' }}</span>
              </el-tooltip>
            </div>
            <el-tag v-if="!s.enabled" size="small" type="info" effect="plain">已禁用</el-tag>
          </div>
        </el-checkbox-group>
        <el-empty v-if="filteredSkillStore.length === 0 && skillStore.skills.length > 0" description="无匹配 Skill" :image-size="50" />
        <el-empty v-if="skillStore.skills.length === 0" description="还没有安装 Skill，去 Skill 商店安装吧" :image-size="60">
          <el-button type="primary" size="small" @click="showSkills = false; $router.push('/skills')">前往 Skill 商店</el-button>
        </el-empty>
      </div>
      <template #footer>
        <el-button @click="showSkills = false">关闭</el-button>
        <el-button type="primary" @click="saveSkills">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="snapshotDialog" title="请求快照" width="780px" class="snapshot-dialog">
      <el-tabs v-model="snapshotActiveTab" type="card">
        <el-tab-pane v-for="s in currentSnapshots" :key="s.id" :label="s.label" :name="s.id">
          <pre class="snapshot-body">{{ s.content }}</pre>
        </el-tab-pane>
      </el-tabs>
      <el-empty v-if="currentSnapshots.length === 0" description="没有找到请求快照" :image-size="80" />
    </el-dialog>

    <AgentEditDialog v-model="showAgentEdit" :agent="editingAgent" @saved="onAgentSaved" @deleted="onAgentDeleted" />

    <WorkspaceDirDialog v-model="showWorkspaceDir" :current-path="workspaceDir" @selected="onWorkspaceDirSelected" />

    <ul v-if="ctxMenu.visible" class="ctx-menu" :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }">
      <li @click="togglePin(ctxMenu.conv)">
        <el-icon><Star /></el-icon>{{ ctxMenu.conv?.pinned ? '取消置顶' : '置顶' }}
      </li>
      <li @click="startRename(ctxMenu.conv)">
        <el-icon><EditPen /></el-icon>重命名
      </li>
      <li class="danger" @click="deleteConv(ctxMenu.conv)">
        <el-icon><Delete /></el-icon>删除
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, reactive, onUnmounted } from 'vue';
import { Plus, ChatDotRound, Star, Connection, CaretRight, CaretBottom, Search, Files, EditPen, Delete, User, Setting, CopyDocument, Refresh, Promotion, Fold, Expand, Lock, Check, Cpu, UploadFilled, Close, View, ArrowRight, ArrowDown, ArrowUp, CircleCheck, CircleClose, Loading, FolderOpened, MoreFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { useChatStore, usePlatformStore, useMcpStore, useSkillStore, useAgentStore } from '../stores';
import type { Agent } from '@yan-zhi/shared';
import { estimateTokens, CHAT_MODEL_TYPES } from '@yan-zhi/shared';
import type { Message, Conversation } from '@yan-zhi/shared';
import AgentEditDialog from '../components/AgentEditDialog.vue';
import WorkspaceDirDialog from '../components/WorkspaceDirDialog.vue';

const store = useChatStore();
const platformStore = usePlatformStore();
const mcpStore = useMcpStore();
const skillStore = useSkillStore();
const agentStore = useAgentStore();

const input = ref('');
const inputFocused = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const uploadedFiles = ref<Array<{ name: string; size: number; type: string; dataUrl: string }>>([]);

const showScrollBottom = ref(false);
const showScrollTop = ref(false);

const filePanelOpen = ref(false);
const fileSearch = ref('');
const workspaceFiles = ref<Array<{ name: string; path: string; size: number; isDir: boolean }>>([]);
const selectedFilePaths = ref<Set<string>>(new Set());
const filePanelUploadRef = ref<HTMLInputElement>();
const search = ref('');
const messagesRef = ref<HTMLElement>();
const showMount = ref(false);
const showSkills = ref(false);
const skillSearch = ref('');

const filteredSkillStore = computed(() => {
  if (!skillSearch.value.trim()) return skillStore.skills;
  const q = skillSearch.value.toLowerCase();
  return skillStore.skills.filter(
    (s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q),
  );
});

function toggleSkillMount(id: string) {
  const idx = mountedSkillIds.value.indexOf(id);
  if (idx >= 0) {
    mountedSkillIds.value.splice(idx, 1);
  } else {
    mountedSkillIds.value.push(id);
  }
}
const selectedModelId = ref('');
const expandedReasoning = reactive<Record<string, boolean>>({});
const expandedTools = reactive<Record<string, boolean>>({});
const expandedToolGroups = reactive<Record<string, boolean>>({});
const collapsedToolGroups = reactive<Record<string, boolean>>({});
const collapsedMessages = reactive<Record<string, boolean>>({});
const expandedAgentProcess = reactive<Record<string, boolean>>({});
const expandedStepTools = reactive<Record<string, boolean>>({});

const activeNavRound = ref<number | null>(null);

// 哪些 messageRounds 包含用户消息（用于右侧导航指示器）
const userRoundIndices = computed<number[]>(() =>
  messageRounds.value
    .map((r, i) => (r.user ? i : -1))
    .filter(i => i >= 0),
);

interface MessageRound {
  user: Message | null;
  steps: Array<{
    reasoningContent?: string;
    toolCalls: any[];
    toolResults: Array<{ callId: string; content: string; isError: boolean }>;
    partialContent?: string;
  }>;
  allToolCalls: any[];
  finalAssistant: Message | null;
  hasAgentProcess?: boolean;
  agentStats?: { stepCount: number; reasoningCount: number; toolCallCount: number };
}
const mountedSkillIds = ref<string[]>([]);
const drawerOpen = ref(false);
const convCollapsed = ref(false);
const sideTab = ref<'agent' | 'chat'>('chat');
const batchMode = ref(false);
const selectedConvIds = ref<Set<string>>(new Set());

const mountToolSelection = reactive<Record<string, string[]>>({});
const toolAliasMap = reactive<Record<string, Record<string, string>>>({});
const mountSearch = ref('');
const collapsedServers = reactive<Record<string, boolean>>({});

function toggleServerCollapse(sid: string) {
  collapsedServers[sid] = !collapsedServers[sid];
}

function filteredTools(sid: string) {
  const tools = mcpStore.tools[sid] || [];
  if (!mountSearch.value.trim()) return tools;
  const q = mountSearch.value.toLowerCase();
  return tools.filter(t => t.name.toLowerCase().includes(q));
}

function initMountSelection() {
  for (const sid in mountToolSelection) delete mountToolSelection[sid];
  for (const sid in toolAliasMap) delete toolAliasMap[sid];
  const disabled = store.mcpDisabledTools;
  const aliases = store.mcpToolAliases;
  for (const sid of store.mountedMcpServers) {
    const tools = mcpStore.tools[sid] || [];
    const disabledNames = disabled[sid] || [];
    mountToolSelection[sid] = tools.filter(t => !disabledNames.includes(t.name)).map(t => t.name);
    if (aliases[sid]) {
      toolAliasMap[sid] = { ...aliases[sid] };
    }
  }
}
function isToolMounted(sid: string, name: string) {
  return (mountToolSelection[sid] || []).includes(name);
}
function toggleMountTool(sid: string, name: string) {
  if (!mountToolSelection[sid]) mountToolSelection[sid] = [];
  const arr = mountToolSelection[sid];
  const idx = arr.indexOf(name);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(name);
}
function isAllToolsMounted(sid: string) {
  const all = (mcpStore.tools[sid] || []).map(t => t.name);
  const sel = mountToolSelection[sid] || [];
  return all.length > 0 && all.every(n => sel.includes(n));
}
function toggleAllTools(sid: string) {
  const all = (mcpStore.tools[sid] || []).map(t => t.name);
  if (isAllToolsMounted(sid)) {
    delete mountToolSelection[sid];
  } else {
    mountToolSelection[sid] = [...all];
  }
}
function setToolAlias(sid: string, name: string, alias: string) {
  if (!toolAliasMap[sid]) toolAliasMap[sid] = {};
  if (alias.trim()) {
    toolAliasMap[sid][name] = alias.trim();
  } else {
    delete toolAliasMap[sid][name];
  }
}

const showAgentEdit = ref(false);
const editingAgent = ref<Agent | null>(null);
const debugMode = ref(false);

// 工作目录选择
const showWorkspaceDir = ref(false);
const workspaceDir = ref('');
const WORKSPACE_DIR_KEY = 'settings:workspaceDir';

async function loadWorkspaceDir() {
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    const saved = await adapter.keyring.get(WORKSPACE_DIR_KEY);
    workspaceDir.value = saved || 'workspace';
  } catch { workspaceDir.value = 'workspace'; }
}

async function onWorkspaceDirSelected(path: string) {
  workspaceDir.value = path;
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    await adapter.keyring.set(WORKSPACE_DIR_KEY, path);
  } catch {}
}

function tryParseSnapshot(raw?: string): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function formatSnapshot(raw?: string): string {
  if (!raw) return '（无快照数据）';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

const snapshotDialog = ref(false);
const snapshotActiveTab = ref('');
const currentSnapshots = ref<Array<{ id: string; label: string; content: string }>>([]);
function openSnapshotDialog(userMsg: any) {
  const idx = store.currentMessages.indexOf(userMsg);
  const snapshots: Array<{ id: string; label: string; content: string }> = [];
  for (let i = idx + 1; i < store.currentMessages.length; i++) {
    const m: any = store.currentMessages[i];
    if (m.role === 'user') break;
    if (m.role === 'assistant' && m.systemPromptSnapshot) {
      const parsed = tryParseSnapshot(m.systemPromptSnapshot);
      const step = parsed?.step ?? 0;
      const agentName = agentStore.selectedAgent?.name || '智能体';
      const label = step === 0 ? `Human → ${agentName}` : `${agentName}（#${step}）`;
      snapshots.push({ id: m.id, label, content: formatSnapshot(m.systemPromptSnapshot) });
    }
  }
  currentSnapshots.value = snapshots;
  snapshotActiveTab.value = snapshots[0]?.id || '';
  snapshotDialog.value = true;
}

const isDraftMode = ref(false);
const renamingId = ref('');
const renamingTitle = ref('');
const renameInputRef = ref<any>(null);

const ctxMenu = reactive<{ visible: boolean; x: number; y: number; conv: Conversation | null }>({
  visible: false, x: 0, y: 0, conv: null,
});

const md = new MarkdownIt({
  html: false, linkify: true, breaks: true,
  highlight(str: string, lang: string) {
    const codeClass = lang ? ` class="language-${lang}"` : '';
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        const h = hljs.highlight(str, { language: lang }).value;
        return `<pre class="hljs code-block-wrapper">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${h}</code></pre>`;
      } catch {}
    }
    return `<pre class="hljs code-block-wrapper">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

function renderMarkdown(c: string) { return md.render(c || ''); }

function handleContentClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.classList.contains('code-copy-btn')) {
    const raw = t.getAttribute('data-code') || '';
    navigator.clipboard.writeText(decodeURIComponent(raw)).then(() => {
      t.textContent = '已复制'; setTimeout(() => { t.textContent = '复制'; }, 1500);
    }).catch(() => ElMessage.error('复制失败'));
  }
}

const currentConv = computed(() => store.conversations.find((c) => c.id === store.currentConvId));
const filteredConversations = computed(() => {
  if (!search.value.trim()) return store.conversations;
  const q = search.value.toLowerCase();
  return store.conversations.filter((c) => c.title.toLowerCase().includes(q));
});

const messageRounds = computed<MessageRound[]>(() => {
  const msgs = store.currentMessages;
  const rounds: MessageRound[] = [];
  let currentRound: MessageRound | null = null;

  for (const msg of msgs) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
      if (currentRound) rounds.push(currentRound);
      currentRound = { user: msg, steps: [], allToolCalls: [], finalAssistant: null };
    } else if (msg.role === 'assistant') {
      if (!currentRound) continue;
      currentRound.steps.push({
        reasoningContent: msg.reasoningContent,
        toolCalls: msg.toolCalls || [],
        toolResults: [],
        partialContent: msg.content || undefined,
      });
      if (msg.toolCalls?.length) {
        currentRound.allToolCalls.push(...msg.toolCalls);
      }
    } else if (msg.role === 'tool') {
      if (!currentRound) continue;
      for (let s = currentRound.steps.length - 1; s >= 0; s--) {
        const step = currentRound.steps[s];
        if (step.toolCalls.some((tc: any) => tc.id === msg.toolCallId)) {
          step.toolResults.push({
            callId: msg.toolCallId || '',
            content: msg.content || '',
            isError: isToolErrorContent(msg.content || ''),
          });
          break;
        }
      }
    }
  }
  if (currentRound) rounds.push(currentRound);

  // 最后一轮：如果最后一个 step 没有 toolCalls，把它提升为 finalAssistant
  for (const round of rounds) {
    const lastStep = round.steps[round.steps.length - 1];
    if (lastStep && !lastStep.toolCalls.length) {
      round.finalAssistant = {
        id: round.user?.id + '-fa' || 'fa',
        conversationId: '',
        role: 'assistant',
        content: lastStep.partialContent || '',
        reasoningContent: lastStep.reasoningContent,
        createdAt: 0,
      };
      round.steps.pop();
    }
    round.hasAgentProcess = round.steps.length > 0 || round.allToolCalls.length > 0;
    round.agentStats = {
      stepCount: round.steps.length,
      reasoningCount: round.steps.filter(s => s.reasoningContent).length,
      toolCallCount: round.steps.reduce((sum, s) => sum + s.toolCalls.length, 0),
    };
  }
  return rounds;
});

function isToolErrorContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return !!parsed?.isError;
  } catch { return false; }
}

const modelGroups = computed(() => {
  const enabled = platformStore.models.filter((m) => m.enabled);
  return platformStore.platforms
    .map((p) => ({
      platformId: p.id,
      platformName: p.name,
      models: enabled.filter((m) => m.platformId === p.id),
    }))
    .filter((g) => g.models.length > 0);
});

const mountableServers = computed(() =>
  mcpStore.servers.filter(s =>
    (mcpStore.tools[s.id] || []).length > 0 ||
    s.status === 'connected' ||
    store.mountedMcpServers.includes(s.id),
  ),
);

const tokenCount = computed(() =>
  store.currentMessages.reduce((s, m) => s + estimateTokens(m.content || '') + estimateTokens(m.reasoningContent || ''), 0),
);
const contextLimit = computed(() => {
  const m = platformStore.models.find((x) => x.id === selectedModelId.value);
  return m?.contextWindow || 8000;
});
const tokenPercent = computed(() => Math.min(100, Math.round((tokenCount.value / contextLimit.value) * 100)));
const tokenBarColor = computed(() => {
  if (tokenPercent.value >= 90) return '#ef4444';
  if (tokenPercent.value >= 70) return '#f59e0b';
  return '#3B82F6';
});
const canSend = computed(() => (!!input.value.trim() || uploadedFiles.value.length > 0) && !!selectedModelId.value && !store.streaming);

function openEditAgent(agent?: Agent | null) {
  editingAgent.value = agent || null;
  showAgentEdit.value = true;
}

function openCreateAgent() {
  editingAgent.value = null;
  showAgentEdit.value = true;
}

function onAgentSaved(agentId: string) {
  agentStore.selectAgent(agentId);
  const agent = agentStore.agents.find((a) => a.id === agentId);
  if (agent?.modelId && platformStore.models.find((m) => m.id === agent.modelId)) {
    selectedModelId.value = agent.modelId;
  }
}

function onAgentDeleted(_agentId: string) {
  showAgentEdit.value = false;
}

onMounted(async () => {
  await agentStore.loadAgents();
  await store.loadConversations();
  await platformStore.loadPlatforms();
  await platformStore.loadModels();
  await mcpStore.loadServers();
  await skillStore.loadSkills();
  await loadWorkspaceDir();

  const agent = agentStore.selectedAgent;
  if (agent?.modelId && platformStore.models.find((m) => m.id === agent.modelId)) {
    selectedModelId.value = agent.modelId;
  } else {
    const first = platformStore.models.find((m) => m.enabled);
    if (first) selectedModelId.value = first.id;
  }

  const showDebugs = new URLSearchParams(location.search).get('showDebugs') === 'true';
  if (showDebugs) { debugMode.value = true; }

  const lastConv = store.conversations[0];
  if (lastConv) {
    await selectConv(lastConv.id);
  }

  if (store.currentConvId) {
    const exists = store.conversations.some((c) => c.id === store.currentConvId);
    if (exists) {
      await store.loadMessages(store.currentConvId);
      const conv = store.conversations.find((c) => c.id === store.currentConvId);
      if (conv?.modelId && conv?.platformId) {
        const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
        if (resolved) selectedModelId.value = resolved.id;
      } else if (conv?.modelId) {
        // 无 platformId 的存量数据
        const resolved = platformStore.resolveModel(conv.modelId);
        if (resolved) selectedModelId.value = resolved.id;
      }
    } else {
      store.currentConvId = '';
      store.currentMessages = [];
    }
  }

  document.addEventListener('click', closeCtxMenu);

  nextTick(() => {
    if (messagesRef.value) messagesRef.value.addEventListener('scroll', handleScroll);
  });
  loadWorkspaceFiles();
});

onUnmounted(() => {
  document.removeEventListener('click', closeCtxMenu);
  if (messagesRef.value) messagesRef.value.removeEventListener('scroll', handleScroll);
});

watch(() => store.currentMessages.length, () => nextTick(() => {
  if (messagesRef.value) { messagesRef.value.scrollTop = messagesRef.value.scrollHeight; handleScroll(); }
  if (!store.streaming) collapseEarlyOnMobile();
}));

// 移动端：只在新消息加载/切会话时折叠早期消息（不随 streaming 重复折叠）
watch(() => store.currentConvId, async (id) => {
  if (!id) return;
  isDraftMode.value = false;
  const conv = store.conversations.find((c) => c.id === id);
  if (conv?.modelId && conv?.platformId) {
    const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
    if (resolved) selectedModelId.value = resolved.id;
  } else if (conv?.modelId) {
    const resolved = platformStore.resolveModel(conv.modelId);
    if (resolved) selectedModelId.value = resolved.id;
  }
  mountedSkillIds.value = conv?.skillIds ? [...conv.skillIds] : [];
  initMountSelection();
  // 切会话后在下一帧判断是否折叠早期消息
  await nextTick();
  collapseEarlyOnMobile();
});

watch(showMount, (v) => {
  if (v) initMountSelection();
});

watch(() => store.streaming, (isStreaming) => {
  if (isStreaming) {
    const lastIdx = messageRounds.value.length - 1;
    if (lastIdx >= 0) expandedAgentProcess['round-' + lastIdx] = true;
  }
});

function onAgentSwitch(id: string) {
  agentStore.selectAgent(id);
  const agent = agentStore.agents.find((a) => a.id === id);
  if (agent?.modelId && platformStore.models.find((m) => m.id === agent.modelId)) {
    selectedModelId.value = agent.modelId;
  }
}

function onModelChange(modelId: string) {
  const model = platformStore.models.find((m) => m.id === modelId);
  if (model && agentStore.selectedAgent) {
    agentStore.updateAgent(agentStore.selectedId, { modelId: model.modelId, platformId: model.platformId });
  }
}

function startNewChat() {
  store.currentConvId = '';
  store.currentMessages = [];
  isDraftMode.value = true;
  mountedSkillIds.value = [];
  input.value = '';
}

async function selectConv(id: string) {
  await store.loadMessages(id);
  isDraftMode.value = false;
  const conv = store.conversations.find((c) => c.id === id);
  if (conv?.modelId && conv?.platformId) {
    const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
    if (resolved) selectedModelId.value = resolved.id;
  } else if (conv?.modelId) {
    const resolved = platformStore.resolveModel(conv.modelId);
    if (resolved) selectedModelId.value = resolved.id;
  }
  mountedSkillIds.value = conv?.skillIds ? [...conv.skillIds] : [];
  initMountSelection();
}

function triggerFileUpload() {
  fileInputRef.value?.click();
}
function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (!files) return;
  const maxSize = 10 * 1024 * 1024;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.size > maxSize) { ElMessage.warning(`文件「${f.name}」超过 10MB 限制`); continue; }
    const reader = new FileReader();
    reader.onload = () => {
      uploadedFiles.value.push({
        name: f.name, size: f.size, type: f.type,
        dataUrl: reader.result as string,
      });
    };
    reader.readAsDataURL(f);
  }
  target.value = '';
}
function removeFile(idx: number) { uploadedFiles.value.splice(idx, 1); }
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function send() {
  if (!input.value.trim() && uploadedFiles.value.length === 0) return;
  if (!selectedModelId.value || !platformStore.models.find((m) => m.id === selectedModelId.value)) {
    ElMessage.error('请先选择模型'); return;
  }
  const content = input.value;
  const model = platformStore.models.find((m) => m.id === selectedModelId.value);
  const platform = platformStore.platforms.find((p) => p.id === model?.platformId);
  if (!platform || !model) { ElMessage.error('平台或模型不存在'); return; }

  if (!CHAT_MODEL_TYPES.includes(model.type)) {
    ElMessage.warning('「' + (model.alias || model.modelId) + '」不是对话模型（类型：' + model.type + '），不支持聊天功能');
    return;
  }

  const files = [...uploadedFiles.value];
  uploadedFiles.value = [];

  let userContent = content;
  if (files.length > 0) {
    userContent = content || '请分析以下文件';
    const fileParts = files.map(f => `\n[文件: ${f.name} (${formatSize(f.size)}, ${f.type})]`).join('');
    userContent = userContent + '\n---\n已上传文件：' + fileParts;
  }

  if (!userContent.trim()) { ElMessage.warning('请输入消息'); return; }

  if (store.currentConvId && !store.conversations.some((c) => c.id === store.currentConvId)) {
    store.currentConvId = '';
    store.currentMessages = [];
  }

  try {
    const agent = agentStore.selectedAgent;
    if (!store.currentConvId) {
      const title = userContent.trim().slice(0, 24) + (userContent.trim().length > 24 ? '…' : '');
      const id = await store.createConversation(title, {
        platformId: platform.id,
        modelId: model.modelId,  // 存模型名称而非内部 ID，避免拉取后 ID 漂移
        skillIds: [...mountedSkillIds.value],
      });
      if (agent?.systemPrompt) {
        await store.updateConversation(id, { systemPrompt: agent.systemPrompt });
      }
      await saveMountToDb(id);
      // skillIds 已在 createConversation 中持久化，无需再 update
      await store.loadMessages(id);
      isDraftMode.value = false;
    } else if (!currentConv.value?.platformId) {
      await store.updateConversation(store.currentConvId, { platformId: platform.id, modelId: model.modelId });
    }

    input.value = '';

    if (selectedFilePaths.value.size > 0) {
      const fileRefs: Array<Record<string, unknown>> = [];
      for (const filePath of selectedFilePaths.value) {
        const f = workspaceFiles.value.find(wf => wf.path === filePath);
        if (!f) continue;
        try {
          const { getPlatformAdapter } = await import('@yan-zhi/core');
          const adapter = getPlatformAdapter();
          const fileContent = await adapter.fs.readFile(f.path);
          const ext = f.name.split('.').pop()?.toLowerCase();
          const excelExts = ['xlsx', 'xls', 'csv'];
          let preview: string;
          if (excelExts.includes(ext || '')) {
            try {
              const XLSX = await import('xlsx');
              const wb = XLSX.read(fileContent, { type: 'string' });
              const parts: string[] = [];
              for (const sheetName of wb.SheetNames) {
                const ws = wb.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(ws);
                const lines = csv.split('\n').slice(0, 4);
                parts.push('Sheet: ' + sheetName + '\n' + lines.join('\n'));
              }
              preview = parts.join('\n\n');
            } catch { preview = fileContent.slice(0, 500); }
          } else {
            preview = fileContent.split('\n').slice(0, 6).join('\n');
          }
          fileRefs.push({
            fileId: f.name.split('_')[0],
            fileName: f.name.replace(/^f_[a-f0-9]+_/, ''),
            type: ext || 'unknown', size: f.size, preview,
          });
        } catch { /* skip */ }
      }
      if (fileRefs.length > 0) {
        userContent = userContent + '\n\n[Files]\n' + JSON.stringify(fileRefs, null, 2);
      }
    }

    await store.sendMessage(userContent, platform, model, undefined, {
      temperature: agent?.temperature,
      maxTokens: agent?.maxTokens,
      topP: agent?.topP,
      frequencyPenalty: agent?.frequencyPenalty,
      presencePenalty: agent?.presencePenalty,
      reasoningEffort: (agent?.config as any)?.reasoningEffort || undefined,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    console.error('[Chat] 发送失败:', e);
    ElMessage({ message: e?.message || '发送失败', type: 'error', duration: 6000, showClose: true });
  }
}

function stopChat() {
  store.stop();
}

async function regenerateMsg() {
  if (!store.currentConvId || store.streaming) return;
  const model = platformStore.models.find((m) => m.id === selectedModelId.value);
  const platform = platformStore.platforms.find((p) => p.id === model?.platformId);
  if (!platform || !model) { ElMessage.error('平台或模型不存在'); return; }
  try {
    const agent = agentStore.selectedAgent;
    await store.regenerate(platform, model, undefined, {
      temperature: agent?.temperature,
      maxTokens: agent?.maxTokens,
      topP: agent?.topP,
      frequencyPenalty: agent?.frequencyPenalty,
      presencePenalty: agent?.presencePenalty,
      reasoningEffort: (agent?.config as any)?.reasoningEffort || undefined,
    });
  } catch (e: any) {
    ElMessage.error(e?.message || '重新生成失败');
  }
}

function shouldShowMessage(msg: Message): boolean {
  if (msg.role === 'system' || msg.role === 'tool') return false;
  // 隐藏仅包含 toolCalls 的中间 assistant 消息，其 toolCalls 合并到后续显示
  if (msg.role === 'assistant' && !msg.content && msg.toolCalls?.length) return false;
  return true;
}

// 获取当前消息应展示的 toolCalls（包含前面被隐藏的中间 assistant 消息的 toolCalls）
function collectToolCalls(msg: Message): any[] {
  const msgIndex = store.currentMessages.indexOf(msg);
  if (msgIndex < 0) return msg.toolCalls || [];
  if (msg.role !== 'assistant' || !msg.content) return msg.toolCalls || [];
  const allCalls = [...(msg.toolCalls || [])];
  // 向前查找被隐藏的中间 assistant 消息，收集它们的 toolCalls
  for (let i = msgIndex - 1; i >= 0; i--) {
    const prev = store.currentMessages[i];
    if (prev.role === 'tool') continue; // 跳过工具结果消息
    if (prev.role === 'assistant' && !prev.content && prev.toolCalls?.length) {
      allCalls.unshift(...prev.toolCalls);
    } else {
      break;
    }
  }
  return allCalls;
}

const filteredFiles = computed(() => {
  if (!fileSearch.value.trim()) return workspaceFiles.value;
  const q = fileSearch.value.toLowerCase();
  return workspaceFiles.value.filter((f) => f.name.toLowerCase().includes(q));
});

async function loadWorkspaceFiles() {
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    const filesDir = 'workspace/files';
    const exists = await adapter.fs.exists(filesDir);
    if (!exists) {
      await adapter.fs.mkdir(filesDir);
      workspaceFiles.value = [];
      return;
    }
    const entries = await adapter.fs.readDir(filesDir);
    const result: Array<{ name: string; path: string; size: number; isDir: boolean }> = [];
    for (const entry of entries) {
      const p = filesDir + '/' + entry;
      const entryExists = await adapter.fs.exists(p);
      if (!entryExists) continue;
      result.push({ name: entry, path: p, size: 0, isDir: false });
    }
    result.sort((a: any, b: any) => a.name.localeCompare(b.name));
    workspaceFiles.value = result;
  } catch (e) {
    console.error('loadWorkspaceFiles error:', e);
  }
}

async function previewFile(f: { name: string; path: string; isDir: boolean }) {
  if (f.isDir) return;
  try {
    const ext = f.name.split('.').pop()?.toLowerCase();
    const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    const content = await adapter.fs.readFile(f.path);

    if (imgExts.includes(ext || '')) {
      ElMessageBox.alert(
        `<img src="${content}" style="max-width:100%;max-height:500px" />`,
        f.name, { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' },
      );
    } else {
      ElMessageBox.alert(
        `<pre style="max-height:500px;overflow:auto;font-size:12px;line-height:1.5;white-space:pre-wrap">${content.slice(0, 10000).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`,
        f.name, { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' },
      );
    }
  } catch (e: any) {
    ElMessage.error('读取文件失败: ' + (e?.message || e));
  }
}

function toggleFileSelect(path: string) {
  const next = new Set(selectedFilePaths.value);
  if (next.has(path)) next.delete(path); else next.add(path);
  selectedFilePaths.value = next;
}

function triggerFilePanelUpload() { filePanelUploadRef.value?.click(); }

async function handleFilePanelUpload(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (!files) return;
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    const filesDir = 'workspace/files';
    const dirExists = await adapter.fs.exists(filesDir);
    if (!dirExists) await adapter.fs.mkdir(filesDir);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const fileId = 'f_' + crypto.randomUUID().slice(0, 12);
      const newName = fileId + '_' + f.name;
      const newPath = filesDir + '/' + newName;
      const content = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(f);
      });
      await adapter.fs.writeFile(newPath, content);
    }
    await loadWorkspaceFiles();
    ElMessage.success('已上传 ' + files.length + ' 个文件');
  } catch (e: any) {
    ElMessage.error('上传失败: ' + (e?.message || e));
  }
  target.value = '';
}

async function deleteFileItem(f: { path: string; name: string }) {
  try {
    await ElMessageBox.confirm('确认删除「' + f.name + '」？', '提示', { type: 'warning' });
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    await adapter.fs.remove(f.path);
    selectedFilePaths.value.delete(f.path);
    await loadWorkspaceFiles();
    ElMessage.success('已删除');
  } catch { /* cancelled */ }
}

function scrollToTop() { if (messagesRef.value) messagesRef.value.scrollTo({ top: 0, behavior: 'smooth' }); }
function scrollToBottom() { if (messagesRef.value) messagesRef.value.scrollTo({ top: messagesRef.value.scrollHeight, behavior: 'smooth' }); }
function scrollToRound(ri: number) {
  activeNavRound.value = ri;
  const group = document.querySelector(`[data-round="${ri}"]`) as HTMLElement;
  if (!group) return;
  group.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleScroll() {
  const el = messagesRef.value;
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  const canScroll = el.scrollHeight > el.clientHeight;
  showScrollBottom.value = canScroll && !atBottom;
  showScrollTop.value = canScroll && el.scrollTop > el.clientHeight;

  // 跟踪当前可见的用户消息轮次（用于右侧导航指示器）
  updateActiveNavRound(el);
}

function updateActiveNavRound(el: HTMLElement) {
  const indices = userRoundIndices.value;
  if (indices.length === 0) { activeNavRound.value = null; return; }
  // 找到最后一个顶部出现在视口上方的 round
  let lastVisible: number | null = null;
  for (const ri of indices) {
    const group = el.querySelector(`[data-round="${ri}"]`) as HTMLElement;
    if (!group) continue;
    const relTop = group.getBoundingClientRect().top - el.getBoundingClientRect().top;
    if (relTop < el.clientHeight / 2) {
      lastVisible = ri;
    }
  }
  activeNavRound.value = lastVisible !== null ? lastVisible : indices[0];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function toggleReasoning(id: string) { expandedReasoning[id] = !expandedReasoning[id]; }
function toggleTool(key: string) { expandedTools[key] = !expandedTools[key]; }
function toggleToolGroup(msgId: string) { expandedToolGroups[msgId] = !expandedToolGroups[msgId]; }
function toggleMsgCollapse(msgId: string) { collapsedMessages[msgId] = !collapsedMessages[msgId]; }

const collapsedByAuto = new Set<string>();

function collapseEarlyOnMobile() {
  const isMobile = window.innerWidth <= 767;
  if (!isMobile) return;
  // 只放已设为 true 的自动折叠，用户手动展开的跳过
  for (const id of collapsedByAuto) {
    if (collapsedMessages[id]) collapsedMessages[id] = false;
  }
  collapsedByAuto.clear();
  const rounds = messageRounds.value;
  let runningLen = 0;
  const THRESHOLD = 600;
  for (let ri = 0; ri < rounds.length - 1; ri++) {
    const r = rounds[ri];
    const userLen = (r.user?.content || '').length;
    const asstLen = (r.finalAssistant?.content || '').length;
    runningLen += userLen + asstLen;
    if (runningLen > THRESHOLD && ri < rounds.length - 2) {
      if (r.user) { collapsedMessages[r.user.id] = true; collapsedByAuto.add(r.user.id); }
      if (r.finalAssistant) { collapsedMessages[r.finalAssistant.id] = true; collapsedByAuto.add(r.finalAssistant.id); }
    }
  }
}
function toggleAgentProcess(key: string) { expandedAgentProcess[key] = !expandedAgentProcess[key]; }
function toggleStepTools(key: string) { expandedStepTools[key] = !expandedStepTools[key]; }

function isLastRoundStreaming(round: MessageRound, ri: number): boolean {
  return ri === messageRounds.value.length - 1 &&
    store.streaming &&
    !round.finalAssistant?.content;
}

function getStepToolResult(step: { toolResults: Array<{ callId: string; content: string; isError: boolean }> }, tcId: string): string | null {
  const found = step.toolResults.find(r => r.callId === tcId);
  return found?.content || null;
}
function isStepToolError(step: { toolResults: Array<{ callId: string; content: string; isError: boolean }> }, tcId: string): boolean {
  const found = step.toolResults.find(r => r.callId === tcId);
  return found?.isError || false;
}
function isStepToolsRunning(step: { toolCalls: any[]; toolResults: Array<{ callId: string; content: string; isError: boolean }> }): boolean {
  return step.toolCalls.some((tc: any) => !step.toolResults.some(r => r.callId === tc.id));
}
function isStepToolsError(step: { toolCalls: any[]; toolResults: Array<{ callId: string; content: string; isError: boolean }> }): boolean {
  return step.toolCalls.length > 0 && step.toolCalls.every((tc: any) =>
    step.toolResults.some(r => r.callId === tc.id && r.isError)
  );
}
function getStepToolGroupClass(step: { toolCalls: any[]; toolResults: Array<{ callId: string; content: string; isError: boolean }> }): string {
  if (isStepToolsRunning(step)) return 'group-running';
  if (isStepToolsError(step)) return 'group-error';
  return 'group-ok';
}
function getStepToolStatusClass(step: { toolResults: Array<{ callId: string; content: string; isError: boolean }> }, tcId: string): string {
  const found = step.toolResults.find(r => r.callId === tcId);
  if (!found) return 'tool-status-running';
  return found.isError ? 'tool-status-error' : 'tool-status-ok';
}

function isToolGroupRunning(toolCalls: any[]): boolean {
  return toolCalls.some((tc: any) => !getToolResult(tc.id));
}
function isToolGroupError(toolCalls: any[]): boolean {
  return toolCalls.length > 0 && toolCalls.every((tc: any) => getToolResult(tc.id) && isToolError(tc.id));
}
function getToolGroupStatusClass(_msg: any, toolCalls: any[]): string {
  if (isToolGroupRunning(toolCalls)) return 'group-running';
  if (isToolGroupError(toolCalls)) return 'group-error';
  return 'group-ok';
}

function resolveToolDisplay(tc: any): { server: string; tool: string } {
  // 流式 delta 格式：tc.function.name 或 tc.toolName（老 DB 格式）
  const rawName = tc.function?.name || tc.toolName || tc.id || '';
  // 新格式: mcp_{shortId}__{toolName}
  let m = rawName.match(/^mcp_(.{1,8}?)__(.+)$/);
  if (m) {
    const server = mcpStore.servers.find(s => s.id.startsWith(m![1]));
    return { server: server?.name || m[1], tool: m[2] };
  }
  // 完整 UUID 老格式: mcp_{full-uuid}_{toolName}
  m = rawName.match(/^mcp_([0-9a-f-]{36})_(.+)$/);
  if (m) {
    const server = mcpStore.servers.find(s => s.id === m![1]);
    return { server: server?.name || m[1].slice(0, 8), tool: m[2] };
  }
  // DB 持久化格式：tc.mcpServerId + tc.toolName
  if (tc.mcpServerId) {
    const server = mcpStore.servers.find(s => s.id === tc.mcpServerId);
    return { server: server?.name || tc.mcpServerId.slice(0, 8), tool: tc.toolName || rawName };
  }
  return { server: 'MCP', tool: rawName };
}

function resolveToolArgs(tc: any): string {
  const args = tc.function?.arguments ?? tc.arguments;
  if (!args) return '{}';
  if (typeof args === 'string') {
    try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; }
  }
  return safeJson(args);
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function isToolError(toolCallId: string): boolean {
  const toolMsg = store.currentMessages.find(m => m.role === 'tool' && m.toolCallId === toolCallId);
  if (!toolMsg?.content) return false;
  try {
    const parsed = JSON.parse(toolMsg.content);
    return !!parsed?.isError;
  } catch { return false; }
}

function getToolStatusClass(toolCallId: string): string {
  if (!getToolResult(toolCallId)) return 'tool-status-running';
  return isToolError(toolCallId) ? 'tool-status-error' : 'tool-status-ok';
}

function getToolResult(toolCallId: string): string | null {
  const toolMsg = store.currentMessages.find(m => m.role === 'tool' && m.toolCallId === toolCallId);
  if (!toolMsg?.content) return null;
  try {
    const parsed = JSON.parse(toolMsg.content);
    if (parsed?.isError) return JSON.stringify(parsed, null, 2);
    // MCP content 数组格式，提取 text 部分
    if (parsed?.content?.length) {
      const texts = parsed.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      if (texts) return texts;
    }
    if (typeof parsed === 'string') return parsed;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return toolMsg.content;
  }
}

async function copyMsg(msg: Message) {
  try { await navigator.clipboard.writeText((msg.content || '').replace(/\n+$/, '')); ElMessage.success('已复制'); }
  catch { ElMessage.error('复制失败'); }
}

async function editMsg(msg: Message) {
  input.value = msg.content || '';
  await nextTick();
  const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement;
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

async function delMsg(msg: Message) { await store.deleteMessage(msg.id); }

function openConvMenu(e: MouseEvent, conv: Conversation) {
  ctxMenu.visible = true; ctxMenu.x = e.clientX; ctxMenu.y = e.clientY; ctxMenu.conv = conv;
}
function closeCtxMenu() { ctxMenu.visible = false; }
async function togglePin(conv: Conversation | null) {
  if (!conv) return;
  await store.updateConversation(conv.id, { pinned: !conv.pinned });
  closeCtxMenu();
}
function startRename(conv: Conversation) {
  renamingId.value = conv.id; renamingTitle.value = conv.title;
  closeCtxMenu(); nextTick(() => renameInputRef.value?.focus?.());
}
async function commitRename() {
  if (!renamingId.value) return;
  const title = renamingTitle.value.trim();
  if (title && title !== store.conversations.find((c) => c.id === renamingId.value)?.title) {
    await store.updateConversation(renamingId.value, { title });
  }
  renamingId.value = '';
}
async function deleteConv(conv: Conversation | null) {
  if (!conv) return;
  closeCtxMenu();
  try {
    await ElMessageBox.confirm(`删除会话"${conv.title}"？`, '提示', { type: 'warning' });
    await store.deleteConversation(conv.id);
    ElMessage.success('已删除');
  } catch {}
}

function toggleConvSelect(id: string) {
  const next = new Set(selectedConvIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selectedConvIds.value = next;
}
function batchSelectAll() {
  selectedConvIds.value = new Set(filteredConversations.value.map(c => c.id));
}
async function batchDeleteConvs() {
  if (selectedConvIds.value.size === 0) return;
  try {
    await ElMessageBox.confirm(`删除 ${selectedConvIds.value.size} 个会话？`, '提示', { type: 'warning' });
    await store.deleteConversations([...selectedConvIds.value]);
    selectedConvIds.value = new Set();
    batchMode.value = false;
    ElMessage.success('已删除');
  } catch {}
}

async function saveMountToDb(convId) {
  const serverIds = Object.keys(mountToolSelection).filter(sid => (mountToolSelection[sid] || []).length > 0);
  if (serverIds.length === 0) return;
  const disabled = {};
  const aliases = JSON.parse(JSON.stringify(toolAliasMap));
  for (const sid of serverIds) {
    const all = (mcpStore.tools[sid] || []).map(t => t.name);
    const sel = mountToolSelection[sid] || [];
    const diff = all.filter(n => !sel.includes(n));
    if (diff.length > 0) disabled[sid] = diff;
  }
  await store.updateConversation(convId, {
    mcpServerIds: serverIds,
    _mcpDisabledTools: disabled,
    _mcpToolAliases: aliases,
  });
}

async function saveMount() {
  store.mountedMcpServers = Object.keys(mountToolSelection).filter(sid => (mountToolSelection[sid] || []).length > 0);
  const disabled: Record<string, string[]> = {};
  for (const sid of store.mountedMcpServers) {
    const all = (mcpStore.tools[sid] || []).map(t => t.name);
    const sel = mountToolSelection[sid] || [];
    const diff = all.filter(n => !sel.includes(n));
    if (diff.length > 0) disabled[sid] = diff;
  }
  store.mcpDisabledTools = disabled;
  store.mcpToolAliases = JSON.parse(JSON.stringify(toolAliasMap));
  if (store.currentConvId) {
    await store.updateConversation(store.currentConvId, {
      mcpServerIds: [...store.mountedMcpServers],
      _mcpDisabledTools: disabled,
      _mcpToolAliases: JSON.parse(JSON.stringify(toolAliasMap)),
      skillIds: [...mountedSkillIds.value],
    });
  }
  showMount.value = false;
}
async function saveSkills() {
  // 总是更新内存中的状态，send() 会在新建会话时持久化
  if (store.currentConvId) {
    await store.updateConversation(store.currentConvId, { skillIds: [...mountedSkillIds.value] });
  }
  showSkills.value = false;
}
</script>

<style scoped>
/* ===== 布局 ===== */
.chat-page { display: flex; height: 100%; position: relative; }
.chat-page.conv-collapsed .sidebar { width: 0; overflow: hidden; border: none; }
.chat-page.conv-collapsed .conv-toggle { left: 0; }

/* ===== 侧边栏 ===== */
.sidebar {
  width: 280px; background: var(--glass-bg); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
  border-right: 1px solid var(--glass-border); display: flex; flex-direction: column;
  transition: width 0.25s ease; overflow: hidden;
}

.sidebar-tabs { display: flex; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; }
.sb-tab {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 10px; border-radius: 8px; margin: 2px;
  font-size: 13px; font-weight: 500; cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1); user-select: none;
}
.sb-tab:hover { color: var(--color-text); background: var(--glass-bg-hover); }
.sb-tab.active { color: var(--color-primary); background: rgba(124, 58, 237, 0.08); font-weight: 600; }

.agent-list { flex: 1; overflow-y: auto; padding: 8px; }
.agent-list::-webkit-scrollbar { width: 6px; }
.agent-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
.agent-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: var(--radius-sm); cursor: pointer;
  transition: all 0.15s; margin-bottom: 4px; position: relative;
}
.agent-item:hover { background: var(--glass-bg-hover); }
.agent-item:hover .agent-edit-btn { opacity: 1; }
.agent-item.active { background: rgba(59,130,246,0.1); }
.agent-item.active::before { content: ''; position: absolute; left: 0; width: 3px; height: 50%; background: var(--color-primary); border-radius: 0 2px 2px 0; }
.agent-item.add-agent { color: var(--color-primary); font-weight: 500; border: 1.5px dashed var(--glass-border); justify-content: center; }
.agent-item.add-agent:hover { border-color: var(--color-primary); background: rgba(59,130,246,0.06); }
.agent-avatar {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2));
  color: var(--color-primary); font-weight: 700; font-size: 15px;
}
.agent-info { flex: 1; min-width: 0; }
.agent-name {
  font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: flex; align-items: center; gap: 4px;
}
.agent-name .lock-icon { font-size: 12px; color: var(--color-text-secondary); flex-shrink: 0; }
.agent-summary { font-size: 11px; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.agent-edit-btn { opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }

.conv-list { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.conv-header { padding: 8px; flex-shrink: 0; }
.conv-header-row { display: flex; gap: 6px; margin-top: 6px; }
.conv-items { flex: 1; overflow-y: auto; padding: 4px; }
.conv-items::-webkit-scrollbar { width: 6px; }
.conv-items::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
.conv-item {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 10px; border-radius: var(--radius-sm); cursor: pointer;
  transition: all 0.15s; margin-bottom: 2px; position: relative;
}
.conv-item:hover { background: var(--glass-bg-hover); }
.conv-item.active { background: rgba(59,130,246,0.1); color: var(--color-primary); font-weight: 500; }
.conv-item.active::before { content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 60%; background: var(--color-primary); border-radius: 0 2px 2px 0; }
.conv-item.pinned { background: rgba(245,158,11,0.07); }
.conv-item.selecting { cursor: default; }
.conv-item.selecting:hover { background: var(--glass-bg-hover); }

/* 批量操作 */
.batch-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px; border-top: 1px solid var(--glass-border);
  background: var(--glass-bg); font-size: 13px; color: var(--color-text-secondary);
  flex-shrink: 0;
}
.batch-bar span:first-child { font-weight: 600; }
.conv-title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.pin-icon { color: #f59e0b; }

.conv-toggle {
  position: absolute; left: 280px; top: 50%; transform: translateY(-50%);
  width: 20px; height: 48px;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-left: none; border-radius: 0 8px 8px 0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 5; font-size: 12px; color: var(--color-text-secondary);
  transition: left 0.25s ease;
}
.conv-toggle:hover { color: var(--color-primary); background: var(--glass-bg-hover); }

/* ===== 主区 ===== */
.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.chat-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px; border-bottom: 1px solid var(--glass-border);
  background: rgba(255,255,255,0.5); backdrop-filter: var(--glass-filter);
  min-height: 52px;
}
[data-theme="dark"] .chat-topbar { background: rgba(24, 26, 36, 0.5); }
.conv-title-display { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.messages { flex: 1; overflow-y: auto; padding: 24px 32px 60px 32px; scroll-behavior: smooth; position: relative; }
.messages::-webkit-scrollbar { width: 8px; }
.messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
.messages::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.18); }

.welcome-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; text-align: center; gap: 16px; color: var(--color-text-secondary); padding: 24px;
}
.welcome-card .welcome-icon {
  width: 96px; height: 96px; border-radius: 28px;
  display: flex; align-items: center; justify-content: center;
  background: var(--gradient-primary);
  opacity: 0.15; color: var(--color-primary); animation: welcomePulse 3s ease-in-out infinite;
}
@keyframes welcomePulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59,130,246,0.2); }
  50% { transform: scale(1.04); box-shadow: 0 0 0 16px rgba(59,130,246,0); }
}
.welcome-card h2 { font-size: 24px; font-weight: 700; color: var(--color-text-primary); }
.welcome-card p { font-size: 14px; max-width: 420px; line-height: 1.7; }

/* 消息 */
.msg { display: flex; gap: 12px; margin-bottom: 24px; animation: msgIn 0.3s cubic-bezier(0.16,1,0.3,1); }
@keyframes msgIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.msg-user { flex-direction: row-reverse; }
.msg-avatar {
  width: 36px; height: 36px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 18px; color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.avatar-user { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); }
.avatar-assistant { background: linear-gradient(135deg, var(--color-accent), var(--color-primary-dark)); }
.avatar-system { background: linear-gradient(135deg, #64748b, #475569); }
.avatar-tool { background: linear-gradient(135deg, #06b6d4, #0891b2); }
.avatar-assistant.streaming {
  animation: avatarPulse 2s ease-in-out infinite;
}
@keyframes avatarPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(124, 58, 237, 0); }
}
.msg-body { min-width: 0; max-width: calc(100% - 48px); display: flex; flex-direction: column; }
.msg-user .msg-body { align-items: flex-end; }
.msg-assistant .msg-body, .msg-system .msg-body { align-items: flex-start; }
.msg-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 0 4px; }
.msg-role-name { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.msg-time { font-size: 11px; color: var(--color-text-secondary); opacity: 0.6; }
.msg-collapsed-preview {
  font-size: 11px; color: var(--color-text-secondary); opacity: 0.55;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 200px;
}

/* ===== 消息折叠 ===== */
.msg-block {
  position: relative;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s;
  max-width: 100%;
}
.msg-assistant .msg-block, .msg-system .msg-block { max-width: 85%; }
.msg-user .msg-block { width: fit-content; max-width: 80%; }
.msg-block.msg-collapsed {
  max-height: 48px;
  cursor: pointer;
  border-radius: 14px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  padding: 10px 14px;
  overflow: hidden;
}
.msg-block.msg-collapsed:hover {
  border-color: var(--color-primary);
  box-shadow: 0 1px 6px rgba(59,130,246,0.1);
}

.msg-collapsed-placeholder {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 24px;
}
.collapsed-line {
  flex: 1;
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collapsed-hint {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-primary);
  opacity: 0.7;
  font-weight: 500;
}
.msg-content {
  padding: 12px 16px; border-radius: 16px; line-height: 1.65;
  word-wrap: break-word; overflow-wrap: break-word;
  position: relative; transition: box-shadow 0.2s;
  overflow: hidden;
}
.msg-user .msg-content {
  background: var(--gradient-primary);
  color: white; border-bottom-right-radius: 4px; box-shadow: 0 2px 12px rgba(124, 58, 237, 0.25);
}
.msg-assistant .msg-content {
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  position: relative; overflow: hidden;
}
.msg-assistant .msg-content::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  pointer-events: none;
}
.msg-assistant .msg-content:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }

/* ===== 智能体统一回复卡片 ===== */
.agent-response-card {
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: 16px; border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  padding: 16px; transition: box-shadow 0.2s;
}
.agent-response-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.agent-response-body { line-height: 1.65; }

.agent-process-header {
  display: flex; align-items: center; gap: 6px;
  margin-top: 12px; padding: 8px 12px;
  font-size: 12px; color: var(--color-text-secondary);
  background: rgba(139,92,246,0.05); border: 1px solid rgba(139,92,246,0.12);
  border-radius: 10px; cursor: pointer; user-select: none;
  transition: all 0.15s;
}
.agent-process-header:hover {
  background: rgba(139,92,246,0.08); border-color: rgba(139,92,246,0.2);
}
.agent-process-stats { font-weight: 500; font-size: 11px; }
.agent-process-chevron { margin-left: auto; color: var(--color-text-secondary); flex-shrink: 0; }

.agent-process-steps {
  margin-top: 8px; padding-top: 8px;
  border-top: 1px dashed rgba(139,92,246,0.12);
}

.agent-step {
  margin-bottom: 8px; padding: 8px 12px;
  background: rgba(15,23,42,0.02); border: 1px solid rgba(15,23,42,0.06);
  border-radius: 8px;
}
.agent-step:last-child { margin-bottom: 0; }
.agent-step-partial {
  font-size: 13px; padding: 8px 0; line-height: 1.55;
  color: var(--color-text-secondary);
}

.agent-old-tools { margin-top: 6px; }

.msg-actions {
  display: flex; gap: 2px; margin-top: 4px;
  opacity: 0; transition: opacity 0.18s;
}
.msg:hover .msg-actions, .msg-actions:hover { opacity: 1; }
.msg-user .msg-actions { justify-content: flex-end; }
.msg-actions .el-button { color: var(--color-text-secondary); }
.msg-actions .el-button:hover { color: var(--color-primary); }
.msg-content :deep(pre) {
  background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 8px;
  overflow-x: auto; font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 13px; margin: 8px 0;
  max-width: 100%; white-space: pre-wrap; word-break: break-all;
}
.msg-user .msg-content :deep(pre) { background: rgba(0,0,0,0.25); }
.msg-content :deep(.code-block-wrapper) { position: relative; padding-top: 32px; margin: 10px 0; }
.msg-content :deep(.code-lang) {
  position: absolute; top: 6px; left: 12px; font-size: 11px; color: #94a3b8;
  font-family: "JetBrains Mono", monospace; text-transform: uppercase; letter-spacing: 0.5px;
}
.msg-content :deep(.code-copy-btn) {
  position: absolute; top: 4px; right: 4px; background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 3px 10px;
  border-radius: 4px; font-size: 11px; cursor: pointer; transition: all 0.15s; backdrop-filter: blur(4px);
}
.msg-content :deep(.code-copy-btn:hover) { background: rgba(59,130,246,0.3); color: white; }
.msg-content :deep(code) { font-family: "JetBrains Mono", "Cascadia Code", monospace; font-size: 0.88em; }
.msg-content :deep(p) { margin: 6px 0; }
.msg-content :deep(p:first-child) { margin-top: 0; }
.msg-content :deep(p:last-child) { margin-bottom: 0; }
.msg-content :deep(ul), .msg-content :deep(ol) { padding-left: 22px; margin: 6px 0; }
.msg-content :deep(li) { margin: 3px 0; }
.msg-content :deep(table) { border-collapse: collapse; margin: 8px 0; width: 100%; display: block; overflow-x: auto; }
.msg-content :deep(th), .msg-content :deep(td) { border: 1px solid var(--glass-border); padding: 6px 12px; text-align: left; word-break: break-word; }
.msg-content :deep(th) { background: rgba(0,0,0,0.03); font-weight: 600; }
.msg-content :deep(blockquote) { border-left: 3px solid var(--color-primary); padding-left: 12px; margin: 8px 0; color: var(--color-text-secondary); }
.msg-content :deep(a) { color: var(--color-primary); text-decoration: none; }
.msg-content :deep(a:hover) { text-decoration: underline; }
.msg-content.streaming { color: var(--color-text-secondary); }
.cursor { animation: blink 1s step-end infinite; font-weight: bold; color: var(--color-primary); }
@keyframes blink { 50% { opacity: 0; } }

.msg-reasoning {
  font-size: 12px; color: var(--color-text-secondary); margin-bottom: 6px;
  background: rgba(139,92,246,0.05); border: 1px solid rgba(139,92,246,0.12);
  border-radius: 10px; padding: 8px 12px;
}
.reasoning-header { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; font-weight: 500; }
.reasoning-header .el-icon { color: #8B5CF6; }
.reasoning-body { margin-top: 8px; padding: 8px 4px; white-space: pre-wrap; line-height: 1.55; opacity: 0.85; border-top: 1px dashed rgba(139,92,246,0.15); }

/* ===== 工具调用分组 ===== */
.msg-tools-group {
  margin-bottom: 8px;
  border: 1px solid rgba(15,23,42,0.08);
  border-radius: 8px; overflow: hidden;
  background: rgba(15,23,42,0.02);
  transition: border-color 0.15s;
}
.msg-tools-group:hover { border-color: rgba(15,23,42,0.14); }

.tool-group-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 12px; cursor: pointer; user-select: none;
  transition: background 0.15s;
}
.tool-group-header:hover { background: rgba(15,23,42,0.03); }

.tool-group-left { display: flex; align-items: center; gap: 7px; }
.tool-group-dot { flex-shrink: 0; }
.tool-group-dot.group-running { color: #f59e0b; }
.tool-group-dot.group-ok { color: #22c55e; }
.tool-group-dot.group-error { color: #ef4444; }

.tool-group-label { font-size: 12px; font-weight: 600; color: var(--color-text); }
.tool-group-count {
  font-size: 10px; font-weight: 600; color: var(--color-text-secondary);
  background: rgba(15,23,42,0.06); padding: 1px 7px; border-radius: 99px; line-height: 18px;
}
.tool-group-chevron { color: var(--color-text-secondary); flex-shrink: 0; }

.tool-group-body {
  border-top: 1px solid rgba(15,23,42,0.06);
}

/* 单个工具条目 */
.tool-item {
  border-bottom: 1px solid rgba(15,23,42,0.04);
  transition: background 0.15s;
}
.tool-item:last-child { border-bottom: none; }
.tool-item:hover { background: rgba(15,23,42,0.02); }
.tool-item.tool-item-error { background: rgba(239,68,68,0.02); }

.tool-item-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; cursor: pointer; user-select: none; gap: 8px;
}

.tool-item-left { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
.tool-item-status { flex-shrink: 0; }
.tool-item-status .tool-status-running { color: #f59e0b; }
.tool-item-status .tool-status-ok { color: #22c55e; }
.tool-item-status .tool-status-error { color: #ef4444; }
.tool-item-server { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); white-space: nowrap; }
.tool-item-fn {
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  font-size: 11px; color: #8B5CF6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tool-item-chevron { color: var(--color-text-secondary); flex-shrink: 0; }

.tool-item-body { padding: 0 12px 8px 26px; }
.tool-item-section { margin-top: 6px; }
.tool-item-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  color: var(--color-text-secondary); margin-bottom: 3px; letter-spacing: 0.5px;
}
.tool-item-json {
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  font-size: 11px; color: var(--color-text-secondary); line-height: 1.45;
  background: rgba(15,23,42,0.03); padding: 7px 10px; border-radius: 5px;
  white-space: pre-wrap; word-break: break-all; max-height: 160px; overflow-y: auto; margin: 0;
}
.tool-item-json::-webkit-scrollbar { width: 4px; }
.tool-item-json::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }
.tool-item-json-error { color: #dc2626; }

.msg-actions .el-button { color: var(--color-text-secondary); }
.msg-actions .el-button:hover { color: var(--color-primary); }
.msg-actions-minimal { opacity: 0.5; }
.msg-actions-minimal:hover { opacity: 1; }

.snapshot-dialog .el-dialog__body { padding-top: 0; }
.snapshot-body {
  max-height: 500px; overflow: auto; font-size: 12px; line-height: 1.6;
  background: rgba(15, 23, 42, 0.03); color: var(--color-text);
  padding: 14px 16px; border-radius: 8px;
  white-space: pre-wrap; word-break: break-all;
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  margin: 0; border: 1px solid var(--glass-border);
}
.snapshot-body::-webkit-scrollbar { width: 4px; }
.snapshot-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }

/* ===== 输入区 ===== */
.input-area { padding: 10px 20px 14px; background: var(--glass-bg); backdrop-filter: var(--glass-filter); }
.input-box {
  background: rgba(255,255,255,0.6); border: 1.5px solid var(--glass-border);
  border-radius: 16px; padding: 4px; transition: all 0.2s ease;
}
.input-box.focused { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); background: rgba(255,255,255,0.85); }
.input-textarea :deep(.el-textarea__inner) {
  border: none; background: transparent; box-shadow: none !important;
  padding: 10px 12px; border-radius: 12px; font-size: 14px; line-height: 1.6; resize: none;
  word-break: normal; overflow-wrap: break-word;
}
.input-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 8px 4px 12px; flex-wrap: wrap; gap: 6px;
}
.toolbar-left { display: flex; align-items: center; gap: 6px; }
.toolbar-center { display: flex; align-items: center; gap: 6px; flex: 1; justify-content: center; }
.toolbar-right { display: flex; align-items: center; gap: 4px; }
.toolbar-agent { display: flex; align-items: center; gap: 4px; }

.toolbar-mobile-selects { display: none; }

.toolbar-icons { display: flex; align-items: center; gap: 6px; }

.toolbar-more { display: none; }

.pop-select-list { max-height: 260px; overflow-y: auto; }
.pop-select-label { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; padding: 4px 12px 2px; }
.pop-select-item {
  display: flex; align-items: center; gap: 6px; padding: 8px 12px;
  border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--color-text);
  transition: background 0.15s;
}
.pop-select-item:hover { background: rgba(59,130,246,0.06); }
.pop-select-item.active { color: var(--color-primary); font-weight: 600; background: rgba(124,58,237,0.06); }

.more-menu { display: flex; flex-direction: column; gap: 2px; }
.more-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--color-text);
  transition: background 0.15s;
}
.more-item:hover { background: rgba(59,130,246,0.06); }
.more-item .el-icon { font-size: 16px; color: var(--color-text-secondary); }

.minimal-select {
  display: flex; align-items: center; gap: 2px;
  padding: 2px 8px; border-radius: 8px; transition: background 0.15s;
  cursor: pointer;
}
.minimal-select:hover { background: rgba(59,130,246,0.06); }
.minimal-select .select-icon { font-size: 14px; color: var(--color-text-secondary); flex-shrink: 0; }
.minimal-select :deep(.el-select) { --el-select-border-color-hover: transparent; }
.minimal-select :deep(.el-input__wrapper) {
  background: transparent !important; border: none !important; box-shadow: none !important;
  padding: 0; cursor: pointer;
}
.minimal-select :deep(.el-input__inner) { font-size: 13px; font-weight: 500; cursor: pointer; }
.minimal-select :deep(.el-input__suffix) { display: none; }
.agent-switch { width: 120px; }
.agent-switch :deep(.el-select) { width: 120px; }
.model-select { width: 140px; }
.model-select :deep(.el-select) { width: 140px; }
.token-chip { width: 80px; height: 22px; display: flex; align-items: center; padding: 0 2px; background: rgba(0,0,0,0.04); border-radius: 11px; }
.token-progress { width: 100%; }
.send-btn { width: 36px; height: 36px; font-size: 16px; transition: all 0.25s ease; }
.send-btn:not(.is-disabled) {
  background: var(--gradient-primary) !important;
  border-color: transparent !important;
  color: #fff !important;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);
}
.send-btn:not(.is-disabled):hover {
  filter: brightness(1.1);
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.5);
  transform: scale(1.05);
}
.send-btn.is-disabled {
  background: rgba(0,0,0,0.06) !important;
  border-color: transparent !important;
  color: rgba(0,0,0,0.18) !important;
  box-shadow: none;
}

/* 对话框 */
.mount-body { display: flex; flex-direction: column; gap: 12px; }
.mount-search { margin-bottom: 2px; flex-shrink: 0; }
.mount-empty { padding: 30px 0; }
.mount-no-match { text-align: center; font-size: 12px; color: var(--color-text-secondary); padding: 8px 0; }

.mount-server-group {
  border: 1px solid var(--glass-border); border-radius: 10px;
  overflow: hidden; transition: all 0.18s;
}
.mount-server-group:hover { border-color: rgba(59,130,246,0.15); }

.mount-server-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; background: rgba(15,23,42,0.02);
  cursor: pointer; user-select: none; transition: background 0.12s;
}
.mount-server-header:hover { background: rgba(15,23,42,0.05); }
.mount-collapse-icon { transition: transform 0.2s; color: var(--color-text-secondary); flex-shrink: 0; }
.mount-collapse-icon.collapsed { transform: rotate(0deg); }
.mount-server-info { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.mount-server-name { font-weight: 600; }
.mount-server-count { color: var(--color-text-secondary); font-size: 11px; }

.mount-tool-list { display: flex; flex-direction: column; }
.mount-tool-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 9px 14px; cursor: pointer; transition: background 0.12s;
  border-top: 1px solid rgba(15,23,42,0.04);
}
.mount-tool-item:hover { background: rgba(59,130,246,0.04); }

.mount-tool-check {
  width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0; margin-top: 1px;
  border: 2px solid rgba(15,23,42,0.15); display: flex; align-items: center; justify-content: center;
  transition: all 0.18s; color: white; font-size: 12px;
}
.mount-tool-check.checked { background: var(--color-primary); border-color: var(--color-primary); }

.mount-tool-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.mount-tool-name {
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mount-tool-global-alias {
  font-size: 10px; font-weight: 400; color: #8B5CF6; flex-shrink: 0;
}
.mount-tool-desc {
  font-size: 11px; color: var(--color-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mount-tool-remark {
  font-size: 10px; color: #f59e0b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: rgba(245,158,11,0.06); padding: 1px 6px; border-radius: 3px;
  width: fit-content; max-width: 100%; margin-top: 1px;
}

.mount-tool-alias {
  width: 80px; height: 26px; flex-shrink: 0;
  border: 1px solid rgba(15,23,42,0.1); border-radius: 5px;
  padding: 0 8px; font-size: 11px; outline: none; background: transparent;
  transition: border-color 0.15s;
}
.mount-tool-alias:focus { border-color: var(--color-primary); }
.mount-tool-alias::placeholder { color: rgba(15,23,42,0.25); }

.ctx-menu {
  position: fixed; z-index: 9999;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-radius: 10px;
  padding: 4px; min-width: 140px; box-shadow: 0 8px 32px rgba(0,0,0,0.16);
  list-style: none; margin: 0;
}
.ctx-menu li {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer; font-size: 13px; border-radius: 6px; transition: background 0.15s;
}
.ctx-menu li:hover { background: var(--glass-bg-hover); }
.ctx-menu li.danger { color: var(--el-color-danger); }
.ctx-menu li.danger:hover { background: rgba(239,68,68,0.08); }

.file-chips {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 0 4px 6px 4px;
}
.file-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 8px;
  background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.12);
  font-size: 12px; max-width: 260px; transition: all 0.15s;
}
.file-chip:hover { background: rgba(59,130,246,0.1); }
.file-chip-icon { flex-shrink: 0; }
.file-chip-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 500; color: var(--color-text);
}
.file-chip-size { color: var(--color-text-secondary); flex-shrink: 0; }
.file-chip-remove {
  flex-shrink: 0; padding: 0; color: var(--color-text-secondary); font-size: 14px;
}
.file-chip-remove:hover { color: var(--el-color-danger); }

/* Skill 挂载弹窗 - 卡片样式 */
.skill-mount-search { margin-bottom: 14px; }
.skill-mount-body {
  max-height: 380px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
}
.skill-mount-body::-webkit-scrollbar { width: 5px; }
.skill-mount-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }

.skill-card-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: rgba(255,255,255,0.45);
  backdrop-filter: blur(4px);
  transition: all 0.18s; cursor: pointer; user-select: none;
}
.skill-card-item:hover {
  border-color: rgba(59,130,246,0.25);
  background: rgba(59,130,246,0.04);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.skill-card-item.active {
  border-color: rgba(59,130,246,0.4);
  background: rgba(59,130,246,0.06);
}
.skill-card-item.disabled {
  opacity: 0.45; cursor: not-allowed;
}
.skill-card-item.disabled:hover {
  border-color: var(--glass-border);
  background: rgba(255,255,255,0.45);
  transform: none; box-shadow: none;
}

.skill-card-left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

.skill-card-check {
  width: 20px; height: 20px; border-radius: 5px;
  border: 2px solid rgba(15,23,42,0.18);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s; color: white; flex-shrink: 0;
}
.skill-card-check.checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.skill-card-icon {
  width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(59,130,246,0.08);
  color: var(--color-primary); flex-shrink: 0;
}

.skill-card-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.skill-card-name {
  font-size: 13px; font-weight: 600; color: var(--color-text); line-height: 1.3;
}
.skill-card-desc {
  font-size: 12px; color: var(--color-text-secondary); line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 320px;
}

/* Chat topbar actions */
.chat-topbar-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-shrink: 0; }

/* Scroll navigator */
.scroll-nav {
  position: fixed; right: 24px; bottom: 190px;
  display: flex; flex-direction: column; gap: 8px; z-index: 210;
  /* ensure clicks pass through to elements behind the nav */
  pointer-events: auto;
}
.scroll-nav-btn {
  width: 40px; height: 40px; border-radius: 50%;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--color-text-secondary);
  transition: all 0.2s ease; box-shadow: var(--shadow-sm);
}
.scroll-nav-btn:hover {
  background: var(--glass-bg-hover); color: var(--color-primary);
  transform: scale(1.08); box-shadow: var(--shadow-md);
}

/* ===== 消息导航指示器（右侧小横杠） ===== */
.round-nav {
  position: fixed; right: 6px; top: 50%; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  z-index: 210; padding: 4px 6px;
  pointer-events: auto;
}
.round-nav-dash {
  display: flex; align-items: center; justify-content: flex-end;
  cursor: pointer; padding: 6px 8px 6px 12px;
  border-radius: 20px 0 0 20px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}
.round-nav-dash:hover { background: rgba(59,130,246,0.06); }
.round-nav-dash.active { background: rgba(59,130,246,0.08); }

.dash-line {
  display: inline-block;
  width: 18px; height: 3px; border-radius: 2px;
  background: rgba(148,163,184,0.35);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}
.round-nav-dash.active .dash-line {
  width: 26px; height: 4px;
  background: var(--color-primary);
  box-shadow: 0 0 6px rgba(59,130,246,0.4);
}
.round-nav-dash:hover .dash-line {
  background: var(--color-primary);
  width: 24px;
}

/* File panel */
.chat-main { position: relative; }
.file-panel {
  position: absolute; right: 0; top: 0; bottom: 0; width: 0; overflow: hidden;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border-left: 1px solid var(--glass-border);
  display: flex; flex-direction: column;
  transition: width 0.25s ease; z-index: 8;
}
.file-panel.open { width: 240px; }
.file-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; }
.file-panel-title { font-size: 13px; font-weight: 600; }
.file-panel-header-actions { display: flex; gap: 4px; }
.file-panel-search { padding: 8px 10px; flex-shrink: 0; }
.file-panel-list { flex: 1; overflow-y: auto; padding: 4px; }
.file-panel-list::-webkit-scrollbar { width: 5px; }
.file-panel-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
.file-panel-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: var(--radius-sm);
  cursor: pointer; transition: all 0.12s; position: relative;
}
.file-panel-item:hover { background: var(--glass-bg-hover); }
.file-panel-item.selected { background: rgba(59,130,246,0.08); }
.file-panel-item .file-item-delete { opacity: 0; transition: opacity 0.12s; }
.file-panel-item:hover .file-item-delete { opacity: 1; }
.file-item-icon { flex-shrink: 0; color: var(--color-text-secondary); }
.file-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.file-item-name { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-item-meta { font-size: 10px; color: var(--color-text-secondary); }

/* Welcome quick actions */
.welcome-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; width: 100%; max-width: 400px; }
.welcome-actions .el-button {
  justify-content: flex-start; padding: 10px 16px;
  border-radius: var(--radius-md); font-size: 13px; font-weight: 400;
  color: var(--color-text-secondary); background: var(--glass-bg); border: 1px solid var(--glass-border);
  animation: fadeInUp 0.5s ease backwards;
}
.welcome-actions .el-button:nth-child(1) { animation-delay: 0.1s; }
.welcome-actions .el-button:nth-child(2) { animation-delay: 0.2s; }
.welcome-actions .el-button:nth-child(3) { animation-delay: 0.3s; }
.welcome-actions .el-button:hover { color: var(--color-primary); background: rgba(124, 58, 237, 0.06); border-color: rgba(124, 58, 237, 0.2); }
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Tighter msg spacing */
.msg { margin-bottom: 16px; }

/* Hamburger button — hidden on desktop */
.hamburger-btn { display: none; }

/* ===== Mobile ===== */
@media (max-width: 767px) {
  .chat-page { flex-direction: column; }

  .hamburger-btn { display: inline-flex; }

  .sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 200;
    transform: translateX(-100%); width: 280px;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .chat-page.drawer-open .sidebar {
    transform: translateX(0);
    box-shadow: 0 0 30px rgba(0,0,0,0.2);
  }
  .drawer-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.3);
    z-index: 199; backdrop-filter: blur(2px);
  }

  .conv-toggle { display: none; }
  .chat-topbar {
    position: sticky; top: 0; z-index: 110;
    padding: 8px 10px; min-height: 42px;
  }
  /* input area lives above tab bar */
  .messages { padding: 8px 16px calc(140px + env(safe-area-inset-bottom, 0px)) 8px; }

  .input-area {
    position: sticky; bottom: 56px; z-index: 100;
    padding: 6px 8px 8px;
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--glass-border);
  }
  .input-box { border-radius: 12px; }
  .input-textarea :deep(.el-textarea__inner) { font-size: 15px; padding: 8px 8px; }
  .input-toolbar { padding: 4px 6px; gap: 4px; }
  .toolbar-agent { display: none; }
  .model-select { display: none; }
  .toolbar-mobile-selects { display: flex; align-items: center; gap: 3px; }
  .toolbar-icons { display: none; }
  .toolbar-more { display: flex; align-items: center; }
  .workspace-dir-label { display: none; }
  .toolbar-left .token-chip { display: none; }
  /* ensure toolbar buttons/icons stay visible on mobile */
  .input-toolbar .el-button { flex-shrink: 0; }
  .minimal-select { flex-shrink: 0; }

  /* fix: file panel → fixed bottom sheet (no scroll-trigger) */
  .file-panel {
    position: fixed !important; top: auto; bottom: 0; left: 0; right: 0;
    width: 100% !important; height: 50vh; z-index: 190;
    border-radius: 16px 16px 0 0;
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
  }
  .file-panel.open { transform: translateY(0); width: 100% !important; }

  .scroll-nav { right: 8px; bottom: calc(120px + env(safe-area-inset-bottom, 0px)); z-index: 210; }
  .round-nav { right: 2px; top: 44%; gap: 5px; z-index: 210; }
  .round-nav-dash { padding: 4px 6px 4px 8px; }
  .dash-line { width: 12px; height: 2px; }
  .round-nav-dash.active .dash-line { width: 18px; height: 3px; }
  .welcome-card h2 { font-size: 18px; }
  .welcome-actions { max-width: 100%; }
  .msg { margin-bottom: 10px; gap: 8px; }
  .msg-actions { opacity: 0.6; }
}

</style>

<style>
.minimal-popper .el-select-dropdown__item {
  height: auto; padding: 8px 14px; font-size: 13px;
}
.minimal-popper { border-radius: 10px; border: 1px solid var(--glass-border); }
.mount-dialog .el-dialog__body {
  max-height: 55vh;
  overflow-y: auto;
  padding-top: 8px;
}
.mount-dialog .el-dialog__body::-webkit-scrollbar { width: 5px; }
.mount-dialog .el-dialog__body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
</style>
