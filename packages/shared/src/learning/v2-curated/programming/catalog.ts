import type {
  LearningV2CuratedCoursePlan,
  LearningV2Practice,
  LearningV2Subject,
} from '../../v2-types.js';
import { PROGRAMMING_BACKEND_COURSES } from './backend.js';
import { PROGRAMMING_CORE_COURSES } from './core.js';
import { PROGRAMMING_JAVA_ADVANCED_COURSES } from './java-advanced.js';
import { PROGRAMMING_JAVA_FOUNDATION_COURSES } from './java-foundations.js';
import { PROGRAMMING_OTHER_COURSE_SEEDS } from './programs.js';
import { PROGRAMMING_PROJECT_COURSE_SEEDS } from './projects.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_01_COURSES } from './handwritten/project-training-batch-01.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_02_COURSES } from './handwritten/project-training-batch-02.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_03_COURSES } from './handwritten/project-training-batch-03.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_04_COURSES } from './handwritten/project-training-batch-04.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_05_COURSES } from './handwritten/project-training-batch-05.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_06_COURSES } from './handwritten/project-training-batch-06.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_07_COURSES } from './handwritten/project-training-batch-07.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_08_COURSES } from './handwritten/project-training-batch-08.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_09_COURSES } from './handwritten/project-training-batch-09.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_10_COURSES } from './handwritten/project-training-batch-10.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_11_COURSES } from './handwritten/project-training-batch-11.js';
import { PROGRAMMING_COURSE_QUIZ } from './quiz.js';
// 手写教案：spread 放末尾覆盖同名模板课（逐门进度见 docs/编程课程教案重写进度-2026-11-21.md）
import {
  HANDWRITTEN_PROGRAMMING_FOUNDATION_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_F1_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_F2_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_F3_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_F4_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_F5_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_H0_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_H1_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_H2_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_H3_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_H4_COURSES,
  HANDWRITTEN_PROGRAMMING_FOUNDATION_H5_COURSES,
} from './handwritten/programming-foundations.js';
import {
  HANDWRITTEN_PYTHON_ENTERPRISE_P0_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P1_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P2_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P3_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P4_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P5_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P6_COURSES,
} from './handwritten/python-enterprise.js';
import {
  HANDWRITTEN_GO_CLOUD_G0_COURSES,
  HANDWRITTEN_GO_CLOUD_G1_COURSES,
  HANDWRITTEN_GO_CLOUD_G2_COURSES,
  HANDWRITTEN_GO_CLOUD_G3_COURSES,
  HANDWRITTEN_GO_CLOUD_G4_COURSES,
  HANDWRITTEN_GO_CLOUD_G5_COURSES,
  HANDWRITTEN_GO_CLOUD_G6_COURSES,
} from './handwritten/go-cloud.js';
import {
  HANDWRITTEN_C_SYSTEMS_C0_COURSES,
  HANDWRITTEN_C_SYSTEMS_C1_COURSES,
  HANDWRITTEN_C_SYSTEMS_C2_COURSES,
  HANDWRITTEN_C_SYSTEMS_C3_COURSES,
  HANDWRITTEN_C_SYSTEMS_C4_COURSES,
  HANDWRITTEN_C_SYSTEMS_C5_COURSES,
  HANDWRITTEN_C_SYSTEMS_C6_COURSES,
} from './handwritten/c-systems.js';
import {
  HANDWRITTEN_CPP_PERFORMANCE_X0_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X1_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X2_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X3_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X4_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X5_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X6_COURSES,
} from './handwritten/cpp-performance.js';
import {
  HANDWRITTEN_AI_PROGRAMMING_A0_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A1_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A2_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A3_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A4_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A5_COURSES,
} from './handwritten/ai-programming.js';
import {
  HANDWRITTEN_TESTING_QUALITY_Q0_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q1_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q2_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q3_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q4_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q5_COURSES,
} from './handwritten/testing-quality.js';
import {
  HANDWRITTEN_SECURITY_ENGINEERING_S0_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S1_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S2_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S3_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S4_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S5_COURSES,
} from './handwritten/security-engineering.js';
import {
  HANDWRITTEN_MIDDLEWARE_SOURCE_M0_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M1_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M2_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M3_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M4_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M5_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M6_COURSES,
} from './handwritten/middleware-source.js';
import {
  HANDWRITTEN_SOFTWARE_ENGINEERING_E0_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E1_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E2_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E3_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E4_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E5_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E6_COURSES,
} from './handwritten/software-engineering.js';
import {
  HANDWRITTEN_CSS3_C0_COURSES,
  HANDWRITTEN_CSS3_C1_COURSES,
  HANDWRITTEN_CSS3_C2_COURSES,
  HANDWRITTEN_CSS3_C3_COURSES,
  HANDWRITTEN_CSS3_C4_COURSES,
  HANDWRITTEN_CSS3_C5_COURSES,
} from './handwritten/css3.js';
import {
  HANDWRITTEN_TYPESCRIPT_T0_COURSES,
  HANDWRITTEN_TYPESCRIPT_T1_COURSES,
  HANDWRITTEN_TYPESCRIPT_T2_COURSES,
  HANDWRITTEN_TYPESCRIPT_T3_COURSES,
  HANDWRITTEN_TYPESCRIPT_T4_COURSES,
  HANDWRITTEN_TYPESCRIPT_T5_COURSES,
} from './handwritten/typescript.js';
import {
  HANDWRITTEN_JAVASCRIPT_J0_COURSES,
  HANDWRITTEN_JAVASCRIPT_J1_COURSES,
  HANDWRITTEN_JAVASCRIPT_J2_COURSES,
  HANDWRITTEN_JAVASCRIPT_J3_COURSES,
  HANDWRITTEN_JAVASCRIPT_J4_COURSES,
  HANDWRITTEN_JAVASCRIPT_J5_COURSES,
  HANDWRITTEN_JAVASCRIPT_J6_COURSES,
} from './handwritten/javascript.js';
import {
  HANDWRITTEN_VUE3_V0_COURSES,
  HANDWRITTEN_VUE3_V1_COURSES,
  HANDWRITTEN_VUE3_V2_COURSES,
  HANDWRITTEN_VUE3_V3_COURSES,
  HANDWRITTEN_VUE3_V4_COURSES,
  HANDWRITTEN_VUE3_V5_COURSES,
  HANDWRITTEN_VUE3_V6_COURSES,
} from './handwritten/vue3.js';
import {
  HANDWRITTEN_HTML5_H0_COURSES,
  HANDWRITTEN_HTML5_H1_COURSES,
  HANDWRITTEN_HTML5_H2_COURSES,
  HANDWRITTEN_HTML5_H3_COURSES,
  HANDWRITTEN_HTML5_H4_COURSES,
  HANDWRITTEN_HTML5_H5_COURSES,
} from './handwritten/html5.js';
import {
  HANDWRITTEN_REACT_R0_COURSES,
  HANDWRITTEN_REACT_R1_COURSES,
  HANDWRITTEN_REACT_R2_COURSES,
  HANDWRITTEN_REACT_R3_COURSES,
  HANDWRITTEN_REACT_R4_COURSES,
  HANDWRITTEN_REACT_R5_COURSES,
  HANDWRITTEN_REACT_R6_COURSES,
} from './handwritten/react.js';
import {
  HANDWRITTEN_JAVA_ADVANCED_J2_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J3_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J4_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J5_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J6_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J7_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J8_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J9_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J10_COURSES,
  HANDWRITTEN_JAVA_ADVANCED_J11_COURSES,
} from './handwritten/java-advanced.js';
import { C_SYSTEMS_COURSE_QUIZ } from './quiz-c-systems.js';
import { CPP_PERFORMANCE_COURSE_QUIZ } from './quiz-cpp-performance.js';
import { AI_PROGRAMMING_COURSE_QUIZ } from './quiz-ai-programming.js';
import { SECURITY_ENGINEERING_COURSE_QUIZ } from './quiz-security-engineering.js';
import { TESTING_QUALITY_COURSE_QUIZ } from './quiz-testing-quality.js';
import { SOFTWARE_ENGINEERING_COURSE_QUIZ } from './quiz-software-engineering.js';
import { MIDDLEWARE_SOURCE_COURSE_QUIZ } from './quiz-middleware-source.js';
import { CSS3_COURSE_QUIZ } from './quiz-css3.js';
import { TYPESCRIPT_COURSE_QUIZ } from './quiz-typescript.js';
import { JAVASCRIPT_COURSE_QUIZ } from './quiz-javascript.js';
import { VUE3_COURSE_QUIZ } from './quiz-vue3.js';
import { HTML5_COURSE_QUIZ } from './quiz-html5.js';
import { REACT_COURSE_QUIZ } from './quiz-react.js';
import { JAVA_ADVANCED_COURSE_QUIZ } from './quiz-java-advanced.js';
import { JAVA_FOUNDATION_COURSE_QUIZ } from './quiz-java-foundations.js';
import { GO_CLOUD_COURSE_QUIZ } from './quiz-go-cloud.js';
import { PYTHON_ENTERPRISE_COURSE_QUIZ } from './quiz-python-enterprise.js';
import { PROGRAMMING_FOUNDATION_COURSE_QUIZ } from './quiz-programming-foundations.js';
import { PROJECT_TRAINING_BATCH_01_COURSE_QUIZ } from './quiz-project-training-batch-01.js';
import { PROJECT_TRAINING_BATCH_02_COURSE_QUIZ } from './quiz-project-training-batch-02.js';
import { PROJECT_TRAINING_BATCH_03_COURSE_QUIZ } from './quiz-project-training-batch-03.js';
import { PROJECT_TRAINING_BATCHES_04_06_COURSE_QUIZ } from './quiz-project-training-batches-04-06.js';
import { PROJECT_TRAINING_BATCHES_10_11_COURSE_QUIZ } from './quiz-project-training-batches-10-11.js';
import { PROJECT_TRAINING_COURSE_QUIZ } from './quiz-project-training.js';
import { LEGACY_STRUCTURED_TRACK_COURSE_QUIZ } from './quiz-legacy-structured-tracks.js';
import { PROGRAMMING_SYSTEMS_COURSES } from './systems.js';
import {
  programmingLessonSteps,
  programmingPlans,
  type ProgrammingCourseSeed,
  type ProgrammingTrackName,
} from './shared.js';

