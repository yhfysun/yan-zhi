// 音频播放能力的守门测试 —— 防本次「音频产物在应用内听不到」的修复回归。
//
// 背景（2026-09-27 用户反馈）：
//   「新增功能，视频，音频播放功能」→ 追问后用户明确：
//   **「现在文件预览里面没有播放的。。。。只有用本机应用打开」**
//
//   定位到的真实缺口（不是"什么都缺"）：
//     ① `useMediaPreview` 的媒体类型只有 image / video / file
//        → TTS 配音产物（`{type:'audio', url, file}`）解析不出任何卡片，
//          消息里**完全不渲染**，用户看不到自己的配音结果；
//     ② `FilePreview` 没有 AUDIO_EXTS 分支
//        → .wav/.mp3 直落最底部的 binary 分支 →「暂不支持预览 / 用本机应用打开」。
//        （视频播放链是存在的：文件预览有内嵌播放器、消息卡片 hover 预览、灯箱全屏播放）
//
// ★ 用户口径（本次明确）：应用内要能直接播放，不靠外挂本机应用。
// ★ 断言策略：一律先剥注释再匹配（注释里写到的标识符会造成假红/假绿）。

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
// ★ 真实调用被测函数（不只是读源码断言）：mediaOfTool 是纯函数，
//   用服务端 TTS 三层兜底实际返回的 JSON 形状喂进去，验证解析结果真的可用。
import { mediaOfTool } from './useMediaPreview';

const REPO = resolve(__dirname, '../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** 剥掉 HTML 注释 / 块注释 / 行注释 —— 断言前必做，否则注释里的标识符会命中 */
const strip = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

const MEDIA_PREVIEW = readRepo('packages/ui/src/composables/useMediaPreview.ts');
const FILE_PREVIEW = readRepo('packages/ui/src/components/FilePreview.vue');
const TOOL_MEDIA = readRepo('packages/ui/src/components/chat/ToolMediaPreview.vue');
const MESSAGE_LIST = readRepo('packages/ui/src/components/chat/ChatMessageList.vue');
const FILE_PANEL = readRepo('packages/ui/src/components/chat/ChatFilePanel.vue');
const AUDIO_PLAYER = readRepo('packages/ui/src/components/media/AudioPlayer.vue');
const AUDIO_BUS = readRepo('packages/ui/src/composables/useAudioBus.ts');

describe('① 媒体类型系统必须支持 audio', () => {
  it('★★ MediaTarget.kind 含 audio（否则配音产物解析不出任何卡片）', () => {
    const code = strip(MEDIA_PREVIEW);
    expect(code, 'kind 联合类型未包含 audio').toMatch(/kind:\s*'image'\s*\|\s*'video'\s*\|\s*'audio'\s*\|\s*'file'/);
  });

  it('★★ mediaOfTool 接受 audio 并要求 kind 覆盖三种媒体', () => {
    const code = strip(MEDIA_PREVIEW);
    expect(code).toMatch(/mediaOfTool\([^)]*kind:\s*'image'\s*\|\s*'video'\s*\|\s*'audio'/);
    expect(code, 'parseToolMedia 未处理 audio').toMatch(/kind === 'audio'/);
  });

  it('★★ audio 解析必须认 type=\'audio\' 与 url，且**不放行**图片/视频结果', () => {
    const code = strip(MEDIA_PREVIEW);
    // 必须校验 type 自洽：视频结果的 url 不能被当成音频
    expect(code, 'audio 分支缺少 type 自洽校验').toMatch(/declared\s*&&\s*declared\s*!==\s*'audio'/);
    // 无 type 的旧数据必须命中音频扩展名或专用字段（否则会误吞其它产物）
    expect(code, 'audio 分支缺少扩展名兜底判据').toMatch(/mp3\|wav\|m4a\|aac\|flac\|ogg\|opus\|wma/);
  });

  it('★ 音频专用字段 audioUrl 也要认（与 url 并列）', () => {
    const code = strip(MEDIA_PREVIEW);
    expect(code).toMatch(/j\.url\)\s*\|\|\s*s\(j\.audioUrl\)/);
  });
});

