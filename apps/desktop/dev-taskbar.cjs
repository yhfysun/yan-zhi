const fs = require('node:fs');
const path = require('node:path');

const DEV_APP_USER_MODEL_ID = 'com.yanzhi.desktop.dev';
const DEV_SHORTCUT_NAME = '言智 Dev.lnk';
const LEGACY_SHORTCUT_NAME = 'Electron.lnk';

/**
 * Windows resolves taskbar icons through AppUserModelID and the matching Start
 * Menu shortcut. A dev shortcut left on electron.exe keeps showing Electron's
 * atom even after BrowserWindow#setIcon succeeds, so keep that shell identity
 * pointed at the approved runtime ICO.
 */
function ensureDevTaskbarShortcut({
  shell,
  electronPath,
  appPath,
  iconPath,
  appData = process.env.APPDATA,
  fsImpl = fs,
}) {
  if (!appData) throw new Error('APPDATA is unavailable');
  const programsDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const shortcutPath = path.join(programsDir, DEV_SHORTCUT_NAME);
  const legacyPath = path.join(programsDir, LEGACY_SHORTCUT_NAME);

  const shortcutOptions = {
    target: electronPath,
    cwd: appPath,
    args: `"${appPath}" --dev`,
    description: '言智 Dev',
    icon: iconPath,
    iconIndex: 0,
    appUserModelId: DEV_APP_USER_MODEL_ID,
  };

  // Prefer the shortcut Windows already uses for this electron.exe identity.
  // Replacing it with a new shortcut path can leave the live taskbar group on
  // a generic document icon until Explorer rebuilds its grouping state.
  const candidates = [legacyPath, shortcutPath];
  for (const candidate of candidates) {
    const operation = fsImpl.existsSync(candidate) ? 'update' : 'create';
    if (!shell.writeShortcutLink(candidate, operation, shortcutOptions)) continue;
    return { shortcutPath: candidate };
  }

  throw new Error(`failed to write ${shortcutPath} or ${legacyPath}`);
}

module.exports = {
  DEV_APP_USER_MODEL_ID,
  ensureDevTaskbarShortcut,
};
