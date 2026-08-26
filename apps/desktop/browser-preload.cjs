const { ipcRenderer, webFrame } = require('electron');

function buildScrollbarCss(theme) {
  const dark = theme === 'dark';
  const thumb = dark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.18)';
  const thumbHover = dark ? 'rgba(255,255,255,0.36)' : 'rgba(15,23,42,0.32)';
  const thumbActive = dark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.45)';
  return `
    ::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
    ::-webkit-scrollbar-track { background: transparent !important; }
    ::-webkit-scrollbar-thumb { background: ${thumb} !important; border: none !important; border-radius: 999px !important; }
    ::-webkit-scrollbar-thumb:hover { background: ${thumbHover} !important; }
    ::-webkit-scrollbar-thumb:active { background: ${thumbActive} !important; }
    ::-webkit-scrollbar-corner { background: transparent !important; }
  `;
}

let appliedTheme = null;

function applyTheme(theme) {
  if (!theme || theme === appliedTheme) return;
  appliedTheme = theme;
  try {
    webFrame.insertCSS(buildScrollbarCss(theme));
  } catch (err) {
    console.warn('[browser] preload scrollbar insertCSS failed:', err);
  }
}

// 在 document-start 阶段同步读取主进程当前主题并立即注入，避免原生滚动条先出现。
let initialTheme = 'light';
try {
  initialTheme = ipcRenderer.sendSync('browserView:getTheme') || 'light';
} catch (err) {
  console.warn('[browser] preload getTheme failed:', err);
}

applyTheme(initialTheme);

ipcRenderer.on('browser-view:scrollbar-theme', (_event, theme) => {
  applyTheme(theme);
});