describe('② 文件预览必须在应用内播放音频（用户报的就是这里）', () => {
  it('★★ 存在 AUDIO_EXTS 白名单并覆盖配音产物实际格式 wav / mp3', () => {
    const code = strip(FILE_PREVIEW);
    const m = /AUDIO_EXTS\s*=\s*\[([^\]]*)\]/.exec(code);
    expect(m, 'FilePreview 未定义 AUDIO_EXTS —— 音频仍会落到 binary 分支').toBeTruthy();
    const exts = m![1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
    // TTS 三层兜底实际产出的格式：本地层 wav、Edge 层 mp3、系统层 wav
    expect(exts, '缺少 wav（本地/系统 TTS 产物）').toContain('wav');
    expect(exts, '缺少 mp3（Edge TTS 产物）').toContain('mp3');
  });

  it('★★ 有 kind===\'audio\' 的渲染分支，且用的是 AudioPlayer 而非「本机应用打开」', () => {
    const code = strip(FILE_PREVIEW);
    expect(code, '缺少 kind === "audio" 渲染分支').toMatch(/kind === 'audio'/);
    expect(code, 'audio 分支未使用统一播放器').toMatch(/<AudioPlayer/);
    // ★ 反向：音频不得再走 binary 降级出口
    const audioBranch = /kind === 'audio'[\s\S]{0,400}/.exec(code);
    expect(audioBranch, '未找到 audio 分支正文').toBeTruthy();
    expect(audioBranch![0], '★ 音频分支竟引导去用本机应用打开').not.toMatch(/用本机应用打开/);
  });

  it('★★ kind 联合类型含 audio，并注册了音频徽章', () => {
    const code = strip(FILE_PREVIEW);
    expect(code).toMatch(/ref<'image'\s*\|\s*'video'\s*\|\s*'audio'\s*\|\s*'pdf'/);
    expect(code, 'kindBadge 未给音频中文标签').toMatch(/case 'audio':\s*return '音频'/);
  });

  it('★★ audioMime 必须覆盖 wav / mp3（Blob 无 MIME 会导致播放器拒解）', () => {
    const code = strip(FILE_PREVIEW);
    expect(code, '缺少 audioMime').toMatch(/function audioMime/);
    expect(code).toMatch(/case 'wav':\s*return 'audio\/wav'/);
    expect(code).toMatch(/case 'mp3':\s*return 'audio\/mpeg'/);
  });

  it('★★ 音频 Blob URL 必须回收（三处：换文件 / 加载新音频 / 组件卸载）', () => {
    const code = strip(FILE_PREVIEW);
    expect(code, '缺少 revokeAudioSrc').toMatch(/function revokeAudioSrc/);
    // ★ 量词必须贪婪：{0,800}? 是惰性量词，会只匹配 "async function loadFile() {"
    //   这一行（本轮实测踩到，断言假红）——凡"截一段函数体再断言"一律用贪婪量词。
    const loadFn = /async function loadFile\(\)\s*\{[\s\S]{0,900}/.exec(code);
    expect(loadFn, '未找到 loadFile').toBeTruthy();
    expect(loadFn![0], 'loadFile 未回收音频 Blob URL').toMatch(/revokeAudioSrc\(\)/);
    // 卸载钩子里也要回收
    const unmount = /onBeforeUnmount\(\(\)\s*=>\s*\{[\s\S]{0,600}/.exec(code);
    expect(unmount, '未找到 onBeforeUnmount').toBeTruthy();
    expect(unmount![0], '卸载时未回收音视频 Blob URL').toMatch(/revokeAudioSrc\(\)/);
    // ★ 加载新音频前也要先回收旧 URL（漏了 → 连续切换音频时字节越攒越多）
    const audioLoad = /AUDIO_EXTS\.includes\(e\)\)\s*\{[\s\S]{0,900}/.exec(code);
    expect(audioLoad, '未找到音频加载分支').toBeTruthy();
    expect(audioLoad![0], '★ 加载音频前未回收上一个 Blob URL').toMatch(/revokeAudioSrc\(\)/);
  });
});

describe('③ 消息里的配音产物要渲染成播放卡片', () => {
  it('★★ ChatMessageList 的 toolMedia 必须顺带尝试 audio', () => {
    const code = strip(MESSAGE_LIST);
    const m = /function toolMedia\([\s\S]{0,400}?\n\}/.exec(code);
    expect(m, '未找到 toolMedia').toBeTruthy();
    expect(m![0], 'toolMedia 未尝试解析 audio —— 配音产物不会渲染').toMatch(/mediaOfTool\(text,\s*'audio'\)/);
  });

  it('★★ ToolMediaPreview 有 audio 卡片分支并使用 AudioPlayer', () => {
    const code = strip(TOOL_MEDIA);
    expect(code, '缺少 audio 卡片分支').toMatch(/media\.kind === 'audio'/);
    expect(code, '音频卡片未使用统一播放器').toMatch(/<AudioPlayer/);
    expect(code, '缺少 AudioPlayer 引入').toMatch(/import AudioPlayer from '\.\.\/media\/AudioPlayer\.vue'/);
  });

  it('★★ 音频卡片必须接右键菜单与长按（移动端没有右键）', () => {
    const code = strip(TOOL_MEDIA);
    const audioBlock = /media\.kind === 'audio'[\s\S]{0,500}?\/>/.exec(code);
    expect(audioBlock, '未找到音频卡片正文').toBeTruthy();
    expect(audioBlock![0], '音频卡片未接右键菜单').toMatch(/@contextmenu="menu"/);
    expect(audioBlock![0], '音频卡片未接长按（移动端将无法取用）').toMatch(/bindLongPress/);
  });
});

describe('④ 统一播放器组件与播放互斥', () => {
  it('★★ AudioPlayer 组件存在且具备基本播放能力', () => {
    expect(existsSync(resolve(REPO, 'packages/ui/src/components/media/AudioPlayer.vue'))).toBe(true);
    // 播放/暂停、进度、倍速
    expect(AUDIO_PLAYER).toMatch(/el\.play\(\)/);
    expect(AUDIO_PLAYER).toMatch(/el\.pause\(\)/);
    expect(AUDIO_PLAYER).toMatch(/currentTime/);
    expect(AUDIO_PLAYER, '缺少倍速能力').toMatch(/playbackRate/);
  });

  it('★★ 播放前必须停掉其它实例（一轮配音几十条，不互斥会多路叠响）', () => {
    const bus = strip(AUDIO_BUS);
    expect(bus, '缺少暂停其它实例的实现').toMatch(/export function pauseOtherAudio/);
    const player = strip(AUDIO_PLAYER);
    // ★ 贪婪量词（见上一条测试注释：惰性量词会让断言只看一行）
    const playBranch = /if\s*\(el\.paused\)\s*\{[\s\S]{0,400}/.exec(player);
    expect(playBranch, '未找到播放分支').toBeTruthy();
    expect(playBranch![0], '★ 播放前未调用 pauseOtherAudio —— 多路音频会叠在一起').toMatch(/pauseOtherAudio\(el\)/);
  });

  it('★★ 播放器必须在挂载时登记、卸载时注销（否则总线集合越攒越大）', () => {
    const player = strip(AUDIO_PLAYER);
    expect(player).toMatch(/registerAudio\(el\)/);
    expect(player).toMatch(/unregisterAudio\(el\)/);
  });

  it('★★ 挂载时必须按当前 readyState 补初始化（竞态：元数据早于挂载就绪）', () => {
    // ★ 2026-09-27 真机验证踩到的场景：命中缓存时 audio 的 loadedmetadata
    //   在组件挂载前就已派发，挂载后注册的监听器再也收不到 →
    //   「能播但时长一直 --:--」。必须按 readyState 主动补一次。
    const player = strip(AUDIO_PLAYER);
    const mounted = /onMounted\(\(\)\s*=>\s*\{[\s\S]{0,700}/.exec(player);
    expect(mounted, '未找到 onMounted').toBeTruthy();
    expect(mounted![0], '★ 挂载时未补一次元数据初始化 —— 缓存命中时长会显示 --:--')
      .toMatch(/readyState\s*>=\s*1/);
  });

  it('★ 图标需显式尺寸（不依赖宿主是否全局注册 ElementPlus）', () => {
    // 组件库被别处复用时若无全局 el-icon 样式，svg 会塌成 0×0（按钮变空白圆）。
    const player = strip(AUDIO_PLAYER);
    expect(player).toMatch(/\.ap-play :deep\(svg\)\s*\{[^}]*width:/);
  });
});

describe('⑤ 文件面板的右键菜单按类型分流', () => {
  it('★ 音频扩展名识别存在，且菜单 kind 会落到 audio', () => {
    const code = strip(FILE_PANEL);
    expect(code, 'ChatFilePanel 未识别音频扩展名').toMatch(/AUDIO_EXT_RE/);
    // mimeType 与扩展名两条判据都要（上传文件的 mime 可能缺失）
    expect(code).toMatch(/startsWith\('audio\/'\)/);
    expect(code, '菜单未按音频分流').toMatch(/isAudio\s*\?\s*'audio'/);
  });
});

describe('⑥ 真实调用：TTS 三层兜底的实际返回形状都要能被解析', () => {
  // 以下三条 JSON 逐字来自 api-tool-executor.ts 的 mediaSpeak 三层分支
  // （本地语音包 wav / Edge 在线 mp3 / 系统 SAPI wav），不是编的。

  it('★★ 本地语音包层（type:audio + engine:local + wav）', () => {
    const raw = JSON.stringify({
      ok: true, type: 'audio', engine: 'local', voice: 'local:3',
      model: 'vits-zh-aishell3', url: '/api/generated/audios/audio-1789737246205.wav',
      file: 'C:\\repo\\apps\\server\\generated-audios\\audio-1789737246205.wav', bytes: 77422,
    });
    const m = mediaOfTool(raw, 'audio');
    expect(m, '本地语音包产物解析失败 —— 消息里不会出现播放卡片').toBeTruthy();
    expect(m!.kind).toBe('audio');
    expect(m!.name).toBe('audio-1789737246205.wav');
    expect(m!.path).toBeTruthy();
    // 旧的 bug 表现：整条链解析不出任何东西
    expect(mediaOfTool(raw, 'image'), '音频被误判成图片').toBeNull();
    expect(mediaOfTool(raw, 'video'), '音频被误判成视频').toBeNull();
  });

  it('★★ Edge 在线层（engine:edge + mp3 + 音色名）', () => {
    const raw = JSON.stringify({
      ok: true, type: 'audio', engine: 'edge', voice: 'zh-CN-XiaoxiaoNeural',
      character: '旁白', url: '/api/generated/audios/<convId>/audio-1789737281894.mp3',
      file: 'D:/data/audio-1789737281894.mp3', bytes: 20480,
    });
    const m = mediaOfTool(raw, 'audio');
    expect(m, 'Edge 产物解析失败').toBeTruthy();
    expect(m!.kind).toBe('audio');
    expect(m!.name).toBe('audio-1789737281894.mp3');
    // 音色/引擎信息进 description（多角色配音时用来区分是哪条）
    expect(m!.description).toContain('zh-CN-XiaoxiaoNeural');
  });

  it('★★ 系统兜底层（带 capacityNote 的降级返回）', () => {
    const raw = JSON.stringify({
      ok: true, type: 'audio', engine: 'sapi', voice: 'Huihui', character: '男主',
      capacityNote: '本机仅 3 个中文音色，多角色会重复',
      url: '/api/generated/audios/audio-1789737357569.wav',
      file: 'C:/tmp/audio-1789737357569.wav', bytes: 12000,
    });
    const m = mediaOfTool(raw, 'audio');
    expect(m, '系统层产物解析失败').toBeTruthy();
    expect(m!.kind).toBe('audio');
    expect(m!.path).toBe('C:/tmp/audio-1789737357569.wav');
  });

  it('★★ 反向：图片/视频产物不能被当成音频（否则会出现空播放器卡片）', () => {
    const img = JSON.stringify({ ok: true, type: 'image', url: '/api/generated/images/image-1.png', file: 'C:/x/image-1.png' });
    expect(mediaOfTool(img, 'audio'), '生图结果被误判成音频').toBeNull();

    const vid = JSON.stringify({ ok: true, type: 'video', videoUrl: '/api/generated/videos/v.mp4', file: 'C:/x/v.mp4' });
    expect(mediaOfTool(vid, 'audio'), '生视频结果被误判成音频').toBeNull();
  });

  it('★ 无 type 的旧数据：只有 url 命中音频扩展名才认（避免误吞）', () => {
    const legacyOk = JSON.stringify({ url: '/api/generated/audios/legacy.mp3', file: 'C:/x/legacy.mp3' });
    expect(mediaOfTool(legacyOk, 'audio'), '旧音频记录未兜底识别').toBeTruthy();

    const legacyBad = JSON.stringify({ url: '/api/generated/files/report.pdf', file: 'C:/x/report.pdf' });
    expect(mediaOfTool(legacyBad, 'audio'), '★ 非音频文件被当成音频').toBeNull();
  });

  it('★ 非法 JSON / 空输入安全返回 null（不抛错，卡片不炸）', () => {
    expect(mediaOfTool('not json at all', 'audio')).toBeNull();
    expect(mediaOfTool('', 'audio')).toBeNull();
    expect(mediaOfTool(null, 'audio')).toBeNull();
    expect(mediaOfTool(JSON.stringify({ type: 'audio' }), 'audio'), '无 url 时应返回 null').toBeNull();
  });
});

describe('⑦ 音频产物文件真实存在且格式合法（端到端佐证）', () => {
  it('★ 服务端生成的 wav 是合法 RIFF/WAVE（播放器能解）', () => {
    const p = resolve(REPO, 'apps/server/generated-audios/audio-1789737246205.wav');
    if (!existsSync(p)) return; // 样本文件可能被清理，不阻塞
    const buf = readFileSync(p);
    expect(buf.slice(0, 4).toString('ascii'), '不是 RIFF').toBe('RIFF');
    expect(buf.slice(8, 12).toString('ascii'), '不是 WAVE').toBe('WAVE');
    // 头部声明长度与实际字节数一致 → 文件完整（截断的文件会导致播放中断）
    expect(buf.readUInt32LE(4) + 8).toBe(buf.length);
  });
});