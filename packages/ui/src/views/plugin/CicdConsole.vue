<template>
  <div class="cicd-console">
    <!-- 顶栏 -->
    <div class="cicd-header">
      <div class="header-left">
        <h2>CI/CD 发布</h2>
        <span class="project-tag" v-if="projectDir">{{ projectName }}</span>
      </div>
      <div class="header-right">
        <button class="btn btn-primary" @click="dialogVisible = true; editing = false">+ 新建流水线</button>
      </div>
    </div>

    <!-- 主体 -->
    <div class="cicd-body">
      <!-- 左侧：流水线列表 -->
      <div class="cicd-sidebar">
        <div class="sidebar-title">流水线</div>
        <div class="pipeline-list">
          <div
            v-for="p in pipelines"
            :key="p.id"
            class="pipeline-item"
            :class="{ active: selectedPipeline?.id === p.id }"
            @click="selectPipeline(p)"
          >
            <div class="pipeline-name">{{ p.name }}</div>
            <div class="pipeline-meta">
              <span class="tag">{{ p.buildType }}</span>
              <span class="steps">{{ p.steps.length }} 步</span>
            </div>
          </div>
          <div v-if="!pipelines.length" class="empty-state">暂无流水线</div>
        </div>
      </div>

      <!-- 右侧：详情/执行 -->
      <div class="cicd-main">
        <template v-if="selectedPipeline">
          <div class="pipeline-detail">
            <div class="detail-header">
              <h3>{{ selectedPipeline.name }}</h3>
              <div class="detail-actions">
                <button class="btn btn-primary" :disabled="!selectedPipeline.targets.length || running" @click="executePipeline">
                  {{ running ? '执行中...' : '▶ 一键发布' }}
                </button>
                <button class="btn" @click="openEdit">编辑</button>
                <button class="btn btn-danger" @click="removePipeline">删除</button>
              </div>
            </div>

            <!-- 部署目标选择 -->
            <div class="target-selector" v-if="selectedPipeline.targets.length">
              <label>部署目标：</label>
              <select v-model="selectedTargetId">
                <option v-for="t in selectedPipeline.targets" :key="t.id" :value="t.id">
                  {{ t.name }} ({{ connName(t.connectionId) }})
                </option>
              </select>
            </div>

            <!-- 步骤列表 -->
            <div class="steps-section">
              <div class="section-title">步骤</div>
              <div class="step-list">
                <div v-for="(step, i) in selectedPipeline.steps" :key="step.id" class="step-item" :class="stepStatusClass(step.id)">
                  <div class="step-index">{{ i + 1 }}</div>
                  <div class="step-info">
                    <div class="step-name">{{ step.name }} <span class="step-type-badge">{{ stepTypeLabel(step.type) }}</span></div>
                    <div class="step-config">{{ stepSummary(step) }}</div>
                  </div>
                  <div class="step-status-icon">
                    <span v-if="runStepStatus[step.id] === 'running'" class="status-running">⟳</span>
                    <span v-else-if="runStepStatus[step.id] === 'success'" class="status-success">✓</span>
                    <span v-else-if="runStepStatus[step.id] === 'failed'" class="status-failed">✗</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 执行日志 -->
            <div class="logs-section" v-if="runLogs.length">
              <div class="section-title">执行日志</div>
              <div class="log-viewer">
                <div v-for="log in runLogs" :key="log.stepId" class="log-block">
                  <div class="log-header">{{ log.stepName }}</div>
                  <pre class="log-content">{{ log.log }}</pre>
                </div>
              </div>
            </div>

            <!-- 执行历史 -->
            <div class="history-section">
              <div class="section-title">执行历史</div>
              <div class="history-list">
                <div v-for="run in pipelineRuns" :key="run.id" class="history-item">
                  <span class="run-status" :class="run.status">{{ run.status }}</span>
                  <span class="run-target">{{ run.targetName }}</span>
                  <span class="run-time">{{ formatTime(run.startedAt) }}</span>
                </div>
                <div v-if="!pipelineRuns.length" class="empty-state">暂无执行记录</div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="cicd-empty">
          <p>选择左侧流水线或创建新的发布流程</p>
          <button class="btn btn-primary" @click="dialogVisible = true; editing = false">+ 新建流水线</button>
        </div>
      </div>
    </div>

    <!-- 创建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑流水线' : '新建流水线'" width="800px" top="5vh" destroy-on-close>
      <div class="dialog-content">
        <!-- 基本信息 -->
        <div class="form-row">
          <div class="form-item">
            <label>名称</label>
            <input v-model="form.name" placeholder="如：my-project 发布" />
          </div>
          <div class="form-item">
            <label>项目目录</label>
            <input v-model="form.projectDir" placeholder="自动从当前项目填充" readonly class="readonly-input" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-item">
            <label>模板</label>
            <select v-model="form.template" @change="applyTemplate">
              <option value="">不使用模板</option>
              <option v-for="(tpl, id) in templates" :key="id" :value="id">{{ tpl.name }}</option>
            </select>
          </div>
          <div class="form-item" v-if="detectResult">
            <div class="detect-info">
              检测到：{{ detectResult.buildTool }}<span v-if="detectResult.isSpringBoot"> + Spring Boot</span>
              → 推荐：<strong>{{ detectResult.recommendedTemplate }}</strong>
            </div>
          </div>
        </div>

        <!-- 步骤编辑 -->
        <div class="section-divider">
          <span>步骤</span>
          <button class="btn btn-sm" @click="addStep">+ 添加</button>
        </div>

        <div v-for="(step, i) in form.steps" :key="i" class="step-edit-card">
          <div class="step-edit-top">
            <span class="step-num">{{ i + 1 }}</span>
            <select v-model="step.type" class="step-type-sel" @change="onStepTypeChange(step)">
              <option value="build">打包</option>
              <option value="backup">备份</option>
              <option value="upload">上传</option>
              <option value="exec-remote">远程执行</option>
              <option value="exec-local">本地执行</option>
              <option value="docker-build">Docker 构建</option>
              <option value="docker-push">Docker 推送</option>
              <option value="notify">通知</option>
            </select>
            <input v-model="step.name" placeholder="步骤名称" class="step-name-inp" />
            <button class="btn btn-sm" @click="step._jsonMode = !step._jsonMode">
              {{ step._jsonMode ? '表单' : 'JSON' }}
            </button>
            <button class="btn btn-sm btn-danger" @click="form.steps.splice(i, 1)">删除</button>
          </div>

          <!-- 表单模式 -->
          <div v-if="!step._jsonMode" class="step-edit-form">
            <!-- build -->
            <template v-if="step.type === 'build'">
              <div class="form-row">
                <div class="form-item">
                  <label>构建类型</label>
                  <select v-model="cfg(step).buildType" @change="onBuildTypeChange(step)">
                    <option value="maven-jar">Maven JAR</option>
                    <option value="maven-war">Maven WAR</option>
                    <option value="maven-scattered">Maven 散包</option>
                    <option value="gradle-jar">Gradle JAR</option>
                    <option value="npm-build">NPM 构建</option>
                    <option value="docker-image">Docker 镜像</option>
                    <option value="custom-command">自定义命令</option>
                  </select>
                </div>
                <div class="form-item">
                  <label>产物路径</label>
                  <input v-model="cfg(step).artifact" placeholder="target/*.jar" />
                </div>
              </div>
              <div class="form-item full">
                <label>构建命令</label>
                <input v-model="cfg(step).command" placeholder="mvn clean package -DskipTests" />
              </div>
            </template>

            <!-- backup -->
            <template v-if="step.type === 'backup'">
              <div class="form-row">
                <div class="form-item">
                  <label>SSH 连接</label>
                  <select v-model="cfg(step).connectionId">
                    <option value="">从部署目标继承</option>
                    <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }} ({{ c.host }})</option>
                  </select>
                </div>
                <div class="form-item">
                  <label>备份策略</label>
                  <select v-model="cfg(step).strategy">
                    <option value="copy">复制 (cp)</option>
                    <option value="mv">移动 (mv)</option>
                    <option value="tar">打包 (tar.gz)</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-item">
                  <label>远程路径（留空则用部署目标路径）</label>
                  <input v-model="cfg(step).remotePath" placeholder="/data/app/app.jar" @change="onBackupRemotePathChange(step)" />
                </div>
                <div class="form-item">
                  <label>备份目录</label>
                  <input v-model="cfg(step).backupDir" placeholder="/data/app/backups" />
                </div>
              </div>
              <div class="form-item">
                <label>保留份数</label>
                <input type="number" v-model.number="cfg(step).keepCount" />
              </div>
            </template>

            <!-- upload -->
            <template v-if="step.type === 'upload'">
              <div class="form-row">
                <div class="form-item">
                  <label>SSH 连接</label>
                  <select v-model="cfg(step).connectionId">
                    <option value="">从部署目标继承</option>
                    <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }} ({{ c.host }})</option>
                  </select>
                </div>
                <div class="form-item">
                  <label>上传模式</label>
                  <select v-model="cfg(step).mode">
                    <option value="overwrite">全量覆盖</option>
                    <option value="incremental">增量（仅变化的文件）</option>
                    <option value="skip-if-exists">跳过已存在</option>
                  </select>
                </div>
              </div>
              <div class="form-item full">
                <label>本地路径（构建产物）</label>
                <input v-model="cfg(step).localPath" placeholder="target/*.jar" />
              </div>
              <div class="form-item full">
                <label>远程路径（留空则用部署目标路径）</label>
                <input v-model="cfg(step).remotePath" placeholder="/data/app/" />
              </div>
            </template>

            <!-- exec-remote -->
            <template v-if="step.type === 'exec-remote'">
              <div class="form-item">
                <label>SSH 连接</label>
                <select v-model="cfg(step).connectionId">
                  <option value="">从部署目标继承</option>
                  <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }} ({{ c.host }})</option>
                </select>
              </div>
              <div class="form-item full">
                <label>命令</label>
                <textarea v-model="cfg(step).command" rows="2" placeholder="sh restart.sh"></textarea>
              </div>
              <div class="form-item">
                <label>超时（ms）</label>
                <input type="number" v-model.number="cfg(step).timeout" placeholder="120000" />
              </div>
            </template>

            <!-- exec-local -->
            <template v-if="step.type === 'exec-local'">
              <div class="form-item full">
                <label>命令</label>
                <textarea v-model="cfg(step).command" rows="2" placeholder="npm run build"></textarea>
              </div>
              <div class="form-item">
                <label>工作目录</label>
                <input v-model="cfg(step).workDir" placeholder="（留空则用项目根目录）" />
              </div>
            </template>

            <!-- docker-build -->
            <template v-if="step.type === 'docker-build'">
              <div class="form-row">
                <div class="form-item">
                  <label>镜像 Tag</label>
                  <input v-model="cfg(step).tag" placeholder="myapp:latest" />
                </div>
                <div class="form-item">
                  <label>Dockerfile</label>
                  <input v-model="cfg(step).dockerfile" placeholder="Dockerfile" />
                </div>
              </div>
              <div class="form-item full">
                <label>构建上下文</label>
                <input v-model="cfg(step).context" placeholder="." />
              </div>
            </template>

            <!-- docker-push -->
            <template v-if="step.type === 'docker-push'">
              <div class="form-item full">
                <label>镜像名</label>
                <input v-model="cfg(step).image" placeholder="myapp:latest" />
              </div>
              <div class="form-item">
                <label>Registry（可选）</label>
                <input v-model="cfg(step).registry" placeholder="registry.cn-hangzhou.aliyuncs.com" />
              </div>
            </template>

            <!-- notify -->
            <template v-if="step.type === 'notify'">
              <div class="form-row">
                <div class="form-item">
                  <label>通知类型</label>
                  <select v-model="cfg(step).type">
                    <option value="webhook">Webhook</option>
                    <option value="dingtalk">钉钉</option>
                    <option value="feishu">飞书</option>
                    <option value="email">邮件</option>
                  </select>
                </div>
                <div class="form-item full">
                  <label>URL</label>
                  <input v-model="cfg(step).url" placeholder="https://..." />
                </div>
              </div>
            </template>
          </div>

          <!-- JSON 模式 -->
          <div v-else class="step-edit-json">
            <textarea class="json-editor" rows="6" :value="JSON.stringify(step.config, null, 2)" @input="updateJson(step, $event)"></textarea>
          </div>
        </div>

        <!-- 部署目标 -->
        <div class="section-divider">
          <span>部署目标</span>
          <button class="btn btn-sm" @click="addTarget">+ 添加</button>
        </div>

        <div v-for="(t, i) in form.targets" :key="i" class="target-edit-card">
          <div class="form-row">
            <div class="form-item">
              <label>名称</label>
              <input v-model="t.name" placeholder="生产 / 测试" />
            </div>
            <div class="form-item">
              <label>SSH 连接</label>
              <select v-model="t.connectionId">
                <option value="">请选择连接</option>
                <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }} ({{ c.host }})</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-item">
              <label>远程部署路径</label>
              <input v-model="t.remotePath" placeholder="/data/app" />
            </div>
            <div class="form-item">
              <label>重启脚本</label>
              <input v-model="t.restartScript" placeholder="sh restart.sh" />
            </div>
          </div>
          <button class="btn btn-sm btn-danger" @click="form.targets.splice(i, 1)">删除目标</button>
        </div>
      </div>

      <template #footer>
        <button class="btn" @click="dialogVisible = false">取消</button>
        <button class="btn btn-primary" @click="savePipeline">保存</button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElDialog } from 'element-plus';
