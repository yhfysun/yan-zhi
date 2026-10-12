/**
 * 百炼（DashScope）生图通道 —— 守门测试（2026-10-12）。
 *
 * 背景（实测确认，见 api-tool-executor.ts 的 driver 注释）：
 *   ① 百炼的 **OpenAI 兼容模式不支持生图** —— POST {compatible-mode}/v1/images/generations 返回 404；
 *   ② 百炼图像生成走**原生端点**，且按模型分两条子通道：
 *        · qwen-image-* / z-image-turbo → 同步 /api/v1/services/aigc/multimodal-generation/generation
 *        · wan*（万相）               → 异步 /api/v1/services/aigc/image-generation/generation（轮询 tasks/{id}）
 *   ③ 修复必须**只加百炼分支**，标准通道（agnes / 任意 OpenAI 兼容，/v1/images/generations）**零改动**。
 *
 * 三条都容易"写了≠生效"，所以每条都要断言：
 *   · 端点拼错 → 404/400（模型名挂载对了也调不通）；
 *   · 分派条件写反/漏 → 百炼走标准端点 404，或 agnes 被误路由到百炼端点；
 *   · compatible-mode 的 baseUrl 没剥掉 → 原生端点拼在 compatible-mode 下面，404。
 *
 * 判据一律"读源码剥注释后再断言"（注释里出现同一个词会让断言假绿/假红，本仓踩过）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

/** 剥掉行注释与块注释（断言源码前必须先做：注释撞词会假红/假绿） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const EXECUTOR = stripComments(read('src/mcp/api-tool-executor.ts'));
const MEDIA_SCHEMA = stripComments(readRepo('packages/core/src/tool/builtin/api-tools/media.ts'));
const DB = stripComments(read('src/db.ts'));

describe('百炼生图通道：driver 存在且端点正确', () => {
  it('★ 定义了百炼 driver（mediaGenerateImageDashscope）', () => {
    expect(EXECUTOR).toMatch(/async function mediaGenerateImageDashscope\s*\(/);
  });

  it('★★ 百炼原生端点：同步走 multimodal-generation、异步走 image-generation（端点名写对）', () => {
    // 两条端点必须都在（写错任一个 → 对应模型 404/400）
    expect(EXECUTOR).toMatch(/\/api\/v1\/services\/aigc\/multimodal-generation\/generation/);
    expect(EXECUTOR).toMatch(/\/api\/v1\/services\/aigc\/image-generation\/generation/);
  });

  it('★★ 异步通道带 X-DashScope-Async: enable，并轮询 /api/v1/tasks/{task_id}', () => {
    expect(EXECUTOR).toMatch(/X-DashScope-Async/);
    expect(EXECUTOR).toMatch(/\/api\/v1\/tasks\/\$\{taskId\}/);
  });

  it('★★★ baseUrl 去掉 /compatible-mode 后才拼原生端点（否则 404）', () => {
    // dashscopeNativeRoot 必须剥离 compatible-mode
    expect(EXECUTOR).toMatch(/function dashscopeNativeRoot\s*\(/);
    expect(EXECUTOR).toMatch(/compatible-mode/);
    // 调用点必须用 dashscopeNativeRoot(ctx.baseUrl)，不能直接用 ctx.baseUrl 拼固定端点
    expect(EXECUTOR).toMatch(/const root = dashscopeNativeRoot\(ctx\.baseUrl\)/);
  });

  it('模型分路：wan 前缀走异步、其余走同步（qwen-image/z-image 是同步）', () => {
    expect(EXECUTOR).toMatch(/\^wan/i);
  });

  it('尺寸格式转换：OpenAI 的 WxH → 百炼的 W*H', () => {
    expect(EXECUTOR).toMatch(/function toDashscopeSize\s*\(/);
  });

  it('★★ 图生图/编辑：参考图并入 messages.content（image 项 + text），非走 /v1/images/edits', () => {
    // 百炼分支内：参考图转成 dataURL/URL 后 push 进 content
    expect(EXECUTOR).toMatch(/content\.push\(\{ image: r \}\)/);
    expect(EXECUTOR).toMatch(/content\.push\(\{ text: prompt \}\)/);
    // 且百炼分支在标准 edits 之前 return（不会走到 multipart /v1/images/edits）
    expect(EXECUTOR).toMatch(/isDashscopePlatform\(baseUrl\)\)\s*\{\s*\n\s*return await mediaGenerateImageDashscope/);
  });

  it('★ 百炼错误码翻成可行动提示（Model not exist / url error）', () => {
    // 实测 qwen-image-edit-plus 返回 404 "Model not exist."：裸错误码无从下手，必须给指引
    expect(EXECUTOR).toMatch(/Model not exist|model_not_exist/);
    expect(EXECUTOR).toMatch(/url error/i);
    expect(EXECUTOR).toMatch(/qwen-image-3\.0-pro \/ wan2\.7-image-pro \/ wan2\.7-image \/ z-image-turbo/);
  });
});

describe('平台分派：百炼走原生、标准平台走标准通道（两者并存）', () => {
  it('★★ 分派条件按 baseUrl 判定百炼（isDashscopePlatform）', () => {
    expect(EXECUTOR).toMatch(/function isDashscopePlatform\s*\(/);
    expect(EXECUTOR).toMatch(/dashscope\\\.aliyuncs\\\.com|bailian/);
  });

  it('★★ mediaGenerateImage 入口处调用分派（百炼分支）', () => {
    expect(EXECUTOR).toMatch(/if \(isDashscopePlatform\(baseUrl\)\)/);
    expect(EXECUTOR).toMatch(/return await mediaGenerateImageDashscope\(/);
  });

  it('★★★ 标准通道保留：/v1/images/generations 与 /v1/images/edits 仍在（agnes 免费能力不丢）', () => {
    expect(EXECUTOR).toMatch(/`\$\{baseUrl\}\/v1\/images\/generations`/);
    expect(EXECUTOR).toMatch(/`\$\{baseUrl\}\/v1\/images\/edits`/);
  });

  it('★ 无 model/platformId 时仍默认走 agnes（免费通道默认不变）', () => {
    expect(EXECUTOR).toMatch(/agnes-image-2\.5-flash/);
    expect(EXECUTOR).toMatch(/loadAgensMediaCtx/);
  });

  it('落盘契约共用：finalizeImageResult（标准/百炼都走同一落盘 + {type,url,description}）', () => {
    expect(EXECUTOR).toMatch(/async function finalizeImageResult\s*\(/);
    // 标准通道 handler 委托到共用落盘
    expect(EXECUTOR).toMatch(/return finalizeImageResult\(/);
  });
});

describe('工具 schema：api_image_generate 描述覆盖百炼通道与推荐模型', () => {
  it('★ 描述里说明"按平台自动选通道"', () => {
    expect(MEDIA_SCHEMA).toMatch(/按平台自动选通道/);
    // 兼容模式不支持生图这个关键事实要写进描述（避免后人再踩）
    expect(MEDIA_SCHEMA).toMatch(/images\/generations/);
  });

  it('★ 描述里列出百炼推荐模型（qwen-image-3.0-pro / wan2.7-image-pro / z-image-turbo）', () => {
    expect(MEDIA_SCHEMA).toMatch(/qwen-image-3\.0-pro/);
    expect(MEDIA_SCHEMA).toMatch(/wan2\.7-image-pro/);
    expect(MEDIA_SCHEMA).toMatch(/z-image-turbo/);
  });

  it('platformId 描述说明"传百炼平台 id 自动走原生端点"', () => {
    expect(MEDIA_SCHEMA).toMatch(/百炼平台 id 时自动走其原生图像生成端点/);
  });
});

describe('抖音 skill 写入配图生成步骤（默认模型落地）', () => {
  it('★★ skill_douyin_sell 的图文结构含「配图生成」节 + 推荐模型', () => {
    expect(DB).toMatch(/配图生成（api_image_generate）/);
    // 封面/商品图/轮播底图 三档模型都要点名（skill 里带 markdown 加粗 **，正则容错）
    expect(DB).toMatch(/qwen-image-3\.0-pro\*{0,2}（中英文文本渲染最强/);
    expect(DB).toMatch(/wan2\.7-image-pro\*{0,2}（高质量、品牌色可控/);
    expect(DB).toMatch(/z-image-turbo\*{0,2}（快且便宜）/);
  });

  it('★★ 封面「底图不要带字」红线写进 skill（生图模型画中文字必糊）', () => {
    expect(DB).toMatch(/底图不要带字/);
    expect(DB).toMatch(/画中文字必糊/);
  });

  it('★★ skill_douyin_traffic 的逐镜脚本含补位画面生成指引', () => {
    expect(DB).toMatch(/生成补位画面（api_image_generate）/);
  });

  it('★ 两个抖音 skill 仍在 SKILL_BODY_REFRESH_IDS 白名单（老库才会刷新到新版 body）', () => {
    expect(DB).toMatch(/SKILL_BODY_REFRESH_IDS\s*=\s*\[[^\]]*'skill_douyin_sell'[^\]]*\]/);
    expect(DB).toMatch(/SKILL_BODY_REFRESH_IDS\s*=\s*\[[^\]]*'skill_douyin_traffic'[^\]]*\]/);
  });
});