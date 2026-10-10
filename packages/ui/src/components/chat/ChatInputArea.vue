<template>
  <div
    ref="inputAreaEl"
    class="input-area"
    :class="{ 'is-mobile-collapsed': isMobileShell && !mobileExpanded }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="input-box" :class="{ focused: inputFocused, 'is-dragover': dragOver }">

      <div class="input-agent-bar">
        <el-dropdown trigger="click" placement="bottom-start" popper-class="agent-switch-popper" @command="onAgentSwitch" @visible-change="onAgentDropdownVisible">
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
            <!-- 用 Tools 而非 Setting：Setting 是 TabBar「我的」的图标（移动端常驻同屏），
                 且"配置这个智能体的能力"用工具语义更贴切（2026-09-21 实测齿轮 3 处重复）。 -->
            <el-icon><Tools /></el-icon>
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

      <!-- 7.3 任务运行中：输入区上方常驻一行运行指示 + 停止按钮。
           步骤数来自 task_plan/task_step 登记的任务计划（有就显示 步骤 x/y，没有就转圈+文案）。
           ★ 有计划时点击该行可展开/收缩「主任务步骤详情」（与浏览器预览里的 pageAgent 步骤悬浮卡是两回事）。
           ★ 打断入口收敛：此处是唯一的「停止」，工具条发送键不再兼任停止（见下方发送按钮注释）。 -->
      <div
        v-if="store.streaming"
        class="run-indicator"
        :class="{ expandable: planTotal > 0 }"
        @click="planTotal > 0 && (runDetailOpen = !runDetailOpen)"
      >
        <el-icon class="run-spinner is-loading"><Loading /></el-icon>
        <span class="run-text">
          任务运行中
          <template v-if="planTotal"> · 步骤 {{ planDoneCount }}/{{ planTotal }}</template>
          · 已用时 <span class="run-elapsed">{{ formatDur(runElapsedSec) }}</span>
        </span>
        <el-icon v-if="planTotal > 0" class="run-caret" :class="{ open: runDetailOpen }"><CaretRight /></el-icon>
        <button type="button" class="run-stop-btn" title="停止任务" @click.stop="stopChat">
          <span class="run-stop-square" aria-hidden="true"></span>停止
        </button>
      </div>
      <!-- 运行进度条：登记了任务计划按 步骤x/y 填充；没计划走不定态流动条（表示"在跑，但无步骤可量"） -->
      <div v-if="store.streaming" class="run-progress" :class="{ indeterminate: planTotal === 0 }" aria-hidden="true">
        <div class="run-progress-fill" :style="planTotal > 0 ? { width: planPercent + '%' } : undefined"></div>
      </div>
      <!-- 结束状态回执：任务收尾后短暂停留 10s（完成/停止/失败 + 总耗时），新任务开跑即清 -->
      <div v-else-if="runResult" class="run-result" :class="runResult.status">
        <el-icon v-if="runResult.status === 'completed'" class="run-result-icon"><Check /></el-icon>
        <el-icon v-else-if="runResult.status === 'error'" class="run-result-icon"><Close /></el-icon>
        <span v-else class="run-result-icon run-result-square" aria-hidden="true"></span>
        <span class="run-text">{{ runResultLabel }} · 用时 {{ formatDur(runResult.seconds) }}</span>
      </div>
      <!-- 主任务步骤详情：整份任务计划（task_plan/task_step），点击运行指示行展开/收缩 -->
      <div v-if="store.streaming && runDetailOpen && planTotal > 0" class="run-steps">
        <div v-for="(s, i) in store.planSteps" :key="s.id" class="run-step" :class="s.status">
          <span class="run-step-idx">{{ i + 1 }}</span>
          <el-icon v-if="s.status === 'done'" class="run-step-mark done"><Check /></el-icon>
          <el-icon v-else-if="s.status === 'running'" class="run-step-mark running is-loading"><Loading /></el-icon>
          <el-icon v-else-if="s.status === 'failed'" class="run-step-mark failed"><Close /></el-icon>
          <span v-else class="run-step-mark pending"></span>
          <div class="run-step-body">
            <div class="run-step-title">{{ s.title }}</div>
            <div v-if="s.note || s.description" class="run-step-note">{{ s.note || s.description }}</div>
          </div>
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

      <!-- ★ 移动端「默认小、点击变大」（用户拍板：默认 1 行，点击展开）：
           收起态给容器挂 `is-collapsed`，由 CSS 把 textarea 压成**恰好一行**
           （`.input-textarea .el-textarea__inner { height: 行高 + 内边距 }`），
           聚焦后去掉该类 → textarea 回到 autosize 的 3~12 行。
           ⚠️ 为什么不靠 autosize 的 minRows=1：Element Plus 算高度时用
           `value || placeholder`，本输入框 placeholder 较长（"输入消息，Enter 发送…"）
           → **placeholder 把 1 行顶成 2 行**，minRows 形同虚设（实测 taHeight 恒 40px）。
           走 CSS 才能真正压到一行，且桌面端完全不受影响（类名只在移动端挂）。 -->
      <!-- ★ 移动端长按输入框弹自定义菜单（复制 / 粘贴 / 发送 / 新建任务）。
           ⚠️ 为什么不直接把 v-on 挂在 el-input 上：组件上的 v-on 走的是**自定义事件**，
              `toHandlers` 展开出来的原生事件名对组件无效 → 永远不会触发。
              所以包一层原生 div 承接 pointer 事件（Pointer 从 textarea 正常冒泡上来）。
           ★ 桌面端零影响：bindLongPress 内部只认 `pointerType === 'touch'`，
             鼠标按下直接 return（详见 useLongPress 文件头）。 -->
      <div
        class="input-textarea-wrap"
        v-on="bindLongPress(onInputLongPress)"
        @contextmenu="onInputContextMenu"
      >
        <el-input
          ref="inputRef"
          v-model="input"
          type="textarea"
          :autosize="inputAutosize"
          class="input-textarea"
          :class="{
            'is-collapsed': isMobileShell && !mobileExpanded,
            'is-expanded': isMobileShell && mobileExpanded,
          }"
          :placeholder="inputPlaceholder"
          @keydown.enter.exact="onEnter"
          @keydown.up="onKeyUp"
          @keydown.down="onKeyDown"
          @keydown.esc="onEsc"
          @paste="onPaste"
          @focus="onInputFocus"
          @blur="onInputBlur"
        />
      </div>

      <!-- 输入框长按菜单（移动端）。Teleport 到 body：输入区在收起态会被压成一行的
           overflow 裁切范围内，留在原地会被裁掉半个面板。 -->
      <Teleport to="body">
        <div
          v-if="inputMenu.visible"
          class="ilm-layer"
          @click="onInputMenuLayerClick"
          @contextmenu.prevent="closeInputMenu"
        >
          <ul class="ilm-menu" :style="{ left: inputMenu.x + 'px', top: inputMenu.y + 'px' }" @click.stop>
            <li class="ilm-item" :class="{ 'is-disabled': !hasInputText }" @click="ilmCopy">
              <el-icon :size="14"><CopyDocument /></el-icon><span>复制</span>
            </li>
            <li class="ilm-item" @click="ilmPaste">
              <el-icon :size="14"><DocumentCopy /></el-icon><span>粘贴</span>
            </li>
            <li class="ilm-sep"></li>
            <li class="ilm-item" :class="{ 'is-disabled': !canSubmit }" @click="ilmSend">
              <el-icon :size="14"><Promotion /></el-icon><span>发送</span>
            </li>
            <li class="ilm-item" @click="ilmNewTask">
              <el-icon :size="14"><FolderAdd /></el-icon><span>新建任务</span>
            </li>
          </ul>
        </div>
      </Teleport>

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
              <el-icon class="cmd-menu-icon" :style="{ color: refIconMeta(f).color }">
                <component :is="refIconMeta(f).icon" />
              </el-icon>
              <span class="cmd-menu-label">{{ f.name }}<span v-if="(f as any).isSymbol" style="color:var(--el-text-color-secondary,#94a3b8);font-size:11px;margin-left:2px">:{{ (f as any).line }}</span></span>
            </div>
            <div v-if="atFileList.length === 0" class="cmd-menu-empty">无匹配文件，可先在文件管理中上传</div>
          </template>
        </div>
      </transition>

      <div class="input-toolbar">
        <div class="toolbar-left">
          <!-- 6.1/6.2 上下文用量胶囊：常驻工具条左下（spec 场景「点击输入区左下角胶囊」）。
               数据取自 useChat 的 tokenCount/tokenPercent（前端估算 + 有效窗口口径），
               分段明细与压缩提示见 ContextUsagePill 组件内注释。 -->
          <ContextUsagePill
            :used-tokens="tokenCount"
            :limit-tokens="contextLimit"
            :declared-window="declaredContextWindow"
            :percent="tokenPercent"
            :compact-count="compactCount"
            :conversation-id="store.currentConvId || ''"
            :agent-id="agentStore.selectedId || ''"
          />
          <el-popover v-model:visible="plusOpen" placement="top-start" :width="264" trigger="click" :show-arrow="false" popper-class="plus-menu-popper">
            <template #reference>
              <el-button size="small" circle class="ctx-btn plus-btn" :class="{ 'is-active': plusOpen }">
                <el-icon><Plus /></el-icon>
              </el-button>
            </template>
            <div class="plus-menu-wrap" @mouseleave="scheduleCloseSub">
              <div class="plus-menu">
                <!-- ★★ 原第一项「助手」（hover 展开助手列表 + 点击切换）已删除：
                     它与**输入框上方**的 `.input-agent-bar` 智能体下拉是同一个动作
                     （都调 agentStore.select / onAgentSwitch），属于"同一动作两个入口"。
                     用户 2026-08-21 拍板的口径是「智能体切换移到输入框上方」，
                     所以保留上方下拉、去掉这里这份（2026-09-21 复核确认冗余）。 -->
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
                <!-- 工具权限：窄屏不再单独占一个工具条按钮（用户拍板「权限放到加号按钮里面」），
                     桌面端工具条上仍保留独立的权限胶囊，此处是它的窄屏落点。
                     两侧写同一个 store.permissionMode，避免两种真相。 -->
                <div class="plus-menu-item" :class="{ 'has-sub-open': hoverSub === 'perm' }" @mouseenter="openSub('perm', $event)" @click="openSub('perm', $event)">
                  <span class="plus-menu-ic"><el-icon><Lock /></el-icon></span>
                  <div class="plus-menu-info">
                    <div class="plus-menu-label">工具权限</div>
                    <div class="plus-menu-desc">{{ permissionLabel }}</div>
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
                <!-- 「新建任务」在顶栏与左栏任务树都有常驻入口 → 此处去掉，避免同一动作三处入口 -->
                <div class="plus-menu-item" @mouseenter="closeSubNow" @click="closePlus(openPlatformConfig)">
                  <!-- 这里就是「配置模型平台」的主入口，图标与侧栏 TabBar 的「我的」(Setting)、
                       以及空态 CTA 都不同，互不撞脸。 -->
                  <span class="plus-menu-ic"><el-icon><Coin /></el-icon></span>
                  <div class="plus-menu-info"><div class="plus-menu-label">配置模型平台</div></div>
                </div>
              </div>
              <!-- hover 右侧弹出的子菜单（专家列表 / 模式开关） -->
              <Teleport to="body">
              <transition name="plus-sub-fade">
                <div v-if="hoverSub" class="plus-menu plus-menu-sub" :style="{ top: subTop + 'px', left: subLeft + 'px' }" @mouseenter="cancelCloseSub">
                  <!-- 原 `hoverSub === 'agents'` 分支（助手列表 + 编辑当前助手）已随主菜单「助手」项一并删除：
                       选助手 = 输入框上方的 .input-agent-bar 下拉；编辑助手 = 同区域的 Tools 圆钮。
                       两处入口都在输入框上方，不再在 + 菜单里重复一份。 -->
                  <template v-if="hoverSub === 'skills'">
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
                  <template v-else-if="hoverSub === 'modes'">
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
                  <!-- 工具权限子菜单：与桌面端工具条的权限胶囊同一个 store.permissionMode -->
                  <template v-else-if="hoverSub === 'perm'">
                    <div
                      v-for="p in PERMISSION_OPTIONS"
                      :key="p.value"
                      class="plus-menu-item"
                      :class="{ 'is-active': store.permissionMode === p.value }"
                      @click="closePlus(() => onPermissionChange(p.value))"
                    >
                      <span class="plus-menu-ic"><el-icon><Lock /></el-icon></span>
                      <div class="plus-menu-info">
                        <div class="plus-menu-label">{{ p.label }}</div>
                        <div class="plus-menu-desc">{{ p.desc }}</div>
                      </div>
                      <el-icon v-if="store.permissionMode === p.value" class="plus-menu-check"><Check /></el-icon>
                    </div>
                  </template>
                </div>
              </transition>
              </Teleport>
            </div>
          </el-popover>
          <!-- 7.1（2026-10-04 回退）：附件 / 技能 / MCP 不平铺，统一收在「+」菜单里，
               避免工具条一排图标又挤又乱。需要直达时点「+」即可。 -->
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

        <!-- 窄屏专属补充项。用户拍板（2026-08-21 二次澄清）：
               · 智能体切换**移到输入框上方**（见 .input-agent-bar）→ 这里不再放
               · 工具条只留：`+`（含工具权限）/ 切换模型 / 新增任务 / 发送
             ★★ 必须 `v-if="isMobileShell"`：不能只靠 CSS 隐藏 ——
               el-popover 的内容是 Teleport 到 body 的，**父容器 display:none 对它无效**，
               只隐藏不卸载会让弹层"隐身但可弹"，与桌面端胶囊一起造成"点一次两个弹窗"。
               加 v-if 后与桌面胶囊严格互斥（同一时刻只有一个模型入口存在于 DOM）。 -->
        <div v-if="isMobileShell" class="toolbar-mobile-selects">
          <!-- 切换模型（窄屏入口）。
               ★★ 与桌面端那个模型胶囊是**两个独立的 el-popover**，但**绝不能共用同一个 visible**：
               Element Plus 的 popover 内容是 Teleport 到 body 的，**不受父容器 display:none 影响** ——
               窄屏下桌面胶囊虽然被 CSS 隐藏，它的 popover 内容照样会渲染出来。
               两者共用 `modelPopOpen` 时，点一次移动端按钮 → 两个弹窗同时打开
               （用户 2026-09-22 报的「模型下拉点击两个弹窗」）。
               故移动端用**独立的** `mobileModelPopOpen`。
               ★ 真机 isMobilePlatform=true 时桌面那个 popover 是 v-if 不渲染，不会出现双开；
                 但"窄窗 Web / 桌面预览"下两者都在 DOM 里，共用 visible 必然双开（实测复现）。 -->
          <el-popover v-model:visible="mobileModelPopOpen" placement="top" trigger="click" :width="260" :show-arrow="false" popper-class="model-select-popper-mobile">
            <template #reference>
              <el-button size="small" circle class="mobile-model-btn" :title="`切换模型：${currentModelName}`">
                <!-- 用 Aim 而非 Cpu：Cpu 是 TabBar「模型」项的图标（移动端常驻同屏），
                     这里若再用 Cpu，一屏会出现两个相同的「芯片」图标
                     （2026-09-21 实测 fp=1rogz5v 两组重复）。 -->
                <el-icon><Aim /></el-icon>
              </el-button>
            </template>
            <div class="pop-select-list pop-select-models">
              <el-input v-model="modelSearch" size="small" placeholder="搜索模型" clearable class="pop-model-search">
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <div class="pop-model-scroll" ref="mobileModelScrollEl">
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
        </div>

        <div class="toolbar-right">
          <!-- 上下文用量指示已收敛为工具条左下角的 ContextUsagePill 胶囊（Task 6）：
               原 2026-10-02 的 18px 用量环（hover tooltip）删除，同一信息不摆两个入口。 -->
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
          <!-- ★★ 桌面端模型胶囊：`v-if="!isMobileShell"` 必须加。
               原实现只靠 CSS 在窄屏 `display:none` 隐藏它，但 el-popover 的内容是
               **Teleport 到 body** 的，父容器隐藏对弹层无效 —— 于是窄屏点移动端模型钮时，
               这个（被隐藏但仍存在于 DOM 的）popover 也会一起弹出来 → 「点一次两个弹窗」。
               加 v-if 后与 .toolbar-mobile-selects 严格互斥（同一时刻只有一个模型入口存在）。 -->
          <el-popover
            v-if="!isMobileShell"
            v-model:visible="modelPopOpen"
            placement="top-end"
            :width="260"
            trigger="click"
            :show-arrow="false"
            transition="pop-select-fade"
            popper-class="model-select-popper"
          >
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
              <div class="pop-model-scroll" ref="modelScrollEl">
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
          <!-- 「新建任务」入口已收敛：只保留顶栏 ChatTopbar 与左侧栏任务树的「+」。
               此处原有一个 EditPen 圆钮，与顶栏同名同图标 → 一行工具条里两个完全相同的按钮，
               且加号菜单里还有第三处。输入框工具条至此只留「上下文/权限/模型/发送」四类主动作。 -->
          <!-- 「新建任务」入口：用户 2026-08-21 明确要求移动端工具条保留它
               （此前一轮按「只留顶栏 + 侧栏」删掉了，本轮按新口径加回移动端）。
               ★ 只在移动端分支渲染：桌面端仍由顶栏 + 侧栏树承担，避免一排三个入口。 -->
          <!-- 「新建任务」入口：移动端走下方 mobile-new-task-btn；桌面端在工具条同样给一个图标入口
               （2026-10-04 用户要求输入框里要有新建任务图标）。 -->
          <el-tooltip v-if="!isMobileShell" content="新建任务" placement="top">
            <el-button size="small" circle class="ctx-btn" @click="startNewChat()">
              <el-icon><FolderAdd /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip v-if="isMobileShell" content="新建任务" placement="top">
            <el-button size="small" circle class="mobile-new-task-btn" @click="startNewChat()">
              <!-- 用 FolderAdd 而非 EditPen/DocumentAdd：EditPen 是顶栏「新建任务」的图标，
                   而顶栏是一个容器（Active 态下图标会落在胶囊底色里 → 视觉上仍像两个相同图标）。
                   换 FolderAdd（"新建"语义，形状与 EditPen/DocumentAdd 都不同）彻底避开。 -->
              <el-icon><FolderAdd /></el-icon>
            </el-button>
          </el-tooltip>
          <!-- 7.3 打断入口收敛：停止键移到输入区上方「任务运行中」一行（见 .run-indicator），
               此处恒为发送键 —— 运行中点击发送即入追加队列（原有行为），不再在两处各摆一个停止。 -->
          <el-tooltip :content="store.streaming ? '发送（任务运行中将加入队列）' : '发送 (Enter)'" placement="top">
            <span>
              <el-button type="primary" :icon="Promotion" :disabled="sending || (!input.trim() && uploadedFiles.length === 0 && quotedUrls.length === 0) || !selectedModelId" @click="send" circle class="send-btn" />
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
        <el-icon class="file-chip-icon" :style="{ color: refIconMeta(f).color }">
          <component :is="refIconMeta(f).icon" />
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
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import type { Component } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';
import {
  FolderOpened, ArrowDown, ArrowRight, Connection, Files, UploadFilled, User, EditPen, Cpu, Setting, Plus, Camera,
  Promotion, Close, Lock, Check, Picture, Document, Tickets, Box, VideoCamera, Headset, Memo, ChatDotRound,
  Operation, Search, Link, Delete, Clock, Tools, Coin, DocumentAdd, Aim, FolderAdd, CopyDocument, DocumentCopy, Loading, CaretRight,
} from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
// ★ 移动端长按（触屏专属，内部只认 pointerType==='touch'，桌面端零影响）
import { bindLongPress } from '../../composables/useLongPress';
import AttachmentPreview from './AttachmentPreview.vue';
import ModelContextPanel from './ModelContextPanel.vue';
import ContextUsagePill from './ContextUsagePill.vue';
import { useCodeStore } from '../../stores/code';
import { useSettingsStore, usePlatformStore } from '../../stores';
import { formatContextWindow } from '../../utils/context-window';
import { resolveAgentIcon as agentIconOf } from '../../utils/agentIcon';
import type { Model } from '@yan-zhi/shared';
import { useRouter } from 'vue-router';

