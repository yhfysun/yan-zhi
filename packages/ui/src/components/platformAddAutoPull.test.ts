/**
 * 新增模型平台不要求用户先提供模型 ID。
 *
 * 背景（用户口径）："新增模型平台的时候不用带上大模型吧，直接拉取不就好了？"
 * 平台连接信息与模型清单是两层数据：先保存平台，再用它的协议 / URL / Key
 * 请求远端 /models。拉取失败不能回滚或隐藏已经保存的平台。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (file: string) => readFileSync(resolve(UI_SRC, file), 'utf8');

const CUSTOM_PLATFORM = read('components/CustomModelDialog.vue');
const ADD_PRESET = read('components/AddPresetDialog.vue');
const PRESET_GRID = read('components/PlatformPresetGrid.vue');
const MODELS = read('views/Models.vue');
const CHAT_DIALOGS = read('components/chat/ChatDialogs.vue');
const USE_CHAT = read('composables/chat/useChat.ts');

describe('新增模型平台：先建平台再自动拉取模型', () => {
  it('自定义平台表单不再要求模型 ID，保存后自动同步', () => {
    expect(CUSTOM_PLATFORM).toContain('title="自定义平台"');
    expect(CUSTOM_PLATFORM).not.toContain('<el-form-item label="模型 ID"');
    expect(CUSTOM_PLATFORM).toContain('保存并拉取模型');
    expect(CUSTOM_PLATFORM).toMatch(/platformStore\.addPlatform\([\s\S]*?platformStore\.fetchRemoteModels\(platformId\)/);
  });

  it('厂商目录添加成功后自动拉取远端模型', () => {
    expect(ADD_PRESET).toContain("api.post<any>('/platforms/from-preset'");
    expect(ADD_PRESET).toMatch(/platformStore\.fetchRemoteModels\(platformId\)/);
    expect(PRESET_GRID).toContain('自定义平台');
  });

  it('模型平台页手动新增不勾模型时保存也会自动拉取', () => {
    expect(MODELS).toContain('拉取模型（可选）');
    expect(MODELS).toContain('model-autosync-tip');
    expect(MODELS).toMatch(/else \{\s*try \{\s*const remoteIds = await store\.fetchRemoteModels\(platformId\)/);
  });

  it('聊天内新增平台只填平台连接信息，保存后自动拉取并选模型', () => {
    expect(CHAT_DIALOGS).not.toContain('<el-form-item label="模型 ID">');
    expect(CHAT_DIALOGS).toContain('保存并拉取模型');
    expect(CHAT_DIALOGS).toContain('v-if="platformConfigEditId"');
    expect(USE_CHAT).not.toContain('模型 ID 为必填');
    expect(USE_CHAT).toMatch(/platformId = await platformStore\.addPlatform\([\s\S]*?remoteIds = await platformStore\.fetchRemoteModels\(platformId\)/);
  });
});
