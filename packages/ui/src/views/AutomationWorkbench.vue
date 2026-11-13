<template>
  <div class="rpa-page">
    <header class="rpa-topbar">
      <div class="rpa-title-group">
        <span class="rpa-mode-icon" aria-hidden="true"><el-icon :size="16"><MagicStick /></el-icon></span>
        <div>
          <h1>自动化</h1>
          <p>把重复操作保存成可验证、可重放的固定脚本</p>
        </div>
      </div>
      <div class="rpa-top-stats" aria-label="脚本统计">
        <span><b>{{ store.publishedCount }}</b> 已发布</span>
        <span><b>{{ store.draftCount }}</b> 草稿</span>
      </div>
      <div class="rpa-top-actions">
        <button v-if="isElectron" class="rpa-btn ghost" type="button" @click="openRecorder">
          <el-icon :size="14"><VideoCamera /></el-icon>
          录制浏览器
        </button>
        <button class="rpa-btn ghost" type="button" @click="openBuilder">
          <el-icon :size="14"><ChatLineRound /></el-icon>
          AI 帮我创建
        </button>
        <button class="rpa-btn primary" type="button" @click="openCreate">
          <el-icon :size="14"><Plus /></el-icon>
          新建脚本
        </button>
      </div>
    </header>

    <div class="rpa-body">
      <aside class="rpa-library" aria-label="脚本库">
        <div class="rpa-search-wrap">
          <el-icon :size="14" class="rpa-search-icon"><Search /></el-icon>
          <input v-model="keyword" class="rpa-search" type="search" placeholder="搜索脚本、标签或状态" aria-label="搜索自动化脚本" />
        </div>
        <div class="rpa-filter" role="tablist" aria-label="脚本筛选">
          <button
            v-for="item in filters"
            :key="item.value"
            class="rpa-filter-btn"
            :class="{ active: filter === item.value }"
            type="button"
            role="tab"
            :aria-selected="filter === item.value"
            @click="filter = item.value"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="rpa-script-list" role="list">
          <button
            v-for="script in filteredScripts"
            :key="script.id"
            class="rpa-script-row"
            :class="{ active: script.id === current?.id }"
            type="button"
            role="listitem"
            @click="selectScript(script.id)"
          >
            <span class="rpa-script-icon" :class="`is-${script.kind}`">
              <el-icon :size="15"><Monitor v-if="script.kind === 'desktop'" /><Connection v-else /></el-icon>
            </span>
            <span class="rpa-script-copy">
              <span class="rpa-script-name">{{ script.name }}</span>
              <span class="rpa-script-meta">
                {{ kindLabel(script.kind) }} · v{{ script.version }}
                <template v-if="script.lastRun"> · {{ runStatusLabel(script.lastRun.status) }}</template>
              </span>
            </span>
            <span class="rpa-script-state" :class="script.status">
              {{ script.status === 'published' ? '已发布' : script.status === 'draft' ? '草稿' : '归档' }}
            </span>
          </button>

          <div v-if="!filteredScripts.length && !store.loading" class="rpa-library-empty">
            <el-icon :size="24"><Document /></el-icon>
            <b>{{ keyword || filter !== 'all' ? '没有匹配的脚本' : '还没有自动化脚本' }}</b>
            <span>{{ keyword || filter !== 'all' ? '换个关键词或筛选条件' : '新建脚本，或在对话里让自动化脚本设计师帮你创建' }}</span>
            <button v-if="!keyword && filter === 'all'" class="rpa-btn small" type="button" @click="openCreate">新建第一个脚本</button>
          </div>
        </div>

        <div class="rpa-library-note">
          <el-icon :size="13"><MagicStick /></el-icon>
          <span>正常回放不调用模型，发布版本不可被原地覆盖。</span>
        </div>
      </aside>

      <main class="rpa-workspace">
        <div v-if="store.scripts.length" class="rpa-mobile-picker">
          <label for="rpa-mobile-script">当前脚本</label>
          <select id="rpa-mobile-script" :value="current?.id || ''" @change="selectScript(($event.target as HTMLSelectElement).value)">
            <option v-for="script in filteredScripts" :key="script.id" :value="script.id">
              {{ script.name }} · v{{ script.version }}
            </option>
          </select>
        </div>
        <section v-if="!current" class="rpa-main-empty">
          <div class="rpa-empty-orbit" aria-hidden="true">
            <span></span><span></span><span></span>
            <el-icon :size="28"><Connection /></el-icon>
          </div>
          <h2>选择一条脚本开始编辑</h2>
          <p>也可以直接描述重复业务，让自动化脚本设计师先产出一版草稿。</p>
          <div class="rpa-empty-actions">
            <button class="rpa-btn primary" type="button" @click="openCreate">
              <el-icon :size="14"><Plus /></el-icon>
              手动创建
            </button>
            <button class="rpa-btn ghost" type="button" @click="openBuilder">
              <el-icon :size="14"><ChatLineRound /></el-icon>
              让 AI 设计
            </button>
          </div>
        </section>

        <template v-else>
          <header class="rpa-script-head">
            <div class="rpa-script-heading">
              <span class="rpa-kicker">{{ kindLabel(current.kind) }}脚本</span>
              <h2>{{ current.name }}</h2>
              <p>{{ current.description || '补充一段说明，方便以后识别这条流程。' }}</p>
            </div>
            <div class="rpa-script-actions">
              <button class="rpa-btn ghost" type="button" :disabled="saving" @click="saveDraft">
                <el-icon :size="14"><DocumentChecked /></el-icon>
                {{ dirty ? '保存草稿' : '已保存' }}
              </button>
              <button class="rpa-btn ghost" type="button" :disabled="running" @click="runScript(true)">
                <el-icon :size="14"><VideoPlay /></el-icon>
                试运行
              </button>
              <button class="rpa-btn primary" type="button" :disabled="running || !current.publishedVersion" @click="runScript(false)">
                <el-icon :size="14"><VideoPlay /></el-icon>
                运行
              </button>
              <button class="rpa-btn publish" type="button" :disabled="publishing" @click="publish">
                <el-icon :size="14"><CircleCheck /></el-icon>
                {{ current.publishedVersion === current.version ? '已发布' : '发布' }}
              </button>
            </div>
          </header>

          <div class="rpa-run-strip" :class="activeRun ? activeRun.status : 'idle'">
            <div class="rpa-run-strip-main">
              <span class="rpa-live-dot" aria-hidden="true"></span>
              <strong>{{ activeRun ? runStatusLabel(activeRun.status) : '待命' }}</strong>
              <span v-if="activeRun">
                {{ activeRun.scriptName }} · v{{ activeRun.scriptVersion }}
                <template v-if="activeRun.startedAt"> · {{ elapsedLabel(activeRun) }}</template>
              </span>
              <span v-else>试运行使用当前草稿；正式运行使用最近发布版本。</span>
            </div>
            <button v-if="running" class="rpa-text-btn danger" type="button" @click="cancelRun">停止运行</button>
            <span v-else-if="current.publishedVersion" class="rpa-version-chip">正式版本 v{{ current.publishedVersion }}</span>
            <span v-else class="rpa-version-chip warn">尚未发布</span>
          </div>

          <div class="rpa-editor-shell">
            <section class="rpa-timeline-panel">
              <div class="rpa-panel-head">
                <div>
                  <h3>流程步骤</h3>
                  <p>{{ draft?.steps.length || 0 }} 个动作 · 按顺序向下执行</p>
                </div>
                <div class="rpa-add-wrap">
                  <button class="rpa-icon-btn" type="button" title="添加步骤" aria-label="添加步骤" @click="addOpen = !addOpen">
                    <el-icon :size="16"><Plus /></el-icon>
                  </button>
                  <div v-if="addOpen" class="rpa-add-menu">
                    <button v-for="item in stepCatalog" :key="item.type" type="button" @click="addStep(item.type)">
                      <el-icon :size="14"><component :is="item.icon" /></el-icon>
                      <span><b>{{ item.label }}</b><small>{{ item.hint }}</small></span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="rpa-timeline">
                <article
                  v-for="(step, index) in draft?.steps || []"
                  :key="step.id"
                  class="rpa-step"
                  :class="[
                    { active: selectedStepId === step.id },
                    `step-${runStepState(step.id)}`,
                  ]"
                >
                  <button class="rpa-step-main" type="button" @click="selectedStepId = step.id">
                    <span class="rpa-step-index">{{ index + 1 }}</span>
                    <span class="rpa-step-icon"><el-icon :size="15"><component :is="stepIcon(step.type)" /></el-icon></span>
                    <span class="rpa-step-copy">
                      <span class="rpa-step-title">
                        {{ stepTitle(step.type) }}
                        <small v-if="step.note">{{ step.note }}</small>
                      </span>
                      <span class="rpa-step-summary">{{ stepSummary(step) }}</span>
                    </span>
                    <span class="rpa-step-status" :class="runStepState(step.id)">
                      <el-icon v-if="runStepState(step.id) === 'completed'" :size="14"><CircleCheck /></el-icon>
                      <el-icon v-else-if="runStepState(step.id) === 'failed'" :size="14"><WarningFilled /></el-icon>
                      <el-icon v-else-if="runStepState(step.id) === 'running'" :size="14"><Refresh /></el-icon>
                    </span>
                  </button>
                  <div class="rpa-step-tools">
                    <button type="button" title="上移" aria-label="上移步骤" :disabled="index === 0" @click="moveStep(index, -1)"><el-icon :size="13"><ArrowUp /></el-icon></button>
                    <button type="button" title="下移" aria-label="下移步骤" :disabled="index === (draft?.steps.length || 0) - 1" @click="moveStep(index, 1)"><el-icon :size="13"><ArrowDown /></el-icon></button>
                    <button type="button" title="删除" aria-label="删除步骤" @click="removeStep(index)"><el-icon :size="13"><Delete /></el-icon></button>
                  </div>
                </article>

                <button class="rpa-add-step-row" type="button" @click="addOpen = !addOpen">
                  <el-icon :size="14"><Plus /></el-icon>
                  添加下一步
                </button>
              </div>
            </section>

            <aside class="rpa-inspector">
              <div class="rpa-tabs" role="tablist">
                <button
                  v-for="tab in inspectorTabs"
                  :key="tab.key"
                  :class="{ active: inspectorTab === tab.key }"
                  type="button"
                  role="tab"
                  :aria-selected="inspectorTab === tab.key"
                  @click="inspectorTab = tab.key"
                >{{ tab.label }}</button>
              </div>

              <div v-if="inspectorTab === 'step'" class="rpa-inspector-body">
                <template v-if="stepModel">
                  <div class="rpa-inspector-title">
                    <span class="rpa-kicker">{{ stepTitle(stepModel.type) }}</span>
                    <h3>步骤设置</h3>
                  </div>
                  <label class="rpa-field">
                    <span>备注</span>
                    <input v-model="stepModel.note" type="text" placeholder="例如：导出昨日报表" @input="markDirty" />
                  </label>

                  <template v-if="stepModel.type === 'browser.navigate'">
                    <label class="rpa-field">
                      <span>页面地址</span>
                      <input v-model="stepModel.url" type="url" placeholder="https://..." @input="markDirty" />
                    </label>
                  </template>

                  <template v-else-if="stepModel.type === 'browser.click'">
                    <label class="rpa-field">
                      <span>定位方式</span>
                      <select :value="stepModel.target?.by" @change="changeStepTarget($event)">
                        <option value="role">角色 + 名称</option>
                        <option value="text">可见文本</option>
                        <option value="label">标签文本</option>
                        <option value="css">CSS 选择器</option>
                        <option value="index">页面编号</option>
                      </select>
                    </label>
                    <template v-if="stepModel.target?.by === 'role'">
                      <label class="rpa-field"><span>角色</span><input v-model="stepModel.target.role" type="text" placeholder="button / link / textbox" @input="markDirty" /></label>
                      <label class="rpa-field"><span>可访问名称</span><input v-model="stepModel.target.name" type="text" placeholder="导出" @input="markDirty" /></label>
                    </template>
                    <label v-else-if="stepModel.target?.by === 'text'" class="rpa-field"><span>可见文本</span><input v-model="stepModel.target.text" type="text" placeholder="导出" @input="markDirty" /></label>
                    <label v-else-if="stepModel.target?.by === 'label'" class="rpa-field"><span>标签文本</span><input v-model="stepModel.target.label" type="text" placeholder="日期" @input="markDirty" /></label>
                    <label v-else-if="stepModel.target?.by === 'css'" class="rpa-field"><span>CSS 选择器</span><input v-model="stepModel.target.selector" type="text" placeholder="#export-button" @input="markDirty" /></label>
                    <label v-else-if="stepModel.target?.by === 'index'" class="rpa-field"><span>页面编号</span><input v-model.number="stepModel.target.index" type="number" min="0" @input="markDirty" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'browser.type'">
                    <label class="rpa-field">
                      <span>输入内容</span>
                      <textarea v-model="stepModel.text" rows="4" placeholder="{{keyword}}" @input="markDirty"></textarea>
                    </label>
                    <label class="rpa-check"><input v-model="stepModel.pressEnter" type="checkbox" @change="markDirty" /><span>输入后按 Enter</span></label>
                  </template>

                  <template v-else-if="stepModel.type === 'browser.press'">
                    <label class="rpa-field"><span>按键</span><input :value="stepModel.keys.join(',')" type="text" placeholder="Enter" @input="updateStepKeys($event)" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'browser.wait'">
                    <label class="rpa-field"><span>等待毫秒</span><input v-model.number="stepModel.ms" type="number" min="100" step="100" @input="markDirty" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'browser.waitFor'">
                    <label class="rpa-field"><span>等待出现的文本</span><input v-model="stepModel.text" type="text" placeholder="下载完成" @input="markDirty" /></label>
                    <label class="rpa-field"><span>或等待选择器</span><input v-model="stepModel.selector" type="text" placeholder=".success-message" @input="markDirty" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'browser.assertText'">
                    <label class="rpa-field"><span>必须出现的文本</span><input v-model="stepModel.text" type="text" placeholder="导出完成" @input="markDirty" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'browser.extractText'">
                    <label class="rpa-field"><span>保存到变量</span><input v-model="stepModel.saveAs" type="text" placeholder="resultText" @input="markDirty" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'desktop.activateWindow'">
                    <label class="rpa-field"><span>进程名</span><input v-model="stepModel.processName" type="text" placeholder="notepad.exe / Weixin" @input="markDirty" /></label>
                    <label class="rpa-field"><span>窗口标题包含</span><input v-model="stepModel.titleContains" type="text" placeholder="可选，例如：工作记录" @input="markDirty" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'desktop.click'">
                    <div v-if="stepModel.target?.by !== 'windowPoint'" class="rpa-step-hint">
                      <el-icon :size="14"><WarningFilled /></el-icon>
                      <span>当前桌面执行器支持窗口相对坐标。此步骤需要重新指定窗口坐标。</span>
                      <button type="button" @click="useWindowPoint">转换</button>
                    </div>
                    <template v-else>
                      <div class="rpa-field-row">
                        <label class="rpa-field"><span>窗口内 X</span><input v-model.number="stepModel.target.x" type="number" @input="markDirty" /></label>
                        <label class="rpa-field"><span>窗口内 Y</span><input v-model.number="stepModel.target.y" type="number" @input="markDirty" /></label>
                      </div>
                      <label class="rpa-check"><input v-model="stepModel.double" type="checkbox" @change="markDirty" /><span>双击</span></label>
                    </template>
                  </template>

                  <template v-else-if="stepModel.type === 'desktop.type'">
                    <label class="rpa-field"><span>输入内容</span><textarea v-model="stepModel.text" rows="3" placeholder="{{value}}" @input="markDirty"></textarea></label>
                  </template>

                  <template v-else-if="stepModel.type === 'desktop.press'">
                    <label class="rpa-field"><span>组合键</span><input :value="stepModel.keys.join('+')" type="text" placeholder="ctrl+s" @input="updateStepKeys($event)" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'file.exists' || stepModel.type === 'file.wait'">
                    <label class="rpa-field"><span>文件路径</span><input v-model="stepModel.path" type="text" placeholder="{{outputPath}}" @input="markDirty" /></label>
                    <label v-if="stepModel.type === 'file.wait'" class="rpa-field"><span>超时毫秒</span><input v-model.number="stepModel.timeoutMs" type="number" min="100" step="1000" @input="markDirty" /></label>
                  </template>

                  <template v-else-if="stepModel.type === 'file.copy' || stepModel.type === 'file.move'">
                    <label class="rpa-field"><span>源文件</span><input v-model="stepModel.from" type="text" placeholder="{{sourcePath}}" @input="markDirty" /></label>
                    <label class="rpa-field"><span>目标文件</span><input v-model="stepModel.to" type="text" placeholder="{{targetPath}}" @input="markDirty" /></label>
                    <label class="rpa-check"><input v-model="stepModel.overwrite" type="checkbox" @change="markDirty" /><span>覆盖已有目标文件</span></label>
                  </template>

                  <div v-if="stepModel.type.startsWith('desktop.')" class="rpa-step-hint">
                    <el-icon :size="14"><WarningFilled /></el-icon>
                    <span>桌面步骤使用窗口相对坐标，执行前会自动激活绑定窗口。UIA 和图像模板定位尚未接入。</span>
                  </div>
                </template>
                <div v-else class="rpa-inspector-empty">从时间线选择一个步骤</div>
              </div>

              <div v-else-if="inspectorTab === 'run'" class="rpa-inspector-body">
                <div class="rpa-inspector-title">
                  <span class="rpa-kicker">运行参数</span>
                  <h3>{{ activeRun ? '运行现场' : '准备运行' }}</h3>
                </div>
                <div v-if="draft?.params.length" class="rpa-param-list">
                  <label v-for="param in draft.params" :key="param.key" class="rpa-field">
                    <span>{{ param.label }} <small v-if="param.required">必填</small></span>
                    <input
                      v-if="param.type !== 'boolean'"
                      v-model="runValues[param.key]"
                      :type="param.type === 'number' ? 'number' : 'text'"
                      :placeholder="param.description || param.key"
                    />
                    <span v-else class="rpa-check inline">
                      <input v-model="runValues[param.key]" type="checkbox" />
                      <span>{{ param.description || '启用' }}</span>
                    </span>
                  </label>
                </div>
                <div v-else class="rpa-muted-box">该脚本没有运行参数。</div>

                <div v-if="activeRun" class="rpa-run-card">
                  <div class="rpa-run-card-head">
                    <span class="rpa-status-pill" :class="activeRun.status">{{ runStatusLabel(activeRun.status) }}</span>
                    <small>{{ formatTime(activeRun.startedAt || activeRun.createdAt) }}</small>
                  </div>
                  <div v-for="result in activeRun.steps" :key="result.stepId" class="rpa-run-step" :class="result.status">
                    <span>{{ result.stepId }}</span>
                    <b>{{ result.status === 'completed' ? '完成' : '失败' }}</b>
                    <small>{{ result.error || durationMs(result.startedAt, result.finishedAt) }}</small>
                  </div>
                </div>

                <div class="rpa-run-actions">
                  <button class="rpa-btn ghost" type="button" :disabled="running" @click="runScript(true)">试运行当前草稿</button>
                  <button class="rpa-btn primary" type="button" :disabled="running || !current.publishedVersion" @click="runScript(false)">运行正式版本</button>
                </div>
              </div>

              <div v-else-if="draft" class="rpa-inspector-body">
                <div class="rpa-inspector-title">
                  <span class="rpa-kicker">脚本信息</span>
                  <h3>基础设置</h3>
                </div>
                <label class="rpa-field">
                  <span>名称</span>
                  <input v-model="draft.name" type="text" @input="markDirty" />
                </label>
                <label class="rpa-field">
                  <span>说明</span>
                  <textarea v-model="draft.description" rows="4" placeholder="这条脚本解决什么问题" @input="markDirty"></textarea>
                </label>
                <div class="rpa-info-grid">
                  <span><small>类型</small><b>{{ kindLabel(current.kind) }}</b></span>
                  <span><small>当前版本</small><b>v{{ current.version }}</b></span>
                  <span><small>发布版本</small><b>{{ current.publishedVersion ? `v${current.publishedVersion}` : '未发布' }}</b></span>
                  <span><small>创建时间</small><b>{{ formatTime(current.createdAt) }}</b></span>
                </div>
                <button class="rpa-danger-action" type="button" @click="deleteCurrent">
                  <el-icon :size="14"><Delete /></el-icon>
                  删除脚本
                </button>
                <button v-if="current.publishedVersion" class="rpa-schedule-action" type="button" @click="openSchedule">
                  <el-icon :size="14"><Clock /></el-icon>
                  添加定时运行
                </button>
              </div>
            </aside>
          </div>
        </template>
      </main>
    </div>

    <el-dialog v-model="createOpen" title="新建自动化脚本" width="520px" append-to-body>
      <div class="rpa-dialog-form">
        <label class="rpa-field">
          <span>脚本名称</span>
          <input v-model="createForm.name" type="text" placeholder="例如：每日报表同步" />
        </label>
        <label class="rpa-field">
          <span>说明</span>
          <textarea v-model="createForm.description" rows="3" placeholder="目标系统、输入和预期产物"></textarea>
        </label>
        <label class="rpa-field">
          <span>脚本类型</span>
          <select v-model="createForm.kind">
            <option value="browser">浏览器脚本</option>
            <option value="desktop">桌面脚本</option>
            <option value="hybrid">混合脚本</option>
          </select>
        </label>
        <label v-if="createForm.kind !== 'desktop'" class="rpa-field">
          <span>首个页面地址</span>
          <input v-model="createForm.url" type="url" placeholder="https://example.com" />
        </label>
        <label v-else class="rpa-field">
          <span>目标进程名</span>
          <input v-model="createForm.processName" type="text" placeholder="notepad.exe / Weixin" />
        </label>
        <div class="rpa-type-note">
          <el-icon :size="15"><Connection /></el-icon>
          <span>
            <b>{{ kindLabel(createForm.kind) }}脚本</b>
            <small>浏览器步骤使用语义定位；桌面步骤使用窗口相对坐标；文件步骤可直接校验产物。</small>
          </span>
        </div>
      </div>
      <template #footer>
        <button class="rpa-btn ghost" type="button" @click="createOpen = false">取消</button>
        <button class="rpa-btn primary" type="button" :disabled="creating" @click="createScript">{{ creating ? '创建中…' : '创建草稿' }}</button>
      </template>
    </el-dialog>

    <el-dialog v-model="scheduleOpen" title="定时运行自动化脚本" width="460px" append-to-body>
      <div class="rpa-dialog-form">
        <label class="rpa-field">
          <span>任务名称</span>
          <input v-model="scheduleForm.name" type="text" />
        </label>
        <label class="rpa-field">
          <span>执行频率</span>
          <select v-model="scheduleForm.mode">
            <option value="daily">每天定时</option>
            <option value="interval">按间隔</option>
          </select>
        </label>
        <label v-if="scheduleForm.mode === 'daily'" class="rpa-field">
          <span>执行时间</span>
          <input v-model="scheduleForm.time" type="time" />
        </label>
        <label v-else class="rpa-field">
          <span>间隔分钟</span>
          <input v-model.number="scheduleForm.intervalMinutes" type="number" min="1" />
        </label>
        <div class="rpa-type-note">
          <el-icon :size="15"><Clock /></el-icon>
          <span><b>{{ current?.name }}</b><small>固定使用当前已发布版本 v{{ current?.publishedVersion }}</small></span>
        </div>
      </div>
      <template #footer>
        <button class="rpa-btn ghost" type="button" @click="scheduleOpen = false">取消</button>
        <button class="rpa-btn primary" type="button" :disabled="scheduling" @click="createSchedule">{{ scheduling ? '创建中…' : '创建定时任务' }}</button>
      </template>
    </el-dialog>

    <el-dialog v-model="recordOpen" title="录制浏览器脚本" width="460px" append-to-body>
      <div class="rpa-dialog-form">
        <label class="rpa-field">
          <span>起始页面</span>
          <input v-model="recordForm.url" type="url" placeholder="https://example.com" />
        </label>
        <div class="rpa-type-note">
          <el-icon :size="15"><VideoCamera /></el-icon>
          <span><b>只记录高层动作</b><small>点击、输入、回车和敏感字段脱敏；关闭后自动生成步骤草稿。</small></span>
        </div>
      </div>
      <template #footer>
        <button class="rpa-btn ghost" type="button" @click="recordOpen = false">取消</button>
        <button class="rpa-btn primary" type="button" :disabled="recordingStarting" @click="startRecord">
          {{ recordingStarting ? '启动中…' : '开始录制' }}
        </button>
      </template>
    </el-dialog>

    <div v-if="recordingActive" class="rpa-recording-overlay">
      <header class="rpa-recording-bar">
        <span class="rpa-recording-dot"></span>
        <strong>正在录制</strong>
        <span>{{ recordingCount }} 个事件</span>
        <span class="rpa-recording-url">{{ recordForm.url }}</span>
        <div class="rpa-spacer"></div>
        <button class="rpa-btn ghost" type="button" :disabled="recordingStopping" @click="cancelRecord">取消</button>
        <button class="rpa-btn primary" type="button" :disabled="recordingStopping" @click="stopRecord">
          {{ recordingStopping ? '生成脚本中…' : '停止并生成脚本' }}
        </button>
      </header>
      <div class="rpa-recording-browser">
        <BrowserPanel scope="preview" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowDown,
  ArrowUp,
  ChatLineRound,
  CircleCheck,
  Connection,
  Delete,
  Document,
  DocumentChecked,
  EditPen,
  Clock,
  MagicStick,
  Monitor,
  Plus,
  Refresh,
  Search,
  VideoPlay,
  VideoCamera,
  WarningFilled,
} from '@element-plus/icons-vue';
import type {
  AutomationParamDef,
  AutomationRunStatus,
  AutomationScriptDraft,
  AutomationScriptKind,
  AutomationStep,
} from '@yan-zhi/shared';
import { useAutomationStore, scriptRecordToDraft } from '../stores/automation';
import { useChatStore } from '../stores/chat';
import { useScheduledTaskStore } from '../stores/scheduledTask';
import { isElectron } from '../api/client';

