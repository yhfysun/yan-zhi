<template>
  <div class="app-shell">
    <div class="bg-orbs">
      <div class="bg-orb orb-1"></div>
      <div class="bg-orb orb-2"></div>
      <div class="bg-orb orb-3"></div>
    </div>

    <template v-if="$route.name === 'login'">
      <main class="main-content full">
        <router-view />
      </main>
    </template>

    <template v-else>
      <SideNav />
      <main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="slide-fade" mode="out-in"><component :is="Component" /></transition>
        </router-view>
      </main>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from './stores/auth';
import SideNav from './components/SideNav.vue';

const authStore = useAuthStore();
authStore.loadUser();
</script>

<style>
:root {
  --glass-bg: rgba(255, 255, 255, 0.72);
  --glass-bg-hover: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(15, 23, 42, 0.08);
  --glass-border-strong: rgba(15, 23, 42, 0.12);
  --glass-blur: 16px;
  --glass-saturate: 180%;
  --glass-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  --color-primary: #7C3AED;
  --color-primary-light: #EDE9FE;
  --color-primary-dark: #5B21B6;
  --color-accent: #EC4899;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-bg: #f8fafc;
  --color-text: #1e293b;
  --color-text-secondary: #64748b;
  --gradient-primary: linear-gradient(135deg, #7C3AED, #EC4899);
  --orb-1-color: #7C3AED;
  --orb-2-color: #A78BFA;
  --orb-3-color: #EC4899;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
}

[data-theme="dark"] {
  --glass-bg: rgba(24, 26, 36, 0.78);
  --glass-bg-hover: rgba(36, 38, 50, 0.88);
  --glass-border: rgba(255, 255, 255, 0.07);
  --glass-border-strong: rgba(255, 255, 255, 0.11);
  --color-bg: #0f1117;
  --color-text: #e2e8f0;
  --color-text-secondary: #94a3b8;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--color-text);
  background: var(--color-bg);
  overflow: hidden;
}

* {
  transition: background-color 0.4s ease, border-color 0.4s ease, color 0.3s ease;
}

.app-shell { display: flex; height: 100vh; position: relative; overflow: hidden; }

.bg-orbs { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.bg-orb {
  position: absolute; border-radius: 50%; filter: blur(60px);
  opacity: 0.35; animation: float 20s ease-in-out infinite;
}
[data-theme="dark"] .bg-orb { opacity: 0.15; }

.orb-1 { width: 400px; height: 400px; background: var(--orb-1-color); top: -100px; left: -100px; }
.orb-2 { width: 350px; height: 350px; background: var(--orb-2-color); bottom: -80px; right: -80px; animation-delay: -7s; }
.orb-3 { width: 300px; height: 300px; background: var(--orb-3-color); top: 40%; left: 50%; animation-delay: -14s; }

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -30px) scale(1.05); }
  66% { transform: translate(-20px, 20px) scale(0.95); }
}

@media (prefers-reduced-motion: reduce) { .bg-orb { animation: none !important; } }

.main-content { flex: 1; overflow-y: auto; position: relative; z-index: 1; margin-left: 52px; }
.main-content.full { overflow: visible; margin-left: 0; }

.slide-fade-enter-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-fade-leave-active { transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-fade-enter-from { opacity: 0; transform: translateY(6px); }
.slide-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* Global Element Plus overrides */
.el-button { font-weight: 500; letter-spacing: 0.01em; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.el-button:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.el-button:active { transform: translateY(0); }
.el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger) {
  background: rgba(15,23,42,0.04); border-color: transparent;
}
.el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger):hover {
  background: rgba(15,23,42,0.08); border-color: rgba(15,23,42,0.1);
}
[data-theme="dark"] .el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger) {
  background: rgba(255,255,255,0.06);
}
[data-theme="dark"] .el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger):hover {
  background: rgba(255,255,255,0.1);
}

.el-button:focus-visible, .el-input__wrapper:focus-within, .el-select .el-input__wrapper:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Cards */
.glass-card {
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.glass-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
[data-theme="dark"] ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); }
[data-theme="dark"] ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

/* Skeleton shimmer */
.skeleton-shimmer {
  background: linear-gradient(90deg,
    var(--glass-border) 25%,
    var(--glass-bg-hover) 50%,
    var(--glass-border) 75%
  ) !important;
  background-size: 200% 100% !important;
  animation: shimmer 1.5s infinite !important;
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .dock-btn { background: rgba(255, 255, 255, 0.95); }
}
</style>
