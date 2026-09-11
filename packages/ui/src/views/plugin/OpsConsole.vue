<template>
  <div class="page ops-console">
    <div class="ops-layout" :style="{ '--ops-aside-w': (asideCollapsed ? 0 : asideW) + 'px' }">
      <!-- 左侧：资源列表（可整体收起；目录行可折叠；空白处右键新建，资源行右键出操作菜单） -->
      <aside
        v-show="!asideCollapsed"
        class="ops-connections"
        :style="{ width: asideW + 'px' }"
        @contextmenu.prevent="onTreeCtx"
      >
        <div class="ops-tree-head">
          <span class="ops-tree-title">资源</span>
        </div>
        <div class="ops-tree">
          <template v-for="g in groupTree" :key="g.id">
            <!-- 目录行（无目录时为扁平列表，不渲染表头）；操作走右键菜单 -->
            <div
              v-if="groups.length"
              class="ops-group-row"
              @click="toggleGroup(g.id)"
              @contextmenu.prevent.stop="onGroupCtx(g, $event)"
            >
              <el-icon class="ops-group-caret">
                <ArrowDown v-if="isExpanded(g.id)" /><ArrowRight v-else />
              </el-icon>
              <el-icon class="ops-group-folder"><Folder /></el-icon>
              <span class="ops-group-name" :title="g.name">{{ g.name }}</span>
              <span class="ops-group-count">{{ g.items.length }}</span>
            </div>

            <div v-show="!groups.length || isExpanded(g.id)" class="ops-group-body">
              <div
                v-for="c in g.items"
                :key="c.id"
                :class="['ops-conn-row', { active: isConnActive(c.id) }]"
                :title="connTitle(c)"
                @click="openConnection(c)"
                @contextmenu.prevent.stop="onConnCtx(c, $event)"
              >
                <span class="ops-conn-dot" :data-type="connType(c)" />
                <span class="ops-conn-name">{{ c.name }}</span>
                <span v-if="testingId === c.id" class="ops-conn-testing">测试中…</span>
                <el-tag v-if="c.tag" size="small" :type="isProdTag(c.tag) ? 'danger' : 'info'">{{ c.tag }}</el-tag>
              </div>
              <div v-if="!g.items.length" class="ops-group-empty">
                {{ g.real ? '目录下暂无资源' : '暂无资源，在列表空白处右键新建连接' }}
              </div>
            </div>
          </template>
        </div>
      </aside>

      <!-- 资源列表 ↔ 工作区：拖动分隔条调宽（最小到 min，不会自动折叠） -->
      <div
        v-show="!asideCollapsed"
        class="rs-handle rs-handle-left"
        title="拖动调整宽度"
        @mousedown="asideR.startDrag($event, 'left')"
      ></div>

      <!-- 折叠按钮：贴左边缘的竖条，点击收起/展开资源列表（同「对话」页） -->
      <div class="ops-aside-toggle" :title="asideCollapsed ? '展开资源列表' : '收起资源列表'" @click="toggleAside">
        <el-icon><Expand v-if="asideCollapsed" /><Fold v-else /></el-icon>
      </div>

      <!-- 右侧：两个 tab（工作区 / 操作日志）；工作区内是一排窗口标签，每个窗口独立会话 -->
      <section class="ops-workspace">
        <el-tabs v-model="mode" class="ops-tabs">
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

                <!-- 整体设置：文件面板开关，所有窗口共用（区别于下面每个连接自己的操作） -->
                <div class="ops-topbar-global">
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
                  <!-- 窗口头：连接信息 + 本连接自己的操作（模式切换见右下角浮动按钮） -->
                  <div class="ops-win-head">
                    <span class="ops-win-conn">{{ winConnInfo(w) }}</span>
                    <div class="ops-win-head-actions">
                      <span v-if="w.view === 'term' && w.termConnecting" class="ops-term-hint">连接中…</span>
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
                        <div :ref="(el: any) => setChatEl(w.id, el)" class="ops-chat-list" @click="onMdClick">
                          <div v-if="!w.chatMessages.length" class="ops-chat-welcome">
                            <el-icon :size="30" class="ops-chat-welcome-icon"><ChatDotRound /></el-icon>
                            <p class="ops-chat-welcome-title">运维助手</p>
                            <p class="ops-chat-welcome-sub">
                              描述运维任务，我来执行：看容器日志、查库、传文件、改配置……<br />
                              也能直接帮你新建连接和资源目录。
                            </p>
                          </div>
                          <div v-for="m in w.chatMessages" :key="m.id" :class="['ops-msg', m.role === 'user' ? 'msg-user' : 'msg-assistant']">
                            <div class="ops-msg-avatar" :class="m.role === 'user' ? 'avatar-user' : 'avatar-assistant'">
                              <el-icon :size="15"><component :is="m.role === 'user' ? User : ChatDotRound" /></el-icon>
                            </div>
                            <div class="ops-msg-body">
                              <div class="ops-msg-meta">
                                <span class="ops-msg-role-name">{{ m.role === 'user' ? '我' : (m.subAgentName || '运维助手') }}</span>
                                <span v-if="m.createdAt" class="ops-msg-time">{{ fmtTime(m.createdAt) }}</span>
                                <span v-if="m.streaming" class="ops-msg-streaming">输出中…</span>
                              </div>
                              <!-- 用户消息纯文本；助手消息 markdown 渲染（对齐主对话：代码高亮 + 复制 + 工具调用 chip） -->
                              <div v-if="m.role === 'user'" class="ops-msg-content">{{ m.content }}</div>
                              <div v-else class="ops-msg-content ops-md" v-html="renderAssistantMarkdown(m.content)"></div>
                            </div>
                          </div>
                        </div>
                        <div class="ops-chat-input">
                          <el-input
                            v-model="w.chatInput"
                            type="textarea"
                            :rows="2"
                            :disabled="w.chatStreaming"
                            placeholder="输入运维任务，Ctrl+Enter 发送"
                            @keydown.ctrl.enter="sendWinChat(w)"
                          />
                          <div class="ops-chat-actions">
                            <span v-if="w.chatStreaming" class="form-tip">执行中…</span>
                            <el-button v-if="w.chatStreaming" size="small" type="warning" @click="abortWinChat(w)">停止</el-button>
                            <el-button size="small" :disabled="w.chatStreaming || !w.chatInput.trim()" type="primary" @click="sendWinChat(w)">发送</el-button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 模式切换：右下角浮动图标按钮，点击循环切换本窗口可用的视图 -->
                    <div
                      v-if="viewOptionsFor(w).length > 1"
                      class="ops-view-fab"
                      :title="`当前：${VIEW_LABEL[w.view]} · 点击切换`"
                      @click="cycleWinView(w)"
                    >
                      <el-icon :size="16"><component :is="viewIcon(w.view)" /></el-icon>
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
                <el-table-column label="结果" width="90">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.ok ? 'success' : 'danger'">{{ row.ok ? '成功' : '失败/拒绝' }}</el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <div v-else class="ops-empty">暂无操作记录 —— 对话模式/工具执行的每一条 ssh/docker/db 操作都会落在这里</div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </section>
    </div>

    <!-- 资源 / 目录 右键菜单（自绘，与文件页同款） -->
    <div
      v-if="treeCtx.visible"
      class="ops-ctxmenu"
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
          >移动到「{{ gg.name }}」</div>
          <div v-if="ctxConnGroupId" class="ops-ctxmenu-item" @click="ctxMoveTo('')">移出目录</div>
        </template>
        <div class="ops-ctxmenu-item is-danger" @click="ctxRemove">删除连接</div>
      </template>
      <template v-else-if="treeCtx.group">
        <div class="ops-ctxmenu-item" @click="ctxRenameGroup">重命名目录</div>
        <div class="ops-ctxmenu-item is-danger" @click="ctxRemoveGroup">删除目录</div>
      </template>
      <template v-else>
        <!-- 列表空白处右键：新建入口（原来在页面标题栏的那两个按钮） -->
        <div class="ops-ctxmenu-item" @click="ctxNewConnection">新建连接</div>
        <div class="ops-ctxmenu-item" @click="ctxNewGroup">新建目录</div>
      </template>
    </div>

    <!-- 窗口标签右键菜单 -->
    <div
      v-if="tabCtx.visible"
      class="ops-ctxmenu"
      :style="{ left: tabCtx.x + 'px', top: tabCtx.y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <div class="ops-ctxmenu-item" @click="ctxCloseTab">关闭</div>
      <div class="ops-ctxmenu-item" @click="ctxCloseOtherTabs">关闭其他</div>
      <div class="ops-ctxmenu-item" @click="ctxCloseAllTabs">关闭全部</div>
    </div>

    <!-- 日志弹窗 -->
    <el-dialog v-model="logDialog.visible" :title="`容器日志 · ${logDialog.container}`" width="780px" top="6vh">
      <pre class="ops-log-view">{{ logDialog.content || '加载中…' }}</pre>
    </el-dialog>

    <!-- 新建 / 编辑连接弹窗（同一个表单组件，回填即编辑） -->
    <OpsConnectionDialog ref="connDialogRef" @saved="onConnectionSaved" />
  </div>
