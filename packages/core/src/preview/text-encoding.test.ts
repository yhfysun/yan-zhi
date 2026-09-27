// 文本编码自动识别 —— 回归测试
//
// 背景（2026-09-27 用户反馈）：
//   「txt 不支持别的中文格式？电脑的软件打开正常啊，这个应用打开乱码？？」
//
// 根因：所有文本读取路径都**写死 UTF-8**——
//   Node 侧 `fsp.readFile(p,'utf-8')`、桌面 IPC 同口径、浏览器 `file.text()`、
//   Capacitor `Encoding.UTF8`、预览面板 `new TextDecoder('utf-8')`。
//   GBK/GB2312（Windows 记事本「ANSI」另存、老系统导出）的中文 txt 用 UTF-8 解
//   → 每个汉字落到非法序列 → 满屏 U+FFFD。记事本/Word 会自己猜编码，所以"电脑打开正常"。
//
// 这里锁死三件事：
//   ① 判别规则本身（UTF-8 vs GBK vs UTF-16，含 BOM 优先级）
//   ② 二进制判定**必须看字节**（引入 GB18030 兜底后 U+FFFD 判据会失效）
//   ③ 三端适配器 + 预览面板都真的接上了识别器（防"工具写好了但没人用"）

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeTextBytes,
  decodeTextBytesAs,
  looksBinaryBytes,
  base64ToBytes,
  encodingLabel,
} from '@yan-zhi/shared';

const REPO = resolve(__dirname, '../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** 剥注释再断言：注释里出现关键词会造成假绿/假红（本项目踩过多次） */
const strip = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

const u8 = (...bytes: number[]) => new Uint8Array(bytes);

describe('① 编码判别规则', () => {
  it('★★ GBK 编码的中文能被正确读出（本次乱码的原始场景）', () => {
    // "中文测试" 的 GBK 字节
    const gbk = u8(0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4);
    const r = decodeTextBytes(gbk);
    expect(r.text).toBe('中文测试');
    expect(r.encoding).toBe('gb18030');
  });

  it('★★ 同样的 GBK 字节用 UTF-8 解是乱码 —— 证明「必须识别」不是多余', () => {
    const gbk = u8(0xd6, 0xd0, 0xce, 0xc4);
    const wrong = new TextDecoder('utf-8').decode(gbk);
    expect(wrong).not.toBe('中文');
    expect(wrong).toContain('\uFFFD'); // 旧行为：满屏替换符
  });

  it('★ UTF-8 中文正常识别，不会被误判成 GBK', () => {
    const utf8 = new TextEncoder().encode('这是 UTF-8 中文 ABC');
    const r = decodeTextBytes(utf8);
    expect(r.text).toBe('这是 UTF-8 中文 ABC');
    expect(r.encoding).toBe('utf-8');
  });

  it('★ 纯 ASCII 判为 UTF-8（不因"GBK 也能解"而误判）', () => {
    const r = decodeTextBytes(new TextEncoder().encode('hello world\nfoo=bar'));
    expect(r.text).toBe('hello world\nfoo=bar');
    expect(r.encoding).toBe('utf-8');
  });

  it('★★ BOM 优先于一切推断（写入方的显式声明）', () => {
    // UTF-8 BOM + 中文
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('中文')]);
    const r1 = decodeTextBytes(withBom);
    expect(r1.encoding).toBe('utf-8');
    expect(r1.text).toBe('中文'); // BOM 本身必须被剥掉，不能出现在正文里
    expect(r1.text.startsWith('\uFEFF')).toBe(false);
  });

  it('★ UTF-16 LE / BE 带 BOM 都能解（Windows 记事本「Unicode」另存）', () => {
    const le = new Uint8Array([0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65]); // 中文
    const be = new Uint8Array([0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87]);
    expect(decodeTextBytes(le)).toMatchObject({ text: '中文', encoding: 'utf-16le' });
    expect(decodeTextBytes(be)).toMatchObject({ text: '中文', encoding: 'utf-16be' });
  });

  it('★ 空文件不抛错', () => {
    expect(decodeTextBytes(u8())).toEqual({ text: '', encoding: 'utf-8' });
  });

  it('★ 按指定编码解码（显式指定优先于自动识别）', () => {
    const gbk = u8(0xd6, 0xd0, 0xce, 0xc4);
    expect(decodeTextBytesAs(gbk, 'gbk')).toBe('中文');
    expect(decodeTextBytesAs(gbk, 'GB18030')).toBe('中文');
    expect(decodeTextBytesAs(gbk, 'gb2312')).toBe('中文');
    const utf8 = new TextEncoder().encode('中文');
    expect(decodeTextBytesAs(utf8, 'utf-8')).toBe('中文');
  });

  it('★ 不认识的编码名返回 null（调用方要如实报错，不能静默按 UTF-8 读）', () => {
    const bytes = new TextEncoder().encode('hi');
    expect(decodeTextBytesAs(bytes, 'not-a-real-encoding')).toBeNull();
    expect(decodeTextBytesAs(bytes, '')).toBeNull();
  });

  it('★ base64 → 字节与原文一致（三端共用原语）', () => {
    const src = new TextEncoder().encode('中文测试 abc');
    const b64 = Buffer.from(src).toString('base64');
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(src));
    expect(decodeTextBytes(base64ToBytes(b64)).text).toBe('中文测试 abc');
  });

  it('★ 编码展示名贴近用户认知（GB18030 显示成 GBK）', () => {
    expect(encodingLabel('gb18030')).toBe('GBK');
    expect(encodingLabel('utf-8')).toBe('UTF-8');
    expect(encodingLabel('utf-16le')).toBe('UTF-16 LE');
  });

  it('★★ 不要把 Big5 猜成 GBK（已知局限：两者互解都不抛错，只能人工指定）', () => {
    // 这条是**反向约束**：防止有人"顺手加个 Big5 启发式"把正常 GBK 文件猜坏。
    // 判别器只有「严格 UTF-8 是否通过」这一条硬信号，Big5/GBK 无法靠它区分。
    const gbk = new TextEncoder().encode('中文');
    expect(decodeTextBytes(gbk).encoding).toBe('utf-8'); // UTF-8 能过 → 就是 UTF-8
    // Big5 字节仍可显式指定解码
    const big5 = u8(0xa4, 0xa4, 0xa5, 0x7c);
    expect(decodeTextBytesAs(big5, 'gbk')).not.toBe('中文'); // 不擅自"猜对"
  });
});

