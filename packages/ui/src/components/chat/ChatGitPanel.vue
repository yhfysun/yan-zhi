<template>
  <div class="git-panel" @click="closeContextMenu">
    <!-- 顶栏：仓库 / 分支 / 同步状态 / 操作 -->
    <header class="git-top">
      <el-dropdown
        v-if="repoSummaries.length > 1"
        trigger="click"
        placement="bottom-start"
        popper-class="git-popper"
        @command="(p: string) => switchRepo(p)"
      >
        <button class="git-chip git-chip-repo" title="切换仓库">
          <el-icon class="git-chip-ico"><Box /></el-icon>
          <span class="git-chip-text">{{ activeRepoName }}</span>
          <el-icon class="git-chip-caret"><ArrowDown /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="r in repoSummaries" :key="r.path" :command="r.path"
              :class="{ 'is-on': r.path === activeRepo }"
            >
              <el-icon v-if="r.path === activeRepo"><Check /></el-icon>
              <span v-else class="git-menu-spacer" />
              <span class="git-menu-label">{{ r.name }}</span>
              <em v-if="r.changes" class="git-menu-badge">{{ r.changes }}</em>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-dropdown
        trigger="click" placement="bottom-start" popper-class="git-popper"
        @command="onBranchCommand"
      >
        <button class="git-chip" :title="currentBranch || '选择分支'">
          <el-icon class="git-chip-ico"><Switch /></el-icon>
          <span class="git-chip-text">{{ currentBranch || '分支' }}</span>
          <el-icon class="git-chip-caret"><ArrowDown /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="git-menu-title">本地分支</div>
            <el-dropdown-item
              v-for="b in localBranches" :key="'lb' + b" :command="'co:' + b"
              :class="{ 'is-on': b === currentBranch }"
            >
              <el-icon v-if="b === currentBranch"><Check /></el-icon>
              <span v-else class="git-menu-spacer" />
              <span>{{ b }}</span>
            </el-dropdown-item>
            <template v-if="remoteBranchesList.length">
              <div class="git-menu-title">远程分支</div>
              <el-dropdown-item v-for="b in remoteBranchesList" :key="'rb' + b" :command="'co:' + b">
                <span class="git-menu-spacer" />
                <span>{{ b }}</span>
              </el-dropdown-item>
            </template>
            <el-dropdown-item command="__new" divided>新建分支…</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <span v-if="aheadBehind.behind" class="git-sync git-sync-down" title="落后远程">↓{{ aheadBehind.behind }}</span>
      <span v-if="aheadBehind.ahead" class="git-sync git-sync-up" title="领先远程">↑{{ aheadBehind.ahead }}</span>
      <span class="git-top-spacer" />

      <button class="git-top-btn" title="同步（拉取并推送）" :disabled="busy" @click="doSync">
        <el-icon><RefreshRight /></el-icon>
      </button>
      <button class="git-top-btn" title="刷新" :disabled="busy" @click="refreshAll(true)">
        <el-icon><Refresh /></el-icon>
      </button>
      <el-dropdown trigger="click" placement="bottom-end" popper-class="git-popper" @command="onMoreCommand">
        <button class="git-top-btn" title="更多操作"><el-icon><MoreFilled /></el-icon></button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="pull">拉取 Pull</el-dropdown-item>
            <el-dropdown-item command="push">推送 Push</el-dropdown-item>
            <el-dropdown-item command="fetch">抓取 Fetch</el-dropdown-item>
            <el-dropdown-item command="merge" divided>合并分支…</el-dropdown-item>
            <el-dropdown-item command="rebase">变基 Rebase…</el-dropdown-item>
            <el-dropdown-item v-if="conflictFiles.length" command="abortMerge" divided>中止合并</el-dropdown-item>
            <el-dropdown-item command="stash" divided>储藏改动…</el-dropdown-item>
            <el-dropdown-item command="stashPop">弹出储藏</el-dropdown-item>
            <el-dropdown-item command="tag">创建标签…</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </header>
    <div v-if="busy || gitLoading" class="git-progress" />

    <!-- 变更工具条（IDEA Commit 工具窗顶部那排图标） -->
    <div class="git-toolbar">
      <button class="git-tb-btn" title="刷新状态" :disabled="busy" @click="refreshAll(true)">
        <el-icon><RefreshRight /></el-icon>
      </button>
      <button class="git-tb-btn" title="全部暂存" :disabled="busy || !unstagedFiles.length && !untrackedFiles.length" @click="stageAll">
        <el-icon><Plus /></el-icon>
      </button>
      <button class="git-tb-btn danger" title="全部回滚未暂存更改" :disabled="busy || !unstagedFiles.length" @click="restoreAll">
        <el-icon><RefreshLeft /></el-icon>
      </button>
      <button class="git-tb-btn" title="储藏当前改动" :disabled="busy || !changedFiles.length" @click="doStashSave">
        <el-icon><Download /></el-icon>
      </button>
      <span class="git-top-spacer" />
      <button class="git-tb-btn" :title="showUntracked ? '隐藏未版本控制文件' : '显示未版本控制文件'" @click="showUntracked = !showUntracked">
        <el-icon><View /></el-icon>
      </button>
      <button class="git-tb-btn" title="展开/折叠全部" @click="toggleAllGroups">
        <el-icon><Fold v-if="allExpanded" /><Expand v-else /></el-icon>
      </button>
    </div>

    <!-- 筛选（固定顶部） -->
    <div class="git-filter">
      <el-input v-model="filterText" size="small" placeholder="筛选变更文件" clearable @keydown.esc="filterText = ''">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </div>

    <!-- 列表区（独立滚动） -->
    <div class="git-scroll">
      <template v-if="gitLoading">
        <div v-for="i in 5" :key="'sk' + i" class="git-skeleton" />
      </template>

      <template v-else>
        <!-- ① 更改（IDEA Changes / Unversioned Files） -->
        <div class="git-section">
          <div class="git-section-header" @click="toggleSection('changes')">
            <el-icon class="git-arrow"><CaretRight v-if="!sections.changes" /><CaretBottom v-else /></el-icon>
            <span class="git-section-title">变更</span>
            <em class="git-badge">{{ changedFiles.length }}</em>
          </div>
          <div v-show="sections.changes" class="git-section-body">
            <!-- 冲突 -->
            <div v-if="conflictFiles.length" class="git-group">
              <div class="git-group-header is-conflict" @click="toggleGroup('conflicts')">
                <el-icon class="git-arrow"><CaretRight v-if="!groups.conflicts" /><CaretBottom v-else /></el-icon>
                <span class="git-group-title">合并冲突</span>
                <em class="git-badge">{{ conflictFiles.length }}</em>
              </div>
              <div v-show="groups.conflicts">
                <div v-for="p in conflictFiles" :key="'cf' + p" class="git-file-row is-conflict" @click="openConflict(p)">
                  <span class="git-status-badge conflict">U</span>
                  <span class="git-file-name">{{ baseName(p) }}</span>
                  <span class="git-file-dir">{{ dirName(p) }}</span>
                  <span class="git-file-hint">解决 →</span>
                </div>
              </div>
            </div>

            <!-- 已暂存 -->
            <div v-if="visible(stagedFiles).length" class="git-group">
              <div class="git-group-header" @click="toggleGroup('staged')">
                <el-icon class="git-arrow"><CaretRight v-if="!groups.staged" /><CaretBottom v-else /></el-icon>
                <span class="git-group-title">已暂存</span>
                <em class="git-badge">{{ stagedFiles.length }}</em>
                <button class="git-group-btn" title="全部取消暂存" @click.stop="unstageAll">
                  <el-icon><Minus /></el-icon>
                </button>
              </div>
              <div v-show="groups.staged">
                <div
                  v-for="f in visible(stagedFiles)" :key="'s' + f.path"
                  class="git-file-row" :class="{ selected: isSelected(f.path) }"
                  @click="onFileClick($event, f)" @contextmenu.prevent="onFileContextMenu($event, f)"
                >
                  <span class="git-status-badge" :class="f.statusClass">{{ f.statusChar }}</span>
                  <span class="git-file-name">{{ baseName(f.path) }}</span>
                  <span class="git-file-dir">{{ dirName(f.path) }}</span>
                  <span v-if="f.added" class="git-num git-num-add">+{{ f.added }}</span>
                  <span v-if="f.deleted" class="git-num git-num-del">−{{ f.deleted }}</span>
                  <span class="git-row-actions">
                    <button title="打开差异" @click.stop="openDiff(f)"><el-icon><Document /></el-icon></button>
                    <button title="取消暂存" @click.stop="toggleStage(f)"><el-icon><Minus /></el-icon></button>
                    <button class="danger" title="放弃更改" @click.stop="doRestoreFile(f.path)"><el-icon><RefreshLeft /></el-icon></button>
                  </span>
                </div>
              </div>
            </div>

            <!-- 未暂存（IDEA "Changes"） -->
            <div v-if="visible(unstagedFiles).length" class="git-group">
              <div class="git-group-header" @click="toggleGroup('unstaged')">
                <el-icon class="git-arrow"><CaretRight v-if="!groups.unstaged" /><CaretBottom v-else /></el-icon>
                <span class="git-group-title">未暂存（Changes）</span>
                <em class="git-badge">{{ unstagedFiles.length }}</em>
                <button class="git-group-btn" title="全部暂存" @click.stop="stageAll"><el-icon><Plus /></el-icon></button>
                <button class="git-group-btn danger" title="全部放弃" @click.stop="restoreAll"><el-icon><RefreshLeft /></el-icon></button>
              </div>
              <div v-show="groups.unstaged">
                <div
                  v-for="f in visible(unstagedFiles)" :key="'u' + f.path"
                  class="git-file-row" :class="{ selected: isSelected(f.path) }"
                  @click="onFileClick($event, f)" @contextmenu.prevent="onFileContextMenu($event, f)"
                >
                  <span class="git-status-badge" :class="f.statusClass">{{ f.statusChar }}</span>
                  <span class="git-file-name">{{ baseName(f.path) }}</span>
                  <span class="git-file-dir">{{ dirName(f.path) }}</span>
                  <span v-if="f.added" class="git-num git-num-add">+{{ f.added }}</span>
                  <span v-if="f.deleted" class="git-num git-num-del">−{{ f.deleted }}</span>
                  <span class="git-row-actions">
                    <button title="打开差异" @click.stop="openDiff(f)"><el-icon><Document /></el-icon></button>
                    <button title="暂存" @click.stop="toggleStage(f)"><el-icon><Plus /></el-icon></button>
                    <button class="danger" title="放弃更改" @click.stop="doRestoreFile(f.path)"><el-icon><RefreshLeft /></el-icon></button>
                  </span>
                </div>
              </div>
            </div>

            <!-- 未跟踪（IDEA "Unversioned Files"） -->
            <div v-if="showUntracked && visible(untrackedFiles).length" class="git-group">
              <div class="git-group-header" @click="toggleGroup('untracked')">
                <el-icon class="git-arrow"><CaretRight v-if="!groups.untracked" /><CaretBottom v-else /></el-icon>
                <span class="git-group-title">未版本控制文件（Unversioned）</span>
                <em class="git-badge">{{ untrackedFiles.length }}</em>
                <button class="git-group-btn" title="全部暂存" @click.stop="stageAll"><el-icon><Plus /></el-icon></button>
              </div>
              <div v-show="groups.untracked">
                <div
                  v-for="f in visible(untrackedFiles)" :key="'ut' + f.path"
                  class="git-file-row" :class="{ selected: isSelected(f.path) }"
                  @click="onFileClick($event, f)" @contextmenu.prevent="onFileContextMenu($event, f)"
                >
                  <span class="git-status-badge untracked">?</span>
                  <span class="git-file-name">{{ baseName(f.path) }}</span>
                  <span class="git-file-dir">{{ dirName(f.path) }}</span>
                  <span class="git-row-actions">
                    <button title="暂存" @click.stop="toggleStage(f)"><el-icon><Plus /></el-icon></button>
                  </span>
                </div>
              </div>
            </div>

            <div v-if="!changedFiles.length" class="git-empty-inline">工作区干净，没有变更</div>
            <div v-else-if="!hasVisible" class="git-empty-inline">没有匹配「{{ filterText }}」的文件</div>
          </div>
        </div>

        <!-- ② 储存库 -->
        <div class="git-section">
          <div class="git-section-header" @click="toggleSection('repo')">
            <el-icon class="git-arrow"><CaretRight v-if="!sections.repo" /><CaretBottom v-else /></el-icon>
            <span class="git-section-title">储存库</span>
          </div>
          <div v-show="sections.repo" class="git-section-body">
            <div class="git-sub">
              <div class="git-sub-header" @click="toggleSub('branches')">
                <el-icon class="git-arrow"><CaretRight v-if="!subs.branches" /><CaretBottom v-else /></el-icon>
                <span class="git-sub-title">分支</span>
                <em class="git-badge">{{ localBranches.length }}</em>
                <button class="git-group-btn" title="新建分支" @click.stop="doCreateBranch"><el-icon><Plus /></el-icon></button>
              </div>
              <div v-show="subs.branches" class="git-sub-body">
                <div
                  v-for="b in localBranches" :key="'b' + b"
                  class="git-branch-item" :class="{ current: b === currentBranch }"
                  @click="checkoutBranch(b)" @contextmenu.prevent="onBranchContextMenu($event, b)"
                >
                  <el-icon v-if="b === currentBranch" class="git-branch-check"><Check /></el-icon>
                  <span v-else class="git-menu-spacer" />
                  <span class="git-branch-text">{{ b }}</span>
                </div>
              </div>
            </div>

            <div class="git-sub">
              <div class="git-sub-header" @click="toggleSub('tags')">
                <el-icon class="git-arrow"><CaretRight v-if="!subs.tags" /><CaretBottom v-else /></el-icon>
                <span class="git-sub-title">标签</span>
                <em class="git-badge">{{ tagsList.length }}</em>
                <button class="git-group-btn" title="新建标签" @click.stop="doTagCreate()"><el-icon><Plus /></el-icon></button>
              </div>
              <div v-show="subs.tags" class="git-sub-body">
                <div v-for="t in tagsList" :key="'t' + t" class="git-tag-item" @contextmenu.prevent="onTagContextMenu($event, t)">
                  <el-icon><PriceTag /></el-icon>
                  <span class="git-tag-text">{{ t }}</span>
                </div>
                <div v-if="!tagsList.length" class="git-empty-inline">无标签</div>
              </div>
            </div>

            <div class="git-sub">
              <div class="git-sub-header" @click="toggleSub('stash')">
                <el-icon class="git-arrow"><CaretRight v-if="!subs.stash" /><CaretBottom v-else /></el-icon>
                <span class="git-sub-title">储藏</span>
                <em class="git-badge">{{ stashList.length }}</em>
                <button class="git-group-btn" title="储藏改动" @click.stop="doStashSave"><el-icon><Plus /></el-icon></button>
              </div>
              <div v-show="subs.stash" class="git-sub-body">
                <div v-for="(s, i) in stashList" :key="'st' + i" class="git-stash-item">
                  <span class="git-stash-idx">[{{ i }}]</span>
                  <span class="git-stash-text" :title="s">{{ s }}</span>
                  <span class="git-stash-actions">
                    <button title="弹出" @click="doStashPop(i)"><el-icon><Upload /></el-icon></button>
                    <button title="应用" @click="doStashApply(i)"><el-icon><Download /></el-icon></button>
                    <button class="danger" title="删除" @click="doStashDrop(i)"><el-icon><Delete /></el-icon></button>
                  </span>
                </div>
                <div v-if="!stashList.length" class="git-empty-inline">无储藏</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ③ 图形 -->
        <div class="git-section">
          <div class="git-section-header" @click="toggleSection('graph')">
            <el-icon class="git-arrow"><CaretRight v-if="!sections.graph" /><CaretBottom v-else /></el-icon>
            <span class="git-section-title">图形</span>
            <em class="git-badge">{{ logEntries.length }}</em>
          </div>
          <div v-show="sections.graph" class="git-section-body">
            <div class="git-history">
              <div
                v-for="c in historyRows" :key="c.hash"
                class="git-history-row" :class="{ expanded: expandedCommit === c.hash }"
                @click="toggleCommit(c.hash)" @contextmenu.prevent="onCommitContextMenu($event, c)"
              >
                <div class="git-history-main">
                  <svg
                    v-if="c.graph" class="git-history-graph"
                    :width="c.graph.width" :height="GRAPH_ROW_H" :viewBox="`0 0 ${c.graph.width} ${GRAPH_ROW_H}`"
                  >
                    <path v-for="(p, pi) in c.graph.paths" :key="pi" :d="p.d" :stroke="p.color" stroke-width="1.5" fill="none" />
                    <circle v-if="c.graph.dot" class="git-graph-dot" :cx="c.graph.dot.x" :cy="GRAPH_ROW_H / 2" r="3" :fill="c.graph.dot.color" />
                  </svg>
                  <span class="git-history-hash">{{ shortHash(c.hash) }}</span>
                  <span class="git-history-msg">{{ c.message.split('\n')[0] }}</span>
                  <span class="git-history-meta">{{ c.author_name }} · {{ timeAgo(c.date) }}</span>
                </div>
                <div v-if="expandedCommit === c.hash" class="git-history-detail">
                  <div class="git-history-full">{{ c.message }}</div>
                  <div class="git-history-meta-line">作者：{{ c.author_name }} &lt;{{ c.author_email || '' }}&gt;</div>
                  <div class="git-history-meta-line">提交时间：{{ formatDate(c.date) }}</div>
                  <div class="git-history-files">
                    <div class="git-history-files-label">变更文件（{{ commitFiles.length }}）</div>
                    <div v-if="commitFilesLoading" class="git-empty-inline">加载…</div>
                    <div
                      v-for="cf in commitFiles" :key="cf.path"
                      class="git-history-file-row" :class="{ active: commitExpandedFile === cf.path }"
                      @click.stop="toggleCommitFile(c.hash, cf.path)"
                    >
                      <span class="git-status-badge" :class="commitFileStatusClass(cf.status)">{{ cf.status[0] }}</span>
                      <span class="git-file-name">{{ baseName(cf.path) }}</span>
                      <span class="git-file-dir">{{ dirName(cf.path) }}</span>
                    </div>
                    <div v-if="commitExpandedFile" class="git-history-file-diff">
                      <div v-if="commitFileDiffLoading" class="git-empty-inline">加载 diff…</div>
                      <GitDiffViewer v-else :diff-text="commitFileDiff" :file-name="commitExpandedFile" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="!logEntries.length" class="git-empty-inline">无提交历史</div>
          </div>
        </div>

        <!-- ④ 智能体审查 -->
        <div class="git-section">
          <div class="git-section-header" @click="toggleSection('review')">
            <el-icon class="git-arrow"><CaretRight v-if="!sections.review" /><CaretBottom v-else /></el-icon>
            <span class="git-section-title">智能体审查</span>
          </div>
          <div v-show="sections.review" class="git-section-body">
            <div class="git-review">
              <button class="git-review-btn" :disabled="reviewLoading || !changedFiles.length" @click="doAiReview">
                <el-icon v-if="reviewLoading" class="is-loading"><Loading /></el-icon>
                <el-icon v-else><MagicStick /></el-icon>&nbsp;{{ reviewLoading ? '审查中…' : '审查当前变更' }}
              </button>
              <div v-if="reviewResult" class="git-review-result"><MarkdownPreview :content="reviewResult" /></div>
            </div>
          </div>
        </div>
      </template>

      <!-- 多仓库批量操作 -->
      <div v-if="repoSummaries.length > 1" class="git-batch">
        <button class="git-batch-btn" :disabled="busy" @click="doBatchPull"><el-icon><Download /></el-icon>&nbsp;全部拉取</button>
        <button class="git-batch-btn" :disabled="busy" @click="doBatchPush"><el-icon><Upload /></el-icon>&nbsp;全部推送</button>
        <button class="git-batch-btn" :disabled="busy" @click="doBatchCheckoutPrompt"><el-icon><Switch /></el-icon>&nbsp;批量切换</button>
      </div>
    </div>

    <!-- 提交区（IDEA 位置：列表下方，输入框常驻；放大进弹窗逐文件勾选） -->
    <section class="git-commit">
      <div class="git-commit-input-wrap">
        <el-input
          v-model="commitDraft[activeKey]"
          type="textarea" :rows="2" size="small" resize="none"
          placeholder="提交信息（Ctrl+Enter 提交，Ctrl+Shift+Enter 提交并推送）"
          @keydown.ctrl.enter.prevent="doCommit"
          @keydown.ctrl.shift.enter.prevent="doCommitAndPush"
        />
        <div class="git-ai-overlay">
          <button
            class="git-ai-btn" title="AI 生成提交信息"
            :disabled="aiCommitLoading || !stagedFiles.length"
            @click="doAiCommitMsg"
          >
            <el-icon v-if="aiCommitLoading" class="is-loading"><Loading /></el-icon>
            <el-icon v-else><MagicStick /></el-icon>
          </button>
          <el-dropdown trigger="click" placement="top-end" popper-class="git-ai-rule-dropdown" @command="onAiRuleChange">
            <button class="git-ai-arrow" title="生成规则"><el-icon><ArrowDown /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="r in AI_COMMIT_RULES" :key="r.value" :command="r.value"
                  :class="{ 'is-active': aiCommitRule === r.value }"
                >
                  <div class="git-rule-item">
                    <span class="git-rule-label">
                      {{ r.label }}
                      <el-icon v-if="aiCommitRule === r.value" class="git-rule-check"><Check /></el-icon>
                    </span>
                    <span class="git-rule-desc">{{ r.desc }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
      <label class="git-append">
        <el-checkbox v-model="appendMode" size="small" />
        <span>追加到上次提交（amend）</span>
      </label>
      <div class="git-commit-foot">
        <button class="git-commit-btn" :disabled="!draftText || !stagedFiles.length || busy" @click="doCommit">
          <el-icon><Check /></el-icon>&nbsp;提交
        </button>
        <button class="git-commit-btn ghost" :disabled="!draftText || !stagedFiles.length || busy" @click="doCommitAndPush">
          <el-icon><Upload /></el-icon>&nbsp;提交并推送…
        </button>
        <button class="git-commit-expand" :disabled="busy" title="打开提交弹窗（逐文件勾选、查看差异）" @click="openCommitDialog">
          <el-icon :size="13"><FullScreen /></el-icon>
        </button>
      </div>
    </section>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible" class="git-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop @contextmenu.prevent
      >
        <template v-for="(item, i) in contextMenu.items" :key="i">
          <div v-if="item.divided" class="git-context-divider" />
          <div class="git-context-item" :class="{ danger: item.danger }" @click="runMenuItem(item)">
            <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </div>
        </template>
      </div>
    </Teleport>

    <!-- Blame -->
    <el-dialog v-model="blameDialog.visible" :title="'追溯：' + blameDialog.file" width="720" append-to-body>
      <div class="git-blame-list">
        <div v-for="b in blameDialog.data" :key="b.line" class="git-blame-row">
          <span class="git-blame-hash">{{ b.hash }}</span>
          <span class="git-blame-author" :title="b.author">{{ b.author }}</span>
          <span class="git-blame-line">{{ b.line }}</span>
          <span class="git-blame-content">{{ b.content }}</span>
        </div>
      </div>
    </el-dialog>

    <!-- 提交弹窗：逐文件勾选 + AI 填充提交信息 -->
    <GitCommitDialog
      v-model="commitDialogOpen"
      :repo="activeRepo || repo"
      :repos="repoSummaries.map((r) => ({ path: r.path, name: r.name }))"
      @committed="onDialogCommitted"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Refresh, RefreshRight, RefreshLeft, Plus, Minus, Document, CopyDocument, Delete, Edit,
  PriceTag, Box, DArrowRight, Check, Search, MagicStick, ArrowDown, MoreFilled, Switch,
  Loading, Upload, Download, CaretRight, CaretBottom, View, Fold, Expand, FullScreen,
} from '@element-plus/icons-vue';
import { useGitStore, type GitNumstatEntry, type GitAheadBehind } from '../../stores/git';
import { useSettingsStore } from '../../stores/settings';
import { useCodeStore } from '../../stores/code';
import { usePlatformStore } from '../../stores/platform';
import { LlmClient } from '@yan-zhi/core';
import GitDiffViewer from './GitDiffViewer.vue';
import MarkdownPreview from '../code/MarkdownPreview.vue';
import GitCommitDialog from '../git/GitCommitDialog.vue';
import { computeGraphLayout, segmentPath, laneX } from '../git/graphLanes';
import { useGitAi, AI_COMMIT_RULES } from '../../composables/git/useGitAi';

