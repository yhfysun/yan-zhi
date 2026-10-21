<template>
  <ConsoleShell storage-key="ops_aside" root-class="ops-console" @aside-contextmenu="onTreeCtx">
    <!-- 左侧：资源列表（可整体收起；目录行可折叠；空白处右键新建，资源行右键出操作菜单）
         ★ 盒子（布局 / 分隔条 / 折叠条 / 宽度持久化）在 components/console/ConsoleShell.vue -->
    <template #aside>
        <!-- 任务段（决策 13 / 5f.4）：四模式同构，读同一份会话列表；资源树之下保留
             ★ 可折叠：顶栏「历史任务」按钮控制（用户实报「历史任务按钮没了 / 发送后任务就没了」） -->
        <div v-show="taskListVisible" class="ops-side-tasks">
          <TaskListSection :space-id="null" />
        </div>
        <!-- 发布项目（7b）：本地目录 + 服务器 + 流水线；绑定后工具面挂到当前窗口会话 -->
        <div class="ops-side-release">
          <ReleaseProjectPanel
            :active-project-id="activeWin?.releaseProject?.id || ''"
            @bind="onBindReleaseProject"
            @unbind="onUnbindReleaseProject"
            @open-release="mode = 'release'"
          />
        </div>
        <div class="ops-tree-head">
          <span class="ops-tree-title">资源</span>
          <span class="ops-tree-actions">
            <button class="ops-tree-new" type="button" title="命令广播（多机执行）" @click.stop="broadcastOpen = true">
              <el-icon :size="12"><Promotion /></el-icon>
            </button>
            <button class="ops-tree-new" type="button" title="新增资源" @click.stop="openAddDialog">
              <el-icon :size="12"><Plus /></el-icon>
            </button>
          </span>
        </div>
        <!-- 资源树：目录可嵌套（子目录在前、资源在后），支持拖拽调整归属 -->
        <div
          class="ops-tree"
          :class="{ 'is-dragging': !!dragKind, 'is-root-drop': dropTargetId === '__root__' }"
          @dragover="onDragOverGroup($event, '__root__')"
          @dragleave="onDragLeaveGroup('__root__')"
          @drop="onDropOnGroup('__root__')"
        >
          <template v-for="row in treeRows" :key="row.kind + ':' + row.id">
            <!-- 目录行：可折叠；右键出操作菜单；可作为拖拽源与目标 -->
            <div
              v-if="row.kind === 'group'"
              class="ops-group-row"
              :class="{
                'is-drop': dropTargetId === row.id,
                'is-drag-src': dragKind === 'group' && dragId === row.id,
              }"
              :style="{ paddingLeft: 5 + row.depth * 12 + 'px' }"
              :draggable="row.id !== UNGROUPED"
              @dragstart.stop="onRowDragStart($event, 'group', row.id)"
              @dragend="onRowDragEnd"
              @dragover.stop="onDragOverGroup($event, row.id)"
              @dragleave="onDragLeaveGroup(row.id)"
              @drop.stop="onDropOnGroup(row.id)"
              @click="toggleGroup(row.id)"
              @contextmenu.prevent.stop="row.id === UNGROUPED ? onTreeCtx($event) : onGroupCtx(row.group!, $event)"
            >
              <el-icon class="ops-group-caret">
                <ArrowDown v-if="isExpanded(row.id)" /><ArrowRight v-else />
              </el-icon>
              <el-icon class="ops-group-folder"><Folder /></el-icon>
              <span class="ops-group-name" :title="row.name">{{ row.name }}</span>
              <span class="ops-group-count">{{ row.group!.items.length }}</span>
            </div>

            <!-- 资源行：点击打开；右键出操作菜单；可拖入目录 -->
            <div
              v-else
              class="ops-conn-row"
              :class="{
                active: isConnActive(row.id),
                'is-drag-src': dragKind === 'conn' && dragId === row.id,
              }"
              :style="{ paddingLeft: 8 + row.depth * 12 + 'px' }"
              :title="connTitle(row.conn!)"
              draggable="true"
              @dragstart.stop="onRowDragStart($event, 'conn', row.id)"
              @dragend="onRowDragEnd"
              @click="openConnection(row.conn!)"
              @contextmenu.prevent.stop="onConnCtx(row.conn!, $event)"
            >
              <span class="ops-conn-dot" :data-type="connType(row.conn!)" />
              <span class="ops-conn-name">{{ row.name }}</span>
              <span
                v-if="row.conn!.jumpConnectionId"
                class="ops-conn-jump"
                :title="`经跳板 ${jumpNameOf(row.conn!)}`"
              >跳板</span>
              <span v-if="testingId === row.id" class="ops-conn-testing">测试中…</span>
              <el-tag v-if="row.conn!.tag" size="small" :type="isProdTag(row.conn!.tag) ? 'danger' : 'info'">{{ row.conn!.tag }}</el-tag>
            </div>
          </template>
          <div v-if="!treeRows.length" class="ops-group-empty">暂无资源，在列表空白处右键新建连接</div>
        </div>

        <!-- 实时面板（任务 7.4）：跟随当前激活连接（SSH / Docker），10s 轮询只读指标 -->
        <div v-if="activeConn && connType(activeConn) !== 'database'" class="ops-side-metrics">
          <OpsMetricsPanel :connection-id="activeConn.id" :conn-name="activeConn.name" />
        </div>
    </template>

    <!-- 右侧：两个 tab（工作区 / 操作日志）；工作区内是一排窗口标签，每个窗口独立会话 -->
    <section class="ops-workspace">
        <!-- 待批准命令：AI 在生产连接上发起的写操作会停在这里等人点头（任何 Tab 下都可见） -->
        <div v-if="approvals.length" class="ops-approvals">
          <div v-for="a in approvals" :key="a.id" class="ops-approval">
            <span class="ops-approval-tag">待批准</span>
            <span class="ops-approval-conn">{{ a.connectionName }}</span>
            <code class="ops-approval-cmd" :title="a.command">{{ a.command }}</code>
            <div class="ops-approval-actions">
              <el-button size="small" type="primary" @click="decideApproval(a, true)">批准</el-button>
              <el-button size="small" @click="decideApproval(a, false)">拒绝</el-button>
            </div>
          </div>
        </div>

        <el-tabs v-model="mode" class="ops-tabs" @tab-change="onTabChange">
          <el-tab-pane label="工作区" name="main">
            <div class="ops-main-tab">
              <!-- 顶部一行：窗口标签（左） + 整体设置（右，与具体连接无关） -->
              <div v-if="windows.length" class="ops-topbar">
                <div class="ops-win-tabs">
                  <div
                    v-for="w in windows"
                    :key="w.id"
                    class="ops-win-tab"
                    :class="{ active: w.id === activeWinId }"
                    :title="winTitle(w)"
                    @click="activateWindow(w.id)"
                    @mousedown.middle.prevent="closeWindow(w.id)"
                    @contextmenu.prevent="onWinCtx(w, $event)"
                  >
                    <span class="ops-win-tab-dot" :data-type="connType(connOf(w))" />
                    <span class="ops-win-tab-name">{{ winLabel(w) }}</span>
                    <el-icon class="ops-win-tab-close" @click.stop="closeWindow(w.id)"><Close /></el-icon>
                  </div>
                </div>

                <!-- 整体设置：历史任务 / 文件面板开关，所有窗口共用（区别于每个连接自己的操作） -->
                <div class="ops-topbar-global">
                  <!-- 历史任务：左栏任务段可折叠，收起来时就找不到入口 —— 这里常驻一个，
                       点开左栏任务段（折叠状态自动展开）。内部优化，不加额外提示文案。 -->
                  <el-button
                    size="small"
                    :icon="Clock"
                    :type="taskListVisible ? 'primary' : ''"
                    title="历史任务"
                    @click="toggleTaskList"
                  />
                  <el-button
                    v-if="canFileNow"
                    size="small"
                    :icon="FolderOpened"
                    :type="filePanelOpen ? 'primary' : ''"
                    title="文件"
                    @click="toggleFilePanel()"
                  />
                </div>
              </div>

              <!-- 各窗口内容 + 全局文件面板 并排：v-show 保留（终端 DOM 必须常驻，切走再切回不能重建） -->
              <div v-if="windows.length" class="ops-body">
              <div class="ops-win-body">
                <div v-for="w in windows" :key="w.id" v-show="w.id === activeWinId" class="ops-win">
                  <!-- 窗口头：连接信息 + 本连接自己的操作（对话 ⇄ 命令视图的切换见右下角主导方悬浮胶囊） -->
                  <div class="ops-win-head">
                    <span class="ops-win-conn">{{ winConnInfo(w) }}</span>
                    <div class="ops-win-head-actions">
                      <span v-if="w.view === 'term' && w.termConnecting" class="ops-term-hint">连接中…</span>
                      <span
                        v-if="w.view === 'term' && w.termOpen && w.termRecording"
                        class="ops-rec-chip"
                        title="本次会话正在录制，可在「录像」页回放"
                      ><span class="ops-rec-dot" />录制中</span>
                      <el-button v-if="w.view === 'container'" size="small" @click="loadContainers(w)">刷新</el-button>
                      <el-button
                        v-if="w.view === 'term' && !w.termOpen"
                        size="small"
                        type="primary"
                        :loading="w.termConnecting"
                        @click="openTerminal(w)"
                      >连接终端</el-button>
                    </div>
                  </div>

                  <div class="ops-main">
                    <div class="ops-main-primary">
                      <!-- 命令模式（xterm 终端） -->
                      <div v-show="w.view === 'term'" class="ops-term-wrap">
                        <div :ref="(el: any) => setTermEl(w.id, el)" v-show="w.termOpen" class="ops-term"></div>
                        <div v-if="!w.termOpen" class="ops-term-empty">
                          <p class="ops-term-empty-title">未连接终端</p>
                          <p class="ops-term-empty-sub">点「连接终端」，进入交互式 SSH Shell</p>
                        </div>
                      </div>

                      <!-- 容器（docker 类型连接） -->
                      <div v-show="w.view === 'container'" class="ops-docker">
                        <div v-if="w.containersError" class="ops-docker-error">{{ w.containersError }}</div>
                        <el-table v-if="w.containers.length" :data="w.containers" size="small" height="100%" class="ops-docker-table">
                          <el-table-column prop="Names" label="名称" min-width="160" show-overflow-tooltip />
                          <el-table-column prop="Image" label="镜像" min-width="180" show-overflow-tooltip />
                          <el-table-column prop="State" label="状态" width="90">
                            <template #default="{ row }">
                              <el-tag size="small" :type="row.State === 'running' ? 'success' : 'info'">{{ row.State }}</el-tag>
                            </template>
                          </el-table-column>
                          <el-table-column prop="Status" label="详情" min-width="140" show-overflow-tooltip />
                          <el-table-column label="操作" width="150" fixed="right">
                            <template #default="{ row }">
                              <el-button link size="small" @click="viewLogs(w, row)">日志</el-button>
                              <el-button link size="small" type="warning" @click="restartContainer(w, row)">重启</el-button>
                            </template>
                          </el-table-column>
                        </el-table>
                        <div v-else class="ops-empty">点上方「刷新」查看该主机上的容器</div>
                      </div>

                      <!-- 数据库（database 类型连接，只读） -->
                      <div v-show="w.view === 'db'" class="ops-db">
                        <div class="ops-db-bar">
                          <el-select
                            v-model="w.dbTable"
                            placeholder="选择表（可选）"
                            size="small"
                            clearable
                            filterable
                            class="ops-db-table-select"
                            @visible-change="(v: boolean) => v && loadDbTables(w)"
                            @change="(t: string) => onPickTable(w, t)"
                          >
                            <el-option v-for="t in w.dbTables" :key="t" :label="t" :value="t" />
                          </el-select>
                          <el-button size="small" :loading="w.dbLoading" type="primary" :disabled="!w.dbSql.trim()" @click="runDbQuery(w)">
                            运行 (Ctrl+Enter)
                          </el-button>
                          <span class="form-tip">仅支持只读查询：SELECT / SHOW / DESC / EXPLAIN / WITH，写操作一律拒绝</span>
                        </div>
                        <el-input
                          v-model="w.dbSql"
                          type="textarea"
                          :rows="4"
                          class="ops-db-sql"
                          placeholder="如：SELECT * FROM users ORDER BY id DESC LIMIT 20"
                          @keydown.ctrl.enter="runDbQuery(w)"
                        />
                        <div v-if="w.dbError" class="ops-docker-error">{{ w.dbError }}</div>
                        <div v-if="w.dbResult" class="ops-db-meta">
                          {{ w.dbResult.rows.length }} 行{{ w.dbResult.truncated ? `（已截断，仅显示前 200 行）` : '' }}
                        </div>
                        <el-table
                          v-if="w.dbResult && w.dbResult.rows.length"
                          :data="w.dbResult.rows"
                          size="small"
                          height="100%"
                          class="ops-docker-table"
                          border
                        >
                          <el-table-column
                            v-for="f in w.dbResult.fields"
                            :key="f"
                            :prop="f"
                            :label="f"
                            min-width="120"
                            show-overflow-tooltip
                          />
                        </el-table>
                        <div v-else-if="w.dbResult && !w.dbResult.rows.length" class="ops-empty">查询成功，0 行结果</div>
                      </div>

                      <!-- 对话模式：内置运维助手（每个窗口独立会话） -->
                      <div v-show="w.view === 'chat'" class="ops-chat">
                        <!-- 绑定发布项目条（7b）：让用户一眼看到本任务发布的是哪个本地目录 -->
                        <div v-if="w.releaseProject" class="ops-bound-bar">
                          <span class="ops-bound-title">已绑定发布项目：{{ w.releaseProject.name }}</span>
                          <span class="ops-bound-path" :title="w.releaseProject.localDir">{{ w.releaseProject.localDir }}</span>
                        </div>
                        <div :ref="(el: any) => setChatEl(w.id, el)" class="ops-chat-list" @click="onMdClick">
                          <div v-if="!w.chatMessages.length" class="ops-chat-welcome">
                            <el-icon :size="30" class="ops-chat-welcome-icon"><ChatDotRound /></el-icon>
                            <p class="ops-chat-welcome-title">运维助手</p>
                            <p class="ops-chat-welcome-sub">
                              描述运维任务，我来执行：看容器日志、查库、传文件、改配置……<br />
                              也能直接帮你新建连接和资源目录。
                            </p>
                          </div>
                          <!-- 按「轮」渲染（2026-10-21 对齐 WorkBuddy 的呈现）：
                               每轮 = 用户一句话 + 该轮 思考 / 工具 / 回复，三段就近聚在一起。
                               此前是按条平铺 + 步骤卡堆在列表底部，用户看不出
                               "这句话的执行过程在哪、它的结论是哪段"。 -->
                          <div v-for="(rd, ri) in roundsOf(w)" :key="rd.user?.id || 'rd-' + ri" class="ops-round">
                            <!-- 用户消息 -->
                            <div v-if="rd.user" class="ops-msg msg-user">
                              <div class="ops-msg-avatar avatar-user"><el-icon :size="15"><User /></el-icon></div>
                              <div class="ops-msg-body">
                                <div class="ops-msg-meta">
                                  <span class="ops-msg-role-name">我</span>
                                  <span v-if="rd.user.createdAt" class="ops-msg-time">{{ fmtTime(rd.user.createdAt) }}</span>
                                </div>
                                <div class="ops-msg-content">{{ rd.user.content }}</div>
                              </div>
                            </div>

                            <!-- 助手侧：思考 → 工具 → 回复 -->
                            <div class="ops-msg msg-assistant">
                              <div class="ops-msg-avatar avatar-assistant">
                                <el-icon :size="15"><ChatDotRound /></el-icon>
                              </div>
                              <div class="ops-msg-body">
                                <div class="ops-msg-meta">
                                  <span class="ops-msg-role-name">运维助手</span>
                                  <span v-if="rd.streaming" class="ops-msg-streaming">输出中…</span>
                                </div>

                                <!-- ① 深度思考：与主对话同一个徽标组件，默认收起，点开看全文 -->
                                <div v-if="rd.reasoning" class="msg-reasoning">
                                  <DeepThinkBadge
                                    :state="rd.streaming && !rd.answer ? 'thinking' : 'done'"
                                    :chars="rd.reasoning.length"
                                    :open="!!expandedReasoning[activeWinId + ':' + ri]"
                                    @toggle="toggleRoundReasoning(ri)"
                                  />
                                  <div v-if="expandedReasoning[activeWinId + ':' + ri]" class="reasoning-body">{{ rd.reasoning }}</div>
                                </div>

                                <!-- ② 工具：一行摘要（执行中转圈 / 结束后 N 次调用），点开才是步骤明细 -->
                                <div
                                  v-if="rd.steps.length"
                                  class="ops-tool-summary"
                                  :class="{ 'is-live': rd.streaming, 'is-open': stepsOpen[activeWinId + ':' + ri] }"
                                  @click="toggleRoundSteps(ri)"
                                >
                                  <el-icon :size="13" class="ops-tool-summary-icon">
                                    <Loading v-if="rd.streaming" class="is-loading" />
                                    <CircleCheck v-else-if="!rd.steps.some((s) => s.status === 'failed')" />
                                    <WarningFilled v-else />
                                  </el-icon>
                                  <span class="ops-tool-summary-text">{{ roundToolSummary(rd.steps) }}</span>
                                  <el-icon :size="11" class="ops-tool-summary-caret"><ArrowRight /></el-icon>
                                </div>
                                <div v-if="stepsOpen[activeWinId + ':' + ri]" class="ops-tool-steps">
                                  <OpsStepCards :steps="rd.steps" />
                                </div>

                                <!-- ③ 回复：流式期间原样显示增量，结束后 markdown -->
                                <div v-if="roundAnswerText(rd)" class="ops-msg-content ops-md" v-html="renderAssistantMarkdown(roundAnswerText(rd))"></div>
                                <div v-else-if="rd.streaming && !roundAnswerText(rd) && !rd.reasoning && !rd.steps.length" class="ops-msg-content ops-typing">
                                  <span class="typing-dots"><span></span><span></span><span></span></span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="ops-chat-input">
                          <el-input
                            :ref="(el: any) => setChatInputEl(w.id, el)"
                            v-model="w.chatInput"
                            type="textarea"
                            :rows="2"
                            :disabled="w.chatStreaming"
                            :placeholder="chatPlaceholder(w)"
                            @keydown.ctrl.enter="submitWinChat(w)"
                          />
                          <!-- 输入框工具条（P0）：左=动作语义 + 工作目录，右=模型 / 静默权限 / 发送 -->
                          <div class="ops-input-toolbar">
                            <div class="ops-toolbar-group">
                              <el-button size="small" class="ops-tool-btn" :class="{ 'ops-tool-btn-active': (w.chatMode || 'agent') === 'exec' }" plain title="执行模式：发送时直接写终端，不经过模型" @click="w.chatMode = 'exec'">执行</el-button>
                              <el-button size="small" class="ops-tool-btn" :class="{ 'ops-tool-btn-active': (w.chatMode || 'agent') === 'agent' }" plain title="Agent 模式：发送给运维助手执行" @click="w.chatMode = 'agent'">Agent</el-button>
                              <el-button size="small" class="ops-tool-btn" :class="{ 'ops-tool-btn-active': (w.chatMode || 'agent') === 'background' }" plain title="后台模式：提交为后台 AI 任务，关掉面板也会继续" @click="w.chatMode = 'background'">后台</el-button>
                            </div>
                            <!-- 工作目录（对齐主对话输入区）：点开即切换本窗口任务的根目录 -->
                            <button
                              class="ops-dir-btn"
                              type="button"
                              :title="`工作目录：${workspaceDirLabel}\n点击切换（影响本窗口 AI 任务的读写与相对路径解析）`"
                              @click="showDirPicker = true"
                            >
                              <el-icon :size="13"><FolderOpened /></el-icon>
                              <span class="ops-dir-name">{{ workspaceDirName }}</span>
                            </button>
                            <div class="ops-toolbar-spacer"></div>
                            <el-select
                              v-model="w.modelId"
                              size="small"
                              class="ops-model-select"
                              placeholder="默认模型"
                              :disabled="w.chatStreaming"
                              @visible-change="onModelDropdown"
                            >
                              <el-option :value="''" :label="`默认（${defaultModelLabel}）`" />
                              <el-option v-for="m in chatModelOptions" :key="m.id" :value="m.id" :label="modelLabel(m)" />
                            </el-select>
                            <el-popover placement="top-end" :width="268" trigger="click">
                              <template #reference>
                                <el-button size="small" text class="ops-perm-btn" :disabled="!connOf(w)" title="静默权限（按连接）">
                                  <el-icon :size="14"><Setting /></el-icon>
                                </el-button>
                              </template>
                              <div class="ops-perm-panel">
                                <div class="ops-perm-title">静默权限 · {{ connOf(w)?.name || '未选择连接' }}</div>
                                <p class="ops-perm-sub">开启后，该连接上的对应操作不再逐条等待批准。危险命令黑名单始终优先；按连接保存，默认全关。</p>
                                <div class="ops-perm-row">
                                  <span>静默读取文件</span>
                                  <el-switch :model-value="silentOf(connOf(w)).read" size="small" @change="saveSilent(w, 'read', $event === true)" />
                                </div>
                                <div class="ops-perm-row">
                                  <span>静默修改文件</span>
                                  <el-switch :model-value="silentOf(connOf(w)).write" size="small" @change="saveSilent(w, 'write', $event === true)" />
                                </div>
                                <div class="ops-perm-row">
                                  <span>静默执行命令</span>
                                  <el-switch :model-value="silentOf(connOf(w)).exec" size="small" @change="saveSilent(w, 'exec', $event === true)" />
                                </div>
                                <div v-if="isProdConn(connOf(w))" class="ops-perm-warn">
                                  ⚠ 生产连接：开启「静默执行命令 / 修改文件」将跳过人工审批，审计以 via=silent 标记。
                                </div>
                                <p class="ops-perm-sub">注：读取类操作当前本就免批；读取档按连接保存，供后续更细粒度能力使用。</p>
                              </div>
                            </el-popover>
                            <span v-if="w.chatStreaming" class="form-tip">执行中…</span>
                            <el-button v-if="w.chatStreaming" size="small" type="warning" @click="abortWinChat(w)">停止</el-button>
                            <el-button size="small" :disabled="w.chatStreaming || !w.chatInput.trim()" type="primary" @click="submitWinChat(w)">{{ sendLabel(w) }}</el-button>
                          </div>
                          <!-- 底部命令行（任务 7.7）：显示当前执行到第几步 / 需要确认的步骤；点击聚焦输入框追加指令 -->
                          <div class="ops-cmdline" :class="{ running: w.chatStreaming, confirm: cmdlineNeedConfirm(w) }" @click="focusChatInput(w)">
                            <span class="ops-cmdline-prompt">›</span>
                            <span class="ops-cmdline-text">{{ cmdlineText(w) }}</span>
                            <span class="ops-cmdline-caret">▌</span>
                          </div>
                        </div>
                      </div>

                      <!-- 命令模式底部折叠条（任务 7.8）：展开是真对话，与 AI 模式共用同一份窗口会话 -->
                      <div v-show="w.view !== 'chat'" class="ops-cmdchat" :class="{ open: !!w.cmdChatOpen }">
                        <div class="ops-cmdchat-bar" @click="toggleCmdChat(w)">
                          <el-icon :size="12"><ChatDotRound /></el-icon>
                          <span class="ops-cmdchat-title">AI 助手</span>
                          <span class="ops-cmdchat-preview">{{ chatPreview(w) }}</span>
                          <span class="ops-cmdchat-spacer"></span>
                          <el-icon :size="11"><ArrowUp v-if="w.cmdChatOpen" /><ArrowDown v-else /></el-icon>
                        </div>
                        <div v-show="w.cmdChatOpen" class="ops-cmdchat-body">
                          <div :ref="(el: any) => setStripEl(w.id, el)" class="ops-cmdchat-msgs" @click="onMdClick">
                            <div v-if="!w.chatMessages.length" class="ops-cmdchat-empty">描述运维任务让助手执行，或点下面的快捷指令</div>
                            <!-- 与 AI 模式同构：按轮展示，思考/工具/回复就近（折叠条空间小，工具明细默认收起） -->
                            <div v-for="(rd, ri) in roundsOf(w)" :key="'s' + (rd.user?.id || ri)" class="ops-round ops-round-sm">
                              <div v-if="rd.user" class="ops-msg ops-msg-sm msg-user">
                                <div class="ops-msg-body">
                                  <div class="ops-msg-meta"><span class="ops-msg-role-name">我</span></div>
                                  <div class="ops-msg-content">{{ rd.user.content }}</div>
                                </div>
                              </div>
                              <div class="ops-msg ops-msg-sm msg-assistant">
                                <div class="ops-msg-body">
                                  <div class="ops-msg-meta">
                                    <span class="ops-msg-role-name">运维助手</span>
                                    <span v-if="rd.streaming" class="ops-msg-streaming">输出中…</span>
                                  </div>
                                  <div v-if="rd.reasoning" class="msg-reasoning">
                                    <DeepThinkBadge
                                      :state="rd.streaming && !rd.answer ? 'thinking' : 'done'"
                                      :chars="rd.reasoning.length"
                                      :open="!!expandedReasoning['sm:' + activeWinId + ':' + ri]"
                                      @toggle="toggleRoundReasoning(ri, 'sm:')"
                                    />
                                    <div v-if="expandedReasoning['sm:' + activeWinId + ':' + ri]" class="reasoning-body">{{ rd.reasoning }}</div>
                                  </div>
                                  <div v-if="rd.steps.length" class="ops-tool-summary" :class="{ 'is-live': rd.streaming }">
                                    <el-icon :size="12" class="ops-tool-summary-icon">
                                      <Loading v-if="rd.streaming" class="is-loading" />
                                      <CircleCheck v-else />
                                    </el-icon>
                                    <span class="ops-tool-summary-text">{{ roundToolSummary(rd.steps) }}</span>
                                  </div>
                                  <div v-if="roundAnswerText(rd)" class="ops-msg-content ops-md" v-html="renderAssistantMarkdown(roundAnswerText(rd))"></div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div class="ops-cmdchat-chips">
                            <button
                              v-for="q in QUICK_CMDS"
                              :key="q"
                              class="ops-chip"
                              type="button"
                              :disabled="w.chatStreaming"
                              @click="runQuickCmd(w, q)"
                            >{{ q }}</button>
                          </div>
                          <div class="ops-cmdchat-input">
                            <el-input
                              v-model="w.chatInput"
                              size="small"
                              :disabled="w.chatStreaming"
                              placeholder="追加指令，Enter 发送"
                              @keydown.enter="submitWinChat(w)"
                            />
                            <el-button v-if="w.chatStreaming" size="small" type="warning" @click="abortWinChat(w)">停止</el-button>
                            <el-button size="small" type="primary" :disabled="w.chatStreaming || !w.chatInput.trim()" @click="submitWinChat(w)">发送</el-button>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              <!-- 全局文件面板：由顶部「文件」开关控制（整体设置），内容跟随当前激活窗口的连接 -->
              <template v-if="filePanelOpen && canFileNow && activeWin && activeConn">
                <div
                  class="rs-handle rs-handle-right"
                  title="拖动调整文件面板宽度"
                  @mousedown="fileR.startDrag($event, 'right')"
                ></div>
                <div class="ops-main-files" :style="{ width: fileW + 'px' }">
                  <SftpPanel
                    :key="activeWin.id"
                    :compact="true"
                    :connection-id="activeWin.connectionId"
                    :conn="{
                      id: activeConn.id,
                      name: activeConn.name,
                      host: activeConn.host,
                      username: activeConn.username,
                      tag: activeConn.tag,
                      sftpPath: activeConn.sftpPath,
                    }"
                  />
                </div>
              </template>
              </div>

              <div v-else class="ops-workspace-empty">
                <el-empty description="在左侧资源列表里选一个连接开始：点名称进 shell；右键可新建/文件管理/新窗口/编辑/删除" />
              </div>
            </div>
          </el-tab-pane>

          <!-- 操作日志：ssh/docker/db 工具执行审计（LLM 调用明细见「工具与连接 → LLM 日志」页） -->
          <el-tab-pane label="操作日志" name="log">
            <div class="ops-audit">
              <div class="ops-docker-bar">
                <el-button size="small" @click="loadAudit">刷新</el-button>
                <span class="form-tip">ssh/docker/db 工具执行全量审计（含拒绝项）；LLM 调用明细在「工具与连接 → LLM 日志」按会话/模型统计</span>
              </div>
              <el-table v-if="auditEntries.length" :data="auditEntries" size="small" height="100%" class="ops-docker-table">
                <el-table-column label="时间" width="100">
                  <template #default="{ row }">{{ fmtTime(row.at) }}</template>
                </el-table-column>
                <el-table-column prop="action" label="操作" width="150" show-overflow-tooltip />
                <el-table-column prop="connection" label="连接" width="110" show-overflow-tooltip />
                <el-table-column prop="detail" label="详情" min-width="260" show-overflow-tooltip />
                <el-table-column label="结果" width="130">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.ok ? 'success' : 'danger'">{{ row.ok ? '成功' : '失败/拒绝' }}</el-tag>
                    <el-tag v-if="row.via === 'silent'" size="small" type="warning" class="ops-audit-via">静默</el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <div v-else class="ops-empty">暂无操作记录 —— 对话模式/工具执行的每一条 ssh/docker/db 操作都会落在这里</div>
            </div>
          </el-tab-pane>

          <!-- 录像：终端会话的 asciinema .cast 录制与回放（合规留痕 + 事后复盘） -->
          <el-tab-pane label="录像" name="rec">
            <OpsRecordingsPanel ref="recPanelRef" />
          </el-tab-pane>

          <!-- 主机密钥：SSH 信任根的可视化与「忘记」入口 -->
          <el-tab-pane label="主机密钥" name="kh">
            <OpsKnownHostsPanel ref="khPanelRef" />
          </el-tab-pane>

          <!-- 发布（7b.15）：CICD 控制台并入运维工作台，与终端/文件/数据库并列 -->
          <el-tab-pane label="发布" name="release" lazy>
            <CicdConsole />
          </el-tab-pane>
        </el-tabs>
      </section>

    <!-- 工作目录选择（输入框工具条入口）：选定后写入全局设置，本窗口任务按它解析相对路径 -->
    <WorkspaceDirDialog v-model="showDirPicker" :current-path="workspaceDirLabel" @selected="onWorkspaceDirSelected" />

    <!-- 资源 / 目录 右键菜单（自绘，与文件页同款） -->
    <Teleport to="body">
