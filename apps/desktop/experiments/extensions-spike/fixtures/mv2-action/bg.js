var caps = {
  action: typeof chrome.action,
  browserAction: typeof chrome.browserAction,
}
fetch('http://127.0.0.1:38217/cm-action?mv2=' + encodeURIComponent(JSON.stringify(caps))).catch(function () {})

if (chrome.browserAction) {
  chrome.browserAction.setTitle({ title: 'MV2 Action Title' })
  chrome.browserAction.setBadgeText({ text: '3' })
  chrome.browserAction.onClicked.addListener(function (tab) {
    fetch('http://127.0.0.1:38217/cm-action-click?mv2=1&tab=' + (tab && tab.id)).catch(function () {})
  })
}
