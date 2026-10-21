<template>
  <div class="messages" ref="messagesRef">
    <!-- 历史消息加载态（spec「统一空态与加载态」）：拉取既有会话历史期间在列表顶部渲染骨架，
         加载完成后随响应式自动替换为真实消息；新会话（无历史可载）不渲染。 -->
    <div v-if="historyLoading && !store.currentMessages.length" class="history-skeleton">
      <SkeletonList :rows="2" :row-height="44" />
    </div>
    <!-- 历史向前翻页哨兵（2026-10-11）：滚到顶部附近即加载更早消息。
         IntersectionObserver 触发 store.loadMoreHistory；prepend 后由
         preserveScrollOnPrepend 保持视口位置（不跳）。 -->
    <div v-if="historySentinelVisible" ref="historySentinelRef" class="history-sentinel">
      <span v-if="historyLoadingMore" class="history-sentinel-loading">加载更早消息…</span>
    </div>
    <!-- 任务规划卡（TaskPlanCard）已移除（2026-10-07）：此前只要有计划就常驻消息流顶部，任务结束后也不消失。
         规划展示统一收敛到输入区上方的运行指示行（可展开步骤详情 + 进度条 + 结束回执），不再两处重复。 -->
    <!-- 8.1 日期分隔线：相邻轮次日期变化时渲染居中分隔；任一侧无时间戳则跳过该对
         ★ key 必须用轮次锚（用户消息 id）而非下标（2026-10-11）：向前翻页 prepend 时
           下标整体位移 → 全部 key 变化 → Vue 把已渲染的几百条消息 DOM 全量卸载重挂 +
           滚动位置跳飞。稳定 key 下 prepend 只挂载新翻出的顶部轮次，存量 DOM 原地保留。
         ★★ 窗口化渲染（B1，2026-10-13）：v-for 数据源从全量 messageRounds 换成
           visibleRounds（末尾 ~30 轮起步、滚近顶部懒扩窗）—— 长会话（实测 1024 条消息）
           打开时 DOM 只挂窗口内轮次，UI 进程省数百 MB、主线程不再被全量渲染压死。
           (vr.ri, vr.round) 对携带**全量下标**，模板内所有 vr.ri 语义（data-round / 折叠 key /
           isLastRoundStreaming）不变；ensureRoundVisible 供跳转前扩窗。 -->
    <template v-for="vr in visibleRounds" :key="vr.round.user?.id || 'r' + vr.ri">
      <div v-if="dateDividerFor(vr.ri)" class="msg-date-divider">
        <span class="msg-date-divider-line"></span>
        <span class="msg-date-divider-text">{{ dateDividerFor(vr.ri) }}</span>
        <span class="msg-date-divider-line"></span>
      </div>
      <div class="round-group" :data-round="vr.ri">
      <div
        v-if="vr.round.user"
        class="msg msg-user"
        :class="{ 'is-actions-open': actionsShown(vr.round.user.id) }"
        v-on="msgLongPressHandlers(vr.round.user.id)"
      >
        <!-- 8.1 双头像身份：用户头像 = 角色名首字符（accent 底，样式见 chat.css .avatar-user） -->
        <div class="msg-avatar avatar-user">你</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-role-name">你</span>
            <span v-if="vr.round.user.createdAt" class="msg-time">{{ formatTime(vr.round.user.createdAt) }}</span>
          </div>
          <div
            v-if="vr.round.user.content"
            class="msg-block"
            :class="{ 'msg-collapsed': collapsedMessages[vr.round.user.id] }"
            @click="collapsedMessages[vr.round.user.id] ? toggleMsgCollapse(vr.round.user.id) : null"
          >
            <div v-show="!collapsedMessages[vr.round.user.id]">
              <div v-if="vr.round.user.content" class="msg-content" v-html="renderMarkdown(vr.round.user.content)" @click="handleContentClick" @dblclick="handleContentDblClick" @contextmenu="handleContentContextMenu"></div>
            </div>
            <div v-show="collapsedMessages[vr.round.user.id]" class="msg-collapsed-placeholder">
              <span class="collapsed-line">{{ (vr.round.user.content || '').replace(/\n/g, ' ').slice(0, 120) }}</span>
              <span class="collapsed-hint">点击展开</span>
            </div>
          </div>
          <div class="msg-actions" :class="{ 'is-open': actionsShown(vr.round.user.id) }">
            <el-tooltip content="复制" placement="top"><el-button text size="small" circle @click="copyMsg(vr.round.user)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
            <el-tooltip content="引用" placement="top"><el-button text size="small" circle @click="quoteMsg(vr.round.user)"><el-icon><Link /></el-icon></el-button></el-tooltip>
            <el-tooltip content="编辑" placement="top"><el-button text size="small" circle @click="editMsg(vr.round.user)"><el-icon><EditPen /></el-icon></el-button></el-tooltip>
            <el-tooltip content="蒸馏为 Skill" placement="top"><el-button text size="small" circle @click="distillUserMsg(vr.round.user)"><el-icon><Files /></el-icon></el-button></el-tooltip>
            <el-tooltip content="删除" placement="top"><el-button text size="small" circle @click="delMsg(vr.round.user)"><el-icon><Delete /></el-icon></el-button></el-tooltip>
            <el-tooltip content="查看提示词" placement="top"><el-button text size="small" circle @click="openSnapshotDialog(vr.round.user)"><el-icon><View /></el-icon></el-button></el-tooltip>
          </div>
        </div>
      </div>

      <!-- 上下文压缩标记（2026-10-02）：压缩是**有损**的（前文被摘要替换），不该完全隐形 -->
      <div
        v-for="(cm, ci) in (vr.round.compactMarkers || [])"
        :key="'compact-' + vr.ri + '-' + ci"
        class="compact-marker"
      >
        <span class="compact-marker-line"></span>
        <span class="compact-marker-text">
          已压缩历史上下文 · {{ cm.coveredCount }} 条 → 摘要（当前 {{ cm.keptCount }} 条）
        </span>
        <span class="compact-marker-line"></span>
      </div>

      <div v-if="vr.round.finalAssistant || vr.round.steps.length > 0 || isLastRoundStreaming(vr.round, vr.ri)" class="msg msg-assistant" :class="{ 'is-actions-open': actionsShown(vr.round.finalAssistant?.id || '') }" v-on="msgLongPressHandlers(vr.round.finalAssistant?.id || '')">
        <!-- 8.1 双头像身份：AI 头像 = 当前智能体名首字符（无则 🤖），桌面端显示（窄栏由 CSS 收起） -->
        <div class="msg-avatar avatar-assistant" :class="{ streaming: isLastRoundStreaming(vr.round, vr.ri) }">{{ assistantAvatarChar }}</div>
        <div class="msg-body">
          <div class="agent-response-card" :class="{ 'msg-collapsed': collapsedMessages[vr.round.finalAssistant?.id || ''] }" @click="collapsedMessages[vr.round.finalAssistant?.id || ''] ? toggleMsgCollapse(vr.round.finalAssistant?.id || '') : null">
            <div v-show="collapsedMessages[vr.round.finalAssistant?.id || '']" class="msg-collapsed-placeholder">
              <span class="collapsed-line">{{ (vr.round.finalAssistant?.content || '').replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]/g, '').split('@@REASON@@')[0].replace(/\n/g, ' ').trim().slice(0, 120) }}</span>
              <span class="collapsed-hint">点击展开</span>
            </div>
            <div v-show="!collapsedMessages[vr.round.finalAssistant?.id || '']">
              <!-- ★ 运行状态摘要条（2026-10-20，对齐 WorkBuddy 式过程反馈）：
                   工具过程默认收起（见 isProcessOpen），但收起 ≠ 隐形 —— 思考中/工具执行中/生成中
                   都要给用户一行实时状态，否则长任务期间消息区只有打字光标，像"卡死了"。
                   条件与下方 agent-process-steps 互斥（isProcessOpen 为 false 才显示）：
                   ① live：等待模型响应 / 正在执行 <工具> / 生成回复中（Loading 转圈）
                   ② 已结束：N 步推理 · M 次工具调用（点击展开详情） -->
              <div v-if="!isProcessOpen(vr.round, vr.ri) && (isRoundLive(vr.round, vr.ri) || vr.round.hasAgentProcess)"
                   class="agent-process-summary"
                   :class="{ 'is-clickable': vr.round.hasAgentProcess }"
                   @click="vr.round.hasAgentProcess && toggleAgentProcess('round-' + vr.ri)">
                <el-icon :size="13" class="agent-process-summary-icon">
                  <Loading v-if="isRoundLive(vr.round, vr.ri)" class="is-loading" />
                  <CircleCheck v-else />
                </el-icon>
                <span class="agent-process-summary-text">{{ processSummaryText(vr.round, vr.ri) }}</span>
                <el-icon v-if="vr.round.hasAgentProcess" :size="12" class="agent-process-summary-chevron"><ArrowRight /></el-icon>
              </div>
              <div v-if="vr.round.hasAgentProcess && isProcessOpen(vr.round, vr.ri)" class="agent-process-steps">
                <div v-if="hasHiddenSteps(vr.round)" class="agent-steps-fold">
                  <button type="button" class="agent-steps-fold-btn" @click="toggleEarlierSteps(vr.ri)">
                    {{ expandedEarlierSteps['round-' + vr.ri] ? '收起更早的步骤' : `已折叠更早的 ${hiddenStepCount(vr.round, vr.ri)} 步 · 点击展开` }}
                  </button>
                </div>
                <template v-for="(step, si) in vr.round.steps" :key="'agent-step-' + vr.ri + '-' + si">
                <div v-if="isStepRendered(vr.round, vr.ri, si)" class="agent-step">
                  <div v-if="step.reasoningContent" class="msg-reasoning">
                    <div class="reasoning-header" @click="toggleReasoning('agent-step-' + vr.ri + '-' + si)">
                      <el-icon><CaretRight v-if="!expandedReasoning['agent-step-' + vr.ri + '-' + si]" /><CaretBottom v-else /></el-icon>
                      <span>推理 {{ si + 1 }}</span>
                    </div>
                    <div v-if="expandedReasoning['agent-step-' + vr.ri + '-' + si]" class="reasoning-body">{{ step.reasoningContent }}</div>
                  </div>
                  <div v-if="step.partialContent" class="agent-step-partial" v-html="renderMarkdown(step.partialContent)" @click="handleContentClick"></div>
                  <div v-if="step.toolCalls.length" class="tool-group-card tool-group-card-flat">
                    <div class="tool-group-body">
                      <div v-for="(tc, idx) in step.toolCalls" :key="idx" class="tool-item">
                        <div class="tool-item-header" @click="openToolItem('agent-step-' + vr.ri + '-' + si + '-' + idx, tc.id)">
                          <div class="tool-item-left">
                            <el-icon :size="12" class="tool-item-status" :class="getStepToolStatusClass(step, tc.id)">
                              <CircleCheck v-if="isToolResultDone(tc.id) && !isStepToolError(step, tc.id)" />
                              <CircleClose v-else-if="isStepToolError(step, tc.id)" />
                              <Loading v-else class="is-loading" />
                            </el-icon>
                            <span class="tool-item-server">{{ resolveToolDisplay(tc).server }}</span>
                            <code class="tool-item-fn">{{ resolveToolDisplay(tc).tool }}</code>
                            <span v-if="toolTargetHint(tc)" class="tool-item-target" :title="toolTargetHint(tc)">{{ toolTargetHint(tc) }}</span>
                          </div>
                          <el-icon :size="12" class="tool-item-chevron">
                            <ArrowDown v-if="isToolItemOpen(tc.id, 'agent-step-' + vr.ri + '-' + si + '-' + idx)" />
                            <ArrowRight v-else />
                          </el-icon>
                        </div>
                        <!-- 截图类工具（computer_screenshot 等）：流式期间在工具卡片下内嵌展示画面，任务结束自动移除 -->
                        <div v-if="isRoundLive(vr.round, vr.ri) && resolveScreenshotUrl(getStepToolResult(step, tc.id))" class="tool-item-shot">
                          <img :src="resolveScreenshotUrl(getStepToolResult(step, tc.id)) || ''" alt="屏幕截图" />
                          <span class="tool-item-shot-note">截图预览 · 仅流式期间展示，结束后自动清理</span>
                        </div>
                        <!-- 本条调用产出的图片 / 视频：贴在工具卡片上（折叠体之外）—— 展开状态无关，收起也能看到。
                             展开体里再放一份会重复，故只此一处；hover 浮层放大、双击进灯箱、右键取用。 -->
                        <ToolMediaPreview v-if="toolMedia(getStepToolResult(step, tc.id))" :media="toolMedia(getStepToolResult(step, tc.id))!" class="tool-item-media-inline" />
                        <div v-if="isToolItemOpen(tc.id, 'agent-step-' + vr.ri + '-' + si + '-' + idx)" class="tool-item-body">
                          <div class="tool-item-section">
                            <div class="tool-item-label">参数</div>
                            <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                          </div>
                          <div class="tool-item-section">
                            <div class="tool-item-label">结果</div>
                            <template v-if="getStepToolResult(step, tc.id)">
                              <pre
                                v-if="resolveToolDisplay(tc).tool !== 'call_agent'"
                                class="tool-item-json"
                                :class="{
                                  'is-clamped': isLongToolResult(getStepToolResult(step, tc.id)) && !expandedToolResults['agent-step-' + vr.ri + '-' + si + '-' + idx + '-res'],
                                  'tool-item-json-error': isStepToolError(step, tc.id),
                                }"
                              >{{ getStepToolResult(step, tc.id) }}</pre>
                              <div v-else class="tool-item-note">子智能体已完成，最终结果见下方卡片正文</div>
                              <button
                                v-if="resolveToolDisplay(tc).tool !== 'call_agent' && isLongToolResult(getStepToolResult(step, tc.id))"
                                type="button"
                                class="tool-item-expand"
                                @click.stop="toggleToolResult('agent-step-' + vr.ri + '-' + si + '-' + idx + '-res')"
                              >{{ expandedToolResults['agent-step-' + vr.ri + '-' + si + '-' + idx + '-res'] ? '收起结果' : '展开全部结果' }}</button>
                            </template>
                            <button
                              v-else-if="isToolResultDone(tc.id)"
                              type="button"
                              class="tool-item-expand"
                              @click.stop="requestToolResult(tc.id)"
                            >加载结果</button>
                            <div v-else class="tool-item-note">执行中…</div>
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
                            :id-prefix="'sub-' + vr.ri + '-' + si + '-' + idx"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </template>
                <div v-if="!vr.round.steps.length && vr.round.allToolCalls.length" class="agent-old-tools">
                  <div class="tool-group-card tool-group-card-flat">
                    <div class="tool-group-body">
                      <div v-for="(tc, idx) in vr.round.allToolCalls" :key="idx" class="tool-item">
                        <div class="tool-item-header" @click="openToolItem('round-' + vr.ri + '-' + idx, tc.id)">
                          <div class="tool-item-left">
                            <el-icon :size="12" class="tool-item-status" :class="getToolStatusClass(tc.id)">
                              <CircleCheck v-if="isToolResultDone(tc.id) && !isToolError(tc.id)" />
                              <CircleClose v-else-if="isToolError(tc.id)" />
                              <Loading v-else class="is-loading" />
                            </el-icon>
                            <span class="tool-item-server">{{ resolveToolDisplay(tc).server }}</span>
                            <code class="tool-item-fn">{{ resolveToolDisplay(tc).tool }}</code>
                            <span v-if="toolTargetHint(tc)" class="tool-item-target" :title="toolTargetHint(tc)">{{ toolTargetHint(tc) }}</span>
                          </div>
                          <el-icon :size="12" class="tool-item-chevron">
                            <ArrowDown v-if="expandedTools['round-' + vr.ri + '-' + idx]" />
                            <ArrowRight v-else />
                          </el-icon>
                        </div>
                        <!-- 本条调用产出的图片 / 视频：贴在工具卡片上（折叠体之外）—— 展开状态无关，收起也能看到 -->
                          <ToolMediaPreview v-if="toolMedia(getToolResult(tc.id))" :media="toolMedia(getToolResult(tc.id))!" class="tool-item-media-inline" />
                          <div v-if="expandedTools['round-' + vr.ri + '-' + idx]" class="tool-item-body">
                          <div class="tool-item-section">
                            <div class="tool-item-label">参数</div>
                            <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                          </div>
                          <div class="tool-item-section">
                            <div class="tool-item-label">结果</div>
                            <template v-if="getToolResult(tc.id)">
                              <pre
                                class="tool-item-json"
                                :class="{
                                  'is-clamped': isLongToolResult(getToolResult(tc.id)) && !expandedToolResults['round-' + vr.ri + '-' + idx + '-res'],
                                  'tool-item-json-error': isToolError(tc.id),
                                }"
                              >{{ getToolResult(tc.id) }}</pre>
                              <button
                                v-if="isLongToolResult(getToolResult(tc.id))"
                                type="button"
                                class="tool-item-expand"
                                @click.stop="toggleToolResult('round-' + vr.ri + '-' + idx + '-res')"
                              >{{ expandedToolResults['round-' + vr.ri + '-' + idx + '-res'] ? '收起结果' : '展开全部结果' }}</button>
                            </template>
                            <button
                              v-else-if="isToolResultDone(tc.id)"
                              type="button"
                              class="tool-item-expand"
                              @click.stop="requestToolResult(tc.id)"
                            >加载结果</button>
                            <div v-else class="tool-item-note">执行中…</div>
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
                <!-- 收起过程（2026-10-20）：展开后摘要条消失，必须有显式收回入口 -->
                <div class="agent-process-collapse-row">
                  <button type="button" class="agent-steps-fold-btn" @click="toggleAgentProcess('round-' + vr.ri)">
                    收起过程 ▲
                  </button>
                </div>
              </div>
              <div class="agent-response-body">
                <template v-if="vr.round.subAgentResults?.length">
                  <div v-for="(sr, sri) in vr.round.subAgentResults" :key="'sar-' + vr.ri + '-' + sri" class="sub-agent-result" :data-card-variant="(vr.ri + sri) % 4">
                    <div class="sub-agent-result-head" @click="toggleSubAgentResult('sar-' + vr.ri + '-' + sri)">
                      <el-icon :size="13" class="sub-agent-result-icon"><ChatDotRound /></el-icon>
                      <span class="sub-agent-result-name">{{ sr.subAgentName }}</span>
                      <span class="sub-agent-result-tag">结果</span>
                      <span class="sub-agent-result-actions" @click.stop>
                        <el-tooltip content="复制 Markdown" placement="top"><el-button text size="small" circle @click="copySubAgentResultMd(sr)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
                        <el-tooltip content="下载为 .md 文件" placement="top"><el-button text size="small" circle @click="downloadSubAgentResultMd(sr, sri)"><el-icon><Download /></el-icon></el-button></el-tooltip>
                      </span>
                      <el-icon :size="12" class="sub-agent-result-chevron"><ArrowDown v-if="!collapsedSubAgentResults['sar-' + vr.ri + '-' + sri]" /><ArrowRight v-else /></el-icon>
                    </div>
                    <div v-show="!collapsedSubAgentResults['sar-' + vr.ri + '-' + sri]" class="sub-agent-result-content" v-html="renderMarkdown(sr.finalContent)" @click="handleContentClick" @dblclick="handleContentDblClick" @contextmenu="handleContentContextMenu"></div>
                  </div>
                </template>
                <div v-if="hasMainResult(vr.round, vr.ri)" class="main-agent-result" :data-card-variant="vr.ri % 4">
                  <div class="main-agent-result-head" @click="toggleMainResult('mar-' + vr.ri)">
                    <el-icon :size="13" class="main-agent-result-icon"><ChatDotRound /></el-icon>
                    <span class="main-agent-result-name">任务结果</span>
                    <span class="main-agent-result-tag">主智能体</span>
                    <span class="main-agent-result-actions" @click.stop>
                      <el-tooltip content="复制 Markdown" placement="top"><el-button text size="small" circle @click="copyAssistantMd(vr.round)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
                      <el-tooltip content="下载为 .md 文件" placement="top"><el-button text size="small" circle @click="downloadAssistantMd(vr.round)"><el-icon><Download /></el-icon></el-button></el-tooltip>
                      <el-tooltip content="导出 Word" placement="top"><el-button text size="small" circle @click="exportAssistantDocx(vr.round)"><el-icon><Document /></el-icon></el-button></el-tooltip>
                    </span>
                    <el-icon :size="12" class="main-agent-result-chevron"><ArrowDown v-if="!collapsedMainResults['mar-' + vr.ri]" /><ArrowRight v-else /></el-icon>
                  </div>
                  <div v-show="!collapsedMainResults['mar-' + vr.ri]" class="main-agent-result-content">
                    <!-- 深度思考（WorkBuddy 式）：**带工具调用的轮次也显示** —— 此前被
                         `!hasAgentProcess` 挡掉，开发模式下几乎总在调工具 ⇒ 用户根本看不到思考标识。
                         字数用轻量累加（模板热路径），全文只在展开时拼（见 reasoning-summary.ts）。 -->
                    <div v-if="roundReasoningChars(vr.round) > 0" class="msg-reasoning" :data-card-variant="(vr.ri + 1) % 4">
                      <DeepThinkBadge
                        state="done"
                        :chars="roundReasoningChars(vr.round)"
                        :open="!!expandedReasoning['agent-fa-' + vr.ri]"
                        @toggle="toggleReasoning('agent-fa-' + vr.ri)"
                      />
                      <div v-if="expandedReasoning['agent-fa-' + vr.ri]" class="reasoning-body">{{ roundReasoningText(vr.round) }}</div>
                    </div>
                    <template v-if="vr.round.finalAssistant?.content">
                      <div class="msg-content" v-html="renderAssistantMarkdown(vr.round.finalAssistant.content)" @click="handleContentClick" @dblclick="handleContentDblClick" @contextmenu="handleContentContextMenu"></div>
                      <PlatformConfigCard
                        v-if="parseConfigCard(vr.round.finalAssistant.content)"
                        :mode="parseConfigCard(vr.round.finalAssistant.content)!.mode"
                        :platform="getEditPlatform(vr.round.finalAssistant.content)"
                        :reason="getEditReason(vr.round.finalAssistant.content)"
                        class="msg-config-card"
                        @saved="onConfigSaved"
                      />
                      <!-- 动态看板（数据浏览）：模型 data_query_view 产契约后内嵌到当前助手消息，嵌套在聊天流程里 -->
                      <div
                        v-if="vr.round.finalAssistant?.dataView"
                        class="msg-inline-dataview"
                      >
                        <div class="dataview-title">
                          <el-icon><Grid /></el-icon>
                          <span>{{ vr.round.finalAssistant.dataView.title || '数据明细' }}</span>
                          <span class="dataview-tag">可交互数据看板</span>
                        </div>
                        <DataQueryWorkbench :key="vr.round.finalAssistant.id + '-dv'" :contract="vr.round.finalAssistant.dataView" />
                      </div>
                    </template>
                    <template v-else-if="isLastRoundStreaming(vr.round, vr.ri)">
                      <!-- 有实时正文：跑马灯式流式显示 + 末尾闪烁光标 -->
                      <div v-if="getStreamingText(vr.round, vr.ri)" class="msg-content streaming-content" v-html="renderStreamingContent(getStreamingText(vr.round, vr.ri))" @click="handleContentClick" @dblclick="handleContentDblClick" @contextmenu="handleContentContextMenu"></div>
                      <!-- 有思考但无正文：「深度思考」徽标 + 跑马灯 + 单行摘要（不铺整段，避免挤占正文） -->
                      <div v-else-if="getStreamingReasoning(vr.round, vr.ri)" class="msg-reasoning streaming-reasoning">
                        <DeepThinkBadge
                          state="thinking"
                          :chars="getStreamingReasoning(vr.round, vr.ri).length"
                          :open="!!expandedReasoning['stream-' + vr.ri]"
                          @toggle="toggleReasoning('stream-' + vr.ri)"
                        />
                        <div v-if="expandedReasoning['stream-' + vr.ri]" class="reasoning-body">{{ getStreamingReasoning(vr.round, vr.ri) }}</div>
                        <div v-else class="dtb-peek">{{ reasoningPeek(getStreamingReasoning(vr.round, vr.ri)) }}</div>
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
                  v-if="getRoundDeliverableFiles(vr.round).length"
                  :files="getRoundDeliverableFiles(vr.round)"
                  class="msg-deliverable-card"
                />
              </div>

            </div>
          </div>


          <div class="msg-actions msg-actions-assistant" :class="{ 'is-open': actionsShown(vr.round.finalAssistant?.id || '') }">
            <el-tooltip v-if="vr.round.hasAgentProcess" content="查看调用详情" placement="top"><el-button text size="small" circle @click.stop="toggleAgentProcess('round-' + vr.ri)"><el-icon><View /></el-icon></el-button></el-tooltip>
            <el-tooltip content="复制 Markdown" placement="top"><el-button text size="small" circle @click="copyAssistantMd(vr.round)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
            <el-tooltip content="下载为 .md 文件" placement="top"><el-button text size="small" circle @click="downloadAssistantMd(vr.round)"><el-icon><Download /></el-icon></el-button></el-tooltip>
            <el-tooltip content="导出 Word" placement="top"><el-button text size="small" circle @click="exportAssistantDocx(vr.round)"><el-icon><Document /></el-icon></el-button></el-tooltip>
            <el-tooltip content="引用" placement="top"><el-button text size="small" circle @click="quoteMsg(vr.round.finalAssistant!)"><el-icon><Link /></el-icon></el-button></el-tooltip>
            <el-tooltip content="重新生成" placement="top"><el-button text size="small" circle :disabled="store.streaming" @click="regenerateMsg"><el-icon><Refresh /></el-icon></el-button></el-tooltip>
            <el-tooltip content="蒸馏为 Skill" placement="top"><el-button text size="small" circle @click="distillAssistantMsg(vr.round)"><el-icon><Files /></el-icon></el-button></el-tooltip>
            <el-tooltip content="删除" placement="top"><el-button text size="small" circle @click="delMsg(vr.round.finalAssistant!)"><el-icon><Delete /></el-icon></el-button></el-tooltip>
            <el-tooltip content="折叠" placement="top"><el-button text size="small" circle @click.stop="toggleMsgCollapse(vr.round.finalAssistant!.id)"><el-icon><Fold /></el-icon></el-button></el-tooltip>
          </div>
        </div>
      </div>
      </div>
    </template>

    <!-- 任务结束后的「本次改了哪些文件」汇总（trae 式 review）：跑的过程中不显示，
         结束后按会话聚合 pending 快照，可逐文件看 diff、保留或撤销。 -->
    <ChatTaskChangeSummary
      v-if="store.currentConvId"
      :conversation-id="store.currentConvId"
      :streaming="store.streaming"
    />

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

  <!-- 费用提醒条（2026-10-17，D4：只提醒、任务不停）。与 ask_user 表单同级的旁路 UI：
       不落消息流（否则进上下文，提醒自身推高它提醒的数字，坑 #15）。 -->
  <div v-if="costNotice" class="cost-notice-bar">
    <div class="cost-notice-icon"><el-icon><WarningFilled /></el-icon></div>
    <div class="cost-notice-body">
      <div class="cost-notice-text">{{ costNotice.text }}</div>
      <div class="cost-notice-actions">
        <el-button size="small" type="primary" @click="startContinuedConversation()">新开会话继续</el-button>
        <el-button size="small" @click="onDismissCostNotice">知道了</el-button>
        <el-button size="small" text @click="onCopyCostNotice()">复制</el-button>
      </div>
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
          <!-- 命令类：执行目录（模型可传 cwd；此前用户看不到命令在哪个目录跑） -->
          <div
            v-if="authIsCommand"
            class="inline-auth-cwd"
            :style="it.cwdInside === false ? 'color:#e5484d' : 'color:#8a8f98'"
          >
            <template v-if="it.cwd">
              执行目录 <code>{{ it.cwd }}</code>
              <span v-if="it.cwdInside === false">· 在工作目录之外</span>
              <span v-else-if="it.cwdInside === undefined">· 相对路径，基准为桌面主进程目录</span>
              <span v-else-if="it.cwdExplicit === false">· 默认工作目录</span>
            </template>
            <template v-else>执行目录未指定（继承桌面主进程目录）</template>
          </div>
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

  <!-- 只读会话工具授权卡（服务端只读权限闸命中写类工具后下发；批准后本任务内该工具放行） -->
  <div v-if="store.pendingToolAuth" class="inline-ask-card inline-auth-card">
    <div class="inline-ask-icon inline-auth-icon"><el-icon><Lock /></el-icon></div>
    <div class="inline-ask-body">
      <div class="inline-ask-question">只读会话：工具需要你授权执行</div>
      <div class="inline-ask-desc">
        工具 <code>{{ store.pendingToolAuth.toolName }}</code> 具有写副作用。
        批准后**本次任务内**该工具直接放行；拒绝后 AI 会改用只读方案。
      </div>
      <div v-if="store.pendingToolAuth.argsPreview" class="inline-auth-list">
        <div class="inline-auth-item">
          <span class="inline-auth-tag is-write">参数</span>
          <span class="inline-auth-path" :title="store.pendingToolAuth.argsPreview">{{ store.pendingToolAuth.argsPreview }}</span>
        </div>
      </div>
      <div class="inline-ask-actions">
        <el-button size="small" @click="store.submitPendingToolAuth('deny')">拒绝</el-button>
        <el-button size="small" type="primary" @click="store.submitPendingToolAuth('allow')">批准执行（本任务内放行）</el-button>
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
import { ref, reactive, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { useChat } from '../../composables/chat/useChat';
import { useMobileShell } from '../../composables/useMobileShell';
import { bindLongPress } from '../../composables/useLongPress';
import type { MessageRound } from '../../composables/chat/useChat';
import { stepRenderRange, ROUND_STEP_RENDER_LIMIT } from '../../composables/chat/message-rounds';
import SkeletonList from '../common/SkeletonList.vue';
import { useCodeStore } from '../../stores/code';
import { activeMode } from '../../stores/mode';
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
import DeepThinkBadge from './DeepThinkBadge.vue';
import { roundReasoningChars, roundReasoningText } from '../../composables/chat/reasoning-summary';
import ChatTaskChangeSummary from './ChatTaskChangeSummary.vue';
import { exportMarkdownDocx, absoluteMediaSrc, mediaOfTool, type MediaTarget } from '../../composables/useMediaPreview';

const {
  store, platformStore, fileStore, messagesRef, messageRounds, visibleRounds, ensureRoundVisible, formatTime, collapsedMessages, toggleMsgCollapse,
  renderMarkdown, renderAssistantMarkdown, handleContentClick, handleContentDblClick, handleContentContextMenu,
  copyMsg, editMsg, quoteMsg, distillUserMsg, delMsg,
  openSnapshotDialog, isLastRoundStreaming, getStreamingStep, parseConfigCard, getEditPlatform,
  getEditReason, onConfigSaved, expandedReasoning, toggleReasoning, expandedAgentProcess,
  toggleAgentProcess, expandedStepTools, toggleStepTools, getStepToolGroupClass, isStepToolsRunning,
  isStepToolsError, toggleTool, getStepToolStatusClass, getStepToolResult, isStepToolError, resolveToolDisplay,
  resolveToolArgs, toolTargetHint, expandedTools, toggleToolGroup, getToolGroupStatusClass, isToolGroupRunning,
  isToolGroupError, expandedToolGroups, getToolStatusClass, getToolResult, isToolError, isToolResultDone, requestToolResult, openToolItem, distillAssistantMsg, regenerateMsg,
  isToolItemOpen, collapsedSubAgentResults, toggleSubAgentResult, collapsedMainResults, toggleMainResult,
  copySubAgentResultMd, downloadSubAgentResultMd, copyAssistantMd, downloadAssistantMd,
  selectedModelId, input, openPlatformConfig, agentStore, skillStore, mountedSkillIds, onAgentSwitch,
  openPath,
  userRoundIndices, activeNavRound, scrollToRound,
  showScrollBottom, showScrollTop, scrollToBottom, historyLoading,
  askMultiSelect, askChecked, askSingle, askShowText, askText, askSupplement, onAskSubmit, onAskSkip,
  confirmCurrentPage, confirmMultiSelect, confirmChecked, confirmSingle, confirmShowText,
  confirmText, confirmSupplement, onConfirmSkip, onConfirmNext,
  costStore, startContinuedConversation,
} = useChat();

// 长工具结果默认限高，点「展开全部结果」看全；此前靠 mask 渐变收尾，短结果也会被吃掉最后几行。
const expandedToolResults = reactive<Record<string, boolean>>({});
function toggleToolResult(key: string) { expandedToolResults[key] = !expandedToolResults[key]; }
function isLongToolResult(text?: string | null): boolean {
  if (!text) return false;
  return text.length > 1200 || text.split('\n').length > 24;
}

// ── 费用提醒条（2026-10-17，D4：只提醒、任务不停）────────────────────────────
// ★ 提示条是**旁路 UI**，不落消息流：落进消息会进上下文，提醒自身在推高它提醒的数字（坑 #15）。
const costNotice = computed(() => costStore.activeNotice(store.currentConvId));

function onDismissCostNotice() {
  costStore.dismissNotice(store.currentConvId);
}
async function onCopyCostNotice() {
  if (!costNotice.value) return;
  try {
    await navigator.clipboard.writeText(costNotice.value.text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择文本');
  }
}
const isCodeMode = useCodeStore().codeModeActive;
const askSupplementOpen = ref(false);

// ===== 历史向前翻页（2026-10-11，懒加载的第二环）=====
// 首拉只载最近 50 条（store.loadMessages）；更早历史滚到顶部时经 IntersectionObserver 触发。
const historySentinelRef = ref<HTMLElement | null>(null);
/** 哨兵只在「还有更早历史」时渲染（翻到底/不足一页时消失，不再触发） */
const historySentinelVisible = computed(() => {
  const p = store.historyPagingByConv[store.currentConvId];
  return !!p && p.hasMore && store.currentMessages.length > 0;
});
const historyLoadingMore = computed(() => {
  const p = store.historyPagingByConv[store.currentConvId];
  return !!p && p.loading;
});
let historyObserver: IntersectionObserver | null = null;
/** 去重触发：观察回调可能在加载期间连发，loadMoreHistory 内部有 loading 闸门 */
function onHistorySentinelIntersect(entries: IntersectionObserverEntry[]) {
  if (!entries.some((e) => e.isIntersecting)) return;
  if (historyLoadingMore.value) return;
  const convId = store.currentConvId;
  if (!convId) return;
  // ★ 窗口化渲染（B1）：用户滚到顶 = 明确要看更早的内容 —— 先把窗口撑到最早，
  //   让 loadMoreHistory 翻出的轮次**真的进入 DOM**。不这么做会出现两个坏结果：
  //   ① 翻了页 DOM 高度不变 → 哨兵仍可见 → 连环翻页（把历史一次性拉光）；
  //   ② 用户以为"没反应"。撑开只影响"用户主动上滚"的场景，会话初次打开仍是末尾 30 轮。
  ensureRoundVisible(0);
  void store.loadMoreHistory(convId).then(() => {
    ensureRoundVisible(0);          // prepend 后新一轮成为第 0 轮 → 窗口随之再撑开
    return preserveScrollOnPrepend(convId);
  });
}

/**
 * prepend 更早消息后保持视口位置：记录加载前 scrollHeight，DOM 更新后把
 * scrollLeft/scrollTop 增加高度差 —— 用户视角"消息长出来了但没跳"。
 */
async function preserveScrollOnPrepend(convId: string) {
  if (convId !== store.currentConvId) return;
  await nextTick();
  const el = messagesRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight - prependScrollHeightBefore;
}
let prependScrollHeightBefore = 0;
watch(
  () => historyLoadingMore.value,
  (loading) => {
    if (loading) {
      const el = messagesRef.value;
      prependScrollHeightBefore = el ? el.scrollHeight : 0;
    }
  },
);

onMounted(() => {
  historyObserver = new IntersectionObserver(onHistorySentinelIntersect, {
    root: null,
    // 提前 120px 触发：用户还没真正滚到顶就开始拉，减少等待感
    rootMargin: '120px 0px 0px 0px',
    threshold: 0,
  });
  watch(
    [historySentinelRef, historySentinelVisible],
    () => {
      const obs = historyObserver;
      if (!obs) return;
      obs.disconnect();
      const el = historySentinelRef.value;
      if (el && historySentinelVisible.value) obs.observe(el);
    },
    { flush: 'post', immediate: true },
  );
});
onBeforeUnmount(() => {
  historyObserver?.disconnect();
  historyObserver = null;
});
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
  // ★ 窗口化渲染：窗口内第一个轮次没有"前一轮"可比较（前一轮在窗外未渲染），
  //   但它可能是换日的第一天 —— 该显示分隔线。用全量数组的前一轮判断即可，
  //   前一轮在窗外时 rounds[ri-1] 仍存在（数据在，只是没渲染），逻辑天然正确。
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
// ★ 2026-10-19：模板每次重渲都会对**每条**工具结果调用本函数（长任务一轮近 200 条、
//   单条可达 8KB）—— 实测是流式卡顿的固定开销。结果按原文做有界缓存，命中即返回。
const DETECT_PATH_CACHE_MAX = 300;
const detectPathCache = new Map<string, string | null>();
function detectPath(text: unknown): string | null {
  if (text == null) return null;
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  if (typeof s !== 'string') return null;
  const cached = detectPathCache.get(s);
  if (cached !== undefined) return cached;
  const m = s.match(/(?:[A-Za-z]:[\\/][^\s"'<>|]+)|(?:\/(?:home|Users|root|tmp|opt|var|src|projects|code|workspace)[^\s"'<>|]*)/);
  const out = m ? m[0].replace(/["',]+$/, '') : null;
  if (detectPathCache.size >= DETECT_PATH_CACHE_MAX) detectPathCache.clear();
  detectPathCache.set(s, out);
  return out;
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

// ★★★ 2026-10-11：本地 `renderAssistantMarkdown` 已移除 —— 改用 `useChat` 导出的
//   **带 LRU 缓存**的同名实现（见 useChat.ts 的 `renderAssistantMarkdown`）。
//   原因：本组件的本地版在调（带缓存的）`renderMarkdown` 前先做 4 次贪婪正则 + split，
//   这段预处理**不受缓存保护** ⇒ 流式每帧对 15.8KB 正文重跑正则，是卡顿第二主因。
//   语义完全一致（逻辑已整体搬进 useChat），4 处模板调用点不变。

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

/** 智能体思考过程是否展开：
 *  - 用户手动点过 → 听用户的
 *  - 没点过 → **默认收起**（与 Claude Code / ChatGPT 一致，不展示工具 args/result 细节，
 *    只留一行「N 次推理 · M 个工具调用」摘要；展开时才按需加载工具正文） */
function isProcessOpen(round: MessageRound, ri: number): boolean {
  const explicit = expandedAgentProcess['round-' + ri];
  if (explicit !== undefined) return explicit;
  return false;
}

/** 摘要条文案（2026-10-20）：运行中给"正在干啥"的实时状态，结束后给过程规模摘要。
 *  分档优先级：执行中工具 > 思考中（尚无步骤）> 生成回复中（工具间歇）> 结束摘要。 */
function processSummaryText(round: MessageRound, ri: number): string {
  const live = isRoundLive(round, ri);
  if (live) {
    // 从最近的步骤往前找第一个未完成工具（运行中的就挂在那）
    for (let si = round.steps.length - 1; si >= 0; si--) {
      const tcs = round.steps[si].toolCalls || [];
      for (let i = tcs.length - 1; i >= 0; i--) {
        if (!isToolResultDone(tcs[i].id)) {
          const d = resolveToolDisplay(tcs[i]);
          return `正在执行 ${d.server ? d.server + ' · ' : ''}${d.tool}…`;
        }
      }
    }
    if (!round.steps.length) return '等待模型响应…';
    return '生成回复中…';
  }
  const stats = round.agentStats;
  const stepCount = stats?.stepCount ?? round.steps.length;
  const toolCount = stats?.toolCallCount ?? round.allToolCalls.length;
  return `已处理 ${stepCount} 步 · ${toolCount} 次工具调用`;
}

/**
 * 单轮步骤渲染窗口（2026-10-19，修「长任务一跑界面卡死」）。
 *
 * 实测：抖音发布任务跑了 2 小时，**同一轮**里产生 193 个助手步骤 / 196 条工具结果
 * （124KB 文本）。按「轮」开窗对"一轮几百步"无效 ⇒ 全量挂 DOM，流式每帧整树重渲。
 * 这里只渲染末尾 40 步，更早的折叠成一行按钮；用户点开即恢复全量。
 *
 * ★ key 用全量下标（`agent-step-{ri}-{si}`）不变 —— 折叠只影响是否渲染，不影响交互状态。
 */
const expandedEarlierSteps = reactive<Record<string, boolean>>({});
// 换会话时清掉展开态：轮次下标按会话重置，旧 key 会误命中新会话的同下标轮次
watch(() => store.currentConvId, () => {
  for (const k of Object.keys(expandedEarlierSteps)) delete expandedEarlierSteps[k];
});
function stepRangeFor(round: MessageRound, ri: number): { start: number; end: number } {
  return stepRenderRange(round.steps.length, !!expandedEarlierSteps['round-' + ri]);
}
function hiddenStepCount(round: MessageRound, ri: number): number {
  return stepRangeFor(round, ri).start;
}
function hasHiddenSteps(round: MessageRound): boolean {
  return round.steps.length > ROUND_STEP_RENDER_LIMIT;
}
function isStepRendered(round: MessageRound, ri: number, si: number): boolean {
  const r = stepRangeFor(round, ri);
  return si >= r.start && si < r.end;
}
function toggleEarlierSteps(ri: number): void {
  const key = 'round-' + ri;
  expandedEarlierSteps[key] = !expandedEarlierSteps[key];
}

// ===== 截图工具结果内嵌预览（仅流式期间） =====
// 截图类工具（computer_screenshot 等）在结果 JSON 里带 screenshotUrl；流式进行中在
// 工具卡片下方直接展示画面，任务结束（store.streaming 变 false）后由响应式自动移除，
// 历史消息重载时也不展示——「即用即弃，不留存」。临时文件由插件清理器在 30 分钟后回收。
/**
 * 从工具结果文本解析内嵌预览地址；非 JSON / 无 screenshotUrl 返回 null。
 * 地址补全统一走 absoluteMediaSrc（API_BASE 已含 /api，服务端地址自身也带 /api）。
 */
const SCREENSHOT_URL_CACHE_MAX = 200;
const screenshotUrlCache = new Map<string, string | null>();
function resolveScreenshotUrl(resultText: string | null): string | null {
  if (!resultText) return null;
  const cached = screenshotUrlCache.get(resultText);
  if (cached !== undefined) return cached;
  let out: string | null = null;
  try {
    const j = JSON.parse(resultText) as { screenshotUrl?: unknown; type?: unknown };
    const u = j.screenshotUrl;
    // 带 type 的是生图产物（走产品预览通道，常驻展示），这里只认临时截图
    if (typeof u === 'string' && u && j.type !== 'image') out = absoluteMediaSrc(u);
  } catch { out = null; }
  if (screenshotUrlCache.size >= SCREENSHOT_URL_CACHE_MAX) screenshotUrlCache.clear();
  screenshotUrlCache.set(resultText, out);
  return out;
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

/**
 * 是否渲染主智能体「任务结果」卡片：有正文 / 有思考（含 agent 各步骤）/ 正在流式输出。
 *
 * ★ 2026-10-21：思考判定从「只看最终回答的 reasoningContent 且无工具调用」改成
 *   `roundReasoningChars(round) > 0` —— 否则 agent 模式（几乎总在调工具）里
 *   卡片压根不渲染，「深度思考」徽标也就永远看不到。
 */
function hasMainResult(round: MessageRound, ri: number): boolean {
  return !!(round.finalAssistant?.content ||
    roundReasoningChars(round) > 0 ||
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

/**
 * 流式思考的「跑马灯摘要」：只取最后 140 个字压成一行。
 *
 * ★ 为什么不铺全文：思考正文常常几千字，平铺会把正在生成的回答挤到屏幕外
 *   （用户原话「模型深度思考内容会展示出来？」—— 他看到的就是这种刷屏）。
 *   想看全的点徽标展开，全文仍在 reasoning-body 里。
 */
function reasoningPeek(text: string): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return flat.length > 140 ? `…${flat.slice(-140)}` : flat;
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

/* ── 历史向前翻页哨兵：常态只占一条线高度（保证能进视口触发），加载中显示一行小字 */
.history-sentinel {
  min-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.history-sentinel-loading {
  font-size: 12px;
  color: var(--color-text-secondary, #94a3b8);
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
  /* ★★ 高度约束（2026-10-18 实拍截图：确认卡底部「补充说明/跳过/下一页」被裁掉且点不到）：
     这批旁路卡渲染在 .messages 滚动容器**外面**，是聊天列（.cp-chat-msgs / .chat-column，
     均 overflow:hidden）的直接 flex 子项。flex 子项默认 min-height:auto = 内容高度，
     卡一高就拒绝收缩 → 列被撑爆 → 底部被 overflow:hidden 裁掉，按钮完全点不到。
     修法 = 给卡限高（列高的 60%，保住 .messages 至少 40%）+ body 内部滚动。
     ★ 只用 min-height:0 不够：收缩分配按 flex-basis 加权，.messages basis=0 吸收 0 收缩，
       卡会把 .messages 挤到 0 高 —— 必须配合 max-height 把卡的基础尺寸先钳住。 */
  min-height: 0;
  max-height: 60%;
  overflow: hidden;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: 16px; border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  animation: inline-ask-in .25s ease-out;
}
/* 费用提醒条（D4）：与 inline-ask 同族材质，但语义是"仪表超量" ⇒ 警告色描边 */
.cost-notice-bar {
  display: flex; gap: 10px; margin: 12px auto; padding: 14px 16px;
  max-width: 85%;
  /* 同 .inline-ask-card：旁路卡也要限高 + 内部滚动，否则高卡在矮列里被裁底 */
  min-height: 0;
  max-height: 60%;
  overflow: hidden;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 16px; border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  animation: inline-ask-in .25s ease-out;
}
.cost-notice-icon {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
  background: var(--el-color-warning); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}
.cost-notice-body { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
/* 文案由后端模板生成（多行）⇒ 保留换行；不落消息流所以这里的 pre-wrap 不会进上下文 */
.cost-notice-text {
  font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  color: var(--el-text-color-primary, #fff);
}
.cost-notice-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@keyframes inline-ask-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.inline-ask-icon {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
  background: var(--color-primary); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}
.inline-ask-body { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
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
/* 「深度思考」徽标下方的实时摘要：单行、右端渐隐（读起来像在滚动播报） */
.dtb-peek {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-mask-image: linear-gradient(90deg, #000 84%, transparent 100%);
  mask-image: linear-gradient(90deg, #000 84%, transparent 100%);
  animation: dtbPeekIn 0.35s ease-out;
}
@keyframes dtbPeekIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 0.85; transform: none; }
}

/* 思考过程区域：平滑出现动画 */
.agent-process-header {
  animation: fadeInDown 0.25s ease-out;
}
.agent-process-steps {
  animation: fadeInDown 0.3s ease-out;
}

/* ===== 运行状态摘要条（2026-10-20）：工具过程默认收起后的"过程还活着"证据 ===== */
.agent-process-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 16px;
  user-select: none;
}
.agent-process-summary.is-clickable {
  cursor: pointer;
}
.agent-process-summary.is-clickable:hover {
  background: var(--el-fill-color, #ebeef5);
  color: var(--el-text-color-regular, #606266);
}
.agent-process-summary-icon {
  flex: 0 0 auto;
}
.agent-process-summary-text {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-process-summary-chevron {
  flex: 0 0 auto;
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