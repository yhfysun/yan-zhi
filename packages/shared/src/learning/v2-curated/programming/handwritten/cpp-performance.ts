// C++ 高性能工程 · 手写教案（接力看板 CPP-X*，docs/编程课程教案重写进度-2026-11-21.md）
// 每门课的 name 必须与 programs.ts 模板生成的 `C++ · ${stage.title}：${topic}` 完全一致，
// 才能在 catalog.ts 的 spread 末尾覆盖同名模板课。正文写真实机制/命令/边界，禁止模板话术。
import type { ProgrammingCourseSeed } from '../shared.js';

// ── X0 工具链、CMake Presets 与第一个工程 ─────────────────────────────────────────────
export const HANDWRITTEN_CPP_PERFORMANCE_X0_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C++ · 工具链、CMake Presets 与第一个工程：编译器、标准库、ABI 和链接',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已能在命令行编译单个含头文件的 C++ 程序。',
    goal: '理解预处理、编译、汇编、链接四个阶段的输入输出与职责分工，明白 libstdc++ 与 libc++ 各自承担的角色，掌握 Itanium 与 MSVC 两套 ABI 的边界及链接符号从左到右解析的规则。',
    guidedPractice: '现场用 g++ 对同一个含模板调用的源文件依次执行 -E、-S、-c 与完整链接四档命令，观察产物从 .i、.s 到 .o 再到可执行文件的变化；再用 nm 查看 main.o 中标记为 U 的未定义符号，故意调换 -l 顺序复现 undefined reference，把报错原文与符号表抄进笔记。',
    independentPractice: '独立完成：把程序拆成 math.o 与 main.o 两个目标文件手动完成链接，再用错误的库顺序复现一次失败并修复，最后在 Linux 用 ldd、在 Windows 用 dumpbin /dependents 查看产物依赖的 C++ 运行库并写成对照说明。',
    commonErrors: ['把 g++ 编出的目标文件与 MSVC 的 .lib 直接混在一起链接，两套 ABI 不兼容，要么链接失败要么运行期崩溃。', '以为头文件找不到会在链接阶段报错，实际预处理阶段就中断，把排查方向搞反后白白重编一遍。'],
    sourceRefs: ['CMake Documentation. https://cmake.org/documentation/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['编译驱动四阶段', 'g++ 本身是驱动程序，按预处理、编译、汇编、链接四步调度 cc1plus、as 与 ld：-E 只做预处理并输出展开后的翻译单元，-S 生成汇编文本，-c 生成 .o 目标文件，不带这些选项才执行链接。可验证动作：对同一个 main.cpp 依次跑这四档命令，观察产物从 .i、.s、.o 到 a.out 或 .exe 的逐级变化。', '四步各出一种产物', {
        title: 'g++：逐级保留四个编译阶段产物',
        language: 'PowerShell',
        code: `@'
#include <iostream>
int square(int value) { return value * value; }
int main() { std::cout << square(7) << '\\n'; }
'@ | Set-Content main.cpp
g++ -std=c++20 -E main.cpp -o main.ii
g++ -std=c++20 -S main.ii -o main.s
g++ -std=c++20 -c main.s -o main.o
g++ main.o -o app
Get-ChildItem main.ii,main.s,main.o,app | Select-Object Name,Length
./app`,
        output: `Name     Length
----     ------
main.ii  182044
main.s    5842
main.o    3488
app      16920
49

-E 后仍是展开预处理指令的 C++ 文本。
-S 是汇编文本，-c 是可重定位目标文件，最后才由链接器产物可执行文件。`,
      }],
      ['标准库的落点', 'vector、string 等模板只在被使用的翻译单元里实例化，而 new、delete、iostream 与异常表的实现住在标准库二进制里：Linux 默认 libstdc++，macOS 上 Clang 默认 libc++，并可用 -stdlib=libc++ 显式切换；MSVC 则按 MT 或 MD 决定运行库静态还是动态。边界动作：g++ 加 -static-libstdc++ 后产物体积明显增大，ldd 查看时不再出现 libstdc++.so 依赖。', '库住在运行库二进制', {
        title: 'ldd：动态与静态链接 libstdc++ 对照',
        language: 'PowerShell',
        code: `g++ -std=c++20 -O2 main.cpp -o app-dynamic
g++ -std=c++20 -O2 main.cpp -static-libstdc++ -static-libgcc -o app-static
ldd app-dynamic | Select-String 'libstdc\\+\\+|libgcc_s|libc.so'
ldd app-static | Select-String 'libstdc\\+\\+|libgcc_s|libc.so'
Get-Item app-dynamic,app-static | Select-Object Name,Length
nm -D app-dynamic | Select-String '_ZSt4cout' | Select-Object -First 3`,
        output: `libstdc++.so.6 => /lib/.../libstdc++.so.6
libgcc_s.so.1 => /lib/.../libgcc_s.so.1
libc.so.6 => /lib/.../libc.so.6
Name          Length
app-dynamic    16920
app-static    861344

静态版本仍依赖 libc，但不依赖 libstdc++.so 与 libgcc_s。
iostream 与运行库符号来自链接的标准库实现，不等于模板全部实例化在二进制中。`,
      }],
      ['ABI 划出兼容边界', 'ABI 约定名字修饰、类对象内存布局、虚表结构与异常传播方式：GCC 与 Clang 在 Linux 上遵循 Itanium ABI，MSVC 是另一套，同一份源码在两套工具链下的目标文件不能互链。同一 ABI 内部也有版本边界，libstdc++ 的 _GLIBCXX_USE_CXX11_ABI 决定 std::string 两种布局，跨 .so 传 string 时不一致会导致崩溃。验证：用 nm 分别查看 GCC 与 MSVC 目标文件里同一函数的修饰名，两者形态完全不同。', '两套 ABI 不互链', {
        title: 'nm/c++filt：看懂 Itanium ABI 修饰名',
        language: 'PowerShell',
        code: `@'
namespace shop {
int total(int a, int b) { return a + b; }
}
'@ | Set-Content abi.cpp
g++ -std=c++20 -c abi.cpp -o abi.o
nm abi.o
nm -C abi.o
c++filt _ZN4shop5totalEii
clang++ -std=c++20 -c abi.cpp -o abi-clang.o
nm abi-clang.o | Select-String 'shop'`,
        output: `0000000000000000 T _ZN4shop5totalEii
0000000000000000 T shop::total(int, int)
shop::total(int, int)
0000000000000000 T _ZN4shop5totalEii

GCC 与 Clang 在 Linux 生成同一 Itanium ABI 修饰名。
MSVC 的修饰名规则不同，同一 .obj 不能与 GCC 目标文件直接互链。`,
      }],
      ['符号解析从左到右', '静态库参与链接时，ld 对命令行上的输入从左到右单趟扫描：一个 .a 只会解析在它左侧已经出现却仍未定义的符号，因此 liba.a 依赖 libb.a 时必须写成 -la -lb，写反就会留下 undefined reference；动态库不按此规则，符号在运行期由加载器解析。验证动作：故意把两个库的顺序写反复现报错，再调回正确顺序确认链接通过。', '库顺序从左到右', {
        title: 'ld：静态库依赖顺序的失败与修复',
        language: 'PowerShell',
        code: `@'
int value_b() { return 42; }
'@ | Set-Content b.cpp
@'
int value_b();
int value_a() { return value_b(); }
'@ | Set-Content a.cpp
@'
#include <iostream>
int value_a();
int main() { std::cout << value_a() << '\\n'; }
'@ | Set-Content order.cpp
g++ -c b.cpp a.cpp order.cpp
ar rcs libb.a b.o
ar rcs liba.a a.o
g++ order.o -L. -lb -la -o wrong
g++ order.o -L. -la -lb -o right
./right
nm -C liba.a | Select-String ' U '`,
        output: `undefined reference to 'value_b()'
42
                 U value_b()

左侧 order.o 需要 value_a，因此先扫 liba.a 才能收下它。
liba.a 里的 value_b 未定义，只有随后再扫 libb.a 才能补齐。`,
      }],
      ['nm 与 ldd 排查链路', '排查有固定链路：nm -C main.o 列出符号表，大写 U 表示未定义、待链接器补齐；ldd a.out 查看 Linux 动态依赖，Windows 用 dumpbin /dependents。报 undefined reference 时先用 nm 确认目标符号是否存在、修饰名是否与声明一致，C 与 C++ 混编时 extern C 缺失是常见根因。边界：MSVC 把同一问题报成 unresolved external symbol，而 multiple definition 则是多个目标文件出现同名强符号。', 'U 标记待补符号', {
        title: 'extern C 缺失：从 U 符号追到链接失败',
        language: 'PowerShell',
        code: `@'
int answer(void) { return 42; }
'@ | Set-Content answer.c
@'
#include <iostream>
extern int answer(void);
int main() { std::cout << answer() << '\\n'; }
'@ | Set-Content mixed.cpp
gcc -c answer.c -o answer.o
g++ -c mixed.cpp -o mixed.o
nm answer.o | Select-String 'answer'
nm mixed.o | Select-String 'answer'
g++ answer.o mixed.o -o mixed
@'
#include <iostream>
extern "C" int answer(void);
int main() { std::cout << answer() << '\\n'; }
'@ | Set-Content mixed.cpp
g++ -c mixed.cpp -o mixed.o
g++ answer.o mixed.o -o mixed
./mixed
ldd mixed | Select-String 'libstdc\\+\\+'`,
        output: `0000000000000000 T answer
                 U _Z6answerv
undefined reference to 'answer()'
42
libstdc++.so.6 => /lib/.../libstdc++.so.6

C 目标文件导出未修饰的 answer。
C++ 声明默认修饰成 _Z6answerv；extern "C" 让引用端也查 answer。`,
      }],
    ],
  },
  {
    name: 'C++ · 工具链、CMake Presets 与第一个工程：C++20/23 基线与编译器支持',
    track: 'P14 · 独立语言课程',
    minutes: 40,
    prerequisite: '学员已了解编译驱动流程并能在终端切换编译器版本。',
    goal: '掌握查询 GCC、Clang、MSVC 对 C++20/23 特性支持的方法，理解 -std=c++20 与 -std=c++2b 的语义差异与特性测试宏的用法，能依据 cppreference 支持表为项目选定可落地的语言基线。',
    guidedPractice: '现场用 g++、clang++、cl 各编译一段同时用到 concepts 与 std::format 的代码，对比 -std=c++20 下三家的报错差异；再到 cppreference 的 Compiler Support 表核对 std::format 在 GCC 13 才可用，把三家的版本门槛抄进对照表。',
    independentPractice: '独立完成：制作一张三列对照表，覆盖 concepts、ranges、std::format、std::print 在三大编译器的最低可用版本，并用各自的最低版本编译器把四段代码逐一编译验证，标出仅库滞后的条目。',
    commonErrors: ['在 GCC 12 上开 -std=c++23 编译用 std::format 的代码，误判成标准模式写错，实际是 libstdc++ 的库实现尚未跟上。', '把 -std=c++2b 当成另一次标准修订，实际它是 C++23 的占位写法，与 c++23 指向同一档位。'],
    sourceRefs: ['CMake Documentation. https://cmake.org/documentation/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['-std 档位的双重含义', '-std 同时决定语言特性集合与 __cplusplus 宏取值，c++20 下该宏为 202002L；语言特性与库特性进度并不同步，GCC 的 libstdc++ 到 13 才提供 std::format，Clang 在 Linux 配 libc++ 时库进度另算。验证：写 static_assert(__cplusplus == 202002L)，分别用 c++17 与 c++20 编译，前者报断言失败后者通过。', '宏值随档位变化', {
        title: 'g++：用 __cplusplus 验证标准档位',
        language: 'PowerShell',
        code: `@'
#include <iostream>
static_assert(__cplusplus == 202002L, "this target requires C++20");
int main() { std::cout << __cplusplus << '\\n'; }
'@ | Set-Content standard.cpp
g++ -std=c++17 standard.cpp -o standard17
g++ -std=c++20 standard.cpp -o standard20
./standard20
g++ -std=c++23 -dM -E -x c++ /dev/null |
  Select-String '__cplusplus'`,
        output: `static assertion failed: this target requires C++20
202002
#define __cplusplus 202302L

C++17 档位下断言失败，证明 -std 改变语言模式。
C++20 与 C++23 的宏值分别是 202002L 与 202302L。`,
      }],
      ['查 Compiler Support 表', 'cppreference 每个特性条目都附带 Compiler Support 表，语言特性与库特性分两张表，按编译器与版本逐格标注；表格以特性测试宏提案 SD-6 为依据。动手动作：查 std::print 行，确认 GCC 14、Clang 18、MSVC 19.37 起可用；再查 concepts 行，核对 GCC 10 与 Clang 10 已完整可用。', '语言库分两表查', {
        title: '特性宏：探测 concepts 与 std::format 的真实可用性',
        language: 'PowerShell',
        code: `@'
#include <cstdio>
#include <version>
int main() {
#if defined(__cpp_concepts) && __cpp_concepts >= 201907L
    std::printf("concepts=yes %ld\\n", (long)__cpp_concepts);
#else
    std::puts("concepts=no");
#endif
#if defined(__cpp_lib_format)
    std::printf("format=yes %ld\\n", (long)__cpp_lib_format);
#else
    std::puts("format=no");
#endif
}
'@ | Set-Content features.cpp
g++ --version | Select-Object -First 1
g++ -std=c++20 features.cpp -o features
./features
clang++ --version | Select-Object -First 1
clang++ -std=c++20 features.cpp -o features-clang
./features-clang`,
        output: `g++ (GCC) 12.3.0
concepts=yes 201907
format=no
Clang 16.0.6
concepts=yes 201907
format=no

concepts 是语言特性，编译器前端较早已支持。
std::format 是库特性，GCC 12 与 Clang 16 配 libstdc++ 时仍不可用。`,
      }],
      ['特性测试宏自适应', '#if __cpp_concepts >= 201907L 这类判断让同一份源码在新编译器走 concepts 实现、在旧编译器退回模板技巧，__has_include 还能探测头文件是否存在，是跨编译器库的通行做法。验证动作：用不支持该特性的旧版编译器编译含宏分支的代码，确认运行的是回退实现而非直接报错。', '宏定回退分支', {
        title: 'C++17/C++20：同一接口的 SFINAE 与 concepts 回退',
        language: 'PowerShell',
        code: `@'
#include <iostream>
#include <type_traits>
#if defined(__cpp_concepts) && __cpp_concepts >= 201907L
#include <concepts>
template <std::integral T> T doubled(T value) { return value * 2; }
#else
template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
T doubled(T value) { return value * 2; }
#endif
int main() { std::cout << doubled(21) << '\\n'; }
'@ | Set-Content fallback.cpp
g++ -std=c++17 -U__cpp_concepts fallback.cpp -o fallback17
g++ -std=c++20 fallback.cpp -o fallback20
./fallback17
./fallback20
g++ -std=c++17 -E fallback.cpp | Select-String 'enable_if|std::integral' | Select-Object -First 2`,
        output: `42
42
template <class T, std::enable_if_t<std::is_integral_v<T>, int> = 0>

C++20 走 concepts 约束，C++17 走 enable_if 回退。
接口与调用结果一致，宏依据翻译单元实际能力选择分支。`,
      }],
      ['三大编译器取用', 'GCC 在多数发行版自带但版本偏旧，可走 devtoolset 或源码构建升级；clang++ 可与 GCC 共存，用 --gcc-toolchain 指定配套标准库；Windows 上 cl 随 Visual Studio Build Tools 安装。边界动作：cl 必须在开发者命令提示符或先执行 vcvarsall.bat 的环境里运行，否则连标准头文件与 link.exe 都找不到。', 'cl 先进环境再用', {
        title: '工具链探测：g++、clang++ 与 cl 环境',
        language: 'PowerShell',
        code: `g++ --version | Select-Object -First 1
g++ -print-search-dirs | Select-String 'libraries'
clang++ --version | Select-Object -First 2
clang++ --gcc-toolchain=/usr -v -E -x c++ /dev/null 2>&1 |
  Select-String 'Selected GCC installation'
cl 2>&1 | Select-Object -First 3
'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe' \\
  -latest -products '*' -property installationPath
cmd /c '"C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat" && cl 2>&1' |
  Select-Object -First 2`,
        output: `g++ (Ubuntu 12.3.0-1ubuntu1~20.04) 12.3.0
clang version 16.0.6
Selected GCC installation: /usr/lib/gcc/x86_64-linux-gnu/12
cl : The term 'cl' is not recognized
C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools
Microsoft (R) C/C++ Optimizing Compiler Version 19.38

clang++ 通过 --gcc-toolchain 找到配套 libstdc++。
cl 只有进入 VsDevCmd 环境后才找到 INCLUDE、LIB 与 link.exe。`,
      }],
      ['基线取最小公集', '选基线的依据是编译器矩阵与关键依赖共同支持的最小标准集合：CI 还要覆盖 GCC 10 时，基线只能定 C++17，或用特性测试宏渐进开放 C++20 子集；CMake 里用 target_compile_features(target PRIVATE cxx_std_20) 表达需求，由 CMake 换算成各编译器正确的参数，而非硬编码 -std。', '取最小公集', {
        title: 'CMake：target_compile_features 生成正确标准参数',
        language: 'PowerShell',
        code: `@'
cmake_minimum_required(VERSION 3.23)
project(baseline LANGUAGES CXX)
add_library(core src/core.cpp)
target_compile_features(core PUBLIC cxx_std_20)
set_target_properties(core PROPERTIES CXX_EXTENSIONS OFF)
add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE core)
'@ | Set-Content CMakeLists.txt
New-Item -ItemType Directory -Force src | Out-Null
'int core_value() { return 42; }' | Set-Content src/core.cpp
'int core_value(); int main() { return core_value() == 42 ? 0 : 1; }' |
  Set-Content src/main.cpp
cmake -S . -B build -G Ninja -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build --verbose
Select-String build/compile_commands.json -Pattern 'c\\+\\+20|c\\+\\+2a'`,
        output: `[1/3] c++ -std=c++20 -o CMakeFiles/core.dir/src/core.cpp.o -c ../src/core.cpp
[2/3] c++ -std=c++20 ... -o CMakeFiles/app.dir/src/main.cpp.o
[3/3] c++ ... -o app
"command": "... c++ -std=c++20 ..."

CMake 把 cxx_std_20 换算为当前编译器支持的 -std 参数。
语言需求挂在 core 上并 PUBLIC 传播给 app，项目无需硬编码编译器参数。`,
      }],
    ],
  },
  {
    name: 'C++ · 工具链、CMake Presets 与第一个工程：CMake target 与 PUBLIC/PRIVATE',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已能编写基础 CMakeLists 并手动完成一次编译。',
    goal: '理解 target_link_libraries 的 PUBLIC、PRIVATE、INTERFACE 三种传播规则与 target_include_directories 的对应用法，能设计传递依赖正确、接口不泄漏的多 target 工程。',
    guidedPractice: '搭建 app 与 mathlib 两个 target，把 mathlib 的头文件目录依次按 PRIVATE、PUBLIC、INTERFACE 三档声明并逐次编译 app，观察仅 PUBLIC 与 INTERFACE 两档能让 app 直接 include mathlib 头文件；把三种情形的报错与通过结果整理成对照表。',
    independentPractice: '独立完成：实现 app、core、utils 三 target 工程，core 的对外头文件里 include utils 的头，验证 utils 的 include 目录必须以 PUBLIC 或 INTERFACE 传播，否则 core 编不过；交付带完整 target 声明的 CMakeLists。',
    commonErrors: ['把所有依赖一律写成 PUBLIC，导出或安装 target 时把内部实现用的头文件路径一起泄漏给下游。', '沿用 include_directories 全局加路径，多个 target 互相污染；应改用 target_include_directories 按 target 隔离。'],
    sourceRefs: ['CMake Documentation. https://cmake.org/documentation/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['一切属性挂在 target', '现代 CMake 以 target 为中心：add_library(mathlib STATIC src/math.cpp) 与 add_executable(app main.cpp) 创建目标，包含目录、宏定义、链接项都作为属性挂在 target 上；旧的 include_directories 与 add_definitions 按目录全局生效，容易跨 target 污染。验证：同目录建两个 target，只给其中一个 target_include_directories，另一个编译时依旧找不到头文件。', '属性挂 target 上', {
        title: 'CMake：target_include_directories 只影响指定目标',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory -Force include,src | Out-Null
@'
#pragma once
int math_value();
'@ | Set-Content include/math.hpp
@'
#include "math.hpp"
int math_value() { return 42; }
'@ | Set-Content src/math.cpp
@'
#include "math.hpp"
int main() { return math_value() == 42 ? 0 : 1; }
'@ | Set-Content src/main.cpp
@'
cmake_minimum_required(VERSION 3.23)
project(targets LANGUAGES CXX)
add_library(mathlib STATIC src/math.cpp)
target_include_directories(mathlib PRIVATE include)
add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE mathlib)
'@ | Set-Content CMakeLists.txt
cmake -S . -B build -G Ninja
cmake --build build --verbose`,
        output: `[1/2] c++ -I../include -o CMakeFiles/mathlib.dir/src/math.cpp.o
[2/2] c++ -o CMakeFiles/app.dir/src/main.cpp.o -c ../src/main.cpp
../src/main.cpp: fatal error: math.hpp: No such file or directory

include 只挂在 mathlib 自己的 PRIVATE 属性上。
app 不是 mathlib 的下游 include 消费者，因此编译 app 时没有 -I../include。`,
      }],
      ['三档传播规则', 'target_link_libraries(app PRIVATE mathlib) 的关键字决定用法要求是否传给下游：PRIVATE 表示仅自身编译需要，下游不受影响；PUBLIC 表示自身与下游都需要；INTERFACE 表示自身不需要但下游必须，纯头文件库即此形态。验证：mathlib 先用 PRIVATE，app 不声明任何包含目录直接编译报错，改成 PUBLIC 后无需重复声明即可通过。', '三档定是否传递', {
        title: 'PUBLIC/PRIVATE：同一 target 的传播边界',
        language: 'PowerShell',
        code: `@'
cmake_minimum_required(VERSION 3.23)
project(propagation LANGUAGES CXX)
add_library(mathlib STATIC src/math.cpp)
target_include_directories(mathlib PUBLIC include)
add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE mathlib)
'@ | Set-Content CMakeLists.txt
cmake -S . -B build-public -G Ninja
cmake --build build-public --verbose
(Get-Content CMakeLists.txt -Raw) -replace 'PUBLIC include', 'PRIVATE include' |
  Set-Content CMakeLists.txt
cmake -S . -B build-private -G Ninja
cmake --build build-private`,
        output: `[2/2] c++ -I../include ... -o app
PUBLIC 把 include 作为 usage requirement 传给 app。
改成 PRIVATE 后 app 的编译行没有 -I../include，math.hpp 找不到。

PRIVATE 适合内部实现目录，PUBLIC 适合对外头文件目录。`,
      }],
      ['内外头文件分目录', '惯用写法 target_include_directories(mathlib PUBLIC include PRIVATE src)：PUBLIC 的 include 放对外头文件并随 target 传递，PRIVATE 的 src 放内部头文件仅本 target 可见。边界：若对外头文件内部又 include 了 src 下的私有头，下游编译必然失败，说明该头文件依赖必须改用 PUBLIC 暴露或调整目录。', '内外目录分开声明', {
        title: '头文件泄漏：PUBLIC 头引用 PRIVATE 内部头',
        language: 'PowerShell',
        code: `@'
#pragma once
#include "secret.hpp"
int public_api();
'@ | Set-Content include/public.hpp
@'
#pragma once
constexpr int secret = 7;
'@ | Set-Content src/secret.hpp
@'
#include "public.hpp"
int public_api() { return secret; }
'@ | Set-Content src/math.cpp
@'
#include "public.hpp"
int main() { return public_api() == 7 ? 0 : 1; }
'@ | Set-Content src/main.cpp
@'
cmake_minimum_required(VERSION 3.23)
project(private_header LANGUAGES CXX)
add_library(mathlib STATIC src/math.cpp)
target_include_directories(mathlib PUBLIC include PRIVATE src)
add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE mathlib)
'@ | Set-Content CMakeLists.txt
cmake -S . -B build -G Ninja
cmake --build build`,
        output: `public.hpp: fatal error: secret.hpp: No such file or directory

mathlib 自己编译能看见 src/secret.hpp。
app 只继承 PUBLIC include，不继承 PRIVATE src，所以 public.hpp 的 include 失败。`,
      }],
      ['依赖图自动传递', '链接关系构成有向图，CMake 自动把 PUBLIC 与 INTERFACE 的用法要求沿图传递：app PRIVATE 链 core、core PUBLIC 链 utils 时，app 能继承 utils 的包含目录与编译定义，链接命令行也会带上 utils。验证动作：用 cmake --graphviz=dep.dot 生成依赖图，确认 utils 出现在 app 的传递闭包里。', '沿图自动传递', {
        title: 'CMake graphviz：验证 utils 进入 app 传递闭包',
        language: 'PowerShell',
        code: `@'
