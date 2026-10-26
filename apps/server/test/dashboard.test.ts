// 看板存取单测：建表 / 用户隔离 / widget 幂等写入 / 拖拽重排。
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

process.env.DATA_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-dashboard-'));

type Svc = typeof import('../src/services/dashboard.js');
let svc: Svc;

beforeAll(async () => {
  svc = await import('../src/services/dashboard.js');
});

const chartWidget = (id = 'w1', w = 6) => ({
  id,
  kind: 'chart',
  title: '按天趋势',
  contract: { table: 'conversation', filterCols: ['pinned'] },
  spec: { kind: 'line', dim: 'created_at', measure: 'id', agg: 'count' },
  pos: { x: 0, y: 0, w, h: 6 },
});

describe('看板存取', () => {
  it('创建 → 列表 → 读取，widget 初始为空', () => {
    const created = svc.createDashboard('u1', { title: '运营看板' });
    expect(created.id).toMatch(/^dash_/);
    expect(created.widgets).toEqual([]);

    const list = svc.listDashboards('u1');
    expect(list.some((d) => d.id === created.id && d.widgetCount === 0)).toBe(true);

    const got = svc.getDashboard('u1', created.id);
    expect(got.title).toBe('运营看板');
  });

  it('标题为空直接拒绝', () => {
    expect(() => svc.createDashboard('u1', { title: '   ' })).toThrow(/标题/);
  });

  it('用户隔离：别人的看板读不到', () => {
    const created = svc.createDashboard('u2', { title: '别人的' });
    expect(() => svc.getDashboard('u1', created.id)).toThrow(/不存在|无权/);
    expect(svc.listDashboards('u1').some((d) => d.id === created.id)).toBe(false);
  });

  it('widget 按 id 幂等写入（改 pos 不新增行）', () => {
    const dash = svc.createDashboard('u3', { title: 'KPI' });
    let got = svc.saveWidget('u3', dash.id, chartWidget('w1', 6));
    expect(got.widgets).toHaveLength(1);
    expect(got.widgets![0].pos.w).toBe(6);

    got = svc.saveWidget('u3', dash.id, chartWidget('w1', 12));
    expect(got.widgets).toHaveLength(1);
    expect(got.widgets![0].pos.w).toBe(12);
  });

  it('非法 widget 被拒绝（kind / pos / chart spec）', () => {
    const dash = svc.createDashboard('u3', { title: 'bad' });
    expect(() => svc.saveWidget('u3', dash.id, { id: 'x', kind: 'video', pos: { x: 0, y: 0, w: 1, h: 1 } }))
      .toThrow(/kind/);
    expect(() => svc.saveWidget('u3', dash.id, { id: 'x', kind: 'text', pos: { x: 0, y: 0, w: 13, h: 1 } }))
      .toThrow(/pos/);
    expect(() => svc.saveWidget('u3', dash.id, { id: 'x', kind: 'chart', pos: { x: 0, y: 0, w: 6, h: 6 } }))
      .toThrow(/spec/);
  });

  it('重排只改顺序，widget 内容不变', () => {
    const dash = svc.createDashboard('u4', { title: '排序' });
    svc.saveWidget('u4', dash.id, chartWidget('a'));
    svc.saveWidget('u4', dash.id, chartWidget('b'));
    const got = svc.reorderWidgets('u4', dash.id, ['b', 'a']);
    expect(got.widgets!.map((w) => w.id)).toEqual(['b', 'a']);
    expect(() => svc.reorderWidgets('u4', dash.id, ['b'])).toThrow(/不一致/);
  });

  it('同一 widget id 钉进两个看板：换发新 id，不覆盖原看板', () => {
    const a = svc.createDashboard('u6', { title: 'A' });
    const b = svc.createDashboard('u6', { title: 'B' });
    const first = svc.saveWidget('u6', a.id, chartWidget('shared'));
    const second = svc.saveWidget('u6', b.id, chartWidget('shared'));
    expect(first.widgets![0].id).toBe('shared');
    expect(second.widgets![0].id).not.toBe('shared');
    expect(svc.getDashboard('u6', a.id).widgets).toHaveLength(1);
  });

  it('删除看板连带删掉 widget', () => {
    const dash = svc.createDashboard('u5', { title: '临时' });
    svc.saveWidget('u5', dash.id, chartWidget());
    svc.deleteDashboard('u5', dash.id);
    expect(svc.listDashboards('u5').some((d) => d.id === dash.id)).toBe(false);
  });
});
