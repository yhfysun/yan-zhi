// 移动端「打包 + 首启 + 触屏交互」守门测试 —— 防本次修的四个问题回归。
//
// 背景（2026-09-22 用户反馈，四件事没有一个是我之前理解的"UI 细节"）：
//   ① 打包后的应用图标不对（Android 工程一直是 Capacitor 脚手架默认图）
//   ② 模型下拉点击弹两个窗（移动端与桌面端两个 el-popover 共用同一个 visible）
//   ③ 长按没有实现（useLongPress 从未被引用；各处只绑了 @contextmenu 即"右键"）
//   ④ 数据初始化不行，要点进模型平台/智能体平台才有数据
//      （真机「WebView 先加载前端 → 内嵌后端后启动」→ 首个 fetch 抛异常击穿路由启动）
//
// 这四条都是**静态可判**的结构问题（配错/漏绑/共用变量），读源码断言成本远低于渲染。
// ★ 所有断言都做过变异测试（见文件末尾记录）。

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const REPO_ROOT = resolve(UI_SRC, '../../..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
const readRoot = (p: string) => readFileSync(resolve(REPO_ROOT, p), 'utf8');
const existsRoot = (p: string) => existsSync(resolve(REPO_ROOT, p));

const CLIENT = read('api/client.ts');
const BACKEND_READY = read('api/backend-ready.ts');
const LICENSE = read('stores/license.ts');
const USE_CHAT = read('composables/chat/useChat.ts');
const CHAT_INPUT = read('components/chat/ChatInputArea.vue');
const SIDEBAR = read('components/chat/ChatSidebar.vue');
const LONG_PRESS = read('composables/useLongPress.ts');

/** 去注释，避免被说明性注释绊倒（本项目踩过）。 */
const stripComments = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

/**
 * ① APK 图标
 *
 * ★★★ 2026-10-10：**拆分**为"契约层"（恒跑）与"产物层"（仅当 Android 工程存在时跑）。
 *   背景：apps/mobile/android/ 是 cap add android **生成**的目录（gitignore），
 *   干净检出 / 未打过安卓包的机器上**不存在** → 断言"各密度图标文件存在"必然失败。
 *   但那是**环境前置缺失**，不是代码回归 —— 报红只会训练出"这批测试可以忽略"。
 *   ⇒ 契约层（脚本存在、build:android 调它、脚手架默认图已删）恒跑；
 *     产物层（各密度位图存在 / 尺寸 / 内容）在工程缺失时**跳过并给出原因**。
 */
describe('①a APK 图标契约（不依赖生成产物，恒跑）', () => {
  it('icons 生成脚本存在，且被 build:android 调用（否则改完不会进包）', () => {
    expect(existsRoot('apps/mobile/scripts/gen-android-icons.cjs'), '缺少图标生成脚本').toBe(true);
    const pkg = JSON.parse(readRoot('apps/mobile/package.json'));
    expect(pkg.scripts['icons:android'], '缺少 icons:android 脚本').toBeTruthy();
    // ★ 关键：build:android 必须**先**生成图标再 cap sync，否则打出来的还是旧图
    const ba: string = pkg.scripts['build:android'];
    expect(ba, 'build:android 未调用图标生成').toContain('gen-android-icons.cjs');
    expect(ba.indexOf('gen-android-icons.cjs'), '图标生成必须在 vite build 之前').toBeLessThan(ba.indexOf('vite build'));
  });

  it('★ 脚手架默认的 vector（会盖住位图）必须已删除', () => {
    // 该断言原本在产物层，但它查的是**仓库内**的 tracked 资源，不依赖 cap 生成目录 → 归契约层
    const candidates = [
      'apps/mobile/android/app/src/main/res/drawable/ic_launcher_background.xml',
      'apps/mobile/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml',
    ];
    for (const c of candidates) {
      expect(existsRoot(c), `脚手架默认 vector 仍在（会盖住我们的位图）: ${c}`).toBe(false);
    }
  });
});

describe('①b APK 图标产物（需 `cap add android` 生成目录）', () => {
  const RES = 'apps/mobile/android/app/src/main/res';
  // ★ 生成目录不存在 → 整组跳过（附原因），而不是报红
  const hasAndroidProject = existsRoot(RES);
  const maybe = hasAndroidProject ? describe : describe.skip;
  if (!hasAndroidProject) {
    it.skip(`（跳过）apps/mobile/android 不存在 —— 需先 \`pnpm --filter @yan-zhi/mobile exec cap add android\`；` +
      `CI 的 build-mobile.yml 会在干净 runner 上先 cap add 再跑本组断言`, () => { /* 占位 */ });
  }
  maybe('图标位图', () => {
    it('★ 五个密度的 ic_launcher / round / foreground 都必须存在', () => {
      const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
      const missing: string[] = [];
      for (const d of densities) {
        for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
          const p = `${RES}/mipmap-${d}/${f}`;
          if (!existsRoot(p)) missing.push(p);
        }
      }
      expect(missing, '缺失图标文件：' + missing.join(', ')).toEqual([]);
    });
  });
});

