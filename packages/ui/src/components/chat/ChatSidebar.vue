<template>
  <aside class="sidebar">
    <div class="sidebar-tabs">
      <div class="sb-tab" :class="{ active: sideTab === 'chat' }" @click="sideTab = 'chat'">
        <el-icon><ChatDotRound /></el-icon> 任务
      </div>
      <div class="sb-tab" :class="{ active: sideTab === 'task' }" @click="sideTab = 'task'">
        <el-icon><Timer /></el-icon> 定时任务
      </div>
      <div class="sb-tab" :class="{ active: sideTab === 'file' }" @click="sideTab = 'file'">
        <el-icon><FolderOpened /></el-icon> 文件
      </div>
      <div class="sb-tab" :class="{ active: sideTab === 'publish' }" @click="sideTab = 'publish'">
        <el-icon><Promotion /></el-icon> 发布
      </div>
    </div>

    <div v-if="sideTab === 'chat'" class="conv-list">
      <div class="conv-header">
        <!-- 搜索框 + 新建任务图标同一行：空态由大 CTA 承担新建，这里图标仅服务有任务时的快速新建
             （2026-10-04：原独立一行描边按钮与空态大按钮重复，用户红框要求收敛） -->
        <div class="conv-search-row">
          <el-input v-model="search" placeholder="搜索任务" size="small" clearable :prefix-icon="Search" />
          <!-- 浏览器页面对话默认收起（它们由浏览器面板的「历史」管理），这里是查看/收起的开关。
               带数字角标是为了**别让"收起来了"变成"消失了"** —— 有 N 条时按钮上直接写 N。 -->
          <button
            v-if="!batchMode"
            class="conv-new-icon page-conv-toggle"
            :class="{ 'is-on': store.showPageConvs }"
            type="button"
            :title="store.showPageConvs
              ? '收起浏览器页面对话（仍可在浏览器面板的「历史」里打开 / 删除）'
              : `显示浏览器页面对话${pageConvCount ? `（已收起 ${pageConvCount} 条）` : ''}`"
            @click="togglePageConvs"
          >
            <el-icon :size="14"><Monitor /></el-icon>
            <span v-if="!store.showPageConvs && pageConvCount" class="page-conv-badge">{{ pageConvCount > 99 ? '99+' : pageConvCount }}</span>
          </button>
          <button v-if="!batchMode" class="conv-new-icon" type="button" title="新建任务" @click="startNewChat()">
            <el-icon :size="14"><Plus /></el-icon>
          </button>
        </div>
        <div v-if="batchMode" class="conv-header-row">
          <el-button size="small" type="warning" style="flex:1" @click="exitBatchMode">退出批量</el-button>
        </div>
      </div>

      <div class="conv-tree" @contextmenu.prevent="openTreeMenu($event)" v-on="bindLongPress((ev) => openTreeMenu(ev))">
        <!-- ── 置顶分组（2026-10-09）──────────────────────────────
             ★★★ 为什么提到**根节点之外**（2026-10-09 用户实测「置顶点了没用」的根因）：
               v1 把这个分组塞进「任务」根节点的 .tree-children 里。而「任务」根节点可折叠
               （rootCollapsed 持久化在 localStorage:yz_conv_root_collapsed）。用户把「任务」
               收起来之后，置顶组跟着父容器一起 display:none →
               **数据确实写进了库，但界面上没有任何可见变化**（点完"加了置顶"却什么也没发生）。
               实测：展开「任务」时置顶组正常渲染（3 条置顶都在），折叠时它 0x0 被隐藏，
               而空间内的行点击置顶仍能正常显示星标 —— 唯独根级行"毫无反馈"，这就是根因。
             ★ 所以置顶组必须是**与「任务」/空间平级的顶层节点**，不受任何分组的折叠态影响。
               「置顶」本身仍可独立折叠（pinnedCollapsed），语义上等同于一个全局分组。
             ★ 只收**根级**置顶：空间内的置顶已在该空间分组内排序靠前（行首星标 + 金色底可见），
               再抽出来会让同一个会话出现在两处 —— 分组的意义是分区，不是重复展示。
             ★ 无置顶项时**整组不渲染**（不占位、不打扰）—— 契合"极简、不加多余元素"的一贯要求。 -->
        <div v-if="pinnedRootConversations.length > 0" class="tree-node tree-pinned">
          <div class="tree-node-head" @click="togglePinnedCollapse">
            <el-icon class="tree-caret" :class="{ expanded: !pinnedCollapsed }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><Star /></el-icon>
            <span class="tree-node-label">置顶</span>
            <span class="tree-count">{{ pinnedRootConversations.length }}</span>
          </div>
          <div v-show="!pinnedCollapsed" class="tree-children">
            <div
              v-for="conv in pinnedRootConversations"
              :key="conv.id"
              class="conv-item pinned"
              :class="{ active: conv.id === store.currentConvId, selecting: batchMode }"
              @click="batchMode ? toggleConvSelect(conv.id) : rows.activate(conv)"
              @contextmenu.prevent="openConvMenu($event, conv)"
              v-on="bindLongPress((ev) => openConvMenu(ev, conv))"
              @dblclick="!batchMode && rows.startRename(conv)"
            >
              <el-checkbox v-if="batchMode" :model-value="selectedConvIds.has(conv.id)" @click.stop @change="toggleConvSelect(conv.id)" />
              <el-icon class="pin-icon"><StarFilled /></el-icon>
              <span v-if="renamingId !== conv.id" class="conv-title" :title="conv.title">{{ conv.title }}</span>
              <el-input
                v-else
                v-model="renamingTitle"
                size="small"
                @click.stop
                @blur="rows.commitRename"
                @keydown.enter.prevent="rows.commitRename"
                @keydown.esc.prevent="rows.cancelRename"
                ref="renameInputRef"
              />
              <span v-if="store.isConvStreaming(conv.id)" class="conv-run-badge" title="运行中"></span>
              <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                <el-icon class="scheduled-badge"><Timer /></el-icon>
              </el-tooltip>
              <!-- 来源标记（2026-10-16）：来自浏览器页面对话的会话在这里一眼认出来。
                   这里只标、不改行为 —— 打开/删除在浏览器面板的「历史」入口里做。 -->
              <el-tooltip v-if="conv.source === BROWSER_PAGE_SOURCE" content="来自浏览器页面对话（在浏览器面板「历史」里打开 / 删除）" placement="top">
                <span class="conv-src-badge">页面</span>
              </el-tooltip>
            </div>
          </div>
        </div>

        <!-- 对话根节点：未归类会话 -->
        <div class="tree-node tree-root">
          <div class="tree-node-head" @click="toggleRootCollapse">
            <el-icon class="tree-caret" :class="{ expanded: !rootCollapsed }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><ChatDotRound /></el-icon>
            <span class="tree-node-label">任务</span>
            <el-checkbox
              v-if="batchMode"
              class="tree-select-all"
              :model-value="rootSelectState().checked"
              :indeterminate="rootSelectState().indeterminate"
              @click.stop
              @change="toggleSelectAllInRoot"
            />
            <span class="tree-count">{{ rootConversations.length }}</span>
            <el-icon class="tree-add-icon" @click.stop="startNewChat(null)"><Plus /></el-icon>
          </div>
          <div v-show="!rootCollapsed" class="tree-children">
            <div
              v-for="conv in unpinnedRootConversations"
              :key="conv.id"
              class="conv-item"
              :class="{ active: conv.id === store.currentConvId, pinned: conv.pinned, selecting: batchMode }"
              @click="batchMode ? toggleConvSelect(conv.id) : rows.activate(conv)"
              @contextmenu.prevent="openConvMenu($event, conv)"
              v-on="bindLongPress((ev) => openConvMenu(ev, conv))"
              @dblclick="!batchMode && rows.startRename(conv)"
            >
              <el-checkbox v-if="batchMode" :model-value="selectedConvIds.has(conv.id)" @click.stop @change="toggleConvSelect(conv.id)" />
              <el-icon class="pin-icon" v-if="conv.pinned"><StarFilled /></el-icon>
              <el-icon v-else-if="!batchMode"><ChatDotRound /></el-icon>
              <span v-if="renamingId !== conv.id" class="conv-title" :title="conv.title">{{ conv.title }}</span>
              <el-input
                v-else
                v-model="renamingTitle"
                size="small"
                @click.stop
                @blur="rows.commitRename"
                @keydown.enter.prevent="rows.commitRename"
                @keydown.esc.prevent="rows.cancelRename"
                ref="renameInputRef"
              />
              <!-- 7.4 运行状态徽标：该任务正在跑时行内呼吸圆点 -->
              <span v-if="store.isConvStreaming(conv.id)" class="conv-run-badge" title="运行中"></span>
              <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                <el-icon class="scheduled-badge"><Timer /></el-icon>
              </el-tooltip>
              <!-- 来源标记（2026-10-16）：来自浏览器页面对话的会话在这里一眼认出来。
                   这里只标、不改行为 —— 打开/删除在浏览器面板的「历史」入口里做。 -->
              <el-tooltip v-if="conv.source === BROWSER_PAGE_SOURCE" content="来自浏览器页面对话（在浏览器面板「历史」里打开 / 删除）" placement="top">
                <span class="conv-src-badge">页面</span>
              </el-tooltip>
            </div>
            <!-- 空态（Task 3.2）：统一 EmptyState 组件；搜索无结果时不给 CTA -->
            <EmptyState
              v-if="!rootCollapsed && rootConversations.length === 0"
              icon="📝"
              :title="search ? '无匹配' : '暂无任务'"
              :action-text="!search && !batchMode ? '新建任务' : undefined"
              @action="startNewChat(null)"
            />
          </div>
        </div>

        <!-- 各空间节点（顶层；父任务目录下再渲染「子目录」层级，2026-10-17） -->
        <div v-for="sp in spaceStore.rootSpaces" :key="sp.id" class="tree-node tree-space">
          <div
            class="tree-node-head"
            :class="{ 'tree-node-active': spaceStore.currentSpaceId === sp.id }"
            @click="onSpaceHeadClick(sp.id)"
            @dblclick="onSpaceHeadDblClick(sp.id)"
            @contextmenu.prevent="openSpaceMenu($event, sp)"
            v-on="bindLongPress((ev) => openSpaceMenu(ev, sp))"
          >
            <el-icon class="tree-caret" :class="{ expanded: !spaceCollapsed[sp.id] }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><FolderOpened /></el-icon>
            <span class="tree-node-label" :title="sp.dirPath || sp.name">{{ sp.name }}</span>
            <!-- 任务模式徽标：点它直接打开编辑弹窗改模式（改模式是高频动作，只藏在右键菜单里不好找）。
                 @click.stop 防止冒泡到行上（行点击是"选中空间"，语义不同）。 -->
            <span
              v-if="sp.taskType"
              class="tree-task-badge tree-task-badge-click"
              :title="`任务模式：${taskTypeLabel(sp.taskType)}（点击更改）`"
              @click.stop="openSpaceEdit(sp)"
            >{{ taskTypeLabel(sp.taskType) }}</span>
            <el-checkbox
              v-if="batchMode"
              class="tree-select-all"
              :model-value="spaceSelectState(sp.id).checked"
              :indeterminate="spaceSelectState(sp.id).indeterminate"
              @click.stop
              @change="toggleSelectAllInSpace(sp.id)"
            />
            <span class="tree-count">{{ conversationsBySpace[sp.id]?.length || 0 }}</span>
            <el-icon class="tree-add-icon" @click.stop="startNewChat(sp.id)"><Plus /></el-icon>
          </div>
          <div v-show="!spaceCollapsed[sp.id]" class="tree-children">
            <!-- ── 子目录（子空间，2026-10-17）──────────────────────────────
                 父任务目录下的磁盘子文件夹 = 子空间（parentId 指回父空间）。
                 点行 = 选中 + 工作目录同步到子目录；+ = 在子目录下新建任务
                 （子目录已选子线就直接用，没选则弹选线框）。 -->
            <div v-for="child in spaceStore.childSpacesOf(sp.id)" :key="child.id" class="tree-node tree-space tree-subspace">
              <div
                class="tree-node-head"
                :class="{ 'tree-node-active': spaceStore.currentSpaceId === child.id }"
                @click="onSpaceHeadClick(child.id)"
                @dblclick="onSpaceHeadDblClick(child.id)"
                @contextmenu.prevent="openSpaceMenu($event, child)"
                v-on="bindLongPress((ev) => openSpaceMenu(ev, child))"
              >
                <el-icon class="tree-caret" :class="{ expanded: !spaceCollapsed[child.id] }"><CaretRight /></el-icon>
                <el-icon class="tree-node-icon"><FolderOpened /></el-icon>
                <span class="tree-node-label" :title="child.dirPath || child.name">{{ child.name }}</span>
                <span
                  v-if="child.taskType"
                  class="tree-task-badge tree-task-badge-click"
                  :title="`任务模式：${taskTypeLabel(child.taskType)}（点击更改）`"
                  @click.stop="openSpaceEdit(child)"
                >{{ taskTypeLabel(child.taskType) }}</span>
                <span class="tree-count">{{ conversationsBySpace[child.id]?.length || 0 }}</span>
                <el-icon class="tree-add-icon" @click.stop="startNewChat(child.id)"><Plus /></el-icon>
              </div>
              <div v-show="!spaceCollapsed[child.id]" class="tree-children">
                <div
                  v-for="conv in conversationsBySpace[child.id] || []"
                  :key="conv.id"
                  class="conv-item"
                  :class="{ active: conv.id === store.currentConvId, pinned: conv.pinned, selecting: batchMode }"
                  @click="batchMode ? toggleConvSelect(conv.id) : rows.activate(conv)"
                  @contextmenu.prevent="openConvMenu($event, conv)"
                  v-on="bindLongPress((ev) => openConvMenu(ev, conv))"
                  @dblclick="!batchMode && rows.startRename(conv)"
                >
                  <el-checkbox v-if="batchMode" :model-value="selectedConvIds.has(conv.id)" @click.stop @change="toggleConvSelect(conv.id)" />
                  <el-icon class="pin-icon" v-if="conv.pinned"><StarFilled /></el-icon>
                  <el-icon v-else-if="!batchMode"><ChatDotRound /></el-icon>
                  <span v-if="renamingId !== conv.id" class="conv-title" :title="conv.title">{{ conv.title }}</span>
                  <el-input
                    v-else
                    v-model="renamingTitle"
                    size="small"
                    @click.stop
                    @blur="rows.commitRename"
                    @keydown.enter.prevent="rows.commitRename"
                    @keydown.esc.prevent="rows.cancelRename"
                    ref="renameInputRef"
                  />
                  <span v-if="store.isConvStreaming(conv.id)" class="conv-run-badge" title="运行中"></span>
                  <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                    <el-icon class="scheduled-badge"><Timer /></el-icon>
                  </el-tooltip>
                </div>
              </div>
            </div>
            <div
              v-for="conv in conversationsBySpace[sp.id] || []"
              :key="conv.id"
              class="conv-item"
              :class="{ active: conv.id === store.currentConvId, pinned: conv.pinned, selecting: batchMode }"
              @click="batchMode ? toggleConvSelect(conv.id) : rows.activate(conv)"
              @contextmenu.prevent="openConvMenu($event, conv)"
              v-on="bindLongPress((ev) => openConvMenu(ev, conv))"
              @dblclick="!batchMode && rows.startRename(conv)"
            >
              <el-checkbox v-if="batchMode" :model-value="selectedConvIds.has(conv.id)" @click.stop @change="toggleConvSelect(conv.id)" />
              <el-icon class="pin-icon" v-if="conv.pinned"><StarFilled /></el-icon>
              <el-icon v-else-if="!batchMode"><ChatDotRound /></el-icon>
              <span v-if="renamingId !== conv.id" class="conv-title" :title="conv.title">{{ conv.title }}</span>
              <el-input
                v-else
                v-model="renamingTitle"
                size="small"
                @click.stop
                @blur="rows.commitRename"
                @keydown.enter.prevent="rows.commitRename"
                @keydown.esc.prevent="rows.cancelRename"
                ref="renameInputRef"
              />
              <!-- 7.4 运行状态徽标：与根列表同款 -->
              <span v-if="store.isConvStreaming(conv.id)" class="conv-run-badge" title="运行中"></span>
              <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                <el-icon class="scheduled-badge"><Timer /></el-icon>
              </el-tooltip>
              <!-- 来源标记（2026-10-16）：来自浏览器页面对话的会话在这里一眼认出来。
                   这里只标、不改行为 —— 打开/删除在浏览器面板的「历史」入口里做。 -->
              <el-tooltip v-if="conv.source === BROWSER_PAGE_SOURCE" content="来自浏览器页面对话（在浏览器面板「历史」里打开 / 删除）" placement="top">
                <span class="conv-src-badge">页面</span>
              </el-tooltip>
            </div>
            <EmptyState
              v-if="!spaceCollapsed[sp.id] && spaceStore.childSpacesOf(sp.id).length === 0 && (!conversationsBySpace[sp.id] || conversationsBySpace[sp.id].length === 0)"
              icon="📝"
              :title="search ? '无匹配' : '暂无任务'"
              :action-text="!search && !batchMode ? '新建任务' : undefined"
              @action="startNewChat(sp.id)"
            />
          </div>
        </div>

        <!-- ── 已归档分组（2026-10-16）──────────────────────────────────────────
             ★ 形态照「置顶」：**顶层节点**（不受「任务」/空间折叠影响）、自身可折叠、
               空则整组不渲染（不占位、不打扰）。
             ★ 数据源是 useChat.archivedConversations（独立数组），**刻意不并入**
               store.conversations —— 一旦并入，主列表、批量选择、导出这些
               「扫全量」的逻辑立刻会看到归档会话（那正是归档要消除的打扰）。
             ★ 行点击照常打开（只读语义由 Chat 输入区负责禁用 + 提示）。 -->
        <div v-if="archivedConversations.length > 0" class="tree-node tree-archived">
          <div class="tree-node-head" @click="toggleArchivedCollapse">
            <el-icon class="tree-caret" :class="{ expanded: !archivedCollapsed }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><FolderChecked /></el-icon>
            <span class="tree-node-label">已归档</span>
            <span class="tree-count">{{ archivedConversations.length }}</span>
          </div>
          <div v-show="!archivedCollapsed" class="tree-children">
            <!-- ★ 搜索覆盖归档（对齐 ChatGPT：全局搜索能搜到归档会话）：搜索词同时过滤本分组，
                 主列表与归档区同词联动 —— 归档不等于"再也找不到"。 -->
            <div
              v-for="conv in archivedFiltered"
              :key="conv.id"
              class="conv-item"
              :class="{ active: conv.id === store.currentConvId, selecting: batchMode }"
              @click="batchMode ? toggleConvSelect(conv.id) : rows.activate(conv)"
              @contextmenu.prevent="openConvMenu($event, conv)"
            >
              <el-icon class="pin-icon"><FolderChecked /></el-icon>
              <span class="conv-title" :title="conv.title">{{ conv.title }}</span>
              <span v-if="!batchMode" class="task-row-actions" @click.stop>
                <span class="task-row-act" role="button" title="恢复到主列表（可继续对话）" @click="archiveConv(conv, false)"><el-icon :size="12"><RefreshLeft /></el-icon></span>
                <span class="task-row-act is-danger" role="button" title="删除（移入回收站）" @click="rows.remove(conv)"><el-icon :size="12"><Delete /></el-icon></span>
              </span>
            </div>
          </div>
        </div>

        <!-- ── 回收站入口（2026-10-16）──────────────────────────────────────────
             删除会话现在是软删进这里（可恢复）；「永久删除」只在这个列表内出现，
             且必须二次确认 —— 破坏性操作离日常列表越远越好。 -->
        <div class="tree-node tree-trash">
          <div class="tree-node-head" @click="toggleTrash">
            <el-icon class="tree-caret" :class="{ expanded: trashOpen }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><Delete /></el-icon>
            <span class="tree-node-label">回收站</span>
            <span class="tree-count">{{ trashedConversations.length }}</span>
          </div>
          <div v-show="trashOpen" class="tree-children">
            <div
              v-for="conv in trashedConversations"
              :key="conv.id"
              class="conv-item"
              :class="{ active: conv.id === store.currentConvId }"
              @click="rows.activate(conv)"
            >
              <el-icon class="pin-icon"><Delete /></el-icon>
              <span class="conv-title" :title="conv.title">{{ conv.title }}</span>
              <span class="task-row-actions" @click.stop>
                <span class="task-row-act" role="button" title="恢复" @click="restoreConv(conv)"><el-icon :size="12"><RefreshLeft /></el-icon></span>
                <span class="task-row-act is-danger" role="button" title="永久删除（不可恢复）" @click="purgeConv(conv)"><el-icon :size="12"><Delete /></el-icon></span>
              </span>
            </div>
            <div v-if="trashedConversations.length > 0" class="tree-trash-actions">
              <el-button size="small" @click="refreshLifecycle()">刷新</el-button>
              <el-button size="small" type="danger" @click="onEmptyTrash">清空回收站</el-button>
            </div>
            <div v-else class="tree-trash-empty">回收站是空的</div>
          </div>
        </div>

      </div>

      <div v-if="batchMode && selectedConvIds.size > 0" class="batch-bar">
        <span>已选 {{ selectedConvIds.size }} 个</span>
        <el-button size="small" :disabled="filteredConversations.length === 0" @click="batchSelectAll">全选</el-button>
        <el-button size="small" type="danger" @click="batchDeleteConvs">删除选中</el-button>
      </div>
    </div>

    <div v-else-if="sideTab === 'task'" class="task-tab">
      <ScheduledTaskDialog />
    </div>

    <!-- 发布队列（2026-10-17）：模型 publish_enqueue 入队的内容在这里人工确认 -->
    <div v-else-if="sideTab === 'publish'" class="task-tab">
      <PublishQueueTab />
    </div>

    <!-- 文件 tab：资源管理器 / 搜索 / Git（竖排视图按钮 + 面板） -->
    <div v-else class="task-tab file-tab-wrap">
      <ChatFileTab />
    </div>
  </aside>

  <Teleport to="body">
