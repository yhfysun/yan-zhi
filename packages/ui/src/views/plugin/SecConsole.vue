<template>
  <div class="page sec-console">
    <!-- =========================================================
         ▍ 01 · BRAND BAR  顶行：分区编号 + 模块名 + 元数据 + 主开关
         ========================================================= -->
    <header class="sec-header">
      <div class="sec-brand">
        <span class="sec-num">01</span>
        <span class="sec-brand-tick" />
        <span class="sec-brand-name">SEC&nbsp;<span class="sec-dot">·</span>&nbsp;LAB</span>
        <span class="sec-brand-sub">ops console / v0.2</span>
      </div>
      <div class="sec-meta">
        <span class="sec-meta-item">
          <span class="sec-meta-k">scopes</span>
          <span class="sec-meta-v">{{ liveScopes }}</span>
        </span>
        <span class="sec-meta-item">
          <span class="sec-meta-k">findings</span>
          <span class="sec-meta-v" :data-sev="liveFindingsSev">{{ liveFindingsCount }}</span>
        </span>
        <span class="sec-meta-item">
          <span class="sec-meta-k">audit</span>
          <span class="sec-meta-v">{{ auditPass }}/<span class="sec-meta-vbad">{{ auditFail }}</span></span>
        </span>
        <span class="sec-meta-item">
          <span class="sec-meta-k">sim</span>
          <span class="sec-meta-v">{{ liveSim }}</span>
        </span>
      </div>
      <div class="sec-toggle">
        <label class="sec-switch" :class="{ on: cfg.engagementMode }">
          <input v-model="cfg.engagementMode" type="checkbox" @change="saveConfig" />
          <span class="sec-switch-grip" />
          <span class="sec-switch-label">交战模式</span>
        </label>
        <el-tooltip content="开启后允许侵入性动作（爆破/注入验证），每次调用仍需显式确认" placement="bottom">
          <el-icon class="sec-help"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
    </header>

    <!-- =========================================================
         ▍ 02 · RIBBON 合规边界提示（贴在 header 下沿）
         ========================================================= -->
    <div class="sec-ribbon">
      <span class="sec-ribbon-stamp">BOUNDARY</span>
      <span>仅可对自有资产或持有书面授权的目标执行扫描。所有动作受授权范围与危险动作黑名单约束，并全量记审计。</span>
      <span class="sec-ribbon-sep" />
      <span class="sec-ribbon-strong">AI 不会自主触发 attack_sim</span>
    </div>

    <!-- =========================================================
         ▍ 03 · MAIN GRID 两栏：左 = AUTHORIZE / PULSE，右 = 工作区
         ========================================================= -->
    <div class="sec-grid">
      <!-- ============ 左栏 ============ -->
      <aside class="sec-col-left">
        <!-- 任务段（决策 13 / 5f.5）：四模式同构会话列表，授权/资产之上 -->
        <section class="sec-frame sec-frame-tasks">
          <TaskListSection :space-id="null" />
        </section>

        <!-- 左上：授权目录 -->
        <section class="sec-frame">
          <header class="sec-frame-head">
            <span class="sec-num">02</span>
            <span class="sec-frame-title">AUTHORIZE</span>
            <span class="sec-frame-hint">交战范围</span>
            <el-button class="sec-frame-act" size="small" type="primary" @click="showAdd = true">登记</el-button>
          </header>
          <div class="sec-scope-list">
            <div v-for="s in scopes" :key="s.id" :class="['sec-scope-row', { expired: s.expired }]">
              <div class="sec-scope-line">
                <span class="sec-env" :class="`env-${s.environment || 'internal'}`">{{ (s.environment || 'internal').slice(0, 4) }}</span>
                <span class="sec-scope-val" :title="s.value">{{ s.value }}</span>
                <el-icon class="sec-scope-x" title="移除" @click="removeScope(s)"><Close /></el-icon>
              </div>
              <div class="sec-scope-meta">
                <span class="sec-meta-k">{{ s.maxRisk }}</span>
                <span class="sec-meta-sep">·</span>
                <span>{{ s.authorizedBy }}</span>
                <span v-if="s.expiresAt" class="sec-meta-sep">·</span>
                <span v-if="s.expiresAt">{{ s.expired ? 'expired' : `${daysLeft(s)}d` }}</span>
              </div>
            </div>
            <div v-if="!scopes.length" class="sec-empty sec-empty-sm">
              未登记授权目标。扫描前必须先登记——本模块仅用于自有资产或已授权目标。
            </div>
          </div>
        </section>

        <!-- 左下：状态脉冲 -->
        <section class="sec-frame sec-frame-pulse">
          <header class="sec-frame-head">
            <span class="sec-num">03</span>
            <span class="sec-frame-title">PULSE</span>
            <span class="sec-frame-hint">最近事件</span>
          </header>
          <div class="sec-pulse">
            <div v-for="(a, i) in audit.slice(0, 6)" :key="i" class="sec-pulse-row" :class="{ bad: !a.ok }">
              <span class="sec-pulse-dot" />
              <span class="sec-pulse-time">{{ fmtTime(a.at) }}</span>
              <span class="sec-pulse-tool">{{ a.tool }}</span>
              <span class="sec-pulse-msg">{{ a.message }}</span>
            </div>
            <div v-if="!audit.length" class="sec-empty sec-empty-sm">暂无审计记录</div>
          </div>
          <button class="sec-pulse-more" @click="tab = 'review'">查看全部审计 →</button>
        </section>
      </aside>

      <!-- ============ 右栏 ============ -->
      <section class="sec-col-right">
        <!-- 命令模式（lead=human）：现有扫描控制台原样保留（任务 8.2），v-show 保活不卸载 -->
        <div v-show="lead === 'human'" class="sec-ws">
        <!-- ── 命令行（命令中枢，2026-10-16）──────────────────────────────
             ★ 为什么必须有：安全模式的落地页**就是本页**（没有聊天输入框），
               所以 sec 限定的命令若只挂在聊天框上，等于在哪儿都敲不到。
             ★ 解析与执行与聊天框的面板**同源**：planCommandInput / commandsStore.runTool，
               执行仍是 POST /plugin/sec-lab/run（同一套 withGuard、同一份审计）。 -->
        <div class="sec-cmdbar">
          <span class="sec-cmdbar-k">/</span>
          <input
            v-model="cmdInput" class="sec-cmdbar-input" spellcheck="false"
            :placeholder="cmdPlaceholder"
            @input="updateCmdHints" @keydown.enter.prevent="submitCommand" @keydown.esc="cmdHints = []"
          />
          <span class="sec-cmdbar-tip"><b>/help</b> 看全部命令</span>
          <el-button class="sec-cta" size="small" type="primary" :loading="running" @click="submitCommand">▶ 运行</el-button>
        </div>
        <div v-if="cmdHints.length" class="sec-cmdhints">
          <button v-for="h in cmdHints" :key="h.name" type="button" class="sec-cmdhint" @click="pickCmdHint(h)">
            <b>/{{ h.name }}</b><span>{{ h.desc }}</span>
          </button>
        </div>
        <header class="sec-frame-head sec-frame-head-tab">
          <span class="sec-num">04</span>
          <span class="sec-frame-title">EXEC</span>
          <span class="sec-frame-hint">{{ currentTabLabel }}</span>
        </header>

        <!-- Tab 导航（横向，但带编号 + 状态点） -->
        <nav class="sec-tabs" role="tablist">
          <button
            v-for="t in TABS"
            :key="t.value"
            :class="['sec-tab', { active: tab === t.value }]"
            role="tab"
            :aria-selected="tab === t.value"
            @click="switchTab(t.value)"
          >
            <span class="sec-tab-num">{{ t.num }}</span>
            <span class="sec-tab-name">{{ t.name }}</span>
            <span class="sec-tab-sub">{{ t.sub }}</span>
            <span v-if="tabBadge(t)" class="sec-tab-badge">{{ tabBadge(t) }}</span>
          </button>
        </nav>

        <!-- ========= Tab 1：终端（命令行 + 运行卡 + 高级表单） ========= -->
        <div v-show="tab === 'run'" class="sec-pane">
          <!-- 运行卡：命令行与各高级表单**共用的唯一输出区**（命令行的结果也落这里） -->
          <article class="sec-frame sec-frame-out sec-runcard">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-dot-out" :class="{ active: running }" />
              <span class="sec-frame-title">run card</span>
              <span class="sec-frame-hint">命令行与高级表单共用</span>
              <span class="sec-spacer" />
              <span class="sec-meta-v" v-if="lastRunMs">{{ lastRunMs }}ms</span>
            </header>
            <div class="sec-out-wrap" :class="{ scanning: running }">
              <div v-if="result" class="sec-out">{{ result }}</div>
              <div v-else class="sec-empty">
                在上方命令行敲 <b>/help</b> 看全部命令，或用 <b>@剧本名</b> 一键跑一串；建议先跑 <b>/recon &lt;目标&gt;</b> 摸清暴露面。
              </div>
            </div>
          </article>

          <div class="sec-pane-head">
            <span class="sec-pane-tag">recon · portscan · webprobe · toolchain · report</span>
          </div>
          <div class="sec-row sec-row-ctl">
            <label class="sec-field">
              <span class="sec-field-k">tool</span>
              <el-select v-model="tool" size="small" class="sec-input">
                <el-option v-for="t in BASIC_TOOLS" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </label>
            <label v-if="needsTarget" class="sec-field sec-field-grow">
              <span class="sec-field-k">target</span>
              <el-input v-model="target" size="small" class="sec-input" placeholder="域名或 IP（必须已登记授权）" />
            </label>
            <label v-if="tool === 'portscan'" class="sec-field">
              <span class="sec-field-k">ports</span>
              <el-input v-model="ports" size="small" class="sec-input" placeholder="common / 80,443 / 1-1024" />
            </label>
            <span class="sec-spacer" />
            <el-button class="sec-cta" size="small" type="primary" :loading="running" @click="runBasic">▶ 执行</el-button>
          </div>
        </div>

        <!-- ===== 高级表单 · 演练（攻击模拟 · 隔离靶场 + 人工执行）=====
             收敛后在「终端」Tab 内折叠。★ 人工触发通道必须留着 ——
             attack_sim 是 HUMAN_ONLY，它的「人工点击」入口就是下面的「▶ 演练」按钮。 -->
        <details v-show="tab === 'run'" class="sec-adv">
          <summary class="sec-adv-sum">演练 · attack_sim<span class="sec-adv-hint">隔离靶场 · 仅人工执行 · 只用 system read-only 命令</span></summary>
          <div class="sec-row sec-row-ctl">
            <label class="sec-field sec-field-grow">
              <span class="sec-field-k">target</span>
              <el-input v-model="sim.target" size="small" class="sec-input" placeholder="靶机（必须 environment=lab）" />
            </label>
            <label class="sec-field">
              <span class="sec-field-k">playbook</span>
              <el-select v-model="sim.playbook" size="small" class="sec-input">
                <el-option label="discovery-basic" value="discovery-basic" />
                <el-option label="full-discovery" value="full-discovery" />
                <el-option label="exec-and-evasion" value="exec-and-evasion" />
                <el-option label="custom" value="custom" />
              </el-select>
            </label>
            <label v-if="sim.playbook === 'custom'" class="sec-field sec-field-grow">
              <span class="sec-field-k">techniques</span>
              <el-input v-model="sim.techniques" size="small" class="sec-input" placeholder="T1082,T1057" />
            </label>
            <label class="sec-field">
              <span class="sec-field-k">operator</span>
              <el-input v-model="sim.operator" size="small" class="sec-input" placeholder="操作人（必填）" />
            </label>
            <label class="sec-field sec-field-check">
              <input v-model="sim.planOnly" type="checkbox" />
              <span>planOnly</span>
            </label>
            <span class="sec-spacer" />
            <el-button class="sec-cta sec-cta-warn" size="small" type="warning" :loading="running" @click="startRunSim">▶ 演练</el-button>
            <el-button class="sec-cta-ghost" size="small" @click="getSimReport">复盘</el-button>
          </div>

          <article class="sec-frame sec-frame-note">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-frame-title">principle</span>
              <span class="sec-frame-hint">原则红线</span>
            </header>
            <div class="sec-note">
              <span>演练只用系统自带只读命令（whoami / tasklist / netstat…）复现攻击者行为，验证检测链路是否可见。</span>
              <span class="sec-note-strong">不投放恶意程序、不做免杀、不建立 C2。</span>
              <span class="sec-note-warn"><b>本动作需人工点击</b>，AI 不会自主执行（仅 planOnly 模式可由模型调用）。</span>
            </div>
          </article>

          <article class="sec-frame sec-frame-out">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-dot-out" :class="{ active: running }" />
              <span class="sec-frame-title">exercise log</span>
              <span class="sec-frame-hint">复盘与留痕</span>
            </header>
            <div class="sec-out-wrap" :class="{ scanning: running }">
              <div v-if="result" class="sec-out">{{ result }}</div>
              <div v-else class="sec-empty">
                建议先在隔离靶场跑 <b>discovery-basic</b> 验证基础遥测覆盖，再逐步加 <b>exec-and-evasion</b>。每次演练全量留痕用于复盘与合规追溯。
              </div>
            </div>
          </article>
        </details>

        <!-- ===== 高级表单 · 检测（蓝队）===== -->
        <details v-show="tab === 'run'" class="sec-adv">
          <summary class="sec-adv-sum">检测 · detect_rules / log_hunt<span class="sec-adv-hint">内置 10 条 Sigma / Suricata 规则 + 日志狩猎</span></summary>
          <div class="sec-row sec-row-ctl">
            <label class="sec-field">
              <span class="sec-field-k">mode</span>
              <el-select v-model="detect.kind" size="small" class="sec-input">
                <el-option label="list (全部)" value="list-all" />
                <el-option label="list (sigma)" value="list-sigma" />
                <el-option label="list (suricata)" value="list-suricata" />
                <el-option label="get 单条" value="get" />
                <el-option label="match 文本" value="match" />
              </el-select>
            </label>
            <label v-if="detect.kind === 'get'" class="sec-field sec-field-grow">
              <span class="sec-field-k">id</span>
              <el-input v-model="detect.id" size="small" class="sec-input" placeholder="YZ-001" />
            </label>
            <label v-if="detect.kind === 'match'" class="sec-field sec-field-grow sec-field-grow-2">
              <span class="sec-field-k">text</span>
              <el-input v-model="detect.text" size="small" type="textarea" :rows="4" class="sec-input" placeholder="把日志片段粘进来" />
            </label>
            <label v-if="detect.kind === 'match'" class="sec-field sec-field-grow">
              <span class="sec-field-k">IOCs</span>
              <el-input v-model="detect.iocs" size="small" class="sec-input" placeholder="逗号分隔" />
            </label>
            <span class="sec-spacer" />
            <el-button class="sec-cta" size="small" type="primary" :loading="running" @click="runDetect">▶ 运行</el-button>
          </div>

          <div class="sec-row sec-row-ctl">
            <label class="sec-field sec-field-grow sec-field-grow-2">
              <span class="sec-field-k">log path</span>
              <el-input v-model="hunt.path" size="small" class="sec-input" placeholder="日志文件绝对路径" />
            </label>
            <label class="sec-field sec-field-grow">
              <span class="sec-field-k">IOCs</span>
              <el-input v-model="hunt.iocs" size="small" class="sec-input" placeholder="可选，逗号分隔" />
            </label>
            <span class="sec-spacer" />
            <el-button class="sec-cta" size="small" type="primary" :loading="running" @click="runLogHunt">▶ 狩猎</el-button>
          </div>

          <article class="sec-frame sec-frame-out">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-dot-out" :class="{ active: running }" />
              <span class="sec-frame-title">hit report</span>
              <span class="sec-frame-hint">命中报告</span>
            </header>
            <div class="sec-out-wrap" :class="{ scanning: running }">
              <div v-if="result" class="sec-out">{{ result }}</div>
              <div v-else class="sec-empty">
                蓝队能力：内置 Sigma / Suricata 检测规则覆盖可疑 PowerShell、计划任务持久化、LSASS 凭据访问、C2 beacon、DNS 隧道、扫描器 UA 等；可对日志文件做狩猎。
              </div>
            </div>
          </article>
        </details>

        <!-- ===== 高级表单 · 资产（自有资产监控）===== -->
        <details v-show="tab === 'run'" class="sec-adv">
          <summary class="sec-adv-sum">资产 · asset_monitor<span class="sec-adv-hint">add / list / verify / snapshot / diff</span></summary>
          <div class="sec-row sec-row-ctl">
            <label class="sec-field">
              <span class="sec-field-k">action</span>
              <el-select v-model="easm.action" size="small" class="sec-input">
                <el-option label="add" value="add" />
                <el-option label="list" value="list" />
                <el-option label="verify" value="verify" />
                <el-option label="snapshot" value="snapshot" />
                <el-option label="diff" value="diff" />
              </el-select>
            </label>
            <label v-if="easm.action !== 'list'" class="sec-field sec-field-grow">
              <span class="sec-field-k">value</span>
              <el-input v-model="easm.value" size="small" class="sec-input" :placeholder="easmtValueHint" />
            </label>
            <label v-if="['verify','snapshot','diff'].includes(easm.action)" class="sec-field">
              <span class="sec-field-k">assetId</span>
              <el-input v-model="easm.assetId" size="small" class="sec-input" placeholder="或 id" />
            </label>
            <label v-if="easm.action === 'add'" class="sec-field">
              <span class="sec-field-k">owner</span>
              <el-input v-model="easm.owner" size="small" class="sec-input" placeholder="归属" />
            </label>
            <label v-if="easm.action === 'add'" class="sec-field sec-field-grow">
              <span class="sec-field-k">evidence</span>
              <el-input v-model="easm.evidence" size="small" class="sec-input" placeholder="公网必填：备案号 / 证书主体" />
            </label>
            <span class="sec-spacer" />
            <el-button class="sec-cta" size="small" type="primary" :loading="running" @click="runEasm">▶ 运行</el-button>
          </div>

          <article class="sec-frame sec-frame-note sec-frame-note-lock">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-frame-title">policy</span>
              <span class="sec-frame-hint">资产边界</span>
            </header>
            <div class="sec-note">
              <span class="sec-note-lock-icon" />
              <span>只扫确认归属自己的资产：公网资产必须先登记证据并 verify，未验证一律拒绝；</span>
              <span class="sec-note-strong">不做公网随机目标批量扫描</span>。
            </div>
          </article>

          <article class="sec-frame sec-frame-out">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-dot-out" :class="{ active: running }" />
              <span class="sec-frame-title">asset report</span>
              <span class="sec-frame-hint">台账 / 快照</span>
            </header>
            <div class="sec-out-wrap" :class="{ scanning: running }">
              <div v-if="result" class="sec-out">{{ result }}</div>
              <div v-else class="sec-empty">
                登记资产后先打一份 baseline 快照，后续定期 snapshot + diff 即可第一时间发现新增暴露面或影子子域。
              </div>
            </div>
          </article>
        </details>

        <!-- ========= Tab 2：结果（发现项 + 审计，两个只读列表合一） ========= -->
        <div v-show="tab === 'review'" class="sec-pane">
          <article class="sec-frame sec-frame-list">
            <header class="sec-frame-head">
              <span class="sec-num">05</span>
              <span class="sec-frame-title">FINDINGS</span>
              <span class="sec-frame-hint">分严重度色块</span>
            </header>
            <div class="sec-finding-list">
              <div v-for="f in findings" :key="f.id" class="sec-finding" :data-sev="f.severity">
                <div class="sec-finding-bar" />
                <div class="sec-finding-body">
                  <div class="sec-finding-head">
                    <el-tag size="small" :type="SEV_TAG[f.severity] || 'info'">{{ SEV_LABEL[f.severity] || f.severity }}</el-tag>
                    <span class="sec-finding-title">{{ f.title }}</span>
                  </div>
                  <div class="sec-finding-meta">
                    <span class="sec-meta-k">target</span>
                    <code>{{ f.target }}</code>
                    <span class="sec-meta-sep">·</span>
                    <span class="sec-meta-k">tool</span>
                    <code>{{ f.tool }}</code>
                    <span class="sec-meta-sep">·</span>
                    <span class="sec-meta-k">at</span>
                    <code>{{ fmtTime((f as any).at) }}</code>
                  </div>
                  <div class="sec-finding-detail">{{ f.detail }}</div>
                  <div v-if="f.remediation" class="sec-finding-fix">↳ {{ f.remediation }}</div>
                </div>
              </div>
              <div v-if="!findings.length" class="sec-empty">暂无发现项。</div>
            </div>
          </article>
        </div>

        <!-- ===== 审计（并进「结果」Tab）===== -->
        <div v-show="tab === 'review'" class="sec-pane">
          <article class="sec-frame sec-frame-list">
            <header class="sec-frame-head">
              <span class="sec-num">06</span>
              <span class="sec-frame-title">AUDIT</span>
              <span class="sec-frame-hint">最近 100 条全量留痕</span>
            </header>
            <div class="sec-audit-list">
              <div v-for="(a, i) in audit" :key="i" class="sec-audit" :class="{ bad: !a.ok }">
                <span class="sec-audit-time">{{ fmtTime(a.at) }}</span>
                <span class="sec-audit-mark" />
                <code class="sec-audit-tool">{{ a.tool }}</code>
                <code class="sec-audit-target">{{ a.target || '-' }}</code>
                <span class="sec-audit-msg">{{ a.message }}</span>
              </div>
              <div v-if="!audit.length" class="sec-empty">暂无审计记录。</div>
            </div>
          </article>
        </div>

        <!-- ===== 经验库（自学习，P5）：待审 → 人工审批 → 才注入提示词 ===== -->
        <div v-show="tab === 'review'" class="sec-pane">
          <article class="sec-frame sec-frame-list">
            <header class="sec-frame-head">
              <span class="sec-num">07</span>
              <span class="sec-frame-title">EXPERIENCE</span>
              <span class="sec-frame-hint">待审 {{ expCounts.pending }} · 已批准 {{ expCounts.approved }} · 仅 approved 注入提示词</span>
              <span class="sec-spacer" />
              <el-button size="small" @click="showExpForm = !showExpForm">{{ showExpForm ? '收起' : '人工新增' }}</el-button>
            </header>

            <div v-if="showExpForm" class="sec-exp-form">
              <el-input v-model="expDraft.title" size="small" placeholder="标题：这条经验解决什么问题（2-80 字）" />
              <el-input v-model="expDraft.source" size="small" placeholder="来源/依据：finding id / 命令 / 报告" />
              <el-input v-model="expDraft.tags" size="small" placeholder="标签（逗号分隔，可空）" />
              <el-input v-model="expDraft.body" type="textarea" :rows="3" placeholder="正文：做法、边界、验证方式（20-1200 字；不要写凭据/隐私）" />
              <div class="sec-exp-actions">
                <el-button size="small" type="primary" :loading="expBusy === 'new'" @click="proposeExperience">提交待审</el-button>
                <span class="sec-exp-note">提交后仍需人工批准，不会立即影响模型行为。</span>
              </div>
            </div>

            <div class="sec-exp-list">
              <div class="sec-exp-group-title">待审队列（{{ expPending.length }}）</div>
              <div v-for="e in expPending" :key="e.id" class="sec-exp-item">
                <div class="sec-exp-item-head">
                  <code class="sec-exp-id">{{ e.id }}</code>
                  <span class="sec-exp-title">{{ e.title }}</span>
                  <el-tag v-for="t in e.tags" :key="t" size="small" effect="plain">{{ t }}</el-tag>
                  <span class="sec-spacer" />
                  <el-tag size="small" type="warning" effect="plain">{{ e.submittedBy === 'human' ? '人工提交' : '模型提交' }}</el-tag>
                </div>
                <div class="sec-exp-meta">来源：{{ e.source }} · {{ fmtTime(e.createdAt) }}</div>
                <div class="sec-exp-body">{{ e.body }}</div>
                <div class="sec-exp-actions">
                  <el-button size="small" type="success" :loading="expBusy === e.id" @click="decideExperienceRow(e, 'approve')">批准</el-button>
                  <el-button size="small" type="danger" plain :loading="expBusy === e.id" @click="decideExperienceRow(e, 'reject')">驳回</el-button>
                  <span class="sec-exp-note">批准后才会进入后续任务的系统提示词。</span>
                </div>
              </div>
              <div v-if="!expPending.length" class="sec-empty sec-empty-sm">没有待审经验。安全助手在任务收尾时可以用 /experience propose 提交。</div>
            </div>
          </article>

          <article class="sec-frame sec-frame-list">
            <header class="sec-frame-head">
              <span class="sec-frame-title">approved</span>
              <span class="sec-frame-hint">已批准（{{ expApproved.length }}）· 会进入安全助手提示词</span>
            </header>
            <div class="sec-exp-list">
              <div v-for="e in expApproved" :key="e.id" class="sec-exp-item sec-exp-item-ok">
                <div class="sec-exp-item-head">
                  <code class="sec-exp-id">{{ e.id }}</code>
                  <span class="sec-exp-title">{{ e.title }}</span>
                  <el-tag v-for="t in e.tags" :key="t" size="small" effect="plain">{{ t }}</el-tag>
                </div>
                <div class="sec-exp-meta">来源：{{ e.source }} · 审批人 {{ e.decidedBy || 'operator' }} · {{ fmtTime(e.decidedAt) }}</div>
                <div class="sec-exp-body">{{ e.body }}</div>
              </div>
              <div v-if="!expApproved.length" class="sec-empty sec-empty-sm">暂无已批准经验。</div>
            </div>
          </article>

          <details v-if="expRejected.length" class="sec-adv">
            <summary>已驳回（{{ expRejected.length }}）</summary>
            <div class="sec-exp-list">
              <div v-for="e in expRejected" :key="e.id" class="sec-exp-item">
                <div class="sec-exp-item-head">
                  <code class="sec-exp-id">{{ e.id }}</code>
                  <span class="sec-exp-title">{{ e.title }}</span>
                  <span class="sec-spacer" />
                  <span class="sec-exp-meta">驳回：{{ e.reason || '未说明' }}</span>
                </div>
              </div>
            </div>
          </details>
        </div>

        <!-- ========= Tab 3：环境 / 靶场（宿主机 Docker + Android，仅本机） ========= -->
        <div v-show="tab === 'env'" class="sec-pane">
          <div class="sec-pane-head">
            <span class="sec-pane-tag sec-pane-tag-info">host_env · range · android　仅本机基础设施，不向任何外部目标发起流量</span>
          </div>

          <div class="sec-row sec-row-ctl">
            <el-button class="sec-cta" size="small" type="primary" :loading="envLoading" @click="probeEnv">⟳ 重新探测</el-button>
            <span class="sec-env-note">检查宿主机 Docker / Android SDK，为靶场部署与移动端测试做前提检查。</span>
            <span class="sec-spacer" />
          </div>

          <div v-if="hostEnv" class="sec-env-grid">
            <article class="sec-frame sec-frame-env" :data-up="hostEnv.docker.available && hostEnv.docker.daemonUp">
              <header class="sec-frame-head sec-frame-head-sm">
                <span class="sec-frame-title">docker</span>
                <span class="sec-frame-hint">{{ hostEnv.docker.available ? (hostEnv.docker.daemonUp ? 'daemon 可达' : 'daemon 未响应') : '未检测到' }}</span>
              </header>
              <div class="sec-env-body">
                <div class="sec-env-line"><span class="sec-meta-k">version</span><code>{{ hostEnv.docker.version || '—' }}</code></div>
                <div class="sec-env-line"><span class="sec-meta-k">compose</span><code>{{ hostEnv.docker.composeV2 ? 'v2 可用' : '不可用' }}</code></div>
                <div class="sec-env-note2">{{ hostEnv.docker.note }}</div>
              </div>
            </article>
            <article class="sec-frame sec-frame-env" :data-up="hostEnv.android.adbAvailable || hostEnv.android.emulatorAvailable">
              <header class="sec-frame-head sec-frame-head-sm">
                <span class="sec-frame-title">android</span>
                <span class="sec-frame-hint">{{ hostEnv.android.adbAvailable || hostEnv.android.emulatorAvailable ? 'SDK 可用' : '未检测到' }}</span>
              </header>
              <div class="sec-env-body">
                <div class="sec-env-line"><span class="sec-meta-k">adb</span><code>{{ hostEnv.android.adbAvailable ? '可用' : '缺失' }}</code></div>
                <div class="sec-env-line"><span class="sec-meta-k">emulator</span><code>{{ hostEnv.android.emulatorAvailable ? '可用' : '缺失' }}</code></div>
                <div class="sec-env-line"><span class="sec-meta-k">AVD</span><code>{{ hostEnv.android.avds.length ? hostEnv.android.avds.join(', ') : '—' }}</code></div>
                <div class="sec-env-line"><span class="sec-meta-k">运行中</span><code>{{ hostEnv.android.running.join(', ') || '—' }}</code></div>
                <div class="sec-env-note2">{{ hostEnv.android.note }}</div>
              </div>
            </article>
          </div>
          <div v-else class="sec-empty">尚未探测。点击「重新探测」检查宿主机 Docker 与 Android 环境。</div>

          <article class="sec-frame sec-frame-out">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-frame-title">range deploy</span>
              <span class="sec-frame-hint">白名单漏洞训练镜像 · 仅本机 Docker · label=yan-zhi-range</span>
            </header>
            <div class="sec-row sec-row-ctl">
              <label class="sec-field sec-field-grow">
                <span class="sec-field-k">template</span>
                <el-select v-model="rangeForm.template" size="small" class="sec-input">
                  <el-option v-for="t in rangeTemplates" :key="t.id" :label="`${t.name}（:${t.defaultHostPort}）`" :value="t.id" />
                </el-select>
              </label>
              <label class="sec-field">
                <span class="sec-field-k">hostPort</span>
                <el-input v-model="rangeForm.hostPortText" size="small" class="sec-input" :placeholder="`默认 ${rangeTemplates.find((t) => t.id === rangeForm.template)?.defaultHostPort ?? ''}`" />
              </label>
              <span class="sec-spacer" />
              <el-button class="sec-cta" size="small" type="primary" :loading="running" @click="deployRange">▶ 部署靶场</el-button>
              <el-button class="sec-cta-ghost" size="small" @click="refreshInstances">刷新列表</el-button>
            </div>
            <div v-if="rangeInsts.length" class="sec-range-list">
              <div v-for="ri in rangeInsts" :key="ri.name" class="sec-range-row">
                <code class="sec-range-name">{{ ri.name }}</code>
                <span class="sec-range-meta">{{ ri.image }}　→　http://localhost:{{ ri.hostPort }}　{{ ri.status }}</span>
                <span class="sec-spacer" />
                <el-button size="small" type="danger" plain @click="stopRangeInst(ri.name)">停止</el-button>
              </div>
            </div>
            <div v-else class="sec-empty sec-empty-sm">当前没有运行中的靶场容器。</div>
          </article>

          <article class="sec-frame sec-frame-out">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-frame-title">android avd</span>
              <span class="sec-frame-hint">移动端安全测试环境（冷启动约 1–3 分钟）</span>
            </header>
            <div class="sec-row sec-row-ctl">
              <label class="sec-field sec-field-grow">
                <span class="sec-field-k">avd</span>
                <el-select v-model="avdSel" size="small" class="sec-input" :disabled="!hostEnv?.android.avds.length" placeholder="先探测出 AVD 列表">
                  <el-option v-for="a in hostEnv?.android.avds || []" :key="a" :label="a" :value="a" />
                </el-select>
              </label>
              <span class="sec-spacer" />
              <el-button class="sec-cta" size="small" type="primary" :loading="running" :disabled="!hostEnv?.android.emulatorAvailable" @click="launchAvd">▶ 启动模拟器</el-button>
            </div>
          </article>

          <article class="sec-frame sec-frame-out">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-dot-out" :class="{ active: running }" />
              <span class="sec-frame-title">output</span>
              <span class="sec-frame-hint">部署 / 启动输出</span>
            </header>
            <div class="sec-out-wrap" :class="{ scanning: running }">
              <div v-if="result" class="sec-out">{{ result }}</div>
              <div v-else class="sec-empty">靶场部署与模拟器启动的执行输出会显示在这里。</div>
            </div>
          </article>
        </div>

        <!-- ===== 能力边界（明确不实现 + 规划中）· 并进「环境」Tab ===== -->
        <div v-show="tab === 'env'" class="sec-pane">
          <article class="sec-frame sec-frame-note sec-frame-note-lock">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-frame-title">not-implemented</span>
              <span class="sec-frame-hint">明确不实现 · 合规红线 · 永不开放</span>
            </header>
            <div class="sec-boundary-grid">
              <div v-for="b in BOUNDARY_LOCKED" :key="b.name" class="sec-bcard sec-bcard-lock">
                <div class="sec-bcard-head">
                  <span class="sec-bcard-lockicon" />
                  <span class="sec-bcard-name">{{ b.name }}</span>
                  <el-tag size="small" type="danger" effect="plain">明确不实现</el-tag>
                </div>
                <div class="sec-bcard-reason">{{ b.reason }}</div>
                <div class="sec-bcard-detail">{{ b.detail }}</div>
              </div>
            </div>
          </article>

          <article class="sec-frame sec-frame-list">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-frame-title">roadmap</span>
              <span class="sec-frame-hint">规划中 · 后续版本</span>
            </header>
            <div class="sec-boundary-grid">
              <div v-for="r in ROADMAP" :key="r.name" class="sec-bcard">
                <div class="sec-bcard-head">
                  <el-tag size="small" type="info" effect="plain">{{ r.phase }}</el-tag>
                  <span class="sec-bcard-name">{{ r.name }}</span>
                </div>
                <div class="sec-bcard-detail">{{ r.note }}</div>
              </div>
            </div>
          </article>
        </div>
        </div><!-- /.sec-ws 命令模式 -->

        <!-- AI 模式（lead=ai）：对话即执行界面（任务 8.1 / 8.3）。
             对话只是「人通过对话发起扫描」的入口：所有执行仍走既有授权范围校验 +
             危险动作黑名单 + HUMAN_ONLY 闸门 + 全量审计，不放宽任何权限（任务 8.6 红线）。 -->
        <div v-show="lead === 'ai'" class="sec-ai">
          <div ref="secChatListEl" class="sec-ai-list" @click="onSecMdClick">
            <div v-if="!secMessages.length" class="sec-ai-welcome">
              <el-icon :size="30" class="sec-ai-welcome-icon"><ChatDotRound /></el-icon>
              <p class="sec-ai-welcome-title">安全助手</p>
              <p class="sec-ai-welcome-sub">
                描述安全任务，我来执行：目标画像、端口/Web 探测、检测规则、日志狩猎、报告……<br />
                仅限已登记授权的目标；危险动作需人工确认，全程留痕。
              </p>
            </div>
            <div v-for="m in secMessages" :key="m.id" :class="['sec-ai-msg', m.role === 'user' ? 'msg-user' : 'msg-assistant']">
              <div class="sec-ai-avatar" :class="m.role === 'user' ? 'avatar-user' : 'avatar-assistant'">
                <el-icon :size="15"><component :is="m.role === 'user' ? User : ChatDotRound" /></el-icon>
              </div>
              <div class="sec-ai-body">
                <div class="sec-ai-meta">
                  <span class="sec-ai-name">{{ m.role === 'user' ? '我' : (m.subAgentName || '安全助手') }}</span>
                  <span v-if="m.createdAt" class="sec-ai-time">{{ fmtTime(m.createdAt) }}</span>
                  <span v-if="m.streaming" class="sec-ai-streaming">输出中…</span>
                </div>
                <div v-if="m.role === 'user'" class="sec-ai-content">{{ m.content }}</div>
                <div v-else class="sec-ai-content sec-ai-md" v-html="renderSecMarkdown(m.content)"></div>
              </div>
            </div>
          </div>
          <div class="sec-ai-input">
            <el-input
              v-model="secChatInput"
              type="textarea"
              :rows="2"
              :disabled="secChatStreaming || secCmdRunning"
              placeholder="输入安全任务，Ctrl+Enter 发送；/命令 或 @剧本 会直接执行"
              @keydown.ctrl.enter="sendSecChat"
            />
            <!-- 输入框工具条（对齐运维模式 P0）：左=动作语义，右=模型 / 执行权限 / 发送 -->
            <div class="sec-ai-toolbar">
              <div class="sec-ai-toolbar-group">
                <el-button
                  size="small"
                  class="sec-ai-tool-btn"
                  :class="{ 'sec-ai-tool-btn-active': secAiAction === 'exec' }"
                  :plain="secAiAction === 'exec'"
                  :disabled="secChatStreaming || secCmdRunning"
                  title="把 /安全命令 或 @剧本 直接交给命令总线（不经过模型，仍过护栏与审计）"
                  @click="secAiAction = 'exec'"
                >执行</el-button>
                <el-button
                  size="small"
                  class="sec-ai-tool-btn"
                  :class="{ 'sec-ai-tool-btn-active': secAiAction === 'agent' }"
                  :plain="secAiAction === 'agent'"
                  :disabled="secChatStreaming || secCmdRunning"
                  title="交给安全助手理解与编排"
                  @click="secAiAction = 'agent'"
                >Agent</el-button>
              </div>
              <span class="sec-spacer" />
              <el-select
                v-model="secModelId"
                size="small"
                class="sec-ai-model-select"
                placeholder="默认模型"
                :disabled="secChatStreaming || secCmdRunning"
                @change="saveSecModel"
                @visible-change="onSecModelDropdown"
              >
                <el-option :value="''" :label="`默认（${defaultModelLabel}）`" />
                <el-option v-for="m in chatModelOptions" :key="m.id" :value="m.id" :label="modelLabel(m)" />
              </el-select>
              <el-popover placement="top-end" :width="286" trigger="click">
                <template #reference>
                  <el-button size="small" text class="sec-ai-perm-btn" title="执行权限（交战模式 / 授权范围）">
                    <el-icon :size="14"><Setting /></el-icon>
                  </el-button>
                </template>
                <div class="sec-ai-perm-panel">
                  <div class="sec-ai-perm-title">执行权限</div>
                  <p class="sec-ai-perm-sub">
                    侵入性动作（爆破 / 注入验证）默认关闭；开启前请确认目标已授权且环境隔离。
                  </p>
                  <div class="sec-ai-perm-row">
                    <span>交战模式</span>
                    <el-switch :model-value="cfg.engagementMode" size="small" @change="toggleEngagement($event === true)" />
                  </div>
                  <div class="sec-ai-perm-meta">当前授权目标 {{ scopes.length }} 个 · 风险上限以每条授权记录为准</div>
                  <div v-if="cfg.engagementMode" class="sec-ai-perm-warn">
                    ⚠ 交战模式已开启：服务端仍会逐条校验授权范围、风险级与确认标记，不会因为开关而跳过。
                  </div>
                </div>
              </el-popover>
              <span class="sec-ai-scope-hint">{{ scopes.length }} 个授权目标</span>
              <el-button
                size="small"
                :type="secBackground ? 'primary' : ''"
                :plain="!secBackground"
                :disabled="secChatStreaming || secCmdRunning"
                title="后台执行：提交后不等待结果；服务端继续执行，可在任务列表查看进度与结果"
                @click="secBackground = !secBackground"
              >后台</el-button>
              <span v-if="secChatStreaming || secCmdRunning" class="sec-ai-hint">执行中…</span>
              <el-button v-if="secChatStreaming" size="small" type="warning" @click="abortSecChat">停止</el-button>
              <el-button size="small" :disabled="secChatStreaming || secCmdRunning || !secChatInput.trim()" type="primary" @click="sendSecChat">{{ secAiAction === 'exec' ? '执行' : '发送' }}</el-button>
            </div>
          </div>
        </div><!-- /.sec-ai AI 模式 -->
      </section>
    </div>

    <!-- 主导方悬浮胶囊（任务 8.4：命令模式 ↔ AI 模式，右下角，不占布局行） -->
    <LeadToggle :model-value="lead" mode="sec" @update:model-value="onLeadChange" />

    <!-- ============ 登记授权目标：统一 FormDialog（取消/登记底栏由组件默认渲染） ============ -->
    <FormDialog v-model="showAdd" title="登记授权目标" width="520px" confirm-text="登记" @submit="addScope">
      <el-form label-width="92px" size="small">
        <el-form-item label="类型">
          <el-select v-model="form.type">
            <el-option label="域名（含子域）" value="domain" />
            <el-option label="单个 IP" value="ip" />
            <el-option label="网段 CIDR" value="cidr" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标值">
          <el-input v-model="form.value" :placeholder="form.type === 'cidr' ? '10.0.0.0/24' : form.type === 'ip' ? '10.0.0.5' : 'example.com'" />
        </el-form-item>
        <el-form-item label="授权人">
          <el-input v-model="form.authorizedBy" placeholder="谁授权的（必填）" />
        </el-form-item>
        <el-form-item label="证明材料">
          <el-input v-model="form.evidence" placeholder="工单号 / 合同编号 / 授权邮件（选填）" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker v-model="form.expiresAt" type="datetime" placeholder="不填为长期" value-format="x" />
        </el-form-item>
        <el-form-item label="最高风险">
          <el-select v-model="form.maxRisk">
            <el-option label="passive（仅被动侦察）" value="passive" />
            <el-option label="active（含主动探测）" value="active" />
            <el-option label="intrusive（含侵入性动作）" value="intrusive" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标环境">
          <el-select v-model="form.environment">
            <el-option label="lab（隔离靶场 · 唯一允许 attack_sim）" value="lab" />
            <el-option label="internal（内网，默认）" value="internal" />
            <el-option label="production（生产）" value="production" />
            <el-option label="public（公网 · 必须有归属证据）" value="public" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.environment === 'public'" label="归属证据">
          <el-input v-model="form.ownershipEvidence" placeholder="备案号 / 证书主体 / 域名注册信息（公网必填）" />
        </el-form-item>
      </el-form>
    </FormDialog>

    <!-- ============ 演练二次确认 ============ -->
    <el-dialog v-model="simConfirm" title="演练二次确认" width="520px" :close-on-click-modal="false">
      <div class="sec-confirm">
        <div class="sec-confirm-row"><span class="k">靶场目标</span><span class="v">{{ sim.target }}</span></div>
        <div class="sec-confirm-row"><span class="k">剧本</span><span class="v">{{ sim.playbook === 'custom' ? `自定义 ${sim.techniques}` : sim.playbook }}</span></div>
        <div class="sec-confirm-row"><span class="k">操作人</span><span class="v">{{ sim.operator }}</span></div>
        <div class="sec-confirm-row"><span class="k">仅计划</span><span class="v">{{ sim.planOnly ? '是（不执行）' : '否（将执行真实命令）' }}</span></div>
        <el-alert type="warning" :closable="false" show-icon>
          请确认靶机是隔离环境，且未对生产业务有任何影响。本操作将全量留痕（时间 / 操作人 / 命令 / 输出），用于合规追溯。
        </el-alert>
      </div>
      <template #footer>
        <el-button size="small" @click="simConfirm = false">取消</el-button>
        <el-button size="small" type="warning" @click="confirmRunSim">人工确认并执行</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ChatDotRound, Close, QuestionFilled, Setting, User } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, API_BASE } from '../../api/client';
