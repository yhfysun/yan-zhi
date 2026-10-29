<!--
  ClipPanel.vue —— 超级剪贴板面板(2026-10-29,P0)

  这是**独立透明置顶小窗**里的唯一页面(route /clip-panel,bare)。
  主进程 main.cjs 用 childUrl('/clip-panel') 加载,窗口 456×624(含 12px 内边距,
  圆角与投影画在窗口内部 —— 透明窗会裁掉窗口外的阴影)。

  ★ 数据全部在主进程(JSON + 图片资产):这里只经 electronAPI.clipboardPanel 读写,
    渲染层不碰文件系统,也不再起一套本地状态。
  ★ 交互对齐原型 docs/prototypes/clipboard-proto.html:
    搜索 / 类型 Tab / 置顶区 / 1-9 快速粘贴 / ↑↓ Enter / Tab 切类目 / Esc 关闭 /
    横纵布局 / 右键菜单 / 拖出 / 底部状态栏。
  ★ 失焦收起由主进程做(拖拽时暂缓,见 dragstart/dragend)。
-->
<template>
  <div class="clip-root" :class="{ 'is-grid': layout === 'grid' }">
    <section class="cp-shell">
      <!-- 头部:品牌行是窗口拖动区(-webkit-app-region: drag),按钮必须 no-drag -->
      <header class="cp-head">
        <div class="cp-brand">
          <span class="cp-logo">言</span>
          <span class="cp-title">超级剪贴板</span>
          <span class="cp-hk" :title="`全局快捷键 ${hotkeyLabel}，可在 设置 → 快捷键 修改`">{{ hotkeyLabel }}</span>
          <span class="cp-spacer"></span>
          <button class="cp-icon" :class="{ on: selecting }" title="多选（选中后可交给 AI 合并整理）" @click="toggleSelecting">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/></svg>
          </button>
          <button class="cp-icon" :class="{ on: layout === 'grid' }" title="切换横向/纵向布局" @click="toggleLayout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
          </button>
          <button class="cp-icon" title="关闭(Esc)" @click="hidePanel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="cp-search" :class="{ focus: searchFocused }">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref="searchEl"
            v-model="query"
            placeholder="搜索剪贴板内容…（按 / 聚焦）"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
            @keydown.enter.prevent="pasteSelected"
            @keydown.esc.stop.prevent="onSearchEsc"
          />
          <span class="cp-esc">Esc</span>
        </div>

        <div class="cp-tabs">
          <button
            v-for="t in TABS"
            :key="t.key"
            class="cp-tab"
            :class="{ on: tab === t.key }"
            @click="setTab(t.key)"
          >
            {{ t.label }}<span v-if="t.key !== 'pin' && countOf(t.key) > 0" class="cp-tab-n">{{ countOf(t.key) }}</span>
          </button>
        </div>
      </header>

      <!-- 列表 -->
      <div ref="listEl" class="cp-list">
        <template v-if="filtered.length">
          <template v-for="(it, idx) in filtered" :key="it.id">
            <div v-if="showPinHeader(idx)" class="cp-sec">📌 置顶</div>
            <div v-if="showRecentHeader(idx)" class="cp-sec">最近</div>
            <div
              class="cp-item"
              :class="{ sel: idx === selIndex, picked: selecting && selected.has(it.id) }"
              draggable="true"
              @click="onItemClick(it)"
              @contextmenu.prevent="openMenu($event, it)"
              @dragstart="onDragStart($event, it)"
              @dragend="onDragEnd"
            >
              <span v-if="selecting" class="cp-check" :class="{ on: selected.has(it.id) }">
                <svg v-if="selected.has(it.id)" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 13 4 4L19 7"/></svg>
              </span>
              <span v-else class="cp-num" :class="{ hot: idx === selIndex }">{{ idx < 9 ? idx + 1 : '' }}</span>

              <span class="cp-kind" :class="'k-' + it.kind">
                <span v-if="it.kind === 'color'" class="cp-swatch" :style="{ background: it.text }"></span>
                <span v-else-if="it.kind === 'image'" class="cp-thumb">
                  <img v-if="it.thumb" :src="it.thumb" alt="" />
                </span>
                <svg v-else-if="it.kind === 'link'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>
                <svg v-else-if="it.kind === 'file'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                <span v-else-if="it.kind === 'code'">&lt;/&gt;</span>
                <span v-else-if="it.kind === 'json'">{ }</span>
                <span v-else>文</span>
              </span>

              <div class="cp-body">
                <div class="cp-line1" :class="{ mono: it.kind === 'code' || it.kind === 'json' }">
                  <span v-if="chipOf(it)" class="cp-chip" :class="'c-' + it.kind">{{ chipOf(it) }}</span>
                  <template v-if="it.kind === 'image' || it.kind === 'file'">{{ fileNameOf(it) }}</template>
                  <template v-else>{{ firstLineOf(it) }}</template>
                </div>
                <div class="cp-line2">
                  <span v-if="it.pinned" class="cp-pinflag">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-1.4 1.4-1.4-.4-3.9 3.9.5 4.2-1.4 1.4-3.6-3.6L5 21l-2-2 5.7-5.8L5.1 9.6l1.4-1.4 4.2.5 3.9-3.9-.4-1.4z"/></svg>
                  </span>
                  <span>{{ kindLabel(it.kind) }}</span>
                  <i class="dot"></i>
                  <span>{{ timeAgo(it.createdAt) }}</span>
                  <template v-if="metaOf(it)">
                    <i class="dot"></i>
                    <span>{{ metaOf(it) }}</span>
                  </template>
                  <span v-if="it.groupId && groupNameOf(it.groupId)" class="cp-badge g" :title="`分组：${groupNameOf(it.groupId)}`">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    {{ groupNameOf(it.groupId) }}
                  </span>
                  <span v-for="t in (it.tags || [])" :key="t" class="cp-badge">#{{ t }}</span>
                  <span v-if="it.hotkey" class="cp-badge hk" :title="`单条快捷键：${prettyAccel(it.hotkey)}（按下即复制并粘贴）`">{{ prettyAccel(it.hotkey) }}</span>
                </div>
              </div>

              <div class="cp-acts">
                <button class="cp-act" data-act="pin" :class="{ pin: it.pinned }" :title="it.pinned ? '取消置顶' : '置顶'" @click.stop="togglePin(it)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-1.4 1.4-1.4-.4-3.9 3.9.5 4.2-1.4 1.4-3.6-3.6L5 21l-2-2 5.7-5.8L5.1 9.6l1.4-1.4 4.2.5 3.9-3.9-.4-1.4z"/></svg>
                </button>
                <button class="cp-act" data-act="copy" title="复制（Enter 粘贴）" @click.stop="pasteItem(it)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button v-if="canAi(it)" class="cp-act ai" data-act="ai" title="交给 AI 处理（翻译 / 总结 / 润色…）" @click.stop="openAiMenu($event, it)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-4.6 3.6L16.4 18 12 14.9 7.6 18l1.5-5.4L4.5 9l5.6-1.4z"/></svg>
                </button>
                <button class="cp-act" data-act="more" title="更多操作" @click.stop="openMenu($event, it)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
                </button>
              </div>
            </div>
          </template>
        </template>
        <div v-else class="cp-empty">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 15h5"/></svg>
          <div v-if="!api">此面板需在桌面端使用</div>
          <div v-else-if="query">没有匹配「{{ query }}」的记录</div>
          <div v-else>还没有记录<br />复制点东西试试（本应用开着就会自动采集）</div>
        </div>
      </div>

      <!-- 底部状态栏 / 多选操作条 -->
      <footer v-if="!selecting" class="cp-foot">
        <button class="cp-foot-btn cp-foot-group" :class="{ on: !!groupFilter }" title="按分组筛选（条目右键可归组）" @click.stop="openGroupMenu">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          {{ groupFilterLabel || '分组' }}
        </button>
        <span class="cp-foot-hint"><b>1-9</b> 快贴 · <b>/</b> 搜索</span>
        <span class="cp-spacer"></span>
        <span class="cp-foot-stats">{{ items.length }} 条 · {{ fmtBytes(stats.bytes) }}</span>
        <button class="cp-foot-btn" :class="{ danger: clearArmed }" @click="clearAll">{{ clearArmed ? '确认清空?' : '清空' }}</button>
      </footer>
      <footer v-else class="cp-selectbar">
        <span>已选 <b>{{ selected.size }}</b> 条</span>
        <span class="cp-spacer"></span>
        <button class="cp-sel-btn primary" :disabled="selected.size < 2" @click="aiMerge">AI 合并整理</button>
        <button class="cp-sel-btn" :disabled="!selected.size" @click="sendBatch">发送到会话</button>
        <button class="cp-sel-btn ghost" @click="toggleSelecting">取消</button>
      </footer>
    </section>

    <!-- 提示(粘贴后先给反馈再收面板,避免"点了没反应"的错觉) -->
    <transition name="cp-fade">
      <div v-if="toast" class="cp-toast">{{ toast }}</div>
    </transition>

    <!-- 右键菜单 -->
    <div v-if="menu.show" class="cp-ctx" :class="{ 'flip-ai': menu.flipAi }" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
      <div class="cp-ctx-title">{{ menu.title }}</div>
      <button class="cp-ctx-item" @click="pasteItem(menu.item, true)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>复制</span><span class="cp-ctx-key">Enter</span>
      </button>
      <button v-if="canPlain(menu.item)" class="cp-ctx-item" @click="pastePlain(menu.item)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
        <span>粘贴为纯文本</span>
      </button>

      <!-- AI 处理(2026-10-29):翻译/总结/润色/解释/表格,交给当前会话执行 -->
      <template v-if="canAi(menu.item)">
        <div class="cp-ctx-sep"></div>
        <div class="cp-ctx-aiwrap" @mouseenter="aiOpen = true" @mouseleave="aiOpen = false">
          <button class="cp-ctx-item" :class="{ 'ai-on': aiOpen }" @click="aiOpen = !aiOpen">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-4.6 3.6L16.4 18 12 14.9 7.6 18l1.5-5.4L4.5 9l5.6-1.4z"/></svg>
            <span>AI 处理<span class="cp-ai-badge">言智</span></span>
            <span class="cp-ctx-arrow">›</span>
          </button>
          <div v-show="aiOpen" class="cp-ctx-sub">
            <button v-for="a in AI_ACTIONS" :key="a.key" class="cp-ctx-item cp-ctx-subitem" @click="runAi(a.key)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-4.6 3.6L16.4 18 12 14.9 7.6 18l1.5-5.4L4.5 9l5.6-1.4z"/></svg>
              <span>{{ a.label }}</span>
            </button>
          </div>
        </div>
      </template>

      <!-- 分组 / 标签 / 单条快捷键（2026-10-29,P2）
           面板只有 456 宽，分组子菜单沿用 AI 子菜单的内联展开，不做飞出 -->
      <div class="cp-ctx-sep"></div>
      <div class="cp-ctx-aiwrap" @mouseenter="groupOpen = true" @mouseleave="groupOpen = false">
        <button class="cp-ctx-item" :class="{ 'ai-on': groupOpen }" @click="groupOpen = !groupOpen">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span>在分组中<span v-if="menu.item?.groupId && groupNameOf(menu.item.groupId)" class="cp-gbadge">{{ groupNameOf(menu.item.groupId) }}</span></span>
          <span class="cp-ctx-arrow">›</span>
        </button>
        <div v-show="groupOpen" class="cp-ctx-sub">
          <button v-if="menu.item?.groupId" class="cp-ctx-item cp-ctx-subitem" @click="assignGroup(null)">
            <span>移出分组</span>
          </button>
          <button
            v-for="g in groups"
            :key="g.id"
            class="cp-ctx-item cp-ctx-subitem"
            :class="{ 'g-on': menu.item?.groupId === g.id }"
            @click="assignGroup(g.id)"
          >
            <span>{{ g.name }}</span><span class="cp-ctx-key">{{ g.count }}</span>
          </button>
          <div v-if="!groups.length" class="cp-ctx-subempty">还没有分组</div>
          <button class="cp-ctx-item cp-ctx-subitem" @click="openGroupCreate(false, menu.item?.id || '')">
            <span>＋ 新建分组…</span>
          </button>
        </div>
      </div>
      <button class="cp-ctx-item" @click="openTagEditor(menu.item)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg>
        <span>标签…</span>
        <span class="cp-ctx-key">{{ (menu.item?.tags || []).length || '' }}</span>
      </button>
      <button class="cp-ctx-item" @click="openHotkeyEditor(menu.item)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>
        <span>单条快捷键…</span>
        <span class="cp-ctx-key">{{ prettyAccel(menu.item?.hotkey) || '未设置' }}</span>
      </button>

      <div class="cp-ctx-sep"></div>
      <button class="cp-ctx-item" @click="menuPin(menu.item)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-1.4 1.4-1.4-.4-3.9 3.9.5 4.2-1.4 1.4-3.6-3.6L5 21l-2-2 5.7-5.8L5.1 9.6l1.4-1.4 4.2.5 3.9-3.9-.4-1.4z"/></svg>
        <span>{{ menu.item?.pinned ? '取消置顶' : '置顶' }}</span>
      </button>
      <button v-if="hasFile(menu.item)" class="cp-ctx-item" @click="revealItem(menu.item)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>在文件夹中显示</span>
      </button>
      <div class="cp-ctx-sep"></div>
      <button class="cp-ctx-item danger" @click="removeItem(menu.item)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        <span>删除</span>
      </button>
    </div>

    <!-- 分组筛选浮层（锚在底栏「分组」上方；位置由 CSS 固定，不跟随点击点） -->
    <div v-if="groupMenu.show" class="cp-gmenu" @click.stop>
      <div class="cp-gmenu-head">按分组筛选</div>
      <button class="cp-ctx-item" :class="{ on: !groupFilter }" @click="setGroupFilter('')">
        <span>全部条目</span><span class="cp-ctx-key">{{ items.length }}</span>
      </button>
      <button class="cp-ctx-item" :class="{ on: groupFilter === '__none' }" @click="setGroupFilter('__none')">
        <span>未分组</span><span class="cp-ctx-key">{{ ungrouped }}</span>
      </button>
      <div class="cp-ctx-sep"></div>
      <div v-for="g in groups" :key="g.id" class="cp-grow" :class="{ on: groupFilter === g.id }">
        <button class="cp-ctx-item cp-gname" @click="setGroupFilter(g.id)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span class="cp-gname-t">{{ g.name }}</span><span class="cp-ctx-key">{{ g.count }}</span>
        </button>
        <button class="cp-gact" title="重命名分组" @click.stop="openGroupRename(g)">✎</button>
        <button class="cp-gact danger" title="删除分组（条目保留）" @click.stop="removeGroup(g)">×</button>
      </div>
      <div v-if="!groups.length" class="cp-gempty">还没有分组，可以先建一个，如「工作话术」</div>
      <div class="cp-ctx-sep"></div>
      <button class="cp-ctx-item" @click="openGroupCreate(true)"><span>＋ 新建分组…</span></button>
    </div>

    <!-- 通用对话框：新建/重命名分组 · 标签编辑 · 快捷键录制 -->
    <div v-if="dialog.mode" class="cp-mask" @mousedown.self="closeDialog">
      <div class="cp-modal">
        <div class="cp-modal-head">{{ dialogTitle }}</div>

        <template v-if="dialog.mode === 'group-create' || dialog.mode === 'group-rename'">
          <input
            ref="dialogInput"
            v-model="dialog.value"
            class="cp-modal-input"
            maxlength="24"
            placeholder="分组名称，如：工作话术"
            @keydown.enter.stop.prevent="submitGroup"
            @keydown.esc.stop.prevent="closeDialog"
          />
        </template>

        <template v-else-if="dialog.mode === 'tags'">
          <div class="cp-tagbox">
            <span v-for="(t, i) in dialog.tags" :key="t" class="cp-tagchip">
              #{{ t }}<button class="cp-tagx" @click="removeTag(i)">×</button>
            </span>
            <input
              ref="dialogInput"
              v-model="dialog.tagInput"
              class="cp-tag-input"
              maxlength="60"
              placeholder="添加标签…"
              @keydown.enter.stop.prevent="addTags"
              @keydown.esc.stop.prevent="closeDialog"
            />
          </div>
          <div class="cp-modal-tip">最多 8 个标签，每个 ≤ 20 字；标签会进入搜索。</div>
        </template>

        <template v-else-if="dialog.mode === 'hotkey'">
          <input
            ref="dialogInput"
            class="cp-modal-input cp-hkcap"
            :value="prettyAccel(dialog.hotkey)"
            placeholder="按下组合键…"
            readonly
            @keydown.stop.prevent="onHotkeyKey"
          />
          <div class="cp-modal-tip">全局生效：按下后把这条写回剪贴板并粘贴到当前应用。与截图 / 急停 / 召唤键冲突时会提示。</div>
        </template>

        <div v-if="dialog.error" class="cp-modal-err">{{ dialog.error }}</div>

        <div class="cp-modal-actions">
          <button v-if="dialog.mode === 'hotkey' && dialog.hotkey" class="cp-sel-btn ghost" @click="clearItemHotkey">清除</button>
          <span class="cp-spacer"></span>
          <button class="cp-sel-btn" @click="closeDialog">取消</button>
          <button v-if="dialog.mode !== 'hotkey'" class="cp-sel-btn primary" @click="dialog.mode === 'tags' ? saveTags() : submitGroup()">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

