/**
 * 资源目录骨架 —— 真机磁盘集成测试（真实 fs + 临时目录，只桩掉 db/state）。
 *
 * 为什么必须是集成测试而不是纯静态断言：
 *   这里的安全底线是「**幂等且绝不覆盖用户已放进去的素材**」——
 *   静态读源码只能证明"没有出现 rm 调用"，证明不了"重复切类型后文件还在"。
 *   用户会反复切类型、反复进出目录，一旦误删就是不可逆的数据丢失。
 *
 * 覆盖：
 *   ① 首次设类型建出四段目录 + task.json；
 *   ② 重复设同一类型：幂等，用户素材原封不动，createdDirs 为空；
 *   ③ 切换类型：骨架不变、素材仍在、task.json 更新；
 *   ④ 清空类型：目录与素材都保留（只解除绑定，不删数据）；
 *   ⑤ 未绑定目录的空间回落 workspace/spaces/<id>，同样可用；
 *   ⑥ 未知资源目录被拒绝（防路径穿越）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 沙箱：一次测试一个临时根，避免相互污染
const box = vi.hoisted(() => {
  const fsMod = require('node:fs');
  const osMod = require('node:os');
  const pathMod = require('node:path');
  const root = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'yz-res-'));
  return {
    root,
    userDir: pathMod.join(root, 'user-dir'),
    wsDir: pathMod.join(root, 'ws'),
    /** 桩空间行：dir_path 由各用例改写 */
    spaceRow: { id: 'sp_t', user_id: 'u_t', name: '测试空间', dir_path: null as string | null, task_type: null as string | null, task_config_json: null },
  };
});

vi.mock('../src/db.js', () => ({
  db: {
  // 2026-10-02：补齐 db.js 导出（手写白名单 mock 必须与生产代码同步，否则报
  //   `No "X" export is defined on the "../src/db.js" mock`，表象却是「任务 failed」）。
  MESSAGE_LIST_COLS:
  'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => 'sum_test',
  deleteMessageSummariesAfter: () => 0,
  clearMessageSummaries: () => {},
    prepare: (sql: string) => ({
      get: () => (/FROM space WHERE id/.test(sql) ? box.spaceRow : undefined),
      all: () => [],
      run: (...args: unknown[]) => {
        if (/UPDATE space SET task_type/.test(sql)) box.spaceRow.task_type = args[0] as string | null;
      },
    }),
  },
  hasSqliteVec: false,
}));
vi.mock('../src/state.js', () => ({ serverState: { workspaceDir: box.wsDir } }));

const load = () => import('../src/services/space-resources');

beforeEach(() => {
  fs.mkdirSync(box.userDir, { recursive: true });
  fs.mkdirSync(box.wsDir, { recursive: true });
  box.spaceRow.dir_path = box.userDir;
  box.spaceRow.task_type = null;
});

afterEach(() => {
  for (const d of ['00-source', '01-reference', '02-work', '03-output', '.yan-zhi']) {
    fs.rmSync(path.join(box.userDir, d), { recursive: true, force: true });
  }
});

describe('① 首次设类型：建骨架', () => {
  it('★ 四段目录 + task.json 都建出来，且回执列出本次新建的四段', async () => {
    const { setSpaceTaskType } = await load();
    const r = await setSpaceTaskType('u_t', 'sp_t', 'short_drama');
    expect(r.root).toBe(box.userDir);
    for (const d of ['00-source', '01-reference', '02-work', '03-output']) {
      expect(fs.existsSync(path.join(box.userDir, d)), `★ ${d} 未创建`).toBe(true);
    }
    expect(new Set(r.createdDirs)).toEqual(new Set(['00-source', '01-reference', '02-work', '03-output']));
    const meta = JSON.parse(fs.readFileSync(path.join(box.userDir, '.yan-zhi/task.json'), 'utf-8'));
    expect(meta.taskType).toBe('short_drama');
    expect(meta.resourceDirs).toContain('00-source');
  });
});

