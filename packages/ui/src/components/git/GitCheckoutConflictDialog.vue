<template>
  <el-dialog
    v-model="visible"
    title="切换分支会产生冲突"
    width="560px"
    class="git-checkout-conflict-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="gxc">
      <div class="gxc-tip">
        <el-icon class="gxc-warn"><WarningFilled /></el-icon>
        <span>切换到 <b>{{ branch }}</b> 会覆盖以下 {{ files.length }} 个文件的本地修改，请选择处理方式。</span>
      </div>

      <div class="gxc-list">
        <div v-for="f in files" :key="f" class="gxc-file">
          <el-icon :size="12"><Document /></el-icon>
          <span class="gxc-path">{{ f }}</span>
        </div>
      </div>

      <div class="gxc-options">
        <button class="gxc-opt" :disabled="busy" @click="doSmart">
          <div class="gxc-opt-title">
            <el-icon><Box /></el-icon>智能检出
            <span class="gxc-tag">推荐</span>
          </div>
          <div class="gxc-opt-desc">先把本地改动储藏起来，切换分支后再恢复。恢复时若仍有冲突会进入冲突解决。</div>
        </button>
        <button class="gxc-opt danger" :disabled="busy" @click="doForce">
          <div class="gxc-opt-title">
            <el-icon><Delete /></el-icon>强制检出
          </div>
          <div class="gxc-opt-desc">丢弃上面这些文件的本地修改，直接切换分支。此操作不可撤销。</div>
        </button>
      </div>
    </div>

    <template #footer>
      <div class="gxc-foot">
        <span class="gxc-spacer"></span>
        <button class="gxc-btn" :disabled="busy" @click="close">取消</button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { WarningFilled, Document, Box, Delete } from '@element-plus/icons-vue';
import { useGitStore } from '../../stores/git';

const props = defineProps<{
  modelValue: boolean;
  repo: string;
  branch: string;
  files: string[];
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'resolved', payload: { ok: boolean; conflicts: string[]; message: string }): void;
}>();

const gitStore = useGitStore();
const busy = ref(false);

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

function close(): void {
  visible.value = false;
}

async function run(strategy: 'smart' | 'force'): Promise<void> {
  busy.value = true;
  try {
    const res = await gitStore.checkout(props.repo, props.branch, strategy);
    if ('error' in res) throw new Error(res.error);
    const d = res.data;
    emit('resolved', { ok: d.ok, conflicts: d.conflicts || [], message: d.message || '' });
    visible.value = false;
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    busy.value = false;
  }
}
function doSmart(): void { void run('smart'); }
function doForce(): void { void run('force'); }
</script>

<style scoped>
.gxc { display: flex; flex-direction: column; gap: 12px; }
.gxc-tip {
  display: flex; gap: 8px; align-items: flex-start;
  font-size: 13px; color: var(--color-text, #1a1a1a); line-height: 1.6;
}
.gxc-warn { color: #b45309; margin-top: 2px; }
.gxc-list {
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 8px;
  max-height: 160px; overflow: auto; background: var(--glass-bg-soft, #fbfaf7);
}
.gxc-file {
  display: flex; align-items: center; gap: 6px; padding: 5px 10px;
  font-size: 12px; border-bottom: 1px solid var(--glass-border-soft, #f0eee8);
}
.gxc-path { font-family: "JetBrains Mono", monospace; word-break: break-all; }
.gxc-options { display: flex; flex-direction: column; gap: 8px; }
.gxc-opt {
  text-align: left; cursor: pointer; padding: 10px 12px;
  border: 1px solid var(--glass-border, #e7e4dc); border-radius: 8px; background: #fff;
}
.gxc-opt:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); background: #fdf8f5; }
.gxc-opt:disabled { opacity: 0.5; cursor: not-allowed; }
.gxc-opt-title {
  display: flex; align-items: center; gap: 6px; font-size: 13px;
  font-weight: 600; color: var(--color-text, #1a1a1a); margin-bottom: 4px;
}
.gxc-opt.danger:hover:not(:disabled) { border-color: #b91c1c; background: #fef2f2; }
.gxc-tag {
  font-size: 10px; font-weight: 400; padding: 0 5px; border-radius: 8px;
  background: #fdf3ec; color: var(--color-primary, #c2410c);
}
.gxc-opt-desc { font-size: 12px; color: var(--color-text-soft, #6b6b6b); line-height: 1.5; }
.gxc-foot { display: flex; }
.gxc-spacer { flex: 1; }
.gxc-btn {
  border: 1px solid var(--glass-border, #e7e4dc); background: #fff;
  border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer;
}
.gxc-btn:hover:not(:disabled) { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
</style>
