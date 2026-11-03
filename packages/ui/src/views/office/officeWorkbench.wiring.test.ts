// P2 办公工作台守门测试（2026-11-02）
//   ① /office 路由 + 顶栏入口 + 状态栏 AI/人工同步；
//   ② 三栏骨架与人工模式（右栏收窄、发送入口消失）；
//   ③ 工作区树对「绝对 relPath」的处理（服务端非递归 tree 的既定口径）；
//   ④ 后端 office 接口与 Python 脚本仍在，且路径必须过允许根守卫。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const ROUTER = strip(readRepo('packages/ui/src/router/index.ts'));
const TOPBAR = strip(readRepo('packages/ui/src/components/WebTopBar.vue'));
const STATUSBAR = strip(readRepo('packages/ui/src/components/AppStatusBar.vue'));
const WORKBENCH = strip(readRepo('packages/ui/src/views/office/OfficeWorkbench.vue'));
const TREE = strip(readRepo('packages/ui/src/components/office/WorkspaceFileTree.vue'));
const DOCVIEW = strip(readRepo('packages/ui/src/components/office/OfficeDocumentView.vue'));
const WS_FILES = strip(readRepo('packages/ui/src/composables/office/useWorkspaceFiles.ts'));
const OFFICE_ROUTE = strip(readRepo('apps/server/src/routes/office.ts'));
const ALLOWED = strip(readRepo('apps/server/src/services/allowed-roots.ts'));

describe('P2-1 办公工作台骨架', () => {
  it('/office 路由存在且归属 office 模式', () => {
    expect(ROUTER).toMatch(/path: '\/office'/);
    expect(ROUTER).toMatch(/office-workbench/);
    expect(ROUTER).toMatch(/'\/office': 'office'/);
  });

  it('不再单独出「工作台」入口；入口是右下角悬浮按钮（与开发模式同形态）', () => {
    expect(TOPBAR).not.toMatch(/to="\/office"/);
    const CHAT = strip(readRepo('packages/ui/src/views/Chat.vue'));
    expect(CHAT).toMatch(/<LeadToggle/);
    expect(CHAT).toMatch(/mode="office"/);
    expect(CHAT).toMatch(/onOfficeLead/);
    // 顶栏不再有 AI/人工 胶囊
    expect(strip(readRepo('packages/ui/src/components/chat/ChatTopbar.vue'))).not.toMatch(/office-seg/);
  });

  it('三栏：文件树 / 画布；AI 形态就是聊天页', () => {
    expect(WORKBENCH).toMatch(/<WorkspaceFileTree/);
    expect(WORKBENCH).toMatch(/<OfficeDocumentView/);
    expect(WORKBENCH).toMatch(/<FilePreview/);
    expect(WORKBENCH).toMatch(/<LeadToggle/);
    // 工作台不再内嵌聊天：AI = /chat，人工 = 这里
    expect(WORKBENCH).not.toMatch(/<ChatMessageList \/>/);
    expect(WORKBENCH).not.toMatch(/<ChatInputArea \/>/);
  });

  it('状态栏在 /office 下同步 AI/人工', () => {
    expect(STATUSBAR).toMatch(/officePanel/);
    expect(STATUSBAR).toMatch(/AI 协作/);
    expect(STATUSBAR).toMatch(/人工编辑/);
  });
});

describe('P2-2 AI / 人工切换', () => {
  it('人工模式是独立形态：右下角悬浮按钮切回 AI', () => {
    expect(WORKBENCH).toMatch(/<LeadToggle[^>]*mode="office"/);
    expect(WORKBENCH).toMatch(/function goAi/);
  });
});