import { useCicdStore } from '../../stores/cicd';
import { useCodeStore } from '../../stores/code';
import type { CicdPipeline, PipelineStep, DeployTarget, ProjectDetectResult, BuildType } from '@yan-zhi/shared';

const cicdStore = useCicdStore();
const codeStore = useCodeStore();

const selectedPipeline = ref<CicdPipeline | null>(null);
const selectedTargetId = ref('');
const running = ref(false);
const dialogVisible = ref(false);
const editing = ref(false);
const detectResult = ref<ProjectDetectResult | null>(null);

const projectDir = computed(() => codeStore.projectDir);
const projectName = computed(() => codeStore.projectName);
const pipelines = computed(() => cicdStore.pipelines);
const templates = computed(() => cicdStore.templates);
const connections = computed(() => cicdStore.connections);
const runLogs = computed(() => cicdStore.runLogs);
const runStepStatus = computed(() => cicdStore.runStepStatus);
const pipelineRuns = computed(() =>
  selectedPipeline.value ? cicdStore.runs.filter((r) => r.pipelineId === selectedPipeline.value!.id) : [],
);

interface FormStep extends PipelineStep { _jsonMode?: boolean }
const form = ref<{
  name: string; projectDir: string; template: string;
  buildType: BuildType; steps: FormStep[]; targets: DeployTarget[];
}>({ name: '', projectDir: '', template: '', buildType: 'maven-jar', steps: [], targets: [] });