/**
 * 主进程里的历史条目结构(见 main.cjs captureClipboardOnce)。
 * image 的完整图落盘在 imageFile,列表只带 320px 缩略图(thumb,dataURL)。
 * groupId / tags / hotkey 由 P2(分组与标签 + 单条快捷键)写入,同存 clipboard-history.json。
 */
interface ClipItem {
  id: string;
  kind: 'text' | 'link' | 'code' | 'json' | 'color' | 'image' | 'file';
  text: string;
  html?: string;
  files?: string[];
  imageFile?: string;
  thumb?: string;
  width?: number;
  height?: number;
  size?: number;
  createdAt: number;
  pinned?: boolean;
  groupId?: string;
  tags?: string[];
  hotkey?: string;
}

interface ClipGroup { id: string; name: string; count: number }

const api: any = (typeof window !== 'undefined' && (window as any).electronAPI?.clipboardPanel) || null;

const items = ref<ClipItem[]>([]);
const stats = ref<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
const query = ref('');
const tab = ref<'all' | 'text' | 'link' | 'image' | 'file' | 'pin'>('all');
const layout = ref<'list' | 'grid'>('list');
const selIndex = ref(0);
const toast = ref('');
const clearArmed = ref(false);
const searchFocused = ref(false);
const searchEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文本' },
  { key: 'link', label: '链接' },
  { key: 'image', label: '图片' },
  { key: 'file', label: '文件' },
  { key: 'pin', label: '置顶' },
] as const;

