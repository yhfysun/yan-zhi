// cicd-pipeline 插件：本地一键发布（打包 → 备份 → 上传 → 重启）
// 复用 ops-shell 的 SSH/SFTP 连接池与文件传输能力。
// 对外提供：
//   - 后端路由（/api/plugin/cicd-pipeline/*）：流水线 CRUD、执行（SSE 进度推送）、模板、项目检测
//   - 插件工具（plugin_cicd-pipeline__*）：供 CICD 智能体在对话中创建/执行/查看流水线
import type { BuiltInTool, McpCallResult, PluginManifest, PluginModule, PluginStorage } from '@yan-zhi/core';
import type {
  CicdPipeline,
  CicdRun,
  PipelineStep,
  StepResult,
  DeployTarget,
  BuildStepConfig,
  BackupStepConfig,
  UploadStepConfig,
  ExecRemoteStepConfig,
  ExecLocalStepConfig,
  DockerBuildStepConfig,
  DockerPushStepConfig,
  NotifyStepConfig,
  CustomStepConfig,
  PipelineTemplate,
  ProjectDetectResult,
  ProgressEvent,
  StepStatus,
  RunStatus,
  BuildType,
} from '@yan-zhi/shared';
import { execFile } from 'node:child_process';
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, basename, dirname, relative } from 'node:path';
import {
  loadConnections,
  getSsh,
  execOnConnection,
  getSftp,
  sftpFastPut,
  ensureRemoteDir,
  backupRemoteName,
  collectLocalFiles,
  type StoredConnection,
} from './ops-shell.js';
import type { SFTPWrapper } from 'ssh2';

export const CICD_PLUGIN_ID = 'cicd-pipeline';

// ============================================================
// 插件清单
// ============================================================
export const cicdManifest: PluginManifest = {
  id: CICD_PLUGIN_ID,
  name: 'CI/CD 流水线',
  version: '1.0.0',
  category: '功能',
  description:
    '本地一键发布：打包 → 备份 → 上传 → 重启。支持 JAR 包/散包/Docker/直接运行四种部署模式，复用运维插件的 SSH 连接。对话中可让发布助手自动创建和执行发布流程。',
  permissions: ['fs', 'shell', 'remote-shell', 'network'],
  kind: 'code',
  contributes: {
    tools: [
      'cicd_list_pipelines',
      'cicd_create_pipeline',
      'cicd_update_pipeline',
      'cicd_delete_pipeline',
      'cicd_run_pipeline',
      'cicd_list_runs',
      'cicd_get_run',
      'cicd_detect_project',
      'cicd_list_templates',
    ],

    routes: [
      { path: '/cicd', name: 'cicd', component: 'views/plugin/CicdConsole.vue', meta: { desktopOnly: true } },
    ],
  },
  config: {
    type: 'object',
    properties: {
      defaultTimeoutMs: { type: 'number', description: '构建/上传默认超时（ms）', default: 300000 },
      maxLogLength: { type: 'number', description: '单步骤日志最大长度', default: 50000 },
    },
  },
};

// ============================================================
// 插件存储引用（activate 时注入）
// ============================================================
let storage: PluginStorage | null = null;
const PIPELINES_KEY = 'pipelines';
const RUNS_KEY = 'runs';

// ============================================================
// 流水线持久化（plugin_storage JSON）
// ============================================================
async function loadPipelines(): Promise<CicdPipeline[]> {
  if (!storage) return [];
  const list = await storage.get<CicdPipeline[]>(PIPELINES_KEY);
  return Array.isArray(list) ? list : [];
}

async function savePipelines(list: CicdPipeline[]): Promise<void> {
  if (!storage) throw new Error('CICD 插件存储未初始化');
  await storage.set(PIPELINES_KEY, list);
}

async function loadRuns(): Promise<CicdRun[]> {
  if (!storage) return [];
  const list = await storage.get<CicdRun[]>(RUNS_KEY);
  return Array.isArray(list) ? list : [];
}

async function saveRuns(list: CicdRun[]): Promise<void> {
  if (!storage) throw new Error('CICD 插件存储未初始化');
  // 只保留最近 100 条运行记录
  const trimmed = list.slice(-100);
  await storage.set(RUNS_KEY, trimmed);
}

// ============================================================
// 预设模板
// ============================================================
function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function step(
  type: PipelineStep['type'],
  name: string,
  config: PipelineStep['config'],
): PipelineStep {
  return { id: makeId('step'), type, name, config, enabled: true, continueOnError: false };
}