<div
      v-if="treeCtx.visible"
      ref="treeMenuEl"
      class="ctx-menu"
      :style="{ left: treeCtx.x + 'px', top: treeCtx.y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <template v-if="treeCtx.conn">
        <div class="ops-ctxmenu-item" @click="ctxOpen">打开</div>
        <div v-if="ctxCanFile" class="ops-ctxmenu-item" @click="ctxOpenFile">文件管理</div>
        <div class="ops-ctxmenu-item" @click="ctxNewWindow">在新窗口打开</div>
        <div class="ops-ctxmenu-item" @click="ctxTest">测试连接</div>
        <div class="ops-ctxmenu-item" @click="ctxEdit">编辑连接</div>
        <template v-if="groups.length">
          <div
            v-for="gg in groups"
            :key="'ctx-mv-' + gg.id"
            class="ops-ctxmenu-item"
            :class="{ 'is-disabled': ctxConnGroupId === gg.id }"
            @click="ctxMoveTo(gg.id)"
          >移动到「{{ groupPath(gg) }}」</div>
          <div v-if="ctxConnGroupId" class="ops-ctxmenu-item" @click="ctxMoveTo('')">移出目录</div>
        </template>
        <div class="ops-ctxmenu-item is-danger" @click="ctxRemove">删除连接</div>
      </template>
      <template v-else-if="treeCtx.group">
        <div class="ops-ctxmenu-item" @click="ctxRenameGroup">重命名目录</div>
        <div class="ops-ctxmenu-item" @click="ctxNewSubGroup">在此目录下新建子目录</div>
        <div class="ops-ctxmenu-item is-danger" @click="ctxRemoveGroup">删除目录</div>
      </template>
      <template v-else>
        <!-- 列表空白处右键：新建入口（原来在页面标题栏的那两个按钮） -->
        <div class="ops-ctxmenu-item" @click="ctxNewConnection">新建连接</div>
        <div class="ops-ctxmenu-item" @click="ctxNewGroup">新建目录</div>
      </template>
    </div>
</Teleport>

    <!-- 窗口标签右键菜单：与资源树菜单同一套基座（`.ctx-menu` 的 position/z-index 在全局 menu.css）
         —— 原先用的 `ops-ctxmenu` 全仓没有任何样式定义，等于又一个"看不见的菜单"。
         Teleport 到 body 同其余菜单：既免掉祖先 transform/filter 影响 fixed 定位，也统一层级。 -->
    <Teleport to="body">
      <div
        v-if="tabCtx.visible"
        ref="tabMenuEl"
        class="ctx-menu"
        :style="{ left: tabCtx.x + 'px', top: tabCtx.y + 'px' }"
        @click.stop
        @contextmenu.prevent
      >
        <div class="ops-ctxmenu-item" @click="ctxCloseTab">关闭</div>
        <div class="ops-ctxmenu-item" @click="ctxCloseOtherTabs">关闭其他</div>
        <div class="ops-ctxmenu-item" @click="ctxCloseAllTabs">关闭全部</div>
      </div>
    </Teleport>

    <!-- 日志弹窗 -->
    <el-dialog v-model="logDialog.visible" :title="`容器日志 · ${logDialog.container}`" width="780px" top="6vh">
      <pre class="ops-log-view">{{ logDialog.content || '加载中…' }}</pre>
    </el-dialog>

    <!-- 新建 / 编辑连接弹窗（同一个表单组件，回填即编辑） -->
    <OpsConnectionDialog ref="connDialogRef" @saved="onConnectionSaved" />

    <!-- 主导方悬浮胶囊（任务 7.9 / 7.10）：AI 模式=对话居中（chat 视图），命令模式=终端等主视图 -->
    <LeadToggle :model-value="lead" mode="ops" @update:model-value="onLeadChange" />

    <!-- 命令广播（7.14）：多台连接同一条命令，黑名单/生产确认/逐台结果 -->
    <OpsBroadcastDialog v-model="broadcastOpen" :connections="connections" />
  </ConsoleShell>
</template>

