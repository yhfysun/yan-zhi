import {
  AUTOMATION_SCHEMA_VERSION,
  type AutomationBrowserTarget,
  type AutomationDesktopTarget,
  type AutomationParamDef,
  type AutomationScriptDraft,
  type AutomationScriptKind,
  type AutomationStep,
} from './types';

export type AutomationValidationResult =
  | { ok: true; value: AutomationScriptDraft }
  | { ok: false; errors: string[] };

const SCRIPT_KINDS = new Set<AutomationScriptKind>(['browser', 'desktop', 'hybrid']);
const PARAM_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SENSITIVE_PARAM_RE = /(password|passwd|passcode|secret|token|cookie|验证码|密码)/i;
const MAX_STEPS = 100;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateBrowserTarget(target: unknown, path: string, errors: string[]): AutomationBrowserTarget | null {
  if (!isObject(target) || !hasText(target.by)) {
    errors.push(`${path} 缺少 target`);
    return null;
  }
  switch (target.by) {
    case 'role':
      if (!hasText(target.role) || !hasText(target.name)) {
        errors.push(`${path} 的 role 定位必须包含 role 与 name`);
        return null;
      }
      return {
        by: 'role',
        role: target.role,
        name: target.name,
        ...(typeof target.exact === 'boolean' ? { exact: target.exact } : {}),
      };
    case 'label':
      if (!hasText(target.label)) return null;
      return { by: 'label', label: target.label };
    case 'placeholder':
      if (!hasText(target.placeholder)) return null;
      return { by: 'placeholder', placeholder: target.placeholder };
    case 'testId':
      if (!hasText(target.testId)) return null;
      return { by: 'testId', testId: target.testId };
    case 'text':
      if (!hasText(target.text)) return null;
      return {
        by: 'text',
        text: target.text,
        ...(typeof target.exact === 'boolean' ? { exact: target.exact } : {}),
      };
    case 'css':
      if (!hasText(target.selector)) return null;
      return { by: 'css', selector: target.selector };
    case 'index':
      if (!Number.isInteger(target.index) || Number(target.index) < 0) return null;
      return { by: 'index', index: Number(target.index) };
    default:
      errors.push(`${path} 使用了未知的浏览器定位方式: ${String(target.by)}`);
      return null;
  }
}

function validateDesktopTarget(target: unknown, path: string, errors: string[]): AutomationDesktopTarget | null {
  if (!isObject(target) || !hasText(target.by)) {
    errors.push(`${path} 缺少 desktop target`);
    return null;
  }
  switch (target.by) {
    case 'uia':
      if (!hasText(target.processName)) {
        errors.push(`${path} 的 UIA 定位必须包含 processName`);
        return null;
      }
      return {
        by: 'uia',
        processName: target.processName,
        ...(hasText(target.windowTitle) ? { windowTitle: target.windowTitle } : {}),
        ...(hasText(target.automationId) ? { automationId: target.automationId } : {}),
        ...(hasText(target.name) ? { name: target.name } : {}),
        ...(hasText(target.role) ? { role: target.role } : {}),
      };
    case 'image':
      if (!hasText(target.template)) {
        errors.push(`${path} 的图像定位必须包含 template`);
        return null;
      }
      return {
        by: 'image',
        template: target.template,
        ...(typeof target.threshold === 'number' ? { threshold: target.threshold } : {}),
      };
    case 'ocr':
      if (!hasText(target.text)) {
        errors.push(`${path} 的 OCR 定位必须包含 text`);
        return null;
      }
      return {
        by: 'ocr',
        text: target.text,
        ...(hasText(target.language) ? { language: target.language } : {}),
      };
    case 'windowPoint':
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
        errors.push(`${path} 的窗口坐标必须包含数字 x/y`);
        return null;
      }
      return { by: 'windowPoint', x: Number(target.x), y: Number(target.y) };
    default:
      errors.push(`${path} 使用了未知的桌面定位方式: ${String(target.by)}`);
      return null;
  }
}