// AI 处理动作（与主进程 CLIP_AI_ACTIONS 的 key 一一对应；label 只用于展示）
const AI_ACTIONS = [
  { key: 'translate_en', label: '翻译成英文' },
  { key: 'translate_zh', label: '翻译成中文' },
  { key: 'summarize', label: '总结要点' },
  { key: 'polish', label: '润色改写' },
  { key: 'explain', label: '解释这段代码' },
  { key: 'table', label: '提取为表格' },
] as const;
const aiOpen = ref(false);
const hotkeyLabel = ref('Ctrl+Alt+V');
// 多选(2026-10-29):勾选多条 → AI 合并整理 / 发送到会话
const selecting = ref(false);
const selected = ref<Set<string>>(new Set());

/* ===== 分组 / 标签 / 单条快捷键(2026-10-29,P2) ===== */
const groups = ref<ClipGroup[]>([]);
const ungrouped = ref(0);
/** '' = 全部;'__none' = 未分组;其它 = 分组 id。与类型 Tab 是「与」关系 */
const groupFilter = ref('');
const groupMenu = reactive({ show: false });
const groupOpen = ref(false);   // 右键菜单里的「分组 ›」子菜单
const dialog = reactive<{
  mode: '' | 'group-create' | 'group-rename' | 'tags' | 'hotkey';
  item: ClipItem | null;
  groupId: string;        // rename 时的目标分组
  pendingItemId: string;  // 从条目菜单新建分组时,创建后自动归入
  fromMenu: boolean;      // 从底栏「分组」新建 → 建成后直接切到该分组
  value: string;
  tags: string[];
  tagInput: string;
  hotkey: string;
  error: string;
}>({
  mode: '', item: null, groupId: '', pendingItemId: '', fromMenu: false,
  value: '', tags: [], tagInput: '', hotkey: '', error: '',
});
const dialogInput = ref<HTMLInputElement | null>(null);

const groupNameOf = (id?: string) => groups.value.find((g) => g.id === id)?.name || '';
const groupFilterLabel = computed(() => {
  if (!groupFilter.value) return '';
  return groupFilter.value === '__none' ? '未分组' : groupNameOf(groupFilter.value);
});

/* ===== 数据 ===== */
async function load() {
  if (!api) return;
  const r = await api.list().catch(() => null);
  if (!r || r.ok === false) return;
  items.value = Array.isArray(r.items) ? r.items : [];
  stats.value = r.stats || { count: items.value.length, bytes: 0 };
  groups.value = Array.isArray(r.groups) ? r.groups : [];
  ungrouped.value = Number(r.ungrouped) || 0;
  // 筛选中的分组被删掉(或被改名后的 id 已不存在) → 回到全部,避免面板空着像坏了
  if (groupFilter.value && groupFilter.value !== '__none' && !groups.value.some((g) => g.id === groupFilter.value)) {
    groupFilter.value = '';
  }
  // 面板被重新召唤时,选中项回到第一条(键盘路径可预期)
  selIndex.value = 0;
}

const filtered = computed(() => {
  let list = items.value.slice();
  if (tab.value === 'pin') list = list.filter((i) => i.pinned);
  else if (tab.value === 'link') list = list.filter((i) => i.kind === 'link');
  else if (tab.value === 'image') list = list.filter((i) => i.kind === 'image');
  else if (tab.value === 'file') list = list.filter((i) => i.kind === 'file');
  else if (tab.value === 'text') list = list.filter((i) => ['text', 'code', 'json', 'color'].includes(i.kind));
  // 分组筛选:与类型 Tab 是「与」关系(先按分组收窄,再按类型)
  if (groupFilter.value === '__none') {
    list = list.filter((i) => !i.groupId || !groups.value.some((g) => g.id === i.groupId));
  } else if (groupFilter.value) {
    list = list.filter((i) => i.groupId === groupFilter.value);
  }
  const q = query.value.trim().toLowerCase();
  if (q) list = list.filter((i) => searchText(i).includes(q));
  // 置顶在前,其余保持主进程给的"最近优先"顺序
  const pin = list.filter((i) => i.pinned);
  const rest = list.filter((i) => !i.pinned);
  return [...pin, ...rest];
});

function searchText(it: ClipItem): string {
  return [it.text, fileNameOf(it), domainOf(it), kindLabel(it.kind), groupNameOf(it.groupId), ...(it.tags || [])]
    .join(' ')
    .toLowerCase();
}

function countOf(key: string): number {
  if (key === 'all') return items.value.length;
  if (key === 'pin') return items.value.filter((i) => i.pinned).length;
  if (key === 'text') return items.value.filter((i) => ['text', 'code', 'json', 'color'].includes(i.kind)).length;
  return items.value.filter((i) => i.kind === key).length;
}

/* ===== 展示辅助 ===== */
const KIND_LABEL: Record<string, string> = { text: '文本', code: '代码', json: 'JSON', link: '链接', image: '图片', file: '文件', color: '颜色' };
const KIND_CHIP: Record<string, string> = { code: '代码', json: 'JSON', link: '链接', color: '颜色' };