<script setup lang="ts">
import {
  type ViewKey,
  type ConnType,
  type OpsGroup,
  type OpsWin,
  type OpsMsg,
  type OpsRound,
  type OpsStep,
  type OpsToolCall,
  type TermHandle,
  type TermTransport,
  type DockerRow,
  type DbResult,
  TYPE_LABELS,
  VIEW_LABEL,
  PRIMARY_VIEW,
  buildRoundSteps,
  buildOpsRounds,
  opsWindows,
  opsActiveWinId,
  opsFilePanelOpen,
  opsTerms,
  opsChatAborts,
  opsChatTasks,
  opsGroups,
  opsConnections,
  opsCollapsedGroups,
} from './opsSession';
import { placeMenuAfterRender } from '../../composables/useMenuPlacement';
import { consumeSseStream } from '../../utils/sse';
import { startVisiblePolling } from '../../utils/visible-polling';
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import {
  Folder, FolderOpened,
  ArrowDown, ArrowRight, ArrowUp, Close, Plus,
  ChatDotRound, User, Setting, Promotion, Clock,
  Loading, CircleCheck, WarningFilled,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import '@xterm/xterm/css/xterm.css';
import { api, API_BASE, wsUrl, buildRequestHeaders } from '../../api/client';
import type { Platform, Model, ReleaseProject } from '@yan-zhi/shared';
import { useSettingsStore } from '../../stores/settings';
import { usePlatformStore } from '../../stores/platform';
import SftpPanel from './SftpPanel.vue';
import OpsConnectionDialog, { type OpsConn } from './OpsConnectionDialog.vue';
import OpsMetricsPanel from '../../components/ops/OpsMetricsPanel.vue';
import OpsRecordingsPanel from '../../components/ops/OpsRecordingsPanel.vue';
import OpsKnownHostsPanel from '../../components/ops/OpsKnownHostsPanel.vue';
import OpsStepCards from '../../components/ops/OpsStepCards.vue';
import DeepThinkBadge from '../../components/chat/DeepThinkBadge.vue';
import ReleaseProjectPanel from '../../components/ops/ReleaseProjectPanel.vue';
import OpsBroadcastDialog from '../../components/ops/OpsBroadcastDialog.vue';
import CicdConsole from './CicdConsole.vue';
import TaskListSection from '../../components/workbench/TaskListSection.vue';
import LeadToggle from '../../components/workbench/LeadToggle.vue';
import { activeMode, leadOf, setLead, type LeadMode } from '../../stores/mode';
import ConsoleShell from '../../components/console/ConsoleShell.vue';
import WorkspaceDirDialog from '../../components/WorkspaceDirDialog.vue';
import { useResizable } from '../../composables/useResizable';

// 类型与常量定义见上方 <script> 模块块（跨路由切换需要保留的会话状态也在那里）

const settingsStore = useSettingsStore();
const platformStore = usePlatformStore();
const OPS_AGENT_ID = 'a_builtin_ops_agent';
const MAX_OUTPUT_CHARS = 4000;

const mode = ref<'main' | 'log' | 'rec' | 'kh' | 'release'>('main');
/** 录像 / 主机密钥面板：切到对应 Tab 时刷新一次（会话结束后列表要跟着更新） */
const recPanelRef = ref<InstanceType<typeof OpsRecordingsPanel> | null>(null);
const khPanelRef = ref<InstanceType<typeof OpsKnownHostsPanel> | null>(null);
function onTabChange(name: string) {
  if (name === 'rec') void recPanelRef.value?.load();
  else if (name === 'kh') void khPanelRef.value?.load();
}

// 三屏拖动：主视图 / 文件面板 宽度可拖，localStorage 持久化
// （资源列表那一屏的宽度与折叠由 ConsoleShell 管，键同为 ops_aside）
// 拖动只改变宽度（最小到 min），折叠是独立按钮的事，两者不耦合
const fileR = useResizable('ops_files', 420, 280, 900);
const { width: fileW } = fileR;

// 资源列表的折叠与宽度已由 ConsoleShell 接管（每个模式一个 storageKey）
const testingId = ref('');
/** 命令广播弹窗（7.14）：多机同时执行 */
const broadcastOpen = ref(false);

// ===== 主导方双形态（任务 7.9 / 7.10）=====
// ai（AI 模式）→ 激活窗口切到 chat 视图（对话即执行界面）；human（命令模式）→ 切回主视图（终端等）。
// 切换只换视图（switchWinView），终端 PTY / 会话全部 v-show 保活，不重连。
const lead = computed<LeadMode>(() => leadOf(activeMode.value));
function applyLeadToActiveWin() {
  const w = activeWin.value;
  if (!w) return;
  if (lead.value === 'ai' && w.view !== 'chat') switchWinView(w, 'chat');
  else if (lead.value === 'human' && w.view === 'chat') switchWinView(w, PRIMARY_VIEW[connType(connOf(w))]);
}
watch(lead, () => applyLeadToActiveWin());
function onLeadChange(v: LeadMode) {
  setLead(activeMode.value, v); // watch(lead) 统一应用，这里不重复切
}
/** AI 模式下新开连接默认进对话视图；命令模式保持原主视图 */
function preferredView(connTypeKey: ConnType): ViewKey {
  return lead.value === 'ai' ? 'chat' : PRIMARY_VIEW[connTypeKey];
}

// 资源树数据同样来自模块作用域（切回来先渲染旧数据，init() 再刷新）
const groups = opsGroups;
const connections = opsConnections;
const collapsed = opsCollapsedGroups;
const UNGROUPED = '__ungrouped__';

// 会话状态来自模块作用域（切页不丢）；termEls/chatEls 是 DOM 引用，每次挂载重建
const windows = opsWindows;
const activeWinId = opsActiveWinId;
const filePanelOpen = opsFilePanelOpen;
const terms = opsTerms;
const chatAborts = opsChatAborts;
const chatTasks = opsChatTasks;

const activeWin = computed(() => windows.value.find((w) => w.id === activeWinId.value) || null);
/** 当前激活窗口对应的连接 / 是否支持文件面板（「文件」是全局开关，但要看当前连接支不支持） */
const activeConn = computed(() => connOf(activeWin.value));
const canFileNow = computed(() => !!activeWin.value && supportsFileFor(activeWin.value));
function connOf(w: OpsWin | null): OpsConn | null {
  if (!w) return null;
  return connections.value.find((c) => c.id === w.connectionId) || null;
}
/** 该连接是否支持文件管理（SFTP） */
function supportsFileFor(w: OpsWin): boolean {
  const c = connOf(w);
  return !!c && connType(c) !== 'database';
}
/** 左列表高亮：该连接已有任一窗口都算激活 */
function isConnActive(id: string): boolean {
  return windows.value.some((w) => w.connectionId === id);
}

/** 窗口标签文案；同一连接多开时补视图名以便区分 */
function winLabel(w: OpsWin): string {
  const c = connOf(w);
  const name = c?.name || '（连接已删除）';
  const sameConn = windows.value.filter((x) => x.connectionId === w.connectionId).length;
  return sameConn > 1 ? `${name} · ${VIEW_LABEL[w.view]}` : name;
}
function winTitle(w: OpsWin): string {
  const c = connOf(w);
  if (!c) return '连接已删除';
  const extra = c.tag ? `，标签 ${c.tag}` : '';
  return `${c.name} · ${TYPE_LABELS[connType(c)]} · ${VIEW_LABEL[w.view]}\n${winConnInfo(w)}${extra}`;
}
function winConnInfo(w: OpsWin): string {
  const c = connOf(w);
  if (!c) return '';
  if (connType(c) === 'database') {
    return `${c.dbType === 'postgres' ? 'pgsql' : 'mysql'} · ${c.username}@${c.host}:${c.port}/${c.database || ''}`;
  }
  return `${c.username}@${c.host}:${c.port}`;
}

function newWin(c: OpsConn, view: ViewKey): OpsWin {
  return {
    id: `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    connectionId: c.id,
    view,
    termOpen: false, termConnecting: false, termRecording: false,
    pendingInput: '', lastCommands: [], outputBuffer: '',
    containers: [], containersError: '',
    dbTables: [], dbTable: '', dbSql: '', dbLoading: false, dbError: '', dbResult: null,
    conversationId: '', chatMessages: [], chatInput: '', chatStreaming: false,
    cmdChatOpen: false, modelId: '', chatMode: 'agent',
  };
}

/**
 * 打开连接：同连接 + 同视图的窗口已存在则直接激活（不重复开），否则新建。
 * want：'primary' 主视图 / 'chat' 对话模式 / 'file' 主视图 + 展开文件面板。
 */
function openConnection(c: OpsConn, want: 'primary' | 'chat' | 'file' = 'primary') {
  if (want === 'file' && connType(c) === 'database') want = 'primary';
  const targetView: ViewKey = want === 'chat' ? 'chat' : preferredView(connType(c));
  if (want === 'file') filePanelOpen.value = true;
  const exist = windows.value.find((w) => w.connectionId === c.id && w.view === targetView);
  if (exist) {
    activateWindow(exist.id);
    return;
  }
  const w = newWin(c, targetView);
  windows.value.push(w);
  activateWindow(w.id);
  if (w.view === 'term') void openTerminal(w);
}

/** 强制新开一个窗口（同一连接可多开） */
function openConnectionNew(c: OpsConn) {
  const w = newWin(c, preferredView(connType(c)));
  windows.value.push(w);
  activateWindow(w.id);
  if (w.view === 'term') void openTerminal(w);
}

function activateWindow(id: string) {
  activeWinId.value = id;
  mode.value = 'main';
  const w = windows.value.find((x) => x.id === id);
  if (!w) return;
  if (w.view === 'chat') scrollChatBottom(w);
  void nextTick(() => fitTerm(w));
}

function closeWindow(id: string) {
  const idx = windows.value.findIndex((w) => w.id === id);
  if (idx < 0) return;
  const w = windows.value[idx];
  disposeTerminal(w);
  chatAborts.get(id)?.abort();
  chatAborts.delete(id);
  termEls.delete(id);
  chatEls.delete(id);
  windows.value.splice(idx, 1);
  if (activeWinId.value === id) {
    const next = windows.value[idx - 1] || windows.value[idx] || null;
    activeWinId.value = next ? next.id : '';
  }
}

/** 窗口内切换视图（命令模式 ↔ 对话模式等），不新增窗口 */
function switchWinView(w: OpsWin, k: ViewKey) {
  w.view = k;
  if (k === 'term' && !w.termOpen) void openTerminal(w);
  if (k === 'container') void loadContainers(w);
  if (k === 'db') void loadDbTables(w);
  if (k === 'chat') {
    scrollChatBottom(w);
    // 后台任务/别的窗口写入的回复不在本地消息里：切回对话时从服务端补一次
    // （正在流式时不动，避免把还没落库的片段冲掉）
    if (w.conversationId && !w.chatStreaming) void loadWinMessages(w);
  }
  void nextTick(() => fitTerm(w));
}

/** 顶部「文件」：展开/收起右侧文件面板。属于**整体设置**（所有窗口共用），与具体连接无关 */
function toggleFilePanel() {
  filePanelOpen.value = !filePanelOpen.value;
  void nextTick(() => { const w = activeWin.value; if (w) fitTerm(w); });
}

// ===== 终端（每窗口一个 xterm + 一条 PTY） =====
const termEls = new Map<string, HTMLElement>();
const chatEls = new Map<string, HTMLElement>();

/** v-for 里的 ref 回调（挂载时给元素、卸载时给 null） */
function setTermEl(id: string, el: unknown) {
  if (el) termEls.set(id, el as HTMLElement);
  else termEls.delete(id);
}
function setChatEl(id: string, el: unknown) {
  if (el) chatEls.set(id, el as HTMLElement);
  else chatEls.delete(id);
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * 安全 fit：容器不可见 / 尺寸为 0 时跳过（隐藏窗口里 fit 会算出离谱行列，终端会变「很长」）。
 *
 * ★★ 2026-10-16：**行列没变就一行 DOM 都别碰**。本函数跑在 ResizeObserver 回调的调用链上，
 *   而 `fit()` 会写 xterm 的内部尺寸 → 布局再变 → RO 再次投递 → Chromium 每帧报一条
 *   `ResizeObserver loop completed with undelivered notifications`（实测 2 分钟 3425 条，
 *   把 renderer 日志整个刷满）。预量一次、无变化直接返回，是打断该环最彻底的一刀：
 *   不动 DOM 就绝不会触发下一次投递。
 */
function fitTerm(w: OpsWin) {
  const h = terms.get(w.id);
  if (!h) return;
  const el = h.el;
  if (!el.offsetWidth || !el.offsetHeight) return;
  try {
    const next = h.fitAddon.proposeDimensions();
    if (next && next.cols === h.term.cols && next.rows === h.term.rows) return;
    h.fitAddon.fit();
  } catch { /* 容器已卸载 */ }
}

/**
 * 去抖上报 PTY 尺寸。
 * 必须去抖 + 去重：fit → PTY resize → shell 重绘提示符 → 输出变化 → 再次 fit
 * 会形成反馈环，表现为「连上后好久敲不进命令，而且终端里提示符刷得老长」。
 */
function scheduleResizePost(w: OpsWin) {
  const h = terms.get(w.id);
  if (!h) return;
  if (h.timer !== null) window.clearTimeout(h.timer);
  h.timer = window.setTimeout(() => {
    h.timer = null;
    if (!h.term || !h.transport) return;
    const { cols, rows } = h.term;
    if (!cols || !rows) return;
    if (cols === h.sent.cols && rows === h.sent.rows) return;
    h.sent = { cols, rows };
    h.transport.resize(cols, rows);
  }, 200);
}

/**
 * 监听终端容器尺寸变化 → refit + 去抖上报（展开/收起文件面板、拖动分隔条、窗口缩放都会触发）。
 *
 * ★★ 回调里**绝不直接动布局**（2026-10-16）：RO 回调同步改被观察元素 = Chromium 报
 *   `ResizeObserver loop completed with undelivered notifications`，**每个通知一条**，
 *   实测 2 分钟 3425 条（renderer 日志被刷满，排障时真信号全被淹）。
 *   统一推迟到下一帧、且同帧只排一次（合并突发通知）—— 既去掉噪音，顺带省掉重复 fit。
 */
function watchTermSize(h: TermHandle, w: OpsWin) {
  h.ro?.disconnect();
  if (h.fitFrame !== null) { try { cancelAnimationFrame(h.fitFrame); } catch { /* 已执行 */ } h.fitFrame = null; }
  h.ro = new ResizeObserver(() => {
    if (h.fitFrame !== null) return; // 本帧已排好队 → 合并，别再排
    h.fitFrame = requestAnimationFrame(() => {
      h.fitFrame = null;
      fitTerm(w);
      scheduleResizePost(w);
    });
  });
  h.ro.observe(h.el);
}

/**
 * 把已有的 xterm 实例接回（新的）容器元素。
 * 组件因路由切换被卸载后重新挂载时走这里：xterm 实例和 PTY 流都还在内存里，
 * 只需把它的 DOM 重新 append 回新容器、重建 ResizeObserver，shell 会话不中断。
 */
function attachTerm(h: TermHandle, w: OpsWin) {
  const el = termEls.get(w.id);
  if (!el) return;
  h.el = el;
  const node = h.term.element;
  if (node && node.parentElement !== el) el.appendChild(node);
  watchTermSize(h, w);
  void nextTick(() => {
    fitTerm(w);
    scheduleResizePost(w);
    if (w.id === activeWinId.value) h.term.focus();
  });
}

/**
 * 建立终端通道：优先 WebSocket，连不上（被反代拦掉 / 握手失败 / 超时）时回退到
 * SSE + POST 的老通道 —— 行为与改造前完全一致，所以 WS 出问题不会让终端变成不可用。
 * 返回 null 表示两条通道都没起来（此时已经提示过用户）。
 */
async function openTermTransport(
  w: OpsWin, c: OpsConn, cols: number, rows: number, onOutput: (t: string) => void,
): Promise<TermTransport | null> {
  try {
    return await openWsTermTransport(w, c, cols, rows, onOutput);
  } catch (e) {
    // 静默降级：这是实现细节，用户不必看到「WebSocket 失败」，留一行控制台便于排查
    console.info('[ops] WebSocket 终端不可用，回退 SSE：', (e as Error)?.message || e);
  }
  try {
    return await openSseTermTransport(c, cols, rows, onOutput, () => markTermDisconnected(w));
  } catch (e) {
    ElMessage.error((e as Error)?.message || '终端连接失败');
    return null;
  }
}

/** WebSocket 通道：二进制帧收 PTY 输出、文本帧收控制消息（ready / error / exit） */
function openWsTermTransport(
  w: OpsWin, c: OpsConn, cols: number, rows: number, onOutput: (t: string) => void,
): Promise<TermTransport> {
  return new Promise((resolve, reject) => {
    const url = wsUrl(`/plugin/ops-shell/term/ws?connectionId=${encodeURIComponent(c.id)}&cols=${cols}&rows=${rows}`);
    let sock: WebSocket;
    try { sock = new WebSocket(url); } catch (e) { reject(e as Error); return; }
    sock.binaryType = 'arraybuffer';

    let settled = false;
    let timer: number | null = null;
    // 单个流式解码器：一个多字节 UTF-8 字符可能被切在两帧之间，逐帧新建 decoder 会解出乱码
    const decoder = new TextDecoder('utf-8');
    // ★ 按键必须先编码成字节：WebSocket.send(string) 发的是**文本帧**，服务端会按 JSON 解析后丢弃
    //   → 表现为「终端连上了但打字没反应」。只有二进制帧才会被原样写进 PTY。
    const encoder = new TextEncoder();
    /** 直接执行（P1）的请求等待表：按 token 对齐服务端的 exec-accepted / exec-rejected */
    const execWaiters = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: number }>();
    const failExecWaiters = (reason: string) => {
      for (const [, waiter] of execWaiters) {
        window.clearTimeout(waiter.timer);
        waiter.reject(new Error(reason));
      }
      execWaiters.clear();
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      resolve(transport);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      try { sock.close(); } catch { /* ignore */ }
      reject(err);
    };

    const transport: TermTransport = {
      send: (data) => { if (sock.readyState === WebSocket.OPEN) sock.send(encoder.encode(data)); },
      resize: (c2, r2) => {
        if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: 'resize', cols: c2, rows: r2 }));
      },
      exec: (command, opts) => new Promise<void>((resolveExec, rejectExec) => {
        if (sock.readyState !== WebSocket.OPEN) { rejectExec(new Error('终端未连接')); return; }
        const token = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const waitTimer = window.setTimeout(() => {
          execWaiters.delete(token);
          rejectExec(new Error('终端无响应（执行指令超时）'));
        }, 8000);
        execWaiters.set(token, { resolve: resolveExec, reject: rejectExec, timer: waitTimer });
        sock.send(JSON.stringify({ type: 'exec', command, confirmed: !!opts?.confirmed, token }));
      }),
      close: () => {
        failExecWaiters('终端已断开');
        try { sock.close(); } catch { /* ignore */ }
      },
    };
    timer = window.setTimeout(() => fail(new Error('WebSocket 握手超时')), 8000);

    sock.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let msg: { type?: string; message?: string; defaultCommand?: string | null; autoRun?: boolean; recording?: boolean; token?: string; code?: string };
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'ready') {
          w.termRecording = !!msg.recording;
          if (msg.autoRun && msg.defaultCommand) ElMessage.info(`已自动执行默认命令: ${msg.defaultCommand}`);
          succeed();
        } else if (msg.type === 'error') {
          // 握手前的错误（连接不存在等）要回退；已就绪后的错误只需提示
          if (settled) ElMessage.error(msg.message || '终端出错');
          else fail(new Error(msg.message || '终端建立失败'));
        } else if (msg.type === 'exec-accepted' || msg.type === 'exec-rejected') {
          const waiter = execWaiters.get(msg.token || '');
          if (!waiter) return;
          execWaiters.delete(msg.token || '');
          window.clearTimeout(waiter.timer);
          if (msg.type === 'exec-accepted') { waiter.resolve(); return; }
          const err = new Error(msg.message || '执行被拒绝') as Error & { code?: string };
          err.code = msg.code;
          waiter.reject(err);
        }
        return;
      }
      onOutput(decoder.decode(new Uint8Array(ev.data as ArrayBuffer), { stream: true }));
    };
    sock.onerror = () => fail(new Error('WebSocket 连接失败'));
    sock.onclose = () => {
      failExecWaiters('终端已断开');
      // 握手中途被关 → 回退到 SSE；已就绪后关闭 → 断开收尾（窗口还在，可点「连接终端」重连）
      // ★ 判据用 settled 的快照：fail() 内部会把它置 true，先判再调才是"当时是否已就绪"
      if (!settled) { fail(new Error('WebSocket 已关闭')); return; }
      markTermDisconnected(w);
    };
  });
}

/** SSE + POST 通道（回退路径）：SSE 收输出，按键与 resize 各走一次 POST */
async function openSseTermTransport(
  c: OpsConn, cols: number, rows: number, onOutput: (t: string) => void, onClosed?: () => void,
): Promise<TermTransport> {
  const r = await api.post<{ sessionId: string; defaultCommand?: string | null; autoRun?: boolean }>(
    '/plugin/ops-shell/term/open',
    { connectionId: c.id, cols, rows },
  );
  if ('error' in r) throw new Error(r.error);
  const sessionId = r.data.sessionId;
  if (r.data.autoRun && r.data.defaultCommand) {
    ElMessage.info(`已自动执行默认命令: ${r.data.defaultCommand}`);
  }
  const ac = new AbortController();
  void (async () => {
    try {
      const resp = await fetch(`${API_BASE}/plugin/ops-shell/term/${sessionId}/stream`, {
        // 必须走 buildRequestHeaders：这条路径同样在 /api 授权门禁之下，
        // 原实现只带 Authorization 漏了 x-license，开授权后就表现为「终端连上但一片空白」
        headers: buildRequestHeaders(),
        signal: ac.signal,
      });
      if (!resp.body) return;
      // SSE 解码统一走 utils/sse（P5 收口）；payload 为 base64 帧
      await consumeSseStream(resp.body, (payload) => {
        try { onOutput(b64ToUtf8(payload)); } catch { /* 脏帧跳过 */ }
      });
      // ★ 流**自然结束** = 服务端 PTY 没了（会话回收 / 连接断）。此前这里是静默的：
      //   界面还显示着一个"活着"的终端，其实打什么都石沉大海。与 WS 断开同口径收尾。
      //   注意主动断开（disposeTerminal → ac.abort()）会在这里之前抛错进 catch，
      //   且那时 termOpen 已被置 false，onClosed 里的提示不会误报。
      onClosed?.();
    } catch { /* 会话关闭/网络中断，静默 */ }
  })();
  return {
    send: (data) => { void api.post(`/plugin/ops-shell/term/${sessionId}/input`, { data }); },
    resize: (c2, r2) => { void api.post(`/plugin/ops-shell/term/${sessionId}/resize`, { cols: c2, rows: r2 }); },
    exec: async (command, opts) => {
      const res = await api.post(`/plugin/ops-shell/term/${sessionId}/exec`, { command, confirmed: !!opts?.confirmed });
      if ('error' in res) {
        const err = new Error(res.error) as Error & { code?: string };
        // 409 = 生产连接的非只读命令需要人工确认（400 = 黑名单/空命令，直接报错）
        if (res.status === 409) err.code = 'NEED_CONFIRM';
        throw err;
      }
    },
    close: () => { ac.abort(); void api.post(`/plugin/ops-shell/term/${sessionId}/close`, {}); },
  };
}

async function openTerminal(w: OpsWin) {
  // 已有**还活着**的 xterm（典型场景：从别的页面切回来）→ 只接回 DOM，不重开 PTY。
  //
  // ★★ 2026-10-16 修「点『连接终端』没反应」（用户实报）：判据必须是"句柄 + 仍然连着"，
  //   光有句柄不够。断线路径（WS onclose / SSE 流结束）此前只把 `w.termOpen` 置 false、
  //   句柄仍留在 terms 里，而旧代码见句柄就 attachTerm —— 把 xterm 挂进一个 v-show=false
  //   的容器（termOpen 从头到尾没被置回 true），于是按钮看着完全没反应；
  //   何况那条通道已经死了，就算显示出来也打不了字。
  const alive = terms.get(w.id);
  if (alive && w.termOpen) {
    attachTerm(alive, w);
    return;
  }
  // 句柄残留但连接已断 → 彻底释放，落下去走一次真正的重连
  if (alive) disposeTerminal(w);
  if (w.termConnecting || w.termOpen) return;
  const c = connOf(w);
  if (!c) return;
  w.termConnecting = true;
  try {
    // 关键顺序：先把 xterm 挂上并量出真实行列，再用这个尺寸去开 PTY。
    // 反过来（先固定 120x32 开 PTY，再 fit 触发 resize）会因尺寸反复变化让 shell
    // 重绘提示符、终端被刷得很长，输入也迟迟接不上。
    w.termOpen = true;
    await nextTick();
    const el = termEls.get(w.id);
    if (!el) { w.termOpen = false; return; }
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      scrollback: 5000,
      theme: { background: '#141414', foreground: '#E5E5E0' },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    const handle: TermHandle = {
      term, fitAddon, transport: null, ro: null, timer: null, fitFrame: null,
      sent: { cols: 0, rows: 0 }, el,
    };
    terms.set(w.id, handle);
    fitTerm(w);
    const cols = term.cols || 120;
    const rows = term.rows || 32;

    // 输出统一在这里落到 xterm 与现场缓冲：WS / SSE 两条通道共用一份处理
    const onOutput = (text: string) => {
      if (!text) return;
      terms.get(w.id)?.term.write(text);
      accumulateOutput(w, text);
    };

    const transport = await openTermTransport(w, c, cols, rows, onOutput);
    if (!transport) { disposeTerminal(w); return; }
    handle.transport = transport;
    handle.sent = { cols, rows };

    term.onData((data) => {
      handle.transport?.send(data);
      // 现场采集：回显用户敲入的可见字符（用于还原最近命令）
      if (data === '\r' || data === '\n') {
        if (w.pendingInput.trim()) {
          w.lastCommands.push(w.pendingInput.trim());
          if (w.lastCommands.length > 20) w.lastCommands.shift();
          w.pendingInput = '';
        }
      } else if (data === '\u007f' || data === '\b') {
        w.pendingInput = w.pendingInput.slice(0, -1);
      } else if (data >= ' ' && data !== '\t') {
        w.pendingInput += data;
      }
    });
    term.onResize(() => scheduleResizePost(w));

    // 容器尺寸变化（展开/收起文件面板、拖动分隔条、窗口缩放）→ 重新 fit，尺寸上报由 scheduleResizePost 去抖
    watchTermSize(handle, w);

    if (w.id === activeWinId.value) term.focus();
  } finally {
    w.termConnecting = false;
  }
}

/** 释放终端资源（不改变窗口对象的展示意图，供关闭窗口 / 连接失败复用） */
function disposeTerminal(w: OpsWin) {
  const h = terms.get(w.id);
  if (h) {
    if (h.timer !== null) { window.clearTimeout(h.timer); h.timer = null; }
    // 已排队但没跑的那一帧也要撤：否则回调会在 term.dispose() 之后再碰一次已销毁的终端
    if (h.fitFrame !== null) { try { cancelAnimationFrame(h.fitFrame); } catch { /* 已执行 */ } h.fitFrame = null; }
    h.ro?.disconnect();
    // 通道自己负责收尾（WS 关 socket；SSE 停流 + 通知服务端关 PTY）
    h.transport?.close();
    h.transport = null;
    h.term.dispose();
    terms.delete(w.id);
  }
  w.termOpen = false;
  w.termRecording = false;
  resetTerminalContext(w);
}

/**
 * 终端通道断开的统一收尾（WS onclose / SSE 流结束都走这里）。
 *
 * ★★ 2026-10-16 修「点『连接终端』没反应」的另一半：断开时**必须释放句柄**，
 *   不能只把 `w.termOpen` 置 false。残留的死句柄会让 openTerminal 走进"接回已有终端"
 *   的早退分支（那条分支假设通道还活着）——xterm 被挂进 v-show=false 的容器，
 *   按钮看着完全没反应。顺带如实告诉用户"断了"，而不是留一个看起来活着、
 *   实际打什么都石沉大海的终端。
 */
function markTermDisconnected(w: OpsWin) {
  const wasOpen = w.termOpen;
  disposeTerminal(w);
  if (wasOpen) ElMessage.warning('终端连接已断开，点「连接终端」可重连');
}

/** 断开终端（窗口还在，可重新连接） */
function closeTerminal(w: OpsWin) {
  disposeTerminal(w);
}

// ===== 终端现场采集（最近命令 + 输出滚动缓冲，供对话模式作为现场上下文） =====
// PTY 无结构化信号，拿不到退出码；这里只做"最近命令 + 最近输出文本"的粗粒度采集，
// 在对话模式发送时随消息带上，让运维助手「看得见」当前终端现场。
function accumulateOutput(w: OpsWin, text: string) {
  w.outputBuffer = (w.outputBuffer + text).slice(-MAX_OUTPUT_CHARS);
}
function resetTerminalContext(w: OpsWin) {
  w.pendingInput = '';
  w.lastCommands = [];
  w.outputBuffer = '';
}
/** 去掉 ANSI 转义序列，避免把控制字符喂给模型 */
function stripAnsi(s: string): string {
  return s
    .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '');
}
/**
 * 窗口 → 服务端「运维现场」入参（2026-10-21）。
 *
 * ★ 只下发**薄描述**：连接 id、终端尾部、发布项目 id。
 *   连接名/主机/类型/发布目标等详情由服务端按 id 回查后写进系统提示词 ——
 *   前端不再拼字符串进 userContent（用户原话必须干净入库）。
 */
function opsContextOf(w: OpsWin): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    connectionId: w.connectionId || null,
    releaseProjectId: w.releaseProject?.id || null,
  };
  if (w.termOpen) {
    ctx.recentCommands = w.lastCommands.slice(-6);
    const tail = stripAnsi(w.outputBuffer).trim();
    if (tail) ctx.terminalTail = tail.slice(-4000);
  }
  return ctx;
}

// ===== 历史任务段（左栏顶部）============
// 默认展开；顶栏「历史任务」按钮可收起/展开。收起后列表数据仍留在 chatStore（不清空），
// 重新展开不会重新拉数据、也不会丢当前选中行。
const taskListVisible = ref(true);
function toggleTaskList() {
  taskListVisible.value = !taskListVisible.value;
  // 展开时顺手刷一次：任务可能在别处（办公模式）新建过
  if (taskListVisible.value) void refreshTaskList();
}

// ===== 工作目录（输入框工具条）：与主对话同一份设置，避免"设置里一处、运维里另一处" =====
const showDirPicker = ref(false);
/** 完整路径（对话框 current-path + 按钮 title 用） */
const workspaceDirLabel = computed(() => settingsStore.settings.workspaceDir || '');
/** 按钮上只显示末级目录名，路径全量放 title —— 工具条 32px 高放不下整条路径 */
const workspaceDirName = computed(() => {
  const p = (workspaceDirLabel.value || '').replace(/[\\/]+$/, '');
  if (!p) return '工作目录';
  const seg = p.split(/[\\/]/).filter(Boolean);
  return seg.length ? seg[seg.length - 1] : p;
});
function onWorkspaceDirSelected(dir: string) {
  if (!dir) return;
  settingsStore.settings.workspaceDir = dir;
  showDirPicker.value = false;
  ElMessage.success(`工作目录已切换到 ${dir}`);
}

// ===== 对话模式：每窗口独立会话，不依赖全局 chat store =====
// 关键约束：普通对话页的 currentConvId/currentMessages 是全局单例状态，
// 这里绝不读写它们 —— 每个窗口各自一条 conversation 行（绑定 a_builtin_ops_agent），
// 消息走窗口自有列表 + 后端 message 表（含 tool_calls_json），互不串扰。
/**
 * 建窗口会话（每窗口一条 conversation 行，绑定运维助手智能体）。
 *
 * ★★★ 必须带 `mode: 'ops'`（2026-10-21 用户实报「发送后任务就没了，也没有列表能看到」）：
 *   后端 POST /conversations 在不传 mode 时**默认落 'office'**（见 routes/conversations.ts
 *   的 `VALID_MODES.has(mode) ? mode : 'office'`）。而左栏任务列表按 `activeMode`（运维 = 'ops'）
 *   过滤 → 会话建在 office 里，运维任务列表永远查不到它，表现为「任务凭空消失」。
 *   会话按模式隔离是既定设计（用户 2026-09-18 拍板），所以这里必须显式声明。
 */
async function ensureWinConversation(w: OpsWin): Promise<string> {
  if (w.conversationId) return w.conversationId;
  const c = connOf(w);
  const r = await api.post<any>('/conversations', {
    title: `运维控制台${c ? ' · ' + c.name : ''}`,
    agentId: OPS_AGENT_ID,
    mode: 'ops',
  });
  if ('error' in r) throw new Error(r.error);
  w.conversationId = (r.data as any).id as string;
  // 新会话要立刻出现在左栏任务列表：重拉一次（本页不看 chatStore 的实时推送）
  void refreshTaskList();
  return w.conversationId;
}

/** 重拉任务列表数据源（chatStore.conversations），失败静默（列表保持旧值） */
async function refreshTaskList() {
  try {
    const { useChatStore } = await import('../../stores/chat');
    await useChatStore().loadConversations();
  } catch { /* 列表刷新失败不影响任务本身 */ }
}

async function loadWinMessages(w: OpsWin) {
  if (!w.conversationId) return;
  const r = await api.get<any[]>(`/conversations/${w.conversationId}/messages`);
  if ('data' in r) {
    w.chatMessages = (r.data as any[]).map((m) => ({
      id: m.id, role: m.role, content: m.content || '',
      subAgentName: m.sub_agent_name || null, createdAt: m.created_at,
      // 工具调用：assistant.tool_calls_json 发起 → role=tool 的结果消息回填（步骤卡数据源）
      toolCalls: parseToolCalls(m.tool_calls_json),
      toolCallId: m.tool_call_id || undefined,
      // 深度思考：后端一直有落库，此前没读 → 历史会话里看不到任何思考（2026-10-21 修）
      reasoning: m.reasoning_content || undefined,
    }));
  }
}
/** tool_calls_json 可能是字符串或数组（后端取法不同），统一解析成数组 */
function parseToolCalls(raw: unknown): OpsToolCall[] | undefined {
  if (!raw) return undefined;
  let v: unknown = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return undefined; }
  }
  if (!Array.isArray(v)) return undefined;
  const out: OpsToolCall[] = [];
  for (const t of v) {
    const fn = (t as any)?.function;
    const name = String((t as any)?.name || fn?.name || '');
    if (!name) continue;
    out.push({
      id: String((t as any)?.id || ''),
      name,
      arguments: typeof fn?.arguments === 'string' ? fn.arguments : (fn?.arguments ? JSON.stringify(fn.arguments) : ''),
    });
  }
  return out.length ? out : undefined;
}

function scrollChatBottom(w: OpsWin) {
  void nextTick(() => {
    const el = chatEls.get(w.id);
    if (el) el.scrollTop = el.scrollHeight;
    const sel = stripEls.get(w.id);
    if (sel) sel.scrollTop = sel.scrollHeight;
  });
}

// ===== AI 模式步骤卡 + 底部命令行（任务 7.6 / 7.7）=====
// 步骤完全由消息推导（assistant.toolCalls 发起 + role=tool 结果回填），后端零改动。
// ★ 只取最后一轮（最后一条 user 之后的步骤），不再把历史各轮全摊在列表尾部。
function stepsOf(w: OpsWin) {
  return buildRoundSteps(w.chatMessages);
}

// ===== 按轮渲染（2026-10-21：思考 / 工具 / 回复 三段就近展示）=====
/** 思考展开态、工具明细展开态：都按 "窗口id:轮序号" 记，避免多窗口串状态 */
const expandedReasoning = ref<Record<string, boolean>>({});
const stepsOpen = ref<Record<string, boolean>>({});
/** 轮次组装缓存：key 用「消息条数 + 末条内容长度 + 末条流式态」，命中即复用 */
const roundsCache = new WeakMap<OpsMsg[], { rounds: OpsRound[]; sig: string }>();
function roundsOf(w: OpsWin): OpsRound[] {
  const msgs = w.chatMessages;
  const last = msgs[msgs.length - 1];
  // 流式期间 chunk 改的是末条 content（对象引用不变）→ 必须把长度纳入签名，否则正文不更新
  const sig = `${msgs.length}|${last?.id || ''}|${last?.content?.length || 0}|${last?.streaming ? 1 : 0}|${last?.reasoning?.length || 0}`;
  const hit = roundsCache.get(msgs);
  if (hit && hit.sig === sig) return hit.rounds;
  const rounds = buildOpsRounds(msgs);
  roundsCache.set(msgs, { rounds, sig });
  return rounds;
}
/** 展开态 key：`<前缀?><窗口id>:<轮序号>` —— 前缀区分主区域与折叠条（两处各自独立展开） */
function reasoningKey(ri: number, prefix = ''): string {
  return `${prefix}${activeWinId.value}:${ri}`;
}
/**
 * 正文显示什么：最终答复优先；本轮未结束且还没有答复时，用过渡叙述顶上，
 * 避免"工具跑着、回答区一片空白"（思考区默认收起，用户不知道在等什么）。
 */
function roundAnswerText(rd: OpsRound): string {
  if (rd.answer) return rd.answer;
  return rd.streaming ? rd.liveNarration : '';
}
function toggleRoundReasoning(ri: number, prefix = '') {
  const k = reasoningKey(ri, prefix);
  expandedReasoning.value = { ...expandedReasoning.value, [k]: !expandedReasoning.value[k] };
}
function toggleRoundSteps(ri: number) {
  const k = reasoningKey(ri);
  stepsOpen.value = { ...stepsOpen.value, [k]: !stepsOpen.value[k] };
}
/**
 * 工具摘要文案：读起来像人话，不堆工具名。
 * 例：「检索了 2 个文件，读取了 3 个文件，执行了 5 个工具」/「执行中 · ssh_exec」。
 */
function roundToolSummary(steps: OpsStep[]): string {
  const running = steps.find((s) => s.status === 'running');
  if (running) return `执行中 · ${shortTool(running.toolName)}`;
  const buckets: Record<string, number> = {};
  let other = 0;
  for (const s of steps) {
    const name = shortTool(s.toolName);
    if (/^search|grep|find/i.test(name)) buckets['检索'] = (buckets['检索'] || 0) + 1;
    else if (/^(read|cat|sftp_list)/i.test(name)) buckets['读取文件'] = (buckets['读取文件'] || 0) + 1;
    else if (/^(write|edit|upload)/i.test(name)) buckets['修改文件'] = (buckets['修改文件'] || 0) + 1;
    else other += 1;
  }
  const parts = Object.entries(buckets).map(([k, n]) => `${k} ${n} 处`);
  if (other) parts.push(`执行了 ${other} 个工具`);
  const failed = steps.filter((s) => s.status === 'failed').length;
  const base = parts.length ? parts.join('，') : `执行了 ${steps.length} 个工具`;
  return failed ? `${base}（${failed} 个失败）` : base;
}
/** 底部命令行文案：正在执行第 N 步 / 需确认 / 等待指令 */
function cmdlineText(w: OpsWin): string {
  if (w.chatStreaming) {
    const steps = stepsOf(w);
    const running = steps.find((s) => s.status === 'running');
    if (running) return `正在执行第 ${running.index} 步 · ${shortTool(running.toolName)}`;
    return steps.length ? `本轮已执行 ${steps.length} 步 · 思考中…` : '思考中…';
  }
  const steps = stepsOf(w);
  if (!steps.length) return '输入运维任务或追加指令，我来执行';
  const pending = steps.find((s) => s.needConfirm && s.status === 'done');
  if (pending) return `第 ${pending.index} 步「${shortTool(pending.toolName)}」需确认 · 回复「确认执行」继续`;
  const last = steps[steps.length - 1];
  const failed = steps.filter((s) => s.status === 'failed').length;
  return `本轮已完成 ${steps.length} 步${failed ? `（${failed} 步失败）` : ''}（最后：${shortTool(last.toolName)}）· 可继续追加指令`;
}
function cmdlineNeedConfirm(w: OpsWin): boolean {
  return stepsOf(w).some((s) => s.needConfirm && s.status === 'done');
}
/** 工具名去插件前缀：plugin_ops-shell__ssh_exec → ssh_exec（界面上叫全名没信息量） */
function shortTool(name: string): string {
  return (name || 'tool').replace(/^plugin_[\w-]+__/, '');
}
/** 点击命令行 = 聚焦输入框，支持自然语言追加指令 */
const chatInputEls = new Map<string, { focus: () => void } | null>();
function setChatInputEl(id: string, el: unknown) {
  chatInputEls.set(id, (el as { focus: () => void } | null) || null);
}
function focusChatInput(w: OpsWin) {
  chatInputEls.get(w.id)?.focus();
}

// ===== 命令模式底部折叠对话条（任务 7.8）=====
const QUICK_CMDS = ['查看系统负载', '磁盘占用排查', '查看最近容器日志', '检查服务端口'];
const stripEls = new Map<string, HTMLElement>();
function setStripEl(id: string, el: unknown) {
  if (el) stripEls.set(id, el as HTMLElement);
  else stripEls.delete(id);
}
function toggleCmdChat(w: OpsWin) {
  w.cmdChatOpen = !w.cmdChatOpen;
  if (w.cmdChatOpen) scrollChatBottom(w);
}
/** 折叠条上的一句话预览（最后一条消息的头部） */
function chatPreview(w: OpsWin): string {
  const last = [...w.chatMessages].reverse().find((m) => m.content?.trim());
  if (!last) return w.chatStreaming ? '执行中…' : '展开让助手帮你执行';
  const head = last.content.replace(/\s+/g, ' ').trim().slice(0, 40);
  return `${last.role === 'user' ? '我' : '助手'}：${head}`;
}
function runQuickCmd(w: OpsWin, q: string) {
  w.chatInput = q;
  void sendWinChat(w);
}

// ===== 会话内模型选择（P0-1）=====
/** 下拉候选：已启用且可见的对话模型（不带官方/非官方分组） */
const chatModelOptions = computed(() =>
  platformStore.models.filter((m) => (m.type || 'llm') === 'llm' && m.enabled !== false && m.visible !== false),
);
const defaultModelLabel = computed(() => {
  const m = platformStore.models.find((x) => x.id === settingsStore.settings.defaultModelId);
  return m ? (m.alias || m.modelId) : '跟随设置';
});
function modelLabel(m: { id: string; alias?: string; modelId: string }): string {
  return m.alias || m.modelId || m.id;
}
/** 打开下拉时补拉全量模型：ops 页可能只加载过默认平台那一份，切不到别的平台的模型 */
function onModelDropdown(open: boolean) {
  if (!open) return;
  void platformStore.loadModels().catch(() => { /* 拉取失败保留现有列表 */ });
}

// ===== 静默权限（P0-2，按连接存）=====
const SILENT_LABELS = { exec: '静默执行命令', write: '静默修改文件', read: '静默读取文件' } as const;
type SilentKey = keyof typeof SILENT_LABELS;
function silentOf(c: OpsConn | null): { exec: boolean; write: boolean; read: boolean } {
  return {
    exec: c?.silent?.exec === true,
    write: c?.silent?.write === true,
    read: c?.silent?.read === true,
  };
}
function isProdConn(c: OpsConn | null): boolean {
  const t = (c?.tag || '').toLowerCase();
  return t.includes('生产') || t.includes('prod');
}
async function saveSilent(w: OpsWin, key: SilentKey, value: boolean) {
  const c = connOf(w);
  if (!c) return;
  const next = { ...silentOf(c), [key]: value };
  const r = await api.put<OpsConn>(`/plugin/ops-shell/connections/${c.id}/silent`, { silent: next });
  if ('error' in r) { ElMessage.error(`保存静默权限失败：${r.error}`); return; }
  c.silent = next;
  ElMessage.success(`${SILENT_LABELS[key]}已${value ? '开启' : '关闭'}`);
}

/**
 * 解析本窗口要用的平台/模型：会话内选过就用它（平台取自模型归属），否则跟随设置。
 * 选中的模型被删/停用时明确提示并清回默认 —— 不静默跨模型发送。
 */
async function resolveWinModel(w: OpsWin): Promise<{ platform: Platform; model: Model } | null> {
  const selectedId = (w.modelId || '').trim();
  // 列表可能只加载过默认平台那一份：会话选了其他平台的模型时补拉一次全量
  if (selectedId && !platformStore.models.some((m) => m.id === selectedId)) {
    await platformStore.loadModels().catch(() => {});
  }
  let model = selectedId ? platformStore.models.find((m) => m.id === selectedId) : undefined;
  if (selectedId && (!model || model.enabled === false)) {
    w.modelId = '';
    ElMessage.warning(`本会话选择的模型已不可用（${selectedId}），已回落为设置里的默认模型`);
    model = undefined;
  }
  if (!model) {
    if (!platformStore.models.length) await platformStore.loadModels().catch(() => {});
    model = platformStore.models.find((m) => m.id === settingsStore.settings.defaultModelId && m.enabled !== false);
  }
  if (!model) {
    ElMessage.warning('请先在「设置」配置默认平台与模型（对话模式需要）');
    return null;
  }
  const picked = model;
  let platform = platformStore.platforms.find((p) => p.id === picked.platformId);
  if (!platform) {
    await platformStore.loadPlatforms().catch(() => {});
    platform = platformStore.platforms.find((p) => p.id === picked.platformId);
  }
  if (!platform) {
    ElMessage.warning(`模型「${picked.alias || picked.modelId}」所属平台不可用，请到「设置 → 模型平台」检查`);
    return null;
  }
  return { platform, model: picked };
}

/**
 * P1 执行指令：把输入原样写进当前窗口的终端，不经过模型。
 * 触发：输入以 `/` 开头，或点工具条的「执行」。
 * 没有活终端时自动切到命令模式并建连（仅 SSH 连接有终端）。
 */
async function execDirect(w: OpsWin, raw: string) {
  const command = raw.trim().replace(/^\//, '').trim();
  if (!command) return;
  const c = connOf(w);
  if (!c || connType(c) !== 'ssh') {
    ElMessage.warning('只有 SSH 连接的窗口可以执行终端指令');
    return;
  }
  if (w.view !== 'term') switchWinView(w, 'term');
  if (!w.termOpen || !terms.get(w.id)?.transport) await openTerminal(w);
  const transport = terms.get(w.id)?.transport;
  if (!transport) {
    ElMessage.warning('终端未连接，指令未执行');
    return;
  }
  try {
    await transport.exec(command);
    w.chatInput = '';
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === 'NEED_CONFIRM') {
      // 生产连接的非只读命令：由人当场确认（与手工在终端里敲同一口径）
      const ok = await ElMessageBox.confirm(err.message, '生产连接确认', {
        confirmButtonText: '仍然执行', cancelButtonText: '取消', type: 'warning',
      }).then(() => true).catch(() => false);
      if (!ok) return;
      try {
        await transport.exec(command, { confirmed: true });
        w.chatInput = '';
      } catch (e2) {
        ElMessage.error(`执行失败：${(e2 as Error).message}`);
      }
      return;
    }
    ElMessage.error(`执行失败：${err.message}`);
  }
}

// ===== 发布项目绑定（7b）=====
/** 绑定发布项目后自动挂载的工具面：CICD 全部工具 + 连接清单（只传连接名/host，绝不含密钥） */
const RELEASE_TOOL_IDS = [
  'plugin_cicd-pipeline__cicd_list_pipelines',
  'plugin_cicd-pipeline__cicd_create_pipeline',
  'plugin_cicd-pipeline__cicd_update_pipeline',
  'plugin_cicd-pipeline__cicd_delete_pipeline',
  'plugin_cicd-pipeline__cicd_run_pipeline',
  'plugin_cicd-pipeline__cicd_list_runs',
  'plugin_cicd-pipeline__cicd_get_run',
  'plugin_cicd-pipeline__cicd_detect_project',
  'plugin_cicd-pipeline__cicd_list_templates',
  'plugin_ops-shell__conn_list',
];

/**
 * 发布项目上下文：本地目录 / 技术栈 / 部署目标。
 * ★ 2026-10-21 起前端**不再拼接**这段文本 —— 只下发 releaseProjectId，
 *   由服务端按 id 回查后写进系统提示词（连接名同样服务端解析，避免改名后残留旧值）。
 */

/** 绑定发布项目：会话落 release_project_id + 合并挂载 CICD/连接工具（幂等） */
async function onBindReleaseProject(project: ReleaseProject) {
  const w = activeWin.value;
  if (!w) { ElMessage.warning('请先打开一个运维窗口再绑定发布项目'); return; }
  try {
    if (!w.conversationId) await ensureWinConversation(w);
  } catch (e) {
    ElMessage.error('创建会话失败：' + (e as Error).message);
    return;
  }
  const conv = await api.get<any>(`/conversations/${w.conversationId}`);
  let existing: string[] = [];
  if ('data' in conv && conv.data?.builtin_tool_ids_json) {
    try { const parsed = JSON.parse(conv.data.builtin_tool_ids_json); if (Array.isArray(parsed)) existing = parsed.filter((x: unknown) => typeof x === 'string'); } catch { /* 脏值按空处理 */ }
  }
  const merged = [...new Set([...existing, ...RELEASE_TOOL_IDS])];
  const r = await api.patch(`/conversations/${w.conversationId}`, {
    releaseProjectId: project.id,
    builtinToolIds: merged,
  });
  if ('error' in r) { ElMessage.error('绑定失败：' + r.error); return; }
  w.releaseProject = project;
  // 7b.16：显式询问是否同步为全局工作目录（不做静默修改）
  if (settingsStore.settings.workspaceDir !== project.localDir) {
    const sync = await ElMessageBox.confirm(
      `是否把「${project.name}」的本地目录设为当前工作目录？\n${project.localDir}`,
      '同步工作目录',
      { type: 'info', confirmButtonText: '设为工作目录', cancelButtonText: '不同步' },
    ).then(() => true).catch(() => false);
    if (sync) {
      settingsStore.settings.workspaceDir = project.localDir;
      await settingsStore.save();
    }
  }
  ElMessage.success(`已绑定发布项目「${project.name}」，发布工具已挂载`);
}

async function onUnbindReleaseProject() {
  const w = activeWin.value;
  if (!w) return;
  if (w.conversationId) {
    const r = await api.patch(`/conversations/${w.conversationId}`, { releaseProjectId: null });
    if ('error' in r) { ElMessage.error('解绑失败：' + r.error); return; }
  }
  w.releaseProject = undefined;
  ElMessage.success('已解绑发布项目');
}

/**
 * 当前连接上下文：**前端不再拼接**（2026-10-21）。
 * 只下发 connectionId，连接名/类型/host 由服务端按 id 回查 —— 见 opsContextOf。
 */

/** 输入框提交：按当前模式分派（执行 / Agent / 后台）；`/` 前缀始终按直接执行 */
function submitWinChat(w: OpsWin) {
  const content = w.chatInput.trim();
  if (!content || w.chatStreaming) return;
  if (content.startsWith('/')) { void execDirect(w, content); return; }
  const mode = w.chatMode || 'agent';
  if (mode === 'exec') { void execDirect(w, content); return; }
  if (mode === 'background') { void sendBackground(w); return; }
  void sendWinChat(w);
}
function sendLabel(w: OpsWin): string {
  const mode = w.chatMode || 'agent';
  return mode === 'exec' ? '执行' : mode === 'background' ? '后台提交' : '发送';
}
function chatPlaceholder(w: OpsWin): string {
  const mode = w.chatMode || 'agent';
  if (mode === 'exec') return '输入命令，Ctrl+Enter 直接发到终端（危险命令会被拦截）';
  if (mode === 'background') return '输入后台任务，Ctrl+Enter 提交（关掉面板也会继续）';
  return '输入运维任务，Ctrl+Enter 发送';
}

async function sendWinChat(w: OpsWin) {
  const content = w.chatInput.trim();
  if (!content || w.chatStreaming) return;
  // P1：以 / 开头 = 执行指令，直接写当前终端，不经过模型
  if (content.startsWith('/')) { void execDirect(w, content); return; }
  const resolved = await resolveWinModel(w);
  if (!resolved) return;
  const { platform, model } = resolved;
  try {
    if (!w.conversationId) await ensureWinConversation(w);
  } catch (e) {
    ElMessage.error('创建会话失败: ' + (e as Error).message);
    return;
  }

  // ★★★ 2026-10-21：现场上下文**不再拼进 userContent**（用户原话干净入库），
  //   改为随任务下发结构化 opsContext，由服务端回查连接/发布项目后注入系统提示词。
  //   旧做法把「（当前选定连接…）（终端现场…）」拼进用户消息入库，导致 ①库里存脏数据
  //   ②消息列表得靠正则剥离才能显示正常 ③每轮重复把整份现场塞进用户回合。
  w.chatInput = '';
  w.chatStreaming = true;
  w.chatMessages.push({ id: `local-${Date.now()}`, role: 'user', content, createdAt: Date.now() });
  scrollChatBottom(w);

  const ac = new AbortController();
  chatAborts.set(w.id, ac);
  try {
    const taskRes = await api.post<any>('/llm/tasks', {
      conversationId: w.conversationId,
      platformId: platform.id,
      modelId: model.id,
      userContent: content,
      agentId: OPS_AGENT_ID,
      opsContext: opsContextOf(w),
    });
    if ('error' in taskRes) throw new Error(taskRes.error);
    const taskId = String(taskRes.data.taskId);
    // 记住任务 id：停止按钮直接按 id 终止，不再依赖 active 反查（刚提交时可能查不到）
    chatTasks.set(w.id, taskId);
    if (ac.signal.aborted) {
      // 用户在「建任务」这段空窗里点了停止：SSE 已不会订阅，必须主动终止服务端任务
      try { await postAbortTask(taskId); } catch (e) { ElMessage.warning(`终止请求失败：${(e as Error).message}`); }
      throw new DOMException('Aborted', 'AbortError');
    }
    await subscribeWinTask(w, taskId, ac);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') ElMessage.error('执行失败: ' + (e as Error).message);
  } finally {
    w.chatStreaming = false;
    chatAborts.delete(w.id);
    chatTasks.delete(w.id);
    // 服务端为准：结束后拉取规范消息列表（含子智能体消息与最终回复）
    await loadWinMessages(w);
    scrollChatBottom(w);
  }
}

/**
 * P2 后台执行：以普通 LLM 任务提交，但**不在本窗口订阅流**。
 * 任务由服务端继续跑；进度登记到任务中心（文件面板），关掉面板/切走页面都不影响。
 */
async function sendBackground(w: OpsWin) {
  const content = w.chatInput.trim();
  if (!content || w.chatStreaming) return;
  const resolved = await resolveWinModel(w);
  if (!resolved) return;
  const { platform, model } = resolved;
  try {
    if (!w.conversationId) await ensureWinConversation(w);
  } catch (e) {
    ElMessage.error('创建会话失败: ' + (e as Error).message);
    return;
  }
  const taskRes = await api.post<any>('/llm/tasks', {
    conversationId: w.conversationId,
    platformId: platform.id,
    modelId: model.id,
    userContent: content,
    agentId: OPS_AGENT_ID,
    opsContext: opsContextOf(w),
  });
  if ('error' in taskRes) { ElMessage.error('提交失败: ' + taskRes.error); return; }
  if (taskRes.data.reused) {
    // 同会话已有运行中任务：后端做了注入，不再重复登记任务中心
    w.chatInput = '';
    ElMessage.info('该会话已有运行中的任务，本条已并入（进度见对话）');
    return;
  }
  const taskId = String(taskRes.data.taskId);
  const reg = await api.post<{ jobId: string }>('/plugin/ops-shell/jobs/agent', {
    taskId, conversationId: w.conversationId, label: content.slice(0, 60),
  });
  if ('error' in reg) {
    ElMessage.warning(`任务已提交，但登记到任务中心失败：${reg.error}`);
    return;
  }
  w.chatInput = '';
  // 立即回显用户消息；助手回复等切回对话视图时从服务端拉取
  w.chatMessages.push({ id: `local-bg-${Date.now()}`, role: 'user', content, createdAt: Date.now() });
  ElMessage.success('已提交后台执行，进度在右侧「文件」面板的任务中心查看');
}

/** 调用服务端终止接口（失败抛错，由调用方决定怎么提示） */
async function postAbortTask(taskId: string): Promise<void> {
  const token = localStorage.getItem('auth_token') || '';
  // 与主对话 stop() 同口径：buildRequestHeaders 会补 x-license
  const r = await fetch(`${API_BASE}/llm/tasks/${taskId}/abort`, {
    method: 'POST',
    headers: buildRequestHeaders(token ? { Authorization: `Bearer ${token}` } : undefined),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

async function abortWinChat(w: OpsWin) {
  // 本地先落态：停止的反馈不该等网络往返（服务端随后仍会发 aborted，重复是无害的）
  chatAborts.get(w.id)?.abort();
  w.chatStreaming = false;
  for (const m of w.chatMessages) m.streaming = false;

  // 优先用建任务时记下的 id；没有（页面热更/内存丢失）再按会话反查
  let taskId = chatTasks.get(w.id) || null;
  if (!taskId && w.conversationId) {
    try {
      const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${w.conversationId}`);
      taskId = ('data' in r && r.data?.[0]?.id) || null;
    } catch { /* 下面按「没有可终止任务」处理 */ }
  }
  if (!taskId) {
    ElMessage.info('当前没有可终止的任务（可能已结束）');
    return;
  }
  try {
    await postAbortTask(taskId);
  } catch (e) {
    // 终止失败不能静默：任务可能仍在服务端继续跑
    ElMessage.warning(`终止请求失败：${(e as Error).message}`);
  }
}

