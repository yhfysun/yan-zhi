// 端到端：扫描 → 规则方案 → 执行 → 回滚（临时桌面目录，不碰真实桌面）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { desktopManagerModule } from './index.js';

function makeCtx() {
  const store = new Map();
  const tools = {};
  return {
    tools,
    ctx: {
      storage: {
        get: async (k) => store.get(k),
        set: async (k, v) => { store.set(k, v); },
        delete: async (k) => { store.delete(k); },
      },
      registerTool: (t) => { tools[t.name] = t; },
      log: () => {},
    },
  };
}

function body(res) {
  return JSON.parse(res.content[0].text);
}

test('桌面整理：方案 → 执行 → 回滚 全链路', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'yz-desktop-'));
  const prev = process.env.YZ_DESKTOP_DIR;
  process.env.YZ_DESKTOP_DIR = dir;
  try {
    for (const n of ['a.docx', 'b.xlsx', 'c.png', '未命名文档 (3)', 'Chrome.lnk']) {
      await fsp.writeFile(path.join(dir, n), 'x');
    }

    const { ctx, tools } = makeCtx();
    desktopManagerModule.activate(ctx);

    const scan = body(await tools.desktop_scan.execute({}, { userId: 'u1' }));
    assert.equal(scan.files, 5);
    assert.deepEqual(scan.rulePreview.unclassified, ['未命名文档 (3)']);
    assert.ok(scan.rulePreview.kept >= 1);

    const plan = body(await tools.desktop_plan.execute({ strategy: 'rules' }, { userId: 'u1' }));
    assert.equal(plan.mode, 'rules');
    assert.ok(plan.planId);
    assert.ok(plan.groups.length >= 3);
    // 只产出方案，不移动
    assert.ok(fs.existsSync(path.join(dir, 'a.docx')));

    const refuse = body(await tools.desktop_apply.execute({ planId: plan.planId, confirmed: false }, { userId: 'u1' }));
    assert.equal(refuse.ok, false);

    const applied = body(await tools.desktop_apply.execute({ planId: plan.planId, confirmed: true }, { userId: 'u1' }));
    assert.equal(applied.ok, true);
    assert.equal(applied.moved, 3); // docx/xlsx/png 入组，.lnk 保留
    assert.ok(!fs.existsSync(path.join(dir, 'a.docx')));
    assert.ok(fs.existsSync(path.join(dir, '文档', 'a.docx')));
    assert.ok(fs.existsSync(path.join(dir, 'Chrome.lnk')));

    const undone = body(await tools.desktop_undo.execute({ opId: applied.opId, confirmed: true }, { userId: 'u1' }));
    assert.equal(undone.ok, true);
    assert.equal(undone.reverted, 3);
    assert.ok(fs.existsSync(path.join(dir, 'a.docx')));
    assert.ok(!fs.existsSync(path.join(dir, '文档', 'a.docx')));
  } finally {
    if (prev === undefined) delete process.env.YZ_DESKTOP_DIR;
    else process.env.YZ_DESKTOP_DIR = prev;
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('同名冲突不覆盖：目标已存在时自动改名', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'yz-desktop-'));
  const prev = process.env.YZ_DESKTOP_DIR;
  process.env.YZ_DESKTOP_DIR = dir;
  try {
    await fsp.writeFile(path.join(dir, 'a.docx'), 'first');
    await fsp.mkdir(path.join(dir, '文档'), { recursive: true });
    await fsp.writeFile(path.join(dir, '文档', 'a.docx'), 'existing');

    const { ctx, tools } = makeCtx();
    desktopManagerModule.activate(ctx);
    const plan = body(await tools.desktop_plan.execute({ strategy: 'rules' }, { userId: 'u1' }));
    const applied = body(await tools.desktop_apply.execute({ planId: plan.planId, confirmed: true }, { userId: 'u1' }));

    assert.equal(applied.ok, true);
    assert.equal(await fsp.readFile(path.join(dir, '文档', 'a.docx'), 'utf8'), 'existing');
    assert.equal(await fsp.readFile(path.join(dir, '文档', 'a (2).docx'), 'utf8'), 'first');
  } finally {
    if (prev === undefined) delete process.env.YZ_DESKTOP_DIR;
    else process.env.YZ_DESKTOP_DIR = prev;
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('AI 模式无模型时回落规则并标注', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'yz-desktop-'));
  const prev = process.env.YZ_DESKTOP_DIR;
  const prevHost = globalThis.__YZ_SERVER_HOST__;
  process.env.YZ_DESKTOP_DIR = dir;
  delete globalThis.__YZ_SERVER_HOST__;
  try {
    await fsp.writeFile(path.join(dir, '未命名'), 'x');
    const { ctx, tools } = makeCtx();
    desktopManagerModule.activate(ctx);
    const plan = body(await tools.desktop_plan.execute({ strategy: 'ai' }, { userId: 'u1' }));
    assert.equal(plan.mode, 'rules');
    assert.equal(plan.fallback.code, 'no-model');
    assert.match(plan.note, /AI 不可用/);
    assert.deepEqual(plan.unclassified, ['未命名']);
  } finally {
    if (prev === undefined) delete process.env.YZ_DESKTOP_DIR;
    else process.env.YZ_DESKTOP_DIR = prev;
    if (prevHost !== undefined) globalThis.__YZ_SERVER_HOST__ = prevHost;
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
