// 文件写入路径 + 产物预览的守门测试 —— 防本次两个修复回归。
//
// 背景（2026-09-23 用户反馈）：
//   ①「文件写入还是不对啊，路径不应该方法里面自己判断？还用大模型传？」
//      —— file_write 的 path 原先是 required、由模型编 → 文件散落各处，
//         且落点不在产物规范目录内 → 登记进 conversation_file 的文件预览必然 404。
//   ②「生成的图片能看到但是预览不行啊」
//      —— 产物根是"读取时重算"的，历史文件用的是落盘当时的根，工作目录一变就读不到
//         （实测一份库里 3 个根：仓库根 / apps/server / 相对路径）。
//
// ★ 本轮口径（用户明确要求）：**路径由代码在调用点算好、直接传入，不做回调抽象**。
//   所以断言要同时钉住"工具侧不做推导"和"调用点确实算好传了"。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

const FILE_WRITE = readRepo('packages/core/src/tool/builtin/file-write.ts');
const TOOL_TYPES = readRepo('packages/core/src/tool/types.ts');
const REGISTRY = readRepo('packages/core/src/tool/registry.ts');
const TASK_MGR = readRepo('apps/server/src/llm-task-manager.ts');
const ARTIFACT_DIR = readRepo('apps/server/src/services/artifact-dir.ts');
const INDEX = readRepo('apps/server/src/index.ts');
const FILES_ROUTE = readRepo('apps/server/src/routes/files.ts');
const FILE_PREVIEW = readRepo('packages/ui/src/components/FilePreview.vue');

