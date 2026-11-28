import type { CuratedCoursePlanPatchMap } from '../types.js';
import { ECONOMICS_FOUNDATIONS_REWRITE } from './economics-foundations.js';
import { DIVINATION_REWRITE } from './divination.js';
import { ECONOMICS_MACRO_REWRITE } from './economics-macro.js';
import { ECONOMICS_MICRO_REWRITE } from './economics-micro.js';
import { ECONOMICS_THOUGHT_REWRITE } from './economics-thought.js';
import { ENGLISH_FOUNDATIONS_REWRITE } from './english-foundations.js';
import { ENGLISH_HIGH_SCHOOL_REWRITE } from './english-high-school.js';
import { ENGLISH_INTERNATIONAL_REWRITE } from './english-international.js';
import { ENGLISH_SECONDARY_REWRITE } from './english-secondary.js';
import { ENGLISH_UNIVERSITY_REWRITE } from './english-university.js';
import { ENGLISH_VOCABULARY_GRAMMAR_REWRITE } from './english-vocabulary-grammar.js';
import { CALLIGRAPHY_FOUNDATIONS_REWRITE } from './calligraphy-foundations.js';
import { CULTURE_CLASSICS_REWRITE } from './culture-classics.js';
import { CALLIGRAPHY_COPYBOOKS_REWRITE } from './calligraphy-copybooks.js';
import { CALLIGRAPHY_PRACTICAL_REWRITE } from './calligraphy-practical.js';
import { CALLIGRAPHY_RUNNING_REWRITE } from './calligraphy-running.js';
import { HISTORY_CHINA_REWRITE } from './history-china.js';
import { HISTORY_METHODS_REWRITE } from './history-methods.js';
import { HISTORY_THEMES_REWRITE } from './history-themes.js';
import { HISTORY_WORLD_REWRITE } from './history-world.js';
import { JAPANESE_FOUNDATIONS_REWRITE } from './japanese-foundations.js';
import { JAPANESE_GRAMMAR_REWRITE } from './japanese-grammar.js';
import { JAPANESE_SCENARIOS_REWRITE } from './japanese-scenarios.js';
import { JAPANESE_READING_EXAM_REWRITE } from './japanese-reading-exam.js';
import { MILITARY_ANCIENT_REWRITE } from './military-ancient.js';
import { MUSIC_FOUNDATIONS_REWRITE } from './music-foundations.js';
import { MILITARY_FOUNDATIONS_REWRITE } from './military-foundations.js';
import { MILITARY_SECURITY_REWRITE } from './military-security.js';
import { MILITARY_WORLD_WAR_REWRITE } from './military-world-war.js';
import { MEMORY_FOUNDATIONS_REWRITE } from './memory-foundations.js';
import { MEMORY_METHODS_REWRITE } from './memory-methods.js';
import { MEMORY_REVIEW_SYSTEM_REWRITE } from './memory-review-system.js';
import { MEMORY_SUBJECT_TRANSFER_REWRITE } from './memory-subject-transfer.js';
import { PARTY_NEW_DEMOCRATIC_REWRITE } from './party-new-democratic.js';
import { PARTY_NEW_ERA_REWRITE } from './party-new-era.js';
import { PARTY_REFORM_OPENING_REWRITE } from './party-reform-opening.js';
import { PARTY_SOCIALIST_CONSTRUCTION_REWRITE } from './party-socialist-construction.js';
import { PARTY_STUDY_POINTS } from './party-study-points.js';
import { PHYSICS_ELECTROMAGNETISM_REWRITE } from './physics-electromagnetism.js';
import { PHYSICS_LAB_REWRITE } from './physics-lab.js';
import { PHYSICS_MECHANICS_REWRITE } from './physics-mechanics.js';
import { PHYSICS_MODERN_REWRITE } from './physics-modern.js';
import { PROGRAMMING_REWRITE } from './programming.js';
import { POLITICS_ANCIENT_REWRITE } from './politics-ancient.js';
import { POLITICS_FIRST_PRINCIPLES_REWRITE } from './politics-first-principles.js';
import { POLITICS_INSTITUTIONS_REWRITE } from './politics-institutions.js';
import { POLITICS_THOUGHT_REWRITE } from './politics-thought.js';
import { SCHOOLS_CHINA_REWRITE } from './schools-china.js';
import { SCHOOLS_TOPICS_REWRITE } from './schools-topics.js';
import { SCHOOLS_WORLD_REWRITE } from './schools-world.js';
import { SOFT_EXAM_REWRITE } from './soft-exam.js';
import { SECURITY_CORE_REWRITE } from './security-core.js';
import { SECURITY_ADVANCED_REWRITE } from './security-advanced.js';
import { SECURITY_PRACTICE_REWRITE } from './security-practice.js';
import { MATH_FOUNDATIONS_REWRITE } from './math-foundations.js';
import { MATH_HIGH_SCHOOL_REWRITE } from './math-high-school.js';
import { MATH_THINKING_REWRITE } from './math-thinking.js';
import { MATH_UNIVERSITY_REWRITE } from './math-university.js';
import { THINKING_CLEAR_REWRITE } from './thinking-clear.js';
import { THINKING_LOGIC_REWRITE } from './thinking-logic.js';
import { THINKING_STRUCTURED_REWRITE } from './thinking-structured.js';
import { THINKING_SYSTEMS_REWRITE } from './thinking-systems.js';
import { ZHOUYI_INTRODUCTION_REWRITE } from './zhouyi-introduction.js';
import { ZHOUYI_SHUXIANG_REWRITE } from './zhouyi-shuxiang.js';
import { FINAL_SUBJECTS_REWRITE } from './final-subjects.js';

