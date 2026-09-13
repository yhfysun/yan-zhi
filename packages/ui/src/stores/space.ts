// 空间（文件夹）store —— 组织会话与目录绑定
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getPlatformAdapter } from '@yan-zhi/core';
import { uid, type Space } from '@yan-zhi/shared';
import { api } from '../api/client';
import { useAuthStore } from './auth';

const LS_KEY = 'yz_current_space_id';

function rowToSpace(r: any): Space {
  return {
    id: r.id,
    name: r.name,
    dirPath: r.dir_path ?? r.dirPath,
    description: r.description,
    sortOrder: r.sort_order ?? r.sortOrder ?? 0,
    createdAt: r.created_at ?? r.createdAt,
    updatedAt: r.updated_at ?? r.updatedAt,
  };
}

export const useSpaceStore = defineStore('space', () => {
  const spaces = ref<Space[]>([]);
  const loading = ref(false);
  /** 当前选中的空间 ID：null 表示"全部"，undefined 表示未归类，具体 ID 表示某空间 */
  const currentSpaceId = ref<string | null>(loadCurrentSpaceId());

  function loadCurrentSpaceId(): string | null {
    try {
      const v = localStorage.getItem(LS_KEY);
      return v === null ? null : v;
    } catch {
      return null;
    }
  }

  function persistCurrentSpaceId() {
    try {
      if (currentSpaceId.value === null) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, currentSpaceId.value);
    } catch {}
  }

  const isServerMode = () => useAuthStore().useServerApi;

  const currentSpace = computed(() => spaces.value.find((s) => s.id === currentSpaceId.value) || null);

  async function loadSpaces() {
    loading.value = true;
    try {
      if (isServerMode()) {
        const r = await api.get<any[]>('/spaces');
        if ('data' in r) {
          spaces.value = (r.data as any[]).map(rowToSpace);
        }
      } else {
        const adapter = getPlatformAdapter();
        const rows = await adapter.db.query<any>('SELECT * FROM space ORDER BY sort_order ASC, updated_at DESC');
        spaces.value = rows.map(rowToSpace);
      }
    } finally {
      loading.value = false;
    }
  }

  async function createSpace(data: { name: string; dirPath?: string; description?: string }): Promise<string> {
    if (isServerMode()) {
      const r = await api.post<any>('/spaces', {
        name: data.name, dirPath: data.dirPath, description: data.description,
      });
      if ('data' in r) {
        const space = rowToSpace(r.data);
        spaces.value.unshift(space);
        return space.id;
      }
      throw new Error('创建空间失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('sp_');
    const now = Date.now();
    await adapter.db.exec(
      'INSERT INTO space (id, name, dir_path, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.dirPath || null, data.description || null, 0, now, now],
    );
    await loadSpaces();
    return id;
  }

  /** 按 dirPath 查找空间，找不到则创建。返回 spaceId */
  async function findOrCreateByDirPath(dirPath: string): Promise<string> {
    const norm = dirPath.replace(/[\\/]+$/, '');
    const existing = spaces.value.find((s) => s.dirPath && s.dirPath.replace(/[\\/]+$/, '') === norm);
    if (existing) return existing.id;
    const name = norm.split(/[\\/]/).filter(Boolean).pop() || '项目';
    return createSpace({ name, dirPath });
  }

  async function updateSpace(id: string, patch: { name?: string; dirPath?: string; description?: string; sortOrder?: number }) {
    if (isServerMode()) {
      const body: any = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.dirPath !== undefined) body.dirPath = patch.dirPath;
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.sortOrder !== undefined) body.sortOrder = patch.sortOrder;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/spaces/${id}`, body);
    } else {
      const adapter = getPlatformAdapter();
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
      if (patch.dirPath !== undefined) { sets.push('dir_path = ?'); params.push(patch.dirPath || null); }
      if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description || null); }
      if (patch.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(patch.sortOrder); }
      if (sets.length === 0) return;
      sets.push('updated_at = ?'); params.push(Date.now());
      params.push(id);
      await adapter.db.exec(`UPDATE space SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    await loadSpaces();
  }

  /** 删除空间：仅删 space 记录，其下会话 space_id 置空归"未归类" */
  async function deleteSpace(id: string) {
    if (isServerMode()) {
      await api.delete(`/spaces/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('UPDATE conversation SET space_id = NULL WHERE space_id = ?', [id]);
      await adapter.db.exec('DELETE FROM space WHERE id = ?', [id]);
    }
    if (currentSpaceId.value === id) {
      currentSpaceId.value = null;
      persistCurrentSpaceId();
    }
    await loadSpaces();
  }

  function selectSpace(id: string | null) {
    currentSpaceId.value = id;
    persistCurrentSpaceId();
  }

  return {
    spaces, loading, currentSpaceId, currentSpace,
    loadSpaces, createSpace, findOrCreateByDirPath, updateSpace, deleteSpace, selectSpace,
  };
});
