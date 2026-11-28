/**
 * 移动端文件链路回归：
 *  - 工作目录弹窗不能被 560px 固定宽度挤出手机视口；
 *  - 点击工作目录后必须能选到手机预设；
 *  - 图片预览优先走内嵌后端 HTTP 文件流，原生文件读取只作兜底；
 *  - 从工具结果打开文件时把 conversationId 带进预览 tab。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { firstLocalPath } from '../utils/file-open';

const ROOT = resolve(__dirname, '..');
const REPO = resolve(ROOT, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const WORKSPACE = read('components/WorkspaceDirDialog.vue');
const PREVIEW = read('components/FilePreview.vue');
const USE_CHAT = read('composables/chat/useChat.ts');
const INPUT = read('components/chat/ChatInputArea.vue');
const CHAT_CSS = read('views/chat.css');
const MOBILE_PLATFORM = readRepo('apps/mobile/src/platform.ts');

describe('移动端工作目录选择', () => {
  it('弹窗宽度按平台自适应，不再固定 560px', () => {
    expect(WORKSPACE).toMatch(/dialogWidth/);
    expect(WORKSPACE).toMatch(/:width="dialogWidth"/);
    expect(WORKSPACE).toMatch(/isMobile \?/);
  });

  it('手机端先申请真实文件访问权限，再复用桌面目录树', () => {
    expect(WORKSPACE).toMatch(/storageAccess/);
    expect(WORKSPACE).toMatch(/requestStoragePermission/);
    expect(WORKSPACE).toMatch(/canBrowse = computed/);
    expect(WORKSPACE).toMatch(/已获得文件访问权限/);
    expect(WORKSPACE).toMatch(/@click="isMobile \? navigateTo\(entry\) : selectEntry\(entry\)"/);
  });

  it('+ 菜单点击工作目录会打开弹窗', () => {
    expect(INPUT).toMatch(/showWorkspaceDir\s*=\s*true/);
  });

  it('移动端选完目录不自动弹 Git 宽屏面板遮挡页面', () => {
    const start = USE_CHAT.indexOf('async function onWorkspaceDirSelected');
    const body = USE_CHAT.slice(start, USE_CHAT.indexOf('async function clearWorkspaceDir', start));
    expect(body).toMatch(/getPlatformAdapter\(\)\.platform === 'mobile'\) return;/);
    expect(body.indexOf("platform === 'mobile'")).toBeLessThan(body.indexOf('useGitStore()'));
  });
});

describe('移动端打开文件', () => {
  it('图片预览优先走 HTTP 文件流，并保留原生读取兜底', () => {
    expect(PREVIEW).toMatch(/async function resolveMediaUrl/);
    expect(PREVIEW).toMatch(/adapter\.platform === 'mobile'/);
    expect(PREVIEW).toMatch(/const httpUrl = adapter\.platform === 'mobile' \? await resolveMediaUrl\(\) : null;[\s\S]{0,240}imageSrc\.value = httpUrl/);
    expect(PREVIEW).toMatch(/async function onImageLoadError/);
    expect(PREVIEW).toMatch(/readFileWithFallback\(adapter\)/);
  });

  it('打开工具结果/交付文件时把 conversationId 带到预览 tab', () => {
    expect(USE_CHAT).toMatch(/store\.openTab\(\{\s*kind: 'file',[\s\S]{0,160}conversationId:/);
  });

  it('上传入口仍使用原生 file input（移动端浏览器支持）', () => {
    expect(INPUT).toMatch(/type="file"/);
    expect(INPUT).toMatch(/@change="handleFileChange"/);
  });

  it('Capacitor 文件适配器实现 stat / 结构化目录，目录不会误当文件打开', () => {
    expect(MOBILE_PLATFORM).toMatch(/async stat\(path: string\)/);
    expect(MOBILE_PLATFORM).toMatch(/async listDirEntries\(path: string\)/);
    expect(MOBILE_PLATFORM).toMatch(/isDir:\s*String\(\(info as any\)\.type/);
  });

  it('Android 原生插件声明 All files access 并在 MainActivity 注册', () => {
    const JAVA = readRepo('apps/mobile/native/android-storage/YzStoragePlugin.java');
    const WRAPPER = readRepo('apps/mobile/src/storage-access.ts');
    const MANIFEST = readRepo('apps/mobile/android/app/src/main/AndroidManifest.xml');
    const ACTIVITY = readRepo('apps/mobile/android/app/src/main/java/com/yanzhi/mobile/MainActivity.java');
    expect(JAVA).toMatch(/MANAGE_APP_ALL_FILES_ACCESS_PERMISSION/);
    expect(JAVA).toMatch(/isExternalStorageManager/);
    expect(WRAPPER).toMatch(/registerPlugin<YzStoragePlugin>\('YzStorage'\)/);
    expect(MANIFEST).toMatch(/MANAGE_EXTERNAL_STORAGE/);
    expect(ACTIVITY).toMatch(
      /safeRegisterPlugin\("com\.yanzhi\.mobile\.storage\.YzStoragePlugin", "YzStoragePlugin"\)/,
    );
  });
});

describe('移动端 + 菜单触屏交互', () => {
  it('技能 / 模式 / 工具权限在移动端使用可关闭的底部子面板', () => {
    expect(INPUT).toMatch(/class="plus-sub-layer"/);
    expect(INPUT).toMatch(/class="plus-sub-mobile-head"/);
    expect(INPUT).toMatch(/plus-sub-mobile-close/);
    expect(INPUT).toMatch(/:style="isMobileShell \? undefined : \{ top: subTop \+ 'px', left: subLeft \+ 'px' \}"/);
    expect(INPUT).toMatch(/function openSubHover[\s\S]{0,180}if \(isMobileShell\.value\) return;/);
    expect(INPUT).toMatch(/function scheduleCloseSub\(\) \{\s*if \(isMobileShell\.value\) return;/);
    expect(INPUT).toMatch(/@mouseenter="openSubHover\('skills', \$event\)"/);
    expect(INPUT).toMatch(/@click="onSubLayerClick"/);
    expect(INPUT).toMatch(/function onSubLayerClick[\s\S]{0,260}evt\.stopPropagation\(\)/);
    expect(INPUT).toMatch(/aria-label="关闭子菜单" @click\.stop="closeSubNow"/);
  });

  it('模式设置支持整行触屏点选，并保留开关本身', () => {
    expect(INPUT).toMatch(/@click="store\.thinkingMode = !store\.thinkingMode"/);
    expect(INPUT).toMatch(/@click="store\.planMode = !store\.planMode"/);
    expect(INPUT).toMatch(/@click="store\.answerOnly = !store\.answerOnly"/);
    expect(INPUT).toMatch(/@click="store\.goalMode = !store\.goalMode"/);
    expect(INPUT).toMatch(/<el-switch v-model="store\.thinkingMode"/);
  });

  it('移动端子面板项达到 52px 触控高度并适配底部安全区', () => {
    expect(CHAT_CSS).toMatch(/\.plus-sub-layer\.is-mobile/);
    expect(CHAT_CSS).toMatch(/\.plus-menu-sub\.is-mobile-sub \.plus-menu-item[\s\S]{0,120}min-height: 52px/);
    expect(CHAT_CSS).toMatch(/env\(safe-area-inset-bottom/);
    expect(CHAT_CSS).toMatch(/\.plus-sub-mobile-close[\s\S]{0,160}width: 48px;[\s\S]{0,40}height: 48px;/);
  });
});

describe('移动端任务运行中输入区密度', () => {
  it('运行时隐藏重复智能体栏，并保持停止按钮触控高度', () => {
    expect(INPUT).toMatch(/'is-mobile-running': isMobileShell && store\.streaming/);
    expect(CHAT_CSS).toMatch(/\.input-area\.is-mobile-running \.input-agent-bar\s*\{[^}]*display: none;/);
    expect(CHAT_CSS).toMatch(/\.input-area\.is-mobile-running \.run-indicator\s*\{[^}]*min-height: 44px;/);
    expect(CHAT_CSS).toMatch(/\.input-area\.is-mobile-running \.run-stop-btn|\.goal-action-btn,\s*\.run-stop-btn\s*\{[^}]*min-height: 44px;/);
  });

  it('运行时输入框最多按两行展开，工具条同步收紧', () => {
    expect(CHAT_CSS).toMatch(/\.input-area\.is-mobile-running \.input-textarea\.is-expanded \.el-textarea__inner\s*\{[^}]*1\.6em \* 2/);
    expect(CHAT_CSS).toMatch(/\.input-area\.is-mobile-running \.input-toolbar\s*\{[^}]*min-height: 48px/);
  });
});

describe('远程媒体结果打开分流', () => {
  it('HTTP 图片地址不会被误识别成 Windows 本地路径', () => {
    const remote = JSON.stringify({
      ok: true,
      type: 'image',
      url: 'https://platform-outputs.agnes-ai.space/images/t2i/task/output_abc.png',
      file: null,
    });
    expect(firstLocalPath(remote)).toBeNull();
  });

  it('真正的本机 file 字段仍能打开', () => {
    const local = JSON.stringify({
      ok: true,
      type: 'image',
      file: '/data/user/0/com.yanzhi.mobile/files/.yan-zhi/tasks/c1/deliverables/image.png',
    });
    expect(firstLocalPath(local)).toBe('/data/user/0/com.yanzhi.mobile/files/.yan-zhi/tasks/c1/deliverables/image.png');
  });
});

describe('移动端右侧预览抽屉', () => {
  it('使用不透明纸面背景，不能把正文透到空态按钮下面', () => {
    expect(CHAT_CSS).toMatch(
      /\.right-panel\s*\{[\s\S]{0,700}background-color: var\(--el-bg-color-overlay, var\(--color-bg\)\) !important;/,
    );
    expect(CHAT_CSS).toMatch(
      /\.right-panel\s*\{[\s\S]{0,800}backdrop-filter: none !important;/,
    );
  });
});