import { consumeSseStream } from '../../utils/sse';
import { useSettingsStore } from '../../stores/settings';
import { usePlatformStore } from '../../stores/platform';
import TaskListSection from '../../components/workbench/TaskListSection.vue';
import LeadToggle from '../../components/workbench/LeadToggle.vue';
import FormDialog from '../../components/FormDialog.vue';
import { activeMode, leadOf, setLead, type LeadMode } from '../../stores/mode';
import { useChat } from '../../composables/chat/useChat';
// 命令中枢（2026-10-16）：命令行与聊天框的面板**同源**（同一份解析、同一个执行出口）
import type { CommandDef } from '@yan-zhi/core';
import { useCommandsStore } from '../../stores/commands';
import { formatHelp, planCommandInput, planPlaybookSummon, type ParsedCommand } from '../../utils/commandParser';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const BASE = '/plugin/sec-lab';


// ============================================================
// 主导方双形态（任务 8.1–8.6）：human = 命令模式（现有控制台，原样保留）
// ai = AI 模式（对话居中）。对话只做「人通过对话发起扫描」的入口，
// 所有执行仍由 sec-lab 既有授权范围校验 / 危险动作黑名单 / HUMAN_ONLY /
// 全量审计兜底 —— 不新增任何绕过路径。
// ============================================================
const lead = computed<LeadMode>(() => leadOf(activeMode.value));
function onLeadChange(v: LeadMode) {
  setLead(activeMode.value, v);
}