cmake_minimum_required(VERSION 3.23)
project(graph LANGUAGES CXX)
add_library(utils STATIC src/utils.cpp)
target_include_directories(utils PUBLIC include)
add_library(core STATIC src/core.cpp)
target_link_libraries(core PUBLIC utils)
add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE core)
'@ | Set-Content CMakeLists.txt
New-Item -ItemType Directory -Force include,src | Out-Null
@'
#pragma once
int utility();
'@ | Set-Content include/utils.hpp
'int utility() { return 7; }' | Set-Content src/utils.cpp
@'
#include "utils.hpp"
int core() { return utility(); }
'@ | Set-Content src/core.cpp
'int core(); int main() { return core() == 7 ? 0 : 1; }' | Set-Content src/main.cpp
cmake -S . -B build -G Ninja --graphviz=build/deps.dot
cmake --build build
dot -Tsvg build/deps.dot -o build/deps.svg
Select-String build/deps.dot -Pattern 'app.*core|core.*utils' | Select-Object -First 5
cmake --build build --verbose`,
        output: `"app" -> "core"
"core" -> "utils"
[3/3] c++ -I../include -o app ... src/main.cpp src/core.cpp libutils.a

core 用 PUBLIC 链接 utils，app 继承 utils 的 include 目录。
链接行同时包含 libutils.a；依赖图与命令行互相印证。`,
      }],
      ['静态库顺序与循环依赖', 'CMake 基本保持书写顺序生成链接命令，静态库 a 依赖 b 时先写 a，与命令行 ld 的左到右规则一致；共享库之间顺序敏感度低。边界：两个 target 循环依赖时，拆开成两行 target_link_libraries 分别声明，或用生成器表达式 $<LINK_GROUP:RESCUE,a,b> 让链接器反复扫描组内成员直到符号收敛。', '环依赖拆行声明', {
        title: 'CMake：LINK_GROUP RESCUE 解开循环静态库',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory -Force src | Out-Null
@'
cmake_minimum_required(VERSION 3.24)
project(cycle LANGUAGES CXX)
add_library(a STATIC src/a.cpp)
add_library(b STATIC src/b.cpp)
target_link_libraries(a PRIVATE b)
target_link_libraries(b PRIVATE a)
add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE "$<LINK_GROUP:RESCUE,a,b>")
'@ | Set-Content CMakeLists.txt
@'
int b();
int a() { return b() + 1; }
'@ | Set-Content src/a.cpp
@'
int a();
int b() { return 41; }
'@ | Set-Content src/b.cpp
'int a(); int main() { return a() == 42 ? 0 : 1; }' | Set-Content src/main.cpp
cmake -S . -B build -G Ninja
cmake --build build --verbose`,
        output: `"c++ ... -Wl,--start-group liba.a libb.a -Wl,--end-group"

RESCUE 让 GNU ld 在组内反复扫描，直到循环符号收敛。
若直接按单趟顺序链接，a 与 b 的互相引用会留下 undefined reference。`,
      }],
    ],
  },
  {
    name: 'C++ · 工具链、CMake Presets 与第一个工程：CMake Presets 和 Ninja',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已掌握 target 依赖传播概念并跑通过一个多目标工程。',
    goal: '掌握 CMakePresets.json 的 configurePresets、buildPresets、testPresets 字段结构与 inherits 继承机制，理解 Ninja 生成器的增量构建特点，能用 preset 命令复现一致的构建配置。',
    guidedPractice: '手写含 debug 与 release 两个 configurePreset 的 CMakePresets.json，generator 指定为 Ninja，逐一执行 cmake --preset debug 与 cmake --preset release，观察 binaryDir 分离后两份 CMakeCache.txt 互不干扰；再执行 cmake --build --preset debug 验证配置到构建的链路。',
    independentPractice: '独立完成：补一个继承 base 的 sanitizer preset，用 inherits 复用公共 cacheVariables，再执行 cmake --workflow --preset dev 一次完成配置、构建与 ctest，三个环节的输出留存成验证记录。',
    commonErrors: ['把多个 preset 的 binaryDir 指向同一目录，debug 与 release 互相覆盖 CMakeCache.txt，缓存变量串台后构建行为诡异。', '以为 cmake --preset 会产出二进制，实际它只做配置阶段，还须执行 cmake --build --preset 才生成目标文件。'],
    sourceRefs: ['CMake Documentation. https://cmake.org/documentation/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['配置固化成具名条目', 'cmake -G Ninja -DCMAKE_BUILD_TYPE=Debug -S . -B build 这类长命令在团队与 CI 之间难以保证一致，CMakePresets.json 把生成器、缓存变量、binaryDir 固化成具名条目，用 cmake --preset debug 一条命令替代；顶层 version 字段声明 schema 版本，使用 buildPresets 与 testPresets 时至少要 3，低版本 CMake 按版本拒绝解析。验证：把 version 写成 1 并加入 testPresets，观察 CMake 报出版本不支持的错误。', '配置固化成文件', {
        title: 'CMakePresets：一条命令完成具名配置',
        language: 'PowerShell',
        code: `@'
cmake_minimum_required(VERSION 3.23)
project(presets LANGUAGES CXX)
add_executable(app main.cpp)
enable_testing()
add_test(NAME smoke COMMAND app)
'@ | Set-Content CMakeLists.txt
@'
#include <iostream>
int main() { std::cout << "ok\\n"; return 0; }
'@ | Set-Content main.cpp
@'
{
  "version": 3,
  "configurePresets": [
    {
      "name": "debug",
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/build/debug",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug",
        "CMAKE_CXX_STANDARD": "20"
      }
    }
  ]
}
'@ | Set-Content CMakePresets.json
cmake --list-presets
cmake --preset debug
cmake --build build/debug
ctest --test-dir build/debug --output-on-failure`,
        output: `Available configure presets:
  "debug"
-- Configuring done
-- Generating done
[2/2] Linking CXX executable app
100% tests passed, 0 tests failed out of 1

生成器、构建类型、C++ 标准与目录都来自同一个 preset。
CI 不再复制一长串 -D 参数，只需固定调用 preset 名。`,
      }],
      ['configurePresets 关键字段', '每个条目的核心字段：generator 指定 Ninja 或 Visual Studio 17 2022；binaryDir 惯用 ${sourceDir}/build/${presetName}，按 preset 名分目录，避免多配置共用缓存与 CMakeCache.txt 互相覆盖；cacheVariables 填 CMAKE_BUILD_TYPE、CMAKE_CXX_STANDARD 等变量。边界动作：把两个 preset 的 binaryDir 故意写成同一目录，先后配置后检查缓存文件被后者覆盖。', '目录按名隔离', {
        title: 'CMakePresets：debug/release 目录与缓存隔离',
        language: 'PowerShell',
        code: `@'
{
  "version": 3,
  "configurePresets": [
    {
      "name": "debug",
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/build/debug",
      "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
    },
    {
      "name": "release",
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/build/release",
      "cacheVariables": { "CMAKE_BUILD_TYPE": "Release" }
    }
  ]
}
'@ | Set-Content CMakePresets.json
cmake --preset debug
cmake --preset release
Select-String build/debug/CMakeCache.txt -Pattern '^CMAKE_BUILD_TYPE:'
Select-String build/release/CMakeCache.txt -Pattern '^CMAKE_BUILD_TYPE:'
Get-ChildItem build/debug, build/release -Filter CMakeCache.txt |
  Select-Object FullName,LastWriteTime`,
        output: `build/debug/CMakeCache.txt:CMAKE_BUILD_TYPE:STRING=Debug
build/release/CMakeCache.txt:CMAKE_BUILD_TYPE:STRING=Release
FullName                              LastWriteTime
build/debug/CMakeCache.txt            15:32:10
build/release/CMakeCache.txt          15:32:11

两个 preset 各自拥有 binaryDir 与 CMakeCache.txt。
若把两者指向同一目录，后一次配置会覆盖前者缓存，构建语义就混线。`,
      }],
      ['inherits 继承与 hidden', 'preset 支持 inherits 复用：base preset 放公共 generator 与 cacheVariables，子 preset 只覆写差异键并新增变量，同名键子级覆盖父级；hidden 父 preset 只作继承源，不出现在 cmake --list-presets 输出。验证：写 base 加 debug、release 两个子 preset，执行 cmake --list-presets 确认 hidden 项不出现且子项变量生效。', '子键覆写父键', {
        title: 'CMakePresets：hidden base 与子级覆盖',
        language: 'PowerShell',
        code: `@'
{
  "version": 3,
  "configurePresets": [
    {
      "name": "base",
      "hidden": true,
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/build/\${presetName}",
      "cacheVariables": {
        "CMAKE_EXPORT_COMPILE_COMMANDS": "ON",
        "CMAKE_CXX_STANDARD": "17"
      }
    },
    {
      "name": "debug",
      "inherits": "base",
      "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
    },
    {
      "name": "asan",
      "inherits": "base",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug",
        "CMAKE_CXX_STANDARD": "20",
        "CMAKE_CXX_FLAGS": "-fsanitize=address -fno-omit-frame-pointer"
      }
    }
  ]
}
'@ | Set-Content CMakePresets.json
cmake --list-presets
cmake --preset asan
Select-String build/asan/CMakeCache.txt -Pattern 'CMAKE_CXX_STANDARD|CMAKE_CXX_FLAGS|CMAKE_BUILD_TYPE'`,
        output: `Available configure presets:
  "debug"
  "asan"
CMAKE_BUILD_TYPE:STRING=Debug
CMAKE_CXX_FLAGS:STRING=-fsanitize=address -fno-omit-frame-pointer
CMAKE_CXX_STANDARD:UNINITIALIZED=20

hidden base 不出现在列表，但 generator、目录与公共变量被继承。
asan 覆盖父级 CXX 标准 17，最终缓存值变为 20。`,
      }],
      ['Ninja 的增量构建', 'Ninja 把全部构建规则写进单个 build.ninja，以文件哈希与时间戳做增量判定，调度极快，适合大工程与 CI；CMake 用 -G Ninja 生成后，cmake --build --preset 或直接调用 ninja 驱动。边界：Windows 上需要完整 VS 集成时可改用 Visual Studio 生成器，日常命令行构建 Ninja 更快。验证动作：完整构建一次后只改一个源文件重跑，观察输出仅重编受影响的 .o 与链接步骤。', '增量判定极快', {
        title: 'Ninja：修改一个源文件只重编受影响目标',
        language: 'PowerShell',
        code: `@'
cmake_minimum_required(VERSION 3.23)
project(incremental LANGUAGES CXX)
add_library(core STATIC core.cpp)
add_executable(app main.cpp)
target_link_libraries(app PRIVATE core)
'@ | Set-Content CMakeLists.txt
'int core() { return 1; }' | Set-Content core.cpp
'int core(); int main() { return core(); }' | Set-Content main.cpp
cmake -S . -B build -G Ninja
cmake --build build --verbose
'int core() { return 2; }' | Set-Content core.cpp
cmake --build build --verbose
Get-Item build/build.ninja | Select-Object Length,LastWriteTime`,
        output: `[1/3] c++ ... -c ../core.cpp
[2/3] c++ ... -c ../main.cpp
[3/3] c++ ... -o app
[1/2] c++ ... -c ../core.cpp
[2/2] c++ ... -o app

第一次构建三个动作；只改 core.cpp 后 main.cpp 未重编。
Ninja 只执行依赖图判定为过期的边，再重链接 app。`,
      }],
      ['build 与 test preset 串联', 'buildPresets 被 cmake --build --preset 消费，testPresets 被 ctest --preset 消费，两者通过 configurePreset 字段绑到对应配置，该字段必须指向已存在的配置条目，ctest 按它读取 build 目录里的测试集；CMake 3.25 起还可用 cmake --workflow --preset 一次串起 configure、build、test。验证：先分别执行三条 preset 命令，再跑同名的 workflow preset，比对产物与测试结果完全一致。', '三段串成一条', {
        title: 'CMake workflow：configure/build/test 一条命令',
        language: 'PowerShell',
        code: `@'
{
  "version": 6,
  "configurePresets": [
    {
      "name": "dev-config",
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/build/dev"
    }
  ],
  "buildPresets": [
    { "name": "dev-build", "configurePreset": "dev-config" }
  ],
  "testPresets": [
    { "name": "dev-test", "configurePreset": "dev-config", "output": { "outputOnFailure": true } }
  ],
  "workflowPresets": [
    {
      "name": "dev",
      "steps": [
        { "type": "configure", "name": "dev-config" },
        { "type": "build", "name": "dev-build" },
        { "type": "test", "name": "dev-test" }
      ]
    }
  ]
}
'@ | Set-Content CMakePresets.json
cmake --workflow --preset dev
cmake --workflow --preset dev --fresh`,
        output: `Executing workflow step 1 of 3: configure preset "dev-config"
Executing workflow step 2 of 3: build preset "dev-build"
Executing workflow step 3 of 3: test preset "dev-test"
100% tests passed, 0 tests failed out of 1

同一 workflow 顺序执行配置、构建、测试。
--fresh 清空配置缓存后仍由 presets 完全重建，不依赖本机残留状态。`,
      }],
    ],
  },
  {
    name: 'C++ · 工具链、CMake Presets 与第一个工程：Conan/vcpkg 与依赖锁定',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已会用 CMake 组织多个 target 并理解 preset 的基本用法。',
    goal: '掌握 Conan 的 conanfile.txt 声明方式与 lockfile 固定依赖图的机制，理解 vcpkg.json 清单模式与 builtin-baseline 的版本锁定方式，能为工程选择合适的包管理路径。',
    guidedPractice: '先写 conanfile.txt 声明 fmt/10.2.1 并执行 conan install . --build=missing，观察 conan.lock 与 conan_toolchain.cmake 的落盘；再切到 vcpkg.json 清单模式执行 vcpkg install，比对两种方式生成的集成文件与目录结构，把关键路径整理成对照说明。',
    independentPractice: '独立完成：把 fmt 升级到指定新版本并重新生成 conan.lock，验证存在 lock 时重复 install 得到完全一致的版本图；再用 vcpkg 的 builtin-baseline 复现同样的确定性，写出两种锁定机制的差异结论。',
    commonErrors: ['删除 conan.lock 后重新 install，解析器取到满足约束的更新版本，二进制行为与上次构建悄然不同。', 'vcpkg 清单模式忘了让 CMake 加载 vcpkg.cmake 工具链文件，find_package 找不到已安装的包，误判成包没装上。'],
    sourceRefs: ['CMake Documentation. https://cmake.org/documentation/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['profile 决定包 ID', 'Conan 2 默认从 ConanCenter 远程拉取配方，conan profile detect 生成默认 profile，记录编译器、版本与构建类型等 settings；安装时按 profile 决定二进制变体，同一包在不同 profile 下包 ID 不同。验证：执行 conan profile show 查看当前 settings，再改 settings.build_type 前后各装一次 fmt，观察包 ID 与缓存目录的变化。', '变体随配置走', {
        title: 'Conan：profile detect 与构建类型变体',
        language: 'PowerShell',
        code: `conan profile detect --force
conan profile list
conan profile show
$profile = conan profile path default
Get-Content $profile
conan install --requires=fmt/10.2.1 -s build_type=Debug --build=missing
conan install --requires=fmt/10.2.1 -s build_type=Release --build=missing
conan list "fmt/10.2.1:*"`,
        output: `Detected profile:
[settings]
arch=x86_64
build_type=Release
compiler=gcc
compiler.version=12
compiler.cppstd=gnu17
fmt/10.2.1#...: package_id=9b...
fmt/10.2.1#...: package_id=54...

Debug 与 Release 生成不同 package_id，二进制变体分开缓存。
profile 改了编译器版本或 C++ 标准，也会切换包 ID。`,
      }],
      ['conanfile.txt 声明依赖', '[requires] 段列出依赖如 fmt/10.2.1，[generators] 选 CMakeDeps 与 CMakeToolchain；CMakeDeps 为每个包生成 config 与 version 文件供 find_package 精确匹配，CMakeToolchain 则把 profile 设置转成工具链变量，conan install . 据此产出 conan_toolchain.cmake，CMake 侧用 find_package(fmt) 加 target_link_libraries(app PRIVATE fmt::fmt) 接上。边界：版本表达支持精确版本、>= 与 < 区间等多种约束，要复现就精确锁死。', '配方产出集成文件', {
        title: 'Conan + CMake：从 conanfile 到 fmt::fmt',
        language: 'PowerShell',
        code: `@'
[requires]
fmt/10.2.1
[generators]
CMakeDeps
CMakeToolchain
'@ | Set-Content conanfile.txt
conan install . --build=missing -of build/conan
Get-ChildItem build/conan | Select-Object Name
@'
cmake_minimum_required(VERSION 3.23)
project(conan_app LANGUAGES CXX)
find_package(fmt CONFIG REQUIRED)
add_executable(app main.cpp)
target_link_libraries(app PRIVATE fmt::fmt)
'@ | Set-Content CMakeLists.txt
@'
#include <fmt/core.h>
int main() { fmt::print("orders={}\\n", 42); }
'@ | Set-Content main.cpp
cmake -S . -B build/app -G Ninja -DCMAKE_TOOLCHAIN_FILE=conan_toolchain.cmake
cmake --build build/app
./build/app/app`,
        output: `conan_toolchain.cmake
fmt-config.cmake
fmt-config-version.cmake
orders=42

CMakeDeps 生成 find_package 所需 config 文件。
CMakeToolchain 把 Conan profile 映射为编译器与标准变量。`,
      }],
      ['lockfile 冻结依赖图', 'conan install 默认解析约束内最新版本，lockfile 把完整依赖图连同包 ID 一起冻结：携带 --lockfile conan.lock 再次安装时按图直接取用，团队与 CI 得到同一版本集合。验证动作：首次 install 生成 conan.lock 后，手动篡改其中某个版本号再执行 install，观察校验失败报错，理解 lock 文件只由工具生成。', 'lock 冻结全图', {
        title: 'Conan：lockfile 固定完整依赖图',
        language: 'PowerShell',
        code: `conan install . --build=missing -of build/locked --lockfile-out=conan.lock
Get-FileHash conan.lock | Select-Object Algorithm,Hash
conan install . --build=missing -of build/locked-2 --lockfile=conan.lock
Get-Content conan.lock -TotalCount 20
$bad = Get-Content conan.lock -Raw
$bad = $bad.Replace('fmt/10.2.1', 'fmt/10.2.0')
$bad | Set-Content conan.bad.lock
conan install . -of build/bad --lockfile=conan.bad.lock`,
        output: `Algorithm Hash
SHA256    6b21...
Lockfile requires fmt/10.2.1 which does not satisfy ref fmt/10.2.0

第一次 install 生成 conan.lock，第二次按图直接复用。
手工篡改 lock 后 Conan 校验失败，说明锁文件必须由工具生成。`,
      }],
      ['vcpkg 清单与 baseline', 'vcpkg.json 清单模式声明 dependencies 与 builtin-baseline，baseline 指向 vcpkg 仓库某个提交，全部包版本由该提交下的版本数据库决定；CMake 通过 CMAKE_TOOLCHAIN_FILE 指向 vcpkg.cmake 接入，find_package 才能命中。边界：vcpkg 没有独立 lockfile 文件，确定性由 baseline 提交保证，需要更细的钉版时用 overrides 指定单个包版本。', 'baseline 定版本', {
        title: 'vcpkg：manifest + builtin-baseline 接入 CMake',
        language: 'PowerShell',
        code: `$baseline = git -C C:/tools/vcpkg rev-parse HEAD
@"
{
  "name": "orders",
  "version": "0.1.0",
  "builtin-baseline": "$baseline",
  "dependencies": ["fmt"]
}
"@ | Set-Content vcpkg.json
C:/tools/vcpkg/vcpkg.exe install --triplet x64-windows
cmake -S . -B build/vcpkg -G Ninja -DCMAKE_TOOLCHAIN_FILE=C:/tools/vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build build/vcpkg
./build/vcpkg/app.exe
C:/tools/vcpkg/vcpkg.exe list | Select-String 'fmt'`,
        output: `fmt:x64-windows 10.2.1
orders=42

baseline 提交决定 vcpkg 版本数据库，再固定 fmt 的解析结果。
CMAKE_TOOLCHAIN_FILE 让 CMake 自动找到 vcpkg 安装的 config 包。`,
      }],
      ['按场景选型', 'Conan 的优势在包 ID 多变体、跨编译器矩阵与显式 lockfile，适合严格可复现的 CI 与多平台矩阵；vcpkg 与微软工具链集成顺滑，清单即 vcpkg.json，C 系依赖覆盖面广。决策动作：同一工程分别用两者接入 fmt 并跑通 find_package，对比集成文件数量、版本钉控粒度与 preset 配合方式，据此写下选型依据。', '按 CI 严度选型', {
        title: '选型对照：Conan lockfile 与 vcpkg baseline',
        language: 'PowerShell',
        code: `conan graph info . --format=json *> conan-graph.json
Get-ChildItem build/conan | Measure-Object |
  Select-Object Count
Get-Content conan.lock | Select-String 'requires|build_requires' |
  Select-Object -First 5
C:/tools/vcpkg/vcpkg.exe list |
  Select-String 'fmt|toolchain'
Get-Content vcpkg.json
cmake --preset linux-gcc
cmake --preset windows-msvc`,
        output: `Count : 5
"requires": ["fmt/10.2.1#..."]
fmt:x64-windows 10.2.1
"builtin-baseline": "a3d..."

Conan 用显式 lockfile 冻结依赖图与包 ID。
vcpkg 用 baseline 冻结版本数据库，文件更少但粒度由 baseline 与 overrides 控制。`,
      }],
    ],
  },
  {
    name: 'C++ · 工具链、CMake Presets 与第一个工程：第一个跨平台 C++17/20 工程',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已跑通 preset 驱动的构建并能用包管理器接入依赖。',
    goal: '把工具链、preset、包管理与平台知识组装成一个可跨 Windows、Linux、macOS 构建的工程，掌握 target 级语言基线声明、平台分支写法与交付前的验收清单。',
    guidedPractice: '按 src、include、tests 三目录搭建骨架，写带 target_compile_features 与 find_package(fmt) 的 CMakeLists，分别用 linux-gcc 与 windows-msvc 两个 preset 配置构建，对比两平台产物与集成差异；最后执行 ctest 确认测试全绿。',
    independentPractice: '独立完成：交付一个含静态库、可执行文件、依赖 fmt、带 debug 与 release preset 且 ctest 全绿的工程，并在 Linux 与 Windows 各完成一次全新 clone 到构建成功的全流程，留存两边的命令序列。',
    commonErrors: ['用全局 set(CMAKE_CXX_STANDARD 20) 一刀切，下游 target 被迫跟随同一标准，应改用 target_compile_features 按需声明。', '只在单一平台验证就宣称跨平台，Windows 的 CRLF 与 Linux 的路径大小写差异要等对方平台 CI 才暴露。'],
    sourceRefs: ['CMake Documentation. https://cmake.org/documentation/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['工程骨架与显式源清单', '最小骨架是顶层 CMakeLists 搭配 src 与 include：cmake_minimum_required(VERSION 3.23) 与 project(demo CXX) 打头，add_library(core STATIC) 收纳实现，add_executable(app) 链接 core；源文件逐个列出而非 file(GLOB)，glob 不会因新增文件自动触发重新配置，是常见的漏编来源。验证：构建后手动新建一个未列入清单的 cpp，确认它完全没被编译。', '源文件逐个列出', {
        title: '跨平台工程：显式源清单与 src/include/tests',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory -Force src,include,tests | Out-Null
@'
#pragma once
int core_value();
'@ | Set-Content include/core.hpp
@'
#include "core.hpp"
int core_value() { return 42; }
'@ | Set-Content src/core.cpp
@'
#include "core.hpp"
int main() { return core_value() == 42 ? 0 : 1; }
'@ | Set-Content src/main.cpp
@'
#include "core.hpp"
int main() { return core_value() == 42 ? 0 : 1; }
'@ | Set-Content tests/smoke.cpp
@'
cmake_minimum_required(VERSION 3.23)
project(demo LANGUAGES CXX)
add_library(core STATIC src/core.cpp)
target_include_directories(core PUBLIC include)
add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE core)
enable_testing()
add_executable(smoke tests/smoke.cpp)
target_link_libraries(smoke PRIVATE core)
add_test(NAME core-smoke COMMAND smoke)
'@ | Set-Content CMakeLists.txt
cmake -S . -B build -G Ninja
cmake --build build
ctest --test-dir build --output-on-failure
'int not_compiled() { return 0; }' | Set-Content src/unlisted.cpp
cmake --build build
Select-String build/build.ninja -Pattern 'unlisted'`,
        output: `[1/4] Building CXX object CMakeFiles/core.dir/src/core.cpp.o
[4/4] Linking CXX executable smoke
100% tests passed, 0 tests failed out of 1

新增 unlisted.cpp 没有被 build.ninja 引用，也没有参与编译。
所有源文件在 target 中显式列出，新增文件必须同步修改 CMakeLists。`,
      }],
      ['target 级语言基线', 'target_compile_features(core PUBLIC cxx_std_20) 把语言需求写进 target，CMake 换算成各编译器正确的 -std 参数，比全局 set(CMAKE_CXX_STANDARD 20) 更精准；多 target 并存时最终取最大需求。边界：仅需 c++17 的模块单独声明 cxx_std_17，同一编译器最终仍只落一个最高档位；再配 set(CMAKE_CXX_STANDARD_REQUIRED ON) 防止编译器静默降级。', '需求进 target 层', {
        title: 'target_compile_features：多 target 取最高标准需求',
        language: 'PowerShell',
        code: `@'
cmake_minimum_required(VERSION 3.23)
project(standards LANGUAGES CXX)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
add_library(cpp17 STATIC src/cpp17.cpp)
target_compile_features(cpp17 PUBLIC cxx_std_17)
add_library(cpp20 STATIC src/cpp20.cpp)
target_compile_features(cpp20 PUBLIC cxx_std_20)
add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE cpp17 cpp20)
'@ | Set-Content CMakeLists.txt
New-Item -ItemType Directory -Force src | Out-Null
'int cpp17() { return 17; }' | Set-Content src/cpp17.cpp
'int cpp20() { return 20; }' | Set-Content src/cpp20.cpp
'int cpp17(); int cpp20(); int main() { return cpp17() + cpp20(); }' |
  Set-Content src/main.cpp
