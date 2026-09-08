<template>
  <div class="page dw-root ont-root">
    <!-- 左：本体 / 标准属性 双 Tab -->
    <aside class="ont-left">
      <div class="ont-left-tabs">
        <button class="ont-left-tab" :class="{ on: leftTab === 'ontology' }" type="button" @click="leftTab = 'ontology'">本体</button>
        <button class="ont-left-tab" :class="{ on: leftTab === 'attributes' }" type="button" @click="leftTab = 'attributes'">标准属性</button>
      </div>
      <div v-if="leftTab === 'ontology'" class="ont-left-bar">
        <el-input v-model="keyword" placeholder="搜索本体" size="small" clearable :prefix-icon="Search" />
        <el-select v-model="statusFilter" size="small" class="ont-status-sel">
          <el-option label="全部状态" value="" />
          <el-option label="已发布" value="published" />
          <el-option label="草稿" value="draft" />
        </el-select>
        <div style="display: flex; gap: 4px">
          <el-button size="small" style="flex: 1" :icon="Coin" @click="openTableDialog">从表生成</el-button>
          <el-button size="small" style="flex: 1" :icon="Plus" @click="openSqlWizard">手写 SQL</el-button>
          <el-button size="small" style="flex: 0 0 auto" :icon="FolderAdd" title="新建本体包（可多级）" @click="createGroup()" />
        </div>
      </div>
      <div class="ont-list" @drop="onDropToRoot" @dragover.prevent>
        <div v-if="loading" class="ont-empty">加载中…</div>
        <template v-else>
          <!-- 本体包（多级分类树）：点击折叠/展开，支持拖拽本体/包归组 -->
          <template v-for="n in visibleNodes" :key="n.key">
            <!-- 包节点 -->
            <div
              v-if="n.kind === 'group'"
              class="ont-li ont-grp-li"
              :class="{ 'drag-over': dragOver === n.key }"
              :style="{ paddingLeft: 8 + n.depth * 14 + 'px' }"
              draggable="true"
              @click="toggleGroupFold(n.id)"
              @dragstart="onDragGroupStart($event, n.id)"
              @dragover.prevent.stop="dragOver = n.key"
              @dragleave="dragOver = ''"
              @drop.stop="onDropToGroup($event, n.id)"
            >
              <span class="ont-li-row">
                <el-icon :size="11" class="ont-grp-fold" :class="{ open: !foldedGroups.has(n.id) }"><ArrowRight /></el-icon>
                <el-icon :size="12" class="ont-grp-icon"><Folder /></el-icon>
                <span class="ont-li-name" style="flex: 1">{{ n.name }}</span>
                <span class="ont-tag">{{ n.count }}</span>
                <el-dropdown trigger="click" @command="(cmd: string) => onGroupCmd(cmd, n)" @click.stop>
                  <el-button size="small" text :icon="MoreFilled" @click.stop />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="addChild">新建子包</el-dropdown-item>
                      <el-dropdown-item command="rename">重命名</el-dropdown-item>
                      <el-dropdown-item command="remove" divided>删除包</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </span>
            </div>
            <!-- 未分类分隔行（拖拽目标：移出包） -->
            <div
              v-else-if="n.kind === 'uncategorized'"
              class="ont-li ont-grp-li ont-grp-uncat"
              :class="{ 'drag-over': dragOver === 'uncategorized' }"
              @dragover.prevent.stop="dragOver = 'uncategorized'"
              @dragleave="dragOver = ''"
              @drop.stop="onDropToUncategorized($event)"
            >
              <span class="ont-li-row">
                <span class="ont-li-name" style="flex: 1">未分类</span>
                <span class="ont-tag">{{ n.count }}</span>
              </span>
            </div>
            <!-- 本体叶子 -->
            <button
              v-else
              class="ont-li" :class="{ on: n.ont.id === selectedId }"
              :style="{ paddingLeft: 10 + n.depth * 14 + 'px' }"
              draggable="true"
              type="button" @click="selectOntology(n.ont.id)"
              @dragstart="onDragOntStart($event, n.ont.id)"
            >
              <span class="ont-li-row">
                <span class="dw-mono ont-li-code">{{ n.ont.code }}</span>
                <span style="flex: 1" />
                <span v-if="n.ont.builtin" class="ont-tag">内置</span>
                <span class="ds-badge" :class="n.ont.status === 'published' ? 'b-ok' : 'b-draft'">
                  {{ n.ont.status === 'published' ? `v${n.ont.version}` : '草稿' }}
                </span>
              </span>
              <span class="ont-li-name">{{ n.ont.name }}</span>
            </button>
          </template>
          <div v-if="!visibleNodes.some((n) => n.kind === 'ontology' || n.kind === 'uncategorized') && !loading" class="ont-empty">
            {{ keyword ? '没有匹配的本体' : '正在为项目库生成内置本体…' }}
          </div>
        </template>
      </div>
      <StdAttributeTree v-else class="ont-std-panel" />
    </aside>

    <!-- 从表生成对话框 -->
    <el-dialog v-model="tableDialogOpen" title="从数据源表生成本体" width="560" :close-on-click-modal="false">
      <div class="ont-tgen">
        <el-select v-model="genDsId" size="small" placeholder="选择数据源" style="width: 100%" @change="loadGenTables">
          <el-option v-for="d in dsOptions" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <el-input v-model="genTableFilter" size="small" placeholder="搜索表" clearable :prefix-icon="Search" style="margin-top: 8px" />
        <div class="ont-tgen-list">
          <div v-if="genLoading" class="ont-empty" style="padding: 20px">加载表结构中…（大库首次同步较慢）</div>
          <div v-else-if="!genTablesFiltered.length" class="ont-empty" style="padding: 20px">没有匹配的表</div>
          <button
            v-for="t in genTablesFiltered" :key="t.name"
            class="ont-tgen-li" :class="{ on: genTable === t.name }"
            type="button" @click="genTable = t.name"
          >
            <span class="dw-mono ont-tgen-name">{{ t.name }}</span>
            <span class="ont-tgen-comment">{{ t.comment || (t.kind === 'view' ? '视图' : `${t.columns.length} 列`) }}</span>
            <span v-if="genCodeSet.has(sanitize(t.name))" class="ont-tag">已生成</span>
          </button>
        </div>
        <p class="ont-hint" style="margin: 8px 0 0">
          名称/描述默认取表备注；数值列自动成为度量、日期时间列成为时间维度、其余列成为维度。生成后补业务口径再发布。
        </p>
      </div>
      <template #footer>
        <el-button size="small" @click="tableDialogOpen = false">取消</el-button>
        <el-button size="small" type="primary" :disabled="!genTable" :loading="genCreating" @click="generateFromTable">
          生成本体
        </el-button>
      </template>
    </el-dialog>

    <!-- 手写 SQL 三步向导：选源输入 → 执行预览 → 本体信息（属性自动生成） -->
    <el-dialog v-model="wizardOpen" title="手写 SQL 创建本体" width="700" :close-on-click-modal="false">
      <el-steps :active="wizardStep - 1" align-center finish-status="success" size="small" style="margin-bottom: 14px">
        <el-step title="数据源与 SQL" />
        <el-step title="执行预览" />
        <el-step title="本体信息" />
      </el-steps>

      <div v-show="wizardStep === 1">
        <el-select v-model="wiz.dsId" size="small" placeholder="选择数据源" style="width: 100%">
          <el-option v-for="d in dsOptions" :key="d.id" :label="`${d.name}（${d.type}）`" :value="d.id" />
        </el-select>
        <el-input
          v-model="wiz.sql" type="textarea" :rows="9" class="dw-mono" style="margin-top: 10px"
          placeholder="SELECT&#10;  user_id AS user_id,&#10;  amount AS amount&#10;FROM orders&#10;&#10;注意：每个输出列必须带 AS 别名（本体物理 SQL 契约）"
        />
        <p class="ont-hint" style="margin: 8px 0 0">下一步将实际执行这段 SQL（只读护栏，最多采样 20 行用于推断属性）。</p>
      </div>

      <div v-show="wizardStep === 2">
        <div v-if="wiz.previewing" class="ont-empty" style="padding: 30px">执行中…</div>
        <template v-else-if="wiz.preview">
          <p class="ont-hint" style="margin: 0 0 6px">
            共 <b>{{ wiz.preview.columns.length }}</b> 列 / 采样 <b>{{ wiz.preview.rows.length }}</b> 行。
            数值列 → 度量(sum)、日期列 → 时间维度、其余 → 维度；并生成「全部字段」选择列组（创建后可改）。
          </p>
          <div class="wiz-preview">
            <table class="ont-spec-table">
              <thead><tr><th v-for="c in wiz.preview.columns" :key="c" class="dw-mono">{{ c }}</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in wiz.preview.rows.slice(0, 10)" :key="i">
                  <td v-for="c in wiz.preview.columns" :key="c">{{ r[c] ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <div v-else-if="wiz.error" class="ont-empty" style="padding: 20px; color: var(--el-color-danger)">{{ wiz.error }}</div>
        <div v-else class="ont-empty" style="padding: 30px">点「执行并预览」运行 SQL</div>
      </div>

      <div v-show="wizardStep === 3">
        <div class="ont-fgrid">
          <div class="ont-field">
            <label>本体 code（唯一、小写字母开头，供大模型引用）</label>
            <el-input v-model="wiz.code" size="small" class="dw-mono" placeholder="如 order_summary" />
          </div>
          <div class="ont-field">
            <label>名称</label>
            <el-input v-model="wiz.name" size="small" placeholder="如 订单汇总" />
          </div>
          <div class="ont-field">
            <label>业务域</label>
            <el-select v-model="wiz.domain" size="small" clearable filterable allow-create default-first-option placeholder="选择或输入域">
              <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
            </el-select>
          </div>
          <div class="ont-field ont-full">
            <label>业务描述（写清口径与粒度，大模型靠它选本体）</label>
            <el-input v-model="wiz.description" type="textarea" :rows="3" size="small" />
          </div>
          <div class="ont-field ont-full">
            <label>所属本体包（可留空 = 未分类；左栏可新建多级包）</label>
            <el-select v-model="wiz.groupId" size="small" clearable placeholder="未分类">
              <el-option v-for="g in flatGroups" :key="g.id" :label="g.label" :value="g.id" />
            </el-select>
          </div>
        </div>
        <p class="ont-hint" style="margin: 8px 0 0">属性已按采样自动生成，创建为草稿；可在编辑区补口径后发布。</p>
      </div>

      <template #footer>
        <el-button size="small" v-if="wizardStep > 1" @click="wizardStep--">上一步</el-button>
        <el-button size="small" @click="wizardOpen = false">取消</el-button>
        <el-button v-if="wizardStep === 1" size="small" type="primary" :disabled="!wiz.dsId || !wiz.sql.trim()" @click="wizardRun">执行并预览</el-button>
        <el-button v-if="wizardStep === 2" size="small" type="primary" :disabled="!wiz.preview" @click="wizardStep = 3">下一步</el-button>
        <el-button v-if="wizardStep === 3" size="small" type="primary" :loading="wiz.creating" @click="wizardCreate">创建本体</el-button>
      </template>
    </el-dialog>

    <!-- 中：编辑区 -->
    <div class="ont-mid">
      <div v-if="!form.id" class="ont-mid-empty">从左侧选择一个本体，或点「新建」</div>
      <template v-else>
        <div class="ont-mid-head">
          <div>
            <h3 class="dw-display">{{ form.name }}</h3>
            <span class="ont-head-code dw-mono">{{ form.code }}</span>
            <span v-if="form.builtin" class="ont-tag">内置 · code/数据源/物理 SQL 不可改</span>
          </div>
          <div class="ont-head-actions">
            <el-dropdown trigger="click" @command="onHeadCmd">
              <el-button size="small" text :icon="MoreFilled" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="exportYaml">复制 YAML</el-dropdown-item>
                  <el-dropdown-item command="delete" divided :disabled="form.builtin">删除本体</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <div class="ont-scroll">
          <!-- 标识 -->
          <div class="ont-fgroup"><span>标识</span><small>改 code 会断开引用它的智能体</small></div>
          <div class="ont-fgrid">
            <div class="ont-field">
              <label>本体 code（唯一、供大模型引用）</label>
              <el-input v-model="form.code" size="small" :disabled="form.builtin" class="dw-mono" />
            </div>
            <div class="ont-field">
              <label>名称</label>
              <el-input v-model="form.name" size="small" />
            </div>
            <div class="ont-field">
              <label>所属本体包（多级分类，左栏可建包）</label>
              <el-select v-model="form.groupId" size="small" clearable placeholder="未分类">
                <el-option v-for="g in flatGroups" :key="g.id" :label="g.label" :value="g.id" />
              </el-select>
            </div>
          </div>

          <!-- 语义 -->
          <div class="ont-fgroup"><span>语义</span><small>大模型只看这一段来决定选不选它</small></div>
          <div class="ont-fgrid">
            <div class="ont-field">
              <label>业务域</label>
              <el-select v-model="form.domain" size="small" clearable filterable allow-create default-first-option placeholder="选择或输入域">
                <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
              </el-select>
            </div>
            <div class="ont-field">
              <label>同义词（一行一个，用于命中提问）</label>
              <el-input v-model="form.synonymsText" type="textarea" :rows="2" size="small" />
            </div>
            <div class="ont-field ont-full">
              <label>业务描述（写清口径与粒度）</label>
              <el-input v-model="form.description" type="textarea" :rows="3" size="small" />
            </div>
          </div>

          <!-- 选择列 / 度量 / 时间维度 -->
          <div class="ont-fgroup">
            <span>选择列 / 度量 / 时间维度</span>
            <small>默认列不召回直接进摘要（未指定列时的兜底 SELECT）；非默认列按关键字召回</small>
          </div>
          <table class="ont-spec-table">
            <thead>
              <tr>
                <th class="ont-col-check" title="参与编译预览/试跑">查</th>
                <th style="width:70px">角色</th>
                <th>名称</th>
                <th>表达式（别名）</th>
                <th style="width:104px">聚合</th>
                <th style="width:150px" title="引用标准属性库，统一名称/类型/单位/枚举口径">标准属性</th>
                <th style="width:150px">描述</th>
                <th style="width:36px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in form.dimensions" :key="`d${i}`">
                <td class="ont-col-check">
                  <el-checkbox :model-value="qsel.dims[d.name] !== false" :disabled="!d.name" @change="(v: boolean) => (qsel.dims[d.name] = v)" />
                </td>
                <td><span class="ont-role ont-role-dim">维度</span></td>
                <td><el-input v-model="d.name" size="small" class="dw-mono" /></td>
                <td><el-input v-model="d.expr" size="small" class="dw-mono" /></td>
                <td class="ont-cell-na">—</td>
                <td>
                  <el-select v-model="d.refAttr" size="small" clearable filterable placeholder="挂标准属性" @change="onRefAttr(d, $event as string)">
                    <el-option v-for="s in stdAttrList" :key="s.key" :label="`${s.key} · ${s.name}`" :value="s.key" />
                  </el-select>
                </td>
                <td><el-input v-model="d.description" size="small" placeholder="业务口径（选填）" /></td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.dimensions.splice(i, 1)" /></td>
              </tr>
              <tr v-for="(m, i) in form.measures" :key="`m${i}`">
                <td class="ont-col-check">
                  <el-checkbox :model-value="qsel.meas[m.name] !== false" :disabled="!m.name" @change="(v: boolean) => (qsel.meas[m.name] = v)" />
                </td>
                <td><span class="ont-role ont-role-measure">度量</span></td>
                <td><el-input v-model="m.name" size="small" class="dw-mono" /></td>
                <td><el-input v-model="m.expr" size="small" class="dw-mono" placeholder="如 * 或列别名" /></td>
                <td>
                  <el-select v-model="m.agg" size="small">
                    <el-option v-for="a in AGGS" :key="a" :label="a" :value="a" />
                  </el-select>
                </td>
                <td>
                  <el-select v-model="m.refAttr" size="small" clearable filterable placeholder="挂标准属性" @change="onRefAttr(m, $event as string)">
                    <el-option v-for="s in stdAttrList" :key="s.key" :label="`${s.key} · ${s.name}`" :value="s.key" />
                  </el-select>
                </td>
                <td><el-input v-model="m.description" size="small" placeholder="业务口径（选填）" /></td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.measures.splice(i, 1)" /></td>
              </tr>
              <tr v-for="(t, i) in form.timeDimensions" :key="`t${i}`">
                <td class="ont-col-check"><span class="ont-cell-na">—</span></td>
                <td><span class="ont-role ont-role-time">时间</span></td>
                <td><el-input v-model="t.name" size="small" class="dw-mono" /></td>
                <td><el-input v-model="t.expr" size="small" class="dw-mono" /></td>
                <td class="ont-cell-na">日/周/月…</td>
                <td class="ont-cell-na">—</td>
                <td><el-input v-model="t.description" size="small" placeholder="业务口径（选填）" /></td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.timeDimensions.splice(i, 1)" /></td>
              </tr>
            </tbody>
          </table>
          <div class="ont-add-row">
            <el-button size="small" text @click="addDim">+ 维度</el-button>
            <el-button size="small" text @click="addMeasure">+ 度量</el-button>
            <el-button size="small" text @click="addTimeDim">+ 时间维度</el-button>
          </div>

          <!-- 选择列：命名查询列组（名称 + 描述/召回关键字 + 字段列表），与过滤器同构 -->
          <div class="ont-fgroup">
            <span>选择列</span>
            <small>命名的一组字段；大模型按名称引用（intent.selections），描述同时作为召回关键字</small>
          </div>
          <table class="ont-spec-table">
            <thead>
              <tr>
                <th style="width:130px">名称</th>
                <th style="width:200px">描述（召回关键字）</th>
                <th>字段列表（维度/度量/时间维度）</th>
                <th style="width:36px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in form.selections" :key="`s${i}`">
                <td><el-input v-model="s.name" size="small" class="dw-mono" placeholder="如: 基本信息" /></td>
                <td><el-input v-model="s.keywordsText" size="small" placeholder="逗号分隔，如: 名称,名字" /></td>
                <td>
                  <el-select v-model="s.fields" size="small" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择字段（可多选）" :disabled="!fieldOptions.length" style="width: 100%">
                    <el-option v-for="fn in fieldOptions" :key="fn" :label="fn" :value="fn" />
                  </el-select>
                </td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.selections.splice(i, 1)" /></td>
              </tr>
              <tr v-if="!form.selections.length">
                <td colspan="4" class="ont-cell-na">暂无选择列；点下方「+ 选择列」添加（可选）</td>
              </tr>
            </tbody>
          </table>
          <div class="ont-add-row">
            <el-button size="small" text :icon="Plus" :disabled="!fieldOptions.length" @click="addSelection">+ 选择列</el-button>
          </div>

          <!-- 过滤器：命中才注入 WHERE（区别于下方强制注入的行级策略） -->
          <div class="ont-fgroup">
            <span>过滤器</span>
            <small>默认过滤器直接进摘要；非默认按关键字召回。命中后条件注入 WHERE（行级策略是强制注入，两者叠加）</small>
          </div>
          <table class="ont-spec-table">
            <thead>
              <tr>
                <th style="width:110px">名称</th>
                <th style="width:170px">关键字（召回命中词）</th>
                <th class="ont-col-check" title="默认过滤器：直接拼进本体摘要">默认</th>
                <th>条件 SQL</th>
                <th style="width:150px">描述</th>
                <th style="width:36px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in form.filters" :key="`f${i}`">
                <td><el-input v-model="f.name" size="small" class="dw-mono" placeholder="如: 近30天" /></td>
                <td><el-input v-model="f.keywordsText" size="small" placeholder="逗号分隔" /></td>
                <td class="ont-col-check"><el-checkbox v-model="f.isDefault" /></td>
                <td><el-input v-model="f.expr" size="small" class="dw-mono" placeholder="如: created_at >= DATE('now','-30 day')" /></td>
                <td><el-input v-model="f.description" size="small" /></td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.filters.splice(i, 1)" /></td>
              </tr>
            </tbody>
          </table>
          <div class="ont-add-row">
            <el-button size="small" text :icon="Plus" @click="addFilter">+ 过滤器</el-button>
          </div>

          <!-- 关联关系：跨本体 JOIN 路径（N:N 经中间表展开两跳） -->
          <div class="ont-fgroup">
            <span>关联关系</span>
            <small>对方本体须已发布；N:N 走中间表两跳。摘要全量拼入，编译 v1 只做单跳</small>
          </div>
          <table class="ont-spec-table">
            <thead>
              <tr>
                <th style="width:86px">类型</th>
                <th style="width:120px">自身本体</th>
                <th style="width:130px">对方本体</th>
                <th>本体字段</th>
                <th>对方字段</th>
                <th v-if="hasNn">中间表</th>
                <th v-if="hasNn">中间表.本体列</th>
                <th v-if="hasNn">中间表.对方列</th>
                <th style="width:130px">描述</th>
                <th style="width:36px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in form.relations" :key="`r${i}`">
                <td>
                  <el-select v-model="r.type" size="small">
                    <el-option v-for="t in REL_TYPES" :key="t" :label="t" :value="t" />
                  </el-select>
                </td>
                <td><el-input v-model="r.source" size="small" class="dw-mono" :disabled="form.builtin" placeholder="本体 code" /></td>
                <td>
                  <el-select v-model="r.target" size="small" filterable placeholder="对方本体">
                    <el-option v-for="o in relTargetOptions" :key="o.id" :label="o.code" :value="o.code" />
                  </el-select>
                </td>
                <td><el-input v-model="r.sourceAttr" size="small" class="dw-mono" placeholder="输出别名" /></td>
                <td><el-input v-model="r.targetAttr" size="small" class="dw-mono" placeholder="对方输出别名" /></td>
                <template v-if="hasNn">
                  <td><el-input v-model="r.viaTable" size="small" class="dw-mono" placeholder="表名" :disabled="r.type !== 'N:N'" /></td>
                  <td><el-input v-model="r.viaSource" size="small" class="dw-mono" placeholder="外键列" :disabled="r.type !== 'N:N'" /></td>
                  <td><el-input v-model="r.viaTarget" size="small" class="dw-mono" placeholder="外键列" :disabled="r.type !== 'N:N'" /></td>
                </template>
                <td><el-input v-model="r.description" size="small" /></td>
                <td><el-button size="small" text type="danger" :icon="Delete" @click="form.relations.splice(i, 1)" /></td>
              </tr>
            </tbody>
          </table>
          <div class="ont-add-row">
            <el-button size="small" text :icon="Plus" @click="addRelation">+ 关联关系</el-button>
          </div>

          <!-- 查询意图（编译预览 / 试跑共用） -->
          <div class="ont-fgroup">
            <span>查询意图（编译预览 / 试跑）</span>
            <small>「查」勾选要输出的列；过滤器一行一个——可填过滤器名或裸条件，按 AND 连接注入 WHERE</small>
          </div>
          <div class="ont-field ont-full">
            <el-input
              v-model="filtersText" type="textarea" :rows="2" size="small"
              class="dw-mono" spellcheck="false"
              placeholder="过滤器，如：created_at >= '2026-01-01'（留空 = 不过滤）"
            />
          </div>

          <!-- 行级策略 -->
          <div class="ont-fgroup"><span>行级策略</span><small>强制注入 WHERE，用户不可绕过</small></div>
          <div class="ont-fgrid">
            <div v-for="(p, i) in form.policies" :key="i" class="ont-field ont-full ont-policy-row">
              <el-input v-model="form.policies[i]" size="small" class="dw-mono" placeholder="如 is_deleted = 0" />
              <el-button size="small" text type="danger" :icon="Delete" @click="form.policies.splice(i, 1)" />
            </div>
            <el-button size="small" text :icon="Plus" @click="form.policies.push('')">+ 行级策略</el-button>
          </div>

          <!-- 物理 -->
          <div class="ont-fgroup"><span>物理</span><small>大模型看不到这一段，只有编译器用</small></div>
          <div class="ont-field ont-full">
            <label>来源 SQL（每个输出列必须 AS 别名，保存时校验）</label>
            <el-input
              v-model="form.sourceSql" type="textarea" :rows="7" size="small"
              class="ont-sql dw-mono" :disabled="form.builtin" spellcheck="false"
            />
            <span v-if="form.builtin" class="ont-hint">
              内置本体的物理 SQL 由结构同步维护；补好语义描述与同义词后即可发布。
            </span>
          </div>
        </div>

        <!-- 动作条 -->
        <div class="ont-actionbar">
          <span v-if="dirty" class="ds-badge b-draft"><span class="ds-dot err" />未保存改动</span>
          <span style="flex: 1" />
          <el-button size="small" :loading="saving" @click="save(false)">保存草稿</el-button>
          <el-button size="small" :loading="previewing" @click="previewData">预览数据</el-button>
          <el-button size="small" :loading="running" @click="tryRun">试跑查询</el-button>
          <el-button size="small" type="primary" :loading="publishing" @click="publish">
            {{ form.status === 'published' ? `发布 v${form.version + 1}` : '发布' }}
          </el-button>
        </div>
      </template>
    </div>

    <!-- 右：编译预览 -->
    <aside class="ont-right">
      <div class="ont-right-head">
        <span class="ont-eyebrow">编译预览</span>
        <span class="ds-badge">不执行</span>
      </div>
      <CompileTrack :stages="trackStages" compact style="padding: 10px 14px 0" />
      <div class="ont-right-tabs">
        <button class="ont-rtab" :class="{ on: rightTab === 'sql' }" type="button" @click="rightTab = 'sql'">编译 SQL</button>
        <button class="ont-rtab" :class="{ on: rightTab === 'yaml' }" type="button" @click="rightTab = 'yaml'">YAML</button>
        <button class="ont-rtab" :class="{ on: rightTab === 'result' }" type="button" @click="rightTab = 'result'">
          结果{{ resultRows ? `（${resultRows.length}）` : '' }}
        </button>
      </div>
      <div class="ont-right-body">
        <pre v-if="rightTab === 'sql'" class="ont-code dw-mono">{{ compiledSql || '保存后自动编译' }}</pre>
        <pre v-else-if="rightTab === 'yaml'" class="ont-code dw-mono">{{ yamlText || '从「⋯ → 复制 YAML」导出' }}</pre>
        <template v-else>
          <div v-if="runError" class="ont-run-err">{{ runError }}</div>
          <div v-else-if="!resultColumns.length" class="ont-empty">点「预览数据」或「试跑查询」查看结果</div>
          <template v-else>
            <div class="ont-grid-wrap">
              <table class="dc-grid">
                <thead>
                  <tr>
                    <th class="dc-rownum">#</th>
                    <th v-for="c in resultColumns" :key="c" class="dw-mono">{{ c }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in resultRows" :key="ri">
                    <td class="dc-rownum">{{ ri + 1 }}</td>
                    <td v-for="c in resultColumns" :key="c" :class="{ 'is-null': row[c] == null }">
                      {{ row[c] == null ? 'NULL' : formatCell(row[c]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="dc-res-foot">
              <span>{{ resultRows.length }} 行</span>
              <span v-if="resultMs">{{ resultMs }} ms</span>
            </div>
          </template>
        </template>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus, Delete, MoreFilled, Coin, Collection, Folder, FolderAdd } from '@element-plus/icons-vue';
import { api } from '../api/client';
import CompileTrack, { type CompileStage } from '../components/CompileTrack.vue';
import StdAttributeTree from '../components/StdAttributeTree.vue';
import '../styles/data-workbench.css';
import './datasources.css';
import './console.css';
import './ontology.css';

const DOMAINS = ['交易域', '用户域', '商品域', '营销域', '日志域', '通用'];
const AGGS = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max'];

interface OntologyInfo {
  id: string;
  datasourceId: string;
  code: string;
  name: string;
  domain: string | null;
  description: string | null;
  synonyms: string[];
  sourceSql: string;
  dimensions: { name: string; expr: string; description?: string }[];
  timeDimensions: { name: string; expr: string; description?: string }[];
  measures: { name: string; expr: string; agg: string; description?: string }[];
  filters: { name: string; expr: string; keywords?: string[]; isDefault?: boolean; description?: string }[];
  selections: { name: string; description?: string; keywords?: string[]; fields?: string[] }[];
  relations: {
    source: string; type: string; target: string; sourceAttr: string; targetAttr: string;
    via?: { table: string; sourceColumn: string; targetColumn: string };
    description?: string;
  }[];
  policies: string[];
  groupId: string | null;
  status: string;
  version: number;
  builtin: boolean;
}

// ===== 列表 =====
const list = ref<OntologyInfo[]>([]);
const loading = ref(true);
const keyword = ref('');
const statusFilter = ref('');
const selectedId = ref('');
/** 左栏双 Tab：本体 / 标准属性 */
const leftTab = ref<'ontology' | 'attributes'>('ontology');

// ===== 本体包（多级分类树）：折叠 + 拖拽归组 =====
interface GroupNode { id: string; name: string; parentId: string | null; children: GroupNode[] }
const groupTree = ref<GroupNode[]>([]);
const groupFilter = ref('');
/** 折叠的包（页面内存态） */
const foldedGroups = ref(new Set<string>());
const dragOver = ref('');

function toggleGroupFold(id: string) {
  const s = new Set(foldedGroups.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  foldedGroups.value = s;
}

/** 树 → 扁平化（带层级与含父路径的 label），供「所属包」下拉与挂载分组 */
function flattenGroups(nodes: GroupNode[], depth = 0, prefix = ''): Array<{ id: string; name: string; label: string; depth: number; count: number }> {
  const out: Array<{ id: string; name: string; label: string; depth: number; count: number }> = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix}/${n.name}` : n.name;
    out.push({ id: n.id, name: n.name, label, depth, count: list.value.filter((o) => o.groupId === n.id).length });
    out.push(...flattenGroups(n.children, depth + 1, label));
  }
  return out;
}
const flatGroups = computed(() => flattenGroups(groupTree.value));

const filtered = computed(() =>
  list.value.filter((o) => {
    if (statusFilter.value && o.status !== statusFilter.value) return false;
    const k = keyword.value.trim().toLowerCase();
    if (!k) return true;
    return [o.code, o.name, o.description].some((s) => (s || '').toLowerCase().includes(k));
  }),
);

type VisibleNode =
  | { key: string; kind: 'group'; id: string; name: string; depth: number; count: number }
  | { key: string; kind: 'uncategorized'; count: number }
  | { key: string; kind: 'ontology'; depth: number; ont: OntologyInfo };

/** 左栏可见节点：树展开（考虑折叠）+ 每个包直接挂的本体 + 未分类 */
const visibleNodes = computed<VisibleNode[]>(() => {
  const byGroup = new Map<string, OntologyInfo[]>();
  const uncategorized: OntologyInfo[] = [];
  for (const o of filtered.value) {
    if (o.groupId && groupTree.value.length) {
      if (!byGroup.has(o.groupId)) byGroup.set(o.groupId, []);
      byGroup.get(o.groupId)!.push(o);
    } else {
      uncategorized.push(o);
    }
  }
  const out: VisibleNode[] = [];
  const walk = (nodes: GroupNode[], depth: number) => {
    for (const n of nodes) {
      const folded = foldedGroups.value.has(n.id);
      out.push({ key: `g:${n.id}`, kind: 'group', id: n.id, name: n.name, depth, count: flattenGroups([n])[0].count });
      if (folded) continue;
      for (const o of byGroup.get(n.id) || []) {
        out.push({ key: `o:${o.id}`, kind: 'ontology', depth: depth + 1, ont: o });
      }
      walk(n.children, depth + 1);
    }
  };
  walk(groupTree.value, 0);
  out.push({ key: 'uncategorized', kind: 'uncategorized', count: uncategorized.length });
  for (const o of uncategorized) out.push({ key: `o:${o.id}`, kind: 'ontology', depth: 1, ont: o });
  return out;
});

async function loadGroups() {
  const res = await api.get<GroupNode[]>('/ontology-groups');
  if (!('error' in res)) groupTree.value = res.data;
}

// ===== 拖拽归组 =====
function onDragOntStart(e: DragEvent, ontId: string) {
  e.dataTransfer?.setData('text/ont-id', ontId);
}
function onDragGroupStart(e: DragEvent, groupId: string) {
  e.dataTransfer?.setData('text/grp-id', groupId);
}
async function onDropToGroup(e: DragEvent, groupId: string) {
  dragOver.value = '';
  const ontId = e.dataTransfer?.getData('text/ont-id');
  const grpId = e.dataTransfer?.getData('text/grp-id');
  try {
    if (ontId) {
      const res = await api.post(`/ontologies/${ontId}/move-group`, { groupId });
      if ('error' in res) return ElMessage.error(res.error);
      await load(true);
    } else if (grpId && grpId !== groupId) {
      const res = await api.post(`/ontology-groups/${grpId}/move`, { parentId: groupId });
      if ('error' in res) return ElMessage.error(res.error);
      await loadGroups();
    }
  } catch { /* 拖拽失败静默 */ }
}
async function onDropToUncategorized(e: DragEvent) {
  dragOver.value = '';
  const ontId = e.dataTransfer?.getData('text/ont-id');
  if (!ontId) return;
  try {
    const res = await api.post(`/ontologies/${ontId}/move-group`, { groupId: null });
    if ('error' in res) return ElMessage.error(res.error);
    await load(true);
  } catch { /* 拖拽失败静默 */ }
}
/** 拖包到列表空白处 = 移到根级 */
async function onDropToRoot(e: DragEvent) {
  dragOver.value = '';
  const grpId = e.dataTransfer?.getData('text/grp-id');
  if (!grpId) return;
  try {
    const res = await api.post(`/ontology-groups/${grpId}/move`, { parentId: null });
    if ('error' in res) return ElMessage.error(res.error);
    await loadGroups();
  } catch { /* 拖拽失败静默 */ }
}

async function createGroup(parentId?: string) {
  try {
    const { value } = await ElMessageBox.prompt('输入本体包名称（可在包下再建包，形成多级结构）', parentId ? '新建子包' : '新建本体包', {
      confirmButtonText: '创建', cancelButtonText: '取消', inputPlaceholder: '如 交易 / 订单',
    });
    const res = await api.post('/ontology-groups', { name: value, parentId: parentId || null });
    if ('error' in res) return ElMessage.error(res.error);
    await loadGroups();
    ElMessage.success('本体包已创建');
  } catch { /* 取消 */ }
}

function onGroupCmd(cmd: string, g: { id: string; name: string }) {
  if (cmd === 'addChild') void createGroup(g.id);
  else if (cmd === 'rename') void renameGroupPrompt(g);
  else if (cmd === 'remove') void removeGroup(g);
}

async function renameGroupPrompt(g: { id: string; name: string }) {
  try {
    const { value } = await ElMessageBox.prompt('输入新名称', '重命名本体包', {
      confirmButtonText: '保存', cancelButtonText: '取消', inputValue: g.name,
    });
    const res = await api.patch(`/ontology-groups/${g.id}`, { name: value });
    if ('error' in res) return ElMessage.error(res.error);
    await loadGroups();
  } catch { /* 取消 */ }
}

async function removeGroup(g: { id: string; name: string }) {
  try {
    await ElMessageBox.confirm(`删除包「${g.name}」？其子包将上提一级，包内本体移入「未分类」。`, '提示', { type: 'warning' });
    const res = await api.delete(`/ontology-groups/${g.id}`);
    if ('error' in res) return ElMessage.error(res.error);
    if (groupFilter.value === g.id) groupFilter.value = '';
    await loadGroups();
    ElMessage.success('已删除');
  } catch { /* 取消 */ }
}

async function load(keepSelection = true) {
  loading.value = true;
  const res = await api.get<OntologyInfo[]>('/ontologies');
  loading.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  list.value = res.data;
  // 首次加载可能有内置本体异步生成中，稍后自动补拉一次
  if (!res.data.length && !builtinRetry) {
    builtinRetry = true;
    setTimeout(() => void load(keepSelection), 1200);
  }
  if (!keepSelection || !selectedId.value) {
    if (list.value.length) await selectOntology(list.value[0].id);
  }
}
let builtinRetry = false;

// ===== 表单 =====
const REL_TYPES = ['1:1', '1:N', 'N:1', 'N:N'] as const;

const form = reactive({
  id: '', datasourceId: '', code: '', name: '', domain: '', description: '',
  synonymsText: '', sourceSql: '',
  dimensions: [] as { name: string; expr: string; refAttr: string; description: string }[],
  measures: [] as { name: string; expr: string; agg: string; refAttr: string; description: string }[],
  timeDimensions: [] as { name: string; expr: string; description: string }[],
  selections: [] as { name: string; keywordsText: string; fields: string[] }[],
  filters: [] as { name: string; keywordsText: string; isDefault: boolean; expr: string; description: string }[],
  relations: [] as {
    source: string; type: string; target: string; sourceAttr: string; targetAttr: string;
    viaTable: string; viaSource: string; viaTarget: string; description: string;
  }[],
  policies: [] as string[],
  groupId: '' as string,
  status: 'draft', version: 1, builtin: false,
});
// 查询意图：勾选参与编译/试跑的维度与度量（undefined 视为勾选，新加行默认勾上）
const qsel = reactive<{ dims: Record<string, boolean>; meas: Record<string, boolean> }>({ dims: {}, meas: {} });
// 过滤器：一行一个 WHERE 条件（过滤器名或裸条件）
const filtersText = ref('');

const relTargetOptions = computed(() =>
  list.value.filter((o) => o.status === 'published' && o.datasourceId === form.datasourceId && o.id !== form.id),
);
const hasNn = computed(() => form.relations.some((r) => r.type === 'N:N'));

/** 选择列可引用的字段：全部维度/度量/时间维度名 */
const fieldOptions = computed(() =>
  [...form.dimensions.map((d) => d.name), ...form.timeDimensions.map((t) => t.name), ...form.measures.map((m) => m.name)].filter(Boolean),
);

const splitKw = (s: string): string[] =>
  (s || '').split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean);
const joinKw = (a?: string[]): string => (a || []).join(', ');

function addDim() { form.dimensions.push({ name: '', expr: '', refAttr: '', description: '' }); }
function addMeasure() { form.measures.push({ name: '', expr: '', agg: 'sum', refAttr: '', description: '' }); }
function addTimeDim() { form.timeDimensions.push({ name: '', expr: '', description: '' }); }
function addFilter() { form.filters.push({ name: '', keywordsText: '', isDefault: false, expr: '', description: '' }); }
function addSelection() {
  form.selections.push({ name: '', keywordsText: '', fields: [] });
}
function addRelation() {
  form.relations.push({ source: form.code, type: 'N:1', target: '', sourceAttr: '', targetAttr: '', viaTable: '', viaSource: '', viaTarget: '', description: '' });
}

/** 从勾选态 + 过滤器文本组装查询意图（编译预览 / 试跑共用） */
function buildIntent() {
  return {
    dimensions: form.dimensions.filter((d) => d.name && d.expr && qsel.dims[d.name] !== false).map((d) => d.name),
    measures: form.measures.filter((m) => m.name && qsel.meas[m.name] !== false).map((m) => ({ name: m.name })),
    filters: filtersText.value.split('\n').map((s) => s.trim()).filter(Boolean),
    limit: 50,
  };
}
const dirty = ref(false);
const saving = ref(false);
const publishing = ref(false);
const previewing = ref(false);
const running = ref(false);

function fillForm(o: OntologyInfo) {
  Object.assign(form, {
    id: o.id, datasourceId: o.datasourceId, code: o.code, name: o.name,
    domain: o.domain || '', description: o.description || '',
    synonymsText: o.synonyms.join('\n'), sourceSql: o.sourceSql,
    dimensions: o.dimensions.map((d) => ({ name: d.name, expr: d.expr, refAttr: (d as any).refAttr || '', description: d.description || '' })),
    measures: o.measures.map((m) => ({ name: m.name, expr: m.expr, agg: m.agg, refAttr: (m as any).refAttr || '', description: m.description || '' })),
    timeDimensions: o.timeDimensions.map((t) => ({ name: t.name, expr: t.expr, description: t.description || '' })),
    selections: (o.selections || []).map((s) => ({ name: s.name, keywordsText: joinKw([...(s.keywords || []), ...(s.description ? [s.description] : [])]), fields: [...(s.fields || (s.name ? [s.name] : []))] })),
    filters: (o.filters || []).map((f) => ({ name: f.name, keywordsText: joinKw(f.keywords), isDefault: !!f.isDefault, expr: f.expr, description: f.description || '' })),
    relations: (o.relations || []).map((r) => ({
      source: r.source || form.code, type: r.type || 'N:1', target: r.target || '', sourceAttr: r.sourceAttr || '', targetAttr: r.targetAttr || '',
      viaTable: r.via?.table || '', viaSource: r.via?.sourceColumn || '', viaTarget: r.via?.targetColumn || '',
      description: r.description || '',
    })),
    policies: [...o.policies],
    groupId: o.groupId || '',
    status: o.status, version: o.version, builtin: o.builtin,
  });
  // 切换本体时重置查询意图（默认全选 + 无过滤器）
  Object.keys(qsel.dims).forEach((k) => delete qsel.dims[k]);
  Object.keys(qsel.meas).forEach((k) => delete qsel.meas[k]);
  filtersText.value = '';
  dirty.value = false;
  void compilePreview();
  void loadYaml();
}

async function selectOntology(id: string) {
  const o = list.value.find((x) => x.id === id);
  if (!o) return;
  selectedId.value = id;
  fillForm(o);
  rightTab.value = 'sql';
}

function openCreate() {
  selectedId.value = '';
  Object.assign(form, {
    id: '', datasourceId: list.value[0]?.datasourceId || '', code: '', name: '', domain: '',
    description: '', synonymsText: '', sourceSql: 'SELECT\n  id AS id\nFROM t_your_table',
    dimensions: [], measures: [], timeDimensions: [], selections: [], filters: [], relations: [], policies: [],
    groupId: groupFilter.value || '',
    status: 'draft', version: 1, builtin: false,
  });
  dirty.value = false;
}

/** UI 行 → 保存载荷（keywordsText 等纯 UI 字段不落库） */
function payload() {
  return {
    datasourceId: form.datasourceId || list.value[0]?.datasourceId,
    code: form.code, name: form.name, domain: form.domain || undefined,
    description: form.description || undefined,
    synonyms: form.synonymsText.split('\n').map((s) => s.trim()).filter(Boolean),
    sourceSql: form.sourceSql,
    dimensions: form.dimensions
      .filter((d) => d.name && d.expr)
      .map((d) => ({ name: d.name.trim(), expr: d.expr.trim(), refAttr: d.refAttr || undefined, description: d.description || undefined })),
    measures: form.measures
      .filter((m) => m.name && (m.expr || m.agg === 'count'))
      .map((m) => ({ name: m.name.trim(), expr: m.expr.trim() || '*', agg: m.agg, refAttr: m.refAttr || undefined, description: m.description || undefined })),
    timeDimensions: form.timeDimensions
      .filter((d) => d.name && d.expr)
      .map((d) => ({ name: d.name.trim(), expr: d.expr.trim(), description: d.description || undefined })),
    selections: form.selections
      .filter((s) => s.name && s.fields.length)
      .map((s) => ({
        name: s.name.trim(),
        // 描述即召回关键字：keywordsText 整句作 description + 分词作 keywords，双写供召回
        description: s.keywordsText.trim() || undefined,
        keywords: splitKw(s.keywordsText),
        fields: s.fields,
      })),
    filters: form.filters
      .filter((f) => f.name && f.expr)
      .map((f) => ({ name: f.name.trim(), expr: f.expr.trim(), keywords: splitKw(f.keywordsText), isDefault: f.isDefault || undefined, description: f.description || undefined })),
    relations: form.relations
      .filter((r) => r.source && r.target && r.sourceAttr && r.targetAttr)
      .map((r) => ({
        source: r.source.trim(), type: r.type, target: r.target, sourceAttr: r.sourceAttr.trim(), targetAttr: r.targetAttr.trim(),
        via: r.type === 'N:N' && r.viaTable
          ? { table: r.viaTable.trim(), sourceColumn: r.viaSource.trim(), targetColumn: r.viaTarget.trim() }
          : undefined,
        description: r.description || undefined,
      })),
    policies: form.policies.map((p) => p.trim()).filter(Boolean),
    groupId: form.groupId || undefined,
  };
}

async function save(publishAfter: boolean) {
  if (!form.code || !form.name || !form.sourceSql) {
    return ElMessage.warning('code / 名称 / 来源 SQL 必填');
  }
  saving.value = true;
  const isEdit = !!form.id;
  const res = isEdit
    ? await api.put<OntologyInfo>(`/ontologies/${form.id}`, payload())
    : await api.post<OntologyInfo>('/ontologies', payload());
  saving.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success(isEdit ? '已保存（回到草稿态）' : '已创建草稿');
  dirty.value = false;
  await load(true);
  selectedId.value = res.data.id;
  fillForm(res.data);
  if (publishAfter) void publish();
}

async function publish() {
  if (!form.id) return;
  publishing.value = true;
  // 发布前先落草稿（所见即所发）
  if (dirty.value) {
    publishing.value = false;
    return save(true);
  }
  const res = await api.post<OntologyInfo>(`/ontologies/${form.id}/publish`);
  publishing.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success(`已发布 v${res.data.version}，智能体即刻生效`);
  await load(true);
  fillForm(res.data);
}

function onHeadCmd(cmd: string) {
  if (cmd === 'exportYaml') void copyYaml();
  else if (cmd === 'delete') void remove();
}

async function remove() {
  if (!form.id || form.builtin) return;
  await ElMessageBox.confirm(`删除本体「${form.code}」？引用它的智能体将失去该语义。`, '删除本体', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
  }).catch(() => null);
  const res = await api.delete(`/ontologies/${form.id}`);
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success('已删除');
  selectedId.value = '';
  form.id = '';
  await load(false);
}

// ===== 编译预览 / YAML / 试跑 =====
const compiledSql = ref('');
const compileWarnings = ref<string[]>([]);
const trackStages = computed<CompileStage[]>(() => [
  { label: '意图', status: compiledSql.value || runError.value ? 'done' : 'cur' },
  { label: '编译', status: compiledSql.value ? 'done' : runError.value ? 'cur' : 'pending' },
  { label: '物理 SQL', status: compiledSql.value ? 'done' : 'pending' },
  { label: '结果', status: resultRows.value.length ? 'done' : 'pending' },
]);

async function compilePreview() {
  if (!form.id) return;
  compiledSql.value = '';
  runError.value = '';
  const res = await api.post<{ sql: string; warnings: string[] }>(
    `/ontologies/${form.id}/compile`, buildIntent(),
  );
  if ('error' in res) {
    runError.value = res.error;
    return;
  }
  compiledSql.value = res.data.sql;
  compileWarnings.value = res.data.warnings || [];
}

async function loadYaml() {
  if (!form.id) return;
  const res = await api.get<{ yaml: string }>(`/ontologies/${form.id}/yaml`);
  if (!('error' in res)) yamlText.value = res.data.yaml;
}

async function copyYaml() {
  if (!form.id) return;
  const res = await api.get<{ yaml: string }>(`/ontologies/${form.id}/yaml`);
  if ('error' in res) return ElMessage.error(res.error);
  try {
    await navigator.clipboard.writeText(res.data.yaml);
    ElMessage.success('YAML 已复制到剪贴板');
  } catch {
    ElMessage.error('复制失败');
  }
}

const yamlText = ref('');
const rightTab = ref<'sql' | 'yaml' | 'result'>('sql');
const resultColumns = ref<string[]>([]);
const resultRows = ref<Record<string, unknown>[]>([]);
const resultMs = ref(0);
const runError = ref('');

function fillResult(r: { columns?: string[]; rows?: Record<string, unknown>[]; latencyMs?: number }) {
  resultColumns.value = r.columns || [];
  resultRows.value = r.rows || [];
  resultMs.value = r.latencyMs || 0;
  rightTab.value = 'result';
}

async function previewData() {
  if (!form.id) return;
  previewing.value = true;
  runError.value = '';
  const res = await api.post<{ columns: string[]; rows: Record<string, unknown>[]; latencyMs: number }>(
    `/ontologies/${form.id}/preview-data`, { limit: 50 },
  );
  previewing.value = false;
  if ('error' in res) {
    runError.value = res.error;
    rightTab.value = 'result';
    return;
  }
  fillResult(res.data);
}

async function tryRun() {
  if (!form.id) return;
  if (dirty.value) {
    ElMessage.warning('有未保存改动，请先保存草稿再试跑');
    return;
  }
  running.value = true;
  runError.value = '';
  const res = await api.post<{ columns: string[]; rows: Record<string, unknown>[]; latencyMs: number; warnings?: string[] }>(
    `/ontologies/${form.id}/try-run`, buildIntent(),
  );
  running.value = false;
  if ('error' in res) {
    runError.value = res.error;
    rightTab.value = 'result';
    return;
  }
  fillResult(res.data);
}

function formatCell(v: unknown): string {
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

// ===== 从表生成 =====
interface DsOption { id: string; name: string; type: string }
interface GenTable { name: string; kind: 'table' | 'view'; comment?: string; columns: { name: string; type: string }[] }

const tableDialogOpen = ref(false);
const dsOptions = ref<DsOption[]>([]);
const genDsId = ref('');
const genTables = ref<GenTable[]>([]);
const genTableFilter = ref('');
const genTable = ref('');
const genLoading = ref(false);
const genCreating = ref(false);

/** 与 server sanitizeCode 同规则，用于「已生成」标记 */
function sanitize(raw: string): string {
  let c = raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (/^\d/.test(c)) c = `t_${c}`;
  return c || 'table';
}

const genCodeSet = computed(() => new Set(list.value.map((o) => o.code)));
const genTablesFiltered = computed(() => {
  const k = genTableFilter.value.trim().toLowerCase();
  if (!k) return genTables.value;
  return genTables.value.filter((t) => t.name.toLowerCase().includes(k) || (t.comment || '').toLowerCase().includes(k));
});

async function openTableDialog() {
  tableDialogOpen.value = true;
  if (!dsOptions.value.length) {
    const res = await api.get<DsOption[]>('/datasources');
    if ('error' in res) return ElMessage.error(res.error);
    dsOptions.value = res.data;
  }
  // 默认选当前编辑中的本体所属数据源，否则项目库
  genDsId.value = form.datasourceId || dsOptions.value.find((d) => d.type === 'project')?.id || dsOptions.value[0]?.id || '';
  await loadGenTables();
}

async function loadGenTables() {
  genTable.value = '';
  genTables.value = [];
  if (!genDsId.value) return;
  genLoading.value = true;
  const res = await api.get<{ tables: GenTable[] }>(`/datasources/${genDsId.value}/schema`);
  genLoading.value = false;
  if ('error' in res) return ElMessage.error(`加载结构失败：${res.error}`);
  genTables.value = res.data.tables;
}

async function generateFromTable() {
  if (!genDsId.value || !genTable.value) return;
  genCreating.value = true;
  const res = await api.post<OntologyInfo>('/ontologies/generate-table', {
    datasourceId: genDsId.value,
    table: genTable.value,
  });
  genCreating.value = false;
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success(`已生成「${res.data.code}」，补好业务口径后发布`);
  tableDialogOpen.value = false;
  await load(true);
  selectedId.value = res.data.id;
  fillForm(res.data);
}

onMounted(() => {
  void load(false);
  void openTableDialogPreload();
});
// 预取数据源列表但不开框（对话框首开更快）
async function openTableDialogPreload() {
  const res = await api.get<DsOption[]>('/datasources');
  if (!('error' in res)) dsOptions.value = res.data;
}

// ===== 手写 SQL 三步向导 =====
const wizardOpen = ref(false);
const wizardStep = ref(1);
const wiz = reactive({
  dsId: '', sql: '', previewing: false,
  preview: null as { columns: string[]; rows: Record<string, unknown>[] } | null,
  error: '', code: '', name: '', description: '', domain: '', groupId: '', creating: false,
});

function openSqlWizard() {
  if (!dsOptions.value.length) void openTableDialogPreload();
  wiz.dsId = form.datasourceId || list.value[0]?.datasourceId || dsOptions.value[0]?.id || '';
  wiz.sql = ''; wiz.preview = null; wiz.error = '';
  wiz.code = ''; wiz.name = ''; wiz.description = ''; wiz.domain = '';
  wizardStep.value = 1;
  wizardOpen.value = true;
}

async function wizardRun() {
  wiz.previewing = true; wiz.error = ''; wiz.preview = null;
  try {
    const res = await api.post<any>('/sql-console/run', { dataSourceId: wiz.dsId, sql: wiz.sql, maxRows: 20 });
    if ('error' in res) throw new Error(res.error);
    const first = (res.data?.results || []).find((r: any) => r.status === 'ok' && r.columns?.length);
    if (!first) throw new Error(res.data?.results?.[0]?.error || '执行结果为空');
    wiz.preview = { columns: first.columns, rows: first.rows || [] };
    wizardStep.value = 2;
  } catch (e: any) {
    wiz.error = e?.message || String(e);
  } finally {
    wiz.previewing = false;
  }
}

async function wizardCreate() {
  if (!wiz.code?.trim() || !wiz.name?.trim()) return ElMessage.warning('code 与名称必填');
  if (!/^[a-z][a-z0-9_]*$/.test(wiz.code.trim())) return ElMessage.warning('code 只能用小写字母/数字/下划线，且以字母开头');
  wiz.creating = true;
  const res = await api.post<OntologyInfo>('/ontologies/create-from-sql', {
    datasourceId: wiz.dsId, sourceSql: wiz.sql,
    code: wiz.code.trim(), name: wiz.name.trim(),
    description: wiz.description || undefined, domain: wiz.domain || undefined,
    groupId: wiz.groupId || groupFilter.value || undefined,
  });
  wiz.creating = false;
  if ('error' in res) return ElMessage.error(res.error);
  ElMessage.success('已创建草稿，属性已按采样自动生成；补口径后发布即可供智能体使用');
  wizardOpen.value = false;
  await load(true);
  selectedId.value = res.data.id;
  fillForm(res.data);
}

// ===== 标准属性（左栏 Tab 内的 StdAttributeTree 管理）：此处仅加载属性清单供字段 refAttr 下拉引用 =====
const stdAttrList = ref<Array<{ key: string; name: string; unit: string; dataType: string }>>([]);

async function loadStdAttrs() {
  const res = await api.get<any[]>('/std-attributes');
  if ('error' in res) return;
  const flat: any[] = [];
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if (n.kind === 'attr') flat.push(n);
      walk(n.children || []);
    }
  };
  walk(res.data || []);
  stdAttrList.value = flat.map((s) => ({ key: s.key, name: s.name, unit: s.unit || '', dataType: s.dataType }));
}

/** 字段挂载标准属性：自动带出业务名作为描述（已有描述不覆盖） */
function onRefAttr(row: { description?: string }, key: string) {
  const s = stdAttrList.value.find((x) => x.key === key);
  if (s && !row.description) row.description = s.unit ? `${s.name}（${s.unit}）` : s.name;
}

onMounted(() => { void loadStdAttrs(); void loadGroups(); });
</script>
