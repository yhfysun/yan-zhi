// job_status 内置工具 —— 统一后台长任务与旧 Python 后台作业的状态查询。
//
// ★ 为什么单独一个工具（2026-10-24 用户实报「每次调用都被 30 秒超时截断，ffmpeg 中途被杀」）：
//   ffmpeg 出片这类长任务不能占着一次工具调用等结果 —— 前台默认 30s 到点按进程树杀干净，
//   产出缺 moov 的坏 mp4。后台作业把「跑」和「等」拆开：启动回 jobId，本工具只读
//   <工作目录>/.yan-zhi/jobs/<jobId>/status.json + 日志尾部。
// ★ readsExternalState=true：同一 jobId 连查多次是**正常轮询**（每次状态都不同），
//   不能命中防循环闸门的「同参重复」判据。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { JOB_ID_RE, listRecentJobs, readJobSnapshot, type JobSnapshot } from './python-runtime';
import { capToolOutput } from './output-cap';
import { toolError } from '../result';
import {
  fetchBackgroundJob,
  isUnifiedBackgroundJobId,
  type BackgroundJobView,
} from './background-job-client';

const STATE_TEXT: Record<JobSnapshot['state'], string> = {
  starting: '启动中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  stale: '已中断（进程不在了，但没有写完结束状态——可能被关机/强杀）',
  missing: '不存在',
};


