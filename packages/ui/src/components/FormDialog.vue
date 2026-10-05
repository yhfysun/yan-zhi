<template>
  <el-dialog
    v-model="visible"
    :title="titleText"
    :width="width"
    :top="top"
    :class="resolvedDialogClass"
    :append-to-body="appendToBody"
    :close-on-click-modal="false"
    destroy-on-close
    :before-close="handleBeforeClose"
    @closed="emit('closed')"
  >
    <!-- bodyClass：把设计令牌作用域带进 teleport 出去的弹窗（如 dw-root），
         否则 .dw-root .ds-* 这类选择器在弹窗内全部失效 -->
    <div :class="bodyClass">
      <!-- 错误提示条：error prop 直接渲染；也可用 #error 插槽自定义 -->
      <slot name="error">
        <div v-if="error" class="fd-error" role="alert">{{ error }}</div>
      </slot>
      <slot />
    </div>

    <template #footer>
      <div class="fd-footer" :class="bodyClass">
        <slot name="footer" :close="requestClose">
          <span class="fd-spacer" />
          <el-button :disabled="loading" @click="requestClose">{{ cancelText }}</el-button>
          <el-button type="primary" :loading="loading" @click="emit('submit')">{{ confirmText }}</el-button>
        </slot>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessageBox } from 'element-plus';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** 有 id 即为编辑态，标题自动切换 */
    isEdit?: boolean;
    /** 直接指定标题，优先级高于 isEdit 推导 */
    title?: string;
    titleCreate?: string;
    titleEdit?: string;
    width?: string;
    top?: string;
    /** 弹窗插入 body（嵌套弹窗/在 overflow 容器内时需要） */
    appendToBody?: boolean;
    /** 错误提示条文案：非空时在表单顶部渲染红色警示条 */
    error?: string;
    confirmText?: string;
    cancelText?: string;
    /** 保存中：禁用取消 + 主按钮转圈 */
    loading?: boolean;
    /** 有未保存修改时关闭前二次确认（需同时传 dirty） */
    unsavedGuard?: boolean;
    dirty?: boolean;
    bodyClass?: string;
    dialogClass?: string;
  }>(),
  {
    isEdit: false,
    titleCreate: '新建',
    titleEdit: '编辑',
    width: '640px',
    top: '10vh',
    appendToBody: false,
    error: '',
    confirmText: '保存',
    cancelText: '取消',
    loading: false,
    unsavedGuard: false,
    dirty: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit'): void;
  (e: 'closed'): void;
  (e: 'cancel'): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const titleText = computed(() => props.title || (props.isEdit ? props.titleEdit : props.titleCreate));

/** 窄弹窗（≤520px）：自动加 el-dialog--sm，让 overlay.css 的紧凑留白/小标题生效（仅识别 px 宽度） */
const NARROW_MAX = 520;
const resolvedDialogClass = computed(() => {
  const m = /^(\d+)px$/.exec(props.width?.trim() || '');
  const narrow = !!m && Number(m[1]) <= NARROW_MAX;
  return [narrow ? 'el-dialog--sm' : '', props.dialogClass].filter(Boolean).join(' ');
});

const GUARD_TEXT = '有未保存的修改，关闭后将会丢失。';

function guardDialog(): Promise<boolean> {
  if (!props.unsavedGuard || !props.dirty) return Promise.resolve(true);
  return ElMessageBox.confirm(GUARD_TEXT, '未保存的修改', {
    type: 'warning',
    confirmButtonText: '放弃修改',
    cancelButtonText: '继续编辑',
  })
    .then(() => true)
    .catch(() => false);
}

/** 取消按钮 / 插槽内 close()：走同一套未保存守卫 */
async function requestClose() {
  if (!(await guardDialog())) return;
  emit('cancel');
  visible.value = false;
}

/** before-close 覆盖右上角 X 与 Esc（点遮罩已由 close-on-click-modal=false 禁用） */
function handleBeforeClose(done: () => void) {
  guardDialog().then((ok) => {
    if (!ok) return;
    emit('cancel');
    done();
  });
}
</script>

<style scoped>
.fd-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fd-spacer {
  flex: 1;
}
.fd-error {
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid var(--el-color-danger-light-5, rgba(239, 68, 68, 0.35));
  border-radius: 8px;
  background: var(--el-color-danger-light-9, rgba(239, 68, 68, 0.08));
  color: var(--el-color-danger);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
</style>
