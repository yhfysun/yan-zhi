/**
 * 音色分配单测。
 *
 * 为什么必须测「同角色锁定同音色」：多角色短剧会为每个角色的每句台词**分别**调 api_tts_speak，
 * 若每次调用重新分配，同一角色会被分到不同音色 —— 表现为「同一角色声音忽男忽女」，
 * 而每次调用单看都成功，无从察觉。这是本条链路上最难发现的一类缺陷。
 */
import { describe, it, expect } from 'vitest';
import { pickVoiceForRole, describeVoiceCapacity, inferRoleGender, buildSapiScript, buildWinRtScript } from '../src/mcp/tts-sapi';

// 真实本机音色集（WinRT OneCore 枚举结果）：1 男 2 女
const ZH = [
  { name: 'Microsoft Huihui', culture: 'zh-CN', gender: 'Female' },
  { name: 'Microsoft Yaoyao', culture: 'zh-CN', gender: 'Female' },
  { name: 'Microsoft Kangkang', culture: 'zh-CN', gender: 'Male' },
];
const EN = [
  { name: 'Microsoft Zira', culture: 'en-US', gender: 'Female' },
  { name: 'Microsoft David', culture: 'en-US', gender: 'Male' },
];
const MIXED = [...ZH, ...EN];
const NO_GENDER = [
  { name: 'Microsoft Huihui Desktop', culture: 'zh-CN' },
  { name: 'Microsoft Zira Desktop', culture: 'en-US' },
];

describe('inferRoleGender · 从角色名推断性别', () => {
  it('显式带性别词', () => {
    expect(inferRoleGender('男主')).toBe('Male');
    expect(inferRoleGender('女主')).toBe('Female');
  });

  it('亲属称谓能识别', () => {
    expect(inferRoleGender('爷爷')).toBe('Male');
    expect(inferRoleGender('妈妈')).toBe('Female');
    expect(inferRoleGender('哥哥')).toBe('Male');
    expect(inferRoleGender('姐姐')).toBe('Female');
  });

  it('常见角色称谓能识别', () => {
    expect(inferRoleGender('王老板')).toBe('Male');
    expect(inferRoleGender('小姐')).toBe('Female');
    expect(inferRoleGender('司令')).toBe('Male');
  });

  it('识别不出时返回空串（交给轮转分配，不瞎猜）', () => {
    expect(inferRoleGender('旁白')).toBe('');
    expect(inferRoleGender('')).toBe('');
    expect(inferRoleGender('第三方')).toBe('');
  });
});

describe('pickVoiceForRole · 按性别分配（男女声区分的关键）', () => {
  it('男主拿到男声、女主拿到女声（本机实测场景）', () => {
    const assigned = new Map<string, string>();
    expect(pickVoiceForRole(ZH, '男主', assigned)).toBe('Microsoft Kangkang');
    expect(pickVoiceForRole(ZH, '女主', assigned)).toBe('Microsoft Yaoyao');
  });

  it('同性别多个角色时不会撞同一个（音色够用）', () => {
    const assigned = new Map<string, string>();
    const a = pickVoiceForRole(ZH, '女主', assigned);
    const b = pickVoiceForRole(ZH, '女配', assigned);
    expect(a).not.toBe(b);
  });

  it('男声只有一个时，两个男性角色只能复用（能力上限，不报错）', () => {
    const assigned = new Map<string, string>();
    const a = pickVoiceForRole(ZH, '男主', assigned);
    const b = pickVoiceForRole(ZH, '男配', assigned);
    expect(a).toBe('Microsoft Kangkang');
    expect(b).toBe('Microsoft Kangkang');
  });

  it('识别不出性别时从中文池轮转', () => {
    const assigned = new Map<string, string>();
    const v = pickVoiceForRole(ZH, '旁白', assigned);
    expect(ZH.map((x) => x.name)).toContain(v);
  });

  it('音色无 Gender 字段时退化为轮转（老 SAPI 音色）', () => {
    const assigned = new Map<string, string>();
    const a = pickVoiceForRole(NO_GENDER, '男主', assigned);
    expect(NO_GENDER.map((x) => x.name)).toContain(a);
  });
});

