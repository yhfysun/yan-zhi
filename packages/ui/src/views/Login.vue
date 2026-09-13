<template>
  <div class="auth-page">
    <!-- 返回上一页（桌面端无侧栏可点，进入登录页后需手动返回入口） -->
    <button class="auth-back" type="button" @click="goBack" aria-label="返回">
      <el-icon :size="18"><ArrowLeft /></el-icon>
      <span>返回</span>
    </button>
    <div class="auth-card">
      <div class="auth-header">
        <div class="auth-logo">
          <img src="../assets/login-logo.png" alt="言智" draggable="false" />
        </div>
        <h2>{{ isLogin ? '登录' : '注册' }}</h2>
        <p>{{ isLogin ? '欢迎回来，登录以跨设备同步任务' : '创建账号以跨设备同步数据' }}</p>
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
          <el-button class="submit-btn" type="primary" size="large" native-type="submit" :loading="authStore.loading">
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
import { User, Lock, Message, ArrowLeft } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

// 返回上一页；若无历史则回到聊天主页
function goBack() {
  if (window.history.length > 1) router.back();
  else router.replace('/chat');
}

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
    const redirect = typeof router.currentRoute.value.query.redirect === 'string'
      ? router.currentRoute.value.query.redirect
      : '/chat';
    router.replace(redirect);
  }
}
</script>

<style scoped>
.auth-page {
  display: flex; align-items: center; justify-content: center;
  /* 用 100% 而非 100vh：桌面端标题栏(36px)会吃掉视口高度，100vh 会导致卡片溢出底部被裁切；
     web/mobile 的 #app 高度也是 100%，百分比同样铺满 */
  min-height: 100%;
  padding: 24px;
  position: relative;
  background: var(--glass-bg);
}

/* 返回按钮：固定在登录页左上角 */
.auth-back {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.18s ease, color 0.18s ease;
  z-index: 2;
}
.auth-back:hover {
  background: var(--glass-bg-hover);
  color: var(--color-text);
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
  width: 64px; height: 64px;
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 18px;
}
.auth-logo img {
  width: 48px; height: 48px;
  object-fit: contain;
  display: block;
}

.auth-header h2 { font-size: 24px; font-weight: 700; margin: 0 0 8px; color: var(--color-text); }
.auth-header p { font-size: 14px; color: var(--color-text-secondary); margin: 0; }

.auth-form { margin-bottom: 8px; }

.submit-btn {
  width: 100%; height: 44px;
  /* !important：覆盖 App.vue 全局 .el-button:not(--primary) 透明背景规则（优先级 0,6,0）
     及 Element Plus --primary 默认实色背景，确保品牌渐变可见 */
  background: var(--gradient-primary) !important;
  border: none !important; color: #fff !important;
  font-weight: 600; font-size: 15px;
  border-radius: var(--radius-md);
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.45);
  filter: brightness(1.08);
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