function cfg(step: PipelineStep): Record<string, any> { return step.config as unknown as Record<string, any>; }
function connName(id: string): string { return connections.value.find((c) => c.id === id)?.name || '未设置'; }
function stepStatusClass(id: string): string { const s = runStepStatus.value[id]; return s ? `step-${s}` : ''; }

function stepTypeLabel(type: string): string {
  const m: Record<string, string> = { build: '打包', backup: '备份', upload: '上传', 'exec-remote': '远程执行', 'exec-local': '本地执行', 'docker-build': 'Docker构建', 'docker-push': 'Docker推送', notify: '通知' };
  return m[type] || type;
}

function stepSummary(step: PipelineStep): string {
  const c = cfg(step);
  const parts: string[] = [];
  if (c.command) parts.push(c.command);
  if (c.connectionId) parts.push(connName(c.connectionId));
  else if (c.connectionId === '') parts.push('继承目标');
  if (c.remotePath) parts.push(`→ ${c.remotePath}`);
  if (c.mode) parts.push(c.mode);
  if (c.strategy) parts.push(c.strategy);
  if (c.artifact) parts.push(c.artifact);
  return parts.join(' | ') || '-';
}

function formatTime(ts: number): string { return new Date(ts).toLocaleString('zh-CN'); }

function selectPipeline(p: CicdPipeline) {
  selectedPipeline.value = p;
  selectedTargetId.value = p.targets[0]?.id || '';
  cicdStore.refreshRuns(p.id);
}

