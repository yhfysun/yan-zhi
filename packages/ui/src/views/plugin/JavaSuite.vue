<template>
  <div class="java-suite">
    <div class="java-header">
      <h2>Java 开发套件</h2>
      <button class="btn btn-primary" @click="detectProject">检测项目</button>
    </div>

    <div class="java-body">
      <!-- 项目信息 -->
      <div class="panel" v-if="projectInfo">
        <div class="panel-title">项目信息</div>
        <div class="info-grid">
          <div class="info-item"><span class="label">构建工具</span><span class="value">{{ projectInfo.buildTool }}</span></div>
          <div class="info-item"><span class="label">Spring Boot</span><span class="value">{{ projectInfo.isSpringBoot ? '✓' : '✗' }}</span></div>
          <div class="info-item"><span class="label">Java 版本</span><span class="value">{{ projectInfo.javaVersion || '-' }}</span></div>
          <div class="info-item"><span class="label">多模块</span><span class="value">{{ projectInfo.isMultiModule ? '✓' : '✗' }}</span></div>
          <div class="info-item"><span class="label">Lombok</span><span class="value">{{ projectInfo.hasLombok ? '✓' : '✗' }}</span></div>
          <div class="info-item"><span class="label">MyBatis</span><span class="value">{{ projectInfo.hasMybatis ? '✓' : '✗' }}</span></div>
          <div class="info-item"><span class="label">Docker</span><span class="value">{{ projectInfo.hasDockerfile ? '✓' : '✗' }}</span></div>
          <div class="info-item"><span class="label">依赖数</span><span class="value">{{ projectInfo.dependencies.length }}</span></div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="panel">
        <div class="panel-title">快捷操作</div>
        <div class="action-grid">
          <button class="action-btn" @click="execAction('maven', 'clean package -DskipTests')">📦 打包</button>
          <button class="action-btn" @click="execAction('maven', 'clean compile')">🔨 编译</button>
          <button class="action-btn" @click="execAction('maven', 'test')">🧪 测试</button>
          <button class="action-btn" @click="execAction('maven', 'dependency:tree')">🌳 依赖树</button>
          <button class="action-btn" @click="analyzeSpring">🌸 Spring 分析</button>
          <button class="action-btn" @click="analyzeMyBatis">📋 MyBatis 分析</button>
          <button class="action-btn" @click="formatCode">✨ 格式化</button>
          <button class="action-btn" @click="listTests">📋 测试列表</button>
        </div>
      </div>

      <!-- 执行输出 -->
      <div class="panel" v-if="output">
        <div class="panel-title">
          执行结果
          <span class="output-status" :class="outputStatus">{{ outputStatus }}</span>
        </div>
        <pre class="output-content">{{ output }}</pre>
      </div>

      <!-- Spring 分析结果 -->
      <div class="panel" v-if="springResult">
        <div class="panel-title">Spring Boot 分析</div>
        <div class="sub-section">
          <div class="sub-title">Beans ({{ springResult.beans.length }})</div>
          <div class="bean-list">
            <div v-for="b in springResult.beans" :key="b.className" class="bean-item">
              <span class="bean-type" :class="b.type">{{ b.type }}</span>
              <span class="bean-name">{{ b.className }}</span>
            </div>
          </div>
        </div>
        <div class="sub-section">
          <div class="sub-title">Endpoints ({{ springResult.endpoints.length }})</div>
          <div class="endpoint-list">
            <div v-for="(e, i) in springResult.endpoints" :key="i" class="endpoint-item">
              <span class="http-method" :class="e.method">{{ e.method }}</span>
              <span class="endpoint-path">{{ e.path }}</span>
              <span class="endpoint-handler">{{ e.className }}.{{ e.handler }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../../api/client';
import { useCodeStore } from '../../stores/code';

const codeStore = useCodeStore();
const projectInfo = ref<any>(null);
const output = ref('');
const outputStatus = ref('');
const springResult = ref<any>(null);

function getProjectDir(): string {
  return codeStore.projectDir || '';
}

async function detectProject() {
  const dir = getProjectDir();
  if (!dir) { output.value = '请先在代码模式中打开项目目录'; return; }
  const res = await api.post('/plugin/java-suite/tools', {
    tool: 'java_detect_project',
    args: { dir },
  });
  if ('error' in res) { output.value = res.error; return; }
  projectInfo.value = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
}

async function execAction(tool: string, args: string) {
  const dir = getProjectDir();
  if (!dir) { output.value = '请先在代码模式中打开项目目录'; return; }
  output.value = '执行中...';
  outputStatus.value = 'running';
  springResult.value = null;
  const toolMap: Record<string, string> = {
    maven: 'maven_exec',
    gradle: 'gradle_exec',
  };
  const toolName = toolMap[tool] || tool;
  const res = await api.post('/plugin/java-suite/tools', {
    tool: toolName,
    args: { dir, goals: args, tasks: args },
  });
  if ('error' in res) { output.value = res.error; outputStatus.value = 'failed'; return; }
  output.value = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
  outputStatus.value = output.value.includes('[exit=0]') ? 'success' : 'failed';
}

async function analyzeSpring() {
  const dir = getProjectDir();
  if (!dir) return;
  const res = await api.post('/plugin/java-suite/tools', {
    tool: 'spring_analyze',
    args: { dir },
  });
  if ('error' in res) { output.value = res.error; return; }
  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  springResult.value = data;
  output.value = `Beans: ${data.beanCount}, Endpoints: ${data.endpointCount}`;
  outputStatus.value = 'success';
}

async function analyzeMyBatis() {
  await execAction('mybatis_analyze_mappers', '');
}

async function formatCode() {
  const dir = getProjectDir();
  if (!dir) return;
  const res = await api.post('/plugin/java-suite/tools', {
    tool: 'java_format',
    args: { dir },
  });
  if ('error' in res) { output.value = res.error; return; }
  output.value = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  outputStatus.value = 'success';
}

async function listTests() {
  const dir = getProjectDir();
  if (!dir) return;
  const res = await api.post('/plugin/java-suite/tools', {
    tool: 'java_test_list',
    args: { dir },
  });
  if ('error' in res) { output.value = res.error; return; }
  output.value = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
  outputStatus.value = 'success';
}

onMounted(() => {
  if (getProjectDir()) detectProject();
});
</script>

<style scoped>
.java-suite {
  display: flex; flex-direction: column; height: 100%;
  background: var(--glass-bg); color: var(--color-text);
}
.java-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 20px; border-bottom: 1px solid var(--color-border);
}
.java-header h2 { margin: 0; font-size: 18px; }
.java-body { flex: 1; overflow-y: auto; padding: 20px; max-width: 900px; margin: 0 auto; width: 100%; }

