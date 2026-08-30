---
name: form-interaction
description: 表单与交互。当用户要求"写表单""加校验""做个弹窗""拖拽""虚拟列表""动画交互"时触发。覆盖表单校验、弹窗/抽屉、拖拽、虚拟列表、动画交互，含 Element Plus/Ant Design 模式。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 表单与交互（form-interaction）

表单与常见交互实现：校验、弹窗/抽屉/消息、拖拽、虚拟列表、动画交互。给 Vue3/React 两套写法与 UI 框架模式。

## 何时触发

- 用户说"写表单""加校验""做个弹窗""拖拽排序""虚拟列表""加个交互动画"等
- 用户要实现某交互效果

## 表单校验

### Vue3 + Element Plus
```vue
<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance } from 'element-plus'
const form = reactive({ email: '', age: 0 })
const rules = {
  email: [
    { required: true, message: '必填' },
    { type: 'email', message: '邮箱格式错' },
  ],
  age: [{ type: 'number', min: 0, max: 150, message: '年龄非法' }],
}
const ref_ = ref<FormInstance>()
async function submit() {
  await ref_.value!.validate()
  // 校验通过，提交
}
</script>
<template>
  <el-form :model="form" :rules="rules" ref="ref_">
    <el-form-item label="邮箱" prop="email"><el-input v-model="form.email" /></el-form-item>
    <el-form-item label="年龄" prop="age"><el-input-number v-model="form.age" /></el-form-item>
    <el-button @click="submit">提交</el-button>
  </el-form>
</template>
```

### React + Ant Design
```tsx
import { Form, Input, InputNumber, Button } from 'antd'
const [form] = Form.useForm()
const submit = async () => {
  const values = await form.validateFields()
  // 提交 values
}
;<Form form={form}>
  <Form.Item name="email" rules={[{ required: true }, { type: 'email' }]}>
    <Input />
  </Form.Item>
  <Form.Item name="age" rules={[{ type: 'number', min: 0, max: 150 }]}>
    <InputNumber />
  </Form.Item>
  <Button onClick={submit}>提交</Button>
</Form>
```

### 自定义校验器
```ts
const rules = {
  phone: [{
    validator: (_: any, v: string, cb: Function) =>
      /^1[3-9]\d{9}$/.test(v) ? cb() : cb(new Error('手机号非法'))
  }],
}
```

## 弹窗 / 抽屉 / 消息

```ts
// Element Plus
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
ElMessage.success('保存成功')
await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
ElNotification({ title: '通知', message: '...' })

// Ant Design
import { message, Modal, notification } from 'antd'
message.success('保存成功')
Modal.confirm({ title: '确认删除？', onOk: () => {} })
notification.open({ message: '通知' })
```

## 拖拽

### 拖拽排序（vue-draggable / @dnd-kit）
```vue
<draggable v-model="list" item-key="id">
  <template #item="{ element }"><div>{{ element.name }}</div></template>
</draggable>
```
```tsx
// React @dnd-kit
import { DndContext, useSortable, arrayMove } from '@dnd-kit/sortable'
```

### 原生拖拽（HTML5 DnD）
```html
<div draggable="true" @dragstart="onStart" @dragover.prevent @drop="onDrop">项</div>
```

## 虚拟列表（长列表性能）

```vue
<!-- vue-virtual-scroller -->
<RecycleScroller :items="list" :item-size="50" key-field="id">
  <template #default="{ item }"><div>{{ item.name }}</div></template>
</RecycleScroller>
```
```tsx
// react-window
import { FixedSizeList } from 'react-window'
;<FixedSizeList height={600} itemCount={list.length} itemSize={50} width="100%">
  {({ index, style }) => <div style={style}>{list[index].name}</div>}
</FixedSizeList>
```

## 动画交互

### 过渡
```vue
<transition name="fade"><div v-if="show">内容</div></transition>
```
```css
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
```
```tsx
// React
import { AnimatePresence, motion } from 'framer-motion'
;<AnimatePresence>{show && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} />}</AnimatePresence>
```

### 骨架屏（加载态）
```html
<div class="animate-pulse bg-gray-200 rounded h-4 w-3/4" />
```

## 注意事项

- 校验在提交前调 `validate()`，别只靠 UI 提示
- 异步校验（查重名）要防抖，避免每次输入都请求
- 弹窗确认用 `confirm` 返回 Promise，`await` 后再执行危险操作
- 拖拽要处理 `dragover.prevent` 否则 drop 不触发
- 虚拟列表每项高度固定用 FixedSize，动态高度用 VariableSize
- 动画用 transform/opacity，避免触发重排
- 表单提交加 loading 防重复提交，失败保留输入不清空