import { CALLIGRAPHY_CURATED_PLANS } from './calligraphy.js';
import { ALGORITHM_CURATED_PLANS } from '../algorithms.js';
import { CORE_MATH_CURATED_PLANS } from './core-math.js';
import { CORE_PHYSICS_CURATED_PLANS } from './core-physics.js';
import { CORE_ENGLISH_CURATED_PLANS } from './core-english.js';
import { COMPLETION_DIVINATION_CURATED_PLANS } from './completion-divination.js';
import { CURRENT_COURSE_CURATED_PLANS } from './current-course-curated.js';
import { ARTS_DEPTH_PATCHES } from './depth-arts.js';
import { FOUNDATION_DEPTH2_PATCHES } from './depth2-foundations.js';
import { LANGUAGE_DEPTH2_PATCHES } from './depth2-languages.js';
import { PROFESSIONAL_DEPTH2_PATCHES } from './depth2-professional.js';
import { SOCIAL_DEPTH2_PATCHES } from './depth2-social.js';
import { HUMANITIES_DEPTH_PATCHES } from './depth-humanities.js';
import { LANGUAGE_DEPTH_PATCHES } from './depth-languages.js';
import { STEM_DEPTH_PATCHES } from './depth-stem.js';
import { ADVANCED_HUMANITIES_CURATED_PLANS } from './advanced-humanities.js';
import { ADVANCED2_HUMANITIES_CURATED_PLANS } from './advanced2-humanities.js';
import { MILESTONE_HUMANITIES_CURATED_PLANS } from './milestone-humanities.js';
import { ADVANCED_FOUNDATIONS_CURATED_PLANS } from './advanced-foundations.js';
import { ADVANCED2_FOUNDATIONS_CURATED_PLANS } from './advanced2-foundations.js';
import { MILESTONE_FOUNDATIONS_CURATED_PLANS } from './milestone-foundations.js';
import { ADVANCED_LANGUAGES_CULTURE_CURATED_PLANS } from './advanced-languages-culture.js';
import { ADVANCED2_LANGUAGES_CULTURE_CURATED_PLANS } from './advanced2-languages-culture.js';
import { MILESTONE_LANGUAGES_CULTURE_CURATED_PLANS } from './milestone-languages-culture.js';
import { ARTS_HUMANITIES_REMAINING_CURATED_PLANS } from './arts-humanities-remaining.js';
import { ECONOMICS_CURATED_PLANS } from './economics.js';
import { FOUNDATIONS_CURATED_PLANS } from './foundations.js';
import { HUMANITIES_CURATED_PLANS } from './humanities.js';
import { JAPANESE_CURATED_PLANS } from './japanese.js';
import { JAPANESE_REMAINING_CURATED_PLANS } from './japanese-remaining.js';
import { MEDICINE_CURATED_PLANS } from '../medicine.js';
import { PHYSICS_CURATED_PLANS } from './physics.js';
import { PARTY_REMAINING_CURATED_PLANS } from './party-remaining.js';
import { POLITICS_REMAINING_CURATED_PLANS } from './politics-remaining.js';
import { PRACTICAL_CULTURE_CURATED_PLANS } from './practical-culture.js';
import { PROGRAMMING_CURATED_PLANS } from './programming/catalog.js';
import { PRIORITY_EXPANSION_CURATED_PLANS } from './priority-expansion.js';
import { ARTS_USABILITY_PATCHES } from './quiz-practice-arts.js';
import { HUMANITIES_USABILITY_PATCHES } from './quiz-practice-humanities.js';
import { LANGUAGE_USABILITY_PATCHES } from './quiz-practice-languages.js';
import { STEM_USABILITY_PATCHES } from './quiz-practice-stem.js';
import { ALGORITHM_FOUR_OPTION_PATCHES } from './quiz-four-option-algorithms.js';
import { PROGRAMMING_FOUR_OPTION_PATCHES } from './quiz-four-option-programming.js';
import { FOUNDATION_REVIEW_QUALITY_PATCHES } from './review-quality-foundations.js';
import { LANGUAGE_REVIEW_QUALITY_PATCHES } from './review-quality-languages.js';
import { PROFESSIONAL_REVIEW_QUALITY_PATCHES } from './review-quality-professional.js';
import { SOCIAL_REVIEW_QUALITY_PATCHES } from './review-quality-social.js';
import { MEDICINE_SPECIFICITY_PATCHES } from './review-medicine-specificity.js';
import { SECURITY_CURATED_PLANS } from './security.js';
import { SOCIAL_SCIENCE_REMAINING_CURATED_PLANS } from './social-science-remaining.js';
import { ZHOUYI_CURATED_PLANS } from './zhouyi.js';
import { ZHOUYI_REMAINING_CURATED_PLANS } from './zhouyi-remaining.js';
import { mergeCuratedCoursePlans, type CuratedCoursePlanMap } from './types.js';