const {
  inputFocused, workspaceDir, hasWorkspaceDir, clearWorkspaceDir, showWorkspaceDir, showMount, store, showSkills, mountedSkillIds,
  skillStore, skillSearch, filteredSkillStore, toggleSkillMount,
  triggerFileUpload, input, inputRef, send, sending, agentStore, onAgentSwitch, openEditAgent, modelGroups,
  currentScene, clearScene,
  selectedModelId, onModelChange, openPlatformConfig, startNewChat, uploadedFiles, stopChat,
  queuedList, sendQueuedNow, editQueued, removeQueued,
  formatSize, removeFile, fileInputRef, handleFileChange, addFiles,
  workspaceFiles, selectedFilePaths, toggleFileSelect,
  quotedUrls, removeQuotedUrl, LONG_INPUT_THRESHOLD,
  // 上下文用量（2026-10-02）：这几项此前已由 useChat 算好却无人消费 → 这里接上 UI。
  // ★ contextLimit 是**有效可用窗口**（有效比例折算），declaredContextWindow 才是模型标称值 ——
  //   两者都展示，否则用户按标称算会误以为"还有很大空间"。
  // ★ Task 6 起由工具条左下的 ContextUsagePill 胶囊承载（原右侧用量环已删）。
  tokenCount, contextLimit, tokenPercent, declaredContextWindow, messageRounds,
} = useChat();