const gitStore = useGitStore();
const settingsStore = useSettingsStore();
const codeStore = useCodeStore();
const platformStore = usePlatformStore();

const emit = defineEmits<{
  (e: 'aiReview', diff: string): void;
  (e: 'viewDiff', payload: { path: string; staged: boolean; repoPath?: string }): void;
}>();

interface ChangedFile { path: string; statusChar: string; statusClass: string; staged: boolean; added: number; deleted: number; }
interface MenuItem { label: string; handler: () => void; icon?: unknown; danger?: boolean; divided?: boolean; }
interface RepoSummary { path: string; name: string; branch: string; ahead: number; behind: number; changes: number; }

const STATUS_CLASS: Record<string, string> = { M: 'modified', A: 'added', D: 'deleted', '?': 'untracked', R: 'renamed', U: 'conflict' };
const UNMERGED_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

const workspace = computed(() => settingsStore.settings.workspaceDir || '');
const repo = ref('');
const activeRepo = ref('');
const activeKey = computed(() => activeRepo.value || repo.value);
const activeRepoName = computed(() => activeRepo.value.split(/[\\/]/).filter(Boolean).pop() || '仓库');

// 侧栏提交输入框（AI 生成与提交弹窗共用 useGitAi，规则持久化在 localStorage）
const { rule: aiCommitRule, loading: aiCommitLoading, customRule: aiCustomRule, setRule: setAiRule, setCustomRule, generateCommitMessage } = useGitAi();
const appendMode = ref(false);
const commitDraft = reactive<Record<string, string>>({});
const draftText = computed(() => (commitDraft[activeKey.value] || '').trim());

