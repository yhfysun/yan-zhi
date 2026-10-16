// 运维连接「跳板机」契约（2026-10-16）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM，无 @vue/test-utils，见 DistillDialog 等同类文件说明），
//   判据一律剥注释后再匹配——注释里出现同一个词会假绿。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const DLG = strip(readFileSync(resolve(__dirname, 'OpsConnectionDialog.vue'), 'utf8'));
const CONSOLE = strip(readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8'));

describe('OpsConnectionDialog · 跳板机表单', () => {
  it('连接结构带 jumpConnectionId（后端靠它落库）', () => {
    expect(DLG).toMatch(/jumpConnectionId\?:\s*string;/);
  });

  it('表单有「跳板机」选择项，绑定 form.jumpConnectionId', () => {
    expect(DLG).toMatch(/label="跳板机"/);
    expect(DLG).toMatch(/v-model="form\.jumpConnectionId"/);
  });

  it('候选来自已有连接，且排除自身与数据库连接（数据库没有 shell 可中转）', () => {
    const opt = DLG.match(/const jumpOptions = computed\(\(\) =>[\s\S]*?\);/);
    expect(opt, '找不到 jumpOptions').toBeTruthy();
    expect(opt![0]).toMatch(/c\.id !== editing\.value\?\.id/);
    expect(opt![0]).toMatch(/!==\s*'database'/);
  });

  it('编辑时回填已存跳板（不回填 = 改个端口就把跳板丢了）', () => {
    expect(DLG).toMatch(/jumpConnectionId:\s*c\.jumpConnectionId\s*\|\|\s*''/);
  });

  it('★ 提交时始终下发 jumpConnectionId（空串=显式清空）；不能写成 || undefined', () => {
    expect(DLG).toMatch(/jumpConnectionId:\s*f\.jumpConnectionId\s*,/);
    // 写成 || undefined 会被 JSON 序列化丢掉，后端当成「未传」→ 跳板清不掉
    expect(DLG).not.toMatch(/jumpConnectionId:\s*f\.jumpConnectionId\s*\|\|/);
  });

  it('新建表单默认不带跳板', () => {
    const empty = DLG.match(/function emptyForm\(\)[\s\S]*?\n\}/);
    expect(empty, '找不到 emptyForm').toBeTruthy();
    expect(empty![0]).toMatch(/jumpConnectionId:\s*''/);
  });
});

describe('OpsConsole · 跳板机展示与依赖提示', () => {
  it('资源行有跳板标记，且提示里给出跳板名', () => {
    expect(CONSOLE).toMatch(/class="ops-conn-jump"/);
    expect(CONSOLE).toMatch(/v-if="row\.conn!\.jumpConnectionId"/);
    expect(CONSOLE).toMatch(/function jumpNameOf\(/);
  });

  it('连接副信息体现「经 X → 地址」', () => {
    const sub = CONSOLE.match(/function connSub\(c: OpsConn\)[\s\S]*?\n\}/);
    expect(sub, '找不到 connSub').toBeTruthy();
    expect(sub![0]).toMatch(/jumpNameOf\(c\)/);
  });

  it('★ 删除连接时，若有下游把它当跳板，确认框必须点明', () => {
    const fn = CONSOLE.match(/async function removeConnection\(c: OpsConn\)[\s\S]*?\n\}/);
    expect(fn, '找不到 removeConnection').toBeTruthy();
    expect(fn![0]).toMatch(/jumpConnectionId === c\.id/);
    expect(fn![0]).toMatch(/跳板机/);
  });

  it('★ 资源树的「测试连接」必须带 id（否则后端拿不到已存密钥，只会回「密码或私钥必填」）', () => {
    const fn = CONSOLE.match(/async function testConnection\(c: OpsConn\)[\s\S]*?\n\}/);
    expect(fn, '找不到 testConnection').toBeTruthy();
    expect(fn![0]).toMatch(/id:\s*c\.id/);
    // 后端失败回的是 error 字段（不是 message），读错字段会把具体原因吞掉
    expect(fn![0]).toMatch(/r\.data\.error/);
    expect(fn![0]).not.toMatch(/r\.data\.message/);
  });
});