function kindLabel(k: string) { return KIND_LABEL[k] || '文本'; }
function chipOf(it: ClipItem) { return KIND_CHIP[it.kind] || ''; }

function baseName(p: string) { return String(p || '').split(/[\\/]/).pop() || ''; }
function fileNameOf(it: ClipItem) {
  if (it.kind === 'file' && it.files?.length) return it.files.length > 1 ? `${baseName(it.files[0])} 等 ${it.files.length} 个文件` : baseName(it.files[0]);
  if (it.kind === 'image') return baseName(it.imageFile || '') || '剪贴板图片.png';
  return '';
}
function domainOf(it: ClipItem) {
  if (it.kind !== 'link') return '';
  try { return new URL(it.text.trim()).hostname; } catch { return ''; }
}
function firstLineOf(it: ClipItem) {
  const t = String(it.text || '');
  return t.length > 240 ? t.slice(0, 240) + '…' : t;
}
function metaOf(it: ClipItem): string {
  if (it.kind === 'image') return [it.width && it.height ? `${it.width}×${it.height}` : '', fmtBytes(it.size || 0)].filter(Boolean).join(' · ');
  if (it.kind === 'file') return fmtBytes(it.size || 0);
  if (it.kind === 'link') return domainOf(it);
  const n = String(it.text || '').length;
  return n ? `${n} 字` : '';
}
function fmtBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
/** 全局键的展示形式:Control+Alt+V → Ctrl + Alt + V(与设置页一致) */
function prettyAccel(accel?: string): string {
  return accel ? accel.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ') : '';
}
function timeAgo(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (x: number) => String(x).padStart(2, '0');
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const y = new Date(now.getTime() - 86400_000);
  if (d.toDateString() === y.toDateString()) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function showPinHeader(idx: number): boolean {
  return tab.value === 'all' && !query.value.trim() && idx === 0 && !!filtered.value[0]?.pinned;
}
function showRecentHeader(idx: number): boolean {
  if (tab.value !== 'all' || query.value.trim()) return false;
  const firstUnpinned = filtered.value.findIndex((i) => !i.pinned);
  return firstUnpinned > 0 && idx === firstUnpinned;
}
function hasFile(it?: ClipItem | null): boolean {
  return !!it && (it.kind === 'image' || (it.kind === 'file' && !!it.files?.length));
}
function canPlain(it?: ClipItem | null): boolean {
  return !!it && it.kind !== 'image' && it.kind !== 'file';
}
/** 只有文本类条目能交给 AI（图片/文件没有可处理文本） */
function canAi(it?: ClipItem | null): boolean {
  return !!it && ['text', 'code', 'json', 'link', 'color'].includes(it.kind) && !!String(it.text || '').trim();
}

/* ===== 操作 ===== */
function showToast(msg: string) {
  toast.value = msg;
  window.clearTimeout((showToast as any)._t);
  (showToast as any)._t = window.setTimeout(() => { toast.value = ''; }, 1600);
}
function hidePanel() {
  // 收起面板即退出多选态:下次呼唤是"找东西粘贴"的场景,不该还带着上次的勾选
  selecting.value = false;
  selected.value = new Set();
  groupMenu.show = false;
  closeMenu();
  if (dialog.mode) closeDialog();
  api?.hide?.();
}

async function pasteItem(it: ClipItem | null, fromMenu = false) {
  if (!api || !it) return;
  if (fromMenu) menu.show = false;
  const r = await api.paste(it.id).catch(() => null);
  if (!r || r.ok === false) { showToast(r?.error || '复制失败'); return; }
  showToast(it.kind === 'file' ? '已复制文件，去粘贴吧' : it.kind === 'image' ? '已复制图片，Ctrl+V 粘贴' : '已复制，Ctrl+V 粘贴到目标应用');
  window.setTimeout(() => hidePanel(), 420);
}

async function pastePlain(it: ClipItem | null) {
  if (!api || !it) return;
  menu.show = false;
  const r = await api?.plain(it.id).catch(() => null);
  if (!r || r.ok === false) { showToast('复制失败'); return; }
  showToast('已复制纯文本');
  window.setTimeout(() => hidePanel(), 420);
}

async function togglePin(it: ClipItem) {
  const r = await api?.pin(it.id).catch(() => null);
  if (!r || r.ok === false) { showToast('置顶失败'); return; }
  await load();
}

async function removeItem(it: ClipItem | null) {
  if (!api || !it) return;
  menu.show = false;
  const r = await api?.remove(it.id).catch(() => null);
  if (!r || r.ok === false) { showToast('删除失败'); return; }
  await load();
  showToast('已删除');
}

async function revealItem(it: ClipItem | null) {
  if (!api || !it) return;
  menu.show = false;
  await nextTick();
  const r = await api?.reveal(it.id).catch(() => null);
  if (!r || r.ok === false) showToast(r?.error || '无法定位文件');
}

/* ===== 分组 / 标签 / 单条快捷键(2026-10-29,P2) ===== */
function openGroupMenu() {
  groupMenu.show = !groupMenu.show;
  closeMenu();
}
function setGroupFilter(id: string) {
  groupFilter.value = id;
  groupMenu.show = false;
  selIndex.value = 0;
}

async function assignGroup(gid: string | null) {
  const it = menu.item;
  if (!api || !it) return;
  menu.show = false;
  groupOpen.value = false;
  const r = await api.setGroup(it.id, gid || '').catch(() => null);
  if (!r || r.ok === false) { showToast(r?.error || '归组失败'); return; }
  await load();
  showToast(gid ? `已归入「${groupNameOf(gid)}」` : '已移出分组');
}

function openGroupCreate(fromMenu: boolean, pendingItemId = '') {
  dialog.mode = 'group-create';
  dialog.value = '';
  dialog.error = '';
  dialog.pendingItemId = pendingItemId;
  dialog.fromMenu = fromMenu;
  menu.show = false;
  groupOpen.value = false;
  groupMenu.show = false;
  nextTick(() => dialogInput.value?.focus());
}
function openGroupRename(g: ClipGroup) {
  dialog.mode = 'group-rename';
  dialog.groupId = g.id;
  dialog.value = g.name;
  dialog.error = '';
  groupMenu.show = false;
  nextTick(() => { dialogInput.value?.focus(); dialogInput.value?.select(); });
}
async function removeGroup(g: ClipGroup) {
  groupMenu.show = false;
  const r = await api?.groupRemove(g.id).catch(() => null);
  if (!r || r.ok === false) { showToast(r?.error || '删除分组失败'); return; }
  await load();
  showToast(`已删除分组「${g.name}」，条目已移出分组`);
}
async function submitGroup() {
  const name = dialog.value.trim();
  if (!name) { dialog.error = '请输入分组名'; return; }
  if (dialog.mode === 'group-create') {
    const r = await api?.groupCreate(name).catch(() => null);
    if (!r || r.ok === false) { dialog.error = r?.error || '创建失败'; return; }
    const gid = r.group?.id || '';
    // 从条目菜单建的组:顺手把那条归进去(右键「在分组中… → 新建」的预期)
    if (dialog.pendingItemId && gid) await api?.setGroup(dialog.pendingItemId, gid).catch(() => null);
    if (dialog.fromMenu && gid) groupFilter.value = gid;
    closeDialog();
    await load();
    showToast(`已创建分组「${name}」`);
  } else if (dialog.mode === 'group-rename') {
    const r = await api?.groupRename(dialog.groupId, name).catch(() => null);
    if (!r || r.ok === false) { dialog.error = r?.error || '重命名失败'; return; }
    closeDialog();
    await load();
    showToast('分组已重命名');
  }
}

function openTagEditor(it: ClipItem | null) {
  if (!it) return;
  menu.show = false;
  dialog.mode = 'tags';
  dialog.item = it;
  dialog.tags = [...(it.tags || [])];
  dialog.tagInput = '';
  dialog.error = '';
  nextTick(() => dialogInput.value?.focus());
}
function addTags() {
  const parts = dialog.tagInput.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
  const next = [...dialog.tags];
  for (const p of parts) {
    const v = p.replace(/^#+/, '').slice(0, 20);
    if (v && !next.some((t) => t.toLowerCase() === v.toLowerCase())) next.push(v);
    if (next.length >= 8) break;
  }
  dialog.tags = next.slice(0, 8);
  dialog.tagInput = '';
}
function removeTag(i: number) {
  dialog.tags = dialog.tags.filter((_, idx) => idx !== i);
}
async function saveTags() {
  const it = dialog.item;
  if (!api || !it) return;
  if (dialog.tagInput.trim()) addTags();
  // ★ 必须展开成普通数组再走 IPC:Vue 的响应式数组是 Proxy,
  //   结构化克隆不支持 Proxy,会直接抛 "An object could not be cloned"(实测踩到)。
  const r = await api.setTags(it.id, [...dialog.tags]).catch(() => null);
  if (!r || r.ok === false) { dialog.error = r?.error || '保存失败'; return; }
  closeDialog();
  await load();
  showToast('标签已保存');
}

function openHotkeyEditor(it: ClipItem | null) {
  if (!it) return;
  menu.show = false;
  dialog.mode = 'hotkey';
  dialog.item = it;
  dialog.hotkey = it.hotkey || '';
  dialog.error = '';
  nextTick(() => dialogInput.value?.focus());
}
const ACCEL_KEY_MAP: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
};
function accelFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  let base = '';
  if (e.key.length === 1 && /\S/.test(e.key)) base = e.key.toUpperCase();
  else if (/^F\d{1,2}$/.test(e.key)) base = e.key;
  else if (ACCEL_KEY_MAP[e.key]) base = ACCEL_KEY_MAP[e.key];
  if (!base) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  // 必须带修饰键:否则普通打字会被全局键吃掉整个键盘
  if (!mods.length) return null;
  return [...mods, base].join('+');
}
async function applyItemHotkey(accel: string) {
  const it = dialog.item;
  if (!api || !it) return;
  const r = await api.setHotkey(it.id, accel).catch(() => null);
  if (!r || r.ok === false) { dialog.error = r?.error || '设置失败'; return; }
  closeDialog();
  await load();
  showToast(accel ? `已设快捷键 ${prettyAccel(accel)}` : '已清除快捷键');
}
function onHotkeyKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { closeDialog(); return; }
  const accel = accelFromEvent(e);
  if (!accel) { dialog.error = '需要 Ctrl / Alt / Shift 加一个键'; return; }
  void applyItemHotkey(accel);
}
function clearItemHotkey() { void applyItemHotkey(''); }