<!-- 移动外壳（触屏）下任务行菜单改由底部动作面板承载（Task 11.3），定位菜单只在非移动壳渲染 -->
<ul v-if="ctxMenu.visible && !isTouchShell" ref="convMenuEl" class="ctx-menu" :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }">
    <!-- 归档会话（右键自「已归档」分组）：对齐 ChatGPT Archived chats —— 只有
         「取消归档 / 打开目录 / 删除」，重命名/置顶/移动空间都是写操作（归档=完全只读），不出现 -->
    <template v-if="ctxMenu.conv?.archivedAt">
      <li @click="archiveConv(ctxMenu.conv, false)">
        <el-icon><RefreshLeft /></el-icon>取消归档
      </li>
      <li @click="openConvDir(ctxMenu.conv); closeCtxMenu()">
        <el-icon><FolderOpened /></el-icon>打开目录
      </li>
      <li class="danger" @click="rows.remove(ctxMenu.conv)">
        <el-icon><Delete /></el-icon>删除
      </li>
    </template>
    <template v-else>
    <li @click="(batchMode && selectedConvIds.has(ctxMenu.conv!.id) ? toggleConvSelect(ctxMenu.conv!.id) : enterBatchSelect(ctxMenu.conv!.id)); closeCtxMenu()">
      <el-icon><Tools /></el-icon>{{ batchMode && selectedConvIds.has(ctxMenu.conv!.id) ? '移出批量选择' : '批量选择' }}
    </li>
    <li v-if="batchMode" @click="exitBatchMode()">
      <el-icon><Close /></el-icon>退出批量模式
    </li>
    <li class="ctx-sep" />
    <li @click="rows.togglePinned(ctxMenu.conv)">
      <el-icon><Star /></el-icon>{{ ctxMenu.conv?.pinned ? '取消置顶' : '置顶' }}
    </li>
    <li @click="rows.startRename(ctxMenu.conv!)">
      <el-icon><EditPen /></el-icon>重命名
    </li>
    <!-- 在系统文件管理器里打开该任务的产物目录（仅桌面端有效，其它端给出提示） -->
    <li @click="openConvDir(ctxMenu.conv); closeCtxMenu()">
      <el-icon><FolderOpened /></el-icon>打开目录
    </li>
    <!-- 独立执行窗口（2026-10-17）：把任务单独开 OS 窗口跑给用户/录屏看（Web 降级新标签页） -->
    <li @click="openTaskWindow(ctxMenu.conv); closeCtxMenu()">
      <el-icon><Monitor /></el-icon>独立窗口打开
    </li>
    <li class="has-submenu">
      <el-icon><Rank /></el-icon>移动到空间
      <el-icon class="submenu-arrow"><ArrowRight /></el-icon>
      <ul class="ctx-submenu">
        <li v-if="moveSpaceList.length === 0" class="disabled-hint">暂无空间，请先创建</li>
        <li @click="rows.moveTo(ctxMenu.conv!, null)">
          <el-icon><Close /></el-icon>未归类
        </li>
        <li v-for="sp in moveSpaceList" :key="sp.id" @click="rows.moveTo(ctxMenu.conv!, sp.id)">
          <el-icon><FolderOpened /></el-icon><span v-if="sp.child" class="move-child-prefix">└&nbsp;</span>{{ sp.name }}
        </li>
      </ul>
    </li>
    <!-- 归档（2026-10-16）：可逆操作，放在破坏性的「删除」之前。
         归档后会话移出主列表且只读，恢复后才能继续对话（对齐 ChatGPT）。 -->
    <li @click="archiveConv(ctxMenu.conv, true)">
      <el-icon><FolderChecked /></el-icon>归档
    </li>
    <li class="danger" @click="rows.remove(ctxMenu.conv)">
      <el-icon><Delete /></el-icon>删除
    </li>
    </template>
  </ul>
