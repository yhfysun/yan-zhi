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
        <template v-if="step === 'changePwd'">
          <h2>设置新密码</h2>
          <p>账号 <b>{{ authStore.user?.username }}</b> 首次登录，请设置新密码，下次登录即用</p>
        </template>
        <template v-else>
          <h2>{{ isLogin ? '登录' : '注册' }}</h2>
          <p>{{ isLogin ? '欢迎回来，登录以跨设备同步任务' : '创建账号以跨设备同步数据' }}</p>
        </template>
      </div>

      <!-- 二段式步骤指示（第二步改密时显示）：登录验证 ✓ → 设置密码 -->
      <div v-if="step === 'changePwd'" class="step-indicator" aria-label="进度">
        <span class="step-item done"><i class="step-dot"><el-icon><Check /></el-icon></i><span>登录验证</span></span>
        <span class="step-bar" />
        <span class="step-item active"><i class="step-dot">2</i><span>设置密码</span></span>
      </div>

      <el-form v-if="step !== 'changePwd'" @submit.prevent="submit" class="auth-form">
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

      <!-- Task 6：企业 OIDC 单点登录（仅在服务端启用时出现，内置账号登录保持不变） -->
      <div v-if="step !== 'changePwd' && oidcEnabled" class="oidc-entry">
        <el-divider>或</el-divider>
        <el-button class="oidc-btn" size="large" @click="startOidcLogin">企业账号单点登录</el-button>
        <p v-if="oidcError" class="oidc-error">{{ oidcError }}</p>
      </div>

      <!-- 二段式第二步：改密时整卡切换，登录表单/服务器地址全部隐藏 -->
      <el-form v-if="step === 'changePwd'" @submit.prevent="submitChangePwd" class="auth-form change-form">
        <div class="account-chip">
          <el-icon><User /></el-icon>
          <span>{{ authStore.user?.username }}</span>
          <span class="chip-tag">首次登录</span>
        </div>
        <el-form-item>
          <el-input v-model="newPwd" type="password" placeholder="设置新密码（至少 6 位）" size="large" show-password :prefix-icon="Lock" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="newPwd2" type="password" placeholder="再次输入新密码" size="large" show-password :prefix-icon="Lock" @keyup.enter="submitChangePwd" />
        </el-form-item>
        <transition name="form-fade">
          <el-alert v-if="changePwdError" :title="changePwdError" type="error" show-icon :closable="false"></el-alert>
        </transition>
        <p class="pwd-tip">至少 6 位，建议包含字母和数字。设置后下次登录使用新密码。</p>
        <el-form-item>
          <el-button class="submit-btn" type="primary" size="large" native-type="submit" :loading="changingPwd">
            完成并进入
          </el-button>
        </el-form-item>
        <el-button text size="small" class="back-login-link" @click="backToLogin">返回重新登录</el-button>
      </el-form>

      <template v-else>
      <!-- multi 多用户模式：账号由管理员在后台创建，不开放自助注册 -->
      <div v-if="!hideRegister" class="auth-footer">
        <span v-if="isLogin">还没有账号？</span>
        <span v-else>已有账号？</span>
        <el-button text type="primary" class="toggle-link" @click="isLogin = !isLogin; authStore.error = ''">
          {{ isLogin ? '去注册' : '去登录' }}
        </el-button>
      </div>

      <!-- 服务器地址：轻量壳连远程后端（打包内置地址在此显示，可修改；保存后刷新生效） -->
      <div class="server-field">
        <el-divider content-position="left">服务器地址</el-divider>
        <div class="server-row">
          <el-input v-model="serverBase" placeholder="http://192.168.1.100:3001" clearable size="small" />
          <el-button size="small" @click="saveServerBase">保存</el-button>
        </div>
        <p v-if="bakedBase" class="server-hint">出厂默认：{{ bakedBase }}（如需恢复，清空此处保存）</p>
      </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock, Message, ArrowLeft, Check } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { getEffectiveServerBase, getBakedServerBase, setServerBase, setToken, API_BASE } from '../api/client';
import { api } from '../api/client';

const router = useRouter();
const authStore = useAuthStore();
// 显示"生效地址"（打包内置的或用户改过的），可直接改成新地址保存
const serverBase = ref(getEffectiveServerBase());
const bakedBase = getBakedServerBase();
/** multi 模式（后端要求登录）下不开放自助注册：账号由管理员创建 */
const hideRegister = ref(false);
const oidcEnabled = ref(false);
const oidcError = ref('');

onMounted(async () => {
  // OIDC 回调 302 回 /login?oidc_token=：存本地令牌后整页刷新，让 authStore 用新身份初始化。
  const params = new URLSearchParams(window.location.search);
  const oidcToken = params.get('oidc_token');
  if (oidcToken) {
    setToken(oidcToken);
    window.location.replace(window.location.pathname + window.location.hash);
    return;
  }
  try {
    const r = await api.get<{ enabled: boolean }>('/auth/oidc/config');
    if ('data' in r) oidcEnabled.value = !!r.data?.enabled;
  } catch {
    // 配置端点不可用不阻塞内置账号登录（该模式本来就不需要 OIDC）。
  }
  if (!authStore.statusLoaded) await authStore.fetchStatus();
  hideRegister.value = authStore.authRequired;
});