</template>

<script setup lang="ts">
import {
  type ViewKey,
  type ConnType,
  type OpsGroup,
  type OpsWin,
  type TermHandle,
  type DockerRow,
  type DbResult,
  TYPE_LABELS,
  VIEW_LABEL,
  PRIMARY_VIEW,
  TYPE_VIEWS,
  opsWindows,
  opsActiveWinId,
  opsFilePanelOpen,
  opsTerms,
  opsChatAborts,
  opsGroups,
  opsConnections,
  opsCollapsedGroups,
} from './opsSession';
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import {
  Folder, FolderOpened, Fold, Expand,
  ArrowDown, ArrowRight, Close,
  Monitor, Box, DataLine, ChatDotRound, User,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import '@xterm/xterm/css/xterm.css';
import { api, API_BASE } from '../../api/client';
import { useSettingsStore } from '../../stores/settings';
import { usePlatformStore } from '../../stores/platform';
import SftpPanel from './SftpPanel.vue';
import OpsConnectionDialog, { type OpsConn } from './OpsConnectionDialog.vue';
import { useResizable } from '../../composables/useResizable';

// 类型与常量定义见上方 <script> 模块块（跨路由切换需要保留的会话状态也在那里）

const settingsStore = useSettingsStore();
const platformStore = usePlatformStore();
const OPS_AGENT_ID = 'a_builtin_ops_agent';
const MAX_OUTPUT_CHARS = 4000;

const mode = ref<'main' | 'log'>('main');

// 三屏拖动：资源列表 / 主视图 / 文件面板 宽度可拖，localStorage 持久化
// 拖动只改变宽度（最小到 min），折叠是独立按钮的事，两者不耦合
const asideR = useResizable('ops_aside', 260, 160, 460);
const { width: asideW } = asideR;
const fileR = useResizable('ops_files', 420, 280, 900);
const { width: fileW } = fileR;

// 资源列表折叠（独立按钮控制，与拖动宽度互不影响）
const asideCollapsed = ref(false);
function toggleAside() {
  asideCollapsed.value = !asideCollapsed.value;
}
const testingId = ref('');

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
function viewOptionsFor(w: OpsWin): Array<{ key: ViewKey; label: string }> {
  const c = connOf(w);
  const type = c ? connType(c) : 'ssh';
  return TYPE_VIEWS[type].map((k) => ({ key: k, label: VIEW_LABEL[k] }));
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
    termSessionId: '', termOpen: false, termConnecting: false,
    pendingInput: '', lastCommands: [], outputBuffer: '',
    containers: [], containersError: '',
    dbTables: [], dbTable: '', dbSql: '', dbLoading: false, dbError: '', dbResult: null,
    conversationId: '', chatMessages: [], chatInput: '', chatStreaming: false,
  };
}

