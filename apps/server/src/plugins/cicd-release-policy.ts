import { createHash } from 'node:crypto';
import type { CicdPipeline, DeployTarget, PipelineStep } from '@yan-zhi/shared';
import type { StoredConnection } from './ops-shell.js';

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function releaseStepSummary(step: PipelineStep): string {
  const config = step.config as unknown as Record<string, unknown>;
  const text = (key: string) => String(config[key] ?? '').trim();
  const parts: string[] = [];
  if (step.type === 'docker-push') {
    if (text('registry')) parts.push(text('registry'));
    if (text('image')) parts.push(text('image'));
  } else if (step.type === 'notify') {
    if (text('type')) parts.push(text('type'));
  } else {
    for (const key of ['command', 'artifact', 'remotePath', 'backupDir', 'localPath', 'context', 'tag', 'workDir']) {
      const value = text(key);
      if (value) parts.push(value);
    }
  }
  return `- ${step.name}[${step.type}]${parts.length ? `: ${parts.join(' | ')}` : ''}`;
}

/**
 * 生产发布审批绑定到完整计划，而不是一个可被模型自行传入的 confirmed 布尔值。
 * 指纹覆盖流水线步骤与目标配置；任何命令、目录、健康检查或回滚变化都会要求重新审批。
 * 展示文本会省略 Docker 推送凭据等敏感字段，但指纹仍覆盖完整配置。
 */
export function releaseApprovalSubject(
  pipeline: CicdPipeline,
  target: DeployTarget,
  conn: StoredConnection,
): string {
  const fingerprint = createHash('sha256').update(JSON.stringify({
    pipeline: {
      id: pipeline.id,
      name: pipeline.name,
      projectDir: pipeline.projectDir,
      buildType: pipeline.buildType,
      steps: pipeline.steps,
      preBuild: pipeline.preBuild,
      postDeploy: pipeline.postDeploy,
    },
    target,
    connection: {
      id: conn.id,
      name: conn.name,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      tag: conn.tag,
    },
  })).digest('hex').slice(0, 16);
  const stepLines = pipeline.steps.filter((step) => step.enabled).map(releaseStepSummary);

  return [
    `[发布审批] ${pipeline.name} → ${target.name}`,
    `服务器：${conn.name}（${conn.host}）${conn.tag ? ` · ${conn.tag}` : ''}`,
    `发布目录：${target.remotePath || '（未设置）'}`,
    `重启脚本：${target.restartScript || '（未设置）'}`,
    `健康检查：${target.healthCheckCommand || '（未配置）'}`,
    `回滚命令：${target.rollbackCommand || '（未配置）'}${target.autoRollback ? '（自动）' : ''}`,
    '步骤：',
    ...(stepLines.length ? stepLines : ['- 无']),
    `审批指纹：${fingerprint}`,
  ].join('\n');
}