</Teleport>

  <!-- 行内「移动」按钮的空间选择浮层：与右键菜单「移动到空间」子菜单同列表、同一 moveTo 流程 -->
  <Teleport to="body">
    <ul v-if="rows.moveMenu.visible" ref="moveMenuEl" class="ctx-menu" :style="{ top: rows.moveMenu.y + 'px', left: rows.moveMenu.x + 'px' }">
      <li v-if="moveSpaceList.length === 0" class="disabled-hint">暂无空间，请先创建</li>
      <li @click="rows.pickMoveTarget(null)">
        <el-icon><Close /></el-icon>未归类
      </li>
      <li v-for="sp in moveSpaceList" :key="sp.id" @click="rows.pickMoveTarget(sp.id)">
        <el-icon><FolderOpened /></el-icon><span v-if="sp.child" class="move-child-prefix">└&nbsp;</span>{{ sp.name }}
      </li>
    </ul>
  </Teleport>

  <!-- 移动端：任务行（会话）底部动作面板（Task 11.3）—— openConvMenu 是右键/长按的共用入口，
       ctxMenu.visible 在移动外壳下即弹 ActionSheet；动作与桌面右键菜单一致（移动到空间平铺）。 -->
  <ActionSheet
    :visible="isTouchShell && ctxMenu.visible"
    :title="ctxMenu.conv?.title || '任务操作'"
    :actions="convSheetActions"
    @close="closeCtxMenu()"
    @select="onConvSheetSelect"
  />

  <!-- 新建/编辑空间：统一 FormDialog（取消/保存底栏由组件默认渲染） -->
  <FormDialog
    v-model="showSpaceEdit"
    :title="spaceEditForm.id ? '编辑空间' : '新建空间'"
    width="460px"
    dialog-class="compact-dialog"
    :confirm-text="spaceEditForm.id ? '保存' : '创建'"
    @submit="saveSpaceEdit"
  >
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="名称">
        <el-input v-model="spaceEditForm.name" placeholder="空间名称" maxlength="50" />
      </el-form-item>
      <el-form-item label="目录">
        <div class="space-dir-row">
          <el-input v-model="spaceEditForm.dirPath" placeholder="绑定本地目录（可选）" clearable />
          <el-button @click="dirPickerVisible = true">
            <el-icon><FolderOpened /></el-icon>&nbsp;浏览
          </el-button>
        </div>
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="spaceEditForm.description" type="textarea" :rows="2" placeholder="空间描述（可选）" />
      </el-form-item>
      <!-- 任务类型：「目录即任务」——选定后自动生成资源目录骨架，模型按流程分步引导。
           父任务类型（如抖音运营）可缩进显示其子线：选父 = 一个目录管多条任务，每条任务再选线 -->
      <el-form-item label="任务类型">
        <!-- 子目录与顶层用同一份列表（用户 2026-10-23 拍板：父任务下可再挂父任务，多级管理）：
             子目录也能绑「抖音运营 / 店铺运营」这类父类型，成为下一级多任务目录，
             新建任务时照常弹「选线」。不再限制「子目录只能选父目录的子线」。 -->
        <el-select v-model="spaceEditForm.taskType" placeholder="未设置（建任务时再选线）" clearable style="width: 100%">
          <!-- ★ 顺序由注册表（TASK_TYPES）定：通用第一、独立「父任务」类型第二（用户拍板），
               不在 UI 层硬编码排序。★ 父子关系读 store（库行），用户自建的父子关系同样生效。
               ★ 有注册子线的父类型（抖音运营/店铺运营）渲染成分组；独立「父任务」是普通选项。 -->
          <template v-for="t in taskTypes" :key="t.id">
            <el-option-group
              v-if="t.id !== 'parent' && taskTypeStore.childrenOf(t.id).length > 0"
              :label="`${t.label}（父任务目录 · 一套目录管多条任务线）`"
            >
              <el-option :label="t.label" :value="t.id">
                <span class="tt-opt-label">{{ t.label }}</span>
                <span class="tt-opt-summary">{{ t.summary }}</span>
              </el-option>
              <el-option
                v-for="c in taskTypeStore.childrenOf(t.id)"
                :key="c.id"
                :label="`　└ ${c.label}`"
                :value="c.id"
              >
                <span class="tt-opt-label tt-opt-child">{{ c.label }}</span>
                <span class="tt-opt-summary">{{ c.summary }}</span>
              </el-option>
            </el-option-group>
            <el-option v-else-if="!t.parentId" :label="t.label" :value="t.id">
              <span class="tt-opt-label">{{ t.label }}</span>
              <span class="tt-opt-summary">{{ t.summary }}</span>
            </el-option>
          </template>
        </el-select>
        <div v-if="editingChildOf" class="tt-guide">
          「{{ editingChildOf.name }}」是父任务目录；给这个子目录选任意类型都行，选父类型（抖音运营 / 店铺运营）它就变成下一级多任务目录，新建任务时再选线。
        </div>
        <div v-else-if="spaceEditForm.taskType" class="tt-guide">{{ pickedTaskType.guide }}</div>
      </el-form-item>
    </el-form>
  </FormDialog>

  <!-- 空间目录选择器（桌面端可用原生目录选择，Web 端为内置浏览器） -->
  <WorkspaceDirDialog v-model="dirPickerVisible" :current-path="spaceEditForm.dirPath" @selected="onSpaceDirSelected" />

  <!-- 多任务目录「选线」：空间绑了父任务类型（如抖音运营）时，新建任务先选本条走哪条子线。
       不选就不建会话 —— 父类型没有 SOP，建了也是空跑（模型只能自己猜一条线）。 -->
  <FormDialog
    v-model="taskLinePickerOpen"
    title="这条任务走哪条线？"
    width="460px"
    dialog-class="compact-dialog"
    :confirm-text="''"
    @submit="cancelTaskLine"
  >
    <p class="tt-line-hint">目录「{{ taskLinePicker?.spaceName }}」是多任务目录，每条任务选一条线推进（资源目录共用）。</p>
    <div class="tt-line-list">
      <button
        v-for="c in taskLinePicker?.children || []"
        :key="c.id"
        type="button"
        class="tt-line-item"
        @click="confirmTaskLine(c.id)"
      >
        <span class="tt-line-label">{{ c.label }}</span>
        <span class="tt-line-summary">{{ c.summary }}</span>
      </button>
    </div>
  </FormDialog>

  <!-- 空间记忆（MEMORY.md）：跨会话、该空间下所有智能体共享的长期记忆。
       注意：这不是 memory 表的维度，而是挂在 space 上的一份文件，故入口在空间上而非「记忆管理」页。 -->
  <el-dialog v-model="spaceMemoryOpen" :title="`空间记忆 · ${spaceMemoryForm.name}`" width="680px" :close-on-click-modal="false" class="compact-dialog">
    <div v-if="spaceMemoryLoading" style="padding: 12px"><el-skeleton :rows="5" animated /></div>
    <template v-else>
      <p class="space-memory-hint">
        本空间下所有会话、任意智能体共享的长期记忆（每行一条，格式建议 <code>- [日期] 内容</code>）。
        对话中会随系统提示词注入。
      </p>
      <el-input v-model="spaceMemoryForm.content" type="textarea" :rows="14" placeholder="暂无内容，可在此沉淀空间级约定、关键决策与重要事实" />
      <p v-if="spaceMemoryForm.path" class="space-memory-path">文件：{{ spaceMemoryForm.path }}</p>
    </template>
    <template #footer>
      <el-button @click="spaceMemoryOpen = false">取消</el-button>
      <el-button type="primary" :loading="spaceMemorySaving" @click="saveSpaceMemory">保存</el-button>
    </template>
  </el-dialog>

  <Teleport to="body">
