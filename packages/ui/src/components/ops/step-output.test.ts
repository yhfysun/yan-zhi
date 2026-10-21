/**
 * 工具执行结果的展示口径（2026-10-21 用户实报「执行命令的结果展示啊这些」）。
 *
 * 现象（截图实据）：一条 `docker ps -a --format "table {{.ID}}\t{{.Image}}\t{{.Names}}"` 打出
 * 40+ 行容器，整段原始输出铺满整屏 —— 用户要的是"你查到了什么"，不是整个终端回放。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countTableRows, isLongOutput, outputMeta, outputPreview, LONG_CHARS, LONG_LINES, PREVIEW_LINES,
} from './step-output';

/** 复刻截图里那种 docker ps 表格输出（表头 + N 行容器） */
function dockerPs(n: number): string {
  const head = 'CONTAINER ID   IMAGE                                   COMMAND                  CREATED         STATUS          PORTS     NAMES';
  const rows = Array.from({ length: n }, (_, i) =>
    `${'a1b2c3d4e5f' + i}`.slice(0, 12).padEnd(15)
    + 'harnessagent-sandbox:3.13'.padEnd(40)
    + `"python /opt/app.py"`.padEnd(25)
    + '5 minutes ago'.padEnd(16)
    + 'Up 5 minutes'.padEnd(16)
    + `agent-sandbox-${i}`,
  );
  return [head, ...rows].join('\n');
}

describe('isLongOutput —— 什么时候折叠', () => {
  it('短输出不折叠（不值得让用户多点一次）', () => {
    expect(isLongOutput('total 0\ndrwxr-xr-x 2 root root 6 a')).toBe(false);
    expect(isLongOutput(Array.from({ length: LONG_LINES }, (_, i) => `line${i}`).join('\n'))).toBe(false);
  });

  it('超行数或超字符都折叠', () => {
    expect(isLongOutput(Array.from({ length: LONG_LINES + 1 }, (_, i) => `l${i}`).join('\n'))).toBe(true);
    expect(isLongOutput('x'.repeat(LONG_CHARS + 1))).toBe(true);
  });

  it('截图那条 docker ps（40 行）必须折叠', () => {
    expect(isLongOutput(dockerPs(40))).toBe(true);
  });

  it('空输出不折叠', () => {
    expect(isLongOutput('')).toBe(false);
  });
});

describe('outputPreview —— 保留表头', () => {
  it('预览首行必须是表头（砍掉表头等于给用户一堆看不懂的 ID）', () => {
    const out = dockerPs(40);
    const preview = outputPreview(out);
    expect(preview.split('\n')[0]).toContain('CONTAINER ID');
    expect(preview.split('\n')[0]).toContain('STATUS');
  });

  it(`只给 ${PREVIEW_LINES} 行 + 剩余行数提示`, () => {
    const out = dockerPs(40);
    const lines = outputPreview(out).split('\n');
    expect(lines).toHaveLength(PREVIEW_LINES + 1);
    expect(lines[lines.length - 1]).toContain(`还有 ${41 - PREVIEW_LINES} 行未显示`);
  });

  it('不折叠时原文返回（不做任何截断）', () => {
    const short = 'a\nb\nc';
    expect(outputPreview(short)).toBe(short);
  });
});

describe('outputMeta —— 一眼知道拿到多少东西', () => {
  it('表格输出报「数据行数」而不是物理行数（含表头那块）', () => {
    // 表头 + 40 行 → 40 行数据（不是 41 行）
    expect(outputMeta(dockerPs(40))).toMatch(/^40 行数据 · /);
  });

  it('非表格输出报物理行数', () => {
    const plain = ['Starting service', 'WARN deprecated', 'done'].join('\n');
    expect(outputMeta(plain)).toMatch(/^3 行 · /);
  });

  it('超长输出用「万字符」计量，避免一长串数字', () => {
    const big = 'x'.repeat(25000);
    expect(outputMeta(big)).toContain('万字符');
  });

  it('空输出返回空串（不显示 meta 行）', () => {
    expect(outputMeta('')).toBe('');
  });
});

describe('countTableRows —— 表格识别', () => {
  it('两列以上空白分隔才认表格（单列 log 不算）', () => {
    expect(countTableRows(['timestamp', '2026-01-01 a', '2026-01-02 b'].join('\n'))).toBe(0);
  });

  it('表格行少于 2 行时不当作表格（避免把普通文本误判）', () => {
    expect(countTableRows(['A    B', 'x    y'].join('\n'))).toBe(0);
  });

  it('正常表格返回数据行数', () => {
    expect(countTableRows(dockerPs(5))).toBe(5);
  });
});

describe('步骤卡 UI 契约', () => {
  const SRC = readFileSync(resolve(__dirname, 'OpsStepCards.vue'), 'utf8');
  it('输出区有「展开完整输出」入口与 meta 行', () => {
    expect(SRC).toContain('展开完整输出');
    expect(SRC).toContain('osc-out-meta');
    expect(SRC).toMatch(/import \{ isLongOutput, outputMeta, outputPreview \} from '\.\/step-output'/);
  });
  it('折叠态用预览、展开态才渲染原文', () => {
    expect(SRC).toMatch(/v-if="isLongOutput\(s\.output\) && !outputOpen\.has\(s\.index\)"[\s\S]{0,120}outputPreview\(s\.output\)/);
    expect(SRC).toMatch(/<pre v-else class="osc-out">\{\{ s\.output \}\}<\/pre>/);
  });

  it('命令类工具显示要执行的命令行（而不是一串 JSON 参数）', () => {
    expect(SRC).toContain('function commandOf');
    expect(SRC).toMatch(/v-if="commandOf\(s\.argsText\)"[\s\S]{0,160}\{\{ commandOf\(s\.argsText\) \}\}/);
    // 命令与输出视觉分离
    expect(SRC).toMatch(/\.osc-cmd \{[^}]*border-left/);
  });
});