cmake -S . -B build -G Ninja -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build --verbose
Select-String build/compile_commands.json -Pattern 'c\\+\\+17|c\\+\\+20'`,
        output: `[1/3] c++ -std=c++17 ... cpp17.cpp
[2/3] c++ -std=c++20 ... cpp20.cpp
[3/3] c++ -std=c++20 ... main.cpp

cpp17 target 只需 C++17，CMake 给它 -std=c++17。
app 同时依赖两者，取最高需求，因此 main.cpp 用 -std=c++20。`,
      }],
      ['平台差异走导入目标', '平台分支用 if(WIN32)、if(APPLE) 与 elseif(UNIX) 处理，例如 Windows 链 ws2_32、Linux 链 pthread，后者几乎是带线程代码的必选项；更稳妥的是 find_package(Threads REQUIRED) 后链 Threads::Threads 这类导入目标，把平台差异交给 CMake 抹平。验证动作：在 Linux preset 下删掉 Threads 声明，复现含 std::thread 代码的链接失败，恢复后通过。', '找导入目标抹平', {
        title: 'CMake Threads::Threads：平台线程库导入目标',
        language: 'PowerShell',
        code: `@'
cmake_minimum_required(VERSION 3.23)
project(threads LANGUAGES CXX)
find_package(Threads REQUIRED)
add_executable(app main.cpp)
target_link_libraries(app PRIVATE Threads::Threads)
'@ | Set-Content CMakeLists.txt
@'
#include <iostream>
#include <thread>
int main() {
    int value = 0;
    std::thread worker([&] { value = 42; });
    worker.join();
    std::cout << value << '\\n';
}
'@ | Set-Content main.cpp
cmake -S . -B build -G Ninja
cmake --build build --verbose
./build/app
(Get-Content CMakeLists.txt -Raw) -replace 'target_link_libraries.*', '' |
  Set-Content CMakeLists.no-threads.txt
Copy-Item CMakeLists.no-threads.txt CMakeLists.txt
cmake -S . -B build-broken -G Ninja
cmake --build build-broken`,
        output: `"c++ ... -pthread ..."
42
undefined reference to 'pthread_create'

Threads::Threads 在 Linux 展开为 -pthread，在 Windows 映射到 Windows 线程库。
删掉导入目标后，std::thread 的底层符号无人补齐。`,
      }],
      ['preset 矩阵与行尾约定', '顶层 CMakePresets.json 为每个平台配 configure preset：linux-gcc 用 Ninja 加 CMAKE_BUILD_TYPE，windows-msvc 用 Visual Studio 17 2022 或 Ninja 配 cl，macos-clang 用 Ninja 并可指定 libc++；preset 名与平台一一对应，CI 矩阵按名称取用，新增平台只需在 json 里加一个条目。边界：仓库用 .gitattributes 强制 LF，避免脚本与源文件在 Windows 与 Unix 工具间因 CRLF 漂移。', '矩阵逐平台跑', {
        title: 'CMakePresets：Linux/Windows/macOS 矩阵',
        language: 'PowerShell',
        code: `@'
{
  "version": 6,
  "configurePresets": [
    {
      "name": "linux-gcc",
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/build/linux-gcc",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Release",
        "CMAKE_CXX_COMPILER": "g++"
      },
      "condition": { "type": "equals", "lhs": "\${hostSystemName}", "rhs": "Linux" }
    },
    {
      "name": "windows-msvc",
      "generator": "Visual Studio 17 2022",
      "binaryDir": "\${sourceDir}/build/windows-msvc",
      "architecture": "x64",
      "condition": { "type": "equals", "lhs": "\${hostSystemName}", "rhs": "Windows" }
    },
    {
      "name": "macos-clang",
      "generator": "Ninja",
      "binaryDir": "\${sourceDir}/build/macos-clang",
      "cacheVariables": { "CMAKE_CXX_COMPILER": "clang++" },
      "condition": { "type": "equals", "lhs": "\${hostSystemName}", "rhs": "Darwin" }
    }
  ],
  "buildPresets": [
    { "name": "linux-gcc", "configurePreset": "linux-gcc" },
    { "name": "windows-msvc", "configurePreset": "windows-msvc" },
    { "name": "macos-clang", "configurePreset": "macos-clang" }
  ],
  "testPresets": [
    { "name": "linux-gcc", "configurePreset": "linux-gcc", "output": { "outputOnFailure": true } }
  ],
  "workflowPresets": [
    {
      "name": "linux-gcc",
      "steps": [
        { "type": "configure", "name": "linux-gcc" },
        { "type": "build", "name": "linux-gcc" },
        { "type": "test", "name": "linux-gcc" }
      ]
    }
  ]
}
'@ | Set-Content CMakePresets.json
'* text=auto eol=lf' | Set-Content .gitattributes
cmake --list-presets
cmake --preset linux-gcc
cmake --build --preset linux-gcc`,
        output: `Available configure presets:
  "linux-gcc"
  "windows-msvc"
  "macos-clang"
-- Configuring done
-- Build files have been written to: .../build/linux-gcc

condition 让当前平台显示自己的 preset，CI 矩阵仍可按名称解析。
.gitattributes 统一 LF，避免 PowerShell 与 shell 脚本出现行尾改写噪声。`,
      }],
      ['交付验收清单', '交付前按固定清单核验：各平台 cmake --workflow --preset 全绿、ctest 全部通过、-Wall -Wextra 警告清零、build 目录由 .gitignore 拦截不进版本库、CMakePresets.json 与依赖锁定文件一同提交。可验证动作：换一个干净目录重新 clone，仅凭仓库内 preset 命令完成配置、构建与测试，任何一步需要额外口头交代即视为不合格。', '清单逐项核验', {
        title: '干净 clone 验收：workflow + ctest + warning 门禁',
        language: 'PowerShell',
        code: `'build/' | Set-Content .gitignore
git add CMakeLists.txt CMakePresets.json .gitignore src include tests
git -c user.name='Course Lab' -c user.email='lab@example.invalid' \\
  commit -m 'build: add portable C++20 preset workflow'
git status --short
$fresh = Join-Path $env:TEMP "demo-fresh-$PID"
git clone . $fresh
Set-Location $fresh
cmake --workflow --preset linux-gcc
ctest --preset linux-gcc --output-on-failure
Get-ChildItem build |
  Select-Object Name
git status --short`,
        output: `[1/4] Building CXX object ... core.cpp.o
100% tests passed, 0 tests failed out of 1
Name
linux-gcc
(no git status output)

