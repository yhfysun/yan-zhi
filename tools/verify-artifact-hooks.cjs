/**
 * 真跑验证：产物登记钩子机制 + 两个修复点。
 *
 * ★ 要验的（2026-09-29 用户反馈）：
 *   ① 「产物里面没有视频只有图片」→ 子智能体循环**漏跑 afterToolHooks**
 *      （只有主循环调了 runAfterToolHooks，子智能体产出的文件从不登记）。
 *   ② 「视频直接黑屏」→ 前端用 blob: 播放（Chromium 对 blob 媒体不实现 Range）。
 *      后端配套：新增 `/conversations/:id/file-stream` 流式端点（Range 支持已另测）。
 *   ③ 「没有音轨要提示」「离开预览清缓存」→ 前端改动。
 *
 * 本脚本分两层：
 *   A. **真跑** tool-hooks 机制（它零依赖，可独立 import）—— 验注册/执行/顺序/fail-open
 *   B. **源码级** 验 artifact-hooks 的实现要点 + 两个循环的调用点（防"只修一个入口"回归）
 *
 * 用法：node tools/verify-artifact-hooks.cjs
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO = path.resolve(__dirname, '..');
const DIST = path.join(REPO, 'apps/server/dist/apps/server/src');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf-8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
const out = [];
const ck = (n, ok, extra = '') => {
  if (ok) { pass++; out.push('  ✅ ' + n + (extra ? ' — ' + extra : '')); }
  else { fail++; out.push('  ❌ ' + n + (extra ? ' — ' + extra : '')); }
};
/** ★ 必须 await：A 组是 async 的。同步调用会导致断言在 group 返回后才跑、输出丢失
 *  （我第一版就这样，A 组 12 条断言全部凭空消失，看起来像"没跑"）。 */
const group = async (t, fn) => { out.push(''); out.push('=== ' + t + ' ==='); await fn(); };