const TRACK_META: readonly {
  readonly name: ProgrammingTrackName;
  readonly note: string;
}[] = [
  { name: 'P00 · 入门与工具链', note: '终端、Git、程序生命周期、HTTP 与项目启动' },
  { name: 'P01 · HTML / CSS / 浏览器', note: '语义、布局、响应式、渲染、性能与前端安全' },
  { name: 'P02 · JavaScript / TypeScript', note: '语言语义、异步、模块和运行时类型边界' },
  { name: 'P03 · Vue 企业前端', note: '响应式、组件、路由、Pinia、Nuxt 与源码' },
  { name: 'P04 · React 企业前端', note: 'Hooks、数据缓存、Next.js、Fiber 与性能' },
  { name: 'P05 · 后端共同基础', note: 'API、数据库、事务、权限和可观测性' },
  { name: 'P06 · Java / JVM / Spring', note: '核心类、并发、JVM、GC、JIT、Spring 全家桶与源码' },
  { name: 'P07 · Python 企业后端', note: 'CPython、异步、uv、FastAPI、Django 与 SQLAlchemy' },
  { name: 'P08 · Go 企业后端', note: '接口、context、goroutine、GC、pprof、HTTP 与 gRPC' },
  { name: 'P09 · C 系统编程', note: '指针、ABI、POSIX、系统调用、调试和 Redis/Nginx 源码' },
  { name: 'P10 · C++ 高性能工程', note: 'RAII、模板、STL、Asio、CMake、sanitizer 和性能' },
  { name: 'P11 · 设计模式与代码质量', note: '抽象、不变量、模式、重构、评审和安全供应链' },
  { name: 'P12 · AI 编程与氛围编程', note: '规格、上下文、Agent、工具沙箱、提示注入和交付闭环' },
  { name: 'P13 · 架构 / 交付 / 运维', note: 'DDD、分布式、Docker、Kubernetes、Apollo、负载均衡、CI/CD 与 SRE' },
  { name: 'P14 · 独立语言课程', note: 'HTML、CSS、JavaScript、TypeScript、Vue、React、Python、Go、C、C++、中间件、AI 与工程课程' },
  { name: 'P15 · 综合训练项目', note: '前端、全栈、多模块单体、微服务、AI、云原生、系统和交付平台的完整项目主线' },
] as const;

