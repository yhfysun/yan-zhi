const names = ['tabs', 'action', 'browserAction', 'cookies', 'webNavigation', 'notifications', 'commands', 'permissions', 'windows', 'runtime', 'storage', 'i18n', 'scripting']
const caps = { mv: 3 }
for (const name of names) caps[name] = typeof chrome[name] !== 'undefined'
if (chrome.tabs) {
  caps.tabsMethods = Object.keys(chrome.tabs).filter((key) => typeof chrome.tabs[key] === 'function')
}
if (chrome.action) {
  caps.actionMethods = Object.keys(chrome.action).filter((key) => typeof chrome.action[key] === 'function')
}
fetch('http://127.0.0.1:38217/cap?sw=' + encodeURIComponent(JSON.stringify(caps))).catch(function () {})
