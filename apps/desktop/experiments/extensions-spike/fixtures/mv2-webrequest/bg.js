chrome.webRequest.onBeforeRequest.addListener(
  function () {
    fetch('http://127.0.0.1:38217/ping-webrequest-block').catch(function () {})
    return { cancel: true }
  },
  { urls: ['http://127.0.0.1/blocked.js*'] },
  ['blocking']
)