/** 当前会话已发生的自动压缩次数（消息流里的 compact_boundary 标记数），供胶囊明细展示 */
const compactCount = computed(() =>
  messageRounds.value.reduce((n, r) => n + (r.compactMarkers?.length || 0), 0),
);

const isCodeMode = useCodeStore().codeModeActive;
const inputTooLong = computed(() => input.value.length > LONG_INPUT_THRESHOLD);

/**
 * 智能体下拉展开时兜底加载（2026-10-09）：
 * 全新/覆盖安装后首启，后端冷启（建库+迁移+平台同步）可能超过启动时 loadAgents
 * 的重试预算（~10.5s）→ 列表永久为空。用户能展开下拉时后端必然已就绪，
 * 此时若列表仍为空就补拉一次（ensureAgents 幂等 + inflight 去重，不会重复请求）。
 */
function onAgentDropdownVisible(visible: boolean) {
  if (visible) agentStore.ensureAgents();
}

// ===== 7.3 运行指示的步骤进度：任务计划（task_plan/task_step）登记了步骤才显示「步骤 x/y」=====
const planTotal = computed(() => store.planSteps.length);
const planDoneCount = computed(() => store.planSteps.filter((s) => s.status === 'done').length);

// ===== 7.3 运行指示增强（2026-10-07）：进度条填充 + 总耗时走秒 + 结束状态回执 =====
// 数据源是 store.runStatsByConv（SSE 终态 / callLlm finally 落定），UI 只负责展示与走秒。
const runStat = computed(() => store.runStatsByConv?.[store.currentConvId]);
const planPercent = computed(() => (planTotal.value > 0 ? Math.round((planDoneCount.value / planTotal.value) * 100) : 0));

