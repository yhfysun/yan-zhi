<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <div class="auth-logo">
          <el-icon :size="36"><ChatDotRound /></el-icon>
        </div>
        <h2>{{ isLogin ? '登录' : '注册' }}</h2>
        <p>{{ isLogin ? '欢迎回来，登录以跨设备同步会话' : '创建账号以跨设备同步数据' }}</p>
      </div>

      <el-form @submit.prevent="submit" class="auth-form">
        <el-form-item>
          <el-input
            v-model="username"
            placeholder="请输入用户名"
            size="large"
            clearable
            :prefix-icon="User"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="password"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password
            :prefix-icon="Lock"
          />
        </el-form-item>
        <transition name="form-expand">
          <el-form-item v-if="!isLogin">
            <el-input
              v-model="email"
              placeholder="邮箱（选填）"
              size="large"
              clearable
              :prefix-icon="Message"
            />
          </el-form-item>
        </transition>
        <transition name="form-fade">
          <el-alert v-if="authStore.error" :title="authStore.error" type="error" show-icon :closable="false" />
        </transition>
        <el-form-item>
          <el-button class="submit-btn" size="large" native-type="submit" :loading="authStore.loading">
            {{ isLogin ? '登录' : '创建账号' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="auth-footer">
        <span v-if="isLogin">还没有账号？</span>
        <span v-else>已有账号？</span>
        <el-button text type="primary" class="toggle-link" @click="isLogin = !isLogin; authStore.error = ''">
          {{ isLogin ? '去注册' : '去登录' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ChatDotRound, User, Lock, Message } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const isLogin = ref(true);
const username = ref('');
const password = ref('');
const email = ref('');

async function submit() {
  const ok = isLogin.value
    ? await authStore.login(username.value, password.value)
    : await authStore.register(username.value, password.value, email.value);
  if (ok) {
    ElMessage.success(isLogin.value ? '登录成功' : '注册成功');
    router.replace('/chat');
  }
}
</script>

<style scoped>
.auth-page {
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; min-height: 100dvh; padding: 24px;
  background: var(--color-bg);
}

.auth-card {
  width: 100%; max-width: 400px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: 40px 36px;
  box-shadow: var(--shadow-lg);
  animation: cardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

@media (max-width: 767px) {
  .auth-page { padding: 0; }
  .auth-card {
    max-width: none; border-radius: 0; padding: 32px 20px;
    min-height: 100vh; min-height: 100dvh; box-shadow: none; border: none;
  }
}

@keyframes cardEnter {
  from { opacity: 0; transform: translateY(24px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.auth-header { text-align: center; margin-bottom: 32px; }

.auth-logo {
  width: 64px; height: 64px; border-radius: 18px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--gradient-primary);
  color: white; margin-bottom: 18px;
  box-shadow: 0 0 24px rgba(124, 58, 237, 0.3);
  transition: box-shadow 0.3s ease;
}
.auth-logo:hover { box-shadow: 0 0 36px rgba(124, 58, 237, 0.45); }

.auth-header h2 { font-size: 24px; font-weight: 700; margin: 0 0 8px; color: var(--color-text); }
.auth-header p { font-size: 14px; color: var(--color-text-secondary); margin: 0; }

.auth-form { margin-bottom: 8px; }

.submit-btn {
  width: 100%; height: 44px;
  background: var(--gradient-primary);
  border: none; color: white; font-weight: 600; font-size: 15px;
  border-radius: var(--radius-md);
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.45);
}
.submit-btn:active { transform: translateY(0); }

.auth-footer {
  text-align: center; font-size: 13px; color: var(--color-text-secondary);
}

.toggle-link {
  position: relative; font-weight: 600; padding: 0;
}
.toggle-link::after {
  content: ''; position: absolute; bottom: 0; left: 0; width: 0; height: 1.5px;
  background: var(--color-primary); transition: width 0.25s ease;
}
.toggle-link:hover::after { width: 100%; }

/* Form transitions */
.form-expand-enter-active { transition: all 0.3s ease; }
.form-expand-leave-active { transition: all 0.2s ease; }
.form-expand-enter-from { opacity: 0; transform: translateY(-8px); max-height: 0; }
.form-expand-leave-to { opacity: 0; transform: translateY(-8px); max-height: 0; }
.form-expand-enter-to, .form-expand-leave-from { max-height: 60px; }

.form-fade-enter-active { transition: all 0.25s ease; }
.form-fade-leave-active { transition: all 0.15s ease; }
.form-fade-enter-from, .form-fade-leave-to { opacity: 0; transform: translateY(-4px); }

</style>