// 手写课优先：同名模板课必须从 seeds 里剔除，否则 catalog 会出现两门同名课
// （plans 对象会覆盖，但 seeds 数组不会 → 内容质量测试检测到重复 body）。
// 后续新增手写包时，把它们加入这个数组即可自动去重。
const HANDWRITTEN_SEEDS: readonly ProgrammingCourseSeed[] = [
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_F1_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_F2_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_F3_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_F4_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_F5_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_H0_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_H1_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_H2_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_H3_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_H4_COURSES,
  ...HANDWRITTEN_PROGRAMMING_FOUNDATION_H5_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P0_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P1_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P2_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P3_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P4_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P5_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P6_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G0_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G1_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G2_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G3_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G4_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G5_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G6_COURSES,
  ...HANDWRITTEN_C_SYSTEMS_C0_COURSES,
  ...HANDWRITTEN_C_SYSTEMS_C1_COURSES,
  ...HANDWRITTEN_C_SYSTEMS_C2_COURSES,
  ...HANDWRITTEN_C_SYSTEMS_C3_COURSES,
  ...HANDWRITTEN_C_SYSTEMS_C4_COURSES,
  ...HANDWRITTEN_C_SYSTEMS_C5_COURSES,
  ...HANDWRITTEN_C_SYSTEMS_C6_COURSES,
  ...HANDWRITTEN_CPP_PERFORMANCE_X0_COURSES,
  ...HANDWRITTEN_CPP_PERFORMANCE_X1_COURSES,
  ...HANDWRITTEN_CPP_PERFORMANCE_X2_COURSES,
  ...HANDWRITTEN_CPP_PERFORMANCE_X3_COURSES,
  ...HANDWRITTEN_CPP_PERFORMANCE_X4_COURSES,
  ...HANDWRITTEN_CPP_PERFORMANCE_X5_COURSES,
  ...HANDWRITTEN_CPP_PERFORMANCE_X6_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A0_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A1_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A2_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A3_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A4_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A5_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q0_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q1_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q2_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q3_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q4_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q5_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S0_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S1_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S2_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S3_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S4_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S5_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M0_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M1_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M2_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M3_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M4_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M5_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M6_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E0_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E1_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E2_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E3_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E4_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E5_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E6_COURSES,
  ...HANDWRITTEN_CSS3_C0_COURSES,
  ...HANDWRITTEN_CSS3_C1_COURSES,
  ...HANDWRITTEN_CSS3_C2_COURSES,
  ...HANDWRITTEN_CSS3_C3_COURSES,
  ...HANDWRITTEN_CSS3_C4_COURSES,
  ...HANDWRITTEN_CSS3_C5_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T0_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T1_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T2_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T3_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T4_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T5_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J0_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J1_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J2_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J3_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J4_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J5_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J6_COURSES,
  ...HANDWRITTEN_VUE3_V0_COURSES,
  ...HANDWRITTEN_VUE3_V1_COURSES,
  ...HANDWRITTEN_VUE3_V2_COURSES,
  ...HANDWRITTEN_VUE3_V3_COURSES,
  ...HANDWRITTEN_VUE3_V4_COURSES,
  ...HANDWRITTEN_VUE3_V5_COURSES,
  ...HANDWRITTEN_VUE3_V6_COURSES,
  ...HANDWRITTEN_HTML5_H0_COURSES,
  ...HANDWRITTEN_HTML5_H1_COURSES,
  ...HANDWRITTEN_HTML5_H2_COURSES,
  ...HANDWRITTEN_HTML5_H3_COURSES,
  ...HANDWRITTEN_HTML5_H4_COURSES,
  ...HANDWRITTEN_HTML5_H5_COURSES,
  ...HANDWRITTEN_REACT_R0_COURSES,
  ...HANDWRITTEN_REACT_R1_COURSES,
  ...HANDWRITTEN_REACT_R2_COURSES,
  ...HANDWRITTEN_REACT_R3_COURSES,
  ...HANDWRITTEN_REACT_R4_COURSES,
  ...HANDWRITTEN_REACT_R5_COURSES,
  ...HANDWRITTEN_REACT_R6_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J2_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J3_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J4_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J5_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J6_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J7_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J8_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J9_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J10_COURSES,
  ...HANDWRITTEN_JAVA_ADVANCED_J11_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_01_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_02_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_03_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_04_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_05_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_06_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_07_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_08_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_09_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_10_COURSES,
  ...PROGRAMMING_PROJECT_TRAINING_BATCH_11_COURSES,
];
const handwrittenNames = new Set(HANDWRITTEN_SEEDS.map((s) => s.name));
const withoutHandwritten = (seeds: readonly ProgrammingCourseSeed[]) =>
  seeds.filter((s) => !handwrittenNames.has(s.name));