/** 秒数 → mm:ss（超 1 小时进位成 h:mm:ss） */
function formatDur(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const runElapsedSec = ref(0);
const runResult = ref<null | { status: 'completed' | 'aborted' | 'error'; seconds: number }>(null);
const runResultLabel = computed(() =>
  runResult.value?.status === 'completed' ? '任务已完成' : runResult.value?.status === 'error' ? '任务失败' : '已停止',
);
let runTimer: ReturnType<typeof setInterval> | null = null;
let runResultHideTimer: ReturnType<typeof setTimeout> | null = null;

function stopRunTimer() {
  if (runTimer) { clearInterval(runTimer); runTimer = null; }
}

watch(
  () => [store.streaming, store.currentConvId, runStat.value?.status, runStat.value?.startedAt] as const,
  () => {
    const rec = runStat.value;
    if (store.streaming && rec?.status === 'running') {
      // 运行中：清掉上一轮回执，按任务真实 startedAt 走秒（重连恢复的任务也能对上起点）
      runResult.value = null;
      if (runResultHideTimer) { clearTimeout(runResultHideTimer); runResultHideTimer = null; }
      stopRunTimer();
      const startedAt = rec.startedAt || Date.now();
      const tick = () => { runElapsedSec.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000)); };
      tick();
      runTimer = setInterval(tick, 1000);
    } else if (!store.streaming && rec && rec.status !== 'running' && rec.endedAt && Date.now() - rec.endedAt < 3000) {
      // 刚结束（3s 内捕捉到终态）：停表、展示回执，10s 后自动收走
      stopRunTimer();
      runElapsedSec.value = rec.endedAt && rec.startedAt ? Math.max(0, Math.floor((rec.endedAt - rec.startedAt) / 1000)) : runElapsedSec.value;
      runResult.value = { status: rec.status, seconds: runElapsedSec.value };
      runResultHideTimer = setTimeout(() => { runResult.value = null; runResultHideTimer = null; }, 10000);
    } else if (!store.streaming) {
      // 空闲且无新鲜终态（切会话/回执已收走）：只保证计时器停了
      stopRunTimer();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => { stopRunTimer(); if (runResultHideTimer) { clearTimeout(runResultHideTimer); runResultHideTimer = null; } });

/** 主任务步骤详情展开态：有计划的任务开跑 → 自动展开；任务结束 → 收起复位；点击行可手动切换 */
const runDetailOpen = ref(false);
watch(() => [store.streaming, planTotal.value] as const, ([streaming, total]) => {
  if (streaming && total > 0) runDetailOpen.value = true;
  if (!streaming) runDetailOpen.value = false;
});

// ===== 会话级工具权限（只读/标准/All 不确认）=====
// 选择持久化到 conversation.permission_mode；readonly 模式下后端会构建期裁剪写工具 + 运行时硬拦截。
// 原 'full'（全部放行）与 all 语义重复，2026-10-07 并入 all —— 存量 full 会话读出来即迁移为 all。
type PermissionMode = 'readonly' | 'default' | 'all';
const PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string; desc: string }> = [
  // ★ 默认档是 readonly（2026-09-27 用户拍板：「权限默认应该都是只读，现在默认所有都行很危险」）。
  { value: 'readonly', label: '只读（默认）', desc: '禁止写入/执行/委派与外部工具，仅检索浏览；需要写入时再放开' },
  { value: 'default', label: '标准权限', desc: '放行全部工具（含写文件/执行命令），适合可信任务' },
  // all 档：全放行 + 路径守卫关闭 —— 跨目录访问/脚本执行不再逐次弹授权窗。
  // 危险命令护栏（rm -rf / 格式化 / 强推…）是独立 P1 护栏，all 档下仍会单独确认。
  { value: 'all', label: 'All（不确认）', desc: '全放行且不再弹授权确认：访问工作目录之外的路径、执行脚本/命令都直接执行' },
];
const permissionLabel = computed(() =>
  PERMISSION_OPTIONS.find((p) => p.value === store.permissionMode)?.label || '只读（默认）',
);
function onPermissionChange(mode: PermissionMode) {
  void store.setPermissionMode(mode);
}