<ul v-if="spaceMenuTarget" ref="spaceMenuEl" class="ctx-menu" :style="{ top: spaceMenuTarget.y + 'px', left: spaceMenuTarget.x + 'px' }" @click.stop>
    <li @click="openSpaceEdit(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><EditPen /></el-icon>{{ spaceMenuTarget.space.taskType ? '更改任务模式' : '设置任务模式' }}
    </li>
    <!-- 父任务目录专属（2026-10-17）：同步/新建子目录，管理「一个目录管多任务」的层级 -->
    <li v-if="isParentTaskType(spaceMenuTarget.space.taskType)" @click="syncSpaceSubdirsAction(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><Refresh /></el-icon>同步子目录
    </li>
    <li v-if="isParentTaskType(spaceMenuTarget.space.taskType)" @click="openSpaceCreate(spaceMenuTarget.space.id); closeSpaceMenu()">
      <el-icon><Plus /></el-icon>新建子目录
    </li>
    <!-- 在系统文件管理器里打开这个空间的绑定目录（仅桌面端有效，其它端给提示） -->
    <li @click="openPathInSystem(spaceMenuTarget.space.dirPath, true); closeSpaceMenu()">
      <el-icon><FolderOpened /></el-icon>打开目录
    </li>
    <li @click="openSpaceMemory(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><Memo /></el-icon>空间记忆
    </li>
    <li @click="treeMenuNewSpace(); closeSpaceMenu()">
      <el-icon><Plus /></el-icon>新建空间
    </li>
    <!-- 一键归档该空间下的全部会话（2026-10-16）：只动 active，回收站/已归档的不碰 -->
    <li @click="archiveAllInSpace(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><FolderChecked /></el-icon>全部归档
    </li>
    <li class="danger" @click="deleteSpaceConfirm(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><Delete /></el-icon>删除空间
    </li>
  </ul>