function closeDialog() {
  dialog.mode = '';
  dialog.item = null;
  dialog.error = '';
  dialog.value = '';
  dialog.tagInput = '';
  dialog.groupId = '';
  dialog.pendingItemId = '';
}
const dialogTitle = computed(() => {
  if (dialog.mode === 'group-create') return '新建分组';
  if (dialog.mode === 'group-rename') return '重命名分组';
  if (dialog.mode === 'tags') return '编辑标签';
  if (dialog.mode === 'hotkey') return '设置单条快捷键';
  return '';
});

/* ===== AI 处理 ===== */
async function runAi(action: string) {
  const it = menu.item;
  if (!api || !it) return;
  aiOpen.value = false;
  menu.show = false;
  const r = await api.aiAction(it.id, action).catch(() => null);
  if (!r || r.ok === false) { showToast(r?.error || 'AI 处理失败'); return; }
  showToast(`已交给 AI：${r.label || '处理'}，结果在会话里`);
  window.setTimeout(() => hidePanel(), 420);
}
function openAiMenu(e: MouseEvent, it: ClipItem) {
  openMenu(e, it);
  aiOpen.value = true;
}

/* ===== 多选 → 合并 / 发送 ===== */
function toggleSelecting() {
  selecting.value = !selecting.value;
  selected.value = new Set();
  menu.show = false;
}
function onItemClick(it: ClipItem) {
  if (selecting.value) {
    const next = new Set(selected.value);
    if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
    selected.value = next;
    return;
  }
  void pasteItem(it);
}
async function aiMerge() {
  const ids = [...selected.value];
  if (!api || ids.length < 2) return;
  const r = await api.aiMerge(ids).catch(() => null);
  if (!r || r.ok === false) { showToast(r?.error || '合并失败'); return; }
  showToast(`已把 ${r.count || ids.length} 条交给 AI 合并整理`);
  window.setTimeout(() => hidePanel(), 420);
}
async function sendBatch() {
  const ids = [...selected.value];
  if (!api || !ids.length) return;
  const r = await api.sendBatch(ids).catch(() => null);
  if (!r || r.ok === false) { showToast(r?.error || '发送失败'); return; }
  showToast('已放进会话输入框，可补充问题再发送');
  window.setTimeout(() => hidePanel(), 420);
}

async function clearAll() {
  if (!api) return;
  if (!clearArmed.value) {
    clearArmed.value = true;
    window.setTimeout(() => { clearArmed.value = false; }, 2500);
    return;
  }
  const r = await api.clear().catch(() => null);
  clearArmed.value = false;
  if (!r || r.ok === false) { showToast('清空失败'); return; }
  await load();
  showToast(`已清空 ${r.removed || 0} 条（置顶保留）`);
}

function setTab(k: typeof tab.value) { tab.value = k; selIndex.value = 0; }
function toggleLayout() {
  layout.value = layout.value === 'grid' ? 'list' : 'grid';
  showToast(layout.value === 'grid' ? '横向布局（卡片网格）' : '纵向布局（列表）');
}

/* ===== 右键菜单 ===== */
const menu = reactive<{ show: boolean; x: number; y: number; title: string; item: ClipItem | null; flipAi: boolean }>({
  show: false, x: 0, y: 0, title: '', item: null, flipAi: false,
});
function openMenu(e: MouseEvent, it: ClipItem) {
  e.stopPropagation();
  const title = (it.kind === 'image' || it.kind === 'file' ? fileNameOf(it) : String(it.text || '').slice(0, 24)) || kindLabel(it.kind);
  menu.item = it;
  menu.title = title.length >= 24 ? title + '…' : title;
  menu.show = true;
  // 先放到事件点,下一帧按实际尺寸夹取(避免贴边跑出窗口)
  menu.x = e.clientX;
  menu.y = e.clientY;
  nextTick(() => {
    const el = document.querySelector('.cp-ctx') as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    menu.x = Math.max(8, Math.min(e.clientX, window.innerWidth - r.width - 8));
    menu.y = Math.max(8, Math.min(e.clientY, window.innerHeight - r.height - 8));
    // AI 子菜单向右展开:右侧放不下就翻到左边(否则会被窗口裁掉)
    menu.flipAi = menu.x + r.width + 180 > window.innerWidth;
  });
}
function menuPin(it: ClipItem | null) { menu.show = false; if (it) void togglePin(it); }
function closeMenu() { menu.show = false; aiOpen.value = false; groupOpen.value = false; }
/** 点菜单外才收起:菜单自己的 mousedown 不能把刚点的那一项先删掉(否则 click 永远收不到) */
function onWindowMouseDown(e: MouseEvent) {
  const el = e.target as HTMLElement | null;
  // 分组按钮自己也要放过:mousedown 先关、click 再开,等于点了没反应
  if (el?.closest?.('.cp-ctx') || el?.closest?.('.cp-gmenu') || el?.closest?.('.cp-foot-group')) return;
  if (menu.show) closeMenu();
  if (groupMenu.show) groupMenu.show = false;
}
function pasteSelected() {
  const it = filtered.value[selIndex.value];
  if (it) void pasteItem(it);
}

/* ===== 拖动 ===== */
function onDragStart(e: DragEvent, it: ClipItem) {
  if (!api) return;
  api.suspendBlur?.(true);
  if (hasFile(it)) {
    // 图片/文件:交给主进程 webContents.startDrag 走原生拖放(落成文件)。
    // ★ 这条路径不会触发 DOM dragend(preventDefault 之后拖放交给原生),所以给一个兜底复位,
    //   否则"暂停失焦收起"会一直生效,面板再也收不起来。
    e.preventDefault();
    void api.dragOut(it.id);
    window.setTimeout(() => api.suspendBlur?.(false), 5000);
    return;
  }
  try {
    e.dataTransfer?.setData('text/plain', String(it.text || ''));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  } catch { /* 某些平台禁止自定义 data */ }
}
function onDragEnd() {
  api?.suspendBlur?.(false);
}