const BrowserPanel = defineAsyncComponent(() => import('../components/BrowserPanel.vue'));

const store = useAutomationStore();
const chatStore = useChatStore();
const scheduledTaskStore = useScheduledTaskStore();
const router = useRouter();

const keyword = ref('');
const filter = ref<'all' | 'published' | 'draft'>('all');
const current = computed(() => store.current);
const draft = ref<AutomationScriptDraft | null>(null);
const selectedStepId = ref('');
const inspectorTab = ref<'step' | 'run' | 'settings'>('step');
const dirty = ref(false);
const saving = ref(false);
const publishing = ref(false);
const creating = ref(false);
const createOpen = ref(false);
const scheduleOpen = ref(false);
const scheduling = ref(false);
const recordOpen = ref(false);
const recordingActive = ref(false);
const recordingStarting = ref(false);
const recordingStopping = ref(false);
const recordingId = ref('');
const recordingCount = ref(0);
const addOpen = ref(false);
const runValues = reactive<Record<string, unknown>>({});
const activeRun = computed(() => store.activeRun);
const running = computed(() => !!activeRun.value && ['queued', 'running', 'paused'].includes(activeRun.value.status));
let pollTimer: ReturnType<typeof setInterval> | null = null;
let recordingTimer: ReturnType<typeof setInterval> | null = null;

