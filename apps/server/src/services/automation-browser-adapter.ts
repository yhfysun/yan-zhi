import type {
  AutomationBrowserTarget,
  AutomationStep,
} from '@yan-zhi/shared';
import type {
  AutomationRunContext,
  AutomationStepAdapter,
  AutomationStepExecution,
} from '@yan-zhi/core';

export type BrowserAutomationCall = (
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number,
) => Promise<any>;

function cssEscapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function targetArgs(target?: AutomationBrowserTarget): Record<string, unknown> {
  if (!target) return {};
  switch (target.by) {
    case 'role':
      return { target: { role: target.role, name: target.name, ...(target.exact ? { exact: true } : {}) } };
    case 'label':
      return { target: { label: target.label } };
    case 'text':
      return { target: { text: target.text, ...(target.exact ? { exact: true } : {}) } };
    case 'placeholder':
      return { selector: `[placeholder="${cssEscapeAttr(target.placeholder)}"]` };
    case 'testId':
      return { selector: `[data-testid="${cssEscapeAttr(target.testId)}"]` };
    case 'css':
      return { selector: target.selector };
    case 'index':
      return { index: target.index };
  }
}

export class BrowserAutomationAdapter implements AutomationStepAdapter {
  constructor(
    private readonly options: {
      call: BrowserAutomationCall;
      defaultTimeoutMs?: number;
    },
  ) {}

  async execute(step: AutomationStep, _context: AutomationRunContext): Promise<AutomationStepExecution> {
    const timeoutMs = Math.max(
      1000,
      Math.min(
        10 * 60_000,
        step.timeoutMs || this.options.defaultTimeoutMs || 45_000,
      ),
    );

    switch (step.type) {
      case 'browser.navigate':
        return this.call('browser_navigate', { url: step.url }, timeoutMs);
      case 'browser.click':
        return this.call('browser_click', targetArgs(step.target), timeoutMs);
      case 'browser.type':
        return this.call(
          'browser_type',
          {
            ...targetArgs(step.target),
            text: step.text,
            ...(step.pressEnter ? { pressEnter: true } : {}),
          },
          timeoutMs,
        );
      case 'browser.press': {
        if (step.keys.length !== 1) {
          throw new Error('当前浏览器执行器只支持单个按键；组合键请先拆成多个 press 步骤');
        }
        return this.call('browser_press_key', { key: step.keys[0] }, timeoutMs);
      }
      case 'browser.wait':
        return this.call('browser_wait', { ms: step.ms }, Math.max(timeoutMs, step.ms + 5_000));
      case 'browser.waitFor':
        return this.call(
          'browser_wait_for',
          {
            ...(step.text ? { text: step.text } : {}),
            ...(step.selector ? { selector: step.selector } : {}),
            ...(step.timeoutMs ? { timeoutMs: step.timeoutMs } : {}),
          },
          timeoutMs,
        );
      case 'browser.assertText': {
        const execution = await this.call('browser_get_visible_text', {}, timeoutMs);
        const text = String((execution.output as any)?.text || '');
        if (!text.includes(step.text)) {
          const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 300) || '(页面无可见文本)';
          throw new Error(`断言失败：页面未出现「${step.text}」。现场片段：${snippet}`);
        }
        return { output: { matchedText: step.text } };
      }
      case 'browser.extractText': {
        const execution = step.target?.by === 'css'
          ? await this.call('browser_get_text', { selector: step.target.selector }, timeoutMs)
          : await this.call('browser_get_visible_text', {}, timeoutMs);
        const text = String((execution.output as any)?.text || '');
        return {
          output: { text },
          ...(step.saveAs ? { variables: { [step.saveAs]: text } } : {}),
        };
      }
      case 'desktop.activateWindow':
      case 'desktop.click':
      case 'desktop.type':
      case 'desktop.press':
      case 'desktop.waitForImage':
        throw new Error(`步骤 ${step.id} 尚未接入桌面执行器`);
      case 'file.exists':
      case 'file.wait':
        throw new Error(`步骤 ${step.id} 尚未接入文件执行器`);
      default:
        throw new Error(`不支持的自动化步骤: ${(step as { type?: string }).type || 'unknown'}`);
    }
  }

  private async call(toolName: string, args: Record<string, unknown>, timeoutMs: number): Promise<AutomationStepExecution> {
    const result = await this.options.call(toolName, args, timeoutMs);
    this.throwIfError(result);
    return { output: result };
  }

  private throwIfError(result: any): void {
    if (result && typeof result === 'object' && result.error) {
      throw new Error(String(result.error));
    }
  }
}
