const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  DEV_APP_USER_MODEL_ID,
  ensureDevTaskbarShortcut,
} = require('../dev-taskbar.cjs');

test('dev taskbar shortcut uses the approved icon and AUMID', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-dev-taskbar-'));
  const electronPath = path.join(appData, 'electron.exe');
  const appPath = path.join(appData, 'apps', 'desktop');
  const iconPath = path.join(appData, 'icons', 'icon-dev.bmp.ico');
  const programsDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  fs.mkdirSync(programsDir, { recursive: true });

  let written = null;
  const shell = {
    writeShortcutLink(shortcutPath, operation, options) {
      written = { shortcutPath, operation, options };
      return true;
    },
    readShortcutLink() {
      throw new Error('not found');
    },
  };

  const result = ensureDevTaskbarShortcut({
    shell,
    electronPath,
    appPath,
    iconPath,
    appData,
  });

  assert.equal(result.shortcutPath, path.join(programsDir, 'Electron.lnk'));
  assert.equal(written.operation, 'create');
  assert.equal(written.options.target, electronPath);
  assert.equal(written.options.cwd, appPath);
  assert.equal(written.options.args, `"${appPath}" --dev`);
  assert.equal(written.options.icon, iconPath);
  assert.equal(written.options.appUserModelId, DEV_APP_USER_MODEL_ID);
  fs.rmSync(appData, { recursive: true, force: true });
});

test('dev taskbar shortcut updates the existing Electron identity in place', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-dev-taskbar-legacy-'));
  const electronPath = path.join(appData, 'electron.exe');
  const appPath = path.join(appData, 'apps', 'desktop');
  const iconPath = path.join(appData, 'icons', 'icon-dev.bmp.ico');
  const programsDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const legacyPath = path.join(programsDir, 'Electron.lnk');
  fs.mkdirSync(programsDir, { recursive: true });
  fs.writeFileSync(legacyPath, 'legacy');

  const shell = {
    writeShortcutLink(shortcutPath, operation) {
      return shortcutPath === legacyPath && operation === 'update';
    },
    readShortcutLink() {
      return true;
    },
  };

  const result = ensureDevTaskbarShortcut({
    shell,
    electronPath,
    appPath,
    iconPath,
    appData,
  });

  assert.equal(result.shortcutPath, legacyPath);
  fs.rmSync(appData, { recursive: true, force: true });
});

test('dev taskbar shortcut falls back to the named shortcut when the legacy path cannot be written', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-dev-taskbar-fallback-'));
  const electronPath = path.join(appData, 'electron.exe');
  const appPath = path.join(appData, 'apps', 'desktop');
  const iconPath = path.join(appData, 'icons', 'icon-dev.bmp.ico');
  const programsDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  fs.mkdirSync(programsDir, { recursive: true });

  const shell = {
    writeShortcutLink(shortcutPath) {
      return shortcutPath.endsWith('言智 Dev.lnk');
    },
    readShortcutLink() {
      throw new Error('not found');
    },
  };

  const result = ensureDevTaskbarShortcut({
    shell,
    electronPath,
    appPath,
    iconPath,
    appData,
  });

  assert.equal(result.shortcutPath, path.join(programsDir, '言智 Dev.lnk'));
  fs.rmSync(appData, { recursive: true, force: true });
});