/** 窗口专属 SSE 订阅：与 chat store 的 subscribeTaskSse 同协议，但状态完全本地 */
async function subscribeWinTask(w: OpsWin, taskId: string, ac: AbortController): Promise<void> {
  const token = localStorage.getItem('auth_token') || '';
  const resp = await fetch(`${API_BASE}/llm/tasks/${taskId}/stream?since=0`, {
    // 与主对话 subscribeTaskSse 同口径（授权 + 授权码头）
    headers: buildRequestHeaders(token ? { Authorization: `Bearer ${token}` } : undefined),
    signal: ac.signal,
  });
  if (!resp.ok || !resp.body) throw new Error('SSE 连接失败');
  // SSE 解码统一走 utils/sse（P5 收口）；与 chat store 的 subscribeTaskSse 同协议
  await consumeSseStream(resp.body, (payload) => {
    {
      let event: any;
      try { event = JSON.parse(payload); } catch { return; }
      if (event.type === 'message:added') {
        const msg = event.message;
        if (!w.chatMessages.some((m) => m.id === msg.id)) {
          w.chatMessages.push({
            id: msg.id, role: msg.role, content: msg.content || '',
            subAgentName: msg.subAgentName || msg.sub_agent_name || null,
            streaming: msg.role === 'assistant', createdAt: Date.now(),
            toolCalls: parseToolCalls(msg.toolCalls ?? msg.tool_calls_json),
            toolCallId: msg.toolCallId || msg.tool_call_id || undefined,
          });
        }
        scrollChatBottom(w);
      } else if (event.type === 'chunk') {
        // 追加到最后一条流式中的助手消息（子智能体消息按名称单独成泡，chunk 不细分）
        const list = w.chatMessages;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].role === 'assistant' && list[i].streaming) {
            if (event.content) list[i].content += event.content;
            // ★ 思考增量（2026-10-21）：后端 emit 的字段是 `reasoning`，与 `content` 并行。
            //   此前只接 content → 运维模式永远看不到模型思考，用户以为"没思考直接答"。
            if (event.reasoning) list[i].reasoning = (list[i].reasoning || '') + event.reasoning;
            scrollChatBottom(w);
            break;
          }
        }
      } else if (event.type === 'task:completed' || event.type === 'task:error' || event.type === 'task:aborted') {
        for (const m of w.chatMessages) m.streaming = false;
        if (event.type === 'task:error' && event.error) {
          w.chatMessages.push({ id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ ${event.error}`, createdAt: Date.now() });
        }
        scrollChatBottom(w);
        // 任务已终态：告诉 sse 层停止读取（对齐原实现读循环直接 return 的语义）
        return false;
      }
    }
  });
  for (const m of w.chatMessages) m.streaming = false;
}

// ===== 助手消息 markdown 渲染（对齐主对话 ChatMessageList：工具块清理 + 代码高亮 + 复制） =====
const md = new MarkdownIt({
  html: false, linkify: true, breaks: true,
  highlight(str: string, lang: string): string {
    const codeClass = lang ? ` class="language-${lang}"` : '';
    // 语言标签与复制按钮同属「代码块 chrome」：都绝对定位，不占正文行
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        const h = hljs.highlight(str, { language: lang }).value;
        return `<pre class="hljs ops-code${lang ? ' has-lang' : ''}">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${h}</code></pre>`;
      } catch {}
    }
    return `<pre class="hljs ops-code${lang ? ' has-lang' : ''}">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

/** 内联工具 chip 的占位标记（模板里配 v-html 用） */
const INLINE_TOOL_HTML = '<span class="ops-inline-tool">⚙ 正在调用工具</span>';

function renderAssistantMarkdown(content?: string): string {
  let c = content || '';
  // 与主对话同口径：隐藏文本模式工具调用块（执行记录在「操作日志」里看）
  c = c
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
    .replace(/\[TOOL_CALL\][\s\S]*$/i, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/i, '');
  c = c.replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]\s*$/g, '').split('\n@@REASON@@\n')[0].trim();
  return c.split(/(\[tool_call\])/g).map((part) => {
    if (part === '[tool_call]') {
      return INLINE_TOOL_HTML;
    }
    return md.render(part);
  }).join('');
}

// markdown 容器事件委托：复制按钮 / 链接新窗口
function onMdClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.classList.contains('code-copy-btn')) {
    const raw = t.getAttribute('data-code') || '';
    navigator.clipboard.writeText(decodeURIComponent(raw)).then(() => {
      t.textContent = '已复制'; setTimeout(() => { t.textContent = '复制'; }, 1500);
    }).catch(() => {});
    return;
  }
  const a = (t as HTMLElement).closest('a');
  if (a) {
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) { e.preventDefault(); window.open(href, '_blank', 'noopener'); }
  }
}

