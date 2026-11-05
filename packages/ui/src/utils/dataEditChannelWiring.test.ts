import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.resolve(__dirname, '../views/DataConsolePage.vue'),
  'utf8',
);

describe('DataConsolePage 数据编辑通道', () => {
  it('必须调用预检、确认提交和审计查询三个真实接口', () => {
    expect(source).toContain('/data-edit/preflight');
    expect(source).toContain('/data-edit/apply');
    expect(source).toContain('/data-edit/audits');
  });

  it('预检后必须由用户二次确认，确认后才提交令牌', () => {
    expect(source).toContain('ElMessageBox.confirm');
    const preflight = source.indexOf('/data-edit/preflight');
    const confirm = source.indexOf('ElMessageBox.confirm', preflight);
    const apply = source.indexOf('/data-edit/apply', confirm);
    expect(confirm).toBeGreaterThan(preflight);
    expect(apply).toBeGreaterThan(confirm);
  });

  it('只读数据源不能显示为可执行数据编辑', () => {
    expect(source).toMatch(/:disabled="!activeDs\?\.allowWrite"/);
  });

  it('预检与提交绑定同一个数据源，切换后不得把令牌提交到新数据源', () => {
    expect(source).toContain('const sourceDsId = activeDsId.value');
    expect(source).toContain('activeDsId.value !== sourceDsId');
    expect(source).toContain('`/datasources/${sourceDsId}/data-edit/preflight`');
    expect(source).toContain('`/datasources/${sourceDsId}/data-edit/apply`');
  });

  it('审计记录在窄屏提供可读卡片与刷新入口', () => {
    expect(source).toContain('class="dc-audit-cards"');
    expect(source).toContain('aria-label="刷新数据编辑审计"');
  });
});
