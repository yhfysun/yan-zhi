// 发布项目（7b）UI 契约（2026-10-17）
// ★ 纯文本契约（node 环境无 DOM），剥注释后匹配。
//
// 守护：
//   ① 左栏有发布项目面板；绑定会落 release_project_id + 合并挂载 CICD/连接工具；
//   ② 绑定后的上下文只带连接名/host，绝不带 secretEnc；
//   ③ 运维「发布」页签接入 CicdConsole，发布前有目标/目录/重启确认；
//   ④ 项目创建支持 existing/empty/scaffold，scaffold 二次确认。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const CONSOLE = strip(readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8'));
const SESSION = strip(readFileSync(resolve(__dirname, 'opsSession.ts'), 'utf8'));
const PANEL = strip(readFileSync(resolve(__dirname, '../../components/ops/ReleaseProjectPanel.vue'), 'utf8'));
// ★ CicdConsole 的模板里有 `placeholder="target/*.jar"`：`/*` 会让「剥块注释」的 strip 吃掉后续代码，
//   所以这里读原文，不做注释剥离。
const CICD = readFileSync(resolve(__dirname, 'CicdConsole.vue'), 'utf8');

describe('运维左栏 · 发布项目面板', () => {
  it('左栏渲染面板，并传入当前窗口绑定的项目', () => {
    expect(CONSOLE).toMatch(/<ReleaseProjectPanel/);
    expect(CONSOLE).toMatch(/:active-project-id="activeWin\?\.releaseProject\?\.id \|\| ''"/);
    expect(CONSOLE).toMatch(/@bind="onBindReleaseProject"/);
    expect(CONSOLE).toMatch(/@unbind="onUnbindReleaseProject"/);
  });

  it('★ 绑定：落 release_project_id + 合并 CICD/连接工具（幂等）', () => {
    const fn = CONSOLE.match(/async function onBindReleaseProject\(project: ReleaseProject\)[\s\S]*?\n\}/);
    expect(fn, '找不到 onBindReleaseProject').toBeTruthy();
    const body = fn![0];
    expect(body).toMatch(/builtin_tool_ids_json/);
    expect(body).toMatch(/releaseProjectId: project\.id/);
    expect(body).toMatch(/builtinToolIds: merged/);
    expect(CONSOLE).toContain("'plugin_cicd-pipeline__cicd_run_pipeline'");
    expect(CONSOLE).toContain("'plugin_ops-shell__conn_list'");
  });

  it('★ 发布上下文只带连接名/host，绝不带密钥', () => {
    const fn = CONSOLE.match(/function releaseProjectHint\(w: OpsWin\)[\s\S]*?\n\}/);
    expect(fn, '找不到 releaseProjectHint').toBeTruthy();
    expect(fn![0]).toMatch(/c\.host/);
    expect(fn![0]).not.toMatch(/secretEnc/);
    // 对话与后台任务两条链路都要带上
    expect((CONSOLE.match(/releaseProjectHint\(w\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('绑定后会话顶部有项目条；解绑会清空 conversation 绑定', () => {
    expect(CONSOLE).toContain('ops-bound-bar');
    expect(CONSOLE).toMatch(/releaseProjectId: null/);
  });

  it('窗口状态持有 releaseProject（只存会话态）', () => {
    expect(SESSION).toMatch(/releaseProject\?: ReleaseProject/);
  });
});

describe('发布项目面板', () => {
  it('CRUD 都走 ops-shell 路由', () => {
    expect(PANEL).toContain('/plugin/ops-shell/release-projects');
    expect(PANEL).toMatch(/api\.post<ReleaseProject>\('\/plugin\/ops-shell\/release-projects'/);
    expect(PANEL).toMatch(/api\.put<ReleaseProject>\(`\/plugin\/ops-shell\/release-projects\/\$\{editingId\.value\}`/);
    expect(PANEL).toMatch(/api\.delete\(`\/plugin\/ops-shell\/release-projects\/\$\{p\.id\}`/);
  });

  it('三种创建方式；scaffold 写文件前二次确认', () => {
    expect(PANEL).toContain('选取已有目录');
    expect(PANEL).toContain('新建空目录');
    expect(PANEL).toContain('脚手架初始化');
    expect(PANEL).toMatch(/form\.value\.mode === 'scaffold'[\s\S]{0,200}ElMessageBox\.confirm/);
  });

  it('部署目标选择真实连接，目录走系统选择器', () => {
    expect(PANEL).toMatch(/\/plugin\/ops-shell\/connections/);
    expect(PANEL).toMatch(/showOpenDir/);
    expect(PANEL).toContain('发布目录');
  });
});

describe('运维「发布」页签 + 发布确认', () => {
  it('发布页签接入 CicdConsole', () => {
    expect(CONSOLE).toMatch(/<el-tab-pane label="发布" name="release" lazy>/);
    expect(CONSOLE).toMatch(/import CicdConsole from '\.\/CicdConsole\.vue'/);
  });

  it('★ 发布前展示目标 + 目录 + 重启脚本；生产连接额外警示', () => {
    const fn = CICD.match(/async function executePipeline\(\)[\s\S]*?\n\}/);
    expect(fn, '找不到 executePipeline').toBeTruthy();
    expect(fn![0]).toMatch(/ElMessageBox\.confirm/);
    expect(fn![0]).toMatch(/发布目录/);
    expect(fn![0]).toMatch(/重启脚本/);
    expect(fn![0]).toMatch(/生产连接/);
  });
});
