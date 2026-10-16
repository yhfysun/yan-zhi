# fetch-text — 逐章抓正文

## 配方（一步到位，别自己试选择器）

> 2026-10-08 复盘实测：此前靠 `browser_get_visible_text` 取整页文本再按标题切，
> 实跑花了 **54 秒、15 次摸索调用**（`browser_run_script` 试选择器 8 次，还试过必然失败的 `:contains(...)`）。

```js
// ① 点章节（文本定位，比 :contains 稳；合成 click 无效时才改用坐标）
const item = [...document.querySelectorAll('.catalogue__item-text-Dcm6hj, [class*="catalogue__item-text"]')]
  .find((e) => (e.innerText || '').trim().startsWith('第3章'));
return item ? item.getBoundingClientRect() : null;   // 有坐标 → browser_click {x,y}
```

```js
// ② 读正文（等 .chapter-content-* 出现后再取；正文逐段在 p 里，无字体混淆）
const ps = [...document.querySelectorAll('#content.chapter p')].map((p) => p.innerText);
const title = (document.querySelector('[class*="chapter-title"]') || {}).innerText || '';
return JSON.stringify({ title, text: ps.join('\n') });
```

★ 兜底：若 `#content.chapter p` 取不到（类名漂移），退回 `[class*="chapter-content"] > div > p`；
再不行才用 `browser_get_visible_text`（会混入目录/按钮噪音，需自行切边界）。

## 链路

```
点目录项（文本定位 .catalogue__item-text-*）
 → 等 .chapter-content-* 出现
 → 取 div#content.chapter 的可见文本（一段一个 p）
 → 点「下一章」
 → 循环
```

## 步骤

1. 用**带全三参数**的 URL 打开书详情（见 index.md）
2. 点左侧目录第一个目标章节
3. 读右栏 `.chapter-content-* > div#content.chapter` 正文
4. 点 `.chapter-btn-group-* > button「下一章」`，重复 3
5. `file_write` 落盘 `<工作目录>/novel/<书名>/chNN.txt`

## 注意

- 点章节**没反应**时改用 x/y 坐标点击。
- 正文从「第N章」切到「下一章」即为换章成功；用 `.chapter-title-*` 复核当前章号。
- 整页 get_dom 会被 60+ 章目录吃掉节点配额 → 用 selector 定位容器或 maxNodes≥2500。
- 未解锁章（`.catalogue__item--disable-*`）点了没正文，别死磕。
