// 扩展右键菜单兼容层单测（P3）：match pattern / contexts / 菜单树 / 创建-更新-删除。
const { test, describe } = require('node:test')
const assert = require('node:assert')

const {
  createContextMenuShim,
  matchPatternToRegExp,
  urlMatchesPatterns,
  contextsMatch,
  sanitizeProps,
  buildTree,
  formatTitle,
  extensionIdFromUrl,
} = require('../extension-context-menus.cjs')

const PAGE = { pageURL: 'https://example.com/article', frameURL: 'https://example.com/article' }

describe('match pattern', () => {
  test('<all_urls> 覆盖 http/https/file/ftp', () => {
    const re = matchPatternToRegExp('<all_urls>')
    assert.ok(re.test('https://a.com/x'))
    assert.ok(re.test('http://a.com/x'))
    assert.ok(re.test('file:///tmp/x'))
    assert.ok(!re.test('chrome-extension://abc/x'))
  })

  test('通配子域与路径', () => {
    assert.ok(urlMatchesPatterns('https://example.com/a', ['*://*.example.com/*']))
    assert.ok(urlMatchesPatterns('https://sub.example.com/a/b', ['*://*.example.com/*']))
    assert.ok(!urlMatchesPatterns('https://notexample.com/a', ['*://*.example.com/*']))
    assert.ok(urlMatchesPatterns('https://example.com/foo/bar', ['https://example.com/foo/*']))
    assert.ok(!urlMatchesPatterns('https://example.com/other', ['https://example.com/foo/*']))
  })

  test('端口不参与匹配；非法模式不匹配', () => {
    assert.ok(urlMatchesPatterns('https://example.com:8443/a', ['https://example.com/*']))
    assert.ok(!urlMatchesPatterns('https://example.com/a', ['not-a-pattern']))
    assert.strictEqual(matchPatternToRegExp('not-a-pattern'), null)
  })

  test('空模式列表视为不限制', () => {
    assert.ok(urlMatchesPatterns('https://example.com/a', []))
    assert.ok(urlMatchesPatterns('', []))
  })
})

describe('contexts', () => {
  test('默认 page 命中普通页面', () => {
    assert.ok(contextsMatch(undefined, PAGE))
  })

  test('selection 只在有选中文本时命中', () => {
    assert.ok(!contextsMatch(['selection'], PAGE))
    assert.ok(contextsMatch(['selection'], { ...PAGE, selectionText: 'hi' }))
  })

  test('link / image / editable / all', () => {
    assert.ok(!contextsMatch(['link'], PAGE))
    assert.ok(contextsMatch(['link'], { ...PAGE, linkURL: 'https://example.com/x' }))
    assert.ok(contextsMatch(['image'], { ...PAGE, mediaType: 'image' }))
    assert.ok(contextsMatch(['editable'], { ...PAGE, isEditable: true }))
    assert.ok(contextsMatch(['all'], PAGE))
  })
})

describe('sanitizeProps', () => {
  test('缺省值', () => {
    const props = sanitizeProps({ title: 'Open' }, { requireTitle: true })
    assert.strictEqual(props.title, 'Open')
    assert.strictEqual(props.type, 'normal')
    assert.deepStrictEqual(props.contexts, ['page'])
    assert.strictEqual(props.enabled, true)
    assert.strictEqual(props.visible, true)
  })

  test('title 截断、非法 id 抛错、contexts 过滤', () => {
    const props = sanitizeProps({ title: 'x'.repeat(500), contexts: ['link', 'bogus'] })
    assert.strictEqual(props.title.length, 200)
    assert.deepStrictEqual(props.contexts, ['link'])
    assert.throws(() => sanitizeProps({ title: 'x', id: {} }), /id/)
  })

  test('separator 允许无 title', () => {
    const props = sanitizeProps({ type: 'separator' }, { requireTitle: true })
    assert.strictEqual(props.type, 'separator')
  })
})

