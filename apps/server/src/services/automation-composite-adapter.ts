import type { AutomationRunContext, AutomationStepAdapter, AutomationStepExecution } from '@yan-zhi/core';
import type { AutomationStep } from '@yan-zhi/shared';
import { BrowserAutomationAdapter } from './automation-browser-adapter.js';
import { DesktopAutomationAdapter } from './automation-desktop-adapter.js';
import { FileAutomationAdapter } from './automation-file-adapter.js';

export class CompositeAutomationAdapter implements AutomationStepAdapter {
  constructor(
    private readonly adapters: {
      browser: BrowserAutomationAdapter;
      desktop: DesktopAutomationAdapter;
      file: FileAutomationAdapter;
    },
  ) {}

  execute(step: AutomationStep, context: AutomationRunContext): Promise<AutomationStepExecution> {
    if (step.type.startsWith('browser.')) return this.adapters.browser.execute(step, context);
    if (step.type.startsWith('desktop.')) return this.adapters.desktop.execute(step, context);
    if (step.type.startsWith('file.')) return this.adapters.file.execute(step, context);
    throw new Error(`不支持的自动化步骤: ${(step as { type?: string }).type || 'unknown'}`);
  }
}
