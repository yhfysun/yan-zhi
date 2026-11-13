import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  createAutomationScript,
  getAutomationScript,
  listAutomationScripts,
  publishAutomationScript,
  updateAutomationScript,
} from '../src/services/automation.js';
import { startAutomationRun } from '../src/services/automation-runner.js';

const USER = `automation-test-${Date.now()}`;

function draft() {
  return {
    schemaVersion: 1,
    name: '每日报表同步',
    description: '导出报表并校验',
    kind: 'browser',
    params: [
      {
        key: 'date',
        label: '日期',
        type: 'string',
        required: true,
        defaultValue: '2026-11-13',
      },
    ],
    steps: [
      {
        id: 's1',
        type: 'browser.navigate',
        url: 'https://example.com/reports',
      },
      {
        id: 's2',
        type: 'browser.click',
        target: { by: 'role', role: 'button', name: '导出' },
      },
    ],
  };
}

afterEach(() => {
  db.prepare('DELETE FROM automation_run WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM automation_script_version WHERE script_id IN (SELECT id FROM automation_script WHERE user_id = ?)').run(USER);
  db.prepare('DELETE FROM automation_script WHERE user_id = ?').run(USER);
});

describe('automation script service', () => {
  it('创建脚本时生成 v1 草稿与不可变版本快照', () => {
    const created = createAutomationScript(USER, draft());

    expect(created.id).toMatch(/^auto_/);
    expect(created.status).toBe('draft');
    expect(created.version).toBe(1);
    expect(created.publishedVersion).toBeNull();
    const row = db.prepare(
      'SELECT version, snapshot_json FROM automation_script_version WHERE script_id = ?',
    ).get(created.id) as any;
    expect(row.version).toBe(1);
    expect(JSON.parse(row.snapshot_json).steps).toHaveLength(2);
  });

  it('发布后更新脚本会生成新草稿版本，但已发布版本仍可单独读取', () => {
    const created = createAutomationScript(USER, draft());
    const published = publishAutomationScript(USER, created.id);

    expect(published.status).toBe('published');
    expect(published.publishedVersion).toBe(1);

    const updated = updateAutomationScript(USER, created.id, {
      ...draft(),
      description: '新增文件校验',
      steps: [
        ...draft().steps,
        { id: 's3', type: 'browser.assertText', text: '导出完成' },
      ],
    });

    expect(updated.status).toBe('draft');
    expect(updated.version).toBe(2);
    expect(updated.publishedVersion).toBe(1);
    expect(getAutomationScript(USER, created.id, { version: 1 })?.description).toBe('导出报表并校验');
    expect(getAutomationScript(USER, created.id)?.description).toBe('新增文件校验');
  });

  it('列表按更新时间倒序返回并带最近运行摘要字段', () => {
    createAutomationScript(USER, { ...draft(), name: '较早脚本' });
    createAutomationScript(USER, { ...draft(), name: '较新脚本' });
    const list = listAutomationScripts(USER);

    expect(list.map((item) => item.name)).toEqual(['较新脚本', '较早脚本']);
    expect(list[0].lastRun).toBeNull();
  });

  it('拒绝非法步骤并且不写入数据库', () => {
    expect(() =>
      createAutomationScript(USER, {
        ...draft(),
        steps: [{ id: 's1', type: 'browser.navigate', url: 'file:///etc/passwd' }],
      }),
    ).toThrow(/http\/https/);

    expect(listAutomationScripts(USER)).toHaveLength(0);
  });

  it('正式运行不能通过显式版本参数绕过发布状态', () => {
    const created = createAutomationScript(USER, draft());
    expect(() =>
      startAutomationRun({ userId: USER, scriptId: created.id, input: {}, allowDraft: false }),
    ).toThrow(/尚未发布/);

    publishAutomationScript(USER, created.id);
    updateAutomationScript(USER, created.id, { ...draft(), description: '草稿 v2' });
    expect(() =>
      startAutomationRun({
        userId: USER,
        scriptId: created.id,
        input: {},
        version: 2,
        allowDraft: false,
      }),
    ).toThrow(/只能使用已发布版本 v1/);
  });
});
