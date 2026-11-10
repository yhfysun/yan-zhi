/** 聊天/状态栏等只读展示：优先别名，其次平台模型 ID，最后回退到会话原值。 */
export function resolveModelDisplayName(
  models: Array<{ id?: string; modelId?: string; alias?: string | null }>,
  modelRef: string | null | undefined,
): string {
  const ref = String(modelRef || '').trim();
  if (!ref) return '';
  const model = models.find((m) => String(m.id || '') === ref)
    || models.find((m) => String(m.modelId || '') === ref);
  return String(model?.alias || model?.modelId || ref).trim();
}