const structuredSeeds = (seeds: readonly ProgrammingCourseSeed[]) =>
  seeds.map((seed) => ({ ...seed, contentStatus: 'structured' as const }));

export const PROGRAMMING_COURSE_SEEDS: readonly ProgrammingCourseSeed[] = [
  ...PROGRAMMING_CORE_COURSES,
  ...PROGRAMMING_JAVA_FOUNDATION_COURSES,
  ...withoutHandwritten(structuredSeeds(PROGRAMMING_JAVA_ADVANCED_COURSES)),
  ...withoutHandwritten(PROGRAMMING_OTHER_COURSE_SEEDS),
  ...PROGRAMMING_BACKEND_COURSES,
  ...PROGRAMMING_SYSTEMS_COURSES,
  ...withoutHandwritten(structuredSeeds(PROGRAMMING_PROJECT_COURSE_SEEDS)),
  ...HANDWRITTEN_SEEDS,
];

// 全量课程题库：编程科目各包的手写题库在此合并（键 = 课程名）。
// 新包题库 → 新建 quiz-<包id>.ts 后在这里 spread；未命中课程回退科目综合题 + checkpoint 清单。
// ⚠️ 必须声明在 PROGRAMMING_CURATED_PLANS（attachQuiz 调用点）之前，否则 TDZ 报错。
const ALL_COURSE_QUIZ: Readonly<Record<string, readonly LearningV2Practice[]>> = {
  ...PROGRAMMING_COURSE_QUIZ,
  ...C_SYSTEMS_COURSE_QUIZ,
  ...CPP_PERFORMANCE_COURSE_QUIZ,
  ...AI_PROGRAMMING_COURSE_QUIZ,
  ...SECURITY_ENGINEERING_COURSE_QUIZ,
  ...TESTING_QUALITY_COURSE_QUIZ,
  ...SOFTWARE_ENGINEERING_COURSE_QUIZ,
  ...MIDDLEWARE_SOURCE_COURSE_QUIZ,
  ...CSS3_COURSE_QUIZ,
  ...TYPESCRIPT_COURSE_QUIZ,
  ...JAVASCRIPT_COURSE_QUIZ,
  ...VUE3_COURSE_QUIZ,
  ...HTML5_COURSE_QUIZ,
  ...REACT_COURSE_QUIZ,
  ...JAVA_ADVANCED_COURSE_QUIZ,
  ...JAVA_FOUNDATION_COURSE_QUIZ,
  ...GO_CLOUD_COURSE_QUIZ,
  ...PYTHON_ENTERPRISE_COURSE_QUIZ,
  ...PROGRAMMING_FOUNDATION_COURSE_QUIZ,
  ...PROJECT_TRAINING_BATCH_01_COURSE_QUIZ,
  ...PROJECT_TRAINING_BATCH_02_COURSE_QUIZ,
  ...PROJECT_TRAINING_BATCH_03_COURSE_QUIZ,
  ...PROJECT_TRAINING_BATCHES_04_06_COURSE_QUIZ,
  ...PROJECT_TRAINING_BATCHES_10_11_COURSE_QUIZ,
  ...PROJECT_TRAINING_COURSE_QUIZ,
  ...LEGACY_STRUCTURED_TRACK_COURSE_QUIZ,
};