</Teleport>

  <!-- 会话树空白区右键菜单 -->
  <Teleport to="body">
<ul v-if="treeMenu.visible" ref="treeMenuEl" class="ctx-menu" :style="{ top: treeMenu.y + 'px', left: treeMenu.x + 'px' }">
    <li @click="toggleBatchMode(); closeTreeMenu()">
      <el-icon><Tools /></el-icon>{{ batchMode ? '退出批量模式' : '批量管理' }}
    </li>
    <li class="ctx-sep" />
    <li @click="treeMenuNewTask">
      <el-icon><ChatDotRound /></el-icon>新建任务
    </li>
    <li @click="treeMenuNewSpace">
      <el-icon><FolderOpened /></el-icon>新建空间
    </li>
  </ul>
</Teleport>

</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  Plus, ChatDotRound, Star, StarFilled, EditPen, Delete, FolderOpened, Rank, ArrowRight, Close, Search, CaretRight, Timer, Memo, Tools, FolderChecked, Box, RefreshLeft, Monitor, Refresh, Promotion,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getTaskType, isParentTaskType, getChildTaskTypes } from '@yan-zhi/shared';
// 来源标记的白名单常量取自 core（别在模板里写 'browser-page' 字面量）
import { CONV_SOURCE_BROWSER_PAGE } from '@yan-zhi/core';
import { useChat } from '../../composables/chat/useChat';
import { useTaskRowActions } from '../../composables/useTaskRowActions';
import { bindLongPress } from '../../composables/useLongPress';
import { placeMenuAfterRender } from '../../composables/useMenuPlacement';
import { useMobileShell } from '../../composables/useMobileShell';
import ScheduledTaskDialog from './ScheduledTaskDialog.vue';
import PublishQueueTab from './PublishQueueTab.vue';
import ChatFileTab from './ChatFileTab.vue';
import WorkspaceDirDialog from '../WorkspaceDirDialog.vue';
import FormDialog from '../FormDialog.vue';
import EmptyState from '../common/EmptyState.vue';
import ActionSheet from '../common/ActionSheet.vue';
import type { ActionSheetAction } from '../common/ActionSheet.vue';

