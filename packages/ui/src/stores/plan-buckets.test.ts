// 任务计划按会话分桶 —— 回归测试。
//
// 背景（真 bug）：task_plan / task_step 早期把计划写进两个 store 级全局 ref
// （planTitle / planSteps），全应用只有一份。于是《驭兽斋》会话登记的四步计划
// 会原样出现在别的会话的进度卡片里（用户实测「会串到别的会话」）。
//
// 这里钉住三件事：
//   1) 计划按会话隔离：A 会话的步骤不出现在 B 会话；
//   2) task_step 只改自己会话的步骤，且越界/无计划时显式报错；
//   3) 会话删除后计划随之清理，不留孤儿键。

import { describe, it, expect } from 'vitest';
import {
  DRAFT_PLAN_KEY,
  planKeyOf,
  readPlan,
  removePlan,
  removePlans,
  applyTaskPlan,
  applyTaskStep,
  planProgress,
  type PlanMap,
} from './plan-buckets';

const CONV_A = 'conv_A';
const CONV_B = 'conv_B';

/** 在指定会话上登记一份计划，返回新的计划表 */
function createPlan(map: PlanMap, key: string, title: string, titles: string[]): PlanMap {
  return applyTaskPlan(map, key, { title, steps: titles.map((t) => ({ title: t })) }).map;
}

describe('planKeyOf', () => {
  it('显式 convId 优先于当前查看的会话', () => {
    expect(planKeyOf(CONV_B, CONV_A)).toBe(CONV_A);
  });

  it('无显式 convId 时用当前查看的会话', () => {
    expect(planKeyOf(CONV_A)).toBe(CONV_A);
  });

  it('都没有时落草稿键（首页刚发消息、会话还没建立）', () => {
    expect(planKeyOf('')).toBe(DRAFT_PLAN_KEY);
    expect(planKeyOf(null, '  ')).toBe(DRAFT_PLAN_KEY);
  });
});

describe('计划按会话隔离（核心回归）', () => {
  it('A 会话的计划不泄漏到 B 会话', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, '驭兽斋预览视频', [
      '阅读/理解小说核心设定与情节',
      '确定预览视频的 15s 分镜脚本',
      '生成视频（文生视频）',
      '整理分析文档并交付',
    ]);

    // A 会话看得到自己的四步
    const planA = readPlan(map, CONV_A);
    expect(planA?.title).toBe('驭兽斋预览视频');
    expect(planA?.steps).toHaveLength(4);

    // B 会话必须是干净的 —— 这正是用户报的 bug
    expect(readPlan(map, CONV_B)).toBeUndefined();
  });

  it('A、B 各自登记计划后互不覆盖', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, 'A 的任务', ['A1', 'A2']);
    map = createPlan(map, CONV_B, 'B 的任务', ['B1']);

    expect(readPlan(map, CONV_A)?.steps.map((s) => s.title)).toEqual(['A1', 'A2']);
    expect(readPlan(map, CONV_B)?.steps.map((s) => s.title)).toEqual(['B1']);
    expect(readPlan(map, CONV_A)?.title).toBe('A 的任务');
  });

  it('同一会话再次 task_plan 时整体替换（不追加）', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, '旧计划', ['x', 'y', 'z']);
    map = createPlan(map, CONV_A, '新计划', ['只有一步']);

    const plan = readPlan(map, CONV_A);
    expect(plan?.title).toBe('新计划');
    expect(plan?.steps.map((s) => s.title)).toEqual(['只有一步']);
  });
});