const filters = [
  { value: 'all' as const, label: '全部' },
  { value: 'published' as const, label: '已发布' },
  { value: 'draft' as const, label: '草稿' },
];

const inspectorTabs = [
  { key: 'step' as const, label: '步骤' },
  { key: 'run' as const, label: '运行' },
  { key: 'settings' as const, label: '设置' },
];

const stepCatalog = [
  { type: 'browser.navigate' as const, label: '打开页面', hint: '导航到目标 URL', icon: Connection },
  { type: 'browser.click' as const, label: '点击元素', hint: '按角色、文本或选择器定位', icon: EditPen },
  { type: 'browser.type' as const, label: '输入文本', hint: '填写表单或搜索框', icon: DocumentChecked },
  { type: 'browser.wait' as const, label: '固定等待', hint: '仅在无法等待条件时使用', icon: Refresh },
  { type: 'browser.waitFor' as const, label: '等待出现', hint: '等待文本或元素出现', icon: CircleCheck },
  { type: 'browser.assertText' as const, label: '断言文本', hint: '验证页面出现成功提示', icon: WarningFilled },
  { type: 'desktop.activateWindow' as const, label: '激活窗口', hint: '按进程和标题绑定目标窗口', icon: Monitor },
  { type: 'desktop.click' as const, label: '桌面点击', hint: '使用窗口内相对坐标', icon: Monitor },
  { type: 'desktop.type' as const, label: '桌面输入', hint: '向当前目标窗口键入文本', icon: DocumentChecked },
  { type: 'desktop.press' as const, label: '桌面按键', hint: '组合键或单键', icon: EditPen },
  { type: 'file.exists' as const, label: '检查文件', hint: '验证路径存在且为非空文件', icon: Document },
  { type: 'file.wait' as const, label: '等待文件', hint: '等待导出文件出现', icon: Refresh },
  { type: 'file.copy' as const, label: '复制文件', hint: '复制到目标路径并自动创建目录', icon: DocumentChecked },
  { type: 'file.move' as const, label: '移动文件', hint: '移动或重命名目标文件', icon: DocumentChecked },
];

