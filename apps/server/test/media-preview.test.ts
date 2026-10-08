/**
 * 媒体产物与视频播放的守门测试（2026-09-29 用户反馈三连）。
 *
 * 用户原话：
 *   ① 「打开 MP4 视频直接黑屏」
 *   ② 「产物里面没有视频只有图片？还要自己去目录里面找？」
 *   ③ 「如果是没有音轨，那要提示一下啊」+「就是离开预览要清掉缓存啊」
 *
 * 三个真根因（都不是"没实现"，而是实现有洞）：
 *   ① **视频用 `blob:` URL 播放** —— Chromium 对 blob: 媒体**不实现 Range 请求**，
 *      播放器无法按需拉分片/定位关键帧，只能整段缓冲；大码率高分辨率视频
 *      （1080×1920 几 Mbps）缓冲跟不上就黑屏（文件本身完好，ffprobe 显示
 *      h264/High/yuv420p，任何本地播放器都能播）。
 *      → 改走 HTTP `/conversations/:id/file-stream`（`res.sendFile` 原生支持 Range，
 *        返回 206 + Content-Range），`<video>` 边下边播。
 *   ② **子智能体循环漏跑 afterToolHooks** —— 只有主循环调了，子智能体产出的文件
 *      从不登记 → 文件管理里看不到（典型：委派子智能体做视频，只见图片）。
 *      这是 P2-3「把副作用抽成钩子」时只接了**一个入口**留下的洞 —— **入口漂移**。
 *   ③ **切文件/卸载没清媒体缓冲** —— watch 只监听 path 就 loadFile()，
 *      旧视频的 buffered 分片被浏览器一直持有（HTTP 流式下载时可达上百 MB）。
 *
 * ★ 本机 vitest 包目录为空（已知环境）→ 写成静态断言；
 *   等价真跑见 tools/verify-range-stream.cjs（13/13，**真起服务验 206/416**）
 *   与 tools/verify-artifact-hooks.cjs（42/42，其中 A 组真跑钩子机制）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** ★ 剥注释 —— 不剥会让注释里的名字造成 `.not.toMatch` 假红（本项目踩过多次） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FP = strip(read('packages/ui/src/components/FilePreview.vue'));
const FILES = strip(read('apps/server/src/routes/files.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const AH = strip(read('apps/server/src/services/artifact-hooks.ts'));

function at(code: string, needle: string, label: string): number {
  const i = code.indexOf(needle);
  expect(i, `★ 锚点失效（源码结构变了）：${label}`).toBeGreaterThan(-1);
  return i;
}
function win(code: string, needle: string, len: number, label?: string): string {
  const i = at(code, needle, label || needle);
  return code.slice(i, i + len);
}

// ────────────────────────────────────────────────────────────
describe('① 视频黑屏：必须走 HTTP Range 流式，不能用 blob:', () => {
  it('★★★ 视频分支必须优先用 HTTP URL（blob: 不支持 Range → 大视频黑屏）', () => {
    const body = win(FP, "if (VIDEO_EXTS.includes(e))", 2000, '视频分支');
    expect(body, '★ 视频仍在用 createObjectURL 直接播（blob: 无 Range）')
      .toMatch(/if \(httpUrl\)/);
    expect(body, '★ 未把 httpUrl 赋给 videoSrc').toMatch(/videoSrc\.value = httpUrl/);
  });

  it('★★ 音频同理（长音频拖进度会卡）', () => {
    const body = win(FP, "if (AUDIO_EXTS.includes(e))", 2000, '音频分支');
    expect(body, '★ 音频未走 HTTP').toMatch(/audioSrc\.value = httpUrl/);
  });

  it('★★ 必须有 resolveMediaUrl（会话产物 + 空间资源两条通道）', () => {
    expect(FP, '★ 缺 resolveMediaUrl').toMatch(/async function resolveMediaUrl/);
    const body = win(FP, 'async function resolveMediaUrl', 1500, 'resolveMediaUrl');
    expect(body, '★ 未用会话产物通道 file-stream').toMatch(/file-stream/);
    expect(body, '★ 未保留空间资源通道').toMatch(/resources\/.*\/raw/);
  });

  it('★ 必须保留 Blob 兜底（Web 端可能拿不到 conversationId）', () => {
    expect(FP, '★ 完全删掉了 Blob 兜底 → Web 端无法播放').toMatch(/createObjectURL/);
  });
});

describe('② 后端必须提供支持 Range 的流式端点', () => {
  it('★★★ 必须新增 file-stream 端点', () => {
    expect(FILES, '★ 缺流式端点 → 前端 HTTP 播放会 404').toMatch(/router\.get\('\/:id\/file-stream'/);
  });

  it('★★ 必须声明 Accept-Ranges（播放器据此决定能否分段请求）', () => {
    const body = win(FILES, "router.get('/:id/file-stream'", 2600, 'file-stream');
    expect(body, '★ 未声明 Accept-Ranges').toMatch(/Accept-Ranges/);
  });

  it('★★ 必须用 res.sendFile（原生处理 Range/206/条件请求/路径穿越防护）', () => {
    const body = win(FILES, "router.get('/:id/file-stream'", 2600, 'file-stream');
    expect(body, '★ 手写读流会漏掉 Range/ETag 等细节').toMatch(/res\.sendFile\(/);
  });

  it('★★ 越界 Range 必须回 416（不是 500 —— 否则播放器以为服务器故障而放弃）', () => {
    const body = win(FILES, "router.get('/:id/file-stream'", 2600, 'file-stream');
    expect(body, '★ 缺 416 处理').toMatch(/416/);
    expect(body, '★ 未带 Content-Range: bytes */总长').toMatch(/Content-Range/);
  });

  it('★ 客户端中断（seek/停止）不能刷错误日志', () => {
    const body = win(FILES, "router.get('/:id/file-stream'", 2600, 'file-stream');
    expect(body, '★ 未忽略 ECONNABORTED（播放器 seek 会频繁触发）').toMatch(/ECONNABORTED/);
  });

  it('★★ 必须复用同一条定位链（跨根探测 + 登记路径兜底），不另写一套', () => {
    const body = win(FILES, "router.get('/:id/file-stream'", 2600, 'file-stream');
    expect(body, '★ 未复用 findArtifactFileAcrossRoots').toMatch(/findArtifactFileAcrossRoots/);
    expect(body, '★ 未复用 resolveRegisteredFilePath').toMatch(/resolveRegisteredFilePath/);
  });
});