const BASE_LEARNING_V2_CURATED_PLANS: CuratedCoursePlanMap = {
  ...ALGORITHM_CURATED_PLANS,
  ...CORE_MATH_CURATED_PLANS,
  ...CORE_PHYSICS_CURATED_PLANS,
  ...CORE_ENGLISH_CURATED_PLANS,
  ...COMPLETION_DIVINATION_CURATED_PLANS,
  ...CURRENT_COURSE_CURATED_PLANS,
  ...ADVANCED_HUMANITIES_CURATED_PLANS,
  ...ADVANCED2_HUMANITIES_CURATED_PLANS,
  ...MILESTONE_HUMANITIES_CURATED_PLANS,
  ...ADVANCED_FOUNDATIONS_CURATED_PLANS,
  ...ADVANCED2_FOUNDATIONS_CURATED_PLANS,
  ...MILESTONE_FOUNDATIONS_CURATED_PLANS,
  ...ADVANCED_LANGUAGES_CULTURE_CURATED_PLANS,
  ...ADVANCED2_LANGUAGES_CULTURE_CURATED_PLANS,
  ...MILESTONE_LANGUAGES_CULTURE_CURATED_PLANS,
  ...ARTS_HUMANITIES_REMAINING_CURATED_PLANS,
  ...CALLIGRAPHY_CURATED_PLANS,
  ...ECONOMICS_CURATED_PLANS,
  ...FOUNDATIONS_CURATED_PLANS,
  ...HUMANITIES_CURATED_PLANS,
  ...PHYSICS_CURATED_PLANS,
  ...PARTY_REMAINING_CURATED_PLANS,
  ...POLITICS_REMAINING_CURATED_PLANS,
  ...PRACTICAL_CULTURE_CURATED_PLANS,
  ...PROGRAMMING_CURATED_PLANS,
  ...PRIORITY_EXPANSION_CURATED_PLANS,
  ...JAPANESE_CURATED_PLANS,
  ...JAPANESE_REMAINING_CURATED_PLANS,
  ...MEDICINE_CURATED_PLANS,
  ...SECURITY_CURATED_PLANS,
  ...SOCIAL_SCIENCE_REMAINING_CURATED_PLANS,
  ...ZHOUYI_CURATED_PLANS,
  ...ZHOUYI_REMAINING_CURATED_PLANS,
};

export const LEARNING_V2_CURATED_PLANS = mergeCuratedCoursePlans(
  BASE_LEARNING_V2_CURATED_PLANS,
  ARTS_USABILITY_PATCHES,
  HUMANITIES_USABILITY_PATCHES,
  LANGUAGE_USABILITY_PATCHES,
  STEM_USABILITY_PATCHES,
  PROGRAMMING_FOUR_OPTION_PATCHES,
  ALGORITHM_FOUR_OPTION_PATCHES,
  ARTS_DEPTH_PATCHES,
  HUMANITIES_DEPTH_PATCHES,
  LANGUAGE_DEPTH_PATCHES,
  STEM_DEPTH_PATCHES,
  SOCIAL_REVIEW_QUALITY_PATCHES,
  FOUNDATION_REVIEW_QUALITY_PATCHES,
  LANGUAGE_REVIEW_QUALITY_PATCHES,
  PROFESSIONAL_REVIEW_QUALITY_PATCHES,
  FOUNDATION_DEPTH2_PATCHES,
  LANGUAGE_DEPTH2_PATCHES,
  PROFESSIONAL_DEPTH2_PATCHES,
  SOCIAL_DEPTH2_PATCHES,
  MEDICINE_SPECIFICITY_PATCHES,
);
