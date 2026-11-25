import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan } from '../../../v2.js';
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
} from './programming-foundations.js';
import {
  HANDWRITTEN_PYTHON_ENTERPRISE_P0_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P1_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P2_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P3_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P4_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P5_COURSES,
  HANDWRITTEN_PYTHON_ENTERPRISE_P6_COURSES,
} from './python-enterprise.js';
import {
  HANDWRITTEN_GO_CLOUD_G0_COURSES,
  HANDWRITTEN_GO_CLOUD_G1_COURSES,
  HANDWRITTEN_GO_CLOUD_G2_COURSES,
  HANDWRITTEN_GO_CLOUD_G3_COURSES,
  HANDWRITTEN_GO_CLOUD_G4_COURSES,
  HANDWRITTEN_GO_CLOUD_G5_COURSES,
  HANDWRITTEN_GO_CLOUD_G6_COURSES,
} from './go-cloud.js';
import {
  HANDWRITTEN_C_SYSTEMS_C0_COURSES,
  HANDWRITTEN_C_SYSTEMS_C1_COURSES,
  HANDWRITTEN_C_SYSTEMS_C2_COURSES,
  HANDWRITTEN_C_SYSTEMS_C3_COURSES,
  HANDWRITTEN_C_SYSTEMS_C4_COURSES,
  HANDWRITTEN_C_SYSTEMS_C5_COURSES,
  HANDWRITTEN_C_SYSTEMS_C6_COURSES,
} from './c-systems.js';
import {
  HANDWRITTEN_CPP_PERFORMANCE_X0_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X1_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X2_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X3_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X4_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X5_COURSES,
  HANDWRITTEN_CPP_PERFORMANCE_X6_COURSES,
} from './cpp-performance.js';
import {
  HANDWRITTEN_AI_PROGRAMMING_A0_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A1_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A2_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A3_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A4_COURSES,
  HANDWRITTEN_AI_PROGRAMMING_A5_COURSES,
} from './ai-programming.js';
import {
  HANDWRITTEN_TESTING_QUALITY_Q0_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q1_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q2_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q3_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q4_COURSES,
  HANDWRITTEN_TESTING_QUALITY_Q5_COURSES,
} from './testing-quality.js';
import {
  HANDWRITTEN_SECURITY_ENGINEERING_S0_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S1_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S2_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S3_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S4_COURSES,
  HANDWRITTEN_SECURITY_ENGINEERING_S5_COURSES,
} from './security-engineering.js';
import {
  HANDWRITTEN_MIDDLEWARE_SOURCE_M0_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M1_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M2_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M3_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M4_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M5_COURSES,
  HANDWRITTEN_MIDDLEWARE_SOURCE_M6_COURSES,
} from './middleware-source.js';
import {
  HANDWRITTEN_SOFTWARE_ENGINEERING_E0_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E1_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E2_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E3_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E4_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E5_COURSES,
  HANDWRITTEN_SOFTWARE_ENGINEERING_E6_COURSES,
} from './software-engineering.js';
import {
  HANDWRITTEN_CSS3_C0_COURSES,
  HANDWRITTEN_CSS3_C1_COURSES,
  HANDWRITTEN_CSS3_C2_COURSES,
  HANDWRITTEN_CSS3_C3_COURSES,
  HANDWRITTEN_CSS3_C4_COURSES,
  HANDWRITTEN_CSS3_C5_COURSES,
} from './css3.js';
import {
  HANDWRITTEN_TYPESCRIPT_T0_COURSES,
  HANDWRITTEN_TYPESCRIPT_T1_COURSES,
  HANDWRITTEN_TYPESCRIPT_T2_COURSES,
  HANDWRITTEN_TYPESCRIPT_T3_COURSES,
  HANDWRITTEN_TYPESCRIPT_T4_COURSES,
  HANDWRITTEN_TYPESCRIPT_T5_COURSES,
} from './typescript.js';
import {
  HANDWRITTEN_JAVASCRIPT_J0_COURSES,
  HANDWRITTEN_JAVASCRIPT_J1_COURSES,
  HANDWRITTEN_JAVASCRIPT_J2_COURSES,
  HANDWRITTEN_JAVASCRIPT_J3_COURSES,
  HANDWRITTEN_JAVASCRIPT_J4_COURSES,
  HANDWRITTEN_JAVASCRIPT_J5_COURSES,
  HANDWRITTEN_JAVASCRIPT_J6_COURSES,
} from './javascript.js';
import {
  HANDWRITTEN_VUE3_V0_COURSES,
  HANDWRITTEN_VUE3_V1_COURSES,
  HANDWRITTEN_VUE3_V2_COURSES,
  HANDWRITTEN_VUE3_V3_COURSES,
  HANDWRITTEN_VUE3_V4_COURSES,
  HANDWRITTEN_VUE3_V5_COURSES,
  HANDWRITTEN_VUE3_V6_COURSES,
} from './vue3.js';
import {
  HANDWRITTEN_HTML5_H0_COURSES,
  HANDWRITTEN_HTML5_H1_COURSES,
  HANDWRITTEN_HTML5_H2_COURSES,
  HANDWRITTEN_HTML5_H3_COURSES,
  HANDWRITTEN_HTML5_H4_COURSES,
  HANDWRITTEN_HTML5_H5_COURSES,
} from './html5.js';
import {
  HANDWRITTEN_REACT_R0_COURSES,
  HANDWRITTEN_REACT_R1_COURSES,
  HANDWRITTEN_REACT_R2_COURSES,
  HANDWRITTEN_REACT_R3_COURSES,
  HANDWRITTEN_REACT_R4_COURSES,
  HANDWRITTEN_REACT_R5_COURSES,
  HANDWRITTEN_REACT_R6_COURSES,
} from './react.js';
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
} from './java-advanced.js';
import { C_SYSTEMS_COURSE_QUIZ } from '../quiz-c-systems.js';
import { CPP_PERFORMANCE_COURSE_QUIZ } from '../quiz-cpp-performance.js';
import { AI_PROGRAMMING_COURSE_QUIZ } from '../quiz-ai-programming.js';
import { SECURITY_ENGINEERING_COURSE_QUIZ } from '../quiz-security-engineering.js';
import { TESTING_QUALITY_COURSE_QUIZ } from '../quiz-testing-quality.js';
import { SOFTWARE_ENGINEERING_COURSE_QUIZ } from '../quiz-software-engineering.js';
import { MIDDLEWARE_SOURCE_COURSE_QUIZ } from '../quiz-middleware-source.js';
import { CSS3_COURSE_QUIZ } from '../quiz-css3.js';
import { TYPESCRIPT_COURSE_QUIZ } from '../quiz-typescript.js';
import { JAVASCRIPT_COURSE_QUIZ } from '../quiz-javascript.js';
import { VUE3_COURSE_QUIZ } from '../quiz-vue3.js';
import { HTML5_COURSE_QUIZ } from '../quiz-html5.js';
import { REACT_COURSE_QUIZ } from '../quiz-react.js';
import { JAVA_ADVANCED_COURSE_QUIZ } from '../quiz-java-advanced.js';
import { JAVA_FOUNDATION_COURSE_QUIZ } from '../quiz-java-foundations.js';
import { GO_CLOUD_COURSE_QUIZ } from '../quiz-go-cloud.js';
import { PYTHON_ENTERPRISE_COURSE_QUIZ } from '../quiz-python-enterprise.js';
import { PROGRAMMING_FOUNDATION_COURSE_QUIZ } from '../quiz-programming-foundations.js';
import { PROGRAMMING_COURSE_PACKAGES } from '../programs.js';
import { PROGRAMMING_PROJECTS } from '../projects.js';
import { PROGRAMMING_CORE_COURSES } from '../core.js';
import { PROGRAMMING_BACKEND_COURSES } from '../backend.js';
import { PROGRAMMING_SYSTEMS_COURSES } from '../systems.js';
import { PROGRAMMING_JAVA_FOUNDATION_COURSES } from '../java-foundations.js';
import { PROGRAMMING_PROJECT_COURSE_SEEDS } from '../projects.js';
import { PROGRAMMING_PROJECT_TRAINING_BATCH_01_COURSES } from './project-training-batch-01.js';

