<template>
  <div class="messages" ref="messagesRef">
    <!-- 历史消息加载态（spec「统一空态与加载态」）：拉取既有会话历史期间在列表顶部渲染骨架，
         加载完成后随响应式自动替换为真实消息；新会话（无历史可载）不渲染。 -->
    <div v-if="historyLoading && !store.currentMessages.length" class="history-skeleton">
      <SkeletonList :rows="2" :row-height="44" />
    </div>
    <TaskPlanCard v-if="store.planSteps.length" class="chat-plan-card" />
    <!-- 8.1 日期分隔线：相邻轮次日期变化时渲染居中分隔；任一侧无时间戳则跳过该对 -->
    <template v-for="(round, ri) in messageRounds" :key="ri">
      <div v-if="dateDividerFor(ri)" class="msg-date-divider">
        <span class="msg-date-divider-line"></span>
        <span class="msg-date-divider-text">{{ dateDividerFor(ri) }}</span>
        <span class="msg-date-divider-line"></span>
      </div>
      <div class="round-group" :data-round="ri">
      <div
        v-if="round.user"
        class="msg msg-user"
        :class="{ 'is-actions-open': actionsShown(round.user.id) }"
        v-on="msgLongPressHandlers(round.user.id)"
      >
        <!-- 8.1 双头像身份：用户头像 = 角色名首字符（accent 底，样式见 chat.css .avatar-user） -->
        <div class="msg-avatar avatar-user">你</div>
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
              <div v-if="round.user.content" class="msg-content" v-html="renderMarkdown(round.user.content)" @click="handleContentClick" @dblclick="handleContentDblClick" @contextmenu="handleContentContextMenu"></div>
            </div>
            <div v-show="collapsedMessages[round.user.id]" class="msg-collapsed-placeholder">
              <span class="collapsed-line">{{ (round.user.content || '').replace(/\n/g, ' ').slice(0, 120) }}</span>
              <span class="collapsed-hint">点击展开</span>
            </div>
          </div>
          <div class="msg-actions" :class="{ 'is-open': actionsShown(round.user.id) }">
            <el-tooltip content="复制" placement="top"><el-button text size="small" circle @click="copyMsg(round.user)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
            <el-tooltip content="引用" placement="top"><el-button text size="small" circle @click="quoteMsg(round.user)"><el-icon><Link /></el-icon></el-button></el-tooltip>
            <el-tooltip content="编辑" placement="top"><el-button text size="small" circle @click="editMsg(round.user)"><el-icon><EditPen /></el-icon></el-button></el-tooltip>
            <el-tooltip content="蒸馏为 Skill" placement="top"><el-button text size="small" circle @click="distillUserMsg(round.user)"><el-icon><Files /></el-icon></el-button></el-tooltip>
            <el-tooltip content="删除" placement="top"><el-button text size="small" circle @click="delMsg(round.user)"><el-icon><Delete /></el-icon></el-button></el-tooltip>
            <el-tooltip content="查看提示词" placement="top"><el-button text size="small" circle @click="openSnapshotDialog(round.user)"><el-icon><View /></el-icon></el-button></el-tooltip>
          </div>
        </div>
      </div>

      <!-- 上下文压缩标记（2026-10-02）：压缩是**有损**的（前文被摘要替换），不该完全隐形 -->
      <div
        v-for="(cm, ci) in (round.compactMarkers || [])"
        :key="'compact-' + ri + '-' + ci"
        class="compact-marker"
      >
        <span class="compact-marker-line"></span>
        <span class="compact-marker-text">
          已压缩历史上下文 · {{ cm.coveredCount }} 条 → 摘要（当前 {{ cm.keptCount }} 条）
        </span>
        <span class="compact-marker-line"></span>
      </div>

      <div v-if="round.finalAssistant || round.steps.length > 0 || isLastRoundStreaming(round, ri)" class="msg msg-assistant" :class="{ 'is-actions-open': actionsShown(round.finalAssistant?.id || '') }" v-on="msgLongPressHandlers(round.finalAssistant?.id || '')">
        <!-- 8.1 双头像身份：AI 头像 = 当前智能体名首字符（无则 🤖），桌面端显示（窄栏由 CSS 收起） -->
        <div class="msg-avatar avatar-assistant" :class="{ streaming: isLastRoundStreaming(round, ri) }">{{ assistantAvatarChar }}</div>
        <div class="msg-body">
          <div class="agent-response-card" :class="{ 'msg-collapsed': collapsedMessages[round.finalAssistant?.id || ''] }" @click="collapsedMessages[round.finalAssistant?.id || ''] ? toggleMsgCollapse(round.finalAssistant?.id || '') : null">
            <div v-show="collapsedMessages[round.finalAssistant?.id || '']" class="msg-collapsed-placeholder">
              <span class="collapsed-line">{{ (round.finalAssistant?.content || '').replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]/g, '').split('@@REASON@@')[0].replace(/\n/g, ' ').trim().slice(0, 120) }}</span>
              <span class="collapsed-hint">点击展开</span>
            </div>
            <div v-show="!collapsedMessages[round.finalAssistant?.id || '']">
              <div v-if="round.hasAgentProcess" class="agent-process-header" @click="toggleAgentProcess('round-' + ri)">
                <el-icon :size="14" class="agent-process-icon">
                  <CaretRight v-if="!isProcessOpen(round, ri)" />
                  <CaretBottom v-else />
                </el-icon>
                <span>智能体思考过程</span>
                <span class="agent-process-stats">({{ round.agentStats?.reasoningCount || 0 }} 次推理，{{ round.agentStats?.toolCallCount || 0 }} 个工具调用)</span>
                <el-icon :size="12" class="agent-process-chevron">
                  <ArrowDown v-if="isProcessOpen(round, ri)" />
                  <ArrowRight v-else />
                </el-icon>
              </div>
              <div v-if="round.hasAgentProcess" v-show="isProcessOpen(round, ri)" class="agent-process-steps">
                <div v-for="(step, si) in round.steps" :key="'agent-step-' + ri + '-' + si" class="agent-step">
                  <div v-if="step.reasoningContent" class="msg-reasoning">
                    <div class="reasoning-header" @click="toggleReasoning('agent-step-' + ri + '-' + si)">
                      <el-icon><CaretRight v-if="!expandedReasoning['agent-step-' + ri + '-' + si]" /><CaretBottom v-else /></el-icon>
                      <span>推理 {{ si + 1 }}</span>
                    </div>
                    <div v-show="expandedReasoning['agent-step-' + ri + '-' + si]" class="reasoning-body">{{ step.reasoningContent }}</div>
                  </div>
                  <div v-if="step.partialContent" class="agent-step-partial" v-html="renderMarkdown(step.partialContent)" @click="handleContentClick"></div>
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
                            <span v-if="toolTargetHint(tc)" class="tool-item-target" :title="toolTargetHint(tc)">{{ toolTargetHint(tc) }}</span>
                          </div>
                          <el-icon :size="12" class="tool-item-chevron">
                            <ArrowDown v-if="isToolItemOpen(tc.id, 'agent-step-' + ri + '-' + si + '-' + idx)" />
                            <ArrowRight v-else />
                          </el-icon>
                        </div>
                        <!-- 截图类工具（computer_screenshot 等）：流式期间在工具卡片下内嵌展示画面，任务结束自动移除 -->
                        <div v-if="isRoundLive(round, ri) && resolveScreenshotUrl(getStepToolResult(step, tc.id))" class="tool-item-shot">
                          <img :src="resolveScreenshotUrl(getStepToolResult(step, tc.id)) || ''" alt="屏幕截图" />
                          <span class="tool-item-shot-note">截图预览 · 仅流式期间展示，结束后自动清理</span>
                        </div>
                        <!-- 本条调用产出的图片 / 视频：贴在工具卡片上（折叠体之外）—— 展开状态无关，收起也能看到。
                             展开体里再放一份会重复，故只此一处；hover 浮层放大、双击进灯箱、右键取用。 -->
                        <ToolMediaPreview v-if="toolMedia(getStepToolResult(step, tc.id))" :media="toolMedia(getStepToolResult(step, tc.id))!" class="tool-item-media-inline" />
                        <div v-show="isToolItemOpen(tc.id, 'agent-step-' + ri + '-' + si + '-' + idx)" class="tool-item-body">
                          <div class="tool-item-section">
                            <div class="tool-item-label">参数</div>
                            <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                          </div>
                          <div v-if="getStepToolResult(step, tc.id)" class="tool-item-section">
                            <div class="tool-item-label">结果</div>
                            <pre v-if="resolveToolDisplay(tc).tool !== 'call_agent'" class="tool-item-json" :class="{ 'tool-item-json-error': isStepToolError(step, tc.id) }">{{ getStepToolResult(step, tc.id) }}</pre>
                            <div v-else class="tool-item-note">子智能体已完成，最终结果见下方卡片正文</div>
                          </div>
                          <div v-if="detectPath(getStepToolResult(step, tc.id))" class="tool-item-section">
                            <el-button size="small" @click="openPath(detectPath(getStepToolResult(step, tc.id))!)">浏览文件</el-button>
                          </div>
                          <!-- 文件改动内联 diff 卡：聊天流内直接 review（接受/回退），不用切工作台 -->
                          <ChatFileChangeCard
                            v-if="fileChangePathOf(resolveToolDisplay(tc).tool, getStepToolResult(step, tc.id))"
                            :path="fileChangePathOf(resolveToolDisplay(tc).tool, getStepToolResult(step, tc.id))!"
                            :conversation-id="store.currentConvId || ''"
                          />
                          <SubAgentRoundView
                            v-if="resolveToolDisplay(tc).tool === 'call_agent' && step.subAgentRounds?.find(r => r.toolCallId === tc.id)"
                            :round="step.subAgentRounds!.find(r => r.toolCallId === tc.id)!"
                            :id-prefix="'sub-' + ri + '-' + si + '-' + idx"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
                    <div v-show="!expandedToolGroups['round-' + ri]" class="tool-group-body" style="margin-top:6px;border-top:1px dashed color-mix(in srgb, var(--color-primary) 12%, transparent);padding-top:6px">
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
                            <span v-if="toolTargetHint(tc)" class="tool-item-target" :title="toolTargetHint(tc)">{{ toolTargetHint(tc) }}</span>
                          </div>
                          <el-icon :size="12" class="tool-item-chevron">
                            <ArrowDown v-if="expandedTools['round-' + ri + '-' + idx]" />
                            <ArrowRight v-else />
                          </el-icon>
                        </div>
                        <!-- 本条调用产出的图片 / 视频：贴在工具卡片上（折叠体之外）—— 展开状态无关，收起也能看到 -->
                          <ToolMediaPreview v-if="toolMedia(getToolResult(tc.id))" :media="toolMedia(getToolResult(tc.id))!" class="tool-item-media-inline" />
                          <div v-show="expandedTools['round-' + ri + '-' + idx]" class="tool-item-body">
                          <div class="tool-item-section">
                            <div class="tool-item-label">参数</div>
                            <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                          </div>
                          <div v-if="getToolResult(tc.id)" class="tool-item-section">
                            <div class="tool-item-label">结果</div>
                            <pre class="tool-item-json" :class="{ 'tool-item-json-error': isToolError(tc.id) }">{{ getToolResult(tc.id) }}</pre>
                          </div>
                          <div v-if="detectPath(getToolResult(tc.id))" class="tool-item-section">
                            <el-button size="small" @click="openPath(detectPath(getToolResult(tc.id))!)">浏览文件</el-button>
                          </div>
                          <ChatFileChangeCard
                            v-if="fileChangePathOf(resolveToolDisplay(tc).tool, getToolResult(tc.id))"
                            :path="fileChangePathOf(resolveToolDisplay(tc).tool, getToolResult(tc.id))!"
                            :conversation-id="store.currentConvId || ''"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="agent-response-body">
                <template v-if="round.subAgentResults?.length">
                  <div v-for="(sr, sri) in round.subAgentResults" :key="'sar-' + ri + '-' + sri" class="sub-agent-result" :data-card-variant="(ri + sri) % 4">
                    <div class="sub-agent-result-head" @click="toggleSubAgentResult('sar-' + ri + '-' + sri)">
                      <el-icon :size="13" class="sub-agent-result-icon"><ChatDotRound /></el-icon>
                      <span class="sub-agent-result-name">{{ sr.subAgentName }}</span>
                      <span class="sub-agent-result-tag">结果</span>
                      <span class="sub-agent-result-actions" @click.stop>
                        <el-tooltip content="复制 Markdown" placement="top"><el-button text size="small" circle @click="copySubAgentResultMd(sr)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
                        <el-tooltip content="下载为 .md 文件" placement="top"><el-button text size="small" circle @click="downloadSubAgentResultMd(sr, sri)"><el-icon><Download /></el-icon></el-button></el-tooltip>
                      </span>
                      <el-icon :size="12" class="sub-agent-result-chevron"><ArrowDown v-if="!collapsedSubAgentResults['sar-' + ri + '-' + sri]" /><ArrowRight v-else /></el-icon>
                    </div>
                    <div v-show="!collapsedSubAgentResults['sar-' + ri + '-' + sri]" class="sub-agent-result-content" v-html="renderMarkdown(sr.finalContent)" @click="handleContentClick" @dblclick="handleContentDblClick" @contextmenu="handleContentContextMenu"></div>
                  </div>
                </template>
                <div v-if="hasMainResult(round, ri)" class="main-agent-result" :data-card-variant="ri % 4">
                  <div class="main-agent-result-head" @click="toggleMainResult('mar-' + ri)">
                    <el-icon :size="13" class="main-agent-result-icon"><ChatDotRound /></el-icon>
                    <span class="main-agent-result-name">任务结果</span>
                    <span class="main-agent-result-tag">主智能体</span>
                    <span class="main-agent-result-actions" @click.stop>
                      <el-tooltip content="复制 Markdown" placement="top"><el-button text size="small" circle @click="copyAssistantMd(round)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
                      <el-tooltip content="下载为 .md 文件" placement="top"><el-button text size="small" circle @click="downloadAssistantMd(round)"><el-icon><Download /></el-icon></el-button></el-tooltip>
                      <el-tooltip content="导出 Word" placement="top"><el-button text size="small" circle @click="exportAssistantDocx(round)"><el-icon><Document /></el-icon></el-button></el-tooltip>
                    </span>
                    <el-icon :size="12" class="main-agent-result-chevron"><ArrowDown v-if="!collapsedMainResults['mar-' + ri]" /><ArrowRight v-else /></el-icon>
                  </div>
                  <div v-show="!collapsedMainResults['mar-' + ri]" class="main-agent-result-content">
                    <div v-if="round.finalAssistant?.reasoningContent && !round.hasAgentProcess" class="msg-reasoning" :data-card-variant="(ri + 1) % 4">
                      <div class="reasoning-header" @click="toggleReasoning('agent-fa-' + ri)">
                        <el-icon><CaretRight v-if="!expandedReasoning['agent-fa-' + ri]" /><CaretBottom v-else /></el-icon>
                        <span>思考过程</span>
                      </div>
                      <div v-show="expandedReasoning['agent-fa-' + ri]" class="reasoning-body">{{ round.finalAssistant.reasoningContent }}</div>
                    </div>
                    <template v-if="round.finalAssistant?.content">
                      <div class="msg-content" v-html="renderAssistantMarkdown(round.finalAssistant.content)" @click="handleContentClick" @dblclick="handleContentDblClick" @contextmenu="handleContentContextMenu"></div>
                      <PlatformConfigCard
                        v-if="parseConfigCard(round.finalAssistant.content)"
                        :mode="parseConfigCard(round.finalAssistant.content)!.mode"
                        :platform="getEditPlatform(round.finalAssistant.content)"
                        :reason="getEditReason(round.finalAssistant.content)"
                        class="msg-config-card"
                        @saved="onConfigSaved"
                      />
                      <!-- 动态看板（数据浏览）：模型 data_query_view 产契约后内嵌到当前助手消息，嵌套在聊天流程里 -->
                      <div
                        v-if="round.finalAssistant?.dataView"
                        class="msg-inline-dataview"
                      >
                        <div class="dataview-title">
                          <el-icon><Grid /></el-icon>
                          <span>{{ round.finalAssistant.dataView.title || '数据明细' }}</span>
                          <span class="dataview-tag">可交互数据看板</span>
                        </div>
                        <DataQueryWorkbench :key="round.finalAssistant.id + '-dv'" :contract="round.finalAssistant.dataView" />
                      </div>
                    </template>
                    <template v-else-if="isLastRoundStreaming(round, ri)">
                      <!-- 有实时正文：跑马灯式流式显示 + 末尾闪烁光标 -->
                      <div v-if="getStreamingText(round, ri)" class="msg-content streaming-content" v-html="renderStreamingContent(getStreamingText(round, ri))" @click="handleContentClick" @dblclick="handleContentDblClick" @contextmenu="handleContentContextMenu"></div>
                      <!-- 有思考但无正文：显示正在思考 + 实时思考内容 -->
                      <div v-else-if="getStreamingReasoning(round, ri)" class="msg-reasoning streaming-reasoning">
                        <div class="reasoning-header"><span>正在思考…</span></div>
                        <div class="reasoning-body">{{ getStreamingReasoning(round, ri) }}</div>
                      </div>
                      <!-- 刚开始无任何内容：三点初始态 -->
                      <div v-else class="msg-content streaming">
                        <span class="typing-dots" aria-label="正在输入"><span></span><span></span><span></span></span>
                      </div>
                    </template>
                  </div>
                </div>
                <!-- 交付目录产物卡片：挂在整轮消息最末尾（思考过程/工具组折叠与否都不藏）。
                     生图/生视频由服务端直接落交付目录并登记，这里按消息 id 命中展示。
                     放在整轮末尾（而非原「任务结果」卡片正文内）——正文为空时也要能看到交付物。 -->
                <DeliverableFileCard
                  v-if="getRoundDeliverableFiles(round).length"
                  :files="getRoundDeliverableFiles(round)"
                  class="msg-deliverable-card"
                />
              </div>

            </div>
          </div>


          <div class="msg-actions msg-actions-assistant" :class="{ 'is-open': actionsShown(round.finalAssistant?.id || '') }">
            <el-tooltip content="复制 Markdown" placement="top"><el-button text size="small" circle @click="copyAssistantMd(round)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
            <el-tooltip content="下载为 .md 文件" placement="top"><el-button text size="small" circle @click="downloadAssistantMd(round)"><el-icon><Download /></el-icon></el-button></el-tooltip>
            <el-tooltip content="导出 Word" placement="top"><el-button text size="small" circle @click="exportAssistantDocx(round)"><el-icon><Document /></el-icon></el-button></el-tooltip>
            <el-tooltip content="引用" placement="top"><el-button text size="small" circle @click="quoteMsg(round.finalAssistant!)"><el-icon><Link /></el-icon></el-button></el-tooltip>
            <el-tooltip content="重新生成" placement="top"><el-button text size="small" circle :disabled="store.streaming" @click="regenerateMsg"><el-icon><Refresh /></el-icon></el-button></el-tooltip>
            <el-tooltip content="蒸馏为 Skill" placement="top"><el-button text size="small" circle @click="distillAssistantMsg(round)"><el-icon><Files /></el-icon></el-button></el-tooltip>
            <el-tooltip content="删除" placement="top"><el-button text size="small" circle @click="delMsg(round.finalAssistant!)"><el-icon><Delete /></el-icon></el-button></el-tooltip>
            <el-tooltip content="折叠" placement="top"><el-button text size="small" circle @click.stop="toggleMsgCollapse(round.finalAssistant!.id)"><el-icon><Fold /></el-icon></el-button></el-tooltip>
          </div>
        </div>
      </div>
      </div>
    </template>

    <!-- 工作流模式专属空态：办公模式的场景轮播欢迎卡是「白底大卡 + 三张场景卡」，
         塞进工作流模式 352px 的对话窄栏会又白又挤（深色主题下尤其刺眼）。
         这里给一份窄栏友好的极简引导，与「开发模式专属空态」同一思路。 -->
    <div v-if="isWorkflowMode && store.currentMessages.length === 0 && !store.streaming && !historyLoading" class="wf-welcome">
      <div class="wf-welcome-avatar"><el-icon :size="22"><Connection /></el-icon></div>
      <div class="wf-welcome-title">工作流助手</div>
      <div class="wf-welcome-sub">左侧选一个工作流直接运行；<br>或在这里说需求，我帮你调已挂载的工作流。</div>
      <div class="wf-welcome-tips">
        <div class="wf-welcome-tip" v-for="t in WF_TIPS" :key="t" @click="applyWfTip(t)">
          <el-icon :size="12"><ChatLineSquare /></el-icon>
          <span>{{ t }}</span>
        </div>
      </div>
      <div class="wf-welcome-foot">提示：点上方「可用工作流」勾选几个，我就能用 wf_&lt;id&gt; 工具调用它们</div>
    </div>

    <ChatWelcome v-if="!isCodeMode && !isWorkflowMode && store.currentMessages.length === 0 && !store.streaming && !historyLoading" />
    <div v-if="isCodeMode && store.currentMessages.length === 0 && !store.streaming && !historyLoading" class="code-welcome">
      <div class="code-welcome-greeting">
        <div class="code-welcome-avatar"><el-icon :size="24"><Monitor /></el-icon></div>
        <h2 class="code-welcome-title">代码任务</h2>
        <p class="code-welcome-sub">选择一个任务模板，或直接在下方输入你的需求</p>
      </div>
      <SceneCarousel
        :scenes="DEV_TPLS"
        :active-key="devTplKey"
        :agent-label="devAgentLabel"
        dense
        @pick="pickDevTpl"
        @example="applyDevExample"
      />
    </div>

    <!-- 未配置/未选择模型：不再用老欢迎卡占位（原型里场景轮播与模型选择无关、始终可见），
         只给一条顶部紧凑提示 + 配置入口，场景卡与示例照常可用。 -->
    <div
      v-if="store.currentMessages.length === 0 && !store.streaming && !selectedModelId && !historyLoading"
      class="no-model-hint"
    >
      <el-icon :size="14"><WarningFilled /></el-icon>
      <span class="no-model-hint-text">{{ platformStore.platforms.length === 0 ? '尚未配置模型平台' : '尚未选择模型，发送前请先选择' }}</span>
      <button type="button" class="no-model-hint-btn" @click="openPlatformConfig">配置模型</button>
    </div>
  </div>

  <!-- ask_user 内联表单（消息流末尾独立渲染，不受横岗 hover 与轮次数控制） -->
  <div v-if="store.pendingQuestion" class="inline-ask-card">
    <div class="inline-ask-icon"><el-icon><ChatDotRound /></el-icon></div>
    <div class="inline-ask-body">
      <div class="inline-ask-question">{{ store.pendingQuestion.question }}</div>
      <div v-if="askMultiSelect" class="inline-ask-options">
        <el-checkbox v-for="(opt, i) in store.pendingQuestion.options" :key="i" v-model="askChecked[i]">{{ opt }}</el-checkbox>
      </div>
      <div v-else-if="store.pendingQuestion.options?.length" class="inline-ask-options">
        <button v-for="(opt, i) in store.pendingQuestion.options" :key="i" type="button" class="inline-ask-opt" :class="{ 'is-active': askSingle === opt }" @click="askSingle = opt">{{ opt }}</button>
        <button type="button" class="inline-ask-opt inline-ask-opt-text" :class="{ 'is-active': askShowText }" @click="askShowText = true">其他（文字输入）</button>
      </div>
      <el-input v-if="!store.pendingQuestion.options?.length || askShowText" v-model="askText" type="textarea" :rows="3" placeholder="输入你的回答..." @keyup.ctrl.enter="onAskSubmit" />
      <button v-if="store.pendingQuestion.allowSupplement !== false && !askSupplementOpen" type="button" class="inline-ask-toggle" @click="askSupplementOpen = true">+ 补充说明</button>
      <el-input v-if="store.pendingQuestion.allowSupplement !== false && askSupplementOpen" v-model="askSupplement" type="textarea" :rows="2" placeholder="补充说明（可选）" class="inline-ask-supplement" @keyup.ctrl.enter="onAskSubmit" />
      <div class="inline-ask-actions">
        <el-button size="small" @click="onAskSkip">跳过</el-button>
        <el-button size="small" type="primary" @click="onAskSubmit">提交</el-button>
      </div>
    </div>
  </div>

  <!-- 越界访问授权卡（服务端 path-guard 判定越界后下发；用户点头才放行） -->
  <div v-if="store.pendingPathAuth" class="inline-ask-card inline-auth-card">
    <div class="inline-ask-icon inline-auth-icon"><el-icon><Lock /></el-icon></div>
    <div class="inline-ask-body">
      <div class="inline-ask-question" :style="store.pendingPathAuth.dangerWhy ? 'color:#e5484d' : ''">
        {{ store.pendingPathAuth.dangerWhy
          ? `危险命令：${store.pendingPathAuth.dangerWhy}`
          : authIsCommand ? '该命令需要你授权执行' : '需要你授权访问工作目录外的位置' }}
      </div>
      <div class="inline-ask-desc">
        工具 <code>{{ store.pendingPathAuth.toolName }}</code>
        <template v-if="store.pendingPathAuth.workspaceDir">
          · 当前工作目录 <code>{{ store.pendingPathAuth.workspaceDir }}</code>
        </template>
      </div>
      <div class="inline-auth-list">
        <div v-for="(it, i) in store.pendingPathAuth.items" :key="i" class="inline-auth-item">
          <span class="inline-auth-tag" :class="`is-${it.action}`">
            {{ it.action === 'write' ? '写入' : '读取' }}
          </span>
          <span class="inline-auth-path" :title="it.absPath || it.rawPath">{{ it.rawPath }}</span>
        </div>
      </div>
      <div class="inline-ask-actions">
        <el-button size="small" @click="store.submitPendingPathAuth('deny')">拒绝</el-button>
        <el-button size="small" type="primary" @click="store.submitPendingPathAuth('once')">
          {{ store.pendingPathAuth.dangerWhy ? '我已确认，仅此次执行' : '仅此次允许' }}
        </el-button>
        <!-- 危险命令不给"记住本会话"：不可逆动作每次单独点头 -->
        <el-button
          v-if="!store.pendingPathAuth.dangerWhy"
          size="small"
          @click="store.submitPendingPathAuth('dir')"
        >
          {{ authIsCommand ? '允许命令（本会话）' : '允许该目录（本会话）' }}
        </el-button>
      </div>
    </div>
  </div>

  <!-- confirm_user 内联表单（多页确认向导，独立渲染） -->
  <div v-if="store.pendingConfirmation && confirmCurrentPage" class="inline-ask-card">
    <div class="inline-ask-icon"><el-icon><ChatDotRound /></el-icon></div>
    <div class="inline-ask-body">
      <div class="inline-ask-step">第 {{ store.pendingConfirmation.index + 1 }} / {{ store.pendingConfirmation.pages.length }} 页</div>
      <div class="inline-ask-question">{{ confirmCurrentPage.question }}</div>
      <div v-if="confirmCurrentPage.description" class="inline-ask-desc">{{ confirmCurrentPage.description }}</div>
      <div v-if="confirmMultiSelect" class="inline-ask-options">
        <el-checkbox v-for="(opt, i) in confirmCurrentPage.options" :key="i" v-model="confirmChecked[i]">{{ opt }}</el-checkbox>
      </div>
      <div v-else-if="confirmCurrentPage.options?.length" class="inline-ask-options">
        <button v-for="(opt, i) in confirmCurrentPage.options" :key="i" type="button" class="inline-ask-opt" :class="{ 'is-active': confirmSingle === opt }" @click="confirmSingle = opt">{{ opt }}</button>
        <button v-if="confirmCurrentPage.allowText !== false" type="button" class="inline-ask-opt inline-ask-opt-text" :class="{ 'is-active': confirmShowText }" @click="confirmShowText = true">其他（文字输入）</button>
      </div>
      <el-input v-if="confirmCurrentPage.allowText !== false && (!confirmCurrentPage.options?.length || confirmMultiSelect || confirmShowText)" v-model="confirmText" type="textarea" :rows="3" placeholder="输入你的回答..." />
      <button v-if="confirmCurrentPage.allowSupplement !== false && !confirmSupplementOpen" type="button" class="inline-ask-toggle" @click="confirmSupplementOpen = true">+ 补充说明</button>
      <el-input v-if="confirmCurrentPage.allowSupplement !== false && confirmSupplementOpen" v-model="confirmSupplement" type="textarea" :rows="2" placeholder="补充说明（可选）" class="inline-ask-supplement" />
      <div class="inline-ask-actions">
        <el-button size="small" @click="onConfirmSkip">跳过</el-button>
        <el-button size="small" type="primary" @click="onConfirmNext">
          {{ store.pendingConfirmation.index < store.pendingConfirmation.pages.length - 1 ? '下一页' : '完成' }}
        </el-button>
      </div>
    </div>
  </div>

  <div
    v-if="userRoundIndices.length > 1"
    class="round-nav"
    ref="roundNavRef"
    @mouseenter="onNavEnter"
    @mousemove="onNavMove"
    @mouseleave="onNavLeave"
  >
    <div
      v-for="d in dashCount"
      :key="d"
      class="round-nav-dash"
      @click="onDashClick(d - 1)"
    >
      <span class="dash-line" :style="dashStyle(d - 1)" />
    </div>
  </div>
  <div
    v-if="navListVisible"
    class="round-nav-list"
    ref="navListRef"
    @mouseenter="onListEnter"
    @mouseleave="onNavLeave"
  >

    <div class="round-nav-list-items">
      <div
        v-for="(ri, idx) in userRoundIndices"
        :key="ri"
        class="round-nav-list-item"
        :class="{ active: ri === activeNavRound }"
        @click="scrollToRound(ri)"
      >
        <span class="round-nav-list-idx">{{ idx + 1 }}</span>
        <span class="round-nav-list-text">{{ getRoundText(ri) }}</span>
      </div>
    </div>


    <transition name="scroll-fab">
      <button v-if="showScrollTop" class="scroll-fab scroll-fab-top" @click="messagesRef!.scrollTop = 0" aria-label="滚动到顶部">
        <el-icon><ArrowUp /></el-icon>
      </button>
    </transition>
    <transition name="scroll-fab">
      <button v-if="showScrollBottom" class="scroll-fab scroll-fab-bottom" @click="scrollToBottom" aria-label="滚动到底部">
        <el-icon><ArrowDown /></el-icon>
      </button>
    </transition>
  </div>

  <!-- 媒体放大灯箱 + 右键菜单 + hover 浮层（Teleport 到 body，全聊天区共用一个实例）。
       必须挂在模板根节点：之前落在横岗列表（v-if="navListVisible"）里，
       只有鼠标划过右侧横岗时组件才存在 —— hover 浮层与右键菜单平时根本没挂载，点了没反应。 -->
  <MediaViewer />
  <MediaContextMenu />
  <MediaHoverFloat />