const createForm = reactive({
  name: '',
  description: '',
  url: 'https://',
  processName: 'notepad.exe',
  kind: 'browser' as AutomationScriptKind,
});

const scheduleForm = reactive({
  name: '',
  mode: 'daily' as 'daily' | 'interval',
  time: '09:00',
  intervalMinutes: 60,
});

const recordForm = reactive({
  url: 'https://',
});

const filteredScripts = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return store.scripts.filter((script) => {
    if (filter.value === 'published' && !script.publishedVersion) return false;
    if (filter.value === 'draft' && script.publishedVersion && script.status !== 'draft') return false;
    if (!q) return true;
    return `${script.name} ${script.description || ''} ${script.kind}`.toLowerCase().includes(q);
  });
});

const selectedStep = computed(() => draft.value?.steps.find((step) => step.id === selectedStepId.value) || null);
const stepModel = computed(() => selectedStep.value as any);

function cloneDraft(value: AutomationScriptDraft): AutomationScriptDraft {
  return JSON.parse(JSON.stringify(value)) as AutomationScriptDraft;
}

function setupRunValues(params: AutomationParamDef[]): void {
  for (const key of Object.keys(runValues)) delete runValues[key];
  for (const param of params) {
    runValues[param.key] = param.defaultValue ?? (param.type === 'boolean' ? false : param.type === 'number' ? 0 : '');
  }
}

async function selectScript(id: string): Promise<void> {
  const record = await store.getScript(id);
  if (!record) return;
  draft.value = cloneDraft(scriptRecordToDraft(record));
  selectedStepId.value = draft.value.steps[0]?.id || '';
  inspectorTab.value = draft.value.steps.length ? 'step' : 'settings';
  dirty.value = false;
  setupRunValues(draft.value.params);
  await store.loadRuns(id);
}

function markDirty(): void {
  dirty.value = true;
}

function openCreate(): void {
  createForm.name = '';
  createForm.description = '';
  createForm.url = 'https://';
  createForm.processName = 'notepad.exe';
  createForm.kind = 'browser';
  createOpen.value = true;
}

async function createScript(): Promise<void> {
  const name = createForm.name.trim();
  const url = createForm.url.trim();
  if (!name) {
    ElMessage.warning('请填写脚本名称');
    return;
  }
  if (createForm.kind !== 'desktop' && !/^https?:\/\//i.test(url)) {
    ElMessage.warning('首个页面地址必须以 http:// 或 https:// 开头');
    return;
  }
  if (createForm.kind === 'desktop' && !createForm.processName.trim()) {
    ElMessage.warning('请填写目标进程名');
    return;
  }
  creating.value = true;
  try {
    const record = await store.createScript({
      schemaVersion: 1,
      name,
      description: createForm.description.trim() || undefined,
      kind: createForm.kind,
      params: [],
      steps: createForm.kind === 'desktop'
        ? [{ id: newStepId(), type: 'desktop.activateWindow', processName: createForm.processName.trim() }]
        : [{ id: newStepId(), type: 'browser.navigate', url }],
    });
    createOpen.value = false;
    await store.loadScripts();
    await selectScript(record.id);
    ElMessage.success('草稿已创建');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建失败');
  } finally {
    creating.value = false;
  }
}