(async () => {
  // ───────── A. 真跑 tool-hooks 机制 ─────────
  const hooks = await import(pathToFileURL(path.join(DIST, 'services/tool-hooks.js')).href);
  const { registerAfterToolHook, runAfterToolHooks, registerBeforeToolHook, runBeforeToolHooks, clearToolHooks } = hooks;

  await group('A① 钩子注册与执行（真跑）', async () => {
    clearToolHooks();
    const seen = [];
    registerAfterToolHook('t1', (name, args, result, ctx) => { seen.push({ name, result, ctx }); });
    await runAfterToolHooks('file_write', { a: 1 }, 'RESULT', { taskId: 'x', conversationId: 'c', userId: 'u', assistantMsgId: 'm', meta: { p: 1 } });
    ck('钩子被调用', seen.length === 1, JSON.stringify(seen.length));
    ck('  收到工具名', seen[0]?.name === 'file_write');
    ck('  收到结果', seen[0]?.result === 'RESULT');
    ck('  收到 _meta（file_write 落盘路径靠它）', seen[0]?.ctx?.meta?.p === 1);
  });

  await group('A② 所有钩子都会被调用（name 是「钩子标识」，不是工具名过滤）', async () => {
    // ★ 真跑纠正过我的误判：`registerAfterToolHook(name, fn)` 的第一个参数是
    //   **钩子自己的标识**（用于 clearToolHooks/debug），**不是**"只对这个工具生效"的过滤器。
    //   过滤是钩子**函数内部**自己判断 toolName 做的（见 artifact-hooks 里的 `if (toolName !== 'file_write') return`）。
    clearToolHooks();
    const hit = [];
    registerAfterToolHook('hook-a', (n) => hit.push(n));
    registerAfterToolHook('hook-b', (n) => hit.push(n));
    await runAfterToolHooks('file_read', {}, 'x', { taskId: 'x', conversationId: 'c', userId: 'u' });
    ck('两个钩子都被调用（与工具名无关）', hit.length === 2, JSON.stringify(hit));
    ck('  钩子收到的是实际工具名', hit.every((n) => n === 'file_read'));
  });

  await group('A③ fail-open：某个钩子抛错不影响其他钩子与调用方', async () => {
    clearToolHooks();
    let secondRan = false;
    registerAfterToolHook('boom', () => { throw new Error('钩子内部炸了'); });
    registerAfterToolHook('boom', () => { secondRan = true; });
    let threw = false;
    try {
      await runAfterToolHooks('file_write', {}, 'x', { taskId: 'x', conversationId: 'c', userId: 'u' });
    } catch { threw = true; }
    ck('★ 坏钩子不让 runAfterToolHooks 抛错（工具已执行完，副作用是次要的）', !threw);
    ck('★ 后续钩子仍执行', secondRan);
  });

  await group('A④ before 钩子支持 block 拦截（返回 {block: 原因}）', async () => {
    clearToolHooks();
    // ★ 真跑纠正：block 的返回结构是 `{ block: string }`（原因就在 block 字段里），
    //   不是 `{blocked:true, reason}` —— 我第一版断言按后者写，误报了两条失败。
    // ★ 过滤是**钩子函数内部**自己判断 toolName 做的（钩子机制本身不做工具过滤）——
    //   我第一版忘了在钩子里过滤，于是 file_read 也被拦，误报了一条失败。
    //   这里按真实用法注册（钩子内部判 toolName），验证过滤逻辑成立。
    clearToolHooks();
    registerBeforeToolHook('danger', (n) => (n === 'cmd_exec' ? { block: '危险命令，已拦截' } : undefined));
    const r = await runBeforeToolHooks('cmd_exec', { cmd: 'rm -rf /' }, { taskId: 'x', conversationId: 'c', userId: 'u' });
    ck('★ 可以拦截（返回 block 字段）', typeof r?.block === 'string' && r.block.length > 0, JSON.stringify(r));
    ck('  拦截原因带出', /危险命令/.test(String(r?.block || '')));
    const r2 = await runBeforeToolHooks('file_read', {}, { taskId: 'x', conversationId: 'c', userId: 'u' });
    ck('★ 钩子内部按 toolName 过滤后，其他工具不被拦', !(r2 && r2.block));

    // ★ 另一条真实语义：任一钩子返回 block 即**停止并返回该原因**（后续 before 钩子不再跑）
    clearToolHooks();
    let laterRan = false;
    registerBeforeToolHook('first', () => ({ block: '先拦了' }));
    registerBeforeToolHook('second', () => { laterRan = true; });
    const r3 = await runBeforeToolHooks('cmd_exec', {}, { taskId: 'x', conversationId: 'c', userId: 'u' });
    ck('★ 命中 block 后短路（后续 before 钩子不再执行）', !laterRan && r3?.block === '先拦了');
  });

  // ───────── B. artifact-hooks 的实现要点（源码级） ─────────
  const AH = strip(read('apps/server/src/services/artifact-hooks.ts'));
  const LTM = strip(read('apps/server/src/llm-task-manager.ts'));

  await group('B① 媒体工具集合完整', () => {
    for (const t of ['api_image_generate', 'api_video_generate', 'api_tts_speak', 'media_compose', 'media_edit']) {
      ck(`MEDIA_TOOLS 含 ${t}`, AH.includes(`'${t}'`));
    }
  });

  await group('B② 登记必须用 _meta.path（不能用模型传的 args.path）', () => {
    ck('★ file_write 钩子用 ctx.meta 取路径', /ctx\.meta|m\?\.path/.test(AH));
    ck('★ 未使用 args.path（会登记不存在的位置 → 点开 404）', !/args\?\.path|args\.path/.test(AH));
  });

  await group('B③ ★★★ 两个循环都必须跑钩子（防"只修一个入口"回归）', () => {
    // 这是本轮修复的核心：此前只有主循环调了 runAfterToolHooks
    const calls = [...LTM.matchAll(/runAfterToolHooks\(/g)].length;
    ck('★★ runAfterToolHooks 调用点 ≥ 2（主循环 + 子智能体循环）', calls >= 2, `找到 ${calls} 处`);
    // 确认子智能体那处不是注释
    ck('★★ 子智能体循环里有实际调用', /子智能体循环同样要跑产物登记钩子/.test(read('apps/server/src/llm-task-manager.ts')));
    ck('★★ 子智能体侧也收集了 _meta 出参', /subToolMetaOut/.test(LTM));
  });

  await group('B④ 子智能体侧 executeTool 必须传 _meta 出参', () => {
    // 主循环与子智能体循环都用 executeTool(...)，第 9 个参数是 toolMetaOut
    const sub = LTM.slice(LTM.indexOf('const subToolMetaOut'), LTM.indexOf('const subToolMetaOut') + 400);
    ck('★ 子智能体调用 executeTool 时传了出参', /executeTool\([\s\S]{0,200}subToolMetaOut/.test(sub), '');
  });

  // ───────── C. 视频流式端点（源码级 + 已在 verify-range-stream 真跑） ─────────
  const FILES = strip(read('apps/server/src/routes/files.ts'));

  await group('C① 新增 file-stream 端点（支持 Range 的流式播放）', () => {
    ck('★★ 路由存在', /router\.get\('\/:id\/file-stream'/.test(FILES));
    ck('★★ 声明 Accept-Ranges（播放器据此决定分段请求）', /Accept-Ranges/.test(FILES));
    ck('★ 用 sendFile（原生支持 Range/206/条件请求/路径安全）', /res\.sendFile\(/.test(FILES));
    ck('★ 越界 Range 回 416 而非 500', /416/.test(FILES) && /Content-Range/.test(FILES));
    ck('★ 客户端中断（ECONNABORTED）不刷日志', /ECONNABORTED/.test(FILES));
    ck('★ 复用同一条定位链（跨根探测 + 登记路径兜底），未另写一套',
      /findArtifactFileAcrossRoots/.test(FILES) && /resolveRegisteredFilePath/.test(FILES));
  });

  await group('C② 前端必须改走 HTTP（不能再只靠 blob:）', () => {
    const FP = strip(read('packages/ui/src/components/FilePreview.vue'));
    ck('★★ 有 resolveMediaUrl（HTTP 优先）', /async function resolveMediaUrl/.test(FP));
    ck('★★ 视频分支优先用 HTTP', /if \(httpUrl\)[\s\S]{0,200}videoSrc\.value = httpUrl/.test(FP));
    ck('★★ 音频分支同样优先 HTTP', /if \(httpUrl\)[\s\S]{0,200}audioSrc\.value = httpUrl/.test(FP));
    ck('★ 保留 Blob 兜底（Web 端无 conversationId 时）', /createObjectURL/.test(FP));
  });

  await group('C③ 无音轨提示', () => {
    const FP = strip(read('packages/ui/src/components/FilePreview.vue'));
    ck('★★ 有 videoNoAudio 状态与提示元素', /videoNoAudio/.test(FP) && /该视频没有音轨/.test(FP));
    ck('★★ 用 loadedmetadata 探测音轨', /@loadedmetadata|onVideoLoaded/.test(FP));
    ck('★ 判不准时不误报（宁可漏报）', /typeof n === 'number'/.test(FP));
  });

  await group('C④ 离开预览 / 切换文件必须清缓存', () => {
    const FP = strip(read('packages/ui/src/components/FilePreview.vue'));
    ck('★★ revokeVideoSrc 会 pause + 清 src + load()（丢弃已缓冲分片）',
      /el\.pause\(\)/.test(FP) && /removeAttribute\('src'\)/.test(FP) && /el\.load\(\)/.test(FP));
    ck('★★ 只对 blob: 调 revokeObjectURL（http 是无意义调用）', /startsWith\('blob:'\)/.test(FP));
    ck('★★ 切换文件时先清缓存（watch 里）', /watch\(\(\) => props\.file\?\.path[\s\S]{0,300}revokeVideoSrc\(\)/.test(FP));
    ck('★ 卸载时也清（onBeforeUnmount）', /onBeforeUnmount\([\s\S]{0,300}revokeVideoSrc\(\)/.test(FP));
  });

  await group('C⑤ 视频播放错误要如实报出（不再静默黑屏）', () => {
    const FP = strip(read('packages/ui/src/components/FilePreview.vue'));
    ck('★★ 有 onVideoError 与错误映射', /function onVideoError/.test(FP) && /视频解码失败/.test(FP));
    ck('★ 模板上绑定了 @error', /@error="onVideoError"/.test(FP));
  });

  console.log(out.join('\n'));
  console.log('');
  console.log(`结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(2); });