</template>

<script setup lang="ts">
import {
  ChatDotRound, CaretRight, CaretBottom, ArrowDown, ArrowRight, ArrowUp, Loading, CircleCheck,
  CircleClose, CopyDocument, EditPen, Files, Delete, View, Fold, Refresh, Link, Download,
  Grid, Document, Connection, ChatLineSquare, Lock, WarningFilled,
} from '@element-plus/icons-vue';
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { useChat } from '../../composables/chat/useChat';
import { useMobileShell } from '../../composables/useMobileShell';
import { bindLongPress } from '../../composables/useLongPress';
import type { MessageRound } from '../../composables/chat/useChat';
import SkeletonList from '../common/SkeletonList.vue';
import { useCodeStore } from '../../stores/code';
import { activeMode } from '../../stores/mode';
import TaskPlanCard from '../TaskPlanCard.vue';
import PlatformConfigCard from '../PlatformConfigCard.vue';
import SubAgentRoundView from './SubAgentRoundView.vue';
import DeliverableFileCard from './DeliverableFileCard.vue';
import DataQueryWorkbench from './DataQueryWorkbench.vue';
import ChatWelcome from './ChatWelcome.vue';
import SceneCarousel from './SceneCarousel.vue';
import { DEV_TPLS } from '../../config/devTpls';
import MediaViewer from '../media/MediaViewer.vue';
import MediaContextMenu from '../media/MediaContextMenu.vue';
import MediaHoverFloat from '../media/MediaHoverFloat.vue';
import ToolMediaPreview from './ToolMediaPreview.vue';
import ChatFileChangeCard from './ChatFileChangeCard.vue';
import { exportMarkdownDocx, absoluteMediaSrc, mediaOfTool, type MediaTarget } from '../../composables/useMediaPreview';

