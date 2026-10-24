import type { ImCapabilities, ImErrorCode, ImRecipientKind } from './types.js';

/** 统一错误：工具层按 code 输出可执行提示，不再靠字符串匹配。 */
export class ImMessagingError extends Error {
  readonly code: ImErrorCode;

  constructor(code: ImErrorCode, message: string) {
    super(message);
    this.name = 'ImMessagingError';
    this.code = code;
  }
}

export function parseRecipientKind(raw: string | undefined): ImRecipientKind {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return 'direct';
  if (value === 'direct' || value === 'group') return value;
  throw new ImMessagingError('validation_failed', 'recipientKind 只能是 direct 或 group');
}

/**
 * 收件人校验：各平台原生 ID 形态不同，猜错会静默发错人，所以只认明确前缀。
 */
export function validateRecipient(
  caps: ImCapabilities,
  kind: ImRecipientKind,
  recipientId: string,
): string {
  const id = (recipientId || '').trim();
  if (!id) {
    throw new ImMessagingError('validation_failed', 'recipientId 为必填项');
  }
  if (id.length > 128) {
    throw new ImMessagingError('validation_failed', 'recipientId 过长');
  }
  if (kind === 'direct' && !caps.supportsDirect) {
    throw new ImMessagingError('validation_failed', `${caps.platform} 暂不支持私聊发送`);
  }
  if (kind === 'group' && !caps.supportsGroup) {
    throw new ImMessagingError('validation_failed', `${caps.platform} 暂不支持群聊发送`);
  }
  if (caps.platform === 'feishu') {
    if (kind === 'direct' && !id.startsWith('ou_')) {
      throw new ImMessagingError(
        'validation_failed',
        '飞书私聊收件人必须是 open_id（ou_ 开头），不要用手机号或姓名拼接',
      );
    }
    if (kind === 'group' && !id.startsWith('oc_')) {
      throw new ImMessagingError('validation_failed', '飞书群收件人必须是 chat_id（oc_ 开头）');
    }
  }
  if (caps.platform === 'dingtalk' && kind === 'group' && !id.startsWith('cid')) {
    throw new ImMessagingError(
      'validation_failed',
      '钉钉群收件人必须是 openConversationId（cid 开头）',
    );
  }
  return id;
}

export interface ImUnifiedContentInput {
  text?: string;
  filePath?: string;
}

export interface ResolvedImContent {
  kind: 'text' | 'file';
  text?: string;
  filePath?: string;
}

/** text 与 filePath 二选一；一次只能发一种内容。 */
export function resolveContent(
  caps: ImCapabilities,
  input: ImUnifiedContentInput,
): ResolvedImContent {
  const hasText = !!input.text?.trim();
  const hasFile = !!input.filePath?.trim();
  if (!hasText && !hasFile) {
    throw new ImMessagingError('validation_failed', 'text 或 filePath 至少提供一个');
  }
  if (hasText && hasFile) {
    throw new ImMessagingError('validation_failed', '一次只能发送一种内容，请分开调用');
  }
  if (hasFile) {
    if (!caps.supportsFile) {
      throw new ImMessagingError('unsupported_content', `${caps.platform} 暂不支持发送文件`);
    }
    return { kind: 'file', filePath: input.filePath!.trim() };
  }
  return { kind: 'text', text: input.text!.trim() };
}

export function extractMessageId(result: any): string | null {
  const candidates = [
    result?.message_id,
    result?.msgid,
    result?.messageId,
    result?.processQueryKey,
    result?.data?.message_id,
    result?.data?.msgid,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate;
  }
  return null;
}