export const PIPELINE_TEMPLATES: Record<string, PipelineTemplate> = {
  'jar-deploy': {
    name: 'JAR 包发布',
    description: 'Maven 打包 → 备份旧包 → 上传新包 → 重启服务',
    buildType: 'maven-jar',
    steps: [
      step('build', 'Maven 打包', {
        buildType: 'maven-jar',
        command: 'mvn clean package -DskipTests',
        artifact: 'target/*.jar',
      } as BuildStepConfig),
      step('backup', '备份当前版本', {
        connectionId: '',
        remotePath: '',
        backupDir: '',
        strategy: 'copy',
        keepCount: 5,
      } as BackupStepConfig),
      step('upload', '上传 JAR 包', {
        connectionId: '',
        localPath: '',
        remotePath: '',
        mode: 'overwrite',
      } as UploadStepConfig),
      step('exec-remote', '重启服务', {
        connectionId: '',
        command: 'sh restart.sh',
      } as ExecRemoteStepConfig),
    ],
  },
  'scattered-deploy': {
    name: '散包增量发布',
    description: 'Maven 打包 → 备份 → 增量上传变化的 JAR 包 → 重启服务',
    buildType: 'maven-scattered',
    steps: [
      step('build', 'Maven 打包（散包）', {
        buildType: 'maven-scattered',
        command: 'mvn clean package -DskipTests',
        artifact: 'target/lib/*.jar',
      } as BuildStepConfig),
      step('backup', '备份当前版本', {
        connectionId: '',
        remotePath: '',
        backupDir: '',
        strategy: 'tar',
        keepCount: 3,
      } as BackupStepConfig),
      step('upload', '增量上传 JAR 包', {
        connectionId: '',
        localPath: '',
        remotePath: '',
        mode: 'incremental',
      } as UploadStepConfig),
      step('exec-remote', '重启服务', {
        connectionId: '',
        command: 'sh restart.sh',
      } as ExecRemoteStepConfig),
    ],
  },
  'docker-deploy': {
    name: 'Docker 镜像发布',
    description: '构建镜像 → 推送 → 远程拉取并重启容器',
    buildType: 'docker-image',
    steps: [
      step('docker-build', '构建 Docker 镜像', {
        context: '.',
        tag: '${projectName}:${version}',
      } as DockerBuildStepConfig),
      step('docker-push', '推送镜像', {
        image: '',
      } as DockerPushStepConfig),
      step('exec-remote', '拉取并重启', {
        connectionId: '',
        command: 'docker pull ${tag} && docker-compose up -d --force-recreate',
      } as ExecRemoteStepConfig),
    ],
  },
  'direct-run': {
    name: '直接运行',
    description: '打包 → 备份 → 上传 → 停旧进程 → 启新进程',
    buildType: 'custom-command',
    steps: [
      step('build', '打包', {
        buildType: 'custom-command',
        command: '',
        artifact: '',
      } as BuildStepConfig),
      step('backup', '备份', {
        connectionId: '',
        remotePath: '',
        backupDir: '',
        strategy: 'copy',
        keepCount: 3,
      } as BackupStepConfig),
      step('upload', '上传', {
        connectionId: '',
        localPath: '',
        remotePath: '',
        mode: 'overwrite',
      } as UploadStepConfig),
      step('exec-remote', '停止旧进程', {
        connectionId: '',
        command: 'kill $(cat app.pid) 2>/dev/null || true',
      } as ExecRemoteStepConfig),
      step('exec-remote', '启动新进程', {
        connectionId: '',
        command: 'nohup java -jar app.jar > app.log 2>&1 & echo $! > app.pid',
      } as ExecRemoteStepConfig),
    ],
  },
  'fullstack-deploy': {
    name: '前后端全量发布',
    description: '前端构建 → 上传前端 → 后端打包 → 备份 → 上传后端 → 重启',
    buildType: 'maven-jar',
    steps: [
      step('build', '前端构建', {
        buildType: 'npm-build',
        command: 'npm run build',
        artifact: 'dist/',
      } as BuildStepConfig),
      step('upload', '上传前端资源', {
        connectionId: '',
        localPath: 'dist/',
        remotePath: '/data/nginx/html/',
        mode: 'overwrite',
      } as UploadStepConfig),
      step('build', '后端打包', {
        buildType: 'maven-jar',
        command: 'mvn clean package -DskipTests',
        artifact: 'target/*.jar',
      } as BuildStepConfig),
      step('backup', '备份后端', {
        connectionId: '',
        remotePath: '',
        backupDir: '',
        strategy: 'copy',
        keepCount: 5,
      } as BackupStepConfig),
      step('upload', '上传后端', {
        connectionId: '',
        localPath: '',
        remotePath: '',
        mode: 'overwrite',
      } as UploadStepConfig),
      step('exec-remote', '重启后端', {
        connectionId: '',
        command: 'sh restart.sh',
      } as ExecRemoteStepConfig),
    ],
  },
};

