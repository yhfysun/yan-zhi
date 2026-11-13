import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { controlBackgroundJob, isUnifiedBackgroundJobId } from './background-job-client';
import { toolError } from '../result';

const OP_TEXT: Record<string, string> = {
  pause: '暂停',
  resume: '恢复',
  cancel: '取消',
};
const STATUS_TEXT: Record<string, string> = {
  queued: '排队中',
  starting: '启动中',
  running: '运行中',
  paused: '已暂停',
  finalizing: '收尾中',
  verifying: '校验中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  stalled: '已中断',
};

export class JobControlTool implements BuiltInTool {
  name = 'job_control';
  description =
    '控制统一后台长任务：暂停、恢复或取消。浏览器桌面下载支持 pause/resume/cancel；' +
    'Playwright 下载通常不支持控制；Python/命令/打包任务当前只支持 cancel。' +
    '返回 unsupported 时必须如实告知用户，不要假装操作成功。';

  inputSchema = {
    type: 'object',
    properties: {
      jobId: { type: 'string', description: '统一后台任务 id（job_bg_...）' },
      operation: {
        type: 'string',
        enum: ['pause', 'resume', 'cancel'],
        description: '控制操作',
      },
    },
    required: ['jobId', 'operation'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const jobId = String(args.jobId || '').trim();
    const operation = String(args.operation || '').trim();
    if (!isUnifiedBackgroundJobId(jobId)) {
      return toolError('Error: jobId 格式不对（应形如 job_bg_...）');
    }
    if (operation !== 'pause' && operation !== 'resume' && operation !== 'cancel') {
      return toolError('Error: operation 必须是 pause / resume / cancel');
    }

    const result = await controlBackgroundJob(jobId, operation, ctx);
    if (!result.ok) {
      return toolError(
        `后台任务控制接口不可用：${result.error || result.code || 'unknown'}\n`
        + '这不是“已执行”，请检查任务类型与执行面能力；不要向用户谎报暂停/恢复/取消成功。',
      );
    }
    const job = result.job;
    const lines = [
      job?.status === 'paused'
        ? `后台任务已暂停：${jobId}`
        : `后台任务${OP_TEXT[operation]}请求已受理：${jobId}`,
      job?.title ? `任务：${job.title}` : '',
      job?.status ? `状态：${STATUS_TEXT[job.status] || job.status}` : '',
      job?.progress != null ? `进度：${job.progress}%` : '',
      '',
      '后续完成仍会自动按原 wakePolicy 通知，不需要持续轮询。',
    ].filter(Boolean);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
}