.panel {
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16px;
  margin-bottom: 16px;
}
.panel-title { font-size: 14px; font-weight: 500; margin-bottom: 12px; }

.info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-item .label { font-size: 11px; color: var(--color-text-secondary); }
.info-item .value { font-size: 14px; }

.action-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.action-btn {
  padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text); cursor: pointer; font-size: 13px;
  transition: all var(--motion-fast) var(--ease-out);
}
.action-btn:hover { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }

.output-status { font-size: 11px; margin-left: 8px; padding: 1px 6px; border-radius: 3px; }
.output-status.success { color: var(--color-success); }
.output-status.failed { color: var(--color-danger); }
.output-status.running { color: var(--color-primary); }
.output-content {
  font-size: 12px; font-family: var(--font-mono); white-space: pre-wrap;
  max-height: 400px; overflow-y: auto; margin: 0; color: var(--color-text);
  background: var(--color-surface); border: 1px solid var(--color-border); padding: 8px; border-radius: var(--radius-sm);
}

.sub-section { margin-bottom: 12px; }
.sub-title { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 6px; }
.bean-list, .endpoint-list { display: flex; flex-direction: column; gap: 4px; }
.bean-item, .endpoint-item { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.bean-type { padding: 1px 6px; border-radius: 3px; font-size: 11px; }
.bean-type.controller { background: rgba(194, 65, 12, 0.12); color: var(--color-primary); }
.bean-type.service { background: rgba(47, 107, 79, 0.12); color: var(--color-success); }
.bean-type.repository { background: rgba(180, 83, 9, 0.12); color: var(--color-warning); }
.bean-type.component { background: var(--btn-bg); color: var(--color-text-secondary); }
.bean-type.configuration { background: rgba(185, 28, 28, 0.12); color: var(--color-danger); }
.http-method { padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; }
.http-method.GET { background: rgba(47, 107, 79, 0.12); color: var(--color-success); }
.http-method.POST { background: rgba(194, 65, 12, 0.12); color: var(--color-primary); }
.http-method.PUT { background: rgba(180, 83, 9, 0.12); color: var(--color-warning); }
.http-method.DELETE { background: rgba(185, 28, 28, 0.12); color: var(--color-danger); }
.endpoint-path { font-family: var(--font-mono); }
.endpoint-handler { color: var(--color-text-tertiary); font-size: 12px; }

.btn {
  padding: 6px 14px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text); cursor: pointer; font-size: 13px;
  transition: all var(--motion-fast) var(--ease-out);
}
.btn:hover { background: var(--color-surface-hover); }
.btn-primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.btn-primary:hover { background: var(--color-primary-dark); }
</style>