/* ===== 键盘 ===== */
function onGlobalKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (dialog.mode) { closeDialog(); return; }
    if (groupMenu.show) { groupMenu.show = false; return; }
    if (menu.show) { closeMenu(); return; }
    if (selecting.value) { toggleSelecting(); return; }
    if (query.value && document.activeElement === searchEl.value) { query.value = ''; return; }
    hidePanel();
    return;
  }
  // 弹层/对话框打开时,数字/方向键归它们,不要触发粘贴
  if (dialog.mode || groupMenu.show) return;
  const inInput = ['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName || ''));
  if (inInput) return;
  // 多选态下数字/回车不再粘贴，避免与勾选混淆
  if (selecting.value) return;
  const list = filtered.value;
  if (!list.length) return;
  if (/^[1-9]$/.test(e.key)) {
    const it = list[Number(e.key) - 1];
    if (it) void pasteItem(it);
    return;
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); selIndex.value = Math.min(list.length - 1, selIndex.value + 1); scrollSel(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selIndex.value = Math.max(0, selIndex.value - 1); scrollSel(); }
  else if (e.key === 'Enter') { const it = list[selIndex.value]; if (it) void pasteItem(it); }
  else if (e.key === '/') { e.preventDefault(); searchEl.value?.focus(); }
  else if (e.key === 'Tab') {
    e.preventDefault();
    const keys = TABS.map((t) => t.key);
    const i = keys.indexOf(tab.value as any);
    tab.value = keys[(i + (e.shiftKey ? keys.length - 1 : 1)) % keys.length] as any;
    selIndex.value = 0;
  }
}
function scrollSel() {
  nextTick(() => {
    const nodes = listEl.value?.querySelectorAll('.cp-item');
    (nodes?.[selIndex.value] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  });
}

/** 读主进程配置:把当前召唤键显示在标题旁(改键后重新召唤即刷新) */
async function loadConfig() {
  if (!api?.getConfig) return;
  const r = await api.getConfig().catch(() => null);
  const accel = r?.config?.accelerator;
  if (typeof accel !== 'string') return;
  hotkeyLabel.value = accel ? accel.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ') : '未启用';
}
function onSearchEsc() {
  if (query.value) { query.value = ''; return; }
  hidePanel();
}

watch(filtered, () => { if (selIndex.value >= filtered.value.length) selIndex.value = 0; });
// 条目被删除/清空后，把已选集合里的幽灵 id 清掉
watch(items, () => {
  if (!selected.value.size) return;
  const alive = new Set(items.value.map((i) => i.id));
  const next = new Set([...selected.value].filter((id) => alive.has(id)));
  if (next.size !== selected.value.size) selected.value = next;
});

/* ===== 生命周期 ===== */
let offShown: (() => void) | null = null;
let offChanged: (() => void) | null = null;
const prevBg: { html: string; body: string } = { html: '', body: '' };

onMounted(async () => {
  // 透明窗:页面背景必须透明,否则圆角外会露一块纸色
  const html = document.documentElement;
  prevBg.html = html.style.background;
  prevBg.body = document.body.style.background;
  html.style.background = 'transparent';
  document.body.style.background = 'transparent';
  // 应用外壳可能带底色,面板窗里也一并压平(只影响本渲染进程)
  const shell = document.querySelector('.app-shell') as HTMLElement | null;
  if (shell) shell.style.background = 'transparent';

  window.addEventListener('keydown', onGlobalKey);
  window.addEventListener('mousedown', onWindowMouseDown);
  await load();
  void loadConfig();
  await nextTick();
  searchEl.value?.focus();
  offShown = api?.onShown?.(() => { void load(); void loadConfig(); nextTick(() => searchEl.value?.focus()); }) || null;
  offChanged = api?.onChanged?.(() => { void load(); }) || null;
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey);
  window.removeEventListener('mousedown', onWindowMouseDown);
  offShown?.();
  offChanged?.();
  document.documentElement.style.background = prevBg.html;
  document.body.style.background = prevBg.body;
});
</script>

<style scoped>
/* 透明窗:根节点铺满,内层 shell 负责圆角 + 投影 */
/* 这个 CSS 只会随 /clip-panel 的 chunk 一起加载,不会影响主窗口;
   但 !important 是必须的:皮肤/主题会给 html/body/.app-shell 铺底色。 */
:global(html), :global(body), :global(#app) { background: transparent !important; }
:global(.app-shell), :global(.main-content) { background: transparent !important; }
.clip-root {
  position: fixed;
  inset: 0;
  padding: 14px;
  display: flex;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 13px;
  user-select: none;
}
.cp-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  /* ★ 透明窗里画阴影:模糊半径 - 负扩散 必须小于 .clip-root 的 padding,
     否则阴影被窗口边缘裁掉,四周会出现一圈发虚的灰边(实测就是这么表现出来的)。 */
  box-shadow:
    0 1px 1px rgba(15, 18, 30, 0.03),
    0 4px 10px -4px rgba(15, 18, 30, 0.14),
    0 12px 24px -12px rgba(15, 18, 30, 0.22);
  overflow: hidden;
}
:global(html[data-theme="dark"]) .cp-shell {
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.3),
    0 4px 10px -4px rgba(0, 0, 0, 0.45),
    0 12px 24px -12px rgba(0, 0, 0, 0.55);
}

/* ===== 头部 ===== */
.cp-head { padding: 14px 16px 0; flex-shrink: 0; }
.cp-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 12px;
  /* 窗口拖动区:只有这一行可拖动,输入框/按钮全部 no-drag */
  -webkit-app-region: drag;
}
.cp-brand button { -webkit-app-region: no-drag; }
.cp-logo {
  width: 24px; height: 24px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 11.5px; font-weight: 700;
  background: linear-gradient(135deg, #5B54F0, #8B5CF6);
  box-shadow: 0 1px 3px rgba(79, 70, 229, 0.35);
}
.cp-title { font-weight: 700; font-size: 14.5px; letter-spacing: 0.2px; }
.cp-spacer { flex: 1; }
.cp-icon {
  width: 28px; height: 28px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-tertiary);
  transition: background 0.14s, color 0.14s, transform 0.08s;
}
.cp-icon:hover { background: var(--color-surface-hover); color: var(--color-text); }
.cp-icon:active { transform: scale(0.94); }
.cp-icon.on { background: var(--color-primary-light); color: var(--color-primary); }
.cp-icon:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }

.cp-search {
  display: flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 12px;
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  transition: border-color 0.14s, box-shadow 0.14s, background 0.14s;
  -webkit-app-region: no-drag;
}
.cp-search:hover { border-color: var(--color-border-strong); }
.cp-search.focus {
  border-color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 16%, transparent);
}
.cp-search input {
  flex: 1;
  border: none; outline: none; background: none;
  font: inherit; color: var(--color-text);
  user-select: text;
}
.cp-search input::placeholder { color: var(--color-text-tertiary); }
.cp-esc {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-bottom-width: 2px;
  border-radius: 5px;
  padding: 1px 6px;
}