const busy = ref(false);
const gitLoading = ref(false);
const currentBranch = ref('');
const numstat = ref<GitNumstatEntry[]>([]);
const aheadBehind = ref<GitAheadBehind>({ ahead: 0, behind: 0 });
const remoteBranchesList = ref<string[]>([]);
const tagsList = ref<string[]>([]);
const stashList = ref<string[]>([]);
const graphEntries = ref<Array<{
  hash: string; parents: string[]; refs: string[]; subject: string;
  authorName: string; authorEmail: string; date: string;
}>>([]);
const repoSummaries = ref<RepoSummary[]>([]);

const filterText = ref('');
const showUntracked = ref(true);

const sections = reactive({ changes: true, repo: false, graph: false, review: false });
const subs = reactive({ branches: true, tags: false, stash: false });
const groups = reactive({ conflicts: true, staged: true, unstaged: true, untracked: true });

const selected = ref<string[]>([]);
const lastClicked = ref('');
const expandedCommit = ref('');
const commitFiles = ref<Array<{ status: string; path: string }>>([]);
const commitFilesLoading = ref(false);
const commitExpandedFile = ref('');
const commitFileDiff = ref('');
const commitFileDiffLoading = ref(false);

const reviewLoading = ref(false);
const reviewResult = ref('');

const contextMenu = ref<{ visible: boolean; x: number; y: number; items: MenuItem[] }>({ visible: false, x: 0, y: 0, items: [] });
const blameDialog = ref<{ visible: boolean; file: string; data: Array<{ hash: string; author: string; line: number; content: string }> }>({ visible: false, file: '', data: [] });

// ===== 派生数据 =====
const localBranches = computed(() => (gitStore.branches || []).filter((b) => !b.startsWith('remotes/') && !b.startsWith('origin/HEAD')));

const changedFiles = computed<ChangedFile[]>(() => {
  const st = gitStore.status as { files?: Array<{ path: string; working_dir: string; index: string }> } | null;
  if (!st?.files) return [];
  const numMap = new Map(numstat.value.map((n) => [n.path, n]));
  const out: ChangedFile[] = [];
  for (const f of st.files) {
    const idx = f.index || ' ';
    const wd = f.working_dir || ' ';
    const n = numMap.get(f.path);
    if (idx !== ' ') out.push({ path: f.path, statusChar: idx, statusClass: STATUS_CLASS[idx] || 'modified', staged: true, added: n?.added ?? 0, deleted: n?.deleted ?? 0 });
    if (wd !== ' ') out.push({ path: f.path, statusChar: wd, statusClass: STATUS_CLASS[wd] || 'modified', staged: false, added: n?.added ?? 0, deleted: n?.deleted ?? 0 });
  }
  return out;
});
const stagedFiles = computed(() => changedFiles.value.filter((f) => f.staged && f.statusChar !== '?'));
const unstagedFiles = computed(() => changedFiles.value.filter((f) => !f.staged && f.statusChar !== '?'));
const untrackedFiles = computed(() => changedFiles.value.filter((f) => f.statusChar === '?'));
const conflictFiles = computed<string[]>(() => {
  const st = gitStore.status as { files?: Array<{ path: string; working_dir: string; index: string }> } | null;
  if (!st?.files) return [];
  return st.files.filter((f) => UNMERGED_CODES.has((f.index || ' ') + (f.working_dir || ' '))).map((f) => f.path);
});
const logEntries = computed(() => {
  const lg = gitStore.log as { all?: Array<{ hash: string; date: string; message: string; author_name: string; author_email?: string }> } | null;
  return lg?.all || [];
});

