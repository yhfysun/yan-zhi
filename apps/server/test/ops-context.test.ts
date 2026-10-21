/**
 * 运维现场上下文注入守门（2026-10-21）。
 *
 * 背景：用户实报「我就发了一句话还自动拼接」。根因是前端把
 * `用户原话 + （当前选定连接…） + （当前终端现场…）` 拼成一整段当 userContent 提交，
 * 导致 ①用户消息入库即脏 ②显示层只能靠正则剥离 ③每轮把整份现场塞进用户回合。
 *
 * 定案：**用户原话只进用户回合，现场进系统提示词**，且现场详情一律服务端按 id 回查。
 * 本测试钉住这四条口径，防止有人图省事又把字符串拼回消息里。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpsFieldContext, type OpsContextInput } from '../src/ops-context.js';

const SRC = (p: string) => readFileSync(resolve(__dirname, '..', 'src', p), 'utf8');

const conn = {
  id: 'c1', name: '42', type: 'ssh', host: '192.168.10.42', port: 22,
  username: 'app', tag: '生产',
};

describe('buildOpsFieldContext —— 现场段', () => {
  it('连接信息来自服务端回查对象（不是前端传的字符串）', () => {
    const out = buildOpsFieldContext({ input: { connectionId: 'c1' }, connection: conn });
    expect(out).toContain('当前连接：42（SSH，app@192.168.10.42:22，标签 生产）');
    expect(out).toContain('connection 参数填上面这个连接名');
  });

  it('数据库连接给出库类型与库名', () => {
    const out = buildOpsFieldContext({
      input: { connectionId: 'c2' },
      connection: { id: 'c2', name: 'pg', type: 'database', host: 'h', port: 5432, username: 'u', dbType: 'postgres', database: 'demo' },
    });
    expect(out).toContain('PostgreSQL · u@h:5432/demo');
  });

  it('未选连接时给出显式提示（而不是空段里让模型瞎猜）', () => {
    const out = buildOpsFieldContext({ input: { connectionId: null } });
    expect(out).toContain('当前没有选定连接');
  });

  it('终端现场包含最近命令与输出尾部，并声明「非用户发言」', () => {
    const out = buildOpsFieldContext({
      input: { connectionId: 'c1', recentCommands: ['docker ps', 'df -h'], terminalTail: 'No such file' },
      connection: conn,
    });
    expect(out).toContain('终端现场');
    expect(out).toContain('docker ps');
    expect(out).toContain('df -h');
    expect(out).toContain('No such file');
    expect(out).toContain('不是用户说的话');
    // 提示模型别重复跑同一条命令
    expect(out).toContain('不要重复跑同一条命令');
  });

  it('终端输出超长时保留尾部（报错现场在最后几行）', () => {
    const long = 'A'.repeat(5000) + 'TAIL_MARK';
    const out = buildOpsFieldContext({ input: { connectionId: 'c1', terminalTail: long }, connection: conn });
    expect(out).toContain('TAIL_MARK');
    expect(out).toContain('…（前略）');
    // 截断生效：注入文本明显短于原文
    expect(out.length).toBeLessThan(long.length);
  });

  it('最近命令最多带 6 条', () => {
    const cmds = Array.from({ length: 12 }, (_, i) => `cmd${i}`);
    const out = buildOpsFieldContext({ input: { connectionId: 'c1', recentCommands: cmds }, connection: conn });
    expect(out).toContain('cmd11');
    expect(out).not.toContain('cmd5\n');
    expect(out).not.toContain('cmd0');
  });

  it('发布项目：目标连接名按 id 解析（改名后不残留旧值）', () => {
    const out = buildOpsFieldContext({
      input: { connectionId: 'c1', releaseProjectId: 'p1' },
      connection: conn,
      releaseProject: {
        name: 'demo', localDir: '/work/demo',
        techStack: { buildType: 'vite' },
        buildHint: { command: 'pnpm build', artifact: 'dist' },
        targets: [{ name: '生产', connectionId: 'c1', remotePath: '/opt/app', restartScript: 'docker restart app' }],
      },
      resolveConnectionName: (id) => (id === 'c1' ? '42' : undefined),
    });
    expect(out).toContain('已绑定的发布项目：demo');
    expect(out).toContain('/work/demo');
    expect(out).toContain('pnpm build');
    expect(out).toContain('生产：42');
  });

  it('发布目标指向已删除连接时明确标注', () => {
    const out = buildOpsFieldContext({
      input: { releaseProjectId: 'p1' },
      releaseProject: { name: 'demo', targets: [{ name: '生产', connectionId: 'gone' }] },
      resolveConnectionName: () => undefined,
    });
    expect(out).toContain('连接已删除');
  });

  it('现场段绝不带密钥 / 密码（连接详情只取公开字段）', () => {
    const out = buildOpsFieldContext({
      // 传一个"被污染"的连接对象：即便调用方手滑带上密钥，组装结果也不得包含
      input: { connectionId: 'c1' },
      connection: { ...conn, secretEnc: 'ENCRYPTED_SECRET_PAYLOAD' } as any,
      releaseProject: { name: 'p', targets: [{ name: 't', connectionId: 'c1' }] },
    });
    expect(out).not.toContain('ENCRYPTED_SECRET_PAYLOAD');
    expect(out).not.toMatch(/secretEnc/);
  });

  it('什么都没给 → 空串（不注入空标题浪费 token）', () => {
    expect(buildOpsFieldContext({ input: {} })).toBe('');
    expect(buildOpsFieldContext({ input: null })).toBe('');
  });
});

describe('任务链路口径：现场进系统提示词，不进用户消息', () => {
  const MANAGER = SRC('llm-task-manager.ts');
  const ROUTE = SRC('routes/llm-tasks.ts');

  it('runReActLoop 把现场追加到 systemPrompt（不是 userContent）', () => {
    const idx = MANAGER.indexOf("if (params.opsContext) {");
    expect(idx, '★ 现场注入分支缺失（现场会退回前端拼接 userContent）').toBeGreaterThan(-1);
    const block = MANAGER.slice(idx, idx + 400);
    expect(block).toContain('systemPromptBuilt +=');
    expect(block).toContain('loadOpsFieldContext(params.opsContext)');
  });

  it('用户消息落库仍是原始 userContent（没被现场污染）', () => {
    expect(MANAGER).toContain("insertMessage(convId, userId, 'user', params.userContent)");
  });

  it('createTask / runReActLoop 都声明了 opsContext 字段', () => {
    const hits = MANAGER.match(/opsContext\?: OpsContextInput;/g) || [];
    expect(hits.length, '★ createTask 与 runReActLoop 两处参数类型都要有 opsContext').toBe(2);
  });

  it('路由对入参做白名单化，不透传任意内容进系统提示词', () => {
    expect(ROUTE).toContain('function normalizeOpsContext');
    expect(ROUTE).toContain('opsContext: normalizeOpsContext(opsContext)');
    // 长度封顶（终端尾部）
    expect(ROUTE).toMatch(/str\(o\.terminalTail,\s*\d+\)/);
  });
});
