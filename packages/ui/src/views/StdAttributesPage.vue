<template>
  <div class="page dw-root">
    <header class="page-header">
      <div>
        <h2 class="page-title dw-display">标准属性</h2>
        <div class="page-sub">
          企业级统一字段口径（key / value / def），支持多级分组树。本体字段通过 refAttr 引用属性 key；
          分组下的子属性 value 即枚举取值，作为数据智能体取值召回的优先来源。
        </div>
      </div>
    </header>
    <StdAttributeTree />
  </div>
</template>

<script setup lang="ts">
import StdAttributeTree from '../components/StdAttributeTree.vue';
import './ontology.css';
</script>

<style scoped>
.std-tree { height: 100%; }
</style>