/** 会话来源徽标的判据（模板里 `v-if="conv.source === BROWSER_PAGE_SOURCE"`） */
const BROWSER_PAGE_SOURCE = CONV_SOURCE_BROWSER_PAGE;

const {
  sideTab, search, store, batchMode, toggleConvSelect,
  openConvMenu, selectedConvIds, renamingId, renamingTitle, renameInputRef,
  filteredConversations, startNewChat, batchSelectAll, batchDeleteConvs,
  rootConversations, conversationsBySpace, spaceCollapsed, toggleSpaceCollapse, rootCollapsed, toggleRootCollapse,
  // 置顶分组（2026-10-09）
  pinnedRootConversations, unpinnedRootConversations, pinnedCollapsed, togglePinnedCollapse,
  spaceStore, openSpaceMenu, openSpaceEdit, openSpaceCreate, showSpaceEdit, spaceEditForm,
  saveSpaceEdit, deleteSpaceConfirm, spaceMenuTarget, closeSpaceMenu, ctxMenu,
  syncSpaceSubdirsAction,
  openConvDir, openPathInSystem, openTaskWindow,
  taskTypes, pickedTaskType, selectSpaceAndSyncDir,
  // 任务级任务类型（「父任务」层）：多任务目录选线
  taskLinePicker, confirmTaskLine, cancelTaskLine, taskTypeStore,
  closeCtxMenu,
  treeMenu, openTreeMenu, treeMenuNewTask, treeMenuNewSpace, closeTreeMenu,
  enterBatchSelect, exitBatchMode, toggleBatchMode, toggleSelectAllInSpace, toggleSelectAllInRoot,
  spaceSelectState, rootSelectState,
  // 会话生命周期（2026-10-16 归档 + 回收站）
  archiveConv, restoreConv, purgeConv, loadLifecycleLists, archivedConversations, trashedConversations,
  archiveAllInSpace,
} = useChat();

