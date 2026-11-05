import type {
  PageAssetJsonSchema,
  PageAssetOperation,
  PageAssetSpec,
} from './types';

export interface PageAssetValidationOptions {
  /** Active assets must have at least one operation and one capability. */
  requireActive?: boolean;
}

export type PageAssetValidationResult =
  | { ok: true; spec: PageAssetSpec; errors: [] }
  | { ok: false; errors: string[] };

const ID_RE = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const OPERATION_ID_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const HOST_RE = /^(\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;
const STATUSES = new Set(['draft', 'active', 'deprecated']);
const SCOPES = new Set(['private', 'team', 'public']);
const CONFIRMATIONS = new Set(['none', 'required']);

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function positiveInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validateSchema(schema: unknown, field: string, errors: string[]): void {
  if (!isObject(schema)) {
    errors.push(`${field} 必须是对象`);
    return;
  }
  const type = schema.type;
  if (type !== undefined && !['object', 'array', 'string', 'number', 'integer', 'boolean'].includes(String(type))) {
    errors.push(`${field}.type 不受支持：${String(type)}`);
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((v: unknown) => typeof v !== 'string'))) {
    errors.push(`${field}.required 必须是字符串数组`);
  }
  if (schema.properties !== undefined) {
    if (!isObject(schema.properties)) {
      errors.push(`${field}.properties 必须是对象`);
    } else {
      for (const [key, child] of Object.entries(schema.properties)) {
        validateSchema(child, `${field}.properties.${key}`, errors);
      }
    }
  }
  if (schema.items !== undefined) validateSchema(schema.items, `${field}.items`, errors);
  if (schema.pattern !== undefined) {
    try {
      new RegExp(String(schema.pattern));
    } catch {
      errors.push(`${field}.pattern 不是合法正则`);
    }
  }
  for (const key of ['minLength', 'maxLength', 'minimum', 'maximum']) {
    if (schema[key] !== undefined && typeof schema[key] !== 'number') {
      errors.push(`${field}.${key} 必须是数字`);
    }
  }
}

