// @vitest-environment jsdom
/**
 * MarkdownPreview 受控内联音频卡测试（docs/音乐双方向重构方案-2026-11-15.md §3.5 P1）。
 *
 * 为什么值得测：v-html 面 + 自定义 block 规则是 XSS 收口区 —— 语法必须只对本地
 * /api/generated/audios/ 相对路径渲染 <audio>，外链/script/data: 一律原样文本；
 * html:false 契约保持，普通 Markdown 渲染零影响。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import MarkdownPreview from './MarkdownPreview.vue'

function render(content: string): string {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app: App = createApp({ setup: () => () => h(MarkdownPreview, { content }) })
  app.mount(el)
  const html = el.querySelector('.md-preview')?.innerHTML ?? ''
  app.unmount()
  el.remove()
  return html
}

afterEach(() => { document.body.innerHTML = '' })

describe('受控内联音频 {{audio url 标题}}', () => {
  it('★ 本地 /api/generated/audios/ 相对路径 → 渲染 audio 元素 + 标题', () => {
    const html = render('{{audio /api/generated/audios/x-1.m4a 试听整曲}}')
    expect(html).toContain('<audio controls')
    expect(html).toContain('src="/api/generated/audios/x-1.m4a"')
    expect(html).toContain('试听整曲')
    expect(html).toContain('md-audio-card')
  })

  it('★ 非白名单 url（外链 / script: / data:）→ 原样文本，绝不渲染 audio', () => {
    for (const url of ['https://evil.com/a.mp3', 'javascript:alert(1)', 'data:audio/mp3;base64,xxx', '/api/notes/secret']) {
      const html = render(`{{audio ${url}}}`)
      expect(html, url).not.toContain('<audio')
      expect(html, url).toContain('{{audio')
    }
  })

  it('★ 非独占一行 / 普通内容不受影响（html:false 契约保持）', () => {
    const html = render('前缀 {{audio /api/generated/audios/x.m4a}} 不独占一行\n\n普通 **加粗**')
    expect(html).not.toContain('<audio')
    expect(html).toContain('<strong>')
    expect(html).toContain('前缀')
  })
})
