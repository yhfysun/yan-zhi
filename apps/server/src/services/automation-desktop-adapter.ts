import type { AutomationRunContext, AutomationStepAdapter, AutomationStepExecution } from '@yan-zhi/core';
import type { AutomationStep } from '@yan-zhi/shared';

export interface DesktopWindowInfo {
  pid: number;
  process: string;
  title: string;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

export type DesktopToolExecutor = (name: string, args: Record<string, unknown>) => Promise<any>;

function normalizeWindow(raw: any): DesktopWindowInfo | null {
  const pid = Number(raw?.pid);
  const rect = raw?.rect || {};
  const left = Number(rect.left ?? raw?.left);
  const top = Number(rect.top ?? raw?.top);
  const right = Number(rect.right ?? (Number.isFinite(Number(raw?.width)) ? left + Number(raw.width) : NaN));
  const bottom = Number(rect.bottom ?? (Number.isFinite(Number(raw?.height)) ? top + Number(raw.height) : NaN));
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  return {
    pid,
    process: String(raw?.process || raw?.processName || ''),
    title: String(raw?.title || ''),
    rect: { left, top, right, bottom, width: right - left, height: bottom - top },
  };
}

function parseToolResult(result: any): any {
  const text = Array.isArray(result?.content)
    ? result.content.map((item: any) => item?.text || '').join('\n').trim()
    : '';
  if (result?.isError) throw new Error(text || '桌面工具执行失败');
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export class DesktopAutomationAdapter implements AutomationStepAdapter {
  private readonly activeWindows = new Map<string, DesktopWindowInfo>();

  constructor(private readonly options: { execute: DesktopToolExecutor }) {}

  async execute(step: AutomationStep, context: AutomationRunContext): Promise<AutomationStepExecution> {
    if (step.type === 'desktop.activateWindow') {
      const window = await this.findWindow(step.processName, step.titleContains || '');
      if (!window) {
        throw new Error(`未找到可绑定的桌面窗口：process=${step.processName} title=${step.titleContains || ''}`);
      }
      await this.call('computer_activate_window', { pid: window.pid });
      this.activeWindows.set(context.runId, window);
      return { output: window };
    }

    if (step.type === 'desktop.click') {
      if (step.target.by === 'uia' || step.target.by === 'ocr') {
        throw new Error(`桌面定位方式 ${step.target.by} 尚未接入，当前支持窗口相对坐标`);
      }
      if (step.target.by === 'image') {
        throw new Error('图像模板定位尚未接入，当前支持窗口相对坐标');
      }
      const window = await this.resolveActiveWindow(context.runId);
      await this.call('computer_activate_window', { pid: window.pid });
      const x = window.rect.left + step.target.x;
      const y = window.rect.top + step.target.y;
      await this.call('computer_mouse_click', {
        x,
        y,
        button: step.button || 'left',
        double: step.double === true,
      });
      return { output: { pid: window.pid, title: window.title, x, y } };
    }

    if (step.type === 'desktop.type') {
      const window = await this.resolveActiveWindow(context.runId);
      await this.call('computer_activate_window', { pid: window.pid });
      await this.call('computer_type', { text: step.text });
      return { output: { pid: window.pid, length: step.text.length } };
    }

    if (step.type === 'desktop.press') {
      const window = await this.resolveActiveWindow(context.runId);
      await this.call('computer_activate_window', { pid: window.pid });
      await this.call('computer_press_key', { keys: step.keys });
      return { output: { pid: window.pid, keys: step.keys } };
    }

    if (step.type === 'desktop.waitForImage') {
      throw new Error('等待图像尚未接入，请先使用固定等待或窗口坐标步骤');
    }
    throw new Error(`步骤 ${step.id} 不是桌面步骤`);
  }

  private async call(name: string, args: Record<string, unknown>): Promise<any> {
    return parseToolResult(await this.options.execute(name, args));
  }

  private async listWindows(processName = ''): Promise<DesktopWindowInfo[]> {
    const data = await this.call('computer_list_windows', {
      ...(processName ? { processName } : {}),
      pageSize: 100,
    });
    return Array.isArray(data?.windows)
      ? data.windows.map(normalizeWindow).filter((item: DesktopWindowInfo | null): item is DesktopWindowInfo => !!item)
      : [];
  }

  private async findWindow(processName: string, titleContains: string): Promise<DesktopWindowInfo | null> {
    const windows = await this.listWindows(processName);
    if (!windows.length) return null;
    const title = titleContains.trim().toLowerCase();
    const exact = title
      ? windows.find((window) => window.title.toLowerCase().includes(title))
      : windows[0];
    return exact || null;
  }

  private async resolveActiveWindow(runId: string): Promise<DesktopWindowInfo> {
    const active = this.activeWindows.get(runId);
    if (active) return active;
    const windows = await this.listWindows();
    if (windows.length === 1) {
      this.activeWindows.set(runId, windows[0]);
      return windows[0];
    }
    if (!windows.length) throw new Error('未找到可绑定的桌面窗口，请先添加“激活窗口”步骤');
    throw new Error('当前有多个桌面窗口，请先添加“激活窗口”步骤绑定目标窗口');
  }
}
