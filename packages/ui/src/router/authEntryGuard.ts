const AUTH_ENTRY_PATHS = new Set(['/login', '/setup']);

/**
 * guest 是本地单机身份，不是可登录账号。
 * 单机模式误入登录/初始化页时直接回应用主页；multi 模式保持原流程。
 */
export function guestAuthEntryRedirect(path: string, authRequired: boolean): string | null {
  return !authRequired && AUTH_ENTRY_PATHS.has(path) ? '/chat' : null;
}