function startOidcLogin() {
  oidcError.value = '';
  window.location.href = `${API_BASE}/auth/oidc/login`;
}

function saveServerBase() {
  try {
    const v = setServerBase(serverBase.value);
    ElMessage.success(v ? '已保存，即将刷新生效' : '已清除，即将刷新生效');
    setTimeout(() => window.location.reload(), 600);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '地址格式不正确');
  }
}

// 返回上一页；若无历史则回到聊天主页
function goBack() {
  if (window.history.length > 1) router.back();
  else router.replace('/chat');
}

const isLogin = ref(true);
const username = ref('');
const password = ref('');
const email = ref('');

// ===== 首次登录强制改密（二段式：登录验证 → 设置密码）=====
const step = ref<'account' | 'changePwd'>('account');
const newPwd = ref('');
const newPwd2 = ref('');
const changingPwd = ref(false);
const changePwdError = ref('');
function backToLogin() {
  // 返回第一步：清掉半程登录态，重新走登录
  authStore.logout();
  step.value = 'account';
  newPwd.value = '';
  newPwd2.value = '';
  changePwdError.value = '';
}
async function submitChangePwd() {
  changePwdError.value = '';
  if (newPwd.value.length < 6) { changePwdError.value = '新密码至少 6 位'; return; }
  if (newPwd.value !== newPwd2.value) { changePwdError.value = '两次输入的密码不一致'; return; }
  changingPwd.value = true;
  const r = await api.post('/auth/change-password', { newPassword: newPwd.value });
  changingPwd.value = false;
  if ('error' in r) { changePwdError.value = r.error; return; }
  ElMessage.success('密码已设置，欢迎回来');
  authStore.mustChangePassword = false;
  router.replace('/chat');
}

async function submit() {
  // ★ 服务器地址草稿先落袋（2026-11-01）：API 基址在页面加载时确定，改了地址不保存
  //   就点登录会打到旧后端（看着像"账号密码错误"）。检测到差异 → 保存并刷新重进。
  if (serverBase.value.trim().replace(/\/+$/, '') !== getEffectiveServerBase()) {
    try {
      setServerBase(serverBase.value);
      ElMessage.success('服务器地址已切换，页面刷新后请再次登录');
      setTimeout(() => window.location.reload(), 600);
      return;
    } catch (e: any) {
      ElMessage.error(e?.message || '地址格式不正确');
      return;
    }
  }
  const ok = isLogin.value
    ? await authStore.login(username.value, password.value)
    : await authStore.register(username.value, password.value, email.value);
  if (ok && authStore.mustChangePassword) {
    // 首次登录（默认管理员密码为空）：先设置新密码再进入
    step.value = 'changePwd';
    return;
  }
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

/* ===== 二段式：第二步「设置新密码」 ===== */
/* 步骤指示条：登录验证 ✓ —— 设置密码 */
.step-indicator {
  display: flex; align-items: center; justify-content: center;
  gap: 10px; margin: -8px 0 20px;
}
.step-item {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--color-text-secondary);
}
.step-dot {
  width: 20px; height: 20px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-style: normal; font-weight: 600;
  background: var(--color-border, #e5e7eb); color: var(--color-text-secondary);
}
.step-item.done { color: var(--el-color-success); }
.step-item.done .step-dot { background: var(--el-color-success); color: #fff; }
.step-item.active { color: var(--el-color-primary); font-weight: 600; }
.step-item.active .step-dot { background: var(--el-color-primary); color: #fff; }
.step-bar {
  width: 42px; height: 2px; border-radius: 1px;
  background: linear-gradient(90deg, var(--el-color-success), var(--el-color-primary));
}
/* 已登录账号徽标：让用户明确知道在给哪个账号设密码 */
.account-chip {
  display: inline-flex; align-items: center; gap: 7px;
  align-self: center; margin-bottom: 16px;
  padding: 5px 14px; border-radius: 999px;
  background: var(--el-color-primary-light-9, #ecf2ff);
  color: var(--el-color-primary); font-size: 13px; font-weight: 600;
}
.chip-tag {
  font-size: 11px; font-weight: 500; padding: 1px 8px; border-radius: 999px;
  background: var(--el-color-warning-light-8, #fdf3e0); color: var(--el-color-warning-dark-2, #b88230);
}
.change-form { gap: 2px; }
.change-form .el-form-item { margin-bottom: 16px; }
.pwd-tip {
  font-size: 12px; color: var(--color-text-secondary);
  text-align: center; margin: 0 0 14px;
}
.back-login-link { align-self: center; color: var(--color-text-secondary); }

.toggle-link {
  position: relative; font-weight: 600; padding: 0;
}
.toggle-link::after {
  content: ''; position: absolute; bottom: 0; left: 0; width: 0; height: 1.5px;
  background: var(--color-primary); transition: width 0.25s ease;
}
.toggle-link:hover::after { width: 100%; }

.server-field { margin-top: 16px; }
.server-row { display: flex; gap: 8px; }

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