describe('buildTree', () => {
  const item = (id, extra = {}) => ({
    id,
    rawId: id,
    parentId: null,
    title: id,
    type: 'normal',
    contexts: ['page'],
    documentUrlPatterns: [],
    targetUrlPatterns: [],
    enabled: true,
    visible: true,
    checked: false,
    order: Number(id) || 0,
    ...extra,
  })

  test('父子嵌套与顺序', () => {
    const tree = buildTree([item('1'), item('2', { parentId: '1' }), item('3')], PAGE, PAGE.pageURL)
    assert.strictEqual(tree.length, 2)
    assert.deepStrictEqual(tree[0].children.map((n) => n.item.id), ['2'])
  })

  test('父项不可见时子项隐藏', () => {
    const tree = buildTree([item('1', { visible: false }), item('2', { parentId: '1' })], PAGE, PAGE.pageURL)
    assert.strictEqual(tree.length, 0)
  })

  test('documentUrlPatterns 过滤', () => {
    const tree = buildTree([item('1', { documentUrlPatterns: ['https://other.com/*'] })], PAGE, PAGE.pageURL)
    assert.strictEqual(tree.length, 0)
  })

  test('targetUrlPatterns 只对有目标的右键生效', () => {
    const itemWithTarget = item('1', { targetUrlPatterns: ['https://example.com/*'] })
    assert.strictEqual(buildTree([itemWithTarget], PAGE, PAGE.pageURL).length, 0)
    const withLink = buildTree([itemWithTarget], { ...PAGE, linkURL: 'https://example.com/x' }, PAGE.pageURL)
    assert.strictEqual(withLink.length, 1)
  })
})

describe('formatTitle', () => {
  test('%s 替换选中文本；无选中则移除占位符', () => {
    assert.strictEqual(formatTitle('Search "%s"', { selectionText: ' hello ' }), 'Search "hello"')
    assert.strictEqual(formatTitle('Search "%s"', {}), 'Search ""')
    assert.strictEqual(formatTitle('Plain', { selectionText: 'x' }), 'Plain')
  })
})

describe('扩展身份', () => {
  test('只接受 chrome-extension:// URL', () => {
    assert.strictEqual(extensionIdFromUrl('chrome-extension://abc/'), 'abc')
    assert.strictEqual(extensionIdFromUrl('https://abc/'), null)
    assert.strictEqual(extensionIdFromUrl('nope'), null)
  })
})

describe('菜单注册表', () => {
  function makeShim () {
    return createContextMenuShim({ session: {} })
  }

  test('create 自动分配 id，父子菜单出现在同一棵树', () => {
    const shim = makeShim()
    const parent = shim.invoke('abc', 'create', [{ id: 'root', title: 'Root' }])
    shim.invoke('abc', 'create', [{ id: 'child', parentId: 'root', title: 'Child' }])
    assert.strictEqual(parent.id, 'root')
    const template = shim.buildTemplate(PAGE)
    assert.strictEqual(template.length, 1)
    assert.strictEqual(template[0].label, 'Root')
    assert.strictEqual(template[0].submenu.length, 1)
    assert.strictEqual(template[0].submenu[0].label, 'Child')
  })

  test('重复 id / 父项不存在抛错', () => {
    const shim = makeShim()
    shim.invoke('abc', 'create', [{ id: 'a', title: 'A' }])
    assert.throws(() => shim.invoke('abc', 'create', [{ id: 'a', title: 'B' }]), /重复/)
    assert.throws(() => shim.invoke('abc', 'create', [{ id: 'c', parentId: 'missing', title: 'C' }]), /父菜单项/)
  })

  test('update / remove / removeAll', () => {
    const shim = makeShim()
    shim.invoke('abc', 'create', [{ id: 'a', title: 'A' }])
    shim.invoke('abc', 'create', [{ id: 'b', parentId: 'a', title: 'B' }])
    shim.invoke('abc', 'update', ['a', { title: 'A2' }])
    assert.strictEqual(shim.buildTemplate(PAGE)[0].label, 'A2')
    shim.invoke('abc', 'remove', ['a'])
    assert.strictEqual(shim.buildTemplate(PAGE).length, 0, '删除父项应连带删除子项')
    shim.invoke('abc', 'create', [{ id: 'c', title: 'C' }])
    shim.invoke('abc', 'removeAll', [])
    assert.strictEqual(shim.buildTemplate(PAGE).length, 0)
  })

  test('多个扩展之间插入分隔符', () => {
    const shim = makeShim()
    shim.invoke('abc', 'create', [{ id: 'a', title: 'A' }])
    shim.invoke('def', 'create', [{ id: 'b', title: 'B' }])
    const template = shim.buildTemplate(PAGE)
    assert.deepStrictEqual(template.map((t) => t.type || t.label), ['A', 'separator', 'B'])
  })
})
