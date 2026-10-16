// @vitest-environment jsdom
// 远程仓库地址弹窗的**真实挂载**守门测试（2026-10-16）。
//
// ★ 为什么要有它：用户实报「git 缺少远程 url 查看和修改」。后端（apps/server/test/git-remote.test.ts）
//   与 store（gitSync.test.ts 的读写分类）各自都有测试，但"界面上到底能不能看、能不能改"
//   只有真挂载才看得见：脏判定错了 → 保存按钮永远是灰的；字段绑错 → 改了 fetch 却写进 push。
//   故这里钉三件事：
//     ① 列表把仓库里的远程地址读出来显示（查看链路）
//     ② 改拉取地址 → 打 remoteSetUrl 且 push=false（改的是拉取，不是推送）
//     ③ 地址里内嵌明文凭据时给提醒（本机 origin 就是这种形态）
//   挂载方式跟随仓库既有做法（views/plugin/sftpPanelPanes.mount.test.ts）。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const REPO = 'C:\\Users\\probe\\demo-repo';
const TOKEN_URL = 'https://ghp_AbCdEf0123456789@github.com/acme/demo.git';

vi.mock('../../api/client', () => {
  const get = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/git/remoteList')) {
      return { data: [{ name: 'origin', fetchUrl: 'https://gitlab.internal/acme/demo.git', pushUrl: 'https://gitlab.internal/acme/demo.git' }] };
    }
    return { data: null };
  });
  const post = vi.fn(async () => ({ data: { ok: true } }));
  return {
    isElectron: false, isCapacitor: false, isLocalClient: false,
    LOCAL_API_PORT: 0, LOCAL_API_BASE: 'http://127.0.0.1:0/api', API_BASE: 'http://127.0.0.1:0/api',
    wsUrl: (p: string) => `ws://127.0.0.1:0${p}`,
    getMobileApiBase: () => '', setMobileApiBase: () => '', getLicenseCode: () => null,
    setToken: () => undefined, buildRequestHeaders: () => ({}),
    apiFetch: vi.fn(async () => ({ data: null })),
    api: { get, post, patch: vi.fn(), put: vi.fn(), delete: vi.fn(async () => ({ data: null })) },
  };
});

import { createApp, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { api } from '../../api/client';
import GitRemoteDialog from './GitRemoteDialog.vue';

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

/** 挂载弹窗（内容 Teleport 到 body，故断言一律查 document.body） */
async function mountDialog(): Promise<{ app: App }> {
  setActivePinia(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(GitRemoteDialog as never, { modelValue: true, repo: REPO }),
  });
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  await settle();
  return { app };
}

const dialogBody = () => document.body.querySelector('.grm') as HTMLElement;

/** 找到某一行的输入框（[0]=拉取，[1]=推送），写入新值并触发 v-model */
async function setInput(scope: HTMLElement, idx: number, value: string): Promise<void> {
  const inputs = scope.querySelectorAll('input');
  const el = inputs[idx] as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(3);
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('GitRemoteDialog · 查看与修改远程地址（真实挂载）', () => {
  it('★ 读仓库远程并显示：名称 origin + 两个地址都在输入框里', async () => {
    const { app } = await mountDialog();
    const body = dialogBody();
    expect(body).not.toBeNull();
    expect(body.textContent).toContain('origin');
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/git/remoteList?repo='));
    const values = [...body.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
    expect(values).toContain('https://gitlab.internal/acme/demo.git');
    app.unmount();
  });

  it('★ 改拉取地址 → 保存打 remoteSetUrl 且 push=false（不能写成推送）', async () => {
    const { app } = await mountDialog();
    const body = dialogBody();
    const next = 'https://gitlab.internal/acme/demo-v2.git';
    await setInput(body, 0, next);

    // 未保存标记出现（脏判定基于与仓库真实值的比较）
    expect(body.textContent).toContain('未保存');

    const saveBtn = [...body.querySelectorAll('button')].find((b) => b.textContent?.trim() === '保存');
    expect(saveBtn).toBeTruthy();
    (saveBtn as HTMLButtonElement).click();
    await settle();

    expect(post).toHaveBeenCalledWith('/git/remoteSetUrl', { repo: REPO, name: 'origin', url: next, push: false });
    app.unmount();
  });

  it('★ 新增远程：填名称+地址后「添加」打 remoteAdd', async () => {
    const { app } = await mountDialog();
    const body = dialogBody();
    const addRow = body.querySelector('.grm-add-row') as HTMLElement;
    const [nameInput, urlInput] = [...addRow.querySelectorAll('input')] as HTMLInputElement[];
    nameInput.value = 'backup';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    urlInput.value = 'https://example.com/acme/backup.git';
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(3);

    const addBtn = [...addRow.querySelectorAll('button')].find((b) => b.textContent?.trim() === '添加');
    expect(addBtn).toBeTruthy();
    (addBtn as HTMLButtonElement).click();
    await settle();

    expect(post).toHaveBeenCalledWith('/git/remoteAdd', { repo: REPO, name: 'backup', url: 'https://example.com/acme/backup.git' });
    app.unmount();
  });

  it('★ 地址内嵌明文凭据 → 出现提醒（本机 origin 就是 https://ghp_…@github.com 形态）', async () => {
    get.mockResolvedValueOnce({
      data: [{ name: 'origin', fetchUrl: TOKEN_URL, pushUrl: TOKEN_URL }],
    });
    const { app } = await mountDialog();
    expect(dialogBody().textContent).toContain('明文凭据');
    app.unmount();
  });

  it('普通地址（无凭据）不提醒 —— 否则提醒无处不在就等于没有提醒', async () => {
    const { app } = await mountDialog();
    expect(dialogBody().textContent).not.toContain('明文凭据');
    app.unmount();
  });
});