// ===== 截图（桌面端专属）：调主进程全屏框选截图，结果作为图片附件加入输入框 =====
// 仅 electronAPI.screenshot 存在（桌面 preload 注入）时显示按钮；web / 移动端自动隐藏。
const canScreenshot = typeof window !== 'undefined' && !!(window as any).electronAPI?.screenshot;
const snipping = ref(false);

// ===== 移动端输入框：默认 1 行，点击（聚焦）后展开 =====
// 用户拍板：「输入框一开始就很小点击后在变大」「默认 1 行，点击展开」。
//
// 判定用平台/视口并集（与 App.vue 的移动外壳口径一致）：
//   · Capacitor 端：platform==='mobile'，**不受视口宽度影响**（横屏视口 800px+ 也算）
//   · 桌面/Web 窄窗：用 matchMedia 767px 断点
// 这样桌面端行为逐字不变（platform 恒非 mobile，且宽视口不命中断点 → minRows 恒 3）。
const isMobileShell = ref(false);
try {
  const adapterPlatform = ((): string => {
    try { return (window as any).Capacitor?.isNativePlatform ? 'mobile' : ''; } catch { return ''; }
  })();
  const mq = window.matchMedia('(max-width: 767px)');
  const sync = () => { isMobileShell.value = adapterPlatform === 'mobile' || mq.matches; };
  sync();
  mq.addEventListener('change', sync);
} catch { /* 非浏览器环境（SSR/测试）→ 保持 false，桌面行为 */ }

/** 是否处于「已展开」态。聚焦即展开；失焦后**有内容则保持展开**（避免边打字边收）。 */
const mobileExpanded = ref(false);
// 注：inputFocused 由 useChat 提供（上方已解构），这里复用同一个 ref，不另建。

const inputAutosize = computed(() => {
  if (!isMobileShell.value) return { minRows: 3, maxRows: 12 };   // 桌面端：完全不变
  return mobileExpanded.value ? { minRows: 3, maxRows: 12 } : { minRows: 1, maxRows: 1 };
});

/**
 * 占位文案。
 * ★ 移动端收起态只有 1 行高，长的桌面提示（"输入消息，Enter 发送，Shift+Enter 换行；
 * 输入 / 打开命令，@ 引用文件"）会被裁掉半截（实测截图里后半句直接看不见）→
 * 移动端换短文案。桌面端保持原文案不变。
 */
const inputPlaceholder = computed(() => {
  if (isMobileShell.value) return isCodeMode ? '描述代码任务…' : '输入消息…';
  return isCodeMode
    ? '描述代码任务，Enter 发送，Shift+Enter 换行；输入 / 打开命令，@ 引用文件'
    : '输入消息，Enter 发送，Shift+Enter 换行；输入 / 打开命令，@ 引用文件';
});

/** 输入区根节点：失焦收起的判定要用它做「焦点是否还在输入区内」的范围检查
 *  （声明必须在 onInputBlur 之前 —— 虽然 setTimeout 异步执行不会 TDZ，但可读性上更稳）。 */
const inputAreaEl = ref<HTMLElement | null>(null);

/**
 * 移动端「收起」的唯一判定入口。
 * ★★★ 为什么不能直接在 blur 里收起（2026-09-27 用户报「点击按钮输入框也会收缩成一样」）：
 *   `+` / 模型 / 新建任务 / 发送 这些按钮都**在 `.input-area` 内部**。点它们必然先让
 *   textarea 失焦 → 若 blur 里直接 `mobileExpanded = false`，整条输入区（连按钮自己）
 *   瞬间被 `.is-mobile-collapsed` 压成一行：用户看到「点按钮输入框收缩成一样」，
 *   且按钮按下即消失、动作丢失（popover 因 Teleport 到 body 仍会弹，更显错乱）。
 *   ⇒ 判据必须是「**用户点到了输入区之外**」，而不是「textarea 失焦了」。
 *
 * ★★ 实现要点：**不能用「blur 之后再挂一个 pointerdown 监听」**——
 *   事件顺序是 `pointerdown → blur`（焦点转移是 pointerdown 的默认动作），
 *   在 blur 里才注册监听，那一次 pointerdown 早就过去了 → 永远等不到（退化成只靠定时器）。
 *   正解：**常驻**一个 document 捕获阶段的 pointerdown 监听，实时记住"这一点落在哪"
 *   （捕获阶段早于默认动作 → blur 触发时该标记已就绪），blur 里只读这个标记。
 */
/** 最近一次 pointerdown 是否落在输入区内部（工具条按钮 / textarea 自身都算）。 */
let lastPointerdownInArea = false;
function onDocPointerdownTrack(e: PointerEvent) {
  const t = e.target as Node | null;
  lastPointerdownInArea = !!(t && inputAreaEl.value?.contains(t));
}

function maybeCollapseMobileInput() {
  if (!isMobileShell.value) return;
  if (String(input.value || '').trim()) return; // 有内容 → 保持展开（继续接着写）
  mobileExpanded.value = false;
}

function onInputFocus(e: FocusEvent) {
  inputFocused.value = true;
  if (isMobileShell.value) mobileExpanded.value = true;
  // 原模板里 @focus 只置 inputFocused，这里保持等价行为（不拦截事件）
  void e;
}
function onInputBlur(e: FocusEvent) {
  inputFocused.value = false;
  if (!isMobileShell.value) return;
  // 下一拍判定：默认动作（焦点转移）此刻已完成，activeElement 是可靠读数
  window.setTimeout(() => {
    const inArea = lastPointerdownInArea
      // 兜底：非聚焦按钮（部分机型触屏点 <button> 不夺焦）→ 位置判定不成立时看焦点
      || !!(document.activeElement && inputAreaEl.value?.contains(document.activeElement));
    lastPointerdownInArea = false; // 消费掉，避免影响下一次程序化 blur
    if (inArea) return;
    maybeCollapseMobileInput();
  }, 0);
  void e;
}