async function executePipeline() {
  if (!selectedPipeline.value) return;
  running.value = true;
  await cicdStore.runPipeline(selectedPipeline.value.id, selectedTargetId.value || undefined);
  running.value = false;
  if (selectedPipeline.value) await cicdStore.refreshRuns(selectedPipeline.value.id);
}

async function removePipeline() {
  if (!selectedPipeline.value || !confirm(`确认删除「${selectedPipeline.value.name}」？`)) return;
  await cicdStore.deletePipeline(selectedPipeline.value.id);
  selectedPipeline.value = null;
}

function openEdit() {
  if (!selectedPipeline.value) return;
  editing.value = true;
  form.value = {
    name: selectedPipeline.value.name,
    projectDir: selectedPipeline.value.projectDir,
    template: '',
    buildType: selectedPipeline.value.buildType,
    steps: JSON.parse(JSON.stringify(selectedPipeline.value.steps)),
    targets: JSON.parse(JSON.stringify(selectedPipeline.value.targets)),
  };
  dialogVisible.value = true;
}

const BUILD_PRESETS: Record<string, { command: string; artifact: string }> = {
  'maven-jar':       { command: 'mvn clean package -DskipTests', artifact: 'target/*.jar' },
  'maven-war':       { command: 'mvn clean package -DskipTests', artifact: 'target/*.war' },
  'maven-scattered': { command: 'mvn clean package -DskipTests', artifact: 'target/lib/*.jar' },
  'gradle-jar':      { command: 'gradle clean build -x test',    artifact: 'build/libs/*.jar' },
  'npm-build':       { command: 'npm run build',                 artifact: 'dist/**' },
  'docker-image':    { command: 'docker build .',                artifact: '' },
  'custom-command':  { command: '',                              artifact: '' },
};