const {
  store, platformStore, fileStore, messagesRef, messageRounds, formatTime, collapsedMessages, toggleMsgCollapse,
  renderMarkdown, handleContentClick, handleContentDblClick, handleContentContextMenu,
  copyMsg, editMsg, quoteMsg, distillUserMsg, delMsg,
  openSnapshotDialog, isLastRoundStreaming, getStreamingStep, parseConfigCard, getEditPlatform,
  getEditReason, onConfigSaved, expandedReasoning, toggleReasoning, expandedAgentProcess,
  toggleAgentProcess, expandedStepTools, toggleStepTools, getStepToolGroupClass, isStepToolsRunning,
  isStepToolsError, toggleTool, getStepToolStatusClass, getStepToolResult, isStepToolError, resolveToolDisplay,
  resolveToolArgs, toolTargetHint, expandedTools, toggleToolGroup, getToolGroupStatusClass, isToolGroupRunning,
  isToolGroupError, expandedToolGroups, getToolStatusClass, getToolResult, isToolError, distillAssistantMsg, regenerateMsg,
  isToolItemOpen, collapsedSubAgentResults, toggleSubAgentResult, collapsedMainResults, toggleMainResult,
  copySubAgentResultMd, downloadSubAgentResultMd, copyAssistantMd, downloadAssistantMd,
  selectedModelId, input, openPlatformConfig, agentStore, skillStore, mountedSkillIds, onAgentSwitch,
  openPath,
  userRoundIndices, activeNavRound, scrollToRound,
  showScrollBottom, showScrollTop, scrollToBottom, historyLoading,
  askMultiSelect, askChecked, askSingle, askShowText, askText, askSupplement, onAskSubmit, onAskSkip,
  confirmCurrentPage, confirmMultiSelect, confirmChecked, confirmSingle, confirmShowText,
  confirmText, confirmSupplement, onConfirmSkip, onConfirmNext,
} = useChat();
const isCodeMode = useCodeStore().codeModeActive;
const askSupplementOpen = ref(false);
/** 越界授权卡：命令类工具（cmd_exec/python_exec）的文案与按钮不同（展示整条命令而非路径） */
const authIsCommand = computed(() => !!store.pendingPathAuth?.isCommand);
/** 触屏壳（视口窄 或 Capacitor）：长按操作排只在这一壳生效（与衔接文案同一口径） */
const isTouchShell = useMobileShell();

