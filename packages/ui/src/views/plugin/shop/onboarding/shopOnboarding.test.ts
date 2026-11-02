import { describe, expect, it } from 'vitest';
import {
  buildQuickShopPrompt,
  buildShopSetupPrompt,
  createDefaultShopSetupProfile,
  normalizeShopSetupProfile,
  setupProgressOf,
} from './shopOnboarding';

describe('shop onboarding', () => {
  it('从空白资料开始，定位阶段未完成', () => {
    const profile = createDefaultShopSetupProfile();
    const progress = setupProgressOf(profile, false);

    expect(progress.completed).toBe(0);
    expect(progress.nextStep?.id).toBe('position');
    expect(progress.steps.find((step) => step.id === 'position')?.state).toBe('active');
  });

  it('平台、市场、品类和预算齐全后，自动完成定位并推进到账号准备', () => {
    const profile = normalizeShopSetupProfile({
      platform: 'amazon',
      market: '美国',
      category: '家居收纳',
      budgetYuan: '30000',
    });
    const progress = setupProgressOf(profile, false);

    expect(progress.completed).toBe(1);
    expect(progress.nextStep?.id).toBe('account');
    expect(progress.steps.find((step) => step.id === 'position')?.state).toBe('done');
  });

  it('已有店铺连接时，平台开店阶段自动完成', () => {
    const profile = normalizeShopSetupProfile({
      platform: 'taobao',
      market: '中国',
      category: '女装',
      budgetYuan: '20000',
      hasAccount: true,
      hasQualification: true,
    });
    const progress = setupProgressOf(profile, true);

    expect(progress.steps.find((step) => step.id === 'open')?.state).toBe('done');
    expect(progress.nextStep?.id).toBe('selection');
  });

  it('用户标记完成的阶段会影响总进度', () => {
    const profile = normalizeShopSetupProfile({
      platform: 'shopify',
      market: '欧洲',
      category: '宠物用品',
      budgetYuan: '50000',
      hasAccount: true,
      hasQualification: true,
      completedSteps: ['selection', 'listing'],
    });
    const progress = setupProgressOf(profile, true);

    expect(progress.completed).toBe(5);
    expect(progress.nextStep?.id).toBe('operate');
  });

  it('AI 指令包含用户已提供的信息和登录边界', () => {
    const profile = normalizeShopSetupProfile({
      platform: 'amazon',
      market: '美国',
      category: '厨房小工具',
      budgetYuan: '30000',
      hasAccount: false,
      hasQualification: true,
      supplyChoice: 'dropship',
      experience: 'beginner',
    });
    const prompt = buildShopSetupPrompt(profile, {
      projectTitle: '我的第一家店',
      platformLabel: '亚马逊',
    });

    expect(prompt).toContain('我的第一家店');
    expect(prompt).toContain('亚马逊');
    expect(prompt).toContain('美国');
    expect(prompt).toContain('厨房小工具');
    expect(prompt).toContain('30000');
    expect(prompt).toContain('无货源');
    expect(prompt).toContain('账号密码、验证码、支付密码由我本人操作');
    expect(prompt).toContain('不要再重复询问');
  });

  it('个人身份开店不要求营业执照，个体工商户才要求执照', () => {
    const personal = normalizeShopSetupProfile({
      platform: 'douyin',
      market: '中国',
      category: '宠物用品',
      budgetYuan: '1000',
      entityType: 'individual',
      hasAccount: true,
      hasQualification: true,
    });
    const personalPrompt = buildShopSetupPrompt(personal);
    expect(personalPrompt).toContain('个人身份（身份证开店）');
    expect(personalPrompt).toContain('个人身份店不得要求营业执照');
    expect(personalPrompt).toContain('直接进入平台实际开店创建流程');

    const sole = normalizeShopSetupProfile({
      ...personal,
      entityType: 'sole_proprietor',
    });
    expect(sole.entityType).toBe('sole_proprietor');
    expect(buildShopSetupPrompt(sole)).toContain('个体工商户（需要营业执照）');
  });

  it('快捷任务会带上当前平台与阶段，并明确交付物', () => {
    const profile = normalizeShopSetupProfile({
      platform: 'tiktok',
      market: '美国',
      category: '美妆工具',
      budgetYuan: '15000',
    });
    const prompt = buildQuickShopPrompt('selection', profile);

    expect(prompt).toContain('TikTok Shop');
    expect(prompt).toContain('美国');
    expect(prompt).toContain('美妆工具');
    expect(prompt).toContain('选品清单');
    expect(prompt).toContain('利润测算');
  });

  it('损坏或不完整的本地资料会回落到安全默认值', () => {
    const profile = normalizeShopSetupProfile({
      platform: 'unknown',
      market: 42,
      completedSteps: ['open', 'unknown'],
    });

    expect(profile.platform).toBe('undecided');
    expect(profile.market).toBe('');
    expect(profile.completedSteps).toEqual(['open']);
  });
});