/**
 * 打开连接：同连接 + 同视图的窗口已存在则直接激活（不重复开），否则新建。
 * want：'primary' 主视图 / 'chat' 对话模式 / 'file' 主视图 + 展开文件面板。
 */
function openConnection(c: OpsConn, want: 'primary' | 'chat' | 'file' = 'primary') {
  if (want === 'file' && connType(c) === 'database') want = 'primary';
  const targetView: ViewKey = want === 'chat' ? 'chat' : PRIMARY_VIEW[connType(c)];
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
  const w = newWin(c, PRIMARY_VIEW[connType(c)]);
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
  if (k === 'chat') scrollChatBottom(w);
  void nextTick(() => fitTerm(w));
}

/** 模式切换浮动按钮的图标 */
function viewIcon(v: ViewKey) {
  return v === 'chat' ? ChatDotRound : v === 'container' ? Box : v === 'db' ? DataLine : Monitor;
}
/** 右下角浮动按钮：在当前连接可用的视图之间循环切换 */
function cycleWinView(w: OpsWin) {
  const keys = viewOptionsFor(w).map((o) => o.key);
  if (keys.length < 2) return;
  const i = keys.indexOf(w.view);
  switchWinView(w, keys[(i + 1) % keys.length]);
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

/** 安全 fit：容器不可见 / 尺寸为 0 时跳过（隐藏窗口里 fit 会算出离谱行列，终端会变「很长」） */
function fitTerm(w: OpsWin) {
  const h = terms.get(w.id);
  if (!h) return;
  const el = h.el;
  if (!el.offsetWidth || !el.offsetHeight) return;
  try { h.fitAddon.fit(); } catch { /* 容器已卸载 */ }
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
    if (!h.term || !w.termSessionId) return;
    const { cols, rows } = h.term;
    if (!cols || !rows) return;
    if (cols === h.sent.cols && rows === h.sent.rows) return;
    h.sent = { cols, rows };
    void api.post(`/plugin/ops-shell/term/${w.termSessionId}/resize`, { cols, rows });
  }, 200);
}