function normalizeParam(raw: unknown, index: number, errors: string[]): AutomationParamDef | null {
  const path = `params[${index}]`;
  if (!isObject(raw)) {
    errors.push(`${path} 必须是对象`);
    return null;
  }
  const key = typeof raw.key === 'string' ? raw.key.trim() : '';
  if (!PARAM_KEY_RE.test(key)) {
    errors.push(`${path}.key 只允许字母、数字、下划线，且不能以数字开头`);
    return null;
  }
  const type = raw.type === 'number' || raw.type === 'boolean' ? raw.type : 'string';
  const label = hasText(raw.label) ? raw.label.trim() : key;
  const secret = raw.secret === true;
  if (SENSITIVE_PARAM_RE.test(key) || SENSITIVE_PARAM_RE.test(label)) {
    if (!secret) errors.push(`敏感参数「${label}」必须声明 secret: true`);
    if (raw.defaultValue !== undefined && raw.defaultValue !== '') {
      errors.push(`敏感参数「${label}」不能保存默认值`);
    }
  }
  const defaultValue =
    typeof raw.defaultValue === 'string' ||
    typeof raw.defaultValue === 'number' ||
    typeof raw.defaultValue === 'boolean'
      ? raw.defaultValue
      : undefined;
  return {
    key,
    label,
    type,
    required: raw.required !== false,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(hasText(raw.description) ? { description: raw.description.trim() } : {}),
    ...(secret ? { secret: true } : {}),
  };
}

