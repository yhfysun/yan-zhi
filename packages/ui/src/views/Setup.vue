<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <h2>初始化管理员</h2>
        <p>检测到服务尚未初始化，请创建第一个管理员账号</p>
      </div>

      <el-form @submit.prevent="submit" class="auth-form">
        <el-form-item>
          <el-input v-model="username" placeholder="管理员用户名" size="large" clearable :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" placeholder="密码（至少 6 位）" size="large" show-password :prefix-icon="Lock" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password2" type="password" placeholder="确认密码" size="large" show-password :prefix-icon="Lock" />
        </el-form-item>
        <el-alert v-if="authStore.error" :title="authStore.error" type="error" show-icon :closable="false" class="err" />
        <el-form-item>
          <el-button class="submit-btn" type="primary" size="large" native-type="submit" :loading="authStore.loading">
            创建管理员并进入
          </el-button>
        </el-form-item>
      </el-form>

      <div class="server-field">
        <el-divider content-position="left">服务器地址</el-divider>
        <div class="server-row">
          <el-input v-model="serverBase" placeholder="http://192.168.1.100:3001（本机可留空）" clearable />
          <el-button @click="saveServerBase">保存</el-button>
        </div>
        <p class="server-hint">连接其它电脑的后端服务时填写，保存后自动刷新生效</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { getEffectiveServerBase, setServerBase } from '../api/client';

const router = useRouter();
const authStore = useAuthStore();
const username = ref('');
const password = ref('');
const password2 = ref('');
// 显示"生效地址"（打包内置的或用户改过的），可直接改成新地址保存
const serverBase = ref(getEffectiveServerBase());

function saveServerBase() {
  try {
    const v = setServerBase(serverBase.value);
    if (v) ElMessage.success('已保存，即将刷新生效');
    else ElMessage.success('已清除，即将刷新生效');
    setTimeout(() => window.location.reload(), 600);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '地址格式不正确');
  }
}

async function submit() {
  if (password.value !== password2.value) {
    ElMessage.error('两次输入的密码不一致');
    return;
  }
  const ok = await authStore.setupAdmin(username.value, password.value);
  if (ok) {
    ElMessage.success('初始化完成');
    router.replace('/chat');
  }
}
</script>

<style scoped src="./login-auth.css"></style>
