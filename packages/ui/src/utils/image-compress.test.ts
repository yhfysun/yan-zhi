/**
 * 图片压缩与预算闸（C2，2026-10-09）守门测试。
 *
 * 背景（当前就在发生）：`runImageAnalyze` → `fs.readFileBase64` **原图** →
 *   `visionAnalyze` 把 base64 直接塞进 `data:<mime>;base64,...`，**全链路无压缩**
 *   （全仓无 sharp/jimp）。`browser_screenshot` 的整页 PNG 常数 MB →
 *   上游 400（Anthropic 单图 base64 约 5MB）或一张图吃爆 token。
 *
 * 本测试钉：
 *   ① 压缩模块存在且被 `runImageAnalyze` 调用（**唯一 vision 入口**）；
 *   ② 三个判定纯函数真跑（`base64Bytes` / `needsImageDownscale` / `fitWithin`）；
 *   ③ **压缩后 mime 必须同步**（报 PNG 却发 JPEG 字节 → 上游解码失败）；
 *   ④ **fail-open**：任何失败回退原图，绝不因此让图片用不了；
 *   ⑤ 不放大、不改矢量/动图（SVG/GIF 跳过）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ★ 本文件在 `packages/ui/src/utils/` 下 → `__dirname` 已是 `packages/ui/src/utils`
//   ⇒ 到仓库根要**上三级**（utils → src → ui → packages → 根：实际是 ui/src/utils → ui/src → ui → packages → repo）
//   ⚠️ 第一版只上了两级 → 拼出 `packages/packages/ui/...` → ENOENT（测试套件整体加载失败）。
const REPO = resolve(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CHAT = strip(read('packages/ui/src/stores/chat.ts'));
const MOD = strip(read('packages/ui/src/utils/image-compress.ts'));

describe('① 接线：压缩必须被 vision 唯一入口调用', () => {
  it('★★ 压缩模块存在', () => {
    expect(MOD, '★ 缺 image-compress 模块（原图仍会直发上游）')
      .toMatch(/export async function downscaleImageBase64/);
  });

  it('★★ runImageAnalyze 必须调用压缩', () => {
    expect(CHAT, '★ runImageAnalyze 未压缩（整页截图数 MB 直接发上游）')
      .toMatch(/downscaleImageBase64\(/);
    // 必须在"读到 base64"之后、"发请求"之前
    const body = CHAT.slice(CHAT.indexOf('async function runImageAnalyze'), CHAT.indexOf('async function runImageAnalyze') + 6000);
    const readIdx = body.indexOf('readFileBase64');
    const compIdx = body.indexOf('downscaleImageBase64');
    const sendIdx = body.indexOf('visionAnalyze(');
    expect(readIdx, '★ 锚点缺失：读取').toBeGreaterThan(-1);
    expect(compIdx, '★ 锚点缺失：压缩').toBeGreaterThan(-1);
    expect(sendIdx, '★ 锚点缺失：发送').toBeGreaterThan(-1);
    expect(compIdx, '★ 压缩在读取之前（顺序不对）').toBeGreaterThan(readIdx);
    expect(compIdx, '★ 压缩在发送之后（等于没压）').toBeLessThan(sendIdx);
  });

  it('★★★ 发送必须用压缩后的 mime（否则解码失败）', () => {
    // 压缩后是 image/jpeg；若仍报原 mime（如 image/png），上游按 PNG 解 JPEG 字节 → 失败
    expect(CHAT, '★ visionAnalyze 仍用原 mime（压缩后 mime 未同步 → 上游解码失败）')
      .toMatch(/visionAnalyze\(base64, sendMime,/);
    expect(CHAT, '★ 未定义 sendMime').toMatch(/let sendMime = mime/);
  });

  it('★★★ 压缩必须 fail-open（异常回退原图，不让图片用不了）', () => {
    const body = CHAT.slice(CHAT.indexOf('downscaleImageBase64'), CHAT.indexOf('downscaleImageBase64') + 900);
    expect(body, '★ 压缩流程无 try/catch → 压缩异常会让整次识图失败').toMatch(/catch/);
    expect(body, '★ 异常时未回退原图').toMatch(/使用原图/);
  });
});

describe('② 判定纯函数（真跑 —— 只能查字符串的断言不可靠）', () => {
  it('★★ base64Bytes 必须换算准确', async () => {
    const m = await import('./image-compress');
    // 4 字符 → 3 字节
    expect(m.base64Bytes('AAAA')).toBe(3);
    // padding 处理
    expect(m.base64Bytes('AA==')).toBe(1);
    expect(m.base64Bytes('AAA=')).toBe(2);
    expect(m.base64Bytes('')).toBe(0);
    // ★ 1000 字节的真实 base64：333 个完整组（999 字节=1332 字符）+ 1 字节 → `X==` 补 2 位
    //   ⚠️ 不能用 `'a'.repeat(ceil(1000/3)*4)`（那样长度 1336 且**无 padding**，
    //      按定义代表 1002 字节 —— 第一版测试期望写错，模块公式是对的）。
    const b64_1000 = 'a'.repeat(333 * 4) + 'AA==';
    expect(b64_1000.length).toBe(1336);
    expect(m.base64Bytes(b64_1000)).toBe(1000);
  });

  it('★★★ needsImageDownscale：四种触发与一种不触发', async () => {
    const m = await import('./image-compress');
    const MB = 1024 * 1024;
    // ① 体积超标 → 压
    expect(m.needsImageDownscale(2 * MB, 1.5 * MB, 100, 100, 1568, 'image/jpeg'), '★ 体积超标未触达').toBe(true);
    // ② 边长超标 → 压（省 token）
    expect(m.needsImageDownscale(1000, 1.5 * MB, 4000, 1000, 1568, 'image/jpeg'), '★ 边长超标未触达').toBe(true);
    // ③ ★★★ 无损格式 → 压（**真跑实测**：2.10MB 的 1080x1440 PNG 转 JPEG q5 仅 237KB＝降到 10%）
    expect(m.needsImageDownscale(1000, 1.5 * MB, 1080, 1440, 1568, 'image/png'),
      '★ PNG/BMP 未触发压缩 → 漏掉"尺寸合规但格式冗余"的图（实测可省 90% 体积）').toBe(true);
    expect(m.needsImageDownscale(1000, 1.5 * MB, 800, 600, 1568, 'image/bmp'), '★ BMP 未触发').toBe(true);
    // ④ 都合规且已是高效有损格式 → 不压（保持原图质量）
    expect(m.needsImageDownscale(1000, 1.5 * MB, 800, 600, 1568, 'image/jpeg'), '★ 未超标却触发压缩（无谓失真）').toBe(false);
  });

  it('★★★ fitWithin：只缩不放，且长边精确落在上限', async () => {
    const m = await import('./image-compress');
    // 4000x1000 长边 4000 → 缩到长边 1568
    const r = m.fitWithin(4000, 1000, 1568);
    expect(Math.max(r.width, r.height), '★ 长边未落在上限').toBe(1568);
    expect(r.height, '★ 未保持宽高比').toBe(Math.round(1000 * (1568 / 4000)));
    // 不放大
    const r2 = m.fitWithin(800, 600, 1568);
    expect(r2, '★ 放大了小图（无谓失真+费 token）').toEqual({ width: 800, height: 600 });
    // 极端比例不塌成 0
    const r3 = m.fitWithin(10000, 1, 1568);
    expect(r3.height, '★ 极端比例高度塌成 0（会导致 canvas 尺寸非法）').toBeGreaterThanOrEqual(1);
  });

  it('★★ 预算常量必须存在且有量级约束', async () => {
    const m = await import('./image-compress');
    expect(m.IMAGE_MAX_EDGE, '★ 长边上限缺失').toBeGreaterThan(0);
    expect(m.IMAGE_MAX_EDGE, '★ 长边上限过大（超过视觉编码器有效分辨率=白付 token）').toBeLessThanOrEqual(2048);
    expect(m.IMAGE_MAX_BYTES, '★ 字节预算缺失').toBeGreaterThan(0);
    // 必须远小于 Anthropic 单图 base64 上限（约 5MB），给 base64 膨胀留余量
    expect(m.IMAGE_MAX_BYTES, '★ 字节预算过大（贴上限会因 base64 膨胀 1/3 而超）').toBeLessThan(4 * 1024 * 1024);
  });
});

describe('③ 安全约束（不得引入新问题）', () => {
  it('★★ 只有"确实变小"才替换（避免把已压缩的小图反而变大）', () => {
    expect(MOD, '★ 未比较"是否真的更小" → 已高度压缩的图可能被重编码成更大结果')
      .toMatch(/bytes < originalBytes/);
  });

  it('★★ SVG/GIF 必须跳过重编码（矢量会失真、GIF 会丢动画）', () => {
    expect(MOD, '★ 未跳过 SVG/GIF').toMatch(/svg\|gif/i);
  });

  it('★★ 必须有尺寸再缩兜底（质量阶梯压完仍超预算时）', () => {
    expect(MOD, '★ 缺"质量压完仍超 → 再缩尺寸"的兜底（大图仍会超预算）').toMatch(/0\.8/);
  });

  it('★★ 压缩必须有轮次上限（防无限循环）', () => {
    expect(MOD, '★ 无轮次上限（可能出现死循环）').toMatch(/round < 3/);
  });

  it('★★ 图片解码必须有超时（避免解码卡死整次识图）', () => {
    expect(MOD, '★ 解码无超时').toMatch(/解码超时|timeoutMs/);
  });
});