<template>
  <el-dialog v-model="showSkills" title="挂载 Skill" width="540px" class="skill-mount-dialog" :close-on-click-modal="false">
    <el-input v-model="skillSearch" placeholder="搜索 Skill 名称或描述..." size="small" clearable :prefix-icon="Search" class="skill-mount-search" />
    <div class="skill-mount-body">
      <el-checkbox-group v-model="mountedSkillIds">
        <div
          v-for="s in filteredSkillStore"
          :key="s.id"
          :class="['skill-card-item', { active: mountedSkillIds.includes(s.id), disabled: !s.enabled }]"
          @click="s.enabled && toggleSkillMount(s.id)"
        >
          <div class="skill-card-left">
            <div class="skill-card-check" :class="{ checked: mountedSkillIds.includes(s.id) }">
              <el-icon v-if="mountedSkillIds.includes(s.id)" :size="12"><Check /></el-icon>
            </div>
            <div class="skill-card-icon"><el-icon :size="18"><Files /></el-icon></div>
          </div>
          <div class="skill-card-info">
            <span class="skill-card-name">{{ s.name }}</span>
            <el-tooltip :content="s.description || '无描述'" placement="top" :show-after="400" :hide-after="0" effect="dark">
              <span class="skill-card-desc">{{ s.description || '无描述' }}</span>
            </el-tooltip>
          </div>
          <el-tag v-if="!s.enabled" size="small" type="info" effect="plain">已禁用</el-tag>
        </div>
      </el-checkbox-group>
      <el-empty v-if="filteredSkillStore.length === 0 && skillStore.skills.length > 0" description="无匹配 Skill" :image-size="50" />
      <el-empty v-if="skillStore.skills.length === 0" description="还没有安装 Skill，去 Skill 商店安装吧" :image-size="60">
        <el-button type="primary" size="small" @click="showSkills = false; $router.push('/skills')">前往 Skill 商店</el-button>
      </el-empty>
    </div>
    <template #footer>
      <el-button @click="showSkills = false">关闭</el-button>
      <el-button type="primary" @click="saveSkills">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Search, Check, Files } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';

const {
  showSkills, skillSearch, mountedSkillIds, filteredSkillStore, skillStore, toggleSkillMount, saveSkills,
} = useChat();
</script>