干净 clone 只靠仓库内 preset 完成配置、构建和测试。
build 目录被 .gitignore 拦截，工作树没有生成物污染。`,
      }],
    ],
  },
];

// ── X1 值语义、类、RAII 与所有权 ─────────────────────────────────────────────
export const HANDWRITTEN_CPP_PERFORMANCE_X1_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C++ · 值语义、类、RAII 与所有权：值语义、引用和 const 正确性',
    track: 'P14 · 独立语言课程',
    minutes: 40,
    prerequisite: '学员已能编译运行单个 C++ 文件并理解函数传参与返回的基本写法。',
    goal: '掌握值语义下拷贝发生的全部时机与成本来源，理解引用是别名且绑定后不可改绑，能正确使用 const 引用绑定临时对象并延长其生命周期，区分顶层与底层 const。',
    guidedPractice: '在同一个 main.cpp 里依次实验：写含 std::string 成员的类并在拷贝构造中打印标记，以值传递调用函数观察打印次数；再用 int& 改原值并用取地址验证别名；最后用 const 引用绑定拼接产生的临时字符串并打印，把每段输出逐条抄进笔记。',
    independentPractice: '独立完成：写一个接受大结构体的函数，先把形参改为 const 引用消除一次拷贝并说明理由；再构造 const int* 与 int* const 各一个，分别尝试改指向与改值，记录哪四次操作被编译器拒绝。',
    commonErrors: ['以为引用可以像指针一样重新指向别的对象，实际引用初始化后所有操作都作用于原对象，改绑写法只是给原对象赋值。', '把 const 引用绑定临时对象的生命周期延长规则套用到通过函数返回的引用或临时对象成员上，结果引用提前悬空。'],
    sourceRefs: ['C++ Core Guidelines. https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['值语义与拷贝成本', 'C++ 默认采用值语义：传参按值、初始化与赋值都执行逐成员拷贝，函数返回局部对象同样按值返回。实验方法是用一个含 std::string 成员的结构体，在拷贝构造函数里打印标记，再调用一次按值传参的函数，观察标记恰好出现一次，说明副本被整体复制。拷贝代价随成员体积线性增长，体积大的对象传参应改用 const 引用，只读且避免复制。', '逐成员拷贝成副本'],
      ['引用是别名', '引用在定义时必须绑定一个已存在的左值，之后无法改绑，对它的读写都作用于被绑对象。用 int a = 10; int& r = a; r = 20; 后打印 a 得到 20，再比较 &r == &a 输出 true，验证二者地址相同。引用没有空引用的合法写法，也不存在重新指向的语法，这些边界使接口签名能表达必传且不可空的约束。', '绑定后不可改绑'],
      ['const 引用延长临时生命周期', '非常量左值引用不能绑定右值，const 左值引用可以，并把临时对象的生命周期延长到该引用所在作用域结束。写 const std::string& s = std::string("ab") + "cd"; 打印 s 内容完整可读，程序结束前对象一直存活。边界是延长只对直接绑定的那一层生效，若经函数返回引用或取临时对象成员再绑定，临时在完整表达式末尾照常销毁，引用随即悬空。', '临时生命周期延长'],
      ['const 成员函数与 mutable', '成员函数参数列表后加 const 承诺不修改对象状态，编译器把函数内的 this 当成 const 指针，给成员赋值直接编译报错；const 对象只能调用 const 成员函数。缓存、计数这类不影响逻辑状态的成员可标 mutable，允许在 const 函数内修改。可验证动作：在 const 函数里对普通成员自增得到编译错误，加 mutable 后通过，说明修改被限定在非逻辑状态上。', '拒绝修改对象状态'],
      ['顶层与底层 const', '底层 const 修饰指向物：const int* p 允许改指向但不许通过 p 改值；顶层 const 修饰指针自身：int* const q 初始化后不能改指向。把 const int* 传入接受 int* 的函数会编译失败，非常量到常量的隐式转换则始终允许。读声明从右往左：const char* const s 表示指向常字符的常指针，指向与内容两层都不可变，按此规则可解析任意复杂声明。', '从右往左读声明'],
    ],
  },
  {
    name: 'C++ · 值语义、类、RAII 与所有权：类、构造、析构和 Rule of Zero',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已掌握引用与 const 的基本语义，能编写含成员函数的简单类。',
    goal: '掌握初始化列表的执行顺序规则与 explicit 的作用，能准确复述析构逆序与成员析构顺序，理解 Rule of Zero 与 Rule of Five 的适用条件并据此决定特殊成员函数的写法。',
    guidedPractice: '现场定义含两个成员的类做三组实验：调换初始化列表书写顺序观察 -Wreorder 警告；给单参数构造函数加 explicit 前后分别调用隐式转换语句对比编译结果；再让两个成员的析构函数各打印名字，观察离开作用域时的输出顺序，全部记录进操作单。',
    independentPractice: '独立完成：写一个仅含 string 与 vector 成员的类，不定义任何特殊成员函数，验证赋值、传值、返回全部正确；再写一个含裸指针成员并自定义析构的类，用 =default 或 =delete 补齐五个特殊函数，复现并修复浅拷贝二次释放。',
    commonErrors: ['以为成员按初始化列表的书写顺序构造，实际顺序由声明顺序决定，写错时用未初始化成员初始化后面的成员。', '给类定义了析构函数却不处理拷贝，编译器不再自动生成移动构造，默认拷贝对指针成员浅拷贝导致二次释放。'],
    sourceRefs: ['C++ Core Guidelines. https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['初始化列表与声明顺序', '成员初始化列表让成员在进入构造函数体之前完成构造，比函数体内先默认构造再赋值少一道工序，const 成员与引用成员只能在这里初始化。关键边界是初始化顺序严格等于成员的声明顺序，与列表书写顺序无关。用 -Wreorder 编译可以让编译器对顺序不一致发出警告，实验：声明顺序为 a 在前 b 在后，列表却写 b(a), a(1)，警告指出的正是 b 用了未初始化的 a。', '顺序随声明不随列表'],
      ['explicit 拦截隐式转换', '单参数构造函数默认允许隐式转换，任何需要一个该类对象的位置都能把参数悄悄构造成临时对象。给构造函数加 explicit 后该路径被禁止，必须写 Distance(3) 或 Distance{3} 这类显式形式。可验证动作：写 void f(Distance); 不加 explicit 时 f(3) 能编译通过，加上后报 no matching function，类从此只保留显式构造入口，避免 3 和 Distance(3) 在重载决议中产生歧义。', '显式构造拦隐转'],
      ['析构逆序与成员析构', '析构顺序与构造严格相反：先执行析构函数体，再按成员声明顺序的逆序逐个析构成员，最后析构基类。触发时机包括局部对象离开作用域、对象被 delete、异常展开栈途经该作用域。可验证动作：写两个成员各在析构里打印自己的名字，声明顺序 a 后 b，运行观察输出先 b 后 a；再在成员构造函数里也打印，对照构造顺序完整相反，确认成员析构按声明逆序执行。', '先体后成员逆序'],
      ['Rule of Zero', '类不直接持有裸资源、只用 vector、string、智能指针这些自带清理能力的成员时，不写析构、拷贝构造、拷贝赋值、移动构造、移动赋值五个特殊函数，编译器生成的默认版本自动做逐成员拷贝与析构，正确性由成员自身的拷贝控制兜底。可验证动作：对仅含 string 与 vector 成员的类直接赋值与按值传递，结果正确且无泄漏；代码量最小、出错面最小，这是默认首选写法。', '默认成员自动正确'],
      ['Rule of Five 触发条件', '一旦类需要自定义析构函数管理裸资源，五个特殊成员函数就要一齐表态。声明了析构后编译器不再自动生成移动构造与移动赋值，拷贝仍会生成但对指针成员只做浅拷贝，两个对象析构时对同一块内存 delete 两次。可验证动作：写含裸指针并自定义析构的类，按值赋值后运行得到二次释放崩溃；把拷贝与移动全部 =default 或对不需要的 =delete，五种行为显式声明后崩溃消失。', '五函数需一齐表态'],
    ],
  },
  {
    name: 'C++ · 值语义、类、RAII 与所有权：RAII 管理文件、锁和网络资源',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已理解对象生命周期与构造析构的调用时机，能编写多作用域函数。',
    goal: '掌握 RAII 把资源释放绑定到析构的机制与栈展开下的行为，会用 fstream、lock_guard、unique_lock 管理文件与锁，能为套接字等标准库不覆盖的资源写出自持的 RAII 包装类。',
    guidedPractice: '现场写三个小实验：函数内打开 fstream 不调用 close 直接提前 return，验证析构完成关闭；临界区用 lock_guard 包裹并在其后打印持锁标记；再写一个自管理句柄的小类，构造打印获取、析构打印关闭，中间故意 throw 观察异常路径下析构仍然执行。',
    independentPractice: '独立完成：实现一个读取配置文件并统计行数的函数，要求任何失败路径都不泄漏文件句柄；再封装一个 RAII 互斥管理器支持中途解锁；最后为一个套接字句柄写禁拷贝、可移动的包装类，用异常路径用例验证句柄恰好关闭一次。',
    commonErrors: ['把 fstream 当成需要手动 close 才安全的资源，在多条 return 路径上都写 close，漏写一条就泄漏句柄，实际析构已自动完成。', '在需要中途解锁的临界区坚持用 lock_guard，它没有解锁接口，绕过去手动调互斥量 unlock 会在作用域结束时造成未定义行为。'],
    sourceRefs: ['C++ Core Guidelines. https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['RAII 与栈展开', 'RAII 把资源绑定到对象生命周期：构造函数获取资源，析构函数释放，释放不依赖程序员逐条路径记忆，而由作用域退出保证。异常展开栈时，沿途每个已构造完成的局部对象析构照样执行，这是 C++ 异常安全的地基。可验证动作：写函数在获取锁和文件之后中途 throw，两个对象的析构函数都打印释放信息，输出证明异常路径下释放必然发生，不需要 catch 里补清理代码。', '析构即释放'],
      ['fstream 析构自动关闭', 'std::ifstream 与 std::ofstream 析构时自动调用 close 并冲洗缓冲，离开作用域即完成，提前 return 或抛异常都不会漏。打开后先检查 is_open 判断成败，读写后检查 failbit 与 badbit 区分格式错误与严重 IO 错误。可验证动作：函数内打开文件不调用 close 直接返回，随后再次以写模式打开同一文件成功，说明句柄已在析构时释放；手动 close 只在需要提前释放或 flush 确认落盘时才必要。', '离开作用域即关'],
      ['lock_guard 与 unique_lock', 'std::lock_guard 构造时加锁、析构时解锁，零额外开销，适用于整段作用域持锁；std::unique_lock 额外支持延迟加锁、中途 unlock、记录是否持有，条件变量的 wait 必须用它，因为挂起前要解锁、唤醒后要重新加锁。可验证动作：临界区需要在持锁状态下先落盘再解锁时，lock_guard 提供不了中途解锁接口，换 unique_lock 调 unlock 即可；对比两种写法在作用域退出时都由析构解锁，不会漏。', '构造锁析构解'],
      ['网络资源包装', '标准库不提供套接字封装，文件描述符与 socket 需要自写 RAII 类：构造中调用 socket 或 open 拿到句柄，失败抛异常或置无效态；析构中调用 close；禁用拷贝或实现移动语义，防止同一句柄被双重关闭。Windows 与 POSIX 的接口不同，封装层把 close 动作统一收敛在一处。可验证动作：构造成功后打印句柄值，作用域结束后析构打印关闭信息，再在构造失败分支抛异常，确认无效句柄不会被误关。', '句柄随对象消亡'],
      ['释放顺序与依赖', '析构逆序意味着后申请的资源先释放，这正好匹配大多数依赖关系：先开文件后加锁，退出时先解锁后关文件。若存在依赖，例如日志缓冲还引用着文件对象，就要让缓冲声明在文件之后，保证缓冲先析构、文件后析构。可验证动作：写两个互相引用对方输出的对象，调换二者声明顺序，观察析构打印顺序随之翻转，确认依赖方向与析构顺序始终一致，悬空访问不再出现。', '后申请的先释放'],
    ],
  },
  {
    name: 'C++ · 值语义、类、RAII 与所有权：拷贝控制、交换和异常安全',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已掌握拷贝构造、析构函数与 vector 的基本用法，理解异常传播路径。',
    goal: '掌握拷贝与移动构造的触发时机，理解 noexcept 标记决定 vector 扩容走移动还是拷贝的机制，会实现拷贝并交换惯用法获得强异常安全，能区分异常安全三档保证的边界。',
    guidedPractice: '现场做三组实验：给含 vector 成员的类的移动构造先不标 noexcept，用 push_back 触发扩容观察打印的是拷贝标记；加上 noexcept 后重跑对比；再实现拷贝并交换版赋值运算符，故意让拷贝构造抛异常，检查原对象数据在赋值失败后是否完整，把两次扩容与失败赋值的输出抄进记录。',
    independentPractice: '独立完成：实现一个管理动态缓冲区的 Buffer 类，提供 noexcept 移动构造与拷贝并交换赋值，用基准程序向 vector<Buffer> 插入大量元素并触发多次扩容，记录标记 noexcept 前后的耗时差，最后用 -fsanitize=address 验证无泄漏。',
    commonErrors: ['给移动构造与移动赋值漏标 noexcept，vector 扩容时为保证异常安全退回逐个拷贝，性能数倍劣化且不易察觉。', '自定义赋值运算符先 delete 旧数据再执行可能抛异常的拷贝，拷贝失败时对象已被破坏，只提供基本保证甚至留下悬空指针。'],
    sourceRefs: ['C++ Core Guidelines. https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['拷贝构造触发时机', '拷贝构造签名形如 T(const T&)，在按值传参、按值返回未触发优化的场合、用一个对象初始化另一个对象时被调用，默认版本做逐成员拷贝。指针成员只复制地址形成浅拷贝，两个对象析构时对同一块内存 delete 两次。可验证动作：在拷贝构造里打印标记，按值调用一次函数观察标记出现次数；再用 -fsanitize=address 运行含浅拷贝赋值的用例，工具直接报出 double-free 的分配栈，作为修复起点。', '浅拷贝二次释放'],
      ['noexcept 与 vector 扩容', 'vector 容量不够时申请更大内存并把旧元素搬到新内存，只有元素移动构造标记 noexcept 才敢整体用移动，否则为保异常安全退回逐个拷贝，单个元素拷贝抛异常时已移动的部分还能回退。可验证动作：写含大 vector 成员的类，移动构造不标 noexcept，push_back 触发扩容时打印的是拷贝标记；加上 noexcept 后重跑，打印变为移动。边界：移动构造里绝不能调用可能抛异常的操作，否则承诺虚假。', '不标退回拷贝'],
      ['拷贝并交换惯用法', '赋值运算符形参按值接收，副本在进入函数体之前已构造完成；函数体用 std::swap 把副本与 this 的内容对齐，函数返回时副本析构带走旧数据。任何异常都发生在构造副本阶段，对象未被改动，天然提供强异常安全，且自赋值无需特判。可验证动作：让拷贝构造故意抛出，赋值失败后打印原对象全部字段仍完整；对比先 delete 后拷贝的写法在同一实验中留下损坏状态，差距就是强保证与基本保证。', '副本先行强保证'],
      ['swap 与移动的组合', '标准库的 std::swap 默认实现做三次移动：临时对象接住 a，a 接住 b，b 接住临时对象，移动成本低时已经够快。类型自带更高效交换时可在自身命名空间提供非成员 swap，调用处写 using std::swap; swap(a, b); 重载决议优先选到专属版本。可验证动作：交换两个含大 vector 的对象前后计时，默认 swap 与自定义 swap 的耗时差反映移动的零拷贝收益；边界是不要在全局命名空间重载 std::swap 本体。', '三次移动成交换'],
      ['异常安全三档', '基本保证要求抛异常后对象处于合法状态且无资源泄漏；强保证要求异常时状态完全回滚，如同从未调用；不抛保证只属于少数操作，如析构、swap 与 noexcept 移动。多层强保证代价高，通常只在外层关键事务处提供，内层维持基本保证即可，析构函数必须不抛，否则栈展开期间二次异常直接终止程序。可验证动作：review 一段两步赋值代码，指出第一步失败会留下半新半旧状态的位置，并用拷贝并交换改写为强保证。', '三档保证分场景'],
    ],
  },
  {
    name: 'C++ · 值语义、类、RAII 与所有权：unique_ptr、shared_ptr 与 weak_ptr',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已理解 RAII 与所有权概念，能用 unique_ptr 管理单个对象的生命周期。',
    goal: '掌握 unique_ptr 的移动-only 语义与零开销原理，理解 shared_ptr 强引用计数与 make_shared 控制块的分配方式，会用 weak_ptr 打破循环引用，能为接口参数选择正确的所有权表达。',
    guidedPractice: '现场做四组实验：拷贝 unique_ptr 观察编译报错再改 std::move 观察 get() 变空；连续拷贝 shared_ptr 并逐次打印 use_count；用 make_shared 建对象后挂一个 weak_ptr，让所有 shared_ptr 离开作用域，观察析构打印与内存占用；最后写两个类互相持有 shared_ptr 复现泄漏。',
    independentPractice: '独立完成：实现一棵父子双向链接的树，父持子用 unique_ptr，子回指父用 weak_ptr，遍历处统一走 lock() 并判空；再用泄漏检测工具验证修复前后报告差异，最后写一份参数传递清单说明每个接口采用的所有权类型与理由。',
    commonErrors: ['把同一个裸指针交给两个独立构造的 shared_ptr，产生两个互不知晓的控制块，计数各自归零后双重释放同一对象。', '以为 shared_ptr 让对象线程安全，实际只有控制块计数是原子的，多线程同时读写所指对象照样需要额外的锁。'],
    sourceRefs: ['C++ Core Guidelines. https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['unique_ptr 独占所有权', 'std::unique_ptr 用移动语义表达独占：拷贝被删除、只能移动，移动后原指针置空，析构时对裸指针执行 delete，运行期开销与裸指针相当，没有引用计数。工厂创建用 std::make_unique<T>(args...) 一步构造，避免裸 new 出现在业务代码里。可验证动作：写出拷贝它的语句得到编译错误；std::move 之后打印 get() 输出为空，说明所有权已转移；给容器放元素用 push_back(std::move(p)) 完成转入。', '只能移动不能拷贝'],
      ['shared_ptr 与控制块', 'shared_ptr 内部维护强引用计数，拷贝加一、析构减一，减到零销毁对象并可能释放控制块；计数增减是原子操作，多线程增减安全，但所指对象本身不受任何保护。std::make_shared 把对象与控制块合并成一次内存分配，比 shared_ptr<T>(new T) 少一次 malloc，两块数据相邻也更缓存友好。可验证动作：连续拷贝后逐次打印 use_count 观察递增，离开各作用域后再打印观察回落，最后降到 0 时析构打印出现。', '计数归零即销毁'],
      ['make_shared 的边界', 'make_shared 单次分配省一次开销，但对象与控制块在同一块内存，只要有 weak_ptr 还挂着，控制块存活，整块内存都无法归还，大对象配长命 weak_ptr 会推高峰值内存。另外 make_shared 不能指定自定义删除器，也不能在类构造阶段调用 shared_from_this，因为控制块此时还没建好。可验证动作：对象内放大数组并挂 weak_ptr，全部 shared_ptr 离开作用域后打印析构发生但进程内存占用不降，改用 shared_ptr<T>(new T) 分离分配后内存随析构回落。', '弱引用拖住内存'],
      ['weak_ptr 打破循环', '两个对象互相用 shared_ptr 持有对方时，两边计数永远降不到零，双双泄漏。weak_ptr 不增加强计数，只观察对象是否存活，使用前必须用 lock() 换取临时 shared_ptr，换不到说明对象已亡。可验证动作：两个类互相持 shared_ptr，程序结束前析构打印不出现，用泄漏工具报告两处泄漏；把回指一侧改成 weak_ptr 并用 lock() 访问，析构打印恢复出现，报告归零。边界：lock 返回空的分支必须处理，不能直接解引用。', 'lock 后再访问'],
      ['所有权表达选型', '默认独占用 unique_ptr，确需多处共享存活期才用 shared_ptr，只观察不拥有用 weak_ptr 或裸指针加引用；函数参数只读不存用 const T&，要接管所有权用 unique_ptr 按值传入并在调用处 std::move，要共享计数用 shared_ptr 按值拷贝。边界：同一裸指针喂给两个独立 shared_ptr 会各建控制块导致双重释放，共享必须从同一个根 shared_ptr 拷贝出来。可验证动作：shared_ptr<T>(raw) 写两次运行崩溃，改为单一持有者派生后修复。', '裸指针不双管'],
    ],
  },
  {
    name: 'C++ · 值语义、类、RAII 与所有权：资源所有权重构实验',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已掌握三类智能指针的用法，会使用 g++ 常用编译与检测选项。',
    goal: '学会用地址消毒工具定位泄漏与二次释放，按独占、共享、观察三层判定改造裸指针代码，补齐 noexcept 移动并以扩容耗时对比验收，最终交付一份检测归零的重构版本。',
    guidedPractice: '以一份带早退分支漏 delete 的示例代码为起点：先用 g++ -fsanitize=address -g 编译运行，把泄漏报告的分配栈抄进操作单；再逐处把 new 换成 std::make_unique 并删除对应 delete，重跑确认报告归零；最后给类补 noexcept 移动构造，向 vector 大量 push_back 对比标记前后的扩容打印与耗时。',
    independentPractice: '独立完成：重构一个含裸指针成员、互相引用与多条早退路径的完整程序，先用检测工具复现全部问题，再按独占优先原则完成智能指针改造并处理循环引用，最后在 -Wall -Wextra 下清零警告，交付重构前后两份检测报告与一份改动说明。',
    commonErrors: ['只把 new 换成智能指针却保留了原来的 delete 语句，对象被析构两次，重构后必须逐条删除手工释放代码。', '看到多处使用就一律升级 shared_ptr，实际多数场景只是访问而非拥有，改传裸指针或引用即可，盲目共享引入计数开销与循环风险。'],
    sourceRefs: ['C++ Core Guidelines. https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['复现裸指针泄漏', '起点是一份用 new 申请、早退分支漏 delete 的代码。用 g++ -fsanitize=address -g 编译运行，AddressSanitizer 的泄漏报告会打印分配位置、字节数与分配栈，栈顶直接指向漏释放的语句。可验证动作：构造两个 return 路径只有一条释放的函数，运行后报告出现 leaked 字样，抄下泄漏字节数作为重构前的基线数据；再故意对同一指针 delete 两次，观察报告切换为 double-free 并给出两次释放栈。', '报告定位泄漏点'],
      ['改造成 unique_ptr', '把 new T(...) 整体替换为 std::make_unique<T>(...)，变量类型改为 std::unique_ptr<T>，逐条删除对应的 delete，早退与异常路径的释放全部交给析构自动完成，所有权转移处显式写 std::move。可验证动作：替换后重跑同一份泄漏用例，报告归零；若代码里残留对原对象的拷贝语句，编译器直接拒绝，需要补 move 或改接口，这正是独占语义在编译期暴露出的所有权转移点，逐处确认转移意图后再放行。', '删掉手工释放'],
      ['共享所有权判定', '逐个检视剩余指针：只有一处持有就保持 unique_ptr；确需多处同时持有才升级 shared_ptr，并用 use_count() 打印实际共享数佐证判断。多数所谓共享实为访问而非拥有，改成裸指针或引用传参更轻，还避免引入循环引用风险。可验证动作：对疑似共享成员打印 use_count()，长期等于 1 的改回 unique_ptr 后全量重编译通过且行为不变，用这个证据链把共享所有权压缩到真正需要的最小集合。', '共享须有据'],
      ['循环引用排查', '把互相持有的两个类改成 shared_ptr 后用泄漏工具复跑，析构打印缺失即为循环引用。将回指一侧改为 std::weak_ptr，访问处统一走 lock() 并判空处理对象已亡的情况。可验证动作：修复前报告列出两处泄漏且对象析构不打印；修复后报告归零、析构打印恢复；再补一个负向用例，在被指对象析构之后调用 lock()，确认返回空指针被分支正确处理而不是悬空访问，循环彻底断开且边界受控。', '回指改弱引用'],
      ['移动语义与验收', '给重构后的类补上 noexcept 移动构造与移动赋值。可验证动作：向 vector<Buffer> 插入大量元素触发多次扩容，未标 noexcept 时扩容走拷贝、打印拷贝标记，标记后变为移动，记录前后耗时差；最后整套用例重跑 AddressSanitizer 并在 -Wall -Wextra 下编译，泄漏报告与编译警告均清零即为验收通过，把两份前后报告与耗时数据一起归档作为重构交付物。', '报告与警告清零'],
    ],
  },
];

// ── X2 移动、模板、Concepts 与 STL ─────────────────────────────────────────────
export const HANDWRITTEN_CPP_PERFORMANCE_X2_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C++ · 移动、模板、Concepts 与 STL：左值、右值、移动与完美转发',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已掌握 C++ 类的拷贝构造与析构函数的编写。',
    goal: '能准确区分左值、纯右值与将亡值，说明 std::move 只是一次类型转换、std::forward 依赖引用折叠保真值类别，并能用 noexcept 移动构造改变 vector 扩容路径的实际选择。',
    guidedPractice: '现场写一个持堆缓冲区的 Buffer 类，分别实现深拷贝与移动构造；用 static_assert 验证 is_nothrow_move_constructible，再在 std::move 传参前后打印内部指针地址，观察资源所有权是否真正转移。',
    independentPractice: '独立完成：为 Buffer 实现完美转发的工厂函数模板 make_buffer，用万能引用加 std::forward 同时支持左值与右值入参，并用 decltype 检查转发后表达式的值类别，把判定依据整理进笔记。',
    commonErrors: ['对已 std::move 过的对象继续调用 size 或下标，误以为它必然为空，实际移动后只保证有效但状态未指定。', '给移动构造函数漏写 noexcept，vector 扩容时退回拷贝路径，性能优化在真实容器里静默失效。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['值类别的三个分支', 'C++17 把表达式值类别分为左值、纯右值与将亡值三类：能取地址、有名字的是左值，字面量 42 与临时对象是纯右值，std::move(x) 的结果是将亡值。可验证的判别动作是写 &x 与 &std::move(x) 各编译一次，前者通过后者报错，说明右值没有稳定的存储身份，不能被寻址。', '取地址分辨左值'],
      ['std::move 只做转换', 'std::move 并不移动任何东西，它就是一次 static_cast 到右值引用的类型转换，在开优化的汇编里不产生任何指令，真正搬运资源的是随后被重载决议选中的移动构造函数。调用后源对象处于有效但未指定状态：仍可析构、可重新赋值，但 size() 返回几全凭实现，代码不应依赖具体数值。', '转换不搬资源'],
      ['移动构造与 noexcept', '移动构造接管源对象的堆指针并把源端置空，成本只是几次指针赋值。关键边界：vector 扩容时只有移动构造标注 noexcept 才走移动路径，否则为保证强异常安全退回拷贝。用 static_assert(std::is_nothrow_move_constructible_v<T>) 可在编译期验证，漏标立即报错，无需等到运行期测量。', '缺它退回拷贝'],
      ['引用折叠规则', '万能引用 T&& 在推导后才确定形态，折叠规则只有三条：左值引用加右值引用折叠为左值引用，两个右值引用折叠为右值引用，左值引用遇左值引用仍是左值引用。因此传左值时 T 被推导为类型的左值引用，传右值时 T 是裸类型，std::forward 正是靠这套规则把实参的原值类别原样还回去。', '三条折叠定形态'],
      ['forward 与 move 分工', 'std::forward<T>(arg) 只应在模板参数 T 被推导的场景调用，它把绑定到万能引用的实参按原值类别转出去；std::move 则无条件转为右值。混用的后果是把左值实参错误右值化，后续使用者拿到被掏空的向量。判定边界可写代码验证：只有函数模板里 T 被推导的 T&& 才是万能引用，vector<T>&& 这类带具体类型的写法只是普通右值引用。', '推导才有万能引用'],
    ],
  },
  {
    name: 'C++ · 移动、模板、Concepts 与 STL：模板、特化和编译期计算',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已能编写普通函数模板并理解头文件声明与定义。',
    goal: '掌握模板按需实例化与两阶段查找机制，能写出类模板的全特化与偏特化，会用 constexpr 与 if constexpr 把计算搬到编译期，并理解实例化膨胀对二进制体积的量化影响。',
    guidedPractice: '现场定义 template<typename T> T max_of，先后用 int、double 与自定义类型调用，再用 nm 命令查看目标文件里生成的 _Z 开头实例符号；随后写全特化与偏特化版本，用 static_assert 确认编译器按最特化者匹配。',
    independentPractice: '独立完成：实现 constexpr 阶乘与编译期斐波那契，用 static_assert(Fib<20>::value == 6765) 锁定正确性；再为一个 Pair 类模板写偏特化处理两个类型相同的情况，三条实例化路径都要编译通过并记录证据。',
    commonErrors: ['把模板定义写进 cpp 文件，其他编译单元实例化时找不到定义，链接阶段大面积报 undefined reference。', '给函数模板写偏特化，C++ 不支持这一语法，正确做法是重载或 if constexpr 分支。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['按需实例化', '模板本身不是代码，编译器只在每个使用点按实参隐式实例化出具体版本，因此完整定义必须对每个用到它的编译单元可见，惯用做法是整体放在头文件。可验证动作：编译一个仅被 int 与 double 调用的模板，执行 nm 目标文件能看到恰好两个实例符号，未被使用过的类型不会产生任何机器码。', '用了才生成'],
      ['两阶段查找', '模板编译分两个阶段：定义期只检查与参数无关的名字和语法，实例化期再用实参做依赖名字的查找。这就是为什么模板里访问依赖类型的嵌套名要写 typename，例如 typename T::value_type，否则第一阶段直接报错。边界：报错常出现在调用点而非模板定义处，阅读诊断要沿实例化方向回溯。', '两阶段查名字'],
      ['全特化与偏特化', 'template<> struct Hash<int> 是全特化，为特定实参整体替换主模板；偏特化只约束部分参数，如 template<typename T> struct Hash<T*>。类模板两种都支持，函数模板只有全特化且常被重载取代。可验证动作：对 T 为 int 与 double* 各实例化一次，用 std::is_same 配合 static_assert 确认编译器选中了哪个版本。', '函数模板无偏特化'],
      ['constexpr 编译期计算', 'constexpr 函数在实参全是常量表达式时于编译期求值，C++14 起允许循环与局部变量，C++20 起连 vector 与 string 都能在编译期使用。可验证动作：写 constexpr int fact(int n) 并执行 static_assert(fact(5) == 120)，删掉 constexpr 后该行立即失败，这一对比直接证明求值发生在编译期而非运行期。', '编译期断言验证'],
      ['if constexpr 与膨胀控制', 'if constexpr 在编译期丢弃不成立的分支，被丢弃分支只需语法正确、不必通过语义检查，enable_if 与标签分发因此大幅简化。代价方面：每个不同的模板实参组合都会生成一份代码，十种容器各实例化一份排序逻辑就是十份机器码；用 nm 统计符号数或对比 -Os 前后的二进制体积，即可把膨胀量化成具体数字。', '丢分支也省体积'],
    ],
  },
  {
    name: 'C++ · 移动、模板、Concepts 与 STL：concepts、ranges 与错误诊断',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已了解函数模板与类模板的基本写法。',
    goal: '会用 requires 子句与 requires 表达式定义并施加约束，理解标准库常用 concepts 的分层含义，能用 ranges 视图做惰性数据变换，并能读懂约束失败产生的简短诊断信息。',
    guidedPractice: '现场定义 concept Addable 并写 requires 表达式检查 a + b 合法，分别对 int 与自定义结构体传入，对比 C++17 无约束模板与 C++20 版本的报错行数；再用 views::filter 与 views::transform 串一条管道打印结果。',
    independentPractice: '独立完成：写一个受 std::ranges::range 约束的统计函数求均值，确认非范围实参会被编译拒绝；再实现带投影参数的 ranges::sort 按结构体成员排序，两次编译与运行的输出都要记录进实验报告。',
    commonErrors: ['把 views 保存到变量后源容器已销毁，视图持有悬空引用，遍历时产生未定义行为。', '在 requires 表达式里写必然不合法的语句而不做分支处理，导致整个概念对候选类型直接报错而非返回 false。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['concept 是编译期谓词', 'concept 定义一个编译期布尔约束，例如 template<typename T> concept Addable = requires(T a, T b) { a + b; };，requires 表达式逐条检查表达式是否合法，合法返回 true，不合法返回 false 而不是报错。施加约束后，不满足的实参不会进入重载集，而是产生一句约束失败的最短诊断，替代原来几十行的实例化栈。', '表达式合法即真'],
      ['标准库常用 concepts', '<concepts> 头提供 std::integral、floating_point、same_as、convertible_to、movable 等基础概念，<ranges> 提供 std::ranges::range、input_range、random_access_range 等按迭代器类别分层的能力描述。可验证动作：static_assert(std::integral<int>) 通过而 std::integral<double> 失败，两条结果都能在编译期直接看到。', '按迭代器类别分层'],
      ['约束失败即短报错', '无约束模板的错误诊断动辄数十行模板实例化栈，C++20 下同样的错误调用只报 concepts not satisfied 并列出未满足的具体约束名。可验证动作：把同一处错误调用分别用 -std=c++17 与 -std=c++20 编译，对比两条报错的行数与信息密度；新版编译器还会指出哪个 requires 子句的哪一项不成立，定位从翻栈变成读约束清单。', '报错从栈变清单'],
      ['ranges 视图惰性求值', 'views::filter、views::transform 等视图不拷贝数据，遍历到哪个元素才算哪个，管道 v | filter(p) | transform(f) 的中间不产生任何临时容器。边界：视图不拥有元素，把临时字符串经 views::all 存进变量再使用会悬空；C++20 起这类用法被删除的构造函数在编译期拦截，报 dangling 相关错误，而不是等到运行期崩溃。', '视图不拥有元素'],
      ['ranges 算法与投影', 'std::ranges::sort(v) 直接接收容器，不必再写 begin 与 end 一对参数；另一处改进是投影：ranges::sort(people, {}, &Person::score) 用成员指针提取排序键，无需手写 lambda。可验证动作：对同一份结构体数组分别用 lambda 与投影各排一次，用 std::is_sorted 和打印首元素确认两种结果完全一致。', '投影省掉 lambda'],
    ],
  },
  {
    name: 'C++ · 移动、模板、Concepts 与 STL：vector 扩容、迭代器失效和分配器',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已熟练使用 vector 的基本读写与遍历操作。',
    goal: '掌握 vector 三指针内存布局与几何级扩容机制，能准确说出插入删除各场景的迭代器失效规则并用调试工具验证，理解 reserve 与 resize 的区别及 pmr 分配器的接入方式。',
    guidedPractice: '现场循环 push_back 一万个元素，每次打印 size 与 capacity，抄下扩容序列确认 libstdc++ 每次翻倍；再用两个迭代器夹住首元素，在扩容后解引用旧迭代器，配合 -D_GLIBCXX_DEBUG 编译运行观察失效诊断。',
    independentPractice: '独立完成：写对照组实验，一组先 reserve 一百万容量再 push_back，一组裸增长，用 chrono 计时对比差值；再用 pmr::monotonic_buffer_resource 挂一块栈上缓冲区跑同一实验，验证堆分配次数归零。',
    commonErrors: ['在范围 for 循环里向 vector 插入元素，扩容使迭代器失效导致未定义行为，且 -O2 下常表现为静默数据错乱。', '把 reserve 当 resize 用，之后直接下标读写越界，容量不等于已构造元素个数。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['三指针内存布局', 'libstdc++ 的 vector 对象本身是三个指针共 24 字节：首元素位置、当前尾部、容量尾部，sizeof(std::vector<int>) 在 x86-64 上可验证恰好等于 24。元素数据全部在堆上，size 与 capacity 之差就是剩余空位；拷贝 vector 会深拷贝整段元素而非复制这三个指针，这也解释了移动构造为何只需接管三指针即完成资源转移。', '24 字节三指针'],
      ['扩容系数与代价', '扩容按几何级数摊还出常数均摊成本：libstdc++ 与 libc++ 每次翻倍，MSVC 采用约 1.5 倍。1.5 倍的好处是被释放的旧块更可能与后续请求复用同一内存区间，2 倍则均摊搬移次数更少。可验证动作：连续 push_back 并打印 capacity，libstdc++ 下应看到 1、2、4、8 的序列，MSVC 下是 1、2、3、4、6。', '翻倍与一点五倍'],
      ['迭代器失效规则', '扩容使全部迭代器、指针与引用失效；insert 使插入点及其后的失效；erase 使删除点及其后的失效；reserve 只在发生真正重分配时失效全部。可验证动作：用 g++ -D_GLIBCXX_DEBUG 编译，代码里保留扩容前的旧迭代器并解引用，运行时立即抛出具体的失效诊断，比 -O2 下的静默错乱容易定位得多。', '扩容全线失效'],
      ['reserve 与 resize', 'reserve 只抬升 capacity 不改变 size，不构造任何元素；resize(n) 真正构造或销毁元素，size 变为 n，新增部分按缺省值填充。经验边界：已知规模时先 reserve 再 push_back，能省掉约 log2(n) 次整段搬移；shrink_to_fit 只是请求而非保证，实现可以拒绝收缩。用 size 与 capacity 的前后打印对比即可验证三者行为差异。', '容量不是元素数'],
      ['分配器与 pmr', 'vector<T, Allocator> 的第三参数默认 std::allocator，其 allocate 直接调 operator new。C++17 多态内存资源把分配器变成运行期对象：pmr::monotonic_buffer_resource 挂一块预分配缓冲区后，其上的所有分配只挪一个指针，不进入堆。可验证动作：给缓冲区设 64KB，压入大量元素后统计 operator new 调用次数，应观察到归零。', 'pmr 挪指针不进堆'],
    ],
  },
  {
    name: 'C++ · 移动、模板、Concepts 与 STL：unordered_map、红黑树与算法选型',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已使用过 map 与 vector 的基本接口。',
    goal: '理解 unordered_map 桶数组加链表的实现结构与负载因子触发 rehash 的机制，掌握 std::map 红黑树的有序性来源，能依据查找、有序性与范围查询需求在两类容器间做出选型。',
    guidedPractice: '现场插入十万键值对后打印 load_factor 与 bucket_count，手动把 max_load_factor 调到 0.5 观察 rehash 前后桶数变化；再用 begin 顺序遍历 unordered_map 与 map 各一次，对比输出是否有序并抄录前十项。',
    independentPractice: '独立完成：构造一个恒返回零的退化哈希让全部键落入同一桶，测出查找耗时从常数涨到线性的曲线；同一份数据换 map 重测，把两组耗时与内存占用写进对比表，并给出适合当前场景的容器结论。',
    commonErrors: ['rehash 后继续使用旧迭代器，桶结构已重建导致未定义行为，而元素的引用与指针反而仍然有效，两者区别常被混淆。', '自定义类型的键既没有特化 std::hash 也未在模板参数传入哈希函数对象，编译直接失败。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['桶与链表结构', 'unordered_map 由桶数组与节点链表组成：哈希值对桶数取模定位桶，元素以单链表节点挂在桶上，libstdc++ 实际维护一条贯穿全部节点的公共链表，桶内只存指向链表位置的指针。均摊 O(1) 的前提是哈希分布均匀，最坏情况全部元素落进一个桶时退化为 O(n) 线性扫描。', '哈希定位桶'],
      ['负载因子与 rehash', 'load_factor 等于 size 除以 bucket_count，超过 max_load_factor 默认值 1.0 就触发 rehash：桶数组重建、全部节点重新分布，此时迭代器全部失效，但元素的引用与指针保持有效，这是与 vector 失效规则的关键差异。可验证动作：调用 reserve(100000) 后立即打印 bucket_count，应看到桶数已按目标负载提前扩好，而不是从 1 逐步翻倍。', '迭代器失效引用活'],
      ['哈希与防退化', 'std::hash 对 int、string 等常见类型有默认特化，自定义类型键需要特化 std::hash 或在模板参数里传入哈希函数对象。库实现通常在内部混入随机化的重排抵抗哈希碰撞攻击，libstdc++ 用素数乘法混淆哈希值。可验证动作：用恒返回 0 的坏哈希插入十万键再逐个查找，测得耗时随规模线性增长，换回 std::hash 后回到常数级别。', '坏哈希退化为链'],
      ['红黑树保证有序', 'std::map 以红黑树实现，插入删除与查找均为 O(log n)，红黑性质把最长路径限制在最短路径的两倍以内；中序遍历天然按键升序，begin 与 rbegin 给出最小与最大键，lower_bound 能做范围查询。代价是每个节点带三个指针加颜色标记，内存开销远高于开放寻址哈希表，节点间指针跳转也带来缓存不友好的访问模式。', '中序即有序'],
      ['选型决策边界', '只要有按键有序遍历、前驱后继或范围统计的需求，选 map；纯键值查找且无顺序要求，选 unordered_map，均摊更快但最坏 O(n)。可验证动作：对一百万随机整数键分别执行十万次查找计时，unordered_map 通常快数倍；再测有序遍历耗时，两者都不敌排序 vector 加 lower_bound 的连续内存方案，这是第三条备选路径。', '要序选树不要哈希'],
    ],
  },
  {
    name: 'C++ · 移动、模板、Concepts 与 STL：STL 源码与容器基准实验',
    track: 'P14 · 独立语言课程',
    minutes: 52,
    prerequisite: '学员已掌握 vector 与 unordered_map 的核心机制。',
    goal: '学会直接阅读本机安装的 libstdc++ 头文件源码定位容器实现，掌握用 Google Benchmark 与 DoNotOptimize 搭建可靠基准，能完成跨容器的性能对照实验并产出数据化结论。',
    guidedPractice: '现场打开 /usr/include/c++/12/bits/stl_vector.h 定位 push_back 与 _M_realloc_insert 的实现，逐段讲解扩容调用链；再用 gdb 的 ptype /o 打印 vector 的成员布局，核对三指针结构与 24 字节总大小的对应关系。',
    independentPractice: '独立完成：用 Google Benchmark 写 vector、deque、list 三种容器各压入一千万 int 的对照基准，用 DoNotOptimize 阻断死代码消除，以 -O2 跑出 ns/op 并按缓存容量分档解读结果，写成带数据表的实验报告。',
    commonErrors: ['基准循环里构造的临时结果没被使用，-O2 直接把整段计算删除，测得接近零的虚假耗时。', '把容器构造与数据初始化混进基准循环，忘了用 State 边界隔离准备成本，ns/op 被稀释失真。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'cppreference C++ Reference. https://en.cppreference.com/w/'],
    steps: [
      ['从头文件读实现', '本机的 STL 源码就在编译器安装目录：/usr/include/c++/12/bits/stl_vector.h 与 stl_unordered_map.h 等，vector 的扩容逻辑在 _M_realloc_insert 中可见。可验证动作：用 grep -n _M_realloc_insert stl_vector.h 找到定义行，读出新容量翻倍与旧元素搬移的先后顺序，同时打开 cppreference 对应条目做接口语义对照。', '扩容在头文件里'],
      ['用调试器看布局', 'gdb 的 ptype /o 命令按内存偏移打印类型成员：程序断点后执行 ptype /o std::vector<int>，输出列出 _M_start、_M_finish、_M_end_of_storage 三个指针及其字节偏移 0、8、16，与 sizeof 得到的 24 相互印证。unordered_map 的节点结构在 _Hashtable 相关头文件里，同样可用该命令查看桶指针与节点链的组织方式。', 'ptype 按偏移列出'],
      ['基准防优化', '编译器在 -O2 下会删除结果未被使用的计算，基准里必须用 benchmark::DoNotOptimize(sum) 与 ClobberMemory 强制保留计算副作用；循环耗时由框架按 state 的迭代次数折算成 ns/op，benchmark_min_time 可延长采样。对照方式：去掉保护的版本会跑出异常低的虚假耗时，加回保护后耗时回升，即可确认防护真实生效。', '锁住副作用'],
      ['跨容器对照', '同样的操作压入一千万个 int：vector 凭连续内存走预取友好路径，deque 分段块也较顺，list 每个节点两次指针跳转加小块分配，实测常慢一个数量级。可验证动作：三个容器各写一个 Google Benchmark 用例同轮运行，把 ns/op 三行数字并排抄录，再统计三者运行期的分配次数，list 的分配次数应与元素个数同阶。', '指针跳转最伤缓存'],
      ['缓存分档解读', '容器容量跨过缓存层级时性能呈台阶变化：x86-64 常见 L1 数据缓存 32KB、L2 数百 KB、L3 数 MB，vector 装下四百万个 int 约占 16MB，已落在 L3 之外。可验证动作：让基准分别跑一千、十万与四百万元素三档，观察 vector 的 ns/op 台阶并与 list 的平缓曲线对比，结论写成数据表而非印象判断。', '容量跨档看台阶'],
    ],
  },
];

// ── X3 并发、原子、内存模型与 Asio ─────────────────────────────────────────────
export const HANDWRITTEN_CPP_PERFORMANCE_X3_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C++ · 并发、原子、内存模型与 Asio：thread、mutex、condition_variable',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已能用 g++ -std=c++17 编译运行单个源文件并调试输出。',
    goal: '掌握 std::thread 的启动、join 与 detach 生命周期规则，会用 lock_guard 与 unique_lock 管理 mutex，能写出带谓词的 condition_variable 等待循环，理解 shared_mutex 与线程数量控制的适用边界。',
    guidedPractice: '在一个 main.cpp 里并发执行两个线程对同一计数器的自增，观察丢失更新；再构造两把 mutex 的相反加锁顺序复现死锁，随后把条件变量的 while 判断临时换成 if，用两个消费者线程压测空队列取出的错误行为，把每组输出与出错现场抄进笔记。',
    independentPractice: '独立交付一个双缓冲日志器：写线程通过 mutex 加队列投递日志，专用线程用 condition_variable 等待并批量落盘，退出时用置位标志加 notify_all 让消费线程清空队列后自行结束，主线程 join 后核对无一条日志丢失。',
    commonErrors: ['thread 对象在 join 或 detach 之前离开作用域，析构函数检测到可联接状态后直接调用 std::terminate 终止进程。', 'condition_variable 的 wait 只用 if 判断条件一次，被虚假唤醒或信号被抢先消费后从空队列取出无效元素。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['thread 生命周期与 join', 'std::thread 构造即启动，析构前必须 join 或 detach，否则触发 std::terminate 终止进程。join 阻塞到线程函数返回并回收资源，detach 后线程脱离对象独立运行，但无法再获知其结束时机，继续引用栈上变量会成为悬垂访问。可验证动作：写 main 创建线程后直接 return，运行观察 terminate 调用与 abort 退出码，再补上 join 后对照。', '不 join 即终止'],
      ['lock_guard 与 unique_lock', 'std::mutex 保证同一时刻仅一个线程进入临界区，已持锁的线程重复 lock 是未定义行为。lock_guard 构造时加锁、析构时释放，无法中途解锁也不能移动；unique_lock 支持延迟锁定、try_lock 与手动 unlock，还是 condition_variable::wait 的必需参数。锁对象必须与被保护数据一一对应。可验证动作：两个函数以相反顺序 lock 两把 mutex 并并发调用复现死锁，改用 std::lock 或统一加锁顺序修复后重跑。', '死锁源于顺序'],
      ['condition_variable 虚假唤醒', 'condition_variable::wait 先原子地释放 mutex 并阻塞，被唤醒后重新抢锁才返回。唤醒来源除 notify 外还有虚假唤醒与信号被提前消费两种情况，因此必须用带谓词的 wait(lock, pred) 或 while 循环重新检查条件，if 单次判断不够。notify_one 在持锁期间调用会让被唤醒线程立刻阻塞在锁上，先解锁再通知通常吞吐更好。可验证动作：把 while 改成 if，用两个消费者线程压测，观察队列为空时取出无效元素的现象。', '必须循环重判'],
      ['shared_mutex 读写分离', 'C++17 的 std::shared_mutex 允许多个读者同时持有共享锁，写者以排它锁独占：读侧用 lock_shared 与 unlock_shared，写侧用普通 lock。它适合读多写少的负载，写频繁时共享计数的维护开销反而超过普通 mutex，连续读者还可能让写者长时间饥饿。可验证动作：开 8 个读线程与 1 个写线程统计各自等待时长，再换成 std::mutex 复测总量，用两组数据得出选型边界。', '读多写少才划算'],
      ['线程数量与硬件并发', 'std::thread::hardware_concurrency 返回逻辑核心数，实现无法确定时返回 0，程序需对 0 做兜底。线程数超过核心数后上下文切换与缓存失效开始吞掉收益，纯计算任务通常取核心数，IO 密集可适当放大。每个线程默认栈预留约 1 到 8 MB 虚拟地址空间，数千阻塞线程会先耗尽地址空间再耗尽 CPU。可验证动作：用 ulimit -s 查看栈上限，循环创建 10000 个阻塞线程，观察抛出的 std::system_error。', '线程也有成本'],
    ],
  },
  {
    name: 'C++ · 并发、原子、内存模型与 Asio：atomic、内存序和无锁边界',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已掌握多线程创建与 mutex 的基本加锁解锁用法。',
    goal: '掌握 atomic 的原子读写改与 CAS 循环写法，能区分 memory_order_relaxed、acquire、release、seq_cst 四档内存序的可见性差异与 x86 上的真实开销，理解 ABA 问题的成因与版本号解法，划定无锁编程的适用边界。',
    guidedPractice: '现场写两线程各执行一百万次自增的对照程序，分别用普通 int、atomic 默认序、atomic relaxed 三档编译运行对比计数结果，再用 objdump 查看三档存储指令的差异，把反汇编片段与计数偏差一并记录到操作单。',
    independentPractice: '独立实现无锁计数器加发布缓冲的示例：生产者填好数据后以 release 写索引，消费者 acquire 读索引取数据，两侧降级为 relaxed 后观察读到未就绪数据的错误，再恢复配对修复并交付前后两版运行记录。',
    commonErrors: ['把原子操作当成顺序保证，用 memory_order_relaxed 发布指针，消费者读到原子标志翻转后仍取到未初始化的数据。', 'compare_exchange_weak 不放进循环直接使用，遇到伪失败返回 false 时误判为值不匹配，导致更新被静默跳过。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['atomic 基础与 CAS', 'std::atomic<T> 保证对 T 的读写改不可分割，普通 int 自增在两线程各加一百万次后常少算数十万次，atomic 的 fetch_add 则不丢任何一次。compare_exchange_weak 期望值匹配才替换并返回 true，失败时把实际值写回期望参数，必须放在循环里重试。is_lock_free 可查询该类型是否由无锁指令实现，超大结构体常退化为内部锁。可验证动作：两线程各执行一百万次普通自增与 fetch_add(1)，打印两种最终计数做对比。', '自增必须原子'],
      ['relaxed 只保原子性', 'memory_order_relaxed 仅保证该操作自身原子且单变量的修改顺序一致，不约束它与其他内存访问的相对顺序，编译器和 CPU 都可重排周边指令。它适合纯计数、统计这类不发布指针的场景，例如多线程事件计数只关心总量不传递依赖数据。x86 上 relaxed 加载编译为普通 mov，与 seq_cst 加载指令相同，差别体现在编译器重排限制与弱序目标平台上。可验证动作：objdump -d 反汇编两个版本，对比存储指令序列的差异。', '只数数不传数据'],
      ['acquire 与 release 配对', 'release 存储保证它之前的所有写操作在该存储完成后才可见，acquire 加载保证其后的读不会读到更早的旧值，两者命中同一变量构成同步关系，是发布数据的标准模式：写线程填充缓冲区后以 release 写索引，读线程 acquire 读到新索引后取到的缓冲区内容必然完整。x86 上两种操作都编译为普通 mov，硬件强序替你兜底，代价接近零。可验证动作：把两侧降级为 relaxed 后在弱序平台或 TSan 下运行，观察消费者读到未初始化数据。', '发布靠配对'],
      ['seq_cst 全序与代价', 'memory_order_seq_cst 是默认内存序，为所有 seq_cst 操作提供单一全局全序，任何线程观察到的顺序一致，正确性论证最简单。代价集中在写侧：x86-64 上 seq_cst 存储需用 xchg 或追加 mfence 等待缓冲清空，比 relaxed 存储慢数倍到数十倍，load 侧则与普通 mov 相同。混用不同内存序时只有参与全序的操作彼此有序，推理难度陡增。可验证动作：用 perf stat 对比百万级 relaxed 与 seq_cst 存储循环的周期数，记录倍数差。', '写侧才收钱'],
      ['CAS 循环与 ABA 边界', 'compare_exchange_weak 允许伪失败，即使值匹配也可能返回 false，必须放进循环，适合无值返回的读改写；compare_exchange_strong 只在值不匹配时失败，弱序平台上开销更大。ABA 问题指变量从 A 改到 B 又改回 A，CAS 看不出中间变化，无锁栈弹出节点期间该节点被回收再复用会导致指针错挂，解法是给指针附带版本号做带标签的比较交换，或引入危险指针等回收方案。可验证动作：两线程并发构造 pop 加 push 的 ABA 序列，加入版本号前后对比出错次数。', '版本号防 ABA'],
    ],
  },
  {
    name: 'C++ · 并发、原子、内存模型与 Asio：future、promise 与任务队列',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已理解线程安全队列与条件变量的配合方式。',
    goal: '掌握 promise 与 future 的一次性结果通道语义，理解 shared_future 多消费与 broken_promise 的触发边界，会用 async 的两种策略与 packaged_task 搭建线程池任务队列，并用 wait_for 实现带超时的等待。',
    guidedPractice: '现场构建 promise 加 future 的最小通道，依次实验子线程先 set 后主线程 get、主线程 get 的阻塞时长、二次 get 抛异常三个场景；再把 future 提前销毁后调 set_value 捕获 broken_promise，最后给 future 加 wait_for(100ms) 打印返回的三态值。',
    independentPractice: '独立交付一个 mutex、condition_variable、deque、packaged_task 组成的四线程任务池：投递含除零异常的任务并经 future 在提交侧接到重抛异常，同时用 wait_for 加停止标志实现队列的优雅排空与线程回收。',
    commonErrors: ['对同一个 future 调用两次 get，第二次直接抛异常，因为结果已被取走且共享状态进入无效状态。', '丢弃 std::async(launch::async) 返回的 future，临时对象析构时阻塞等待任务完成，并发代码悄然退化成串行执行。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['promise 与 future 通道', 'std::promise 与 std::future 构成一次性跨线程结果通道：promise 所在线程调用 set_value 后共享状态就绪，另一线程 get 阻塞到就绪并取走值，get 只能成功调用一次，第二次调用抛异常。get_future 同样只能调用一次。任务抛出的异常经 set_exception 存入共享状态，在 get 处原样重抛，错误得以跨线程传递。可验证动作：子线程延迟一秒 set_value，主线程先 get，用 chrono 统计阻塞时长验证同步点。', 'get 只此一次'],
      ['shared_future 多消费', 'std::future 仅可移动不可复制，一个结果要通知多个等待线程时改用 shared_future，它可复制且每个副本都能 get 同一结果。边界：future 在 set_value 之前被销毁，promise 侧后续 set_value 会抛 broken_promise，表示承诺失效；shared_future 的副本共享同一状态，不存在此错误。可验证动作：创建 promise 后立即销毁 get_future 返回的普通 future 再 set_value，捕获并打印 broken_promise 异常文本，改用 shared_future 复验不再报错。', '副本共享状态'],
      ['async 的两种策略', 'std::async(launch::async, f) 保证 f 在新线程立即执行；launch::deferred 把调用记录下来，直到在 future 上调用 get 或 wait 才在当前线程执行。不传策略时实现可自行选择，任务甚至可能从未启动，不能用它保证并发。隐藏边界：launch::async 返回的 future 析构时会阻塞等待任务完成，把返回值当作临时对象丢弃会让代码退化为串行。可验证动作：用 wait_for 零超时探测 deferred 任务，返回值是 future_status::deferred 而非 timeout，对照打印确认。', '临时对象会挡路'],
      ['packaged_task 入队', 'packaged_task 把可调用对象包成带共享状态的任务，get_future 先取结果句柄，operator() 执行后结果落盘，异常同样经共享状态传递。它与 mutex、condition_variable、deque 组成线程池：工作线程在锁内取任务，空则 wait，提交线程 push 后 notify_one，闭包捕获 packaged_task 后移动入队。可验证动作：向队列投递一个抛除零异常的任务，在工作线程之外通过关联 future 的 get 接到重抛的原始异常。', '闭包捕获入队'],
      ['带超时的等待', 'future 提供 wait_for 与 wait_until，返回 future_status 三态：ready 表示已就绪，timeout 表示到时未就绪，deferred 表示惰性任务尚未启动。外层循环可用 wait_for 短间隔轮询配合取消标志，避免 get 永久阻塞在失联任务上。边界：对 deferred 任务 wait_for(0) 立即返回 deferred，永远不会是 timeout，需先判态再计超时。可验证动作：对一个永不 set_value 的 future 调 wait_for(chrono::milliseconds(100))，打印返回枚举确认是 timeout 而非阻塞。', '三态别当布尔'],
    ],
  },
  {
    name: 'C++ · 并发、原子、内存模型与 Asio：Asio io_context、strand 和定时器',
    track: 'P14 · 独立语言课程',
    minutes: 45,
    prerequisite: '学员已能编译链接 Boost.Asio 并运行最小异步示例。',
    goal: '掌握 io_context 事件循环与 run 的返回条件、work guard 保活机制，能区分 post 与 dispatch 的执行时机，用 strand 以调度替代互斥锁串行化回调，并理解 steady_timer 基于单调时钟不受系统时间回拨影响的边界。',
    guidedPractice: '现场跑两个线程执行同一 io_context 的 run，先以无 strand 的共享计数器各投递十万次自增回调，观察终值偏差；再套上 strand 复跑核对等于二十万，最后用 steady_timer 设五秒定时并在回调打印触发时刻与错误码。',
    independentPractice: '独立实现一个周期任务调度器：steady_timer 每两百毫秒触发一次回调，回调内经 strand 更新统计并把下一次 expires_after 续期，另起 signal_set 捕获 SIGINT，触发后撤 work guard、取消定时器并 join 全部工作线程。',
    commonErrors: ['在单线程 io_context 的回调里调用阻塞函数，事件循环被卡住，同一循环上的全部连接与定时器同时停摆。', '多线程 run 同一 io_context 时共享状态不加 strand 也不加锁，回调并发执行导致计数与容器竞争出错。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['io_context 与 run', 'io_context 是 Asio 的事件循环，post 提交的 handler 与异步操作完成回调都在其队列排队，run 逐个取出执行。队列空且无未完成异步操作时 run 立即返回，长驻服务需用 make_work_guard 保活，撤掉 guard 后 run 才自然退出。多个线程调用同一 io_context 的 run 会让回调并发执行，回调内部访问的共享状态因此需要 strand 或锁。可验证动作：单线程 run 的服务里在回调中调用阻塞 sleep，观察后续连接与定时器全部停摆，确认循环不可阻塞。', 'run 空了就回'],
      ['post 与 dispatch', 'io_context::post 把 handler 追加到队列，保证不在当前调用点直接执行；dispatch 若当前线程已在该 io_context 上运行则立即内联调用，否则等价于 post。跨线程把回调交回事件循环只能用 post，在其他线程直接调用回调会绕过串行化模型。回调内禁止阻塞系统调用，单线程循环里一次阻塞读取会冻结全部连接。可验证动作：在工作线程里 post 一个打印 thread id 的 handler，对比输出 id 与主线程 id，确认回调切回了 io_context 线程执行。', '回队用 post'],
      ['strand 串行化', 'strand 保证提交给它的 handler 永不并发执行，即便 io_context 被多个线程 run。把读写同一状态的回调全部经 strand 提交，等于用调度代替互斥锁，无锁开销也无死锁风险；漏掉一个回调，该状态就会竞争。单线程 io_context 下 strand 无额外作用，但代码迁移到多线程 run 时天然安全，是多线程扩容的标准配套。可验证动作：两个线程 run 同一 io_context，共享计数器分别在无 strand 与有 strand 下各增十万次，对比终值是否等于二十万。', '调度代锁'],
      ['steady_timer 单调时钟', 'steady_timer 基于 monotonic clock，不受系统时间被 NTP 回拨影响；system_timer 挂在系统时钟上，时间被拨回时定时可能提前或推迟触发，长定时一律选 steady。expires_after 设定相对时长，async_wait 注册回调，到期回调带 error_code，被 cancel 或重设后错误码为 operation_aborted。定时器对象可反复重设实现周期任务，回调里先检查错误再续期。可验证动作：async_wait 五秒期间把系统时间往回拨一分钟，观察 steady_timer 仍按真实时长触发。', '回拨伤不到它'],
      ['多线程 run 实验', 'Asio 服务扩容的标准路径是让多个工作线程执行同一 io_context::run，回调并发度随线程数上升，串行化责任转移到 strand 与按连接隔离的状态上。线程数取 hardware_concurrency 附近即可，过多线程只增加切换开销。停机阶段先撤 work guard 再 join 全部线程，run 才会逐个返回。可验证动作：线程池跑同一 io_context，在每个 strand 回调里打印线程 id，确认同一 strand 的连续回调可能落在不同线程但时间上绝不重叠。', '扩线程不加锁'],
    ],
  },
  {
    name: 'C++ · 并发、原子、内存模型与 Asio：取消、背压和优雅停机',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已实现过 async_accept 与每连接会话管理的服务骨架。',
    goal: '掌握对未完成异步操作调用 cancel 产生 operation_aborted 的机制，会用 signal_set 捕获 SIGINT 与 SIGTERM 驱动停机，能以发送队列限制在途写实现背压，并按顺序完成停止接新连接、取消在途读、清空写队列、join 线程的优雅停机。',
    guidedPractice: '现场起一个带 work guard 的 io_context 服务，async_read 进行中从回调里对 socket 调 cancel 并打印 operation_aborted 错误码；再发 SIGTERM 观察撤 guard 后 run 返回、未完成操作逐个 aborted 的完整日志顺序，把时间线抄进操作单。',
    independentPractice: '独立交付带背压的会话收发改造：每连接维护发送队列与在途写标志，队列超上限即暂停 read，处理延迟人为放大到两百毫秒后压测，记录内核缓冲涨满、客户端写入报错与服务端主动断开的先后时刻形成报告。',
    commonErrors: ['把 operation_aborted 当成普通读写失败去重连重试，停机阶段反而放大故障并刷出大量错误日志。', '对同一 socket 并发提交多个 async_write，各次写入在内核层交错，接收端按消息解包得到损坏数据。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['异步操作取消', '对 socket 或 timer 调用 cancel 会把所有未完成的异步操作以 operation_aborted 错误完成，回调必须先检查 error_code 再决定续读还是清理，已经完成的操作不可取消。新版 Asio 还提供 per-operation cancellation slot 与 cancellation_signal，可对单个操作投递 terminal 或 partial 级别的取消。把 aborted 错误当普通失败处理会触发重连风暴。可验证动作：async_read 进行中调用 socket.cancel，回调打印错误码并确认值为 operation_aborted 而非其他错误。', '回调先看错误码'],
      ['信号驱动停机', 'signal_set 注册 SIGINT 与 SIGTERM，回调在 io_context 线程内触发，停机流程从此处展开：先撤 work guard 让 run 能自然返回，再 cancel 所有会话的未完成读。io_context::stop 只是强行结束 run 循环，已入队 handler 不再执行，会跳过清理逻辑，停机应优先用撤 guard 加 cancel 的组合而非 stop。可验证动作：给服务发 SIGTERM，核对日志确认每个活跃连接先收到 aborted 错误完成清理，进程随后才退出。', '别用 stop 跳清理'],
      ['写队列防交错', '对同一 socket 并发提交多个 async_write 会交错写入造成数据损坏，async_write 内部由多次 write_some 组成，两次调用可能穿插。正确做法是每连接维护待发队列，仅当队列从空变非空时提交一次 async_write，完成回调取出下一条继续。读侧处理速度跟不上到达速率时限制在途消息数，超过阈值就暂停发起下一轮 read，形成背压。可验证动作：两个线程同时 async_write 千条消息到同一 socket，接收端按长度校验可见错乱，改成队列后错乱归零。', '一次只能一个写'],
      ['超时组合', '异步操作本身没有超时参数，超时靠组合实现：为每次操作 arm 一个 steady_timer，定时器先到期就 cancel 对应的 socket 操作，回调里区分是超时取消还是正常完成；或在新版 Asio 用 awaitable 配合超时组合器实现。超时后必须清理会话状态，防止半开连接堆积占满文件描述符。可验证动作：客户端连上后不发任何数据，服务端读操作设五秒超时，记录定时器先触发、随后读回调收到 aborted、最后连接关闭的日志顺序。', '超时靠组合'],
      ['优雅停机顺序', '优雅停机是有序过程：先停 acceptor 不再接新连接，再 cancel 在途读让各会话走 aborted 分支，等待写队列清空与连接关闭完成，最后撤 work guard 并 join 工作线程。顺序颠倒会丢数据：先撤 guard 可能导致 run 提前返回，未完成的写被静默丢弃。退出日志应能证明每个连接都走完关闭分支。可验证动作：压测进行中发 SIGTERM，核对日志里 accept 停止时间早于最后一个连接关闭时间，且进程退出码为 0。', '顺序倒就丢数据'],
    ],
  },
  {
    name: 'C++ · 并发、原子、内存模型与 Asio：异步网络服务实验',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已掌握 strand 串行化、steady_timer 与写队列实现。',
    goal: '综合运用前几课部件搭建完整异步回显服务：acceptor 异步接连接、会话对象以 shared_ptr 续命、读侧按长度前缀定界重组粘包、写队列串行发送并设缓冲上限，能并发压测并解释吞吐、内存与断开行为。',
    guidedPractice: '现场搭最小回显服务：acceptor 异步接受连接，会话用 shared_ptr 加 shared_from_this 续命，读侧把 async_read_some 结果追加进定界缓冲；随后用客户端把一条消息拆三次发送，观察缓冲重组出完整消息的全过程并记录每次读取的字节数。',
    independentPractice: '独立交付完整回显服务并压测：支持长度前缀定界、写队列串行发送、每连接缓冲上限与空闲超时，用多客户端各发十万条消息统计吞吐与进程内存，再发送一百兆无定界字节流验证服务端在上限处主动断开。',
    commonErrors: ['回调捕获会话的 this 裸指针而不是 shared_from_this，连接断开期间对象已析构，回调访问悬垂 socket 直接崩溃。', '以为一次 async_read_some 能读到完整消息，直接把缓冲区当包处理，消息一旦分段到达解析立即错乱。'],
    sourceRefs: ['ISO C++ Working Draft. https://eel.is/c++draft/', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['acceptor 与会话对象', 'ip::tcp::acceptor 绑定 endpoint 后 open 与 listen，async_accept 每完成一次就把新 socket 交给回调。每条连接要建独立会话对象，socket 的生命周期由 shared_ptr<Session> 管理，回调里捕获该指针，否则异步等待期间对象被析构，回调触碰悬垂 socket 直接崩溃。acceptor 自身随 io_context 存活，不必每次重建。可验证动作：accept 回调打印对端 endpoint，用两个并发客户端连接确认各自获得独立会话与地址。', '会话靠指针续命'],
      ['粘包与协议定界', '一次 async_read_some 读到的字节数不确定，可能只有消息前几个字节，也可能一次塞进多条消息，TCP 只保证字节流顺序不保证消息边界。接收侧要把数据追加进缓冲区按协议定界解析：长度前缀协议先攒够头部再按长度收体，分隔符协议扫描边界字节。跳过应用层定界，解析逻辑必然随网络分段情况随机出错。可验证动作：客户端把一条消息拆成三次 write 发送，服务端缓冲区重组后输出完整消息，核对与原始内容逐字节一致。', '流式无边界'],
      ['写串行化与读背压', 'async_write 必须对同一 socket 串行执行，实现方式是每连接一个发送队列加一个在途写标志，完成回调触发下一条，这也是背压的落点：发送队列超过上限时暂停读侧或直接断开慢消费者。读侧处理耗时大于到达速率时，未读数据堆积在内核接收缓冲区，缓冲区满后对端 write 开始失败，背压链路就此生效。可验证动作：把服务端处理人为延迟两百毫秒，观察内核缓冲涨满后客户端 write 返回错误的具体时刻。', '队列满即停读'],
      ['shared_from_this 捕获', '会话回调链跨越多次事件循环，栈上局部对象活不到回调执行，标准做法是 Session 继承 enable_shared_from_this，异步调用里捕获 shared_from_this() 的拷贝，引用计数保证最后一个回调结束后才析构。漏捕获或捕获 this 裸指针是典型崩溃源，断连瞬间回调访问已析构对象。对端断开时读回调收到 eof 错误属正常路径，按会话关闭处理而非报错重试。可验证动作：客户端断开后观察服务端读到 eof 并打印会话销毁日志，核对析构晚于 eof 回调。', '引用计数兜底'],
      ['回显压测与内存上限', '把前几课部件拼成完整回显服务：acceptor 接连接、会话带定界缓冲、写队列串行发送、steady_timer 管空闲超时。压测用多个并发客户端各发固定条数消息，统计每秒处理量与进程 RSS，对照单线程与多线程 run 两档结果。每连接缓冲区必须设上限，恶意客户端发送超长无定界数据会无限膨胀内存，超限即断开是硬边界。可验证动作：单客户端发送一百兆不分隔字节流，观察服务端在缓冲上限处主动断开且内存曲线平稳。', '上限就是断开线'],
    ],
  },
];

// ── X4 构建、ABI、动态库与跨平台发布 ─────────────────────────────────────────────
export const HANDWRITTEN_CPP_PERFORMANCE_X4_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C++ · 构建、ABI、动态库与跨平台发布：静态库、共享库和可见性',
    track: 'P14 · 独立语言课程',
    minutes: 45,
    prerequisite: '学员已熟悉 g++ 编译链接流程与常用命令行参数。',
    goal: '理解静态库归档与共享库 PIC 两种产物的链接期与运行期机制，掌握 -fvisibility=hidden 配合 __attribute__((visibility("default"))) 精确控制导出符号，会用 nm -D 与 readelf 盘点导出表。',
    guidedPractice: '现场执行 g++ -c math.cpp 后用 ar rcs libmath.a math.o 制作静态库，再执行 g++ -shared -fPIC -o libmath.so math.cpp 生成共享库；随后对两个产物分别跑 nm -D 与 ldd，把导出符号数与依赖列表的差异抄进操作单。',
    independentPractice: '独立交付一个拆分后的工程：公共 API 所在编译单元显式标注 visibility("default")，其余翻译单元加 -fvisibility=hidden，交付 nm -D 前后导出符号数对比记录与构建脚本。',
    commonErrors: ['编译共享库源文件时漏掉 -fPIC，链接期报 relocation R_X86_64_PC32 cannot be used 之类的重定位错误。', '不加 -fvisibility=hidden 直接编译，所有全局符号默认导出，与其他库同名符号冲突后行为悄然被替换。'],
    sourceRefs: ['Itanium C++ ABI. https://itanium-cxx-abi.github.io/cxx-abi/abi.html', 'CMake Documentation. https://cmake.org/documentation/'],
    steps: [
      ['静态库的归档与按需取用', '静态库是 ar 工具把若干 .o 打包成的归档文件，执行 ar rcs libmath.a math.o add.o 即生成，r 替换成员、c 创建归档、s 写入符号索引。链接器只在归档成员能消解当前未定义符号时才把该 .o 拷进最终可执行文件，未被引用的成员不占体积。因此链接顺序必须把库放在使用它的目标文件之后，写成 g++ main.o -L. -lmath，顺序颠倒会报 undefined reference。用 nm libmath.a 可逐成员查看符号表验证这一点。', 'ar 只取用到的成员'],
      ['共享库的 PIC 与运行期查找', 'g++ -shared -fPIC -o libmath.so math.cpp 生成位置无关代码：函数调用经 PLT 跳板、全局数据访问经 GOT 间接寻址，代码段才能被多个进程映射到不同虚拟地址后共享同一物理页。运行期 ld.so 按 DT_RPATH、LD_LIBRARY_PATH、/etc/ld.so.cache 的顺序查找库，ldconfig 扫描库目录重建缓存。可执行文件里写死 SONAME 引用，readelf -d 产物输出的 NEEDED libmath.so 就是运行期要找到的名字。', '重建查找缓存'],
      ['-fvisibility=hidden 收缩导出面', 'ELF 下所有全局符号默认可见，相当于对外全开放。编译时统一加 -fvisibility=hidden 让符号默认隐藏为本地符号，再在公共头文件对要导出的声明加 __attribute__((visibility("default")))，形成显式导出契约。可验证动作：同一份代码分别在默认与 hidden 两种设置下编译，执行 nm -D libmath.so | wc -l 对比动态符号表条目数，hidden 版本应只剩标注过的 API 与少数运行期符号。', '标注后再导出'],
      ['nm -D 与 readelf 盘点产物', 'nm -D 只读 .dynsym 动态符号表，正是运行期真正参与解析的符号集合：大写 T 表示本库导出的代码符号，U 表示本库依赖的外部符号。readelf --dyn-syms 可看到同样信息，readelf -d 则列出 NEEDED 依赖与 SONAME。可验证动作：把一个导出函数加上 hidden 属性重新编译后跑 nm -D，该符号应从动态表中消失、只出现在不加 -D 的 nm 输出里；排查 undefined reference 时先看 U 条目就知道缺了哪个库。', 'T 是导出 U 是依赖'],
      ['SONAME 与库升级的边界', '链接时用 -Wl,-soname,libmath.so.1 把 SONAME 写进共享库，可执行文件记的是 SONAME 而非文件名，因此磁盘上可以有 libmath.so.1.0.2 实体加 .so.1 软链的多版本并存。兼容性修复只改末位版本号；一旦改了函数签名、删了导出符号等破坏 ABI 的变更，必须升主版本号换新 SONAME，否则老程序加载新库后可能直接崩溃。readelf -d 查看现有 SONAME 是发布前必做的核对动作。', '破坏 ABI 就升主版本'],
    ],
  },
  {
    name: 'C++ · 构建、ABI、动态库与跨平台发布：ABI、name mangling 和标准库差异',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已能用 GCC 或 MSVC 各完成一次完整编译链接。',
    goal: '理解 Itanium 与 MSVC 两套 mangling 规则的差异及反解工具用法，掌握 extern C 的边界作用、noexcept 进类型系统带来的链接差异，以及 libstdc++ 与 libc++、CXX11 ABI 宏对二进制兼容的影响。',
    guidedPractice: '现场写一个 namespace demo 下的函数，分别用 g++ 与 MSVC cl 编译成目标文件后跑 nm 与 dumpbin /symbols，观察 _Z 与 ? 开头两种符号名；再用 c++filt 与 undname.exe 各自反解成可读签名，把两份对照抄进笔记。',
    independentPractice: '独立交付一份符号排查记录：对一个报 undefined reference to std::__cxx11 的工程定位原因，检查各编译单元的 _GLIBCXX_USE_CXX11_ABI 宏一致性，修好链接后附 nm -C 前后的符号对照。',
    commonErrors: ['工程里一部分文件用 -D_GLIBCXX_USE_CXX11_ABI=0 编译、另一部分用默认值 1，std::string 的 mangled 名不同导致链接期 undefined reference。', '库声明与实现一侧写 noexcept 一侧不写，GCC 7 起异常规范进入函数类型，mangled 名不同直接找不到符号。'],
    sourceRefs: ['Itanium C++ ABI. https://itanium-cxx-abi.github.io/cxx-abi/abi.html', 'CMake Documentation. https://cmake.org/documentation/'],
    steps: [
      ['Itanium mangling 的编码规则', 'GCC 与 Clang 在 Linux 上遵循 Itanium C++ ABI 的 mangling：函数名、命名空间、参数类型全部编码进符号。void f(int) 编为 _Z1fi，前缀 _Z 是标记，1fi 表示一字符名 f 加参数 int；命名空间函数 ns::process(double) 编为 _ZN2ns7processEd，N 到 E 之间是嵌套名。可验证动作：对 nm libdemo.so 输出中任意 _Z 开头符号执行 c++filt _Z1fi，应还原出 f(int)，排查链接错误时先用它翻译报错里的乱码符号。', 'c++filt 反解乱码'],
      ['MSVC mangling 与工具差异', 'MSVC 用自有编码体系：符号以 ? 开头，信息密度更高但与 Itanium 不兼容，如 ?add@@YAHHH@Z 对应 int add(int,int)。MinGW-w64 虽在 Windows 上却走 Itanium 规则，因此 MSVC 与 MinGW 的目标文件不能混链，C 接口除外。可验证动作：用 dumpbin /exports demo.dll 看导出表里的 ? 名，再交给 undname.exe 反解为可读签名；报错定位时 MSVC 链接器输出的 LNK2019 附带原始符号名，同样可用 undname 翻译。', 'dumpbin 反解'],
      ['extern C 是跨编译器通道', 'extern C 关闭 mangling，符号按 C 规则原样导出，是 C++ 库向其他语言与不同编译器暴露稳定边界的唯一通道；头文件惯用 extern C 块包裹声明并配 __cplusplus 宏条件。代价是同名无法重载、异常不得穿越该边界传播。可验证动作：同一函数分别以 C++ 与 extern C 编译后跑 nm，符号从 _Z1fi 变成裸名 f；插件系统用 dlsym 按 C 名字找入口，正是因为它绕开了 mangling 差异。', '异常不许穿 C 边界'],
      ['noexcept 进入类型系统', 'GCC 7 起异常规范成为函数类型的一部分：void save(int) 与 void save(int) noexcept 的 mangled 名不同，链接器视为两个函数。库的声明头与实现文件、调用方的旧头文件之间若一边加了 noexcept 一边没加，运行期行为不变但链接期直接报 undefined reference。可验证动作：同一函数加 noexcept 前后各编译一次目标文件，nm 对比符号名会发现多了小写 n 参数编码；升级编译器后链接失败先怀疑这类签名漂移。', 'noexcept 换符号'],
      ['标准库实现与 CXX11 ABI 宏', 'GCC 默认链接 libstdc++，Clang 可用 -stdlib=libc++ 换 LLVM 实现，两者容器内存布局不同、mangled 名空间不同，跨库传递 std::string 等对象时二进制不兼容。libstdc++ 内部还有一层：_GLIBCXX_USE_CXX11_ABI=1 使用带短字符串优化的新 std::string，符号带 std::__cxx11 前缀；=0 回退旧的写时复制实现。可验证动作：同一 std::string 相关代码在两种宏下编译后跑 nm -C，符号名差异肉眼可见，全工程宏必须一致。', '全工程宏要统一'],
    ],
  },
  {
    name: 'C++ · 构建、ABI、动态库与跨平台发布：符号版本、插件和动态加载',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已了解 ELF 动态链接并会使用 nm 基本用法。',
    goal: '掌握 dlopen、dlsym、dlclose 的句柄与引用计数语义，会用版本脚本与 visibility 控制插件导出，理解 glibc 符号版本 GLIBC_2.x 只向后不向前的兼容边界及失败路径排查方法。',
    guidedPractice: '现场写宿主程序对同一个 libplug.so 连续 dlopen 两次再 dlclose 一次，观察第三次 dlsym 依然成功，验证引用计数规则；随后执行 LD_DEBUG=libs ./host 观察 ld.so 逐级搜索库的顺序，把输出与 dlerror 文本抄进操作单。',
    independentPractice: '独立交付一个最小插件系统：宿主以 -rdynamic 导出回调注册函数，插件经 dlsym 加载入口并回调宿主，交付 dlopen 失败、符号缺失、glibc 版本不足三种故障的复现与排查记录。',
    commonErrors: ['插件入口函数忘记 extern C，dlsym 按原始名字查找时符号已被 mangle，永远返回 NULL 且 dlerror 报 undefined symbol。', '把 DL_LIBRARY_PATH 拼错成环境变量名，或依赖 LD_LIBRARY_PATH 硬指定路径，部署到生产环境后库查找顺序悄悄变化。'],
    sourceRefs: ['Itanium C++ ABI. https://itanium-cxx-abi.github.io/cxx-abi/abi.html', 'CMake Documentation. https://cmake.org/documentation/'],
    steps: [
      ['dlopen 句柄与引用计数', 'dlopen(path, RTLD_NOW | RTLD_LOCAL) 立即完成重定位并返回 void* 句柄，失败返回 NULL，此时必须调 dlerror() 取错误串。同一库被多次 dlopen 时引用计数递增，每次 dlclose 递减，减到零才真正卸载并执行 __attribute__((destructor)) 标记的清理函数。可验证动作：对同一 so 连续 dlopen 两次、dlclose 一次后再 dlsym 取符号仍应成功，说明库未卸载；两个插件共用同一依赖库时正是靠这个机制只加载一份。', '计数归零才卸载'],
      ['dlsym 入口与 RTLD 作用域', 'dlsym(handle, create_plugin) 按字符串查符号，入口函数必须 extern C 导出否则名字被 mangle 找不到。RTLD_LOCAL 是默认值，插件符号不进全局命名空间，避免插件之间同名符号互抢；RTLD_GLOBAL 则把库符号开放给后续加载的库。宿主想让插件回调自己，需链接时加 -rdynamic 即 -Wl,--export-dynamic 把可执行文件符号导出。可验证动作：不加 -rdynamic 时插件调宿主函数报 undefined symbol，加上后正常。', '宿主导出符号'],
      ['版本脚本精确控制导出', '链接时传 -Wl,--version-script=lib.map，map 文件中 global 段列出导出符号可配通配符，local: * 把其余全部降为本地符号，比 visibility 属性更集中、适合纯 C 接口库。可验证动作：链接后执行 nm -D libdemo.so，动态表应只剩 global 段声明的名字，其余符号消失；符号还带隐式版本节点，nm 输出形如 api@@LIBDEMO_1.0，供后续做符号级兼容声明使用。', 'global 之外全隐藏'],
      ['glibc 符号版本只向后兼容', 'glibc 的导出符号挂在版本节点上，nm libpthread 输出 memcpy@@GLIBC_2.14 双 at 表示本文件默认提供的版本，memcpy@GLIBC_2.2.5 单 at 表示旧版本仍在供老程序引用。编译时链接器把用到的最高版本写进 .gnu.version_r，运行期 ld.so 校验通过才加载；因此 2.17 上编译的程序能在 2.35 运行，反过来在 2.35 编译的产物搬到 2.17 会报 version GLIBC_2.34 not found。可验证动作：readelf -V 产物查看版本需求集，确认最高版本不超部署目标。', '向下兼容不向上'],
      ['加载失败路径与排查手段', 'dlopen 失败的常见原因有三类：依赖库缺失、undefined symbol（插件引用的符号宿主没导出或版本不符）、GLIBC 版本不足，前两者 dlerror 都会给出原文。ldd plugin.so 列出全部 NEEDED 并指出找不到的项；LD_DEBUG=libs 打印 ld.so 的完整查找序列，能看出它在哪些目录找了哪个名字。边界：ldd 本质是让 ld.so 以探测模式执行加载逻辑，对不可信二进制不要直接跑 ldd，改用 objdump -p 读 NEEDED 段即可。', 'dlerror 给出原文'],
    ],
  },
  {
    name: 'C++ · 构建、ABI、动态库与跨平台发布：跨平台编译器和运行时依赖',
    track: 'P14 · 独立语言课程',
    minutes: 47,
    prerequisite: '学员已掌握 CMake 基本构建与命令行操作。',
    goal: '理解 MSVC、GCC、Clang 三套工具链在运行库链接方式与产物依赖上的差异，掌握 /MT 与 /MD、-static-libstdc++ 等运行库选项的适用边界，会用 vcpkg 或 Conan 管理依赖并盘点产物运行期依赖。',
    guidedPractice: '现场用 cl /MD 与 cl /MT 各编译同一程序，跑 dumpbin /dependents 观察 VCRUNTIME140.dll 是否出现在依赖表；再用 g++ 编译同功能代码跑 ldd 看 libstdc++.so.6 的 NEEDED 条目，把三个产物依赖表并排抄进笔记。',
    independentPractice: '独立交付一份三平台构建脚本：同一源码在 Windows、Linux、macOS 各自构建成功并跑通冒烟用例，附每平台运行期依赖盘点清单与缺失库的处理方式说明。',
    commonErrors: ['/MT 构建的主程序链接了 /MD 构建的第三方库，进程内存在两份 CRT，一块内存一边申请另一边释放直接崩溃。', '在 Linux 用 g++ -static 全静态链接，误以为产物零依赖，实际 glibc 的 NSS 等模块运行期仍会动态加载。'],
    sourceRefs: ['Itanium C++ ABI. https://itanium-cxx-abi.github.io/cxx-abi/abi.html', 'CMake Documentation. https://cmake.org/documentation/'],
    steps: [
      ['三套工具链与运行库默认值', 'MSVC 的 cl.exe 用 /MD 让程序运行期依赖 VCRUNTIME140.dll 等 VC 运行库 DLL，/MT 则把运行库静态编进 exe；GCC 与 Clang 默认动态链接 libstdc++ 或 libc++，产物运行期必须有对应共享库。三家的诊断能力与扩展行为也不同，同一份代码在 MSVC 下能过、在 GCC 高告警等级下可能暴露越界。可验证动作：dumpbin /dependents app.exe 对照 /MD 与 /MT 两个版本，前者必须出现 VCRUNTIME140.dll，后者没有。', '运行库可静可动'],
      ['平台 API 与动态库扩展差异', '动态库扩展名三平台各异：Windows .dll、Linux .so、macOS .dylib；加载接口也不同，Linux 与 macOS 都走 dlopen，Windows 用 LoadLibrary 与 GetProcAddress。路径分隔符与大小写敏感性同样不同，文件路径代码必须在预处理分支 _WIN32、__APPLE__ 下隔离实现，不要自造平台宏。可验证动作：在三个平台分别执行 uname 与 file 产物，file 输出会标明 Mach-O 或 ELF 共享对象，脚本里据此选扩展名。', '预处理分支隔离平台'],
      ['静态链接运行库的边界', '/MT 消除了 VC 运行库部署问题，但全工程必须统一：主程序 /MT 就不能混入 /MD 构建的库，否则两份 CRT 各管各的堆，跨边界 free 必崩。GCC 侧折中方案是 -static-libstdc++ -static-libgcc，只把标准库静态进产物，libc 仍动态；glibc 不建议整体 -static，因为它会在运行期按需 dlopen NSS 模块完成用户名解析等功能，静态产物反而带着动态依赖。可验证动作：-static 链接后跑 ldd，输出 not a dynamic executable 之外再用 strace 观察运行期仍打开系统 so。', '混 CRT 必崩'],
      ['依赖管理工具与消费方式', 'vcpkg 清单模式在工程根放 vcpkg.json 声明依赖，vcpkg install 解析出完整依赖树并生成工具链文件；Conan 用 conanfile.py 声明，conan install 生成 conan_toolchain.cmake 与依赖配置。CMake 侧统一用 -DCMAKE_TOOLCHAIN_FILE=<路径> 消费，find_package 即可找到第三方库。可验证动作：vcpkg install 后按 preset 执行 cmake --preset default 构建目录，日志中 find_package 直接命中；同一依赖的 Debug 与 Release、x86 与 x64 产物绝不能混链。', '工具链文件接 CMake'],
      ['运行期依赖盘点三件套', '发布前必须盘点直接依赖：Linux 用 ldd 产物、macOS 用 otool -L 产物、Windows 用 dumpbin /dependents 产物，三者分别列出 NEEDED 库与加载路径。ldd 的原理是设置环境变量后让 ld.so 模拟执行一次加载，对不可信二进制不要用，改读 readelf -d 的 NEEDED 即可。可验证动作：盘点出缺失库后，把 so 复制到产物同级目录并在启动脚本设 LD_LIBRARY_PATH=$ORIGIN，再跑 ldd 确认所有条目解析成功。', 'ldd 对不可信文件慎用'],
    ],
  },
  {
    name: 'C++ · 构建、ABI、动态库与跨平台发布：安装包、容器和调试符号',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员会写基础 Dockerfile 并能用 gdb 做基本排错。',
    goal: '掌握 CPack 生成 DEB 与 RPM 包的字段配置，会用多阶段构建裁剪容器镜像，理解 objcopy 分离调试符号与 debuglink 机制、MSVC PDB 的版本绑定关系，能交付带符号包的发布物。',
    guidedPractice: '现场给 CMake 工程配 CPACK_GENERATOR 与 CPACK_DEBIAN_PACKAGE_MAINTAINER 等字段后执行 cpack -G DEB，用 dpkg -I 看元数据、dpkg -c 核对安装路径；随后跑 objcopy --only-keep-debug 分离符号，strip 前后用 ls -lh 与 gdb bt 对比。',
    independentPractice: '独立交付一个带符号层的发布流水线：多阶段 Dockerfile 产出精简运行镜像与独立符号镜像，二进制经 strip 加 debuglink，交付镜像体积前后对比与 gdb 解析函数名的验证记录。',
    commonErrors: ['多阶段构建里运行镜像用了与构建镜像不同的基础系统，glibc 版本更低，启动即报 version GLIBC_2.xx not found。', 'strip 产物后随手删掉符号文件，线上崩溃时只有地址没有函数名，无法把栈还原到代码行。'],
    sourceRefs: ['Itanium C++ ABI. https://itanium-cxx-abi.github.io/cxx-abi/abi.html', 'CMake Documentation. https://cmake.org/documentation/'],
    steps: [
      ['CPack 出 DEB 与 RPM', 'CMake 内置 CPack：在 CMakeLists 配 CPACK_GENERATOR、CPACK_PACKAGE_NAME、CPACK_DEBIAN_PACKAGE_MAINTAINER 等变量后，命令行执行 cpack -G DEB 即产出 .deb，-G RPM 产出 .rpm，安装路径由 CMAKE_INSTALL_PREFIX 决定。可验证动作：dpkg -I 包文件查看元数据，dpkg -c 包文件列出内容树，核对二进制是否落在预期前缀；装完后 dpkg -L 包名回查已装清单，卸载验证用 dpkg -r。', 'dpkg -c 核对路径'],
      ['多阶段构建裁剪镜像', '多阶段 Dockerfile 第一阶段用 gcc:13 等完整镜像完成 cmake --build，第二阶段 FROM gcr.io/distroless/cc 或 ubuntu:24.04，只 COPY 二进制与必要的 so 进去。完整构建镜像通常超过 1GB，运行镜像可压到 100MB 量级。边界：两阶段基础系统的 glibc 必须兼容，低版本运行镜像会报 version GLIBC_2.xx not found。可验证动作：docker image ls 对比两阶段镜像体积，再用 docker run 产物镜像直接跑冒烟命令验证可用。', '两阶段版本对齐'],
      ['objcopy 分离调试符号', 'strip app 去掉符号与调试信息后体积骤减，但崩溃栈只剩地址。标准做法是先 objcopy --only-keep-debug app app.debug 生成纯符号文件，再 strip app，最后 objcopy --add-gnu-debuglink=app.debug app 把关联写进产物；gdb 加载 stripped 产物时按 debuglink 在同目录或 /usr/lib/debug 下自动找到符号。可验证动作：strip 前后 ls -lh 对比体积，随后对 stripped 产物执行 gdb -q ./app -ex bt，栈帧应显示函数名而非纯地址。', 'debuglink 关联'],
      ['MSVC PDB 与符号服务器', 'MSVC 用 /Zi 生成 PDB 文件，PDB 与 exe 通过内部 GUID 严格成对，重新编译即换 GUID，错配的 PDB 无法解析栈。发布时应保留每版 PDB：用 symstore add 把符号按版本收进符号服务器目录，调试机设 _NT_SYMBOL_PATH 指向服务器与本地缓存，调试器自动按 GUID 拉取。可验证动作：用 WinDbg 打开崩溃 dump，设置符号路径后栈帧从模块加偏移变为函数名与源码行号；缺 PDB 时同一栈帧只显示地址。', 'GUID 严格成对'],
      ['符号与版本的严格一致', '符号包必须与二进制版本逐字对应：DEB 发行版惯例把调试符号做成 -dbgsym 包，版本号与主包完全一致；容器场景把符号放独立镜像层，按崩溃产物的构建指纹（git commit、编译器版本、链接时间）拉取对应层。可验证动作：崩溃上报的模块版本号与符号包版本逐字符比对一致后，栈才能正确解析到行号，不一致时解析器会静默给出错位结果，这是排障前必做的核对。', '版本不一致解析错位'],
    ],
  },
  {
    name: 'C++ · 构建、ABI、动态库与跨平台发布：二进制发布与兼容性测试',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已熟悉发布流程与容器 CI 基本操作。',
    goal: '掌握以最低支持环境倒推构建镜像的发布策略，会用 abi-compliance-checker 与 abidiff 做 ABI 兼容检查，能在多发行版 CI 矩阵跑冒烟测试，并建立灰度发布与回滚机制。',
    guidedPractice: '现场对同一份代码分别在 ubuntu:20.04 与 ubuntu:24.04 容器内编译，用 readelf -V 对比产物的 GLIBC_2.x 版本需求集；再对新旧两个版本的 so 跑 abidiff，观察类型布局变化如何被报告，把两份输出抄进操作单。',
    independentPractice: '独立交付一套发布检查清单与 CI 矩阵：以 manylinux2014 为构建镜像产出产物，在 ubuntu、debian、rockylinux 三容器跑冒烟用例，附 abidiff 报告与灰度回滚演练记录。',
    commonErrors: ['在最新发行版上编译再发往老系统，产物隐含高版本 GLIBC 符号需求，老环境启动即报 version not found。', '改了导出函数签名却不升 SONAME，依赖旧库的程序加载新库后行为异常甚至崩溃。'],
    sourceRefs: ['Itanium C++ ABI. https://itanium-cxx-abi.github.io/cxx-abi/abi.html', 'CMake Documentation. https://cmake.org/documentation/'],
    steps: [
      ['支持矩阵与版本下限', '发布前先定支持矩阵：目标架构 x86_64 与 aarch64、最低 glibc 版本、覆盖的发行版列表。glibc 符号版本只向后兼容不向前兼容，产物需求的最高 GLIBC_2.x 版本就决定了部署下限。可验证动作：对候选产物执行 readelf -n 或 readelf -V，读取 .gnu.version_r 段里最高版本节点，与矩阵下限逐字核对，超过即重新选择构建环境。', 'readelf 查版本'],
      ['最低版本环境构建策略', '要压低符号版本需求，就在最老支持系统上构建：容器方案是用 manylinux2014（glibc 2.17）作为构建镜像，产物即可运行在 2.17 及以上所有系统。边界要盯紧第三方库：链接了需要 GLIBC_2.34 新符号的依赖（如 2.34 起 pthread 符号并入 libc）会整体抬升下限。可验证动作：在构建容器内编译后立即跑 readelf -V 产物核对版本集，再交付；构建镜像版本一旦升级，必须重跑这一核对。', 'manylinux 保底'],
      ['ABI 兼容性自动检查', '升级库版本前用工具对比新旧 ABI：abi-dumper 依据带调试信息的 so 生成 ABI dump，abi-compliance-checker 对比两份 dump，报告类型大小、成员布局、虚表顺序、符号签名的具体差异；libabigail 的 abidiff 是同类工具，输出更轻量。可验证动作：给某导出结构体增删一个成员后跑 abidiff old.so new.so，报告中应出现类型大小变化与布局错位的条目，凡出现即判定破坏 ABI，必须升 SONAME 换文件名。', 'abidiff 查布局'],
      ['多发行版冒烟测试矩阵', '发布用例在 CI 里以容器代表目标环境：ubuntu:20.04、debian:11、rockylinux:9 各起一个 job，对同一产物执行冒烟脚本——打印版本号、加载全部 dlopen 插件、跑核心功能用例。产物只构建一次，各环境仅做运行验证，避免分环境编译引入差异。可验证动作：CI 日志中每个环境输出同一版本指纹且用例全绿才允许发版，任一环境报 version not found 即挡下整个发布。', '产物一份环境多测'],
      ['灰度放量与回滚演练', '发布按批次放量：首批小比例流量，崩溃上报按符号栈聚类统计崩溃率，异常即停；每版保留完整产物与对应符号包，回滚时切回上一版并重跑冒烟。可验证动作：在测试环境完成一次回滚演练，核对切换后运行产物的构建指纹与上一版一致、冒烟用例通过；边界是配置文件 schema 必须向后兼容，否则回滚后的旧程序解析新配置会启动失败。', '回滚前先验指纹'],
    ],
  },
];

// ── X5 Sanitizer、Benchmark、perf 与崩溃诊断 ─────────────────────────────────────────────
export const HANDWRITTEN_CPP_PERFORMANCE_X5_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：ASan、UBSan、TSan 和 MSan 边界',
    track: 'P14 · 独立语言课程',
    minutes: 45,
    prerequisite: '学员已能用 g++ 或 clang++ 编译运行含指针与数组的 C++ 程序。',
    goal: '理解四类 Sanitizer 的检测原理与开销差异，掌握各自的编译开关与运行约束，能按怀疑的错误类型选对工具，并说清 TSan 为何必须独占运行、MSan 为何要求全量插桩。',
    guidedPractice: '用 clang++ -fsanitize=address 编译一段堆越界代码并运行，观察报告里的错误类别、出错栈与分配栈；再用 -fsanitize=undefined 复现一次移位位数超界，把两次报告原文逐行抄进对照表并标注定位行。',
    independentPractice: '独立完成：对同一份含堆溢出、释放后使用与未定义行为的工程分别加 ASan 与 UBSan 各跑一轮，输出完整报告，标注每个报错对应的源码行、错误类别，并记录两类工具各自漏掉的问题。',
    commonErrors: ['把 -fsanitize=thread 与 address 写进同一次编译，两个运行时冲突导致程序启动即异常退出，却误判为代码 bug。', 'MSan 链接了未插桩的第三方库，满屏误报后直接放弃工具，没有意识到需要用同样开关全量重编依赖。'],
    sourceRefs: ['Clang Sanitizers Documentation. https://clang.llvm.org/docs/', 'Google Benchmark. https://github.com/google/benchmark'],
    steps: [
      ['ASan 影子内存与开销', 'ASan 在每次内存访问处插桩，查询对应的影子内存，影子区按 1 字节映射 8 字节真实内存，非法区域的影子字节被标记为中毒。编译命令 clang++ -fsanitize=address main.cpp，堆越界与释放后使用会在发生瞬间打印错误类别、出错栈与分配释放栈。代价是内存涨到数倍、速度约降为二分之一，因此用于测试阶段而非线上常驻。', '一比八影子映射'],
      ['UBSan 覆盖未定义行为', 'UBSan 检查有符号溢出、移位位数超界、空指针解引用、错误对齐等明确定义为未定义行为的场景，开关是 -fsanitize=undefined，开销只有个位数百分比，可与 ASan 叠加为 -fsanitize=address,undefined。默认发现违规只打印报告继续运行，加 -fno-sanitize-recover=all 后首个违规直接终止进程，便于在持续集成里当作硬门禁。', '开销低可叠加'],
      ['TSan 独占与数据竞争', 'TSan 记录每次内存访问的向量时钟，两个无同步的线程访问同一地址且至少一方写时报告 data race 警告，并给出两端的访问栈。它的开销最重，速度常降到约十分之一、内存涨到约五倍，且运行时与其他 Sanitizer 冲突，-fsanitize=thread 不能与 address 或 undefined 混在同一次编译，必须单独编译单独跑。', '必须独占编译'],
      ['MSan 追踪未初始化', 'MSan 追踪每个比特是否被初始化，未初始化值参与分支或被传出时报告 use-of-uninitialized-value，加 -fsanitize-memory-track-origins 还能指出来源分配点。它要求全部依赖包括 libc++ 都用同样开关重新编译，链接任何未插桩的库都会产生大量误报，所以适合源码可控的小型项目，开关为 -fsanitize=memory。', '全量需插桩'],
      ['按错误类型选工具', '怀疑内存越界与释放后使用选 ASan，怀疑未定义行为选 UBSan，怀疑数据竞争选 TSan，怀疑读到未初始化变量选 MSan。除 TSan 必须独占外，ASan 与 UBSan 可在同一次编译中并用；日常回归可常开 UBSan，提交前用 ASan 跑一轮全量用例，性能敏感的常驻服务只在测试环境开 ASan。', '按错误类型选'],
    ],
  },
  {
    name: 'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：GTest、property test 和回归矩阵',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已掌握 C++ 类与模板的基本写法并能用命令行编译多文件工程。',
    goal: '掌握 GTest 的 TEST 与 TEST_F 写法及夹具对象的生命周期，会用致命与非致命断言组织用例，理解 property test 用随机输入验证不变量的思路，并能按成本把检查分成层级组成回归矩阵。',
    guidedPractice: '写一个继承 ::testing::Test 的夹具类，在 SetUp 与 SetUpTestSuite 里各放一条打印，用 TEST_F 建两个用例，运行可执行文件观察构造析构次数与四条打印的出现顺序，把输出顺序记录成生命周期时序。',
    independentPractice: '独立完成：为排序函数补齐 GTest 用例与一个随机属性用例，属性固定为输出有序且是输入的重排，随机种子在运行开始时打印；再用 --gtest_filter 只跑失败用例，整理出一份分层回归清单。',
    commonErrors: ['TEST_F 第一个参数写成基类 Test 的名字而非自己的夹具类，编译器报参数类型不匹配，却去查断言宏的用法文档。', 'property test 没有固定并打印随机种子，偶发失败无法复现，只能反复重跑碰运气定位。'],
    sourceRefs: ['Clang Sanitizers Documentation. https://clang.llvm.org/docs/', 'Google Benchmark. https://github.com/google/benchmark'],
    steps: [
      ['TEST 与两级断言', 'GTest 用 TEST(套件名, 用例名) 定义普通用例，EXPECT_EQ 等非致命断言失败后继续执行本用例剩余代码，ASSERT_EQ 等致命断言失败立即终止当前用例，但其余用例照常运行。同一套件内用例名必须唯一，失败输出同时打印期望值与实际值。需要对象有效才能继续的场景要用 ASSERT，避免空指针后续连环报错淹没真正的原因。', 'EXPECT 不中止'],
      ['TEST_F 与夹具生命周期', 'TEST_F(夹具类名, 用例名) 配合继承 ::testing::Test 的夹具类使用，每个用例运行前构造一个全新夹具对象并调用 SetUp，用例结束后先跑 TearDown 再析构，用例之间互不共享成员状态。只需整组执行一次的资源放 SetUpTestSuite 与 TearDownTestSuite，它们在套件首个用例前与最后一个用例后各执行一次，弄混两个层级会造成用例间状态泄漏。', '每用例新对象'],
      ['筛选与批量运行', '编译产物自身就是测试入口，直接运行跑全部用例；--gtest_filter=套件名.* 只跑指定套件，星号做通配，只重跑失败用例能大幅缩短反馈；--gtest_repeat=3 配合 --gtest_shuffle 把用例重复三遍并打乱顺序，能暴露用例之间隐藏的状态依赖；加 --gtest_output=xml:report.xml 产出持续集成可解析的报告文件。', '通配可筛选'],
      ['property test 不变量', 'property test 不写固定输入与固定期望，而是声明对任意输入都应成立的不变量，例如排序结果有序且是原序列的重排，然后用随机生成器大量造输入逐一验证。每个用例开始前固定并打印随机种子，失败时用同一种子重跑即可复现同一批输入；它擅长撞出手写用例容易遗漏的边界组合，如空容器、极大值与大量重复元素。', '种子须固定'],
      ['回归矩阵分层', '回归矩阵按成本分层组织：静态检查与编译告警每次保存可跑，GTest 单元用例与 property test 挂在每次提交，ASan 与 TSan 版本的全量用例放夜间，性能基准只在改到热路径时触发。每层给出明确通过标准与失败处置，例如单元层零容忍、竞争层出现报告必须立案，避免把全部检查堆进一次提交拉长反馈周期。', '分层控成本'],
    ],
  },
  {
    name: 'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：Google Benchmark 与统计波动',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已能编写并运行简单的 C++ 函数，理解编译器优化对测量结果的影响。',
    goal: '掌握 Google Benchmark 的基准函数骨架与自动迭代机制，会用 DoNotOptimize 防止计算被优化掉，理解重复测量与聚合统计的意义，能识别测量噪声的来源并给出可信的前后对比结论。',
    guidedPractice: '写一个把整数累加到局部变量的基准，先不加 DoNotOptimize 运行一轮，再补上 benchmark::DoNotOptimize 运行一轮，对比两轮 ns/op 的量级差异；随后加 --benchmark_repetitions=9 重跑，把九轮明细与聚合行抄进记录表。',
    independentPractice: '独立完成：给一段真实处理函数写参数化基准，用 Arg 扫三档输入规模，每档重复九次取中位数，导出 csv 后计算各档标准差与均值之比，写成一份含波动区间的小型测量结论。',
    commonErrors: ['基准循环里结果没被使用，编译器把整个计算优化掉，测到的是空循环还以为是性能突破。', '用单次运行的两轮数据宣布优化生效，改进幅度其实小于测量噪声，复测后结论直接反转。'],
    sourceRefs: ['Clang Sanitizers Documentation. https://clang.llvm.org/docs/', 'Google Benchmark. https://github.com/google/benchmark'],
    steps: [
      ['BENCHMARK 骨架与自动迭代', 'BENCHMARK(BM_函数名) 注册基准函数，框架自动决定迭代次数，目标是让单轮运行时长趋近 --benchmark_min_time 的默认值 0.5 秒，循环体写作 for (auto _ : state)，state.iterations() 记录实际迭代数，报告末列是每次迭代的平均纳秒数。编译链接 benchmark 与 pthread 后运行 ./bench --benchmark_filter=BM_xxx 即可只跑指定基准。', '自动定迭代数'],
      ['DoNotOptimize 防优化', '编译器会把结果不被使用的计算整段删掉，基准测到的只剩空循环。benchmark::DoNotOptimize(value) 把值当作可能被外部读取交给编译器，阻止死代码消除但保留寄存器传递；benchmark::ClobberMemory() 声明内存可能被改写，阻止计算挪出循环。测函数耗时时这两类调用必须留在循环体内，缺一个结果就可能失真数倍。', '防死代码消除'],
      ['重复测量与聚合', '单次测量受频率漂移与缓存状态影响，--benchmark_repetitions=9 把同一基准重复九次，--benchmark_report_aggregates_only=true 时只输出均值、中位数与标准差的聚合行，逐次明细用 --benchmark_format=csv 导出后画分布图。标准差超过均值的百分之五就要怀疑环境噪声，先固定 CPU 频率再复测，而不是直接相信任何一次的数字。', '九轮看分布'],
      ['PauseTiming 边界与参数化', 'state.PauseTiming() 与 ResumeTiming() 把准备工作移出统计窗口，但每次切换引入同步开销，纳秒级操作里循环内逐次暂停可能比被测代码还贵，正确做法是循环外一次构造好数据。参数化在注册时写 BENCHMARK(BM_x)->Arg(64)->Arg(1024)，函数内用 state.range(0) 读取当前参数，可扫不同输入规模观察复杂度曲线。', '暂停有开销'],
      ['波动来源与对比纪律', '同一份代码两次运行相差一成很常见，来源包括 CPU 频率调节、页缓存冷热、同机其他进程抢占与代码布局变化。对比前后版本必须同机同条件同轮数，改进幅度小于测量噪声就不能宣称收益；把二进制放到频率固定的机器上、预热后连续测五轮取中位数，是最低限度的纪律，跨机器对比的数据一律不可信。', '跨机不可比'],
    ],
  },
  {
    name: 'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：perf、火焰图和缓存局部性',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已能在 Linux 终端编译运行 C++ 程序并使用常用命令行工具。',
    goal: '掌握 perf stat 读硬件计数器判断瓶颈类别、perf record -g 采样调用栈并生成火焰图的完整链路，理解缓存行与访问顺序对性能的影响，能用同一套采样流程验证优化前后的热点变化。',
    guidedPractice: '先跑 perf stat ./exe 记录 IPC 与 cache-misses 占比，再跑 perf record -g ./exe 与 perf report 找出自耗时最高的函数；随后对比按行与按列遍历二维大数组的两次 perf stat，把 L1 未命中数的差异抄进对照表。',
    independentPractice: '独立完成：对一个含明显热点的小型程序完成采样与火焰图，定位最宽的叶子函数，做一处局部性改写后在同机重复同样采样，产出前后两份火焰图与计数器对比数据，并写一段量化结论。',
    commonErrors: ['把火焰图横轴当成时间轴解读，实际方块按名称排序，宽度才代表采样占比，时间顺序不在横轴上。', '只看总耗时顺着调用链一路点进库函数，忽略真正该优化的是自耗时最高的叶子函数。'],
    sourceRefs: ['Clang Sanitizers Documentation. https://clang.llvm.org/docs/', 'Google Benchmark. https://github.com/google/benchmark'],
    steps: [
      ['perf stat 先看计数器', 'perf stat ./exe 一次性给出任务时钟、指令数、IPC、cache-misses 与 branch-misses 等硬件计数器，是定位瓶颈类型的第一步：IPC 很低说明 CPU 常在等内存或分支预测失败，cache-misses 占比高指向访存问题。默认事件不够时用 -e branch-misses,L1-dcache-load-misses 指定计数器；perf_event_paranoid 设为 2 时普通用户读不到硬件计数器，需要 root 或调低该值。', '先看计数器'],
      ['perf record -g 采样', 'perf record -g ./exe 按默认 4000 赫兹的频率周期性采样调用栈，开销可控；被测程序很短时用 -F 99 降到每秒 99 次进一步减小干扰，常驻服务可用 -p 加进程号在线采样。采样结束后用 perf report 查看按自耗时排序的热点列表，perf script 导出带调用栈的原始样本，它是生成火焰图必需的中间格式，编译时加 -g 才能解出函数名。', '默认四千赫兹'],
      ['火焰图生成与解读', '把 perf script 的输出依次经过 stackcollapse-perf.pl 与 flamegraph.pl 两个脚本得到火焰图，每个方块是一次调用栈的聚合，宽度正比于采样命中次数，纵向自底向上是被调方向。顶部最宽的方块即热点，注意横轴按名称排序并不表示时间顺序，扁平宽大的叶子函数比深调用链更值得先处理，颜色本身无含义只用于区分层级。', '宽块即热点'],
      ['缓存行与访问局部性', '缓存以 64 字节缓存行为单位载入，按行优先连续遍历二维数组时预取命中率极高，按列跳跃访问每次换行都触发新的缓存行载入，未命中成倍增加。用 perf stat 对比两种遍历的 L1-dcache-load-misses 即可量化差距；把常一起访问的字段排进同一缓存行、把热数据与冷数据分拆到不同结构体，是最典型的局部性改法。', '行优先更快'],
      ['热点定位闭环', '诊断顺序是先用 perf stat 判断瓶颈类别，再用 perf record -g 拿到调用栈，画火焰图定位最宽方块，改完后在同一台机器重复同样的采样流程，对比前后两份火焰图与计数器数据。优化只针对自耗时显著且可改动的函数，避免顺着总耗时一路点进库函数白费功夫；每轮改动单独测一次，多个优化混在一起会分不清各自贡献。', '一轮一改动'],
    ],
  },
  {
    name: 'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：core dump、符号化和版本追踪',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已了解 gdb 断点调试的基本操作并能在 Linux 下编译程序。',
    goal: '掌握从内核落盘 core dump 到 gdb 加载分析并回溯调用栈的完整流程，理解调试符号的剥离与单独归档方式，会用 build-id 把 core 与精确版本的二进制对上号，并知道信号栈兜底的适用边界。',
    guidedPractice: '用 ulimit -c unlimited 放开限制后运行一个故意解引用空指针的程序，找到落盘的 core 文件，执行 gdb ./exe core 用 bt 与 bt full 展开调用栈；再用 readelf -n 分别查看二进制与 core 的 build-id，把两串值抄下来比对。',
    independentPractice: '独立完成：构建一个剥离符号的发布版二进制并单独归档调试文件，人为制造崩溃后从 core 还原完整调用栈，用 addr2line 把报告里的崩溃地址翻译成源码行，整理成一份含版本号的崩溃分析记录。',
    commonErrors: ['拿另一个版本的二进制去开 core，栈帧对不上却硬解读，gdb 给出的 build-id 不匹配警告被直接忽略。', 'strip 后没有归档调试符号文件，崩溃发生时手里只剩地址，无法还原任何一行源码。'],
    sourceRefs: ['Clang Sanitizers Documentation. https://clang.llvm.org/docs/', 'Google Benchmark. https://github.com/google/benchmark'],
    steps: [
      ['打开 core dump', '进程崩溃时内核按当前限制决定是否落盘 core 文件，ulimit -c unlimited 解除大小限制，core 的路径与命名由 /proc/sys/kernel/core_pattern 决定，默认常是当前目录下的 core 或 core.进程号；systemd 发行版通常改为经 systemd-coredump 压缩存放在 /var/lib/systemd/coredump，用 coredumpctl list 查询历史并可用 coredumpctl dump 取回分析。', '限制与路径'],
      ['gdb exe core', '拿到 core 后执行 gdb ./exe core 加载，bt 打印崩溃线程的调用栈，bt full 额外展开每帧的局部变量与参数值，info threads 列出全部线程，thread apply all bt 对多线程死因尤其关键。栈帧之间用 frame N 切换后用 print 查看变量，前提是二进制带 -g 编译出的调试信息，否则只能看到地址与库内偏移。', 'bt 全展开'],
      ['符号剥离与还原', '发布版常用 strip 剥掉符号缩小体积，正确做法是先用 objcopy --only-keep-debug 生成单独的调试文件再剥离主程序，排查时把两份文件都带上，gdb 里加载即可恢复完整栈。对已知的崩溃地址，addr2line -e ./exe -f -C 0x地址 能直接给出函数名与源码行号，前提是保留了 -g 编译产物或对应的符号文件。', '剥离留符号'],
      ['build-id 版本追踪', 'GNU build-id 在链接时按内容生成，readelf -n ./exe 可查看；gdb 加载 core 时会比对二进制与 core 内记录的 build-id，版本不匹配会明确警告，防止拿错版本的二进制分析出张冠李戴的调用栈。因此每次发布必须归档精确对应的二进制与调试符号，并在二进制里嵌入 git 提交号，崩溃报告只有落到具体版本才有意义。', 'build-id 对账'],
      ['现场增强与边界', 'glibc 提供 backtrace 与 backtrace_symbols，可在信号处理函数里打印当时的调用栈，链接时加 -rdynamic 才能解出函数名，这是拿不到 core 时的兜底手段。core 只保存崩溃瞬间的内存快照，不含历史执行轨迹，怀疑内存破坏时要叠加 ASan 复跑复现；分析多线程崩溃优先看所有线程的栈，再对比共享数据的访问路径。', '信号栈兜底'],
    ],
  },
  {
    name: 'C++ · Sanitizer、Benchmark、perf 与崩溃诊断：C++ 性能诊断报告',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已完成前五课的诊断实操并保存了自己的测量数据与火焰图。',
    goal: '把前五课的测量与证据整理成一份完整的性能诊断报告，掌握现象、数据、证据、改动、对比的五段结构，理解结论的统计强度与适用边界，能交付他人可按原样重跑验证的报告。',
    guidedPractice: '把自己此前一次优化的过程按五段结构重写：先列现象与量化指标，再补齐复现命令与环境清单，然后贴火焰图与计数器证据，最后给出前后各九轮的对比数据，逐段检查每个结论是否都挂着可验证的数字。',
    independentPractice: '独立完成：为一段真实代码产出一份诊断报告，包含一键复现脚本、环境记录、perf 与基准的原始数据导出文件、量化前后对比与明确的适用边界声明，交由同伴按报告重跑并核对数字是否一致。',
    commonErrors: ['报告只写结论不附复现命令与原始数据，他人无法验证，半年后自己也复现不出当时的数字。', '一次改动里混入多个优化点，前后对比无法归因，说不清收益到底来自其中哪一项。'],
    sourceRefs: ['Clang Sanitizers Documentation. https://clang.llvm.org/docs/', 'Google Benchmark. https://github.com/google/benchmark'],
    steps: [
      ['报告的五段结构', '性能诊断报告固定五段：现象与量化指标、复现命令与数据采集过程、瓶颈定位证据、改动内容、前后对比数据。每条结论都必须挂着可验证的数据，例如 cache-misses 降到多少、ns/op 下降百分之几，缺少数字支撑的快慢表述不构成结论；定位证据优先给火焰图与计数器读数，让读者能顺着证据复核出同一结论。', '结论挂数据'],
      ['环境固定与采集清单', '动手采集前先记录环境：CPU 型号与核数、是否固定频率、内核版本、编译器版本与全部编译开关、代码的 git 提交号。采集按固定顺序执行 perf stat 判断类别、perf record -g 拿调用栈、基准以 --benchmark_repetitions=9 采分布，全部命令原样写进报告，任何人按清单重跑应得到同量级的数据，偏差过大要先查环境差异。', '先固环境'],
      ['结论强度与因果', '单次测量不能支撑结论，至少五轮重复并报告中位数与波动区间，改进幅度小于波动区间就如实标注为噪声内不可分辨。因果要靠控制变量建立：一次只改一个因素，其余条件不变，前后对比才有解释力；页缓存预热、分支预测器状态等混杂因素要在采集流程里消除或明确说明，报告必须列出尚未排除的替代解释。', '噪声内不算'],
      ['可复现性是硬指标', '报告要附一个可一键执行的入口：固定版本的输入数据、构建脚本、采集脚本与绘图脚本，命令可直接复制运行。基准结果同时导出 csv 原始值与聚合值，火焰图与 perf report 的文本输出一并归档，关键改动记录对应的 commit 区间，半年后仍能检出当时的代码重新测量，这是报告区别于口头结论的硬指标。', '一键可复现'],
      ['汇报口径与边界', '面向决策的汇报保留三层：瓶颈是什么、改了什么、收益多少，全部用数字表达，例如 P95 延迟从多少毫秒降到多少毫秒、基准均值下降百分比及其波动区间。同时明确列出适用边界：结论只在同机同负载成立、未测更大数据规模、已知风险与回滚方式，把下一步建议写成可执行的实验设计，而不是泛泛的继续观察。', '三层留边界'],
    ],
  },
];

// ── X6 STL/Asio 源码与高性能毕业项目 ─────────────────────────────────────────────
export const HANDWRITTEN_CPP_PERFORMANCE_X6_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C++ · STL/Asio 源码与高性能毕业项目：libstdc++/libc++ 的 vector 实现',
    track: 'P14 · 独立语言课程',
    minutes: 40,
    prerequisite: '学员已能用 STL 容器完成常见算法题并了解模板基本语法。',
    goal: '本课学会 vector 在两大标准库实现里的真实内存布局与扩容机制，能说明 libstdc++ 三指针设计与 libc++ 压缩对存储的差异，并掌握迭代器失效与异常安全的判定依据。',
    guidedPractice: '现场用 gdb 加载一个含 vector<int> 的程序，在 push_back 处下断点，用 x/3gx 查看 _M_start、_M_finish、_M_end_of_storage 三个指针，对照 size 与 capacity 的输出；再连续插入元素让容量从 1 翻到 8，记录每次分配地址的变化。',
    independentPractice: '独立完成：写程序重载全局 operator new 统计 vector 扩容时的分配次数与字节数，验证翻倍序列 1、2、4、8；再实现 reserve 预分配版与朴素 push_back 版对比，把两版的分配次数与耗时整理成表。',
    commonErrors: ['以为 erase 只删除元素不移动内存，结果后面所有迭代器都已失效还继续解引用旧地址。', '循环删除元素时把 erase 写成 it++，跳过紧邻元素并可能在末尾越界，正确写法是接收 erase 的返回迭代器。'],
    sourceRefs: ['LLVM libcxx. https://github.com/llvm/llvm-project/tree/main/libcxx', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['三指针内存布局', 'libstdc++ 的 vector 在 _Vector_base 中只保存 _M_start、_M_finish、_M_end_of_storage 三个指针：起点、尾后与容量末端，size 是前两个指针之差，capacity 是首尾之差，64 位平台 sizeof 恒为 24 字节。libc++ 用 __begin_ 与 __end_ 加一个压缩对存放容量端，布局等价。用 gdb 的 x/3gx 命令查看这组指针，可当场验证 size 与 capacity 的计算方式。', '三指针定边界'],
      ['push_back 与几何扩容', 'libstdc++ 在容量不足时转入 _M_realloc_insert，新容量按 max(两倍当前容量, 1) 计算，几何级数翻倍使单次 push_back 摊还为常数时间；libc++ 的 __push_back_slow_path 采用接近两倍的增长策略。扩容流程是分配新块、搬移或拷贝旧元素、释放旧块：移动构造标记 noexcept 时走搬移，否则为保强异常安全退化为拷贝，原 vector 在异常时保持不变。', '翻倍摊还常数'],
      ['迭代器失效规则', '任何引起扩容的插入会使全部迭代器、指针与引用失效，因为底层内存整体迁移到新块；中间 insert 或 erase 只使该点之后的迭代器失效，之前的仍然有效；reserve 只扩容量不改 size，resize 改 size 并补零值或截断元素。erase 返回指向被删元素之后位置的迭代器，循环删除必须接收这个返回值，写成 it++ 会跳过元素并可能越过有效范围。', '扩容全部失效'],
      ['空基类优化', '自定义分配器与元素同存会白白多占字节，libc++ 把 allocator 放进 __compressed_pair，libstdc++ 让 _Vector_base 私有继承 allocator，两者都依赖空基类优化：空类型作为基类不占对象存储空间。在主流 64 位实现上 static_assert(sizeof(vector<int>) == 24) 成立，无状态分配器因此做到零开销，这也是标准允许 allocator 默认构造即可用的原因之一。', '空基类不占空间'],
      ['reserve 与 shrink_to_fit', 'reserve(n) 只保证 capacity 不小于 n，一次到位可避免反复搬移，插入十万元素前先 reserve 能把分配次数从约 17 次降到 1 次；shrink_to_fit 是非绑定请求，实现可以拒绝：libstdc++ 重新分配恰好大小的内存并搬移元素，libc++ 直接释放多余尾部。两者都不改变元素值只动内存，在 gdb 里观察 _M_start 指针的变化即可验证行为差异。', '预分配降分配次数'],
    ],
  },
  {
    name: 'C++ · STL/Asio 源码与高性能毕业项目：shared_ptr 控制块与原子引用计数',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已掌握 RAII 与移动语义，能解释 shared_ptr 的基本用法。',
    goal: '本课学会 shared_ptr 控制块的真实布局与强弱双计数语义，能说明原子递增用 relaxed 序、递减用 release 序的原因，掌握 make_shared 单次分配的取舍与循环引用的破解方法。',
    guidedPractice: '现场构造两个互相持有 shared_ptr 的对象，运行观察两个析构函数都不执行；把其中一侧改成 weak_ptr 后重跑，用日志确认对象先析构、控制块后释放，再用 AddressSanitizer 或 valgrind 验证泄漏确实消失。',
    independentPractice: '独立完成：实现带日志的引用计数包装，在拷贝递增、析构递减、归零三个时机打印计数与线程 id，多线程并发拷贝同一 shared_ptr 一万次，检查日志中递减次序与析构时机是否符合双计数规则。',
    commonErrors: ['把同一个裸指针交给两个独立的 shared_ptr，产生两个控制块，双重析构直接崩溃。', '用 expired 探测后立刻解引用 weak_ptr，探测与使用之间对象可能已被其他线程销毁，应改用 lock。'],
    sourceRefs: ['LLVM libcxx. https://github.com/llvm/llvm-project/tree/main/libcxx', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['控制块双计数', '每个被 shared_ptr 管理的对象背后有一个控制块，至少包含强引用计数与弱引用计数两个原子整数，外加删除器与分配器。对象销毁由强计数决定：最后一个强引用归零时立刻析构对象本体；控制块内存由弱计数决定：最后一个弱引用归零时才释放控制块。weak_ptr 正是靠这套双计数在不延长对象生命的前提下探测存活状态。', '强计数管对象'],
      ['原子引用计数', '计数增减全部走原子操作：拷贝构造时的递增可用 relaxed 内存序，因为它只依赖对象此刻仍存活这一事实；析构里的递减必须用 acquire-release 序，最后一个执行递减的线程要看到其他线程对该对象的全部操作后才能安全析构。libstdc++ 的 _Sp_counted_base 用原子加与原字节交换实现这套语义，但多线程同时读写共享对象本身仍需外部同步。', '递减用释放序'],
      ['make_shared 单次分配', 'make_shared 把对象本体与控制块放进同一块连续内存，一次分配替代 shared_ptr 加 new 的两次分配，还省去一次指针跳转，缓存局部性更好。代价是只要还有 weak_ptr 存活，整块内存连对象部分都不能释放，大对象加长寿命 weak_ptr 会延迟内存回收；需要按对象粒度及时释放时，退回两次分配的显式构造。', '一块内存两用'],
      ['循环引用与 weak_ptr', '两个对象各持对方 shared_ptr 时强计数永远大于零，控制块永不销毁，这是典型内存泄漏；把其中一侧改成 weak_ptr 即可打破环路。weak_ptr 使用前必须 lock 提升为 shared_ptr，对象已销毁时 lock 返回空指针；expired 只做瞬时探测，探测与解引用之间存在竞争窗口。enable_shared_from_this 让成员函数内通过 shared_from_this 安全取得自身所有权。', 'weak 打破环路'],
      ['控制块的生成时机', '控制块并非随对象而生：shared_ptr 加 new 在构造时创建控制块，make_shared 同时创建，由 weak_ptr 或第二个 shared_ptr 升级时不产生新块而是共享已有块。同一裸指针交给两个互不相干的 shared_ptr 会造出两个控制块，双重析构直接崩溃；unique_ptr 转 shared_ptr 只能移交不能拷贝，release 后立即构造是唯一安全路径。', '一指针一块'],
    ],
  },
  {
    name: 'C++ · STL/Asio 源码与高性能毕业项目：Asio reactor、executor 和 strand',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已用 Asio 写过同步 TCP echo 服务并了解回调写法。',
    goal: '本课学会 io_context 事件循环与 epoll_reactor 后端的协作机制，掌握 post、dispatch、defer 三种投递语义的差别，能用 strand 在多线程 run 下构建免互斥锁的串行化模型。',
    guidedPractice: '现场起一个多线程 io_context 服务，post 十万个轻量回调观察各线程的执行分布；再给共享计数器分别套 mutex 与 strand 两种写法压测对比，记录两种方案的吞吐差异与代码改动点。',
    independentPractice: '独立交付：实现带 strand 串行化的 TCP 会话类，读写回调全部经 bind_executor 提交，多线程 run 下用数据竞争检测工具验证无竞争，并附一条定时器取消时处理 operation_aborted 的路径。',
    commonErrors: ['只在主线程调用一次 io_context 的 run，没有线程继续投递任务，事件循环提前返回导致服务假死。', '同一连接的读回调与写回调分别提交到不同线程却没套 strand，共享缓冲区产生数据竞争。'],
    sourceRefs: ['LLVM libcxx. https://github.com/llvm/llvm-project/tree/main/libcxx', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['io_context 与事件循环', 'io_context 是 Asio 的调度核心，run 驱动事件循环：先让 epoll_reactor 调 epoll_wait 等待就绪事件，再逐个执行到期定时器与完成回调，全部任务做完且没有注册中的监听事件时 run 立即返回，后台线程随之退出。多个线程各自调用 run 才能并行消费任务；make_work_guard 创建 work 对象可阻止空转返回，让服务在无任务时保持待命。', '无任务即返回'],
      ['epoll_reactor 后端', 'Linux 默认实现是 epoll_reactor：async_read 之类操作先把描述符注册进 epoll 兴趣列表，epoll_wait 返回就绪后把回调排入 io_context 队列，由某个 run 线程取用。Asio 新版支持 io_uring 后端，定义 ASIO_HAS_IO_URING 并把 io_uring 对象传给 io_context 构造即可切换，io_uring 以提交队列批量化系统调用减少上下文切换，但完成语义与 epoll 并不完全一致。', 'epoll 等就绪'],
      ['post dispatch defer', '向 io_context 投递函数有三个入口：post 一定把回调排进队列等事件循环取用；dispatch 若当前线程已在该 io_context 中则直接执行，否则等价于 post；defer 排队但提示不必立刻执行。回调里再用 post 投递下一步能避免深递归耗尽栈；在 io_context 线程之外调用 dispatch 不会立即执行，只能等事件循环取用。', '同线程才直跑'],
      ['strand 串行化', '多个线程同时调用 run 时，同一 TCP 连接的读写回调可能并行执行，共享状态产生数据竞争。strand 把包进来的回调串行化：同一 strand 内的 handler 永远不会并发运行，无需互斥锁。官方推荐做法是给每个连接建一个 strand，回调一律用 bind_executor 提交，这样共享缓冲区与状态只在单线程语境里被访问，锁的开销与遗漏风险同时消除。', 'strand 免锁串行'],
      ['定时器与组合操作', 'steady_timer 基于 steady_clock 计时，不受系统时间跳变影响，async_wait 注册到期回调，cancel 触发回调携带 operation_aborted 错误码。组合操作 async_read 内部循环投递 async_read_some 直到读满或出错，中途取消要靠 cancellation signal；回调里必须先检查 error code 再使用数据，否则失败路径直接解引用空缓冲导致崩溃。', '先查错误码再用'],
    ],
  },
  {
    name: 'C++ · STL/Asio 源码与高性能毕业项目：源代码锚点、调用链和实验',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已能编译运行 C++ 项目并使用 gdb 设置断点。',
    goal: '本课学会在 libc++ 与 libstdc++ 源码里定位函数定义、逐跳追踪调用链，能用 nm、gdb 与最小实验坐实每条结论，最终产出一份带文件与行号的源码锚点清单。',
    guidedPractice: '现场从 libc++ 的 push_back 入口逐跳走到 allocator，把每跳的文件、函数与行号抄成调用链清单；再用 gdb 的 info line 验证清单，用 nm -C 找出 push_back 的实例化符号，逐条核对。',
    independentPractice: '独立交付：为 shared_ptr 控制块整理一份锚点清单，覆盖强计数递增、递减与销毁三处，每条附文件与行号；用最小实验验证递减发生在最后一个拷贝析构的线程，实验代码随清单一起归档。',
    commonErrors: ['只记结论不记文件与行号，被追问某一跳时翻不回源码现场，链条断裂。', '把模板声明当成实际实现，忽视了只有实例化后才产出代码，nm 里找不到对应符号。'],
    sourceRefs: ['LLVM libcxx. https://github.com/llvm/llvm-project/tree/main/libcxx', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['定位源码锚点', '源码阅读从锚点起步：libc++ 的 vector 定义在 libcxx/include/vector，push_back 容量不足时委托 __push_back_slow_path；libstdc++ 的实现主体在 libstdc++-v3/include/bits/vector.tcc。用 clangd 或 ctags 让编辑器跳到定义，编译时加头文件搜索路径指向源码目录，gdb 里用 info line 查询成员函数可直接输出实现所在的文件与行号。', '先找到定义行'],
      ['追一条完整调用链', '从用户一行 push_back 出发追到底：libc++ 路径是 push_back 检查尾指针是否到达容量端，不足则转 __push_back_slow_path，经 allocator_traits 调 allocate、搬移旧元素、再 deallocate 释放旧块；libstdc++ 对应 _M_realloc_insert。把每一跳的文件与函数名记成链，链上每个环节都要能指到具体行号，不能凭印象转述。', '一跳一跳追'],
      ['看模板实例化', '模板只有被实例化才产出代码：nm -C 加 grep 能在目标文件里找到 push_back 的实例化符号；godbolt 在线把 C++ 标准与优化等级逐档切换，右侧汇编里直接观察扩容分支与内存搬运指令。编译报错时设置 -ftemplate-backtrace-limit=0 可打印完整的模板嵌套链，便于定位是哪一层实例化触发了错误。', '符号里找实例'],
      ['写最小实验验证', '锚点与调用链要靠实验坐实：sizeof(vector<int>) 在 64 位 libstdc++ 上输出 24，对应三个指针；重载全局 operator new 统计扩容时的分配次数，验证翻倍序列；gdb 在 _M_realloc_insert 下断点，用 bt 打印调用栈与推演的调用链对照，两处不一致时以汇编与实验输出为准，修正清单后再继续。', '实验坐实结论'],
      ['锚点清单留档', '读源码的产出是一份锚点清单：每条包含库名、文件路径、函数名、行号与一句话机制说明，例如 libc++ vector 扩容锚点在 include/vector 的 __push_back_slow_path。清单按调用链顺序排列，复述时能从入口函数一路走到 allocator，中途任何一跳都要能翻回对应文件现场指认，避免只记结论不记路径。', '锚点清单留档'],
    ],
  },
  {
    name: 'C++ · STL/Asio 源码与高性能毕业项目：容量、故障、镜像和运行手册',
    track: 'P14 · 独立语言课程',
    minutes: 40,
    prerequisite: '学员已完成一个可运行的 Asio 服务雏形并压测过基本吞吐。',
    goal: '本课学会从单连接内存与描述符上限倒推服务容量，建立故障模式清单与压测水位线，设计快照加日志的双层镜像方案，并产出一份带判定与处置命令的运行手册。',
    guidedPractice: '现场给服务加连接数、内存、写缓冲三个水位配置，用 wrk 把并发压到水位线附近，观察拒绝日志与 ss 的连接曲线；再手动制造描述符耗尽故障，记录 EMFILE 在回调路径上的实际表现。',
    independentPractice: '独立交付：为服务写一份含故障判定与处置命令两栏的运行手册，覆盖描述符耗尽、线程退出、内存耗尽三种场景；按手册从零启动、注入故障、恢复服务走一遍全程，把每条命令输出贴进手册附录。',
    commonErrors: ['async_accept 回调收到 EMFILE 后既不处理也不停止监听，事件循环空转占满 CPU。', '只备份快照不保留增量日志，两次快照之间的数据在崩溃后全部丢失且无法补回。'],
    sourceRefs: ['LLVM libcxx. https://github.com/llvm/llvm-project/tree/main/libcxx', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['容量估算', '容量从单连接内存倒推：每连接读缓冲 64KiB 加写缓冲与对象开销约计 100KiB，一万并发连接就要约 1GiB 驻留内存；连接容器一次性 reserve 到规模上限，避免运行期 vector 搬移。描述符上限用 ulimit -n 查看并写进部署清单，上限 8192 的机器压到六千并发就该告警，还要给 epoll 与定时器本身留出描述符余量。', '按连接倒推内存'],
      ['故障模式清单', '常见故障按层列出：描述符耗尽时 accept 返回 EMFILE，错误出现在 async_accept 回调里，若不处理事件循环可能空转；io_context 线程因未捕获异常退出后 run 返回，服务假死但端口仍在监听；大流量下写缓冲无限增长触发内核内存回收。每条故障配观察命令：ss 看连接数，dmesg 查内核内存回收记录，journalctl 收集服务日志。', '逐条配观察命令'],
      ['压测与水位线', '压测用 wrk 或自写 Asio 客户端，固定并发跑六十秒取 p50 与 p99 延迟，扩容前后对比；给每连接写缓冲设上限水位，超过四 MiB 主动断开慢消费者，防止单连接拖垮整机。容量红线写进配置：连接数、内存占用、队列深度各设阈值，超线即拒绝新连接并记日志，而不是等内核内存回收机制随机杀进程。', 'p99 定水位'],
      ['镜像与备份', '状态数据的镜像分两层：内存快照定期落盘成文件，追加日志记录增量，恢复时先加载快照再重放日志到检查点；异地镜像用 rsync 或对象存储同步，同步周期与可容忍丢失窗口保持一致。用 mmap 写日志时注意 msync 的调用频率，崩溃窗口内未刷盘的记录就是实际丢失量；恢复演练按季度执行一次，验证备份可读可重放。', '快照加日志'],
      ['运行手册', '运行手册面向值班人员：启动命令、systemd 单元配置、优雅退出流程（收到终止信号先停止 accept 并排空写缓冲再退出事件循环）、重启后自检步骤逐条列出。故障处置写成判定与动作两栏：p99 超过两百毫秒先看连接数曲线，再抓热点函数定位；手册附每条命令的实际输出样例，值班时照抄即可执行。', '判定加动作两栏'],
    ],
  },
  {
    name: 'C++ · STL/Asio 源码与高性能毕业项目：C++ 高性能服务毕业项目与源码答辩',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已走读 STL 与 Asio 关键源码并具备完整压测数据。',
    goal: '本课完成一个 Asio 高并发服务的毕业项目交付：从最小版本基线到连接与内存设计，再到三组答辩数据与调用链讲解路径，最终能应对源码层面的随机追问并如实陈述项目边界。',
    guidedPractice: '现场按三层搭最小版本：io_context 池、连接类、echo 处理器，跑通后用 wrk 以八线程一千并发压六十秒，记下基线吞吐与 p99；随后把 echo 换成帧解析协议，重压一次并对照两份报告差异。',
    independentPractice: '独立交付：完成完整服务与答辩材料，材料含调用链讲解路径、三组压测数据、已知缺陷清单与边界说明；按十五分钟节奏预演一次答辩，重点准备 strand 生命周期、缓冲上限、连接回收三类追问。',
    commonErrors: ['优化结论没有基线数字支撑，答辩时被要求现场复测无法重现。', '回调里用裸指针捕获连接对象，连接关闭后回调仍被触发，解引用悬垂指针崩溃。'],
    sourceRefs: ['LLVM libcxx. https://github.com/llvm/llvm-project/tree/main/libcxx', 'Boost.Asio Documentation. https://www.boost.org/doc/libs/release/doc/html/boost_asio.html'],
    steps: [
      ['项目范围与基线', '毕业项目选一个 Asio 高并发 TCP 服务：连接管理、协议帧解析、可插拔业务处理三层，代码量控制在三千行以内保证每行都读过。交付顺序是能跑通的最小版本在前：io_context 池加 echo 回环，先压出基线吞吐与 p99 延迟记进档案，后续每个优化都对照基线报数，没有基线数字支撑的优化结论在答辩里一律不成立。', '先记基线数字'],
      ['连接与内存设计', '核心数据结构要能自答：连接类持有 socket、strand 与读写缓冲，读写缓冲用 vector 且一次性预留到水位上限，规避运行期扩容导致的迭代器失效；对象生命周期用 shared_ptr 配 enable_shared_from_this，回调捕获自身引用，连接关闭后靠弱计数确认控制块回收。替换 jemalloc 分配器后重跑压测，对比分配开销占比并留档。', '生命周期自证'],
      ['答辩必备数据', '答辩要备三组数据：吞吐与延迟随并发数变化的曲线、不同优化等级加链接时优化的差异、默认分配器与 jemalloc 的单次操作耗时对比。每条数据注明压测命令的完整参数与机器规格，性能采样工具抓出热点函数前五名，火焰图随材料提交；评审复测时按文档逐条命令应当能重现，数据来源不清的结论会被当场质疑。', '三组数据三份命令'],
      ['源码讲解路径', '源码答辩走调用链：从 async_accept 进入连接建立，到读回调触发帧解析器，再到 strand 提交业务回调，每个环节标注关键行号；用到的 STL 与 Asio 实现锚点一并附上，例如 epoll_reactor 注册描述符的位置。评审会随机指定链上一环要求现场展开，讲不出的环节按未掌握计，链路完整比功能数量更重要。', '沿调用链讲解'],
      ['边界与复盘', '结题材料如实写清边界：已验证的并发上限、未覆盖的故障场景、协议解析对粘包与半包的处理依据；已知缺陷逐条列出，例如写缓冲超限时对慢客户端的断连策略不够平滑。复盘记录每条设计决策的备选方案与放弃理由，例如为何选 strand 而非全局互斥锁；边界清晰的项目比包装完美的项目更经得起追问。', '边界如实列出'],
    ],
  },
];