function normalizeStep(raw: unknown, index: number, errors: string[]): AutomationStep | null {
  const path = `steps[${index}]`;
  if (!isObject(raw)) {
    errors.push(`${path} 必须是对象`);
    return null;
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  if (!id) errors.push(`${path}.id 不能为空`);
  if (!type) errors.push(`${path}.type 不能为空`);
  if (!id || !type) return null;

  const base = {
    id,
    ...(hasText(raw.note) ? { note: raw.note.trim() } : {}),
    ...(raw.continueOnError === true ? { continueOnError: true } : {}),
    ...(Number.isFinite(raw.timeoutMs) ? { timeoutMs: Number(raw.timeoutMs) } : {}),
  };

  switch (type) {
    case 'browser.navigate': {
      if (!hasText(raw.url) || !isHttpUrl(raw.url)) {
        errors.push(`${path}: 仅支持 http/https 导航地址`);
        return null;
      }
      return { ...base, type, url: raw.url };
    }
    case 'browser.click': {
      const target = validateBrowserTarget(raw.target, path, errors);
      if (!target && !errors.some((error) => error.startsWith(`${path} 的`) || error.startsWith(`${path} 使用`))) {
        errors.push(`${path}: click 步骤缺少 target`);
      }
      return target ? { ...base, type, target } : null;
    }
    case 'browser.type': {
      if (typeof raw.text !== 'string' || raw.text.length === 0) {
        errors.push(`${path}.text 不能为空`);
        return null;
      }
      const target = raw.target ? validateBrowserTarget(raw.target, path, errors) : undefined;
      if (raw.target && !target) return null;
      return {
        ...base,
        type,
        text: raw.text,
        ...(target ? { target } : {}),
        ...(raw.pressEnter === true ? { pressEnter: true } : {}),
      };
    }
    case 'browser.press': {
      if (!Array.isArray(raw.keys) || raw.keys.length === 0 || raw.keys.some((key) => !hasText(key))) {
        errors.push(`${path}.keys 必须是非空字符串数组`);
        return null;
      }
      return { ...base, type, keys: raw.keys.map((key) => key.trim()) };
    }
    case 'browser.wait': {
      const ms = Number(raw.ms);
      if (!Number.isFinite(ms) || ms < 100 || ms > 600000) {
        errors.push(`${path}.ms 的等待时间必须在 100 到 600000 毫秒之间`);
        return null;
      }
      return { ...base, type, ms };
    }
    case 'browser.waitFor': {
      if (!hasText(raw.text) && !hasText(raw.selector)) {
        errors.push(`${path} 必须提供 text 或 selector`);
        return null;
      }
      return {
        ...base,
        type,
        ...(hasText(raw.text) ? { text: raw.text } : {}),
        ...(hasText(raw.selector) ? { selector: raw.selector } : {}),
      };
    }
    case 'browser.assertText': {
      if (!hasText(raw.text)) {
        errors.push(`${path}.text 不能为空`);
        return null;
      }
      return { ...base, type, text: raw.text };
    }
    case 'browser.extractText': {
      const target = raw.target ? validateBrowserTarget(raw.target, path, errors) : undefined;
      if (raw.target && !target) return null;
      return {
        ...base,
        type,
        ...(target ? { target } : {}),
        ...(hasText(raw.saveAs) ? { saveAs: raw.saveAs } : {}),
      };
    }
    case 'desktop.activateWindow': {
      if (!hasText(raw.processName)) {
        errors.push(`${path}.processName 不能为空`);
        return null;
      }
      return {
        ...base,
        type,
        processName: raw.processName,
        ...(hasText(raw.titleContains) ? { titleContains: raw.titleContains } : {}),
      };
    }
    case 'desktop.click': {
      const target = validateDesktopTarget(raw.target, path, errors);
      if (!target) return null;
      return {
        ...base,
        type,
        target,
        ...(raw.button === 'right' ? { button: 'right' as const } : {}),
        ...(raw.double === true ? { double: true } : {}),
      };
    }
    case 'desktop.type': {
      if (typeof raw.text !== 'string' || raw.text.length === 0) {
        errors.push(`${path}.text 不能为空`);
        return null;
      }
      return { ...base, type, text: raw.text };
    }
    case 'desktop.press': {
      if (!Array.isArray(raw.keys) || raw.keys.length === 0 || raw.keys.some((key) => !hasText(key))) {
        errors.push(`${path}.keys 必须是非空字符串数组`);
        return null;
      }
      return { ...base, type, keys: raw.keys.map((key) => key.trim()) };
    }
    case 'desktop.waitForImage': {
      if (!hasText(raw.template)) {
        errors.push(`${path}.template 不能为空`);
        return null;
      }
      return {
        ...base,
        type,
        template: raw.template,
        ...(typeof raw.threshold === 'number' ? { threshold: raw.threshold } : {}),
      };
    }
    case 'file.exists': {
      if (!hasText(raw.path)) {
        errors.push(`${path}.path 不能为空`);
        return null;
      }
      return { ...base, type, path: raw.path };
    }
    case 'file.wait': {
      if (!hasText(raw.path)) {
        errors.push(`${path}.path 不能为空`);
        return null;
      }
      return { ...base, type, path: raw.path };
    }
    case 'file.copy':
    case 'file.move': {
      if (!hasText(raw.from) || !hasText(raw.to)) {
        errors.push(`${path} 的 from 与 to 不能为空`);
        return null;
      }
      return {
        ...base,
        type,
        from: raw.from,
        to: raw.to,
        ...(raw.overwrite === true ? { overwrite: true } : {}),
      };
    }
    default:
      errors.push(`${path} 使用了未知步骤类型: ${type}`);
      return null;
  }
}

export function validateAutomationScriptDraft(input: unknown): AutomationValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['脚本必须是 JSON 对象'] };
  if (input.schemaVersion !== AUTOMATION_SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须为 ${AUTOMATION_SCHEMA_VERSION}`);
  }
  if (!hasText(input.name)) errors.push('脚本名称不能为空');
  const kind = (SCRIPT_KINDS.has(input.kind as AutomationScriptKind) ? input.kind : '') as AutomationScriptKind;
  if (!kind) errors.push('脚本类型必须是 browser / desktop / hybrid');

  const params: AutomationParamDef[] = [];
  if (input.params !== undefined && !Array.isArray(input.params)) {
    errors.push('params 必须是数组');
  } else if (Array.isArray(input.params)) {
    if (input.params.length > 30) errors.push('参数最多 30 个');
    const seen = new Set<string>();
    input.params.slice(0, 30).forEach((raw, index) => {
      const param = normalizeParam(raw, index, errors);
      if (!param) return;
      if (seen.has(param.key)) errors.push(`参数 key 重复: ${param.key}`);
      seen.add(param.key);
      params.push(param);
    });
  }

  const steps: AutomationStep[] = [];
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    errors.push('steps 必须是非空数组');
  } else {
    if (input.steps.length > MAX_STEPS) errors.push(`步骤最多 ${MAX_STEPS} 个`);
    const seen = new Set<string>();
    input.steps.slice(0, MAX_STEPS).forEach((raw, index) => {
      if (!isObject(raw) || !hasText(raw.id)) return;
      const id = raw.id.trim();
      if (seen.has(id)) errors.push(`步骤 id 重复: ${id}（steps[${index}]）`);
      seen.add(id);
    });
    input.steps.slice(0, MAX_STEPS).forEach((raw, index) => {
      const step = normalizeStep(raw, index, errors);
      if (!step) return;
      if (kind === 'browser' && step.type.startsWith('desktop.')) {
        errors.push(`浏览器脚本不能包含桌面步骤: ${step.id}`);
      }
      if (kind === 'desktop' && step.type.startsWith('browser.')) {
        errors.push(`桌面脚本不能包含浏览器步骤: ${step.id}`);
      }
      steps.push(step);
    });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: AUTOMATION_SCHEMA_VERSION,
      name: String(input.name).trim(),
      ...(hasText(input.description) ? { description: input.description.trim() } : {}),
      kind,
      params,
      steps,
      ...(Array.isArray(input.tags)
        ? { tags: input.tags.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim()).slice(0, 20) }
        : {}),
    },
  };
}