function defaultStepConfig(type: string): Record<string, any> {
  switch (type) {
    case 'build':
      return { buildType: 'maven-jar', command: BUILD_PRESETS['maven-jar'].command, artifact: BUILD_PRESETS['maven-jar'].artifact };
    case 'backup':
      return { connectionId: '', strategy: 'copy', remotePath: '', backupDir: '', keepCount: 5 };
    case 'upload':
      return { connectionId: '', mode: 'overwrite', localPath: '', remotePath: '' };
    case 'exec-remote':
      return { connectionId: '', command: '', timeout: 120000 };
    case 'exec-local':
      return { command: '', workDir: '' };
    case 'docker-build':
      return { tag: `${projectName.value || 'app'}:latest`, dockerfile: 'Dockerfile', context: '.' };
    case 'docker-push':
      return { image: '', registry: '' };
    case 'notify':
      return { type: 'webhook', url: '' };
    default:
      return {};
  }
}

function addStep() {
  const type = 'build';
  form.value.steps.push({
    id: `step-${Date.now()}`, type, name: '新步骤',
    config: defaultStepConfig(type),
    enabled: true, continueOnError: false, _jsonMode: false,
  } as FormStep);
}

function onStepTypeChange(step: FormStep) {
  step.config = defaultStepConfig(step.type) as any;
  if (step.type === 'upload') {
    const buildStep = form.value.steps.find((s) => s.type === 'build');
    if (buildStep) (step.config as any).localPath = (buildStep.config as any).artifact || '';
  }
  if (step.type === 'docker-push') {
    const dbStep = form.value.steps.find((s) => s.type === 'docker-build');
    if (dbStep) (step.config as any).image = (dbStep.config as any).tag || '';
  }
}

function onBuildTypeChange(step: FormStep) {
  const preset = BUILD_PRESETS[cfg(step).buildType];
  if (preset) {
    cfg(step).command = preset.command;
    cfg(step).artifact = preset.artifact;
  }
}