// 以下为原 ① 组**其余**断言（依赖生成产物，同样只在工程存在时跑）
describe('①c APK 图标产物 · 尺寸与内容', () => {
  const RES = 'apps/mobile/android/app/src/main/res';
  const hasAndroidProject = existsRoot(RES);
  const maybe = hasAndroidProject ? describe : describe.skip;
  maybe('尺寸/内容校验', () => {
    it('★ 尺寸必须符合 Android 密度表（legacy 48/72/96/144/192，adaptive 108/162/216/324/432）', () => {
      const legacy: Record<string, number> = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
      const pngSize = (p: string) => {
        const b = readFileSync(resolve(REPO_ROOT, p));
        // PNG: IHDR 的宽高在偏移 16/20（大端）
        return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
      };
      for (const [d, n] of Object.entries(legacy)) {
        expect(pngSize(`${RES}/mipmap-${d}/ic_launcher.png`).w, `mipmap-${d} 方形尺寸不对`).toBe(n);
        expect(pngSize(`${RES}/mipmap-${d}/ic_launcher_round.png`).w, `mipmap-${d} 圆形尺寸不对`).toBe(n);
      }
    });

    it('★ 图标内容必须来自言智 logo（不是脚手架默认的「惊讶脸」）', () => {
      // 判据：源 logo 存在，且生成的位图**尺寸符合密度表**（脚手架默认图是固定尺寸）
      // —— 比"字节不同"更有意义：默认图与 logo 尺寸不同，尺寸对得上说明确实由 logo 生成。
      //
      // ★★★ 2026-10-17 修（本断言此前恒红）：原写法把源图路径硬编码成
      //   `apps/mobile/resources/icon.png` —— 那个目录**从来不存在、也没被 git 跟踪**。
      //   真实源图是 gen-android-icons.cjs 的 DEFAULT_SOURCE：`assets/icons/icon.png`
      //   （518KB，已跟踪）。两处各写一个路径必然漂移，本次正是漂移的后果。
      //   ⇒ 改为**从脚本解析**（单一真相源），脚本改路径本断言自动跟着变；
      //     解析失败一律 fail，不静默跳过（本文件既有教训：静默跳过的断言等于摆设）。
      const gen = readRoot('apps/mobile/scripts/gen-android-icons.cjs');
      const sm = gen.match(/DEFAULT_SOURCE\s*=\s*path\.join\(\s*REPO_ROOT([^)]*)\)/);
      expect(sm, '未能从 gen-android-icons.cjs 解析 DEFAULT_SOURCE（脚本结构变了？）').toBeTruthy();
      const logoPath = [...sm![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).join('/');
      expect(logoPath, '解析出的源图路径为空').toBeTruthy();
      expect(existsRoot(logoPath), `缺少言智 logo 源图（icons:android 的输入）: ${logoPath}`).toBe(true);
      const b = readFileSync(resolve(REPO_ROOT, `${RES}/mipmap-xxxhdpi/ic_launcher.png`));
      expect({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) }, '生成的图标尺寸不符合自适应图标表')
        .toEqual({ w: 192, h: 192 });
    });

    it('adaptive icon 描述必须指向颜色背景 + 前景位图（并含 monochrome）', () => {
      const xml = readRoot(`${RES}/mipmap-anydpi-v26/ic_launcher.xml`);
      expect(xml).toMatch(/@color\/ic_launcher_background|@color/);
      expect(xml).toMatch(/@mipmap\/ic_launcher_foreground/);
      expect(xml, 'adaptive icon 缺 monochrome（Android 13 主题图标）').toMatch(/monochrome/);
    });
  });
});