// ===== 分支泳道图（图与提交列表合一：每行内嵌泳道单元，整行可点） =====
const GRAPH_ROW_H = 26;
const graphLayout = computed(() => computeGraphLayout(graphEntries.value));
const historyRows = computed(() => {
  const gl = graphLayout.value;
  return logEntries.value.map((c) => {
    const r = gl.rows.get(c.hash);
    return {
      ...c,
      graph: r && r.dot
        ? {
            width: gl.width,
            paths: r.segments.map((s) => ({ d: segmentPath(s, GRAPH_ROW_H, gl.laneWidth), color: s.color })),
            dot: { x: laneX(r.dot.x, gl.laneWidth), color: r.dot.color },
          }
        : null,
    };
  });
});

/** 按筛选词过滤文件行 */
function visible(list: ChangedFile[]): ChangedFile[] {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((f) => f.path.toLowerCase().includes(q));
}
const hasVisible = computed(
  () => visible(stagedFiles.value).length + visible(unstagedFiles.value).length + visible(untrackedFiles.value).length > 0,
);

function baseName(p: string): string { return p.split(/[\\/]/).pop() || p; }
function dirName(p: string): string {
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.length ? parts.join('/') : '';
}
function shortHash(hash: string): string { return hash.slice(0, 7); }
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime(); if (!t) return '';
  const diff = Date.now() - t; const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚'; if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}天前`;
  const mo = Math.floor(d / 30); return mo < 12 ? `${mo}个月前` : `${Math.floor(mo / 12)}年前`;
}
function formatDate(iso: string): string {
  const d = new Date(iso); if (!d.getTime()) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function commitFileStatusClass(status: string): string {
  const c = status[0];
  if (c === 'A') return 'added';
  if (c === 'D') return 'deleted';
  if (c === 'R') return 'renamed';
  return 'modified';
}

// ===== 选中 / 打开 =====
function isSelected(p: string): boolean { return selected.value.includes(p); }
function onFileClick(e: MouseEvent, f: ChangedFile) {
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    if (e.shiftKey && lastClicked.value) {
      const all = changedFiles.value.map((x) => x.path);
      const a = all.indexOf(lastClicked.value);
      const b = all.indexOf(f.path);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        selected.value = [...new Set([...selected.value, ...all.slice(lo, hi + 1)])];
        return;
      }
    }
    selected.value = selected.value.includes(f.path)
      ? selected.value.filter((p) => p !== f.path)
      : [...selected.value, f.path];
    lastClicked.value = f.path;
    return;
  }
  selected.value = [f.path];
  lastClicked.value = f.path;
  openDiff(f);
}
function openDiff(f: ChangedFile) {
  emit('viewDiff', { path: f.path, staged: f.staged, repoPath: activeRepo.value });
}
function openConflict(rel: string) {
  const base = activeRepo.value.replace(/[\\/]+$/, '');
  codeStore.openConflict(base + '/' + rel);
}

// ===== 数据加载 =====
async function loadRepoData(target?: string) {
  // 防御：target 可能为空（缓存恢复时 activeRepo 未回填），回落到工作目录根，仍为空则直接放弃
  const r = (target || activeRepo.value || repo.value || '').trim();
  if (!r) return;
  if (!activeRepo.value) activeRepo.value = r;
  await Promise.allSettled([
    gitStore.fetchStatus(r),
    gitStore.fetchBranches(r),
    gitStore.fetchLog(r),
  ]);
  const st = gitStore.status as { current?: string } | null;
  currentBranch.value = st?.current || currentBranch.value || '';
  const [numRes, abRes, remoteRes, tagRes, stashRes] = await Promise.allSettled([
    gitStore.fetchNumstat(r),
    gitStore.fetchAheadBehind(r, currentBranch.value || undefined),
    gitStore.remoteBranches(r),
    gitStore.tagList(r),
    gitStore.stashList(r),
  ]);
  numstat.value = numRes.status === 'fulfilled' ? numRes.value : [];
  aheadBehind.value = abRes.status === 'fulfilled' ? abRes.value : { ahead: 0, behind: 0 };
  remoteBranchesList.value = remoteRes.status === 'fulfilled' ? remoteRes.value : [];
  tagsList.value = tagRes.status === 'fulfilled' ? tagRes.value : [];
  stashList.value = stashRes.status === 'fulfilled' ? stashRes.value : [];
  try { graphEntries.value = await gitStore.graph(r, 50); } catch { graphEntries.value = []; }
}

async function loadSummaries() {
  if (!repo.value) { repoSummaries.value = []; return; }
  let list: Array<{ path: string; branch: string; ahead: number; behind: number }> = [];
  try { list = await gitStore.discoverAll(repo.value); } catch { list = []; }
  repoSummaries.value = await Promise.all(
    list.map(async (r) => {
      let changes = 0;
      try {
        await gitStore.fetchStatus(r.path);
        const st = gitStore.status as { files?: unknown[] } | null;
        changes = st?.files?.length ?? 0;
      } catch { changes = 0; }
      return {
        path: r.path,
        name: r.path.split(/[\\/]/).filter(Boolean).pop() || r.path,
        branch: r.branch,
        ahead: r.ahead,
        behind: r.behind,
        changes,
      };
    }),
  );
}

async function refreshAll(force = false) {
  if (!repo.value) return;
  busy.value = true;
  try {
    if (force || repoSummaries.value.length > 1) await loadSummaries();
    await loadRepoData(activeRepo.value || repo.value);
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    busy.value = false;
    gitLoading.value = false;
    void persist();
  }
}

async function switchRepo(p: string) {
  if (p === activeRepo.value) return;
  activeRepo.value = p;
  selected.value = [];
  expandedCommit.value = '';
  gitLoading.value = true;
  await loadRepoData(p);
  gitLoading.value = false;
  void persist();
}

// ===== 缓存（后端落在仓库内 .yan-zhi/git-cache.json）=====
function snapshot() {
  return {
    activeRepo: activeRepo.value,
    status: gitStore.status,
    log: gitStore.log,
    branches: gitStore.branches,
    currentBranch: currentBranch.value,
    numstat: numstat.value,
    aheadBehind: aheadBehind.value,
    remoteBranches: remoteBranchesList.value,
    tags: tagsList.value,
    stash: stashList.value,
    graph: graphEntries.value,
    repoSummaries: repoSummaries.value,
  };
}
function applySnapshot(data: Record<string, unknown>) {
  const g = gitStore;
  if (data.status) g.status = data.status as typeof g.status;
  if (data.log) g.log = data.log as typeof g.log;
  if (Array.isArray(data.branches)) g.branches = data.branches as string[];
  if (typeof data.currentBranch === 'string') currentBranch.value = data.currentBranch;
  if (Array.isArray(data.numstat)) numstat.value = data.numstat as GitNumstatEntry[];
  if (data.aheadBehind && typeof data.aheadBehind === 'object') aheadBehind.value = data.aheadBehind as GitAheadBehind;
  if (Array.isArray(data.remoteBranches)) remoteBranchesList.value = data.remoteBranches as string[];
  if (Array.isArray(data.tags)) tagsList.value = data.tags as string[];
  if (Array.isArray(data.stash)) stashList.value = data.stash as string[];
  if (Array.isArray(data.graph)) graphEntries.value = data.graph as typeof graphEntries.value;
  if (Array.isArray(data.repoSummaries)) repoSummaries.value = data.repoSummaries as RepoSummary[];
}
function applyUi(ui: Record<string, unknown>) {
  if (ui.sections && typeof ui.sections === 'object') Object.assign(sections, ui.sections);
  if (ui.subs && typeof ui.subs === 'object') Object.assign(subs, ui.subs);
  if (ui.groups && typeof ui.groups === 'object') Object.assign(groups, ui.groups);
  if (ui.commitDraft && typeof ui.commitDraft === 'object') {
    for (const [k, v] of Object.entries(ui.commitDraft as Record<string, unknown>)) {
      if (typeof v === 'string') commitDraft[k] = v;
    }
  }
  if (typeof ui.activeRepo === 'string' && ui.activeRepo) activeRepo.value = ui.activeRepo;
}
let persistTimer: ReturnType<typeof setTimeout> | null = null;
async function persist() {
  if (!repo.value) return;
  const data = snapshot();
  const ui = {
    sections: { ...sections },
    subs: { ...subs },
    groups: { ...groups },
    commitDraft: { ...commitDraft },
    activeRepo: activeRepo.value,
  };
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    const res = await gitStore.writeRepoCache(repo.value, data, ui);
    if ('error' in res) await gitStore.clearRepoCache(repo.value);
  }, 400);
}

async function init(force = false) {
  if (!repo.value) return;
  gitLoading.value = true;
  try {
    await gitStore.checkCapability();
    if (!gitStore.supported) { gitLoading.value = false; return; }

    const cached = !force ? await gitStore.readRepoCache(repo.value) : null;
    if (cached) {
      applyUi((cached.ui as Record<string, unknown>) || {});
      applySnapshot((cached.data as Record<string, unknown>) || {});
      // 缓存里没有 activeRepo 时回落到工作目录根，避免后续 refreshAll 以空路径请求
      if (!activeRepo.value) activeRepo.value = repo.value;
      gitLoading.value = false;
      void refreshAll(false);
      return;
    }
    await loadSummaries();
    if (!activeRepo.value) {
      activeRepo.value = repoSummaries.value.length === 1
        ? repoSummaries.value[0].path
        : (repoSummaries.value[0]?.path || repo.value);
    }
    await loadRepoData(activeRepo.value);
  } catch {
    /* 工作目录非 git 仓库时忽略 */
  } finally {
    gitLoading.value = false;
    void persist();
  }
}
defineExpose({ init });

// ===== 交互 =====
function toggleSection(name: keyof typeof sections) { sections[name] = !sections[name]; void persist(); }
function toggleSub(name: keyof typeof subs) { subs[name] = !subs[name]; void persist(); }
function toggleGroup(name: keyof typeof groups) { groups[name] = !groups[name]; void persist(); }