function attachQuiz(
  plans: Readonly<Record<string, LearningV2CuratedCoursePlan>>,
): Readonly<Record<string, LearningV2CuratedCoursePlan>> {
  return Object.fromEntries(
    Object.entries(plans).map(([key, plan]) => {
      const courseName = key.slice(key.indexOf(':') + 1);
      const quiz = ALL_COURSE_QUIZ[courseName];
      return [key, quiz ? { ...plan, quiz } : plan];
    }),
  );
}

export const PROGRAMMING_CURATED_PLANS: Readonly<Record<string, LearningV2CuratedCoursePlan>> =
  attachQuiz({
    ...programmingPlans(PROGRAMMING_CORE_COURSES),
    ...programmingPlans(PROGRAMMING_JAVA_FOUNDATION_COURSES),
    ...programmingPlans(withoutHandwritten(structuredSeeds(PROGRAMMING_JAVA_ADVANCED_COURSES))),
    ...programmingPlans(withoutHandwritten(PROGRAMMING_OTHER_COURSE_SEEDS)),
    ...programmingPlans(PROGRAMMING_BACKEND_COURSES),
    ...programmingPlans(PROGRAMMING_SYSTEMS_COURSES),
    ...programmingPlans(withoutHandwritten(structuredSeeds(PROGRAMMING_PROJECT_COURSE_SEEDS))),
    ...programmingPlans(HANDWRITTEN_SEEDS),
  });

/** 章节题库（quiz.ts）按课程名挂到对应教案；没有题库的课走练习页回退。
 *  ⚠️ plans 的 key 是 planKey 格式（`programming:课程名`），必须剥掉前缀再查题库。 */