.cp-tabs {
  display: flex; gap: 4px;
  padding: 12px 0 10px;
  border-bottom: 1px solid var(--color-border);
  /* 数字变大时宁可横向滑动,也不要换行把列表顶下去 */
  overflow-x: auto;
  scrollbar-width: none;
}
.cp-tabs::-webkit-scrollbar { display: none; }
.cp-tab {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex; align-items: center; gap: 4px;
  transition: background 0.14s, color 0.14s;
}
.cp-tab:hover { background: var(--color-surface-hover); color: var(--color-text); }
.cp-tab.on { background: var(--color-primary-light); color: var(--color-primary); font-weight: 600; }
.cp-tab-n {
  font-size: 10px;
  line-height: 15px;
  padding: 0 5px;
  min-width: 18px;
  text-align: center;
  border-radius: 999px;
  background: rgba(15, 18, 30, 0.05);
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.cp-tab.on .cp-tab-n { background: rgba(79, 70, 229, 0.14); color: var(--color-primary); }
:global(html[data-theme="dark"]) .cp-tab-n { background: rgba(255, 255, 255, 0.06); }
:global(html[data-theme="dark"]) .cp-tab.on .cp-tab-n { background: rgba(129, 140, 248, 0.2); }

/* ===== 列表 ===== */
.cp-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px 10px;
  min-height: 0;
}
.cp-list::-webkit-scrollbar { width: 6px; }
.cp-list::-webkit-scrollbar-track { background: transparent; }
.cp-list::-webkit-scrollbar-thumb { background: var(--color-border-strong); border-radius: 3px; }
.cp-list::-webkit-scrollbar-thumb:hover { background: var(--color-text-tertiary); }

.cp-sec {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--color-text-tertiary);
  padding: 9px 8px 4px;
}

.cp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s, border-color 0.12s;
}
.cp-item:hover { background: var(--color-surface-hover); border-color: var(--color-border); }
.cp-item.sel { background: var(--color-surface-hover); border-color: var(--color-border-strong); }