// ============================================================
// 项目类型检测
// ============================================================
export function detectProject(projectDir: string): ProjectDetectResult {
  const has = (f: string) => existsSync(join(projectDir, f));
  const hasPomXml = has('pom.xml');
  const hasGradle = has('build.gradle') || has('build.gradle.kts');
  const hasPackageJson = has('package.json');
  const hasDockerfile = has('Dockerfile') || has('docker-compose.yml');

  let isSpringBoot = false;
  if (hasPomXml) {
    try {
      const pom = readFileSync(join(projectDir, 'pom.xml'), 'utf8');
      isSpringBoot = /spring-boot-starter/.test(pom);
    } catch {}
  }

  let buildTool: ProjectDetectResult['buildTool'] = 'unknown';
  let buildType: BuildType = 'custom-command';
  let recommendedTemplate = 'jar-deploy';

  if (hasPomXml) {
    buildTool = 'maven';
    if (isSpringBoot) {
      buildType = 'maven-jar';
      recommendedTemplate = 'jar-deploy';
    } else {
      buildType = 'maven-scattered';
      recommendedTemplate = 'scattered-deploy';
    }
  } else if (hasGradle) {
    buildTool = 'gradle';
    buildType = 'gradle-jar';
    recommendedTemplate = 'jar-deploy';
  } else if (hasPackageJson) {
    buildTool = 'npm';
    buildType = 'npm-build';
    recommendedTemplate = 'jar-deploy';
  }

  if (hasDockerfile) {
    buildType = 'docker-image';
    recommendedTemplate = 'docker-deploy';
  }

  return {
    buildType,
    buildTool,
    hasDockerfile,
    hasPomXml,
    hasGradle,
    hasPackageJson,
    isSpringBoot,
    recommendedTemplate,
  };
}

// ============================================================
// 连接查找（从 ops-shell 连接列表中按 ID 查找）
// ============================================================
async function findConnection(connectionId: string): Promise<StoredConnection> {
  const conns = await loadConnections();
  const conn = conns.find((c) => c.id === connectionId);
  if (!conn) throw new Error(`SSH 连接不存在: ${connectionId}（请在运维控制台创建连接）`);
  return conn;
}

// ============================================================
// 变量插值
// ============================================================
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

// ============================================================
// 本地命令执行
// ============================================================
function runLocal(
  command: string,
  workDir: string,
  env: Record<string, string> | undefined,
  timeoutMs: number,
  onLog: (line: string) => void,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolvePromise) => {
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    let stdout = '';
    let stderr = '';
    let code: number | null = null;
    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      resolvePromise({ stdout, stderr: stderr + '\n[超时]', code: -1 });
    }, timeoutMs);

    const proc = execFile(cmd, args, {
      cwd: workDir,
      env: { ...process.env, ...env },
      maxBuffer: 10 * 1024 * 1024,
      shell: true,
    }, (err, out, errOut) => {
      clearTimeout(timer);
      stdout = out || '';
      stderr = errOut || '';
      code = err ? (err as { code?: number }).code ?? 1 : 0;
      if (stdout) onLog(stdout);
      if (stderr) onLog(stderr);
      resolvePromise({ stdout, stderr, code });
    });
  });
}