const currentCourseName = 'Java 零基础：JDK、IDE 与第一个程序';

const programmingStudio = {
  type: '企业项目交付台',
  title: '从代码到运行图，再到发布与回滚',
  task: '围绕当前编程知识完成环境、实现、测试、构建、部署、观测和故障复盘。',
  steps: ['确认环境', '实现与测试', '构建制品', '部署观察', '回滚复盘'],
  output: '可运行项目、测试、镜像、运行图和故障报告',
  boundary: '只在本地、测试或授权环境操作；不接触生产秘密、真实用户数据和未授权目标。',
  features: [
    'Docker',
    'Kubernetes',
    'Helm',
    'Apollo',
    '负载均衡 / Nginx',
    'CI/CD',
    'OpenTelemetry',
    '备份与回滚',
  ],
} as const;

export const PROGRAMMING_SUBJECT: LearningV2Subject = {
  key: 'programming',
  name: '编程',
  short: '编程',
  accent: '#2365d8',
  tint: '#edf3ff',
  line: '从程序如何运行到企业级项目交付，完整覆盖前端、后端、系统、源码、性能、安全、AI、架构和运维。',
  current: {
    stage: 'P06 · Java / JVM / Spring',
    course: currentCourseName,
    step: '环境',
    progress: 4,
    minutes: 34,
  },
  stats: [
    [String(TRACK_META.length), '能力轨道'],
    [String(PROGRAMMING_COURSE_SEEDS.length), '完整课程'],
    ['6', '语言深度'],
  ],
  tracks: TRACK_META.map((track) => ({
    name: track.name,
    note: track.note,
    courses: PROGRAMMING_COURSE_SEEDS
      .filter((course) => course.track === track.name)
      .map((course) => ({
        name: course.name,
        meta: `${course.minutes} 分钟`,
      })),
  })),
  lesson: {
    labels: ['模型', '机制', '源码', '实验', '生产'],
    eyebrow: 'Java 企业级后端 · 零基础起步',
    title: currentCourseName,
    goal: '从安装 JDK、编写第一行代码开始，建立 Java 程序从源码到进程的完整心智模型。',
    minutes: 34,
    steps: programmingLessonSteps(PROGRAMMING_COURSE_SEEDS, currentCourseName),
  },
  practice: {
    prompt: '第一次运行 Java 程序时，最需要先确认什么？',
    options: [
      'java 与 javac 来自同一套 JDK，包名、文件名和类名一致',
      '直接把堆内存调到最大',
      '先安装 Spring Boot',
    ],
    answer: 0,
    explanation: '零基础先确认工具链和程序入口，再谈框架、JVM 参数和性能。',
    focus: 'Java 工具链',
  },
  review: {
    due: 4,
    mastery: 4,
    items: [
      'JDK 与 JRE 的区别',
      'javac 与 java 各自做什么',
      'main 方法签名',
      'class 文件与字节码',
      '断点与退出码',
    ],
  },
  coach: {
    opening: '告诉我你想排查的语言、运行时或线上现象。我会先要求版本、目标和证据，再一起定位。',
    prompts: [
      '带我从调用链读框架源码',
      '设计一次 JVM 压测和调优',
      '审查 Docker / K8s / 发布方案',
      '把需求拆成企业项目里程碑',
    ],
  },
  book: {
    shelf: ['企业级编程工程手册', '阿里巴巴 Java 开发手册', 'The Site Reliability Workbook'],
    title: '企业级编程工程手册',
    unit: '请求、构建与发布',
    kind: '工程原典',
    original: 'Client -> TLS -> Load Balancer -> Gateway -> Service -> Database',
    translation: '请求从客户端进入入口层，再经负载均衡、网关、服务与数据层完成处理，并沿日志、指标和 Trace 返回可观察证据。',
    notes: [
      { term: '请求链路', text: '从客户端到数据层，每一段都要有超时、错误和上下文传播。' },
      { term: '不可变制品', text: '源码、依赖和配置版本固定后才能可靠部署和回滚。' },
      { term: '运行时证据', text: '日志、指标、Trace、线程栈和 profile 共同解释真实行为。' },
    ],
    annotation: '企业项目不是语言语法的集合，而是开发、构建、测试、部署、配置、流量、观测和恢复形成闭环。课程中的每条链路都要求可执行、可验证、可回滚。',
    source: 'WHATWG、TC39、OpenJDK、Spring、Python、Go、C/C++ 官方文档与固定版本源码。',
  },
  studio: programmingStudio,
};
