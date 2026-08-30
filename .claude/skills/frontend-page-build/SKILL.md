---
name: frontend-page-build
description: 前端页面开发。当用户要求"做个页面""写个前端页面""搭一个 XX 页""生成 Vue/React 页面"时触发。用 Vue3/React/原生 HTML+CSS+JS 生成响应式、组件化页面，含脚手架、路由、状态管理，支持 Element Plus/Ant Design/Tailwind。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 前端页面开发（frontend-page-build）

生成可运行的前端页面。按 Vue3 / React / 原生 三种技术栈，产出组件化、响应式、可路由的页面代码，配合 UI 框架与样式方案。

## 何时触发

- 用户说"做个页面""写个 XX 页""搭一个登录页/列表页/详情页""生成 Vue/React 页面"等
- 用户要快速搭一个前端界面原型
- 用户要为某功能补前端页面

## 标准流程

1. **确认技术栈**：Vue3 / React / 原生；UI 框架（Element Plus / Ant Design / Tailwind / 无）
2. **确认页面类型**：表单页 / 列表页 / 详情页 / 仪表盘 / 落地页
3. **生成结构**：HTML 模板 / 组件 / 路由 / 状态
4. **样式**：响应式 + 主题（暗色见 css-styling skill）
5. **可运行**：给出启动命令或单文件直接打开

## 脚手架

```bash
# Vue3 + Vite
npm create vite@latest my-app -- --template vue-ts
# React + Vite
npm create vite@latest my-app -- --template react-ts
# 加 UI 框架
npm i element-plus    # Vue3
npm i antd            # React
npm i -D tailwindcss  # 通用
```

## Vue3 页面模板（Composition API）

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
const list = ref([])
const router = useRouter()
async function load() {
  list.value = await fetch('/api/items').then(r => r.json())
}
onMounted(load)
</script>

<template>
  <div class="page">
    <h1>列表</h1>
    <ul>
      <li v-for="it in list" :key="it.id" @click="router.push(`/detail/${it.id}`)">
        {{ it.name }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page { padding: 16px; }
</style>
```

## React 页面模板

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ListPage() {
  const [list, setList] = useState([])
  const nav = useNavigate()
  useEffect(() => {
    fetch('/api/items').then(r => r.json()).then(setList)
  }, [])
  return (
    <div className="p-4">
      <h1>列表</h1>
      <ul>
        {list.map((it: any) => (
          <li key={it.id} onClick={() => nav(`/detail/${it.id}`)}>{it.name}</li>
        ))}
      </ul>
    </div>
  )
}
```

## 原生单文件页面（无构建，直接打开）

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>页面</title>
  <style>
    body { font-family: system-ui; margin: 0; padding: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  </style>
</head>
<body>
  <h1>列表</h1>
  <div class="grid" id="app"></div>
  <script>
    fetch('/api/items').then(r => r.json()).then(list => {
      app.innerHTML = list.map(it => `<div>${it.name}</div>`).join('')
    })
  </script>
</body>
</html>
```

## 常见页面套路

- **表单页**：表单布局 + 校验（见 form-interaction skill）+ 提交 loading + 成功/失败提示
- **列表页**：搜索栏 + 表格/卡片 + 分页 + 筛选 + 操作列
- **详情页**：面包屑 + 信息区 + Tab + 关联列表
- **仪表盘**：栅格布局 + 图表（见 data-visualization skill）+ 指标卡

## 注意事项

- 优先组件化：一个页面拆成多个小组件，便于复用与测试
- 响应式：移动优先，用 `minmax`/`auto-fill`/媒体查询适配
- 数据获取放 `onMounted`/`useEffect`，loading 与错误态都要处理
- 路由用 `vue-router`/`react-router`，别用 hash 跳转
- 状态跨组件共享用 Pinia/Context，别滥用全局变量
- 暗色主题、动画、性能优化分别见 css-styling / frontend-performance skill