// ---------- AI 模式对话：单会话（绑定 a_builtin_sec_agent），状态本地保留 ----------
const SEC_AGENT_ID = 'a_builtin_sec_agent';
interface SecMsg { id: string; role: string; content: string; subAgentName?: string | null; createdAt?: number; streaming?: boolean }
const secMessages = ref<SecMsg[]>([]);
const secChatInput = ref('');
const secChatStreaming = ref(false);
/** 输入框动作语义：agent=交给安全助手；exec=把 /命令 或 @剧本 直接交给安全命令总线（不过模型） */
const secAiAction = ref<'agent' | 'exec'>('agent');
/** 命令直执行中的本地忙标记（命令是有限动作，不提供"停止"按钮） */
const secCmdRunning = ref(false);
/** P2 后台执行：提交后不等待 SSE，服务端任务继续跑，切回命令模式可在任务列表看进度 */
const secBackground = ref(false);
const secConvId = ref((() => { try { return localStorage.getItem('sec-ai-conv') || ''; } catch { return ''; } })());
const secChatListEl = ref<HTMLElement | null>(null);
let secAbort: AbortController | null = null;

// 平台/模型（与运维控制台同口径：读设置里的默认平台与模型）
const settingsStore = useSettingsStore();
const platformStore = usePlatformStore();

// ---------- AI 模式输入框工具条（对齐运维模式 P0-1，2026-10-17）----------
// ★ 会话内模型选择：空 = 跟随设置（零迁移）；选了就按模型归属解析平台。
//   选中模型被删/停用时明确提示并回落，不静默跨模型发送。
const secModelId = ref((() => { try { return localStorage.getItem('sec-ai-model') || ''; } catch { return ''; } })());
/** 会话内模型选择本地留档：刷新后仍用同一个模型（空 = 跟随设置） */
function saveSecModel(v: unknown) {
  try { localStorage.setItem('sec-ai-model', String(v || '')); } catch { /* 隐私模式忽略 */ }
}
const chatModelOptions = computed(() =>
  platformStore.models.filter((m: any) => (m.type || 'llm') === 'llm' && m.enabled !== false && m.visible !== false),
);
const defaultModelLabel = computed(() => {
  const m = platformStore.models.find((x: any) => x.id === settingsStore.settings.defaultModelId);
  return m ? (m.alias || m.modelId) : '跟随设置';
});
function modelLabel(m: any): string {
  return m.alias || m.modelId || m.id;
}
/** 打开下拉时补拉全量模型：本页可能只加载过默认平台那一份 */
function onSecModelDropdown(open: boolean) {
  if (!open) return;
  void platformStore.loadModels().catch(() => { /* 拉取失败保留现有列表 */ });
}