/** 分组是否全部展开（用于工具条折叠/展开图标） */
const allExpanded = computed(
  () => groups.conflicts && groups.staged && groups.unstaged && groups.untracked,
);
function toggleAllGroups() {
  const next = !allExpanded.value;
  groups.conflicts = next;
  groups.staged = next;
  groups.unstaged = next;
  groups.untracked = next;
  void persist();
}

function openContextMenu(e: MouseEvent, items: MenuItem[]) {
  contextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 200),
    y: Math.min(e.clientY, window.innerHeight - items.length * 32 - 12),
    items,
  };
}
function closeContextMenu() { contextMenu.value.visible = false; }
function runMenuItem(item: MenuItem) { closeContextMenu(); item.handler(); }

function onFileContextMenu(e: MouseEvent, f: ChangedFile) {
  if (!isSelected(f.path)) { selected.value = [f.path]; lastClicked.value = f.path; }
  const multi = selected.value.length > 1;
  const items: MenuItem[] = [
    { label: '打开差异', icon: Document, handler: () => openDiff(f) },
    { label: f.staged ? '取消暂存' : '暂存', icon: f.staged ? Minus : Plus, handler: () => toggleStage(f) },
  ];
  if (multi) {
    items.push({ label: `暂存选中 (${selected.value.length})`, icon: Plus, divided: true, handler: batchStage });
    items.push({ label: `取消暂存选中 (${selected.value.length})`, icon: Minus, handler: batchUnstage });
    items.push({ label: `放弃选中更改 (${selected.value.length})`, icon: RefreshLeft, danger: true, divided: true, handler: batchRestore });
  } else {
    items.push({ label: '放弃更改', icon: RefreshLeft, danger: true, handler: () => doRestoreFile(f.path) });
    items.push({ label: '追溯 Blame', icon: Search, divided: true, handler: () => doBlame(f.path) });
  }
  items.push({ label: '复制路径', icon: CopyDocument, handler: () => copyText(f.path) });
  openContextMenu(e, items);
}
function onBranchContextMenu(e: MouseEvent, b: string) {
  const isCurrent = b === currentBranch.value;
  const items: MenuItem[] = [];
  if (!isCurrent) items.push({ label: '切换 Checkout', icon: Switch, handler: () => checkoutBranch(b) });
  items.push({ label: '拉取 Pull', icon: Download, divided: !isCurrent, handler: () => doPullTo(b) });
  items.push({ label: '推送 Push', icon: Upload, handler: () => doPushTo(b) });
  if (!isCurrent) {
    items.push({ label: '合并到当前', icon: DArrowRight, divided: true, handler: () => doMergeBranch(b) });
    items.push({ label: '变基到此分支', icon: DArrowRight, handler: () => doRebase(b) });
    items.push({ label: '重命名…', icon: Edit, divided: true, handler: () => doRenameBranch(b) });
    items.push({ label: '删除', icon: Delete, danger: true, handler: () => doDeleteBranch(b) });
  }
  openContextMenu(e, items);
}
function onTagContextMenu(e: MouseEvent, t: string) {
  openContextMenu(e, [{ label: '删除标签', icon: Delete, danger: true, handler: () => doTagDelete(t) }]);
}
function onCommitContextMenu(e: MouseEvent, c: { hash: string }) {
  openContextMenu(e, [
    { label: '复制哈希', icon: CopyDocument, handler: () => copyText(c.hash) },
    { label: '撤销提交 Revert', icon: RefreshLeft, divided: true, handler: () => doRevert(c.hash) },
    { label: '挑选 Cherry-pick', icon: DArrowRight, handler: () => doCherryPick(c.hash) },
    { label: '重置到此 Soft', icon: RefreshLeft, handler: () => doReset('soft', c.hash) },
    { label: '重置到此 Mixed', icon: RefreshLeft, handler: () => doReset('mixed', c.hash) },
    { label: '重置到此 Hard', icon: Delete, danger: true, handler: () => doReset('hard', c.hash) },
    { label: '创建标签…', icon: PriceTag, divided: true, handler: () => doTagCreate(c.hash) },
  ]);
}
function copyText(text: string) {
  navigator.clipboard?.writeText(text).then(() => ElMessage.success('已复制')).catch(() => {});
}

function onBranchCommand(cmd: string) {
  if (cmd === '__new') { void doCreateBranch(); return; }
  if (cmd.startsWith('co:')) void checkoutBranch(cmd.slice(3));
}
async function onMoreCommand(cmd: string) {
  switch (cmd) {
    case 'pull': return doPull();
    case 'push': return doPush();
    case 'fetch': return doFetch();
    case 'merge': return doMergePrompt();
    case 'rebase': return doRebasePrompt();
    case 'abortMerge': return doAbortMerge();
    case 'stash': return doStashSave();
    case 'stashPop': return doStashPop(0);
    case 'tag': return doTagCreate();
  }
}