// ============================================================
// 通配符展开（target/*.jar）
// ============================================================
function expandArtifact(pattern: string, workDir: string): string[] {
  const abs = resolve(workDir, pattern);
  if (existsSync(abs) && statSync(abs).isFile()) return [abs];
  // 通配符
  const dir = dirname(abs);
  const base = basename(abs);
  if (!existsSync(dir)) return [];
  if (base.includes('*')) {
    const regex = new RegExp('^' + base.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
    return readdirSync(dir)
      .filter((f) => regex.test(f))
      .map((f) => join(dir, f))
      .filter((f) => statSync(f).isFile());
  }
  return [];
}

// ============================================================
// PipelineExecutor：流水线执行引擎
// ============================================================
export class PipelineExecutor {
  private activeRuns = new Map<string, boolean>(); // runId → cancelled?

  async execute(
    pipeline: CicdPipeline,
    target: DeployTarget,
    triggeredBy: string,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<CicdRun> {
    const runId = makeId('run');
    const run: CicdRun = {
      id: runId,
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      targetId: target.id,
      targetName: target.name,
      status: 'running',
      startedAt: Date.now(),
      stepResults: [],
      triggeredBy,
      logs: [],
    };
    this.activeRuns.set(runId, false);

    const vars: Record<string, string> = {
      projectName: pipeline.name,
      version: Date.now().toString(),
      ...target.env,
    };

    // preBuild 钩子
    if (pipeline.preBuild) {
      onProgress({ runId, type: 'step-log', log: `[preBuild] ${pipeline.preBuild}`, timestamp: Date.now() });
      await runLocal(pipeline.preBuild, pipeline.projectDir, undefined, 60000, () => {});
    }

    for (const step of pipeline.steps) {
      if (!step.enabled) {
        run.stepResults.push({ stepId: step.id, stepName: step.name, status: 'skipped' });
        continue;
      }
      if (this.activeRuns.get(runId)) {
        run.status = 'cancelled';
        break;
      }

      const stepStart = Date.now();
      onProgress({ runId, type: 'step-start', stepId: step.id, stepName: step.name, timestamp: stepStart });

      let stepStatus: StepStatus = 'success';
      let stepOutput = '';
      let stepError = '';
      const logChunks: string[] = [];
      const onLog = (line: string) => {
        logChunks.push(line);
        onProgress({ runId, type: 'step-log', stepId: step.id, log: line, timestamp: Date.now() });
      };

      try {
        const result = await this.executeStep(step, target, pipeline.projectDir, vars, onLog);
        stepOutput = result.output || '';
        stepStatus = result.status;
      } catch (e) {
        stepError = (e as Error).message;
        stepStatus = 'failed';
        onLog(`[错误] ${stepError}`);
      }

      const duration = Date.now() - stepStart;
      const stepResult: StepResult = {
        stepId: step.id,
        stepName: step.name,
        status: stepStatus,
        startedAt: stepStart,
        finishedAt: Date.now(),
        duration,
        output: stepOutput,
        error: stepError,
      };
      run.stepResults.push(stepResult);
      run.logs.push({
        stepId: step.id,
        stepName: step.name,
        log: logChunks.join('\n'),
        status: stepStatus,
        duration,
      });

      onProgress({
        runId,
        type: 'step-finish',
        stepId: step.id,
        stepName: step.name,
        status: stepStatus,
        duration,
        timestamp: Date.now(),
      });

      if (stepStatus === 'failed' && !step.continueOnError) {
        run.status = 'failed';
        break;
      }
    }

    if (run.status === 'running') {
      // postDeploy 钩子
      if (pipeline.postDeploy) {
        await runLocal(pipeline.postDeploy, pipeline.projectDir, undefined, 60000, () => {});
      }
      run.status = run.stepResults.every((r) => r.status === 'success' || r.status === 'skipped')
        ? 'success'
        : 'failed';
    }

    run.finishedAt = Date.now();
    run.currentStep = undefined;
    this.activeRuns.delete(runId);

    onProgress({
      runId,
      type: 'run-finish',
      status: run.status,
      timestamp: Date.now(),
    });

    // 持久化运行记录
    const runs = await loadRuns();
    runs.push(run);
    await saveRuns(runs);

    return run;
  }

  cancel(runId: string): void {
    this.activeRuns.set(runId, true);
  }

  private async executeStep(
    step: PipelineStep,
    target: DeployTarget,
    projectDir: string,
    vars: Record<string, string>,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    switch (step.type) {
      case 'build':
        return await this.execBuild(step.config as BuildStepConfig, projectDir, vars, onLog);
      case 'backup':
        return await this.execBackup(step.config as BackupStepConfig, target, onLog);
      case 'upload':
        return await this.execUpload(step.config as UploadStepConfig, target, projectDir, vars, onLog);
      case 'exec-remote':
        return await this.execRemote(step.config as ExecRemoteStepConfig, target, vars, onLog);
      case 'exec-local':
        return await this.execLocal(step.config as ExecLocalStepConfig, projectDir, onLog);
      case 'docker-build':
        return await this.execDockerBuild(step.config as DockerBuildStepConfig, projectDir, vars, onLog);
      case 'docker-push':
        return await this.execDockerPush(step.config as DockerPushStepConfig, onLog);
      case 'notify':
        return await this.execNotify(step.config as NotifyStepConfig, onLog);
      case 'custom':
        return await this.execCustom(step.config as CustomStepConfig, projectDir, onLog);
      default:
        return { output: '未知步骤类型', status: 'failed' };
    }
  }

  /** 打包：本地执行构建命令 */
  private async execBuild(
    config: BuildStepConfig,
    projectDir: string,
    vars: Record<string, string>,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    const workDir = config.workDir ? resolve(projectDir, config.workDir) : projectDir;
    const cmd = config.command || this.defaultBuildCommand(config.buildType);
    const fullCmd = config.preCommand ? `${config.preCommand} && ${cmd}` : cmd;
    onLog(`[build] ${fullCmd} (cwd: ${workDir})`);
    const r = await runLocal(fullCmd, workDir, config.env, 600000, onLog);
    if (r.code !== 0) return { output: r.stdout + r.stderr, status: 'failed' };
    // 验证产物
    const artifacts = expandArtifact(config.artifact, workDir);
    if (artifacts.length === 0 && config.artifact) {
      onLog(`[warn] 未找到构建产物: ${config.artifact}`);
    } else {
      onLog(`[build] 产物: ${artifacts.join(', ')}`);
      vars.__artifacts = artifacts.join(',');
    }
    return { output: r.stdout, status: 'success' };
  }

  private defaultBuildCommand(buildType: BuildType): string {
    switch (buildType) {
      case 'maven-jar':
      case 'maven-war':
      case 'maven-scattered':
        return 'mvn clean package -DskipTests';
      case 'gradle-jar':
        return 'gradle clean build -x test';
      case 'npm-build':
        return 'npm run build';
      case 'docker-image':
        return 'docker build -t app:latest .';
      default:
        return 'echo "no build command"';
    }
  }

  /** 备份：远程 SSH cp/tar */
  private async execBackup(
    config: BackupStepConfig,
    target: DeployTarget,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    const connId = config.connectionId || target.connectionId;
    const conn = await findConnection(connId);
    const remotePath = config.remotePath || target.remotePath;
    const backupDir = config.backupDir || `${dirname(remotePath)}/backups`;
    const ts = new Date();
    const backupName = config.nameTemplate
      ? interpolate(config.nameTemplate, { name: basename(remotePath), timestamp: ts.toISOString() })
      : backupRemoteName(basename(remotePath), ts);

    // 确保备份目录存在
    await execOnConnection(conn, `mkdir -p ${backupDir}`, 10000);

    let cmd: string;
    if (config.strategy === 'tar') {
      cmd = `tar -czf ${backupDir}/${backupName}.tar.gz -C ${dirname(remotePath)} ${basename(remotePath)} 2>/dev/null || true`;
    } else if (config.strategy === 'mv') {
      cmd = `mv ${remotePath} ${backupDir}/${backupName} 2>/dev/null || true`;
    } else {
      cmd = `cp -r ${remotePath} ${backupDir}/${backupName} 2>/dev/null || true`;
    }
    onLog(`[backup] ${cmd}`);
    const r = await execOnConnection(conn, cmd, 60000);
    onLog(r.stdout || r.stderr || '[backup] done');

    // 滚动清理旧备份
    const cleanCmd = `ls -t ${backupDir}/*.bak-* ${backupDir}/*.tar.gz 2>/dev/null | tail -n +${config.keepCount + 1} | xargs rm -f 2>/dev/null || true`;
    await execOnConnection(conn, cleanCmd, 10000);

    return { output: r.stdout, status: r.code === 0 ? 'success' : 'failed' };
  }

  /** 上传：SFTP put（支持增量） */
  private async execUpload(
    config: UploadStepConfig,
    target: DeployTarget,
    projectDir: string,
    vars: Record<string, string>,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    const connId = config.connectionId || target.connectionId;
    const conn = await findConnection(connId);
    const localPath = resolve(projectDir, interpolate(config.localPath, vars));
    const remotePath = interpolate(config.remotePath || target.remotePath, vars);

    if (!existsSync(localPath)) {
      return { output: `本地文件不存在: ${localPath}`, status: 'failed' };
    }

    const sftp = await getSftp(conn);
    await ensureRemoteDir(sftp, remotePath);

    if (statSync(localPath).isDirectory()) {
      // 目录上传
      const files = collectLocalFiles(localPath);
      onLog(`[upload] ${files.length} 个文件 → ${remotePath}`);
      let uploaded = 0;
      for (const f of files) {
        const dest = `${remotePath.replace(/\/+$/, '')}/${f.rel.replace(/\\/g, '/')}`;
        await ensureRemoteDir(sftp, dirname(dest));
        if (config.mode === 'incremental') {
          // 增量：对比 mtime，跳过未变化的
          try {
            const remoteStat = await sftpStat(sftp, dest);
            if (remoteStat && remoteStat.mtime >= Math.floor(statSync(f.abs).mtimeMs / 1000)) {
              continue;
            }
          } catch {}
        }
        await new Promise<void>((resolveP, reject) => {
          sftp.fastPut(f.abs, dest, (err) => (err ? reject(err) : resolveP()));
        });
        uploaded++;
        if (uploaded % 10 === 0) onLog(`[upload] 已上传 ${uploaded}/${files.length}`);
      }
      onLog(`[upload] 完成: ${uploaded}/${files.length} 个文件`);
    } else {
      // 单文件上传
      onLog(`[upload] ${localPath} → ${remotePath}`);
      const dest = remotePath.endsWith('/') ? `${remotePath}${basename(localPath)}` : remotePath;
      await new Promise<void>((resolveP, reject) => {
        sftp.fastPut(localPath, dest, (err) => (err ? reject(err) : resolveP()));
      });
      onLog('[upload] done');
    }

    if (config.chmod) {
      const conn2 = await getSsh(conn);
      const { sshExec } = await import('./ops-shell.js');
      await sshExec(conn2, `chmod ${config.chmod} ${remotePath}`, 10000);
    }

    return { output: 'upload done', status: 'success' };
  }

  /** 远程执行：SSH exec */
  private async execRemote(
    config: ExecRemoteStepConfig,
    target: DeployTarget,
    vars: Record<string, string>,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    const connId = config.connectionId || target.connectionId;
    const conn = await findConnection(connId);
    const cmd = interpolate(config.command, { ...vars, restartScript: target.restartScript });
    const workDir = config.workDir || target.remotePath;
    const fullCmd = workDir ? `cd ${workDir} && ${cmd}` : cmd;
    onLog(`[remote] ${fullCmd}`);
    const r = await execOnConnection(conn, fullCmd, config.timeout || 120000);
    if (r.stdout) onLog(r.stdout);
    if (r.stderr) onLog(r.stderr);
    return { output: r.stdout, status: r.code === 0 ? 'success' : 'failed' };
  }

  /** 本地执行 */
  private async execLocal(
    config: ExecLocalStepConfig,
    projectDir: string,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    const workDir = config.workDir ? resolve(projectDir, config.workDir) : projectDir;
    onLog(`[local] ${config.command} (cwd: ${workDir})`);
    const r = await runLocal(config.command, workDir, config.env, config.timeout || 60000, onLog);
    return { output: r.stdout, status: r.code === 0 ? 'success' : 'failed' };
  }

  /** Docker 构建 */
  private async execDockerBuild(
    config: DockerBuildStepConfig,
    projectDir: string,
    vars: Record<string, string>,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    const tag = interpolate(config.tag, vars);
    const dockerfile = config.dockerfile || 'Dockerfile';
    const context = config.context || '.';
    const buildArgs = config.buildArgs
      ? Object.entries(config.buildArgs).map(([k, v]) => `--build-arg ${k}=${v}`).join(' ')
      : '';
    const cmd = `docker build -t ${tag} -f ${dockerfile} ${buildArgs} ${context}`;
    onLog(`[docker-build] ${cmd}`);
    const r = await runLocal(cmd, projectDir, undefined, 600000, onLog);
    return { output: r.stdout, status: r.code === 0 ? 'success' : 'failed' };
  }

  /** Docker 推送 */
  private async execDockerPush(
    config: DockerPushStepConfig,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    const image = config.registry ? `${config.registry}/${config.image}` : config.image;
    const cmd = `docker push ${image}`;
    onLog(`[docker-push] ${cmd}`);
    const r = await runLocal(cmd, process.cwd(), undefined, 600000, onLog);
    return { output: r.stdout, status: r.code === 0 ? 'success' : 'failed' };
  }

  /** 通知 */
  private async execNotify(
    config: NotifyStepConfig,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    onLog(`[notify] ${config.type} → ${config.url}`);
    try {
      const resp = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: config.template || '部署完成' }),
      });
      return { output: `notify ${resp.status}`, status: resp.ok ? 'success' : 'failed' };
    } catch (e) {
      return { output: (e as Error).message, status: 'failed' };
    }
  }

  /** 自定义步骤 */
  private async execCustom(
    config: CustomStepConfig,
    projectDir: string,
    onLog: (line: string) => void,
  ): Promise<{ output: string; status: StepStatus }> {
    const workDir = config.workDir ? resolve(projectDir, config.workDir) : projectDir;
    onLog(`[custom] ${config.command}`);
    const r = await runLocal(config.command, workDir, config.env, 300000, onLog);
    return { output: r.stdout, status: r.code === 0 ? 'success' : 'failed' };
  }
}

