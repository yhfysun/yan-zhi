// 命令广播（7.14）UI 契约（2026-10-17）
// ★ 纯文本契约（node 环境无 DOM），剥注释后匹配。
//
// 守护：
//   ① 资源栏有「广播」入口；
//   ② 弹窗过滤数据库连接、多选目标、黑名单提示；
//   ③ 含生产连接时二次确认，并带 confirmed=true；
//   ④ 逐台结果可展开输出。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const CONSOLE = strip(readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8'));
const DIALOG = strip(readFileSync(resolve(__dirname, '../../components/ops/OpsBroadcastDialog.vue'), 'utf8'));

describe('OpsConsole · 广播入口', () => {
  it('资源栏有广播按钮并挂弹窗', () => {
    expect(CONSOLE).toContain('命令广播（多机执行）');
    expect(CONSOLE).toMatch(/broadcastOpen = true/);
    expect(CONSOLE).toMatch(/<OpsBroadcastDialog v-model="broadcastOpen" :connections="connections"/);
  });
});

describe('OpsBroadcastDialog · 多机选择与执行', () => {
  it('★ 目标只允许 SSH / Docker（数据库连接过滤掉）', () => {
    expect(DIALOG).toMatch(/connections\.filter\(\(c\) => \(c\.type \|\| 'ssh'\) !== 'database'\)/);
  });

  it('★ 生产连接二次确认，并带 confirmed=true', () => {
    expect(DIALOG).toMatch(/生产广播确认/);
    expect(DIALOG).toMatch(/confirmed: prodNames\.value\.length > 0/);
    expect(DIALOG).toMatch(/ElMessageBox\.confirm/);
  });

  it('黑名单提示写在输入框；结果逐台展示可展开', () => {
    expect(DIALOG).toContain('危险命令黑名单始终拒绝');
    expect(DIALOG).toContain('obd-results');
    expect(DIALOG).toMatch(/查看输出/);
    expect(DIALOG).toMatch(/api\.post<\{ results: BroadcastResult\[\] \}>\('\/plugin\/ops-shell\/broadcast'/);
  });
});