// ===== 8.1 消息流重设计：日期分隔线 + 双头像身份 =====
// 纯渲染层推导（不碰 useChat 数据逻辑）：分轮以 user 消息为锚，取 user.createdAt 比较日期。
// 「无时间戳就跳过该消息对」：任一轮缺时间戳（合成的 finalAssistant 是 createdAt:0）→ 不渲染分隔。

/** 相邻两轮是否同一天 */
function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** 时间戳 → 分隔线文案：今天 / 昨天 / （跨年含年份）M月D日 */
function formatDayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startToday) return '今天';
  if (ts >= startToday - 86400000) return '昨天';
  const y = d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '年' : '';
  return `${y}${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 第 ri 轮前是否渲染日期分隔线，返回文案（空串 = 不渲染）。
 * 首轮有锚时间戳 → 直接渲染（会话起点也标日期）；其后仅在与上一轮（有时间戳）跨天时渲染。
 */
function dateDividerFor(ri: number): string {
  const rounds = messageRounds.value;
  const ts = rounds[ri]?.user?.createdAt || 0;
  if (!ts) return '';
  if (ri > 0) {
    const prevTs = rounds[ri - 1]?.user?.createdAt || 0;
    if (!prevTs || sameDay(prevTs, ts)) return '';
  }
  return formatDayLabel(ts);
}

/** AI 头像字符：当前智能体名首字符（按码点切，兼容 emoji 名），无名字回落 🤖 */
const assistantAvatarChar = computed(() => {
  const name = (agentStore.selectedAgent?.name || '').trim();
  return Array.from(name)[0] || '🤖';
});

// ===== 移动端：长按消息露出那条操作排 =====
//
// ★★★ 为什么需要（2026-09-26 用户反馈「移动端长按功能没有实现，问题和模型响应下面那排按钮
//   应该是长按后出现」）：
//   `.msg-actions`（复制/引用/编辑/删除/查看提示词…）此前只有 `:hover` 一个显隐来源
//   （chat.css `.msg:hover .msg-actions { opacity: 1 }`）——**hover 是鼠标专属**。
//   移动端媒体查询里只把它改成常显 `opacity: .6`，于是手机上永远挂着一排按钮：
//   既不是"长按出现"，也占掉了本来就紧张的行宽。桌面端行为不动（仍走 hover）。
//
// 交互约定（用户 2026-09-26 拍板）：长按某条消息 → 只显示**那一条**的操作排；
//   点别处 / 再长按同一条 → 收起。桌面端不受影响（bindLongPress 只认 pointerType === 'touch'）。
const openActionsMsgId = ref<string>('');

/**
 * 长按某条消息：切换该条操作排的显隐（再长按同一条＝收起）
 *
 * ★ 记录触发时刻：长按（pointerdown 按住 500ms）触发后，浏览器/触屏**仍会补派发一次
 *   click**（部分机型如此），而 `document` 捕获阶段的关闭监听比 `.msg` 上的吞 click
 *   **先执行** → 操作排刚出现就被立刻收掉。用时间窗挡住紧随的那一次。
 */
let actionsOpenedAt = 0;
function onMsgLongPress(msgId: string) {
  const next = openActionsMsgId.value === msgId ? '' : msgId;
  openActionsMsgId.value = next;
  actionsOpenedAt = Date.now();
}

/** 关闭监听要忽略的两种情况：① 刚因长按打开（挡紧随的 click）；② 点击落在该条消息上 */
const CLOSE_GRACE_MS = 800;
function shouldIgnoreClose(e: Event, el: HTMLElement | null): boolean {
  if (!openActionsMsgId.value) return true;
  if (Date.now() - actionsOpenedAt < CLOSE_GRACE_MS) return true;   // ①
  if (el?.closest?.('.msg-actions')) return true;                    // 点的是操作排本身
  if (el?.closest?.('.msg.is-actions-open')) return true;            // ② 点的是已展开的那条
  return false;
}

/**
 * 消息 id → 长按处理器。**必须记忆化**：
 * 模板里 `v-on="msgLongPressHandlers(id)"` 每次重渲染都会求值，
 * 而流式期间消息列表每来一个 chunk 就重渲染一次 —— 不复用就会反复新建处理器
 * （每个都往组件实例上挂一个 onBeforeUnmount 钩子）→ 钩子无界增长。
 * 消息条数是有限的，按 id 复用即可，条目随会话切换由 cleanup 统一释放。
 */
const longPressCache = new Map<string, Record<string, unknown>>();
function msgLongPressHandlers(msgId: string) {
  if (!msgId) return {};
  const hit = longPressCache.get(msgId);
  if (hit) return hit;
  const handlers = bindLongPress(() => onMsgLongPress(msgId));
  longPressCache.set(msgId, handlers);
  return handlers;
}

/** 该条消息的操作排是否展示：触屏壳走长按态，桌面壳恒为 false（交给 CSS 的 hover） */
function actionsShown(msgId: string): boolean {
  return isTouchShell.value && !!msgId && openActionsMsgId.value === msgId;
}

// 点别处收起：捕获阶段监听，避免被消息内容的点击处理吞掉
function onDocClickCloseActions(e: MouseEvent) {
  const el = e.target as HTMLElement | null;
  if (shouldIgnoreClose(e, el)) return;
  openActionsMsgId.value = '';
}

/** 触屏：手指按在别处也收起 —— 触屏上 click 会有 ~300ms 延迟，长按后立刻取消更跟手 */
function onDocTouchCloseActions(e: TouchEvent) {
  const el = e.target as HTMLElement | null;
  if (shouldIgnoreClose(e, el)) return;
  openActionsMsgId.value = '';
}

onMounted(() => {
  document.addEventListener('click', onDocClickCloseActions, true);
  document.addEventListener('touchstart', onDocTouchCloseActions, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClickCloseActions, true);
  document.removeEventListener('touchstart', onDocTouchCloseActions, true);
  longPressCache.clear();
});

// ===== 工作流模式空态 =====
// 与开发模式同一思路：不给它套办公模式的场景轮播欢迎卡（白底大卡塞窄栏很丑）
const isWorkflowMode = computed(() => activeMode.value === 'wf');
const WF_TIPS = [
  '运行短剧流水线并看每个节点的输出',
  '这次运行卡在哪个节点了',
  '把上次跑挂的那条重跑一遍',
];
/** 点引导语：填进输入框（用 useChat 实例，它与输入框是同一个单例） */
function applyWfTip(t: string) {
  input.value = t;
}

// ===== 开发模式空态：代码任务模板轮播（tasks 5i，复用 SceneCarousel）=====
const devTplKey = ref('');

function devAgentLabel(id: string): string {
  return agentStore.agents.find((a) => a.id === id)?.name || '代码编写助手';
}

/**
 * 点模板卡：切到该模板绑定的子智能体 + 挂载它的 skill 组合。
 * - 智能体不存在（未启用/未内置）时不改选中，仅提示
 * - skill 只保留真实存在的 id（避免挂到不存在的 skill 造成空挂载）
 *
 * ★ 只在**草稿态**改挂载（2026-09-27 补判据）：`mountedSkillIds` 在已有会话里是
 *   该会话 `skill_ids_json` 的镜像（切会话由 selectConv 回填）。模板轮播只出现在
 *   开发模式的空态（无会话），但函数本身没做判据 —— 一旦在别处被调用就会把
 *   用户当前会话的挂载顶掉（与 setScene / clearScene / applyTaskTypeAgent 同一口径）。
 */
function pickDevTpl(key: string) {
  const picked = DEV_TPLS.find((t) => t.key === key);
  if (!picked) return;
  if (devTplKey.value === picked.key) { devTplKey.value = ''; return; }
  devTplKey.value = picked.key;

  if (picked.agentId && agentStore.agents.some((a) => a.id === picked.agentId)) {
    if (agentStore.selectedId !== picked.agentId) onAgentSwitch(picked.agentId);
  }
  if (store.currentConvId) return; // 已有会话：挂载归该会话所有，模板不改
  const valid = picked.skillIds.filter((id) => skillStore.skills.some((s) => s.id === id));
  if (valid.length) mountedSkillIds.value = valid;
}

function applyDevExample(text: string) {
  input.value = text;
  const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement | null;
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
const confirmSupplementOpen = ref(false);
const document = window.document;
const router = useRouter();

// ask_user / confirm_user 表单出现时自动滚动到底部
watch(
  () => !!store.pendingQuestion || !!store.pendingConfirmation,
  (show) => {
    if (show) {
      nextTick(() => {
        setTimeout(() => {
          const el = messagesRef.value;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }, 50);
      });
    }
  },
);

// 流式过程中：智能体思考过程区域限高后，自动滚到底部以看到最新工具调用进度
watch(
  messageRounds,
  () => {
    if (!store.streaming) return;
    nextTick(() => {
      const all = messagesRef.value?.querySelectorAll<HTMLElement>('.agent-process-steps');
      const last = all?.[all.length - 1];
      if (last) last.scrollTop = last.scrollHeight;
    });
  },
  { flush: 'post' },
);

/** 从工具结果文本中检测本机路径（文件或目录），供「浏览文件」入口使用 */
function detectPath(text: unknown): string | null {
  if (text == null) return null;
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  const m = s.match(/(?:[A-Za-z]:[\\/][^\s"'<>|]+)|(?:\/(?:home|Users|root|tmp|opt|var|src|projects|code|workspace)[^\s"'<>|]*)/);
  return m ? m[0].replace(/["',]+$/, '') : null;
}

/** 文件改动类工具：结果里带路径的，在卡片下内联 diff 卡（聊天流内 review，2026-10-03 P0） */
const FILE_MUTATING_TOOLS = new Set(['file_write', 'file_edit']);
function fileChangePathOf(tool: string, result: unknown): string | null {
  if (!FILE_MUTATING_TOOLS.has(tool)) return null;
  const p = detectPath(result);
  if (!p) return null;
  // 结果文本形如 "Successfully edited <path>: ..." / "Successfully wrote ..."；
  // detectPath 的正则把 "..." 收进路径尾巴 —— 去掉工具结果常见的冒号后缀
  return p.replace(/:+$/, '');
}

function renderAssistantMarkdown(content?: string) {
  let c = content || '';
  // 模型原始输出原样入库；渲染时隐藏文本模式工具调用块（工具调用已由结构化 chip/步骤区展示），
  // 兼容 [TOOL_CALL]{...}[/TOOL_CALL] 与 <function=xxx>...</function> 及未闭合的尾部残留
  c = c
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
    .replace(/\[TOOL_CALL\][\s\S]*$/i, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/i, '');
  // 去掉平台配置卡片标记和 @@REASON@@ 分隔符（这些由 PlatformConfigCard 组件单独渲染）
  c = c.replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]\s*$/g, '').split('\n@@REASON@@\n')[0].trim();
  return c.split(/(\[tool_call\])/g).map((part) => {
    if (part === '[tool_call]') {
      return '<span class="inline-tool-chip"><span class="inline-tool-spinner"></span>正在调用工具</span>';
    }
    return renderMarkdown(part);
  }).join('');
}

/** 取整轮所有 assistant 消息产出的交付文件（按真实消息 id 集合过滤）
 *  交付文件在 chat.ts 中以产生 file_write 工具调用的那条助手消息真实 id 注册，
 *  该消息通常带 toolCalls 属于中间步骤，故需收集整轮 steps 的 messageId 命中过滤，
 *  而非仅用合成的 finalAssistant.id（永远匹配不到真实 messageId）。
 */
function getRoundDeliverableFiles(round: MessageRound) {
  const ids = new Set<string>();
  round.steps.forEach((s) => { if (s.messageId) ids.add(s.messageId); });
  if (round.finalAssistant?.id) ids.add(round.finalAssistant.id);
  return fileStore.filesByCategory.deliverable.filter((f) => f.messageId && ids.has(f.messageId));
}

/** 智能体思考过程是否展开：流式过程中强制展开（让工具调用进度实时可见），结束后由用户控制可折叠 */
function isProcessOpen(round: MessageRound, ri: number): boolean {
  return !!expandedAgentProcess['round-' + ri] || isLastRoundStreaming(round, ri);
}

// ===== 截图工具结果内嵌预览（仅流式期间） =====
// 截图类工具（computer_screenshot 等）在结果 JSON 里带 screenshotUrl；流式进行中在
// 工具卡片下方直接展示画面，任务结束（store.streaming 变 false）后由响应式自动移除，
// 历史消息重载时也不展示——「即用即弃，不留存」。临时文件由插件清理器在 30 分钟后回收。
/**
 * 从工具结果文本解析内嵌预览地址；非 JSON / 无 screenshotUrl 返回 null。
 * 地址补全统一走 absoluteMediaSrc（API_BASE 已含 /api，服务端地址自身也带 /api）。
 */
function resolveScreenshotUrl(resultText: string | null): string | null {
  if (!resultText) return null;
  try {
    const j = JSON.parse(resultText) as { screenshotUrl?: unknown; type?: unknown };
    const u = j.screenshotUrl;
    if (typeof u !== 'string' || !u) return null;
    // 带 type 的是生图产物（走产品预览通道，常驻展示），这里只认临时截图
    if (j.type === 'image') return null;
    return absoluteMediaSrc(u);
  } catch { return null; }
}

/**
 * 单条工具结果里的媒体产物（生图 / 生视频 / 配音）：解析走 useMediaPreview.mediaOfTool（带缓存）。
 * 展示位置在工具调用的折叠区里（参数/结果下方）—— 展开这条工具就能看到图，
 * 与「交付目录卡片」（读 conversation_file 登记项）是两件独立的事。
 */

function toolMedia(result: unknown): MediaTarget | null {
  const text = typeof result === 'string' ? result : result == null ? '' : JSON.stringify(result);
  return mediaOfTool(text, 'image') || mediaOfTool(text, 'video') || mediaOfTool(text, 'audio');
}

/**
 * 导出整轮任务结果为 Word：以主智能体最终正文（markdown）为准，
 * 正文里的图片按出现顺序内嵌，段落文字去掉 md 标记后写入。
 */
async function exportAssistantDocx(round: MessageRound) {
  const md = round.finalAssistant?.content || '';
  if (!md.trim()) {
    ElMessage.info('当前没有可导出的正文');
    return;
  }
  const title = (round.user?.content || '任务结果').replace(/\s+/g, ' ').trim().slice(0, 40) || '任务结果';
  await exportMarkdownDocx(md, title);
}

/** 该轮是否仍在流式进行（仅最后一轮 + 当前会话在跑），决定截图是否展示；任务结束即随响应式移除 */
function isRoundLive(round: MessageRound, ri: number): boolean {
  return store.streaming && ri === messageRounds.value.length - 1;
}

/** 是否渲染主智能体「任务结果」卡片：有正文 / 有独立思考过程 / 正在流式输出 */
function hasMainResult(round: MessageRound, ri: number): boolean {
  return !!(round.finalAssistant?.content ||
    (round.finalAssistant?.reasoningContent && !round.hasAgentProcess) ||
    isLastRoundStreaming(round, ri));
}

/** 获取当前流式 step 的实时正文内容（跑马灯式逐步增长的 partialContent） */
function getStreamingText(round: MessageRound, ri: number): string {
  const step = getStreamingStep(round, ri);
  return step?.partialContent || '';
}

/** 获取当前流式 step 的实时思考内容 */
function getStreamingReasoning(round: MessageRound, ri: number): string {
  const step = getStreamingStep(round, ri);
  return step?.reasoningContent || '';
}

/** 流式渲染：正文 markdown + 末尾闪烁光标（跑马灯进行中指示） */
function renderStreamingContent(content: string): string {
  return renderAssistantMarkdown(content) + '<span class="streaming-cursor" aria-hidden="true"></span>';
}

const roundNavRef = ref<HTMLElement | null>(null);
const navListRef = ref<HTMLElement | null>(null);
const navListVisible = ref(false);
const hoverPos = ref<number | null>(null);
let navHideTimer: number | null = null;
let listScrollRaf: number | null = null;

// 横岗（codex 风格）：数量上限 35，超过按比例映射；可点击跳转附近消息
const MAX_NAV_DASHES = 35;
const dashCount = computed(() => Math.min(MAX_NAV_DASHES, userRoundIndices.value.length));
const activeDashIdx = computed(() => {
  const total = userRoundIndices.value.length;
  if (total === 0) return -1;
  const ai = activeNavRound.value === null ? -1 : userRoundIndices.value.indexOf(activeNavRound.value);
  if (ai < 0) return -1;
  return Math.min(dashCount.value - 1, Math.floor((ai / total) * dashCount.value));
});

// 横岗索引 → 问题列表索引（按比例映射）
function dashToListIdx(dashIdx: number): number {
  const total = userRoundIndices.value.length;
  if (total === 0) return -1;
  return Math.min(total - 1, Math.floor((dashIdx / dashCount.value) * total));
}

// 每个横岗的样式：hover 时以鼠标位置为中心最长，向两侧渐变变短；无 hover 时 active 最长
function dashStyle(d: number): Record<string, string> {
  const normal = 8, max = 14;
  const normalColor = 'rgba(148,163,184,0.45)';
  const activeColor = 'var(--color-primary)';
  if (hoverPos.value === null) {
    if (d === activeDashIdx.value) {
      return { width: max + 'px', height: '2.5px', backgroundColor: activeColor, boxShadow: '0 0 4px color-mix(in srgb, var(--color-primary) 40%, transparent)' };
    }
    return { width: normal + 'px', height: '1.5px', backgroundColor: normalColor, boxShadow: 'none' };
  }
  const dist = Math.abs(d - hoverPos.value);
  const range = 4;
  const decay = Math.max(0, 1 - dist / range);
  const width = normal + (max - normal) * decay;
  const height = (1.5 + decay).toFixed(2) + 'px';
  const bg = decay > 0.05 ? activeColor : normalColor;
  const shadow = decay > 0.4 ? `0 0 ${(4 * decay).toFixed(1)}px color-mix(in srgb, var(--color-primary) 50%, transparent)` : 'none';
  return { width: width.toFixed(1) + 'px', height, backgroundColor: bg, boxShadow: shadow };
}

// 鼠标在横岗区域移动 → 中心横岗最长、两侧渐变变短 + 侧边列表同步滚动
function onNavMove(ev: MouseEvent) {
  const nav = roundNavRef.value;
  if (!nav) return;
  const rect = nav.getBoundingClientRect();
  const ratio = (ev.clientY - rect.top) / rect.height;
  const pos = Math.max(0, Math.min(dashCount.value - 1, ratio * dashCount.value));
  if (hoverPos.value === null || Math.abs(pos - hoverPos.value) > 0.01) {
    hoverPos.value = pos;
    scrollListToPos(pos);
  }
}

function scrollListToPos(pos: number) {
  if (listScrollRaf !== null) return;
  listScrollRaf = requestAnimationFrame(() => {
    listScrollRaf = null;
    const list = navListRef.value;
    if (!list) return;
    const items = list.querySelector('.round-nav-list-items') as HTMLElement | null;
    if (!items) return;
    const listIdx = dashToListIdx(pos);
    if (listIdx < 0) return;
    const item = items.children[listIdx] as HTMLElement | null;
    if (item) {
      items.scrollTop = item.offsetTop - (items.clientHeight - item.clientHeight) / 2;
    }
  });
}

// 点击横岗跳转到对应附近消息
function onDashClick(dashIdx: number) {
  const listIdx = dashToListIdx(dashIdx);
  if (listIdx < 0) return;
  const ri = userRoundIndices.value[listIdx];
  if (ri !== undefined) scrollToRound(ri);
}


function stripMarkdown(s: string): string {
  return (s || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '[代码块]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRoundText(ri: number): string {
  const round = messageRounds.value[ri];
  const text = stripMarkdown(round?.user?.content || '');
  return text.length > 80 ? text.slice(0, 80) + '…' : text;
}

function onNavEnter() {
  if (navHideTimer) { clearTimeout(navHideTimer); navHideTimer = null; }
  navListVisible.value = true;
  // 列表展开时自动定位到当前选中项（居中）
  nextTick(() => {
    const list = navListRef.value;
    if (!list) return;
    const activeItem = list.querySelector('.round-nav-list-item.active') as HTMLElement | null;
    if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function onListEnter() {
  if (navHideTimer) { clearTimeout(navHideTimer); navHideTimer = null; }
}

function onNavLeave() {
  if (navHideTimer) { clearTimeout(navHideTimer); navHideTimer = null; }
  hoverPos.value = null;
  navHideTimer = window.setTimeout(() => { navListVisible.value = false; }, 200);
}

watch(activeNavRound, () => {
  nextTick(() => {
    const nav = roundNavRef.value;
    if (nav) {
      const active = nav.querySelector('.round-nav-dash.active') as HTMLElement | null;
      if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const list = navListRef.value;
    if (list) {
      const activeItem = list.querySelector('.round-nav-list-item.active') as HTMLElement | null;
      if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
});
</script>

<style scoped>
/* ── 历史消息加载骨架（spec「统一空态与加载态」）──────────────────────────
   与消息气泡同宽（720px 列宽、左右留白），紧凑两行；宽度阶梯由 SkeletonList 自身提供 */
.history-skeleton {
  max-width: 720px;
  width: 100%;
  margin: 6px auto 2px;
  padding: 0 20px;
  box-sizing: border-box;
}

/* ── 压缩标记（2026-10-02）───────────────────────────────────────────────────
   极细分隔线 + 一行小字。压缩是**有损**的，用户需要知道"前面被摘要了"，
   否则只会觉得"模型怎么忘了"。刻意做得克制：低对比、小字号、无图标。 */
.compact-marker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 6px;
  padding: 0 8px;
  user-select: none;
}
.compact-marker-line {
  flex: 1;
  height: 1px;
  background: var(--color-border, rgba(127, 127, 127, 0.22));
}
.compact-marker-text {
  font-size: 11px;
  color: var(--color-text-secondary, #909399);
  opacity: 0.85;
  white-space: nowrap;
}

/* ===== 开发模式空态：版式对齐办公模式 .chat-welcome（max-width / padding / 居中问候语）===== */
/* ===== 开发模式空态：版式对齐办公模式（尺寸不缩，整块在可视区上下居中）=====
   .messages 是 flex:1 的滚动容器，用 min-height + flex 居中即可稳定生效 */
.code-welcome {
  max-width: 720px;
  margin: 0 auto;
  min-height: 100%;
  justify-content: center;
  padding: 20px;
  /* 底部多留一段：内容盒变小 → 居中点随之上移，问候语「稍微往上点」（与办公模式同口径） */
  padding-bottom: 76px;
  display: flex;
  flex-direction: column;
  /* 问候语与卡片之间拉大间距（文字视觉上更靠上） */
  gap: 34px;
  width: 100%;
}
.code-welcome-greeting { text-align: center; }
/* 与办公模式 cw-avatar 同款小图标 */
.code-welcome-avatar {
  width: 44px; height: 44px;
  margin: 0 auto 10px;
  border-radius: 13px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary, #7c3aed);
  background: color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent);
}
.code-welcome-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}
.code-welcome-sub {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary, #64748b);
}

/* ===== 工作流模式空态（窄栏友好，不铺白底大卡）===== */
/* 注意：父级 .messages 是可滚动 flex 容器，子项 min-height:100% 会按内容盒算，
   实测会出现「偏上 + 右侧被裁」。改用 flex:1 撑满剩余高度，居中才可靠。 */
.wf-welcome {
  flex: 1 0 auto;
  width: 100%;
  min-height: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 9px;
  padding: 20px 20px 64px;
  text-align: center;
  box-sizing: border-box;
  overflow: hidden;
}
.wf-welcome-avatar {
  width: 42px; height: 42px; border-radius: 13px; flex: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary, #7c3aed);
  background: color-mix(in srgb, var(--color-primary, #7c3aed) 12%, transparent);
}
.wf-welcome-title {
  font-size: 15px; font-weight: 600;
  color: var(--skin-text, var(--el-text-color-primary, #1e293b));
}
.wf-welcome-sub {
  font-size: 12px; line-height: 1.7; max-width: 100%;
  color: var(--el-text-color-secondary, #64748b);
}
.wf-welcome-tips {
  display: flex; flex-direction: column; gap: 5px;
  width: 100%; max-width: 100%; margin-top: 4px;
}
/* 引导语做成可点小条（比白底大卡轻得多，窄栏也放得下） */
.wf-welcome-tip {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 9px; border-radius: 8px; cursor: pointer;
  font-size: 12px; text-align: left; width: 100%; box-sizing: border-box;
  color: var(--el-text-color-regular, #475569);
  background: var(--glass-bg, rgba(148,163,184,0.08));
  border: 1px solid var(--glass-border, transparent);
  transition: border-color .15s, color .15s;
}
.wf-welcome-tip span {
  flex: 1; min-width: 0;
  /* 窄栏放不下时换行而不是省略号（引导语被截成「运行短剧流水线并看…」等于没说） */
  line-height: 1.5;
}
.wf-welcome-tip:hover {
  border-color: var(--color-primary, #7c3aed);
  color: var(--color-primary, #7c3aed);
}
.wf-welcome-foot {
  margin-top: 2px; font-size: 11px; line-height: 1.6;
  color: var(--el-text-color-placeholder, #94a3b8);
  max-width: 100%;
}

.inline-ask-card {
  display: flex; gap: 10px; margin: 12px auto; padding: 14px 16px;
  max-width: 85%;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: 16px; border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  animation: inline-ask-in .25s ease-out;
}
@keyframes inline-ask-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.inline-ask-icon {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
  background: var(--color-primary); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}
.inline-ask-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.inline-ask-step { font-size: 12px; color: var(--el-text-color-secondary, #888); }
.inline-ask-question { font-size: 14px; font-weight: 500; color: var(--el-text-color-primary, #fff); line-height: 1.5; }
.inline-ask-desc { font-size: 13px; color: var(--el-text-color-secondary, #aaa); line-height: 1.4; }
.inline-ask-options { display: flex; flex-wrap: wrap; gap: 8px; }
.inline-ask-opt {
  padding: 6px 14px; border: 1px solid var(--el-border-color, #2d2d3a); border-radius: 8px;
  background: transparent; color: var(--el-text-color-regular, #ccc); font-size: 13px; cursor: pointer; transition: all .15s;
}
.inline-ask-opt:hover { border-color: var(--color-primary); color: var(--color-primary); }
.inline-ask-opt.is-active { border-color: var(--color-primary); background: var(--color-primary); color: #fff; }
.inline-ask-opt-text { font-style: italic; }
.inline-ask-supplement { margin-top: 4px; }
.inline-ask-toggle { align-self: flex-start; padding: 2px 8px; border: none; background: transparent; color: var(--color-text-secondary, #888); font-size: 12px; cursor: pointer; border-radius: 6px; transition: all .15s; }
.inline-ask-toggle:hover { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
.inline-ask-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

/* ===== 越界访问授权卡（复用 inline-ask-card 骨架，仅加"警示"语义的强调色）===== */
.inline-auth-icon { color: var(--color-warning, #b45309); }
.inline-auth-list {
  display: flex; flex-direction: column; gap: 4px;
  max-height: 160px; overflow: auto;
  padding: 8px 10px; border-radius: 8px;
  background: color-mix(in srgb, var(--color-warning, #b45309) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning, #b45309) 24%, transparent);
}
.inline-auth-item { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.inline-auth-tag {
  flex-shrink: 0; font-size: 11px; padding: 0 6px; border-radius: 6px; line-height: 18px;
  background: color-mix(in srgb, var(--color-text-secondary, #888) 16%, transparent);
  color: var(--color-text-secondary, #6b6b66);
}
.inline-auth-tag.is-write {
  background: color-mix(in srgb, var(--color-danger, #dc2626) 16%, transparent);
  color: var(--color-danger, #dc2626);
}
.inline-auth-path {
  flex: 1; min-width: 0; font-family: var(--font-mono, monospace); font-size: 12px;
  color: var(--el-text-color-primary, #1a1a1a);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left;
}

/* 流式跑马灯：实时正文容器 */
.streaming-content {
  position: relative;
  will-change: contents;
  contain: content;
}
/* 末尾闪烁光标（v-html 内，需 :deep 穿透）；暗色主题下用主色 + 发光确保对比度 */
.streaming-content :deep(.streaming-cursor) {
  display: inline-block;
  width: 8px;
  height: 1.1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--color-primary);
  border-radius: 1px;
  box-shadow: 0 0 6px color-mix(in srgb, var(--color-primary) 55%, transparent);
  animation: streamingBlink 1.1s ease-in-out infinite;
}
@keyframes streamingBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.15; }
}
/* 流式思考：淡显，暗色主题下提升正文对比度 */
.streaming-reasoning {
  border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
.streaming-reasoning .reasoning-header { color: var(--color-primary); }
.streaming-reasoning .reasoning-body { color: var(--color-text); }

/* 思考过程区域：平滑出现动画 */
.agent-process-header {
  animation: fadeInDown 0.25s ease-out;
}
.agent-process-steps {
  animation: fadeInDown 0.3s ease-out;
}
@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 聊天内嵌动态看板（DataQueryWorkbench）：固定高度内联在消息流里，顶部工具/过滤固定、表格独立滚动 */
.msg-inline-dataview {
  margin-top: 10px;
  border: 1px solid var(--el-border-color-lighter, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-elevated, #fff);
  height: 340px;
  display: flex;
  flex-direction: column;
}
.dataview-title {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  border-bottom: 1px solid var(--el-border-color-lighter, #e2e8f0);
  background: var(--glass-bg);
}
.dataview-tag {
  font-weight: 400;
  color: #64748b;
  font-size: 11px;
  background: var(--glass-bg-hover);
  color: #4f46e5;
  border-radius: 4px;
  padding: 0 6px;
}
.msg-inline-dataview :deep(.dqw-root) {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
}

/* ===== 截图类工具内嵌预览（仅流式期间渲染，任务结束随响应式移除） ===== */
.tool-item-shot {
  margin: 8px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 420px;
}
.tool-item-shot img {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--glass-border, rgba(127, 127, 127, 0.25));
  background: rgba(127, 127, 127, 0.08);
}
.tool-item-shot-note {
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
  line-height: 1.4;
}

/* ★ el-button 里「el-icon + 裸文本节点」之间没有间距来源 ——
   Element Plus 只给 `> span` 加 margin，直接写文本时会渲染成「⚙配置模型」紧贴。
   用显式 margin-right 兜住（放 scoped 里安全：el-icon 是模板节点，带 data-v 属性）。 */
.btn-icon-gap {
  margin-right: 6px;
}

/* ── 未配置/未选择模型的顶部紧凑提示（不占位、不盖住场景轮播）────────────── */
.no-model-hint {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 32px);
  padding: 5px 6px 5px 11px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-warning, #d97706) 30%, transparent);
  background: color-mix(in srgb, var(--color-bg-elevated, #fff) 88%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: var(--shadow-1, 0 2px 8px rgba(15, 23, 42, 0.08));
  color: var(--color-text-secondary, #5a6272);
  font-size: 12px;
  white-space: nowrap;
}
.no-model-hint .el-icon {
  color: var(--color-warning, #d97706);
  flex-shrink: 0;
}
.no-model-hint-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
.no-model-hint-btn {
  flex-shrink: 0;
  border: none;
  padding: 3px 12px;
  border-radius: 999px;
  background: var(--color-primary, #4f46e5);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.no-model-hint-btn:hover { opacity: 0.88; }
</style>