describe('P2-4 文件树与三套视图', () => {
  it('服务端 tree 的绝对 relPath 不能被拼成双路径（2026-11-02 实测缺陷）', () => {
    // absOf 必须先判断「已是绝对路径」再原样返回
    const fn = WS_FILES.slice(WS_FILES.indexOf('function absOf'), WS_FILES.indexOf('async function fetchDir'));
    expect(fn).toMatch(/\^\[a-zA-Z\]:/);
    expect(fn).toMatch(/rel\.startsWith\('\/'\)/);
  });

  it('树支持新建 / 重命名 / 复制 / 删除入口', () => {
    expect(TREE).toMatch(/createDoc/);
    expect(TREE).toMatch(/renameNode/);
    expect(TREE).toMatch(/duplicateNode/);
    expect(TREE).toMatch(/deleteNode/);
    expect(WS_FILES).toMatch(/\/workspace\/copy/);
    expect(strip(readRepo('apps/server/src/routes/workspace.ts'))).toMatch(/router\.post\('\/copy'/);
  });

  it('三套视图各自渲染（文档 / 表格 / 演示）', () => {
    expect(DOCVIEW).toMatch(/odv-doc-wrap/);
    expect(DOCVIEW).toMatch(/odv-sheet-wrap/);
    expect(DOCVIEW).toMatch(/odv-slides-wrap/);
    expect(DOCVIEW).toMatch(/\/office\/content/);
  });

  it('文本类复用 FilePreview，pptx 支持文字回写', () => {
    expect(WORKBENCH).toMatch(/<FilePreview/);
    expect(WORKBENCH).toMatch(/useFilePreview/);
    expect(DOCVIEW).toMatch(/\/office\/save/);
    expect(DOCVIEW).toMatch(/startSlideEdit/);
    expect(strip(readRepo('apps/server/src/routes/office.ts'))).toMatch(/router\.post\('\/save'/);
  });

  it('右键可新建（空白处 / 目录），支持 md / txt', () => {
    const TREE = strip(readRepo('packages/ui/src/components/office/WorkspaceFileTree.vue'));
    expect(TREE).toMatch(/openBlankMenu/);
    expect(TREE).toMatch(/新建 Markdown/);
    expect(TREE).toMatch(/workspace\/create/);
  });

  it('文件树支持拖拽移动与行内重命名', () => {
    const TREE = strip(readRepo('packages/ui/src/components/office/WorkspaceFileTree.vue'));
    expect(TREE).toMatch(/onDragStart/);
    expect(TREE).toMatch(/async function onDrop/);
    expect(TREE).toMatch(/ws-rename-input/);
    expect(TREE).toMatch(/function startRename/);
  });

  it('重命名 / 移动可撤销', () => {
    const TREE = strip(readRepo('packages/ui/src/components/office/WorkspaceFileTree.vue'));
    expect(TREE).toMatch(/undoStack/);
    expect(TREE).toMatch(/async function undoLast/);
    expect(TREE).toMatch(/ws-undo/);
    expect(TREE).toMatch(/pushUndo\(`重命名/);
    expect(TREE).toMatch(/pushUndo\(`移动/);
  });

  it('工作台记住上次文件与目录展开状态', () => {
    const WS = strip(readRepo('packages/ui/src/composables/office/useWorkspaceFiles.ts'));
    expect(WS).toMatch(/yz:office:tree:expanded/);
    expect(WS).toMatch(/function revealPath/);
    expect(WS).toMatch(/officeSelectedFile/);
    expect(WORKBENCH).toMatch(/revealPath/);
  });

  it('自定义 .ydoc 导出直接是 Word（复用 DocumentCard 的导出）', () => {
    expect(WORKBENCH).toMatch(/exportYdocWord/);
    expect(WORKBENCH).toMatch(/\.ydoc/);
    const PREVIEW = strip(readRepo('packages/ui/src/components/FilePreview.vue'));
    expect(PREVIEW).toMatch(/defineExpose\(\{ exportYdocWord \}\)/);
    expect(readRepo('packages/ui/src/components/chat/DocumentCard.vue')).toMatch(/defineExpose\(\{ exportWord \}\)/);
  });
});

describe('P2-3 后端办公文档接口', () => {
  it('生成 / 解析 / 导出三个端点与 Python 脚本都在', () => {
    expect(OFFICE_ROUTE).toMatch(/router\.post\('\/create'/);
    expect(OFFICE_ROUTE).toMatch(/router\.get\('\/content'/);
    expect(OFFICE_ROUTE).toMatch(/router\.get\('\/export'/);
    expect(OFFICE_ROUTE).toMatch(/office\/office_docs\.py/);
    expect(existsSync(resolve(REPO, 'packages/core/src/tool/builtin/python-scripts/office/office_docs.py'))).toBe(true);
  });

  it('读写路径都必须过允许根守卫', () => {
    expect(OFFICE_ROUTE).toMatch(/isAllowedPathForUser/);
    expect(ALLOWED).toMatch(/export function isAllowedPathForUser/);
    // workspace/file-stream 必须复用同一份判定（两处各写一套必然漂移）
    expect(strip(readRepo('apps/server/src/routes/workspace-files.ts'))).toMatch(/isAllowedPathForUser/);
  });
});