const ALL_HANDWRITTEN = [
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
];

const PROGRAMMING_FOUNDATION_COURSES = [
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
];

const AI_PROGRAMMING_COURSES = [
  ...HANDWRITTEN_AI_PROGRAMMING_A0_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A1_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A2_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A3_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A4_COURSES,
  ...HANDWRITTEN_AI_PROGRAMMING_A5_COURSES,
];

const TESTING_QUALITY_COURSES = [
  ...HANDWRITTEN_TESTING_QUALITY_Q0_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q1_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q2_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q3_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q4_COURSES,
  ...HANDWRITTEN_TESTING_QUALITY_Q5_COURSES,
];

const SECURITY_ENGINEERING_COURSES = [
  ...HANDWRITTEN_SECURITY_ENGINEERING_S0_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S1_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S2_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S3_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S4_COURSES,
  ...HANDWRITTEN_SECURITY_ENGINEERING_S5_COURSES,
];

const MIDDLEWARE_SOURCE_COURSES = [
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M0_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M1_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M2_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M3_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M4_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M5_COURSES,
  ...HANDWRITTEN_MIDDLEWARE_SOURCE_M6_COURSES,
];

const SOFTWARE_ENGINEERING_COURSES = [
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E0_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E1_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E2_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E3_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E4_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E5_COURSES,
  ...HANDWRITTEN_SOFTWARE_ENGINEERING_E6_COURSES,
];

const CSS3_COURSES = [
  ...HANDWRITTEN_CSS3_C0_COURSES,
  ...HANDWRITTEN_CSS3_C1_COURSES,
  ...HANDWRITTEN_CSS3_C2_COURSES,
  ...HANDWRITTEN_CSS3_C3_COURSES,
  ...HANDWRITTEN_CSS3_C4_COURSES,
  ...HANDWRITTEN_CSS3_C5_COURSES,
];

const TYPESCRIPT_COURSES = [
  ...HANDWRITTEN_TYPESCRIPT_T0_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T1_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T2_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T3_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T4_COURSES,
  ...HANDWRITTEN_TYPESCRIPT_T5_COURSES,
];

const JAVASCRIPT_COURSES = [
  ...HANDWRITTEN_JAVASCRIPT_J0_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J1_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J2_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J3_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J4_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J5_COURSES,
  ...HANDWRITTEN_JAVASCRIPT_J6_COURSES,
];

const VUE3_COURSES = [
  ...HANDWRITTEN_VUE3_V0_COURSES,
  ...HANDWRITTEN_VUE3_V1_COURSES,
  ...HANDWRITTEN_VUE3_V2_COURSES,
  ...HANDWRITTEN_VUE3_V3_COURSES,
  ...HANDWRITTEN_VUE3_V4_COURSES,
  ...HANDWRITTEN_VUE3_V5_COURSES,
  ...HANDWRITTEN_VUE3_V6_COURSES,
];

const HTML5_COURSES = [
  ...HANDWRITTEN_HTML5_H0_COURSES,
  ...HANDWRITTEN_HTML5_H1_COURSES,
  ...HANDWRITTEN_HTML5_H2_COURSES,
  ...HANDWRITTEN_HTML5_H3_COURSES,
  ...HANDWRITTEN_HTML5_H4_COURSES,
  ...HANDWRITTEN_HTML5_H5_COURSES,
];

const REACT_COURSES = [
  ...HANDWRITTEN_REACT_R0_COURSES,
  ...HANDWRITTEN_REACT_R1_COURSES,
  ...HANDWRITTEN_REACT_R2_COURSES,
  ...HANDWRITTEN_REACT_R3_COURSES,
  ...HANDWRITTEN_REACT_R4_COURSES,
  ...HANDWRITTEN_REACT_R5_COURSES,
  ...HANDWRITTEN_REACT_R6_COURSES,
];

const GO_CLOUD_COURSES = [
  ...HANDWRITTEN_GO_CLOUD_G0_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G1_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G2_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G3_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G4_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G5_COURSES,
  ...HANDWRITTEN_GO_CLOUD_G6_COURSES,
];

const PYTHON_ENTERPRISE_COURSES = [
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P0_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P1_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P2_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P3_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P4_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P5_COURSES,
  ...HANDWRITTEN_PYTHON_ENTERPRISE_P6_COURSES,
];

const JAVA_ADVANCED_COURSES = [
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
];

// 模板话术：手写正文里绝不能出现（这些正是用户截图吐槽的口水话）
const BOILERPLATE = [
  '写出这个知识点的',
  '三行记录',
  '主张—依据—边界',
  '关闭提示，用',
  '复述“',
  '本步要能说清：',
  '围绕“',
  '写下三行',
];