// ===== 移动端：输入框长按菜单（复制 / 粘贴 / 发送 / 新建任务）=====
// ★★★ 为什么需要（2026-09-27 用户反馈「输入框里面长按没有复制粘贴发送新建任务」）：
//   输入框此前只绑了 `@paste`（拦截文件粘贴），**没有任何长按处理** →
//   触屏长按 textarea 走的是 WebView 系统菜单：Android WebView 上要么不弹，
//   要么弹出的「复制/粘贴」按钮与短文案叠加后大半被裁掉（textarea 收起态只有一行高）。
//   与其和系统菜单抢，不如给一个**稳定的自定义菜单**，且顺带把「发送 / 新建任务」
//   这两个高频动作也放进来（此前它们只在工具条上，收起态还看不见）。
const inputMenu = reactive({ visible: false, x: 0, y: 0 });
const hasInputText = computed(() => !!String(input.value || ''));
const canSubmit = computed(() =>
  (!!input.value.trim() || uploadedFiles.value.length > 0 || quotedUrls.value.length > 0) && !!selectedModelId.value,
);

function openInputMenu(x: number, y: number) {
  // 贴边收口：菜单宽约 132、高约 180（4 项 + 分隔线）
  const W = 138, H = 186;
  inputMenu.x = Math.max(8, Math.min(x, window.innerWidth - W - 8));
  inputMenu.y = Math.max(8, Math.min(y, window.innerHeight - H - 8));
  inputMenu.visible = true;
  // ★ 记录打开时刻：长按是"松手前弹出"，松手后浏览器仍会补派发一次 click，
  //   它会落在刚渲染出来的遮罩上 → 菜单"刚弹出就被自己关掉"。
  //   用时间窗吞掉这一次 click（同 ChatMessageList 的 actionsOpenedAt 手法）。
  inputMenuOpenedAt = Date.now();
}
let inputMenuOpenedAt = 0;
function closeInputMenu() { inputMenu.visible = false; }
/** 遮罩点击：长按后紧随的那一次 click 视为"同一手势"，不关闭 */
function onInputMenuLayerClick() {
  if (Date.now() - inputMenuOpenedAt < 400) return;
  closeInputMenu();
}

/** 长按输入框：弹出操作菜单（面板定位在手指位置，与右键菜单同形） */
function onInputLongPress(ev: { clientX: number; clientY: number }) {
  openInputMenu(ev.clientX, ev.clientY);
}
/** 触屏上若仍派发了 contextmenu，只拦系统菜单（已触发长按的不重复弹） */
function onInputContextMenu(e: MouseEvent) {
  if (!isMobileShell.value) return; // 桌面端保留浏览器原生右键菜单
  e.preventDefault();
}

/** 复制：优先用 textarea 自身选区（长按菜单点「复制」时用户多半已选中一段）；
 *  无选区时复制全文。用 execCommand 兜底 —— 部分 WebView 的 clipboard API 受权限限制。 */
async function ilmCopy() {
  if (!hasInputText.value) return;
  const el = inputRef.value?.textarea as HTMLTextAreaElement | undefined;
  const start = el?.selectionStart ?? 0;
  const end = el?.selectionEnd ?? 0;
  const text = start !== end ? input.value.slice(start, end) : input.value;
  closeInputMenu();
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    try {
      const tmp = document.createElement('textarea');
      tmp.value = text;
      tmp.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      ElMessage.success('已复制');
    } catch { ElMessage.error('复制失败'); }
  }
}

/** 粘贴：插到光标处。clipboard.readText 在 https（androidScheme=https）下可用；
 *  失败时给出可读提示，不静默什么都不做。 */
async function ilmPaste() {
  closeInputMenu();
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    ElMessage.warning('系统未授权读取剪贴板，请用键盘/输入法的粘贴');
    return;
  }
  if (!text) { ElMessage.info('剪贴板为空'); return; }
  const el = inputRef.value?.textarea as HTMLTextAreaElement | undefined;
  const start = el?.selectionStart ?? input.value.length;
  const end = el?.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  await nextTick();
  el?.focus();
  const caret = start + text.length;
  el?.setSelectionRange(caret, caret);
}

/** 发送：与工具条发送按钮同一条路径（send 内部自己判断入队还是直发） */
function ilmSend() {
  closeInputMenu();
  if (!canSubmit.value) return;
  send();
}

/** 新建任务：与工具条 FolderAdd 按钮同一个入口 */
function ilmNewTask() {
  closeInputMenu();
  startNewChat();
}

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