async function saveDraft(): Promise<void> {
  if (!current.value || !draft.value || !dirty.value) return;
  saving.value = true;
  try {
    const record = await store.saveScript(current.value.id, draft.value);
    draft.value = cloneDraft(scriptRecordToDraft(record));
    dirty.value = false;
    ElMessage.success(`已保存为 v${record.version} 草稿`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function publish(): Promise<void> {
  if (!current.value || !draft.value) return;
  if (current.value.publishedVersion === current.value.version) {
    ElMessage.info('当前版本已经发布');
    return;
  }
  try {
    await ElMessageBox.confirm(
      '发布后，智能体可以运行这个正式版本；后续编辑会生成新草稿，但不会覆盖它。',
      '发布自动化脚本',
      { confirmButtonText: '发布', cancelButtonText: '再检查一下', type: 'warning' },
    );
  } catch {
    return;
  }
  publishing.value = true;
  try {
    if (dirty.value) await saveDraft();
    if (!current.value) return;
    const record = await store.publishScript(current.value.id);
    draft.value = cloneDraft(scriptRecordToDraft(record));
    dirty.value = false;
    ElMessage.success(`已发布 v${record.publishedVersion}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发布失败');
  } finally {
    publishing.value = false;
  }
}

async function runScript(test: boolean): Promise<void> {
  if (!current.value || !draft.value) return;
  if (!test && !current.value.publishedVersion) {
    ElMessage.warning('请先发布正式版本，或使用试运行');
    return;
  }
  if (dirty.value) await saveDraft();
  try {
    const run = await store.startRun(current.value.id, { ...runValues }, { test });
    inspectorTab.value = 'run';
    pollRun(run.id);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '启动失败');
  }
}

function pollRun(runId: string): void {
  if (pollTimer) clearInterval(pollTimer);
  const tick = async () => {
    const run = await store.refreshRun(runId);
    if (!run || !['queued', 'running', 'paused'].includes(run.status)) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      if (run?.status === 'completed') ElMessage.success('自动化运行完成');
      if (run?.status === 'failed') ElMessage.error(run.error || '自动化运行失败');
    }
  };
  void tick();
  pollTimer = setInterval(() => void tick(), 1000);
}

async function cancelRun(): Promise<void> {
  if (!activeRun.value) return;
  try {
    await store.cancelRun(activeRun.value.id);
    ElMessage.info('已请求停止，将在当前步骤结束后生效');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '停止失败');
  }
}

function newStepId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function addStep(type: (typeof stepCatalog)[number]['type']): void {
  if (!draft.value) return;
  let step: AutomationStep;
  if (type === 'browser.navigate') {
    step = { id: newStepId(), type, url: 'https://' };
  } else if (type === 'browser.click') {
    step = { id: newStepId(), type, target: { by: 'role', role: 'button', name: '按钮名称' } };
  } else if (type === 'browser.type') {
    step = { id: newStepId(), type, target: { by: 'label', label: '字段名称' }, text: '{{value}}' };
  } else if (type === 'browser.wait') {
    step = { id: newStepId(), type, ms: 1000 };
  } else if (type === 'browser.waitFor') {
    step = { id: newStepId(), type, text: '加载完成', timeoutMs: 30000 };
  } else if (type === 'browser.assertText') {
    step = { id: newStepId(), type, text: '成功提示' };
  } else if (type === 'desktop.activateWindow') {
    step = { id: newStepId(), type, processName: 'notepad.exe' };
  } else if (type === 'desktop.click') {
    step = { id: newStepId(), type, target: { by: 'windowPoint', x: 0, y: 0 } };
  } else if (type === 'desktop.type') {
    step = { id: newStepId(), type, text: '{{value}}' };
  } else if (type === 'desktop.press') {
    step = { id: newStepId(), type, keys: ['enter'] };
  } else if (type === 'file.exists') {
    step = { id: newStepId(), type, path: '{{outputPath}}' };
  } else if (type === 'file.copy') {
    step = { id: newStepId(), type, from: '{{sourcePath}}', to: '{{targetPath}}' };
  } else if (type === 'file.move') {
    step = { id: newStepId(), type, from: '{{sourcePath}}', to: '{{targetPath}}' };
  } else {
    step = { id: newStepId(), type: 'file.wait', path: '{{outputPath}}', timeoutMs: 120000 };
  }
  const index = selectedStep.value ? draft.value.steps.findIndex((item) => item.id === selectedStep.value!.id) : draft.value.steps.length - 1;
  draft.value.steps.splice(index + 1, 0, step);
  selectedStepId.value = step.id;
  inspectorTab.value = 'step';
  addOpen.value = false;
  markDirty();
}

function removeStep(index: number): void {
  if (!draft.value) return;
  draft.value.steps.splice(index, 1);
  selectedStepId.value = draft.value.steps[Math.max(0, index - 1)]?.id || '';
  markDirty();
}

function moveStep(index: number, delta: number): void {
  if (!draft.value) return;
  const next = index + delta;
  if (next < 0 || next >= draft.value.steps.length) return;
  const [step] = draft.value.steps.splice(index, 1);
  draft.value.steps.splice(next, 0, step);
  selectedStepId.value = step.id;
  markDirty();
}

function changeStepTarget(event: Event): void {
  if (!stepModel.value) return;
  const by = (event.target as HTMLSelectElement).value;
  if (by === 'role') stepModel.value.target = { by: 'role', role: 'button', name: '按钮名称' };
  else if (by === 'text') stepModel.value.target = { by: 'text', text: '可见文本' };
  else if (by === 'label') stepModel.value.target = { by: 'label', label: '字段名称' };
  else if (by === 'css') stepModel.value.target = { by: 'css', selector: '#selector' };
  else stepModel.value.target = { by: 'index', index: 0 };
  markDirty();
}

function updateStepKeys(event: Event): void {
  if (!stepModel.value || !['browser.press', 'desktop.press'].includes(stepModel.value.type)) return;
  stepModel.value.keys = String((event.target as HTMLInputElement).value || '')
    .split(/[+,]/)
    .map((key) => key.trim())
    .filter(Boolean);
  markDirty();
}

function useWindowPoint(): void {
  if (!stepModel.value || stepModel.value.type !== 'desktop.click') return;
  stepModel.value.target = { by: 'windowPoint', x: 0, y: 0 };
  markDirty();
}

function kindLabel(kind: AutomationScriptKind): string {
  if (kind === 'desktop') return '桌面';
  if (kind === 'hybrid') return '混合';
  return '浏览器';
}

function stepTitle(type: AutomationStep['type']): string {
  const map: Record<string, string> = {
    'browser.navigate': '打开页面',
    'browser.click': '点击元素',
    'browser.type': '输入文本',
    'browser.press': '按键',
    'browser.wait': '固定等待',
    'browser.waitFor': '等待出现',
    'browser.assertText': '断言文本',
    'browser.extractText': '提取文本',
    'desktop.activateWindow': '激活窗口',
    'desktop.click': '桌面点击',
    'desktop.type': '桌面输入',
    'desktop.press': '桌面按键',
    'desktop.waitForImage': '等待图像',
    'file.exists': '检查文件',
    'file.wait': '等待文件',
    'file.copy': '复制文件',
    'file.move': '移动文件',
  };
  return map[type] || type;
}

function stepIcon(type: AutomationStep['type']) {
  if (type === 'browser.navigate') return Connection;
  if (type === 'browser.click') return EditPen;
  if (type === 'browser.type') return DocumentChecked;
  if (type.startsWith('desktop.')) return Monitor;
  if (type.startsWith('file.')) return Document;
  if (type.includes('wait')) return Refresh;
  if (type.includes('assert')) return CircleCheck;
  return Document;
}

function stepSummary(step: AutomationStep): string {
  if (step.type === 'browser.navigate') return step.url;
  if (step.type === 'browser.click') {
    const t: any = step.target;
    return t.by === 'role' ? `${t.role} · ${t.name}` : t.by === 'label' ? `标签：${t.label}` : t.by === 'text' ? `文本：${t.text}` : t.by === 'css' ? t.selector : `编号 ${t.index}`;
  }
  if (step.type === 'browser.type') return step.text.slice(0, 80);
  if (step.type === 'browser.wait') return `${step.ms} ms`;
  if (step.type === 'browser.waitFor') return step.text || step.selector || '';
  if (step.type === 'browser.assertText') return `必须出现：${step.text}`;
  if (step.type === 'browser.press') return step.keys.join(' + ');
  if (step.type === 'browser.extractText') return step.saveAs ? `保存到 ${step.saveAs}` : '提取页面文本';
  if (step.type === 'desktop.activateWindow') return `${step.processName}${step.titleContains ? ` · ${step.titleContains}` : ''}`;
  if (step.type === 'desktop.click') {
    const t: any = step.target;
    return t.by === 'windowPoint' ? `窗口内 (${t.x}, ${t.y})` : t.by;
  }
  if (step.type === 'desktop.type') return step.text.slice(0, 80);
  if (step.type === 'desktop.press') return step.keys.join(' + ');
  if (step.type === 'file.exists' || step.type === 'file.wait') return step.path;
  if (step.type === 'file.copy' || step.type === 'file.move') return `${step.from} → ${step.to}`;
  return step.note || step.type;
}

function runStepState(stepId: string): 'idle' | 'running' | 'completed' | 'failed' {
  const result = activeRun.value?.steps.find((step) => step.stepId === stepId);
  if (result) return result.status === 'completed' ? 'completed' : 'failed';
  if (!running.value) return 'idle';
  const currentIndex = draft.value?.steps.findIndex((step) => step.id === stepId) ?? -1;
  const doneCount = activeRun.value?.steps.length || 0;
  return currentIndex === doneCount ? 'running' : 'idle';
}

function runStatusLabel(status: AutomationRunStatus | string): string {
  const map: Record<string, string> = {
    queued: '排队中',
    running: '运行中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return map[status] || status;
}

function formatTime(timestamp?: number | null): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function durationMs(start?: number | null, end?: number | null): string {
  if (!start || !end) return '—';
  return `${Math.max(0, Math.round((end - start) / 100) / 10)} 秒`;
}

function elapsedLabel(run: { startedAt?: number | null; finishedAt?: number | null }): string {
  return durationMs(run.startedAt, run.finishedAt || (running.value ? Date.now() : null));
}

async function openBuilder(): Promise<void> {
  try {
    const convId = await chatStore.createConversation('新建自动化脚本', {
      agentId: 'a_builtin_rpa_builder',
    });
    await router.push(`/chat/${convId}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '无法打开自动化脚本设计师');
  }
}

async function deleteCurrent(): Promise<void> {
  if (!current.value) return;
  try {
    await ElMessageBox.confirm(`确定删除「${current.value.name}」？历史运行记录会保留。`, '删除脚本', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await store.deleteScript(current.value.id);
    draft.value = null;
    selectedStepId.value = '';
    const next = store.scripts[0];
    if (next) await selectScript(next.id);
    ElMessage.success('脚本已删除');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '删除失败');
    }
  }
}

function openSchedule(): void {
  if (!current.value?.publishedVersion) {
    ElMessage.warning('请先发布脚本');
    return;
  }
  scheduleForm.name = `${current.value.name} · 定时`;
  scheduleForm.mode = 'daily';
  scheduleForm.time = '09:00';
  scheduleForm.intervalMinutes = 60;
  scheduleOpen.value = true;
}

async function createSchedule(): Promise<void> {
  if (!current.value?.publishedVersion) return;
  if (!scheduleForm.name.trim()) {
    ElMessage.warning('请填写任务名称');
    return;
  }
  if (scheduleForm.mode === 'daily' && !/^\d{2}:\d{2}$/.test(scheduleForm.time)) {
    ElMessage.warning('请填写有效执行时间');
    return;
  }
  if (scheduleForm.mode === 'interval' && Number(scheduleForm.intervalMinutes) <= 0) {
    ElMessage.warning('间隔必须大于 0 分钟');
    return;
  }
  scheduling.value = true;
  try {
    await scheduledTaskStore.createTask({
      name: scheduleForm.name.trim(),
      prompt: '',
      taskType: 'rpa_script',
      rpaScriptId: current.value.id,
      rpaScriptName: current.value.name,
      rpaScriptVersion: current.value.publishedVersion,
      rpaInputs: { ...runValues },
      schedule: scheduleForm.mode === 'daily'
        ? { mode: 'cycle', type: 'daily', time: scheduleForm.time }
        : { mode: 'interval', minutes: Number(scheduleForm.intervalMinutes) },
    });
    scheduleOpen.value = false;
    ElMessage.success('定时任务已创建');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建定时任务失败');
  } finally {
    scheduling.value = false;
  }
}

function openRecorder(): void {
  recordForm.url = 'https://';
  recordOpen.value = true;
}

async function startRecord(): Promise<void> {
  if (!/^https?:\/\//i.test(recordForm.url.trim())) {
    ElMessage.warning('录制地址必须以 http:// 或 https:// 开头');
    return;
  }
  recordingStarting.value = true;
  try {
    const recording = await store.startRecording(recordForm.url.trim());
    recordingId.value = recording.id;
    recordingCount.value = 0;
    recordingActive.value = true;
    recordOpen.value = false;
    recordingTimer = setInterval(() => {
      if (!recordingId.value) return;
      void store.drainRecording(recordingId.value).then((next) => {
        recordingCount.value = Array.isArray(next.events) ? next.events.length : 0;
      }).catch(() => {});
    }, 1200);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '无法开始录制');
  } finally {
    recordingStarting.value = false;
  }
}

async function stopRecord(): Promise<void> {
  if (!recordingId.value) return;
  recordingStopping.value = true;
  try {
    const drafted = await store.stopRecording(recordingId.value);
    const record = await store.createScript(drafted);
    await store.loadScripts();
    await selectScript(record.id);
    ElMessage.success('录制已转换为脚本草稿，请检查定位与参数');
    closeRecording();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '生成脚本失败');
  } finally {
    recordingStopping.value = false;
  }
}

