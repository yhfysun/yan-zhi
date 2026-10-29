// 截图回执契约测试（P0 2026-10-29）
//
// 背景：桌面端主进程**已经**把截图存档并回传了绝对路径，但工具层只认 saveShotToTemp
// （Electron 渲染层没有 node:fs，恒为 null）→ 回执里没有 file 字段 → 服务端
// extractImagePaths 提取不到路径 → 模型从来没真正收到过截图，只能靠二次调用
// image_analyze。这两条契约一旦回退，代玩游戏/视觉定位会静默退回"一步三往返"。
import { describe, it, expect } from 'vitest';
import { buildScreenshotReceipt } from './index';

describe('buildScreenshotReceipt（截图一次进模型）', () => {
  it('主进程回传的 file 必须原样带上（这是图片注入的唯一开关）', () => {
    const { payload, meta } = buildScreenshotReceipt({
      bytes: 1234,
      file: 'C:\\Users\\me\\AppData\\Roaming\\app\\screenshots\\screenshot-1.png',
    });
    expect(payload.file).toBe('C:\\Users\\me\\AppData\\Roaming\\app\\screenshots\\screenshot-1.png');
    expect(meta?.path).toBe(payload.file);
    expect(meta?.name).toBe('screenshot-1.png');
  });

  it('有 file 时不得再说"你看不到画面"（否则模型白调一次 image_analyze）', () => {
    const { payload } = buildScreenshotReceipt({ bytes: 10, file: 'C:\\x\\screenshot-2.png' });
    const note = String(payload.note || '');
    expect(note).not.toMatch(/看不到|无法直接看到/);
    expect(note).toMatch(/附上/);
  });

  it('没有 file 时明确说明看不到，并指向 image_analyze（降级不说谎）', () => {
    const { payload, meta } = buildScreenshotReceipt({ bytes: 10 });
    expect(payload.file).toBeUndefined();
    expect(meta).toBeUndefined();
    expect(String(payload.note)).toMatch(/无法直接看到/);
    expect(String(payload.note)).toMatch(/image_analyze/);
  });

  it('annotate / fullPage 的 detail 说明保留', () => {
    const a = buildScreenshotReceipt({ bytes: 1, file: 'a/screenshot.png', annotated: true });
    expect(String(a.payload.detail)).toMatch(/编号框/);
    const b = buildScreenshotReceipt({ bytes: 1, file: 'a/screenshot.png', fullPage: true });
    expect(String(b.payload.detail)).toMatch(/整页长图/);
  });

  it('meta.bytes 用落盘真实大小（savedSize 优先于 base64 长度）', () => {
    const { meta } = buildScreenshotReceipt({ bytes: 999, file: 'a/screenshot.png', savedSize: 42 });
    expect(meta?.bytes).toBe(42);
  });
});
