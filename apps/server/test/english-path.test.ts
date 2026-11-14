import { describe, expect, it } from 'vitest';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGLISH_PATH, ENGLISH_TRACKS, getEnglishPath, normalizeEnglishTrack } from '../src/learning/english-path';
import { ENGLISH_PHONIC_CHART } from '../src/learning/phonics-chart';
import { normalizeEnglishTtsText } from '../src/learning/english-tts';
import { READING_PASSAGES } from '../src/learning/curriculum';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
/** 课程专属拼读音频实际随包位置（与前端 phonicsAudioSrc 的 publicDir 对齐）。 */
const AUDIO_DIR = path.resolve(TEST_DIR, '..', '..', 'web', 'public', 'phonics-audio');

describe('零基础英语学习主线', () => {
  it('按拼读、构词、句型、寓言、短篇、长篇、口语输出排列', () => {
    expect(ENGLISH_PATH.map((stage) => stage.id)).toEqual([
      'sounds',
      'word-building',
      'sentence-core',
      'fable-reading',
      'story-input',
      'long-story',
      'real-speaking',
    ]);
  });

  it('每阶段都有可立即完成的微课，每课都有完整教案和自测', () => {
    for (const stage of ENGLISH_PATH) {
      expect(stage.steps.length, stage.id).toBeGreaterThanOrEqual(3);
      for (const step of stage.steps) {
        expect(step.goal.length, step.id).toBeGreaterThan(8);
        expect(step.explanation.length, step.id).toBeGreaterThan(20);
        if (step.kind === 'translate') {
          expect(step.translate?.length, step.id).toBeGreaterThanOrEqual(3);
        } else {
          expect(step.examples.length, step.id).toBeGreaterThan(0);
        }
        expect(step.task.length, step.id).toBeGreaterThan(10);
        expect(step.minutes).toBeGreaterThan(0);
        expect(step.quickCheck, `${step.id} quickCheck`).toBeTruthy();
        expect(step.quickCheck!.options.length, `${step.id} options`).toBeGreaterThanOrEqual(3);
        expect(step.quickCheck!.answer, `${step.id} answer`).toBeGreaterThanOrEqual(0);
        expect(step.quickCheck!.answer, `${step.id} answer`).toBeLessThan(step.quickCheck!.options.length);
        expect(step.quickCheck!.explanation.length, `${step.id} explanation`).toBeGreaterThan(8);
      }
    }
  });

  it('同时覆盖自然拼读、词根词缀、语法、寓言、短篇、长篇故事、口语和回译', () => {
    const kinds = new Set(ENGLISH_PATH.flatMap((stage) => stage.steps.map((step) => step.kind)));
    expect(kinds).toEqual(new Set(['phonics', 'roots', 'grammar', 'fable', 'story', 'long-story', 'speaking', 'translate']));
    expect(ENGLISH_PATH[1].steps.some((step) => step.pattern?.includes('port'))).toBe(true);
    expect(ENGLISH_PATH.find((stage) => stage.id === 'fable-reading')?.steps.every((step) => step.kind === 'fable' || step.kind === 'translate')).toBe(true);
    expect(ENGLISH_PATH.find((stage) => stage.id === 'long-story')?.steps.length).toBeGreaterThanOrEqual(3);
    expect(
      ENGLISH_PATH.find((stage) => stage.id === 'long-story')?.steps.every((step) =>
        step.examples.reduce((sum, example) => sum + example.en.length, 0) > 250),
    ).toBe(true);
  });

  it('短元音使用可点击例词，IPA 与 en-US 发音一致且不会把结构符号交给 TTS', () => {
    const lesson = ENGLISH_PATH[0].steps.find((step) => step.id === 'sound_short_vowels')!;
    expect(lesson.sounds?.map((sound) => [sound.letter, sound.ipa, sound.word])).toEqual([
      ['a', '/æ/', 'cat'],
      ['e', '/ɛ/', 'bed'],
      ['i', '/ɪ/', 'sit'],
      ['o', '/ɑ/', 'hot'],
      ['u', '/ʌ/', 'cup'],
    ]);
    expect(lesson.patternAudio).toBe('a, as in cat. e, as in bed. i, as in sit. o, as in hot. u, as in cup.');
    expect(lesson.patternAudio).not.toMatch(/[\/→æɛɪɑʌ]/);
    expect(lesson.pattern).toContain('/æ/');
    expect(lesson.quickCheck?.options[lesson.quickCheck.answer]).toBe('cat · bed · sit · hot · cup');
  });

  it('所有含 IPA 的拼读结构都提供可点击例词，不把符号直接交给语音', () => {
    const phonics = ENGLISH_PATH.find((stage) => stage.id === 'sounds')!.steps;
    for (const lesson of phonics) {
      if (!lesson.pattern?.includes('/')) continue;
      expect(lesson.sounds?.length, lesson.id).toBeGreaterThan(0);
      for (const sound of lesson.sounds!) {
        expect(sound.word, `${lesson.id}:${sound.letter}`).toMatch(/^[A-Za-z][A-Za-z' -]*$/);
        expect(sound.ipa.startsWith('/'), `${lesson.id}:${sound.letter}`).toBe(true);
      }
    }
    const rColored = phonics.find((lesson) => lesson.id === 'sound_er_ir_ur')!;
    expect(rColored.sounds?.map((sound) => [sound.letter, sound.ipa, sound.word])).toEqual([
      ['er', '/ɚ/', 'teacher'],
      ['ir', '/ɝ/', 'bird'],
      ['ur', '/ɝ/', 'turn'],
    ]);
    expect(rColored.pattern).not.toContain('/ɜːr/');
  });

  it('主线课程量足以形成完整学习路径，而不是示例卡', () => {
    expect(ENGLISH_PATH.reduce((sum, stage) => sum + stage.steps.length, 0)).toBeGreaterThanOrEqual(100);
    const counts = Object.fromEntries(ENGLISH_PATH.map((stage) => [stage.id, stage.steps.length]));
    expect(counts.sounds).toBeGreaterThanOrEqual(12);
    expect(counts['word-building']).toBeGreaterThanOrEqual(16);
    expect(counts['sentence-core']).toBeGreaterThanOrEqual(42);
    expect(counts['fable-reading']).toBeGreaterThanOrEqual(12);
    expect(counts['story-input']).toBeGreaterThanOrEqual(12);
    expect(counts['long-story']).toBeGreaterThanOrEqual(8);
    expect(counts['real-speaking']).toBeGreaterThanOrEqual(12);
  });

  it('词根课不是四词示例：每课至少提供 8 个同根词和释义', () => {
    const roots = ENGLISH_PATH.find((stage) => stage.id === 'word-building')!.steps;
    for (const step of roots.filter((item) => item.kind !== 'translate')) {
      expect(step.wordFamily?.length, step.id).toBeGreaterThanOrEqual(8);
      for (const entry of step.wordFamily!) {
        expect(entry.word.length, step.id).toBeGreaterThan(1);
        expect(entry.gloss.length, `${step.id}:${entry.word}`).toBeGreaterThan(0);
      }
    }
    const port = roots.find((step) => step.id === 'roots_port')!;
    expect(port.wordFamily?.map((entry) => entry.word)).toEqual(expect.arrayContaining([
      'import', 'export', 'transport', 'portable', 'report', 'support', 'teleport',
    ]));
  });

  it('返回副本，页面修改不会污染课程真相源', () => {
    const copy = getEnglishPath();
    copy[0].title = 'changed';
    copy[0].steps[0].title = 'changed';
    copy[0].steps[0].quickCheck!.options[0] = 'changed';
    copy[0].steps[1].sounds![0].word = 'changed';
    copy[0].steps[0].compare![0].parts![0].text = 'changed';
    expect(ENGLISH_PATH[0].title).toBe('先会读');
    expect(ENGLISH_PATH[0].steps[0].title).toBe('字母名 ≠ 字母音');
    expect(ENGLISH_PATH[0].steps[0].quickCheck!.options[0]).not.toBe('changed');
    expect(ENGLISH_PATH[0].steps[1].sounds![0].word).toBe('sip');
    // cloneStep 必须深拷 compare[].parts，否则页面改动会污染课程真相源
    expect(ENGLISH_PATH[0].steps[0].compare![0].parts![0].text).toBe('t');
  });

  it('零基础发音段先分清字母名/字母音，再按 SSP 顺序排列', () => {
    const ids = ENGLISH_PATH[0].steps.map((step) => step.id);
    expect(ids.slice(0, 8)).toEqual([
      'letter_name_vs_sound',
      'ssp_group1',
      'ssp_group2',
      'ssp_group3',
      'sound_short_vowels',
      'sound_blending',
      'ssp_more_consonants',
      'sound_common_pairs',
    ]);
    const letter = ENGLISH_PATH[0].steps[0];
    expect(letter.title).toBe('字母名 ≠ 字母音');
    // 对比课不做逐音学习卡片：无 pattern 字符串，靠 compare 对照卡结构化展示
    expect(letter.pattern).toBeUndefined();
    expect(letter.compare?.length).toBe(5);
    for (const pair of letter.compare ?? []) {
      // ipa 不展示（零基础层藏符号），只用于点声音区放随包本音；nameAudio 是点名称区的朗读文本
      expect(pair.ipa, `${pair.letter} 本音 ipa`).toMatch(/^\/.+\/$/);
      expect(pair.nameAudio, `${pair.letter} 字母名朗读文本`).toBeTruthy();
      // 拟音/字母/例词里不混入 IPA 符号，音标一律走独立的 nameIpa / ipa 字段
      expect(`${pair.letter}${pair.name}${pair.sound}${pair.word ?? ''}`, `${pair.letter} 拟音字段不混入 IPA`).not.toContain('/');
      // 独立的 A 会被冠词规则改成 uh，读不出字母名 /eɪ/ —— 必须用拟音词 ay
      if (pair.letter === 'A') expect(pair.nameAudio).toBe('ay');
    }
    // 理解页喇叭读的是对照卡例词，不读例句
    expect(letter.compare!.map((pair) => pair.word).join(', ')).toBe('tap, bed, sit, hot, cup');
    expect(letter.quickCheck?.answer).toBe(1);
  });

  it('★ 对比认知课：音标显式展示，每组例词都有音素拆分与逐步合音提示', () => {
    const letter = ENGLISH_PATH[0].steps[0];
    expect(letter.pattern).toBeUndefined();
    expect(letter.compare?.length).toBe(5);
    for (const pair of letter.compare ?? []) {
      expect(pair.nameIpa, `${pair.letter} 字母名音标`).toMatch(/^\/.+\/$/);
      expect(pair.ipa, `${pair.letter} 本音音标`).toMatch(/^\/.+\/$/);
      expect(pair.blendHint, `${pair.letter} 逐步合音提示`).toContain(pair.word!);
      // 音素逐字拼起来必须就是例词：不允许前端再猜辅音
      expect(pair.parts?.map((part) => part.text).join(''), `${pair.letter} 音素拼起来要等于例词`).toBe(pair.word);
      for (const part of pair.parts ?? []) {
        expect(part.ipa, `${pair.letter}:${part.text} 本音音标`).toMatch(/^\/.+\/$/);
      }
    }
    // 音素绝不能进 TTS：字母清单会被念成字母名，独立 a 还会被冠词规则改成 uh
    expect(normalizeEnglishTtsText('a')).toBe('uh');
  });

  it('★ 对比认知课：5 条专属慢速拼读示范音频真随包存在，/s/ /z/ 不哑', async () => {
    const letter = ENGLISH_PATH[0].steps[0];
    const dir = path.join(AUDIO_DIR, 'lesson', 'letter-name-vs-sound');
    for (const pair of letter.compare ?? []) {
      expect(pair.blendAudio, `${pair.letter} 专属音频路径`).toBe(`lesson/letter-name-vs-sound/${pair.word}.mp3`);
      const st = await stat(path.join(dir, `${pair.word}.mp3`));
      expect(st.isFile(), `缺文件: ${pair.word}.mp3`).toBe(true);
      expect(st.size, `文件过小: ${pair.word}.mp3`).toBeGreaterThan(10000);
    }
    for (const file of ['sound_ipa_s.mp3', 'sound_ipa_z.mp3']) {
      const st = await stat(path.join(AUDIO_DIR, file));
      expect(st.size, `缺本音: ${file}`).toBeGreaterThan(3000);
    }
  });

  it('对比认知课的例句是可朗读句子，不把字母清单交给 TTS', () => {
    const letter = ENGLISH_PATH[0].steps[0];
    expect(letter.id).toBe('letter_name_vs_sound');
    expect(letter.examples.length).toBeGreaterThanOrEqual(2);
    for (const example of letter.examples) {
      // 例句页喇叭直接把 en 交给 TTS：必须是完整句子，不能是 `name: a e i o u — sound: ...` 标签清单
      expect(example.en, `${letter.id} 例句必须是完整句子`).toMatch(/[.!?]$/);
      expect(example.en.split(/\s+/).length, `${letter.id} 例句必须有句子长度`).toBeGreaterThan(6);
      // 单字母会被念成字母名（e/i/o/u）或冠词 /ə/（a）——两者都与本课教学目标相反
      expect(example.en, `${letter.id} 例句不得含孤立单字母`).not.toMatch(/(^|[^A-Za-z'])[A-Za-z]([^A-Za-z']|$)/);
      expect(normalizeEnglishTtsText(example.en), `${letter.id} 例句不该被冠词规则改写`).toBe(example.en);
      expect(example.zh.length).toBeGreaterThan(8);
    }
    expect(letter.examples.map((item) => item.en).join(' ')).not.toContain('name:');
  });

  it('一课最多教 6 个音，不搞一课灌一堆', () => {
    for (const stage of ENGLISH_PATH) {
      for (const step of stage.steps) {
        if (!step.sounds?.length) continue;
        expect(step.sounds.length, step.id).toBeLessThanOrEqual(6);
      }
    }
  });

  it('前置知识闭合：每课例词只能由「本课 + 已教」的字母拼出', () => {
    const SSP_GROUPS: Array<{ id: string; letters: string[] }> = [
      { id: 'ssp_group1', letters: ['s', 'a', 't', 'i', 'p', 'n'] },
      { id: 'ssp_group2', letters: ['c', 'k', 'e', 'h', 'r', 'm', 'd'] },
      { id: 'ssp_group3', letters: ['g', 'o', 'u', 'l', 'f', 'b'] },
      { id: 'ssp_more_consonants', letters: ['j', 'v', 'w', 'x', 'y', 'z'] },
    ];
    const taught = new Set<string>();
    const words = (text: string) => (text.match(/[A-Za-z]+/g) || []).filter((word) => word.length >= 2);
    const assertClosed = (stepId: string, text: string, allowed: Set<string>) => {
      for (const word of words(text)) {
        const letters = [...word.toLowerCase()].every((ch) => allowed.has(ch));
        expect(letters, `${stepId} 例词 "${word}" 用了未教字母`).toBe(true);
      }
    };
    for (const group of SSP_GROUPS) {
      const step = ENGLISH_PATH[0].steps.find((item) => item.id === group.id)!;
      const allowed = new Set([...taught, ...group.letters]);
      for (const sound of step.sounds ?? []) assertClosed(step.id, sound.word, allowed);
      if (step.pattern) assertClosed(step.id, step.pattern, allowed);
      for (const example of step.examples) assertClosed(step.id, example.en, allowed);
      for (const ch of group.letters) taught.add(ch);
    }
    // 归纳课及以后：26 个字母音全部教完，例词仍不得出现非英文字母拼的东西
    expect(taught.size).toBeGreaterThanOrEqual(24); // 21 辅音 + 5 元音（c/k 同音按两字母计）
    for (const step of ENGLISH_PATH[0].steps) {
      for (const example of step.examples) {
        for (const word of words(example.en)) {
          expect(/^[A-Za-z'-]+$/.test(word), `${step.id} 例词 "${word}" 不是纯字母词`).toBe(true);
        }
      }
    }
  });

  it('零基础层：IPA 一律展示，每个音都有并列口型提示，不再有藏符号开关', () => {
    const zeroIds = ['ssp_group1', 'ssp_group2', 'ssp_group3', 'ssp_more_consonants', 'sound_short_vowels'];
    for (const id of zeroIds) {
      const step = ENGLISH_PATH[0].steps.find((item) => item.id === id)!;
      for (const sound of step.sounds ?? []) {
        expect(sound.ipa, `${id}:${sound.letter} 音标`).toMatch(/^\/.+\/$/);
        expect((sound.mouth || '').length, `${id}:${sound.letter} 口型提示`).toBeGreaterThan(4);
      }
      for (const field of [step.goal, step.explanation, step.tip, step.task]) {
        expect(field.includes('闭音节'), `${id} 文案泄漏「闭音节」术语`).toBe(false);
      }
    }
    // 展示与否由组件统一处理，数据层不再留与行为相反的 ipaHidden 开关
    for (const stage of ENGLISH_PATH) {
      for (const step of stage.steps) {
        expect('ipaHidden' in step, `${step.id} 不应再有 ipaHidden`).toBe(false);
      }
    }
  });

  it('拼读演示数据由服务端结构化提供，不靠前端猜辅音音素', () => {
    const step = ENGLISH_PATH[0].steps.find((item) => item.id === 'sound_blending')!;
    expect(step.blend?.length).toBeGreaterThan(0);
    for (const group of step.blend ?? []) {
      expect(group.word).toBe('cat');
      for (const part of group.parts) {
        expect(part.ipa.startsWith('/'), `${part.text} 的音素`).toBe(true);
      }
    }
  });

  it('按人群分轨：零基础 / 初中 / 高中 / 成人从不同入口课进入', () => {
    const stageIds = (track: Parameters<typeof getEnglishPath>[0]) =>
      getEnglishPath(track).map((stage) => stage.id);
    // 除发音段外的阶段四条轨道完全一致（切轨不丢课程结构）
    expect(stageIds('junior')).toEqual(stageIds('zero'));
    expect(stageIds('senior')).toEqual(stageIds('zero'));
    expect(stageIds('adult')).toEqual(stageIds('zero'));

    const zeroIds = getEnglishPath('zero')[0].steps.map((step) => step.id);
    expect(zeroIds[0]).toBe('letter_name_vs_sound');
    expect(zeroIds).toContain('ssp_group2');

    const juniorIds = getEnglishPath('junior')[0].steps.map((step) => step.id);
    expect(juniorIds[0]).toBe('junior_ipa_map');
    expect(juniorIds).not.toContain('ssp_group1');
    expect(juniorIds).toContain('sound_short_vowels'); // 归纳与拼读课保留

    expect(getEnglishPath('senior')[0].steps.map((step) => step.id)).toEqual(['senior_sound_fix']);
    expect(getEnglishPath('adult')[0].steps.map((step) => step.id)).toEqual(['adult_ipa_crash']);

    // 非法轨道回退零基础；轨道元信息完整
    expect(getEnglishPath()[0].steps[0].id).toBe('letter_name_vs_sound');
    expect(normalizeEnglishTrack('bogus')).toBe('zero');
    expect(ENGLISH_TRACKS.map((track) => track.id)).toEqual(['zero', 'junior', 'senior', 'adult']);
    expect(new Set(ENGLISH_TRACKS.map((track) => track.name)).size).toBe(4);
  });

  it('分轨返回副本：修改初中轨不影响课程真相源', () => {
    const junior = getEnglishPath('junior');
    junior[0].steps[0].title = 'changed';
    expect(ENGLISH_PATH[0].steps[0].title).not.toBe('changed');
    expect(junior[0].steps[0].quickCheck).toBeTruthy();
  });

  it('回译课只出现在初中/高中/成人轨，零基础轨为 0 节', () => {
    const count = (track: Parameters<typeof getEnglishPath>[0]) =>
      getEnglishPath(track).flatMap((stage) => stage.steps).filter((step) => step.kind === 'translate').length;
    expect(count('zero')).toBe(0);
    expect(count('junior')).toBeGreaterThanOrEqual(5);
    expect(count('senior')).toBeGreaterThanOrEqual(5);
    expect(count('adult')).toBeGreaterThanOrEqual(5);
    const ids = getEnglishPath('junior').flatMap((stage) => stage.steps).filter((step) => step.kind === 'translate').map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('回译课结构完整：源句/参考译文/差异提示三者俱全', () => {
    for (const stage of ENGLISH_PATH) {
      for (const step of stage.steps.filter((item) => item.kind === 'translate')) {
        expect(step.translate?.length, step.id).toBeGreaterThanOrEqual(3);
        for (const item of step.translate!) {
          expect(item.zh.length, step.id).toBeGreaterThan(4);
          expect(item.en.length, step.id).toBeGreaterThan(4);
          expect(item.note.length, `${step.id}:${item.zh}`).toBeGreaterThan(10);
        }
        expect(step.examples.length, step.id).toBe(0);
      }
    }
  });

  it('每课都有教法标签，特殊课显式覆盖', () => {
    for (const track of ['zero', 'junior', 'senior', 'adult'] as const) {
      for (const step of getEnglishPath(track).flatMap((stage) => stage.steps)) {
        expect((step.method || '').length, `${track}:${step.id}`).toBeGreaterThan(0);
      }
    }
    const zero = getEnglishPath('zero').flatMap((stage) => stage.steps);
    expect(zero.find((step) => step.id === 'letter_name_vs_sound')?.method).toBe('听辨');
    expect(zero.find((step) => step.id === 'sound_short_vowels')?.method).toBe('听辨');
    expect(zero.find((step) => step.id === 'ssp_group1')?.method).toBe('拼读');
    const byTrack = (track: Parameters<typeof getEnglishPath>[0], id: string) =>
      getEnglishPath(track).flatMap((stage) => stage.steps).find((step) => step.id === id)?.method;
    expect(byTrack('junior', 'junior_ipa_map')).toBe('音标分组');
    expect(byTrack('senior', 'senior_sound_fix')).toBe('听辨');
    expect(byTrack('adult', 'adult_ipa_crash')).toBe('速通');
    expect(getEnglishPath('junior').flatMap((stage) => stage.steps).find((step) => step.kind === 'translate')?.method).toBe('回译');
  });

  it('故事/寓言课关联阅读 Tab 范文，可对照细读', () => {
    const passageIds = new Set(READING_PASSAGES.map((passage) => passage.id));
    const linked = ENGLISH_PATH.flatMap((stage) => stage.steps).filter((step) => step.readingPassageId);
    expect(linked.length).toBeGreaterThanOrEqual(3);
    for (const step of linked) {
      expect(passageIds.has(step.readingPassageId!), step.id).toBe(true);
      expect(step.examples.length, step.id).toBeGreaterThan(0);
    }
  });

  it('理念融入：语法课自带中英对照翻译（机器翻译帮助语法理解）', () => {
    const grammarSteps = ENGLISH_PATH
      .find((stage) => stage.id === 'sentence-core')!.steps
      .filter((step) => step.kind === 'grammar');
    expect(grammarSteps.length).toBeGreaterThanOrEqual(40);
    for (const step of grammarSteps) {
      // 每节语法课都有「中文源句 → 参考译文 → 差异提示」的翻译对照
      expect(step.translate?.length, step.id).toBeGreaterThanOrEqual(1);
      for (const item of step.translate!) {
        expect(item.zh.length, step.id).toBeGreaterThan(3);
        expect(item.en.length, step.id).toBeGreaterThan(3);
        expect(item.note.length, `${step.id}:${item.zh}`).toBeGreaterThan(10);
      }
      // 目录派生的 40 节课：差异提示必须带正误对照（常见错误 → 正确说法）
      if (step.id.startsWith('path_g_')) {
        for (const item of step.translate!) {
          expect(item.note, `${step.id}:${item.zh}`).toContain('常见错误');
        }
      }
      // 教案文案点明翻译对照学法
      expect(step.explanation.includes('对照'), `${step.id} explanation`).toBe(true);
      expect(step.tip.includes('对照'), `${step.id} tip`).toBe(true);
      expect(step.task.includes('对照'), `${step.id} task`).toBe(true);
    }
  });

  it('理念融入：拼读课教「会读就会拼」，词根课点明「词根记单词」', () => {
    const sounds = ENGLISH_PATH.find((stage) => stage.id === 'sounds')!.steps;
    expect(sounds.find((step) => step.id === 'ssp_group1')!.explanation).toContain('记单词靠拼读');
    expect(sounds.find((step) => step.id === 'sound_blending')!.explanation).toContain('用拼读记单词');
    const roots = ENGLISH_PATH.find((stage) => stage.id === 'word-building')!.steps.filter((step) => step.kind === 'roots');
    for (const step of roots) {
      expect(step.explanation.includes('记单词'), `${step.id} 理念句`).toBe(true);
    }
  });
});

describe('44 音标谱（音标谱工具页数据源）', () => {
  it('六组共 44 音：IPA 无重复、例词纯字母、释义齐备', () => {
    expect(ENGLISH_PHONIC_CHART.map((group) => group.label)).toEqual([
      '短元音', '长元音', '双元音', '清浊辅音对', '鼻音', '其他辅音',
    ]);
    const items = ENGLISH_PHONIC_CHART.flatMap((group) => group.items);
    expect(items.length).toBe(44);
    expect(new Set(items.map((item) => item.ipa)).size).toBe(items.length);
    for (const item of items) {
      expect(/^[A-Za-z'-]+$/.test(item.word), `${item.ipa} 例词 "${item.word}" 不是纯字母词`).toBe(true);
      expect(item.gloss.length, `${item.ipa} 释义`).toBeGreaterThan(0);
    }
    // 清浊辅音对：16 音按「清在前、浊在后」成对排布
    const pairs = ENGLISH_PHONIC_CHART.find((group) => group.key === 'pairs')!.items;
    expect(pairs.length).toBe(16);
  });
});