/** 归档分组受侧栏搜索框联动过滤（对齐 ChatGPT：搜索能搜到归档会话） */
const archivedFiltered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return archivedConversations.value;
  return archivedConversations.value.filter((c) => (c.title || '').toLowerCase().includes(q));
});

// 任务行共享操作（置顶/重命名/删除/移动空间/激活）：与 TaskListSection 共用同一 composable。
// 重命名聚焦走 useChat 内置的 renameInputRef（模板里 rename 输入框绑了该 ref），无需额外适配。
const rows = useTaskRowActions();

// ===== 右键菜单贴光标：渲染后按真实尺寸校正（2026-10-18，用户实报「弹窗离鼠标老远」）=====
// 旧 clampMenuPos 按猜的 320px 高度夹取，光标越靠菜单被推得越远。现在打开时先落光标坐标，
// 这里在各菜单 v-if 渲染完成后量真实 offsetWidth/Height 校正：贴光标右下、下方放不下翻上方、
// 再不行才贴边 —— 与系统右键菜单同感。机制详见 composables/useMenuPlacement.ts。
const convMenuEl = ref<HTMLElement | null>(null);
const moveMenuEl = ref<HTMLElement | null>(null);
const spaceMenuEl = ref<HTMLElement | null>(null);
const treeMenuEl = ref<HTMLElement | null>(null);
watch(
  () => [ctxMenu.visible, rows.moveMenu.visible, !!spaceMenuTarget.value, treeMenu.visible] as const,
  ([cv, mv, sv, tv]) => {
    if (cv) placeMenuAfterRender(convMenuEl, ctxMenu, (p) => { ctxMenu.x = p.x; ctxMenu.y = p.y; });
    if (mv) placeMenuAfterRender(moveMenuEl, rows.moveMenu, (p) => { rows.moveMenu.x = p.x; rows.moveMenu.y = p.y; });
    if (sv && spaceMenuTarget.value) placeMenuAfterRender(spaceMenuEl, spaceMenuTarget.value, (p) => {
      if (spaceMenuTarget.value) { spaceMenuTarget.value.x = p.x; spaceMenuTarget.value.y = p.y; }
    });
    if (tv) placeMenuAfterRender(treeMenuEl, treeMenu, (p) => { treeMenu.x = p.x; treeMenu.y = p.y; });
  },
);

// 选线框显隐（v-model 需要布尔；内容由 useChat 的 taskLinePicker 提供）
const taskLinePickerOpen = computed({
  get: () => !!taskLinePicker.value,
  set: (v: boolean) => { if (!v) cancelTaskLine(); },
});

// ===== 父任务目录的「子目录」层级（2026-10-17）=====

/** 当前编辑的是否子目录：返回其父空间（顶层空间 → null） */
const editingChildOf = computed(() => {
  const pid = (spaceEditForm.value as any).parentId as string || '';
  if (!pid) return null;
  return spaceStore.spaces.find((s) => s.id === pid) || null;
});

/** 「移动到空间」列表：父目录在前、子目录缩进跟随（与侧栏层级一致，避免平铺看不出归属） */
const moveSpaceList = computed(() => {
  const out: Array<{ id: string; name: string; child: boolean }> = [];
  for (const p of spaceStore.rootSpaces) {
    out.push({ id: p.id, name: p.name, child: false });
    for (const c of spaceStore.childSpacesOf(p.id)) out.push({ id: c.id, name: c.name, child: true });
  }
  return out;
});

// ===== 移动端：任务行（会话）底部动作面板（Task 11.3）=====
// 动作与桌面右键菜单同项；「移动到空间」子菜单平铺为带参 key（move:<spaceId>）
const convSheetActions = computed<ActionSheetAction[]>(() => {
  const c = ctxMenu.conv;
  if (!c) return [];
  const list: ActionSheetAction[] = [
    { key: 'batch', label: batchMode.value && selectedConvIds.value.has(c.id) ? '移出批量选择' : '批量选择' },
  ];
  if (batchMode.value) list.push({ key: 'exit-batch', label: '退出批量模式' });
  list.push(
    { key: 'pin', label: c.pinned ? '取消置顶' : '置顶' },    { key: 'rename', label: '重命名' },
    { key: 'open-dir', label: '打开目录' },
  );
  // 归档（2026-10-16）：归档后只读，恢复后才能继续，所以入口放在「删除」之前
  list.push({ key: 'archive', label: '归档' });
  if (spaceStore.spaces.length === 0) {
    list.push({ key: 'no-space', label: '暂无空间，请先创建', disabled: true });
  } else {
    list.push({ key: 'move:null', label: '移动到：未归类' });
    for (const sp of spaceStore.spaces) list.push({ key: `move:${sp.id}`, label: `移动到：${sp.name}` });
  }
  list.push({ key: 'delete', label: '删除', danger: true });
  return list;
});

function onConvSheetSelect(a: ActionSheetAction) {
  const c = ctxMenu.conv;
  closeCtxMenu();
  if (!c) return;
  if (a.key === 'batch') {
    if (batchMode.value && selectedConvIds.value.has(c.id)) toggleConvSelect(c.id);
    else enterBatchSelect(c.id);
  } else if (a.key === 'exit-batch') exitBatchMode();
  else if (a.key === 'pin') rows.togglePinned(c);
  else if (a.key === 'rename') rows.startRename(c);
  else if (a.key === 'open-dir') openConvDir(c);
  else if (a.key === 'archive') archiveConv(c, true);
  else if (a.key === 'move:null') rows.moveTo(c, null);
  else if (a.key.startsWith('move:')) rows.moveTo(c, a.key.slice(5));
  else if (a.key === 'delete') rows.remove(c);
}

/**
 * 点空间节点：
 *  · 已选中 → 纯折叠/展开（用户在看空间内部的任务列表）；
 *  · 未选中 → 选中它并同步工作目录（表达「接下来的任务归这个空间」——
 *    这是任务类型/SOP 生效的前提，2026-09-27 补）。
 *  ★ 不再动当前会话（2026-10-13）：切换空间只影响"下一个新任务"归属，
 *    当前打开的会话（可能属于空间 A 且正在跑）保持原样 —— 此前点 B 空间后
 *    继续在 A 会话发消息，A 会话会被 send() 改挂到 B（已在 send 侧根治，
 *    这里保持"切换=切上下文"的纯语义）。
 * ★ 双击空间节点 = 直接在该空间新建会话（2026-10-13，类 Claude 的项目体验：
 *   "想进哪个项目就双击哪个项目"，不用先选中再点「+ 新建任务"）。
 */
function onSpaceHeadClick(id: string) {
  if (spaceStore.currentSpaceId === id) {
    toggleSpaceCollapse(id);
    return;
  }
  void selectSpaceAndSyncDir(id);
}

