/**
 * 连接器向导本地化（2026-10-17 P0/P1）—— 源码锚点守门。
 *
 * 钉四类退化点：
 *   ① 平台卡片徽标（本地·免公网 / 需公网地址）不许消失；
 *   ② 飞书引导必须改成长连接口径（老的「填回调地址拿 Verify Token」步骤必须删干净，
 *      否则用户被引去配公网回调 = 本地化改造白做）；
 *   ③ 个人微信一键面板（安装 job 轮询 / 扫码状态轮询 / QR 渲染 / 保存后装配）全链在位；
 *   ④ 企微 Token/AESKey 一键生成（43 位 AESKey 长度是平台硬规定，写错必配不上）。
 * 锚点用足够长的固定语句，避免被注释文本骗过（同日 server 测试 m2 教训）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');
const SRC = readFileSync(resolve(here, 'Connections.vue'), 'utf8');

describe('① 平台卡片徽标', () => {
  it('★ 飞书/钉钉/个人微信标「免公网」，企业微信标「需公网地址」', () => {
    expect(SRC).toContain('<span class="choice-badge ok">长连接·免公网</span>');
    expect(SRC).toContain('<span class="choice-badge ok">本地·免公网</span>');
    expect(SRC).toContain('<span class="choice-badge warn">需公网地址</span>');
    // 个人微信卡片必须紧跟免公网徽标（badge 与卡片的对应关系不许错位）
    expect(SRC).toMatch(/choice-badge ok">本地·免公网<\/span>\s*<div class="choice-title">个人微信<\/div>/);
  });
});

describe('② 飞书引导：长连接口径', () => {
  it('★ 必须引导「使用长连接接收事件」并订阅 receive_v1', () => {
    expect(SRC).toContain('使用长连接接收事件');
    expect(SRC).toContain('im.message.receive_v1');
    expect(SRC).toContain('保存后言智自动建立长连接收消息，无需公网回调地址');
  });

  it('★★ 老的 webhook 引导必须删干净（留着就会把用户引去配公网回调）', () => {
    expect(SRC).not.toContain('/api/im/inbound/feishu');
    expect(SRC).not.toContain('拿到 <b>Verification Token</b>');
  });
});

describe('③ 个人微信一键面板', () => {
  it('★ 安装 / 登录 / 装配三组端点调用齐全', () => {
    expect(SRC).toContain("'/im/openclaw/status'");
    expect(SRC).toContain("'/im/openclaw/install'");
    expect(SRC).toContain("'/im/openclaw/install-job'");
    expect(SRC).toContain("'/im/openclaw/login/start'");
    expect(SRC).toContain("'/im/openclaw/login/status'");
    expect(SRC).toContain("'/im/openclaw/bridge/assemble'");
  });

  it('★ 扫码状态轮询里渲染 QR（用插件打印的备用链接 URL 生成），保存后自动装配', () => {
    expect(SRC).toContain('ocQrDataUrl.value = await QRCode.toDataURL(url,');
    expect(SRC).toMatch(/provider === 'wechat-personal'[\s\S]{0,200}bridge\/assemble/);
  });

  it('★ 老的「在服务器安装 ClawBot」误导文案必须不存在', () => {
    expect(SRC).not.toContain('在服务器安装');
    expect(SRC).not.toContain('/api/im/inbound/wechat-personal'); // 回调地址已改为服务端内聚的桥接路由
  });
});

describe('④ 企微凭据一键生成', () => {
  it('★ Token 24 位 / EncodingAESKey 43 位（平台硬规定）', () => {
    expect(SRC).toContain("const len = kind === 'token' ? 24 : 43;");
    expect(SRC).toContain("genWechatCreds('token')");
    expect(SRC).toContain("genWechatCreds('aes')");
  });
});
