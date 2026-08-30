---
name: frontend-performance
description: 前端性能优化。当用户要求"优化性能""页面太慢""首屏优化""打包体积太大""跑分""Web Vitals"时触发。覆盖打包体积、懒加载、渲染性能、Web Vitals（LCP/CLS/INP），用 Lighthouse 跑分并给优化建议。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 前端性能优化（frontend-performance）

前端性能分析与优化。打包体积、懒加载、渲染性能、Web Vitals 指标，用 Lighthouse/打包分析定位瓶颈并给可执行优化。

## 何时触发

- 用户说"优化性能""页面太慢""首屏慢""打包太大""跑分""Web Vitals""卡顿"等
- 用户要提升 Lighthouse 分数
- 用户要减小体积、加快首屏

## 标准流程

1. **测量**：Lighthouse 跑分 + 打包分析 + Web Vitals
2. **定位瓶颈**：体积/请求数/阻塞/长任务
3. **对症优化**：按下方手法逐项处理
4. **复测对比**：优化后再跑分，确认改善

## 测量

### Lighthouse
```bash
npx lighthouse https://app.example --view --output html --output-path report.html
# 只跑性能
npx lighthouse <url> --only-categories=performance --view
```
关键指标：
- **LCP**（最大内容绘制）< 2.5s
- **CLS**（累积布局偏移）< 0.1
- **INP**（交互到下一帧）< 200ms
- **FCP**（首次内容绘制）< 1.8s
- **TTFB**（首字节时间）< 800ms

### 打包体积分析
```bash
# Vite
npx vite-bundle-visualizer
# Webpack
npx webpack --profile --json > stats.json && npx webpack-bundle-analyzer stats.json
# esbuild
npx esbuild-visualizer
```

### Web Vitals（运行时采集）
```ts
import { onLCP, onCLS, onINP, onFCP, onTTFB } from 'web-vitals'
onLCP(console.log); onCLS(console.log); onINP(console.log)
```

## 优化手法

### 1. 减小体积
- 按需引入：`import { Button } from 'ant-design-vue'` 而非整包
- 代码分割：路由懒加载 `() => import('./Page.vue')`
- 压缩：开启 gzip/brotli（`vite-plugin-compression`）
- 树摇：用 ESM，避免副作用 import
- 大依赖替换：moment→dayjs、lodash→lodash-es 按需

### 2. 加快首屏
- 路由懒加载 + 预拉取关键路由
- 关键资源 `<link rel="preload">`
- 图片懒加载 `loading="lazy"` + 正确尺寸属性避免 CLS
- SSR/SSG 首屏直出（Nuxt/Next）
- CDN 静态资源 + 长缓存

### 3. 渲染性能
- 长列表虚拟滚动（`vue-virtual-scroller`/`react-window`）
- 防抖节流高频事件（scroll/resize/input）
- `v-once`/`React.memo` 跳过静态子树
- 大列表用 key 稳定，避免重排
- 计算属性缓存，避免模板里重算
- 优先 transform/opacity 动画（GPU 合成层）

### 4. 网络与请求
- 合并小请求、拆分关键与非关键
- HTTP/2 多路复用
- 接口缓存（stale-while-revalidate）
- 图片用 WebP/AVIF + 响应式 srcset

### 5. 阻塞消除
- 非关键 JS 加 `defer`/`async`
- CSS 关键内联，非关键异步加载
- 字体 `font-display: swap`

## 优化清单（对照查）

- [ ] 路由懒加载
- [ ] 第三方按需引入
- [ ] 图片懒加载 + WebP + 尺寸属性
- [ ] gzip/brotli 压缩
- [ ] 长列表虚拟滚动
- [ ] 高频事件防抖节流
- [ ] 静态资源 CDN + 长缓存
- [ ] 关键 CSS 内联
- [ ] 字体 swap
- [ ] LCP/CLS/INP 达标

## 注意事项

- **先测量再优化**：凭感觉优化常优化错地方
- 一次只改一项，复测对比，确认哪项有效
- 体积优化优先做按需引入和代码分割，收益最大
- CLS 多由图片/字体/广告无尺寸导致，给固定尺寸即可
- INP 多由长任务阻塞，拆任务、让出主线程（`requestIdleCallback`/`scheduler.yield`）
- 移动端注意低端机型，别只看本机跑分