function onBackupRemotePathChange(step: FormStep) {
  const rp = cfg(step).remotePath as string;
  if (rp && !cfg(step).backupDir) {
    cfg(step).backupDir = rp.replace(/\/[^/]*$/, '') + '/backups';
  }
}

function addTarget() {
  const idx = form.value.targets.length;
  form.value.targets.push({
    id: `target-${Date.now()}`,
    name: idx === 0 ? '生产' : idx === 1 ? '测试' : `目标${idx + 1}`,
    connectionId: '', remotePath: '', restartScript: 'sh restart.sh',
  });
}

function updateJson(step: PipelineStep, e: Event) {
  try { step.config = JSON.parse((e.target as HTMLTextAreaElement).value); } catch {}
}

function applyTemplate() {
  const tpl = templates.value[form.value.template];
  if (!tpl) return;
  form.value.buildType = tpl.buildType;
  form.value.steps = JSON.parse(JSON.stringify(tpl.steps));
}


async function savePipeline() {
  const data = {
    name: form.value.name, projectDir: form.value.projectDir,
    buildType: form.value.buildType,
    steps: form.value.steps.map(({ _jsonMode, ...s }) => s),
    targets: form.value.targets,
    template: form.value.template || undefined,
  };
  if (editing.value && selectedPipeline.value) await cicdStore.updatePipeline(selectedPipeline.value.id, data);
  else await cicdStore.createPipeline(data);
  dialogVisible.value = false;
  editing.value = false;
}

watch(dialogVisible, async (v) => {
  if (v && !editing.value) {
    const dir = projectDir.value || '';
    form.value = {
      name: projectName.value ? `${projectName.value} 发布` : '',
      projectDir: dir, template: '', buildType: 'maven-jar', steps: [], targets: [],
    };
    detectResult.value = null;
    if (dir) {
      const r = await cicdStore.detectProject(dir);
      if (typeof r !== 'string') {
        detectResult.value = r;
        form.value.template = r.recommendedTemplate;
        form.value.buildType = r.buildType;
        applyTemplate();
      }
    }
  }
});

onMounted(async () => {
  await cicdStore.refresh();
  await cicdStore.refreshTemplates();
  await cicdStore.refreshConnections();
});
</script>

