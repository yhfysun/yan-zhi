const REMOVED_MODEL_PLATFORM = /平台不存在或已删除(?:[（(]\s*platformId:\s*[^）)\n]*[）)]|\s*[:：]\s*\S+)?/g;

export function sanitizeUserFacingError(text: string): string {
  return text.replace(
    REMOVED_MODEL_PLATFORM,
    '当前模型平台已删除或不可用，请重新选择模型。',
  );
}