async function cancelRecord(): Promise<void> {
  if (recordingId.value) {
    try { await store.cancelRecording(recordingId.value); } catch { /* ignore */ }
  }
  closeRecording();
}

function closeRecording(): void {
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = null;
  recordingActive.value = false;
  recordingId.value = '';
  recordingCount.value = 0;
}

onMounted(async () => {
  await store.loadScripts();
  if (store.scripts[0]) await selectScript(store.scripts[0].id);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (recordingTimer) clearInterval(recordingTimer);
});
</script>

<style scoped>
.rpa-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 4%, transparent), transparent 180px),
    var(--color-bg);
}

.rpa-topbar {
  flex: 0 0 auto;
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  backdrop-filter: blur(14px);
}

.rpa-title-group { display: flex; align-items: center; gap: 11px; min-width: 0; }
.rpa-mode-icon {
  width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 11%, var(--color-bg));
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
}
.rpa-title-group h1 { margin: 0; font-size: 16px; line-height: 1.2; font-weight: 650; letter-spacing: 0; }
.rpa-title-group p { margin: 3px 0 0; font-size: 11px; color: var(--color-text-secondary); }
.rpa-top-stats { display: flex; gap: 14px; margin-left: 10px; font-size: 11px; color: var(--color-text-secondary); }
.rpa-top-stats b { color: var(--color-text); font-size: 13px; margin-right: 3px; }
.rpa-top-actions { margin-left: auto; display: flex; gap: 8px; }