export function validateJsonSchemaValue(
  schema: PageAssetJsonSchema | undefined,
  value: unknown,
  field = 'input',
): string[] {
  if (!schema || Object.keys(schema).length === 0) return [];
  const errors: string[] = [];
  if (schema.type) {
    const valid =
      schema.type === 'object' ? isObject(value)
        : schema.type === 'array' ? Array.isArray(value)
          : schema.type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
            : schema.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
              : schema.type === 'boolean' ? typeof value === 'boolean'
                : typeof value === 'string';
    if (!valid) errors.push(`${field} 必须是 ${schema.type}`);
  }
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push(`${field} 必须是 ${schema.enum.map(String).join(' / ')} 之一`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${field} 长度不能小于 ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${field} 长度不能大于 ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${field} 不匹配 ${schema.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${field} 不能小于 ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${field} 不能大于 ${schema.maximum}`);
  }
  if (isObject(value) && isObject(schema.properties)) {
    for (const key of schema.required || []) {
      if (value[key] === undefined || value[key] === null || value[key] === '') {
        errors.push(`${field}.${key} 必填`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (value[key] !== undefined) errors.push(...validateJsonSchemaValue(child, value[key], `${field}.${key}`));
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(...validateJsonSchemaValue(schema.items, item, `${field}[${index}]`));
    });
  }
  return errors;
}

function validateOperation(operation: unknown, index: number, capabilities: string[], errors: string[]): void {
  const field = `operations[${index}]`;
  if (!isObject(operation)) {
    errors.push(`${field} 必须是对象`);
    return;
  }
  const op = operation as Partial<PageAssetOperation> & Record<string, any>;
  if (!OPERATION_ID_RE.test(text(op.id))) errors.push(`${field}.id 不合法`);
  if (!text(op.title)) errors.push(`${field}.title 必填`);
  if (!CONFIRMATIONS.has(String(op.confirmation))) errors.push(`${field}.confirmation 只能是 none / required`);
  const capability = text(op.capability);
  if (capability && !capabilities.includes(capability)) {
    errors.push(`${field}.capability 未在 capabilities 中声明：${capability}`);
  }
  if (op.inputSchema !== undefined) validateSchema(op.inputSchema, `${field}.inputSchema`, errors);
  if (op.outputSchema !== undefined) validateSchema(op.outputSchema, `${field}.outputSchema`, errors);
  if (!isObject(op.executor)) {
    errors.push(`${field}.executor 必须是对象`);
    return;
  }
  if (op.executor.kind !== 'recipe') {
    errors.push(`${field}.executor.kind 目前只支持 recipe`);
  }
  if (!text(op.executor.recipeId)) errors.push(`${field}.executor.recipeId 必填`);
  if (op.executor.paramMap !== undefined) {
    if (!isObject(op.executor.paramMap)) errors.push(`${field}.executor.paramMap 必须是对象`);
    if (!op.inputSchema) errors.push(`${field}.inputSchema 必填（executor.paramMap 需要输入契约）`);
  }
}

export function validatePageAssetSpec(
  raw: unknown,
  opts: PageAssetValidationOptions = {},
): PageAssetValidationResult {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ['PageAsset 必须是对象'] };

  if (raw.apiVersion !== 'page-asset/v1') errors.push('apiVersion 必须是 page-asset/v1');
  if (raw.kind !== 'PageAsset') errors.push('kind 必须是 PageAsset');
  if (!ID_RE.test(text(raw.id))) errors.push('id 必须是小写字母开头的稳定标识（3-128 字符）');
  if (!text(raw.title)) errors.push('title 必填');
  else if (text(raw.title).length > 120) errors.push('title 不能超过 120 字符');
  if (!text(raw.platform)) errors.push('platform 必填');
  if (!SCOPES.has(String(raw.scope))) errors.push('scope 只能是 private / team / public');
  if (!STATUSES.has(String(raw.status))) errors.push('status 只能是 draft / active / deprecated');
  if (!positiveInt(raw.version)) errors.push('version 必须是正整数');

  const capabilities = array(raw.capabilities).map((v) => text(v)).filter(Boolean);
  if (new Set(capabilities).size !== capabilities.length) errors.push('capabilities 不能重复');
  if (capabilities.some((v) => !/^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/.test(v))) {
    errors.push('capabilities 必须使用点分能力标识');
  }

  const match = isObject(raw.match) ? raw.match : {};
  const hosts = array(match.hosts).map((v) => text(v)).filter(Boolean);
  if (hosts.length === 0) errors.push('match.hosts 至少需要 1 个 host');
  if (hosts.includes('*')) errors.push('hosts 不允许通配 *');
  if (hosts.some((host) => !HOST_RE.test(host))) errors.push('match.hosts 含非法域名');
  const routes = array(match.routes).map((v) => text(v)).filter(Boolean);
  if (routes.some((route) => !route.startsWith('/'))) errors.push('match.routes 必须以 / 开头');

  const operations = array(raw.operations);
  operations.forEach((operation, index) => validateOperation(operation, index, capabilities, errors));
  const operationIds = operations
    .filter(isObject)
    .map((operation) => text(operation.id))
    .filter(Boolean);
  if (new Set(operationIds).size !== operationIds.length) errors.push('operations.id 不能重复');

  if (raw.instructions !== undefined && !Array.isArray(raw.instructions)) {
    errors.push('instructions 必须是字符串数组');
  }

  const requireActive = opts.requireActive ?? raw.status === 'active';
  if (requireActive) {
    if (raw.status !== 'active') errors.push('requireActive 要求 status=active');
    if (capabilities.length === 0) errors.push('active 资产至少需要 1 个 capability');
    if (operations.length === 0) errors.push('active 资产至少需要 1 个 operation');
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, spec: raw as PageAssetSpec, errors: [] };
}
