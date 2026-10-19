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

if (chrome.cookies) {
  chrome.cookies.getAll({ url: 'http://127.0.0.1:38217/' }, function (list) {
    const err = chrome.runtime.lastError && chrome.runtime.lastError.message
    fetch('http://127.0.0.1:38217/cm-apis?cookies=' + ((list && list.length) || 0) + '&err=' + encodeURIComponent(err || '')).catch(function () {})
  })
}

if (chrome.webNavigation) {
  chrome.webNavigation.onCompleted.addListener(function (details) {
    fetch('http://127.0.0.1:38217/cm-apis?nav=' + encodeURIComponent(details.url) + '&frame=' + details.frameId).catch(function () {})
  })
}