async function resolveSecModel(): Promise<{ platform: any; model: any } | null> {
  const selectedId = secModelId.value.trim();
  if (selectedId && !platformStore.models.some((m: any) => m.id === selectedId)) {
    await platformStore.loadModels().catch(() => {});
  }
  let model: any = selectedId ? platformStore.models.find((m: any) => m.id === selectedId) : undefined;
  if (selectedId && (!model || model.enabled === false)) {
    secModelId.value = '';
    saveSecModel('');
    ElMessage.warning(`本会话选择的模型已不可用（${selectedId}），已回落为设置里的默认模型`);
    model = undefined;
  }
  if (!model) {
    if (!platformStore.models.length) await platformStore.loadModels().catch(() => {});
    model = platformStore.models.find((m: any) => m.id === settingsStore.settings.defaultModelId && m.enabled !== false);
  }
  if (!model) {
    ElMessage.warning('请先在「设置」配置默认平台与模型（AI 模式需要）');
    return null;
  }
  let platform: any = platformStore.platforms.find((p: any) => p.id === model.platformId);
  if (!platform) {
    await platformStore.loadPlatforms().catch(() => {});
    platform = platformStore.platforms.find((p: any) => p.id === model.platformId);
  }
  if (!platform) {
    ElMessage.warning(`模型「${model.alias || model.modelId}」所属平台不可用，请到「设置 → 模型平台」检查`);
    return null;
  }
  return { platform, model };
}

/** 执行权限：交战模式（侵入性动作总开关）。开启前必须人工确认，服务端仍逐条校验。 */
async function toggleEngagement(v: boolean) {
  if (v) {
    try {
      await ElMessageBox.confirm(
        '开启「交战模式」后，安全助手可执行侵入性动作（SQLi / SSRF 验证、默认口令自查等）。' +
        '<br><br>只应在<b>已授权目标或隔离靶场</b>上使用；服务端仍会逐条校验授权范围与风险级，所有动作全程留痕。',
        '开启交战模式',
        { dangerouslyUseHTMLString: true, type: 'warning', confirmButtonText: '开启', cancelButtonText: '取消' },
      );
    } catch { return; }
  }
  const r = await api.post(`${BASE}/config`, { engagementMode: v });
  if ('error' in r) { ElMessage.error(String(r.error)); return; }
  cfg.engagementMode = v;
  ElMessage.success(v ? '交战模式已开启' : '交战模式已关闭');
}

async function ensureSecConversation(): Promise<string> {
  if (secConvId.value) return secConvId.value;
  const r = await api.post<any>('/conversations', { title: '安全控制台', agentId: SEC_AGENT_ID });
  if ('error' in r) throw new Error(r.error);
  secConvId.value = (r.data as any).id as string;
  // 刷新后回到同一个安全会话（而不是每题都新建一个）
  try { localStorage.setItem('sec-ai-conv', secConvId.value); } catch { /* 隐私模式忽略 */ }
  return secConvId.value;
}

async function loadSecMessages() {
  if (!secConvId.value) return;
  const r = await api.get<any[]>(`/conversations/${secConvId.value}/messages`);
  if ('error' in r) {
    // 会话被删除/无权访问：清掉本地指针，下一次发送时重建，不卡在一个坏 id 上
    secConvId.value = '';
    secMessages.value = [];
    try { localStorage.removeItem('sec-ai-conv'); } catch { /* 忽略 */ }
    return;
  }
  if ('data' in r) {
    secMessages.value = (r.data as any[]).map((m) => ({
      id: m.id, role: m.role, content: m.content || '',
      subAgentName: m.sub_agent_name || null, createdAt: m.created_at,
    }));
  }
}

function scrollSecBottom() {
  void nextTick(() => { if (secChatListEl.value) secChatListEl.value.scrollTop = secChatListEl.value.scrollHeight; });
}

/** 上下文提示：把当前授权范围带给安全助手（只传目标值，不传凭据） */
function scopeHint(): string {
  if (!scopes.value.length) return '\n\n（当前未登记任何授权目标——请提醒用户先在控制台登记授权范围，不得扫描未授权目标。）';
  const list = scopes.value.map((s) => `${s.value}［${s.environment || 'internal'} / ${s.maxRisk}${s.expired ? ' / 已过期' : ''}］`).join('；');
  return `\n\n（当前授权范围（仅可对这些目标操作）：${list}）`;
}

/** 在 AI 对话里追加一条本地消息（命令直执行的结果，不落库） */
function pushSecLocal(role: 'user' | 'assistant', content: string) {
  secMessages.value.push({
    id: `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role, content, createdAt: Date.now(),
  });
  scrollSecBottom();
}

/**
 * P1 执行指令：把 `/命令` 或 `@剧本` 直接交给安全命令总线（与控制台命令行同一条链）。
 * ★ 不经过 LLM，但仍然：解析 → 危险命令确认 → POST /plugin/sec-lab/run → withGuard → 审计。
 *   命令层没有新的绕过路径；AI 输入框只是多了一个"人直接敲命令"的入口。
 */
async function runSecCommandFromAi(line: string) {
  if (!line.startsWith('/') && !line.startsWith('@')) {
    ElMessage.warning('执行模式只接受 /安全命令 或 @剧本；自然语言请切回 Agent');
    return;
  }
  secChatInput.value = '';
  pushSecLocal('user', line);
  secCmdRunning.value = true;
  const prevCmdInput = cmdInput.value;
  cmdInput.value = line;
  result.value = ''; // 防止命令无文本输出时把上一次的输出误当成这次结果
  try {
    await submitCommand();
    const out = String(result.value || '').trim();
    pushSecLocal('assistant', out
      ? `命令已直接执行（未经过模型）：\n\n\`\`\`\n${out}\n\`\`\``
      : '命令已提交执行；该命令没有文本输出，详情见「终端」页运行卡与审计记录。');
  } catch (e) {
    pushSecLocal('assistant', `命令执行失败：${(e as Error).message || e}`);
  } finally {
    secCmdRunning.value = false;
    // submitCommand 清空了自己的输入；恢复用户原本的命令行草稿，避免串到命令模式
    if (!cmdInput.value) cmdInput.value = prevCmdInput;
  }
}

async function sendSecChat() {
  const content = secChatInput.value.trim();
  if (!content || secChatStreaming.value || secCmdRunning.value) return;
  // P1 执行指令（对齐运维方案）：执行模式，或以 / 、@ 开头 → 直接走安全命令总线。
  // ★ 不过模型 ≠ 不过护栏：执行末端仍是 POST /plugin/sec-lab/run（人工入口）→ withGuard → 审计。
  if (secAiAction.value === 'exec' || content.startsWith('/') || content.startsWith('@')) {
    await runSecCommandFromAi(content);
    return;
  }
  const resolved = await resolveSecModel();
  if (!resolved) return;
  const { platform, model } = resolved;
  try {
    await ensureSecConversation();
  } catch (e) {
    ElMessage.error('创建会话失败: ' + (e as Error).message);
    return;
  }
  secChatInput.value = '';
  secChatStreaming.value = true;
  secMessages.value.push({ id: `local-${Date.now()}`, role: 'user', content, createdAt: Date.now() });
  scrollSecBottom();
  const prompt = content + scopeHint();

  secAbort = new AbortController();
  let backgroundSubmitted = false;
  try {
    const taskRes = await api.post<any>('/llm/tasks', {
      conversationId: secConvId.value,
      platformId: platform.id,
      modelId: model.id,
      userContent: prompt,
      agentId: SEC_AGENT_ID,
    });
    if ('error' in taskRes) throw new Error(taskRes.error);
    const taskId = taskRes.data.taskId as string;
    if (secBackground.value) {
      // P2：只提交、不订阅。任务在服务端继续执行并落库；切回命令模式的任务列表可看进度与结果。
      backgroundSubmitted = true;
      pushSecLocal('assistant', `已提交后台任务（${taskId}）。本面板不等待结果，服务端会继续执行；`
        + `切回命令模式即可在左侧任务列表查看进度与结果。`);
      return;
    }
    await subscribeSecTask(taskId, secAbort);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') ElMessage.error('执行失败: ' + (e as Error).message);
  } finally {
    secChatStreaming.value = false;
    secAbort = null;
    // 后台提交保留本地"已提交"回执；普通流程从服务端拉规范消息列表
    if (!backgroundSubmitted) await loadSecMessages();
    scrollSecBottom();
  }
}

async function abortSecChat() {
  secAbort?.abort();
  if (!secConvId.value) return;
  try {
    const token = localStorage.getItem('auth_token') || '';
    const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${secConvId.value}`);
    const taskId = ('data' in r && r.data?.[0]?.id) || null;
    if (taskId) await fetch(`${API_BASE}/llm/tasks/${taskId}/abort`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch { /* 忽略 */ }
}

/** SSE 订阅（与运维控制台同协议；状态完全本地，不碰全局 chat store） */
async function subscribeSecTask(taskId: string, ac: AbortController): Promise<void> {
  const token = localStorage.getItem('auth_token') || '';
  const resp = await fetch(`${API_BASE}/llm/tasks/${taskId}/stream?since=0`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: ac.signal,
  });
  if (!resp.ok || !resp.body) throw new Error('SSE 连接失败');
  // SSE 解码统一走 utils/sse（P5 收口）；与运维控制台同协议，状态完全本地
  await consumeSseStream(resp.body, (payload) => {
    {
      let event: any;
      try { event = JSON.parse(payload); } catch { return; }
      if (event.type === 'message:added') {
        const msg = event.message;
        if (!secMessages.value.some((m) => m.id === msg.id)) {
          secMessages.value.push({
            id: msg.id, role: msg.role, content: msg.content || '',
            subAgentName: msg.subAgentName || msg.sub_agent_name || null,
            streaming: msg.role === 'assistant', createdAt: Date.now(),
          });
        }
        scrollSecBottom();
      } else if (event.type === 'chunk') {
        const list = secMessages.value;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].role === 'assistant' && list[i].streaming) {
            if (event.content) list[i].content += event.content;
            scrollSecBottom();
            break;
          }
        }
      } else if (event.type === 'task:completed' || event.type === 'task:error' || event.type === 'task:aborted') {
        for (const m of secMessages.value) m.streaming = false;
        if (event.type === 'task:error' && event.error) {
          secMessages.value.push({ id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ ${event.error}`, createdAt: Date.now() });
        }
        scrollSecBottom();
        // 任务已终态：告诉 sse 层停止读取（对齐原实现读循环直接 return 的语义）
        return false;
      }
    }
  });
  for (const m of secMessages.value) m.streaming = false;
}

// ---------- 助手消息 markdown 渲染（对齐运维控制台口径） ----------
const secMd = new MarkdownIt({
  html: false, linkify: true, breaks: true,
  highlight(str: string, lang: string): string {
    const codeClass = lang ? ` class="language-${lang}"` : '';
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        const h = hljs.highlight(str, { language: lang }).value;
        return `<pre class="hljs sec-code">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${h}</code></pre>`;
      } catch {}
    }
    return `<pre class="hljs sec-code">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${secMd.utils.escapeHtml(str)}</code></pre>`;
  },
});

function renderSecMarkdown(content?: string): string {
  let c = content || '';
  c = c
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
    .replace(/\[TOOL_CALL\][\s\S]*$/i, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/i, '');
  c = c.replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]\s*$/g, '').split('\n@@REASON@@\n')[0].trim();
  return c.split(/(\[tool_call\])/g).map((part) => {
    if (part === '[tool_call]') return '<span class="sec-inline-tool">⚙ 正在调用工具</span>';
    return secMd.render(part);
  }).join('');
}

function onSecMdClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.classList.contains('code-copy-btn')) {
    const rawCode = t.getAttribute('data-code') || '';
    navigator.clipboard.writeText(decodeURIComponent(rawCode)).then(() => {
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

// ---------- Tab 描述（决定顺序、编号、分类标签） ----------
// ★ 2026-10-16 收敛：8 个 Tab → 3 个（终端 / 结果 / 环境）。
//   命令行成了主入口之后，能力增长体现在**命令**上而不是 Tab 上，所以 Tab 数不该再随能力涨。
//   原来的「执行 / 演练 / 检测 / 资产」四个动作面降级为「终端」里的**高级表单**（折叠收纳），
//   一个都没删 —— 命令是给熟手的，表单是给"不知道该敲哪条命令"的人的引导。
//   两者**共用同一套执行通道**（命令行走 submitCommand / runToolCommand，表单走各自的 runXxx），
//   执行末端都落 `POST /plugin/sec-lab/run`，所以不存在第二条绕过护栏的链。
const TABS = [
  { value: 'run',    num: '01', name: '终端', sub: 'TERM',   badge: '' },
  { value: 'review', num: '02', name: '结果', sub: 'REVIEW', badge: '0' },
  { value: 'env',    num: '03', name: '环境', sub: 'LAB',    badge: '' },
] as const;

const BASIC_TOOLS = [
  { value: 'recon', label: 'recon · 目标画像（被动）' },
  { value: 'portscan', label: 'portscan · 端口扫描（主动）' },
  { value: 'webprobe', label: 'webprobe · Web 探测（主动）' },
  { value: 'toolchain', label: 'toolchain · 外部工具探测' },
  { value: 'sec_report', label: 'sec_report · 生成报告' },
];

const SEV_LABEL: Record<string, string> = { critical: '严重', high: '高', medium: '中', low: '低', info: '信息' };
const SEV_TAG: Record<string, string> = { critical: 'danger', high: 'danger', medium: 'warning', low: 'info', info: 'info' };

interface ScopeRow {
  id: string; type: string; value: string; authorizedBy: string;
  maxRisk: string; expiresAt?: number; expired?: boolean; evidence?: string; environment?: string;
}

// ---------- 主状态 ----------
const tab = ref('run');
const scopes = ref<ScopeRow[]>([]);
const findings = ref<Array<{ id: string; title: string; severity: string; detail: string; target: string; tool?: string; at?: number; remediation?: string }>>([]);
const audit = ref<Array<{ at: number; tool: string; target?: string; ok: boolean; message: string }>>([]);
const toolchain = ref<Array<{ name: string; available: boolean; capability: string; install: string }>>([]);
const cfg = reactive({ engagementMode: false });

// ---------- 经验库（自学习，P5）：待审 → 人工批准 → 才注入提示词 ----------
interface ExperienceRow {
  id: string; title: string; body: string; tags: string[]; source: string;
  submittedBy: string; status: string; createdAt: number;
  decidedAt?: number; decidedBy?: string; reason?: string;
}
const expPending = ref<ExperienceRow[]>([]);
const expApproved = ref<ExperienceRow[]>([]);
const expRejected = ref<ExperienceRow[]>([]);
const expCounts = ref({ pending: 0, approved: 0, rejected: 0, total: 0 });
const expBusy = ref('');
const showExpForm = ref(false);
const expDraft = reactive({ title: '', body: '', source: '', tags: '' });

// ---------- 派生 ----------
const currentTabLabel = computed(() => TABS.find((t) => t.value === tab.value)?.sub || '');

/** Tab 角标：只给「结果」实时计数。
 *  ★ 原来写死的 `badge: '0'` 是个假角标 —— 永远是 0 会让人以为"没结果"，
 *    而这里真正的信号是"有多少发现项 + 多少条被拦的审计"。 */
function tabBadge(t: { value: string }): string {
  if (t.value !== 'review') return '';
  const n = findings.value.length + audit.value.filter((a) => !a.ok).length + expCounts.value.pending;
  return n ? String(n) : '';
}
const liveScopes = computed(() => String(scopes.value.length).padStart(2, '0'));
const liveFindingsCount = computed(() => String(findings.value.length).padStart(2, '0'));
const liveFindingsSev = computed(() => findings.value.some((f) => f.severity === 'critical' || f.severity === 'high') ? 'bad' : 'ok');
const auditPass = computed(() => audit.value.filter((a) => a.ok).length.toString().padStart(2, '0'));
const auditFail = computed(() => audit.value.filter((a) => !a.ok).length.toString().padStart(2, '0'));
const liveSim = computed(() => {
  // 从 audit 推算演练执行次数（tool='attack_sim' & ok=true）
  return audit.value.filter((a) => a.tool === 'attack_sim' && a.ok).length.toString().padStart(2, '0');
});

// ---------- 执行 tab ----------
const tool = ref('recon');
const target = ref('');
const ports = ref('common');
const result = ref('');
const running = ref(false);
const lastRunMs = ref<number | null>(null);

// ============================================================
// 命令行（命令中枢）：`/命令 参数…` 直接跑工具（2026-10-16）
//
// ★ 与聊天框的 `/` 面板共用一套：解析 `planCommandInput`、执行 `commandsStore.runTool`
//   （后者打的就是 SecConsole 自己的 `POST /plugin/sec-lab/run` —— 同一套 withGuard）。
//   在控制台里再加一条执行链，等于把护栏复制一份，迟早漂移。
// ============================================================
const commandsStore = useCommandsStore();
const cmdInput = ref('');
const cmdHints = ref<CommandDef[]>([]);
const cmdPlaceholder = computed(() => {
  // ★ 别把局部变量也命名成 target —— 会遮蔽外层的 ref，初始化器就变成引用自己
  const t = String(target.value || '').trim();
  return t ? `例：/portscan ${t}` : '输入 /命令，例：/scopes 或 /recon example.com';
});

/** 输入时给候选（只认以 `/` 开头的输入；空关键词给前几条） */
function updateCmdHints() {
  const line = cmdInput.value;
  if (!line.trim().startsWith('/')) { cmdHints.value = []; return; }
  const kw = line.trim().slice(1).split(/\s+/)[0] || '';
  cmdHints.value = commandsStore.search(kw).slice(0, 6);
}
function pickCmdHint(h: CommandDef) {
  cmdInput.value = `/${h.name} `;
  cmdHints.value = [];
  updateCmdHints();
}

/** 执行命令行（`;` 串联依次跑；`@剧本` 先展开成命令序列；结果落「执行」页的输出区） */
async function submitCommand() {
  const line = cmdInput.value.trim();
  if (!line) return;
  // ★ 剧本召唤（`@信息收集`）：展开成命令序列，并把「执行」页填的 target 替进 `${target}`
  const summon = planPlaybookSummon(line, commandsStore.playbooks, { target: String(target.value || '').trim() });
  const effective = summon ? summon.steps.join('; ') : line;
  const plan = planCommandInput(effective, commandsStore.globalCommands);
  if (plan.length === 1 && plan[0].kind === 'chat') {
    ElMessage.warning('命令要以 / 开头，或 @剧本名（/help 看全部）');
    return;
  }
  if (summon) {
    // 把没替掉的占位符**名字**列出来（只说"还有 N 步"等于让用户自己去猜差什么）
    const missing = new Set<string>();
    for (const s of summon.steps) for (const m of s.matchAll(/\$\{(\w+)\}/g)) missing.add(m[1]);
    if (missing.size) {
      ElMessage.warning(`剧本「${summon.playbook.name}」还需要：${[...missing].map((k) => '${' + k + '}').join(' ')}（target 可在「执行」页填，其余请补进命令行）`);
      return;
    }
    ElMessage.info(`召唤剧本「${summon.playbook.name}」（${summon.steps.length} 步）`);
  }
  cmdInput.value = '';
  cmdHints.value = [];
  tab.value = 'run';          // 结果落在「终端」页的运行卡里，避免跑完看不见
  for (const step of plan) {
    if (step.kind === 'unknown') { ElMessage.warning(`没有 /${step.name} 这条命令（/help 看全部）`); continue; }
    if (step.kind === 'interactive') { ElMessage.info(`「${step.def.name}」需要在聊天框里交互选择，控制台不支持`); continue; }
    if (step.kind !== 'run') continue;
    if (step.def.run === 'help') { result.value = formatHelp(commandsStore.globalCommands); continue; }
    // 控制台自有的两条交互命令（内置 kind:'ui'）：它们不改任何目标状态，只改本页会话状态
    if (step.def.run === 'target') { setFocusTarget(step.parsed.args[0] || ''); continue; }
    if (step.def.run === 'playbook') { await runPlaybookCommand(step.parsed); continue; }
    if (step.def.kind !== 'tool') { ElMessage.info(`「${step.def.name}」不是安全工具命令（本控制台只跑工具型）`); continue; }
    // 标了 confirmEach 的剧本（如「完整评估」）每一步都先问
    await runToolCommand(step.def, step.parsed, summon?.playbook.confirmEach === true);
  }
}

/** `/target <host>`：设定/清空**焦点目标** —— 之后带 target 位置参数的命令可省略不写 */
function setFocusTarget(v: string) {
  const val = String(v || '').trim();
  target.value = val;
  if (!val) { ElMessage.info('已清空焦点目标'); return; }
  ElMessage.success(`焦点目标：${val}（之后带 target 的命令可省略不写）`);
}

/** `/playbook list|save|rm`：自定义剧本（存后端，`@名字` 召唤时与内置剧本一起展开） */
async function runPlaybookCommand(parsed: ParsedCommand) {
  const action = String(parsed.args[0] || 'list').toLowerCase();
  const flag = (k: string) => (typeof parsed.flags[k] === 'string' ? String(parsed.flags[k]) : '');
  if (action === 'list') {
    const all = commandsStore.playbooks;
    result.value = all.length
      ? '剧本（用 @名字 召唤）：\n' + all.map((p) => `- @${p.name}　${p.steps.length} 步${p.confirmEach ? '（每一步都确认）' : ''}\n    ${p.steps.join('  ;  ')}`).join('\n')
      : '暂无剧本。用 /playbook save --name=名 --steps="/recon ${target};/portscan ${target}" 存一个。';
    return;
  }
  if (action === 'rm' || action === 'remove' || action === 'delete') {
    const id = flag('id');
    const name = flag('name') || parsed.args[1] || '';
    if (!id && !name) { ElMessage.warning('要删哪个：/playbook rm --name=剧本名（或 --id=xxx）'); return; }
    const r: any = await api.post(`${BASE}/playbooks/remove`, { id, name });
    if (r && 'error' in r) { ElMessage.error(String(r.error)); return; }
    await commandsStore.loadUserPlaybooks();
    result.value = `已删除剧本（${id || name}）。`;
    ElMessage.success('已删除');
    return;
  }
  if (action === 'save' || action === 'new') {
    const name = flag('name');
    // ★ 步骤用 `;` 分隔 —— 因为命令行本身也用 `;` 串联，所以 `--steps=` 的值**必须加引号**
    //   （解析器尊重引号，引号内的 `;` 是内容；usage 里已经写成带引号的样子）。
    const steps = flag('steps').split(';').map((s) => s.trim()).filter(Boolean);
    if (!name || !steps.length) {
      ElMessage.warning('用法：/playbook save --name=名 --steps="/recon ${target};/portscan ${target}"');
      return;
    }
    const r: any = await api.post(`${BASE}/playbooks`, {
      id: flag('id') || undefined, name, steps,
      desc: flag('desc') || undefined,
      confirmEach: parsed.flags.confirmEach === true,
    });
    if (r && 'error' in r) { ElMessage.error(String(r.error)); return; }
    await commandsStore.loadUserPlaybooks();
    result.value = `已保存剧本「${name}」（${steps.length} 步）。用 @${name} 召唤。`;
    ElMessage.success(`已保存，用 @${name} 召唤`);
    return;
  }
  ElMessage.info('用法：/playbook <list|save|rm>');
}

/** 跑一条工具型命令：危险 / 需确认的先弹确认（与「▶ 执行」按钮的确认口径一致） */
async function runToolCommand(def: CommandDef, parsed: ParsedCommand, forceConfirm = false) {
  // 焦点目标兜底：带 target 位置参数的命令没写目标时，用 `/target` 设定的那个。
  // ★ 只是省打字，不是省校验 —— 目标照旧要过授权范围（判定在服务端的 guard 里，藏不掉）。
  if (def.params?.[0] === 'target' && !parsed.args[0]) {
    const focus = String(target.value || '').trim();
    if (!focus) {
      ElMessage.warning(`「/${def.name}」需要目标：先 /target <域名|IP> 设一个，或在命令里直接写目标`);
      return;
    }
    parsed.args = [focus, ...parsed.args];
  }
  if (forceConfirm || def.confirm || def.danger === 'I' || def.danger === 'S') {
    try {
      await ElMessageBox.confirm(
        `确认执行 /${def.name}？<br>${def.desc}<br><br>` +
        '<span style="color:#e6a23c">该类动作只应在**已授权目标或隔离靶场**上使用，执行全程留痕审计。</span>',
        '高风险命令',
        { dangerouslyUseHTMLString: true, confirmButtonText: '执行', cancelButtonText: '取消', type: 'warning' },
      );
    } catch { return; }
    parsed.flags = { ...parsed.flags, confirmed: true };
  }
  running.value = true;
  result.value = '';
  const t0 = Date.now();
  try {
    const r = await commandsStore.runTool(def, parsed);
    result.value = r.text;
    lastRunMs.value = Date.now() - t0;
    if (!r.ok) ElMessage.warning('工具返回错误，见输出结果');
    await loadAll();     // findings / audit / pulse 跟着刷新（与 postRun 同口径）
  } finally {
    running.value = false;
  }
}
const needsTarget = computed(() => tool.value !== 'toolchain' && tool.value !== 'sec_report');

// ---------- 演练 tab ----------
const sim = reactive({ target: '', playbook: 'discovery-basic', techniques: '', operator: '', planOnly: true });
const simConfirm = ref(false);

// ---------- 检测 tab ----------
const detect = reactive({ kind: 'list-all', id: '', text: '', iocs: '' });
const hunt = reactive({ path: '', iocs: '' });

// ---------- 资产 tab ----------
const easm = reactive({ action: 'list', value: '', assetId: '', owner: '', evidence: '' });
const easmtValueHint = computed(() => {
  switch (easm.action) {
    case 'add': return '资产值（域名 / IP / CIDR）';
    case 'verify': return '或资产 id';
    case 'snapshot':
    case 'diff':
      return '资产值或 id';
    default: return '';
  }
});

// ---------- 环境/靶场 tab（宿主机 Docker + Android，仅本机） ----------
interface RangeTemplateRow { id: string; name: string; image: string; containerPort: number; defaultHostPort: number; description: string; tags: string[]; source: string }
interface RangeInst { name: string; image: string; hostPort: number; containerPort: number; state: string; status: string }
interface HostEnvData {
  platform: string; checkedAt: number;
  docker: { available: boolean; daemonUp: boolean; version?: string; composeV2: boolean; note: string };
  android: { adbAvailable: boolean; emulatorAvailable: boolean; sdkRoot?: string; avds: string[]; running: string[]; note: string };
}
const hostEnv = ref<HostEnvData | null>(null);
const envLoading = ref(false);
const rangeTemplates = ref<RangeTemplateRow[]>([]);
const rangeInsts = ref<RangeInst[]>([]);
const rangeForm = reactive<{ template: string; hostPortText: string }>({ template: 'dvwa', hostPortText: '' });
const avdSel = ref('');

async function probeEnv() {
  envLoading.value = true;
  try {
    const d = await unwrap<HostEnvData>(api.get(`${BASE}/hostenv`));
    if (d) hostEnv.value = d;
    const t = await unwrap<RangeTemplateRow[]>(api.get(`${BASE}/ranges`));
    if (t) rangeTemplates.value = t;
    const i = await unwrap<RangeInst[]>(api.get(`${BASE}/ranges/instances`));
    if (i) rangeInsts.value = i;
    const a = hostEnv.value?.android;
    if (a && a.avds.length && !a.avds.includes(avdSel.value)) avdSel.value = a.avds[0];
  } finally { envLoading.value = false; }
}

async function refreshInstances() {
  const i = await unwrap<RangeInst[]>(api.get(`${BASE}/ranges/instances`));
  if (i) rangeInsts.value = i;
}

async function deployRange() {
  const tpl = rangeTemplates.value.find((t) => t.id === rangeForm.template);
  if (!tpl) return;
  const hp = Number(rangeForm.hostPortText) || tpl.defaultHostPort;
  try {
    await ElMessageBox.confirm(
      `将在本机 Docker 部署已知漏洞训练镜像「${tpl.name}」（${tpl.image}），映射到 localhost:${hp}。该镜像自带大量漏洞，仅限隔离/本机环境用于授权演练，演练后请及时停止。`,
      '靶场部署确认',
      { confirmButtonText: '部署', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  await postRun('range_deploy', { template: rangeForm.template, hostPort: hp, confirmed: true });
  await refreshInstances();
}

async function stopRangeInst(name: string) {
  await postRun('range_stop', { name, confirmed: true });
  await refreshInstances();
}

async function launchAvd() {
  if (!avdSel.value) { ElMessage.warning('请选择 AVD'); return; }
  await postRun('android_launch', { avd: avdSel.value, confirmed: true });
}

// ---------- 能力边界 tab（明确不实现 + 规划中） ----------
const BOUNDARY_LOCKED = [
  { name: '匿名化 / 代理跳板 / 流量隐匿', reason: '属攻击侧需求，与"授权评估"定位直接冲突', detail: '不做 Tor 链、代理池轮换、指纹混淆等流量隐匿能力。' },
  { name: '免杀 / 载荷生成 / C2 框架', reason: '合规红线：只做检测验证，不做武器化', detail: 'attack_sim 只复现行为特征（只读系统命令），不生成任何恶意载荷、不做免杀、不建 C2。' },
  { name: '公网随机目标批量扫描', reason: '授权模型天然拒绝：目标必须在 scope 内', detail: '未登记授权的目标一律拒绝；公网资产还必须先完成归属验证（asset_monitor verify）。' },
  { name: '移动端插件注册（MOBILE_MODE）', reason: '移动端无本地 shell 与扫描环境', detail: '移动端不注册 sec-lab；Android 靶场探测仅在桌面端「环境」Tab 提供。' },
];
const ROADMAP = [
  { phase: 'P1', name: '`/` 命令扩展（/scan 等）', note: '输入框注册扩展点，命令直达工具' },
  { phase: 'P1', name: '@ 剧本召唤', note: '多步编排一键执行、可分享' },
  { phase: 'P1', name: '外部工具 adapter 深度解析', note: 'nuclei / sqlmap 结构化输出对齐 A 轨' },
  { phase: 'P2', name: '剧本市场 + CVE 离线库', note: '内置剧本包与离线漏洞匹配' },
  { phase: 'P2', name: '合规基线检查表', note: '等保 2.0 / CIS Benchmark / OWASP Top 10' },
  { phase: 'P2', name: '定时巡检', note: '资产快照定期 diff，影子资产告警' },
  { phase: 'P3', name: '团队协作 / 交战隔离', note: '多用户授权范围隔离与协作' },
  { phase: 'P3', name: '报告 Word/PDF 导出', note: '走 doyz 文档通道' },
  { phase: '规划', name: 'Caldera / Atomic Red Team 集成', note: '企业级 BAS 攻击模拟' },
];

function switchTab(v: string) {
  tab.value = v;
  if (v === 'env' && !hostEnv.value) void probeEnv();
}

// ---------- 登记授权 dialog ----------
const showAdd = ref(false);
const form = reactive<{ type: string; value: string; authorizedBy: string; evidence: string; expiresAt: number | null; maxRisk: string; environment: string; ownershipEvidence: string }>({
  type: 'domain', value: '', authorizedBy: '', evidence: '', expiresAt: null, maxRisk: 'active',
  environment: 'internal', ownershipEvidence: '',
});

function daysLeft(s: ScopeRow): number { return s.expiresAt ? Math.floor((s.expiresAt - Date.now()) / 86400000) : 0; }
function fmtTime(at: number | string | undefined): string {
  if (!at) return '—';
  const d = new Date(typeof at === 'string' ? at : at);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

async function unwrap<T>(p: Promise<{ data: T } | { error: string }>): Promise<T | null> {
  const r = await p;
  if ('error' in r) { ElMessage.error(String(r.error)); return null; }
  return (r as { data: T }).data ?? null;
}

async function loadAll() {
  const t0 = Date.now();
  const s = await unwrap<ScopeRow[]>(api.get(`${BASE}/scopes`));
  if (s) scopes.value = s;
  const f = await unwrap<typeof findings.value>(api.get(`${BASE}/findings`));
  if (f) findings.value = f;
  const a = await unwrap<typeof audit.value>(api.get(`${BASE}/audit`));
  if (a) audit.value = a;
  const c = await unwrap<{ engagementMode: boolean }>(api.get(`${BASE}/config`));
  if (c) cfg.engagementMode = !!c.engagementMode;
  await loadExperience();
  lastRunMs.value = Date.now() - t0;
}

// ---------- 经验库（自学习）：待审队列 + 人工审批 ----------
// ★ 审批按钮只存在于人类界面；服务端 experience_review 还是 HUMAN_ONLY，
//   两层都拦，避免"模型自己批自己写进提示词"。
async function loadExperience() {
  const d = await unwrap<{
    pending: ExperienceRow[]; approved: ExperienceRow[]; rejected: ExperienceRow[];
    counts: { pending: number; approved: number; rejected: number; total: number };
  }>(api.get(`${BASE}/experience`));
  if (!d) return;
  expPending.value = d.pending || [];
  expApproved.value = d.approved || [];
  expRejected.value = d.rejected || [];
  expCounts.value = d.counts || { pending: 0, approved: 0, rejected: 0, total: 0 };
}

async function proposeExperience() {
  if (!expDraft.title.trim() || !expDraft.body.trim() || !expDraft.source.trim()) {
    ElMessage.warning('标题 / 正文 / 来源依据 必填');
    return;
  }
  expBusy.value = 'new';
  try {
    const r = await api.post(`${BASE}/experience/propose`, {
      title: expDraft.title, body: expDraft.body, source: expDraft.source,
      tags: expDraft.tags.split(/[,，\s]+/).filter(Boolean),
    });
    if ('error' in r) return ElMessage.error(String(r.error));
    ElMessage.success('已提交待审（不会立即生效）');
    expDraft.title = ''; expDraft.body = ''; expDraft.source = ''; expDraft.tags = '';
    showExpForm.value = false;
    await loadExperience();
  } finally { expBusy.value = ''; }
}

async function decideExperienceRow(row: ExperienceRow, decision: 'approve' | 'reject') {
  let reason = '';
  try {
    if (decision === 'reject') {
      const r = await ElMessageBox.prompt('驳回原因会记录在案，便于提交者改进。', '驳回经验', {
        inputPlaceholder: '例如：结论无法复现 / 属于一次性信息 / 含未去敏数据',
        confirmButtonText: '驳回', cancelButtonText: '取消',
      });
      reason = String(r.value || '').trim();
    } else {
      await ElMessageBox.confirm(
        `批准后「${row.title}」会进入安全助手后续任务的系统提示词。确定批准？`,
        '批准经验', { type: 'warning', confirmButtonText: '批准', cancelButtonText: '取消' },
      );
    }
  } catch { return; } // 用户取消
  expBusy.value = row.id;
  try {
    const r = await api.post(`${BASE}/experience/decide`, { id: row.id, decision, reason, decidedBy: 'operator' });
    if ('error' in r) return ElMessage.error(String(r.error));
    ElMessage.success(decision === 'approve' ? '已批准：下个任务生效' : '已驳回');
    await loadExperience();
  } finally { expBusy.value = ''; }
}

async function loadToolchain() {
  const t = await unwrap<typeof toolchain.value>(api.get(`${BASE}/toolchain`));
  if (t) toolchain.value = t;
}

async function addScope() {
  if (!form.value.trim() || !form.authorizedBy.trim()) { ElMessage.warning('目标值与授权人必填'); return; }
  if (form.environment === 'public' && !form.ownershipEvidence.trim()) { ElMessage.warning('公网资产必须先填归属证据'); return; }
  const r = await api.post(`${BASE}/scopes`, {
    type: form.type, value: form.value.trim(), authorizedBy: form.authorizedBy.trim(),
    evidence: form.evidence.trim() || undefined, expiresAt: form.expiresAt ?? undefined,
    maxRisk: form.maxRisk, environment: form.environment,
    ownershipEvidence: form.ownershipEvidence.trim() || undefined,
  });
  if ('error' in r) return ElMessage.error(String(r.error));
  ElMessage.success('已登记授权目标');
  showAdd.value = false;
  form.value = ''; form.authorizedBy = ''; form.evidence = ''; form.expiresAt = null; form.ownershipEvidence = '';
  await loadAll();
}

async function removeScope(s: ScopeRow) {
  const r = await api.post(`${BASE}/scopes/remove`, { id: s.id });
  if ('error' in r) return ElMessage.error(String(r.error));
  ElMessage.success('已移除');
  await loadAll();
}

async function saveConfig() { await api.post(`${BASE}/config`, { engagementMode: cfg.engagementMode }); }

async function postRun(toolName: string, args: Record<string, unknown>) {
  running.value = true; result.value = '';
  const t0 = Date.now();
  try {
    const r = await api.post(`${BASE}/run`, { tool: toolName, args });
    if ('error' in r) { ElMessage.error(String(r.error)); return; }
    const d = (r as { data: { ok: boolean; text: string } }).data;
    result.value = d?.text || '(无输出)';
    lastRunMs.value = Date.now() - t0;
    if (!d?.ok) ElMessage.warning('工具返回错误，见输出结果');
    await loadAll();
  } finally { running.value = false; }
}

async function runBasic() {
  const args: Record<string, unknown> = {};
  if (tool.value === 'toolchain') {
    args.action = 'detect';
  } else {
    if (!target.value.trim()) { ElMessage.warning('请填写目标'); return; }
    args.target = target.value.trim();
    if (tool.value === 'portscan') args.ports = ports.value.trim() || 'common';
  }
  await postRun(tool.value, args);
  if (tool.value === 'toolchain') await loadToolchain();
}

function startRunSim() {
  if (!sim.target.trim()) { ElMessage.warning('请填写靶场目标'); return; }
  if (!sim.planOnly && !sim.operator.trim()) { ElMessage.warning('执行模式必须填写操作人'); return; }
  if (sim.playbook === 'custom' && !sim.techniques.trim()) { ElMessage.warning('自定义剧本需填写技术编号'); return; }
  simConfirm.value = true;
}

async function confirmRunSim() {
  simConfirm.value = false;
  const args: Record<string, unknown> = { target: sim.target.trim(), planOnly: sim.planOnly, operator: sim.operator.trim() };
  if (sim.playbook === 'custom') args.techniques = sim.techniques.split(',').map((s) => s.trim()).filter(Boolean);
  else args.playbook = sim.playbook;
  await postRun('attack_sim', args);
}

async function getSimReport() { await postRun('sim_report', { target: sim.target.trim() || undefined }); }

async function runDetect() {
  const args: Record<string, unknown> = {};
  if (detect.kind === 'list-all') { args.action = 'list'; }
  else if (detect.kind === 'list-sigma') { args.action = 'list'; args.kind = 'sigma'; }
  else if (detect.kind === 'list-suricata') { args.action = 'list'; args.kind = 'suricata'; }
  else if (detect.kind === 'get') {
    if (!detect.id.trim()) { ElMessage.warning('请填写规则 id'); return; }
    args.action = 'get'; args.id = detect.id.trim();
  } else if (detect.kind === 'match') {
    if (!detect.text.trim()) { ElMessage.warning('请粘贴日志片段'); return; }
    args.action = 'match'; args.text = detect.text;
    if (detect.iocs.trim()) args.iocs = detect.iocs.split(',').map((s) => s.trim()).filter(Boolean);
  }
  await postRun('detect_rules', args);
}

async function runLogHunt() {
  if (!hunt.path.trim()) { ElMessage.warning('请填写日志文件路径'); return; }
  const args: Record<string, unknown> = { path: hunt.path.trim() };
  if (hunt.iocs.trim()) args.iocs = hunt.iocs.split(',').map((s) => s.trim()).filter(Boolean);
  await postRun('log_hunt', args);
}

async function runEasm() {
  const args: Record<string, unknown> = { action: easm.action };
  if (easm.action === 'add') {
    if (!easm.value.trim()) { ElMessage.warning('请填写资产值'); return; }
    if (!easm.owner.trim()) { ElMessage.warning('请填写归属（owner）'); return; }
    args.value = easm.value.trim(); args.owner = easm.owner.trim();
    if (easm.evidence.trim()) args.evidence = easm.evidence.trim();
    args.environment = 'internal';
  } else if (easm.action !== 'list') {
    if (!easm.value.trim() && !easm.assetId.trim()) { ElMessage.warning('请填写资产值或资产 id'); return; }
    if (easm.value.trim()) args.value = easm.value.trim();
    if (easm.assetId.trim()) args.assetId = easm.assetId.trim();
    if (easm.action === 'verify' && easm.evidence.trim()) args.evidence = easm.evidence.trim();
  }
  await postRun('asset_monitor', args);
}

const chatApi = useChat();
onMounted(async () => {
  await loadAll();
  await loadToolchain();
  // 用户自定义剧本（`/playbook save` 写入）：与插件声明的内置剧本一起进 `@` 召唤清单
  void commandsStore.loadUserPlaybooks();
  // 任务 8.5：进入安全模式时切到 sec 场景（场景提示词只影响后续消息的 system prompt，不动历史）。
  // 双重断言：config/scenes.ts 的 SceneKey 正在由另一处改动扩展（ops / sec），
  // 这里不阻塞对方的编译——场景不存在时 setScene 内部不生效，已用 try 兜底。
  try { chatApi.setScene('sec' as unknown as Parameters<typeof chatApi.setScene>[0]); } catch { /* 场景缺失不阻塞控制台 */ }
  // AI 模式会话：同页切换回来消息还在（secConvId 仍在内存）
  if (secConvId.value) void loadSecMessages();
});
onUnmounted(() => { secAbort?.abort(); });
</script>

<style scoped>
/* ============================================================
   ▍ 本页 Token —— 不破坏皮肤，主色完全走 var(--color-*)
     唯一硬色 amber 用于"控制台仪表"的语义强调（与主题解耦）
   ============================================================ */
.sec-console {
  --sc-fg: var(--color-text, #1A1A1A);
  --sc-fg-2: var(--color-text-secondary, #6B6B66);
  --sc-fg-3: var(--color-text-tertiary, #9C9B94);
  --sc-bg: var(--color-surface, #FFFFFF);
  --sc-bg-2: var(--color-bg, #F7F5F0);
  --sc-line: var(--color-border, #E7E4DC);
  --sc-line-2: var(--color-border-strong, #D8D5CC);
  --sc-primary: var(--color-primary, #C2410C);
  --sc-mono: var(--font-mono, ui-monospace, 'JetBrains Mono', Consolas, monospace);
  --sc-serif: var(--font-display, Georgia, serif);

  /* 控制台专属硬色（不依赖皮肤变量） */
  --sc-amber: #b45309;
  --sc-amber-soft: rgba(180, 83, 9, 0.10);
  --sc-green: #15803d;
  --sc-green-soft: rgba(21, 128, 61, 0.10);
  --sc-red: #b91c1c;
  --sc-red-soft: rgba(185, 28, 28, 0.08);
  --sc-cyan: #0e7490;
  --sc-cyan-soft: rgba(14, 116, 144, 0.10);
  --sc-ink: var(--color-text, #1A1A1A);

  height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 0;
  font-family: var(--sc-mono); color: var(--sc-fg);
  padding: 0 14px 14px;
  /* 数字统一 tabular，提升扫描时的可读性 */
}

/* ---------- 01 · 顶行 brand bar ---------- */
.sec-header {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 0 10px;
  border-bottom: 1px dashed var(--sc-line-2);
}
.sec-brand { display: flex; align-items: center; gap: 10px; }
.sec-num {
  display: inline-block; min-width: 28px; padding: 1px 6px;
  font-family: var(--sc-serif); font-style: italic;
  font-size: 13px; color: var(--sc-bg);
  background: var(--sc-primary); border-radius: 3px;
  text-align: center; letter-spacing: 0.5px;
}
.sec-brand-tick {
  width: 24px; height: 1px; background: var(--sc-line-2);
}
.sec-brand-name {
  font-family: var(--sc-mono); font-weight: 600;
  font-size: 15px; letter-spacing: 0.18em;
  color: var(--sc-fg); text-transform: uppercase;
}
.sec-brand-name .sec-dot { color: var(--sc-amber); margin: 0 0.18em; }
.sec-brand-sub {
  font-family: var(--sc-mono); font-size: 11px;
  color: var(--sc-fg-3); padding-left: 8px; border-left: 1px solid var(--sc-line);
  margin-left: 4px;
}
.sec-meta {
  display: flex; gap: 10px; margin-left: auto;
}
.sec-meta-item {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 4px 8px; border: 1px solid var(--sc-line);
  background: var(--sc-bg-2);
  font-family: var(--sc-mono); font-size: 11px; line-height: 1;
  border-radius: 3px;
}
.sec-meta-k {
  text-transform: uppercase; letter-spacing: 0.1em;
  font-size: 10px; color: var(--sc-fg-3);
}
.sec-meta-v {
  font-family: var(--sc-mono); font-size: 12px; font-weight: 600;
  color: var(--sc-fg); font-variant-numeric: tabular-nums;
}
.sec-meta-v[data-sev="bad"] { color: var(--sc-red); }
.sec-meta-vbad { color: var(--sc-red); font-weight: 600; }
.sec-toggle { display: flex; align-items: center; gap: 8px; padding-left: 10px; border-left: 1px dashed var(--sc-line-2); }
.sec-help { color: var(--sc-fg-3); cursor: help; font-size: 13px; }

/* 开关 */
.sec-switch {
  display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
  user-select: none;
}
.sec-switch input { display: none; }
.sec-switch-grip {
  position: relative; width: 30px; height: 14px;
  border-radius: 8px; background: var(--sc-line-2);
  transition: background var(--motion-fast, 120ms) var(--ease-out, ease);
}
.sec-switch-grip::after {
  content: ''; position: absolute; left: 1px; top: 1px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--sc-bg);
  transition: transform var(--motion-base, 180ms) var(--ease-out, ease);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.sec-switch.on .sec-switch-grip { background: var(--sc-red); }
.sec-switch.on .sec-switch-grip::after { transform: translateX(16px); }
.sec-switch-label { font-family: var(--sc-mono); font-size: 11px; letter-spacing: 0.05em; color: var(--sc-fg); }

/* ---------- 02 · Ribbon 合规章 ---------- */
.sec-ribbon {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; margin-bottom: 12px;
  background: var(--sc-amber-soft); border: 1px solid var(--sc-amber);
  border-radius: 3px;
  font-family: var(--sc-mono); font-size: 11.5px; color: var(--sc-fg);
}
.sec-ribbon-stamp {
  font-family: var(--sc-mono); font-weight: 700;
  font-size: 10px; letter-spacing: 0.16em;
  padding: 2px 6px; border: 1px solid var(--sc-amber);
  color: var(--sc-amber); border-radius: 2px;
}
.sec-ribbon-sep {
  width: 1px; height: 14px; background: var(--sc-amber); opacity: 0.5;
}
.sec-ribbon-strong { color: var(--sc-red); font-weight: 600; }

/* ---------- 03 · 主网格 ---------- */
.sec-grid {
  flex: 1; min-height: 0;
  display: grid; gap: 12px;
  grid-template-columns: 280px 1fr;
}
@media (max-width: 1180px) { .sec-grid { grid-template-columns: 240px 1fr; } }

.sec-col-left, .sec-col-right { display: flex; flex-direction: column; gap: 12px; min-height: 0; min-width: 0; }

/* ---------- frame（所有面板的共有"操作台"边框 + 角标）---------- */
.sec-frame {
  background: var(--sc-bg);
  border: 1px solid var(--sc-line);
  border-radius: 4px; display: flex; flex-direction: column; min-height: 0;
  position: relative;
}
/* 四角 L 形装饰——操作台/仪表面板的语义 */
.sec-frame::before, .sec-frame::after,
.sec-frame .sec-frame-head::before, .sec-frame .sec-frame-head::after {
  content: ''; position: absolute; width: 8px; height: 8px;
  border: 1px solid var(--sc-fg-3); pointer-events: none;
}
.sec-frame::before { top: -1px; left: -1px; border-right: 0; border-bottom: 0; border-top-left-radius: 3px; }
.sec-frame::after { top: -1px; right: -1px; border-left: 0; border-bottom: 0; border-top-right-radius: 3px; }
/* 底部两角 */
.sec-frame .sec-frame-head::before { bottom: -1px; left: -1px; border-right: 0; border-top: 0; border-bottom-left-radius: 3px; }
.sec-frame .sec-frame-head::after  { bottom: -1px; right: -1px; border-left: 0; border-top: 0; border-bottom-right-radius: 3px; }

.sec-frame-head {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  background: var(--sc-bg-2); border-bottom: 1px solid var(--sc-line);
  flex: none;
}
.sec-frame-head-sm { padding: 6px 10px; }
.sec-frame-head-tab { padding: 10px 14px; border-bottom: 1px dashed var(--sc-line-2); background: var(--sc-bg); }
.sec-frame-title {
  font-family: var(--sc-mono); font-weight: 700; font-size: 11.5px;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--sc-fg);
}
.sec-frame-hint {
  font-family: var(--sc-mono); font-size: 10px;
  color: var(--sc-fg-3); letter-spacing: 0.05em;
}
.sec-frame-act { margin-left: auto; }

/* 左侧 02 授权列表 */
.sec-scope-list { padding: 8px 10px; overflow: auto; flex: 1; }
.sec-scope-row {
  padding: 7px 8px; border-radius: 3px; margin-bottom: 5px;
  background: var(--sc-bg-2); border: 1px solid transparent;
  transition: border-color var(--motion-fast, 120ms);
}
.sec-scope-row:hover { border-color: var(--sc-line-2); }
.sec-scope-row.expired { opacity: 0.55; }
.sec-scope-line { display: flex; align-items: center; gap: 6px; }
.sec-scope-val {
  flex: 1; font-family: var(--sc-mono); font-size: 12.5px;
  color: var(--sc-ink); font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sec-env {
  font-family: var(--sc-mono); font-size: 9px; font-weight: 700;
  letter-spacing: 0.1em; padding: 1px 5px; border-radius: 2px;
  background: var(--sc-bg); border: 1px solid var(--sc-line-2); color: var(--sc-fg-2);
}
.sec-env.env-lab        { color: var(--sc-amber); border-color: var(--sc-amber); background: var(--sc-amber-soft); }
.sec-env.env-pub        { color: var(--sc-red); border-color: var(--sc-red); background: var(--sc-red-soft); }
.sec-env.env-prod       { color: var(--sc-cyan); border-color: var(--sc-cyan); background: var(--sc-cyan-soft); }
.sec-env.env-intern { color: var(--sc-fg-2); }
.sec-scope-x { cursor: pointer; opacity: 0.5; font-size: 12px; color: var(--sc-fg-3); }
.sec-scope-x:hover { opacity: 1; color: var(--sc-red); }
.sec-scope-meta {
  margin-top: 3px;
  font-family: var(--sc-mono); font-size: 10.5px; color: var(--sc-fg-2);
  display: flex; gap: 4px; flex-wrap: wrap; align-items: center;
}
.sec-meta-sep { color: var(--sc-fg-3); }

/* 左下 03 PULSE */
.sec-frame-pulse { flex: 1; min-height: 0; }
.sec-pulse { padding: 4px 0; overflow: auto; flex: 1; }
.sec-pulse-row {
  display: grid; grid-template-columns: 8px 90px 80px 1fr;
  gap: 8px; align-items: center;
  padding: 4px 12px; font-family: var(--sc-mono); font-size: 11px;
  color: var(--sc-fg-2);
}
.sec-pulse-row:hover { background: var(--sc-bg-2); }
.sec-pulse-row.bad .sec-pulse-dot { background: var(--sc-red); }
.sec-pulse-row:not(.bad) .sec-pulse-dot { background: var(--sc-green); }
.sec-pulse-dot {
  width: 6px; height: 6px; border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}
.sec-pulse-time { font-variant-numeric: tabular-nums; color: var(--sc-fg-3); }
.sec-pulse-tool { color: var(--sc-fg); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sec-pulse-msg { color: var(--sc-fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sec-pulse-more {
  border: none; background: transparent;
  padding: 8px 12px; text-align: center;
  font-family: var(--sc-mono); font-size: 11px; letter-spacing: 0.05em;
  color: var(--sc-primary); cursor: pointer;
  border-top: 1px dashed var(--sc-line-2);
  text-transform: uppercase;
}
.sec-pulse-more:hover { background: var(--sc-bg-2); color: var(--sc-amber); }

/* ---------- 命令行（命令中枢）---------- */
.sec-cmdbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--sc-line);
  background: var(--sc-bg-2);
}
.sec-cmdbar-k { font-family: var(--sc-mono); font-size: 12px; color: var(--sc-amber); }
.sec-cmdbar-input {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  font-family: var(--sc-mono); font-size: 12px; color: var(--sc-fg);
}
.sec-cmdbar-input::placeholder { color: var(--sc-fg-3); }
.sec-cmdbar-tip { font-family: var(--sc-mono); font-size: 10px; color: var(--sc-fg-3); white-space: nowrap; }
.sec-cmdbar-tip b { color: var(--sc-primary); }

/* ── 高级表单（2026-10-16 收敛：原 8 Tab 的四个动作面折叠进「终端」）──
   收敛只改**信息架构**，不改执行链：展开后的表单和命令行走的是同一套命令通道。 */
.sec-adv {
  margin-top: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}
.sec-adv-sum {
  cursor: pointer; user-select: none; list-style: none;
  padding: 8px 10px; font-family: var(--sc-mono); font-size: 11px;
  letter-spacing: 0.06em; color: var(--sc-fg-3);
}
.sec-adv-sum::-webkit-details-marker { display: none; }
.sec-adv-sum::before { content: '▸ '; color: var(--sc-amber); }
.sec-adv[open] > .sec-adv-sum::before { content: '▾ '; }
.sec-adv-hint { margin-left: 8px; font-size: 10px; color: var(--sc-fg-3); }
.sec-cmdhints {
  display: flex; flex-direction: column;
  border-bottom: 1px solid var(--sc-line); background: var(--sc-bg);
}
.sec-cmdhint {
  display: flex; gap: 10px; align-items: baseline;
  padding: 5px 12px; border: none; background: transparent; cursor: pointer;
  font-family: var(--sc-mono); font-size: 11px; color: var(--sc-fg-2); text-align: left;
}
.sec-cmdhint b { color: var(--sc-amber); min-width: 96px; }
.sec-cmdhint:hover { background: var(--sc-bg-2); color: var(--sc-fg); }

/* ---------- Tab 导航 ---------- */
.sec-tabs {
  display: flex; gap: 0;
  border-bottom: 1px solid var(--sc-line);
}
.sec-tab {
  flex: 1; padding: 10px 14px;
  display: flex; align-items: center; gap: 8px;
  background: var(--sc-bg); border: 0;
  border-right: 1px solid var(--sc-line);
  border-top: 2px solid transparent;
  cursor: pointer; text-align: left;
  font-family: var(--sc-mono); color: var(--sc-fg-2);
  transition: background var(--motion-fast, 120ms), color var(--motion-fast, 120ms), border-top-color var(--motion-fast, 120ms);
  position: relative; min-width: 0;
}
.sec-tab:last-child { border-right: 0; }
.sec-tab:hover { background: var(--sc-bg-2); color: var(--sc-fg); }
.sec-tab.active { background: var(--sc-bg); color: var(--sc-fg); border-top-color: var(--sc-amber); }
.sec-tab.active::after {
  content: ''; position: absolute; left: 14px; right: 14px;
  bottom: -1px; height: 1px; background: var(--sc-bg);
}
.sec-tab-num {
  font-family: var(--sc-serif); font-style: italic;
  font-size: 12px; color: var(--sc-fg-3);
}
.sec-tab.active .sec-tab-num { color: var(--sc-amber); }
.sec-tab-name {
  font-family: var(--sc-mono); font-weight: 600;
  font-size: 12.5px; color: var(--sc-fg); letter-spacing: 0.06em;
}
.sec-tab-sub {
  font-family: var(--sc-mono); font-size: 9.5px;
  letter-spacing: 0.16em; color: var(--sc-fg-3); text-transform: uppercase;
  padding-left: 8px; border-left: 1px solid var(--sc-line);
}
.sec-tab-badge {
  margin-left: auto;
  font-family: var(--sc-mono); font-size: 9px; font-weight: 700;
  padding: 2px 6px; border-radius: 2px; letter-spacing: 0.05em;
  background: var(--sc-amber-soft); color: var(--sc-amber);
  border: 1px solid var(--sc-amber);
}

/* ---------- 面板通用 ---------- */
.sec-pane { padding: 14px; display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; }
.sec-pane-head { display: flex; align-items: center; min-height: 18px; }
.sec-pane-tag {
  font-family: var(--sc-mono); font-size: 11px;
  padding: 2px 7px; border: 1px solid var(--sc-line-2); border-radius: 2px;
  color: var(--sc-fg-2); letter-spacing: 0.04em;
}
.sec-pane-tag-warn { color: var(--sc-amber); border-color: var(--sc-amber); background: var(--sc-amber-soft); }
.sec-pane-tag-info { color: var(--sc-cyan); border-color: var(--sc-cyan); background: var(--sc-cyan-soft); }

/* ---------- 控件行 ---------- */
.sec-row-ctl {
  display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;
  padding: 12px 14px;
  background: var(--sc-bg); border: 1px solid var(--sc-line);
  border-radius: 4px;
}
.sec-field { display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
.sec-field-grow { flex: 1; min-width: 200px; }
.sec-field-grow-2 { flex: 2; }
.sec-field-k {
  font-family: var(--sc-mono); font-size: 9.5px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--sc-fg-3);
}
.sec-input { width: 100%; }
.sec-field-check {
  flex-direction: row; align-items: center; gap: 6px;
  font-family: var(--sc-mono); font-size: 11.5px; color: var(--sc-fg-2);
  align-self: flex-end; padding-bottom: 6px;
}
.sec-field-check input { accent-color: var(--sc-amber); }
.sec-spacer { flex: 1; min-width: 0; }

.sec-cta {
  font-family: var(--sc-mono); font-weight: 700; font-size: 12px;
  letter-spacing: 0.12em; padding: 8px 18px;
}
.sec-cta-warn { background: var(--sc-amber) !important; border-color: var(--sc-amber) !important; color: #fff !important; }
.sec-cta-ghost { font-family: var(--sc-mono); font-size: 11px; }

/* ---------- 输出区 ---------- */
.sec-frame-out { flex: 1; min-height: 0; }
.sec-frame-out .sec-frame-head-sm .sec-meta-v { font-size: 10.5px; color: var(--sc-fg-2); }
.sec-dot-out {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--sc-fg-3); transition: background var(--motion-fast, 120ms);
}
.sec-dot-out.active {
  background: var(--sc-amber);
  box-shadow: 0 0 8px var(--sc-amber);
  animation: pulse 1.2s ease-in-out infinite alternate;
}
@keyframes pulse { from { opacity: 0.6; } to { opacity: 1; } }

.sec-out-wrap {
  position: relative; flex: 1; min-height: 0; overflow: auto;
  background: var(--sc-bg-2);
}
/* 扫描光：running 时一条 amber 渐变从上向下扫过 */
.sec-out-wrap.scanning::after {
  content: ''; position: absolute; left: 0; right: 0;
  top: 0; height: 38%;
  background: linear-gradient(to bottom,
    rgba(180, 83, 9, 0) 0%,
    rgba(180, 83, 9, 0.18) 35%,
    rgba(180, 83, 9, 0.28) 50%,
    rgba(180, 83, 9, 0.18) 65%,
    rgba(180, 83, 9, 0) 100%);
  pointer-events: none;
  animation: scanline 2.2s linear infinite;
  z-index: 1;
}
@keyframes scanline {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(260%); }
}
@media (prefers-reduced-motion: reduce) {
  .sec-out-wrap.scanning::after { animation: none; }
  .sec-dot-out.active { animation: none; }
}

.sec-out {
  white-space: pre-wrap; word-break: break-word;
  font-family: var(--sc-mono); font-size: 12px; line-height: 1.55;
  color: var(--sc-fg);
  padding: 14px 16px;
  font-variant-numeric: tabular-nums;
  position: relative; z-index: 0;
}
.sec-out :deep(code) { font-family: var(--sc-mono); font-size: 11.5px; }

/* ---------- Note（原则/红线区）---------- */
.sec-frame-note { padding: 0; }
.sec-note {
  display: flex; flex-direction: column; gap: 4px;
  padding: 10px 14px; font-family: var(--sc-mono); font-size: 11.5px;
  color: var(--sc-fg-2); line-height: 1.6;
}
.sec-note-strong { color: var(--sc-red); font-weight: 600; }
.sec-note-warn { color: var(--sc-amber); }
.sec-note b { color: var(--sc-red); }
.sec-frame-note-lock { background: var(--sc-cyan-soft); }
.sec-frame-note-lock .sec-frame-head { background: transparent; border-bottom-color: var(--sc-cyan); }
.sec-note-lock-icon {
  display: inline-block; width: 14px; height: 14px;
  border: 1.5px solid var(--sc-cyan); border-radius: 2px;
  background: var(--sc-cyan-soft) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%230e7490' stroke-width='2' stroke-linecap='round'><rect x='4' y='7' width='8' height='6' rx='1'/><path d='M6 7 V5 a2 2 0 0 1 4 0 V7'/></svg>") center/12px no-repeat;
  flex: none;
}

/* ---------- 发现项 ---------- */
.sec-frame-list { flex: 1; min-height: 0; }
.sec-finding-list, .sec-audit-list { padding: 8px 12px; overflow: auto; flex: 1; }
.sec-finding {
  display: grid; grid-template-columns: 4px 1fr;
  margin-bottom: 8px; border: 1px solid var(--sc-line);
  background: var(--sc-bg);
  border-radius: 3px; overflow: hidden;
}
.sec-finding-bar { background: var(--sc-fg-3); }
.sec-finding[data-sev="critical"] .sec-finding-bar { background: var(--sc-red); box-shadow: 0 0 8px var(--sc-red); }
.sec-finding[data-sev="high"] .sec-finding-bar { background: var(--sc-red); }
.sec-finding[data-sev="medium"] .sec-finding-bar { background: var(--sc-amber); }
.sec-finding[data-sev="low"] .sec-finding-bar { background: var(--sc-cyan); }
.sec-finding[data-sev="info"] .sec-finding-bar { background: var(--sc-green); }
.sec-finding-body { padding: 10px 12px; }
.sec-finding-head { display: flex; align-items: center; gap: 8px; }
.sec-finding-title { font-family: var(--sc-mono); font-weight: 600; font-size: 13px; color: var(--sc-fg); }
.sec-finding-meta {
  display: flex; gap: 6px; align-items: baseline; margin-top: 4px;
  font-family: var(--sc-mono); font-size: 10.5px; color: var(--sc-fg-2);
}
.sec-finding-meta code { font-size: 11px; color: var(--sc-fg); }
.sec-finding-detail { margin-top: 6px; font-size: 12px; line-height: 1.55; color: var(--sc-fg); white-space: pre-wrap; }
.sec-finding-fix { margin-top: 6px; font-family: var(--sc-mono); font-size: 11.5px; color: var(--sc-green); }

/* ---------- 审计 ---------- */
.sec-audit {
  display: grid; grid-template-columns: 150px 6px 110px 160px 1fr;
  gap: 8px; align-items: center;
  padding: 6px 10px; border-bottom: 1px dashed var(--sc-line);
  font-family: var(--sc-mono); font-size: 11.5px;
}
.sec-audit:last-child { border-bottom: 0; }
.sec-audit:hover { background: var(--sc-bg-2); }
.sec-audit-time { font-variant-numeric: tabular-nums; color: var(--sc-fg-3); }
.sec-audit-mark {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--sc-green); box-shadow: 0 0 6px var(--sc-green);
}
.sec-audit.bad .sec-audit-mark { background: var(--sc-red); box-shadow: 0 0 8px var(--sc-red); }
.sec-audit-tool { color: var(--sc-fg); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sec-audit-target { color: var(--sc-fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sec-audit-msg { color: var(--sc-fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- 经验库（自学习）：待审 / 已批准 ---------- */
.sec-exp-form {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; border-bottom: 1px dashed var(--sc-line);
  background: var(--sc-bg-2);
}
.sec-exp-list { padding: 8px 12px 12px; overflow: auto; }
.sec-exp-group-title {
  margin: 4px 0 2px; font-family: var(--sc-mono); font-size: 10.5px;
  letter-spacing: .08em; color: var(--sc-fg-3); text-transform: uppercase;
}
.sec-exp-item {
  margin-top: 8px; padding: 8px 10px;
  border: 1px solid var(--sc-line); border-radius: 3px;
  background: var(--sc-bg-2);
}
.sec-exp-item-ok { border-left: 3px solid var(--sc-green); }
.sec-exp-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sec-exp-id { font-family: var(--sc-mono); font-size: 10.5px; color: var(--sc-cyan); }
.sec-exp-title { font-size: 12.5px; font-weight: 600; color: var(--sc-fg); }
.sec-exp-meta { margin-top: 4px; font-family: var(--sc-mono); font-size: 10.5px; color: var(--sc-fg-3); }
.sec-exp-body {
  margin-top: 6px; font-size: 12px; line-height: 1.55; color: var(--sc-fg);
  white-space: pre-wrap; word-break: break-word;
}
.sec-exp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.sec-exp-note { font-family: var(--sc-mono); font-size: 10.5px; color: var(--sc-fg-3); }

/* ---------- 通用 ---------- */
.sec-empty {
  padding: 32px 20px; text-align: center;
  font-family: var(--sc-mono); font-size: 12px; color: var(--sc-fg-2);
  border: 1px dashed var(--sc-line);
  background: var(--sc-bg-2);
  border-radius: 3px; line-height: 1.6;
}
.sec-empty-sm { padding: 18px 14px; font-size: 11px; }
.sec-empty b { color: var(--sc-amber); font-weight: 600; }

/* ---------- 二次确认 ---------- */
.sec-confirm { display: flex; flex-direction: column; gap: 8px; }
.sec-confirm-row { display: flex; gap: 10px; font-size: 13px; }
.sec-confirm-row .k { width: 80px; color: var(--sc-fg-2); font-family: var(--sc-mono); font-size: 11px; }
.sec-confirm-row .v { flex: 1; font-family: var(--sc-mono); font-size: 12.5px; word-break: break-all; }

/* ---------- 响应式 ---------- */
@media (max-width: 1080px) {
  .sec-grid { grid-template-columns: 220px 1fr; }
  .sec-meta-item:nth-child(2), .sec-meta-item:nth-child(3) { display: none; }
}
@media (max-width: 880px) {
  .sec-grid { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .sec-col-left { max-height: 200px; }
  .sec-tabs { overflow-x: auto; }
  .sec-tab { min-width: 130px; }
}
@media (max-width: 640px) {
  .sec-meta { display: none; }
  .sec-ribbon { flex-wrap: wrap; }
  .sec-row-ctl { padding: 10px; }
}

/* ---------- Element Plus 局部 style（不 scoped，皮肤感知） ---------- */
.sec-console :deep(.el-input__wrapper),
.sec-console :deep(.el-select__wrapper) {
  background: var(--sc-bg-2) !important;
  box-shadow: 0 0 0 1px var(--sc-line) inset !important;
  border-radius: 3px !important;
}
.sec-console :deep(.el-input__wrapper.is-focus),
.sec-console :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1.5px var(--sc-amber) inset !important;
}
.sec-console :deep(.el-textarea__inner) {
  background: var(--sc-bg-2) !important;
  border-color: var(--sc-line) !important;
  font-family: var(--sc-mono) !important;
}
.sec-console :deep(.el-button) {
  font-family: var(--sc-mono); letter-spacing: 0.08em;
}
.sec-console :deep(.el-tabs__nav-wrap) { display: none; }
.sec-console :deep(.el-dialog) { border-radius: 4px; }
.sec-console :deep(.el-dialog__header) { border-bottom: 1px dashed var(--sc-line-2); margin-right: 0; padding: 12px 16px; }
.sec-console :deep(.el-dialog__title) { font-family: var(--sc-mono); letter-spacing: 0.1em; font-size: 13px; }

/* 滚动条（统一控制台风格） */
.sec-console :deep(*::-webkit-scrollbar) { width: 8px; height: 8px; }
.sec-console :deep(*::-webkit-scrollbar-thumb) {
  background: var(--sc-line-2); border-radius: 0;
}
.sec-console :deep(*::-webkit-scrollbar-thumb:hover) { background: var(--sc-fg-3); }
.sec-console :deep(*::-webkit-scrollbar-track) { background: transparent; }

/* ============================================================
   ▍ 07 · 环境 / 靶场（host_env · range · android）
   ============================================================ */
.sec-env-note { font-size: 12px; color: var(--sc-fg-3); }
.sec-env-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  margin-bottom: 10px;
}
.sec-frame-env { border: 1px solid var(--sc-line); background: var(--sc-bg); }
.sec-frame-env[data-up="true"] .sec-frame-title { color: var(--sc-green); }
.sec-frame-env[data-up="false"] .sec-frame-title { color: var(--sc-fg-3); }
.sec-env-body {
  padding: 8px 12px 10px;
  display: flex; flex-direction: column; gap: 4px;
}
.sec-env-line { display: flex; align-items: baseline; gap: 10px; font-size: 12px; }
.sec-env-line .sec-meta-k { min-width: 64px; }
.sec-env-line code { color: var(--sc-fg-2); word-break: break-all; }
.sec-env-note2 { font-size: 11px; color: var(--sc-fg-3); margin-top: 2px; line-height: 1.5; }
.sec-range-list {
  padding: 0 12px 10px;
  display: flex; flex-direction: column; gap: 6px;
}
.sec-range-row {
  display: flex; align-items: center; gap: 10px;
  border: 1px dashed var(--sc-line); padding: 6px 10px;
  background: var(--sc-bg-2);
}
.sec-range-name { font-size: 12px; color: var(--sc-amber); white-space: nowrap; }
.sec-range-meta { font-size: 12px; color: var(--sc-fg-2); word-break: break-all; }

/* ============================================================
   ▍ 08 · 能力边界（明确不实现 · 规划中）
   ============================================================ */
.sec-boundary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
  padding: 10px 12px 12px;
}
.sec-bcard {
  border: 1px solid var(--sc-line);
  background: var(--sc-bg-2);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.sec-bcard-lock { border-style: dashed; border-color: var(--sc-line-2); }
.sec-bcard-head { display: flex; align-items: center; gap: 8px; }
.sec-bcard-lockicon {
  width: 8px; height: 8px; flex: none;
  background: var(--sc-red);
  display: inline-block;
}
.sec-bcard-name { font-size: 13px; font-weight: 600; color: var(--sc-fg); flex: 1; }
.sec-bcard-reason { font-size: 12px; color: var(--sc-amber); }
.sec-bcard-detail { font-size: 11.5px; color: var(--sc-fg-3); line-height: 1.6; }

/* ============================================================
   主导方双形态补充（任务 8.1–8.4）
   ============================================================ */
/* 定位基准：右下角主导方悬浮胶囊（LeadToggle） */
.sec-console { position: relative; }

/* 命令模式容器：承接原右栏直接子元素的 flex 语义（包一层 v-show 保活） */
.sec-ws {
  flex: 1; min-height: 0; min-width: 0;
  display: flex; flex-direction: column; gap: 12px;
}

/* 左栏任务段：限高约 40%，超出滚动 */
.sec-frame-tasks {
  flex: 0 0 auto;
  height: 34%;
  min-height: 120px;
  max-height: 40%;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.sec-frame-tasks :deep(.tls) { height: 100%; }

/* AI 模式对话区（与运维控制台 chat 视图同构） */
.sec-ai {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.sec-ai-list {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 16px; padding: 8px 6px 14px;
}
.sec-ai-welcome {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; text-align: center; color: var(--sc-fg-2); padding: 24px;
}
.sec-ai-welcome-icon { color: var(--color-primary); }
.sec-ai-welcome-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--sc-fg); }
.sec-ai-welcome-sub { margin: 0; font-size: 12px; line-height: 1.8; max-width: 380px; }

.sec-ai-msg { display: flex; gap: 10px; animation: secMsgIn 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes secMsgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.sec-ai-msg.msg-user { flex-direction: row-reverse; }
.sec-ai-avatar {
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.sec-ai-avatar.avatar-user { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); }
.sec-ai-avatar.avatar-assistant { background: linear-gradient(135deg, var(--color-accent), var(--color-primary-dark)); }
.sec-ai-body { min-width: 0; max-width: calc(100% - 40px); display: flex; flex-direction: column; }
.sec-ai-msg.msg-user .sec-ai-body { align-items: flex-end; flex: 1 1 0; }
.sec-ai-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 0 4px; }
.sec-ai-name { font-size: 12px; font-weight: 600; color: var(--sc-fg-2); }
.sec-ai-time { font-size: 11px; color: var(--sc-fg-3); }
.sec-ai-streaming { font-size: 11px; color: var(--color-primary); }
.sec-ai-content { font-size: 13px; line-height: 1.65; word-break: break-word; overflow-wrap: break-word; padding: 10px 14px; border-radius: 14px; }
.sec-ai-msg.msg-user .sec-ai-content {
  background: var(--gradient-primary); color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-primary) 22%, transparent);
  display: inline-block; max-width: 100%;
}
.sec-ai-msg.msg-assistant .sec-ai-content { background: transparent; border-radius: 0; padding: 2px 2px 0; }

.sec-ai-md p { margin: 6px 0; }
.sec-ai-md p:first-child { margin-top: 0; }
.sec-ai-md p:last-child { margin-bottom: 0; }
.sec-ai-md ul, .sec-ai-md ol { padding-left: 20px; margin: 6px 0; list-style-position: outside; }
.sec-ai-md li { margin: 3px 0; }
.sec-ai-md code {
  font-family: "JetBrains Mono", Consolas, monospace; font-size: 0.88em;
  background: color-mix(in srgb, var(--sc-fg) 8%, transparent);
  padding: 1px 5px; border-radius: 4px;
}
.sec-ai-md pre {
  background: var(--skin-surface-sunken, #0f172a); color: var(--skin-text, #e2e8f0);
  padding: 12px 14px; border-radius: 8px;
  overflow-x: auto; font-family: "JetBrains Mono", Consolas, monospace; font-size: 12px;
  margin: 8px 0; max-width: 100%; white-space: pre-wrap; word-break: break-all;
}
.sec-ai-md pre code { background: transparent; padding: 0; color: inherit; }
.sec-ai-md blockquote {
  margin: 8px 0; padding: 4px 12px; border-left: 3px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent); border-radius: 0 6px 6px 0;
}
.sec-ai-md table { border-collapse: collapse; margin: 8px 0; font-size: 12px; max-width: 100%; display: block; overflow-x: auto; }
.sec-ai-md th, .sec-ai-md td { border: 1px solid var(--glass-border); padding: 4px 10px; text-align: left; }
.sec-ai-md th { background: var(--glass-bg-hover); font-weight: 600; }
.sec-ai-md a { color: var(--color-primary); }
.sec-ai-md h1, .sec-ai-md h2, .sec-ai-md h3, .sec-ai-md h4 { margin: 10px 0 6px; font-size: 13.5px; }
.sec-inline-tool {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-radius: 6px; padding: 2px 8px; margin: 2px 0;
}

.sec-ai-input {
  flex-shrink: 0;
  background: var(--color-surface); border: 1px solid var(--glass-border);
  border-radius: 16px; padding: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.sec-ai-input:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 6px 28px color-mix(in srgb, var(--color-primary) 13%, transparent);
}
.sec-ai-input :deep(.el-textarea__inner) {
  border: none; background: transparent; box-shadow: none !important;
  padding: 8px 10px; border-radius: 10px; font-size: 13px; line-height: 1.6; resize: none;
}
.sec-ai-input :deep(.el-textarea__inner::placeholder) { color: var(--sc-fg-3); opacity: 0.8; }
/* 右侧留 56px：右下角主导方悬浮胶囊（LeadToggle，right:16 + 34px 宽）压在工具条右端，
   不留白会把「发送」盖住、点击还会误触切换模式（与运维模式同一处修正） */
.sec-ai-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 56px 2px 2px;
}
.sec-ai-toolbar-group { display: inline-flex; gap: 4px; }
.sec-ai-tool-btn { padding: 4px 10px; }
.sec-ai-tool-btn-active { border-color: var(--sc-cyan); color: var(--sc-cyan); }
.sec-ai-model-select { width: 190px; }
.sec-ai-model-select :deep(.el-select__wrapper) { min-height: 26px; }
.sec-ai-perm-btn { padding: 2px 6px; }
.sec-ai-scope-hint { font-family: var(--sc-mono); font-size: 10.5px; color: var(--sc-fg-3); }
.sec-ai-perm-title { font-size: 12.5px; font-weight: 600; color: var(--sc-fg); }
.sec-ai-perm-sub { margin: 6px 0; font-size: 11.5px; line-height: 1.5; color: var(--sc-fg-2); }
.sec-ai-perm-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0; border-top: 1px dashed var(--sc-line); font-size: 12px;
}
.sec-ai-perm-meta { margin-top: 6px; font-family: var(--sc-mono); font-size: 10px; color: var(--sc-fg-3); }
.sec-ai-perm-warn {
  margin-top: 8px; padding: 6px 8px; border: 1px solid var(--sc-amber);
  border-radius: 3px; color: var(--sc-amber); font-size: 11px; line-height: 1.5;
}
.sec-ai-hint { font-size: 11px; color: var(--sc-fg-3); }
</style>
