// 后台渲染队列（P1-9）。
//
// ★ 为什么需要：此前导出是同步等 ffmpeg 跑完（UI 实际上是发一句话让智能体去渲染），
//   一条 60 秒的片子可能几分钟，期间工作台啥也干不了，连续导两个还会互相抢 CPU。
//   → 改成"排队 + 后台顺序执行 + 前端轮询状态"，导出不再阻塞编辑。
//
// ★ 执行器由 routes/clip.ts 注入（runner），本模块不 import mcp 层 —— 避免服务层反向依赖
//   智能体执行层；测试可以直接注入假 runner，不需要 ffmpeg。

export type RenderJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

export interface RenderQueueJob {
  id: string;
  conversationId: string;
  /** 展示名（默认按时间/预览档生成） */
  title: string;
  preview: boolean;
  quality?: 'low' | 'std' | 'high';
  output?: string;
  status: RenderJobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  file?: string;
  note?: string;
  error?: string;
}

export interface RenderQueueResult {
  ok: boolean;
  file?: string;
  note?: string;
  error?: string;
}

export type RenderQueueRunner = (job: RenderQueueJob) => Promise<RenderQueueResult>;

let runner: RenderQueueRunner | null = null;
const jobs: RenderQueueJob[] = [];
const MAX_JOBS = 50;
let draining = false;

/** 由路由层注入真正的渲染执行器（clip_project op=render）。 */
export function setRenderQueueRunner(fn: RenderQueueRunner | null): void {
  runner = fn;
}

export function enqueueRenderJob(input: {
  conversationId: string;
  title?: string;
  preview?: boolean;
  quality?: 'low' | 'std' | 'high';
  output?: string;
}): RenderQueueJob {
  const n = jobs.filter((j) => j.conversationId === input.conversationId).length + 1;
  const job: RenderQueueJob = {
    id: `rj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    conversationId: input.conversationId,
    title: input.title || `${input.preview ? '预览档' : '成片'} #${n}`,
    preview: input.preview === true,
    ...(input.quality ? { quality: input.quality } : {}),
    ...(input.output ? { output: input.output } : {}),
    status: 'queued',
    createdAt: Date.now(),
  };
  jobs.push(job);
  while (jobs.length > MAX_JOBS) jobs.shift();
  void drain();
  return job;
}

export function listRenderJobs(conversationId?: string): RenderQueueJob[] {
  return jobs
    .filter((j) => !conversationId || j.conversationId === conversationId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => ({ ...j }));
}

/** 取消还在排队的任务（已经开始跑的不支持中断：ffmpeg 子进程杀掉会留下半成品）。 */
export function cancelRenderJob(id: string): boolean {
  const job = jobs.find((j) => j.id === id);
  if (!job || job.status !== 'queued') return false;
  job.status = 'canceled';
  job.finishedAt = Date.now();
  return true;
}

/** 清掉已结束的任务记录（返回清理条数）。 */
export function clearFinishedRenderJobs(conversationId?: string): number {
  let removed = 0;
  for (let i = jobs.length - 1; i >= 0; i--) {
    const j = jobs[i];
    if (conversationId && j.conversationId !== conversationId) continue;
    if (j.status === 'done' || j.status === 'failed' || j.status === 'canceled') {
      jobs.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const job = jobs.find((j) => j.status === 'queued');
      if (!job) break;
      if (!runner) {
        job.status = 'failed';
        job.error = '渲染执行器未就绪';
        job.finishedAt = Date.now();
        continue;
      }
      job.status = 'running';
      job.startedAt = Date.now();
      try {
        const r = await runner(job);
        if (r.ok) {
          job.status = 'done';
          if (r.file) job.file = r.file;
          if (r.note) job.note = r.note;
        } else {
          job.status = 'failed';
          job.error = r.error || '渲染失败';
        }
      } catch (e) {
        job.status = 'failed';
        job.error = e instanceof Error ? e.message : String(e);
      }
      job.finishedAt = Date.now();
    }
  } finally {
    draining = false;
  }
}

/** 测试用：清空队列与执行器。 */
export function resetRenderQueueForTests(): void {
  jobs.splice(0, jobs.length);
  runner = null;
  draining = false;
}