describe('② 幂等：重复设同一类型不得动用户素材（数据安全底线）', () => {
  it('★★ 用户放进去的素材原封不动，createdDirs 为空，changed=false', async () => {
    const { setSpaceTaskType } = await load();
    await setSpaceTaskType('u_t', 'sp_t', 'short_drama');

    // 用户往目录里放素材（正是产品预期的用法）
    const script = path.join(box.userDir, '00-source', '我的剧本.txt');
    fs.writeFileSync(script, '第一集 内容……', 'utf-8');
    const card = path.join(box.userDir, '02-work', '人物卡.md');
    fs.writeFileSync(card, '# 主角', 'utf-8');

    const r2 = await setSpaceTaskType('u_t', 'sp_t', 'short_drama');

    expect(fs.readFileSync(script, 'utf-8'), '★★ 素材被改动了').toBe('第一集 内容……');
    expect(fs.existsSync(card), '★ 02-work 下的草稿被删了').toBe(true);
    expect(r2.createdDirs, '★ 已存在的目录被当成"新建"回报（回执骗人）').toEqual([]);
    expect(r2.changed, '★ 同类型重设不该算变更').toBe(false);
  });
});

describe('③ 切换类型：骨架不变、素材仍在', () => {
  it('★ 反复切类型（用户最容易踩的路径）不得丢文件', async () => {
    const { setSpaceTaskType } = await load();
    await setSpaceTaskType('u_t', 'sp_t', 'short_drama');
    const script = path.join(box.userDir, '00-source', '剧本.txt');
    fs.writeFileSync(script, '内容', 'utf-8');

    await setSpaceTaskType('u_t', 'sp_t', 'translate');
    await setSpaceTaskType('u_t', 'sp_t', 'audiobook');
    await setSpaceTaskType('u_t', 'sp_t', 'short_drama');

    expect(fs.existsSync(script), '★★ 反复切类型把素材弄丢了').toBe(true);
    expect(fs.readFileSync(script, 'utf-8')).toBe('内容');
    const meta = JSON.parse(fs.readFileSync(path.join(box.userDir, '.yan-zhi/task.json'), 'utf-8'));
    expect(meta.taskType).toBe('short_drama');
  });

  it('★★ 改类型后 task.json 的类型必须跟着变（不能留着上一个）', async () => {
    // 实测踩到：合并写只"保留旧值"，改类型后文件里还写着上一个类型 ——
    // 用户把整个目录拷到别的机器上，读到的就是过期类型（task.json 存在的意义就是跟着目录走）。
    const { setSpaceTaskType } = await load();
    const metaPath = path.join(box.userDir, '.yan-zhi/task.json');

    await setSpaceTaskType('u_t', 'sp_t', 'novel_rewrite');
    expect(JSON.parse(fs.readFileSync(metaPath, 'utf-8')).taskType, '★ 首次写入不对').toBe('novel_rewrite');

    await setSpaceTaskType('u_t', 'sp_t', 'dubbing');
    const after = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(after.taskType, '★★ 改类型后 task.json 仍写着旧类型（拷到别的机器会读到过期值）').toBe('dubbing');
    expect(after.taskTypeLabel, '★★ 类型显示名也没跟着改').toBe('配音');
  });

  it('★ 用户素材与"本次新建"回执在改类型时同样正确', async () => {
    const { setSpaceTaskType } = await load();
    await setSpaceTaskType('u_t', 'sp_t', 'novel_rewrite');
    const src = path.join(box.userDir, '00-source', '原文.txt');
    fs.writeFileSync(src, '第一章……', 'utf-8');
    const r = await setSpaceTaskType('u_t', 'sp_t', 'script_copy');
    expect(r.changed, '★ 改了类型 changed 应为 true').toBe(true);
    expect(r.createdDirs, '★ 目录早就有了，不该报"本次新建"').toEqual([]);
    expect(fs.readFileSync(src, 'utf-8'), '★★ 改类型动了用户素材').toBe('第一章……');
  });
});

