import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'CodeWorkbench.vue'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

describe('开发模式项目与任务归属', () => {
  it('切换项目目录时优先恢复该项目最近任务，没有任务才新建草稿', () => {
    const i = SRC.indexOf('watch(() => code.projectDir');
    const seg = SRC.slice(i, i + 1800);
    expect(seg).toMatch(/code\.projectSpaceId/);
    expect(seg, '★ 当前实现无条件新建任务，切回项目看不到之前的任务')
      .toMatch(/selectConv/);
    expect(seg.indexOf('selectConv')).toBeLessThan(seg.indexOf('startNewChat'));
    expect(seg, '★ 快速连续切项目时旧请求可能把 projectSpaceId 写回前一个项目')
      .toMatch(/requestedDir[\s\S]{0,220}code\.projectDir !== requestedDir/);
  });

  it('打开属于另一个开发项目的任务时，代码工作台目录跟随该任务的空间', () => {
    const i = SRC.indexOf('async function syncProjectDirFromConversation');
    expect(i, '★ 没有监听当前任务，外部打开任务后 header/文件树仍停在上个项目').toBeGreaterThan(-1);
    const seg = SRC.slice(i, i + 1200);
    expect(seg).toMatch(/spaceId/);
    expect(seg).toMatch(/code\.setProjectDir/);
    expect(SRC).toMatch(/watch\(\(\) => chatStore\.currentConvId[\s\S]{0,120}syncProjectDirFromConversation/);
  });
});
