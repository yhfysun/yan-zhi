const caps = {
  action: typeof chrome.action,
  browserAction: typeof chrome.browserAction,
}
fetch('http://127.0.0.1:38217/cm-action?mv3=' + encodeURIComponent(JSON.stringify(caps))).catch(function () {})

if (chrome.action) {
  chrome.action.setTitle({ title: 'MV3 Action Title' })
  chrome.action.setBadgeText({ text: '7' })
  chrome.action.setBadgeBackgroundColor({ color: [0, 128, 0, 255] })
  chrome.action.onClicked.addListener(function (tab) {
    fetch('http://127.0.0.1:38217/cm-action-click?mv3=1&tab=' + (tab && tab.id)).catch(function () {})
  })
}
