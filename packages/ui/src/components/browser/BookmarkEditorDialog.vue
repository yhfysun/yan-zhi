<template>
  <el-dialog
    v-model="visible"
    :title="existing ? '编辑收藏' : '收藏此页'"
    width="460px"
    class="el-dialog--sm"
    append-to-body
    :close-on-click-modal="false"
  >
    <el-form label-width="64px" size="small" @submit.prevent>
      <el-form-item label="网址">
        <div class="bm-editor-url" :title="url">{{ url }}</div>
      </el-form-item>
      <el-form-item label="名称">
        <el-input v-model="title" maxlength="80" placeholder="收藏名称" @keyup.enter="submit" />
      </el-form-item>
      <el-form-item label="文件夹">
        <div class="bm-editor-folder">
          <el-select v-model="folderId" size="small" style="flex:1" placeholder="根目录">
            <el-option label="根目录" :value="null" />
            <el-option
              v-for="f in folderOptions"
              :key="f.id"
              :label="f.path"
              :value="f.id"
            />
          </el-select>
          <el-button size="small" @click="toggleNewFolder">新建文件夹</el-button>
        </div>
      </el-form-item>
      <el-form-item v-if="newFolderMode" label="新文件夹">
        <el-input
          ref="newFolderInput"
          v-model="newFolderTitle"
          maxlength="40"
          placeholder="文件夹名称，保存时一并创建"
          @keyup.enter="submit"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button v-if="existing" size="small" type="danger" text @click="remove">取消收藏</el-button>
      <span class="bm-editor-spacer"></span>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button size="small" type="primary" :disabled="!url" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { findFolderOf, listFolders, type BookmarkNode } from '../../utils/browserBookmarks';

const props = defineProps<{
  modelValue: boolean;
  url: string;
  defaultTitle: string;
  nodes: BookmarkNode[];
  existing: BookmarkNode | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [payload: { title: string; folderId: string | null; newFolderTitle: string }];
  remove: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});
const folderOptions = computed(() => listFolders(props.nodes));

const title = ref('');
const folderId = ref<string | null>(null);
const newFolderMode = ref(false);
const newFolderTitle = ref('');
const newFolderInput = ref<any>(null);

watch(() => props.modelValue, (open) => {
  if (!open) return;
  title.value = props.existing?.title || props.defaultTitle || '';
  folderId.value = props.existing ? findFolderOf(props.nodes, props.existing.id) : null;
  newFolderMode.value = false;
  newFolderTitle.value = '';
}, { immediate: true });

function toggleNewFolder() {
  newFolderMode.value = !newFolderMode.value;
  if (newFolderMode.value) {
    folderId.value = null;
    nextTick(() => newFolderInput.value?.focus?.());
  }
}

function submit() {
  if (!props.url) return;
  emit('save', {
    title: title.value,
    folderId: newFolderMode.value ? null : folderId.value,
    newFolderTitle: newFolderMode.value ? newFolderTitle.value.trim() : '',
  });
  visible.value = false;
}

function remove() {
  emit('remove');
  visible.value = false;
}
</script>

<style scoped>
.bm-editor-url {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}
.bm-editor-folder { display: flex; gap: 8px; width: 100%; }
.bm-editor-spacer { flex: 1; }
</style>
