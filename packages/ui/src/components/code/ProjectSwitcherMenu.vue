<template>
  <div class="psw" @click.stop>
    <div class="psw-head">
      <span>项目目录</span>
      <span class="psw-head-hint">切换或打开新项目</span>
    </div>

    <div class="psw-list">
      <button
        v-for="d in recents"
        :key="d"
        class="psw-item"
        :class="{ on: d === current }"
        :title="d"
        @click="select(d)"
      >
        <el-icon :size="13" class="psw-ico"><FolderOpened /></el-icon>
        <span class="psw-name">{{ basename(d) }}</span>
        <span class="psw-path">{{ d }}</span>
        <el-icon v-if="d === current" :size="12" class="psw-check"><Check /></el-icon>
      </button>
      <div v-if="!recents.length" class="psw-empty">暂无最近项目</div>
    </div>

    <div class="psw-foot">
      <button class="psw-foot-btn primary" @click="emit('open-new')">
        <el-icon :size="13"><FolderAdd /></el-icon> 打开新项目…
      </button>
      <button v-if="current" class="psw-foot-btn danger" @click="clearCurrent">
        <el-icon :size="13"><Close /></el-icon> 清除当前
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FolderOpened, FolderAdd, Check, Close } from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import { useSettingsStore } from '../../stores/settings';

const emit = defineEmits<{ 'open-new': []; close: [] }>();

const code = useCodeStore();
const settingsStore = useSettingsStore();

const current = computed(() => code.projectDir);

/** 最近目录（来自设置）+ 当前目录；当前若不在列表里也补上，便于回切 */
const recents = computed(() => {
  const list = (settingsStore.settings.recentWorkspaceDirs || []).filter(Boolean);
  const set = new Set(list);
  if (current.value && !set.has(current.value)) set.add(current.value);
  return Array.from(set);
});

function basename(p: string): string {
  const clean = p.replace(/[\\/]+$/, '');
  return clean.split(/[\\/]/).filter(Boolean).pop() || clean;
}

/** 把目录提到最近列表最前（去重，最多 8 个） */
function remember(dir: string) {
  const list = (settingsStore.settings.recentWorkspaceDirs || []).filter((d) => d && d !== dir);
  list.unshift(dir);
  void settingsStore.update({ recentWorkspaceDirs: list.slice(0, 8) });
}

function select(dir: string) {
  code.setProjectDir(dir);
  remember(dir);
  emit('close');
}

function clearCurrent() {
  code.setProjectDir('');
  emit('close');
}
</script>

<style scoped>
.psw {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  width: 320px;
  max-width: 80vw;
  background: var(--color-surface, #fff);
  border: 1px solid var(--glass-border, #e7e4dc);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.psw-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  padding: 8px 12px;
  font-size: 11px; font-weight: 700; color: var(--color-text, #1a1a1a);
  border-bottom: 1px solid var(--glass-border, #e7e4dc);
  background: var(--el-fill-color-lighter, #f6f4ef);
}
.psw-head-hint { font-size: 10px; font-weight: 400; color: var(--color-text-tertiary, #9c9b94); }

.psw-list { max-height: 280px; overflow-y: auto; padding: 4px; }
.psw-list::-webkit-scrollbar { width: 6px; }
.psw-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb, #d8d4ca); border-radius: 999px; }

.psw-item {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 8px; row-gap: 0;
  align-items: center;
  width: 100%;
  padding: 7px 8px;
  border: none; border-radius: 8px; background: transparent;
  text-align: left; cursor: pointer;
  transition: background 0.12s ease;
}
.psw-item:hover { background: var(--glass-bg-hover, #f1efe9); }
.psw-item.on { background: color-mix(in srgb, var(--color-primary, #c2410c) 10%, transparent); }
.psw-ico { grid-row: 1 / 3; color: var(--color-text-secondary, #6b6b66); align-self: center; }
.psw-name {
  font-size: 12.5px; font-weight: 600; color: var(--color-text, #1a1a1a);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.psw-path {
  grid-column: 2 / 3;
  font-size: 10.5px; color: var(--color-text-tertiary, #9c9b94);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.psw-check { grid-row: 1 / 3; color: var(--color-primary, #c2410c); align-self: center; }
.psw-empty { padding: 14px 10px; text-align: center; font-size: 11.5px; color: var(--color-text-tertiary, #9c9b94); }

.psw-foot {
  display: flex; gap: 6px; padding: 8px;
  border-top: 1px solid var(--glass-border, #e7e4dc);
  background: var(--el-fill-color-lighter, #f6f4ef);
}
.psw-foot-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  height: 30px; padding: 0 10px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--glass-border, #e7e4dc); background: var(--color-surface, #fff);
  font-size: 12px; font-family: inherit; color: var(--color-text-secondary, #6b6b66);
  transition: all 0.15s ease;
}
.psw-foot-btn:hover { border-color: var(--color-primary, #c2410c); color: var(--color-primary, #c2410c); }
.psw-foot-btn.primary { background: var(--color-primary, #c2410c); color: #fff; border-color: transparent; font-weight: 600; }
.psw-foot-btn.primary:hover { filter: brightness(1.06); color: #fff; }
.psw-foot-btn.danger:hover { border-color: var(--el-color-danger, #ef4444); color: var(--el-color-danger, #ef4444); }
</style>
