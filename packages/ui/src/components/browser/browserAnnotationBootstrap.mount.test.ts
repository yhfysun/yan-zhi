// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function annotationBootstrap(): (config?: Record<string, unknown>) => any {
  const file = path.resolve(process.cwd(), '../../apps/desktop/main.cjs');
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('function yzAnnotationBootstrap(config)');
  expect(start).toBeGreaterThanOrEqual(0);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  expect(end).toBeGreaterThan(braceStart);
  return new Function(`return ${source.slice(start, end).replace(/^function yzAnnotationBootstrap\(config\)/, 'function (config)')}`)();
}

afterEach(() => {
  try { (window as any).__yzAnnotation?.teardown?.(); } catch { /* ignore */ }
  document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('Codex-style browser annotation bootstrap', () => {
  it('captures semantic target ids and exposes mode/suspend/focus controls', () => {
    document.body.innerHTML = `
      <article data-yz-annotate-id="lesson-card" data-yz-annotate-label="课程卡">
        <button id="start">开始本节</button>
      </article>
    `;
    const button = document.getElementById('start') as HTMLButtonElement;
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [button],
    });

    const boot = annotationBootstrap();
    boot({ mode: 'element', items: [] });
    expect((window as any).__yzAnnotation.getMode()).toBe('element');

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 2, clientY: 2 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 2, clientY: 2 }));
    const host = document.getElementById('__yz_annotation_host') as HTMLElement;
    const textarea = host.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = '按钮文案需要改';
    const save = host.shadowRoot?.querySelector('[data-act="save"]') as HTMLButtonElement;
    save.click();

    const items = (window as any).__yzAnnotation.take();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'element',
      label: '课程卡',
      comment: '按钮文案需要改',
    });
    expect(items[0].anchor.targetId).toBe('lesson-card');
    expect(items[0].anchor.selector).toContain('data-yz-annotate-id');

    expect((window as any).__yzAnnotation.setMode('text').mode).toBe('text');
    expect((window as any).__yzAnnotation.suspend()).toBe(true);
    expect((window as any).__yzAnnotation.resume()).toBe(true);
  });

  it('restores a saved annotation by selector', () => {
    document.body.innerHTML = '<section><p id="target">位置、速度与加速度</p></section>';
    const boot = annotationBootstrap();
    const saved = {
      id: 'saved-1',
      type: 'text',
      label: '文本「位置、速度与加速度」',
      comment: '这里需要补图',
      pageUrl: location.href,
      createdAt: 1,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      anchor: {
        selector: '#target',
        rect: { x: 0, y: 0, w: 10, h: 10 },
      },
    };
    const result = boot({ mode: 'text', items: [saved] });
    expect(result).toMatchObject({ ok: true, version: 2, mode: 'text', restored: 1 });
    expect((window as any).__yzAnnotation.focus(saved).ok).toBe(true);
  });

  it('captures selected text with quote, offsets and surrounding context', async () => {
    document.body.innerHTML = '<article><p id="copy">本节学习位置、速度与加速度三个概念。</p></article>';
    const textNode = document.getElementById('copy')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 4);
    range.setEnd(textNode, 13);
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [{ width: 100, height: 20, left: 10, top: 20, right: 110, bottom: 40 }],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 100, height: 20, left: 10, top: 20, right: 110, bottom: 40 }),
    });
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const boot = annotationBootstrap();
    boot({ mode: 'text', items: [] });
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 20 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const host = document.getElementById('__yz_annotation_host') as HTMLElement;
    const textarea = host.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = '这段需要拆成两步';
    (host.shadowRoot?.querySelector('[data-act="save"]') as HTMLButtonElement).click();

    const items = (window as any).__yzAnnotation.take();
    expect(items[0]).toMatchObject({
      type: 'text',
      comment: '这段需要拆成两步',
      anchor: {
        text: {
          quote: '位置、速度与加速度',
          start: 4,
          end: 13,
        },
      },
    });
    expect(items[0].anchor.text.prefix).toContain('本节学习');
    expect(items[0].anchor.text.suffix).toContain('三个概念');
  });
});
