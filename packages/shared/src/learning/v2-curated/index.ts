import { CALLIGRAPHY_CURATED_PLANS } from './calligraphy.js';
import { CORE_MATH_CURATED_PLANS } from './core-math.js';
import { CORE_PHYSICS_CURATED_PLANS } from './core-physics.js';
import { CORE_ENGLISH_CURATED_PLANS } from './core-english.js';
import { COMPLETION_DIVINATION_CURATED_PLANS } from './completion-divination.js';
import { CURRENT_COURSE_CURATED_PLANS } from './current-course-curated.js';
import { ADVANCED_HUMANITIES_CURATED_PLANS } from './advanced-humanities.js';
import { ADVANCED2_HUMANITIES_CURATED_PLANS } from './advanced2-humanities.js';
import { MILESTONE_HUMANITIES_CURATED_PLANS } from './milestone-humanities.js';
import { ADVANCED_FOUNDATIONS_CURATED_PLANS } from './advanced-foundations.js';
import { ADVANCED2_FOUNDATIONS_CURATED_PLANS } from './advanced2-foundations.js';
import { MILESTONE_FOUNDATIONS_CURATED_PLANS } from './milestone-foundations.js';
import { ADVANCED_LANGUAGES_CULTURE_CURATED_PLANS } from './advanced-languages-culture.js';
import { ADVANCED2_LANGUAGES_CULTURE_CURATED_PLANS } from './advanced2-languages-culture.js';
import { MILESTONE_LANGUAGES_CULTURE_CURATED_PLANS } from './milestone-languages-culture.js';
import { ECONOMICS_CURATED_PLANS } from './economics.js';
import { FOUNDATIONS_CURATED_PLANS } from './foundations.js';
import { HUMANITIES_CURATED_PLANS } from './humanities.js';
import { JAPANESE_CURATED_PLANS } from './japanese.js';
import { PHYSICS_CURATED_PLANS } from './physics.js';
import { PRACTICAL_CULTURE_CURATED_PLANS } from './practical-culture.js';
import { PRIORITY_EXPANSION_CURATED_PLANS } from './priority-expansion.js';
import { SECURITY_CURATED_PLANS } from './security.js';
import { ZHOUYI_CURATED_PLANS } from './zhouyi.js';
import type { CuratedCoursePlanMap } from './types.js';

export const LEARNING_V2_CURATED_PLANS: CuratedCoursePlanMap = {
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
  ...CALLIGRAPHY_CURATED_PLANS,
  ...ECONOMICS_CURATED_PLANS,
  ...FOUNDATIONS_CURATED_PLANS,
  ...HUMANITIES_CURATED_PLANS,
  ...PHYSICS_CURATED_PLANS,
  ...PRACTICAL_CULTURE_CURATED_PLANS,
  ...PRIORITY_EXPANSION_CURATED_PLANS,
  ...JAPANESE_CURATED_PLANS,
  ...SECURITY_CURATED_PLANS,
  ...ZHOUYI_CURATED_PLANS,
};
