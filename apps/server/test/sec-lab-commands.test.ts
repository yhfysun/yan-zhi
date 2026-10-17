// sec-lab 的**命令声明**守门测试（命令中枢，2026-10-16）。
//
// 为什么必须真跑（而不是断源码里有 commands 这个词）：
//   ① 命令里写的 `tool` 名若与插件实际注册的工具名不符 ⇒ 面板列出 `/portscan`，
//      点下去后端回"未知工具 portscan"（而工具明明在），最难查的一类；
//   ② `params` 写错字段名 ⇒ `/portscan 10.0.0.1` 拼成 `{target:…}` 而工具等的是别的字段名，
//      表现是"参数没生效"（扫了个空目标，**不报错**）；
//   ③ `danger` 与护栏的推导不一致 ⇒ 面板显示"被动"、服务端按主动拦，
//      用户看到的是"标着被动的东西要确认/被拒"。
//   ⇒ 三条都拿**同一份真相源**比对：注册出来的工具实例 + sec-lab-guard 的 TOOL_RISK。

import { describe, it, expect, beforeAll } from 'vitest';
import type { BuiltInTool } from '@yan-zhi/core';
import { secLabManifest, secLabModule } from '../src/plugins/sec-lab.js';
import { HUMAN_ONLY_TOOLS, TOOL_RISK } from '../src/plugins/sec-lab-guard.js';

const tools: BuiltInTool[] = [];

beforeAll(async () => {
  // activate 只需要这四样：注册工具 / 注册后端路由 / 存储 / 日志
  await secLabModule.activate({
    registerTool: (t: BuiltInTool) => { tools.push(t); },
    registerBackendRoute: () => { /* 单测不挂真路由 */ },
    storage: { get: () => null, set: () => {}, remove: () => {}, keys: () => [] },
    log: () => {},
  } as any);
});

const COMMANDS = () => (secLabManifest.contributes as any).commands as Array<Record<string, any>>;

/** 护栏的口径：TOOL_RISK 里没列的工具按默认 active 算（见 sec-lab-guard.ts 的 `TOOL_RISK[i.tool] || 'active'`） */
function expectedDanger(tool: string): string {
  if (HUMAN_ONLY_TOOLS.has(tool)) return 'S';
  const risk = TOOL_RISK[tool] || 'active';
  return ({ passive: 'P', active: 'A', intrusive: 'I' } as Record<string, string>)[risk];
}

describe('★ sec-lab 的 34 条命令与工具一一对应（P0 18 + P1 16）', () => {
  it('工具注册数量与本测试的预期一致（先钉住"34"这个前提）', () => {
    expect(tools.length).toBe(34);
  });

  it('每个注册的工具恰好有一条命令，且命令里的 tool 名真实存在（防拼错）', () => {
    const names = tools.map((t) => t.name).sort();
    const cmds = COMMANDS();
    expect(cmds.length).toBe(34);
    expect(cmds.map((c) => c.tool).sort()).toEqual(names);
    // 声明式清单（contributes.tools）是第三条口径，同样不能漂
    expect([...(secLabManifest.contributes as any).tools].sort()).toEqual(names);
  });

  it('每条命令都有面板需要的字段：kind=tool / pluginId / group / mode / danger / desc / usage', () => {
    for (const c of COMMANDS()) {
      expect(c.kind, `${c.name} 的 kind`).toBe('tool');
      expect(c.pluginId, `${c.name} 的 pluginId`).toBe('sec-lab');
      expect(c.tool, `${c.name} 的 tool`).toBeTruthy();
      expect(c.group, `${c.name} 的 group`).toBeTruthy();
      // ★ mode:'sec' ⇒ 只在安全模式的面板里出现（办公模式列一堆扫描命令没有意义）
      expect(c.mode, `${c.name} 的 mode`).toBe('sec');
      expect(c.desc, `${c.name} 的 desc`).toBeTruthy();
      expect(c.usage, `${c.name} 的 usage`).toBeTruthy();
      expect(String(c.usage).startsWith('/'), `${c.name} 的 usage 应以 / 开头`).toBe(true);
    }
  });

  it('命令名唯一（同名会互相遮蔽），别名也不与别条的命令名撞', () => {
    const cmds = COMMANDS();
    const names = cmds.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    const aliases = cmds.flatMap((c) => c.aliases || []);
    // 别名撞上命令名 ⇒ 那条命令永远轮不到（findCommand 命中谁取决于顺序）
    expect(aliases.filter((a: string) => names.includes(a)), '别名与命令名冲突').toEqual([]);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe('★★ 命令的 params / danger 必须与工具真相源同口径', () => {
  it('params 里的每个字段名都真实存在于该工具的 inputSchema.properties', () => {
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const c of COMMANDS()) {
      const tool = byName.get(c.tool)!;
      const props = Object.keys((tool.inputSchema as any)?.properties || {});
      for (const p of c.params || []) {
        expect(props, `★ ${c.name} 的 params 里 "${p}" 不在 ${c.tool} 的 schema 里（位置参数会塞进一个不存在的字段）`)
          .toContain(p);
      }
    }
  });

  it('schema 里的必填项必须能从位置参数或 usage 给到（否则用户只能靠猜）', () => {
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const c of COMMANDS()) {
      const tool = byName.get(c.tool)!;
      const required = ((tool.inputSchema as any)?.required || []) as string[];
      for (const req of required) {
        const viaPosition = (c.params || []).includes(req);
        const viaUsage = String(c.usage || '').includes(req);
        expect(viaPosition || viaUsage, `★ ${c.name}: 必填字段 "${req}" 既不在 params 里也没写进 usage`).toBe(true);
      }
    }
  });

  it('danger 与 sec-lab-guard 的推导逐条一致（标错会让"被动/主动"的显示与判定打架）', () => {
    for (const c of COMMANDS()) {
      expect(c.danger, `${c.name}(${c.tool}) 的 danger`).toBe(expectedDanger(c.tool));
    }
  });

  it('★ confirm 与工具 schema 是否要求 confirmed 同源（否则用户敲完命令收到一句"必须为 true"）', () => {
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const c of COMMANDS()) {
      const props = (byName.get(c.tool)!.inputSchema as any)?.properties || {};
      const schemaNeedsConfirm = Object.prototype.hasOwnProperty.call(props, 'confirmed');
      expect(!!c.confirm, `${c.name}(${c.tool}) 的 confirm 应与 schema 的 confirmed 字段同源`)
        .toBe(schemaNeedsConfirm);
    }
    // 人工闸门的工具一定在其中（attack_sim 的 schema 也有 confirmed）
    const attack = COMMANDS().find((c) => c.tool === 'attack_sim')!;
    expect(attack.confirm).toBe(true);
  });

  it('人工闸门的工具（attack_sim）必须是 simulate 级，描述里点明只能人工执行', () => {
    const attack = COMMANDS().find((c) => c.tool === 'attack_sim')!;
    expect(attack.danger).toBe('S');
    expect(attack.desc).toContain('人工');
  });

  it('params 里必填项的相对顺序与 schema 的 required 顺序一致（否则位置参数会错位）', () => {
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const c of COMMANDS()) {
      const required = ((byName.get(c.tool)!.inputSchema as any)?.required || []) as string[];
      const positional = (c.params || []).filter((p: string) => required.includes(p));
      expect(positional, `${c.name} 的必填位置参数顺序与 schema 不一致`)
        .toEqual(required.filter((r: string) => (c.params || []).includes(r)));
    }
  });
});