describe('② 二进制判定必须看字节（不能沿用 U+FFFD 计数）', () => {
  it('★★ NUL 字节 → 判为二进制', () => {
    expect(looksBinaryBytes(u8(0x50, 0x4b, 0x03, 0x04, 0x00, 0x01))).toBe(true);
  });

  it('★★ 真实二进制文件（PNG 头）→ 判为二进制', () => {
    // 用真实 PNG 的魔数与典型内容，而不是人造噪声
    const png = u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52);
    expect(looksBinaryBytes(png)).toBe(true);
  });

  it('★★ U+FFFD 计数已失效 —— 随机字节能被 GB18030 "解码成功"', () => {
    // 这是引入 GB18030 兜底后的**新增风险点**，也是不能沿用旧判据的原因：
    // 任意字节流几乎都能被 GB18030 解出来（不抛错、也不产生 U+FFFD），
    // 所以旧代码「解出多少替换符」的判据会**恒为 0** → 二进制文件被当文本渲染。
    const noise = new Uint8Array(2000);
    for (let i = 0; i < noise.length; i += 1) noise[i] = 0x81 + ((i * 37) % 0x7e);
    const utf8Fails = (() => {
      try { new TextDecoder('utf-8', { fatal: true }).decode(noise); return false; } catch { return true; }
    })();
    expect(utf8Fails, '构造的样本应当不是合法 UTF-8').toBe(true);
    // GB18030 能解成功且**没有替换符** → 证明 U+FFFD 判据在新编码下不可用
    const viaGb = new TextDecoder('gb18030', { fatal: true }).decode(noise);
    expect(viaGb.includes('\uFFFD')).toBe(false);
  });

  it('★ UTF-8 文本不误判为二进制', () => {
    expect(looksBinaryBytes(new TextEncoder().encode('中文 abc\n换行'))).toBe(false);
  });

  it('★ GBK 文本不误判为二进制（这是本次要修的核心场景）', () => {
    const gbk = u8(0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4, 0x0a, 0x41);
    expect(looksBinaryBytes(gbk)).toBe(false);
  });

  it('★ 控制符占比过高 → 二进制', () => {
    const ctrl = new Uint8Array(100);
    ctrl.fill(0x01); // 全是 C0 控制符（非 \t\n\r）
    expect(looksBinaryBytes(ctrl)).toBe(true);
  });
});