<style scoped>
.cicd-console { display: flex; flex-direction: column; height: 100%; background: var(--glass-bg); color: var(--color-text); font-size: 14px; }
.cicd-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--color-border); }
.header-left { display: flex; align-items: center; gap: 10px; }
.header-left h2 { margin: 0; font-size: 16px; }
.project-tag { padding: 2px 8px; border-radius: var(--radius-sm); background: var(--color-primary); color: #fff; font-size: 12px; }
.cicd-body { display: flex; flex: 1; overflow: hidden; }
.cicd-sidebar { width: 220px; border-right: 1px solid var(--color-border); overflow-y: auto; padding: 6px; }
.sidebar-title { padding: 6px 8px; font-size: 12px; color: var(--color-text-secondary); }
.pipeline-item { padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; margin-bottom: 3px; }
.pipeline-item:hover { background: var(--color-surface-hover); }
.pipeline-item.active { background: var(--color-primary); color: #fff; }
.pipeline-name { font-size: 13px; font-weight: 500; }
.pipeline-meta { display: flex; gap: 4px; margin-top: 3px; font-size: 11px; opacity: 0.7; }
.tag { background: var(--btn-bg); padding: 0 5px; border-radius: 3px; }
.cicd-main { flex: 1; overflow-y: auto; padding: 16px; }
.cicd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; opacity: 0.6; }
.pipeline-detail { max-width: 750px; margin: 0 auto; }
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.detail-header h3 { margin: 0; font-size: 15px; }
.detail-actions { display: flex; gap: 6px; }
.target-selector { margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.target-selector label { font-size: 12px; color: var(--color-text-secondary); }
.target-selector select { padding: 4px 8px; border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); }
.section-title { font-size: 12px; color: var(--color-text-secondary); margin: 12px 0 6px; }
.step-list { display: flex; flex-direction: column; gap: 3px; }
.step-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--color-surface); border: 1px solid var(--color-border); }
.step-item.step-running { border-left: 3px solid var(--color-primary); }
.step-item.step-success { border-left: 3px solid var(--color-success); }
.step-item.step-failed { border-left: 3px solid var(--color-danger); }
.step-index { width: 20px; height: 20px; border-radius: 50%; background: var(--color-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
.step-info { flex: 1; min-width: 0; }
.step-name { font-size: 13px; }
.step-type-badge { font-size: 10px; opacity: 0.6; margin-left: 4px; }
.step-config { font-size: 11px; opacity: 0.5; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-running { color: var(--color-primary); animation: spin 1s linear infinite; }
.status-success { color: var(--color-success); }
.status-failed { color: var(--color-danger); }
@keyframes spin { to { transform: rotate(360deg); } }
.logs-section { margin: 12px 0; }
.log-viewer { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 6px; max-height: 250px; overflow-y: auto; }
.log-block { margin-bottom: 6px; }
.log-header { font-size: 11px; color: var(--color-text-secondary); margin-bottom: 2px; }
.log-content { font-size: 11px; font-family: var(--font-mono); white-space: pre-wrap; margin: 0; color: var(--color-text); }
.history-list { display: flex; flex-direction: column; gap: 3px; }
.history-item { display: flex; gap: 10px; padding: 6px 8px; border-radius: var(--radius-sm); background: var(--color-surface); border: 1px solid var(--color-border); font-size: 12px; }
.run-status { font-weight: 500; }
.run-status.success { color: var(--color-success); }
.run-status.failed { color: var(--color-danger); }
.empty-state { padding: 16px; text-align: center; opacity: 0.5; font-size: 13px; }

/* Dialog content */
.dialog-content { max-height: 70vh; overflow-y: auto; padding-right: 8px; }
.form-row { display: flex; gap: 12px; margin-bottom: 10px; }
.form-item { flex: 1; }
.form-item.full { width: 100%; }
.form-item label { display: block; margin-bottom: 3px; font-size: 12px; color: var(--color-text-secondary); }
.form-item input, .form-item select, .form-item textarea {
  width: 100%; padding: 5px 8px; border-radius: var(--radius-sm);
  background: var(--color-surface); color: var(--color-text);
  border: 1px solid var(--color-border); font-size: 13px; box-sizing: border-box;
}
.form-item input:focus, .form-item select:focus, .form-item textarea:focus {
  outline: none; border-color: var(--color-primary);
}
.form-item textarea { font-family: var(--font-mono); resize: vertical; }
.input-with-btn { display: flex; gap: 4px; }
.input-with-btn input { flex: 1; }
.readonly-input { opacity: 0.7; cursor: not-allowed; background: var(--color-surface-hover) !important; }
.detect-info { padding: 6px 8px; background: var(--color-primary-light); border-radius: var(--radius-sm); font-size: 12px; }
.section-divider { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 8px; font-size: 13px; font-weight: 500; border-top: 1px solid var(--color-border); padding-top: 12px; }

.step-edit-card { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 8px; background: var(--color-surface); }
.step-edit-top { display: flex; gap: 5px; align-items: center; margin-bottom: 8px; }
.step-num { width: 18px; height: 18px; border-radius: 50%; background: var(--color-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; }
.step-type-sel { width: 110px; padding: 3px 6px; border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); font-size: 12px; }
.step-name-inp { flex: 1; padding: 3px 6px; border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); font-size: 12px; }
.step-edit-form { }
.step-edit-json { }
.json-editor { width: 100%; font-family: var(--font-mono); font-size: 11px; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 6px; box-sizing: border-box; resize: vertical; }

.target-edit-card { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 8px; background: var(--color-surface); }

.btn { padding: 5px 12px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); cursor: pointer; font-size: 12px; transition: all var(--motion-fast) var(--ease-out); }
.btn:hover { background: var(--color-surface-hover); }
.btn-primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.btn-primary:hover { background: var(--color-primary-dark); }
.btn-danger { color: var(--color-danger); }
.btn-sm { padding: 2px 7px; font-size: 11px; }
</style>
