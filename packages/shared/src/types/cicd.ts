// CI/CD 流水线类型定义（前后端共享）

/** 步骤类型 */
export type StepType =
  | 'build'
  | 'backup'
  | 'upload'
  | 'exec-remote'
  | 'exec-local'
  | 'docker-build'
  | 'docker-push'
  | 'notify'
  | 'custom';

/** 打包子类型 */
export type BuildType =
  | 'maven-jar'
  | 'maven-war'
  | 'maven-scattered'
  | 'gradle-jar'
  | 'npm-build'
  | 'docker-image'
  | 'custom-command';

/** 备份策略 */
export type BackupStrategy = 'copy' | 'mv' | 'tar';

/** 上传模式 */
export type UploadMode = 'overwrite' | 'incremental' | 'skip-if-exists';

/** 流水线触发方式 */
export type TriggerType = 'manual' | 'on-commit' | 'scheduled';

/** 步骤状态 */
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/** 运行状态 */
export type RunStatus = 'running' | 'success' | 'failed' | 'cancelled';

/** 打包步骤配置 */
export interface BuildStepConfig {
  buildType: BuildType;
  workDir?: string;
  command?: string;
  args?: string[];
  artifact: string;
  preCommand?: string;
  env?: Record<string, string>;
}

/** 备份步骤配置 */
export interface BackupStepConfig {
  connectionId: string;
  remotePath: string;
  backupDir: string;
  strategy: BackupStrategy;
  keepCount: number;
  nameTemplate?: string;
}

/** 上传步骤配置 */
export interface UploadStepConfig {
  connectionId: string;
  localPath: string;
  remotePath: string;
  mode: UploadMode;
  incrementalBase?: string;
  chmod?: string;
}

/** 远程执行步骤配置 */
export interface ExecRemoteStepConfig {
  connectionId: string;
  command: string;
  timeout?: number;
  workDir?: string;
}

/** 本地执行步骤配置 */
export interface ExecLocalStepConfig {
  command: string;
  workDir?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/** Docker 构建步骤配置 */
export interface DockerBuildStepConfig {
  dockerfile?: string;
  context: string;
  tag: string;
  buildArgs?: Record<string, string>;
}

/** Docker 推送步骤配置 */
export interface DockerPushStepConfig {
  image: string;
  registry?: string;
  username?: string;
  password?: string;
}

/** 通知步骤配置 */
export interface NotifyStepConfig {
  type: 'webhook' | 'dingtalk' | 'feishu' | 'email';
  url: string;
  template?: string;
  onlyOnFailure?: boolean;
}

/** 自定义步骤配置 */
export interface CustomStepConfig {
  command: string;
  workDir?: string;
  env?: Record<string, string>;
}

/** 步骤配置联合类型 */
export type StepConfig =
  | BuildStepConfig
  | BackupStepConfig
  | UploadStepConfig
  | ExecRemoteStepConfig
  | ExecLocalStepConfig
  | DockerBuildStepConfig
  | DockerPushStepConfig
  | NotifyStepConfig
  | CustomStepConfig;

/** 单个步骤定义 */
export interface PipelineStep {
  id: string;
  type: StepType;
  name: string;
  config: StepConfig;
  enabled: boolean;
  continueOnError: boolean;
  condition?: string;
}

/** 部署目标环境 */
export interface DeployTarget {
  id: string;
  name: string;
  connectionId: string;
  remotePath: string;
  restartScript: string;
  env?: Record<string, string>;
}

/** 流水线定义 */
export interface CicdPipeline {
  id: string;
  name: string;
  projectDir: string;
  buildType: BuildType;
  steps: PipelineStep[];
  targets: DeployTarget[];
  trigger: TriggerType;
  preBuild?: string;
  postDeploy?: string;
  createdAt: number;
  updatedAt: number;
}

/** 步骤执行结果 */
export interface StepResult {
  stepId: string;
  stepName: string;
  status: StepStatus;
  startedAt?: number;
  finishedAt?: number;
  duration?: number;
  output?: string;
  error?: string;
}

/** 流水线执行记录 */
export interface CicdRun {
  id: string;
  pipelineId: string;
  pipelineName: string;
  targetId: string;
  targetName: string;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  currentStep?: string;
  stepResults: StepResult[];
  triggeredBy: string;
  logs: RunLogEntry[];
}

/** 运行日志条目 */
export interface RunLogEntry {
  stepId: string;
  stepName: string;
  log: string;
  status: StepStatus;
  duration: number;
}

/** SSE 进度事件 */
export interface ProgressEvent {
  runId: string;
  type: 'step-start' | 'step-log' | 'step-finish' | 'run-finish';
  stepId?: string;
  stepName?: string;
  status?: StepStatus | RunStatus;
  log?: string;
  error?: string;
  duration?: number;
  timestamp: number;
}

/** 预设模板 */
export interface PipelineTemplate {
  name: string;
  description: string;
  buildType: BuildType;
  steps: PipelineStep[];
}

/** 项目类型检测结果 */
export interface ProjectDetectResult {
  buildType: BuildType;
  buildTool: 'maven' | 'gradle' | 'npm' | 'docker' | 'unknown';
  hasDockerfile: boolean;
  hasPomXml: boolean;
  hasGradle: boolean;
  hasPackageJson: boolean;
  isSpringBoot: boolean;
  recommendedTemplate: string;
}