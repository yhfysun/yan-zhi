// CodeMirror 6 断点栏：行号左侧可点击的红点栏 + 调试命中行高亮。
// 实现为自定义 gutter：StateField 存 RangeSet<GutterMarker>，通过 StateEffect 增删。
import { EditorView, gutter, GutterMarker, Decoration, type DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet, type Extension } from '@codemirror/state';

/** 真实断点（实心红点） */
class BreakpointMarker extends GutterMarker {
  toDOM() {
    const d = document.createElement('div');
    d.className = 'cm-bp-dot is-set';
    return d;
  }
}

/** 占位符：只用于撑开 gutter 宽度，不可见 */
class SpacerMarker extends GutterMarker {
  toDOM() {
    const d = document.createElement('div');
    d.className = 'cm-bp-dot';
    return d;
  }
}

const bpMarker = new BreakpointMarker();
const spacerMarker = new SpacerMarker();

/** 增删某个位置的断点；pos 为行首偏移 */
export const setBreakpointEffect = StateEffect.define<{ pos: number; on: boolean }>();

const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setBreakpointEffect)) continue;
      set = e.value.on
        ? set.update({ add: [bpMarker.range(e.value.pos)], sort: true })
        : set.update({ filter: (from) => from !== e.value.pos });
    }
    return set;
  },
});

/** 设置当前调试暂停行（1-based；0/null 表示清除） */
export const setActiveLineEffect = StateEffect.define<number | null>();

const activeLineDeco = Decoration.line({ class: 'cm-debug-active-line' });

const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setActiveLineEffect)) continue;
      const ln = e.value ?? 0;
      if (ln <= 0 || ln > tr.state.doc.lines) return Decoration.none;
      const line = tr.state.doc.line(ln);
      return Decoration.set([activeLineDeco.range(line.from)]);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface BreakpointGutterOptions {
  /** 点击 gutter 回调，参数为 1-based 行号 */
  onToggle: (line: number) => void;
}

export function breakpointGutter(opts: BreakpointGutterOptions): Extension {
  return [
    breakpointField,
    activeLineField,
    gutter({
      class: 'cm-bp-gutter',
      markers: (view) => view.state.field(breakpointField),
      initialSpacer: () => spacerMarker,
      domEventHandlers: {
        mousedown(view, line) {
          opts.onToggle(view.state.doc.lineAt(line.from).number);
          return true;
        },
      },
    }),
    EditorView.baseTheme({
      '.cm-bp-gutter': { width: '16px', minWidth: '16px' },
      '.cm-bp-dot': {
        width: '10px', height: '10px', margin: '5px 2px',
        borderRadius: '50%', background: 'transparent',
        transition: 'background 0.12s ease',
      },
      '.cm-gutterElement:hover .cm-bp-dot:not(.is-set)': {
        background: 'color-mix(in srgb, #e53935 30%, transparent)',
      },
      '.cm-bp-dot.is-set': {
        background: '#e53935',
      },
      '.cm-debug-active-line': {
        backgroundColor: 'color-mix(in srgb, #f59e0b 22%, transparent)',
      },
      '.cm-debug-active-line.cm-line': {
        boxShadow: 'inset 3px 0 0 #f59e0b',
      },
    }),
  ];
}

/** 把断点行号数组 diff 成 StateEffect 序列并应用到视图 */
export function syncBreakpoints(view: EditorView, lines: number[]) {
  const wanted = new Set(lines.filter((n) => n > 0));
  const existing = new Set<number>();
  const cursor = view.state.field(breakpointField).iter();
  while (cursor.value) {
    if (cursor.value) existing.add(view.state.doc.lineAt(cursor.from).number);
    cursor.next();
  }
  const effects: StateEffect<{ pos: number; on: boolean }>[] = [];
  for (const ln of wanted) {
    if (!existing.has(ln) && ln <= view.state.doc.lines) {
      effects.push(setBreakpointEffect.of({ pos: view.state.doc.line(ln).from, on: true }));
    }
  }
  for (const ln of existing) {
    if (!wanted.has(ln)) {
      effects.push(setBreakpointEffect.of({ pos: view.state.doc.line(ln).from, on: false }));
    }
  }
  if (effects.length) view.dispatch({ effects });
}

/** 设置 / 清除调试命中行 */
export function setActiveLine(view: EditorView, line: number | null) {
  view.dispatch({ effects: setActiveLineEffect.of(line) });
}