describe('① file_write 的路径必须由代码决定，不能靠模型传', () => {
  it('★★ path 不再是必填参数（required 只应含 content）', () => {
    const code = strip(FILE_WRITE);
    const m = /required:\s*\[([^\]]*)\]/.exec(code);
    expect(m, '未找到 required 声明').toBeTruthy();
    const required = m![1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
    expect(required, '★ path 仍是必填 —— 模型会被迫编路径').not.toContain('path');
    expect(required).toContain('content');
  });

  it('★ 提供 file_name 参数供模型表达"想要的文件名"（不含目录）', () => {
    expect(FILE_WRITE).toMatch(/file_name:\s*\{/);
    expect(FILE_WRITE).toMatch(/properties[\s\S]{0,600}file_name/);
  });

  it('★★ 工具内部**不做路径推导**（不查库、不猜根、不注入回调）', () => {
    // 用户口径：「代码层面直接传入」——工具只该从 ctx 取算好的目录
    expect(FILE_WRITE, '工具不应引用产物目录服务（那是边缘层的知识）').not.toMatch(/artifact-dir|resolveArtifactDir/);
    // 也不应做"跨根探测"这类推导
    expect(FILE_WRITE).not.toMatch(/candidateRoots|findArtifactFileAcrossRoots/);
    // 应从 ctx 直接读目录
    expect(FILE_WRITE, '工具未从 ctx.artifactDirs 取目录').toMatch(/ctx\?\.artifactDirs/);
  });

  it('★ ToolContext 只传"算好的绝对目录"，不允许回调式注入', () => {
    const code = strip(TOOL_TYPES);
    expect(code, '缺少 ToolContext').toMatch(/export interface ToolContext/);
    expect(code, '应有 artifactDirs 字段').toMatch(/artifactDirs\?:/);
    // ★ 反向：不得引入函数式注入（用户明确否掉了回调抽象）
    expect(code, '★ 不应有回调式 resolveArtifactPath').not.toMatch(/resolveArtifactPath\??\s*:/);
    expect(code, '★ 不应有回调式 resolveUserPath').not.toMatch(/resolveUserPath\??\s*:/);
  });

  it('★ 注册表把 ctx 透传给工具（否则工具拿不到目录）', () => {
    const code = strip(REGISTRY);
    expect(code).toMatch(/async execute\(name: string, args: Record<string, unknown>, ctx\?: ToolContext\)/);
    expect(code, 'execute 未把 ctx 传给工具').toMatch(/tool\.execute\(args,\s*ctx\)/);
  });

  it('★★ 调用点必须把 artifactDirs 算好传进去（用与媒体同一个单一出口）', () => {
    const code = strip(TASK_MGR);
    const i = code.indexOf("registry.has(toolName)");
    expect(i, '未找到内置工具执行分支').toBeGreaterThan(0);
    const block = code.slice(i, i + 3000);
    // ★ 断言不能只看"出现过 artifactDirs 这个词"（注释/类型里都可能出现）——
    //  变异测试证明：删掉赋值 `const toolCtx = {... artifactDirs }` 后仍会 PASS。
    //  ⇒ 改成：① 确实调用了 resolveArtifactDirFor；② 确实把这个对象交给了 execute。
    const calls = (block.match(/resolveArtifactDirFor\(/g) || []).length;
    expect(calls, '★ artifactDirs 三个分类都应经 resolveArtifactDirFor 解析（单一出口）').toBeGreaterThanOrEqual(3);
    expect(block, '★ 未复用 resolveArtifactDirFor 单一出口').toMatch(/resolveArtifactDirFor\(\{\s*conversationId[^}]*category:\s*'deliverable'/);
    expect(block, '★ 不应自己手拼产物目录路径').not.toMatch(/['"]\.yan-zhi['"]/);
    // 三个分类都要给（upload 供上传落盘）
    expect(block).toMatch(/intermediate:/);
    expect(block).toMatch(/deliverable:/);
    expect(block).toMatch(/upload:/);
    // 必须真的把 ctx 传进 execute
    expect(block, '★ ctx 未传给 registry.execute').toMatch(/registry\.execute\(toolName,\s*args,\s*toolCtx\)/);
    // 反向：toolCtx 必须带着 artifactDirs（不是空对象）
    expect(block, '★ toolCtx 未携带 artifactDirs').toMatch(/toolCtx\s*=\s*\{[^}]*artifactDirs/);
  });

  it('★★ conversation_file 必须登记**工具回传的实际路径**，不能用模型传的 args.path', () => {
    const code = strip(TASK_MGR);
    const i = code.indexOf("toolName === 'file_write' && !result.startsWith");
    expect(i, '未找到 file_write 登记分支').toBeGreaterThan(0);
    const block = code.slice(i, i + 900);
    // ★ 必须来自工具 _meta（实际落盘路径）—— 断言收紧到"filePath 的取值来源"
    expect(block, '★ 登记路径未取自工具回传').toMatch(/const filePath = String\((toolMetaOut|fwMeta[^)]*path|_meta[^)]*path)/);
    // ★ 反向：不得从 args.path 取登记路径（那会登记一个不存在的位置 → 点开 404）
    //  用宽松匹配覆盖 `String(args.path)` / `String(args.path || '')` 等写法
    //  （变异测试证明：只匹配 `String\(args\.path\)` 时，写成 `String(args.path || '')` 会漏判）
    expect(block, '★ 仍在用模型传的 args.path 登记').not.toMatch(/args\.path/);
  });

  it('★ _meta 必须能传出来（否则调用点拿不到实际路径）', () => {
    const code = strip(TASK_MGR);
    expect(code, 'executeTool 未提供 metaOut 出参').toMatch(/metaOut\?:/);
    expect(code, '未把 _meta 写入 metaOut').toMatch(/metaOut\.value\s*=/);
  });
});

describe('② 生成的图片/文件预览必须能找回（产物根漂移）', () => {
  it('★★ 静态媒体路由要有**跨根探测**（方案 A）', () => {
    const code = strip(INDEX);
    const i = code.indexOf('/api/generated/:kind/:conversationId/:name');
    expect(i).toBeGreaterThan(0);
    const block = code.slice(i, i + 3000);
    expect(block, '★ 静态路由缺少跨根探测').toMatch(/findArtifactFileAcrossRoots/);
    // 顺序：先规范目录，再跨根，最后登记路径
    const idxNorm = block.indexOf('findArtifactFileInDirs');
    const idxCross = block.indexOf('findArtifactFileAcrossRoots');
    const idxReg = block.indexOf('resolveRegisteredFilePath');
    expect(idxNorm, '缺按当前根的规范查找').toBeGreaterThan(0);
    expect(idxCross, '★ 跨根探测应排在规范查找之后').toBeGreaterThan(idxNorm);
    expect(idxReg, '★ 登记路径兜底应排最后').toBeGreaterThan(idxCross);
  });

  it('★★ 读取要**信任登记路径**（方案 B）', () => {
    expect(ARTIFACT_DIR, '缺少 resolveRegisteredFilePath').toMatch(/export function resolveRegisteredFilePath/);
    const i = ARTIFACT_DIR.indexOf('export function resolveRegisteredFilePath');
    const body = ARTIFACT_DIR.slice(i, i + 2600);
    // 绝对路径直接用（这是"落盘即权威"）
    expect(body, '★ 未识别绝对路径分支').toMatch(/isAbsolute\(raw\)/);
    // 相对路径必须按候选根补齐，★ 不能按 cwd 直拼（那正是漂移源头）
    expect(body, '★ 相对路径未按候选根补齐').toMatch(/resolve\(r,\s*raw\)/);
  });

  it('★ 跨根候选必须覆盖历史用过的各根（workdir / dataDir / apps/server / 仓库根）', () => {
    const i = ARTIFACT_DIR.indexOf('export function findArtifactFileAcrossRoots');
    const body = ARTIFACT_DIR.slice(i, i + 1800);
    expect(body, '缺 workspaceDir').toMatch(/serverState\.workspaceDir/);
    expect(body, '缺 dataDir').toMatch(/resolveDataDir\(\)/);
    expect(body, '缺 apps/server 根').toMatch(/hereDir,\s*'\.\.',\s*'\.\.'/);
    expect(body, '缺仓库根').toMatch(/hereDir,\s*'\.\.',\s*'\.\.',\s*'\.\.'/);
  });

  it('★ 启动时要一次性回填历史相对路径（幂等）', () => {
    expect(ARTIFACT_DIR, '缺少回填函数').toMatch(/export function backfillRelativeArtifactPaths/);
    // 幂等：绝对路径的行必须跳过
    const i = ARTIFACT_DIR.indexOf('export function backfillRelativeArtifactPaths');
    const body = ARTIFACT_DIR.slice(i, i + 2600);
    expect(body, '★ 回填未跳过已绝对路径的行（会反复重写）').toMatch(/isAbsolute\(p\)[\s\S]{0,80}continue/);
    // 启动时调用
    expect(strip(INDEX), '★ 启动时未调用回填').toMatch(/backfillRelativeArtifactPaths\(\)/);
  });

  it('★★ 前端预览要有自愈兜底：读不到就问服务端要真实路径', () => {
    const code = strip(FILE_PREVIEW);
    expect(code, '缺少 readFileWithFallback').toMatch(/async function readFileWithFallback/);
    // 图片分支必须走它（这是用户报的场景）
    const imgIdx = code.indexOf('IMG_EXTS.includes(e)');
    expect(imgIdx).toBeGreaterThan(0);
    const imgBlock = code.slice(imgIdx, imgIdx + 500);
    expect(imgBlock, '★ 图片分支仍裸读登记路径').toMatch(/readFileWithFallback\(/);
    expect(imgBlock, '★ 图片分支不应再直接 readFileBase64(props.file.path)')
      .not.toMatch(/adapter\.fs\.readFileBase64\(props\.file\.path\)/);
    // 文本分支同样
    expect(code, '文本分支未走兜底').toMatch(/readTextWithFallback/);
    // 必须真的去问服务端
    expect(code, '★ 没有向服务端询问真实路径').toMatch(/conversations\/\$\{[^}]*\}/);
  });

  it('★ 服务端要提供「定位真实路径」的接口（前端兜底依赖它）', () => {
    const code = strip(FILES_ROUTE);
    // ★ 断言不能只查"出现过 /:id/file-path"（变异测试证明：把路由名改掉仍会 PASS）——
    //  要锚定**可用的路由声明**与**返回结构**。
    expect(code, '缺少 file-path 路由声明').toMatch(/router\.get\(\s*['"]\/:id\/file-path['"]/);
    const i = code.indexOf("'/:id/file-path'");
    expect(i, '未找到该路由').toBeGreaterThan(0);
    const block = code.slice(i, i + 2200);
    expect(block, '接口未做跨根探测').toMatch(/findArtifactFileAcrossRoots/);
    expect(block, '接口未做登记路径兜底').toMatch(/resolveRegisteredFilePath/);
    // 必须真的返回 path（前端靠它重读）—— ★ 两处成功返回都要带 path
    //  （跨根命中 + 登记路径命中各一处；变异测试证明只断言一次时，改掉另一处会漏判）
    const pathReturns = (block.match(/res\.json\(\{\s*data:\s*\{\s*path/g) || []).length;
    expect(pathReturns, '★ 至少两处成功返回都必须带 path').toBeGreaterThanOrEqual(2);
    expect(block, '接口未返回 path 字段').toMatch(/res\.json\(\{\s*data:\s*\{\s*path/);
    // 找不到时要 404（前端据此报错，不能静默空返回）
    expect(block, '找不到时未返回 404').toMatch(/status\(404\)/);
  });

  it('★ 前端错误信息要能指导用户（区分"文件找不到"）', () => {
    const code = strip(FILE_PREVIEW);
    expect(code, '错误信息未区分文件不存在').toMatch(/找不到文件/);
    expect(code).toMatch(/ENOENT|not found|不存在/);
  });
});

/*
 * ===== 变异测试记录（2026-09-23，见 tmp/_mut3.sh）=====
 *  每条都把正确写法改回错误写法，确认断言变红后还原。
 */