// hover 子菜单：记录触发行 offsetTop，子菜单绝对定位对齐该行
const hoverSub = ref<'modes' | 'skills' | 'perm' | null>(null);
const subTop = ref(0);
const subLeft = ref(0);
let subCloseTimer: ReturnType<typeof setTimeout> | undefined;
function openSub(kind: 'modes' | 'skills' | 'perm', evt: MouseEvent) {
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
/** 桌面端模型胶囊的弹层开关。 */
const modelPopOpen = ref(false);
/** ★ 窄屏模型钮的弹层开关 —— **必须与 modelPopOpen 分开**：
 *  两者是两个独立 el-popover，popover 内容 Teleport 到 body 不受父容器 display:none 影响，
 *  共用同一个 visible 会导致"点一次弹两个窗"（用户 2026-09-22 报）。
 *  已配色 `v-if` 互斥（移动端壳隐藏桌面胶囊、反之亦然），双保险。 */
const mobileModelPopOpen = ref(false);

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
 * 上下文窗口浮层是 Teleport 到 body 的独立层，一并收掉。
 */
function pickModel(modelId: string) {
  onModelChange(modelId);
  modelPopOpen.value = false;
  // ★ 移动端那个 popover 也必须关：它是独立开关（见 mobileModelPopOpen 注释），
  //   只关桌面那个 → 触屏上点完模型下拉一直挂在那挡住输入框（与原缺陷同类）。
  mobileModelPopOpen.value = false;
  closeCtxPanelNow();
}

// ===== 打开模型下拉时定位到「当前选中的模型」=====
// ★★ 用户诉求（2026-09-27）：「模型选择下拉点击不会跳转到选中的那个模型的位置」。
//   此前打开下拉一律从列表顶部开始 —— 平台多、模型几百个时，当前选中项常在视口外，
//   用户得自己滚着找。这里在打开后把 active 项滚进视野并居中。
//
// ★★ 两个必须写对的地方（漏任一个都表现为"没反应"）：
//   ① 必须等 popover 真正挂载并布局完：`v-model:visible` 置真时内容还没渲染，
//      立刻查 DOM 必然 null → 必须 `await nextTick()`（滚动容器在 el-popover 的默认插槽里，
//      随 popover 一起渲染，nextTick 之后即可查到）。
//   ② 必须滚**内层滚动容器**（`.pop-model-scroll`）本身：平台分组标题是 `position: sticky`，
//      它是滚动容器的子节点，锚在容器内 —— 所以「scrollIntoView 作用在容器上、选择器取容器内项」
//      两条约束能同时满足。若直接对 active 项调 scrollIntoView，会连带滚动它所有的可滚动祖先
//      （含消息区），把用户正在看的对话也滚走。
//
// ★ 命中不到时不报错（选中项可能被折叠在某个平台分组里）—— 表现为"停在顶部"，
//   这是可接受的降级，不要因此去强行展开分组（会打乱用户的折叠意图）。
const modelScrollEl = ref<HTMLElement | null>(null);
const mobileModelScrollEl = ref<HTMLElement | null>(null);

function scrollActiveModelIntoView(mobile = false) {
  const box = mobile ? mobileModelScrollEl.value : modelScrollEl.value;
  if (!box) return;
  const active = box.querySelector<HTMLElement>('.pop-select-model.active');
  if (!active) return;
  // 直接算 scrollTop，不调用 scrollIntoView：
  //   · 只影响这一个容器，不会连带滚动页面/消息区；
  //   · 居中而非贴边，上下都能看到相邻项，用户能立刻判断"上下文在哪"。
  const target = active.offsetTop - (box.clientHeight - active.offsetHeight) / 2;
  box.scrollTop = Math.max(0, target);
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
// ★ 两个开关都要收尾（移动端与桌面端各自的弹层），漏一个会留下"幽灵弹层"没被清理
watch([modelPopOpen, mobileModelPopOpen], ([desktopOpen, mobileOpen]) => {
  if (!desktopOpen && !mobileOpen) { closeCtxPanelNow(); modelSearch.value = ''; return; }
  // 打开 → 定位到当前选中的模型。
  // ★ 必须 nextTick + 两帧 rAF：popover 内容是 Teleport 到 body 的、打开瞬间才挂载，
  //   nextTick 后 DOM 在，但布局（含 sticky 分组标题占位）要等一帧才稳定 ——
  //   直接在 nextTick 里读 offsetTop 会拿到尚未布局的值（表现为滚到错的位置或不动）。
  void nextTick().then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (desktopOpen) scrollActiveModelIntoView(false);
    if (mobileOpen) scrollActiveModelIntoView(true);
  })));
});

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

/** 工作区目录集合（从文件索引的路径推导：目录不进索引，但父目录可以枚举出来） */
const workspaceFolders = computed(() => {
  const map = new Map<string, { name: string; path: string }>();
  for (const f of workspaceFiles.value) {
    const parts = (f.path || '').split(/[\\/]/);
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!dir || map.has(dir)) continue;
      map.set(dir, { name: parts[i - 1], path: dir });
    }
  }
  return [...map.values()];
});

/** @ 浮层候选：目录在前（@folder 引用），文件在后，符号殿后（@symbol 引用，P2-1） */
const atFileList = computed(() => {
  const q = atQuery.value.toLowerCase();
  const folders = workspaceFolders.value
    .filter((d) => !q || d.name.toLowerCase().includes(q) || d.path.toLowerCase().includes(q))
    .slice(0, 6)
    .map((d) => ({ name: `${d.name}/`, path: d.path, size: 0, isDir: true, isFolder: true }));
  const files = (q ? workspaceFiles.value.filter((f) => f.name.toLowerCase().includes(q)) : workspaceFiles.value)
    .slice(0, q ? 14 : 20)
    .map((f) => ({ ...f, isFolder: false }));
  const symbols = atSymbols.value
    .filter((d) => !q || d.name.toLowerCase().includes(q))
    .slice(0, 6)
    .map((d) => ({ name: d.name, path: d.path, size: 0, isDir: false, isFolder: false, isSymbol: true as const, line: d.line, kind: d.kind, signature: d.signature }));
  return [...folders, ...files, ...symbols].slice(0, 22);
});

// ===== @ 符号候选（P2-1）：对匹配到的代码文件懒取符号表，双缓存（前端 Map + 服务端 mtime）=====
interface AtSymbol { name: string; line: number; kind: string; signature: string; path: string }
const atSymbols = ref<AtSymbol[]>([]);
const symbolCacheByPath = new Map<string, Array<{ name: string; line: number; kind: string; signature: string }>>();
const SYMBOL_CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue']);
let symbolFetchSeq = 0;

watch([atMenuOpen, atQuery], async ([open, q]) => {
  if (!open) return;
  const query = q.trim().toLowerCase();
  if (query.length < 2) { atSymbols.value = []; return; }
  // 匹配到的代码文件里取前 3 个，拉符号表（缓存命中零请求）
  const codeFiles = workspaceFiles.value
    .filter((f) => !f.isDir && SYMBOL_CODE_EXTS.has((f.name.split('.').pop() || '').toLowerCase()))
    .filter((f) => f.name.toLowerCase().includes(query) || query.length >= 3)
    .slice(0, 3);
  const seq = ++symbolFetchSeq;
  const results: AtSymbol[] = [];
  await Promise.all(codeFiles.map(async (f) => {
    let decls = symbolCacheByPath.get(f.path);
    if (!decls) {
      try {
        const r = await api.get<{ decls: Array<{ name: string; line: number; kind: string; signature: string }> }>(
          `/workspace/symbols?path=${encodeURIComponent(f.path)}`,
        );
        if (!('error' in r)) {
          decls = r.data.decls || [];
          symbolCacheByPath.set(f.path, decls);
        }
      } catch { return; }
    }
    for (const d of decls || []) {
      if (d.name.toLowerCase().includes(query)) results.push({ ...d, path: f.path } as AtSymbol);
    }
  }));
  if (seq === symbolFetchSeq) atSymbols.value = results;
});

/** 选中符号：以内联 token 注入输入框（模型可读「name · 路径:行号」直达位置） */
function pickAtSymbol(d: AtSymbol) {
  const rel = d.path.replace(/^[A-Za-z]:[\\/]/, '');
  input.value = input.value.replace(/@([^\s@]*)$/, '').trimEnd() + ` [符号 ${d.name} · ${rel}:${d.line}] `;
  atMenuOpen.value = false;
}