.cp-num {
  width: 18px; height: 18px;
  flex-shrink: 0;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.cp-item:hover .cp-num, .cp-num.hot { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }

.cp-kind {
  width: 40px; height: 40px;
  flex-shrink: 0;
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700;
  overflow: hidden;
}
.k-text { background: var(--color-primary-light); color: var(--color-primary); font-size: 14px; }
.k-code { background: #EEF4FF; color: #3B6FD4; font-size: 11px; font-family: var(--font-mono); }
.k-json { background: #E8F6EF; color: var(--color-success); font-size: 10px; font-family: var(--font-mono); }
.k-link { background: #FFF4E5; color: #C77700; }
.k-file { background: #F1ECFF; color: #7C5CFC; }
.k-color { background: none; }
.k-image { background: none; }
:global(html[data-theme="dark"]) .k-text { background: rgba(129, 140, 248, 0.16); color: #A5B4FC; }
:global(html[data-theme="dark"]) .k-code { background: rgba(96, 165, 250, 0.16); color: #93C5FD; }
:global(html[data-theme="dark"]) .k-json { background: rgba(52, 211, 153, 0.16); color: #6EE7B7; }
:global(html[data-theme="dark"]) .k-link { background: rgba(251, 191, 36, 0.16); color: #FCD34D; }
:global(html[data-theme="dark"]) .k-file { background: rgba(167, 139, 250, 0.18); color: #C4B5FD; }
.cp-swatch { width: 26px; height: 26px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08); }
.cp-thumb { width: 100%; height: 100%; }
.cp-thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block; }

.cp-body { flex: 1; min-width: 0; }
.cp-line1 {
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.cp-line1.mono { font-family: var(--font-mono); font-size: 11.5px; color: var(--color-text-secondary); }
.cp-chip {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 0 5px;
  margin-right: 6px;
  border-radius: 4px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  vertical-align: 1px;
}
.cp-chip.c-code { color: #3B6FD4; background: #EEF4FF; border-color: #D6E4FB; }
.cp-chip.c-json { color: var(--color-success); background: #E8F6EF; border-color: #CFEAD9; }
.cp-chip.c-link { color: #C77700; background: #FFF4E5; border-color: #F7E3C4; }
.cp-chip.c-color { color: #B45309; }
:global(html[data-theme="dark"]) .cp-chip { background: var(--color-surface-hover); border-color: var(--color-border); color: var(--color-text-secondary); }
:global(html[data-theme="dark"]) .cp-chip.c-code { background: rgba(96, 165, 250, 0.16); border-color: rgba(96, 165, 250, 0.3); color: #93C5FD; }
:global(html[data-theme="dark"]) .cp-chip.c-json { background: rgba(52, 211, 153, 0.16); border-color: rgba(52, 211, 153, 0.3); color: #6EE7B7; }
:global(html[data-theme="dark"]) .cp-chip.c-link { background: rgba(251, 191, 36, 0.16); border-color: rgba(251, 191, 36, 0.3); color: #FCD34D; }

.cp-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.cp-line2 .dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: 0.5; }
.cp-pinflag { color: #C77700; display: flex; }

.cp-acts { display: none; align-items: center; gap: 2px; flex-shrink: 0; }
.cp-item:hover .cp-acts { display: flex; }
.cp-act {
  width: 26px; height: 26px;
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-tertiary);
  transition: background 0.12s, color 0.12s;
}
.cp-act:hover { background: var(--color-border); color: var(--color-text); }
.cp-act:active { background: var(--color-border-strong); }
.cp-act.pin { color: #C77700; }

.cp-empty {
  text-align: center;
  padding: 56px 24px;
  color: var(--color-text-tertiary);
  font-size: 12.5px;
  line-height: 1.95;
}
.cp-empty svg { margin: 0 auto 12px; color: var(--color-border-strong); }

/* ===== 底部 ===== */
.cp-foot {
  height: 42px;
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface-hover) 45%, var(--color-surface));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}
.cp-foot-btn {
  height: 26px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 11.5px;
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.12s, color 0.12s;
}
.cp-foot-btn:hover { background: var(--color-surface-hover); color: var(--color-text); }
.cp-foot-btn.danger {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  font-weight: 600;
}
.cp-foot-stats { font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }

/* ===== 横向布局(卡片网格,与原型一致) ===== */
.clip-root.is-grid .cp-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  align-content: start;
  padding: 10px;
}
.clip-root.is-grid .cp-sec { grid-column: 1 / -1; padding: 2px 2px; }
.clip-root.is-grid .cp-item {
  flex-direction: column;
  align-items: stretch;
  padding: 10px;
  /* 44 图标 + 3 行预览 + 元信息 + 上下内边距,再矮就会把"时间/字数"那行挤掉 */
  height: 150px;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.clip-root.is-grid .cp-item:hover {
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-md);
}
.clip-root.is-grid .cp-num { position: absolute; top: 7px; left: 7px; z-index: 2; }
.clip-root.is-grid .cp-item { position: relative; }
.clip-root.is-grid .cp-kind { width: 100%; height: 44px; margin-bottom: 6px; }
.clip-root.is-grid .cp-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.clip-root.is-grid .cp-line1 { -webkit-line-clamp: 3; font-size: 12px; }
.clip-root.is-grid .cp-line1.mono { font-size: 10.5px; }
.clip-root.is-grid .cp-line2 {
  margin-top: auto;
  white-space: nowrap;
  overflow: hidden;
  /* 卡片窄:长元信息用渐隐收尾,比硬裁一半看着干净 */
  -webkit-mask-image: linear-gradient(to right, #000 88%, transparent);
}
.clip-root.is-grid .cp-acts {
  position: absolute;
  top: 7px; right: 7px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 7px;
  padding: 1px;
  box-shadow: var(--shadow-md);
}
.clip-root.is-grid .cp-empty { grid-column: 1 / -1; }

/* ===== 提示 ===== */
.cp-toast {
  position: fixed;
  left: 50%;
  bottom: 62px;
  transform: translateX(-50%);
  max-width: calc(100% - 48px);
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 12.5px;
  color: #fff;
  background: rgba(24, 27, 34, 0.94);
  box-shadow: 0 8px 24px -8px rgba(15, 18, 30, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
:global(html[data-theme="dark"]) .cp-toast { background: rgba(232, 234, 240, 0.95); color: #14161C; }
.cp-fade-enter-active, .cp-fade-leave-active { transition: opacity 0.18s, transform 0.18s; }
.cp-fade-enter-from, .cp-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* ===== 右键菜单 ===== */
.cp-ctx {
  position: fixed;
  z-index: 60;
  min-width: 186px;
  padding: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 12px 32px -8px rgba(15, 18, 30, 0.28), 0 2px 8px rgba(15, 18, 30, 0.08);
}
.cp-ctx-title {
  font-size: 11px;
  color: var(--color-text-tertiary);
  padding: 6px 9px 6px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 4px;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--color-text);
  text-align: left;
  background: transparent;   /* 覆盖全局 button 底色:菜单项只有 hover 才铺色 */
  border: none;
  transition: background 0.12s, color 0.12s;
}
.cp-ctx-item:hover { background: var(--color-surface-hover); }
.cp-ctx-item svg { color: var(--color-text-tertiary); flex-shrink: 0; }
.cp-ctx-item .cp-ctx-key { margin-left: auto; font-size: 10.5px; color: var(--color-text-tertiary); }
.cp-ctx-item.danger, .cp-ctx-item.danger svg { color: var(--color-danger); }
.cp-ctx-sep { height: 1px; background: var(--color-border); margin: 4px 8px; }

/* ===== AI 子菜单(2026-10-29):在菜单内联展开(面板窄,飞出会被窗口裁掉) ===== */
.cp-ctx-aiwrap { position: relative; }
.cp-ctx-aiwrap .cp-ctx-item.ai-on { background: var(--color-primary-light); color: var(--color-primary); }
.cp-ctx-aiwrap .cp-ctx-item.ai-on svg { color: var(--color-primary); }
.cp-ai-badge {
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #4F46E5, #7C5CFC);
  border-radius: 4px;
  padding: 1px 4px;
  margin-left: 5px;
  line-height: 1.4;
  vertical-align: 1px;
}
.cp-ctx-arrow { margin-left: auto; color: var(--color-text-tertiary); font-size: 13px; transition: transform .15s; }
.cp-ctx-item.ai-on .cp-ctx-arrow { transform: rotate(90deg); }
.cp-ctx-sub {
  margin: 2px 0 4px 16px;
  padding: 2px 0 2px 8px;
  border-left: 2px solid var(--color-primary-light);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.cp-ctx-subitem { padding: 5px 8px; font-size: 12px; }
.cp-ctx-subitem svg { color: var(--color-primary); width: 12px; height: 12px; }

/* 标题旁的召唤键角标 + 底栏快捷键提示 */
.cp-hk {
  font-size: 10px;
  color: var(--color-text-tertiary);
  border: 1px solid var(--color-border-strong);
  border-bottom-width: 2px;
  border-radius: 5px;
  padding: 1px 6px;
  margin-left: 2px;
  background: var(--color-surface-hover);
  font-weight: 600;
  white-space: nowrap;
}
.cp-foot-hint { font-size: 10.5px; color: var(--color-text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-foot-stats { white-space: nowrap; flex-shrink: 0; }

/* ===== 多选（2026-10-29）===== */
.cp-check {
  width: 18px; height: 18px; border-radius: 6px; flex-shrink: 0;
  border: 1.5px solid var(--color-border-strong);
  display: flex; align-items: center; justify-content: center;
  color: transparent;
  transition: background 0.12s, border-color 0.12s;
}
.cp-check.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.cp-item.picked { background: var(--color-primary-light); border-color: var(--color-primary); }
.cp-selectbar {
  height: 42px; border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface-hover) 45%, var(--color-surface));
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px; font-size: 12px; color: var(--color-text-secondary); flex-shrink: 0;
}
.cp-selectbar b { color: var(--color-primary); }
.cp-sel-btn {
  height: 28px; padding: 0 12px; border-radius: 7px;
  font-size: 11.5px;
  border: 1px solid var(--color-border); color: var(--color-text); background: transparent; white-space: nowrap;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.cp-sel-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light); }
.cp-sel-btn.primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.cp-sel-btn.primary:hover:not(:disabled) { background: var(--color-primary-dark); color: #fff; }
.cp-sel-btn.ghost { color: var(--color-text-tertiary); }
.cp-sel-btn:disabled { opacity: 0.45; cursor: default; }
.cp-foot-hint b { color: var(--color-text-secondary); font-weight: 600; }
.cp-act.ai:hover { background: var(--color-primary-light); color: var(--color-primary); }

/* ===== 分组与标签（2026-10-29，P2）===== */
.cp-line2 { flex-wrap: nowrap; overflow: hidden; }
.cp-badge {
  display: inline-flex; align-items: center; gap: 3px;
  flex-shrink: 0;
  max-width: 96px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 15px;
  white-space: nowrap;
  overflow: hidden;
}
.cp-badge.g { color: #7C5CFC; border-color: rgba(124, 92, 252, 0.3); background: rgba(124, 92, 252, 0.1); }
.cp-badge.hk {
  color: var(--color-primary);
  border-color: var(--color-primary-light);
  background: var(--color-primary-light);
  font-family: var(--font-mono);
}
.cp-foot-group { max-width: 150px; white-space: nowrap; overflow: hidden; }
.cp-foot-btn.on { color: var(--color-primary); background: var(--color-primary-light); font-weight: 600; }

.cp-gmenu {
  position: fixed;
  left: 20px;
  bottom: 62px;
  z-index: 70;
  width: 232px;
  max-height: 358px;
  overflow-y: auto;
  padding: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 12px 32px -8px rgba(15, 18, 30, 0.28), 0 2px 8px rgba(15, 18, 30, 0.08);
}
.cp-gmenu-head {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  padding: 5px 9px 6px;
  letter-spacing: 0.2px;
}
.cp-ctx-item.on { background: var(--color-primary-light); color: var(--color-primary); }
.cp-grow { display: flex; align-items: center; }
.cp-grow .cp-gname { flex: 1; min-width: 0; }
.cp-gname-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-grow.on .cp-gname { background: var(--color-primary-light); color: var(--color-primary); }
.cp-gact {
  width: 22px; height: 22px;
  border-radius: 5px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.cp-gact:hover { background: var(--color-border); color: var(--color-text); }
.cp-gact.danger:hover { color: var(--color-danger); }
.cp-gempty { font-size: 11.5px; color: var(--color-text-tertiary); padding: 8px 10px; line-height: 1.7; }
.cp-gbadge {
  display: inline-block;
  max-width: 92px;
  margin-left: 5px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.cp-ctx-subitem.g-on { color: var(--color-primary); background: var(--color-primary-light); }
.cp-ctx-subempty { font-size: 11px; color: var(--color-text-tertiary); padding: 4px 10px; }

/* ===== 对话框：新建分组 / 标签 / 快捷键录制 ===== */
.cp-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 14, 20, 0.28);
}
.cp-modal {
  width: 328px;
  max-width: calc(100% - 48px);
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: 0 18px 48px -12px rgba(15, 18, 30, 0.4), 0 4px 12px rgba(15, 18, 30, 0.1);
}
.cp-modal-head { font-weight: 700; font-size: 14px; margin-bottom: 12px; letter-spacing: 0.2px; }
.cp-modal-input {
  width: 100%;
  height: 36px;
  padding: 0 11px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-hover);
  color: var(--color-text);
  font: inherit;
  outline: none;
  user-select: text;
  transition: border-color 0.14s, box-shadow 0.14s, background 0.14s;
}
.cp-modal-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); background: var(--color-surface); }
.cp-modal-input::placeholder { color: var(--color-text-tertiary); }
.cp-hkcap { text-align: center; font-weight: 600; letter-spacing: 0.6px; }
.cp-modal-tip { margin-top: 9px; font-size: 11px; color: var(--color-text-tertiary); line-height: 1.65; }
.cp-modal-err { margin-top: 9px; font-size: 11.5px; color: var(--color-danger); }
.cp-modal-actions { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.cp-tagbox {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-hover);
  max-height: 150px;
  overflow-y: auto;
}
.cp-tagchip {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 2px 4px 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.cp-tagx {
  width: 14px; height: 14px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary);
  font-size: 11px;
}
.cp-tagx:hover { background: rgba(0, 0, 0, 0.08); }
.cp-tag-input {
  flex: 1;
  min-width: 130px;
  height: 22px;
  border: none; outline: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  user-select: text;
}
.cp-tag-input::placeholder { color: var(--color-text-tertiary); }
</style>