// ===== 容器面板（docker 类型连接，按窗口隔离） =====
async function loadContainers(w: OpsWin) {
  const c = connOf(w);
  if (!c) return;
  w.containersError = '';
  const r = await api.get<DockerRow[]>(`/plugin/ops-shell/docker/ps?connectionId=${c.id}`);
  if ('data' in r) w.containers = r.data;
  else w.containersError = r.error;
}

const logDialog = ref({ visible: false, container: '', content: '' });
async function viewLogs(w: OpsWin, row: DockerRow) {
  const container = String(row.Names || '').split(',')[0] || '';
  logDialog.value = { visible: true, container, content: '' };
  const r = await api.get<string>(`/plugin/ops-shell/docker/logs?connectionId=${connOf(w)?.id}&container=${encodeURIComponent(container)}&tail=300`);
  logDialog.value.content = 'data' in r ? r.data : r.error;
}

async function restartContainer(w: OpsWin, row: DockerRow) {
  const c = connOf(w);
  const container = String(row.Names || '').split(',')[0] || '';
  const isProd = !!c && isProdTag(c.tag || '');
  const confirmed = isProd
    ? await ElMessageBox.confirm(`生产连接：确认重启容器「${container}」？`, '二次确认', { type: 'warning' }).then(() => true).catch(() => false)
    : true;
  if (!confirmed) return;
  const r = await api.post<{ ok: boolean; output?: string }>('/plugin/ops-shell/docker/restart', {
    connectionId: c?.id, container, confirmed,
  });
  if ('data' in r && r.data.ok) { ElMessage.success(`容器 ${container} 已重启`); await loadContainers(w); }
  else ElMessage.error('error' in r ? r.error : (r as { data: { output?: string } }).data.output || '重启失败');
}

