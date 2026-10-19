const keys = chrome.scripting
  ? Object.keys(chrome.scripting).filter(function (key) { return typeof chrome.scripting[key] === 'function' })
  : []
fetch('http://127.0.0.1:38217/cm-scripting?mv3=' + encodeURIComponent(JSON.stringify({
  scripting: typeof chrome.scripting,
  keys: keys,
  tabsExecuteScript: typeof chrome.tabs.executeScript,
}))).catch(function () {})

if (chrome.scripting && chrome.tabs) {
  chrome.tabs.query({}, function (tabs) {
    ;(tabs || []).forEach(function (tab) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function () { return location.href },
      }, function (results) {
        const err = chrome.runtime.lastError && chrome.runtime.lastError.message
        fetch('http://127.0.0.1:38217/cm-scripting-run?tab=' + tab.id +
          '&err=' + encodeURIComponent(err || '') + '&n=' + ((results && results.length) || 0)).catch(function () {})
      })
    })
  })
}