/** 监听终端容器尺寸变化 → refit + 去抖上报（展开/收起文件面板、拖动分隔条、窗口缩放都会触发） */
function watchTermSize(h: TermHandle, w: OpsWin) {
  h.ro?.disconnect();
  h.ro = new ResizeObserver(() => {
    fitTerm(w);
    scheduleResizePost(w);
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

async function openTerminal(w: OpsWin) {
  // 已有活着的 xterm（典型场景：从别的页面切回来）→ 只接回 DOM，不重开 PTY
  const alive = terms.get(w.id);
  if (alive) {
    attachTerm(alive, w);
    return;
  }
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
      term, fitAddon, stream: null, ro: null, timer: null,
      sent: { cols: 0, rows: 0 }, el,
    };
    terms.set(w.id, handle);
    fitTerm(w);
    const cols = term.cols || 120;
    const rows = term.rows || 32;

    const r = await api.post<{ sessionId: string; defaultCommand?: string | null; autoRun?: boolean }>(
      '/plugin/ops-shell/term/open',
      { connectionId: c.id, cols, rows },
    );
    if ('error' in r) {
      ElMessage.error(r.error);
      disposeTerminal(w);
      return;
    }
    w.termSessionId = r.data.sessionId;
    handle.sent = { cols, rows };
    if (r.data.autoRun && r.data.defaultCommand) {
      ElMessage.info(`已自动执行默认命令: ${r.data.defaultCommand}`);
    }

    term.onData((data) => {
      void api.post(`/plugin/ops-shell/term/${w.termSessionId}/input`, { data });
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

    const ac = new AbortController();
    handle.stream = ac;
    const token = localStorage.getItem('auth_token') || '';
    void (async () => {
      try {
        const resp = await fetch(`${API_BASE}/plugin/ops-shell/term/${w.termSessionId}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });
        const reader = resp.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const payload = line.slice(5);
            if (payload === ':connected') continue;
            let text = '';
            try { text = b64ToUtf8(payload); } catch { continue; }
            terms.get(w.id)?.term.write(text);
            accumulateOutput(w, text);
          }
        }
      } catch { /* 会话关闭/网络中断，静默 */ }
    })();
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
    h.ro?.disconnect();
    h.stream?.abort();
    h.term.dispose();
    terms.delete(w.id);
  }
  if (w.termSessionId) void api.post(`/plugin/ops-shell/term/${w.termSessionId}/close`, {});
  w.termSessionId = '';
  w.termOpen = false;
  resetTerminalContext(w);
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
/** 该窗口终端现场摘要（仅终端已连接且有内容时返回，避免污染普通对话） */
function terminalContextHint(w: OpsWin): string {
  if (!w.termOpen) return '';
  const cmds = w.lastCommands.slice(-6).join('\n');
  const out = stripAnsi(w.outputBuffer).slice(-1200).trim();
  if (!cmds && !out) return '';
  return `\n\n（当前终端现场——最近命令：\n${cmds || '（无）'}\n最近输出尾部：\n${out || '（无）'}）`;
}

// ===== 对话模式：每窗口独立会话，不依赖全局 chat store =====
// 关键约束：普通对话页的 currentConvId/currentMessages 是全局单例状态，
// 这里绝不读写它们 —— 每个窗口各自一条 conversation 行（绑定 a_builtin_ops_agent），
// 消息走窗口自有列表 + 后端 message 表（含 tool_calls_json），互不串扰。
async function ensureWinConversation(w: OpsWin): Promise<string> {
  if (w.conversationId) return w.conversationId;
  const c = connOf(w);
  const r = await api.post<any>('/conversations', {
    title: `运维控制台${c ? ' · ' + c.name : ''}`,
    agentId: OPS_AGENT_ID,
  });
  if ('error' in r) throw new Error(r.error);
  w.conversationId = (r.data as any).id as string;
  return w.conversationId;
}

async function loadWinMessages(w: OpsWin) {
  if (!w.conversationId) return;
  const r = await api.get<any[]>(`/conversations/${w.conversationId}/messages`);
  if ('data' in r) {
    w.chatMessages = (r.data as any[]).map((m) => ({
      id: m.id, role: m.role, content: m.content || '',
      subAgentName: m.sub_agent_name || null, createdAt: m.created_at,
    }));
  }
}

function scrollChatBottom(w: OpsWin) {
  void nextTick(() => {
    const el = chatEls.get(w.id);
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function sendWinChat(w: OpsWin) {
  const content = w.chatInput.trim();
  if (!content || w.chatStreaming) return;
  const platform = platformStore.platforms.find((p) => p.id === settingsStore.settings.defaultPlatformId);
  const model = platformStore.models.find((m) => m.id === settingsStore.settings.defaultModelId);
  if (!platform || !model) {
    ElMessage.warning('请先在「设置」配置默认平台与模型（对话模式需要）');
    return;
  }
  try {
    if (!w.conversationId) await ensureWinConversation(w);
  } catch (e) {
    ElMessage.error('创建会话失败: ' + (e as Error).message);
    return;
  }

  // 上下文提示：把本窗口的连接（含类型）带给运维助手
  const c = connOf(w);
  let connHint: string;
  if (c) {
    const extra =
      connType(c) === 'database' ? `，${c.dbType === 'postgres' ? 'PostgreSQL' : 'MySQL'}，库名 ${c.database || '（未指定）'}` : '';
    connHint = `\n\n（当前选定连接：${c.name}，类型 ${TYPE_LABELS[connType(c)]}，${c.username}@${c.host}:${c.port}${extra}${c.tag ? '，标签 ' + c.tag : ''}）`;
  } else {
    connHint = '\n\n（尚未选定连接，请先选择或在工具参数里指定连接名）';
  }
  w.chatInput = '';
  w.chatStreaming = true;
  w.chatMessages.push({ id: `local-${Date.now()}`, role: 'user', content, createdAt: Date.now() });
  scrollChatBottom(w);

  // 终端已连接时把现场（最近命令 + 输出尾部）一并带上，让助手直接看到报错现场
  const prompt = content + connHint + terminalContextHint(w);

  const ac = new AbortController();
  chatAborts.set(w.id, ac);
  try {
    const taskRes = await api.post<any>('/llm/tasks', {
      conversationId: w.conversationId,
      platformId: platform.id,
      modelId: model.id,
      userContent: prompt,
      agentId: OPS_AGENT_ID,
    });
    if ('error' in taskRes) throw new Error(taskRes.error);
    await subscribeWinTask(w, taskRes.data.taskId as string, ac);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') ElMessage.error('执行失败: ' + (e as Error).message);
  } finally {
    w.chatStreaming = false;
    chatAborts.delete(w.id);
    // 服务端为准：结束后拉取规范消息列表（含子智能体消息与最终回复）
    await loadWinMessages(w);
    scrollChatBottom(w);
  }
}

async function abortWinChat(w: OpsWin) {
  chatAborts.get(w.id)?.abort();
  if (!w.conversationId) return;
  try {
    const token = localStorage.getItem('auth_token') || '';
    // taskId 本地未存时按会话查活动任务
    const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${w.conversationId}`);
    const taskId = ('data' in r && r.data?.[0]?.id) || null;
    if (taskId) await fetch(`${API_BASE}/llm/tasks/${taskId}/abort`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch { /* 忽略 */ }
}

/** 窗口专属 SSE 订阅：与 chat store 的 subscribeTaskSse 同协议，但状态完全本地 */
async function subscribeWinTask(w: OpsWin, taskId: string, ac: AbortController): Promise<void> {
  const token = localStorage.getItem('auth_token') || '';
  const resp = await fetch(`${API_BASE}/llm/tasks/${taskId}/stream?since=0`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: ac.signal,
  });
  if (!resp.ok || !resp.body) throw new Error('SSE 连接失败');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const raw of events) {
      const line = raw.trim();
      if (!line.startsWith('data: ')) continue;
      let event: any;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }
      if (event.type === 'message:added') {
        const msg = event.message;
        if (!w.chatMessages.some((m) => m.id === msg.id)) {
          w.chatMessages.push({
            id: msg.id, role: msg.role, content: msg.content || '',
            subAgentName: msg.subAgentName || msg.sub_agent_name || null,
            streaming: msg.role === 'assistant', createdAt: Date.now(),
          });
        }
        scrollChatBottom(w);
      } else if (event.type === 'chunk') {
        // 追加到最后一条流式中的助手消息（子智能体消息按名称单独成泡，chunk 不细分）
        const list = w.chatMessages;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].role === 'assistant' && list[i].streaming) {
            if (event.content) list[i].content += event.content;
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
        return;
      }
    }
  }
  for (const m of w.chatMessages) m.streaming = false;
}

// ===== 助手消息 markdown 渲染（对齐主对话 ChatMessageList：工具块清理 + 代码高亮 + 复制） =====
const md = new MarkdownIt({
  html: false, linkify: true, breaks: true,
  highlight(str: string, lang: string): string {
    const codeClass = lang ? ` class="language-${lang}"` : '';
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        const h = hljs.highlight(str, { language: lang }).value;
        return `<pre class="hljs ops-code">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${h}</code></pre>`;
      } catch {}
    }
    return `<pre class="hljs ops-code">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

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
      return '<span class="ops-inline-tool">⚙ 正在调用工具</span>';
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
function connSub(c: OpsConn): string {
  if (connType(c) === 'database') {
    return `${c.dbType === 'postgres' ? 'pgsql' : 'mysql'} · ${c.username}@${c.host}:${c.port}/${c.database || ''}`;
  }
  return `${c.username}@${c.host}:${c.port}`;
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

// ===== 左侧目录树 =====
const groupTree = computed(() => {
  const tree = groups.value.map((g) => ({
    id: g.id,
    name: g.name,
    real: true,
    items: connections.value.filter((c) => c.groupId === g.id),
  }));
  const loose = connections.value.filter((c) => !c.groupId || !groups.value.some((g) => g.id === c.groupId));
  if (loose.length || !tree.length) tree.push({ id: UNGROUPED, name: '未分组', items: loose, real: false });
  return tree;
});
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

// ===== 目录（分类分组）管理 =====
async function promptNewGroup() {
  const r = await ElMessageBox.prompt('目录名称', '新建目录', {
    confirmButtonText: '创建', cancelButtonText: '取消', inputPlaceholder: '如 生产环境 / 测试机 / 数据库',
    inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空'),
  }).catch(() => null);
  if (!r) return;
  const res = await api.post<{ id: string; name: string }>('/plugin/ops-shell/groups', { name: r.value.trim() });
  if ('error' in res) { ElMessage.error(res.error); return; }
  await loadGroups();
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
    const ok = await ElMessageBox.confirm(
      `删除目录「${g.name}」？${count ? `其中 ${count} 个资源会移回「未分组」，资源本身不会删除。` : ''}`,
      '确认', { type: 'warning' },
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
type GroupNode = { id: string; name: string; real: boolean; items: OpsConn[] };
const treeCtx = ref<{ visible: boolean; x: number; y: number; conn: OpsConn | null; group: GroupNode | null }>({
  visible: false, x: 0, y: 0, conn: null, group: null,
});
const ctxConnGroupId = computed(() => treeCtx.value.conn?.groupId || '');
const ctxCanFile = computed(() => !!treeCtx.value.conn && connType(treeCtx.value.conn) !== 'database');

function onConnCtx(c: OpsConn, ev: MouseEvent) {
  treeCtx.value = { visible: true, x: ev.clientX, y: ev.clientY, conn: c, group: null };
}
function onGroupCtx(g: GroupNode, ev: MouseEvent) {
  treeCtx.value = { visible: true, x: ev.clientX, y: ev.clientY, conn: null, group: g };
}
/** 列表空白处右键：只给「新建」（连接 / 目录） */
function onTreeCtx(ev: MouseEvent) {
  treeCtx.value = { visible: true, x: ev.clientX, y: ev.clientY, conn: null, group: null };
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

// ===== 窗口标签右键菜单 =====
const tabCtx = ref<{ visible: boolean; x: number; y: number; win: OpsWin | null }>({
  visible: false, x: 0, y: 0, win: null,
});
function onWinCtx(w: OpsWin, ev: MouseEvent) {
  tabCtx.value = { visible: true, x: ev.clientX, y: ev.clientY, win: w };
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
  const ok = await ElMessageBox.confirm(`删除连接「${c.name}」？`, '确认', { type: 'warning' })
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
    const r = await api.post<{ ok: boolean; message?: string }>('/plugin/ops-shell/connections/test', {
      type: connType(c), host: c.host, port: c.port, username: c.username, dbType: c.dbType, database: c.database,
    });
    if ('error' in r) { ElMessage.error(r.error); return; }
    if (r.data.ok) ElMessage.success(r.data.message || '连接成功');
    else ElMessage.error(r.data.message || '连接失败');
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
interface AuditEntry { at: number; action: string; connection?: string; detail?: string; ok: boolean }
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
  if (!platformStore.platforms.length) {
    void platformStore.loadPlatforms().then(() => {
      const pid = settingsStore.settings.defaultPlatformId;
      if (pid && !platformStore.models.some((m) => m.platformId === pid)) void platformStore.loadModels(pid);
    });
  }
}
init();

// 从别的页面切回来：把仍然活着的终端接回新容器（不重开 PTY），并滚到底部
onMounted(() => {
  void nextTick(() => {
    for (const w of windows.value) {
      const h = terms.get(w.id);
      if (h) attachTerm(h, w);
      if (w.view === 'chat') scrollChatBottom(w);
    }
  });
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKeydown);
  // 这里**不**销毁终端与对话：切到别的页面后要保留 shell 连接与对话会话，
  // 回来时由 onMounted → attachTerm 把 xterm DOM 接回新容器。
  // 真正的销毁时机是用户主动「断开」或关闭窗口标签（见 closeTerminal / closeWindow）。
});
</script>

<style scoped>
.ops-console {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  /* 列表 hover / 右键菜单 hover 统一底色：行与菜单共用同一个**不透明**色，
     半透明色叠两层会形成硬边色带（原来 hover 按钮那版就是这里脏） */
  --ops-row-hover: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface));
  --ops-row-active: color-mix(in srgb, var(--color-primary) 13%, var(--color-surface));
}
.ops-layout { flex: 1; display: flex; gap: 6px; min-height: 0; position: relative; }
.ops-connections {
  flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0;
  padding-right: 10px; border-right: 1px solid var(--glass-border);
}

/* 折叠按钮：贴左边缘竖条（与「对话」页 .conv-toggle 一致） */
.ops-aside-toggle {
  position: absolute; left: calc(var(--ops-aside-w, 260px) + 5px); top: 50%; transform: translateY(-50%);
  width: 20px; height: 48px;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border); border-left: none; border-radius: 0 8px 8px 0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 5; font-size: 12px; color: var(--color-text-secondary);
  transition: left 0.25s ease;
}
.ops-aside-toggle:hover { color: var(--color-primary); background: var(--glass-bg-hover); }

/* ===== 面板拖拽分隔条（与 Chat 页 .rs-handle 一致） ===== */
.rs-handle {
  flex: 0 0 7px; width: 7px; cursor: col-resize; position: relative; z-index: 6;
  background: transparent; transition: background 0.15s ease;
}
.rs-handle::after {
  content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 2px;
  transform: translateX(-50%); border-radius: 1px;
  background: var(--glass-border, rgba(148, 163, 184, 0.28));
  transition: background 0.15s ease, width 0.15s ease, opacity 0.15s ease;
}
.rs-handle:hover, .rs-handle:active { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.rs-handle:hover::after, .rs-handle:active::after { background: var(--color-primary); width: 3px; }
.ops-tree-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 2px 6px; flex-shrink: 0;
}
.ops-tree-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.ops-tree { flex: 1; min-height: 0; overflow-y: auto; }
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

/* 资源 / 目录 右键菜单 */
.ops-ctxmenu {
  position: fixed; z-index: 3000; min-width: 132px; padding: 4px;
  background: var(--color-surface); border: 1px solid var(--glass-border);
  border-radius: 8px; box-shadow: var(--shadow-lg);
}
.ops-ctxmenu-item {
  padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;
  color: var(--color-text); white-space: nowrap;
}
.ops-ctxmenu-item:hover { background: var(--ops-row-hover); }
.ops-ctxmenu-item.is-disabled { opacity: 0.45; pointer-events: none; }
.ops-ctxmenu-item.is-danger { color: var(--el-color-danger); }

/* ===== 工作区 ===== */
.ops-workspace { flex: 1; min-width: 0; display: flex; flex-direction: column; }
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

/* 模式切换：右下角浮动图标按钮（不占窗口头那一行高度） */
.ops-view-fab {
  position: absolute; right: 16px; bottom: 16px; z-index: 8;
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--color-text-secondary);
  background: var(--color-surface); border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-md);
  transition: color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.ops-view-fab:hover { color: var(--color-primary); border-color: var(--color-primary); transform: translateY(-1px); }

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
.ops-md pre {
  background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 8px;
  overflow-x: auto; font-family: "JetBrains Mono", Consolas, monospace; font-size: 12px;
  margin: 8px 0; max-width: 100%; white-space: pre-wrap; word-break: break-all;
}
.ops-md pre code { background: transparent; padding: 0; color: inherit; }
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
.ops-chat-actions { display: flex; align-items: center; gap: 8px; padding: 0 6px 2px; }
.ops-chat-actions :deep(.el-button + .el-button) { margin-left: 0; }

/* 操作日志 */
.ops-audit { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.ops-empty { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; font-size: 12px; color: var(--color-text-tertiary); text-align: center; line-height: 1.8; }
.ops-log-view {
  margin: 0; max-height: 60vh; overflow: auto; padding: 10px; border-radius: 8px;
  background: #141414; color: #e5e5e0; font-size: 12px; font-family: Consolas, monospace; white-space: pre-wrap;
}
</style>