.rpa-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 270px minmax(0, 1fr); }
.rpa-library {
  min-height: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary, var(--color-bg)) 84%, transparent);
}
.rpa-search-wrap { position: relative; padding: 14px 14px 8px; }
.rpa-search-icon { position: absolute; left: 26px; top: 27px; color: var(--color-text-tertiary); }
.rpa-search {
  width: 100%; height: 34px; border-radius: 7px; border: 1px solid var(--glass-border);
  background: var(--glass-bg); color: var(--color-text); padding: 0 10px 0 31px; outline: none; font-size: 12px;
}
.rpa-search:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 12%, transparent); }
.rpa-filter { display: flex; gap: 3px; padding: 4px 14px 10px; }
.rpa-filter-btn {
  border: 0; background: transparent; color: var(--color-text-secondary); font-size: 11px;
  padding: 5px 9px; border-radius: 6px; cursor: pointer;
}
.rpa-filter-btn:hover { background: var(--glass-bg-hover); color: var(--color-text); }
.rpa-filter-btn.active { background: color-mix(in srgb, var(--color-primary) 11%, transparent); color: var(--color-primary); }
.rpa-script-list { flex: 1; min-height: 0; overflow: auto; padding: 0 8px 12px; }
.rpa-script-row {
  width: 100%; display: flex; align-items: center; gap: 9px; text-align: left;
  border: 1px solid transparent; background: transparent; color: var(--color-text);
  border-radius: 8px; padding: 9px 8px; cursor: pointer;
}
.rpa-script-row:hover { background: var(--glass-bg-hover); }
.rpa-script-row.active {
  background: color-mix(in srgb, var(--color-primary) 9%, var(--glass-bg));
  border-color: color-mix(in srgb, var(--color-primary) 25%, var(--glass-border));
}
.rpa-script-icon {
  flex: 0 0 30px; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-primary);
}
.rpa-script-icon.is-desktop { background: color-mix(in srgb, var(--color-warning, #d97706) 12%, transparent); color: var(--color-warning, #d97706); }
.rpa-script-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.rpa-script-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rpa-script-meta { font-size: 10px; color: var(--color-text-secondary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.rpa-script-state {
  flex: 0 0 auto; font-size: 9px; padding: 2px 5px; border-radius: 4px; color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
}
.rpa-script-state.published { color: var(--color-success, #15803d); background: color-mix(in srgb, var(--color-success, #15803d) 10%, transparent); }
.rpa-script-state.draft { color: var(--color-warning, #b45309); background: color-mix(in srgb, var(--color-warning, #b45309) 10%, transparent); }
.rpa-library-empty { padding: 30px 16px; display: flex; align-items: center; flex-direction: column; gap: 8px; text-align: center; color: var(--color-text-secondary); }
.rpa-library-empty b { color: var(--color-text); font-size: 13px; }
.rpa-library-empty span { font-size: 11px; line-height: 1.5; }
.rpa-library-note { border-top: 1px solid var(--color-border); padding: 10px 14px; display: flex; gap: 7px; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.45; }

.rpa-workspace { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.rpa-mobile-picker { display: none; }
.rpa-main-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 30px; text-align: center; }
.rpa-main-empty h2 { margin: 0; font-size: 18px; font-weight: 650; }
.rpa-main-empty p { margin: 0; color: var(--color-text-secondary); font-size: 12px; }
.rpa-empty-orbit { width: 100px; height: 100px; position: relative; display: grid; place-items: center; color: var(--color-primary); }
.rpa-empty-orbit span { position: absolute; inset: 0; border: 1px solid color-mix(in srgb, var(--color-primary) 24%, transparent); border-radius: 50%; }
.rpa-empty-orbit span:nth-child(2) { inset: 12px; border-style: dashed; }
.rpa-empty-orbit span:nth-child(3) { inset: 26px; background: color-mix(in srgb, var(--color-primary) 9%, transparent); }
.rpa-empty-actions { display: flex; gap: 8px; margin-top: 6px; }

.rpa-script-head { flex: 0 0 auto; padding: 18px 20px 12px; display: flex; align-items: flex-start; gap: 18px; }
.rpa-script-heading { min-width: 0; flex: 1; }
.rpa-kicker { text-transform: uppercase; font-size: 9px; letter-spacing: .06em; color: var(--color-text-secondary); font-weight: 650; }
.rpa-script-heading h2 { margin: 4px 0 2px; font-size: 20px; font-weight: 650; letter-spacing: 0; }
.rpa-script-heading p { margin: 0; font-size: 11px; color: var(--color-text-secondary); }
.rpa-script-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.rpa-run-strip {
  margin: 0 20px 12px; padding: 8px 11px; display: flex; align-items: center; gap: 12px;
  border-radius: 7px; border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-text) 2%, transparent);
  font-size: 11px; color: var(--color-text-secondary);
}
.rpa-run-strip.running { border-color: color-mix(in srgb, var(--color-primary) 32%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 6%, transparent); }
.rpa-run-strip.failed { border-color: color-mix(in srgb, var(--color-danger, #dc2626) 32%, var(--color-border)); }
.rpa-run-strip-main { min-width: 0; display: flex; align-items: center; gap: 7px; flex: 1; }
.rpa-run-strip-main strong { color: var(--color-text); }
.rpa-run-strip-main span:not(.rpa-live-dot) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rpa-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-text-tertiary); }
.rpa-run-strip.running .rpa-live-dot { background: var(--color-primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 13%, transparent); }
.rpa-version-chip { flex: 0 0 auto; padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--color-text) 6%, transparent); }
.rpa-version-chip.warn { color: var(--color-warning, #b45309); }

.rpa-editor-shell { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(420px, 1fr) 340px; border-top: 1px solid var(--color-border); }
.rpa-timeline-panel { min-height: 0; overflow: auto; padding: 16px 20px 28px; }
.rpa-panel-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.rpa-panel-head h3 { margin: 0; font-size: 13px; font-weight: 650; }
.rpa-panel-head p { margin: 2px 0 0; color: var(--color-text-secondary); font-size: 10px; }
.rpa-add-wrap { margin-left: auto; position: relative; }
.rpa-add-menu {
  position: absolute; right: 0; top: 38px; z-index: 20; width: 250px; padding: 5px;
  border: 1px solid var(--glass-border); border-radius: 8px; background: var(--el-bg-color-overlay, var(--color-bg));
  box-shadow: 0 14px 40px color-mix(in srgb, #000 18%, transparent);
}
.rpa-add-menu button { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px; border: 0; border-radius: 6px; background: transparent; text-align: left; color: var(--color-text); cursor: pointer; }
.rpa-add-menu button:hover { background: var(--glass-bg-hover); }
.rpa-add-menu span { display: flex; flex-direction: column; gap: 1px; }
.rpa-add-menu b { font-size: 11px; font-weight: 600; }
.rpa-add-menu small { font-size: 9px; color: var(--color-text-secondary); }

.rpa-timeline { position: relative; display: flex; flex-direction: column; gap: 7px; }
.rpa-timeline::before { content: ''; position: absolute; left: 17px; top: 20px; bottom: 38px; width: 1px; background: var(--color-border); }
.rpa-step { position: relative; display: flex; align-items: stretch; border: 1px solid var(--color-border); border-radius: 8px; background: color-mix(in srgb, var(--color-bg) 92%, transparent); overflow: visible; }
.rpa-step:hover { border-color: var(--glass-border-strong, var(--color-border)); }
.rpa-step.active { border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 9%, transparent); }
.rpa-step.step-running { border-color: var(--color-primary); }
.rpa-step.step-completed .rpa-step-index { background: var(--color-success, #15803d); color: #fff; }
.rpa-step.step-failed { border-color: var(--color-danger, #dc2626); }
.rpa-step-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px 10px; border: 0; background: transparent; color: var(--color-text); text-align: left; cursor: pointer; }
.rpa-step-index { position: relative; z-index: 1; flex: 0 0 24px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 11%, var(--color-bg)); border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border)); }
.rpa-step-icon { flex: 0 0 26px; width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; background: color-mix(in srgb, var(--color-text) 5%, transparent); color: var(--color-text-secondary); }
.rpa-step-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.rpa-step-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
.rpa-step-title small { color: var(--color-text-secondary); font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rpa-step-summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--color-text-secondary); }
.rpa-step-status { flex: 0 0 22px; display: grid; place-items: center; color: var(--color-text-tertiary); }
.rpa-step-status.completed { color: var(--color-success, #15803d); }
.rpa-step-status.failed { color: var(--color-danger, #dc2626); }
.rpa-step-status.running { color: var(--color-primary); animation: rpa-spin 1.2s linear infinite; }
.rpa-step-tools { display: flex; align-items: center; gap: 1px; padding: 0 4px; opacity: 0; }
.rpa-step:hover .rpa-step-tools, .rpa-step:focus-within .rpa-step-tools { opacity: 1; }
.rpa-step-tools button { width: 23px; height: 23px; border: 0; border-radius: 5px; background: transparent; color: var(--color-text-secondary); cursor: pointer; }
.rpa-step-tools button:hover:not(:disabled) { background: var(--glass-bg-hover); color: var(--color-text); }
.rpa-step-tools button:disabled { opacity: .3; cursor: default; }
.rpa-add-step-row { margin-left: 29px; min-height: 34px; border: 1px dashed var(--color-border); border-radius: 7px; background: transparent; color: var(--color-text-secondary); display: flex; align-items: center; gap: 6px; padding: 0 10px; cursor: pointer; font-size: 11px; }
.rpa-add-step-row:hover { color: var(--color-primary); border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 4%, transparent); }

.rpa-inspector { min-height: 0; display: flex; flex-direction: column; border-left: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary, var(--color-bg)) 66%, transparent); }
.rpa-tabs { height: 42px; flex: 0 0 auto; display: flex; align-items: stretch; gap: 3px; padding: 0 10px; border-bottom: 1px solid var(--color-border); }
.rpa-tabs button { border: 0; background: transparent; color: var(--color-text-secondary); font-size: 11px; padding: 0 9px; position: relative; cursor: pointer; }
.rpa-tabs button.active { color: var(--color-text); font-weight: 600; }
.rpa-tabs button.active::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--color-primary); }
.rpa-inspector-body { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
.rpa-inspector-title { margin-bottom: 14px; }
.rpa-inspector-title h3 { margin: 3px 0 0; font-size: 15px; font-weight: 650; }
.rpa-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 11px; font-size: 10px; color: var(--color-text-secondary); }
.rpa-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rpa-field > span:first-child { font-weight: 600; color: var(--color-text-secondary); }
.rpa-field small { color: var(--color-text-tertiary); font-weight: 400; }
.rpa-field input, .rpa-field select, .rpa-field textarea {
  width: 100%; border: 1px solid var(--glass-border); border-radius: 6px; background: var(--glass-bg);
  color: var(--color-text); padding: 8px 9px; outline: none; font-size: 12px;
}
.rpa-field textarea { resize: vertical; line-height: 1.45; }
.rpa-field input:focus, .rpa-field select:focus, .rpa-field textarea:focus { border-color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 10%, transparent); }
.rpa-check { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--color-text-secondary); margin-bottom: 10px; }
.rpa-check.inline { margin: 0; }
.rpa-check input { accent-color: var(--color-primary); }
.rpa-step-hint, .rpa-muted-box {
  margin-top: 12px; border-radius: 6px; padding: 8px 9px; font-size: 10px; line-height: 1.5;
  color: var(--color-text-secondary); background: color-mix(in srgb, var(--color-warning, #b45309) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning, #b45309) 14%, var(--color-border));
  display: flex; gap: 6px;
}
.rpa-step-hint button {
  margin-left: auto; flex: 0 0 auto; border: 1px solid currentColor; border-radius: 5px;
  background: transparent; color: inherit; padding: 2px 6px; cursor: pointer; font-size: 9px;
}
.rpa-muted-box { background: color-mix(in srgb, var(--color-text) 3%, transparent); border-color: var(--color-border); }
.rpa-inspector-empty { height: 100%; display: grid; place-items: center; color: var(--color-text-secondary); font-size: 11px; }
.rpa-run-actions { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; }
.rpa-run-card { margin-top: 14px; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.rpa-run-card-head { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-bottom: 1px solid var(--color-border); }
.rpa-run-card-head small { margin-left: auto; color: var(--color-text-tertiary); font-size: 9px; }
.rpa-status-pill { font-size: 9px; font-weight: 650; padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--color-text) 6%, transparent); }
.rpa-status-pill.running { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 11%, transparent); }
.rpa-status-pill.completed { color: var(--color-success, #15803d); background: color-mix(in srgb, var(--color-success, #15803d) 10%, transparent); }
.rpa-status-pill.failed { color: var(--color-danger, #dc2626); background: color-mix(in srgb, var(--color-danger, #dc2626) 10%, transparent); }
.rpa-run-step { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 7px 10px; border-bottom: 1px solid var(--color-border); font-size: 10px; }
.rpa-run-step:last-child { border-bottom: 0; }
.rpa-run-step span { color: var(--color-text-secondary); }
.rpa-run-step b { font-size: 9px; color: var(--color-text-secondary); }
.rpa-run-step small { grid-column: 1 / -1; color: var(--color-text-tertiary); }
.rpa-run-step.failed b, .rpa-run-step.failed small { color: var(--color-danger, #dc2626); }
.rpa-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.rpa-info-grid span { display: flex; flex-direction: column; gap: 2px; padding: 8px; border-radius: 6px; background: color-mix(in srgb, var(--color-text) 3%, transparent); }
.rpa-info-grid small { color: var(--color-text-tertiary); font-size: 9px; }
.rpa-info-grid b { font-size: 10px; font-weight: 600; }
.rpa-danger-action { margin-top: 20px; width: 100%; border: 1px solid color-mix(in srgb, var(--color-danger, #dc2626) 25%, var(--color-border)); background: transparent; color: var(--color-danger, #dc2626); border-radius: 6px; padding: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; font-size: 11px; }
.rpa-danger-action:hover { background: color-mix(in srgb, var(--color-danger, #dc2626) 7%, transparent); }
.rpa-schedule-action { margin-top: 8px; width: 100%; border: 1px solid var(--glass-border); background: transparent; color: var(--color-text); border-radius: 6px; padding: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; font-size: 11px; }
.rpa-schedule-action:hover { background: var(--glass-bg-hover); border-color: var(--color-primary); }
.rpa-recording-overlay {
  position: fixed; inset: 0; z-index: 3000; display: flex; flex-direction: column;
  background: var(--color-bg);
}
.rpa-recording-bar {
  flex: 0 0 48px; display: flex; align-items: center; gap: 9px; padding: 0 14px;
  border-bottom: 1px solid var(--color-border); background: var(--color-bg); font-size: 11px;
}
.rpa-recording-bar strong { color: var(--color-text); }
.rpa-recording-bar > span:not(.rpa-recording-dot):not(.rpa-recording-url) { color: var(--color-text-secondary); }
.rpa-recording-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-danger, #dc2626); box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-danger, #dc2626) 12%, transparent); }
.rpa-recording-url { max-width: 46vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-tertiary); }
.rpa-recording-browser { flex: 1; min-height: 0; }
.rpa-spacer { flex: 1; }

.rpa-btn { height: 32px; border-radius: 7px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--color-text); display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 11px; cursor: pointer; font-size: 11px; font-weight: 550; }
.rpa-btn:hover:not(:disabled) { border-color: var(--glass-border-strong, var(--color-primary)); background: var(--glass-bg-hover); }
.rpa-btn.primary { color: #fff; background: var(--color-primary); border-color: var(--color-primary); }
.rpa-btn.primary:hover:not(:disabled) { filter: brightness(1.04); }
.rpa-btn.publish { color: var(--color-success, #15803d); border-color: color-mix(in srgb, var(--color-success, #15803d) 28%, var(--color-border)); background: color-mix(in srgb, var(--color-success, #15803d) 7%, transparent); }
.rpa-btn.ghost { background: transparent; }
.rpa-btn.small { height: 28px; margin-top: 4px; }
.rpa-btn:disabled { opacity: .45; cursor: not-allowed; }
.rpa-icon-btn { width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--color-text-secondary); display: grid; place-items: center; cursor: pointer; }
.rpa-icon-btn:hover { color: var(--color-text); background: var(--glass-bg-hover); }
.rpa-text-btn { border: 0; background: transparent; color: var(--color-text-secondary); font-size: 10px; cursor: pointer; }
.rpa-text-btn.danger { color: var(--color-danger, #dc2626); }
.rpa-dialog-form { display: flex; flex-direction: column; gap: 2px; }
.rpa-type-note { display: flex; gap: 8px; padding: 9px 10px; border-radius: 7px; background: color-mix(in srgb, var(--color-primary) 7%, transparent); color: var(--color-primary); }
.rpa-type-note span { display: flex; flex-direction: column; gap: 2px; }
.rpa-type-note b { font-size: 11px; }
.rpa-type-note small { color: var(--color-text-secondary); font-size: 10px; }
@keyframes rpa-spin { to { transform: rotate(360deg); } }

@media (max-width: 1180px) {
  .rpa-body { grid-template-columns: 230px minmax(0, 1fr); }
  .rpa-editor-shell { grid-template-columns: minmax(360px, 1fr) 300px; }
  .rpa-script-head { flex-direction: column; }
  .rpa-script-actions { width: 100%; justify-content: flex-start; }
}

@media (max-width: 860px) {
  .rpa-top-stats { display: none; }
  .rpa-body { grid-template-columns: 1fr; min-height: 0; }
  .rpa-library { display: none; }
  .rpa-workspace { overflow: auto; }
  .rpa-mobile-picker {
    display: flex; align-items: center; gap: 8px; padding: 10px 14px 0;
    font-size: 10px; color: var(--color-text-secondary);
  }
  .rpa-mobile-picker select {
    flex: 1; min-width: 0; height: 32px; border-radius: 6px; border: 1px solid var(--glass-border);
    background: var(--glass-bg); color: var(--color-text); padding: 0 8px;
  }
  .rpa-editor-shell { display: block; overflow: visible; }
  .rpa-timeline-panel { overflow: visible; }
  .rpa-inspector { border-left: 0; border-top: 1px solid var(--color-border); min-height: 330px; overflow: visible; }
  .rpa-topbar { flex-wrap: wrap; }
  .rpa-top-actions { width: 100%; margin-left: 0; }
  .rpa-script-head, .rpa-timeline-panel { padding-left: 14px; padding-right: 14px; }
  .rpa-run-strip { margin-left: 14px; margin-right: 14px; }
}
</style>