describe('handwritten programming foundation courses', () => {
  it('keeps the authored P00-P05 tracks out of generated fallback content', () => {
    expect(PROGRAMMING_CORE_COURSES).toHaveLength(24);
    for (const seed of PROGRAMMING_CORE_COURSES) {
      const plan = getLearningV2CoursePlan('programming', seed.name);
      expect(plan.qualityStatus, seed.name).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${seed.name}/${step.title}`;
        expect(step.body.length, tag).toBeGreaterThanOrEqual(100);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
  });

  it('gives the terminal and environment lesson runnable examples on every step', () => {
    const plan = getLearningV2CoursePlan('programming', '终端、版本与环境：先把工具链跑通');
    expect(plan.steps).toHaveLength(5);
    for (const [index, step] of plan.steps.entries()) {
      expect(step.example, step.title).toBeTruthy();
      expect(step.example!.code.trim().length, step.title).toBeGreaterThan(40);
      expect(step.example!.output?.trim().length || 0, step.title).toBeGreaterThan(20);
      expect(step.body.length, step.title).toBeGreaterThanOrEqual(100);
      expect(index, step.title).toBeLessThan(5);
      expect(step.body, step.title).not.toContain('在 PowerShell 可用 Get-Command rg');
    }
    expect(plan.steps[0].example!.code).toContain('Get-Command');
    expect(plan.steps[1].example!.code).toContain('--version');
    expect(plan.steps[2].example!.code).toContain('Get-ChildItem');
    expect(plan.steps[3].example!.code).toContain('$LASTEXITCODE');
    expect(plan.steps[4].example!.code).toContain('environment.md');
  });

  it('gives every remaining P00 foundation lesson runnable evidence on every step', () => {
    const names = [
      '程序如何运行：源码、编译与进程',
      '首次 HTTP 请求：浏览器到服务端',
      '从空目录搭建项目与 Docker 本地依赖',
    ];

    for (const name of names) {
      const plan = getLearningV2CoursePlan('programming', name);
      expect(plan.steps, name).toHaveLength(5);
      for (const step of plan.steps) {
        expect(step.example, `${name}/${step.title}`).toBeTruthy();
        expect(step.example!.code.trim().length, `${name}/${step.title}`).toBeGreaterThan(80);
        expect(step.example!.output?.trim().length || 0, `${name}/${step.title}`).toBeGreaterThan(30);
        expect(step.body.length, `${name}/${step.title}`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('gives every P01 browser foundation lesson runnable evidence on every step', () => {
    const names = [
      'HTML 语义、表单与可访问性',
      'CSS 级联、布局与响应式',
      '浏览器渲染、性能与前端安全',
    ];

    for (const name of names) {
      const plan = getLearningV2CoursePlan('programming', name);
      expect(plan.steps, name).toHaveLength(5);
      for (const step of plan.steps) {
        expect(step.example, `${name}/${step.title}`).toBeTruthy();
        expect(step.example!.code.trim().length, `${name}/${step.title}`).toBeGreaterThan(80);
        expect(step.example!.output?.trim().length || 0, `${name}/${step.title}`).toBeGreaterThan(30);
        expect(step.body.length, `${name}/${step.title}`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('gives every P02 JavaScript and TypeScript foundation lesson runnable evidence on every step', () => {
    const names = [
      'JavaScript 类型、作用域与闭包',
      '原型、对象与 this 调用规则',
      '事件循环、Promise 与异步控制流',
      'TypeScript 类型系统与企业 API 契约',
    ];

    for (const name of names) {
      const plan = getLearningV2CoursePlan('programming', name);
      expect(plan.steps, name).toHaveLength(5);
      for (const step of plan.steps) {
        expect(step.example, `${name}/${step.title}`).toBeTruthy();
        expect(step.example!.code.trim().length, `${name}/${step.title}`).toBeGreaterThan(80);
        expect(step.example!.output?.trim().length || 0, `${name}/${step.title}`).toBeGreaterThan(30);
        expect(step.body.length, `${name}/${step.title}`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('gives every P03-P05 framework and backend foundation lesson runnable evidence on every step', () => {
    const names = [
      'Vue 响应式原理与组合式状态',
      'Vue 组件、组合式 API 与工程边界',
      'Vue Router、Pinia 与请求状态',
      'Vue 源码与 Nuxt SSR 部署',
      'React 组件、状态与表单',
      'React Hooks、渲染与副作用边界',
      'React Router、数据缓存与 Next.js 部署',
      'React 源码：Fiber、Hooks 与 Scheduler',
      'HTTP API、错误模型与幂等设计',
      'SQL、事务、索引与数据库迁移',
      '认证、授权与后端安全边界',
      '日志、指标、Trace 与 OpenTelemetry',
    ];

    for (const name of names) {
      const plan = getLearningV2CoursePlan('programming', name);
      expect(plan.steps, name).toHaveLength(5);
      for (const step of plan.steps) {
        expect(step.example, `${name}/${step.title}`).toBeTruthy();
        expect(step.example!.code.trim().length, `${name}/${step.title}`).toBeGreaterThan(80);
        expect(step.example!.output?.trim().length || 0, `${name}/${step.title}`).toBeGreaterThan(30);
        expect(step.body.length, `${name}/${step.title}`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('keeps the authored P06-P13 tracks out of generated fallback content', () => {
    const authoredTracks = [
      ...PROGRAMMING_BACKEND_COURSES,
      ...PROGRAMMING_SYSTEMS_COURSES,
    ];
    expect(authoredTracks).toHaveLength(42);
    for (const seed of authoredTracks) {
      const plan = getLearningV2CoursePlan('programming', seed.name);
      expect(plan.qualityStatus, seed.name).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${seed.name}/${step.title}`;
        expect(step.body.length, tag).toBeGreaterThanOrEqual(100);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
  });

  it('keeps the Commerce project-training phases out of generated fallback content', () => {
    const project = PROGRAMMING_PROJECTS.find((item) => item.id === 'commerce-modular');
    expect(project).toBeTruthy();
    expect(project!.phases).toHaveLength(10);
    for (const phase of project!.phases) {
      const plan = getLearningV2CoursePlan('programming', phase.courseName);
      expect(plan.qualityStatus, phase.courseName).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${phase.courseName}/${step.title}`;
        expect(step.body.length, tag).toBeGreaterThanOrEqual(100);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
  });

  it('keeps the Orbit project-training phases out of generated fallback content', () => {
    const project = PROGRAMMING_PROJECTS.find((item) => item.id === 'orbit-microservices');
    expect(project).toBeTruthy();
    expect(project!.phases).toHaveLength(10);
    const tooShort: string[] = [];
    for (const phase of project!.phases) {
      const plan = getLearningV2CoursePlan('programming', phase.courseName);
      expect(plan.qualityStatus, phase.courseName).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${phase.courseName}/${step.title}`;
        if (step.body.length < 100) tooShort.push(`${tag}: ${step.body.length}`);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
    expect(tooShort).toEqual([]);
  });

  it('keeps the Atlas project-training phases out of generated fallback content', () => {
    const project = PROGRAMMING_PROJECTS.find((item) => item.id === 'atlas-ai-rag');
    expect(project).toBeTruthy();
    expect(project!.phases).toHaveLength(10);
    const tooShort: string[] = [];
    for (const phase of project!.phases) {
      const plan = getLearningV2CoursePlan('programming', phase.courseName);
      expect(plan.qualityStatus, phase.courseName).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${phase.courseName}/${step.title}`;
        if (step.body.length < 100) tooShort.push(`${tag}: ${step.body.length}`);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
    expect(tooShort).toEqual([]);
  });

  it('keeps the Nimbus project-training phases out of generated fallback content', () => {
    const project = PROGRAMMING_PROJECTS.find((item) => item.id === 'booking-cloud');
    expect(project).toBeTruthy();
    expect(project!.phases).toHaveLength(10);
    const tooShort: string[] = [];
    for (const phase of project!.phases) {
      const plan = getLearningV2CoursePlan('programming', phase.courseName);
      expect(plan.qualityStatus, phase.courseName).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${phase.courseName}/${step.title}`;
        if (step.body.length < 100) tooShort.push(`${tag}: ${step.body.length}`);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
    expect(tooShort).toEqual([]);
  });

  it('keeps the LogForge project-training phases out of generated fallback content', () => {
    const project = PROGRAMMING_PROJECTS.find((item) => item.id === 'logforge-native');
    expect(project).toBeTruthy();
    expect(project!.phases).toHaveLength(10);
    const tooShort: string[] = [];
    for (const phase of project!.phases) {
      const plan = getLearningV2CoursePlan('programming', phase.courseName);
      expect(plan.qualityStatus, phase.courseName).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${phase.courseName}/${step.title}`;
        if (step.body.length < 100) tooShort.push(`${tag}: ${step.body.length}`);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
    expect(tooShort).toEqual([]);
  });

  it('keeps the LaunchPad project-training phases out of generated fallback content', () => {
    const project = PROGRAMMING_PROJECTS.find((item) => item.id === 'launchpad-devops');
    expect(project).toBeTruthy();
    expect(project!.phases).toHaveLength(10);
    const tooShort: string[] = [];
    for (const phase of project!.phases) {
      const plan = getLearningV2CoursePlan('programming', phase.courseName);
      expect(plan.qualityStatus, phase.courseName).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${phase.courseName}/${step.title}`;
        if (step.body.length < 100) tooShort.push(`${tag}: ${step.body.length}`);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
    expect(tooShort).toEqual([]);
  });

  it('keeps the Canvas project-training phases out of generated fallback content', () => {
    const project = PROGRAMMING_PROJECTS.find((item) => item.id === 'canvas-collab');
    expect(project).toBeTruthy();
    expect(project!.phases).toHaveLength(10);
    const tooShort: string[] = [];
    for (const phase of project!.phases) {
      const plan = getLearningV2CoursePlan('programming', phase.courseName);
      expect(plan.qualityStatus, phase.courseName).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${phase.courseName}/${step.title}`;
        if (step.body.length < 100) tooShort.push(`${tag}: ${step.body.length}`);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) {
          expect(step.body, tag).not.toContain(phrase);
        }
      }
    }
    expect(tooShort).toEqual([]);
  });

  it('keeps the DataFlow project-training phases out of generated fallback content', () => {
    const project = PROGRAMMING_PROJECTS.find((item) => item.id === 'dataflow-lakehouse');
    expect(project).toBeTruthy();
    const tooShort: string[] = [];
    for (const phase of project!.phases) {
      const plan = getLearningV2CoursePlan('programming', phase.courseName);
      expect(plan.qualityStatus, phase.courseName).toBe('curated');
      for (const step of plan.steps) {
        const tag = `${phase.courseName}/${step.title}`;
        if (step.body.length < 100) tooShort.push(`${tag}: ${step.body.length}`);
        expect(step.body, tag).not.toContain('本步的可复核产出是');
        for (const phrase of BOILERPLATE) expect(step.body, tag).not.toContain(phrase);
      }
    }
    expect(tooShort).toEqual([]);
  });

  it('keeps SecureVault and DevKit project-training phases out of generated fallback content', () => {
    for (const projectId of ['securevault', 'devkit-sdk']) {
      const project = PROGRAMMING_PROJECTS.find((item) => item.id === projectId);
      expect(project, projectId).toBeTruthy();
      const tooShort: string[] = [];
      for (const phase of project!.phases) {
        const plan = getLearningV2CoursePlan('programming', phase.courseName);
        expect(plan.qualityStatus, phase.courseName).toBe('curated');
        for (const step of plan.steps) {
          const tag = `${phase.courseName}/${step.title}`;
          if (step.body.length < 100) tooShort.push(`${tag}: ${step.body.length}`);
          expect(step.body, tag).not.toContain('本步的可复核产出是');
          for (const phrase of BOILERPLATE) expect(step.body, tag).not.toContain(phrase);
        }
      }
      expect(tooShort, projectId).toEqual([]);
    }
  });

  it('covers every ai-programming package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'ai-programming')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(AI_PROGRAMMING_COURSES).toHaveLength(24);
    expect(AI_PROGRAMMING_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(AI_PROGRAMMING_COURSES.map((course) => course.name)).size).toBe(24);
  });

  it('attaches a handwritten four-question quiz to every ai-programming lesson', () => {
    expect(Object.keys(AI_PROGRAMMING_COURSE_QUIZ)).toHaveLength(24);
    for (const seed of AI_PROGRAMMING_COURSES) {
      const quiz = AI_PROGRAMMING_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every security-engineering lesson', () => {
    expect(Object.keys(SECURITY_ENGINEERING_COURSE_QUIZ)).toHaveLength(36);
    for (const seed of SECURITY_ENGINEERING_COURSES) {
      const quiz = SECURITY_ENGINEERING_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every testing-quality lesson', () => {
    expect(Object.keys(TESTING_QUALITY_COURSE_QUIZ)).toHaveLength(36);
    for (const seed of TESTING_QUALITY_COURSES) {
      const quiz = TESTING_QUALITY_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every software-engineering lesson', () => {
    expect(Object.keys(SOFTWARE_ENGINEERING_COURSE_QUIZ)).toHaveLength(35);
    for (const seed of SOFTWARE_ENGINEERING_COURSES) {
      const quiz = SOFTWARE_ENGINEERING_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every middleware-source lesson', () => {
    expect(Object.keys(MIDDLEWARE_SOURCE_COURSE_QUIZ)).toHaveLength(35);
    for (const seed of MIDDLEWARE_SOURCE_COURSES) {
      const quiz = MIDDLEWARE_SOURCE_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every css3 lesson', () => {
    expect(Object.keys(CSS3_COURSE_QUIZ)).toHaveLength(36);
    for (const seed of CSS3_COURSES) {
      const quiz = CSS3_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every typescript lesson', () => {
    expect(Object.keys(TYPESCRIPT_COURSE_QUIZ)).toHaveLength(36);
    for (const seed of TYPESCRIPT_COURSES) {
      const quiz = TYPESCRIPT_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every javascript lesson', () => {
    expect(Object.keys(JAVASCRIPT_COURSE_QUIZ)).toHaveLength(42);
    for (const seed of JAVASCRIPT_COURSES) {
      const quiz = JAVASCRIPT_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every vue3 lesson', () => {
    expect(Object.keys(VUE3_COURSE_QUIZ)).toHaveLength(42);
    for (const seed of VUE3_COURSES) {
      const quiz = VUE3_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every html5 lesson', () => {
    expect(Object.keys(HTML5_COURSE_QUIZ)).toHaveLength(36);
    for (const seed of HTML5_COURSES) {
      const quiz = HTML5_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every react lesson', () => {
    expect(Object.keys(REACT_COURSE_QUIZ)).toHaveLength(42);
    for (const seed of REACT_COURSES) {
      const quiz = REACT_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every go-cloud lesson', () => {
    expect(Object.keys(GO_CLOUD_COURSE_QUIZ)).toHaveLength(42);
    for (const seed of GO_CLOUD_COURSES) {
      const quiz = GO_CLOUD_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every Java foundation lesson', () => {
    expect(Object.keys(JAVA_FOUNDATION_COURSE_QUIZ)).toHaveLength(22);
    for (const seed of PROGRAMMING_JAVA_FOUNDATION_COURSES) {
      const quiz = JAVA_FOUNDATION_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every Python enterprise lesson', () => {
    expect(Object.keys(PYTHON_ENTERPRISE_COURSE_QUIZ)).toHaveLength(42);
    for (const seed of PYTHON_ENTERPRISE_COURSES) {
      const quiz = PYTHON_ENTERPRISE_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every programming foundation lesson', () => {
    expect(Object.keys(PROGRAMMING_FOUNDATION_COURSE_QUIZ)).toHaveLength(72);
    for (const seed of PROGRAMMING_FOUNDATION_COURSES) {
      const quiz = PROGRAMMING_FOUNDATION_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten four-question quiz to every Java advanced lesson', () => {
    expect(Object.keys(JAVA_ADVANCED_COURSE_QUIZ)).toHaveLength(88);
    for (const seed of JAVA_ADVANCED_COURSES) {
      const quiz = JAVA_ADVANCED_COURSE_QUIZ[seed.name];
      expect(quiz, seed.name).toHaveLength(4);
      const answers = new Set<number>();
      for (const [index, question] of quiz.entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(new Set(question.options).size, tag).toBe(question.options.length);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of [...BOILERPLATE, '正确答案是']) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('covers every testing-quality package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'testing-quality')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(TESTING_QUALITY_COURSES).toHaveLength(36);
    expect(TESTING_QUALITY_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(TESTING_QUALITY_COURSES.map((course) => course.name)).size).toBe(36);
  });

  it('covers every security-engineering package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'security-engineering')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(SECURITY_ENGINEERING_COURSES).toHaveLength(36);
    expect(SECURITY_ENGINEERING_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(SECURITY_ENGINEERING_COURSES.map((course) => course.name)).size).toBe(36);
  });

  it('covers every middleware-source package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'middleware-source')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(MIDDLEWARE_SOURCE_COURSES).toHaveLength(35);
    expect(MIDDLEWARE_SOURCE_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(MIDDLEWARE_SOURCE_COURSES.map((course) => course.name)).size).toBe(35);
  });

  it('covers every software-engineering package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'software-engineering')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(SOFTWARE_ENGINEERING_COURSES).toHaveLength(35);
    expect(SOFTWARE_ENGINEERING_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(SOFTWARE_ENGINEERING_COURSES.map((course) => course.name)).size).toBe(35);
  });

  it('covers every css3 package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'css3')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(CSS3_COURSES).toHaveLength(36);
    expect(CSS3_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(CSS3_COURSES.map((course) => course.name)).size).toBe(36);
  });

  it('covers every typescript package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'typescript')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(TYPESCRIPT_COURSES).toHaveLength(36);
    expect(TYPESCRIPT_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(TYPESCRIPT_COURSES.map((course) => course.name)).size).toBe(36);
  });

  it('covers every javascript package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'javascript')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(JAVASCRIPT_COURSES).toHaveLength(42);
    expect(JAVASCRIPT_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(JAVASCRIPT_COURSES.map((course) => course.name)).size).toBe(42);
  });

  it('covers every vue3 package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'vue3')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(VUE3_COURSES).toHaveLength(42);
    expect(VUE3_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(VUE3_COURSES.map((course) => course.name)).size).toBe(42);
  });

  it('covers every html5 package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'html5')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(HTML5_COURSES).toHaveLength(36);
    expect(HTML5_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(HTML5_COURSES.map((course) => course.name)).size).toBe(36);
  });

  it('covers every react package lesson exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'react')!
      .stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(REACT_COURSES).toHaveLength(42);
    expect(REACT_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(REACT_COURSES.map((course) => course.name)).size).toBe(42);
  });

  it('covers every Java advanced lesson from J2 through J11 exactly once', () => {
    const expected = PROGRAMMING_COURSE_PACKAGES
      .find((course) => course.id === 'java-enterprise')!
      .stages
      .filter((stage) => !['J0', 'J1'].includes(stage.id))
      .flatMap((stage) => stage.lessons.map((lesson) => lesson.courseName));
    expect(JAVA_ADVANCED_COURSES).toHaveLength(88);
    expect(JAVA_ADVANCED_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(JAVA_ADVANCED_COURSES.map((course) => course.name)).size).toBe(88);
  });

  it('covers the first three project-training mainlines exactly once', () => {
    const expected = PROGRAMMING_PROJECT_COURSE_SEEDS
      .filter((course) =>
        ['Studio 企业官网', 'Pulse 实时驾驶舱', 'TeamFlow 协作 SaaS']
          .some((project) => course.name.startsWith(`综合训练 · ${project} ·`)),
      )
      .map((course) => course.name);
    expect(PROGRAMMING_PROJECT_TRAINING_BATCH_01_COURSES).toHaveLength(30);
    expect(PROGRAMMING_PROJECT_TRAINING_BATCH_01_COURSES.map((course) => course.name)).toEqual(expected);
    expect(new Set(PROGRAMMING_PROJECT_TRAINING_BATCH_01_COURSES.map((course) => course.name)).size).toBe(30);
    for (const course of PROGRAMMING_PROJECT_TRAINING_BATCH_01_COURSES) {
      expect(course.steps.some((step) => !!step[3]?.code), course.name).toBe(true);
    }
  });

  it('overrides the generated template plan for every handwritten course', () => {
    for (const seed of ALL_HANDWRITTEN) {
      const plan = getLearningV2CoursePlan('programming', seed.name);
      expect(plan.qualityStatus, seed.name).toBe('curated');
      // 覆盖后正文必须是手写内容，不能以模板套话开头
      expect(plan.steps[0]?.body, seed.name).toContain(seed.name);
      expect(plan.steps[0]?.body, seed.name).not.toContain('属于“编程通识”的“');
    }
  });

  it('keeps every handwritten step substantive and free of template filler', () => {
    for (const seed of ALL_HANDWRITTEN) {
      expect(seed.steps.length, seed.name).toBe(5);
      for (const [title, body, note] of seed.steps) {
        expect(body.length, `${seed.name}/${title}`).toBeGreaterThanOrEqual(60);
        for (const phrase of BOILERPLATE) {
          expect(body, `${seed.name}/${title}`).not.toContain(phrase);
        }
        expect(note.length, `${seed.name}/${title} note`).toBeGreaterThan(0);
      }
    }
  }, 30_000);

  it('covers stages F0 through H5 in checklist order', () => {
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 计算机、终端与版本控制：操作系统、Shell、PATH 与进程',
      '编程通识 · 计算机、终端与版本控制：文件、权限、编码与日志',
      '编程通识 · 计算机、终端与版本控制：Git 对象、暂存区与提交',
      '编程通识 · 计算机、终端与版本控制：分支、合并与冲突恢复',
      '编程通识 · 计算机、终端与版本控制：包管理器与版本锁定',
      '编程通识 · 计算机、终端与版本控制：编辑器、终端与远程开发',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_F1_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 数据结构与算法基础：复杂度、常数与真实数据规模',
      '编程通识 · 数据结构与算法基础：数组、链表与缓存局部性',
      '编程通识 · 数据结构与算法基础：哈希表、冲突与扩容',
      '编程通识 · 数据结构与算法基础：树、堆、排序与搜索',
      '编程通识 · 数据结构与算法基础：图、遍历与最短路径直觉',
      '编程通识 · 数据结构与算法基础：算法选型与可验证基准',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_F2_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 操作系统、并发与网络：进程、线程、调度与上下文切换',
      '编程通识 · 操作系统、并发与网络：虚拟内存、栈、堆与文件映射',
      '编程通识 · 操作系统、并发与网络：阻塞、非阻塞与 IO 多路复用',
      '编程通识 · 操作系统、并发与网络：TCP、TLS、DNS 与 HTTP',
      '编程通识 · 操作系统、并发与网络：连接池、超时与重试预算',
      '编程通识 · 操作系统、并发与网络：并发、锁、竞态与背压',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_F3_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 数据库、事务与数据建模：表、键、约束与规范化',
      '编程通识 · 数据库、事务与数据建模：SQL 查询、连接与分页',
      '编程通识 · 数据库、事务与数据建模：索引、选择性与执行计划',
      '编程通识 · 数据库、事务与数据建模：事务、隔离级别与锁',
      '编程通识 · 数据库、事务与数据建模：迁移、回填与兼容发布',
      '编程通识 · 数据库、事务与数据建模：备份、恢复与一致性校验',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_F4_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 测试、调试与安全工程：单元、集成、契约与端到端测试',
      '编程通识 · 测试、调试与安全工程：断点、日志、堆栈与最小复现',
      '编程通识 · 测试、调试与安全工程：错误模型与失败注入',
      '编程通识 · 测试、调试与安全工程：身份、授权与信任边界',
      '编程通识 · 测试、调试与安全工程：依赖、秘密与供应链风险',
      '编程通识 · 测试、调试与安全工程：质量门禁与安全回归',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_F5_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · Docker、CI/CD 与运行手册：镜像分层与多阶段构建',
      '编程通识 · Docker、CI/CD 与运行手册：Compose、数据卷与健康检查',
      '编程通识 · Docker、CI/CD 与运行手册：CI 缓存、测试矩阵与制品',
      '编程通识 · Docker、CI/CD 与运行手册：环境配置、秘密与发布顺序',
      '编程通识 · Docker、CI/CD 与运行手册：日志、指标、Trace 与告警',
      '编程通识 · Docker、CI/CD 与运行手册：备份、回滚、容量与运行手册',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_H0_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 浏览器、文档与开发工具：浏览器如何请求和解析 HTML',
      '编程通识 · 浏览器、文档与开发工具：DOCTYPE、head、body 与文档树',
      '编程通识 · 浏览器、文档与开发工具：标题层级、段落、链接与图片',
      '编程通识 · 浏览器、文档与开发工具：相对路径、绝对路径与站点目录',
      '编程通识 · 浏览器、文档与开发工具：DevTools、验证器与最小调试',
      '编程通识 · 浏览器、文档与开发工具：第一个语义化多页面站点',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_H1_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 语义、结构与企业页面骨架：header、nav、main 与 footer',
      '编程通识 · 语义、结构与企业页面骨架：article、section 与 aside 的边界',
      '编程通识 · 语义、结构与企业页面骨架：标题大纲与文档阅读顺序',
      '编程通识 · 语义、结构与企业页面骨架：列表、引用、代码与时间',
      '编程通识 · 语义、结构与企业页面骨架：企业站点的页面信息架构',
      '编程通识 · 语义、结构与企业页面骨架：语义重构与回归检查',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_H2_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 表单、输入与验证：form、label 与输入控件关联',
      '编程通识 · 表单、输入与验证：输入类型、自动填充与移动键盘',
      '编程通识 · 表单、输入与验证：原生约束验证与错误提示',
      '编程通识 · 表单、输入与验证：fieldset、legend 与分组语义',
      '编程通识 · 表单、输入与验证：提交、取消、加载与重复提交',
      '编程通识 · 表单、输入与验证：可访问表单的完整实验',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_H3_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 媒体、表格与内容表达：img、srcset、sizes 与替代文本',
      '编程通识 · 媒体、表格与内容表达：picture、figure 与图像决策',
      '编程通识 · 媒体、表格与内容表达：video、audio、track 与字幕',
      '编程通识 · 媒体、表格与内容表达：table、caption、th 与数据关系',
      '编程通识 · 媒体、表格与内容表达：meta、Open Graph 与结构化数据',
      '编程通识 · 媒体、表格与内容表达：媒体与富内容企业页面',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_H4_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 可访问性、SEO 与国际化：键盘路径、焦点顺序与跳转链接',
      '编程通识 · 可访问性、SEO 与国际化：ARIA 的角色、名称和状态',
      '编程通识 · 可访问性、SEO 与国际化：对比度、缩放与动效偏好',
      '编程通识 · 可访问性、SEO 与国际化：SEO、canonical 与 robots',
      '编程通识 · 可访问性、SEO 与国际化：语言、方向与本地化结构',
      '编程通识 · 可访问性、SEO 与国际化：无障碍与 SEO 联合验收',
    ]);
    expect(HANDWRITTEN_PROGRAMMING_FOUNDATION_H5_COURSES.map((s) => s.name)).toEqual([
      '编程通识 · 页面性能与企业站点交付：关键 HTML、CSS、字体与脚本',
      '编程通识 · 页面性能与企业站点交付：预加载、懒加载与资源提示',
      '编程通识 · 页面性能与企业站点交付：第三方脚本、CSP 与隐私边界',
      '编程通识 · 页面性能与企业站点交付：缓存、压缩与 CDN 静态发布',
      '编程通识 · 页面性能与企业站点交付：Web Vitals、真实用户监控与回归',
      '编程通识 · 页面性能与企业站点交付：企业官网毕业项目与运行手册',
    ]);
  });

  it('covers python-enterprise stages P0 through P6 in checklist order', () => {
    expect(HANDWRITTEN_PYTHON_ENTERPRISE_P0_COURSES.map((s) => s.name)).toEqual([
      'Python · CPython、uv 与第一个项目：CPython、解释器、字节码与虚拟环境',
      'Python · CPython、uv 与第一个项目：uv、pyproject.toml 和锁文件',
      'Python · CPython、uv 与第一个项目：变量、类型、容器与控制流',
      'Python · CPython、uv 与第一个项目：函数、模块、包和导入路径',
      'Python · CPython、uv 与第一个项目：REPL、调试器和第一组 pytest',
      'Python · CPython、uv 与第一个项目：零基础命令行项目',
    ]);
    expect(HANDWRITTEN_PYTHON_ENTERPRISE_P1_COURSES.map((s) => s.name)).toEqual([
      'Python · 数据模型、OOP 与惯用法：对象、名称、引用和垃圾回收',
      'Python · 数据模型、OOP 与惯用法：类、实例、继承和组合',
      'Python · 数据模型、OOP 与惯用法：特殊方法与协议对象',
      'Python · 数据模型、OOP 与惯用法：property、descriptor 与属性校验',
      'Python · 数据模型、OOP 与惯用法：dataclass、enum 与不可变数据',
      'Python · 数据模型、OOP 与惯用法：领域模型与协议实现',
    ]);
    expect(HANDWRITTEN_PYTHON_ENTERPRISE_P2_COURSES.map((s) => s.name)).toEqual([
      'Python · 异常、生成器、装饰器与上下文：异常层次、异常链与自定义错误',
      'Python · 异常、生成器、装饰器与上下文：with、上下文管理器和资源释放',
      'Python · 异常、生成器、装饰器与上下文：迭代器、生成器和惰性管道',
      'Python · 异常、生成器、装饰器与上下文：装饰器、闭包和 functools',
      'Python · 异常、生成器、装饰器与上下文：typing、Protocol 与泛型',
      'Python · 异常、生成器、装饰器与上下文：语言机制综合实验',
    ]);
    expect(HANDWRITTEN_PYTHON_ENTERPRISE_P3_COURSES.map((s) => s.name)).toEqual([
      'Python · 文件、网络、数据库与异步：pathlib、流、编码和文件边界',
      'Python · 文件、网络、数据库与异步：HTTP 客户端、超时和重试',
      'Python · 文件、网络、数据库与异步：SQL、连接、事务和参数化查询',
      'Python · 文件、网络、数据库与异步：asyncio 事件循环、任务和取消',
      'Python · 文件、网络、数据库与异步：阻塞调用、线程池和进程池',
      'Python · 文件、网络、数据库与异步：异步 IO 故障实验',
    ]);
    expect(HANDWRITTEN_PYTHON_ENTERPRISE_P4_COURSES.map((s) => s.name)).toEqual([
      'Python · FastAPI、Django、SQLAlchemy 与迁移：FastAPI 路由、Pydantic 和依赖',
      'Python · FastAPI、Django、SQLAlchemy 与迁移：Django ORM、视图、后台和中间件',
      'Python · FastAPI、Django、SQLAlchemy 与迁移：SQLAlchemy Session 与查询模型',
      'Python · FastAPI、Django、SQLAlchemy 与迁移：Alembic 迁移、回填和回滚',
      'Python · FastAPI、Django、SQLAlchemy 与迁移：认证、对象级授权和审计',
      'Python · FastAPI、Django、SQLAlchemy 与迁移：框架企业服务对照实验',
    ]);
    expect(HANDWRITTEN_PYTHON_ENTERPRISE_P5_COURSES.map((s) => s.name)).toEqual([
      'Python · 测试、打包、任务与工程质量：pytest fixture、参数化和失败注入',
      'Python · 测试、打包、任务与工程质量：mypy/pyright 与运行时边界',
      'Python · 测试、打包、任务与工程质量：Ruff、格式化、预提交和 CI',
      'Python · 测试、打包、任务与工程质量：Celery、重试、幂等和死信',
      'Python · 测试、打包、任务与工程质量：wheel、版本和内部包发布',
      'Python · 测试、打包、任务与工程质量：后台任务与质量门禁实验',
    ]);
    expect(HANDWRITTEN_PYTHON_ENTERPRISE_P6_COURSES.map((s) => s.name)).toEqual([
      'Python · CPython、性能与生产部署：dis 字节码与代码对象',
      'Python · CPython、性能与生产部署：引用计数、GC 和内存增长',
      'Python · CPython、性能与生产部署：GIL、自由线程与进程并发',
      'Python · CPython、性能与生产部署：py-spy、cProfile 与火焰图',
      'Python · CPython、性能与生产部署：Uvicorn/Gunicorn、worker 和优雅停机',
      'Python · CPython、性能与生产部署：Python 企业服务毕业项目与运行手册',
    ]);
  });

  it('covers go-cloud stages G0 through G6 in checklist order', () => {
    expect(HANDWRITTEN_GO_CLOUD_G0_COURSES.map((s) => s.name)).toEqual([
      'Go · Go 工具链、模块与第一个服务：Go toolchain、GOPATH 与 module',
      'Go · Go 工具链、模块与第一个服务：变量、类型、常量与控制流',
      'Go · Go 工具链、模块与第一个服务：函数、多返回值、defer 和 panic',
      'Go · Go 工具链、模块与第一个服务：包、可见性、目录和内部模块',
      'Go · Go 工具链、模块与第一个服务：go run、go build、go install',
      'Go · Go 工具链、模块与第一个服务：第一组 go test 与基准',
    ]);
    expect(HANDWRITTEN_GO_CLOUD_G1_COURSES.map((s) => s.name)).toEqual([
      'Go · 结构体、接口、错误与 context：结构体、方法、嵌入和组合',
      'Go · 结构体、接口、错误与 context：接口、隐式实现和依赖方向',
      'Go · 结构体、接口、错误与 context：error、errors.Is/As 与错误链',
      'Go · 结构体、接口、错误与 context：context 取消、期限和值边界',
      'Go · 结构体、接口、错误与 context：泛型、约束和类型集合',
      'Go · 结构体、接口、错误与 context：领域服务与错误模型实验',
    ]);
    expect(HANDWRITTEN_GO_CLOUD_G2_COURSES.map((s) => s.name)).toEqual([
      'Go · goroutine、channel、select 与同步：goroutine 生命周期与泄漏',
      'Go · goroutine、channel、select 与同步：channel、缓冲和所有权',
      'Go · goroutine、channel、select 与同步：select、超时和关闭协议',
      'Go · goroutine、channel、select 与同步：sync、atomic 与内存模型',
      'Go · goroutine、channel、select 与同步：errgroup、并发上限和取消传播',
      'Go · goroutine、channel、select 与同步：并发任务与竞态回归实验',
    ]);
    expect(HANDWRITTEN_GO_CLOUD_G3_COURSES.map((s) => s.name)).toEqual([
      'Go · GMP、GC、内存与运行时诊断：GMP 调度器和抢占',
      'Go · GMP、GC、内存与运行时诊断：栈增长、逃逸分析与对象分配',
      'Go · GMP、GC、内存与运行时诊断：GC 标记、写屏障和 GOGC',
      'Go · GMP、GC、内存与运行时诊断：race、mutex、goroutine profile',
      'Go · GMP、GC、内存与运行时诊断：pprof、trace 与 benchstat',
      'Go · GMP、GC、内存与运行时诊断：Go 性能调优报告',
    ]);
    expect(HANDWRITTEN_GO_CLOUD_G4_COURSES.map((s) => s.name)).toEqual([
      'Go · net/http、Gin、gRPC 与数据访问：net/http Server、Handler 和中间件',
      'Go · net/http、Gin、gRPC 与数据访问：Gin 路由树、上下文和错误',
      'Go · net/http、Gin、gRPC 与数据访问：gRPC、protobuf、超时和拦截器',
      'Go · net/http、Gin、gRPC 与数据访问：database/sql、事务和 sqlc',
      'Go · net/http、Gin、gRPC 与数据访问：认证、授权、限流和请求 ID',
      'Go · net/http、Gin、gRPC 与数据访问：多协议服务实验',
    ]);
    expect(HANDWRITTEN_GO_CLOUD_G5_COURSES.map((s) => s.name)).toEqual([
      'Go · 测试、模糊、集成与可观测性：表驱动测试、并行和 golden file',
      'Go · 测试、模糊、集成与可观测性：httptest、容器集成测试',
      'Go · 测试、模糊、集成与可观测性：go fuzz、race 和覆盖率',
      'Go · 测试、模糊、集成与可观测性：slog、开放遥测和 requestId',
      'Go · 测试、模糊、集成与可观测性：指标、Trace、告警和运行手册',
      'Go · 测试、模糊、集成与可观测性：质量门禁与故障注入实验',
    ]);
    expect(HANDWRITTEN_GO_CLOUD_G6_COURSES.map((s) => s.name)).toEqual([
      'Go · 容器、Kubernetes 与生产交付：静态二进制、distroless 和多阶段镜像',
      'Go · 容器、Kubernetes 与生产交付：配置、秘密和健康检查',
      'Go · 容器、Kubernetes 与生产交付：优雅停机与连接排空',
      'Go · 容器、Kubernetes 与生产交付：Kubernetes Deployment、Service 和探针',
      'Go · 容器、Kubernetes 与生产交付：HPA、PDB、滚动更新和回滚',
      'Go · 容器、Kubernetes 与生产交付：Go 云原生服务毕业项目',
    ]);
  });

  it('covers c-systems stages C0 through C6 in checklist order', () => {
    expect(HANDWRITTEN_C_SYSTEMS_C0_COURSES.map((s) => s.name)).toEqual([
      'C · 编译器、链接器与第一个 C 工程：C 标准、编译器、链接器和进程',
      'C · 编译器、链接器与第一个 C 工程：从空目录编写 main 与头文件',
      'C · 编译器、链接器与第一个 C 工程：GCC/Clang 警告和优化级别',
      'C · 编译器、链接器与第一个 C 工程：目标文件、静态库和动态库',
      'C · 编译器、链接器与第一个 C 工程：CMake 目标、测试和安装规则',
      'C · 编译器、链接器与第一个 C 工程：第一个带 sanitizer 的 C 项目',
    ]);
    expect(HANDWRITTEN_C_SYSTEMS_C1_COURSES.map((s) => s.name)).toEqual([
      'C · 类型、数组、指针、结构体与函数：整数、浮点、字符与对象表示',
      'C · 类型、数组、指针、结构体与函数：数组、指针算术和边界',
      'C · 类型、数组、指针、结构体与函数：字符串、缓冲区与安全拼接',
      'C · 类型、数组、指针、结构体与函数：结构体、联合体和对齐',
      'C · 类型、数组、指针、结构体与函数：函数指针、回调与接口表',
      'C · 类型、数组、指针、结构体与函数：容器与协议解析基础实验',
    ]);
    expect(HANDWRITTEN_C_SYSTEMS_C2_COURSES.map((s) => s.name)).toEqual([
      'C · 栈、堆、生命周期与未定义行为：自动存储、静态存储和动态分配',
      'C · 栈、堆、生命周期与未定义行为：malloc/realloc/free 与所有权',
      'C · 栈、堆、生命周期与未定义行为：悬空指针、双重释放和泄漏',
      'C · 栈、堆、生命周期与未定义行为：整数溢出、越界和严格别名',
      'C · 栈、堆、生命周期与未定义行为：错误路径与统一清理',
      'C · 栈、堆、生命周期与未定义行为：内存安全测试矩阵',
    ]);
    expect(HANDWRITTEN_C_SYSTEMS_C3_COURSES.map((s) => s.name)).toEqual([
      'C · libc、POSIX、文件、进程与 socket：系统调用、errno 和部分成功',
      'C · libc、POSIX、文件、进程与 socket：文件描述符、read/write 和缓冲区',
      'C · libc、POSIX、文件、进程与 socket：fork、exec、wait 与信号',
      'C · libc、POSIX、文件、进程与 socket：socket、bind、listen、accept',
      'C · libc、POSIX、文件、进程与 socket：epoll 与非阻塞 IO',
      'C · libc、POSIX、文件、进程与 socket：原生 TCP 服务实验',
    ]);
    expect(HANDWRITTEN_C_SYSTEMS_C4_COURSES.map((s) => s.name)).toEqual([
      'C · 调试、追踪、静态分析与性能：GDB 断点、栈和变量',
      'C · 调试、追踪、静态分析与性能：core dump、符号和构建 ID',
      'C · 调试、追踪、静态分析与性能：strace/ltrace 与系统调用',
      'C · 调试、追踪、静态分析与性能：clang-tidy、静态分析和编译器警告',
      'C · 调试、追踪、静态分析与性能：perf、火焰图和缓存局部性',
      'C · 调试、追踪、静态分析与性能：C 服务生产诊断报告',
    ]);
    expect(HANDWRITTEN_C_SYSTEMS_C5_COURSES.map((s) => s.name)).toEqual([
      'C · 数据结构、并发与协议工程：哈希表、链表、队列和内存池',
      'C · 数据结构、并发与协议工程：线程、互斥量、条件变量和原子',
      'C · 数据结构、并发与协议工程：数据竞争、死锁和线程清理',
      'C · 数据结构、并发与协议工程：二进制协议、序列化和字节序',
      'C · 数据结构、并发与协议工程：TLS、校验和错误恢复',
      'C · 数据结构、并发与协议工程：并发与协议综合实验',
    ]);
    expect(HANDWRITTEN_C_SYSTEMS_C6_COURSES.map((s) => s.name)).toEqual([
      'C · Redis/Nginx 源码与原生服务交付：固定仓库、tag、宏和构建选项',
      'C · Redis/Nginx 源码与原生服务交付：Redis 事件循环与连接缓冲',
      'C · Redis/Nginx 源码与原生服务交付：Nginx event cycle 与 upstream',
      'C · Redis/Nginx 源码与原生服务交付：状态机、容量和文件描述符上限',
      'C · Redis/Nginx 源码与原生服务交付：systemd、容器、core dump 和升级',
      'C · Redis/Nginx 源码与原生服务交付：C 原生服务毕业项目与源码答辩',
    ]);
  });

  it('covers cpp-performance stages X0 through X6 in checklist order', () => {
    expect(HANDWRITTEN_CPP_PERFORMANCE_X0_COURSES.map((s) => s.name)).toEqual([
      'C++ · 工具链、CMake Presets 与第一个工程：编译器、标准库、ABI 和链接',
      'C++ · 工具链、CMake Presets 与第一个工程：C++20/23 基线与编译器支持',
      'C++ · 工具链、CMake Presets 与第一个工程：CMake target 与 PUBLIC/PRIVATE',
      'C++ · 工具链、CMake Presets 与第一个工程：CMake Presets 和 Ninja',
      'C++ · 工具链、CMake Presets 与第一个工程：Conan/vcpkg 与依赖锁定',
      'C++ · 工具链、CMake Presets 与第一个工程：第一个跨平台 C++17/20 工程',
    ]);
    expect(HANDWRITTEN_CPP_PERFORMANCE_X1_COURSES.map((s) => s.name)).toEqual([
      'C++ · 值语义、类、RAII 与所有权：值语义、引用和 const 正确性',
      'C++ · 值语义、类、RAII 与所有权：类、构造、析构和 Rule of Zero',
      'C++ · 值语义、类、RAII 与所有权：RAII 管理文件、锁和网络资源',
      'C++ · 值语义、类、RAII 与所有权：拷贝控制、交换和异常安全',
      'C++ · 值语义、类、RAII 与所有权：unique_ptr、shared_ptr 与 weak_ptr',
      'C++ · 值语义、类、RAII 与所有权：资源所有权重构实验',
    ]);
    expect(HANDWRITTEN_CPP_PERFORMANCE_X2_COURSES.map((s) => s.name)).toEqual([
      'C++ · 移动、模板、Concepts 与 STL：左值、右值、移动与完美转发',
      'C++ · 移动、模板、Concepts 与 STL：模板、特化和编译期计算',
      'C++ · 移动、模板、Concepts 与 STL：concepts、ranges 与错误诊断',
      'C++ · 移动、模板、Concepts 与 STL：vector 扩容、迭代器失效和分配器',
      'C++ · 移动、模板、Concepts 与 STL：unordered_map、红黑树与算法选型',
      'C++ · 移动、模板、Concepts 与 STL：STL 源码与容器基准实验',
    ]);
    expect(HANDWRITTEN_CPP_PERFORMANCE_X3_COURSES.map((s) => s.name)).toEqual([
      'C++ · 并发、原子、内存模型与 Asio：thread、mutex、condition_variable',
      'C++ · 并发、原子、内存模型与 Asio：atomic、内存序和无锁边界',
      'C++ · 并发、原子、内存模型与 Asio：future、promise 与任务队列',
      'C++ · 并发、原子、内存模型与 Asio：Asio io_context、strand 和定时器',
      'C++ · 并发、原子、内存模型与 Asio：取消、背压和优雅停机',
      'C++ · 并发、原子、内存模型与 Asio：异步网络服务实验',
    ]);
    expect(HANDWRITTEN_CPP_PERFORMANCE_X4_COURSES.map((s) => s.name)).toEqual([
      'C++ · 构建、ABI、动态库与跨平台发布：静态库、共享库和可见性',
      'C++ · 构建、ABI、动态库与跨平台发布：ABI、name mangling 和标准库差异',
      'C++ · 构建、ABI、动态库与跨平台发布：符号版本、插件和动态加载',
      'C++ · 构建、ABI、动态库与跨平台发布：跨平台编译器和运行时依赖',
      'C++ · 构建、ABI、动态库与跨平台发布：安装包、容器和调试符号',
      'C++ · 构建、ABI、动态库与跨平台发布：二进制发布与兼容性测试',
    ]);
    expect(HANDWRITTEN_CPP_PERFORMANCE_X5_COURSES.map((s) => s.name)).toEqual([
      'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：ASan、UBSan、TSan 和 MSan 边界',
      'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：GTest、property test 和回归矩阵',
      'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：Google Benchmark 与统计波动',
      'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：perf、火焰图和缓存局部性',
      'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：core dump、符号化和版本追踪',
      'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：C++ 性能诊断报告',
    ]);
    expect(HANDWRITTEN_CPP_PERFORMANCE_X6_COURSES.map((s) => s.name)).toEqual([
      'C++ · STL/Asio 源码与高性能毕业项目：libstdc++/libc++ 的 vector 实现',
      'C++ · STL/Asio 源码与高性能毕业项目：shared_ptr 控制块与原子引用计数',
      'C++ · STL/Asio 源码与高性能毕业项目：Asio reactor、executor 和 strand',
      'C++ · STL/Asio 源码与高性能毕业项目：源代码锚点、调用链和实验',
      'C++ · STL/Asio 源码与高性能毕业项目：容量、故障、镜像和运行手册',
      'C++ · STL/Asio 源码与高性能毕业项目：C++ 高性能服务毕业项目与源码答辩',
    ]);
  });

  it('attaches a handwritten per-course quiz to every c-systems course', () => {
    const all = [
      ...HANDWRITTEN_C_SYSTEMS_C0_COURSES,
      ...HANDWRITTEN_C_SYSTEMS_C1_COURSES,
      ...HANDWRITTEN_C_SYSTEMS_C2_COURSES,
      ...HANDWRITTEN_C_SYSTEMS_C3_COURSES,
      ...HANDWRITTEN_C_SYSTEMS_C4_COURSES,
      ...HANDWRITTEN_C_SYSTEMS_C5_COURSES,
      ...HANDWRITTEN_C_SYSTEMS_C6_COURSES,
    ];
    expect(all).toHaveLength(42);
    expect(Object.keys(C_SYSTEMS_COURSE_QUIZ)).toHaveLength(42);
    for (const seed of all) {
      const quiz = C_SYSTEMS_COURSE_QUIZ[seed.name];
      expect(quiz?.length, seed.name).toBeGreaterThanOrEqual(4);
      const answers = new Set<number>();
      for (const [index, question] of (quiz ?? []).entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of BOILERPLATE) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });

  it('attaches a handwritten per-course quiz to every cpp-performance course', () => {
    const all = [
      ...HANDWRITTEN_CPP_PERFORMANCE_X0_COURSES,
      ...HANDWRITTEN_CPP_PERFORMANCE_X1_COURSES,
      ...HANDWRITTEN_CPP_PERFORMANCE_X2_COURSES,
      ...HANDWRITTEN_CPP_PERFORMANCE_X3_COURSES,
      ...HANDWRITTEN_CPP_PERFORMANCE_X4_COURSES,
      ...HANDWRITTEN_CPP_PERFORMANCE_X5_COURSES,
      ...HANDWRITTEN_CPP_PERFORMANCE_X6_COURSES,
    ];
    expect(all).toHaveLength(42);
    expect(Object.keys(CPP_PERFORMANCE_COURSE_QUIZ)).toHaveLength(42);
    for (const seed of all) {
      const quiz = CPP_PERFORMANCE_COURSE_QUIZ[seed.name];
      expect(quiz?.length, seed.name).toBeGreaterThanOrEqual(4);
      const answers = new Set<number>();
      for (const [index, question] of (quiz ?? []).entries()) {
        const tag = `${seed.name}/题${index + 1}`;
        expect(question.options.length, tag).toBeGreaterThanOrEqual(3);
        expect(question.answer, tag).toBeGreaterThanOrEqual(0);
        expect(question.answer, tag).toBeLessThan(question.options.length);
        expect(question.explanation.length, tag).toBeGreaterThanOrEqual(25);
        expect(question.focus.length, tag).toBeGreaterThan(0);
        for (const phrase of BOILERPLATE) {
          expect(question.prompt, tag).not.toContain(phrase);
          expect(question.explanation, tag).not.toContain(phrase);
        }
        answers.add(question.answer);
      }
      expect(answers.size, `${seed.name} 正确项应分散`).toBeGreaterThanOrEqual(2);
    }
  });
});