describe('③ 产物只登记了图片没视频：子智能体循环漏跑钩子', () => {
  it('★★★ 工具执行必须有统一出口，且钩子在其中被调用（单点化：主/子循环共用）', () => {
    // ★ 2026-10-08 同步架构变更：P1 收敛（2026-10-04）已把「主循环 / 子智能体循环」
    //   各自 ~60 行的工具执行序列合流成**单一出口** runToolCallAndPersist——
    //   正是为了根治本条测试原本要防的「入口漂移」（子智能体侧漏跑钩子）。
    //   所以现在断言的是「单点出口存在 + 钩子在其中」，而不是「必须有 2 处调用」。
    expect(LTM, '★ 统一工具出口丢失（子智能体产物将再次不登记）')
      .toMatch(/async function runToolCallAndPersist\(/);
    const body = win(LTM, 'async function runToolCallAndPersist(', 3000, '统一工具出口');
    expect(body, '★ 统一出口里没跑 afterToolHooks → 产物永不登记')
      .toMatch(/runAfterToolHooks\(/);
    // 子智能体路径必须也走这个出口（子智能体循环里不能再自写一份执行序列）
    expect(LTM, '★ 子智能体未复用统一出口').toMatch(/runToolCallAndPersist\(\{/);
  });

  it('★★★ 统一出口必须收集工具回传 _meta（否则 file_write 路径拿不到）', () => {
    // 重构后变量统一叫 metaOut（原按两处循环分别命名 subToolMetaOut）
    const body = win(LTM, 'async function runToolCallAndPersist(', 3000, '统一工具出口');
    expect(body, '★ 未接 executeTool 的 _meta 出参').toMatch(/metaOut/);
    expect(body, '★ 未把出参传给 executeTool').toMatch(/executeTool\([^)]*metaOut\)/);
    expect(body, '★ _meta 未传给钩子').toMatch(/meta:\s*\(?metaOut\.value/);
  });

  it('★★ 登记必须用 _meta.path，不能用模型传的 args.path', () => {
    expect(AH, '★ file_write 钩子未用 ctx.meta').toMatch(/ctx\.meta|m\?\.path/);
    expect(AH, '★ 用了 args.path（会登记不存在的位置 → 点开 404）').not.toMatch(/args\?\.path|args\.path/);
  });

  it('★★ 媒体系列工具都必须在登记集合里', () => {
    for (const t of ['api_image_generate', 'api_video_generate', 'api_tts_speak', 'media_compose', 'media_edit']) {
      expect(AH, `★ MEDIA_TOOLS 缺 ${t} → 该工具产物不登记`).toContain(`'${t}'`);
    }
  });

  it('★★ 失败结果不得登记（避免把错误信息当产物）', () => {
    expect(AH, '★ 未过滤失败结果').toMatch(/isFailure/);
  });
});

describe('④ 无音轨要提示 + 播放错误要如实报出', () => {
  it('★★ 必须有 videoNoAudio 状态与提示元素', () => {
    expect(FP, '★ 无「没有音轨」提示（用户会以为播放器坏了）').toMatch(/videoNoAudio/);
    expect(FP, '★ 提示文案缺失').toMatch(/该视频没有音轨/);
  });

  it('★★ 音轨探测必须在 loadedmetadata 后做（立即读还没解码到）', () => {
    expect(FP, '★ 未绑 loadedmetadata').toMatch(/onVideoLoaded/);
    const body = win(FP, 'function onVideoLoaded', 1600, 'onVideoLoaded');
    expect(body, '★ 未用 mozHasAudio（Firefox 最可靠）').toMatch(/mozHasAudio/);
    expect(body, '★ 未用 webkitAudioDecodedByteCount（Chromium）').toMatch(/webkitAudioDecodedByteCount/);
  });

  it('★★ 判不准时必须不提示（宁可漏报，也别对有音轨的视频误报）', () => {
    const body = win(FP, 'function onVideoLoaded', 1600, 'onVideoLoaded');
    expect(body, '★ 未做 "typeof n === number" 存在性判断 → 不支持探测的浏览器会误报')
      .toMatch(/typeof n === 'number'/);
  });

  it('★★ 视频错误必须映射成可读原因（不再静默黑屏）', () => {
    expect(FP, '★ 缺 onVideoError').toMatch(/function onVideoError/);
    // ★ 2026-10-08 同步：onVideoError 已扩展（HTTP 状态探测 403/404 + 桌面端直读降级 + 错误码映射），
    //   函数体远超原 900 字符窗口 → 窗口放大到 2600 才能覆盖到末尾的 map 映射表。
    const body = win(FP, 'function onVideoError', 2600, 'onVideoError');
    expect(body, '★ 未区分错误码').toMatch(/解码失败|格式不被支持/);
    expect(FP, '★ 模板未绑定 @error').toMatch(/@error="onVideoError"/);
  });
});

describe('⑤ 离开预览 / 切换文件必须清缓存', () => {
  it('★★★ revokeVideoSrc 必须 pause + 清 src + load()（丢弃已缓冲分片）', () => {
    const body = win(FP, 'function revokeVideoSrc', 1200, 'revokeVideoSrc');
    expect(body, '★ 未 pause（还在后台下载/播放）').toMatch(/\.pause\(\)/);
    expect(body, '★ 未 removeAttribute(\'src\')').toMatch(/removeAttribute\('src'\)/);
    expect(body, '★ 未 load()（不 load 就丢不掉已缓冲的媒体分片）').toMatch(/\.load\(\)/);
  });

  it('★★★ 只对 blob: 调 revokeObjectURL（http: 调用是无意义的）', () => {
    const body = win(FP, 'function revokeVideoSrc', 1200, 'revokeVideoSrc');
    expect(body, '★ 未判 URL 类型').toMatch(/startsWith\('blob:'\)/);
    const audio = win(FP, 'function revokeAudioSrc', 900, 'revokeAudioSrc');
    expect(audio, '★ 音频侧同样要判类型').toMatch(/startsWith\('blob:'\)/);
  });

  it('★★★ 切换文件时必须先清旧媒体的缓冲（watch 里）', () => {
    const body = win(FP, 'watch(() => props.file?.path', 700, '文件切换 watch');
    expect(body, '★ 切文件未清缓存 —— 连看几个视频内存会一直涨')
      .toMatch(/revokeVideoSrc\(\)/);
  });

  it('★★ 卸载时也清（tab 关闭 / 组件销毁）', () => {
    const body = win(FP, 'onBeforeUnmount(', 700, 'onBeforeUnmount');
    expect(body, '★ 卸载未清视频').toMatch(/revokeVideoSrc\(\)/);
    expect(body, '★ 卸载未清音频').toMatch(/revokeAudioSrc\(\)/);
  });

  it('★ 清缓存时也要重置提示状态（否则换文件后残留上一条的提示）', () => {
    const body = win(FP, 'function revokeVideoSrc', 1200, 'revokeVideoSrc');
    expect(body, '★ 未重置 videoNoAudio').toMatch(/videoNoAudio\.value = false/);
    expect(body, '★ 未重置 videoError').toMatch(/videoError\.value = ''/);
  });
});