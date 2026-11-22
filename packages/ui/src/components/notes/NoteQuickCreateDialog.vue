<script setup lang="ts">
// 「记到笔记」轻量创建弹窗（docs/笔记功能方案-2026-11-14.md §5 学习模式联动）。
// 复用入口：LearningV2（后续阅读页/词书页可同样挂载）。成功即静默关闭，不打断学习节奏。
import { ref, watch, computed } from 'vue';
import { api } from '../../api/client';

const props = defineProps<{
  visible: boolean;
  /** 预填：标题（课程名/文章名） */
  title?: string;
  /** 预填：正文（要点/选中文本/释义） */
  content?: string;
  /** 预填：分类名（可选，不存在自动创建） */
  categoryName?: string;
  /** inline=true：不弹全屏 modal，就地渲染成内联面板（沉浸学习台用，避免与 z-index 5000 的沉浸层打架） */
  inline?: boolean;
}>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'saved'): void }>();

const title = ref('');
const content = ref('');
const categoryName = ref('');
const saving = ref(false);
const error = ref('');

watch(() => props.visible, (v) => {
  if (v) {
    title.value = props.title || '';
    content.value = props.content || '';
    categoryName.value = props.categoryName || '';
    error.value = '';
  }
});

const canSave = computed(() => title.value.trim().length > 0 && !saving.value);

function close() {
  emit('update:visible', false);
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = '';
  try {
    const r = await api.post('/notes/notes', {
      title: title.value.trim(),
      content: content.value,
      categoryName: categoryName.value.trim() || '',
      kind: 'note',
      source: 'learning',
    });
    if (r && typeof r === 'object' && 'error' in r) {
      error.value = String((r as { error: unknown }).error);
      return;
    }
    emit('saved');
    close();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <!-- inline 时不 Teleport、不遮罩，就地渲染；沉浸学习台用，避免与 z-index 5000 的沉浸层打架 -->
  <Teleport to="body" :disabled="inline">
    <div v-if="visible" :class="inline ? 'nqc-inline' : 'nqc-mask'" @click.self="close">
      <div class="nqc-dialog" :class="{ 'is-inline': inline }">
        <div class="nqc-head">
          记到笔记
          <button v-if="inline" type="button" class="nqc-close" aria-label="关闭笔记面板" @click="close">×</button>
        </div>
        <input v-model="title" class="nqc-title" placeholder="标题" @keyup.enter="save" />
        <input v-model="categoryName" class="nqc-cat" list="nqc-category-options" placeholder="分类（可选，输入即建）" />
        <datalist id="nqc-category-options">
          <option value="学习"></option>
          <option value="工作"></option>
          <option value="生活"></option>
        </datalist>
        <textarea v-model="content" class="nqc-content" rows="6" placeholder="内容（Markdown）"></textarea>
        <div v-if="error" class="nqc-error">{{ error }}</div>
        <div class="nqc-ops">
          <button class="nqc-mini" @click="close">取消</button>
          <button class="nqc-primary" :disabled="!canSave" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.nqc-mask {
  position: fixed; inset: 0; z-index: 3000;
  background: rgba(0, 0, 0, .35);
  display: flex; align-items: center; justify-content: center;
}
.nqc-dialog {
  width: 420px; max-width: calc(100vw - 40px);
  background: var(--color-surface, #fff);
  border-radius: 12px; padding: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .18);
  display: flex; flex-direction: column; gap: 10px;
}
.nqc-head { font-size: 15px; font-weight: 700; color: var(--color-text, #1f2937); }
.nqc-title, .nqc-cat, .nqc-content {
  padding: 8px 10px; font-size: 13px; font-family: inherit;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px;
  background: transparent; color: inherit; outline: none;
}
.nqc-title:focus, .nqc-cat:focus, .nqc-content:focus { border-color: var(--el-color-primary, #2563eb); }
.nqc-content { resize: vertical; line-height: 1.6; }
.nqc-error { font-size: 12px; color: #b91c1c; }
.nqc-ops { display: flex; justify-content: flex-end; gap: 8px; }
.nqc-mini {
  padding: 6px 14px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px;
  background: transparent; color: var(--color-text, #1f2937);
}
.nqc-primary {
  padding: 6px 16px; font-size: 13px; cursor: pointer;
  border: none; border-radius: 8px;
  background: var(--el-color-primary, #2563eb); color: #fff;
}
.nqc-primary:disabled { opacity: .6; cursor: default; }
/* inline：沉浸学习台内就地展开，无遮罩/无 fixed，尺寸收窄并贴合浅色阅读表面 */
.nqc-inline { margin-top: 12px; }
.nqc-dialog.is-inline {
  width: 100%; padding: 14px; border: 1px solid var(--lv2-line, var(--color-border, #e5e7eb));
  border-radius: 9px; box-shadow: none; background: var(--color-surface, #fff);
}
.nqc-head { display: flex; align-items: center; justify-content: space-between; }
.nqc-close {
  width: 32px; height: 32px; border: 1px solid var(--color-border, #e5e7eb); border-radius: 7px;
  background: transparent; color: inherit; font-size: 18px; line-height: 1; cursor: pointer;
}
</style>