function mergeRewriteLayers(
  ...layers: readonly CuratedCoursePlanPatchMap[]
): CuratedCoursePlanPatchMap {
  const merged: Record<string, CuratedCoursePlanPatchMap[string]> = {};
  for (const layer of layers) {
    for (const [key, patch] of Object.entries(layer)) {
      merged[key] = { ...merged[key], ...patch };
    }
  }
  return merged;
}

/**
 * 章节重写覆盖层。新章节必须在这里按“先验收、后接入”顺序登记，
 * 并放在现有历史上限补丁之后，确保旧摘要、深度补丁和题库补丁不能覆盖新教案。
 */
export const LEARNING_V2_REWRITTEN_PLANS = mergeRewriteLayers(
  CALLIGRAPHY_FOUNDATIONS_REWRITE,
  CULTURE_CLASSICS_REWRITE,
  CALLIGRAPHY_COPYBOOKS_REWRITE,
  CALLIGRAPHY_RUNNING_REWRITE,
  CALLIGRAPHY_PRACTICAL_REWRITE,
  ENGLISH_FOUNDATIONS_REWRITE,
  ENGLISH_HIGH_SCHOOL_REWRITE,
  ENGLISH_INTERNATIONAL_REWRITE,
  ENGLISH_SECONDARY_REWRITE,
  ENGLISH_UNIVERSITY_REWRITE,
  ENGLISH_VOCABULARY_GRAMMAR_REWRITE,
  PARTY_NEW_DEMOCRATIC_REWRITE,
  PARTY_SOCIALIST_CONSTRUCTION_REWRITE,
  PARTY_REFORM_OPENING_REWRITE,
  PARTY_NEW_ERA_REWRITE,
  PARTY_STUDY_POINTS,
  POLITICS_FIRST_PRINCIPLES_REWRITE,
  POLITICS_ANCIENT_REWRITE,
  POLITICS_THOUGHT_REWRITE,
  POLITICS_INSTITUTIONS_REWRITE,
  ECONOMICS_FOUNDATIONS_REWRITE,
  DIVINATION_REWRITE,
  ECONOMICS_MICRO_REWRITE,
  ECONOMICS_MACRO_REWRITE,
  ECONOMICS_THOUGHT_REWRITE,
  HISTORY_METHODS_REWRITE,
  HISTORY_CHINA_REWRITE,
  HISTORY_WORLD_REWRITE,
  HISTORY_THEMES_REWRITE,
  JAPANESE_FOUNDATIONS_REWRITE,
  JAPANESE_GRAMMAR_REWRITE,
  JAPANESE_SCENARIOS_REWRITE,
  JAPANESE_READING_EXAM_REWRITE,
  MILITARY_FOUNDATIONS_REWRITE,
  MILITARY_ANCIENT_REWRITE,
  MUSIC_FOUNDATIONS_REWRITE,
  MILITARY_WORLD_WAR_REWRITE,
  MILITARY_SECURITY_REWRITE,
  MEMORY_FOUNDATIONS_REWRITE,
  MEMORY_METHODS_REWRITE,
  MEMORY_SUBJECT_TRANSFER_REWRITE,
  MEMORY_REVIEW_SYSTEM_REWRITE,
  THINKING_CLEAR_REWRITE,
  THINKING_LOGIC_REWRITE,
  THINKING_STRUCTURED_REWRITE,
  THINKING_SYSTEMS_REWRITE,
  MATH_FOUNDATIONS_REWRITE,
  MATH_HIGH_SCHOOL_REWRITE,
  MATH_UNIVERSITY_REWRITE,
  MATH_THINKING_REWRITE,
  PHYSICS_MECHANICS_REWRITE,
  PHYSICS_ELECTROMAGNETISM_REWRITE,
  PHYSICS_MODERN_REWRITE,
  PHYSICS_LAB_REWRITE,
  SCHOOLS_CHINA_REWRITE,
  SCHOOLS_WORLD_REWRITE,
  SCHOOLS_TOPICS_REWRITE,
  SOFT_EXAM_REWRITE,
  SECURITY_CORE_REWRITE,
  SECURITY_ADVANCED_REWRITE,
  SECURITY_PRACTICE_REWRITE,
  ZHOUYI_INTRODUCTION_REWRITE,
  ZHOUYI_SHUXIANG_REWRITE,
  PROGRAMMING_REWRITE,
  FINAL_SUBJECTS_REWRITE,
);

export const LEARNING_V2_REWRITTEN_COURSE_KEYS = new Set(
  Object.keys(LEARNING_V2_REWRITTEN_PLANS),
);
