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
          <button class="sec-pulse-more" @click="tab = 'audit'">查看全部审计 →</button>
        </section>
      </aside>

      <!-- ============ 右栏 ============ -->
      <section class="sec-col-right">
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
            <span v-if="t.badge" class="sec-tab-badge">{{ t.badge }}</span>
          </button>
        </nav>

        <!-- ========= Tab 1：执行（基础扫描） ========= -->
        <div v-show="tab === 'run'" class="sec-pane">
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

          <article class="sec-frame sec-frame-out">
            <header class="sec-frame-head sec-frame-head-sm">
              <span class="sec-dot-out" :class="{ active: running }" />
              <span class="sec-frame-title">output</span>
              <span class="sec-frame-hint">流式输出</span>
              <span class="sec-spacer" />
              <span class="sec-meta-v" v-if="lastRunMs">{{ lastRunMs }}ms</span>
            </header>
            <div class="sec-out-wrap" :class="{ scanning: running }">
              <div v-if="result" class="sec-out">{{ result }}</div>
              <div v-else class="sec-empty">
                选择工具并填写目标后执行。建议先跑 <b>目标画像（recon）</b> 摸清暴露面，再决定要不要扫端口 / 探 Web。
              </div>
            </div>
          </article>
        </div>

        <!-- ========= Tab 2：演练（攻击模拟 · 隔离靶场 + 人工执行） ========= -->
        <div v-show="tab === 'sim'" class="sec-pane">
          <div class="sec-pane-head">
            <span class="sec-pane-tag sec-pane-tag-warn">attack_sim · 隔离靶场 · 仅 system read-only 命令</span>
          </div>
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
        </div>

        <!-- ========= Tab 3：检测（蓝队） ========= -->
        <div v-show="tab === 'detect'" class="sec-pane">
          <div class="sec-pane-head">
            <span class="sec-pane-tag sec-pane-tag-info">detect_rules · log_hunt · 内置 10 条 Sigma/Suricata 规则</span>
          </div>
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
        </div>

        <!-- ========= Tab 4：资产（自有资产监控） ========= -->
        <div v-show="tab === 'easm'" class="sec-pane">
          <div class="sec-pane-head">
            <span class="sec-pane-tag sec-pane-tag-info">asset_monitor · add/list/verify/snapshot/diff</span>
          </div>
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
        </div>

        <!-- ========= Tab 5：发现项 ========= -->
        <div v-show="tab === 'findings'" class="sec-pane">
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

        <!-- ========= Tab 6：审计 ========= -->
        <div v-show="tab === 'audit'" class="sec-pane">
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

        <!-- ========= Tab 7：环境 / 靶场（宿主机 Docker + Android，仅本机） ========= -->
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

        <!-- ========= Tab 8：能力边界（明确不实现 + 规划中） ========= -->
        <div v-show="tab === 'boundary'" class="sec-pane">
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
      </section>
    </div>

    <!-- ============ 登记授权目标 ============ -->
    <el-dialog v-model="showAdd" title="登记授权目标" width="520px">
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
      <template #footer>
        <el-button size="small" @click="showAdd = false">取消</el-button>
        <el-button size="small" type="primary" @click="addScope">登记</el-button>
      </template>
    </el-dialog>

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
import { computed, onMounted, reactive, ref } from 'vue';
import { Close, QuestionFilled } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client';

const BASE = '/plugin/sec-lab';

// ---------- Tab 描述（决定顺序、编号、分类标签） ----------
const TABS = [
  { value: 'run',      num: '01', name: '执行',   sub: 'EXEC',     badge: '' },
  { value: 'sim',      num: '02', name: '演练',   sub: 'TRAIN',    badge: 'human' },
  { value: 'detect',   num: '03', name: '检测',   sub: 'DETECT',   badge: '' },
  { value: 'easm',     num: '04', name: '资产',   sub: 'ASSETS',   badge: '' },
  { value: 'findings', num: '05', name: '发现项', sub: 'FIND',     badge: '0' },
  { value: 'audit',    num: '06', name: '审计',   sub: 'AUDIT',    badge: '0' },
  { value: 'env',      num: '07', name: '环境',   sub: 'RANGE',    badge: '' },
  { value: 'boundary', num: '08', name: '边界',   sub: 'SCOPE',    badge: '' },
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

// ---------- 派生 ----------
const currentTabLabel = computed(() => TABS.find((t) => t.value === tab.value)?.sub || '');
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
  lastRunMs.value = Date.now() - t0;
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

onMounted(async () => { await loadAll(); await loadToolchain(); });
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
</style>