// SFTP stat 辅助
async function sftpStat(sftp: SFTPWrapper, path: string): Promise<{ mtime: number } | null> {
  return new Promise((resolveP) => {
    sftp.stat(path, (err, stats) => {
      if (err) resolveP(null);
      else resolveP({ mtime: stats.mtime });
    });
  });
}

// ============================================================
// 工具定义（供 CICD 智能体使用）
// ============================================================
function textResult(text: string): McpCallResult {
  return { content: [{ type: 'text' as const, text }] } as McpCallResult;
}

export function makeCicdTools(): BuiltInTool[] {
  return [
    {
      name: 'cicd_list_pipelines',
      description: '列出所有 CI/CD 流水线（可选按项目目录过滤）',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string', description: '项目目录（可选过滤）' },
        },
      },
      execute: async (args) => {
        const list = await loadPipelines();
        const filtered = args.projectDir
          ? list.filter((p) => p.projectDir === String(args.projectDir))
          : list;
        return textResult(JSON.stringify(filtered.map((p) => ({
          id: p.id, name: p.name, projectDir: p.projectDir,
          buildType: p.buildType, steps: p.steps.length, targets: p.targets.length,
        })), null, 2));
      },
    },
    {
      name: 'cicd_create_pipeline',
      description: '创建 CI/CD 流水线。需要指定名称、项目目录、构建类型、步骤和部署目标。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '流水线名称' },
          projectDir: { type: 'string', description: '项目目录（绝对路径）' },
          buildType: { type: 'string', description: '构建类型: maven-jar/maven-scattered/gradle-jar/npm-build/docker-image/custom-command' },
          template: { type: 'string', description: '预设模板 ID（可选，使用模板则 steps 可省略）: jar-deploy/scattered-deploy/docker-deploy/direct-run/fullstack-deploy' },
          steps: { type: 'array', description: '步骤列表（JSON 数组，不传则用模板）' },
          targets: { type: 'array', description: '部署目标列表（JSON 数组）' },
        },
        required: ['name', 'projectDir'],
      },
      execute: async (args) => {
        const now = Date.now();
        let steps = args.steps as PipelineStep[] | undefined;
        let buildType = args.buildType as BuildType | undefined;

        if (args.template && PIPELINE_TEMPLATES[args.template as string]) {
          const tpl = PIPELINE_TEMPLATES[args.template as string];
          if (!steps) steps = tpl.steps;
          if (!buildType) buildType = tpl.buildType;
        }
        if (!steps) steps = [];
        if (!buildType) buildType = 'custom-command';

        const pipeline: CicdPipeline = {
          id: makeId('pipeline'),
          name: String(args.name),
          projectDir: String(args.projectDir),
          buildType,
          steps,
          targets: (args.targets as DeployTarget[]) || [],
          trigger: 'manual',
          createdAt: now,
          updatedAt: now,
        };
        const list = await loadPipelines();
        list.push(pipeline);
        await savePipelines(list);
        return textResult(`流水线已创建: ${pipeline.id} (${pipeline.name})`);
      },
    },
    {
      name: 'cicd_update_pipeline',
      description: '更新 CI/CD 流水线（步骤、目标、名称等）',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '流水线 ID' },
          name: { type: 'string' },
          steps: { type: 'array' },
          targets: { type: 'array' },
        },
        required: ['id'],
      },
      execute: async (args) => {
        const list = await loadPipelines();
        const p = list.find((x) => x.id === args.id);
        if (!p) return textResult('流水线不存在');
        if (args.name) p.name = String(args.name);
        if (args.steps) p.steps = args.steps as PipelineStep[];
        if (args.targets) p.targets = args.targets as DeployTarget[];
        p.updatedAt = Date.now();
        await savePipelines(list);
        return textResult(`流水线已更新: ${p.id}`);
      },
    },
    {
      name: 'cicd_delete_pipeline',
      description: '删除 CI/CD 流水线',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      execute: async (args) => {
        const list = await loadPipelines();
        const filtered = list.filter((p) => p.id !== args.id);
        await savePipelines(filtered);
        return textResult(`已删除: ${args.id}`);
      },
    },
    {
      name: 'cicd_run_pipeline',
      description: '执行 CI/CD 流水线（打包→备份→上传→重启）。返回执行结果摘要。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '流水线 ID' },
          targetId: { type: 'string', description: '部署目标 ID（不传则用第一个目标）' },
        },
        required: ['id'],
      },
      execute: async (args) => {
        const list = await loadPipelines();
        const pipeline = list.find((p) => p.id === args.id);
        if (!pipeline) return textResult('流水线不存在');
        const target = args.targetId
          ? pipeline.targets.find((t) => t.id === args.targetId)
          : pipeline.targets[0];
        if (!target) return textResult('未配置部署目标');

        const executor = new PipelineExecutor();
        const logs: string[] = [];
        const run = await executor.execute(pipeline, target, 'ai-assistant', (event) => {
          if (event.type === 'step-start') logs.push(`▶ ${event.stepName}`);
          else if (event.type === 'step-finish') logs.push(`  → ${event.status} (${event.duration}ms)`);
          else if (event.type === 'run-finish') logs.push(`\n结果: ${event.status}`);
        });

        return textResult([
          `流水线: ${pipeline.name}`,
          `目标: ${target.name}`,
          `状态: ${run.status}`,
          `耗时: ${((run.finishedAt || 0) - run.startedAt) / 1000}s`,
          ...logs,
        ].join('\n'));
      },
    },
    {
      name: 'cicd_list_runs',
      description: '列出流水线执行历史',
      inputSchema: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string', description: '流水线 ID（可选过滤）' },
          limit: { type: 'number', description: '返回条数，默认 20' },
        },
      },
      execute: async (args) => {
        const runs = await loadRuns();
        const filtered = args.pipelineId
          ? runs.filter((r) => r.pipelineId === args.pipelineId)
          : runs;
        const limit = (args.limit as number) || 20;
        return textResult(JSON.stringify(filtered.slice(-limit).map((r) => ({
          id: r.id, pipelineName: r.pipelineName, targetName: r.targetName,
          status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt,
        })), null, 2));
      },
    },
    {
      name: 'cicd_get_run',
      description: '获取执行详情（含步骤结果和日志）',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      execute: async (args) => {
        const runs = await loadRuns();
        const run = runs.find((r) => r.id === args.id);
        if (!run) return textResult('执行记录不存在');
        return textResult(JSON.stringify(run, null, 2));
      },
    },
    {
      name: 'cicd_detect_project',
      description: '检测项目类型，推荐构建类型和流水线模板',
      inputSchema: {
        type: 'object',
        properties: { projectDir: { type: 'string' } },
        required: ['projectDir'],
      },
      execute: async (args) => {
        const result = detectProject(String(args.projectDir));
        return textResult(JSON.stringify(result, null, 2));
      },
    },
    {
      name: 'cicd_list_templates',
      description: '列出可用的流水线预设模板',
      inputSchema: { type: 'object' },
      execute: async () => {
        const templates = Object.entries(PIPELINE_TEMPLATES).map(([id, tpl]) => ({
          id, name: tpl.name, description: tpl.description, buildType: tpl.buildType,
          steps: tpl.steps.length,
        }));
        return textResult(JSON.stringify(templates, null, 2));
      },
    },
  ];
}

