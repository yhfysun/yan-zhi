var api = typeof chrome !== 'undefined' ? chrome.contextMenus : undefined

fetch('http://127.0.0.1:38217/cm-probe?mv2=' + (!!api)).catch(function () {})

if (api) {
  api.create({ id: 'mv2-item', title: 'MV2 Item %s', contexts: ['selection'] })
  api.create({ id: 'mv2-parent', title: 'MV2 Parent' })
  api.create({ id: 'mv2-child', parentId: 'mv2-parent', title: 'MV2 Child' })
  api.onClicked.addListener(function (info, tab) {
    fetch('http://127.0.0.1:38217/cm-click?ext=mv2&item=' + encodeURIComponent(info.menuItemId) +
      '&sel=' + encodeURIComponent(info.selectionText) + '&tab=' + (tab && tab.id)).catch(function () {})
  })
}
