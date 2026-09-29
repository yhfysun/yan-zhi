/**
 * media-preview.test.ts 的等价断言 runner（本机 vitest 不可用，见 README/skill）。
 * 用法：node tools/assert-media-preview.cjs
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf-8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FP = strip(read('packages/ui/src/components/FilePreview.vue'));
const FILES = strip(read('apps/server/src/routes/files.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const AH = strip(read('apps/server/src/services/artifact-hooks.ts'));

let pass = 0, fail = 0;
const out = [];
const ck = (n, ok, extra = '') => {
  if (ok) { pass++; out.push('  ✅ ' + n + (extra ? ' — ' + extra : '')); }
  else { fail++; out.push('  ❌ ' + n + (extra ? ' — ' + extra : '')); }
};
const group = (t, fn) => { out.push(''); out.push('=== ' + t + ' ==='); fn(); };
function at(code, needle, label) {
  const i = code.indexOf(needle);
  if (i < 0) { out.push(`  ❌ 锚点失效（源码结构变了）：${label}`); fail++; return -1; }
  return i;
}
const win = (code, needle, len, label) => {
  const i = at(code, needle, label || needle);
  return i < 0 ? '' : code.slice(i, i + len);
};

group('① 视频黑屏：必须走 HTTP Range 流式，不能用 blob:', () => {
  const body = win(FP, 'if (VIDEO_EXTS.includes(e))', 2000, '视频分支');
  ck('★★★ 视频优先用 HTTP URL', /if \(httpUrl\)/.test(body));
  ck('★★★ httpUrl 赋给 videoSrc', /videoSrc\.value = httpUrl/.test(body));
  const a = win(FP, 'if (AUDIO_EXTS.includes(e))', 2000, '音频分支');
  ck('★★ 音频同样走 HTTP', /audioSrc\.value = httpUrl/.test(a));
  ck('★★ 有 resolveMediaUrl', /async function resolveMediaUrl/.test(FP));
  const r = win(FP, 'async function resolveMediaUrl', 1500, 'resolveMediaUrl');
  ck('  用会话产物通道 file-stream', /file-stream/.test(r));
  ck('  保留空间资源通道', /resources\/.*\/raw/.test(r));
  ck('★ 保留 Blob 兜底', /createObjectURL/.test(FP));
});

group('② 后端支持 Range 的流式端点', () => {
  ck('★★★ file-stream 路由存在', /router\.get\('\/:id\/file-stream'/.test(FILES));
  const body = win(FILES, "router.get('/:id/file-stream'", 2600, 'file-stream');
  ck('★★ 声明 Accept-Ranges', /Accept-Ranges/.test(body));
  ck('★★ 用 res.sendFile', /res\.sendFile\(/.test(body));
  ck('★★ 越界 Range 回 416', /416/.test(body) && /Content-Range/.test(body));
  ck('★ 忽略 ECONNABORTED', /ECONNABORTED/.test(body));
  ck('★★ 复用跨根定位', /findArtifactFileAcrossRoots/.test(body));
  ck('★★ 复用登记路径兜底', /resolveRegisteredFilePath/.test(body));
});

group('③ 子智能体循环漏跑钩子（产物只有图片没视频）', () => {
  const calls = [...LTM.matchAll(/runAfterToolHooks\(/g)].length;
  ck(`★★★ runAfterToolHooks 调用点 ≥ 2（找到 ${calls}）`, calls >= 2);
  ck('★★★ 子智能体侧收集 _meta 出参', /subToolMetaOut/.test(LTM));
  const b = win(LTM, 'const subToolMetaOut', 500, '子智能体 _meta');
  ck('  出参传给了 executeTool', /subToolMetaOut\)/.test(b));
  ck('★★ file_write 钩子用 ctx.meta', /ctx\.meta|m\?\.path/.test(AH));
  ck('★★ 未用 args.path', !/args\?\.path|args\.path/.test(AH));
  for (const t of ['api_image_generate', 'api_video_generate', 'api_tts_speak', 'media_compose', 'media_edit']) {
    ck(`  MEDIA_TOOLS 含 ${t}`, AH.includes(`'${t}'`));
  }
  ck('★★ 过滤失败结果', /isFailure/.test(AH));
});

group('④ 无音轨提示 + 播放错误如实报出', () => {
  ck('★★ 有 videoNoAudio 状态', /videoNoAudio/.test(FP));
  ck('★★ 有提示文案', /该视频没有音轨/.test(FP));
  ck('★★ 绑 loadedmetadata', /onVideoLoaded/.test(FP));
  const b = win(FP, 'function onVideoLoaded', 1600, 'onVideoLoaded');
  ck('  用 mozHasAudio', /mozHasAudio/.test(b));
  ck('  用 webkitAudioDecodedByteCount', /webkitAudioDecodedByteCount/.test(b));
  ck('★★ 判不准不提示（typeof 存在性判断）', /typeof n === 'number'/.test(b));
  ck('★★ 有 onVideoError', /function onVideoError/.test(FP));
  const e = win(FP, 'function onVideoError', 900, 'onVideoError');
  ck('  错误码有可读映射', /解码失败|格式不被支持/.test(e));
  ck('★ 模板绑定 @error', /@error="onVideoError"/.test(FP));
});

group('⑤ 离开预览 / 切换文件清缓存', () => {
  const b = win(FP, 'function revokeVideoSrc', 1200, 'revokeVideoSrc');
  ck('★★★ pause()', /\.pause\(\)/.test(b));
  ck('★★★ removeAttribute(src)', /removeAttribute\('src'\)/.test(b));
  ck('★★★ load()（丢弃缓冲分片）', /\.load\(\)/.test(b));
  ck('★★★ 只对 blob: 调 revokeObjectURL', /startsWith\('blob:'\)/.test(b));
  const a = win(FP, 'function revokeAudioSrc', 900, 'revokeAudioSrc');
  ck('★★ 音频侧同样判类型', /startsWith\('blob:'\)/.test(a));
  const w = win(FP, 'watch(() => props.file?.path', 700, '切换 watch');
  ck('★★★ 切文件先清缓存', /revokeVideoSrc\(\)/.test(w));
  const u = win(FP, 'onBeforeUnmount(', 700, 'onBeforeUnmount');
  ck('★★ 卸载清视频', /revokeVideoSrc\(\)/.test(u));
  ck('★★ 卸载清音频', /revokeAudioSrc\(\)/.test(u));
  ck('★ 重置 videoNoAudio', /videoNoAudio\.value = false/.test(b));
  ck('★ 重置 videoError', /videoError\.value = ''/.test(b));
});

console.log(out.join('\n'));
console.log('');
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);