// 文档类型 store：内置（前端常量）+ 自定义（服务端）。
// 自定义类型与内置同 code 时以自定义为准（用户可覆盖内置模板）。
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';
import { mergeDocumentTypes, type DocumentType } from '../utils/document-types';

export const useDocumentTypeStore = defineStore('documentType', () => {
  const custom = ref<DocumentType[]>([]);
  const loading = ref(false);
  const error = ref('');
  const loaded = ref(false);

  /** 内置在前、自定义覆盖同 code */
  const all = computed<DocumentType[]>(() => mergeDocumentTypes(custom.value));
  const builtins = computed(() => all.value.filter((t) => t.builtin));
  const customs = computed(() => all.value.filter((t) => !t.builtin));

  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    loading.value = true;
    error.value = '';
    try {
      const r = await api.get<DocumentType[]>('/document-types');
      if ('error' in r) { error.value = String(r.error); return; }
      custom.value = (r.data || []).map((t) => ({ ...t, builtin: false }));
      loaded.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function save(def: DocumentType): Promise<DocumentType | null> {
    const payload: DocumentType = {
      code: def.code,
      name: def.name,
      description: def.description,
      category: def.category,
      output: 'docx',
      sections: def.sections,
      ...(def.variables?.length ? { variables: def.variables } : {}),
      ...(def.usage ? { usage: def.usage } : {}),
    };
    const r = await api.post<DocumentType>('/document-types', payload);
    if ('error' in r) { error.value = String(r.error); return null; }
    await load(true);
    return r.data;
  }

  async function remove(code: string): Promise<boolean> {
    const r = await api.delete(`/document-types/${encodeURIComponent(code)}`);
    if ('error' in r) { error.value = String(r.error); return false; }
    await load(true);
    return true;
  }

  /** 当前编辑稿 → YAML（内置类型也能导出，用于“另存为自定义”的起点） */
  async function exportYaml(type: DocumentType): Promise<string | null> {
    const r = await api.post<{ yaml: string }>('/document-types/export-yaml', { type });
    if ('error' in r) { error.value = String(r.error); return null; }
    return r.data.yaml;
  }

  async function importYaml(text: string): Promise<DocumentType | null> {
    const r = await api.post<DocumentType>('/document-types/import-yaml', { yaml: text });
    if ('error' in r) { error.value = String(r.error); return null; }
    await load(true);
    return r.data;
  }

  return { custom, all, builtins, customs, loading, error, loaded, load, save, remove, exportYaml, importYaml };
});