describe('④ 清空类型：只解除绑定，不删数据', () => {
  it('★ 设为通用后目录与素材都保留', async () => {
    const { setSpaceTaskType } = await load();
    await setSpaceTaskType('u_t', 'sp_t', 'comic');
    const f = path.join(box.userDir, '00-source', 'a.png');
    fs.writeFileSync(f, 'x');
    const r = await setSpaceTaskType('u_t', 'sp_t', null);
    expect(r.taskType, '★ 清空后应回落到 general').toBe('general');
    expect(fs.existsSync(f), '★ 清空类型把素材删了').toBe(true);
    expect(fs.existsSync(path.join(box.userDir, '00-source'))).toBe(true);
  });

  it('★★ 清空后 task.json 里的类型标记要清掉（DB 已无类型，文件不能还说有）', async () => {
    // 实测踩到：DB 已是"通用"（不再注入 SOP），文件里却还写着 dubbing
    // → 用户看目录以为还是配音任务，拷到别的机器更会误导。
    const { setSpaceTaskType } = await load();
    const metaPath = path.join(box.userDir, '.yan-zhi/task.json');
    await setSpaceTaskType('u_t', 'sp_t', 'dubbing');
    expect(JSON.parse(fs.readFileSync(metaPath, 'utf-8')).taskType).toBe('dubbing');

    await setSpaceTaskType('u_t', 'sp_t', null);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(meta.taskType, '★★ 清空类型后文件里仍留着旧类型（DB 与文件不一致）').toBeUndefined();
    expect(meta.taskTypeLabel, '★★ 类型显示名没清掉').toBeUndefined();
    // ★ 只清类型相关字段，其它机器状态要保留（spaceId / resourceDirs 是目录身份信息）
    expect(meta.spaceId, '★★ 清类型时把 spaceId 也删了').toBe('sp_t');
    expect(meta.resourceDirs, '★★ 清类型时把资源目录清单也删了').toBeTruthy();
  });

  it('★ 非法类型按"通用"处理（fail-safe，不写脏值）', async () => {
    const { setSpaceTaskType } = await load();
    const r = await setSpaceTaskType('u_t', 'sp_t', 'not_a_real_type');
    expect(r.taskType).toBe('general');
    expect(box.spaceRow.task_type).toBeNull();
  });
});

describe('⑤ 未绑定目录的空间可用（回落 workspace/spaces/<id>）', () => {
  it('★ dir_path 为空时不报错，落到 ws/spaces/<id>', async () => {
    box.spaceRow.dir_path = null;
    const { setSpaceTaskType } = await load();
    const r = await setSpaceTaskType('u_t', 'sp_t', 'longform');
    expect(r.bound, '★ 未绑定目录应标记 bound=false').toBe(false);
    expect(r.root).toBe(path.join(box.wsDir, 'spaces', 'sp_t'));
    expect(fs.existsSync(path.join(r.root, '00-source'))).toBe(true);
    // 清理这次产生的目录（在 ws 下，不在 afterEach 的 userDir 范围）
    fs.rmSync(r.root, { recursive: true, force: true });
  });
});

describe('⑥ 列举资源目录', () => {
  it('★ 找到用户素材、忽略隐藏文件、拒绝未知目录（防穿越）', async () => {
    const { setSpaceTaskType, listResourceDir } = await load();
    await setSpaceTaskType('u_t', 'sp_t', 'short_drama');
    fs.writeFileSync(path.join(box.userDir, '00-source', '剧本.txt'), 'x');
    fs.writeFileSync(path.join(box.userDir, '00-source', '.隐藏'), 'x');

    const list = await listResourceDir('sp_t', '00-source');
    expect(list.map((e) => e.name)).toEqual(['剧本.txt']);

    await expect(listResourceDir('sp_t', '../../etc'), ).rejects.toThrow(/未知的资源目录/);
    await expect(listResourceDir('sp_t', '99-nope')).rejects.toThrow(/未知的资源目录/);
  });

  it('★ 概览给出四段的项数（提示词注入与面板都用它）', async () => {
    const { setSpaceTaskType, summarizeResourceDirs } = await load();
    await setSpaceTaskType('u_t', 'sp_t', 'translate');
    fs.writeFileSync(path.join(box.userDir, '00-source', '原文.txt'), 'x');
    fs.writeFileSync(path.join(box.userDir, '01-reference', '术语表.csv'), 'x');
    const sum = await summarizeResourceDirs('sp_t');
    expect(sum).toHaveLength(4);
    expect(sum.find((s) => s.dir === '00-source')!.count).toBe(1);
    expect(sum.find((s) => s.dir === '01-reference')!.count).toBe(1);
    expect(sum.find((s) => s.dir === '03-output')!.count).toBe(0);
  });
});