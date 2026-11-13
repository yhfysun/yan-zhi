import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../src/routes/browser.ts'), 'utf8');

describe('Playwright 下载接入统一后台任务', () => {
  it('下载开始登记 job，进度节流回写，终态 finish', () => {
    expect(SRC).toContain('registerPlaywrightDownloadJob(rec)');
    expect(SRC).toContain('reportPlaywrightDownloadProgress(rec)');
    expect(SRC).toContain('finishPlaywrightDownloadJob(rec, rec.verified ?');
    expect(SRC).toContain('idempotencyKey: `playwright-download:${rec.id}`');
  });

  it('绑定 conversation/task/toolCall/wakePolicy，且对 Playwright 明确不支持控制', () => {
    expect(SRC).toContain("conversationId: args.__conversationId || convIdOf(req)");
    expect(SRC).toContain("taskId: args.__taskId");
    expect(SRC).toContain("toolCallId: args.__toolCallId");
    expect(SRC).toContain("wakePolicy: args.__wakePolicy");
    expect(SRC).toContain('controlCapabilities: { pause: false, resume: false, cancel: false }');
  });
});
