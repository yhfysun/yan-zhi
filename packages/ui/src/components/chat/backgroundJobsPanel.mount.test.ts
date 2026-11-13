// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import BackgroundJobsPanel from './BackgroundJobsPanel.vue';
import type { BackgroundJobView } from '../../stores/background-jobs';

const tick = async () => { for (let i = 0; i < 4; i++) await nextTick(); };

function mount(jobs: BackgroundJobView[]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const controls: Array<{ jobId: string; operation: string }> = [];
  const reveals: string[] = [];
  const continues: string[] = [];
  const app: App = createApp({
    render: () => h(BackgroundJobsPanel as never, {
      jobs,
      onControl: (jobId: string, operation: string) => controls.push({ jobId, operation }),
      onReveal: (path: string) => reveals.push(path),
      onContinue: (jobId: string) => continues.push(jobId),
    }),
  });
  app.use(ElementPlus);
  app.mount(host);
  return { host, app, controls, reveals, continues };
}

describe('BackgroundJobsPanel', () => {
  it('显示进度、速度、ETA 与暂停/取消操作', async () => {
    const { host, app, controls } = mount([{
      jobId: 'job_bg_1_deadbeef',
      kind: 'browser_download',
      status: 'running',
      wakePolicy: 'resume',
      title: '下载安装包',
      progress: 42,
      bytesDone: 420,
      bytesTotal: 1000,
      speedBps: 1024,
      etaMs: 6000,
      controlCapabilities: { pause: true, resume: true, cancel: true },
    }]);
    await tick();

    expect(host.textContent).toContain('后台任务');
    expect(host.textContent).toContain('下载安装包');
    expect(host.textContent).toContain('42%');
    expect(host.textContent).toContain('1.0 KB/s');
    const buttons = [...host.querySelectorAll('button')] as HTMLButtonElement[];
    buttons.find(button => button.getAttribute('aria-label') === '暂停任务')?.click();
    expect(controls[0]).toEqual({ jobId: 'job_bg_1_deadbeef', operation: 'pause' });
    app.unmount();
  });

  it('不支持控制时按钮禁用，不能误报可操作', async () => {
    const { host, app } = mount([{
      jobId: 'job_bg_2_deadbeef',
      kind: 'browser_download',
      status: 'running',
      wakePolicy: 'resume',
      title: 'Playwright 下载',
      progress: 10,
      controlCapabilities: { pause: false, resume: false, cancel: false },
    }]);
    await tick();
    const pause = host.querySelector('button[aria-label="暂停任务"]') as HTMLButtonElement;
    const cancel = host.querySelector('button[aria-label="取消任务"]') as HTMLButtonElement;
    expect(pause.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    app.unmount();
  });

  it('完成态显示产物并支持在文件管理器中定位', async () => {
    const { host, app, reveals, continues } = mount([{
      jobId: 'job_bg_3_deadbeef',
      kind: 'package_build',
      status: 'completed',
      wakePolicy: 'resume',
      title: '打包 Pro',
      progress: 100,
      artifactPaths: ['D:/release/pro-setup.exe'],
      terminalAt: Date.now(),
    }]);
    await tick();
    expect(host.textContent).toContain('pro-setup.exe');
    (host.querySelector('button[aria-label="在文件管理器中显示"]') as HTMLButtonElement).click();
    expect(reveals).toEqual(['D:/release/pro-setup.exe']);
    ([...host.querySelectorAll('button')] as HTMLButtonElement[]).find(button => button.textContent?.includes('继续处理'))?.click();
    expect(continues).toEqual(['job_bg_3_deadbeef']);
    app.unmount();
  });
});
