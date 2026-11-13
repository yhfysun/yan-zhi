import { describe, expect, it } from 'vitest';
import { upsertJobList, type BackgroundJobView } from './background-jobs';

const base: BackgroundJobView = {
  jobId: 'job_bg_1_deadbeef',
  kind: 'browser_download',
  status: 'running',
  wakePolicy: 'resume',
  title: '下载',
  progress: 10,
  updatedAt: 1,
};

describe('background jobs store helpers', () => {
  it('同 jobId 幂等更新，不产生重复卡', () => {
    const next = upsertJobList([base], { ...base, status: 'completed', progress: 100, updatedAt: 2, terminalAt: 2 });

    expect(next).toHaveLength(1);
    expect(next[0].status).toBe('completed');
    expect(next[0].progress).toBe(100);
  });

  it('进行中任务排在已结束任务前，避免历史任务遮住当前任务', () => {
    const next = upsertJobList([
      { ...base, jobId: 'job_bg_done_deadbeef', status: 'completed', terminalAt: 10, updatedAt: 10 },
      { ...base, jobId: 'job_bg_live_deadbeef', status: 'running', terminalAt: null, updatedAt: 5 },
    ], { ...base, jobId: 'job_bg_live_deadbeef', status: 'running', progress: 30, updatedAt: 6 });

    expect(next[0].jobId).toBe('job_bg_live_deadbeef');
    expect(next[0].progress).toBe(30);
  });
});