// ===== 变更操作 =====
async function toggleStage(f: ChangedFile) {
  const res = f.staged
    ? await gitStore.unstageFiles(activeRepo.value, [f.path])
    : await gitStore.stageFiles(activeRepo.value, [f.path]);
  if ('error' in res) ElMessage.error(res.error);
  await refreshAll();
}
async function stageAll() {
  const paths = [...unstagedFiles.value, ...untrackedFiles.value].map((f) => f.path);
  if (!paths.length) return;
  const res = await gitStore.stageFiles(activeRepo.value, paths);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success(`已暂存 ${paths.length} 个文件`);
  await refreshAll();
}
async function unstageAll() {
  const paths = stagedFiles.value.map((f) => f.path);
  if (!paths.length) return;
  const res = await gitStore.unstageFiles(activeRepo.value, paths);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success(`已取消暂存 ${paths.length} 个文件`);
  await refreshAll();
}
async function restoreAll() {
  const paths = unstagedFiles.value.map((f) => f.path);
  if (!paths.length) return;
  try {
    await ElMessageBox.confirm(`放弃 ${paths.length} 个文件的未暂存更改？此操作不可撤销。`, '放弃更改', { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '取消' });
  } catch { return; }
  for (const p of paths) await gitStore.restore(activeRepo.value, [p]);
  ElMessage.success(`已放弃 ${paths.length} 个文件更改`);
  await refreshAll();
}
async function batchStage() {
  const paths = selected.value.filter((p) => !stagedFiles.value.some((f) => f.path === p));
  if (!paths.length) { ElMessage.info('选中的文件已全部暂存'); return; }
  const res = await gitStore.stageFiles(activeRepo.value, paths);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success(`已暂存 ${paths.length} 个文件`);
  selected.value = [];
  await refreshAll();
}
async function batchUnstage() {
  const paths = selected.value.filter((p) => stagedFiles.value.some((f) => f.path === p));
  if (!paths.length) { ElMessage.info('选中的文件均未暂存'); return; }
  const res = await gitStore.unstageFiles(activeRepo.value, paths);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success(`已取消暂存 ${paths.length} 个文件`);
  selected.value = [];
  await refreshAll();
}
async function batchRestore() {
  const paths = [...selected.value];
  try {
    await ElMessageBox.confirm(`放弃 ${paths.length} 个文件的更改？此操作不可撤销。`, '放弃更改', { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '取消' });
  } catch { return; }
  for (const p of paths) await gitStore.restore(activeRepo.value, [p]);
  ElMessage.success(`已放弃 ${paths.length} 个文件更改`);
  selected.value = [];
  await refreshAll();
}
async function doRestoreFile(filePath: string) {
  try {
    await ElMessageBox.confirm(`放弃 ${filePath} 的未提交更改？此操作不可逆。`, '放弃更改', { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '取消' });
  } catch { return; }
  const res = await gitStore.restore(activeRepo.value, [filePath]);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已恢复');
  await refreshAll();
}
// ===== 分支 / 远程 =====
async function checkoutBranch(b: string) {
  if (b === currentBranch.value) return;
  if (changedFiles.value.length) {
    try {
      await ElMessageBox.confirm(
        `当前有 ${changedFiles.value.length} 处未提交的更改，切换分支可能导致更改丢失。是否仍要切换到「${b}」？`,
        '确认切换分支', { confirmButtonText: '切换', cancelButtonText: '取消', type: 'warning' },
      );
    } catch { return; }
  }
  try { await gitStore.checkout(activeRepo.value, b); ElMessage.success('已切换到 ' + b); await refreshAll(); }
  catch (e) { ElMessage.error((e as Error).message); }
}
async function doCreateBranch() {
  try {
    const { value } = await ElMessageBox.prompt('新分支名称', '新建分支', {
      confirmButtonText: '创建', cancelButtonText: '取消',
      inputPattern: /^[A-Za-z0-9._/-]+$/, inputErrorMessage: '分支名只能包含字母、数字、点、下划线、斜杠、连字符',
    });
    if (!value?.trim()) return;
    await gitStore.createBranch(activeRepo.value, value.trim());
    ElMessage.success('已创建并切换到分支 ' + value.trim());
    await refreshAll();
  } catch { /* cancel */ }
}
async function doRenameBranch(oldName: string) {
  let newName = '';
  try {
    const { value } = await ElMessageBox.prompt(`重命名分支 ${oldName} 为`, '重命名', {
      confirmButtonText: '重命名', cancelButtonText: '取消',
      inputPattern: /^[A-Za-z0-9._/-]+$/, inputErrorMessage: '分支名不合法',
    });
    newName = (value || '').trim();
  } catch { return; }
  if (!newName) return;
  const res = await gitStore.renameBranch(activeRepo.value, oldName, newName);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已重命名');
  await refreshAll();
}
async function doDeleteBranch(name: string) {
  try {
    await ElMessageBox.confirm(`删除分支 ${name}？`, '删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const res = await gitStore.deleteBranch(activeRepo.value, name);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已删除');
  await refreshAll();
}
async function doPull() {
  const res = await gitStore.pull(activeRepo.value, currentBranch.value);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已拉取');
  await refreshAll();
}
async function doPullTo(branch: string) {
  const res = await gitStore.pull(activeRepo.value, branch);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已拉取 ' + branch);
  await refreshAll();
}
async function doPush() {
  const res = await gitStore.push(activeRepo.value, currentBranch.value);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已推送');
  await refreshAll();
}
async function doPushTo(branch: string) {
  const res = await gitStore.push(activeRepo.value, branch);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已推送 ' + branch);
  await refreshAll();
}
async function doFetch() {
  const res = await gitStore.fetch(activeRepo.value);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已抓取');
  await refreshAll();
}
async function doSync() {
  busy.value = true;
  try {
    const pull = await gitStore.pull(activeRepo.value, currentBranch.value);
    if ('error' in pull) { ElMessage.error(pull.error); return; }
    if (aheadBehind.value.ahead > 0) {
      const push = await gitStore.push(activeRepo.value, currentBranch.value);
      if ('error' in push) { ElMessage.error(push.error); return; }
      ElMessage.success('已同步（拉取并推送）');
    } else {
      ElMessage.success('已同步（拉取）');
    }
    await refreshAll();
  } finally { busy.value = false; }
}
async function doMergePrompt() {
  let branch = '';
  try {
    const { value } = await ElMessageBox.prompt('要合并进当前分支的分支名', '合并分支', {
      confirmButtonText: '合并', cancelButtonText: '取消',
      inputPattern: /^[A-Za-z0-9._/-]+$/, inputErrorMessage: '分支名不合法',
    });
    branch = (value || '').trim();
  } catch { return; }
  if (branch) await doMergeBranch(branch);
}
async function doMergeBranch(branch: string) {
  const res = await gitStore.mergeBranch(activeRepo.value, branch);
  if ('error' in res) { ElMessage.error(res.error); await refreshAll(); return; }
  if (res.data.ok) ElMessage.success(`已合并 ${branch}`);
  else ElMessage.warning(`合并产生 ${res.data.conflicts.length} 个冲突`);
  await refreshAll();
}
async function doAbortMerge() {
  try {
    await ElMessageBox.confirm('中止当前合并？', '中止合并', { confirmButtonText: '中止', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const res = await gitStore.abortMerge(activeRepo.value);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已中止');
  await refreshAll();
}
async function doRebasePrompt() {
  let branch = '';
  try {
    const { value } = await ElMessageBox.prompt('变基到目标分支', '变基', {
      confirmButtonText: '变基', cancelButtonText: '取消',
      inputPattern: /^[A-Za-z0-9._/-]+$/, inputErrorMessage: '分支名不合法',
    });
    branch = (value || '').trim();
  } catch { return; }
  if (branch) await doRebase(branch);
}
async function doRebase(branch: string) {
  const res = await gitStore.rebase(activeRepo.value, branch);
  if ('error' in res) {
    ElMessage.error(res.error);
    try {
      await ElMessageBox.confirm('变基失败，是否中止？', '变基冲突', { confirmButtonText: '中止', cancelButtonText: '手动处理' });
      await gitStore.rebaseAbort(activeRepo.value);
      ElMessage.success('已中止');
      await refreshAll();
    } catch { /* 手动处理 */ }
    return;
  }
  ElMessage.success('已变基到 ' + branch);
  await refreshAll();
}
async function doRevert(commit: string) {
  try {
    await ElMessageBox.confirm(`撤销提交 ${shortHash(commit)}？`, '撤销', { confirmButtonText: '撤销', cancelButtonText: '取消' });
  } catch { return; }
  const res = await gitStore.revert(activeRepo.value, commit);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已撤销');
  await refreshAll();
}
async function doReset(mode: 'soft' | 'mixed' | 'hard', target: string) {
  try {
    await ElMessageBox.confirm(
      `重置到 ${shortHash(target)}（${mode}）？${mode === 'hard' ? ' ⚠️ 会丢失未提交更改！' : ''}`,
      '重置', { confirmButtonText: '重置', cancelButtonText: '取消', type: mode === 'hard' ? 'warning' : 'info' },
    );
  } catch { return; }
  const res = await gitStore.reset(activeRepo.value, mode, target);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已重置');
  await refreshAll();
}
async function doCherryPick(commit: string) {
  try {
    await ElMessageBox.confirm(`挑选提交 ${shortHash(commit)}？`, 'Cherry-pick', { confirmButtonText: '挑选', cancelButtonText: '取消' });
  } catch { return; }
  const res = await gitStore.cherryPick(activeRepo.value, commit);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已挑选');
  await refreshAll();
}

// ===== 标签 / 储藏 / blame =====
async function doTagCreate(ref?: string) {
  let name = '';
  let message = '';
  try {
    const r = await ElMessageBox.prompt('标签名称', '创建标签', {
      confirmButtonText: '创建', cancelButtonText: '取消',
      inputPattern: /^[A-Za-z0-9._/-]+$/, inputErrorMessage: '标签名不合法',
    });
    name = (r.value || '').trim();
    if (!name) return;
    const m = await ElMessageBox.prompt('标签说明（可选）', '说明', { confirmButtonText: '确定', cancelButtonText: '跳过' });
    message = (m.value || '').trim();
  } catch { return; }
  const res = await gitStore.tagCreate(activeRepo.value, name, message || undefined);
  void ref;
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已创建标签 ' + name);
  await refreshAll();
}
async function doTagDelete(name: string) {
  try {
    await ElMessageBox.confirm(`删除标签 ${name}？`, '删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const res = await gitStore.tagDelete(activeRepo.value, name);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已删除');
  await refreshAll();
}
async function doStashSave() {
  let message = '';
  try {
    const { value } = await ElMessageBox.prompt('储藏说明（可选）', '储藏改动', { confirmButtonText: '储藏', cancelButtonText: '取消' });
    message = (value || '').trim();
  } catch { return; }
  const res = await gitStore.stashSave(activeRepo.value, message || undefined);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已储藏');
  await refreshAll();
}
async function doStashPop(index: number) {
  const res = await gitStore.stashPop(activeRepo.value, index);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已弹出');
  await refreshAll();
}
async function doStashApply(index: number) {
  const res = await gitStore.stashApply(activeRepo.value, index);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已应用');
  await refreshAll();
}
async function doStashDrop(index: number) {
  try {
    await ElMessageBox.confirm(`删除储藏 [${index}]？`, '删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const res = await gitStore.stashDrop(activeRepo.value, index);
  if ('error' in res) ElMessage.error(res.error); else ElMessage.success('已删除');
  await refreshAll();
}
async function doBlame(file: string) {
  try { blameDialog.value = { visible: true, file, data: await gitStore.blame(activeRepo.value, file) }; }
  catch (e) { ElMessage.error((e as Error).message); }
}

// ===== 提交历史 =====
function toggleCommit(hash: string) {
  if (expandedCommit.value === hash) {
    expandedCommit.value = ''; commitFiles.value = []; commitExpandedFile.value = ''; return;
  }
  expandedCommit.value = hash; commitExpandedFile.value = ''; commitFiles.value = []; commitFilesLoading.value = true;
  gitStore.diffTree(activeRepo.value, hash)
    .then((f) => { commitFiles.value = f; })
    .catch(() => { commitFiles.value = []; })
    .finally(() => { commitFilesLoading.value = false; });
}
async function toggleCommitFile(commit: string, file: string) {
  if (commitExpandedFile.value === file) { commitExpandedFile.value = ''; return; }
  commitExpandedFile.value = file; commitFileDiffLoading.value = true;
  try { commitFileDiff.value = await gitStore.commitDiff(activeRepo.value, commit, file); }
  catch { commitFileDiff.value = ''; }
  finally { commitFileDiffLoading.value = false; }
}

// ===== AI =====
async function resolveAiPlatform() {
  if (platformStore.platforms.length === 0) await platformStore.loadPlatforms();
  if (platformStore.models.length === 0) await platformStore.loadModels();
  const pid = settingsStore.settings.defaultPlatformId;
  const mid = settingsStore.settings.defaultModelId;
  const platform = platformStore.platforms.find((p) => p.id === pid);
  const model = platform ? platformStore.resolveModel(mid, pid) : null;
  if (platform && model) return { platform, model };
  const llm = platformStore.models.find((m) => m.type === 'llm' && m.isDefault)
    || platformStore.models.find((m) => m.type === 'llm');
  const fp = llm && platformStore.platforms.find((p) => p.id === llm.platformId);
  if (!llm || !fp) throw new Error('未配置可用的 AI 模型，请先在设置中配置模型平台');
  return { platform: fp, model: llm };
}
/** 在弹窗中提交（逐文件勾选 + AI 填充） */
const commitDialogOpen = ref(false);
function openCommitDialog() {
  commitDialogOpen.value = true;
}
async function onDialogCommitted() {
  commitDialogOpen.value = false;
  await refreshAll(true);
}

// ===== 提交（侧栏输入框：Ctrl+Enter 提交 / Ctrl+Shift+Enter 提交并推送；放大进弹窗逐文件勾选） =====
async function doCommit() {
  const msg = draftText.value;
  if (!msg) return;
  busy.value = true;
  try {
    if (appendMode.value) {
      const res = await gitStore.commitAmend(activeRepo.value, msg);
      if ('error' in res) { ElMessage.error(res.error); return; }
      ElMessage.success('已追加到上次提交');
    } else {
      const res = await gitStore.commit(activeRepo.value, msg);
      if ('error' in res) { ElMessage.error(res.error); return; }
      ElMessage.success('已提交');
    }
    commitDraft[activeKey.value] = '';
    appendMode.value = false;
    await refreshAll();
  } finally {
    busy.value = false;
  }
}

/** 提交并推送（IDEA "Commit and Push..."） */
async function doCommitAndPush() {
  const msg = draftText.value;
  if (!msg) return;
  busy.value = true;
  try {
    const res = await gitStore.commit(activeRepo.value, msg);
    if ('error' in res) { ElMessage.error(res.error); return; }
    commitDraft[activeKey.value] = '';
    const pushRes = await gitStore.push(activeRepo.value, currentBranch.value);
    if ('error' in pushRes) {
      ElMessage.warning(`已提交，但推送失败：${pushRes.error}`);
    } else {
      ElMessage.success('已提交并推送');
    }
    await refreshAll();
  } finally {
    busy.value = false;
  }
}

async function doAiCommitMsg() {
  if (!stagedFiles.value.length) return;
  aiCommitLoading.value = true;
  try {
    const diff = await gitStore.diff(activeRepo.value, { staged: true });
    if (!diff) { ElMessage.warning('无暂存内容'); return; }
    commitDraft[activeKey.value] = await generateCommitMessage(diff);
    ElMessage.success('已生成提交信息');
    void persist();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { aiCommitLoading.value = false; }
}

async function onAiRuleChange(rule: string) {
  if (rule === 'custom') {
    try {
      const { value } = await ElMessageBox.prompt('输入自定义提交信息生成规则', '自定义规则', {
        confirmButtonText: '保存', cancelButtonText: '取消',
        inputValue: aiCustomRule.value,
        inputPlaceholder: '例如：使用中文，格式为【类型】描述，类型包括新增/修复/优化/文档',
      });
      setCustomRule(value || '');
    } catch { return; }
  }
  setAiRule(rule);
}

async function doAiReview() {
  if (!changedFiles.value.length) return;
  reviewLoading.value = true; reviewResult.value = '';
  try {
    const diff = await gitStore.diff(activeRepo.value);
    if (!diff) { ElMessage.warning('无变更内容'); return; }
    emit('aiReview', diff);
    const { platform, model } = await resolveAiPlatform();
    const client = new LlmClient(platform, model);
    const resp = await client.chat([
      { role: 'system', content: '你是代码审查助手。对以下 git diff 进行代码审查，指出潜在问题、改进建议和良好实践。用中文回复，使用 markdown 格式。' },
      { role: 'user', content: `以下是当前变更的 git diff，请进行代码审查：\n\n${diff}` },
    ] as any, { temperature: 0.3, maxTokens: 2048 });
    reviewResult.value = (resp.delta?.content || '').trim() || 'AI 返回空内容';
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { reviewLoading.value = false; }
}

// ===== 多仓库批量 =====
async function doBatchPull() {
  const res = await gitStore.batchPull(repoSummaries.value.map((r) => r.path));
  if ('error' in res) { ElMessage.error(res.error); return; }
  const failed = (res as { data: Array<{ ok: boolean }> }).data.filter((r) => !r.ok).length;
  if (failed) ElMessage.warning(`拉取完成，${failed} 个失败`); else ElMessage.success('全部拉取成功');
  await refreshAll(true);
}
async function doBatchPush() {
  const res = await gitStore.batchPush(repoSummaries.value.map((r) => r.path));
  if ('error' in res) { ElMessage.error(res.error); return; }
  const failed = (res as { data: Array<{ ok: boolean }> }).data.filter((r) => !r.ok).length;
  if (failed) ElMessage.warning(`推送完成，${failed} 个失败`); else ElMessage.success('全部推送成功');
  await refreshAll(true);
}
async function doBatchCheckoutPrompt() {
  let branch = '';
  try {
    const { value } = await ElMessageBox.prompt('所有仓库统一切换到的分支名', '批量切换分支', {
      confirmButtonText: '切换', cancelButtonText: '取消',
    });
    branch = (value || '').trim();
  } catch { return; }
  if (!branch) return;
  const res = await gitStore.batchCheckout(repoSummaries.value.map((r) => r.path), branch);
  if ('error' in res) { ElMessage.error(res.error); return; }
  const failed = (res as { data: Array<{ ok: boolean }> }).data.filter((r) => !r.ok).length;
  if (failed) ElMessage.warning(`切换完成，${failed} 个失败`); else ElMessage.success('全部切换成功');
  await refreshAll(true);
}

// ===== 生命周期 =====
watch(workspace, (v) => {
  repo.value = v || '';
  activeRepo.value = '';
  if (repo.value) void init();
}, { immediate: true });

function onDocClick() { closeContextMenu(); }
onMounted(() => { document.addEventListener('click', onDocClick); });
onUnmounted(() => { document.removeEventListener('click', onDocClick); });
</script>

<style scoped>
.git-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; font-size: 13px; }

/* ===== 顶栏 ===== */
.git-top { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--color-border, rgba(15,23,42,0.08)); }
.git-top-spacer { flex: 1; }
.git-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 150px; padding: 3px 6px; border: 1px solid transparent; border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px; color: var(--color-text, #333); }
.git-chip:hover { background: var(--color-surface-hover, rgba(15,23,42,0.06)); }
.git-chip-ico { font-size: 13px; color: var(--color-primary); flex-shrink: 0; }
.git-chip-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: "JetBrains Mono", monospace; }
.git-chip-caret { font-size: 10px; color: var(--color-text-secondary, #888); flex-shrink: 0; }
.git-chip-repo .git-chip-text { font-family: inherit; font-weight: 600; max-width: 90px; }
.git-sync { font-size: 11px; font-weight: 700; padding: 0 3px; }
.git-sync-down { color: #3b82f6; }
.git-sync-up { color: #10b981; }
.git-top-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: 4px; background: transparent; cursor: pointer; color: var(--color-text-secondary, #666); flex-shrink: 0; }
.git-top-btn:hover { background: var(--color-surface-hover, rgba(15,23,42,0.08)); color: var(--color-text, #333); }
.git-top-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.git-progress { height: 2px; background: linear-gradient(90deg, transparent, var(--color-primary), transparent); opacity: 0.6; animation: git-slide 1.1s linear infinite; }
@keyframes git-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

/* ===== 变更工具条（IDEA Commit 工具窗图标排） ===== */
.git-toolbar { display: flex; align-items: center; gap: 2px; padding: 3px 6px; border-bottom: 1px solid var(--color-border, rgba(15,23,42,0.06)); }
.git-tb-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; border-radius: 4px; background: transparent; cursor: pointer; color: var(--color-text-secondary, #666); font-size: 13px; flex-shrink: 0; }
.git-tb-btn:hover:not(:disabled) { background: var(--color-surface-hover, rgba(15,23,42,0.08)); color: var(--color-text, #333); }
.git-tb-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.git-tb-btn.danger:hover:not(:disabled) { color: #ef4444; }

/* ===== 提交区（输入框常驻列表下方；放大进弹窗） ===== */
.git-commit { flex-shrink: 0; padding: 8px; border-top: 1px solid var(--color-border, rgba(15,23,42,0.1)); }
.git-commit-input-wrap { position: relative; }
.git-ai-overlay { position: absolute; top: 3px; right: 3px; display: flex; align-items: center; border-radius: 4px; overflow: hidden; border: 1px solid var(--color-border, rgba(15,23,42,0.1)); background: var(--color-surface, #fff); }
.git-ai-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 24px; border: none; background: transparent; cursor: pointer; color: var(--color-primary); }
.git-ai-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
.git-ai-btn:disabled { color: var(--color-text-tertiary, #bbb); cursor: not-allowed; }
.git-ai-arrow { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 24px; border: none; border-left: 1px solid var(--color-border, rgba(15,23,42,0.1)); background: transparent; cursor: pointer; color: var(--color-text-secondary, #888); font-size: 10px; }
.git-ai-arrow:hover { background: var(--color-surface-hover, rgba(15,23,42,0.05)); }
.git-append { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 11px; color: var(--color-text-secondary, #888); cursor: pointer; user-select: none; }
.git-commit-foot { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.git-commit-btn { display: inline-flex; align-items: center; justify-content: center; flex: 1; padding: 5px 12px; border: 1px solid var(--color-primary); border-radius: 4px; cursor: pointer; background: var(--color-primary); color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; }
.git-commit-btn:hover:not(:disabled) { opacity: 0.9; }
.git-commit-btn:disabled { background: var(--color-border, rgba(15,23,42,0.12)); border-color: transparent; color: var(--color-text-tertiary, #aaa); cursor: not-allowed; }
.git-commit-btn.ghost { background: transparent; color: var(--color-primary); }
.git-commit-btn.ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.git-commit-btn.ghost:disabled { background: transparent; border-color: var(--color-border, rgba(15,23,42,0.12)); color: var(--color-text-tertiary, #aaa); }
.git-commit-expand { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 30px; height: 28px; border: 1px solid var(--color-border, rgba(15,23,42,0.12)); border-radius: 4px; background: transparent; cursor: pointer; color: var(--color-text-secondary, #888); }
.git-commit-expand:hover:not(:disabled) { color: var(--color-primary); border-color: var(--color-primary); }
.git-commit-expand:disabled { opacity: 0.4; cursor: not-allowed; }

/* ===== 筛选（固定） ===== */
.git-filter { padding: 6px 8px; border-bottom: 1px solid var(--color-border, rgba(15,23,42,0.06)); }

/* ===== 列表区（独立滚动） ===== */
.git-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.git-skeleton { height: 14px; margin: 8px 10px; border-radius: 4px; background: linear-gradient(90deg, rgba(15,23,42,0.06), rgba(15,23,42,0.12), rgba(15,23,42,0.06)); animation: git-pulse 1.2s ease-in-out infinite; }
@keyframes git-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

.git-section { border-bottom: 1px solid var(--color-border, rgba(15,23,42,0.06)); }
.git-section-header { display: flex; align-items: center; gap: 4px; padding: 6px 8px; cursor: pointer; font-weight: 600; user-select: none; }
.git-section-header:hover { background: var(--color-surface-hover, rgba(15,23,42,0.05)); }
.git-arrow { font-size: 12px; color: var(--color-text-secondary, #888); flex-shrink: 0; }
.git-section-title { flex-shrink: 0; }
.git-badge { font-style: normal; font-size: 10px; font-weight: 700; min-width: 16px; text-align: center; border-radius: 8px; padding: 0 5px; line-height: 15px; background: var(--color-border, rgba(15,23,42,0.1)); color: var(--color-text-secondary, #666); }
.git-section-body { padding-bottom: 4px; }

/* ===== 分组 ===== */
.git-group + .git-group { margin-top: 2px; }
.git-group-header { display: flex; align-items: center; gap: 4px; padding: 4px 8px 2px 12px; cursor: pointer; font-size: 11px; font-weight: 700; color: var(--color-text-secondary, #777); text-transform: uppercase; user-select: none; }
.git-group-header:hover { background: var(--color-surface-hover, rgba(15,23,42,0.04)); }
.git-group-header.is-conflict { color: #ef4444; }
.git-group-title { flex-shrink: 0; }
.git-group-btn { margin-left: auto; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; border-radius: 3px; background: transparent; cursor: pointer; color: var(--color-text-secondary, #888); font-size: 12px; }
.git-group-btn + .git-group-btn { margin-left: 2px; }
.git-group-btn:hover { background: var(--color-surface-hover, rgba(15,23,42,0.1)); color: var(--color-text, #333); }
.git-group-btn.danger:hover { color: #ef4444; }

/* ===== 文件行 ===== */
.git-file-row { display: flex; align-items: center; gap: 6px; padding: 2px 8px 2px 22px; cursor: pointer; min-height: 22px; }
.git-file-row:hover { background: var(--color-surface-hover, rgba(15,23,42,0.05)); }
.git-file-row.selected { background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
.git-file-row.is-conflict { background: color-mix(in srgb, #ef4444 6%, transparent); }
.git-file-name { flex-shrink: 0; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.git-file-dir { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--color-text-tertiary, #999); }
.git-num { font-size: 11px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.git-num-add { color: #10b981; }
.git-num-del { color: #ef4444; }
.git-file-hint { margin-left: auto; font-size: 11px; color: var(--color-primary); font-weight: 600; }
.git-row-actions { display: flex; gap: 2px; flex-shrink: 0; margin-left: auto; opacity: 0; transition: opacity 0.12s; }
.git-file-row:hover .git-row-actions { opacity: 1; }
.git-row-actions button { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; border-radius: 3px; background: transparent; cursor: pointer; color: var(--color-text-secondary, #888); font-size: 12px; }
.git-row-actions button:hover { background: var(--color-border, rgba(15,23,42,0.12)); color: var(--color-text, #333); }
.git-row-actions button.danger:hover { color: #ef4444; }
.git-status-badge { display: inline-block; width: 14px; text-align: center; font-size: 11px; font-weight: 700; color: var(--color-text-tertiary, #aaa); flex-shrink: 0; }
.git-status-badge.modified { color: #f59e0b; }
.git-status-badge.added { color: #10b981; }
.git-status-badge.deleted { color: #ef4444; }
.git-status-badge.untracked { color: #94a3b8; }
.git-status-badge.conflict { color: #ef4444; }
.git-status-badge.renamed { color: #8b5cf6; }
.git-empty-inline { padding: 8px 12px; font-size: 12px; color: var(--color-text-tertiary, #999); }

/* ===== 储存库 ===== */
.git-sub { margin: 0 4px; }
.git-sub-header { display: flex; align-items: center; gap: 4px; padding: 3px 6px; cursor: pointer; font-size: 12px; border-radius: 4px; user-select: none; }
.git-sub-header:hover { background: var(--color-surface-hover, rgba(15,23,42,0.05)); }
.git-sub-title { flex: 1; }
.git-sub-body { padding: 2px 0 4px 18px; }
.git-branch-item { display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
.git-branch-item:hover { background: var(--color-surface-hover, rgba(15,23,42,0.06)); }
.git-branch-item.current { color: var(--color-primary); font-weight: 600; }
.git-branch-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.git-branch-check { font-size: 12px; color: var(--color-primary); flex-shrink: 0; }
.git-tag-item { display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
.git-tag-item:hover { background: var(--color-surface-hover, rgba(15,23,42,0.06)); }
.git-tag-text { font-family: "JetBrains Mono", monospace; }
.git-stash-item { display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.git-stash-item:hover { background: var(--color-surface-hover, rgba(15,23,42,0.06)); }
.git-stash-idx { font-family: "JetBrains Mono", monospace; font-weight: 700; color: var(--color-primary); flex-shrink: 0; }
.git-stash-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.git-stash-actions { display: flex; gap: 2px; flex-shrink: 0; }
.git-stash-actions button { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; border-radius: 3px; background: transparent; cursor: pointer; color: var(--color-text-secondary, #888); font-size: 12px; }
.git-stash-actions button:hover { background: var(--color-border, rgba(15,23,42,0.12)); }
.git-stash-actions button.danger:hover { color: #ef4444; }

/* ===== 历史（分支泳道图内嵌每行，与列表合一） ===== */
.git-history-row { padding: 5px 10px; cursor: pointer; border-bottom: 1px solid rgba(15,23,42,0.04); }
.git-history-row:hover { background: var(--color-surface-hover, rgba(15,23,42,0.05)); }
.git-history-row.expanded { background: var(--color-surface-hover, rgba(15,23,42,0.05)); }
.git-history-main { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.git-history-graph { flex-shrink: 0; align-self: center; display: block; }
.git-graph-dot { stroke: var(--color-bg, #fff); stroke-width: 1; }
.git-history-hash { font-family: "JetBrains Mono", monospace; color: var(--color-primary); flex-shrink: 0; }
.git-history-msg { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.git-history-meta { color: var(--color-text-secondary, #888); font-size: 11px; flex-shrink: 0; }
.git-history-detail { margin-top: 6px; padding: 6px 8px; border-radius: 6px; background: var(--color-bg-subtle, rgba(15,23,42,0.04)); font-size: 12px; color: var(--color-text-secondary, #666); }
.git-history-full { white-space: pre-wrap; color: var(--color-text, #333); margin-bottom: 4px; }
.git-history-meta-line { margin-top: 2px; }
.git-history-files { margin-top: 6px; }
.git-history-files-label { font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
.git-history-file-row { display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.git-history-file-row:hover { background: var(--color-surface-hover, rgba(15,23,42,0.06)); }
.git-history-file-row.active { background: var(--color-border, rgba(15,23,42,0.1)); }
.git-history-file-diff { margin-top: 6px; }

/* ===== 审查 / 批量 ===== */
.git-review { padding: 8px 10px; }
.git-review-btn { display: inline-flex; align-items: center; padding: 5px 12px; border: 1px solid var(--color-primary); border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px; color: var(--color-primary); }
.git-review-btn:hover { background: var(--color-primary); color: #fff; }
.git-review-btn:disabled { border-color: var(--color-text-tertiary, #ccc); color: var(--color-text-tertiary, #bbb); cursor: not-allowed; }
.git-review-btn:disabled:hover { background: transparent; color: var(--color-text-tertiary, #bbb); }
.git-review-result { margin-top: 8px; max-height: 300px; overflow: auto; background: var(--color-bg-subtle, rgba(15,23,42,0.04)); border-radius: 6px; padding: 8px; font-size: 13px; line-height: 1.6; }
.git-batch { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--color-border, rgba(15,23,42,0.06)); }
.git-batch-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid var(--color-border, rgba(15,23,42,0.14)); border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px; color: var(--color-text, #333); }
.git-batch-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.git-batch-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== 右键菜单 / blame ===== */
.git-context-menu { position: fixed; z-index: 9999; min-width: 170px; background: var(--color-surface, #fff); border: 1px solid var(--color-border, rgba(15,23,42,0.12)); border-radius: 6px; padding: 4px 0; box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
.git-context-item { display: flex; align-items: center; gap: 8px; padding: 6px 14px; cursor: pointer; color: var(--color-text, #333); }
.git-context-item:hover { background: var(--color-surface-hover, rgba(15,23,42,0.06)); }
.git-context-item.danger { color: #ef4444; }
.git-context-item.danger:hover { background: color-mix(in srgb, #ef4444 8%, transparent); }
.git-context-divider { height: 1px; margin: 4px 0; background: var(--color-border, rgba(15,23,42,0.08)); }
.git-blame-list { max-height: 60vh; overflow-y: auto; font-family: "JetBrains Mono", monospace; font-size: 12px; }
.git-blame-row { display: flex; align-items: baseline; gap: 8px; padding: 2px 0; border-bottom: 1px solid rgba(15,23,42,0.03); }
.git-blame-hash { color: var(--color-primary); flex-shrink: 0; width: 60px; }
.git-blame-author { color: var(--color-text-secondary, #888); flex-shrink: 0; width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.git-blame-line { color: var(--color-text-tertiary, #bbb); flex-shrink: 0; width: 40px; text-align: right; }
.git-blame-content { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

<!-- 非 scoped：el-dropdown 菜单 teleport 到 body -->
<style>
.git-popper.el-popper { min-width: 200px !important; }
.git-popper .el-dropdown-menu__item { display: flex; align-items: center; gap: 6px; height: 28px; line-height: 28px; padding: 0 12px !important; }
.git-popper .el-dropdown-menu__item.is-on { color: var(--color-primary, #c2410c); font-weight: 600; }
.git-menu-spacer { display: inline-block; width: 12px; flex-shrink: 0; }
.git-menu-title { padding: 4px 12px 2px; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--color-text-secondary, #999); }
.git-menu-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.git-menu-badge { font-style: normal; font-size: 10px; font-weight: 700; border-radius: 8px; padding: 0 5px; background: rgba(15,23,42,0.1); color: var(--color-text-secondary, #666); }

/* AI 提交信息生成规则下拉（双行菜单项） */
.git-ai-rule-dropdown.el-popper { min-width: 260px !important; width: auto !important; }
.git-ai-rule-dropdown .el-dropdown-menu__item { height: auto !important; line-height: 1.5 !important; padding: 8px 16px !important; margin: 0 0 2px !important; border-radius: 6px !important; }
.git-rule-item { display: flex; flex-direction: column; gap: 3px; min-width: 220px; }
.git-rule-label { font-size: 13px; font-weight: 500; display: flex; align-items: center; line-height: 1.4; }
.git-rule-desc { font-size: 11px; color: var(--color-text-secondary, #888); line-height: 1.4; white-space: normal; }
.git-rule-check { margin-left: 4px; font-size: 12px; color: var(--color-primary, #c2410c); }
.git-ai-rule-dropdown .el-dropdown-menu__item.is-active .git-rule-label { color: var(--color-primary, #c2410c); font-weight: 600; }
</style>