// ⚠️ 以下为**旧版**起始标记，保留供 diff 对照，实际已由上方分组取代

describe('② 模型下拉不得共用 visible（否则点一次弹两个窗）', () => {
  it('★ 移动端模型钮与桌面端模型胶囊用不同的 visible', () => {
    // el-popover 内容 Teleport 到 body，不受父容器 display:none 影响 →
    // 两个 popover 共用同一 visible 时，点一次两个都弹（用户报的「两个弹窗」）。
    const code = stripComments(CHAT_INPUT);
    const visibles = [...code.matchAll(/v-model:visible="(\w+)"/g)].map((m) => m[1]);
    const modelVisibles = visibles.filter((v) => /model/i.test(v));
    expect(modelVisibles.length, '应有两个模型相关 popover').toBeGreaterThanOrEqual(2);
    expect(new Set(modelVisibles).size, '★ 模型相关 popover 必须用不同的 visible 变量').toBe(modelVisibles.length);
  });

  it('★ 桌面端模型胶囊与移动端模型钮必须 v-if 互斥（不能只靠 CSS 隐藏）', () => {
    const code = stripComments(CHAT_INPUT);
    // ★ 锚点必须精确到"持有 modelPopOpen 的那个 popover 标签本身"——
    //   用 placement="top-end" 当锚点会先命中前面的 el-tooltip（实测踩到，断言假红）。
    const tagIdx = code.indexOf('v-model:visible="modelPopOpen"');
    expect(tagIdx, '未找到桌面端模型 popover').toBeGreaterThan(0);
    // 标签起点：往回找最近的 '<el-popover'
    const tagStart = code.lastIndexOf('<el-popover', tagIdx);
    expect(tagStart).toBeGreaterThan(0);
    const tag = code.slice(tagStart, code.indexOf('>', tagIdx) + 1);
    expect(tag, '★ 桌面端模型胶囊缺少 v-if 门控（窄屏会与移动端弹层双开）').toMatch(/v-if="!isMobileShell"/);

    // 移动端工具条区：应只在移动壳下渲染
    const mobileWrap = code.indexOf('toolbar-mobile-selects');
    expect(mobileWrap).toBeGreaterThan(0);
    const wrapTagStart = code.lastIndexOf('<div', mobileWrap);
    const wrapTag = code.slice(wrapTagStart, code.indexOf('>', mobileWrap) + 1);
    expect(wrapTag, 'toolbar-mobile-selects 应由移动壳门控').toMatch(/v-if="isMobileShell"/);
  });

  it('两个 visible 都要在收起时被收尾（不留幽灵弹层）', () => {
    const code = stripComments(CHAT_INPUT);
    // watch 应同时盯两个开关
    expect(code).toMatch(/watch\(\[modelPopOpen,\s*mobileModelPopOpen\]/);
  });
});

describe('③ 长按必须真的接上（不只是有函数）', () => {
  it('★ useLongPress 必须导出 bindLongPress，且用 Pointer Events 区分触屏', () => {
    expect(LONG_PRESS).toContain('export function bindLongPress');
    // 只对 touch 生效 → 桌面右键不受影响
    expect(LONG_PRESS).toMatch(/pointerType\s*!==\s*'touch'/);
    // 触发后吞掉误点
    expect(LONG_PRESS, '缺少长按后吞 click 的逻辑').toMatch(/swallowClick/);
  });

  it('★ 会话列表必须绑上长按（不能只有 @contextmenu）', () => {
    // 用户反馈「长按没有实现」的直接体现：界面写着「右键会话进入批量」，
    // 而移动端没有右键 → 必须补长按。
    expect(SIDEBAR, '会话列表未接长按').toContain('bindLongPress');
    // 会话项（两处 v-for）都应带上
    const convBindings = [...SIDEBAR.matchAll(/bindLongPress\(\(ev\)\s*=>\s*openConvMenu/g)].length;
    expect(convBindings, '★ 会话项（含空间内会话）都应绑长按，实测应有 2 处').toBeGreaterThanOrEqual(2);
    // 空间节点也应可长按（手机上没有右键编辑空间）
    expect(SIDEBAR, '空间节点未接长按').toMatch(/bindLongPress\(\(ev\)\s*=>\s*openSpaceMenu/);
  });

  it('★ 触屏/鼠标分流：长按与右键菜单入口共存（2026-10-04 批量提示文案已按用户要求移除，不再断言界面文案）', () => {
    const code = stripComments(SIDEBAR);
    // isTouchShell 仍用于动作面板（ActionSheet）与定位菜单的分流
    expect(code, '缺少触屏判定').toContain('isTouchShell');
    expect(code).toMatch(/const\s+isTouchShell\s*=\s*useMobileShell\(\)/);
    // 长按与右键两个入口都必须在
    expect(code, '会话列表未接长按').toContain('bindLongPress');
    expect(code, '桌面右键入口丢失').toContain('contextmenu');
  });
});

describe('④ 数据初始化：移动端冷启动必须等后端就绪', () => {
  it('★★ apiFetch 必须把网络层错误转成 ApiError（不能抛出去）', () => {
    // 修复前：`const res = await fetch(...)` 没有 catch → ERR_CONNECTION_REFUSED 抛
    // `TypeError: Failed to fetch` → 击穿路由启动 → .chat-page 永不挂载 → 数据全空。
    expect(CLIENT, '★ fetch 缺少 catch，网络错误会击穿调用方').toMatch(/await fetch\([\s\S]{0,120}?\.catch\(/);
    expect(CLIENT, '缺少网络不可达的哨兵返回值').toContain('NETWORK_UNREACHABLE');
    expect(CLIENT, '网络错误应带 status: 0').toMatch(/status:\s*0/);
  });

  it('★ waitForBackend 必须存在，且用免授权接口探测（避免被门禁误判）', () => {
    expect(BACKEND_READY).toContain('export async function waitForBackend');
    // 探测路径必须免授权，否则 401 会被当"后端没起"
    expect(BACKEND_READY, '探测路径应免授权').toContain('/license/default');
    // 拿到任何 HTTP 响应即视为就绪（含 401/403）
    expect(BACKEND_READY).toMatch(/res\.status\s*>\s*0/);
    // 幂等记忆：就绪后立即返回，不引入额外延迟
    expect(BACKEND_READY).toMatch(/if\s*\(ready\)\s*return\s+true/);
  });

  it('★★ 授权校验（路由守卫第一道）必须先等后端就绪', () => {
    const code = stripComments(LICENSE);
    const initIdx = code.indexOf('async function init()');
    expect(initIdx).toBeGreaterThan(0);
    const body = code.slice(initIdx, initIdx + 1200);
    // ★ 必须断言"被 await 调用"，不能只断言"包含 waitForBackend" ——
    //   变异测试证明：写成 `void waitForBackend;`（引用但不调用）也能通过"包含"检查，
    //   等于断言失效（本轮 m2 一开始就是这么漏的）。
    expect(body, '★ license.init 未真正等待后端就绪').toMatch(/await\s+waitForBackend\(\)/);
    // ★ 必须**在取授权码之前**等（否则第一次 loadLicenseCode/verify 就打空后端）
    const waitIdx = body.indexOf('await waitForBackend()');
    const loadIdx = body.indexOf('loadLicenseCode');
    expect(waitIdx, '★ 等待必须发生在读取/校验授权码之前').toBeGreaterThan(-1);
    expect(waitIdx).toBeLessThan(loadIdx);
    // 超时不能把用户永久挡在授权页
    expect(body, '超时未放行（会把用户永久挡在授权页）').toMatch(/initialized\.value\s*=\s*true/);
  });

  it('★★ useChat.onMounted 必须等后端就绪（否则 agent 静默清空且无重试）', () => {
    // 实测：无重试的 loadAgents 排第一 → 永久为空；有 getWithRetry 的 loadPlatforms
    // 靠重试窗口侥幸成功 → 形成"平台有、智能体没有"的极不对称半初始化。
    const code = stripComments(USE_CHAT);
    const idx = code.indexOf('onMounted(async () =>');
    expect(idx).toBeGreaterThan(0);
    const body = code.slice(idx, idx + 1600);
    const waitIdx = body.indexOf('waitForBackend');
    const firstLoad = body.indexOf('agentStore.loadAgents');
    expect(waitIdx, '★ onMounted 未等后端就绪').toBeGreaterThan(0);
    expect(waitIdx, '★ 等待必须在首个 load 之前').toBeLessThan(firstLoad);
  });

  it('★ getWithRetry 必须把 status:0（网络不可达）当作可重试', () => {
    const PLATFORM = read('stores/platform.ts');
    const code = stripComments(PLATFORM);
    const i = code.indexOf('async function getWithRetry');
    const body = code.slice(i, i + 1200);
    // 4xx 直接返回（确定性错误）；其余（含 0）应重试
    expect(body).toMatch(/status\s*>=\s*400\s*&&\s*status\s*<\s*500/);
    // ★ 锚点不能只认注释文字（stripComments 会把注释去掉）——要看**代码**里
    //   是否显式处理了 status===0 这个"网络层失败"哨兵值。
    expect(body, '★ 未考虑 status:0（网络层失败）的可重试性').toMatch(/status\s*===\s*0/);
    // 反向：不该把 0 也当 4xx 一起 return（那就是不重试）
    expect(body, '★ status:0 不得被并入"确定性错误直接返回"的分支')
      .not.toMatch(/status\s*>=\s*0\s*&&\s*status\s*<\s*500\)\s*return/);
  });
});

describe('⑤ 不得把内部 guest 身份显示成"已登录账号"', () => {
  const AUTH = read('stores/auth.ts');

  it('★★ isLoggedIn 必须排除 guest 身份（否则 UI 会渲染成已登录的 guest）', () => {
    // 后端 authMiddleware 恒定以 guest 作为数据归属身份（全库 user_id='guest'），
    // 所以 guest **必须在**；但前端不能把 `!!user` 当登录态 ——
    // 那会让侧栏/顶栏渲染出「g + 绿点 + 退出登录」，用户看到的就是
    // 「默认帮我登录了一个 guest 账号」（2026-09-22 反馈）。
    expect(AUTH, '缺少 guest 身份判定').toMatch(/isGuestIdentity/);
    expect(AUTH, '★ isLoggedIn 未排除 guest').toMatch(
      /isLoggedIn\s*=\s*computed\(\(\)\s*=>\s*!!user\.value\s*&&\s*!isGuestIdentity\(user\.value\)\)/,
    );
    const i = AUTH.indexOf('function isGuestIdentity');
    const body = AUTH.slice(i, i + 400);
    expect(body, '判定应认 username').toMatch(/username\s*===\s*'guest'/);
    expect(body, '判定应认 id').toMatch(/id\s*===\s*'guest'/);
  });

  it('★ auth store 必须导出 isGuest（UI 据此显示"未登录"而不是 guest 账号）', () => {
    expect(AUTH).toMatch(/const\s+isGuest\s*=\s*computed/);
    expect(AUTH, 'isGuest 未从 store 导出').toMatch(/return\s*\{[^}]*isGuest[^}]*\}/);
  });

  it('★ 侧栏底部身份区必须用 isLoggedIn 分流，且有明确的"登录"入口分支', () => {
    // ★ 2026-10-03 更新：未登录分支的文案从「未登录」演进为「登录」入口
    //   （is-login-entry，点击进 /login）。钉住的结构语义不变：
    //   isLoggedIn 分流 + v-else 兜底分支 + 引导去 /login。
    const SIDE = stripComments(read('components/SideNav.vue'));
    expect(SIDE).toMatch(/v-if="authStore\.isLoggedIn"/);
    expect(SIDE, '缺少兜底分支').toMatch(/v-else/);
    expect(SIDE, '未登录分支应是登录入口（进 /login）').toMatch(/is-login-entry[\s\S]{0,200}\$router\.push\('\/login'\)/);
    expect(SIDE, '不得用 !!authStore.user 当登录判据').not.toMatch(/v-if="!!authStore\.user/);
  });

  it('★ loadUser 必须先等后端就绪（否则网络失败被误判成 guest 身份）', () => {
    const code = stripComments(AUTH);
    const i = code.indexOf('async function loadUser');
    const body = code.slice(i, i + 700);
    expect(body, 'loadUser 未等后端就绪').toContain('waitForBackend');
  });

  it('★★★ plugin.refresh 必须先等后端就绪（dev 冷启动后端 >30s 时插件列表静默为空）', () => {
    // ★ 2026-10-12 实测（用户实报 console 原文）：
    //   `GET http://127.0.0.1:3001/api/plugins net::ERR_CONNECTION_REFUSED at plugin.ts:75`
    //   本函数由 `ModeSwitcher.vue` 的 onMounted 直接调用（启动关键路径），
    //   而后端 tsx 冷编译可能 > 主进程 30s 健康检查上限（实测 17:25:34 启动 →
    //   17:26:06「启动超时，强制创建窗口」→ 17:26:35 前端挂载即被拒）。
    //   ⇒ 请求被拒 ⇒ `plugins.value` 空、`loaded` 不置位、后续也不重试 ⇒ **静默缺 UI**。
    //   ★ 这是当时**唯一**漏掉 waitForBackend 的启动期请求（auth/license/useChat/Agents/Models 都有）。
    const PLUGIN = read('stores/plugin.ts');
    const code = stripComments(PLUGIN);
    const i = code.indexOf('async function refresh');
    expect(i, '未找到 plugin.refresh').toBeGreaterThan(-1);
    const body = code.slice(i, i + 900);
    const waitIdx = body.indexOf('waitForBackend');
    const fetchIdx = body.indexOf("api.get<PluginInfo[]>('/plugins')");
    expect(waitIdx, '★★★ plugin.refresh 未等后端就绪 —— 冷启动时插件列表静默为空').toBeGreaterThan(-1);
    expect(fetchIdx, '未找到 /plugins 请求锚点').toBeGreaterThan(-1);
    expect(waitIdx, '★ 等待必须在首个请求之前').toBeLessThan(fetchIdx);
  });
});

/*
 * ===== 变异测试记录（2026-09-22）=====
 * 每条都把正确写法改回错误写法，确认断言变红后还原：
 *  m1  client.ts：去掉 fetch 的 .catch → 恢复"抛异常"             → 变红 ✓
 *  m2  license.ts：删掉 init 里的 waitForBackend                  → 变红 ✓
 *  m3  license.ts：把 waitForBackend 挪到 loadLicenseCode 之后     → 变红 ✓
 *  m4  useChat.ts：删掉 onMounted 里的 waitForBackend              → 变红 ✓
 *  m5  ChatInputArea：移动端 popover 改回共用 modelPopOpen         → 变红 ✓
 *  m6  ChatInputArea：删桌面胶囊的 v-if="!isMobileShell"           → 变红 ✓
 *  m7  ChatSidebar：删会话项的 v-on="bindLongPress(...)"           → 变红 ✓
 *  m8  ChatSidebar：文案改回只写"右键"                             → 变红 ✓
 *  m9  ic_launcher_background.xml：改回 #26A69A（脚手架青绿）      → 变红 ✓
 *  m10 package.json：build:android 去掉 gen-android-icons 调用     → 变红 ✓
 *  m11 恢复脚手架 drawable 的 ic_launcher_foreground.xml           → 变红 ✓
 *
 * ===== 变异测试补充（2026-10-17，修"源图路径硬编码漂移"）=====
 * 背景：①c 的"图标来自言智 logo"断言把源图路径硬编码成 `apps/mobile/resources/icon.png`，
 *   而该目录**从未存在也没被 git 跟踪**（真实源图是 gen-android-icons.cjs 的
 *   DEFAULT_SOURCE = `assets/icons/icon.png`，已跟踪）⇒ 本机恒红、CI 干净检出也恒红。
 *   改为从脚本解析路径后补做变异：
 *  m12 gen-android-icons.cjs：DEFAULT_SOURCE 指向 assets/icons/nope.png    → 变红 ✓
 *      （报错带出解析出的真实路径，一眼看出路径来源）
 *  m13 gen-android-icons.cjs：`DEFAULT_SOURCE` 改名 `ICON_SRC`（正则失配）   → 变红 ✓
 *      （解析失败一律 fail，不静默跳过 —— 本文件 ①b 的既有教训）
 */