describe('③ 三端适配器必须真的接上识别器（防"写好了没人用"）', () => {
  it('★★ 服务端 node-adapter：readFile 不再写死 utf8', () => {
    const code = strip(readRepo('apps/server/src/node-adapter.ts'));
    expect(code, '缺少 decodeTextBytes 调用').toMatch(/decodeTextBytes\(/);
    // ★ 反向：不得残留 readFile(..., 'utf8') 这种写死写法
    expect(code, '★ readFile 仍写死 utf8').not.toMatch(/readFile\(filePath,\s*'utf-?8'\)/);
  });

  it('★★ 桌面端 platform：readFile 走字节 + 识别，不用写死 UTF-8 的 IPC', () => {
    const code = strip(readRepo('apps/desktop/src/platform.ts'));
    expect(code, '缺少 decodeTextBytes 调用').toMatch(/decodeTextBytes\(/);
    expect(code, '★ 仍直接调 api.fs.readFile（写死 utf-8）').not.toMatch(/return api\.fs\.readFile\(path\)/);
  });

  it('★★ Web 端 platform：不用 file.text()（写死 UTF-8）', () => {
    const code = strip(readRepo('apps/web/src/platform.ts'));
    expect(code, '缺少 decodeTextBytes 调用').toMatch(/decodeTextBytes\(/);
    expect(code, '★ 仍用 file.text()').not.toMatch(/return file\.text\(\)/);
  });

  it('★★ 移动端 platform：不用 Encoding.UTF8 直读', () => {
    const code = strip(readRepo('apps/mobile/src/platform.ts'));
    expect(code, '缺少 decodeTextBytes 调用').toMatch(/decodeTextBytes\(/);
    // 反向：readFile 体内不得再用 Encoding.UTF8
    const i = code.indexOf('async readFile(');
    expect(i, '未找到 readFile').toBeGreaterThan(0);
    const body = code.slice(i, i + 400);
    expect(body, '★ readFile 仍用 Encoding.UTF8').not.toMatch(/Encoding\.UTF8/);
  });

  it('★★ 预览面板接上识别器，并且不再裸用 TextDecoder(utf-8)', () => {
    const code = strip(readRepo('packages/ui/src/components/FilePreview.vue'));
    expect(code, '缺少 decodeTextBytes').toMatch(/decodeTextBytes\(/);
    expect(code, '缺少字节级二进制判定').toMatch(/looksBinaryBytes\(/);
    // 反向：旧的「数 U+FFFD 判二进制」helper 必须已移除
    expect(code, '★ countReplacement 仍在（U+FFFD 判据在新编码下失效）').not.toMatch(/function countReplacement/);
    expect(code, '★ 仍在裸用 TextDecoder(utf-8) 解文本').not.toMatch(/new TextDecoder\('utf-8'\)\.decode/);
  });

  it('★ 聊天附件预览也接上识别器', () => {
    const code = strip(readRepo('packages/ui/src/components/chat/AttachmentPreview.vue'));
    expect(code).toMatch(/decodeTextBytes\(/);
    expect(code, '★ 仍在裸用 TextDecoder(utf-8)').not.toMatch(/new TextDecoder\('utf-8'\)\.decode/);
  });

  it('★★ 预览面板要如实展示"非 UTF-8"编码（否则用户改完保存会以为编码莫名变了）', () => {
    const code = strip(readRepo('packages/ui/src/components/FilePreview.vue'));
    expect(code, '缺少编码徽标').toMatch(/detectedEncoding/);
    expect(code, '缺少 encodingLabel 展示').toMatch(/encodingLabel\(/);
  });

  it('★★ file_read 的 encoding 参数必须真的生效（此前声明了却无人使用）', () => {
    const code = strip(readRepo('packages/core/src/tool/builtin/file-read.ts'));
    expect(code, 'encoding 参数仍未参与读取逻辑').toMatch(/args\.encoding/);
    expect(code, '未支持按指定编码解码').toMatch(/decodeTextBytesAs\(/);
    // 显式途径要能表达 base64
    expect(code).toMatch(/'base64'/);
  });

  it('★ 二进制判定与解码原语只有一个来源（不各写一份）', () => {
    // libs 里的重复实现会让"改一处漏三处"重演：file-read 曾自带 base64ToBytes
    const code = strip(readRepo('packages/core/src/tool/builtin/file-read.ts'));
    expect(code, '★ file-read 又自带了一份 base64ToBytes').not.toMatch(/function base64ToBytes/);
    expect(code, '应从 shared 引入').toMatch(/from '@yan-zhi\/shared'/);
  });
});