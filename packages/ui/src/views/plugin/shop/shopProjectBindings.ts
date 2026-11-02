import type { Conversation } from '@yan-zhi/shared';

export interface ShopProjectSummary {
  id: string;
  title: string;
  updatedAt: number;
}

function updatedAtOf(conv: Conversation): number {
  return Number(conv.lastActivityAt || conv.updatedAt || conv.createdAt || 0);
}

/** New tasks carry their shop project in sourceMeta; legacy projects use the conversation id. */
export function shopProjectIdOfConversation(conv: Conversation): string {
  return String(conv.sourceMeta?.shopProjectId || '').trim() || conv.id;
}

export function shopProjectTasks(conversations: Conversation[], projectId: string): Conversation[] {
  return conversations
    .filter((conv) => shopProjectIdOfConversation(conv) === projectId)
    .sort((a, b) => updatedAtOf(b) - updatedAtOf(a));
}

/**
 * Collapse task conversations into stable shop projects.
 *
 * A legacy shop conversation is both the project and its first task. The anchor
 * conversation keeps the project title while newer tasks only contribute activity time.
 */
export function buildShopProjects(conversations: Conversation[]): ShopProjectSummary[] {
  const byId = new Map<string, ShopProjectSummary>();
  for (const conv of conversations) {
    const id = shopProjectIdOfConversation(conv);
    const updatedAt = updatedAtOf(conv);
    const current = byId.get(id);
    if (!current) {
      byId.set(id, { id, title: conv.title || '未命名项目', updatedAt });
      continue;
    }
    if (updatedAt > current.updatedAt) current.updatedAt = updatedAt;
    if (conv.id === id && conv.title) current.title = conv.title;
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
