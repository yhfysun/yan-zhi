// job_status 内置工具 —— 后台作业（python_exec background=true）的状态与日志轮询。
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

export class JobStatusTool implements BuiltInTool {
  name = 'job_status';
  description =
    '查询后台作业状态（python_exec background=true 启动的长任务：ffmpeg 出片/渲染、下载、批量处理）。' +
    '不带 jobId 时列出当前工作目录最近的作业概览。返回状态（运行中/已完成/失败）、耗时、退出码与日志尾部。' +
    '轮询建议：先 waitSeconds=30 等一会儿；连续几次日志没变化且已超过预期耗时，就读全部日志判断是否卡住，不要空转。';

  readsExternalState = true;

  inputSchema = {
    type: 'object',
    properties: {
      jobId: { type: 'string', description: '后台作业 id（python_exec background=true 返回的 job_xxx）。省略则列出最近作业' },
      tailLines: { type: 'number', description: '日志尾部行数（默认 40，最多 400）' },
      waitSeconds: { type: 'number', description: '最多等待多少秒直到作业结束（默认 0，最多 120）。轮询时用它能少烧几轮对话' },
      limit: { type: 'number', description: '不带 jobId 时列出的作业条数（默认 10，最多 30）' },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const ws = ctx?.workspaceDir;
    const rawId = typeof args.jobId === 'string' ? args.jobId.trim() : '';
    const tailLines = Math.min(400, Math.max(1, Math.round(Number(args.tailLines) || 40)));
    const waitSec = Math.min(120, Math.max(0, Number(args.waitSeconds) || 0));
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
