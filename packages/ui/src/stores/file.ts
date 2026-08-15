// 会话文件 store —— 按分类（上传/中间/交付）管理会话内文件
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getPlatformAdapter } from '@yan-zhi/core';
import { uid, type ConversationFile, type FileCategory } from '@yan-zhi/shared';
import { api } from '../api/client';
import { useAuthStore } from './auth';

function rowToFile(r: any): ConversationFile {
  return {
    id: r.id,
    conversationId: r.conversation_id ?? r.conversationId,
    spaceId: r.space_id ?? r.spaceId,
    name: r.name,
    path: r.path,
    category: r.category,
    mimeType: r.mime_type ?? r.mimeType,
    size: r.size ?? 0,
    source: r.source ?? 'agent',
    messageId: r.message_id ?? r.messageId,
    createdAt: r.created_at ?? r.createdAt,
  };
}

export const useFileStore = defineStore('conversationFile', () => {
  const files = ref<ConversationFile[]>([]);
  const currentConvId = ref('');
  const loading = ref(false);

  const isServerMode = () => !!useAuthStore().isLoggedIn;

  /** 按分类分组的文件 */
  const filesByCategory = computed(() => {
    const groups: Record<FileCategory, ConversationFile[]> = {
      upload: [],
      intermediate: [],
      deliverable: [],
    };
    for (const f of files.value) {
      if (groups[f.category]) groups[f.category].push(f);
    }
    return groups;
  });

  /** 加载指定会话的文件列表 */
  async function loadConversationFiles(convId: string) {
    currentConvId.value = convId;
    if (!convId) { files.value = []; return; }
    loading.value = true;
    try {
      if (isServerMode()) {
        const r = await api.get<any[]>(`/conversations/${convId}/files`);
        if ('data' in r) {
          files.value = (r.data as any[]).map(rowToFile);
        } else {
          files.value = [];
        }
      } else {
        const adapter = getPlatformAdapter();
        const rows = await adapter.db.query<any>(
          'SELECT * FROM conversation_file WHERE conversation_id = ? ORDER BY category ASC, created_at ASC',
          [convId],
        );
        files.value = rows.map(rowToFile);
      }
    } finally {
      loading.value = false;
    }
  }

  /** 注册一个文件记录（用户上传或智能体产出） */
  async function registerFile(data: {
    conversationId: string;
    name: string;
    path: string;
    category?: FileCategory;
    mimeType?: string;
    size?: number;
    source?: 'user' | 'agent';
    messageId?: string;
  }): Promise<string> {
    const category = data.category || 'intermediate';
    const source = data.source || 'agent';
    if (isServerMode()) {
      const r = await api.post<any>(`/conversations/${data.conversationId}/files`, {
        name: data.name, path: data.path, category, mimeType: data.mimeType,
        size: data.size, source, messageId: data.messageId,
      });
      if ('data' in r) {
        const f = rowToFile(r.data);
        files.value.push(f);
        return f.id;
      }
      throw new Error('注册文件失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('cf_');
    const now = Date.now();
    await adapter.db.exec(
      'INSERT INTO conversation_file (id, conversation_id, name, path, category, mime_type, size, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.conversationId, data.name, data.path, category, data.mimeType || null, data.size || 0, source, data.messageId || null, now],
    );
    await loadConversationFiles(data.conversationId);
    return id;
  }

  /** 改分类 / 重命名 */
  async function updateFile(fileId: string, patch: { category?: FileCategory; name?: string; path?: string }) {
    if (!currentConvId.value) return;
    if (isServerMode()) {
      await api.patch(`/conversations/${currentConvId.value}/files/${fileId}`, patch);
    } else {
      const adapter = getPlatformAdapter();
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.category !== undefined) { sets.push('category = ?'); params.push(patch.category); }
      if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
      if (patch.path !== undefined) { sets.push('path = ?'); params.push(patch.path); }
      if (sets.length === 0) return;
      params.push(fileId);
      await adapter.db.exec(`UPDATE conversation_file SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    await loadConversationFiles(currentConvId.value);
  }

  /** 删除文件记录（物理文件由调用方处理） */
  async function deleteFile(fileId: string) {
    if (!currentConvId.value) return;
    if (isServerMode()) {
      await api.delete(`/conversations/${currentConvId.value}/files/${fileId}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM conversation_file WHERE id = ?', [fileId]);
    }
    files.value = files.value.filter((f) => f.id !== fileId);
  }

  function clear() {
    files.value = [];
    currentConvId.value = '';
  }

  return {
    files, currentConvId, loading, filesByCategory,
    loadConversationFiles, registerFile, updateFile, deleteFile, clear,
  };
});