// ===== 数据库面板（database 类型连接，只读，按窗口隔离） =====
async function loadDbTables(w: OpsWin) {
  const c = connOf(w);
  if (!c) return;
  const r = await api.get<string[]>(`/plugin/ops-shell/db/tables?connectionId=${c.id}`);
  if ('data' in r) w.dbTables = r.data;
  else w.dbError = r.error;
}

function onPickTable(w: OpsWin, t: string) {
  if (!t) return;
  w.dbSql = `SELECT * FROM ${t} LIMIT 20`;
}

async function runDbQuery(w: OpsWin) {
  const c = connOf(w);
  if (!c || !w.dbSql.trim() || w.dbLoading) return;
  w.dbLoading = true;
  w.dbError = '';
  w.dbResult = null;
  const r = await api.post<DbResult>('/plugin/ops-shell/db/query', { connectionId: c.id, sql: w.dbSql });
  w.dbLoading = false;
  if ('data' in r) w.dbResult = r.data;
  else w.dbError = r.error;
}

// ===== 上下文中用到的连接工具 =====
function connType(c: OpsConn | null | undefined): ConnType {
  return c?.type === 'docker' || c?.type === 'database' ? c.type : 'ssh';
}
/** 跳板机名称；指向已删除的连接时给明确提示，而不是显示空 */
function jumpNameOf(c: OpsConn): string {
  if (!c.jumpConnectionId) return '';
  return connections.value.find((x) => x.id === c.jumpConnectionId)?.name || '（跳板已失效）';
}
function connSub(c: OpsConn): string {
  const addr = connType(c) === 'database'
    ? `${c.dbType === 'postgres' ? 'pgsql' : 'mysql'} · ${c.username}@${c.host}:${c.port}/${c.database || ''}`
    : `${c.username}@${c.host}:${c.port}`;
  const jump = jumpNameOf(c);
  return jump ? `经 ${jump} → ${addr}` : addr;
}
/** 连接副信息：默认命令 / SFTP 路径有配置时才展示 */
function connMeta(c: OpsConn): string {
  const parts: string[] = [];
  if (c.defaultCommand) parts.push(`默认命令: ${c.defaultCommand}`);
  if (c.sftpPath) parts.push(`SFTP: ${c.sftpPath}`);
  return parts.join(' · ');
}
/** 行悬浮提示：类型 + 地址 + 已配置的默认命令 / SFTP 路径 */
function connTitle(c: OpsConn): string {
  const meta = connMeta(c);
  return `${c.name} · ${TYPE_LABELS[connType(c)]}\n${connSub(c)}${meta ? '\n' + meta : ''}`;
}
function isProdTag(tag: string): boolean {
  const t = (tag || '').toLowerCase();
  return t.includes('生产') || t.includes('prod');
}

// ===== 左侧目录树（支持目录嵌套：子目录 + 资源；拖拽调整归属）=====
interface GroupNode {
  id: string; name: string; real: boolean;
  parentId: string;
  items: OpsConn[];
  children: GroupNode[];
}
/** 渲染行：把树摊平，目录行与资源行都带 depth 缩进（避免递归组件） */
interface TreeRow {
  kind: 'group' | 'conn';
  id: string;
  name: string;
  depth: number;
  group?: GroupNode;
  conn?: OpsConn;
}

const groupTree = computed<GroupNode[]>(() => {
  const build = (parentId: string): GroupNode[] =>
    groups.value
      .filter((g) => (g.parentId || '') === parentId)
      .map((g) => ({
        id: g.id, name: g.name, real: true, parentId,
        items: connections.value.filter((c) => c.groupId === g.id),
        children: build(g.id),
      }));
  const roots = build('');
  const loose = connections.value.filter((c) => !c.groupId || !groups.value.some((g) => g.id === c.groupId));
  if (loose.length || !roots.length) {
    roots.push({ id: UNGROUPED, name: '未分组', real: false, parentId: '', items: loose, children: [] });
  }
  return roots;
});

/** 摊平后的渲染行：目录 →（展开时）子目录 → 本目录资源 */
const treeRows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = [];
  const walk = (nodes: GroupNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ kind: 'group', id: n.id, name: n.name, depth, group: n });
      if (n.id !== UNGROUPED && !isExpanded(n.id)) continue;
      walk(n.children, depth + 1);
      for (const c of n.items) out.push({ kind: 'conn', id: c.id, name: c.name, depth: depth + 1, conn: c });
    }
  };
  walk(groupTree.value, 0);
  return out;
});

// ===== 拖拽：资源拖进目录 / 目录拖进目录（后端带防环校验）=====
const dragKind = ref<'' | 'conn' | 'group'>('');
const dragId = ref('');
const dropTargetId = ref('');

