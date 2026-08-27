<template>
  <div class="page chat-hub-page">
    <section class="chat-hub-hero">
      <div class="chat-hub-icon">
        <el-icon :size="30"><ChatLineRound /></el-icon>
      </div>
      <h1>IM 中枢即将上线</h1>
      <p>后续版本会在这里统一接入企业微信、飞书等即时消息通道。</p>
      <el-button type="primary" @click="openSettingsDrawer('connections')">
        <el-icon><Promotion /></el-icon>
        去设置 IM 连接
      </el-button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ChatLineRound, Promotion } from '@element-plus/icons-vue';
import { openSettingsDrawer } from '../composables/useSettingsDrawer';
</script>

<style scoped>
.chat-hub-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

.chat-hub-hero {
  width: min(480px, 100%);
  padding: 34px 30px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  box-shadow: var(--shadow-md);
  text-align: center;
}

.chat-hub-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 18px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.28);
}

h1 {
  margin: 0 0 10px;
  font-size: 24px;
  font-weight: 750;
  letter-spacing: 0;
}

p {
  margin: 0 0 22px;
  color: var(--color-text-secondary);
  line-height: 1.7;
}

.el-button {
  letter-spacing: 0;
}
</style>