function fmtElapsed(sec: number): string {
  if (!sec) return '-';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}分${s}秒`;
}

function renderOne(snap: JobSnapshot, tailLines: number): string {
  const st = snap.status || {};
  const lines: string[] = [];
  lines.push(`作业 ${snap.jobId}：${STATE_TEXT[snap.state]}（已跑 ${fmtElapsed(snap.elapsedSec)}）`);
  if (typeof st.exitCode === 'number') lines.push(`退出码：${st.exitCode}`);
  if (typeof st.error === 'string' && st.error) lines.push(`错误：${st.error}`);
  if (st.startedAtText) lines.push(`开始：${st.startedAtText}`);
  if (st.finishedAtText) lines.push(`结束：${st.finishedAtText}`);
  lines.push(`作业目录：${snap.jobDir}`);
  const tail = tailLines > 0 ? snap.logTail : '';
  if (tail) {
    lines.push('', `--- 日志尾部（${tailLines} 行）---`, capToolOutput(tail));
  } else if (snap.state === 'running' || snap.state === 'starting') {
    lines.push('', '（日志暂时为空，可能还在启动或尚未输出）');
  }
  if (snap.state === 'running' || snap.state === 'starting') {
    lines.push('', `继续轮询：job_status { "jobId": "${snap.jobId}", "waitSeconds": 30 }`);
  } else if (snap.state === 'completed') {
    lines.push('', '作业已结束：读日志里的产物路径（成片/封面等）再继续。');
  }
  return lines.join('\n');
}

const UNIFIED_STATE_TEXT: Record<string, string> = {
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

function fmtEta(ms: number | null | undefined): string {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return '未知';
  const sec = Math.max(1, Math.ceil(Number(ms) / 1000));
  if (sec < 60) return `${sec} 秒`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest ? `${min} 分 ${rest} 秒` : `${min} 分钟`;
}

function renderUnified(job: BackgroundJobView): string {
  const lines: string[] = [
    `后台任务 ${job.jobId}：${UNIFIED_STATE_TEXT[job.status] || job.status}`,
    `类型：${job.kind}`,
    `标题：${job.title}`,
  ];
  if (job.progress != null) lines.push(`进度：${job.progress}%`);
  if (job.bytesTotal) lines.push(`字节：${job.bytesDone || 0}/${job.bytesTotal} B`);
  else if (job.bytesDone) lines.push(`字节：${job.bytesDone} B`);
  if (job.speedBps) lines.push(`速度：${Math.round(job.speedBps / 1024)} KB/s`);
  if (job.etaMs) lines.push(`预计剩余：${fmtEta(job.etaMs)}`);
  if (job.error) lines.push(`错误：${job.error}`);
  if (job.artifactPaths?.length) {
    lines.push('产物：');
    for (const artifact of job.artifactPaths) lines.push(`- ${artifact}`);
  }
  if (['completed', 'failed', 'cancelled', 'stalled'].includes(job.status)) {
    lines.push('', job.status === 'completed'
      ? '任务已结束：按上面的产物路径继续后续处理，不要重新启动同一个任务。'
      : '任务未成功结束：先核实失败阶段与现有产物，再决定修复或重试。');
  } else {
    lines.push(
      '',
      `该任务已交给后台调度（wakePolicy=${job.wakePolicy}）。完成时会自动唤醒原会话；`,
      '无需持续轮询。除非要暂停、恢复、取消或查看最新进度，否则继续其它工作即可。',
    );
  }
  return lines.join('\n');
}

export class JobStatusTool implements BuiltInTool {
  name = 'job_status';
  description =
    '查询统一后台长任务状态（浏览器大文件下载、python_exec/cmd_exec background=true、打包构建等）。' +
    '不带 jobId 时列出当前工作目录最近的作业概览。返回状态（运行中/已完成/失败）、耗时、退出码与日志尾部。' +
    '统一后台任务完成会自动通知/唤醒；不要为等它而持续轮询。只有需要最新进度、暂停或取消时才查询。';

  readsExternalState = true;

  inputSchema = {
    type: 'object',
    properties: {
      jobId: { type: 'string', description: '后台作业 id（python_exec background=true 返回的 job_xxx）。省略则列出最近作业' },
      tailLines: { type: 'number', description: '日志尾部行数（默认 40，最多 400）' },
      waitSeconds: { type: 'number', description: '短等待多少秒直到作业结束（默认 0，最多 30）。仅用于收尾前短暂确认，不要用长轮询等大文件' },
      limit: { type: 'number', description: '不带 jobId 时列出的作业条数（默认 10，最多 30）' },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const ws = ctx?.workspaceDir;
    const rawId = typeof args.jobId === 'string' ? args.jobId.trim() : '';
    const tailLines = Math.min(400, Math.max(1, Math.round(Number(args.tailLines) || 40)));
    const waitSec = Math.min(30, Math.max(0, Number(args.waitSeconds) || 0));
    const limit = Math.min(30, Math.max(1, Math.round(Number(args.limit) || 10)));

    if (!rawId) {
      const jobs = listRecentJobs(ws, limit);
      if (!jobs.length) {
        return { content: [{ type: 'text', text: '当前工作目录没有后台作业记录。出片/渲染这类长任务请用 python_exec { background: true } 启动。' }] };
      }
      const rows = jobs.map(
        (j) => `- ${j.jobId}  ${STATE_TEXT[j.state]}  已跑 ${fmtElapsed(j.elapsedSec)}  ${j.jobDir}`,
      );
      return { content: [{ type: 'text', text: ['最近的后台作业（新的在前）：', ...rows].join('\n') }] };
    }

    if (isUnifiedBackgroundJobId(rawId)) {
      let job = await fetchBackgroundJob(rawId, ctx);
      if (!job) {
        return toolError(`Error: 找不到统一后台任务 ${rawId}。确认 jobId 是否来自启动回执，或先查询会话后台任务卡。`);
      }
      const busy = (s: string) => ['queued', 'starting', 'running', 'paused', 'finalizing', 'verifying'].includes(s);
      const deadline = Date.now() + waitSec * 1000;
      while (waitSec > 0 && busy(job.status) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, Math.min(1000, Math.max(200, deadline - Date.now()))));
        job = await fetchBackgroundJob(rawId, ctx) || job;
      }
      return { content: [{ type: 'text', text: renderUnified(job) }] };
    }

    if (!JOB_ID_RE.test(rawId)) {
      return toolError(`Error: jobId 格式不对（应形如 job_abc123_deadbeef）：${rawId}`);
    }

    let snap = readJobSnapshot(ws, rawId, { tailLines });
    const busy = (s: JobSnapshot['state']) => s === 'running' || s === 'starting';
    const deadline = Date.now() + waitSec * 1000;
    while (waitSec > 0 && busy(snap.state) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, Math.min(2000, Math.max(200, deadline - Date.now()))));
      snap = readJobSnapshot(ws, rawId, { tailLines });
    }

    if (snap.state === 'missing' && !snap.status) {
      return toolError(
        `Error: 找不到作业 ${rawId}（${snap.jobDir}）。jobId 可能拼错，或不带 jobId 调一次看最近作业列表。`,
      );
    }
    return { content: [{ type: 'text', text: renderOne(snap, tailLines) }] };
  }
}
