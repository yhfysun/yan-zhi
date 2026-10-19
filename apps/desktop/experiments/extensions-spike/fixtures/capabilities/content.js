const caps = { mv: 3 }
for (const name of ['tabs', 'action', 'runtime', 'storage', 'i18n', 'scripting']) {
  caps[name] = typeof chrome[name] !== 'undefined'
}
caps.runtimeSendMessage = !!(chrome.runtime && chrome.runtime.sendMessage)
caps.runtimeOnMessage = !!(chrome.runtime && chrome.runtime.onMessage)
caps.tabsMethodKeys = chrome.tabs ? Object.keys(chrome.tabs).filter((key) => typeof chrome.tabs[key] === 'function') : []
fetch('http://127.0.0.1:38217/cap?content=' + encodeURIComponent(JSON.stringify(caps))).catch(function () {})