/** 双击空间节点 → 在该空间新建会话（单击已保证选中态，这里直接建）。
 *  ★ 双击会先触发两次 click（第二次 click 命中"已选中→折叠/展开"分支，折叠态翻转一次），
 *    这里把折叠态强制展开收尾，消除双击末尾的抖动。 */
function onSpaceHeadDblClick(id: string) {
  if (spaceStore.currentSpaceId !== id) void selectSpaceAndSyncDir(id);
  if (spaceCollapsed.value[id]) toggleSpaceCollapse(id);
  void startNewChat(id);
}

/** 空间的任务类型标签（列表上直接可见，省得进编辑弹窗才知道） */
function taskTypeLabel(id?: string) {
  return getTaskType(id).label;
}

/**
 * 是否触屏形态（窄视口 或 Capacitor）。
 * 只用于**文案**：触屏上要说「长按」，桌面/Web 上说「右键」——
 * 否则用户按提示操作却按不出来（2026-09-22 反馈的「长按没有实现」）。
 * ★ 交互本身不依赖它：`bindLongPress` 内部按 `pointerType === 'touch'` 判定，
 *   鼠标右键照常走原生 contextmenu，两侧互不影响。
 */
const isTouchShell = useMobileShell();

// ===== 空间目录选择：浏览本地目录，选完自动回填路径，名称留空时以目录名带出 =====
const dirPickerVisible = ref(false);
function onSpaceDirSelected(path: string) {
  spaceEditForm.value.dirPath = path;
  if (!spaceEditForm.value.name.trim() && path) {
    const sep = path.includes('\\') ? '\\' : '/';
    const base = path.split(sep).filter(Boolean).pop() || '';
    if (base) spaceEditForm.value.name = base.replace(/[:.]$/, '');
  }
}

// ===== 空间记忆（MEMORY.md）：读写 /api/spaces/:id/memory =====
const spaceMemoryOpen = ref(false);
const spaceMemoryLoading = ref(false);
const spaceMemorySaving = ref(false);
const spaceMemoryForm = ref({ id: '', name: '', content: '', path: '' });

async function openSpaceMemory(space: any) {
  if (!space?.id) return;
  spaceMemoryForm.value = { id: space.id, name: space.name || '空间', content: '', path: '' };
  spaceMemoryOpen.value = true;
  spaceMemoryLoading.value = true;
  try {
    const r = await spaceStore.readSpaceMemory(space.id);
    spaceMemoryForm.value.content = r.content;
    spaceMemoryForm.value.path = r.path;
  } catch (e: any) {
    ElMessage.error(e?.message || '读取空间记忆失败');
    spaceMemoryOpen.value = false;
  } finally {
    spaceMemoryLoading.value = false;
  }
}

async function saveSpaceMemory() {
  const { id, content } = spaceMemoryForm.value;
  if (!id) return;
  spaceMemorySaving.value = true;
  try {
    const r = await spaceStore.writeSpaceMemory(id, content);
    spaceMemoryForm.value.path = r.path || spaceMemoryForm.value.path;
    ElMessage.success('空间记忆已保存');
    spaceMemoryOpen.value = false;
  } catch (e: any) {
    ElMessage.error(e?.message || '保存空间记忆失败');
  } finally {
    spaceMemorySaving.value = false;
  }
}

function onDocMouseDown(e: MouseEvent) {
  // ★ 右键（button=2）不在这里收：mousedown 先于 contextmenu 触发，若这里关了菜单，
  //   contextmenu 里「再次右击同目标 = 收起」的 toggle 判据（visible 已被置 false）永远失效。
  //   右键的收/切由各 open*Menu 处理器负责（与 TaskListSection 同规则）。
  if (e.button === 2) return;
  if ((e.target as HTMLElement)?.closest('.ctx-menu')) return;
  closeCtxMenu();
  // 行内「移动」浮层：点浮层外任何位置（含任务行）都收起
  rows.closeMoveMenu();
}

// ═══ 归档 / 回收站 UI 状态（2026-10-16）══════════════════════════════════════
// 「已归档」与「置顶」同形态：**顶层节点**（不受「任务」/空间的折叠态影响），
// 自身可折叠。收纳态持久化，避免每次进页面都被归档列表刷屏。
const ARCHIVED_COLLAPSE_KEY = 'yz_conv_archived_collapsed';
const archivedCollapsed = ref<boolean>((() => {
  try { return localStorage.getItem(ARCHIVED_COLLAPSE_KEY) === '1'; } catch { return true; }
})());
function toggleArchivedCollapse() {
  archivedCollapsed.value = !archivedCollapsed.value;
  try { localStorage.setItem(ARCHIVED_COLLAPSE_KEY, archivedCollapsed.value ? '1' : '0'); } catch { /* ignore */ }
  // 展开时顺带拉一次最新（侧栏常驻，归档操作可能发生在别处/别的会话）
  if (!archivedCollapsed.value) void loadLifecycleLists();
}

/** 回收站视图开关（与「已归档」互斥的简单切换，不做嵌套层级） */
const trashOpen = ref(false);
function toggleTrash() {
  trashOpen.value = !trashOpen.value;
  if (trashOpen.value) {
    archivedCollapsed.value = false;
    void loadLifecycleLists();
  }
}

/** 被收起的浏览器页面对话条数（角标；来自 /conversations/counts，不是"列表长度"—— 那些本就不在主列表里） */
const pageConvCount = computed(() => store.lifecycleCounts.pageSessions || 0);

/**
 * 显示 / 收起浏览器页面对话。
 * ★ 必须**重拉列表**：过滤在服务端（前端过滤只是"看不见"，批量删除这类扫全量的逻辑仍会扫到）。
 */
async function togglePageConvs() {
  store.setShowPageConvs(!store.showPageConvs);
  await store.loadConversations();
}

/** 展开归档区/回收站时刷新列表；恢复、永久删除、归档都要回到这里 */
async function refreshLifecycle() {
  await loadLifecycleLists();
}

/** 清空回收站 = 永久删除全部。破坏性最强的一步，二次确认 + 明示不可恢复 */
async function onEmptyTrash() {
  try {
    await ElMessageBox.confirm(
      `永久删除回收站里的 ${trashedConversations.value.length} 个会话？消息将一并删除，无法恢复。`,
      '清空回收站',
      { type: 'warning', confirmButtonClass: 'yz-confirm-danger' },
    );
    const n = await store.emptyTrash();
    ElMessage.success(`已永久删除 ${n} 个会话`);
    await refreshLifecycle();
  } catch { /* 用户取消 */ }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown, true);
  // 侧栏角标需要这两个数；列表本身只在展开时才拉（不进主列表）
  void loadLifecycleLists();
});
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown, true));
</script>
