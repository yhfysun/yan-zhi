/**
 * 连接器本地化（2026-10-17 P0/P1/P2）守门测试。
 *
 * 覆盖三块：
 *   ① openclaw-util 纯函数真跑（版本门槛 / 扫码输出解析 / openclaw.json 合并）
 *      —— 解析标记全部复刻自 @tencent-weixin/openclaw-weixin 2.4.10 插件源码
 *        login-qr.js 的真实 stdout 输出，勿凭记忆改期望值。
 *   ② 源码锚点：桥接同步路由（token 鉴权、不走登录态）、飞书长连接装配、
 *      启动恢复、manager 关键编排步骤。
 *   ③ 判据背景：
 *      - 二维码 URL 来自插件 displayQRCode 打印的「备用链接」行（真实接口，非臆造）；
 *      - 桥接走 before_dispatch {handled:true,text}，回复由宿主回发（官方 hooks 文档）；
 *      - bridgeToken 在连接器 create/update 两处都必须保住（update 全量替换 config_json
 *        会把它冲掉 → 桥接 401 静默断链，2026-10-17 修的就是这个）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OPENCLAW_MIN_NODE,
  INITIAL_LOGIN_STATE,
  compareNodeVersion,
  parseLoginOutput,
  mergePluginEntry,
} from '../src/services/openclaw-util';

const SERVER_ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(SERVER_ROOT, p), 'utf8');

describe('① compareNodeVersion：OpenClaw 的 Node 门槛判定', () => {
  it('★ 门槛是 24.16.0（官方 README：Node 26 推荐 / 24.16+ 支持）', () => {
    expect(OPENCLAW_MIN_NODE).toBe('24.16.0');
  });

  it('★ 24.16.0 恰好达标（边界含在内），24.15.9 差一点也不行', () => {
    expect(compareNodeVersion('24.16.0', OPENCLAW_MIN_NODE)).toBe(0);
    expect(compareNodeVersion('24.15.9', OPENCLAW_MIN_NODE)).toBeLessThan(0);
    expect(compareNodeVersion('24.16.1', OPENCLAW_MIN_NODE)).toBeGreaterThan(0);
  });

  it('★ 逐段比较：22.20.0（本机系统 node）不达标；26.x 高位段压过 24.x', () => {
    expect(compareNodeVersion('22.20.0', OPENCLAW_MIN_NODE)).toBeLessThan(0);
    expect(compareNodeVersion('26.1.0', OPENCLAW_MIN_NODE)).toBeGreaterThan(0);
    expect(compareNodeVersion('24.2.0', '24.10.0')).toBeLessThan(0);
  });

  it('★ 非法段按 0 处理，不抛异常', () => {
    expect(() => compareNodeVersion('v24', OPENCLAW_MIN_NODE)).not.toThrow();
    expect(compareNodeVersion('', OPENCLAW_MIN_NODE)).toBeLessThanOrEqual(0);
  });
});

describe('② parseLoginOutput：扫码输出 → 状态机（标记复刻自插件源码）', () => {
  // 以下输出逐字取自 @tencent-weixin/openclaw-weixin 2.4.10 dist/src/auth/login-qr.js
  const QR_MARKER = '若二维码未能显示或无法使用，你可以访问以下链接以继续：\n';
  const QR_URL = 'https://login.work.weixin.qq.com/qr/FAKE_QR_CONTENT';

  it('★ 从「备用链接」标记行的下一行提取二维码 URL 并进入 waiting_scan', () => {
    const st = parseLoginOutput(INITIAL_LOGIN_STATE, `用手机微信扫描以下二维码，以继续连接：\n${QR_MARKER}${QR_URL}\n`);
    expect(st.qrUrl).toBe(QR_URL);
    expect(st.phase).toBe('waiting_scan');
  });

  it('★★ 增量输出：URL 可能在后续 chunk 里才到（跨进程写入分片）', () => {
    let st = parseLoginOutput(INITIAL_LOGIN_STATE, `xxx\n${QR_MARKER}`);
    expect(st.qrUrl).toBe(''); // 标记已见、URL 未到，不能假报拿到
    st = parseLoginOutput(st, QR_URL + '\n');
    expect(st.qrUrl).toBe(QR_URL);
    expect(st.phase).toBe('waiting_scan');
  });

  it('★ 二维码刷新（过期/重试）不丢旧 URL，且不误入 verifying', () => {
    let st = parseLoginOutput(INITIAL_LOGIN_STATE, `${QR_MARKER}${QR_URL}\n`);
    st = parseLoginOutput(st, '\n⏳ 二维码已过期，正在刷新...\n');
    expect(st.qrUrl).toBe(QR_URL);
    expect(st.phase).toBe('waiting_scan');
    st = parseLoginOutput(st, '\n🔄 二维码已更新，请重新扫描。\n\n');
    expect(st.phase).toBe('waiting_scan');
  });

  it('★ 新 URL 到来时覆盖旧 URL（刷新后必须展示新码）', () => {
    let st = parseLoginOutput(INITIAL_LOGIN_STATE, `${QR_MARKER}${QR_URL}\n`);
    st = parseLoginOutput(st, `\n⏳ 正在刷新二维码...(1/3)\n${QR_MARKER}https://login.work.weixin.qq.com/qr/NEW_ONE\n`);
    expect(st.qrUrl).toBe('https://login.work.weixin.qq.com/qr/NEW_ONE');
  });

  it('★ 「正在验证」→ verifying；✅ → success（含已连接过的幂等场景）', () => {
    let st = parseLoginOutput(INITIAL_LOGIN_STATE, `${QR_MARKER}${QR_URL}\n`);
    st = parseLoginOutput(st, '\n正在验证\n');
    expect(st.phase).toBe('verifying');
    st = parseLoginOutput(st, '\n✅ 已连接过此 OpenClaw，无需重复连接。\n');
    expect(st.phase).toBe('success');
    expect(st.message).toContain('已连接过此 OpenClaw');
  });

  it('★ ⛔ → error，且错误信息保留原文（去掉符号）', () => {
    const st = parseLoginOutput(INITIAL_LOGIN_STATE, '\n⛔ 多次输入错误，请稍后再试。\n');
    expect(st.phase).toBe('error');
    expect(st.message).toBe('多次输入错误，请稍后再试。');
  });

  it('★ 无关输出（进度点等）不改变阶段', () => {
    const st = parseLoginOutput(INITIAL_LOGIN_STATE, '...\n某行普通日志\n');
    expect(st).toEqual(INITIAL_LOGIN_STATE);
  });
});

describe('③ mergePluginEntry：openclaw.json 的 plugins.entries 合并', () => {
  it('★ 注入新插件条目，保留既有条目与其 config', () => {
    const cfg = {
      gateway: { port: 18789 },
      plugins: { entries: { other: { enabled: true, config: { a: 1 } } } },
    };
    const out = mergePluginEntry(cfg, 'yanzhi-bridge', {
      enabled: true,
      hooks: { allowConversationAccess: true },
      config: { endpoint: 'http://127.0.0.1:3001/api/im/bridge/wechat-personal', token: 't1' },
    });
    expect(out.plugins.entries.other.enabled).toBe(true);
    expect(out.plugins.entries.other.config.a).toBe(1);
    expect(out.plugins.entries['yanzhi-bridge'].enabled).toBe(true);
    expect(out.plugins.entries['yanzhi-bridge'].hooks.allowConversationAccess).toBe(true);
    expect(out.plugins.entries['yanzhi-bridge'].config.endpoint).toContain('/api/im/bridge/wechat-personal');
    expect(out.gateway.port).toBe(18789);
  });

  it('★ 重复装配不覆盖既有 config 键（幂等合并），且不改入参', () => {
    const cfg = { plugins: { entries: { 'yanzhi-bridge': { enabled: true, config: { endpoint: 'old', token: 'keep' } } } } };
    const snapshot = JSON.stringify(cfg);
    const out = mergePluginEntry(cfg, 'yanzhi-bridge', { enabled: true, config: { endpoint: 'new' } as any });
    expect(out.plugins.entries['yanzhi-bridge'].config.endpoint).toBe('new');
    expect(out.plugins.entries['yanzhi-bridge'].config.token).toBe('keep');
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });
});

describe('④ 源码锚点：桥接路由 / 飞书长连接 / 生命周期装配', () => {
  const routes = read('src/routes/im.ts');
  const manager = read('src/services/openclaw-manager.ts');
  const feishu = read('src/services/feishu-stream.ts');
  const im = read('src/services/im.ts');
  const wechatPersonal = read('src/services/im/providers/wechat-personal.ts');
  const index = read('src/index.ts');

  it('★★ 桥接同步路由存在且用 bridgeToken 鉴权（不走登录态：调用方是本机 Gateway 进程）', () => {
    expect(routes).toContain("router.post('/bridge/wechat-personal'");
    expect(routes).toContain("req.headers['x-bridge-token']");
    // 鉴权必须查 enabled=1 的 wechat-personal 连接器并比对 bridgeToken
    expect(routes).toContain("provider = 'wechat-personal' AND enabled = 1");
  });

  it('★★ AI 闭环与桥接共用同一 startImTask（去重/落库收口，禁止两份实现）', () => {
    expect(im).toContain('function startImTask(');
    const uses = im.match(/startImTask\(/g)?.length ?? 0;
    expect(uses, 'runImClosedLoop 与 runWechatPersonalBridge 各调一次 + 定义本身').toBeGreaterThanOrEqual(3);
    expect(im).toContain('export async function runWechatPersonalBridge(');
    expect(im).toContain('IM_BRIDGE_REPLY_TIMEOUT_MS');
  });

  it('★★ bridgeToken 双向保护：create 生成、update 保留（冲掉 = 桥接 401 静默断链）', () => {
    expect(im).toContain("input.provider === 'wechat-personal' && !config.bridgeToken");
    // 锚点必须钉完整语句：子串锚会被注释里的同名代码骗过（2026-10-17 m2 实测）
    expect(im).toContain('if (!cfgOut.bridgeToken && existingToken) cfgOut.bridgeToken = existingToken;');
    expect(im).toContain("else if (!cfgOut.bridgeToken) cfgOut.bridgeToken = uuid();");
  });

  it('★★ 测试连接对 wechat-personal 是真校验（Gateway 可达 + bridgeToken 存在），不是假 ok', () => {
    expect(wechatPersonal).toContain('个人微信连接器缺少桥接令牌');
    expect(wechatPersonal).toContain('127.0.0.1:18789');
    expect(wechatPersonal).not.toContain('仅校验配置');
  });

  it('★ manager：Node 门槛 → openclaw 宿主 → 微信插件 → 桥接 link 安装 → gateway restart 全链在位', () => {
    expect(manager).toContain('OPENCLAW_MIN_NODE');
    expect(manager).toContain("npmGlobalInstall(nodeDir, 'openclaw'");
    expect(manager).toContain('"@tencent-weixin/openclaw-weixin@latest"');
    expect(manager).toContain('plugins install --link');
    expect(manager).toContain('gateway restart');
    expect(manager).toContain("import { dataDir } from '../db.js'");
  });

  it('★ 托管 Node 下载镜像 npmmirror 优先、官方源兜底（本机网络口径）', () => {
    // 修复后：npmmirror 走二进制 JSON API（registry.npmmirror.com/-/binary/node/），不再用会 302 跳 JSON 的旧 mirrors/node HTML 路径
    expect(manager).toContain('registry.npmmirror.com/-/binary/node/');
    expect(manager).not.toContain('npmmirror.com/mirrors/node/');
    expect(manager).toContain('https://nodejs.org/dist/latest-v24.x/');
  });

  it('★★ 飞书长连接：WSClient + im.message.receive_v1 喂现有 handleImInbound（同一闭环）', () => {
    expect(feishu).toContain('new Lark.WSClient(');
    expect(feishu).toContain("'im.message.receive_v1'");
    expect(feishu).toContain('handleImInbound(this.connectorId, this.userId');
    expect(feishu).toContain('close({ force: true })');
    expect(feishu).toContain('export function syncFeishuStreamClients(');
  });

  it('★ 飞书同步与钉钉同口径：连接器三处变更点 + 启动恢复都要调', () => {
    const feishuCalls = routes.match(/void syncFeishuStreamClients\(\);/g)?.length ?? 0;
    expect(feishuCalls, 'create / update / delete 三处（与 dingtalk 一致）').toBe(3);
    expect(index).toContain('syncFeishuStreamClients();');
  });

  it('★ 桥接插件模板：before_dispatch 返回 {handled:true, text}（回复由宿主回发，无需插件 send API）', () => {
    expect(manager).toContain('before_dispatch');
    expect(manager).toContain('{ handled: true, text: data.reply }');
    expect(manager).toContain("openclaw/plugin-sdk/plugin-entry");
    expect(manager).toContain('allowConversationAccess: true');
  });
});

describe('⑤ 个人微信主动外发（sendWechatPersonal）：经 Gateway /tools/invoke 调 message 工具', () => {
  const im = read('src/services/im/providers/wechat-personal.ts');
  const manager = read('src/services/openclaw-manager.ts');

  it('★★ 出站走 Gateway HTTP RPC：/tools/invoke + Bearer 令牌 + message 工具(action=send, channel=weixin)', () => {
    expect(im).toContain('http://127.0.0.1:18789/tools/invoke');
    expect(im).toContain("Authorization: `Bearer ${token}`");
    expect(im).toContain("tool: 'message'");
    expect(im).toContain("action: 'send'");
    expect(im).toContain("channel: 'weixin'");
  });

  it('★★ 抛弃了「暂未开放」stub，改为真实外发实现', () => {
    expect(im).not.toContain('个人微信主动外发暂未开放');
    expect(im).toContain('export async function sendWechatPersonal(');
  });

  it('★★ 前置校验：网关可达性 + 令牌解析（resolveOpenclawGatewayToken），缺任一都给中文错误', () => {
    expect(im).toContain('resolveOpenclawGatewayToken()');
    expect(im).toContain('127.0.0.1:18789 不可达');
    expect(im).toContain('未配置鉴权令牌');
  });

  it('★★ 文件优先本地路径（args.media）规避 2MB body 限制，无路径再 base64 data URL', () => {
    expect(im).toContain('args.media = filePath;');
    expect(im).toContain('data:${input.file.mimeType || ');
  });

  it('★★ manager：导出令牌解析/确保函数，且 assembleBridge 在 gateway restart 前写入令牌', () => {
    expect(manager).toContain('export function resolveOpenclawGatewayToken(');
    expect(manager).toContain('export function ensureOpenclawGatewayToken(');
    expect(manager).toContain('OPENCLAW_GATEWAY_TOKEN');
    // 必须在 gateway restart 之前调用（令牌在网关启动时读取）
    const ensureIdx = manager.indexOf('ensureOpenclawGatewayToken()');
    const restartIdx = manager.indexOf('gateway restart');
    expect(ensureIdx, 'ensure 必须出现在 gateway restart 之前').toBeGreaterThan(0);
    expect(ensureIdx).toBeLessThan(restartIdx);
  });
});

describe('⑥ 便携 Node 自动安装（ensurePortableNode）下载地址 + 解压拍平修复', () => {
  const manager = read('src/services/openclaw-manager.ts');

  it('★★ 版本解析改走 npmmirror 二进制 JSON API（registry.npmmirror.com/-/binary/node/），不再用会 302 跳 JSON 的旧 mirrors/node HTML 路径', () => {
    expect(manager).toContain('registry.npmmirror.com/-/binary/node/');
    expect(manager).toContain('export async function resolveLatestV24(');
    expect(manager).not.toContain('npmmirror.com/mirrors/node/');
  });

  it('★★ 解压后拍平嵌套 node-v* 子目录（旧实现直接 -C 目标目录导致 node.exe 落进子目录、后续找不到二进制）', () => {
    expect(manager).toContain('export function flattenExtractedNode(');
    expect(manager).toContain('flattenExtractedNode(extractDir)');
    // 拍平后 node.exe 必须在 NODE_RUNTIME_DIR 根（portableNodeRelativeBin 预期平铺）
    expect(manager).toContain("path.join(NODE_RUNTIME_DIR, portableNodeRelativeBin())");
  });

  it('★ npm 安装兜底：系统 node 达标时优先用运行服务的 node 自带 npm-cli.js，避免 PATH 劫持裸 npm.cmd', () => {
    expect(manager).toContain('npm-cli.js');
    expect(manager).toContain("'npm.cmd' : 'npm'");
  });
});