// ============================================================
// 插件入口模块
// ============================================================
export const cicdModule: PluginModule = {
  activate(ctx) {
    storage = ctx.storage;
    // 注册工具
    for (const tool of makeCicdTools()) {
      ctx.registerTool(tool);
    }
    // 注册后端路由
    ctx.registerBackendRoute((app) => {
      const r = app as {
        get: (path: string, handler: (req: unknown, res: unknown) => void) => void;
        post: (path: string, handler: (req: unknown, res: unknown) => void) => void;
        put: (path: string, handler: (req: unknown, res: unknown) => void) => void;
        delete: (path: string, handler: (req: unknown, res: unknown) => void) => void;
      };

      // 列出流水线
      r.get('/pipelines', async (_req, res) => {
        const list = await loadPipelines();
        (res as { json: (d: unknown) => void }).json({ data: list });
      });

      // 创建流水线
      r.post('/pipelines', async (req, res) => {
        const body = (req as { body: Record<string, unknown> }).body;
        const now = Date.now();
        let steps = body.steps as PipelineStep[] | undefined;
        let buildType = body.buildType as BuildType | undefined;
        if (body.template && PIPELINE_TEMPLATES[body.template as string]) {
          const tpl = PIPELINE_TEMPLATES[body.template as string];
          if (!steps) steps = JSON.parse(JSON.stringify(tpl.steps));
          if (!buildType) buildType = tpl.buildType;
        }
        const pipeline: CicdPipeline = {
          id: makeId('pipeline'),
          name: String(body.name || '未命名'),
          projectDir: String(body.projectDir || ''),
          buildType: buildType || 'custom-command',
          steps: steps || [],
          targets: (body.targets as DeployTarget[]) || [],
          trigger: (body.trigger as CicdPipeline['trigger']) || 'manual',
          preBuild: body.preBuild as string | undefined,
          postDeploy: body.postDeploy as string | undefined,
          createdAt: now,
          updatedAt: now,
        };
        const list = await loadPipelines();
        list.push(pipeline);
        await savePipelines(list);
        (res as { json: (d: unknown) => void }).json({ data: pipeline });
      });

      // 更新流水线
      r.put('/pipelines/:id', async (req, res) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body;
        const list = await loadPipelines();
        const p = list.find((x) => x.id === id);
        if (!p) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '不存在' }); return; }
        Object.assign(p, body, { updatedAt: Date.now() });
        await savePipelines(list);
        (res as { json: (d: unknown) => void }).json({ data: p });
      });

      // 删除流水线
      r.delete('/pipelines/:id', async (req, res) => {
        const id = (req as { params: { id: string } }).params.id;
        const list = await loadPipelines();
        await savePipelines(list.filter((p) => p.id !== id));
        (res as { json: (d: unknown) => void }).json({ ok: true });
      });

      // 执行流水线（SSE 进度推送）
      r.post('/pipelines/:id/run', async (req, res) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: { targetId?: string } }).body;
        const resSSE = res as {
          setHeader: (k: string, v: string) => void;
          write: (d: string) => void;
          end: () => void;
        };
        resSSE.setHeader('Content-Type', 'text/event-stream');
        resSSE.setHeader('Cache-Control', 'no-cache');
        resSSE.setHeader('Connection', 'keep-alive');

        const list = await loadPipelines();
        const pipeline = list.find((p) => p.id === id);
        if (!pipeline) { resSSE.write(`data: ${JSON.stringify({ error: '流水线不存在' })}\n\n`); resSSE.end(); return; }
        const target = body.targetId
          ? pipeline.targets.find((t) => t.id === body.targetId)
          : pipeline.targets[0];
        if (!target) { resSSE.write(`data: ${JSON.stringify({ error: '未配置部署目标' })}\n\n`); resSSE.end(); return; }

        const executor = new PipelineExecutor();
        const run = await executor.execute(pipeline, target, 'user', (event) => {
          resSSE.write(`data: ${JSON.stringify(event)}\n\n`);
        });
        resSSE.write(`data: ${JSON.stringify({ type: 'complete', run })}\n\n`);
        resSSE.end();
      });

      // 执行历史
      r.get('/runs', async (req, res) => {
        const query = (req as { query: { pipelineId?: string; limit?: string } }).query;
        const runs = await loadRuns();
        const filtered = query.pipelineId
          ? runs.filter((r) => r.pipelineId === query.pipelineId)
          : runs;
        const limit = parseInt(query.limit || '20', 10);
        (res as { json: (d: unknown) => void }).json({ data: filtered.slice(-limit) });
      });

      // 执行详情
      r.get('/runs/:id', async (req, res) => {
        const id = (req as { params: { id: string } }).params.id;
        const runs = await loadRuns();
        const run = runs.find((r) => r.id === id);
        if (!run) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '不存在' }); return; }
        (res as { json: (d: unknown) => void }).json({ data: run });
      });

      // 模板列表
      r.get('/templates', async (_req, res) => {
        (res as { json: (d: unknown) => void }).json({ data: PIPELINE_TEMPLATES });
      });

      // 项目检测
      r.get('/detect', async (req, res) => {
        const dir = (req as { query: { dir: string } }).query.dir;
        const result = detectProject(dir);
        (res as { json: (d: unknown) => void }).json({ data: result });
      });

      // 获取 ops-shell 连接列表（供前端选择部署目标连接）
      r.get('/connections', async (_req, res) => {
        const conns = await loadConnections();
        (res as { json: (d: unknown) => void }).json({
          data: conns.map((c) => ({ id: c.id, name: c.name, host: c.host, type: c.type, tag: c.tag })),
        });
      });
    });

    ctx.log('CICD 流水线插件已激活');
  },
};