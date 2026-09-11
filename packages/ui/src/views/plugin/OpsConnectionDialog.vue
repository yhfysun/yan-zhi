<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? `编辑连接 · ${form.name || ''}` : '新建连接'"
    width="560px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <el-form label-width="110px" label-position="right">
      <!-- 资源类型：编辑时不允许改（改类型等于换一套字段语义） -->
      <el-form-item label="资源类型">
        <el-radio-group v-model="form.type" :disabled="isEdit" @change="onTypeChange">
          <el-radio-button value="ssh">SSH 服务器</el-radio-button>
          <el-radio-button value="docker">Docker 主机</el-radio-button>
          <el-radio-button value="database">数据库</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="form.type === 'docker'" label=" ">
        <span class="form-tip">通过 SSH 连到宿主机管理容器（复用 docker CLI），无需暴露 Docker 端口</span>
      </el-form-item>

      <el-form-item v-if="form.type === 'database'" label="数据库类型">
        <el-radio-group v-model="form.dbType" @change="onDbTypeChange">
          <el-radio value="mysql">MySQL</el-radio>
          <el-radio value="postgres">PostgreSQL</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="名称" required>
        <el-input v-model="form.name" placeholder="唯一标识，如 web-1 / 主库" />
      </el-form-item>

      <el-form-item label="目录">
        <el-select v-model="form.groupId" clearable placeholder="未分组" class="ops-group-select">
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
        <span class="form-tip">左侧资源列表的分类目录，保存后可在列表里再移动</span>
      </el-form-item>

      <el-form-item label="主机" required>
        <el-input v-model="form.host" placeholder="IP 或域名" />
      </el-form-item>

      <el-form-item label="端口" required>
        <el-input-number v-model="form.port" :min="1" :max="65535" controls-position="right" />
      </el-form-item>

      <el-form-item label="用户名" required>
        <el-input v-model="form.username" :placeholder="form.type === 'database' ? '数据库用户' : 'root'" />
      </el-form-item>

      <el-form-item v-if="form.type === 'database'" label="库名" required>
        <el-input v-model="form.database" placeholder="默认连接的数据库名" />
      </el-form-item>

      <el-form-item v-if="form.type !== 'database'" label="认证方式">
        <el-radio-group v-model="form.authType">
          <el-radio value="password">密码</el-radio>
          <el-radio value="key">私钥</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="secretLabel" :required="!isEdit">
        <el-input
          v-model="form.secret"
          :type="form.type !== 'database' && form.authType === 'key' ? 'textarea' : 'password'"
          :rows="4"
          show-password
          :placeholder="secretPlaceholder"
        />
        <span v-if="isEdit" class="form-tip">留空表示沿用原密钥，仅填新值才会覆盖</span>
      </el-form-item>

      <!-- 以下为本次新增：进入终端默认命令 + SFTP 默认路径 -->
      <template v-if="form.type !== 'database'">
        <el-divider content-position="left"><span class="ops-divider-text">终端与文件</span></el-divider>

        <el-form-item label="默认命令">
          <el-input
            v-model="form.defaultCommand"
            type="textarea"
            :rows="2"
            placeholder="进入终端后自动执行，如 cd /data/app && ls -al（留空则不执行）"
          />
        </el-form-item>

        <el-form-item label="SFTP 默认路径">
          <el-input v-model="form.sftpPath" placeholder="如 /data/app/uploads；上传/下载未指定远程路径时兜底" />
        </el-form-item>
      </template>

      <el-form-item label="标签">
        <el-input v-model="form.tag" placeholder="如 生产 / 测试（生产标签的写操作需二次确认）" />
      </el-form-item>

      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="2" placeholder="用途说明（可选）" />
      </el-form-item>
    </el-form>

    <div v-if="testResult" class="ops-test-result" :class="testResult.ok ? 'ok' : 'err'">
      {{ testResult.ok ? '✅ 连接正常' : `❌ ${testResult.error || '连接失败'}` }}
    </div>

    <template #footer>
      <div class="ops-dialog-footer">
        <el-button :loading="testing" :disabled="saving" @click="testConnection">测试连接</el-button>
        <div class="ops-dialog-footer-right">
          <el-button :disabled="saving || testing" @click="visible = false">取消</el-button>
          <el-button type="primary" :loading="saving" :disabled="testing" @click="submit">
            {{ isEdit ? '保存修改' : '保存' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';

/** 与 OpsConsole 共享的连接结构（后端不出密钥） */
export interface OpsConn {
  id: string;
  type?: 'ssh' | 'docker' | 'database';
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  tag?: string;
  dbType?: 'mysql' | 'postgres';
  database?: string;
  defaultCommand?: string;
  sftpPath?: string;
  note?: string;
  /** 所属目录 id */
  groupId?: string;
}

interface FormState {
  type: 'ssh' | 'docker' | 'database';
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  secret: string;
  tag: string;
  dbType: 'mysql' | 'postgres';
  database: string;
  defaultCommand: string;
  sftpPath: string;
  note: string;
  groupId: string;
}

const emit = defineEmits<{
  (e: 'saved', conn: OpsConn): void;
}>();

const visible = ref(false);
const saving = ref(false);
const testing = ref(false);
const testResult = ref<{ ok: boolean; error?: string } | null>(null);
/** 编辑态的原连接：id 用于 PUT 与「续用原密钥」测试；null 表示新建 */
const editing = ref<OpsConn | null>(null);
const isEdit = computed(() => !!editing.value);

function emptyForm(): FormState {
  return {
    type: 'ssh', name: '', host: '', port: 22, username: 'root',
    authType: 'password', secret: '', tag: '',
    dbType: 'mysql', database: '',
    defaultCommand: '', sftpPath: '', note: '', groupId: '',
  };
}
const form = ref<FormState>(emptyForm());

/** 可选目录：与左侧资源列表同一份数据 */
const groups = ref<Array<{ id: string; name: string }>>([]);
async function loadGroups() {
  const r = await api.get<Array<{ id: string; name: string }>>('/plugin/ops-shell/groups');
  if ('data' in r) groups.value = r.data;
}

const secretLabel = computed(() => {
  if (form.value.type === 'database') return '密码';
  return form.value.authType === 'key' ? '私钥' : '密码';
});
const secretPlaceholder = computed(() => {
  if (form.value.type !== 'database' && form.value.authType === 'key') {
    return isEdit.value ? '留空沿用原私钥；填新值则覆盖（PEM 格式）' : 'PEM 私钥内容（OpenSSH 新格式需转 PEM）';
  }
  return isEdit.value ? '留空沿用原密码' : '密码';
});

/** 打开弹窗：conn 传入则为编辑，否则新建 */
function open(conn?: OpsConn) {
  editing.value = conn ?? null;
  visible.value = true;
}

function onOpen() {
  testResult.value = null;
  void loadGroups();
  const c = editing.value;
  if (c) {
    form.value = {
      type: c.type === 'docker' || c.type === 'database' ? c.type : 'ssh',
      name: c.name, host: c.host, port: c.port, username: c.username,
      authType: c.authType || 'password', secret: '', tag: c.tag || '',
      dbType: c.dbType === 'postgres' ? 'postgres' : 'mysql',
      database: c.database || '',
      defaultCommand: c.defaultCommand || '', sftpPath: c.sftpPath || '', note: c.note || '',
      groupId: c.groupId || '',
    };
  } else {
    form.value = emptyForm();
  }
}

function onTypeChange() {
  const f = form.value;
  f.port = f.type === 'database' ? (f.dbType === 'postgres' ? 5432 : 3306) : 22;
  f.username = f.type === 'database' ? '' : 'root';
}
function onDbTypeChange() {
  form.value.port = form.value.dbType === 'postgres' ? 5432 : 3306;
}

function payload() {
  const f = form.value;
  return {
    type: f.type, name: f.name.trim(), host: f.host.trim(), port: f.port,
    username: f.username.trim(), authType: f.authType, secret: f.secret,
    tag: f.tag.trim() || undefined,
    dbType: f.type === 'database' ? f.dbType : undefined,
    database: f.type === 'database' ? f.database.trim() : undefined,
    defaultCommand: f.type === 'database' ? undefined : (f.defaultCommand.trim() || undefined),
    sftpPath: f.type === 'database' ? undefined : (f.sftpPath.trim() || undefined),
    note: f.note.trim() || undefined,
    groupId: f.groupId || undefined,
  };
}

/** 表单内测试：不落库，直接拿当前输入去连一次 */
async function testConnection() {
  const f = form.value;
  if (!f.host.trim() || !f.username.trim()) { ElMessage.warning('主机 / 用户名 必填'); return; }
  if (f.type === 'database' && !f.database.trim()) { ElMessage.warning('数据库连接必须填库名'); return; }
  if (!isEdit.value && !f.secret) { ElMessage.warning('密码或私钥必填'); return; }
  testing.value = true;
  testResult.value = null;
  const body = { ...payload(), id: editing.value?.id };
  const r = await api.post<{ ok: boolean; error?: string }>('/plugin/ops-shell/connections/test', body);
  testing.value = false;
  if ('data' in r) {
    testResult.value = r.data;
    if (r.data.ok) ElMessage.success('连接正常');
    else ElMessage.error(`连接失败: ${r.data.error || '未知错误'}`);
  } else {
    testResult.value = { ok: false, error: r.error };
    ElMessage.error(r.error);
  }
}

async function submit() {
  const f = form.value;
  if (!f.name.trim() || !f.host.trim() || !f.username.trim()) {
    ElMessage.warning('名称 / 主机 / 用户名 必填');
    return;
  }
  if (!isEdit.value && !f.secret) { ElMessage.warning('密码或私钥必填'); return; }
  if (f.type === 'database' && !f.database.trim()) { ElMessage.warning('数据库连接必须填库名'); return; }
  saving.value = true;
  const r = editing.value
    ? await api.put<OpsConn>(`/plugin/ops-shell/connections/${editing.value.id}`, payload())
    : await api.post<OpsConn>('/plugin/ops-shell/connections', payload());
  saving.value = false;
  if ('error' in r) { ElMessage.error(r.error); return; }
  ElMessage.success(editing.value ? '连接已更新' : '连接已保存（密钥已加密存储）');
  visible.value = false;
  emit('saved', r.data as OpsConn);
}

defineExpose({ open });
</script>

<style scoped>
.ops-divider-text { font-size: 12px; color: var(--color-text-secondary); }
.ops-group-select { width: 100%; }
.ops-test-result {
  margin: -4px 0 4px 110px; padding: 6px 10px; border-radius: 6px; font-size: 12px;
  word-break: break-all;
}
.ops-test-result.ok { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 10%, transparent); }
.ops-test-result.err { color: var(--el-color-danger); background: color-mix(in srgb, var(--el-color-danger) 10%, transparent); }
.ops-dialog-footer { display: flex; align-items: center; justify-content: space-between; }
.ops-dialog-footer-right { display: flex; gap: 8px; }
</style>