function onRowDragStart(e: DragEvent, kind: 'conn' | 'group', id: string) {
  dragKind.value = kind;
  dragId.value = id;
  try {
    e.dataTransfer?.setData('text/plain', `${kind}:${id}`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  } catch { /* 忽略 */ }
}
function onRowDragEnd() {
  dragKind.value = '';
  dragId.value = '';
  dropTargetId.value = '';
}
/** 目标目录是否是被拖目录的子孙（前端先挡一层，后端还有一道） */
function isDescendantOf(groupId: string, maybeAncestorId: string): boolean {
  let cur = groups.value.find((g) => g.id === groupId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.id === maybeAncestorId) return true;
    cur = cur.parentId ? groups.value.find((g) => g.id === cur!.parentId) : undefined;
  }
  return false;
}
/** 能否落到该目录（root = 顶层/未分组） */
function canDropOn(groupId: string): boolean {
  if (!dragKind.value) return false;
  if (dragKind.value === 'conn') {
    const c = connections.value.find((x) => x.id === dragId.value);
    if (!c) return false;
    return groupId === '__root__' ? !!c.groupId : c.groupId !== groupId;
  }
  if (groupId === dragId.value) return false;
  if (groupId !== '__root__' && isDescendantOf(groupId, dragId.value)) return false;
  const g = groups.value.find((x) => x.id === dragId.value);
  if (!g) return false;
  return groupId === '__root__' ? !!g.parentId : (g.parentId || '') !== groupId;
}
function onDragOverGroup(e: DragEvent, groupId: string) {
  if (!canDropOn(groupId)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dropTargetId.value = groupId;
}
function onDragLeaveGroup(groupId: string) {
  if (dropTargetId.value === groupId) dropTargetId.value = '';
}
async function onDropOnGroup(groupId: string) {
  const kind = dragKind.value;
  const id = dragId.value;
  onRowDragEnd();
  if (!kind || !id || !canDropOn(groupId)) return;
  try {
    if (kind === 'conn') {
      await moveConnToGroup(id, groupId === '__root__' ? '' : groupId);
    } else {
      await moveGroupToParent(id, groupId === '__root__' ? '' : groupId);
    }
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
/** 移动资源归属目录（groupId 空 = 未分组） */
async function moveConnToGroup(connId: string, groupId: string) {
  const r = await api.put(`/plugin/ops-shell/connections/${connId}/group`, { groupId });
  if ('error' in r) throw new Error(r.error);
  await loadConnections();
  const name = connections.value.find((c) => c.id === connId)?.name || '资源';
  const target = groupId ? (groups.value.find((g) => g.id === groupId)?.name || '目录') : '未分组';
  ElMessage.success(`「${name}」已移到 ${target}`);
}
/** 移动目录到目标父目录（parentId 空 = 顶层） */
async function moveGroupToParent(groupId: string, parentId: string) {
  const r = await api.put<OpsGroup>(`/plugin/ops-shell/groups/${groupId}/parent`, { parentId });
  if ('error' in r) throw new Error(r.error);
  await loadGroups();
  const name = groups.value.find((g) => g.id === groupId)?.name || '目录';
  const target = parentId ? (groups.value.find((g) => g.id === parentId)?.name || '目录') : '顶层';
  ElMessage.success(`「${name}」已移到 ${target}`);
}

function isExpanded(id: string): boolean {
  return !collapsed.value.has(id);
}
function toggleGroup(id: string) {
  const s = new Set(collapsed.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  collapsed.value = s;
}

// ===== 连接 / 目录数据加载 =====
async function loadConnections() {
  const r = await api.get<OpsConn[]>('/plugin/ops-shell/connections');
  if ('data' in r) connections.value = r.data;
}
async function loadGroups() {
  const r = await api.get<OpsGroup[]>('/plugin/ops-shell/groups');
  if ('data' in r) groups.value = r.data;
}

// ===== 目录（分类分组）管理：支持嵌套（parentId 为空 = 顶层）=====
async function promptNewGroup(parentId = '') {
  const parent = parentId ? groups.value.find((g) => g.id === parentId) : null;
  const r = await ElMessageBox.prompt(parent ? `在「${parent.name}」下新建子目录` : '新建顶层目录', '新建目录', {
    confirmButtonText: '创建', cancelButtonText: '取消', inputPlaceholder: '如 生产环境 / 测试机 / 数据库',
    inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空'),
  }).catch(() => null);
  if (!r) return;
  const res = await api.post<{ id: string; name: string }>('/plugin/ops-shell/groups', {
    name: r.value.trim(),
    ...(parentId ? { parentId } : {}),
  });
  if ('error' in res) { ElMessage.error(res.error); return; }
  await loadGroups();
  // 新建子目录时自动展开父目录，避免「建了但看不见」
  if (parentId) {
    const s = new Set(collapsed.value);
    s.delete(parentId);
    collapsed.value = s;
  }
  ElMessage.success(`目录「${res.data.name}」已创建`);
}

async function onGroupCmd(cmd: string, groupId: string) {
  const g = groups.value.find((x) => x.id === groupId);
  if (!g) return;
  if (cmd === 'rename') {
    const r = await ElMessageBox.prompt('目录名称', '重命名目录', {
      confirmButtonText: '保存', cancelButtonText: '取消', inputValue: g.name,
      inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空'),
    }).catch(() => null);
    if (!r) return;
    const res = await api.put(`/plugin/ops-shell/groups/${g.id}`, { name: r.value.trim() });
    if ('error' in res) { ElMessage.error(res.error); return; }
    await loadGroups();
    return;
  }
  if (cmd === 'remove') {
    const count = connections.value.filter((c) => c.groupId === g.id).length;
    const kids = groups.value.filter((x) => (x.parentId || '') === g.id).length;
    const tail = [
      count ? `其中 ${count} 个资源会移回「未分组」` : '',
      kids ? `${kids} 个子目录会上提到上一层` : '',
    ].filter(Boolean).join('，');
    const ok = await ElMessageBox.confirm(
      `删除目录「${g.name}」？${tail ? `${tail}；` : ''}资源与子目录本身不会删除。`,
      '确认', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' },
    ).then(() => true).catch(() => false);
    if (!ok) return;
    const res = await api.delete(`/plugin/ops-shell/groups/${g.id}`);
    if ('error' in res) { ElMessage.error(res.error); return; }
    await Promise.all([loadGroups(), loadConnections()]);
  }
}

/** 连接行「⋯」菜单：新窗口 / 编辑 / 移动到目录 / 删除 */
async function onConnCmd(cmd: string, c: OpsConn) {
  if (cmd === 'new') { openConnectionNew(c); return; }
  if (cmd === 'edit') { openEditDialog(c); return; }
  if (cmd === 'remove') { await removeConnection(c); return; }
  if (cmd.startsWith('move:')) {
    const res = await api.put(`/plugin/ops-shell/connections/${c.id}/group`, { groupId: cmd.slice(5) });
    if ('error' in res) { ElMessage.error(res.error); return; }
    await loadConnections();
  }
}

// ===== 资源 / 目录 右键菜单 =====
// 原来把「新窗口 / 文件管理 / 测试 / ⋯」做成行内 hover 按钮，绝对定位会盖住连接名，
// 现统一改为右键菜单（自绘，理由同文件页：避开 el-dropdown 在容器内的定位问题）
type TreeCtxGroup = { id: string; name: string; real: boolean; items: OpsConn[] };
const treeCtx = ref<{ visible: boolean; x: number; y: number; conn: OpsConn | null; group: TreeCtxGroup | null }>({
  visible: false, x: 0, y: 0, conn: null, group: null,
});
/** 资源树菜单元素：渲染后按真实尺寸校正位置（见 composables/useMenuPlacement） */
const treeMenuEl = ref<HTMLElement | null>(null);
/** 资源树的三处右键共用：先按光标落位，渲染后按**真实尺寸**校正（贴光标 + 不越界） */
function openTreeMenuAt(ev: MouseEvent, patch: { conn: OpsConn | null; group: TreeCtxGroup | null }) {
  const at = { x: ev.clientX, y: ev.clientY };
  treeCtx.value = { visible: true, ...at, ...patch };
  placeMenuAfterRender(treeMenuEl, at, (p) => { treeCtx.value = { ...treeCtx.value, ...p }; });
}
const ctxConnGroupId = computed(() => treeCtx.value.conn?.groupId || '');
const ctxCanFile = computed(() => !!treeCtx.value.conn && connType(treeCtx.value.conn) !== 'database');

function onConnCtx(c: OpsConn, ev: MouseEvent) {
  openTreeMenuAt(ev, { conn: c, group: null });
}
function onGroupCtx(g: TreeCtxGroup, ev: MouseEvent) {
  openTreeMenuAt(ev, { conn: null, group: g });
}
/** 列表空白处右键：只给「新建」（连接 / 目录） */
function onTreeCtx(ev: MouseEvent) {
  openTreeMenuAt(ev, { conn: null, group: null });
}
function closeTreeCtx() {
  treeCtx.value = { ...treeCtx.value, visible: false };
}

// 菜单动作：模板里只调无参方法，关闭菜单统一在这里做
function ctxOpen() { const c = treeCtx.value.conn; if (c) openConnection(c); closeTreeCtx(); }
function ctxOpenFile() { const c = treeCtx.value.conn; if (c) openConnection(c, 'file'); closeTreeCtx(); }
function ctxNewWindow() { const c = treeCtx.value.conn; if (c) openConnectionNew(c); closeTreeCtx(); }
function ctxTest() { const c = treeCtx.value.conn; if (c) void testConnection(c); closeTreeCtx(); }
function ctxEdit() { const c = treeCtx.value.conn; if (c) openEditDialog(c); closeTreeCtx(); }
function ctxMoveTo(groupId: string) {
  const c = treeCtx.value.conn;
  if (c && c.groupId !== groupId) void onConnCmd(groupId ? `move:${groupId}` : 'move:', c);
  closeTreeCtx();
}
function ctxRemove() { const c = treeCtx.value.conn; if (c) void removeConnection(c); closeTreeCtx(); }
function ctxRenameGroup() { const g = treeCtx.value.group; if (g) void onGroupCmd('rename', g.id); closeTreeCtx(); }
function ctxRemoveGroup() { const g = treeCtx.value.group; if (g) void onGroupCmd('remove', g.id); closeTreeCtx(); }
// 空白处右键的两个新建入口
function ctxNewConnection() { openAddDialog(); closeTreeCtx(); }
function ctxNewGroup() { void promptNewGroup(); closeTreeCtx(); }
function ctxNewSubGroup() {
  const g = treeCtx.value.group;
  if (g) void promptNewGroup(g.id);
  closeTreeCtx();
}
/** 目录完整路径（嵌套时用 / 连接，便于「移动到」菜单区分同名子目录） */
function groupPath(g: OpsGroup): string {
  const chain: string[] = [g.name];
  let cur = g;
  const guard = new Set<string>();
  while (cur.parentId && !guard.has(cur.parentId)) {
    guard.add(cur.parentId);
    const p = groups.value.find((x) => x.id === cur.parentId);
    if (!p) break;
    chain.unshift(p.name);
    cur = p;
  }
  return chain.join(' / ');
}

// ===== 窗口标签右键菜单 =====
const tabCtx = ref<{ visible: boolean; x: number; y: number; win: OpsWin | null }>({
  visible: false, x: 0, y: 0, win: null,
});
/** 窗口标签菜单元素：同上（渲染后按真实尺寸校正） */
const tabMenuEl = ref<HTMLElement | null>(null);
function onWinCtx(w: OpsWin, ev: MouseEvent) {
  const at = { x: ev.clientX, y: ev.clientY };
  tabCtx.value = { visible: true, ...at, win: w };
  placeMenuAfterRender(tabMenuEl, at, (p) => { tabCtx.value = { ...tabCtx.value, ...p }; });
}
function closeTabCtx() {
  tabCtx.value = { ...tabCtx.value, visible: false };
}
function ctxCloseTab() {
  const w = tabCtx.value.win;
  if (w) closeWindow(w.id);
  closeTabCtx();
}
function ctxCloseOtherTabs() {
  const w = tabCtx.value.win;
  if (w) for (const x of [...windows.value]) if (x.id !== w.id) closeWindow(x.id);
  closeTabCtx();
}
function ctxCloseAllTabs() {
  for (const x of [...windows.value]) closeWindow(x.id);
  closeTabCtx();
}

function onDocClick() {
  if (treeCtx.value.visible) closeTreeCtx();
  if (tabCtx.value.visible) closeTabCtx();
}
function onDocKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return;
  if (treeCtx.value.visible) closeTreeCtx();
  if (tabCtx.value.visible) closeTabCtx();
}

async function removeConnection(c: OpsConn) {
  // 它是别人的跳板机时，删掉会让那些连接连不上 —— 在确认框里说清楚，而不是删完才发现
  const dependents = connections.value.filter((x) => x.jumpConnectionId === c.id).map((x) => x.name);
  const warn = dependents.length
    ? `注意：它正被 ${dependents.join('、')} 当作跳板机，删除后这些连接会连不上，需重新指定跳板。`
    : '';
  const ok = await ElMessageBox.confirm(`删除连接「${c.name}」？${warn}`, '确认', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' })
    .then(() => true).catch(() => false);
  if (!ok) return;
  const res = await api.delete(`/plugin/ops-shell/connections/${c.id}`);
  if ('error' in res) { ElMessage.error(res.error); return; }
  // 关掉该连接的所有窗口，避免残留指向已删连接的窗口
  for (const w of windows.value.filter((x) => x.connectionId === c.id)) closeWindow(w.id);
  await loadConnections();
}

async function testConnection(c: OpsConn) {
  testingId.value = c.id;
  try {
    // 必须带 id：后端靠它取回已存密钥复用（不带密钥又没 id 的话，只会回「密码或私钥必填」）
    const r = await api.post<{ ok: boolean; error?: string }>('/plugin/ops-shell/connections/test', {
      id: c.id,
      type: connType(c), host: c.host, port: c.port, username: c.username, dbType: c.dbType, database: c.database,
    });
    if ('error' in r) { ElMessage.error(r.error); return; }
    if (r.data.ok) ElMessage.success('连接成功');
    else ElMessage.error(r.data.error || '连接失败');
  } finally {
    testingId.value = '';
  }
}

// 新建 / 编辑连接：统一走 OpsConnectionDialog 组件
const connDialogRef = ref<InstanceType<typeof OpsConnectionDialog> | null>(null);
function openAddDialog() {
  connDialogRef.value?.open();
}
function openEditDialog(c: OpsConn) {
  connDialogRef.value?.open(c);
}

/** 保存回调：刷新列表并为该资源开一个窗口（修掉「新增了连接但页面没反应」） */
async function onConnectionSaved(conn: OpsConn) {
  await Promise.all([loadConnections(), loadGroups()]);
  openConnectionNew(conn);
}

// ===== 操作日志 =====
interface AuditEntry { at: number; action: string; connection?: string; detail?: string; ok: boolean; via?: 'silent' }
const auditEntries = ref<AuditEntry[]>([]);
async function loadAudit() {
  const r = await api.get<AuditEntry[]>('/plugin/ops-shell/audit');
  if ('data' in r) auditEntries.value = r.data;
}
function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ===== 初始化 =====
function init() {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeydown);
  void loadGroups();
  void loadConnections();
  void loadAudit();
  // 模型清单拉**全量**：会话内可切到任意平台的模型（只拉默认平台那份会让下拉缺项）
  if (!platformStore.platforms.length) void platformStore.loadPlatforms().catch(() => {});
  if (!platformStore.models.length) void platformStore.loadModels().catch(() => {});
}
init();

// 从别的页面切回来：把仍然活着的终端接回新容器（不重开 PTY），并滚到底部
// ===== 命令审批闸门（生产连接上的写操作要人点头） =====
// 与后端的关系：助手在生产连接上发起非只读命令时，工具会返回「待批准」并在这里登记一条；
// 批准后助手原样重试才真正执行。批准与「连接 + 命令原文」绑定、用一次即失效（见 ops-approvals.ts）。
interface ApprovalRow {
  id: string;
  connectionName: string;
  command: string;
  reason: string;
  status: string;
  requestedAt: number;
}
const approvals = ref<ApprovalRow[]>([]);
let approvalPoll: (() => void) | null = null;

async function loadApprovals() {
  const r = await api.get<ApprovalRow[]>('/plugin/ops-shell/approvals');
  if ('data' in r) approvals.value = r.data.filter((a) => a.status === 'pending');
}

async function decideApproval(row: ApprovalRow, approve: boolean) {
  const r = await api.post(`/plugin/ops-shell/approvals/${row.id}`, { approve });
  if ('error' in r) { ElMessage.error(r.error); return; }
  approvals.value = approvals.value.filter((a) => a.id !== row.id);
  ElMessage.success(approve ? '已批准 —— 助手会原样重试该命令' : '已拒绝执行');
}

onMounted(() => {
  // 待批准命令：可见性感知轮询（3s）—— 助手一登记就该尽快出现在界面上
  approvalPoll = startVisiblePolling(loadApprovals, { intervalMs: 3000 });
  // 任务列表兜底重拉（2026-10-21）：App.vue 切模式时才 loadConversations，
  // 本页直开/子窗口进入时不一定会触发 —— 列表可能是别的模式的旧数据（空）。
  // 失败静默（列表保持现有值，不影响控制台使用）。
  void refreshTaskList();
  void nextTick(() => {
    // 恢复主导方形态（AI 模式下激活窗口回到 chat 视图）
    applyLeadToActiveWin();
    for (const w of windows.value) {
      const h = terms.get(w.id);
      if (h) attachTerm(h, w);
      if (w.view === 'chat') scrollChatBottom(w);
    }
  });
});

onUnmounted(() => {
  if (approvalPoll) { approvalPoll(); approvalPoll = null; }
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKeydown);
  // 这里**不**销毁终端与对话：切到别的页面后要保留 shell 连接与对话会话，
  // 回来时由 onMounted → attachTerm 把 xterm DOM 接回新容器。
  // 真正的销毁时机是用户主动「断开」或关闭窗口标签（见 closeTerminal / closeWindow）。
});
</script>

<style scoped>
/* ★ 布局盒子（列向撑满 + 定位基准）已交给 components/console/ConsoleShell.vue 的 .console-shell；
   这里只留本控制台自己的配色变量。 */
.ops-console {
  /* 列表 hover / 右键菜单 hover 统一底色：行与菜单共用同一个**不透明**色，
     半透明色叠两层会形成硬边色带（原来 hover 按钮那版就是这里脏） */
  --ops-row-hover: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface));
  --ops-row-active: color-mix(in srgb, var(--color-primary) 13%, var(--color-surface));
}

/* 左栏任务段（决策 13 / 5f.4）：在上、限高约 40%，超出滚动；资源树在下保留 */
.ops-side-tasks {
  flex: 0 0 auto;
  height: 34%;
  min-height: 120px;
  max-height: 40%;
  display: flex; flex-direction: column;
  border-bottom: 1px solid var(--glass-border);
  padding-bottom: 4px; margin-bottom: 6px;
}
.ops-side-tasks :deep(.tls) { height: 100%; }
/* 发布项目段（7b）：条目上限在组件内滚动，不挤压资源树 */
.ops-side-release { flex: 0 0 auto; }

/* 左栏底部实时面板（任务 7.4） */
.ops-side-metrics {
  flex: 0 0 auto;
  border-top: 1px solid var(--glass-border);
  padding-top: 6px;
  margin-top: 6px;
}
.ops-tree-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 2px 6px; flex-shrink: 0;
}
.ops-tree-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.ops-tree-actions { display: inline-flex; align-items: center; gap: 4px; }

/* 新增资源：与任务段「新建任务」同规格（20px 圆钮，hover 主色浅底） */
.ops-tree-new {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; flex-shrink: 0;
  border: none; border-radius: 6px;
  background: transparent; color: var(--color-text-tertiary);
  cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
}
.ops-tree-new:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}
.ops-tree { flex: 1; min-height: 0; overflow-y: auto; }

/* 拖拽：整树进入拖拽态时给可放目标一点提示；目录行命中 = 主色描边 + 浅底 */
.ops-tree.is-root-drop {
  outline: 1px dashed color-mix(in srgb, var(--color-primary) 55%, transparent);
  outline-offset: -3px;
  border-radius: 8px;
}
.ops-group-row.is-drop {
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  color: var(--color-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 45%, transparent);
}
.ops-group-row.is-drag-src,
.ops-conn-row.is-drag-src { opacity: 0.45; }
.ops-group-row, .ops-conn-row { transition: background 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease; }
.ops-group-row {
  display: flex; align-items: center; gap: 5px; padding: 5px 5px;
  border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--color-text-secondary);
  transition: background 0.15s ease;
}
.ops-group-row:hover { background: var(--ops-row-hover); }
.ops-group-caret, .ops-group-folder { font-size: 13px; flex-shrink: 0; }
.ops-group-folder { color: var(--color-text-tertiary); }
.ops-group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.ops-group-count { font-size: 10px; color: var(--color-text-tertiary); }
.ops-group-empty { padding: 6px 10px; font-size: 11px; color: var(--color-text-tertiary); }
.ops-group-body { padding-left: 12px; }

.ops-conn-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 6px; border-radius: 6px; cursor: pointer; font-size: 12px;
  transition: background 0.15s ease;
}
.ops-conn-row:hover { background: var(--ops-row-hover); }
.ops-conn-row.active,
.ops-conn-row.active:hover {
  background: var(--ops-row-active);
  box-shadow: inset 2px 0 0 var(--color-primary);
}
.ops-conn-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--color-text-tertiary); }
.ops-conn-dot[data-type="ssh"] { background: #409eff; }
.ops-conn-dot[data-type="docker"] { background: #67c23a; }
.ops-conn-dot[data-type="database"] { background: #e6a23c; }
.ops-conn-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ops-conn-testing { font-size: 11px; color: var(--color-text-tertiary); flex-shrink: 0; }
/* 经跳板接入的标记：轻量文字片，避免和标签 el-tag 抢视觉 */
.ops-conn-jump {
  flex-shrink: 0; font-size: 10px; line-height: 1.6; padding: 0 4px; border-radius: 3px;
  color: var(--color-text-tertiary);
  background: color-mix(in srgb, var(--color-text-tertiary) 14%, transparent);
}
/* 录制中标记：录制默认开启，用户在终端里应当看得见这件事 */
.ops-rec-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--el-color-danger); }
.ops-rec-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--el-color-danger);
  animation: ops-rec-blink 1.6s ease-in-out infinite;
}
@keyframes ops-rec-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

/* 待批准命令条：必须在任何 Tab 下都能看见 —— 助手正卡在等人点头 */
.ops-approvals {
  flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--el-color-warning) 35%, transparent);
  background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
}
.ops-approval { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.ops-approval-tag {
  flex-shrink: 0; padding: 1px 6px; border-radius: 3px; font-size: 11px;
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 22%, transparent);
}
.ops-approval-conn { flex-shrink: 0; color: var(--color-text-secondary); }
.ops-approval-cmd {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, "Courier New", monospace; color: var(--color-text-primary);
}
.ops-approval-actions { flex-shrink: 0; display: flex; gap: 6px; }



