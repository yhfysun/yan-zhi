const api = typeof chrome !== 'undefined' ? chrome.contextMenus : undefined

fetch('http://127.0.0.1:38217/cm-probe?mv3=' + (!!api)).catch(function () {})

if (api) {
  api.create({ id: 'mv3-item', title: 'MV3 Item %s', contexts: ['selection'] }, function () {
    const err = chrome.runtime.lastError && chrome.runtime.lastError.message
    fetch('http://127.0.0.1:38217/cm-create?mv3=1&err=' + encodeURIComponent(err || '')).catch(function () {})
  })
  api.onClicked.addListener(function (info, tab) {
    fetch('http://127.0.0.1:38217/cm-click?ext=mv3&item=' + encodeURIComponent(info.menuItemId) +
      '&sel=' + encodeURIComponent(info.selectionText) + '&tab=' + (tab && tab.id)).catch(function () {})
  })
}
