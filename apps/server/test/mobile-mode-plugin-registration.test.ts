import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INDEX = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');

describe('移动端模式插件注册', () => {
  it('运维、安全、店铺的前端模式与后端插件必须同时注册', () => {
    for (const id of ['ops-shell', 'sec-lab', 'shop-ops']) {
      expect(INDEX).toMatch(
        new RegExp(`^    await registerPkgOrSource\\('${id}'`, 'm'),
      );
    }
  });

  it('仅 CICD / Java 继续保留桌面专属跳过', () => {
    const start = INDEX.indexOf("await registerPkgOrSource('ops-shell'");
    const end = INDEX.indexOf('// ★ 随包的可后装插件', start);
    const block = INDEX.slice(start, end);
    const guard = block.indexOf('if (!process.env.MOBILE_MODE)');
    expect(guard).toBeGreaterThan(-1);
    const guarded = block.slice(guard, block.indexOf('}', guard) + 1);
    expect(guarded).toContain("registerPkgOrSource('cicd-pipeline'");
    expect(guarded).toContain("registerPkgOrSource('java-suite'");
    expect(guarded).not.toContain("registerPkgOrSource('ops-shell'");
    expect(guarded).not.toContain("registerPkgOrSource('sec-lab'");
    expect(guarded).not.toContain("registerPkgOrSource('shop-ops'");
  });
});