describe('pickVoiceForRole · 角色音色分配', () => {
  it('同一角色再次分配返回同一音色（不重新分配）', () => {
    const assigned = new Map<string, string>();
    const first = pickVoiceForRole(MIXED, '女主', assigned);
    const second = pickVoiceForRole(MIXED, '女主', assigned);
    expect(second).toBe(first);
  });

  it('不同角色分到不同音色（音色够用时）', () => {
    const assigned = new Map<string, string>();
    const a = pickVoiceForRole(MIXED, '女主', assigned);
    const b = pickVoiceForRole(MIXED, '男主', assigned);
    expect(a).not.toBe(b);
  });

  it('优先选目标语言音色（中文优先，不落到英文）', () => {
    const assigned = new Map<string, string>();
    const v = pickVoiceForRole(MIXED, '旁白', assigned, 'zh');
    expect(ZH.map((x) => x.name)).toContain(v);
  });

  it('本机只有英文音色时退化为用英文（好过无音可用）', () => {
    const assigned = new Map<string, string>();
    const v = pickVoiceForRole(EN, '旁白', assigned, 'zh');
    expect(EN.map((x) => x.name)).toContain(v);
  });

  it('音色不够时循环复用（3 角色 2 音色不报错）', () => {
    const assigned = new Map<string, string>();
    const a = pickVoiceForRole(ZH.slice(0, 2), 'A', assigned);
    const b = pickVoiceForRole(ZH.slice(0, 2), 'B', assigned);
    const c = pickVoiceForRole(ZH.slice(0, 2), 'C', assigned);
    expect([a, b, c].every(Boolean)).toBe(true);
    expect(a).not.toBe(b);
    expect([a, b]).toContain(c);
  });

  it('音色列表为空返回 undefined（调用方退化为引擎默认）', () => {
    const assigned = new Map<string, string>();
    expect(pickVoiceForRole([], '女主', assigned)).toBeUndefined();
    expect(assigned.size).toBe(0);
  });

  it('分配会写入 assigned 表（供后续调用复用）', () => {
    const assigned = new Map<string, string>();
    const v = pickVoiceForRole(MIXED, '女主', assigned);
    expect(assigned.get('女主')).toBe(v);
  });
});

describe('describeVoiceCapacity · 音色容量评估', () => {
  it('音色充足时 adequate=true（按中文池计数，不混入英文）', () => {
    const c = describeVoiceCapacity(MIXED, 2);
    expect(c.adequate).toBe(true);
    expect(c.distinctVoices).toBe(ZH.length);
  });

  it('角色数超过音色数时 adequate=false 并说明后果', () => {
    // 本机实测场景：只有 1 个中文音色，3 个角色
    const c = describeVoiceCapacity(ZH.slice(0, 1), 3);
    expect(c.adequate).toBe(false);
    expect(c.note).toContain('声音重复');
  });

  it('提示里给出两条可执行的解决路径', () => {
    const c = describeVoiceCapacity(ZH.slice(0, 1), 3);
    expect(c.note).toContain('语音包');
    expect(c.note).toContain('/v1/audio/speech');
  });

  it('无任何音色时明确说会导致失败', () => {
    const c = describeVoiceCapacity([], 2);
    expect(c.adequate).toBe(false);
    expect(c.distinctVoices).toBe(0);
    expect(c.note).toContain('失败');
  });

  it('只有英文音色时按英文池评估（不误报 0）', () => {
    const c = describeVoiceCapacity(EN, 2);
    expect(c.distinctVoices).toBe(2);
    expect(c.adequate).toBe(true);
  });

  it('报告男女声数量（本机 1 男 2 女 → 3 角色刚好够）', () => {
    const c = describeVoiceCapacity(ZH, 3);
    expect(c.maleVoices).toBe(1);
    expect(c.femaleVoices).toBe(2);
    expect(c.adequate).toBe(true);
    expect(c.note).toContain('1 个男声');
    expect(c.note).toContain('2 个女声');
  });
});

describe('脚本 ASCII 红线（PowerShell 编码陷阱）', () => {
  it('SAPI 合成脚本纯 ASCII', () => {
    expect(/^[\x00-\x7F]*$/.test(buildSapiScript())).toBe(true);
  });

  it('WinRT 脚本纯 ASCII —— 泛型反引号必须用 [char]96 拼出', () => {
    const s = buildWinRtScript();
    expect(/^[\x00-\x7F]*$/.test(s)).toBe(true);
    // 反引号若直接写进脚本会被 PowerShell 当转义符
    expect(s).not.toContain('`');
    expect(s).toContain('[char]96');
  });

  it('WinRT 脚本含 AsTask 桥接与语速容错（PS 5.1 不能直接 await）', () => {
    const s = buildWinRtScript();
    expect(s).toContain('AsTask');
    expect(s).toContain('SpeakingRate');
    // 语速设置失败不能让整次合成失败
    expect(s).toContain('catch { }');
  });

  it('WinRT 脚本在只枚举时会提前 return（复用同一脚本做枚举与合成）', () => {
    const s = buildWinRtScript();
    expect(s).toContain('if ($Out -ne "")');
    expect(s).toContain('return');
  });
});