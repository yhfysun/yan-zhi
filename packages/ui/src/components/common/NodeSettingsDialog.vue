<template>
  <!-- 昵称设置：原 Peers/ChatHub 各自复制一份，现收敛为一个公共组件 -->
  <FormDialog
    v-model="nicknameOpen"
    title="设置昵称"
    width="360px"
    top="15vh"
    :loading="savingNickname"
    @submit="submitNickname"
  >
    <el-input v-model="nicknameInput" placeholder="输入你的昵称" maxlength="20" show-word-limit />
  </FormDialog>

  <!-- 节点设置（注册信息）：表单值直接绑定父级 node 对象（取消不回滚，与原实现一致） -->
  <FormDialog
    v-model="registerOpen"
    title="节点设置"
    width="480px"
    top="15vh"
    :loading="savingRegister"
    @submit="submitRegister"
  >
    <el-form label-width="100px">
      <el-form-item label="节点 ID"><el-input v-model="node.nodeId" disabled /></el-form-item>
      <el-form-item label="回调地址"><el-input v-model="node.baseUrl" placeholder="http://host:port" /></el-form-item>
      <el-form-item label="能力"><el-input v-model="node.capabilities" placeholder="逗号分隔，如 chat,files" /></el-form-item>
    </el-form>
  </FormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import FormDialog from '../FormDialog.vue';

/** 节点注册信息（Peers / ChatHub 两处 registerForm 的交集形态） */
interface NodeRegisterInfo {
  nodeId: string;
  baseUrl: string;
  /** 逗号分隔的能力串，如 'chat,files' */
  capabilities: string;
}

const props = withDefaults(
  defineProps<{
    /** 「设置昵称」弹窗开关（v-model:nickname-visible） */
    nicknameVisible?: boolean;
    /** 「节点设置」弹窗开关（v-model:register-visible） */
    registerVisible?: boolean;
    /** 当前昵称：打开昵称弹窗时回填输入框 */
    nickname?: string;
    /** 节点注册信息（对象属性直接双向绑定） */
    node: NodeRegisterInfo;
    savingNickname?: boolean;
    savingRegister?: boolean;
  }>(),
  {
    nicknameVisible: false,
    registerVisible: false,
    nickname: '',
    savingNickname: false,
    savingRegister: false,
  },
);

const emit = defineEmits<{
  (e: 'update:nicknameVisible', v: boolean): void;
  (e: 'update:registerVisible', v: boolean): void;
  /** 昵称校验通过（已 trim、非空），由父级持久化 */
  (e: 'save-nickname', name: string): void;
  /** 注册表单提交，由父级持久化 */
  (e: 'save-register', values: { baseUrl: string; capabilities: string }): void;
}>();

const nicknameOpen = computed({
  get: () => props.nicknameVisible,
  set: (v) => emit('update:nicknameVisible', v),
});
const registerOpen = computed({
  get: () => props.registerVisible,
  set: (v) => emit('update:registerVisible', v),
});

/** 打开时回填当前昵称（原 openNickname 行为：每次打开都以最新昵称为初值） */
const nicknameInput = ref('');
watch(
  () => props.nicknameVisible,
  (v) => {
    if (v) nicknameInput.value = props.nickname;
  },
);

function submitNickname() {
  const name = nicknameInput.value.trim();
  if (!name) {
    ElMessage.warning('昵称不能为空');
    return;
  }
  emit('save-nickname', name);
}

function submitRegister() {
  emit('save-register', { baseUrl: props.node.baseUrl, capabilities: props.node.capabilities });
}
</script>