/* ===== 工作区 =====
   ★★ 2026-10-16 修「内容撑破窗口后被静默裁掉、且滚不到」：
   根元素从 `.page` 换成 ConsoleShell 后，丢了 `.page` 自带的 `overflow-y: auto`（整页的滚动容器），
   新外壳是 `overflow: hidden` ⇒ 内容一旦高过可视区，多出来的**既看不见也滚不到**
   （实测 1280×840 且开着文件面板：工作区被撑到 927px，底部 123px 凭空消失）。
   撑高的元凶是本条少了 `min-height: 0` —— 没有它，本节点的自动最小尺寸＝内容的最小内容高度
   （= 文件面板两栏在**不确定高度**下的内容高之和），于是它拒绝收缩 ⇒ 外层 .ops-tabs/.ops-body/.ops-main-files
   跟着一起变高、.sftp-panes 的 1fr 退化成"内容高" ⇒ **本地栏被顶到窗口下沿之外**（表现就是"本地那栏没了"）。
   两处一起给：min-height: 0 让正常情况收进可视区；overflow: auto 作兜底（真超高时可滚，不再静默裁掉）。 */
.ops-workspace { flex: 1; min-width: 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.ops-workspace-empty { flex: 1; display: flex; align-items: center; justify-content: center; }
.ops-tabs { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.ops-tabs :deep(.el-tabs__header) { margin-bottom: 8px; flex-shrink: 0; }
.ops-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.ops-tabs :deep(.el-tab-pane) { height: 100%; }
.ops-main-tab { height: 100%; display: flex; flex-direction: column; gap: 6px; min-height: 0; }

/* 顶部一行：窗口标签（左可滚动） + 整体设置（右固定） */
.ops-topbar { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.ops-topbar-global {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding-left: 8px; border-left: 1px solid var(--glass-border);
}
.ops-win-tabs {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 4px;
  overflow-x: auto; scrollbar-width: none; padding-bottom: 2px;
}
.ops-win-tabs::-webkit-scrollbar { display: none; }
.ops-win-tab {
  display: flex; align-items: center; gap: 5px; flex-shrink: 0;
  padding: 4px 6px 4px 8px; border-radius: 6px; cursor: pointer; font-size: 12px;
  border: 1px solid var(--glass-border); background: var(--glass-bg);
  color: var(--color-text-secondary); max-width: 200px;
}
.ops-win-tab:hover { background: var(--glass-bg-hover); }
.ops-win-tab.active {
  color: var(--color-text); border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}
.ops-win-tab-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--color-text-tertiary); }
.ops-win-tab-dot[data-type="ssh"] { background: #409eff; }
.ops-win-tab-dot[data-type="docker"] { background: #67c23a; }
.ops-win-tab-dot[data-type="database"] { background: #e6a23c; }
.ops-win-tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ops-win-tab-close { font-size: 12px; border-radius: 50%; padding: 1px; }
.ops-win-tab-close:hover { background: var(--el-color-danger); color: #fff; }

/* 窗口体 */
/* 窗口内容 + 全局文件面板 并排 */
.ops-body { flex: 1; display: flex; gap: 6px; min-height: 0; }
.ops-win-body { flex: 1; min-width: 0; min-height: 0; }
.ops-win { position: relative; height: 100%; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.ops-win-head { display: flex; align-items: center; gap: 10px; flex-shrink: 0; min-height: 20px; }
.ops-win-conn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--color-text-secondary); font-family: Consolas, monospace; }
.ops-win-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.ops-win-head-actions :deep(.el-button + .el-button) { margin-left: 0; }
.ops-term-hint { font-size: 11px; color: var(--color-text-tertiary); }

/* 主视图区（文件面板已提到 .ops-body 层，作为全局面板） */
.ops-main { flex: 1; display: flex; gap: 6px; min-height: 0; }
.ops-main-primary { flex: 1 1 auto; min-width: 260px; min-height: 0; }
.ops-main-files {
  flex: 0 0 auto; min-width: 280px; min-height: 0;
  padding-left: 10px; border-left: 1px solid var(--glass-border);
}

/* 终端 */
.ops-term-wrap { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.ops-term { flex: 1; min-height: 0; border-radius: 10px; overflow: hidden; background: #141414; padding: 6px; }
.ops-term-empty {
  flex: 1; min-height: 0; border-radius: 10px;
  border: 1px dashed var(--glass-border);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
}
.ops-term-empty-title { font-size: 14px; font-weight: 600; color: var(--color-text-secondary); }
.ops-term-empty-sub { font-size: 12px; color: var(--color-text-tertiary); }

/* 容器 / 数据库 */
.ops-docker, .ops-db { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.ops-docker-bar, .ops-db-bar { display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
.ops-docker-bar :deep(.el-button + .el-button), .ops-db-bar :deep(.el-button + .el-button) { margin-left: 0; }
.ops-docker-error { font-size: 12px; color: var(--el-color-danger); }
.ops-docker-table { flex: 1; min-height: 0; }
.ops-db-table-select { width: 220px; }
.ops-db-sql :deep(textarea) { font-family: Consolas, monospace; font-size: 12px; }
.ops-db-meta { font-size: 11px; color: var(--color-text-tertiary); }

/* 对话模式 */
/* 对话模式（视觉对齐「任务」页：圆头像 + 气泡 + 胶囊输入框） */
.ops-chat { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
/* 已绑定发布项目条（7b）：本地目录 + 项目名，窄屏时路径省略 */
.ops-bound-bar {
  flex-shrink: 0; display: flex; align-items: baseline; gap: 8px;
  padding: 4px 10px; border-radius: 8px; font-size: 11.5px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
}
.ops-bound-title { flex: none; color: var(--color-primary); }
.ops-bound-path { min-width: 0; color: var(--color-text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: Consolas, monospace; }
.ops-chat-list {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 16px; padding: 8px 6px 14px;
}
.ops-chat-welcome {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; text-align: center; color: var(--color-text-secondary); padding: 24px;
}
.ops-chat-welcome-icon { color: var(--color-primary); }
.ops-chat-welcome-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--color-text); }
.ops-chat-welcome-sub { margin: 0; font-size: 12px; line-height: 1.8; max-width: 340px; }
.ops-msg { display: flex; gap: 10px; animation: opsMsgIn 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes opsMsgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.ops-msg.msg-user { flex-direction: row-reverse; }
/* 轮：用户问 + 助手答（含思考/工具）为一组，组间留白大于组内 */
.ops-round { display: flex; flex-direction: column; gap: 10px; }
.ops-round + .ops-round { margin-top: 5px; }

/* 工具摘要条（WorkBuddy 式）：默认一行，点开才出步骤明细 */
.ops-tool-summary {
  display: flex; align-items: center; gap: 6px;
  align-self: flex-start; max-width: 100%;
  padding: 3px 9px; margin: 2px 0 4px;
  border: 1px solid var(--glass-border); border-radius: 7px;
  background: color-mix(in srgb, var(--color-text) 3%, transparent);
  font-size: 11.5px; color: var(--color-text-secondary);
  cursor: pointer; user-select: none;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.ops-tool-summary:hover { color: var(--color-text); border-color: color-mix(in srgb, var(--color-primary) 35%, transparent); }
.ops-tool-summary-icon { flex-shrink: 0; color: var(--el-color-success, #16a34a); }
.ops-tool-summary.is-live .ops-tool-summary-icon { color: var(--color-primary); }
.ops-tool-summary-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ops-tool-summary-caret { flex-shrink: 0; color: var(--color-text-tertiary); transition: transform 0.15s ease; }
.ops-tool-summary.is-open .ops-tool-summary-caret { transform: rotate(90deg); }
.ops-tool-steps { margin: 0 0 6px; }

/* 深度思考（复用主对话 DeepThinkBadge + .reasoning-body，这里只补运维侧的外边距） */
.ops-msg-body .msg-reasoning { margin: 2px 0 6px; }
.ops-msg-body .reasoning-body { margin-top: 4px; max-height: 220px; overflow-y: auto; }

/* 思考中的三点初始态 */
.ops-typing { padding: 4px 2px; }
.typing-dots { display: inline-flex; gap: 4px; align-items: center; }
.typing-dots > span {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--color-text-tertiary);
  animation: opsTyping 1.2s infinite ease-in-out;
}
.typing-dots > span:nth-child(2) { animation-delay: 0.15s; }
.typing-dots > span:nth-child(3) { animation-delay: 0.3s; }
@keyframes opsTyping {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
}
.ops-msg-avatar {
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.ops-msg-avatar.avatar-user { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); }
.ops-msg-avatar.avatar-assistant { background: linear-gradient(135deg, var(--color-accent), var(--color-primary-dark)); }
.ops-msg-body { min-width: 0; max-width: calc(100% - 40px); display: flex; flex-direction: column; }
.ops-msg.msg-user .ops-msg-body { align-items: flex-end; flex: 1 1 0; }
.ops-msg-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 0 4px; }
.ops-msg-role-name { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.ops-msg-time { font-size: 11px; color: var(--color-text-secondary); opacity: 0.6; }
.ops-msg-streaming { font-size: 11px; color: var(--color-primary); }
.ops-msg-content {
  font-size: 13px; line-height: 1.65; word-break: break-word; overflow-wrap: break-word;
  padding: 10px 14px; border-radius: 14px;
}
.ops-msg.msg-user .ops-msg-content {
  background: var(--gradient-primary); color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-primary) 22%, transparent);
  display: inline-block; max-width: 100%;
}
/* 助手回复去卡片化（同「任务」页）：纯文本流 + 自带代码块底色 */
.ops-msg.msg-assistant .ops-msg-content { background: transparent; border-radius: 0; padding: 2px 2px 0; }

/* 助手消息 markdown 排版（此前 .ops-md 没有任何规则，列表/代码块全走浏览器默认，是「丑」的主因之一） */
.ops-md p { margin: 6px 0; }
.ops-md p:first-child { margin-top: 0; }
.ops-md p:last-child { margin-bottom: 0; }
.ops-md ul, .ops-md ol { padding-left: 20px; margin: 6px 0; list-style-position: outside; }
.ops-md li { margin: 3px 0; }
.ops-md code {
  font-family: "JetBrains Mono", Consolas, monospace; font-size: 0.88em;
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
  padding: 1px 5px; border-radius: 4px;
}
/* 代码块（2026-10-21）：此前无 position 定位，highlight() 注入的「复制」按钮是 <pre> 的
   首个子元素、按文档流排在最前一行 → 压在 1./2. 标题文字中间（截图实报）。改为 relative
   + 按钮 absolute 右上角，hover 才显形；配色改浅底（原深底在白面板里像打补丁）。 */
.ops-md pre {
  position: relative;
  background: color-mix(in srgb, var(--color-text) 4%, transparent);
  border: 1px solid var(--glass-border);
  color: var(--color-text); padding: 9px 12px; border-radius: 8px;
  overflow-x: auto; font-family: "JetBrains Mono", Consolas, monospace; font-size: 12px;
  line-height: 1.55;
  margin: 6px 0; max-width: 100%;
  white-space: pre-wrap; word-break: break-word;
}
.ops-md pre code { background: transparent; padding: 0; color: inherit; }
.ops-md pre :deep(.code-lang) {
  position: absolute; top: 7px; left: 12px;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}
.ops-md pre.has-lang { padding-top: 22px; }
.ops-md pre :deep(.code-copy-btn) {
  position: absolute; top: 6px; right: 6px;
  opacity: 0; transition: opacity 0.15s ease;
  border: 1px solid var(--glass-border); background: var(--color-surface);
  color: var(--color-text-secondary); font-family: inherit; font-size: 10.5px;
  padding: 1px 7px; border-radius: 6px; cursor: pointer;
}
.ops-md pre:hover :deep(.code-copy-btn) { opacity: 1; }
.ops-md pre :deep(.code-copy-btn:hover) { color: var(--color-primary); border-color: var(--color-primary); }
.ops-md blockquote {
  margin: 8px 0; padding: 4px 12px; border-left: 3px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent); border-radius: 0 6px 6px 0;
}
.ops-md table { border-collapse: collapse; margin: 8px 0; font-size: 12px; max-width: 100%; display: block; overflow-x: auto; }
.ops-md th, .ops-md td { border: 1px solid var(--glass-border); padding: 4px 10px; text-align: left; }
.ops-md th { background: var(--glass-bg-hover); font-weight: 600; }
.ops-md a { color: var(--color-primary); }
.ops-md h1, .ops-md h2, .ops-md h3, .ops-md h4 { margin: 10px 0 6px; font-size: 13.5px; }

.ops-chat-input {
  flex-shrink: 0;
  background: var(--color-surface); border: 1px solid var(--glass-border);
  border-radius: 16px; padding: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.ops-chat-input:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 6px 28px color-mix(in srgb, var(--color-primary) 13%, transparent);
}
.ops-chat-input :deep(.el-textarea__inner) {
  border: none; background: transparent; box-shadow: none !important;
  padding: 8px 10px; border-radius: 10px; font-size: 13px; line-height: 1.6; resize: none;
}
.ops-chat-input :deep(.el-textarea__inner::placeholder) { color: var(--color-text-secondary); opacity: 0.8; }
/* 输入框工具条（P0）：32px 单行，左=动作语义，右=模型 / 静默权限 / 发送。
   右侧留 56px：右下角主导方悬浮胶囊（LeadToggle，right:16 + 34px 宽）压在工具条右端，
   不留白会把「发送」盖住、点击还会误触切换模式 */
.ops-input-toolbar { display: flex; align-items: center; gap: 8px; padding: 0 56px 2px 6px; min-height: 28px; }
.ops-toolbar-group { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.ops-toolbar-spacer { flex: 1; min-width: 4px; }

/* 工作目录按钮（对齐主对话输入区的目录入口）：只显示末级目录名，全路径进 title */
.ops-dir-btn {
  display: inline-flex; align-items: center; gap: 4px;
  flex-shrink: 0; max-width: 168px; min-width: 0;
  height: 24px; padding: 0 8px;
  border: 1px solid var(--glass-border); border-radius: 7px;
  background: transparent; color: var(--color-text-secondary);
  font-family: inherit; font-size: 11.5px; cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.ops-dir-btn:hover {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
}
.ops-dir-btn > .el-icon { flex-shrink: 0; }
.ops-dir-name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, monospace;
}
.ops-input-toolbar :deep(.el-button + .el-button) { margin-left: 0; }
.ops-tool-btn { height: 24px; padding: 0 10px; font-size: 11.5px; }
.ops-tool-btn-active { color: var(--color-primary); border-color: color-mix(in srgb, var(--color-primary) 45%, transparent); }
.ops-model-select { width: 168px; max-width: 34vw; }
.ops-model-select :deep(.el-select__wrapper) { min-height: 24px; font-size: 11.5px; }
.ops-perm-btn { height: 24px; padding: 0 6px; }
.ops-perm-panel { display: flex; flex-direction: column; gap: 8px; }
.ops-perm-title { font-size: 12.5px; font-weight: 600; }
.ops-perm-sub { margin: 0; font-size: 11px; line-height: 1.55; color: var(--color-text-secondary); }
.ops-perm-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
.ops-perm-warn { font-size: 11px; line-height: 1.5; color: var(--el-color-danger, #d9534f); }

/* ===== 底部命令行（任务 7.7）：AI 模式输入框下的单行状态条 ===== */
.ops-cmdline {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 56px 5px 8px; margin-top: 6px;
  border-radius: 8px; cursor: text;
  border: 1px solid var(--glass-border);
  background: color-mix(in srgb, var(--color-text) 3%, transparent);
  font-family: Consolas, monospace; font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
}
.ops-cmdline:hover { border-color: color-mix(in srgb, var(--color-primary) 40%, transparent); }
.ops-cmdline.running { color: var(--color-primary); border-color: color-mix(in srgb, var(--color-primary) 35%, transparent); }
.ops-cmdline.confirm { color: var(--el-color-warning, #c2740b); border-color: color-mix(in srgb, var(--el-color-warning, #c2740b) 45%, transparent); }
.ops-cmdline-prompt { flex-shrink: 0; font-weight: 700; }
.ops-cmdline-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ops-cmdline-caret { flex-shrink: 0; animation: opsCaret 1s steps(2, start) infinite; }
@keyframes opsCaret { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0.15; } }

/* ===== 命令模式底部折叠对话条（任务 7.8）===== */
.ops-cmdchat {
  flex: 0 0 auto;
  border-top: 1px solid var(--glass-border);
  background: var(--color-surface);
  display: flex; flex-direction: column;
  max-height: 46%;
}
.ops-cmdchat-bar {
  display: flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 8px; flex-shrink: 0;
  cursor: pointer; user-select: none;
  font-size: 11.5px; color: var(--color-text-secondary);
}
.ops-cmdchat-bar:hover { background: var(--glass-bg-hover); color: var(--color-primary); }
.ops-cmdchat-title { font-weight: 600; flex-shrink: 0; }
.ops-cmdchat-preview {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 10.5px; color: var(--color-text-tertiary);
}
.ops-cmdchat-spacer { flex: 1; }
.ops-cmdchat-body {
  display: flex; flex-direction: column; min-height: 0;
  padding: 4px 8px 8px; gap: 6px;
}
.ops-cmdchat-msgs {
  flex: 1; min-height: 90px; max-height: 220px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px; padding-right: 2px;
}
.ops-cmdchat-empty { font-size: 11px; color: var(--color-text-tertiary); padding: 6px 2px; }
/* 折叠条里的消息泡：去掉头像、缩小字号（省空间，功能不减） */
.ops-msg-sm { gap: 0; }
.ops-msg-sm .ops-msg-content { font-size: 12px; padding: 6px 10px; }
.ops-cmdchat-chips { display: flex; flex-wrap: wrap; gap: 5px; flex-shrink: 0; }
.ops-chip {
  border: 1px solid var(--glass-border); border-radius: 10px;
  background: transparent; color: var(--color-text-secondary);
  font-size: 10.5px; font-family: inherit; padding: 2px 8px; cursor: pointer;
  transition: all 0.15s ease;
}
.ops-chip:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.ops-chip:disabled { opacity: 0.45; cursor: not-allowed; }
.ops-cmdchat-input { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

/* 操作日志 */
.ops-audit { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.ops-audit-via { margin-left: 4px; }
.ops-empty { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; font-size: 12px; color: var(--color-text-tertiary); text-align: center; line-height: 1.8; }
.ops-log-view {
  margin: 0; max-height: 60vh; overflow: auto; padding: 10px; border-radius: 8px;
  background: #141414; color: #e5e5e0; font-size: 12px; font-family: Consolas, monospace; white-space: pre-wrap;
}
</style>