const selectedWorkFiles = computed(() => {
  const folderPaths = new Set(workspaceFolders.value.map((d) => d.path));
  return [...selectedFilePaths.value]
    .map((p) => {
      const f = workspaceFiles.value.find((w) => w.path === p);
      if (f) return { name: f.name, path: f.path, size: f.size, isDir: false, isFolder: false };
      // 目录引用：不在文件索引里，按路径归属识别
      if (folderPaths.has(p)) return { name: `${(p.split(/[\\/]/).pop() || p)}/`, path: p, size: 0, isDir: true, isFolder: true };
      return null;
    })
    .filter((f): f is { name: string; path: string; size: number; isDir: boolean; isFolder: boolean } => !!f);
});

/** 引用图标：目录 FolderOpened / 符号按 kind 着色 / 文件按扩展名 */
function refIconMeta(f: { name: string; isFolder?: boolean; isSymbol?: boolean; kind?: string }) {
  if (f.isFolder) return { icon: FolderOpened as Component, color: '#0ea5e9' };
  if (f.isSymbol) {
    const color = f.kind === 'function' ? '#22a06b' : (f.kind === 'class' || f.kind === 'interface') ? '#8b5cf6' : '#f59e0b';
    return { icon: Operation as Component, color };
  }
  return fileTypeMeta(f.name);
}

function pickAtFile(f: { name: string; path: string; isSymbol?: boolean; line?: number; kind?: string; signature?: string }) {
  // 符号候选（P2-1）：内联注入，不进文件 chip
  if (f.isSymbol) {
    pickAtSymbol(f as AtSymbol);
    return;
  }
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
  // ★ 常驻记录「最近一次 pointerdown 落在哪」——供失焦收起判定使用。
  //   必须常驻 + 捕获阶段：事件顺序是 pointerdown → blur，在 blur 里才注册监听会永远错过。
  document.addEventListener('pointerdown', onDocPointerdownTrack, true);
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
  document.removeEventListener('pointerdown', onDocPointerdownTrack, true);
  closeInputMenu();
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

/* ===== 7.3 任务运行中：输入区上方常驻运行指示行（含唯一停止入口）===== */
.run-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 8px 0 0;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  flex: 0 0 auto;
}
/* 有计划时整行可点（展开/收缩步骤详情） */
.run-indicator.expandable { cursor: pointer; user-select: none; }
.run-caret {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--color-text-secondary);
  transition: transform 0.15s ease;
}
.run-caret.open { transform: rotate(90deg); }
/* 主任务步骤详情列表 */
.run-steps {
  margin: 4px 0 0;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  max-height: 180px;
  overflow-y: auto;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.run-step { display: flex; align-items: flex-start; gap: 8px; padding: 3px 0; }
.run-step-idx {
  flex: 0 0 auto;
  min-width: 16px;
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 18px;
  text-align: right;
}
.run-step-mark { flex: 0 0 auto; font-size: 13px; line-height: 18px; width: 14px; text-align: center; }
.run-step-mark.done { color: var(--el-color-success); }
.run-step-mark.running { color: var(--color-primary); }
.run-step-mark.failed { color: var(--el-color-danger); }
.run-step-mark.pending {
  width: 8px; height: 8px; margin: 5px 3px 0;
  border-radius: 50%;
  border: 1.5px solid var(--color-text-secondary);
  opacity: 0.5;
}
.run-step-body { flex: 1 1 auto; min-width: 0; }
.run-step-title { font-size: var(--font-size-sm); color: var(--color-text-primary); line-height: 18px; }
.run-step.running .run-step-title { color: var(--color-primary); font-weight: 600; }
.run-step.done .run-step-title { color: var(--color-text-secondary); }
.run-step-note {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-spinner { color: var(--color-primary); font-size: 14px; flex: 0 0 auto; }
.run-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  border: none;
  border-radius: 999px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
  flex: 0 0 auto;
  transition: filter 0.15s ease;
}
.run-stop-btn:hover { filter: brightness(0.92); }
.run-stop-square { width: 7px; height: 7px; border-radius: 1px; background: currentColor; }
.run-elapsed { font-variant-numeric: tabular-nums; color: var(--color-text); }

/* 运行进度条：紧贴运行指示行下方，3px 细条（对齐设计稿「气泡 hover 操作 + 状态」卡）。
   有任务计划 → 按 步骤x/y 填充；无计划 → indeterminate 流动条（在跑但无步骤可量）。 */
.run-progress {
  position: relative;
  height: 3px;
  margin: 6px 0 0;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}
.run-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--color-primary);
  transition: width 0.45s ease;
}
.run-progress.indeterminate .run-progress-fill {
  width: 36%;
  animation: run-indet 1.4s ease-in-out infinite;
}
@keyframes run-indet {
  0% { margin-left: -36%; }
  100% { margin-left: 100%; }
}

/* 结束状态回执：任务收尾后停留 10s 的结果行（完成=主色 / 停止=次级灰 / 失败=红） */
.run-result {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 8px 0 0;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--glass-bg, rgba(0, 0, 0, 0.03));
}
.run-result.completed { color: var(--color-primary); }
.run-result.error { color: var(--color-danger, #e5484d); }
.run-result-icon { font-size: 13px; flex: 0 0 auto; display: inline-flex; }
.run-result-square { width: 8px; height: 8px; border-radius: 2px; background: currentColor; }

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

/* ===== 移动端输入框长按菜单（Teleport 到 body，必须写在非 scoped 块）=====
   与 MediaContextMenu 保持同一视觉语言：定宽、圆角、细边框、投影、条目 6px 圆角。
   ★ 触控友好：条目高度 40px（>= 44 的推荐值略低但配合内边距实测够用，
     再高会把 4 项菜单推到 200px+，在收起态的小键盘上方容易顶出视口）。 */
.ilm-layer {
  position: fixed;
  inset: 0;
  z-index: 4100; /* 与 media-ctx-layer 同层：都高于 EP 弹层（2000-3000） */
}
.ilm-menu {
  position: fixed;
  min-width: 138px;
  margin: 0;
  padding: 4px;
  list-style: none;
  border-radius: 10px;
  border: 1px solid var(--glass-border, rgba(0, 0, 0, 0.08));
  background: var(--color-bg-elevated, #fff);
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.18);
}
.ilm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13.5px;
  color: var(--color-text, #1f2328);
  cursor: pointer;
  user-select: none;
}
.ilm-item:active { background: var(--glass-bg-hover, rgba(0, 0, 0, 0.05)); }
.ilm-item .el-icon { color: var(--color-text-secondary, #8a8f98); flex-shrink: 0; }
/* 不可用项：置灰且不响应（如空输入框的「复制」/「发送」）——但不能隐藏，
   否则菜单高度随内容跳变，长按位置会错位。 */
.ilm-item.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}
.ilm-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--color-border, rgba(0, 0, 0, 0.08));
}
</style>