describe('★ 剧本（`@名字` 召唤）：每一步都必须是**已声明的命令**', () => {
  const PLAYBOOKS = () => (secLabManifest.contributes as any).playbooks as Array<Record<string, any>>;

  it('6 个内置剧本，字段齐备且限定安全模式', () => {
    expect(PLAYBOOKS().length).toBe(6);
    for (const pb of PLAYBOOKS()) {
      expect(pb.id, '剧本缺 id').toBeTruthy();
      expect(pb.name, `${pb.id} 缺召唤名`).toBeTruthy();
      expect(pb.desc, `${pb.id} 缺说明`).toBeTruthy();
      expect(Array.isArray(pb.steps) && pb.steps.length, `${pb.id} 没有步骤`).toBeTruthy();
      expect(pb.mode, `${pb.id} 的 mode`).toBe('sec');
    }
  });

  it('★★ 每一步引用的命令都真实存在（防拼错、防提前声明还不存在的命令）', () => {
    const known = new Set<string>();
    for (const c of COMMANDS()) {
      known.add(c.name);
      for (const a of c.aliases || []) known.add(a);
    }
    for (const pb of PLAYBOOKS()) {
      for (const step of pb.steps) {
        expect(String(step).startsWith('/'), `剧本「${pb.name}」的步骤 "${step}" 应以 / 开头`).toBe(true);
        const cmd = String(step).slice(1).split(/\s+/)[0];
        expect(known, `★ 剧本「${pb.name}」引用了不存在的命令 /${cmd}（展开后那一步会直接报"没有这条命令"）`)
          .toContain(cmd);
      }
    }
  });

  it('id 与召唤名都唯一（重名会让召唤命中哪一个是随机的）', () => {
    const ids = PLAYBOOKS().map((p) => p.id);
    const names = PLAYBOOKS().map((p) => p.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('「完整评估」标了逐条确认（方案写明"全流程，需人工确认每一步"）', () => {
    expect(PLAYBOOKS().find((p) => p.id === 'full-assessment')!.confirmEach).toBe(true);
  });

  it('剧本步骤里出现的占位符都能被人填（只允许 ${target} / ${assetId} / ${logPath}）', () => {
    const allowed = new Set(['target', 'assetId', 'logPath']);
    for (const pb of PLAYBOOKS()) {
      for (const step of pb.steps) {
        for (const m of String(step).matchAll(/\$\{(\w+)\}/g)) {
          expect(allowed, `★ 剧本「${pb.name}」用了没人填得出的占位符 \${${m[1]}}`).toContain(m[1]);
        }
      }
    }
  });
});
