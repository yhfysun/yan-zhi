// 下载类结果格式化（2026-10-26）单元测试
//
// 背景（用户实报）：抖音「导出」触发 blob 下载，桌面端弹原生「另存为」框把任务卡死。
// 主进程修复后（分区级 will-download 接管 + 点击后回传路径），服务端格式化层必须把
// `downloaded.savedPath` **逐字**交给模型 —— 否则模型以为没下载成功，会反复点导出，
// 而这正是"智能体跑任务很困难"的一种典型形态。
import { describe, it, expect } from 'vitest';

describe('formatBridgeResult —— 下载类', () => {
  it('click 带 downloaded：给出保存路径并明确劝阻重复点击', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    const text = formatBridgeResult('click', {
      success: true,
      downloaded: { filename: '作品列表导出.xlsx', savedPath: 'D:/ws/downloads/作品列表导出.xlsx', bytes: 4096 },
    });
    expect(text).toContain('已自动下载');
    expect(text).toContain('D:/ws/downloads/作品列表导出.xlsx');
    expect(text).toContain('不要重复点导出');
  });

  it('click 无下载：保留成功语义与 note（遮挡提示等）', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    const text = formatBridgeResult('click', { success: true, note: '目标被悬浮层遮挡，已对目标派发 DOM 点击。' });
    expect(text).toContain('点击成功');
    expect(text).toContain('遮挡');
  });

  it('downloads：列出文件名与落盘路径', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    const text = formatBridgeResult('downloads', {
      dir: 'D:/ws/downloads',
      records: [
        { filename: 'a.xlsx', savedPath: 'D:/ws/downloads/a.xlsx', state: 'completed' },
        { filename: 'b.csv', savedPath: 'D:/ws/downloads/b.csv', state: 'completed' },
      ],
    });
    expect(text).toContain('D:/ws/downloads');
    expect(text).toContain('a.xlsx');
    expect(text).toContain('b.csv');
  });

  it('downloads 空：明确说没有记录并给出目录', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    const text = formatBridgeResult('downloads', { dir: 'D:/ws/downloads', records: [] });
    expect(text).toContain('最近没有下载记录');
    expect(text).toContain('D:/ws/downloads');
  });

  it('download：成功给路径，失败保留错误文案', async () => {
    const { formatBridgeResult } = await import('../src/browser-bridge.js');
    expect(formatBridgeResult('download', { filename: 'a.xlsx', savedPath: 'D:/ws/downloads/a.xlsx' }))
      .toContain('D:/ws/downloads/a.xlsx');
    expect(formatBridgeResult('download', { error: '未触发下载（超时）' })).toContain('未触发下载');
  });
});