describe('applyTaskStep', () => {
  it('推进的是指定会话自己的步骤，不影响别会话', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, 'A', ['A1', 'A2']);
    map = createPlan(map, CONV_B, 'B', ['B1', 'B2']);

    map = applyTaskStep(map, CONV_A, { index: 2, status: 'done', note: '已读前 300 行' }).map;

    expect(readPlan(map, CONV_A)?.steps[1].status).toBe('done');
    expect(readPlan(map, CONV_A)?.steps[1].note).toBe('已读前 300 行');
    // B 会话的步骤一个都不能被碰到
    expect(readPlan(map, CONV_B)?.steps.map((s) => s.status)).toEqual(['pending', 'pending']);
  });

  it('无计划的会话里推进步骤 → 显式报错，不再静默写到别会话', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, 'A', ['A1', 'A2', 'A3']);

    // 关键回归点：以前这里 index 落在 A 的范围内会「成功」，把 B 的进度写到 A 上
    const r = applyTaskStep(map, CONV_B, { index: 1, status: 'done' });
    expect(r.outcome.ok).toBe(false);
    expect(r.outcome.msg).toContain('还没有任务计划');
    // A 的计划完全没被动过
    expect(readPlan(map, CONV_A)?.steps[0].status).toBe('pending');
  });

  it('index 越界 / 非数字 → 报错并给出合法范围', () => {
    const map = createPlan({}, CONV_A, 'A', ['A1', 'A2']);

    expect(applyTaskStep(map, CONV_A, { index: 0, status: 'done' }).outcome.ok).toBe(false);
    expect(applyTaskStep(map, CONV_A, { index: 3, status: 'done' }).outcome.ok).toBe(false);
    const nan = applyTaskStep(map, CONV_A, { index: 'abc', status: 'done' }).outcome;
    expect(nan.ok).toBe(false);
    expect(nan.msg).toContain('1-2');
  });

  it('不传 note 时保留原 note（推进状态不该抹掉已有备注）', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, 'A', ['A1']);
    map = applyTaskStep(map, CONV_A, { index: 1, status: 'running', note: '开始读' }).map;
    map = applyTaskStep(map, CONV_A, { index: 1, status: 'done' }).map;

    expect(readPlan(map, CONV_A)?.steps[0].note).toBe('开始读');
    expect(readPlan(map, CONV_A)?.steps[0].status).toBe('done');
  });

  it('失败状态可记录（failed）', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, 'A', ['A1']);
    map = applyTaskStep(map, CONV_A, { index: 1, status: 'failed', note: '接口超时' }).map;

    const p = readPlan(map, CONV_A);
    expect(p?.steps[0].status).toBe('failed');
    expect(planProgress(p).failed).toBe(true);
  });
});

describe('applyTaskPlan 的入参清洗', () => {
  it('丢掉没有 title 的空步骤', () => {
    const r = applyTaskPlan({}, CONV_A, {
      steps: [{ title: '有效' }, { title: '' }, {}, null, { description: '只有描述' }],
    });
    expect(r.map[CONV_A].steps.map((s) => s.title)).toEqual(['有效']);
    expect(r.outcome.ok).toBe(true);
  });

  it('steps 缺失 / 非数组 → 建出空计划，不抛异常', () => {
    for (const bad of [undefined, null, 'oops', 42]) {
      const r = applyTaskPlan({}, CONV_A, { steps: bad as any });
      expect(r.map[CONV_A].steps).toEqual([]);
      expect(r.outcome.ok).toBe(true);
    }
  });

  it('新登记的步骤一律从 pending 起步', () => {
    const r = applyTaskPlan({}, CONV_A, { steps: [{ title: 'A', status: 'done' }] });
    expect(r.map[CONV_A].steps[0].status).toBe('pending');
  });
});

describe('会话删除时清理计划', () => {
  it('removePlan 只删指定会话，返回新表', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, 'A', ['A1']);
    map = createPlan(map, CONV_B, 'B', ['B1']);

    const next = removePlan(map, CONV_A);
    expect(readPlan(next, CONV_A)).toBeUndefined();
    expect(readPlan(next, CONV_B)?.title).toBe('B');
    // 原表未被就地修改
    expect(readPlan(map, CONV_A)).toBeDefined();
  });

  it('删除不存在的会话时返回原引用（不触发无谓的响应式更新）', () => {
    const map = createPlan({}, CONV_A, 'A', ['A1']);
    expect(removePlan(map, 'conv_not_exist')).toBe(map);
  });

  it('removePlans 批量删除（多选删除会话场景）', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, 'A', ['A1']);
    map = createPlan(map, CONV_B, 'B', ['B1']);
    map = createPlan(map, 'conv_C', 'C', ['C1']);

    const next = removePlans(map, [CONV_A, CONV_B]);
    expect(Object.keys(next)).toEqual(['conv_C']);
  });

  it('removePlans 全都不存在时返回原引用', () => {
    const map = createPlan({}, CONV_A, 'A', ['A1']);
    expect(removePlans(map, ['nope1', 'nope2'])).toBe(map);
  });
});

describe('planProgress', () => {
  it('统计完成数与失败态', () => {
    let map: PlanMap = {};
    map = createPlan(map, CONV_A, 'A', ['1', '2', '3', '4']);
    map = applyTaskStep(map, CONV_A, { index: 1, status: 'done' }).map;
    expect(planProgress(readPlan(map, CONV_A))).toEqual({ total: 4, done: 1, failed: false });

    map = applyTaskStep(map, CONV_A, { index: 2, status: 'done' }).map;
    map = applyTaskStep(map, CONV_A, { index: 3, status: 'failed' }).map;
    expect(planProgress(readPlan(map, CONV_A))).toEqual({ total: 4, done: 2, failed: true });
  });

  it('无计划时返回零值', () => {
    expect(planProgress(undefined)).toEqual({ total: 0, done: 0, failed: false });
  });
});