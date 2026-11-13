export const AUTOMATION_SCHEMA_VERSION = 1 as const;

export type AutomationScriptKind = 'browser' | 'desktop' | 'hybrid';
export type AutomationScriptStatus = 'draft' | 'published' | 'archived';
export type AutomationRunStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AutomationParamDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  defaultValue?: string | number | boolean;
  description?: string;
  secret?: boolean;
}

export type AutomationBrowserTarget =
  | { by: 'role'; role: string; name: string; exact?: boolean }
  | { by: 'label'; label: string }
  | { by: 'placeholder'; placeholder: string }
  | { by: 'testId'; testId: string }
  | { by: 'text'; text: string; exact?: boolean }
  | { by: 'css'; selector: string }
  | { by: 'index'; index: number };

export type AutomationDesktopTarget =
  | {
      by: 'uia';
      processName: string;
      windowTitle?: string;
      automationId?: string;
      name?: string;
      role?: string;
    }
  | {
      by: 'image';
      template: string;
      threshold?: number;
    }
  | {
      by: 'ocr';
      text: string;
      language?: string;
    }
  | {
      by: 'windowPoint';
      x: number;
      y: number;
    };

interface AutomationStepBase {
  id: string;
  note?: string;
  continueOnError?: boolean;
  timeoutMs?: number;
}

export type AutomationStep =
  | (AutomationStepBase & {
      type: 'browser.navigate';
      url: string;
    })
  | (AutomationStepBase & {
      type: 'browser.click';
      target: AutomationBrowserTarget;
    })
  | (AutomationStepBase & {
      type: 'browser.type';
      target?: AutomationBrowserTarget;
      text: string;
      pressEnter?: boolean;
    })
  | (AutomationStepBase & {
      type: 'browser.press';
      keys: string[];
    })
  | (AutomationStepBase & {
      type: 'browser.wait';
      ms: number;
    })
  | (AutomationStepBase & {
      type: 'browser.waitFor';
      text?: string;
      selector?: string;
      timeoutMs?: number;
    })
  | (AutomationStepBase & {
      type: 'browser.assertText';
      text: string;
    })
  | (AutomationStepBase & {
      type: 'browser.extractText';
      target?: AutomationBrowserTarget;
      saveAs?: string;
    })
  | (AutomationStepBase & {
      type: 'desktop.activateWindow';
      processName: string;
      titleContains?: string;
    })
  | (AutomationStepBase & {
      type: 'desktop.click';
      target: AutomationDesktopTarget;
      button?: 'left' | 'right';
      double?: boolean;
    })
  | (AutomationStepBase & {
      type: 'desktop.type';
      text: string;
    })
  | (AutomationStepBase & {
      type: 'desktop.press';
      keys: string[];
    })
  | (AutomationStepBase & {
      type: 'desktop.waitForImage';
      template: string;
      threshold?: number;
      timeoutMs?: number;
    })
  | (AutomationStepBase & {
      type: 'file.exists';
      path: string;
    })
  | (AutomationStepBase & {
      type: 'file.wait';
      path: string;
      timeoutMs?: number;
    })
  | (AutomationStepBase & {
      type: 'file.copy';
      from: string;
      to: string;
      overwrite?: boolean;
    })
  | (AutomationStepBase & {
      type: 'file.move';
      from: string;
      to: string;
      overwrite?: boolean;
    });

export interface AutomationScriptDraft {
  schemaVersion: typeof AUTOMATION_SCHEMA_VERSION;
  name: string;
  description?: string;
  kind: AutomationScriptKind;
  params: AutomationParamDef[];
  steps: AutomationStep[];
  tags?: string[];
}

export interface AutomationScriptRecord extends AutomationScriptDraft {
  id: string;
  userId: string;
  status: AutomationScriptStatus;
  version: number;
  publishedVersion: number | null;
  lastRun?: AutomationRunSummary | null;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationStepResult {
  stepId: string;
  type: AutomationStep['type'];
  status: 'completed' | 'failed' | 'skipped';
  startedAt: number;
  finishedAt: number;
  output?: unknown;
  error?: string;
}

export interface AutomationRunSummary {
  id: string;
  scriptId: string;
  scriptName: string;
  scriptVersion: number;
  status: AutomationRunStatus;
  triggerType: string;
  error?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
  createdAt: number;
}

export interface AutomationRunRecord extends AutomationRunSummary {
  userId: string;
  conversationId?: string | null;
  input: Record<string, unknown>;
  steps: AutomationStepResult[];
  checkpoint?: unknown;
}
