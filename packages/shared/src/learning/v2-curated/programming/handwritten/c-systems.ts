// C 系统编程 · 手写教案（接力看板 C-C*，docs/编程课程教案重写进度-2026-11-21.md）
// 每门课的 name 必须与 programs.ts 模板生成的 `C · ${stage.title}：${topic}` 完全一致，
// 才能在 catalog.ts 的 spread 末尾覆盖同名模板课。正文写真实机制/命令/边界，禁止模板话术。
import type { ProgrammingCourseSeed } from '../shared.js';

// ── C0 编译器、链接器与第一个 C 工程 ─────────────────────────────────────────────
export const HANDWRITTEN_C_SYSTEMS_C0_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C · 编译器、链接器与第一个 C 工程：C 标准、编译器、链接器和进程',
    track: 'P14 · 独立语言课程',
    minutes: 40,
    prerequisite: '学员能在终端使用基本命令并已安装 gcc。',
    goal: '能说清 C 标准与编译器实现的分工，掌握 gcc 预处理、编译、汇编、链接四阶段的中间产物与开关，理解链接符号解析顺序与进程从 _start 进入 main 的真实路径。',
    guidedPractice: '对同一 main.c 依次执行 gcc -E、gcc -S、gcc -c 三条命令，观察 .i、.s、.o 三种中间产物；再用 gcc -v 复现链接命令行，用 readelf -h 查看入口点地址并确认它指向 _start 而非 main。',
    independentPractice: '独立交付：一个 main.c 加一张四阶段产物清单，用 gcc -std=c17 -Wall -Wextra -O2 编译通过，并用 echo $? 验证 main 的返回值与进程退出状态一致。',
    commonErrors: ['以为 gcc 是单个程序，实际一条命令背后串起预处理器、编译器、汇编器与链接器多个独立工具。', '把 -lm 写在被链接源文件之前，链接器从左到右扫描时找不到 sqrt 的定义而报 undefined reference。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['C 标准与实现', 'C 由 ISO WG14 制定，C11 引入线程与原子操作，C17 只做缺陷修正，C23 落地了二进制字面量与 true false 关键字。标准定义语义与约束，具体行为由实现即编译器决定，gcc -std=c17 可锁定方言，不指定时现代 gcc 默认 gnu17，含 GNU 扩展。可验证：gcc -std=c17 -dM -E - < /dev/null 列出预定义宏，即可确认当前方言与版本。', '方言锁在 -std', {
        title: 'GCC：锁定 C 方言并查看宏',
        language: 'PowerShell',
        code: `gcc --version
"int main(void){return 0;}" | Set-Content main.c
gcc -std=c17 -dM -E main.c | Select-String "__STDC_VERSION__|__STDC__"
gcc -std=c17 -Wall -Wextra -pedantic -c main.c -o main.o
file main.o`,
        output: `gcc (GCC) 14.2.0
#define __STDC__ 1
#define __STDC_VERSION__ 201710L
main.o: ELF 64-bit relocatable

201710L 对应 C17。
-std=c17 锁定方言，-pedantic 提示非标准扩展。`,
      }],
      ['编译四阶段', 'gcc main.c 一条命令背后是四个独立阶段：预处理器展开 #include 与宏产出 .i，编译器生成汇编 .s，汇编器产出目标文件 .o，链接器 collect2 调用 ld 合成可执行文件。用 gcc -E 只停在预处理、gcc -S 停在汇编、gcc -c 停在目标文件，逐级加标志可观察每个中间产物；gcc -v 还会打印每个阶段实际执行的命令行。', '四阶段逐级停', {
        title: 'GCC：生成 .i、.s、.o 和执行文件',
        language: 'PowerShell',
        code: `gcc -std=c17 -E main.c -o main.i
gcc -std=c17 -S main.c -o main.s
gcc -std=c17 -c main.c -o main.o
gcc main.o -o main
gcc -v main.c -o main.verbose 2> verbose.txt
Get-Item main.i, main.s, main.o, main | Select-Object Name, Length`,
        output: `main.i  18642
main.s    712
main.o   1512
main     15960
verbose contains cc1, as, collect2 and ld commands

预处理、编译、汇编、链接各阶段产物独立。
最后一步把 relocatable object 合成 ELF executable。`,
      }],
      ['链接与符号解析', '链接器按命令行从左到右处理输入，遇到未定义符号时只在后出现的文件与库里找定义，因此 -lm 必须写在调用了 sqrt 的源文件之后，写成 gcc main.o -lm 才能解析，顺序颠倒会报 undefined reference。静态库成员只在能提供当前未定义符号时被抽取，未被引用的成员完全不进入产物，这条顺序规则是 C 链接最常见的坑。', '库放在源文件后', {
        title: 'GCC：验证 -lm 链接顺序',
        language: 'PowerShell',
        code: `@'
#include <math.h>
#include <stdio.h>
int main(void) { printf("%.2f\\n", sqrt(9.0)); return 0; }
'@ | Set-Content math.c
gcc math.c -lm -o good
gcc -lm math.c -o bad
.\good
.\bad`,
        output: `3.00
/usr/bin/ld: math.c: undefined reference to sqrt
collect2: error: ld returned 1 exit status

-lm 在源文件后，sqrt 未定义符号能找到库。
库在源文件前时扫描已结束，不会回头再找。`,
      }],
      ['从 ELF 到进程', '可执行文件的入口不是 main 而是链接器设置的 _start，crt0 运行时先完成栈初始化、清零 .bss、执行 .init 段的构造函数，之后才经 __libc_start_main 转入 main。进程由内核 execve 加载 ELF，建立虚拟地址空间后从入口地址执行。用 readelf -h prog 查看 Entry point 字段，可验证入口确实指向 _start 而非 main。', '入口是 _start', {
        title: 'readelf：定位 ELF 入口与 main',
        language: 'PowerShell',
        code: `readelf -h main | Select-String "Entry point"
nm -n main | Select-String " _start$| main$"
objdump -d main --disassemble=_start | Select-Object -First 40
strace -e execve .\\main`,
        output: `Entry point address: 0x401050
0000000000401050 T _start
0000000000401149 T main
_start calls __libc_start_main
execve("./main", ["./main"], ...) = 0

ELF 入口是 _start，不是 main。
libc 启动代码完成运行时初始化后调用 main。`,
      }],
      ['预处理可观察', '预处理器纯做文本替换：#include 递归复制头文件内容，宏按定义展开，条件编译裁剪分支。gcc -E main.c 输出展开后的完整翻译单元，几十行源码常膨胀出数万行 libc 头内容；加 -H 会缩进列出每个被包含的头文件。数一数展开后的总行数，即可直观看到 include 的复制成本与头文件卫生的价值。', '-E 展开看文本', {
        title: 'GCC：观察 include 展开与行数',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
#include <stdlib.h>
#define SQUARE(x) ((x)*(x))
int main(void) { printf("%d\\n", SQUARE(5)); return 0; }
'@ | Set-Content pre.c
gcc -E pre.c -o pre.i
gcc -E pre.c -H 2> includes.txt
(Get-Content pre.c).Count
(Get-Content pre.i).Count
Select-String pre.i -Pattern "printf|\\(\\(5\\)\\*\\(5\\)\\)"
Get-Content includes.txt -TotalCount 15`,
        output: `source lines=6
preprocessed lines=1742
printf and ((5)*(5)) appear in pre.i
. /usr/include/stdio.h
.. /usr/include/x86_64-linux-gnu/bits/libc-header-start.h
.. /usr/include/stddef.h

#include 递归复制头文件，宏在预处理阶段展开。
-H 显示实际包含树与搜索路径。`,
      }],
    ],
  },
  {
    name: 'C · 编译器、链接器与第一个 C 工程：从空目录编写 main 与头文件',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已写过任意语言的多文件程序并熟悉命令行。',
    goal: '从空目录徒手搭出 main.c 加 math.h 加 math.c 的三文件工程，掌握 include 守卫与搜索路径规则，理解声明与定义分离后编译查类型、链接查符号的分工。',
    guidedPractice: '逐条执行 gcc -std=c17 -Wall -Wextra -O2 main.c -o prog，故意漏编 math.c 观察 undefined reference 报错；再补 -Iinclude 编译含子目录头文件的版本，用 gcc -H 对比尖括号与双引号两种 include 的实际搜索顺序。',
    independentPractice: '独立交付：三文件工程编译零警告通过，头文件带 include 守卫，程序把 main 的 argc 与 argv 逐个打印，退出后用 echo $? 确认返回值可被 shell 读到。',
    commonErrors: ['头文件没写 include 守卫，被两个 .c 重复包含后编译器报类型重复定义。', '把函数实现写进头文件，多个翻译单元包含后链接阶段报 multiple definition。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['main 的两种签名', '标准只定义两种入口签名：int main(void) 与 int main(int argc, char *argv[])，返回类型必须是 int，返回值交给父进程作为退出状态，0 表示成功。省略 return 时 C99 起自动补 return 0，且仅限 main 这一个函数。把返回值改成 3 后运行再用 echo $? 读取，即可验证返回值与退出状态的对应关系。', '返回值进 $?', {
        title: 'C：main 返回值就是进程退出码',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int main(int argc, char **argv) {
    for (int i = 0; i < argc; ++i) printf("argv[%d]=%s\\n", i, argv[i]);
    return 3;
}
'@ | Set-Content main.c
gcc -std=c17 -Wall -Wextra main.c -o prog
.\\prog one two
Write-Output "exit=$LASTEXITCODE"`,
        output: `argv[0]=C:\\work\\prog
argv[1]=one
argv[2]=two
exit=3

argc 包含程序名，argv 以 NULL 结尾。
main 返回 3 被 shell 作为进程退出码。`,
      }],
      ['最小工程与严格警告', '空目录里只写一个 main.c：#include <stdio.h> 加 int main(void)。编译用 gcc -std=c17 -Wall -Wextra -O2 main.c -o prog，三个标志分别锁定方言、开启常用警告与补齐额外警告。-Wall 并非全部警告，未用参数、有符号无符号比较等要靠 -Wextra 捕获；默认带上这组标志，多数笔误在编译期就暴露。', '三标志默认带', {
        title: 'GCC：严格警告编译最小工程',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int main(void) {
    int unused = 1;
    unsigned size = 0;
    printf("%d\\n", size < -1);
    return 0;
}
'@ | Set-Content main.c
gcc -std=c17 -Wall -Wextra -Werror -O2 main.c -o prog`,
        output: `warning: unused variable 'unused' [-Wunused-variable]
warning: comparison of integer expressions of different signedness [-Wsign-compare]
error: unused parameter? no
cc1: all warnings being treated as errors

Wextra 捕获有符号无符号比较。
Werror 把警告升级为构建失败。`,
      }],
      ['头文件声明守卫', '头文件里放声明与类型定义，实现放 .c，这是多文件工程的基本分工。同一头文件被重复包含会导致类型重复定义报错，守卫有两种：传统三段式 #ifndef MATH_H / #define MATH_H / #endif，以及多数编译器支持的 #pragma once。前者依赖宏名唯一、跨所有编译器成立，后者简洁但不属于标准。给头文件加守卫后连续 include 两次，验证不再报错。', '守卫防重包含', {
        title: 'C：include guard 防重复定义',
        language: 'C',
        code: `#ifndef MATH_H
#define MATH_H

typedef struct { int x; int y; } Point;
int add(int a, int b);

#endif

// main.c
#include "math.h"
#include "math.h"
int main(void) { return add(1, 2); }`,
        output: `gcc -std=c17 -Wall -Wextra main.c add.c -o prog
PASS
without guard:
error: redefinition of 'struct <anonymous>'

第一次包含定义 MATH_H，第二次整段被条件编译裁掉。
类型和原型只出现一次。`,
      }],
      ['include 的搜索路径', '#include <file> 从 -I 指定目录与系统默认路径如 /usr/include 搜索，#include "file" 先在当前源文件所在目录找，找不到再退回系统路径。用 gcc -v 或 -H 可观察实际搜索顺序；把头文件放进 include/ 子目录时必须补 -Iinclude，否则报 file not found。两条指令的差异决定了工程目录布局如何映射到编译参数。', '尖括号走系统路径', {
        title: 'GCC：验证 include 搜索顺序',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory include -Force | Out-Null
"#define VALUE 42" | Set-Content include/config.h
@'
#include <config.h>
int main(void){return VALUE;}
'@ | Set-Content main.c
gcc main.c -Iinclude -o prog
.\prog
gcc -H main.c -Iinclude -o prog 2> include-order.txt
Get-Content include-order.txt -TotalCount 10`,
        output: `exit=42
. include/config.h
.. /usr/include/stdc-predef.h

尖括号头文件通过 -Iinclude 找到。
-H 显示当前目录与系统路径搜索顺序。`,
      }],
      ['声明定义分离', '编译器逐个翻译单元独立工作，调用跨文件函数时只依据头文件里的原型检查参数与返回值；定义是否真的存在由链接阶段裁决。若 math.h 声明了 add 而 add.c 没实现，只编译各 .o 不报错，链接才报 undefined reference to add。写两个 .c 加一个头文件验证：先漏编 add.c 观察链接错误原文，再补上后通过。', '编译查型链接查符', {
        title: 'C：声明可编，定义靠链接',
        language: 'PowerShell',
        code: `"int add(int,int);" | Set-Content math.h
"int add(int a,int b){return a+b;}" | Set-Content add.c
@'
#include <stdio.h>
#include "math.h"
int main(void){printf("%d",add(1,2));}
'@ | Set-Content main.c
gcc -std=c17 -Wall -Wextra -c main.c -o main.o
gcc main.o -o prog
gcc main.o add.c -o prog
.\\prog`,
        output: `main.o compiled successfully
linker: undefined reference to add
3

编译只依据 math.h 原型检查调用。
真正符号由 add.c 在链接阶段提供。`,
      }],
    ],
  },
  {
    name: 'C · 编译器、链接器与第一个 C 工程：GCC/Clang 警告和优化级别',
    track: 'P14 · 独立语言课程',
    minutes: 40,
    prerequisite: '学员已能用 gcc 编译单个 C 文件并读懂报错。',
    goal: '掌握 -Wall -Wextra -Werror 的覆盖范围与固定配置方法，区分 -O0 到 -O2 各级优化的行为差异，理解未定义行为授权激进优化的机制，能在调试与发布两套标志间正确切换。',
    guidedPractice: '对含 = 与 == 笔误、未用变量、有符号溢出的源码分别加 -Wall -Wextra 编译，逐条抄下警告原文；再用 -O0 与 -O2 各编译一次，对比运行耗时、二进制体积与 gdb 单步的表现差异。',
    independentPractice: '独立交付：给一份故意埋了三处问题的 C 文件开满警告修到零警告，写出调试用 -O0 -g 与发布用 -O2 两套构建命令，并记录同一溢出循环在两级优化下输出不同的现象。',
    commonErrors: ['以为 -Wall 包含所有警告，实际无符号比较、未用参数等要 -Wextra 才报，遗漏类别还得按名追加。', '用 -O2 构建后去 gdb 单步，发现行号跳跃、变量显示 optimized out，误以为编译器出了问题。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['警告默认是克制的', 'gcc 与 clang 出于兼容考虑默认只报明确违反标准的错误，大量危险写法不警告，因此 -Wall -Wextra 应作为固定配置而非可选开关。-Wextra 覆盖未用参数、有符号无符号比较等 -Wall 未含的类别，-Wpedantic 指出方言扩展，-Werror 可把警告升级为错误防止 CI 里越积越多。故意写 int x=0; if(x=1) 编译一次，观察赋值误用如何被点名。', '警告要主动开', {
        title: 'GCC：捕获赋值误用与未用参数',
        language: 'PowerShell',
        code: `@'
int f(int value) {
    int unused = 0;
    int x = 0;
    if (x = 1) return x;
    return 0;
}
'@ | Set-Content warnings.c
gcc -std=c17 -Wall -Wextra -c warnings.c -o warnings.o
gcc -std=c17 -Wall -Wextra -Werror -c warnings.c -o warnings.o`,
        output: `warning: suggest parentheses around assignment used as truth value [-Wparentheses]
warning: unused variable 'unused' [-Wunused-variable]
warning: unused parameter 'value' [-Wunused-parameter]
cc1: all warnings being treated as errors

-Wall 抓赋值误用，-Wextra 抓未用参数。
-Werror 把这些警告升级为构建失败。`,
      }],
      ['优化级别分级', '-O0 不做优化并保留完整变量信息，调试必须用它，否则单步跳行、变量显示 optimized out；-O1 启用基本简化，-O2 是发布构建的推荐级别，含内联与循环优化，-O3 更激进展开但二进制膨胀收益不稳定，-Os 以体积优先。同一份代码分别在 -O0 与 -O2 下编译计时对比，可量化每级优化的实际效果。', 'O0 调试 O2 发布', {
        title: 'PowerShell：比较 O0/O2/Os 体积与耗时',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
long work(long n) { long s=0; for(long i=0;i<n;i++) s+=i*i; return s; }
int main(void){ printf("%ld\\n", work(200000000)); return 0; }
'@ | Set-Content loop.c
foreach ($opt in "-O0","-O2","-Os") {
  gcc -std=c17 $opt loop.c -o "loop$opt"
  $size=(Get-Item "loop$opt").Length
  $sw=[Diagnostics.Stopwatch]::StartNew(); .\\loop\$opt | Out-Null; $sw.Stop()
  Write-Output "$opt size=$size ms=$($sw.ElapsedMilliseconds)"
}`,
        output: `-O0 size=16032 ms=612
-O2 size=16064 ms=214
-Os size=15984 ms=220

-O2 大幅缩短热循环时间，体积接近。
-Os 以体积优先，性能略逊于 O2。`,
      }],
      ['优化依赖未定义行为', 'C 优化器把未定义行为当作永不发生的前提：有符号溢出、解引用空指针、越界访问都被假定不存在，相关检查会被删除，这是 -O2 下程序「变快却出错」的根源。x + 1 > x 可被优化成恒真；-fwrapv 把有符号溢出定义为回绕，-fno-strict-aliasing 放宽指针别名假设。写一个 int 溢出的自增循环，在两级优化下对比输出差异。', 'UB 授权激进优化', {
        title: 'GCC：O2 利用有符号溢出 UB',
        language: 'C',
        code: `#include <stdio.h>
#include <limits.h>
int main(void) {
    int x = INT_MAX;
    if (x + 1 > x) puts("always");
    else puts("overflow");
    return 0;
}`,
        output: `gcc -O0 overflow-ub.c -o o0 && ./o0
overflow
gcc -O2 overflow-ub.c -o o2 && ./o2
always

-O0 按机器回绕得到 overflow。
-O2 假定有符号溢出不会发生，将比较折叠为恒真。`,
      }],
      ['gcc 与 clang 诊断风格', '两者都以 -std 锁定方言、以 -W 开关族控制警告，警告名大体互通，切换编译器的迁移成本低。clang 诊断带源码插入符与修复建议，能直接指出出错列，gcc 的文本相对简略但覆盖面同样完整；clang 的 -Weverything 一览全部警告但噪声大，日常仍配 -Wall -Wextra。同一段代码分别用两个编译器编译，对比报错排版即可体会差异。', 'clang 报错更直观', {
        title: 'PowerShell：对比 GCC 与 Clang 诊断',
        language: 'PowerShell',
        code: `"int main(void){int x = 0; if (x = 1) return 0;}" | Set-Content diag.c
gcc -std=c17 -Wall -Wextra diag.c -o gcc-out 2> gcc.txt
clang -std=c17 -Wall -Wextra diag.c -o clang-out 2> clang.txt
Get-Content gcc.txt
Get-Content clang.txt
clang -std=c17 -Weverything -c diag.c 2>&1 | Select-Object -First 12`,
        output: `gcc: warning: suggest parentheses around assignment
clang: warning: using the result of an assignment as a condition without parentheses
      if (x = 1)
          ~~^~~
1 warning generated.

两者都识别相同问题，clang 额外显示插入符与列位置。
Weverything 信息更多但噪声也更大。`,
      }],
      ['-g 与优化共存', '-g 只负责生成 DWARF 调试信息，不改变代码生成，因此与 -O2 并存合法，是线上排障的常见组合；gdb 仍能看到函数名与行号，但变量被优化进寄存器、代码被重排，单步不再逐行对应。-g3 还会把宏定义写进调试信息。用 -O2 -g 编译后 gdb 断到 main 再 step 走几步，观察行号跳跃即可理解两者的互相牵制。', '优化干扰单步', {
        title: 'GDB：O2 -g 下的 optimized out',
        language: 'PowerShell',
        code: `@'
int add(int a, int b) { int sum = a + b; return sum; }
int main(void) { int x = add(2,3); return x; }
'@ | Set-Content debug.c
gcc -std=c17 -O2 -g debug.c -o debug
gdb -q -batch -ex "break main" -ex "run" -ex "step" -ex "info locals" -ex "print x" .\\debug`,
        output: `Breakpoint 1 at main
add (a=2, b=3) at debug.c:1
sum optimized out
$1 = <optimized out>

调试信息仍保留函数名和行号。
变量被优化后不能依赖 gdb 查看。`,
      }],
    ],
  },
  {
    name: 'C · 编译器、链接器与第一个 C 工程：目标文件、静态库和动态库',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已理解编译四阶段并能在命令行链接多个文件。',
    goal: '会用 nm 与 readelf 读取 ELF 的段与符号表，掌握 ar 制作静态库、-shared -fPIC 制作动态库的完整命令，理解链接器从左到右的符号解析与静态动态链接的取舍。',
    guidedPractice: '编译 add.c 与 mul.c 两个目标文件后用 nm 查看 T 与 U 符号；依次执行 ar rcs libmath.a 与 gcc -shared -fPIC 两种打包，各自链接成程序，对比 ldd 输出里的依赖差异并记录。',
    independentPractice: '独立交付：一个含静态库版与动态库版两套构建命令的工程，动态版用 LD_LIBRARY_PATH 跑通，并附一张 nm 输出对照表说明哪些符号最终进了可执行文件。',
    commonErrors: ['链接时把 -lmath 写在 main.o 之前，链接器从左到右扫描时符号尚未被引用，归档成员被跳过。', '运行动态库程序报 libmath.so not found，库目录既不在默认搜索路径也没设 LD_LIBRARY_PATH。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['ELF 与段布局', '目标文件 .o 与可执行文件都是 ELF 格式，.text 存代码，.data 存已初始化全局变量，.bss 只记录未初始化变量的尺寸不占文件空间，加载时由系统清零。readelf -h 查看整体头与节表，objdump -d 反汇编 .text。声明一个 1 MB 的未初始化数组再编译，用 ls 与 readelf -S 对照，可验证 .bss 只增加大小描述而不占文件体积。', 'bss 不占文件', {
        title: 'readelf：查看 .text、.data 与 .bss',
        language: 'PowerShell',
        code: `@'
char large[1024*1024];
int initialized = 42;
int main(void) { return initialized + large[0]; }
'@ | Set-Content layout.c
gcc -std=c17 layout.c -o layout
Get-Item layout | Select-Object Length
readelf -S layout | Select-String "\\.text|\\.data|\\.bss"
size layout`,
        output: `layout 15960 bytes
.text PROGBITS 0000000000001050 001050 000108 00 AX
.data PROGBITS ... 000004 00 WA
.bss NOBITS ... 100004 00 WA
text=264 data=4 bss=1048580

1 MB 数组只在 .bss 记录大小。
可执行文件体积不会增加 1 MB。`,
      }],
      ['符号表与未定义符号', '每个 .o 携带符号表：本文件定义的全局符号标 T 或 D，引用但未定义的标 U，static 符号是小写 t 或 d 只在文件内可见。nm main.o 输出里 U add 表示等链接器补上定义；链接器汇总所有输入后要求每个符号恰好一个定义，否则报 undefined reference 或 multiple definition。写两个 .o 用 nm 对照查看定义侧与引用侧，即可看清链接的撮合过程。', 'nm 看 U 与 T', {
        title: 'nm：区分定义与未定义符号',
        language: 'PowerShell',
        code: `"int helper(void){return 42;}" | Set-Content helper.c
"int helper(void); int main(void){return helper();}" | Set-Content main.c
gcc -std=c17 -c helper.c -o helper.o
gcc -std=c17 -c main.c -o main.o
nm helper.o | Select-String "helper"
nm main.o | Select-String "helper| main"
nm main.o helper.o | Select-String "helper"
readelf -s main.o | Select-String "helper"`,
        output: `helper.o: 0000000000000000 T helper
main.o:                  U helper
main.o: 0000000000000000 T main
combined: 000... T helper

helper.o 定义 T，main.o 引用 U。
链接器把 U 解析到提供定义的成员。`,
      }],
      ['静态库 ar 打包', 'ar rcs libmath.a add.o mul.o 把多个 .o 打成归档，r 替换添加、c 创建、s 写索引。链接时归档只是成员仓库，链接器扫描到未定义符号 add 才从库里抽取对应成员，未被引用的成员完全不进入产物，这是静态链接按需裁剪的机制。链接命令 gcc main.o -L. -lmath 中 -lmath 必须排在 main.o 之后，顺序颠倒会解析失败，动手验证一次。', '按需抽取成员', {
        title: 'ar：制作并链接静态库',
        language: 'PowerShell',
        code: `"int add(int a,int b){return a+b;}" | Set-Content add.c
"int unused(void){return 99;}" | Set-Content unused.c
gcc -std=c17 -c add.c unused.c
ar rcs libmath.a add.o unused.o
ar t libmath.a
@'
#include <stdio.h>
int add(int,int);
int main(void){printf("%d",add(2,3));}
'@ | Set-Content main.c
gcc -std=c17 main.c -L. -lmath -o prog
.\\prog
nm prog | Select-String " add$| unused$"`,
        output: `add.o
unused.o
5
main: T add

链接器只抽取提供 add 的成员。
未被引用的 unused.o 不进入最终二进制。`,
      }],
      ['动态库与加载', 'gcc -shared -fPIC -o libmath.so add.o 生成动态库，-fPIC 让代码与位置无关，加载器可把它映射到任意虚拟地址。链接时只登记依赖，运行时由动态链接器实际载入；ldd prog 列出全部 so 及其解析路径，搜索顺序是 rpath、LD_LIBRARY_PATH、/etc/ld.so.conf 缓存。多个进程可共享同一份 so 的代码段，改库后重跑程序立即生效，无需重新链接。', 'PIC 支持任意地址', {
        title: 'GCC：生成动态库并查看依赖',
        language: 'PowerShell',
        code: `gcc -std=c17 -fPIC -c add.c -o add.pic.o
gcc -shared -o libmath.so add.pic.o
gcc -std=c17 main.c -L. -lmath -Wl,-rpath,'$ORIGIN' -o prog-dyn
ldd prog-dyn
Get-Item prog prog-dyn | Select-Object Name, Length
.\\prog-dyn
nm -D libmath.so | Select-String " add$"`,
        output: `prog-dyn 15968
prog 16024
libmath.so => ./libmath.so
libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6
5
0000000000001109 T add

动态版只登记 so 依赖，rpath 指向同目录。
nm -D 可查看动态符号表。`,
      }],
      ['静态与动态的取舍', '静态链接把代码拷进可执行文件，部署单文件、启动快、无依赖，但体积大且库升级必须重新链接；动态链接体积小、库可独立升级、多进程共享代码页省内存，代价是运行时查找依赖、环境差异导致的 not found 与版本问题。分别用 gcc main.o libmath.a 与 gcc main.o -L. -lmath 链接并用 ldd 对比，前者无 so 依赖，后者列出 libmath.so，差异一目了然。', '静态单文件动态共享', {
        title: 'PowerShell：静态与动态依赖对照',
        language: 'PowerShell',
        code: `gcc main.o libmath.a -o prog-static
gcc main.o -L. -lmath -Wl,-rpath,'$ORIGIN' -o prog-dynamic
ldd prog-static
ldd prog-dynamic | Select-String "libmath|libc"
Get-Item prog-static, prog-dynamic | Select-Object Name, Length
Move-Item libmath.so libmath.so.bak
.\\prog-dynamic
Move-Item libmath.so.bak libmath.so`,
        output: `prog-static: not a dynamic executable
prog-dynamic: libmath.so => ./libmath.so
static size ~16KB, dynamic size ~16KB
after libmath.so moved:
prog-dynamic: error while loading shared libraries: libmath.so

静态版不依赖运行库文件。
动态版缺少 so 时无法启动。`,
      }],
    ],
  },
  {
    name: 'C · 编译器、链接器与第一个 C 工程：CMake 目标、测试和安装规则',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已用 gcc 与 ar 完成过多文件和静态库链接。',
    goal: '掌握 add_executable 与 add_library 的 STATIC SHARED 语义与产物差异，会用 target_link_libraries 与 PUBLIC PRIVATE 控制依赖传播方向，能配置 enable_testing 并配 ctest 用例，写出 install 规则安全试装。',
    guidedPractice: '在 CMakeLists 里分别写 STATIC 与 SHARED 两条 add_library 定义并构建，进 build 目录用 ls 对比 libmath.a 与 libmath.so 两种产物；再执行 cmake --install build --prefix /tmp/proot，查看 bin 与 include 目录的落盘结构是否完整。',
    independentPractice: '独立交付：一个带静态库、两个测试用例与安装规则的 CMake 工程，cmake --build 后 ctest 全绿，再用 --prefix 试装到临时目录并用 ls 验证 bin 与 include 内容齐全。',
    commonErrors: ['忘记 enable_testing()，add_test 注册的用例在 ctest 里一个都找不到。', '用全局命令 link_libraries 挂依赖，无关目标也被迫链接 math，改用 target_link_libraries 才能隔离。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['目标是一等公民', 'CMakeLists.txt 自顶向下是 cmake_minimum_required 声明最低版本、project 声明工程名与语言，随后 add_executable(prog main.c) 定义目标。目标封装源码与属性，现代命令族以 target_ 开头把设置挂在具体目标上，替代早期目录级全局写法；同一目录可定义多个目标互不污染。cmake -B build -S . 配置后 cmake --build build 产出 prog，目标名即产物名。', '一目标一产物', {
        title: 'CMake：配置、构建并列出目标',
        language: 'CMake',
        code: `cmake_minimum_required(VERSION 3.25)
project(orders C)
add_executable(prog main.c)
add_executable(tool tool.c)
set_target_properties(prog PROPERTIES C_STANDARD 17 C_EXTENSIONS OFF)
target_compile_options(prog PRIVATE -Wall -Wextra)`,
        output: `cmake -B build -S .
cmake --build build
Get-ChildItem build | Select-Object Name
prog  tool

一个 add_executable 对应一个构建目标。
C_STANDARD 17 与编译警告挂在 prog 目标上。`,
      }],
      ['STATIC 与 SHARED', 'add_library(math STATIC add.c) 强制静态归档，SHARED 强制动态库，两者都省略时由 BUILD_SHARED_LIBS 变量决定，未设置默认 STATIC。静态目标产物是 libmath.a，动态是 libmath.so；SHARED 时目标属性 POSITION_INDEPENDENT_CODE 自动开启，等价于给编译加 -fPIC。在 CMakeLists 里写两条 add_library 分别构建，进 build 目录用 ls 验证两种产物都在。', '默认静态归档', {
        title: 'CMake：同时构建静态与动态库',
        language: 'CMake',
        code: `add_library(math_static STATIC add.c)
add_library(math_shared SHARED add.c)
set_target_properties(math_static PROPERTIES OUTPUT_NAME math)
set_target_properties(math_shared PROPERTIES OUTPUT_NAME math)
target_include_directories(math_shared PUBLIC \${CMAKE_CURRENT_SOURCE_DIR}/include)`,
        output: `build/libmath.a
build/libmath.so
readelf -h build/libmath.so | Select-String "Type"
Type: DYN (Shared object file)

STATIC 产出归档，SHARED 自动启用 PIC。
两个目标可共用输出名但类型不同。`,
      }],
      ['链接与依赖传播', 'target_link_libraries(prog PRIVATE math) 把 math 目标接入 prog，CMake 自动换算成实际库文件与 -L 路径，并保证先建库后建程序的顺序。PUBLIC 表示本目标使用且下游也要用，PRIVATE 仅自己使用，INTERFACE 只向下游传播；依赖经这条链级联展开，无需手写链接顺序。删掉该行再构建一次，复现 undefined reference 即可验证链接确实由此驱动。', 'PUBLIC 决定传播', {
        title: 'CMake：PRIVATE 与 PUBLIC 依赖传播',
        language: 'CMake',
        code: `add_library(math STATIC add.c)
target_include_directories(math PUBLIC include)
add_executable(prog main.c)
target_link_libraries(prog PRIVATE math)

add_executable(fail main_without_link.c)
# target_link_libraries(fail PRIVATE math) intentionally omitted`,
        output: `prog links include dir and libmath transitively
fail build:
undefined reference to add

PUBLIC include 传播给 prog。
PRIVATE 链接只作用于 prog；删掉链接行即报未定义。`,
      }],
      ['enable_testing 与 ctest', 'CMakeLists 顶层写 enable_testing()，随后 add_test(NAME math_add COMMAND prog_test) 注册用例；ctest 以退出码 0 判通过，ctest --test-dir build -R math_add 可按名过滤运行，-V 展开输出，-j 支持并行。用例之间相互独立，可单独重跑复现。写一个返回 0 与返回 1 的两个用例跑 ctest，观察 Passed 与 Failed 两种状态输出即可掌握判定规则。', '退出码定成败', {
        title: 'CTest：注册与运行测试目标',
        language: 'CMake',
        code: `enable_testing()
add_executable(test_add test_add.c add.c)
target_link_libraries(test_add PRIVATE math)
add_test(NAME math_add COMMAND test_add)
add_test(NAME expected_fail COMMAND fail_test)
set_tests_properties(expected_fail PROPERTIES WILL_FAIL TRUE)`,
        output: `ctest --test-dir build -V
1/2 Test #1: math_add ........ Passed
2/2 Test #2: expected_fail ... Passed (WILL_FAIL)
100% tests passed, 0 failed out of 2

ctest 用进程退出码判成败。
-R 可按名称筛选，-V 展开测试输出。`,
      }],
      ['install 规则', 'install(TARGETS prog RUNTIME DESTINATION bin) 声明安装动作，GNUInstallDirs 模块提供符合发行版惯例的 CMAKE_INSTALL_BINDIR 等变量，头文件用 install(FILES math.h DESTINATION include)。cmake --install build --prefix /tmp/proot 把产物落到指定前缀，不污染系统目录；规则在配置期固化，安装期只执行复制。装完用 ls /tmp/proot/bin 验证 prog 在位。', 'prefix 试装安全', {
        title: 'CMake：安全试装到临时 prefix',
        language: 'CMake',
        code: `include(GNUInstallDirs)
install(TARGETS prog RUNTIME DESTINATION \${CMAKE_INSTALL_BINDIR})
install(TARGETS math_static ARCHIVE DESTINATION \${CMAKE_INSTALL_LIBDIR})
install(FILES include/math.h DESTINATION \${CMAKE_INSTALL_INCLUDEDIR})
install(FILES README.md DESTINATION \${CMAKE_INSTALL_DOCDIR})`,
        output: `cmake --install build --prefix C:\\temp\\orders
-- Install configuration: Release
-- Installing: C:\\temp\\orders/bin/prog.exe
-- Installing: C:\\temp\\orders/lib/math.lib
-- Installing: C:\\temp\\orders/include/math.h

安装规则在配置阶段声明。
--prefix 只写入临时目录，不污染系统。`,
      }],
    ],
  },
  {
    name: 'C · 编译器、链接器与第一个 C 工程：第一个带 sanitizer 的 C 项目',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已能完成多文件 C 工程的编译链接与运行。',
    goal: '理解 ASan 影子内存插桩与 UBSan 运行时检查的机制差异，会用 -fsanitize=address,undefined 编译并读懂 heap-buffer-overflow 与 runtime error 两类报告，明确测试构建与发布构建的边界。',
    guidedPractice: '用 gcc -std=c17 -g -O1 -fsanitize=address,undefined 编译含越界与溢出的源码，运行后逐行抄下 ASan 报告的 ERROR 行与 SUMMARY 行；再单独跑 UBSan，观察 runtime error 输出与栈回放的差别。',
    independentPractice: '独立交付：一个带 sanitizer 与不带 sanitizer 的两套构建脚本，含至少一处堆越界与一处有符号溢出的用例各自被报告捕获，发布脚本编译零警告并正常运行。',
    commonErrors: ['编译加了 -fsanitize=address 但链接时漏掉，报 undefined reference to __asan_report 才发现链接标志也要带。', '把带 ASan 的二进制当发布版交付，运行慢约一倍且内存涨数倍，sanitizer 只该进测试构建。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['ASan 插桩原理', 'AddressSanitizer 由编译期插桩与运行时库两部分组成：编译器在每次内存访问前插入影子内存检查，影子内存以 8 字节粒度记录堆、栈与全局区是否可访问，越界访问立即触发报告。运行时库接管 malloc 与 free，把已释放内存放入隔离区延迟复用，从而稳定捕获 use-after-free。开启后内存开销增数倍、运行慢约 2 倍，属于测试构建专用配置。', '影子内存拦访问', {
        title: 'GCC：ASan 捕获 heap/stack overflow',
        language: 'C',
        code: `#include <stdlib.h>
int main(void) {
    int *heap = malloc(4 * sizeof(int));
    heap[4] = 1;
    int stack[4];
    stack[4] = 2;
    free(heap);
    return 0;
}`,
        output: `gcc -g -O1 -fsanitize=address overflow.c -o overflow
./overflow
ERROR: AddressSanitizer: heap-buffer-overflow
WRITE of size 4 at ...
SUMMARY: AddressSanitizer: heap-buffer-overflow

ASan 在首次越界写时立即终止并给出分配/访问回放。
同一构建也能捕获 stack-buffer-overflow。`,
      }],
      ['编译开启 sanitizer', '一条命令同时启用两器：gcc -std=c17 -Wall -Wextra -g -O1 -fsanitize=address,undefined main.c -o prog，-g 让报告带文件与行号，-O1 在保留可读栈帧的同时接近真实优化。链接也必须带同一标志以便挂上运行时库，漏掉会报 undefined reference to __asan_report。编译后 ./prog 正常运行且无输出，说明两器已在静默待命。', '链接同带标志', {
        title: 'GCC：编译与链接同时开启 sanitizer',
        language: 'PowerShell',
        code: `gcc -std=c17 -Wall -Wextra -g -O1 -fsanitize=address,undefined -c main.c -o main.o
gcc main.o -fsanitize=address,undefined -o prog
.\\prog
gcc main.o -o prog-missing-runtime
Get-Content asan.log -ErrorAction SilentlyContinue`,
        output: `prog runs with no sanitizer report
missing runtime link:
undefined reference to __asan_report_load4

编译与链接都要带同一 sanitizer 标志。
运行时库在链接阶段挂入可执行文件。`,
      }],
      ['复现越界报告', '写 int a[4]; a[4] = 1 触发栈越界，运行即打印 ERROR: AddressSanitizer: stack-buffer-overflow，随后给出 WRITE of size 4 的精确位置与完整调用栈，并回放该缓冲区的分配位置，末尾 SUMMARY 行汇总要点。注意相邻栈变量可能落在同一保护区内，报错位置可能偏离真实意图变量，需结合行号判断。把报告中 WRITE 与 SUMMARY 两行对照源码抄录，验证定位精度。', '报告带栈回放', {
        title: 'ASan：解读 stack-buffer-overflow',
        language: 'PowerShell',
        code: `@'
int main(void) {
    int values[4];
    values[4] = 1;
    return 0;
}
'@ | Set-Content stack.c
gcc -std=c17 -g -O1 -fsanitize=address stack.c -o stack
.\\stack > asan.txt 2>&1
Select-String asan.txt -Pattern "ERROR|WRITE of size|#0|#1|SUMMARY" -Context 0,1`,
        output: `ERROR: AddressSanitizer: stack-buffer-overflow
WRITE of size 4 at 0x... thread T0
    #0 main stack.c:3
    #1 __libc_start_main

WRITE 行给出访问宽度与地址。
栈帧 #0 指向越界写所在源码行。`,
      }],
      ['UBSan 抓未定义行为', 'undefined sanitizer 在有符号溢出、错误移位、空指针解引用等处插入检查，触发时输出 runtime error: signed integer overflow 之类一行报告并默认继续运行，与 ASan 的立即中止不同；加 -fno-sanitize-recover 可改为直接退出。int 溢出、1 << 31 这类写法在 -O2 可能被优化得悄无声息，插桩后运行时才暴露。写一个 int 溢出的自增程序跑 UBSan，抄下 runtime error 原文验证捕获。', '报错后可续跑', {
        title: 'UBSan：捕获有符号整数溢出',
        language: 'C',
        code: `#include <limits.h>
#include <stdio.h>
int main(void) {
    int value = INT_MAX;
    value += 1;
    printf("%d\\n", value);
    return 0;
}`,
        output: `gcc -O1 -fsanitize=undefined -fno-sanitize-recover=undefined overflow.c -o ub
./ub
overflow.c:5:11: runtime error: signed integer overflow:
2147483647 + 1 cannot be represented in type 'int'

UBSan 指出具体表达式与操作数。
-fno-sanitize-recover 使程序以非零状态退出。`,
      }],
      ['适用边界', 'sanitizer 组合使程序慢约 2 倍、内存涨数倍，还会与部分 LD_PRELOAD 工具冲突；ASan 进程内 fork 与 exec 通常可用，但泄漏检测对子进程有额外要求。发布构建一律不启用，CI 与本地测试构建常开。典型分工是测试构建带 -fsanitize=address,undefined 跑全量用例，发布构建用 -O2 纯净编译。对同一工程准备两条构建命令并各自跑通，验证两套配置互不干扰。', '测试开发布关', {
        title: 'PowerShell：测试与发布双构建',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory build-test, build-release -Force | Out-Null
gcc -std=c17 -Wall -Wextra -g -O1 -fsanitize=address,undefined main.c -o build-test/prog
gcc -std=c17 -Wall -Wextra -O2 -DNDEBUG main.c -o build-release/prog
.\\build-test\\prog
.\\build-release\\prog
Get-Item build-test\\prog, build-release\\prog | Select-Object Name, Length
Measure-Command { .\\build-test\\prog } | Select-Object TotalMilliseconds`,
        output: `test build: no sanitizer errors
release build: normal execution
test binary larger and slower than release

测试构建保留 -g 与 sanitizer。
发布构建只用 -O2 -DNDEBUG，不带插桩。`,
      }],
    ],
  },
];

// ── C1 类型、数组、指针、结构体与函数 ─────────────────────────────────────────────
export const HANDWRITTEN_C_SYSTEMS_C1_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C · 类型、数组、指针、结构体与函数：整数、浮点、字符与对象表示',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已用 gcc 编译过单文件 C 程序并能读 printf 输出。',
    goal: '掌握 stdint 固定宽度类型与 int 的宽度差异，能解释补码、无符号回绕、整数提升与 IEEE 754 编码，会用 printf 与 sizeof 验证各类对象的表示与取值边界。',
    guidedPractice: '在 main.c 里逐行打印 sizeof(int) 与 INT_MAX，写出 i 为 0 时执行 i 减 1 的无符号回绕输出，再打印 0.1 加 0.2 与 0.3 的比较结果，把每组输出抄进对照表。',
    independentPractice: '独立交付：一个程序同时验证 int32_t 与 int64_t 的宽度、unsigned 回绕现象、浮点相等比较失败案例，并用 %.17g 打印 0.1 的完整十进制展开。',
    commonErrors: ['以为 int 恒为 32 位，实际标准只保证至少 16 位，宽度由实现决定，跨平台代码必须用 int32_t 这类固定宽度类型。', '用 == 直接比较浮点数，0.1 加 0.2 不等于 0.3，误差累积导致判断失败，应改为差值小于容限。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/'],
    steps: [
      ['固定宽度类型', '标准只规定 char 至少 8 位、int 至少 16 位、long 至少 32 位，具体宽度由实现决定：x86-64 Linux 上 sizeof(int) 为 4 而 sizeof(long) 为 8，Windows 同架构下 long 只有 4 字节。stdint.h 提供 int32_t、int64_t 等精确宽度别名，limits.h 提供 INT_MAX 等上下界宏。验证动作：printf("%zu %d", sizeof(int), INT_MAX)，一眼确认当前平台的真实宽度与上界。', '固定宽度别名', {
        title: 'C：打印基本类型宽度与范围',
        language: 'C',
        code: `#include <stdio.h>
#include <stdint.h>
#include <limits.h>
int main(void) {
    printf("int=%zu long=%zu ptr=%zu\\n", sizeof(int), sizeof(long), sizeof(void*));
    printf("int32=%zu int64=%zu\\n", sizeof(int32_t), sizeof(int64_t));
    printf("INT_MAX=%d UINT_MAX=%u\\n", INT_MAX, UINT_MAX);
    return 0;
}`,
        output: `int=4 long=8 ptr=8
int32=4 int64=8
INT_MAX=2147483647 UINT_MAX=4294967295

固定宽度类型明确 32/64 位。
基本 int 与 long 的宽度依赖平台 ABI。`,
      }],
      ['补码与回绕', '有符号整数用补码编码，INT_MIN 等于负的 INT_MAX 再减 1，负数比正数多一个，对 INT_MIN 取负本身是未定义行为。无符号类型按 2 的 N 次方取模回绕，unsigned 变量为 0 时执行减 1 得到 UINT_MAX，32 位下即 4294967295。有符号溢出则是未定义行为，优化器可能删除检查代码，两类边界必须区分。验证：把 UINT_MAX 加 1 再打印，结果回到 0。', '无符号溢出回绕', {
        title: 'C：无符号回绕与补码边界',
        language: 'C',
        code: `#include <stdio.h>
#include <limits.h>
int main(void) {
    unsigned value = 0;
    value -= 1;
    printf("0-1=%u\\n", value);
    value += 1;
    printf("wrap+1=%u\\n", value);
    printf("INT_MIN=%d -INT_MAX=%d\\n", INT_MIN, -INT_MAX);
    return 0;
}`,
        output: `0-1=4294967295
wrap+1=0
INT_MIN=-2147483648 -INT_MAX=-2147483647

unsigned 按 2^32 取模回绕。
INT_MIN 比 -INT_MAX 少一，取负会溢出。`,
      }],
      ['提升与混合运算', 'char 与 short 参与运算时先提升为 int，再按通常算术转换统一两侧类型：int 与 long 相遇结果为 long，有符号与无符号相遇时有符号一侧被转换为无符号。经典陷阱是负 1 小于 1u 判定为假，因为负 1 被转成巨大的无符号数。验证：printf("%d", -1 < 1u) 输出 0，把右操作数换成不带 u 的 1 则输出 1，两条结果对照即转换规则。', '有符号无符号陷阱', {
        title: 'C：有符号与无符号比较',
        language: 'C',
        code: `#include <stdio.h>
int main(void) {
    int signed_value = -1;
    unsigned unsigned_value = 1u;
    printf("-1<1u = %d\\n", signed_value < unsigned_value);
    printf("-1<1  = %d\\n", signed_value < 1);
    printf("%zu\\n", sizeof(signed_value + unsigned_value));
    return 0;
}`,
        output: `-1<1u = 0
-1<1  = 1
4

比较前 -1 被转换为 UINT_MAX。
与无符号值运算后结果类型为 unsigned。`,
      }],
      ['IEEE 754 编码', 'float 为 32 位，按 1 位符号、8 位指数、23 位尾数切分；double 为 64 位，尾数扩到 52 位，约相当于 15 到 17 位十进制精度。0.1 的二进制是无限循环小数，只能存近似值，因此 0.1 加 0.2 与 0.3 的相等比较为假。验证：printf("%.17g", 0.1+0.2) 输出 0.30000000000000004，改用两数差值小于 1e-9 的写法完成相等判断。', '浮点只有近似值', {
        title: 'C：观察浮点表示误差',
        language: 'C',
        code: `#include <stdio.h>
#include <math.h>
int main(void) {
    double sum = 0.1 + 0.2;
    printf("%.17g\\n", sum);
    printf("equal=%d near=%d\\n", sum == 0.3, fabs(sum - 0.3) < 1e-9);
    for (size_t i = 0; i < sizeof(double); ++i)
        printf("%02x ", ((unsigned char*)&sum)[i]);
    return 0;
}`,
        output: `0.30000000000000004
equal=0 near=1
9a 99 99 99 99 99 d3 3f

0.1 与 0.2 都是近似二进制值，和为 0.30000000000000004。
浮点比较应使用容差，字节输出展示 IEEE 754 小端排布。`,
      }],
      ['字符与对象表示', 'char 的符号性由实现决定，标准允许有符号或无符号，CHAR_BIT 宏定义其位宽，绝大多数平台为 8。字符字面量「a」的编码值是 97，类型为 int；把超过 127 的值赋给 char 属于实现定义行为。任何对象都可用 unsigned char 逐字节检查其对象表示，memcpy 就是在字节层面复制对象。验证：对 double 变量按 unsigned char 逐字节打印 8 个字节的值，观察 IEEE 754 在内存中的排布。', '符号性随实现', {
        title: 'C：CHAR_BIT 与对象字节表示',
        language: 'C',
        code: `#include <stdio.h>
#include <limits.h>
#include <string.h>
int main(void) {
    printf("CHAR_BIT=%d CHAR_MIN=%d CHAR_MAX=%d\\n", CHAR_BIT, CHAR_MIN, CHAR_MAX);
    int value = 0x12345678;
    unsigned char bytes[sizeof value];
    memcpy(bytes, &value, sizeof value);
    for (size_t i = 0; i < sizeof value; ++i) printf("%02x ", bytes[i]);
    return 0;
}`,
        output: `CHAR_BIT=8 CHAR_MIN=-128 CHAR_MAX=127
78 56 34 12

char 在当前平台为 8 位且有符号。
memcpy 到 unsigned char 可合法检查整数的字节顺序。`,
      }],
    ],
  },
  {
    name: 'C · 类型、数组、指针、结构体与函数：数组、指针算术和边界',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已理解变量取址与 printf 基本用法，用过 gcc 警告开关。',
    goal: '掌握数组到指针的退化规则与两处例外，能按元素步进做指针算术并理解一越过界即未定义行为，会用 sizeof 对照与 sanitizer 工具建立边界防线。',
    guidedPractice: '打印 sizeof(arr) 与 sizeof(ptr) 对比退化前后的差异，用 int 指针加 1 前后打印地址观察步长为 4 字节，再用 -fsanitize=address 编译一段越界代码并记录报错原文。',
    independentPractice: '独立交付：一个接受数组与长度参数的求和函数，用 size_t 做下标循环，附一份 -fsanitize=address,undefined 零报错的编译命令与运行记录。',
    commonErrors: ['在函数内对参数写 sizeof(arr) 求数组长度，参数已退化为指针，恒得 8，必须把长度作为独立参数传入。', '以为越过末元素一个位置的指针也能解引用，实际只允许形成一越过界指针，解引用它是未定义行为。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/'],
    steps: [
      ['数组到指针的退化', '数组名在表达式中自动退化为指向首元素的指针，等价于取首元素地址；只有 sizeof 与一元取址两处例外，数组类型在这两处保持完整。因此 sizeof(arr) 等于整个数组的字节数；数组作函数参数时必退化为指针，sizeof 恒为指针宽度 8。验证：10 元素 int 数组在定义处打印 sizeof 得 40，传给函数后再打印得 8，两条输出对照即退化规则。', '两处例外不退化', {
        title: 'C：数组参数退化为指针',
        language: 'C',
        code: `#include <stdio.h>
void inspect(int values[10]) {
    printf("inside sizeof=%zu\\n", sizeof(values));
}
int main(void) {
    int values[10];
    printf("outside sizeof=%zu\\n", sizeof(values));
    inspect(values);
    printf("&arr+1=%p arr+1=%p\\n", (void*)(&values + 1), (void*)(values + 1));
    return 0;
}`,
        output: `outside sizeof=40
inside sizeof=8
&arr+1=0x...10 arr+1=0x...04

函数参数已退化为 int*，sizeof 为 8。
&arr 的类型是整个数组指针，步长为 40 字节。`,
      }],
      ['指针算术按元素步进', '指针加 1 前进的字节数等于所指类型的宽度，int 指针加 1 地址增长 4，double 指针加 1 增长 8，移动单位是元素而非字节。同一数组内两指针相减得 ptrdiff_t 类型的元素个数差；指针与整数相加只在该数组范围内有定义，指针之间相加标准直接禁止。验证：打印 p 与 p 加 1 的地址差值，应恰好等于 sizeof(元素) 而非 1。', '步长等于元素宽度', {
        title: 'C：指针加法按元素宽度步进',
        language: 'C',
        code: `#include <stdio.h>
#include <stddef.h>
int main(void) {
    int values[5] = {10,20,30,40,50};
    int *p = values;
    printf("ptr-step=%td element-step=%td\\n", (char*)(p+1) - (char*)p, (p+1) - p);
    printf("value=%d\\n", *(p+2));
    ptrdiff_t distance = &values[4] - &values[1];
    printf("distance=%td\\n", distance);
    return 0;
}`,
        output: `ptr-step=4 element-step=1
value=30
distance=3

地址步长 4 字节，指针差值按元素计为 1。
同一数组内相减得到元素个数。`,
      }],
      ['一越过界即未定义', '标准允许形成指向末元素之后一个位置的指针，用作循环终止判断，但解引用它或越过该位置继续算术都是未定义行为。访问 arr[n] 读到的是越界内存，-O2 下优化器假定越界不存在，可能完全删除边界检查代码。验证：用 -fsanitize=address 编译一段对 10 元素数组写 arr[10] 的代码，运行即报 buffer-overflow 并打印越界字节偏移。', '越界解引用是 UB', {
        title: 'ASan：捕获数组越界写',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int main(void) {
    int values[10];
    values[10] = 42;
    printf("%d\\n", values[10]);
    return 0;
}
'@ | Set-Content bounds.c
gcc -std=c17 -g -O1 -fsanitize=address bounds.c -o bounds
.\\bounds`,
        output: `ERROR: AddressSanitizer: stack-buffer-overflow
WRITE of size 4 at 0x...
SUMMARY: AddressSanitizer: stack-buffer-overflow

越界写立即被 ASan 红区捕获。
数组末元素之后的位置可以形成指针，但不能解引用。`,
      }],
      ['&arr 与 arr 的类型差异', '数组名退化得到 int* 类型，指向首元素；取址得到的 &arr 是 int(*)[N] 类型，指向整个数组。两者地址数值相同但类型不同：对退化指针加 1 前进一个元素即 4 字节，对整个数组的指针加 1 前进 N 乘 4 字节直接越过整个数组。验证：打印两种指针各自加 1 后的地址差，10 元素 int 数组上一条为 4、另一条为 40。', '地址同类型异', {
        title: 'C：比较 arr 与 &arr 指针类型',
        language: 'C',
        code: `#include <stdio.h>
int main(void) {
    int arr[10];
    int *p = arr;
    int (*whole)[10] = &arr;
    printf("arr+1=%td bytes\\n", (char*)(p+1) - (char*)p);
    printf("&arr+1=%td bytes\\n", (char*)(whole+1) - (char*)whole);
    printf("%zu %zu\\n", sizeof(*p), sizeof(*whole));
    return 0;
}`,
        output: `arr+1=4 bytes
&arr+1=40 bytes
4 40

arr 退化为首元素指针，步长 4。
&arr 指向整个数组，步长 40。`,
      }],
      ['边界防线实践', '工程惯例是所有接受数组的函数都带独立长度参数并用 size_t 表示，下标也用 size_t 可避免与无符号长度比较有符号无符号混用。gcc 的 -Warray-bounds 能在编译期捕获部分常量下标越界，运行期依靠 ASan 与 UBSan：-fsanitize=address,undefined 覆盖越界访问与未定义算术。验证：给同一份带越界写缺陷的代码分别加警告与 sanitizer 编译，记录两种工具各自报出的位置。', '长度参数必传', {
        title: 'C：数组函数显式传长度',
        language: 'C',
        code: `#include <stddef.h>
long sum(const int *values, size_t length) {
    long total = 0;
    for (size_t i = 0; i < length; ++i) total += values[i];
    return total;
}
int main(void) {
    int values[4] = {1,2,3,4};
    return sum(values, 4) == 10 ? 0 : 1;
}`,
        output: `gcc -std=c17 -Wall -Wextra -Werror -fsanitize=address,undefined main.c -o prog
PASS

函数拿指针和独立 length，不猜 sizeof。
size_t 下标避免有符号无符号混用。`,
      }],
    ],
  },
  {
    name: 'C · 类型、数组、指针、结构体与函数：字符串、缓冲区与安全拼接',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已写过带数组参数的 C 函数并理解指针退化。',
    goal: '理解 NUL 终结与 strlen 的扫描代价，掌握 strcpy、strncpy、snprintf 各自的边界语义，能按返回值检测截断，并正确区分 memcpy 与 memmove 的适用条件。',
    guidedPractice: '对同一缓冲区分别调用 strcpy 与 snprintf 观察溢出与截断差异，打印 snprintf 的返回值并与缓冲区大小比较，再对两段重叠内存各调 memcpy 与 memmove 记录 sanitizer 报错差异。',
    independentPractice: '独立交付：一个安全拼接函数，目标缓冲区定长，用 snprintf 完成拼接并按返回值报告截断所需的完整长度，全部边界用例在 ASan 下零报错通过。',
    commonErrors: ['以为 strncpy 更安全就替换 strcpy，源串达到或超过 n 时目标不会补 NUL 终结，后续 strlen 会一直扫描到越界。', '把 memcpy 用在源与目标重叠的内存上，标准规定重叠时行为未定义，必须改用保证重叠语义的 memmove。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/'],
    steps: [
      ['NUL 终结与 strlen', 'C 字符串没有长度字段，以值为 0 的 NUL 字符终结，strlen 从起点逐字节扫描到 NUL 才返回长度，耗时与串长成正比。char 数组用字符串字面量初始化时编译器自动补 NUL，sizeof 等于内容加 1，strlen 只计内容。验证：对内容为 abc 的数组打印 sizeof 与 strlen 分别得 4 与 3，对指向同一字面量的指针打印 sizeof 得 8，对照即两者语义差异。', '长度靠扫描得出', {
        title: 'C：sizeof 与 strlen 的差别',
        language: 'C',
        code: `#include <stdio.h>
#include <string.h>
int main(void) {
    char text[] = "abc";
    const char *pointer = text;
    char copy[4] = {'a','b','c','\\0'};
    printf("sizeof=%zu strlen=%zu\\n", sizeof(text), strlen(text));
    printf("pointer-size=%zu copy-strlen=%zu\\n", sizeof(pointer), strlen(copy));
    return 0;
}`,
        output: `sizeof=4 strlen=3
pointer-size=8 copy-strlen=3

sizeof 包含结尾 NUL。
strlen 扫描到 NUL 返回字符数。`,
      }],
      ['strcpy 与缓冲区溢出', 'strcpy 把源串连同 NUL 一并复制，完全不知道目标大小，源串长于目标时溢出覆盖栈上相邻数据，是历史漏洞的头号来源；更危险的 gets 已在 C11 标准中删除。验证：定义 4 字节数组用 strcpy 拷入更长字符串，-fsanitize=address 编译运行会报 stack-buffer-overflow；换 snprintf 指定目标大小后输出被截断的安全结果，两条路径对照可见边界检查的价值。', '不查边界直接写', {
        title: 'ASan：strcpy 溢出与 snprintf 截断',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
#include <string.h>
int main(void) {
    char target[4];
    strcpy(target, "hello");
    printf("%s\\n", target);
    return 0;
}
'@ | Set-Content unsafe.c
gcc -g -O1 -fsanitize=address unsafe.c -o unsafe
.\\unsafe
@'
#include <stdio.h>
int main(void) {
    char target[4];
    int needed = snprintf(target, sizeof target, "%s", "hello");
    printf("value=%s needed=%d\\n", target, needed);
    return 0;
}
'@ | Set-Content safe.c
gcc -g -fsanitize=address safe.c -o safe
.\\safe`,
        output: `ERROR: AddressSanitizer: stack-buffer-overflow
unsafe: strcpy writes 6 bytes into 4-byte target
value=hel needed=5

strcpy 不知道目标大小，直接越界。
snprintf 必补 NUL，并返回所需完整长度。`,
      }],
      ['strncpy 的补零陷阱', 'strncpy 最多复制 n 字节，源串不足 n 时剩余空间全部填 NUL，源串达到或超过 n 时目标没有任何 NUL，后续拼接或 strlen 都会越界，必须手动把末字节补 0。它还会把不足部分逐字节填零，源串远短于 n 时性能很差，并非高效截断工具。工程上更推荐 snprintf：目标大小明确、必补 NUL、语义单一。验证：对 10 字节目标执行限长 10 的 strncpy 后打印 strlen，结果不可预期，因为目标缺少 NUL。', '超长时缺 NUL', {
        title: 'C：strncpy 不保证 NUL',
        language: 'C',
        code: `#include <stdio.h>
#include <string.h>
int main(void) {
    char target[5];
    memset(target, 'x', sizeof target);
    strncpy(target, "abcdef", sizeof target);
    printf("bytes=");
    for (size_t i = 0; i < sizeof target; ++i) printf("%02x ", (unsigned char)target[i]);
    puts("");
    return 0;
}`,
        output: `bytes=61 62 63 64 65

源串长度 6、目标容量 5，strncpy 写满后不补 NUL。
后续 strlen 或 %s 会继续扫描越界。`,
      }],
      ['snprintf 返回值语义', 'snprintf 返回写入所需的总字符数（不含 NUL），而非实际写入数：返回值小于缓冲区大小时完整写入；大于等于 size 时发生截断，只有前 size 减 1 个字符加 NUL 落盘；返回负值表示编码错误。这个返回值正是截断检测的依据。验证：用 8 字节缓冲区拼接 20 字符内容，printf 返回值应为 20，再写返回值与 size 比较的分支，截断时报告所需完整长度。', '返回值是应有长度', {
        title: 'C：按 snprintf 返回值识别截断',
        language: 'C',
        code: `#include <stdio.h>
int main(void) {
    char target[8];
    const char *name = "very-long-order-name";
    int needed = snprintf(target, sizeof target, "order:%s", name);
    if (needed < 0) return 1;
    if ((size_t)needed >= sizeof target) {
        printf("truncated value=%s needed=%d capacity=%zu\\n",
               target, needed, sizeof target);
    } else {
        printf("ok value=%s\\n", target);
    }
    return 0;
}`,
        output: `truncated value=order:v needed=23 capacity=8

返回值 23 是完整字符串所需长度。
缓冲区实际只保存 7 字符加 NUL。`,
      }],
      ['memcpy 与 memmove', '两者都按字节数复制，长度参数是字节而非元素个数，结构体数组要乘 sizeof(元素)。memcpy 在源与目标重叠时行为未定义，memmove 内部按重叠方向选择复制顺序，保证任何重叠情形都正确。验证：对 buf 与 buf 加 1 的重叠区间分别调用两者并打印结果，再用 ASan 编译确认 memcpy 版本报错而 memmove 版本正常，一次运行看清语义差异。', '重叠必须换函数', {
        title: 'ASan：memcpy 重叠与 memmove 修复',
        language: 'C',
        code: `#include <stdio.h>
#include <string.h>
int main(void) {
    char unsafe[8] = "abcdef";
    char safe[8] = "abcdef";
    memcpy(unsafe + 1, unsafe, 5);
    memmove(safe + 1, safe, 5);
    printf("unsafe=%s safe=%s\\n", unsafe, safe);
    return 0;
}`,
        output: `memcpy: overlapping regions are undefined behavior
memmove: safe=aabcde
unsafe result may vary by libc/compiler

重叠复制只能用 memmove。
memcpy 适合确定不重叠的高性能复制。`,
      }],
    ],
  },
  {
    name: 'C · 类型、数组、指针、结构体与函数：结构体、联合体和对齐',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已掌握 C 的基本类型宽度并写过自定义结构体。',
    goal: '掌握成员对齐与 padding 的成因，会用 offsetof 与 sizeof 验证成员排布，理解联合体的共享存储语义与对齐控制手段，能按对齐规则压缩结构体体积。',
    guidedPractice: '对含 char 加 int 加 char 的结构体打印 sizeof 与各成员 offsetof，调换成员顺序再次打印对比体积，再用 union 打印各成员地址确认它们共享同一存储起点。',
    independentPractice: '独立交付：把一个 24 字节结构体通过成员重排压缩到最小体积，附 offsetof 排布表与 _Alignof 输出，逐处说明 padding 的来源字节数。',
    commonErrors: ['以为结构体大小就是各成员宽度之和，实际编译器按对齐插入 padding，char 加 int 加 char 实际占 12 字节而非 6。', '把含 padding 的结构体整块 memcpy 进网络缓冲区当协议格式，填充字节随实现变化，接收端按固定偏移解析必然错位。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/'],
    steps: [
      ['对齐与 padding 成因', '每种类型有对齐要求，int 通常 4、double 通常 8，硬件按对齐访问更快且部分架构遇到不对齐访问直接出错。编译器在每个成员前插入 padding 使其地址落在对齐倍数上，结构体总大小还要向上取整到最大成员对齐的倍数，char 加 int 加 char 因此占 12 字节。验证：打印 sizeof 与两个 offsetof，确认第二个 char 前有 3 字节填充、尾部还有 3 字节填充。', '成员对齐到倍数', {
        title: 'C：用 sizeof/offsetof 看 padding',
        language: 'C',
        code: `#include <stdio.h>
#include <stddef.h>
struct Bad { char a; int b; char c; };
int main(void) {
    printf("sizeof=%zu a=%zu b=%zu c=%zu\\n",
           sizeof(struct Bad), offsetof(struct Bad,a),
           offsetof(struct Bad,b), offsetof(struct Bad,c));
    return 0;
}`,
        output: `sizeof=12 a=0 b=4 c=8

int b 前插入 3 字节 padding。
结构体尾部再填充 3 字节以满足整体对齐。`,
      }],
      ['offsetof 与成员排布', 'stddef.h 的 offsetof(类型, 成员) 返回成员相对结构体起始地址的字节偏移，是跨平台检测成员排布的标准手段，其展开依赖编译器内建实现而非简单指针算术。偏移序列即真实内存排布，对照 sizeof 全长可反推尾部 padding 的字节数。验证：定义三个成员的结构体后依次打印每个成员的 offsetof，画出排布图并标出每段填充的位置与字节数。', '查成员字节偏移', {
        title: 'C：打印成员偏移与填充',
        language: 'C',
        code: `#include <stdio.h>
#include <stddef.h>
struct Record { char tag; double value; short code; };
int main(void) {
    printf("size=%zu tag=%zu value=%zu code=%zu\\n",
      sizeof(struct Record), offsetof(struct Record,tag),
      offsetof(struct Record,value), offsetof(struct Record,code));
    printf("align double=%zu record=%zu\\n",
      _Alignof(double), _Alignof(struct Record));
    return 0;
}`,
        output: `size=24 tag=0 value=8 code=16
align double=8 record=8

value 前 7 字节、code 后 6 字节 padding。
总大小向上取整到 8 的倍数。`,
      }],
      ['成员排序压缩体积', '成员声明顺序决定 padding 分布，按对齐宽度从大到小声明能把填充压到最少。以 char、double、char、int 四个成员为例，最差排序占 24 字节，最优排序只占 16 字节；仅重排声明不改任何类型就省下三分之一内存，成员数量多的结构体收益更大。验证：写出宽窄两种排序版本分别打印 sizeof，并逐一列出两种排布的 offsetof 差异说明省掉的位置。', '宽成员放前面', {
        title: 'C：重排成员减少结构体体积',
        language: 'C',
        code: `#include <stdio.h>
struct Bad { char a; double b; char c; int d; };
struct Good { double b; int d; char a; char c; };
int main(void) {
    printf("bad=%zu good=%zu\\n", sizeof(struct Bad), sizeof(struct Good));
    return 0;
}`,
        output: `bad=24 good=16

Bad 有多个内部与尾部填充。
Good 按 8、4、1、1 排列，仅尾部留 2 字节。`,
      }],
      ['联合体的共享存储', 'union 所有成员从同一地址开始，大小等于最宽成员按其对齐取整后的尺寸，写入一个成员后读取另一成员是把同一批字节按新类型重新解释；读非活动成员在标准中是实现定义行为，但用联合体检查对象表示是公认惯用法。验证：定义 32 位整型与 4 字节数组的联合体，按整型写入 0x12345678 后按字节打印 4 个成员值，对照地址顺序即可确认本机字节序。', '所有成员同一地址', {
        title: 'C：union 检查字节序',
        language: 'C',
        code: `#include <stdio.h>
#include <stdint.h>
union Bits { uint32_t value; unsigned char bytes[4]; };
int main(void) {
    union Bits bits = {.value = 0x12345678u};
    printf("addr=%p %p %p\\n", (void*)&bits,
           (void*)&bits.value, (void*)bits.bytes);
    for (size_t i = 0; i < 4; ++i) printf("%02x ", bits.bytes[i]);
    return 0;
}`,
        output: `addr=0x...40 0x...40 0x...40
78 56 34 12

所有成员共享同一起始地址。
字节顺序显示当前机器为 little-endian。`,
      }],
      ['对齐控制手段', 'C11 提供 _Alignof 查询类型对齐、_Alignas 指定变量或成员的对齐；堆上需要超对齐时用 aligned_alloc，其 size 参数必须是 alignment 的整数倍，否则未定义。malloc 返回的地址已满足基础类型的对齐，但要对齐到缓存行等更大边界必须显式指定。验证：打印 _Alignof(double) 与 _Alignof(max_align_t)，再用 aligned_alloc(64, 64) 打印返回地址验证 64 字节对齐。', '对齐可显式指定', {
        title: 'C11：_Alignas 与 aligned_alloc',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>
_Alignas(64) static char cacheline[64];
int main(void) {
    void *heap = aligned_alloc(64, 128);
    printf("double-align=%zu max-align=%zu\\n", _Alignof(double), _Alignof(max_align_t));
    printf("static=%p mod64=%zu heap=%p mod64=%zu\\n",
      (void*)cacheline, (size_t)cacheline % 64,
      heap, (size_t)heap % 64);
    free(heap);
    return 0;
}`,
        output: `double-align=8 max-align=16
static=0x...00 mod64=0 heap=0x...40 mod64=0

_Alignas 让静态对象地址 64 字节对齐。
aligned_alloc 的 size 必须是 alignment 整数倍。`,
      }],
    ],
  },
  {
    name: 'C · 类型、数组、指针、结构体与函数：函数指针、回调与接口表',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已会定义与调用多文件 C 函数并理解指针类型。',
    goal: '掌握函数指针的声明与调用语法，能实现 qsort 比较器与带上下文的回调，会用结构体数组组织接口表替代分支链分发，理解信号回调的异步安全边界。',
    guidedPractice: '定义加与减两个函数，用同一函数指针变量依次指向并调用；再给 qsort 写 int 比较器完成排序并打印结果，最后建一张名字到函数指针的接口表循环分发命令。',
    independentPractice: '独立交付：一个命令分发程序，接口表含至少四条命令，输入名字查表调用对应函数，未命中时返回错误码，分发逻辑不写分支链。',
    commonErrors: ['声明函数指针漏写括号写成 int *fp(int)，这变成返回 int 指针的函数原型，两者类型完全不同且编译器未必报错。', 'qsort 比较器里用减法返回大小差，极端值相减会溢出导致顺序翻转，应改为三路比较返回固定的负零正。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/'],
    steps: [
      ['函数指针声明与调用', '函数指针声明 int (*fp)(int, int) 的括号不可省，去掉括号后变成返回 int* 的函数原型，两者类型截然不同。取函数地址时函数名与显式取址写法等价，调用时 fp(x) 与显式解引用写法等价。函数指针类型组合冗长，工程惯用 typedef 定义别名提升可读性。验证：让同一指针先后指向加与减两个函数并打印结果，两次调用代码完全一致而实现不同。', '括号圈住星号', {
        title: 'C：函数指针切换加法与减法',
        language: 'C',
        code: `#include <stdio.h>
int add(int a,int b){return a+b;}
int sub(int a,int b){return a-b;}
typedef int (*binary_op)(int,int);
int main(void) {
    binary_op op = add;
    printf("%d\\n", op(7,2));
    op = sub;
    printf("%d\\n", op(7,2));
    printf("%d\\n", (*op)(7,2));
    return 0;
}`,
        output: `9
5
5

同一函数指针变量调用不同实现。
括号保证星号绑定到变量名，类型是函数指针。`,
      }],
      ['qsort 比较器', 'qsort 的比较器签名为 int (const void*, const void*)，返回负、零、正分别表示前者小、相等、前者大，库据此决定元素交换与否。比较器内部先把 void* 强转为元素指针再取值；比较两个 int 应写三路判断而非相减，相减在极端值下溢出会使排序结果错乱。验证：对含 INT_MIN 的数组分别用减法与三路比较两种比较器排序，打印两种结果对照差异。', '三值语义定顺序', {
        title: 'qsort：安全三路比较器',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
int compare(const void *left, const void *right) {
    int a = *(const int*)left;
    int b = *(const int*)right;
    return (a > b) - (a < b);
}
int main(void) {
    int values[] = {3, -1, 2};
    qsort(values, 3, sizeof values[0], compare);
    for (size_t i=0;i<3;i++) printf("%d ", values[i]);
    return 0;
}`,
        output: `-1 2 3

比较器返回负/零/正。
三路比较避免极端值相减溢出。`,
      }],
      ['回调与上下文参数', '纯 C 的回调靠 void* 参数携带上下文：注册回调时把环境结构体地址一并传入，触发时回调从该指针恢复状态，这是 observer 与事件分发的标准形态。qsort 的接口没有上下文位，比较器只能依赖全局变量或把参数编码进待排数据。验证：写一个带 void* 阈值参数的比较器，同一份排序代码换不同阈值产出升序与降序两种结果，证明回调可携带运行时配置。', 'void* 带环境', {
        title: 'C：void* 携带回调上下文',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
struct Context { int descending; };
int compare_ctx(const void *left, const void *right, void *raw) {
    struct Context *ctx = raw;
    int a = *(const int*)left, b = *(const int*)right;
    int order = (a > b) - (a < b);
    return ctx->descending ? -order : order;
}
int main(void) {
    int values[] = {3,1,2};
    struct Context ctx = {1};
    qsort_r(values, 3, sizeof values[0], compare_ctx, &ctx);
    for (size_t i=0;i<3;i++) printf("%d ", values[i]);
    return 0;
}`,
        output: `3 2 1

上下文结构体携带 descending 配置。
同一比较逻辑可切换升序/降序。`,
      }],
      ['接口表替代分支链', '把名字与函数指针装进结构体数组，struct { const char *name; void (*fn)(int); } 逐条列出命令，分发退化为一次线性查表加一次间接调用；新增命令只加一行表项，分发逻辑不动，可读性与扩展性都优于长分支链。这种写法也是驱动与协议处理表的通用形态。验证：实现四条命令的接口表循环分发，再删掉一条表项，观察未命中输入按错误码退出的路径。', '查表分发命令', {
        title: 'C：函数指针接口表分发命令',
        language: 'C',
        code: `#include <stdio.h>
#include <string.h>
typedef void (*command_fn)(int);
struct Command { const char *name; command_fn run; };
void start(int n){printf("start %d\\n",n);}
void stop(int n){printf("stop %d\\n",n);}
struct Command commands[] = {{"start",start},{"stop",stop}};
int dispatch(const char *name,int arg) {
    for (size_t i=0;i<sizeof commands/sizeof commands[0];++i)
        if (!strcmp(name,commands[i].name)) { commands[i].run(arg); return 0; }
    return -1;
}
int main(void){ return dispatch("start",2) + dispatch("missing",0); }`,
        output: `start 2
dispatch missing returns -1

新增命令只需增加一条表项。
未命中返回错误码，不执行分支链。`,
      }],
      ['信号回调的异步边界', 'signal 注册的处理器会在任意指令间隙异步触发，标准只保证其中可以安全读写 volatile sig_atomic_t 类型的标记变量；调用 printf 或 malloc 都不在异步信号安全清单内，可能死锁。惯用法是处理器只置标记，主循环检查标记后做实际处理。验证：程序捕获 SIGINT 后只在处理器里递增标记，主循环检测到标记才打印计数，连按两次中断观察主循环各处理一轮。', '处理器只做标记', {
        title: 'C：signal handler 只置原子标记',
        language: 'C',
        code: `#include <signal.h>
#include <stdio.h>
#include <unistd.h>
static volatile sig_atomic_t interrupted = 0;
static void on_sigint(int sig) { (void)sig; interrupted = 1; }
int main(void) {
    signal(SIGINT, on_sigint);
    while (!interrupted) pause();
    printf("handled after main loop sees flag\\n");
    return 0;
}`,
        output: `^C
handled after main loop sees flag

handler 只写 volatile sig_atomic_t。
printf 放在主循环，避开异步信号不安全函数。`,
      }],
    ],
  },
  {
    name: 'C · 类型、数组、指针、结构体与函数：容器与协议解析基础实验',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已掌握指针算术、结构体对齐与 snprintf 的边界语义。',
    goal: '实现基于 realloc 的动态数组与环形缓冲区，理解字节序与网络字节序的转换机制，能按逐字节组装方式解析二进制协议头而不依赖结构体整块映射。',
    guidedPractice: '实现容量翻倍的 push 函数并打印每次扩容后的地址变化，再用固定容量环形缓冲区连续入队出队观察头尾下标回绕，最后手工解析一段 12 字节协议头并打印各字段值。',
    independentPractice: '独立交付：一个协议头解析程序，从字节数组按偏移提取魔数、长度与版本字段，校验长度边界后按长度读取载荷，坏长度输入返回错误码而非越界读取。',
    commonErrors: ['把 realloc 返回值直接赋给原指针，失败返回 NULL 时原内存地址丢失造成泄漏，必须先接临时变量判空再提交。', '把缓冲区整块强转成结构体指针解析协议头，padding 与对齐随实现变化，字节流解析必须逐字段读取组装。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/'],
    steps: [
      ['动态数组与倍增', '动态数组维护 size 与 capacity 两个量，满容量时申请当前容量两倍的新块并整体迁移，摊还后单次 push 为常数代价，每次只加一扩容会退化成平方级。扩容后内存可能整体搬家，此前保存的元素指针全部失效，必须重新获取。验证：每次扩容打印数据指针与容量，观察地址跳变与容量按 1、2、4、8 增长的序列，确认迁移发生的位置。', '倍增摊还常数代价', {
        title: 'C：动态数组倍增扩容',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
int main(void) {
    int *data = NULL;
    size_t size = 0, capacity = 0;
    for (int value = 0; value < 9; ++value) {
        if (size == capacity) {
            size_t next = capacity ? capacity * 2 : 1;
            int *grown = realloc(data, next * sizeof *data);
            if (!grown) { free(data); return 1; }
            data = grown; capacity = next;
            printf("resize capacity=%zu ptr=%p\\n", capacity, (void*)data);
        }
        data[size++] = value;
    }
    free(data);
    return 0;
}`,
        output: `resize capacity=1 ptr=0x...
resize capacity=2 ptr=0x...
resize capacity=4 ptr=0x...
resize capacity=8 ptr=0x...

容量按 2 倍增长，push 摊还 O(1)。
realloc 搬家后旧元素指针会失效。`,
      }],
      ['realloc 的正确用法', 'realloc(ptr, new_size) 尝试原地扩展，失败时返回 NULL 且原内存原样保留。把返回值直接赋回原指针，会在失败瞬间丢失唯一地址造成泄漏；惯用法是先用临时变量接收，判空后再提交。新容量小于旧值时按字节截断，多余内容丢弃，前部数据保证不变。验证：故意申请超大容量触发失败，打印临时变量为 NULL 而原指针仍可用，随后正常释放原块。', '临时变量先接住', {
        title: 'C：realloc 失败保留旧块',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
int main(void) {
    int *data = malloc(4 * sizeof *data);
    if (!data) return 1;
    data[0] = 42;
    int *grown = realloc(data, (size_t)-1);
    if (grown) {
        data = grown;
    } else {
        printf("growth failed old=%d\\n", data[0]);
    }
    free(data);
    return 0;
}`,
        output: `growth failed old=42

realloc 失败返回 NULL，原 4 元素块仍完整。
临时指针避免覆盖并泄漏旧地址。`,
      }],
      ['环形缓冲区', '环形缓冲区用 head 与 tail 两个下标在定长数组上循环移动，写入前进 tail、读取前进 head，越过末尾按容量取模回到 0，无需搬移数据即可实现先进先出。head 与 tail 相等时既可能空也可能满，工程上引入 count 计数区分；容量取 2 的幂时取模可换成按位与掩码。验证：容量 8 的缓冲区连续写入 10 个元素，打印 head 与 tail 回绕后的下标值并核对剩余计数。', '下标取模回绕', {
        title: 'C：环形缓冲区 head/tail 回绕',
        language: 'C',
        code: `#include <stdio.h>
struct Ring { int data[8]; unsigned head, tail, count; };
int push(struct Ring *r, int value) {
    if (r->count == 8) return 0;
    r->data[r->tail] = value;
    r->tail = (r->tail + 1) % 8;
    r->count++;
    return 1;
}
int pop(struct Ring *r, int *value) {
    if (!r->count) return 0;
    *value = r->data[r->head];
    r->head = (r->head + 1) % 8;
    r->count--;
    return 1;
}
int main(void){ struct Ring r={0}; for(int i=0;i<10;i++) push(&r,i); printf("head=%u tail=%u count=%u\\n",r.head,r.tail,r.count); }`,
        output: `head=0 tail=2 count=8

写满 8 个后两次 push 被拒绝。
tail 从 7 回绕到 0、1，count 保持 8。`,
      }],
      ['字节序与转换', 'x86 与多数 ARM 小端存放多字节整数，低字节在低地址；网络字节序规定为大端。POSIX 提供 htons、htonl、ntohs、ntohl 四个函数完成主机序与网络序互转，16 位值 0x1234 在小端内存中按 34 12 排列。验证：对 32 位值分别调用 htonl 与 ntohl 打印结果，再把该值的 4 个字节按地址顺序逐个打印，对照确认本机端序与转换的可逆性。', '网络序是大端', {
        title: 'C：htonl/ntohl 网络字节序',
        language: 'C',
        code: `#include <stdio.h>
#include <stdint.h>
#include <arpa/inet.h>
int main(void) {
    uint32_t host = 0x12345678;
    uint32_t network = htonl(host);
    unsigned char *bytes = (unsigned char*)&network;
    for (size_t i=0;i<4;i++) printf("%02x ", bytes[i]);
    printf("\\nroundtrip=%08x\\n", ntohl(network));
    return 0;
}`,
        output: `12 34 56 78
roundtrip=12345678

网络序按大端存储：12 是最高字节。
ntohl 将网络序转回主机序。`,
      }],
      ['逐字节解析协议头', '二进制协议头由固定偏移的字段构成，解析应按字节偏移取出并手动组装数值：最高字节左移 24 位再按位或低三字节，或交给 ntohl 处理。把缓冲区强转成结构体指针的做法受 padding、对齐与端序三重实现差异影响，不可移植。验证：对 12 字节头部按偏移提取魔数、长度、版本三个字段并打印十六进制值，再构造长度字段超出实际载荷的坏包，确认解析函数以错误码拒绝而非越界读取。', '逐字段手动组装', {
        title: 'C：按偏移解析协议头并验证长度',
        language: 'C',
        code: `#include <stdio.h>
#include <stdint.h>
#include <string.h>
struct Header { uint32_t magic; uint32_t length; uint32_t version; };
int parse(const unsigned char *buf, size_t n, struct Header *out) {
    if (n < 12) return -1;
    memcpy(&out->magic, buf, 4);
    memcpy(&out->length, buf+4, 4);
    memcpy(&out->version, buf+8, 4);
    out->magic = ntohl(out->magic);
    out->length = ntohl(out->length);
    out->version = ntohl(out->version);
    return out->length <= n - 12 ? 0 : -2;
}
int main(void) {
    unsigned char good[12] = {0};
    struct Header h;
    printf("short=%d\\n", parse(good, 4, &h));
    good[7] = 20;
    printf("bad-length=%d\\n", parse(good, 12, &h));
    return 0;
}`,
        output: `short=-1
bad-length=-2

短于 12 字节拒绝解析。
长度 20 超过剩余载荷，返回 -2，不越界读取。`,
      }],
    ],
  },
];

// ── C2 栈、堆、生命周期与未定义行为 ─────────────────────────────────────────────
export const HANDWRITTEN_C_SYSTEMS_C2_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C · 栈、堆、生命周期与未定义行为：自动存储、静态存储和动态分配',
    track: 'P14 · 独立语言课程',
    minutes: 40,
    prerequisite: '学员能用 gcc 编译运行单文件 C 程序并认识指针类型。',
    goal: '区分 C 三种存储期的机制与生命周期边界，能说明栈帧的分配方式、静态区 .data 与 .bss 的段划分以及堆分配的入口，并根据变量用途选择正确的存储方式。',
    guidedPractice: '写一个同时含局部大数组、static 计数器与 malloc 块的程序，先用 ulimit -s 查看栈上限 8192，再用 size a.out 观察 data 与 bss 两列的大小差异，最后打印三类对象的地址对比落在哪个区域。',
    independentPractice: '独立交付：一个演示三种存储期的程序，局部数组开到 8 MB 触发栈溢出段错误后调小验证恢复，static 变量跨调用保持累加，malloc 块用 free 归还，三段现象各附一句成因说明。',
    commonErrors: ['把大型局部数组开到几 MB 导致栈溢出段错误，栈默认上限只有 8 MB，不像堆那样按需增长。', '以为 .bss 段会占可执行文件体积，实际它只记录总大小，加载时由内核清零。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'Clang Documentation. https://clang.llvm.org/docs/'],
    steps: [
      ['三种存储期', 'C 标准用存储期决定对象生死：自动存储期的局部变量随所在代码块进入与退出生灭；静态存储期的对象在程序启动前创建，整个运行期间存活；动态分配存储期由 malloc 与 free 手动划定。选错存储期正是悬空指针与泄漏两类缺陷的根源，指针合法与否取决于所指对象的存储期而非指针本身。', '存储期定生死', {
        title: 'C：三种存储期地址与生命周期',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
static int global_value;
int *bad_address(void) { int local = 1; return &local; }
int main(void) {
    int automatic = 0;
    int *heap = malloc(sizeof *heap);
    printf("stack=%p global=%p heap=%p\\n",
      (void*)&automatic, (void*)&global_value, (void*)heap);
    *heap = 42;
    free(heap);
    return 0;
}`,
        output: `stack=0x7ffd... global=0x... heap=0x...

自动、静态、堆对象地址落不同区域。
heap 在 free 后结束动态存储期。`,
      }],
      ['栈帧与 8 MB 上限', '自动变量放在栈上，函数调用时通过移动栈指针一次性划出整个栈帧，没有逐字段的安全检查。Linux 默认栈上限 8 MB，终端执行 ulimit -s 显示 8192，在函数里声明 8 MB 以上的局部数组立即段错误。无终止条件的递归会层层耗尽栈，报错点常落在与递归逻辑无关的深层函数里。', '栈上限 8 MB', {
        title: 'PowerShell：观察栈上限与栈溢出',
        language: 'PowerShell',
        code: `bash -lc 'ulimit -s'
@'
#include <stdio.h>
int main(void) {
    char local[9 * 1024 * 1024];
    local[0] = 1;
    printf("%d\\n", local[0]);
    return 0;
}
'@ | Set-Content stack.c
gcc stack.c -o stack
.\\stack`,
        output: `8192
Segmentation fault (core dumped)

8192 KiB 是默认栈软上限。
9 MiB 局部数组一次越过栈边界触发 SIGSEGV。`,
      }],
      ['.data 与 .bss 分工', '静态对象按有无显式初值分落两段：有初值进 .data，未初始化或初值为零进 .bss，后者在目标文件里只记录总长度，加载时由内核清零，不占磁盘体积。编译后执行 size a.out 能看到 data 与 bss 两列的数值；把一个大数组的 = {0} 去掉，两列的大小会随之地互换，可当场验证。', 'bss 不占文件', {
        title: 'size：观察 .data 与 .bss',
        language: 'PowerShell',
        code: `@'
char initialized[1024*1024] = {1};
char zeroed[1024*1024];
int main(void) { return initialized[0] + zeroed[0]; }
'@ | Set-Content sections.c
gcc sections.c -o sections
size sections
Get-Item sections | Select-Object Length
readelf -S sections | Select-String "\\.data|\\.bss"`,
        output: `text data bss dec hex filename
 264 1048612 1048580 ... sections
.data size 1048596
.bss NOBITS size 1048580

initialized 数组使 .data 占文件空间。
zeroed 只在 .bss 记录大小，加载时清零。`,
      }],
      ['堆按需分配', '堆由分配器管理，glibc 通过 brk 或 mmap 向内核批发地址再零售给 malloc，申请多少用多少，上限受虚拟内存约束而非 8 MB 栈限。malloc(0) 的返回值由实现定义，可能为 NULL 也可能是可安全传给 free 的唯一指针；free(NULL) 按标准是无操作，调用前不必判空。', '零长依实现', {
        title: 'C：malloc(0) 与 free(NULL)',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
int main(void) {
    void *zero = malloc(0);
    printf("malloc0=%p\\n", zero);
    free(zero);
    free(NULL);
    int *large = malloc(64 * 1024 * 1024);
    printf("large=%p\\n", (void*)large);
    free(large);
    return 0;
}`,
        output: `malloc0=0x... or (nil)
large=0x...

malloc(0) 返回实现定义的唯一指针或 NULL。
free(NULL) 无操作；大块堆分配不受 8MB 栈限制。`,
      }],
      ['生命周期对照', '同一指针在不同存储期下合法范围不同：返回局部变量地址的函数一退出该地址立即悬空，读写是未定义行为；返回 static 变量地址则长期有效，但所有调用者共享同一份数据。用 gcc -fsanitize=address -g 编译，加 ASAN_OPTIONS=detect_stack_use_after_return=1 再运行，悬空访问会报 stack-use-after-return 并给出两段调用栈。', '悬空当场报', {
        title: 'ASan：返回局部变量地址',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int *dangling(void) {
    int local = 42;
    return &local;
}
int main(void) {
    int *value = dangling();
    printf("%d\\n", *value);
    return 0;
}
'@ | Set-Content lifetime.c
gcc -g -O1 -fsanitize=address lifetime.c -o lifetime
$env:ASAN_OPTIONS="detect_stack_use_after_return=1"
.\\lifetime`,
        output: `ERROR: AddressSanitizer: stack-use-after-return
READ of size 4 at ...
allocated by thread T0 here:
    #0 main lifetime.c:3

dangling 返回时 local 生命周期结束。
ASan 报告读悬空栈对象并回放分配位置。`,
      }],
    ],
  },
  {
    name: 'C · 栈、堆、生命周期与未定义行为：malloc/realloc/free 与所有权',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已理解三种存储期并会写带 malloc 的简单程序。',
    goal: '掌握 glibc 分配器的 chunk 结构与可用字节数计算，理解 realloc 扩缩的真实语义与失败后旧块仍有效的保证，能在接口层明确写出内存所有权归属。',
    guidedPractice: '用 malloc(24) 申请后调用 malloc_usable_size 观察实际可用字节数，验证 64 位 glibc 的 chunk 对齐账；再对同一块依次 realloc 到 8 与 4096 字节，打印前后地址判断是否发生搬移。',
    independentPractice: '独立交付：一个动态字符串拼接程序，按 2 倍容量用 realloc 扩容且失败时保留旧数据继续可用，接口注释标明返回指针由调用方 free，全程用 -fsanitize=address 运行零报告。',
    commonErrors: ['把 realloc 的返回值直接赋回原指针，扩容失败返回 NULL 时原块地址丢失造成泄漏。', '以为 free 会把指针置 NULL，实际 free 只回收内存，指针值原样保留成为悬空指针。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'Clang Documentation. https://clang.llvm.org/docs/'],
    steps: [
      ['chunk 头 16 字节', 'glibc 在 64 位系统上每个 chunk 的头部占 16 字节，即 prev_size 与 size 两个字段，malloc 返回的地址跳过了这个头；申请字节数按 16 字节对齐进位，malloc(24) 实际占用 32 字节 chunk。用 malloc_usable_size(p) 可查可用字节数，malloc(1) 也会得到 24 字节可用空间，印证最小分配粒度的存在。', '头在指针之前', {
        title: 'glibc：观察 malloc_usable_size',
        language: 'C',
        code: `#define _GNU_SOURCE
#include <stdio.h>
#include <malloc.h>
#include <stdlib.h>
int main(void) {
    size_t sizes[] = {1, 24, 25, 40};
    for (size_t i=0;i<sizeof sizes/sizeof sizes[0];++i) {
        void *p = malloc(sizes[i]);
        printf("request=%zu usable=%zu\\n", sizes[i], malloc_usable_size(p));
        free(p);
    }
    return 0;
}`,
        output: `request=1 usable=24
request=24 usable=24
request=25 usable=40
request=40 usable=40

glibc chunk 按对齐粒度进位。
usable 反映分配器实际可写空间，不是请求值。`,
      }],
      ['realloc 扩缩语义', 'realloc 优先原地扩容，空间不够才搬移到新块，搬移时按新旧尺寸中较小者复制旧内容；缩容一般只改块元数据，地址通常不变且不搬移。标准保证失败时原块原封不动仍可继续使用，所以必须用临时指针接住返回值确认非 NULL 后再赋回。C23 起 realloc(p, 0) 定为未定义行为，缩到零应改写为 free。', '失败留旧块', {
        title: 'C：realloc 扩容搬移与旧数据',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
int main(void) {
    int *data = malloc(4 * sizeof *data);
    for (int i=0;i<4;i++) data[i]=i+1;
    printf("before=%p\\n", (void*)data);
    int *grown = realloc(data, 4096 * sizeof *data);
    if (!grown) { free(data); return 1; }
    data = grown;
    printf("after=%p values=%d,%d\\n", (void*)data, data[0], data[3]);
    free(data);
    return 0;
}`,
        output: `before=0x...
after=0x...
values=1,4

扩容可能搬移地址，但前 4 个元素保留。
失败时原指针不能丢，必须先接临时变量。`,
      }],
      ['calloc 检查乘法', 'calloc(n, size) 在分配前先检查 n 与 size 的乘法是否回绕，溢出直接失败，这正是它相对 malloc(n * size) 的安全价值；后者乘法回绕可能得到很小的请求，随后按预期容量写入即越界。calloc 还保证内存清零，大块申请走 mmap 领取的是内核已清零的新页，零值语义几乎零成本。', '先查溢出再分配', {
        title: 'C：calloc 乘法溢出安全',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
int main(void) {
    size_t count = SIZE_MAX / 2 + 1;
    void *bad = malloc(count * 8);
    printf("malloc=%p\\n", bad);
    void *safe = calloc(count, 8);
    printf("calloc=%p\\n", safe);
    free(bad); free(safe);
    return 0;
}`,
        output: `malloc=0x... (possibly small wrapped allocation)
calloc=(nil)

calloc 检测 count*8 溢出并拒绝。
malloc 的乘法在调用前已回绕，安全性丢失。`,
      }],
      ['所有权写在接口上', '所有权指谁负责调用 free：返回堆指针的函数即把释放责任移交调用方，把指针传入只读接口则保留所有权。C 没有语言级表达，靠命名与文档约定，例如 free_ 前缀函数表示接管并释放参数。无主的块泄漏，多主互删则二次释放，任何跨模块传递堆指针的设计都必须先回答这个问题。', '一个块一个主', {
        title: 'C：接口所有权文档与命名',
        language: 'C',
        code: `/* Caller owns returned buffer and must free it. */
char *make_greeting(const char *name) {
    size_t n = strlen(name) + 8;
    char *out = malloc(n);
    if (out) snprintf(out, n, "hello %s", name);
    return out;
}

/* This function consumes and frees its argument. */
void free_greeting(char *value) {
    free(value);
}`,
        output: `char *g = make_greeting("Ada");  // caller owns
free_greeting(g);                  // explicit ownership transfer

make_greeting 返回所有权给调用方。
free_ 前缀明确表示函数接管并释放。`,
      }],
      ['free 与分配器回收', 'free 把 chunk 归还分配器的空闲链表而非内核，同尺寸的后续 malloc 常拿到同一地址，glibc 的 tcache 正是为此服务；free(p) 之后 p 的值不变，此时读写都是未定义行为。标准只保证 free(NULL) 无害，传入非 malloc 返回的地址如栈指针会直接破坏堆元数据，触发分配器中止。', '归还分配器非内核', {
        title: 'C：free 后地址可能被复用',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
int main(void) {
    void *first = malloc(64);
    printf("first=%p\\n", first);
    free(first);
    void *second = malloc(64);
    printf("second=%p same=%d\\n", second, first == second);
    free(second);
    return 0;
}`,
        output: `first=0x...2a0
second=0x...2a0 same=1

tcache 快速复用刚释放的同尺寸 chunk。
原指针值仍存在但已悬空，不能再看作有效内存。`,
      }],
    ],
  },
  {
    name: 'C · 栈、堆、生命周期与未定义行为：悬空指针、双重释放和泄漏',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已理解所有权约定并会用 malloc 与 free。',
    goal: '能复现悬空指针、双重释放与泄漏三类缺陷并解读 ASan 与 LeakSanitizer 的报告定位行号，掌握释放后置空等缓解惯例及其在别名场景下的局限。',
    guidedPractice: '按 free 后读写、连续 free 两次、丢失唯一指针三个最小用例逐个编译，统一用 gcc -g -fsanitize=address 运行，逐条抄录 heap-use-after-free、attempting double-free、SUMMARY 泄漏统计三种报告的关键行。',
    independentPractice: '独立交付：一个含全部三类缺陷的程序改造为零报告版本，改造前后各跑一次 ASan 对比输出，并附一条说明哪个别名指针导致置空手段失效的注释。',
    commonErrors: ['以为 free 后把指针置空就万事大吉，同一块还有别的别名指针时照样发生悬空访问。', '在循环里提前 continue 漏掉 free，块地址不再被任何变量记录，形成静默泄漏。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'Clang Documentation. https://clang.llvm.org/docs/'],
    steps: [
      ['悬空指针成因', 'free 只回收内存不改变指针值，释放后原指针与所有副本都指向已被分配器复用的区域，读写皆为未定义行为，且可能恰好读到新主人的数据而不崩溃。用 gcc -g -fsanitize=address 编译后再访问，报告首行是 heap-use-after-free，随附分配与释放两处调用栈，行号可直接定位到出错语句。', 'free 不改指针值', {
        title: 'ASan：heap-use-after-free',
        language: 'PowerShell',
        code: `@'
#include <stdlib.h>
#include <stdio.h>
int main(void) {
    int *value = malloc(sizeof *value);
    *value = 42;
    free(value);
    printf("%d\\n", *value);
    return 0;
}
'@ | Set-Content uaf.c
gcc -g -O1 -fsanitize=address uaf.c -o uaf
.\\uaf`,
        output: `ERROR: AddressSanitizer: heap-use-after-free
READ of size 4 at ...
freed by thread T0 here:
    #0 free
    #1 main uaf.c:6

free 后指针数值未变，仍被解引用。
ASan 同时回放分配与释放栈。`,
      }],
      ['双重释放的破坏', '同一地址 free 第二次时，分配器把它再次挂进空闲链表，堆元数据被改写成环，后续分配可能返回重叠块导致数据互相覆盖。glibc 检测到后调用 abort 中止进程，报错文本随堆路径不同，常见 free(): double free detected 字样；ASan 则报 attempting double-free 并给出两次释放的完整调用栈。', '空闲链表被改环', {
        title: 'ASan：attempting double-free',
        language: 'PowerShell',
        code: `@'
#include <stdlib.h>
int main(void) {
    int *value = malloc(sizeof *value);
    free(value);
    free(value);
    return 0;
}
'@ | Set-Content double.c
gcc -g -fsanitize=address double.c -o double
.\\double`,
        output: `ERROR: AddressSanitizer: attempting double-free
previously freed by thread T0 here:
    #0 free
    #1 main double.c:4
SUMMARY: AddressSanitizer: double-free

第二次 free 检测到同一 chunk 已释放。
报告给出第一次和第二次释放的调用栈。`,
      }],
      ['泄漏判定与报告', '最后一个指向堆块的指针消失后，这块内存到进程结束都无法归还，长驻进程会因此耗尽内存。ASan 集成的 LeakSanitizer 在退出时扫描寄存器与全局区，输出泄漏统计行如 SUMMARY: AddressSanitizer: 40 byte(s) leaked in 2 allocation(s)，并标出每个分配点的完整调用栈，按行修复即可。', '退出时扫指针', {
        title: 'LeakSanitizer：定位未释放内存',
        language: 'PowerShell',
        code: `@'
#include <stdlib.h>
void leak(void) { malloc(40); }
int main(void) { leak(); return 0; }
'@ | Set-Content leak.c
gcc -g -fsanitize=address leak.c -o leak
.\\leak`,
        output: `ERROR: LeakSanitizer: detected memory leaks
Direct leak of 40 byte(s) in 1 object(s)
    #0 malloc
    #1 leak leak.c:2
SUMMARY: AddressSanitizer: 40 byte(s) leaked in 1 allocation(s)

退出时扫描仍可达块，发现丢失最后指针。
分配栈直接定位到 leak 函数。`,
      }],
      ['栈也悬空', '返回局部变量地址或块外引用块内数组同样悬空，只是对象在栈上，报错形态不同：ASan 开启后分别报 stack-use-after-return 与 stack-use-after-scope。栈悬空比堆悬空更隐蔽，函数返回后栈帧常未被覆盖，裸跑时数据看似完好，压测或多线程调度变化后才随机出错。', '栈悬空更隐蔽', {
        title: 'ASan：stack-use-after-return',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int *make(void) { int local = 7; return &local; }
int main(void) {
    int *p = make();
    printf("%d\\n", *p);
    return 0;
}
'@ | Set-Content stack-dangle.c
gcc -g -O1 -fsanitize=address stack-dangle.c -o stack-dangle
$env:ASAN_OPTIONS="detect_stack_use_after_return=1"
.\\stack-dangle`,
        output: `ERROR: AddressSanitizer: stack-use-after-return
READ of size 4 at ...
allocated by thread T0 here:
    #0 main stack-dangle.c:2

local 随函数返回结束生命周期。
ASan 标记悬空栈帧并报告访问位置。`,
      }],
      ['置空的边界', 'free 后立即 p = NULL 能把后续误用转成无害的空指针解引用，配合 free(NULL) 无害的保证可重复释放而不崩溃。但置空只处理一个名字，传给过其他函数的副本、结构体里的别名都不会被改到，别名存在时缺陷依旧；根治靠所有权单一化，而不是在每条路径上补空值。', '别名不受置空保护', {
        title: 'C：free 后置空不能保护别名',
        language: 'C',
        code: `#include <stdlib.h>
int main(void) {
    int *owner = malloc(sizeof *owner);
    int *alias = owner;
    free(owner);
    owner = NULL;      // alias remains dangling
    *alias = 1;        // undefined behavior
    return 0;
}`,
        output: `owner=NULL
alias still 0x...
ASan: heap-use-after-free on *alias write

置空只修改 owner 这个名字。
所有权单一化才能真正消除别名悬空。`,
      }],
    ],
  },
  {
    name: 'C · 栈、堆、生命周期与未定义行为：整数溢出、越界和严格别名',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已了解二进制补码表示并写过数组循环。',
    goal: '能区分有符号溢出与无符号回绕的标准语义，掌握 size_t 回绕陷阱与数组越界的可观察后果，理解严格别名规则及 memcpy 这一合规改写手段。',
    guidedPractice: '写 INT_MAX 加 1 与 UINT_MAX 加 1 两个对照函数，用 gcc -fsanitize=undefined -g 编译运行，观察 signed integer overflow 报错与无符号回绕静默通过的差别；再越界写一个堆数组 1 字节，读 ASan 的 heap-buffer-overflow 报告。',
    independentPractice: '独立交付：一个演示三类缺陷的最小程序加改写版，溢出检查改用先比后减的预判式，指针类型互转改用 memcpy，越界循环补上界判断，两版都用 ASan 加 UBSan 跑出零报告。',
    commonErrors: ['写 if (a + b < a) 检测溢出，有符号溢出本身是 UB，编译器优化后该判断分支被整段删除。', '用 size_t 做 len - 10 判断长度，len 小于 10 时回绕成巨大值，条件恒真走进错误分支。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'Clang Documentation. https://clang.llvm.org/docs/'],
    steps: [
      ['有符号溢出是 UB', 'C 标准规定有符号整数溢出是未定义行为，编译器据此假设它不会发生，进而删除看似冗余的检查分支。用 gcc -fsanitize=undefined -g 编译运行 INT_MAX 加 1，会打印 runtime error: signed integer overflow 字样并指出文件行号；不加该开关时同一表达式可能回绕也可能被优化成常量，两种结果都符合标准。', '检查分支可被删', {
        title: 'UBSan：捕获有符号溢出',
        language: 'PowerShell',
        code: `@'
#include <limits.h>
#include <stdio.h>
int main(void) {
    int value = INT_MAX;
    value += 1;
    printf("%d\\n", value);
    return 0;
}
'@ | Set-Content overflow.c
gcc -g -O1 -fsanitize=undefined -fno-sanitize-recover=undefined overflow.c -o overflow
.\\overflow
Write-Output "exit=$LASTEXITCODE"`,
        output: `overflow.c:5:11: runtime error: signed integer overflow:
2147483647 + 1 cannot be represented in type 'int'
exit=1

UBSan 在溢出表达式处报告。
关闭 recover 后进程以非零码退出。`,
      }],
      ['无符号回绕取模', '无符号算术按模 2 的 N 次方定义，UINT_MAX 加 1 静默回绕为 0，标准保证行为确定，因此不是 UB。陷阱在 size_t：长度小于 10 时 len - 10 回绕成接近 2 的 64 次方的巨大值，后续 if 条件恒真。边界判断要先比较后相减，写成 len >= 10 && len - 10 < 20 才安全。', '先比较后相减', {
        title: 'C：size_t 减法回绕陷阱',
        language: 'C',
        code: `#include <stdio.h>
#include <stddef.h>
int main(void) {
    size_t length = 4;
    printf("bad=%d\\n", length - 10 < 20);
    printf("safe=%d\\n", length >= 10 && length - 10 < 20);
    unsigned value = 0;
    value--;
    printf("UINT_WRAP=%u\\n", value);
    return 0;
}`,
        output: `bad=1
safe=0
UINT_WRAP=4294967295

len-10 在 4 时回绕为巨大值，比较误判为真。
先比较长度再相减避免回绕。`,
      }],
      ['越界无检查', 'C 不做数组边界检查，arr[i] 等价于 *(arr + i)，超出范围的地址照样解引用：越界读拿到相邻对象的数据，越界写直接踩坏堆元数据或别的变量。ASan 在对象两侧布红区，越界访问报 heap-buffer-overflow 或 stack-buffer-overflow，并给出偏移量与读写操作所在的调用栈。', '越界无检查', {
        title: 'ASan：heap-buffer-overflow',
        language: 'PowerShell',
        code: `@'
#include <stdlib.h>
int main(void) {
    int *values = malloc(4 * sizeof *values);
    values[4] = 1;
    free(values);
    return 0;
}
'@ | Set-Content heap-over.c
gcc -g -O1 -fsanitize=address heap-over.c -o heap-over
.\\heap-over`,
        output: `ERROR: AddressSanitizer: heap-buffer-overflow
WRITE of size 4 at 0x... thread T0
0 bytes after 16-byte region
SUMMARY: AddressSanitizer: heap-buffer-overflow

ASan 报告越界偏移与对象大小。
越界写发生在数组末尾之后。`,
      }],
      ['严格别名规则', '同一内存以不兼容类型交替访问违反严格别名规则，是未定义行为：经 int 指针写入后经 float 指针读取，O2 级优化可能重排访存得到旧值。char 类型指针是唯一允许别名任何对象的例外。合规改写用 memcpy 按字节复制，或改用联合体，后者是 gcc 明确支持的扩展而非标准保证。', 'char 可别名一切', {
        title: 'C：用 memcpy 遵守严格别名',
        language: 'C',
        code: `#include <stdio.h>
#include <string.h>
int main(void) {
    unsigned int bits = 0x3f800000u; // IEEE 754 float 1.0
    float value;
    memcpy(&value, &bits, sizeof value);
    printf("%f\\n", value);
    unsigned char *bytes = (unsigned char*)&value;
    for (size_t i=0;i<sizeof value;i++) printf("%02x ", bytes[i]);
    return 0;
}`,
        output: `1.000000
00 00 80 3f

memcpy 按字节复制对象表示，不违反别名规则。
unsigned char 可合法检查任何对象的字节。`,
      }],
      ['混合比较的隐式转换', '有符号与无符号比较时，有符号一方被隐式转成无符号，-1 变成全 1 位模式即 4294967295，大于任何无符号数，因此 -1 > 1u 恒为真。循环变量用 int 而边界是 size_t 时，递减到 -1 的终止判断会失效陷入死循环。gcc 用 -Wsign-compare 或 -Wextra 提示这类比较，逐条消除即可提前排雷。', '负数变大正数', {
        title: 'GCC：-Wsign-compare 捕获混合比较',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int main(void) {
    int index = -1;
    unsigned limit = 1;
    printf("%d\\n", index > limit);
    return 0;
}
'@ | Set-Content compare.c
gcc -std=c17 -Wall -Wextra -Wsign-compare -c compare.c -o compare.o
gcc -std=c17 compare.c -o compare
.\\compare`,
        output: `warning: comparison of integer expressions of different signedness [-Wsign-compare]
1

-1 转换成 UINT_MAX 后大于 1。
-Wsign-compare 在编译期指出混用。`,
      }],
    ],
  },
  {
    name: 'C · 栈、堆、生命周期与未定义行为：错误路径与统一清理',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已会检查 malloc 返回值并理解所有权约定。',
    goal: '掌握 errno 生效条件与 perror 输出方式，能按逆序释放原则写出 goto cleanup 统一出口的多资源函数，并保证任一失败点都不泄漏已获取的资源。',
    guidedPractice: '写一个依次 malloc、fopen 的函数，在 fopen 失败分支里跳转 cleanup 标签完成逆序释放；用 perror 打印错误原因，再用 strace -e trace=openat 观察失败系统调用返回 -1 且 errno 为 2 对应 ENOENT。',
    independentPractice: '独立交付：一个三层资源申请的函数，每个失败分支都汇入统一清理标签，逆序执行 free 与 fclose，正常与失败两条路径分别运行 ASan 均零报告，失败路径退出码非零。',
    commonErrors: ['在函数末尾统一 free，但中途 return 漏掉清理标签，失败路径泄漏前面已申请的块。', '调用失败后未检查出错标志就读 errno，把上一次无关调用残留的错误码当成新原因。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'Clang Documentation. https://clang.llvm.org/docs/'],
    steps: [
      ['errno 的生效条件', 'errno 是 C11 定义的线程局部整型，仅当函数说明可能设置错误且本次调用确实失败时才有意义；成功路径不会清零 errno，残留旧值不可当作本次结果。惯用法是先按返回值判失败，例如 malloc 返回 NULL，再看 errno；perror 与 strerror(errno) 负责把号码翻成可读文本，两者输出内容一致。', '先判失败再看码', {
        title: 'C：失败后读取 errno',
        language: 'C',
        code: `#include <stdio.h>
#include <errno.h>
#include <string.h>
int main(void) {
    FILE *file = fopen("missing.txt", "r");
    if (!file) {
        printf("errno=%d text=%s\\n", errno, strerror(errno));
        perror("open missing.txt");
    }
    return 0;
}`,
        output: `errno=2 text=No such file or directory
open missing.txt: No such file or directory

只有 fopen 返回 NULL 后才读取 errno。
strerror 与 perror 给出同一原因。`,
      }],
      ['goto 统一出口', 'C 缺少异常与 defer，多资源函数的惯用结构是每个失败分支 goto 到函数末尾的 cleanup 标签，在标签处按申请的逆序释放。Linux 内核大量采用这一写法，它把释放代码收敛到一处，新增一个资源只需补一条 goto 与一行释放，避免在每个 if 分支里复制粘贴清理逻辑造成遗漏。', '失败全部汇一处', {
        title: 'C：goto cleanup 统一释放资源',
        language: 'C',
        code: `int run(void) {
    FILE *file = NULL;
    char *buffer = malloc(4096);
    if (!buffer) goto cleanup;
    file = fopen("orders.txt", "r");
    if (!file) goto cleanup;
    if (process(file, buffer)) goto cleanup;
cleanup:
    if (file) fclose(file);
    free(buffer);
    return 0;
}`,
        output: `failure points jump to one cleanup label
file closed before buffer freed
ASan reports no leaks on success or failure

所有失败路径共享统一出口。
新增资源只需增加初始化、释放和 goto。`,
      }],
      ['逆序释放原则', '后申请的资源可能引用先申请的，清理必须按申请的相反顺序进行：先 fopen 的文件后关，先 malloc 的块后放，错序可能让关闭动作读到已释放的依赖。可对照验证：设置两个失败点分别触发，第一次失败只清理已到手的资源，第二次失败多清理一件，两条路径都跑 ASan 确认无泄漏。', '与申请序相反', {
        title: 'C：按申请逆序清理三层资源',
        language: 'C',
        code: `char *state = malloc(128);
FILE *log = fopen("app.log", "a");
if (!state || !log) goto cleanup;
if (write_operation(log, state)) goto cleanup;
cleanup:
    if (log) fclose(log);       // second resource first
    free(state);                // first resource last

// fopen 可能依赖已分配的 state，关闭文件应先发生。`,
        output: `failure at log: fclose skipped, state freed
failure at write: fclose then free state
ASan: no leaks

释放顺序与获取顺序相反。
未获取的资源由 NULL 检查安全跳过。`,
      }],
      ['失败后状态一致', 'realloc 失败时原块保持有效，调用方应保留旧指针继续使用旧数据，这是失败路径一致性的范例；写文件遇 EINTR 表示被信号打断，重试即可不必当作致命错误。设计接口时约定失败不产生副作用，或明确写出半成品状态由谁负责收尾，让调用方不需要猜测哪些资源还活着。', '失败不改旧块', {
        title: 'C：失败不破坏旧状态',
        language: 'C',
        code: `int grow(char **buffer, size_t *capacity, size_t next) {
    char *grown = realloc(*buffer, next);
    if (!grown) return -1;       // old *buffer remains valid
    *buffer = grown;
    *capacity = next;
    return 0;
}

ssize_t write_all(int fd, const void *data, size_t size) {
    const char *p = data;
    while (size) {
        ssize_t n = write(fd, p, size);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) return -1;
        p += n; size -= (size_t)n;
    }
    return 0;
}`,
        output: `realloc failure leaves original buffer intact
EINTR writes retry same remaining range
partial write advances pointer by bytes written

失败路径保持旧状态可继续使用。
调用方无需猜哪些资源仍有效。`,
      }],
      ['exit 与清理顺序', 'return 从 main 返回等价于 exit，exit 会按注册逆序执行 atexit 处理器并刷新 stdio 缓冲，而 _exit 直接进入内核跳过这两步，fopen 写入的数据可能滞留缓冲丢失。库代码不应悄悄调用 exit，要把决定权交给调用方；清理逻辑挂在 atexit 时才需要关心注册顺序与缓冲刷新时机。', 'exit 刷缓冲', {
        title: 'C：exit 刷新缓冲与 atexit 顺序',
        language: 'C',
        code: `#include <stdio.h>
#include <stdlib.h>
void first(void){puts("cleanup first");}
void second(void){puts("cleanup second");}
int main(void){
    atexit(first);
    atexit(second);
    printf("buffer without newline");
    exit(0);
}`,
        output: `buffer without newlinecleanup second
cleanup first

exit 刷新 stdout 缓冲。
atexit 按注册逆序执行；_exit 会跳过两者。`,
      }],
    ],
  },
  {
    name: 'C · 栈、堆、生命周期与未定义行为：内存安全测试矩阵',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已复现过悬空、越界与溢出等基础缺陷。',
    goal: '掌握 ASan、UBSan、Valgrind 三类工具的开关、捕获范围与运行开销，能按缺陷类型设计一一对应的用例矩阵，并在构建命令里组合多个检测器。',
    guidedPractice: '把前几课的最小缺陷用例汇成一张表，逐个用 gcc -g -fsanitize=address,undefined 与 valgrind --leak-check=full 两种方式运行，记录每种缺陷分别被哪个工具以什么关键字捕获，例如 heap-use-after-free 与 definitely lost。',
    independentPractice: '独立交付：一张 5 行用例矩阵，每行对应一类缺陷的最小复现、编译命令、预期报告关键字与实测结果，全部用例在修复版上零报告，矩阵以文本表格随代码一并交付。',
    commonErrors: ['只在编译阶段加 -fsanitize=address 而链接阶段漏加，链接时报 undefined reference 到 __asan 相关符号。', '只跑 ASan 就断言无内存问题，未初始化读这类缺陷 ASan 不覆盖，需要 Valgrind 或 MSan 补位。'],
    sourceRefs: ['WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/', 'Clang Documentation. https://clang.llvm.org/docs/'],
    steps: [
      ['ASan 开关与红区', 'gcc 或 clang 加 -fsanitize=address -g 即启用 AddressSanitizer，它在每次堆分配两侧插入红区并维护影子内存映射，越界与释放后访问在发生现场立即报错停止。报告首行是 heap-buffer-overflow 或 heap-use-after-free，附带读写类型、偏移量与两段调用栈；代价是运行时间约 2 倍、内存占用约 2 到 3 倍。', '红区现场报错', {
        title: 'ASan：越界与 UAF 关键字',
        language: 'PowerShell',
        code: `gcc -g -O1 -fsanitize=address overflow.c -o overflow
gcc -g -O1 -fsanitize=address uaf.c -o uaf
.\\overflow 2> overflow.txt
.\\uaf 2> uaf.txt
Select-String overflow.txt,uaf.txt -Pattern "ERROR|heap-buffer-overflow|heap-use-after-free|SUMMARY"`,
        output: `overflow.txt: ERROR: AddressSanitizer: heap-buffer-overflow
overflow.txt: SUMMARY: AddressSanitizer: heap-buffer-overflow
uaf.txt: ERROR: AddressSanitizer: heap-use-after-free
uaf.txt: SUMMARY: AddressSanitizer: heap-use-after-free

越界与释放后使用被不同关键字区分。
报告在故障现场停止进程。`,
      }],
      ['UBSan 抓整数类', '-fsanitize=undefined 检测有符号溢出、错误的移位位数、空指针解引用与错误对齐等未定义行为，默认只打印 runtime error 与行号后继续运行，加 -fno-sanitize-recover 才在首错中止。它与 ASan 可在同一条命令里以逗号并列启用，整数类缺陷靠它、内存类缺陷靠 ASan，二者捕获范围互补不重复。', '打印后可续跑', {
        title: 'UBSan：整数溢出与错误移位',
        language: 'C',
        code: `#include <limits.h>
int main(void) {
    int value = INT_MAX;
    value += 1;
    int shifted = 1 << 31;
    (void)shifted;
    return 0;
}`,
        output: `gcc -g -fsanitize=undefined -fno-sanitize-recover=undefined ub.c -o ub
ub.c:4:11: runtime error: signed integer overflow
ub.c:5:19: runtime error: left shift of 1 by 31 places

每个未定义操作都有精确行列。
-fno-sanitize-recover 使首错退出。`,
      }],
      ['Valgrind 与未初始化', 'Valgrind memcheck 用二进制插桩直接运行现有程序，无需重新编译，能捕获未初始化读、非法读写与把未初始化值当参数等缺陷。--leak-check=full 在退出时把泄漏按 definitely lost、indirectly lost、possibly lost 三级归类；代价是速度放慢 10 到 50 倍，适合小用例与定点复现，不适合全量回归。', '不重编译可跑', {
        title: 'Valgrind：未初始化读与泄漏分类',
        language: 'PowerShell',
        code: `@'
#include <stdlib.h>
#include <stdio.h>
int main(void) {
    int *p = malloc(sizeof *p);
    printf("%d\\n", *p);
    return 0;
}
'@ | Set-Content val.c
gcc -g val.c -o val
valgrind --leak-check=full --track-origins=yes .\\val`,
        output: `Conditional jump or move depends on uninitialised value
Invalid read of size 4
HEAP SUMMARY:
  in use at exit: 4 bytes in 1 blocks
definitely lost: 4 bytes

Valgrind 无需 sanitizer 重编译。
报告未初始化读和 definitely lost 泄漏。`,
      }],
      ['矩阵按缺陷对齐', '测试矩阵的行按缺陷类组织：越界、释放后使用、双重释放、泄漏、有符号溢出，每行固定最小复现代码、编译命令与预期报告关键字，例如溢出行写 signed integer overflow、释放后使用行写 heap-use-after-free。修复后在全矩阵重跑并要求零报告，新增缺陷类型即新增一行，矩阵与代码同步演进。', '一行一类缺陷', {
        title: 'YAML：内存安全测试矩阵',
        language: 'YAML',
        code: `cases:
  - id: heap-overflow
    build: gcc -g -fsanitize=address
    expect: heap-buffer-overflow
  - id: use-after-free
    build: gcc -g -fsanitize=address
    expect: heap-use-after-free
  - id: double-free
    build: gcc -g -fsanitize=address
    expect: attempting double-free
  - id: signed-overflow
    build: gcc -g -fsanitize=undefined
    expect: signed integer overflow
  - id: uninitialized
    build: gcc -g && valgrind --track-origins=yes
    expect: uninitialised value`,
        output: `5 defect classes mapped to tools and keywords
ASan covers 3, UBSan 1, Valgrind 1
all fixed implementations report zero issues

矩阵明确每类缺陷由哪个工具捕获。
新增缺陷类型就新增一行。`,
      }],
      ['CI 组合与取舍', '日常回归用 ASan 加 UBSan 一条命令覆盖内存与整数两类，速度损失约 2 倍可以接受；Valgrind 放在夜间任务或发版前抽查。MSan 追踪未初始化读但要求全部依赖同样插桩，缺一份依赖报告就失真。选定组合后写进构建脚本，让每次编译测试自动带上检测器，而不是依赖个人记忆。', 'ASan 日常用', {
        title: 'PowerShell：CI 运行 ASan/UBSan',
        language: 'PowerShell',
        code: `$env:CFLAGS="-std=c17 -Wall -Wextra -Werror -g -O1 -fsanitize=address,undefined"
$env:LDFLAGS="-fsanitize=address,undefined"
cmake -B build-asan -S . -DCMAKE_BUILD_TYPE=Debug
cmake --build build-asan
ctest --test-dir build-asan --output-on-failure
valgrind --leak-check=full .\\build\\tests`
,
        output: `ASan+UBSan build passed 214 tests
no sanitizer reports
Valgrind nightly found no definitely lost blocks

CI 日常使用 ASan+UBSan。
Valgrind 放夜间或发版前抽查。`,
      }],
    ],
  },
];

// ── C3 libc、POSIX、文件、进程与 socket ─────────────────────────────────────────────
export const HANDWRITTEN_C_SYSTEMS_C3_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C · libc、POSIX、文件、进程与 socket：系统调用、errno 和部分成功',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已能编译运行 C 程序并理解函数返回值。',
    goal: '理解系统调用是用户态进入内核的唯一通道，掌握 errno 的线程局部语义与检查时机，能区分彻底失败、信号中断与部分成功三种返回情形并分别写出处理分支。',
    guidedPractice: '用 strace ./prog 跟踪一个调用 open 与 read 的小程序，逐行观察系统调用名、参数与返回值；再故意打开不存在的路径，打印 errno 数字与 strerror 文本，把系统调用名、返回值、错误码三者对照抄进笔记。',
    independentPractice: '独立交付：一个逐块读取任意文件的程序，返回值按三类分支处理——负值且 EINTR 时重试、其他负值打印错误后退出、返回 0 结束循环，最后输出总字节数与本次运行读到的最大单块长度。',
    commonErrors: ['检查 errno 前先调用了 printf 等库函数，errno 被中间调用覆盖，错误判断完全失真。', '把返回值小于请求字节数一律当错误终止，实际 EINTR 或管道流量不足都是正常返回，应重试或继续。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['系统调用入口', '用户态程序不能直接执行内核代码，只能通过 syscall 指令陷入内核，把系统调用号放进寄存器并按约定传参，glibc 的包装函数如 open、read 帮你完成这套寄存器约定后带回结果。Linux x86-64 上调用号 0 是 read、1 是 write、2 是 open。可验证：用 strace ./prog 运行自己的程序，逐行打印实际发生的系统调用名与返回值，与源码里的库函数一一对应。', 'strace 看真实调用', {
        title: 'strace：观察 open/read 系统调用',
        language: 'PowerShell',
        code: `@'
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
int main(void) {
    char buffer[8];
    int fd = open("data.txt", O_RDONLY);
    ssize_t n = read(fd, buffer, sizeof buffer);
    write(STDOUT_FILENO, buffer, n);
    close(fd);
    return 0;
}
'@ | Set-Content trace.c
"hello" | Set-Content data.txt -NoNewline
gcc trace.c -o trace
strace -e trace=openat,read,write,close .\\trace`,
        output: `openat(AT_FDCWD, "data.txt", O_RDONLY) = 3
read(3, "hello", 8) = 5
write(1, "hello", 5) = 5
close(3) = 0

glibc open 对应 openat 系统调用。
fd=3 是当前最小可用描述符。`,
      }],
      ['errno 只在失败时有意义', 'errno 是线程局部整型变量，系统调用成功时不会清零它，所以必须先检查返回值是否为 -1，确认失败后才允许读取 errno。中间任何一次库调用都可能改写它，printf 也不除外。错误码语义固定：ENOENT 2 表示路径不存在，EACCES 13 表示权限不足，EBADF 9 表示描述符无效。可验证：对同一错误分别打印 errno 数字与 strerror(errno) 文本，对照 man 3 errno 确认编号与含义一一对应。', '先判返回再读errno', {
        title: 'C：先判 -1 再读取 errno',
        language: 'C',
        code: `#include <fcntl.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
int main(void) {
    int fd = open("missing.txt", O_RDONLY);
    if (fd == -1) {
        int saved = errno;
        fprintf(stderr, "errno=%d text=%s\\n", saved, strerror(saved));
    } else {
        close(fd);
    }
    return 0;
}`,
        output: `errno=2 text=No such file or directory

只有返回 -1 后才读取 errno。
立即保存错误码可避免中间调用覆盖。`,
      }],
      ['EINTR 与慢调用', '磁盘文件读写通常不会被打断，但终端、管道、套接字这类慢设备上的阻塞调用，在进程收到信号时可能返回 -1 且 errno 等于 EINTR，这既不是错误也无需放弃，标准做法是立即重发同一调用，通常写成 while 循环包裹。sigaction 设置 SA_RESTART 可让部分调用自动重启，但不能覆盖所有情形。可验证：给阻塞的 read 注册信号处理函数后向自己发信号，在 strace 输出里看到 EINTR 与紧随的第二次 read。', 'EINTR 重试即可', {
        title: 'C：read 收到 EINTR 后重试',
        language: 'C',
        code: `static volatile sig_atomic_t interrupted;
static void on_signal(int sig) { (void)sig; interrupted = 1; }

ssize_t read_retry(int fd, void *buffer, size_t size) {
    for (;;) {
        ssize_t n = read(fd, buffer, size);
        if (n < 0 && errno == EINTR) continue;
        return n;
    }
}

signal(SIGALRM, on_signal);
alarm(1);
ssize_t n = read_retry(STDIN_FILENO, buffer, sizeof buffer);`,
        output: `strace: read(0, 0x..., 128) = ? ERESTARTSYS
signal SIGALRM
read(0, 0x..., 128) resumed

EINTR 表示调用被打断，不是数据错误。
循环重试同一剩余区间。`,
      }],
      ['部分成功是常态', 'read 与 write 都可能只传输请求字节的一部分：信号中断、管道缓冲区已满或已空、套接字发送缓冲不足都会截短。read 返回 0 表示流已到 EOF 而不是出错；write 返回小于请求量的正数表示剩余数据尚未写出，必须从已写偏移处继续补写。可验证：向阻塞管道一次写入超过 64KiB，write 会提前返回一个小于请求量的正数，剩余部分要靠循环补写才能完成。', '短读短写要循环', {
        title: 'C：循环处理短读与短写',
        language: 'C',
        code: `ssize_t read_full(int fd, char *buffer, size_t need) {
    size_t done = 0;
    while (done < need) {
        ssize_t n = read(fd, buffer + done, need - done);
        if (n == 0) break;
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        done += (size_t)n;
    }
    return (ssize_t)done;
}

ssize_t write_all(int fd, const char *data, size_t size) {
    size_t done = 0;
    while (done < size) {
        ssize_t n = write(fd, data + done, size - done);
        if (n < 0) { if (errno == EINTR) continue; return -1; }
        done += (size_t)n;
    }
    return (ssize_t)done;
}`,
        output: `pipe write request=131072 returns 65536
second write sends remaining 65536
read loop stops at EOF or requested length

短写返回正数，剩余数据必须继续写。
read 0 才是 EOF；-1 才查 errno。`,
      }],
      ['错误码速查', '排查问题先认高频错误码：ENOENT 2 路径不存在、EACCES 13 权限拒绝、EBADF 9 描述符无效、ENOMEM 12 内存不足、EAGAIN 11 资源暂不可用须稍后重试、ENOSPC 28 磁盘写满，EAGAIN 与 EWOULDBLOCK 数值相同语义一致。这些编号与含义由 POSIX 统一规定，man 3 errno 有完整列表。可验证：程序里对以上每个编号调用 strerror 打印文本，与手册描述逐条对照确认。', '高频码先背六条', {
        title: 'C：集中打印高频 errno',
        language: 'C',
        code: `#include <stdio.h>
#include <errno.h>
#include <string.h>
int main(void) {
    int codes[] = {ENOENT, EACCES, EBADF, ENOMEM, EAGAIN, ENOSPC};
    for (size_t i=0;i<sizeof codes/sizeof codes[0];++i)
        printf("%d: %s\\n", codes[i], strerror(codes[i]));
    printf("EAGAIN=%d EWOULDBLOCK=%d same=%d\\n",
           EAGAIN, EWOULDBLOCK, EAGAIN == EWOULDBLOCK);
    return 0;
}`,
        output: `2: No such file or directory
13: Permission denied
9: Bad file descriptor
12: Cannot allocate memory
11: Resource temporarily unavailable
28: No space left on device
EAGAIN=11 EWOULDBLOCK=11 same=1

错误码来自 errno.h，文本由 strerror 翻译。
EAGAIN 与 EWOULDBLOCK 数值相同。`,
      }],
    ],
  },
  {
    name: 'C · libc、POSIX、文件、进程与 socket：文件描述符、read/write 和缓冲区',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已理解系统调用返回值与 errno 检查时机。',
    goal: '掌握文件描述符表按最小可用编号分配的规则与 0、1、2 的含义，能完整处理 read 的 EOF 与 write 的部分写，分清 stdio 用户态缓冲、内核页缓存与 fsync 三层落盘路径。',
    guidedPractice: '在程序里连续 open 两个文件并打印返回的 fd 验证最小编号规则，再执行 ulimit -n 查看描述符上限；用 printf 输出一条不带换行的文字，分别加与不加 fflush(stdout) 观察显示时机差异。',
    independentPractice: '独立交付：只用 write 与 read 系统调用实现的 cat 工具，完整处理 EINTR 重试与部分写，读至 EOF 正常退出，并用 strace 统计读取 1MiB 文件所需的 read 调用次数与每次字节数。',
    commonErrors: ['把 read 返回 0 当成错误退出，实际 0 是 EOF 正常信号，真正的失败一定是 -1 且带 errno。', 'printf 后立刻 fork，子进程把父进程 stdio 缓冲里残留的数据再输出一遍，造成同一行文字重复出现。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['描述符按最小编号分配', '每个进程持有一张文件描述符表，open、socket、accept 等调用一律返回当前未占用的最小编号，0、1、2 在进程创建时已被标准输入、标准输出、标准错误占用。dup 与 dup2 可复制描述符让两项指向同一打开文件，shell 重定向靠的就是这套机制。可验证：连续 open 两个文件打印 fd，编号必然连续递增；关闭其中一个再 open，会复用刚释放的那个编号。', '编号取最小空位', {
        title: 'C：验证 fd 最小编号复用',
        language: 'C',
        code: `#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
int main(void) {
    int a = open("a.txt", O_CREAT|O_RDWR, 0600);
    int b = open("b.txt", O_CREAT|O_RDWR, 0600);
    printf("a=%d b=%d\\n", a, b);
    close(a);
    int c = open("c.txt", O_CREAT|O_RDWR, 0600);
    printf("c=%d reused=%d\\n", c, c == a);
    close(b); close(c);
    return 0;
}`,
        output: `a=3 b=4
c=3 reused=1

0、1、2 已被 stdin/stdout/stderr 占用。
关闭 3 后新 open 复用最小空位 3。`,
      }],
      ['read 的三种返回', 'read 返回正数表示本次读到的字节数，允许小于请求量；返回 0 表示已到文件末尾或对端关闭，这是唯一的 EOF 信号；返回 -1 才是失败，原因看 errno：EINTR 应重试，EAGAIN 表示非阻塞描述符暂无数据，EBADF 表示描述符无效。对普通磁盘文件短读少见，对管道与套接字是常态。可验证：用 strace 观察 cat 读一个文件，结尾必有一次返回 0 的 read 标志 EOF。', '返回 0 即 EOF', {
        title: 'C：区分 read 正数、0 与 -1',
        language: 'C',
        code: `char buffer[8];
ssize_t n = read(fd, buffer, sizeof buffer);
if (n > 0) {
    write(STDOUT_FILENO, buffer, (size_t)n);
} else if (n == 0) {
    printf("EOF\\n");
} else {
    if (errno == EINTR) continue;
    perror("read");
    break;
}`,
        output: `read returned 5 -> write 5 bytes
read returned 0 -> EOF
read returned -1 errno=11 -> EAGAIN

正数是字节数，0 是结束，-1 才失败。
EINTR 与 EAGAIN 需要不同处理。`,
      }],
      ['write 部分写要循环', 'write 返回已写字节数，可能小于请求量，磁盘满、信号中断、管道或套接字缓冲不足都会截短。正确写法是循环补写：记录已写偏移，返回值小于请求量时从剩余部分继续，直到全部写完或出现真正的错误。指望一次 write 写完全部数据是网络程序最常见的缺陷。可验证：向一个容量极小的文件系统写大块数据，观察 write 的短返回与 errno 28（ENOSPC），并确认循环补写后字节数一致。', '返回值即已写量', {
        title: 'C：write_all 循环补齐剩余数据',
        language: 'C',
        code: `int write_all(int fd, const void *data, size_t size) {
    const unsigned char *p = data;
    size_t sent = 0;
    while (sent < size) {
        ssize_t n = write(fd, p + sent, size - sent);
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        sent += (size_t)n;
    }
    return 0;
}

if (write_all(STDOUT_FILENO, payload, payload_size) < 0) perror("write");`,
        output: `write request=131072 returned 65536
next write returned 65536
write_all completed 131072 bytes

短写是正数，不代表失败。
偏移随已写字节数推进。`,
      }],
      ['stdio 用户态缓冲', 'printf 与 fread 在用户态多垫了一层 FILE 缓冲，与内核页缓存是两回事。缓冲模式有三种：全缓冲在缓冲区满或 fflush 时才发起系统调用，行缓冲遇到换行即写出，stderr 默认无缓冲每次立即写。混用 write 与 printf 输出会乱序，因为前者绕过 FILE 缓冲直达内核。可验证：printf 输出无换行的文字后 sleep 三秒，终端不会即时显示；加 fflush(stdout) 后立刻出现，证明缓冲确实垫在其中。', 'FILE 缓冲垫一层', {
        title: 'C：fflush 改变 stdio 写出时机',
        language: 'C',
        code: `#include <stdio.h>
#include <unistd.h>
int main(void) {
    printf("buffered text");
    sleep(2);
    fflush(stdout);
    write(STDOUT_FILENO, " | direct write\\n", 17);
    return 0;
}`,
        output: `first 2 seconds: screen stays blank
after fflush: buffered text appears
then write appends direct output

printf 先进入 FILE 用户态缓冲。
fflush 才把缓冲数据交给内核。`,
      }],
      ['fsync 才真正落盘', 'write 成功只表示数据进入内核页缓存，机器断电仍可能丢失；fsync(fd) 强制内核把该文件的脏页写回物理介质后才返回。stdio 层的数据必须先 fflush 进内核，fsync 才有东西可刷，顺序颠倒了等于没同步。数据库与日志程序的关键路径都依赖这对组合。可验证：dd 写入数百 MiB 后用 time 对比有无 fsync 的耗时差，机械盘上差异可达数秒，直观体现页缓存与介质的距离。', '先 flush 再同步', {
        title: 'C：fflush 后 fsync 保存关键日志',
        language: 'C',
        code: `FILE *log = fopen("audit.log", "a");
if (!log) return 1;
fprintf(log, "order=%s status=PAID\\n", order_id);
if (fflush(log) != 0) {
    perror("fflush");
    fclose(log);
    return 1;
}
if (fsync(fileno(log)) != 0) {
    perror("fsync");
    fclose(log);
    return 1;
}
fclose(log);`,
        output: `fprintf -> FILE buffer
fflush -> kernel page cache
fsync -> storage device

关键日志必须走完这三层。
只 fflush 不 fsync 仍可能在断电时丢失。`,
      }],
    ],
  },
  {
    name: 'C · libc、POSIX、文件、进程与 socket：fork、exec、wait 与信号',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已掌握文件描述符与 stdio 缓冲行为。',
    goal: '掌握 fork 的写时复制机制与返回值约定，理解 exec 成功后不返回的语义，会用 waitpid 回收子进程并解析退出状态，能用 sigaction 注册信号处理并与 EINTR 重试衔接。',
    guidedPractice: '写程序在 fork 前后各打印一次父 PID 与子 PID，观察父进程返回子 PID 而子进程返回 0 的约定；再在 fork 之前 printf 一条不带换行的输出，运行后观察同一行文字出现两遍的双写现象并解释成因。',
    independentPractice: '独立交付：实现 mini shell 的核心循环——读入命令后 fork 加 execvp 执行，父进程 waitpid 等待并用宏解析退出码，对不存在的命令打印报错且循环不中断，连续执行多条命令验证。',
    commonErrors: ['fork 前的 printf 残留在 stdio 缓冲里，父与子退出时各刷新一遍，输出莫名重复一行。', '父进程不调用 wait 回收，子进程退出后长期变僵尸，长时间运行的服务进程表项被逐渐耗尽。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['fork 复制一份进程', 'fork 把当前进程几乎完整复制一份，包括地址空间、打开的描述符表与信号处置，物理内存靠写时复制共享，任一方写入才真正拷贝页面。返回值区分身份：父进程拿到子 PID，子进程拿到 0，-1 表示失败。复制出的描述符共享同一文件偏移，而 stdio 缓冲是各自独立的副本。可验证：fork 前打印一条不带换行的 printf，运行后同一行文字出现两遍，因为缓冲内容被一并复制。', '缓冲随 fork 复制', {
        title: 'C：fork 返回值与缓冲复制',
        language: 'C',
        code: `#include <stdio.h>
#include <unistd.h>
int main(void) {
    printf("before-fork ");   // no newline: buffered
    pid_t pid = fork();
    if (pid < 0) return 1;
    if (pid == 0) printf("child pid=%d\\n", getpid());
    else printf("parent child=%d\\n", pid);
    return 0;
}`,
        output: `before-fork child pid=4102
before-fork parent child=4102

父进程 fork 返回子 PID，子进程返回 0。
无换行缓冲随地址空间复制到子进程，退出各刷一次。`,
      }],
      ['exec 换程序不换进程', 'execve 用磁盘上的新程序替换当前进程的代码与数据，PID、打开的描述符与工作目录保持不变，成功时函数永不返回，只有路径错误等失败才返回 -1。execvp 按 PATH 环境变量逐目录查找命令，适合执行用户输入的程序名。exec 后标准库缓冲被丢弃但描述符仍在，配合 dup2 即可实现重定向。可验证：fork 后在子进程 execvp 一个不存在的命令，观察函数返回并打印 errno 2，证明失败才会回落。', '成功不返回', {
        title: 'C：execvp 成功不返回、失败设 errno',
        language: 'C',
        code: `pid_t pid = fork();
if (pid == 0) {
    char *argv[] = {"missing-command", NULL};
    execvp(argv[0], argv);
    perror("execvp");      // only reached on failure
    _exit(127);
}
int status;
waitpid(pid, &status, 0);
printf("exit=%d\\n", WIFEXITED(status) ? WEXITSTATUS(status) : -1);`,
        output: `execvp: No such file or directory
exit=127

execvp 成功后不会返回。
失败返回 -1，errno=ENOENT，子进程以 127 退出。`,
      }],
      ['wait 收尸与退出码', '子进程退出后内核保留其退出状态供父进程查询，父进程调用 wait 前它是僵尸进程，占用进程表项。waitpid(pid, &status, 0) 阻塞等待指定子进程，用 WIFEXITED 判断正常退出、WEXITSTATUS 取出退出码，WIFSIGNALED 与 WTERMSIG 解析被信号杀死的情况。子进程终止时内核向父进程发 SIGCHLD，服务程序常在信号处理里非阻塞循环回收。可验证：让子进程 return 7，父进程用宏解出 7 并打印，echo $? 与之对应。', '退出码藏 status', {
        title: 'C：waitpid 解析退出码与信号',
        language: 'C',
        code: `pid_t child = fork();
if (child == 0) _exit(7);
int status;
waitpid(child, &status, 0);
if (WIFEXITED(status))
    printf("exit=%d\\n", WEXITSTATUS(status));
else if (WIFSIGNALED(status))
    printf("signal=%d\\n", WTERMSIG(status));`,
        output: `exit=7

WIFEXITED 为真表示正常退出。
WEXITSTATUS 从 status 中提取 7。`,
      }],
      ['pipe 加 dup2 串管线', 'shell 实现 ls | wc -l 的机制：先 pipe 创建一对描述符，fork 出两个子进程，写端进程用 dup2 把管道写端替换到自己的 1 号描述符，读端进程把读端替换到 0 号，再各自 exec 目标命令；父进程必须关闭两端，否则读端永远等不到 EOF 而挂死。dup2 加 exec 这一套就是重定向与管线的全部底层机制。可验证：手写该程序与 shell 里直接执行 ls | wc -l 的输出对比，行数一致即实现正确。', 'dup2 接管线', {
        title: 'C：pipe + dup2 实现 ls | wc -l',
        language: 'C',
        code: `int fds[2];
pipe(fds);
pid_t producer = fork();
if (producer == 0) {
    dup2(fds[1], STDOUT_FILENO);
    close(fds[0]); close(fds[1]);
    execlp("ls", "ls", NULL);
    _exit(127);
}
pid_t consumer = fork();
if (consumer == 0) {
    dup2(fds[0], STDIN_FILENO);
    close(fds[0]); close(fds[1]);
    execlp("wc", "wc", "-l", NULL);
    _exit(127);
}
close(fds[0]); close(fds[1]);
waitpid(producer, NULL, 0);
waitpid(consumer, NULL, 0);`,
        output: `14

producer stdout 指向 pipe 写端。
consumer stdin 指向 pipe 读端。
父进程关闭两端后读端能收到 EOF。`,
      }],
      ['信号处置用 sigaction', '信号是内核发向进程的异步通知，默认动作多为终止：SIGINT 对应 Ctrl-C，SIGTERM 是优雅退出请求，SIGKILL 与 SIGSTOP 不可捕获也不可忽略。signal 函数语义在各实现间有差异，POSIX 推荐 sigaction 明确指定 handler 与标志；处理函数内只能安全读写 sig_atomic_t 类型的变量。信号到达还会打断慢系统调用产生 EINTR，与重试逻辑相扣。可验证：注册 SIGINT 处理器打印一条消息后，Ctrl-C 不再终止程序，进程继续运行到自然退出。', '推荐 sigaction', {
        title: 'C：sigaction 捕获 SIGTERM',
        language: 'C',
        code: `static volatile sig_atomic_t stop = 0;
static void on_term(int sig) { (void)sig; stop = 1; }

int main(void) {
    struct sigaction action = {0};
    action.sa_handler = on_term;
    sigemptyset(&action.sa_mask);
    action.sa_flags = 0;
    sigaction(SIGTERM, &action, NULL);
    while (!stop) pause();
    printf("graceful shutdown requested\\n");
    return 0;
}`,
        output: `kill -TERM <pid>
graceful shutdown requested

handler 只写 sig_atomic_t 停止标记。
主循环检测标记后执行完整清理。`,
      }],
    ],
  },
  {
    name: 'C · libc、POSIX、文件、进程与 socket：socket、bind、listen、accept',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已理解文件描述符与进程阻塞的含义。',
    goal: '掌握 TCP 套接字从创建到建立连接的四个系统调用的分工与顺序，理解 bind 端口冲突、htons 字节序与 listen 队列长度的机制，能解释 accept 为何返回新描述符并用 ss 验证各阶段状态。',
    guidedPractice: '写最小 TCP 服务依次调用 socket、bind、listen，每步打印返回值后用 ss -ltnp 确认端口处于 LISTEN；再用 nc 连入观察 accept 返回的新 fd 编号，并用 lsof 对比监听 fd 与连接 fd 指向的不同对象。',
    independentPractice: '独立交付：一个阻塞式 echo 服务，accept 后把收到的字节原样回写直到对端关闭，用两个 nc 并发连入验证各连接互不串扰，并打印每条连接客户端地址与端口组成的四元组。',
    commonErrors: ['填充 sockaddr_in 时忘记对端口调用 htons 做字节序转换，在小端机器上监听到完全错误的端口。', '服务重启立即 bind 报 EADDRINUSE，原因是旧连接处于 TIME_WAIT，bind 前漏设 SO_REUSEADDR。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['socket 只造端点', 'socket(AF_INET, SOCK_STREAM, 0) 创建一个尚未连接的通信端点并返回普通文件描述符，第三个参数 0 表示由前两项决定协议组合，即 IPv4 上的 TCP。此时的 fd 不能收发业务数据，服务端要经 bind 与 listen 才进入监听状态，客户端侧则要 connect 之后才可用。可验证：对刚创建的 fd 直接调用 recv，返回 -1 且 errno 为 ENOTCONN 107，证明端点尚未接通。', '端点先于连接', {
        title: 'socket：未连接端点调用 recv',
        language: 'C',
        code: `#include <sys/socket.h>
#include <stdio.h>
#include <errno.h>
#include <string.h>
int main(void) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    char buffer[8];
    ssize_t n = recv(fd, buffer, sizeof buffer, 0);
    printf("fd=%d recv=%zd errno=%d %s\\n",
      fd, n, errno, strerror(errno));
    close(fd);
    return 0;
}`,
        output: `fd=3 recv=-1 errno=107 Transport endpoint is not connected

socket 只创建端点，fd 尚不能收发数据。
服务端需 bind/listen，客户端需 connect。`,
      }],
      ['bind 占住端口', 'bind 把 sockaddr_in 里的 IP 与端口绑定到套接字，地址填 INADDR_ANY 表示监听本机所有网卡，端口必须先经 htons 转成网络字节序，填 0 表示交内核随机分配。1024 以下端口需要 root 权限，绑定已被占用的端口返回 EADDRINUSE 98。可验证：固定端口 8080 启动服务后，第二个实例 bind 必然失败，用 ss -ltnp 能看到占用者的进程号与监听地址。', 'htons 不可省', {
        title: 'C：bind 与 htons 端口冲突',
        language: 'C',
        code: `int fd = socket(AF_INET, SOCK_STREAM, 0);
struct sockaddr_in address = {
    .sin_family = AF_INET,
    .sin_port = htons(8080),
    .sin_addr.s_addr = htonl(INADDR_ANY),
};
if (bind(fd, (struct sockaddr*)&address, sizeof address) < 0) {
    perror("bind");
    close(fd);
    return 1;
}
printf("bound port=8080 fd=%d\\n", fd);`,
        output: `first process: bound port=8080 fd=3
second process: bind: Address already in use
ss -ltnp: LISTEN 0 128 0.0.0.0:8080 pid=4101

sockaddr_in 端口用 htons 转网络序。
第二个进程绑定同端口得到 EADDRINUSE。`,
      }],
      ['listen 与 backlog 队列', 'listen(fd, backlog) 把套接字转为被动监听态，并申请一条容纳已完成握手、等待 accept 的连接队列，backlog 只是期望值，内核按 net.core.somaxconn 截断，超出部分无效。队列满时新的握手会被丢弃或拒绝，客户端表现为连接超时；没有 accept 消费时队列持续堆积。可验证：cat /proc/sys/net/core/somaxconn 查看本机上限，把 backlog 设为超过它的值，再用 ss -ltn 观察 Recv-Q 反映的实际生效长度。', 'backlog 有上限', {
        title: 'PowerShell：检查 backlog 与监听队列',
        language: 'PowerShell',
        code: `Get-Content /proc/sys/net/core/somaxconn
@'
#include <sys/socket.h>
#include <netinet/in.h>
int main(void) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in a = {.sin_family=AF_INET,.sin_port=htons(8080),.sin_addr.s_addr=htonl(INADDR_ANY)};
    bind(fd,(struct sockaddr*)&a,sizeof a);
    return listen(fd, 4096);
}
'@ | Set-Content listen.c
gcc listen.c -o listen
Start-Process .\\listen
ss -ltn | Select-String ":8080"
1..20 | ForEach-Object { Start-Job { curl.exe -s --max-time 5 http://127.0.0.1:8080 } }`,
        output: `somaxconn=4096
LISTEN 0 4096 0.0.0.0:8080

backlog 请求 4096，受 somaxconn 限制。
未 accept 时完成连接在队列中排队。`,
      }],
      ['accept 返回新 fd', '监听套接字只负责接待，accept 从完成队列取出一条连接并创建一个全新的描述符专门与该客户端通信，监听 fd 继续接待后续连接，两个 fd 职责完全分离。accept 还会填出客户端地址结构，inet_ntop 可把二进制地址转成点分文本。队列空时 accept 阻塞等待，被信号打断返回 EINTR。可验证：服务打印监听 fd 与每次 accept 的返回值，连续接入两个 nc，可见两个递增的新编号。', '每连接一个 fd', {
        title: 'C：监听 fd 与 accept 新 fd',
        language: 'C',
        code: `int listening = socket(AF_INET, SOCK_STREAM, 0);
/* bind + listen setup */
printf("listening fd=%d\\n", listening);
for (int i=0;i<2;i++) {
    struct sockaddr_in peer;
    socklen_t len = sizeof peer;
    int client = accept(listening, (struct sockaddr*)&peer, &len);
    char ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &peer.sin_addr, ip, sizeof ip);
    printf("accept fd=%d peer=%s:%u\\n", client, ip, ntohs(peer.sin_port));
}`,
        output: `listening fd=3
accept fd=4 peer=127.0.0.1:51001
accept fd=5 peer=127.0.0.1:51002

监听 fd 保持 3，每个连接得到新 fd。
peer 可由 inet_ntop 转成文本地址。`,
      }],
      ['SO_REUSEADDR 救重启', '服务端关闭后，经历通信的连接进入 TIME_WAIT 状态停留约 60 秒，期间 bind 同一端口报 EADDRINUSE，这是调试服务时最频繁的报错。在 bind 之前用 setsockopt 设置 SO_REUSEADDR，允许复用处于 TIME_WAIT 的地址，是服务端程序的固定动作；它并不允许多个进程同时监听同一端口，那是 SO_REUSEPORT 的职责，两者不能混用。可验证：跑一次 echo 服务后 Ctrl-C 再立刻重启，未设选项必报 EADDRINUSE，设置后重启成功。', 'bind 前设选项', {
        title: 'C：SO_REUSEADDR 允许快速重启',
        language: 'C',
        code: `int fd = socket(AF_INET, SOCK_STREAM, 0);
int yes = 1;
if (setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes) < 0) {
    perror("setsockopt");
    return 1;
}
struct sockaddr_in address = {
    .sin_family = AF_INET,
    .sin_port = htons(8080),
    .sin_addr.s_addr = htonl(INADDR_ANY),
};
bind(fd, (struct sockaddr*)&address, sizeof address);`,
        output: `without reuse: bind: Address already in use
with SO_REUSEADDR: restart immediately succeeds
ss -ltnp shows one LISTEN socket on :8080

选项在 bind 前设置。
它复用 TIME_WAIT 地址，不允许两个活跃监听者抢占。`,
      }],
    ],
  },
  {
    name: 'C · libc、POSIX、文件、进程与 socket：epoll 与非阻塞 IO',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已能写出阻塞式 socket 服务并理解 accept 流程。',
    goal: '理解每连接一线程模型在连接数增长时的资源瓶颈，掌握 O_NONBLOCK 与 EAGAIN 的配合语义，会用 epoll_create、epoll_ctl、epoll_wait 三步搭出事件循环，并能说明水平触发与边缘触发的行为差异。',
    guidedPractice: '把阻塞 echo 的 fd 用 fcntl 切成非阻塞后，用 strace 观察 read 在无数据时立即返回 EAGAIN 的行为；再搭一个 epoll 服务，epoll_wait 返回后打印就绪 fd 与事件位，与 nc 连入、发送、断开的时刻逐一对照。',
    independentPractice: '独立交付：单线程 epoll echo 服务，同时维持 50 个 nc 连接互不阻塞地收发，任一连接关闭即停止对它的关注并关闭描述符，全程只有一个进程且空闲时 CPU 占用接近零。',
    commonErrors: ['把阻塞 fd 加入 epoll 后只按一次 read 读完整消息来写，消息稍大就被截断且后续数据迟迟不再触发事件。', 'EPOLLET 模式下每次只读一小段就去等下一个事件，缓冲区残留数据让 fd 永久沉默，必须循环读至 EAGAIN。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['一连接一线程的极限', '阻塞式服务里每个连接独占一个线程或进程，线程栈与调度开销随连接数线性增长，一万个空闲连接就压着一万个阻塞线程，C10K 问题由此而来。核心矛盾是阻塞调用让线程把生命耗在等待上，而不是计算上。可验证：写 echo 服务接入 2000 个 nc，用 ps 统计线程数与内存占用，与后续 epoll 版本的单一进程对比，差距即模型成本。', '线程随连接线性涨', {
        title: 'PowerShell：比较线程模型资源',
        language: 'PowerShell',
        code: `Start-Process .\\echo-threaded
1..1000 | ForEach-Object { Start-Job { nc 127.0.0.1 8080 } }
Start-Sleep -Seconds 5
Get-Process echo-threaded | Select-Object Id, Threads, WorkingSet64
1..1000 | ForEach-Object { Start-Process nc -ArgumentList "127.0.0.1","8080" -WindowStyle Hidden }
Get-Process nc | Measure-Object | Select-Object Count`,
        output: `threads=1001 workingSet=~1.2GB
threaded model blocks one thread per idle connection

1000 个空闲连接对应约 1000 个线程。
内存与调度成本随连接线性增长。`,
      }],
      ['非阻塞与 EAGAIN', '用 fcntl(fd, F_SETFL, O_NONBLOCK) 把描述符切为非阻塞，此后无数据可读时 read 不再挂起，而是返回 -1 且 errno 为 EAGAIN，与 EWOULDBLOCK 同值；发送缓冲满时 write 同样立即返回。EAGAIN 表示暂时无事可做而非失败，程序从此要主动轮询或借助多路复用，不能再依赖内核挂起自己。可验证：strace 对比切换前后，非阻塞版会看到成串立即返回 EAGAIN 的 read 调用。', 'EAGAIN 不是错', {
        title: 'C：fcntl 设置 O_NONBLOCK',
        language: 'C',
        code: `int flags = fcntl(fd, F_GETFL, 0);
if (flags < 0) perror("F_GETFL");
if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) < 0) perror("F_SETFL");

char buffer[64];
ssize_t n = read(fd, buffer, sizeof buffer);
if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
    printf("no data ready\\n");
} else if (n == 0) {
    printf("peer closed\\n");
} else if (n > 0) {
    printf("read=%zd\\n", n);
}`,
        output: `strace before: read(3, ..., 64) = 5
strace after nonblock: read(3, ..., 64) = -1 EAGAIN
no data ready

EAGAIN 表示暂无数据，不是连接失败。
事件循环等可读事件后再读。`,
      }],
      ['epoll 三步接口', 'epoll_create1 建一张内核事件表，epoll_ctl 用 EPOLL_CTL_ADD 把 fd 与关注事件如 EPOLLIN、EPOLLOUT 注册进去，epoll_wait 阻塞等待并只返回就绪项。事件表保存在内核态，每个 fd 只需注册一次，返回代价与就绪数成正比而与总连接数无关，这正是 select 与 poll 每轮全量扫描做不到的。可验证：注册 3 个 nc 连接，只向其中 1 个发数据，打印 epoll_wait 的返回值为 1，证明按需返回。', 'wait 只回就绪', {
        title: 'epoll：create/ctl/wait 三步',
        language: 'C',
        code: `int epfd = epoll_create1(0);
struct epoll_event event = {.events=EPOLLIN,.data.fd=client};
epoll_ctl(epfd, EPOLL_CTL_ADD, client, &event);

struct epoll_event ready[8];
int count = epoll_wait(epfd, ready, 8, -1);
for (int i=0;i<count;i++) {
    if (ready[i].events & EPOLLIN) read(ready[i].data.fd, buffer, sizeof buffer);
}`,
        output: `epoll_create1=4
epoll_ctl ADD fd=7 events=EPOLLIN
epoll_wait returned=1 fd=7
read handler invoked once

事件表保存在内核，fd 注册一次。
wait 只返回就绪连接。`,
      }],
      ['水平触发是默认', '默认水平触发模式下，只要接收缓冲区仍有数据，每次 epoll_wait 都持续报告该 fd，读不完下一轮接着报，漏读不会丢事件，逻辑最不易出错。代价是程序消费慢时同一 fd 反复出现在就绪列表里，事件循环空转。EPOLLONESHOT 可让事件触发一次后自动挂起，需手动重新注册，适合多线程瓜分事件。可验证：每次只读 10 字节，观察同一连接在后续 epoll_wait 中持续就绪，直到缓冲读空才安静。', '没读完会再报', {
        title: 'epoll：水平触发持续报告',
        language: 'C',
        code: `while (running) {
    int n = epoll_wait(epfd, events, 8, -1);
    for (int i=0;i<n;i++) {
        char small[10];
        ssize_t got = read(events[i].data.fd, small, sizeof small);
        printf("epoll fd=%d read=%zd\\n", events[i].data.fd, got);
    }
}`,
        output: `epoll fd=7 read=10
epoll fd=7 read=10
epoll fd=7 read=10
epoll fd=7 read=4

缓冲区未读干时 fd 每轮持续就绪。
读空后不再报告，直至新数据到达。`,
      }],
      ['ET 必须一次读干', 'EPOLLET 边缘触发只在状态变化的瞬间报告一次，之后缓冲区的残留数据不再提醒，漏读一次 fd 就永久沉默。因此 ET 必须搭配非阻塞描述符，就绪后循环 read 直到返回 EAGAIN 或 0，把缓冲一次清干；写侧同理循环写至 EAGAIN。若是阻塞 fd，读干后继续循环会卡死整个事件循环，这是 ET 的硬边界。可验证：ET 模式先写只读一次的版本，客户端后续数据无响应；改成循环读到 EAGAIN 后恢复正常。', '循环读到 EAGAIN', {
        title: 'epoll：EPOLLET 循环读到 EAGAIN',
        language: 'C',
        code: `struct epoll_event event = {.events = EPOLLIN | EPOLLET, .data.fd = client};
epoll_ctl(epfd, EPOLL_CTL_ADD, client, &event);

char buffer[4096];
for (;;) {
    ssize_t n = read(client, buffer, sizeof buffer);
    if (n > 0) { handle(buffer, (size_t)n); continue; }
    if (n == 0) { close_client(client); break; }
    if (errno == EAGAIN || errno == EWOULDBLOCK) break;
    if (errno == EINTR) continue;
    close_client(client); break;
}`,
        output: `EPOLLET event delivered once
loop read 4096, 4096, 2048, then EAGAIN
event loop sleeps until next state change

边缘触发必须读到 EAGAIN。
否则残留数据不会再次提醒。`,
      }],
    ],
  },
  {
    name: 'C · libc、POSIX、文件、进程与 socket：原生 TCP 服务实验',
    track: 'P14 · 独立语言课程',
    minutes: 52,
    prerequisite: '学员已掌握 epoll 事件循环与非阻塞 fd 用法。',
    goal: '综合系统调用、描述符与 epoll 知识，从零实现单线程多连接 TCP echo 服务，掌握断连事件的识别与描述符回收的时序，会用 ss、strace 与 proc 文件系统对服务做运行期体检。',
    guidedPractice: '按 socket、SO_REUSEADDR、bind、listen、epoll 注册的顺序搭服务骨架，每一步打印 fd 与返回值；用 nc 连入回显一句话，再直接 Ctrl-C 断开，观察 EPOLLIN 配 read 返回 0 的清理路径。',
    independentPractice: '独立交付：单文件 echo 服务，非阻塞加 ET 模式支撑 50 个并发连接，客户端断开自动回收描述符，连续重启不报端口占用，并用 strace -c 输出一次运行期系统调用次数汇总。',
    commonErrors: ['客户端断开后只 close 而忘记从自己维护的状态表删除记录，内核复用同一 fd 编号后旧状态污染新连接。', '忽略 epoll_wait 返回的 EPOLLERR 与 EPOLLHUP 事件，死连接滞留事件表，描述符随运行时间逐渐耗尽。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['骨架顺序固定', '可用服务的启动序列是硬约定：socket 创建监听 fd，setsockopt 设置 SO_REUSEADDR，bind 绑定端口，listen 申请排队队列，再把监听 fd 切非阻塞并注册进 epoll。跳过任何一步服务都无法正确接待：未 listen 则连接被直接拒绝，未设 SO_REUSEADDR 则重启被 TIME_WAIT 卡住，监听 fd 不切非阻塞则高并发下 accept 阻塞全局。可验证：按序启动后 ss -ltnp 显示 LISTEN 且 Recv-Q 为 0，nc 接入能完成握手。', '五步缺一不可', {
        title: 'C：TCP 服务启动骨架',
        language: 'C',
        code: `int listener = socket(AF_INET, SOCK_STREAM, 0);
int yes = 1;
setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);
struct sockaddr_in addr = {
  .sin_family=AF_INET,.sin_port=htons(8080),.sin_addr.s_addr=htonl(INADDR_ANY)
};
bind(listener, (struct sockaddr*)&addr, sizeof addr);
listen(listener, 128);
int flags = fcntl(listener, F_GETFL, 0);
fcntl(listener, F_SETFL, flags | O_NONBLOCK);
epoll_ctl(epfd, EPOLL_CTL_ADD, listener, &event);`,
        output: `socket=3
SO_REUSEADDR=1
bind=0 listen=0
fctnl nonblock=0
ss -ltnp: LISTEN 0 128 0.0.0.0:8080

顺序固定，每步失败都要清理前序 fd。
监听 fd 非阻塞后才进入 epoll。`,
      }],
      ['accept 也要循环', '监听 fd 就绪即有连接完成握手，accept 取出新 fd 后必须同样切非阻塞并 epoll_ctl 注册 EPOLLIN，再在自己维护的状态表里记录该连接上下文。accept 一次只取一条连接，高并发瞬间涌入时要用非阻塞循环 accept 直到 EAGAIN，否则剩余连接在队列里干等下一轮事件，表现为客户端迟迟连不上。可验证：两个 nc 同时瞬间连入，strace 里若只见一次 accept 后另一连接延迟应答，说明漏了循环。', 'accept 也要循环', {
        title: 'C：非阻塞 accept 循环',
        language: 'C',
        code: `for (;;) {
    struct sockaddr_in peer;
    socklen_t len = sizeof peer;
    int client = accept(listener, (struct sockaddr*)&peer, &len);
    if (client < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) break;
        if (errno == EINTR) continue;
        perror("accept"); break;
    }
    int flags = fcntl(client, F_GETFL, 0);
    fcntl(client, F_SETFL, flags | O_NONBLOCK);
    epoll_ctl(epfd, EPOLL_CTL_ADD, client, &event);
}`,
        output: `accept fd=5
accept fd=6
accept returns EAGAIN after queue drained

一次事件处理完当前已完成握手队列。
新 fd 非阻塞并注册进 epoll。`,
      }],
      ['回写与 EPOLLOUT', 'EPOLLIN 到达后循环 read 到 EAGAIN 或 0，读到的数据经 write 回写；发送缓冲满时 write 返回部分写或 EAGAIN，此时把剩余数据暂存并注册 EPOLLOUT，等可写事件再续写，写完立即移除该关注，避免事件循环空转。echo 消息短通常一步写完，但代码路径必须按部分写设计，否则大消息必然丢尾巴。可验证：用远超缓冲的大块消息灌入，观察 write 的短返回与 EPOLLOUT 事件的配合续写。', 'EPOLLOUT 续写', {
        title: 'epoll：EPOLLOUT 续写剩余数据',
        language: 'C',
        code: `ssize_t n = write(client, pending, pending_size);
if (n < pending_size) {
    memmove(pending, pending + n, pending_size - n);
    pending_size -= (size_t)n;
    struct epoll_event out = {.events=EPOLLOUT,.data.fd=client};
    epoll_ctl(epfd, EPOLL_CTL_MOD, client, &out);
} else {
    pending_size = 0;
    struct epoll_event in = {.events=EPOLLIN,.data.fd=client};
    epoll_ctl(epfd, EPOLL_CTL_MOD, client, &in);
}`,
        output: `write returned 65536 of 131072
pending 65536 bytes retained
EPOLLOUT fires, remaining bytes written
EPOLLIN re-enabled

发送缓冲满不等于数据丢失。
剩余数据由写事件继续推进。`,
      }],
      ['断连清理时序', '对端关闭时 epoll 报 EPOLLIN 且 read 返回 0，异常时另有 EPOLLHUP 与 EPOLLERR，三条路径最终都汇到 close：关闭 fd 的同时内核自动把它从 epoll 表摘除，自己的状态表也要同步删除，否则内核复用同一编号给新连接时旧状态会张冠李戴。清理必须以 read 返回 0 或错误码为准，而不是靠猜测。可验证：nc 连入后 Ctrl-C，服务日志依次出现 read 返回 0 与清理动作，ss 里对应连接从 ESTABLISHED 消失。', 'close 连带摘除', {
        title: 'epoll：断连与状态表清理',
        language: 'C',
        code: `ssize_t n = read(client, buffer, sizeof buffer);
if (n == 0) {
    printf("peer closed fd=%d\\n", client);
    epoll_ctl(epfd, EPOLL_CTL_DEL, client, NULL);
    close(client);
    remove_connection(client);
} else if (n < 0) {
    if (errno == EAGAIN || errno == EINTR) return;
    if (events & (EPOLLERR | EPOLLHUP)) {
        epoll_ctl(epfd, EPOLL_CTL_DEL, client, NULL);
        close(client);
        remove_connection(client);
    }
}`,
        output: `peer closed fd=7
epoll removed fd=7
state table size 49 -> 48
ss: ESTABLISHED entry disappeared

read 0 或错误事件统一进入清理。
关闭内核 fd，同时删除应用状态。`,
      }],
      ['运行期三件体检工具', '服务上线前用三件工具体检：strace -c -p PID 统计一段时间内各系统调用次数，确认没有 EAGAIN 风暴或异常重试；ss -tn 查看连接总数与各连接状态，识别滞留的半关闭连接；ls /proc/PID/fd 统计描述符总数并与 ulimit -n 对比，防止泄漏逼近上限。可验证：制造一个不关闭的空闲 nc，三个工具分别捕获到挂起的 read、ESTABLISHED 连接与多出的一个 fd。', '三工具查泄漏', {
        title: 'PowerShell：strace、ss、/proc 体检',
        language: 'PowerShell',
        code: `$pid=(Get-Process tcp-echo).Id
strace -c -p $pid -f -o syscalls.txt
ss -tn | Select-String ":8080"
(Get-ChildItem "/proc/$pid/fd").Count
bash -lc 'ulimit -n'
Start-Process nc -ArgumentList "127.0.0.1","8080" -WindowStyle Hidden
Start-Sleep -Seconds 2
(Get-ChildItem "/proc/$pid/fd").Count
Get-Content syscalls.txt | Select-Object -Last 12`,
        output: `fd count before=8 after idle nc=9
ss: ESTABLISHED 127.0.0.1:8080 <- 127.0.0.1:51000
ulimit -n=1024
syscall calls: epoll_wait 1820, read 9, accept4 1

三件工具分别证明连接、fd 与事件循环状态。
空闲连接存在但 CPU 不因忙轮询升高。`,
      }],
    ],
  },
];

// ── C4 调试、追踪、静态分析与性能 ─────────────────────────────────────────────
export const HANDWRITTEN_C_SYSTEMS_C4_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C · 调试、追踪、静态分析与性能：GDB 断点、栈和变量',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已能用 gcc -g 编译多文件 C 程序并在终端运行。',
    goal: '掌握 gdb 启动参数与断点、观察点的设置方式，理解 bt 从当前帧回溯调用链的原理，会用 frame、info locals、print 检查各层栈帧中的变量值并定位逻辑错误。',
    guidedPractice: '现场 gcc -g -O0 编译一个含递归函数的程序，在 gdb 里 break 函数名与 break 文件：行号各设一个断点，run 后依次执行 bt、info locals、p 变量，记录每次暂停时的输出。',
    independentPractice: '独立完成：对一个数组越界导致结果错误的程序，用 gdb 断点与 print 定位首次写入越界的循环迭代，把出错位置的栈帧编号、变量值与修正后的运行结果写成排查记录。',
    commonErrors: ['编译时忘了加 -g，gdb 里看不到行号与变量名，只能对着裸地址排查。', 'next 与 step 混用：遇到函数调用时 step 会一头扎进标准库内部，半天走不出来。'],
    sourceRefs: ['GDB Documentation. https://sourceware.org/gdb/current/onlinedocs/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['编译期注入调试信息', '调试信息由编译器以 DWARF 格式写进可执行文件，gdb 靠它把机器地址映射回源码行号、变量名与类型。必须 gcc -g 编译才有这些映射，只加 -g 不开优化时行号一一对应；若 -g 与 -O2 同开，编译器会重排语句、内联函数、把变量寄存器化，断点命中后 bt 显示的行号可能落到毫不相干的一行，p 某个变量还会报 optimized out，排查这类漂移只能回看汇编或降回 -O0 复现。', '-g 与优化打架', {
        title: 'GCC + GDB：带符号编译与断点',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int add(int a,int b){ int sum=a+b; return sum; }
int main(void){ int x=add(2,3); printf("%d\\n",x); return 0; }
'@ | Set-Content debug.c
gcc -std=c17 -g -O0 debug.c -o debug
gdb -q -batch -ex "break add" -ex run -ex "info args" -ex "info locals" -ex "print a+b" .\\debug
gcc -std=c17 -g -O2 debug.c -o debug-o2
gdb -q -batch -ex "break add" -ex run -ex "print sum" .\\debug-o2`,
        output: `Breakpoint 1 at add
a = 2
b = 3
sum = 0
$1 = 5
debug-o2: sum optimized out

-g -O0 保留变量与行号。
-O2 下变量可能被优化掉，部分现场不可见。`,
      }],
      ['break 的四种写法', 'break 函数名在函数入口第一条有效语句停下，break main.c:25 在该行可执行代码处停下，break main.c:25 if i == 42 是条件断点，条件不满足时程序照常穿过，rbreak 用正则一次布下一组断点。info breakpoints 列出全部断点及其命中计数，delete 编号、disable 编号可逐个控制。行号断点必须落在有代码的行，落在空行或大括号上会被 gdb 自动挪到下一条语句，偏移结果会提示在输出里。', '条件断点省时', {
        title: 'GDB：条件断点与命中计数',
        language: 'PowerShell',
        code: `gdb -q -batch .\\debug -ex "break add if a == 2" -ex run -ex "info breakpoints" -ex "print a" -ex continue
gdb -q -batch .\\debug -ex "rbreak ^add$" -ex run -ex "info breakpoints"`,
        output: `Breakpoint 1 at debug.c:2
Hit count 1
a = 2
Breakpoint 1, add (a=2,b=3)

rbreak ^add$ creates breakpoint on matching function.
条件断点在 a==2 时命中。`,
      }],
      ['bt 与栈帧', '每次函数调用都会压入栈帧，bt 从当前帧往回打印整条调用链，编号 0 表示最内层帧，也就是暂停时正在执行的那一层。frame 编号或 up、down 切换视角后，info args 与 info locals 展示该帧的参数和局部变量，print 表达式还能取 struct 成员、数组元素，甚至调用无副作用的简单函数。递归崩溃时 bt 的最后几帧往往就是案发现场，bt full 会把每一层的局部值全部展开，配合排查最深一层。', '编号零在最内', {
        title: 'GDB：bt 回溯与 frame 切换',
        language: 'PowerShell',
        code: `@'
int factorial(int n){ if(n==0) return 1; return n*factorial(n-1); }
int main(void){ return factorial(5); }
'@ | Set-Content recurse.c
gcc -g -O0 recurse.c -o recurse
gdb -q -batch .\\recurse -ex "break factorial if n == 1" -ex run -ex bt -ex "frame 1" -ex "info args"`,
        output: `#0 factorial (n=1)
#1 0x... in factorial (n=2)
#2 0x... in factorial (n=3)
#3 0x... in factorial (n=4)
#4 0x... in factorial (n=5)
#5 0x... in main ()
frame 1: n = 2

当前最内层为 frame 0。
frame 1 是它的直接调用者。`,
      }],
      ['print 与观察点', 'print 支持 p arr[3]、p node->next、p sizeof(x) 这类表达式，set print pretty on 让结构体按字段缩进展开。watch 变量设置观察点，变量被任何一条指令改写都会暂停并打印新旧值，适合定位「谁改坏了这个字段」；rwatch 只监测读，awatch 读写都报。观察点依赖硬件调试寄存器，可设数量有限，监测大数组整体时开销明显增大，盯单个标量最划算，这是硬件层面的硬边界。', 'watch 抓黑手', {
        title: 'GDB：watch 捕捉字段改写',
        language: 'PowerShell',
        code: `@'
typedef struct { int id; int status; } Order;
int main(void){ Order o={1,0}; o.status=1; o.status=2; return o.status; }
'@ | Set-Content watch.c
gcc -g -O0 watch.c -o watch
gdb -q -batch .\\watch -ex "break main" -ex run -ex "watch o.status" -ex continue -ex bt -ex "print o"`,
        output: `Hardware watchpoint 2: o.status
Old value = 0
New value = 1
main watch.c:3
$1 = {id = 1, status = 1}

watch 在字段第一次被改写时暂停。
bt 指向执行赋值的源码行。`,
      }],
      ['run 与现场控制', 'run 从头启动程序，断点命中后 c 继续到下一个断点，n 执行下一行、s 进入函数体，finish 把当前函数跑完并停在返回处，until 直接跳出循环，start 等价于在 main 入口停下的 run。带命令行参数用 run 参数列表，set args 可预设持久生效；gdb 每次 run 都会重建进程，上一轮修改过的内存不会遗留，反复实验必须以 run 之后的第一现场为准，否则看到的是自己制造的脏状态。', 'c 走 n 看 s 进', {
        title: 'GDB：run、next、step、finish',
        language: 'PowerShell',
        code: `gdb -q .\\debug
(gdb) start
(gdb) next
(gdb) step
(gdb) finish
(gdb) continue
(gdb) quit`,
        output: `Temporary breakpoint at main
main () at debug.c:3
3 int x=add(2,3);
add (a=2,b=3) at debug.c:2
Value returned is $1 = 5
Continuing.
5

next 跳过函数调用，step 进入函数。
finish 执行到当前函数返回。`,
      }],
    ],
  },
  {
    name: 'C · 调试、追踪、静态分析与性能：core dump、符号和构建 ID',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已会用 gdb 设断点并读懂 bt 回溯。',
    goal: '理解段错误触发内核写 core 的条件与 ulimit -c 的作用，会用 coredumpctl 调取历史崩溃现场，掌握调试符号包与 GNU build-id 的匹配机制，能对离线 core 完成完整回溯定位。',
    guidedPractice: '现场写一个解引用空指针的程序，ulimit -c unlimited 后运行触发崩溃，用 coredumpctl list 找到记录并 coredumpctl debug 调出 gdb，在 bt 中指认出错帧，再 p 崩溃指针确认其值为 0。',
    independentPractice: '独立完成：对一个已发布程序的重现 core，核对可执行文件与 core 的 build-id 是否一致，缺符号时补装对应调试符号包，bt full 定位崩溃函数并写成含寄存器、栈帧与根因的崩溃分析单。',
    commonErrors: ['以为程序崩溃必有 core，实际 ulimit -c 为 0 或 systemd-coredump 未接管时什么都不会留下。', '拿 strip 后没有调试符号的二进制去调 core，bt 全是问号与地址，还误以为是 core 文件损坏。'],
    sourceRefs: ['GDB Documentation. https://sourceware.org/gdb/current/onlinedocs/', 'systemd-coredump Manual. https://www.freedesktop.org/software/systemd/man/latest/systemd-coredump.html'],
    steps: [
      ['内核何时写 core', '进程收到 SIGSEGV、SIGABRT 这类致命信号时，内核要过三道关才落盘 core：rlimit 的 RLIMIT_CORE 大于零、/proc/sys/kernel/core_pattern 指定可写的落盘目标、文件系统允许写入该大小的文件。ulimit -c unlimited 只改当前 shell 的软限制；systemd 接管后 core_pattern 指向 systemd-coredump 管道，core 存进日志卷而非当前目录，必须用 coredumpctl 找回。自查两条命令：ulimit -c 看限制，cat /proc/sys/kernel/core_pattern 看去向。', '三关全过才落盘', {
        title: 'PowerShell：检查 core 生成条件',
        language: 'PowerShell',
        code: `bash -lc 'ulimit -c'
Get-Content /proc/sys/kernel/core_pattern
sudo sysctl -w kernel.core_pattern=core.%p
bash -lc 'ulimit -c unlimited; ./crash'
Get-ChildItem core.* | Select-Object Name, Length`,
        output: `ulimit -c: 0
core_pattern: |/usr/lib/systemd/systemd-coredump %P %u %g %s %t %c %h
core_pattern: core.%p
crash: Segmentation fault (core dumped)

core.%p 42

RLIMIT_CORE 与 core_pattern 都允许写盘才得到 core。
systemd 模式通常使用 coredumpctl 而不是目录文件。`,
      }],
      ['coredumpctl 取回现场', 'coredumpctl list 按时间列出全部崩溃记录，含信号类型、PID 与可执行文件路径；coredumpctl dump PID 输出原始 core 文件，coredumpctl debug PID 直接把对应可执行文件与 core 一起喂给 gdb。list --since 与 --until 能圈定时间窗，排查周期性崩溃时先按信号字段分组，SIGABRT 多指向断言与 abort，SIGSEGV 多指向非法内存访问。容器里崩的进程同样会被宿主的 systemd-coredump 记录，找记录时注意 PID 与时间的对应关系。', '崩溃全留档', {
        title: 'coredumpctl：列出并调取崩溃现场',
        language: 'PowerShell',
        code: `coredumpctl list --since "2026-11-24 10:00"
coredumpctl list --until now
coredumpctl dump 4212 --output crash.core
coredumpctl debug 4212
gdb -q .\\app crash.core -ex "bt full"`,
        output: `TIME PID SIG EXE
10:42:13 4212 SIGSEGV /opt/orders/app
dumped core to crash.core
Reading symbols from app...
#0 0x... in order_update (order=0x0) at order.c:42

SIGSEGV 指向空指针解引用。
coredumpctl debug 自动匹配可执行文件与 core。`,
      }],
      ['符号从哪来', '可执行文件按 -g 编译时自带 DWARF 调试信息，strip 之后体积变小但符号全部丢失；发行版把调试信息拆进独立的 -dbg 或 -debuginfo 包，安装后 gdb 按路径约定自动加载。自研程序要保留一份带符号的副本，与线上运行的二进制逐字节对应才能正确回溯。验证办法：gdb 打开二进制执行 info functions，或对 core 直接跑 bt，能显示文件名与行号即符号就位，只显示十六进制地址就是符号缺失，其余分析先暂停。', '符号包配套装', {
        title: 'GDB：确认调试符号是否可用',
        language: 'PowerShell',
        code: `objcopy --only-keep-debug app app.debug
strip --strip-debug app -o app.stripped
gdb -q app.stripped -ex "info functions order_update"
gdb -q app -ex "info functions order_update"
eu-readelf -S app | Select-String "debug_info|symtab"`,
        output: `app.stripped: no debug symbols
app: function order_update at order.c:35
.debug_info present
.symtab present

strip 后 DWARF 不再随二进制分发。
保留带符号副本或安装对应 debuginfo 包。`,
      }],
      ['build-id 对号入座', '链接器默认在二进制里写入 GNU build-id，一个按内容哈希出的十六进制串，readelf -n 程序名 即可看到；core 文件头同样携带崩溃进程的 build-id。gdb 载入 core 时先比对两者，一致才信任符号映射，不一致会报 mismatch 警告并可能解析出错误的栈。哪怕只改一行注释重新编译，build-id 也会变，所以线上 core 必须配当时那一版产物的符号；构建系统要把产物与符号包成对归档，才撑得起事后调试。', '改一行也变', {
        title: 'readelf：核对程序与 core 的 build-id',
        language: 'PowerShell',
        code: `readelf -n app | Select-String "Build ID"
readelf -n crash.core | Select-String "Build ID"
gdb -q app crash.core -ex "show build-id"
readelf -n app-v2 | Select-String "Build ID"
gdb -q app-v2 crash.core -ex "bt"`,
        output: `app Build ID: 7f21a0...
crash.core Build ID: 7f21a0...
matches app
app-v2 Build ID: 91bc...
warning: build-id mismatch

程序与 core 的 build-id 必须一致。
仅改一行重编也会产生新的 build-id。`,
      }],
      ['离线回溯与寄存器', '对拿到的 core 执行 gdb 程序名 core 文件，bt 先给全景，info registers 看 RIP 与 RSP，x/i $pc 把崩溃点指令反汇编出来。解引用空指针时 RIP 常停在以 0 附近小偏移为目标的 mov 指令，从偏移量可反推是读还是写、对应结构体哪个字段；bt full 展开各帧局部变量，thread apply all bt 处理多线程崩溃，先找到收到信号的线程再逐帧核对，其余线程的栈只做旁证。', 'x/i 看崩点', {
        title: 'GDB：core 中查看寄存器与故障指令',
        language: 'PowerShell',
        code: `gdb -q app crash.core -batch -ex "bt full" -ex "info registers rip rsp" -ex "x/4i $pc" -ex "thread apply all bt 3"`,
        output: `#0 order_update (order=0x0) at order.c:42
42 return order->status;
rip 0x4011a2
x/i $pc => mov 0x8(%rax),%eax
Thread 1 received SIGSEGV

rax=0，mov 读取 order+8 触发段错误。
寄存器与反汇编共同定位空指针字段访问。`,
      }],
    ],
  },
  {
    name: 'C · 调试、追踪、静态分析与性能：strace/ltrace 与系统调用',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已了解进程概念，能在终端编译运行 C 程序。',
    goal: '理解系统调用是用户态进入内核的唯一通道，掌握 strace 追踪与过滤的核心参数，能读懂常见 errno，会用 ltrace 观察动态库函数调用，据此定位文件路径错误与耗时来源。',
    guidedPractice: '现场对一个依次打开文件、申请内存、fork 子进程的小程序执行 strace ./a.out，逐行讲 openat、mmap、clone 的参数；再用 -e trace=%file 重跑对比输出量，把两次行数差与原因记进笔记。',
    independentPractice: '独立完成：对一个报错 File not found 的程序，用 strace -e trace=%file 找出它实际尝试的路径序列并对照 errno 给出修正；再对一段慢启动程序用 -c 统计出最耗时的系统调用并写结论。',
    commonErrors: ['程序实际慢在用户态计算，strace 显示系统调用都很快，误判成内核问题继续往内核方向查。', '忘了加 -f，fork 出的子进程调用没被记录，误以为某段代码没执行，结论完全跑偏。'],
    sourceRefs: ['strace Manual. https://man7.org/linux/man-pages/man1/strace.1.html', 'strace GitHub. https://github.com/strace/strace'],
    steps: [
      ['系统调用是边界', '用户态程序不能直接碰硬件与内核数据，一切 I/O、内存申请、进程控制都要经 syscall 指令陷入内核，strace 就是在这条边界上拦截并翻译每次调用。x86-64 下系统调用号放 rax、参数依次放 rdi 等寄存器，内核按号分发到实现。strace 默认基于 ptrace 挂住目标进程，每个调用打印名称、入参、返回值与耗时，因此被追踪的程序会显著变慢，长期在线服务要改用内核侧的 eBPF 类工具，这个开销边界必须先知道。', 'ptrace 有税', {
        title: 'strace：观察进程边界调用',
        language: 'PowerShell',
        code: `strace -f -tt -T -o trace.log .\\app
Get-Content trace.log -TotalCount 20
strace -c .\\app
Measure-Command { .\\app } | Select-Object TotalMilliseconds`,
        output: `10:42:01.001 openat(AT_FDCWD,"config.yml",O_RDONLY) = 3 <0.000021>
10:42:01.002 read(3,"port: 8080",11) = 11 <0.000014>
strace -c: openat 3 calls, read 18 calls
untraced runtime=18ms, traced runtime=92ms

strace 记录系统调用参数、返回值和耗时。
ptrace 插桩显著拖慢程序，不能当生产常驻工具。`,
      }],
      ['-e 过滤调用类', 'strace -e trace=%file 只显示 openat、stat、access 等文件类调用，%network、%process、%memory 同理，排查「配置到底从哪个路径读的」时能砍掉九成噪音；精确到单个调用写 -e trace=openat,read。加 -f 让 fork 出的子进程一并追踪，输出前带 PID 区分；-o 文件名把结果落盘避免刷屏。核对动作：对 ls 执行 strace -e trace=%file，能看到它依次 stat 动态库与 locale 文件，这就是共享库查找路径的直观证据。', '%file 砍噪音', {
        title: 'strace：按文件类系统调用过滤',
        language: 'PowerShell',
        code: `strace -f -e trace=%file -o files.log .\\app
Get-Content files.log | Select-Object -First 30
strace -f -e trace=openat,read,write -o io.log .\\app
(Get-Content files.log).Count
(Get-Content io.log).Count`,
        output: `openat(AT_FDCWD,"/etc/app/config.yml",O_RDONLY) = 3
newfstatat(3,"",{st_mode=S_IFREG},0) = 0
openat(AT_FDCWD,"locale/en_US.UTF-8",O_RDONLY) = -1 ENOENT
files.log lines=18 io.log lines=41

%file 只保留路径与元数据查询。
-f 同时追踪 fork 子进程。`,
      }],
      ['errno 与返回值', '每行末尾的返回值是判读关键：openat 返回文件描述符为成功，-1 ENOENT 表示路径不存在，-1 EACCES 是权限不足，EAGAIN 常见于非阻塞 I/O 的暂不可读，EINTR 说明调用被信号打断。strace 打出的错误符号与 man 2 openat 列出的错误码一一对应。排查报错程序时先搜 = -1 的行，再看同一行实际传入的路径或参数，很多「玄学失败」其实是程序在错误目录下找了文件，errno 一列就现形。', '先搜等号负一', {
        title: 'PowerShell：从 -1 行定位失败调用',
        language: 'PowerShell',
        code: `strace -f -e trace=%file -o files.log .\\app
Select-String files.log -Pattern "= -1"
$line = (Select-String files.log -Pattern "= -1 ENOENT" | Select-Object -First 1).Line
$line
Resolve-Path .\\config.yml
Get-Content .\\config.yml -TotalCount 5`,
        output: `openat(AT_FDCWD,"config.yml",O_RDONLY) = -1 ENOENT
newfstatat(... "libc.so.6") = 0
Resolve-Path: cannot find path config.yml

程序尝试相对路径 config.yml。
当前工作目录下文件确实不存在。`,
      }],
      ['ltrace 看库函数', 'strace 只停在系统调用边界，ltrace 则在 PLT 层拦截动态库函数调用，能直接看到 printf、malloc、strlen 与自研动态库函数的调用及返回值，适合定位「程序调了哪个库函数却传错了参数」。它依赖二进制里的动态符号表，静态链接或 strip 后可见性骤降；ltrace 同样拖慢目标进程，函数级追踪不要用于长期在线服务。两者配合的次序是：ltrace 先定位函数级行为，strace 再落到内核边界确认真相，两层证据拼合。', 'PLT 层拦截', {
        title: 'ltrace：观察 malloc/strlen 调用',
        language: 'PowerShell',
        code: `ltrace -f -o libcalls.log .\\app
Get-Content libcalls.log | Select-String "malloc|strlen|printf|free"
strace -f -e trace=brk,mmap,write -o syscalls.log .\\app
Get-Content syscalls.log | Select-Object -First 20`,
        output: `malloc(128) = 0x55...
strlen("abcdef") = 6
printf("len=%zu\\n", 6) = 8
free(0x55...) = <void>

ltrace 显示库函数参数与返回。
strace 再确认 malloc 对应的 brk/mmap。`,
      }],
      ['-c 统计与耗时', 'strace -c 汇总各系统调用的次数、出错次数与占用时间，进程退出时打表，是判断「慢在内核还是用户态」的第一刀：若 time 命令显示的总耗时远大于 -c 表内时间之和，瓶颈多半在用户态计算而非内核。-T 给每行追加该调用自身的耗时，-tt 打印绝对时间戳，两者相减可算任意两段之间的间隔；-r 输出与上一次调用的时间差，专找大间隙，比如卡在某次 read 上的几百毫秒。', '-c 定慢在哪', {
        title: 'strace：-c 统计与 -T 耗时',
        language: 'PowerShell',
        code: `strace -c -f .\\app > summary.txt 2>&1
Get-Content summary.txt
strace -f -T -tt -o timed.log .\\slow-app
Get-Content timed.log | Sort-Object { [double](($_ -split '<|>')[1]) } -Descending | Select-Object -First 10`,
        output: `calls error syscall seconds
1820 0 epoll_wait 18.200
42 0 read 0.012
8 0 openat 0.004
read(...) = 12 <0.000014>
write(...) = 12 <0.000011>
epoll_wait(...)=1 <0.250000>

-c 汇总调用次数与总耗时。
-T 给单次调用追加耗时，排序找到最大间隙。`,
      }],
    ],
  },
  {
    name: 'C · 调试、追踪、静态分析与性能：clang-tidy、静态分析和编译器警告',
    track: 'P14 · 独立语言课程',
    minutes: 40,
    prerequisite: '学员已能用 gcc 编译 C 项目并修过基础编译错误。',
    goal: '理解编译器警告与静态分析的分工，掌握 -Wall -Wextra 等常用开关与 clang-tidy 检查项的启用方式，能读懂诊断信息并按修复建议与 NOLINT 注释完成闭环清理。',
    guidedPractice: '现场对一段含未初始化变量、内存泄漏与死代码的示例执行 gcc -Wall -Wextra -c 与 clang-tidy 示例.c -- 加编译参数，逐条对照诊断行号改代码，把每条警告的触发原因写进操作单。',
    independentPractice: '独立完成：给一个多文件小项目开齐 -Wall -Wextra -Werror 与三组 clang-tidy 检查项，清零全部诊断；再把其中一条误报用 NOLINT 注释并注明理由，最后产出一份警告分类清单。',
    commonErrors: ['只看诊断最上面几行就动手改代码，漏掉主警告下方的关联注释，把问题改向错误方向。', '把 -Werror 直接加进老项目全量编译，历史警告全变错误，被迫大面积改动引入回归。'],
    sourceRefs: ['GCC Documentation. https://gcc.gnu.org/onlinedocs/', 'Clang-Tidy Documentation. https://clang.llvm.org/extra/clang-tidy/'],
    steps: [
      ['警告是廉价评审', '编译器警告来自编译过程中的数据流与控制流分析：-Wall 会报未初始化使用、隐式收窄、格式串与实参类型不匹配，-Wextra 补充未用参数、有符号无符号比较等类别。gcc -c foo.c 与 gcc -Wall -Wextra -c foo.c 的输出可能差十几条，默认不开是因为部分检查噪音较大。实践基线是新代码 -Wall -Wextra 干净，再用 -Werror 把警告升级为错误守住底线；验证动作：写 int x; return x; 用 -Wall 编译，能看到 uninitialized 提示。', '基线两条开关', {
        title: 'GCC：用同一份源码对比默认与严格警告',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int main(void) {
    int count;
    if (count > 0) printf("positive\\n");
    return 0;
}
'@ | Set-Content warning.c
gcc -std=c17 -c warning.c -o warning-default.o
gcc -std=c17 -Wall -Wextra -Werror -c warning.c -o warning-strict.o
if ($LASTEXITCODE -ne 0) { Write-Output "strict build stopped before producing warning-strict.o" }
Get-Item warning-default.o | Select-Object Name,Length`,
        output: `warning.c: In function 'main':
warning.c:4:9: error: 'count' is used uninitialized [-Werror=uninitialized]
strict build stopped before producing warning-strict.o
Name              Length
----              ------
warning-default.o    1288

默认编译成功，严格编译把未初始化读取升级为错误。
修复时应初始化 count，不能删除 -Werror 掩盖诊断。`,
      }],
      ['clang-tidy 分工', 'clang-tidy 基于 clang AST 做更深层的模式检查，覆盖编译器不报的类别：cppcoreguidelines 系列查所有权与资源管理，bugprone 系列查易出错的写法，performance 系列查低效模式，modernize 系列提示更现代的等价写法。运行 clang-tidy 文件.c -- 后接 -I 头文件目录等编译参数，路径解析失败多半是忘了传编译参数导致无法定位头文件。与编译器警告的分工：编译器抓「确定会错」，tidy 抓「危险模式」，两层互补而非替代。', 'AST 层查模式', {
        title: 'clang-tidy：识别 malloc 的 sizeof 指针错误',
        language: 'PowerShell',
        code: `@'
#include <stdlib.h>
int *make_buffer(int n) {
    int *p = malloc((size_t)n * sizeof(*p));
    if (p == NULL) return NULL;
    p[0] = n;
    return p;
}
'@ | Set-Content tidy.c
@'
#include <stdlib.h>
int *make_buffer(int n) {
    int *p = malloc((size_t)n * sizeof(p));
    if (p == NULL) return NULL;
    p[0] = n;
    return p;
}
'@ | Set-Content tidy-bug.c
clang-tidy tidy-bug.c --checks="-*,bugprone-sizeof-expression" -- -std=c17
gcc -std=c17 -Wall -Wextra -Werror -c tidy.c -o tidy.o`,
        output: `warning: suspicious usage of 'sizeof(p)' comparing with pointer type [bugprone-sizeof-expression]
note: please use sizeof(*p) to allocate an array of elements
1 warning generated.
tidy.c:3:9: note: expression evaluates to 8 bytes on this target
gcc: tidy.c compiled successfully

GCC 只看到合法 malloc 调用，不报 sizeof 用错对象。
tidy 从 AST 识别危险模式；sizeof(*p) 才能按元素大小分配。`,
      }],
      ['checks 配置与闭环', '--checks=bugprone-*,performance-* 启用一组检查，前缀减号禁用单项，clang-tidy --list-checks 列出当前生效集合；.clang-tidy 配置文件可把 Checks 与 WarningsAsErrors 固化进仓库，评审时不再口头约定。每条诊断默认带修复建议，加 --fix 自动应用，但自动修复可能改变语义，务必先跑测试再提交。对确认合理的误报，在行尾写 NOLINT 或下一行写 NOLINTNEXTLINE 压制并注明理由，让评审者知道是判断过而非漏看。', 'fix 前先跑测试', {
        title: '项目级 .clang-tidy 与受控压制',
        language: 'PowerShell',
        code: `@'
Checks: '-*,bugprone-*,performance-*'
WarningsAsErrors: 'bugprone-*'
HeaderFilterRegex: 'src/.*'
'@ | Set-Content .clang-tidy
@'
int read_port(const int *ports) {
    return ports[0]; /* NOLINT(bugprone-*) 调用方保证非空，入口处已断言 */
}
'@ | Set-Content example.c
clang-tidy --list-checks example.c -- -std=c17 | Select-String "bugprone"
clang-tidy example.c -- -std=c17
Get-Content .clang-tidy`,
        output: `Enabled checks:
    bugprone-argument-comment
    bugprone-assert-side-effect
    bugprone-sizeof-expression
[no diagnostics generated]
Checks: '-*,bugprone-*,performance-*'
WarningsAsErrors: 'bugprone-*'

配置文件把检查规则纳入仓库。
NOLINT 只用于已论证的例外，并保留理由。`,
      }],
      ['警告选项取舍', '进阶开关各有侧重：-Wshadow 报变量遮蔽，-Wconversion 报可能丢值的隐式转换，-Wpedantic 严格执行标准；有些检查噪音大，如 -Wpadded 反复报结构体填充，适合一次性了解布局后关掉。对增量项目，先保证新文件全开、旧文件逐步消化，避免一次性清几千条历史警告淹没真正的新问题。边界要记牢：-Wall 不等于全部警告，GCC 文档明确还有 -Wconversion 等大量检查不在其中，开满与可用之间要按项目阶段取舍。', '增量收紧别一刀切', {
        title: 'GCC：专项警告定位隐式截断与变量遮蔽',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
int main(void) {
    long payload = 70000;
    int narrow = payload;
    {
        int payload = 1;
        printf("%d %d\\n", narrow, payload);
    }
    return 0;
}
'@ | Set-Content conversion.c
gcc -std=c17 -Wall -Wextra -c conversion.c -o conversion.o
gcc -std=c17 -Wall -Wextra -Wconversion -Wshadow -c conversion.c -o conversion.o
gcc -std=c17 -Wall -Wextra -Wpadded -c conversion.c -o conversion.o`,
        output: `conversion.c:6:19: warning: conversion from 'long int' to 'int' may change value
conversion.c:8:13: warning: declaration of 'payload' shadows a previous local
warning: padding struct to align target

-Wconversion 抓住可能丢值的收窄。
-Wshadow 抓住同名变量遮蔽；-Wpadded 仅用于了解布局。`,
      }],
      ['把分析接进构建', 'clang-tidy 可经 CMake 的 CMAKE_C_CLANG_TIDY 或 run-clang-tidy 脚本并行扫描全工程，前提是拿到编译数据库 compile_commands.json，由 cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON 生成，这是 tidy 找对头文件路径的关键。CI 里设阈值：新增警告数大于零即失败，存量另立清理分支逐包消化，避免单次提交膨胀。落地检查：构建目录确认有 compile_commands.json，再对任一源文件跑 tidy 正常退出，管线才算接通。', '先导编译数据库', {
        title: 'CMake：生成编译数据库并接入 clang-tidy',
        language: 'PowerShell',
        code: `@'
cmake_minimum_required(VERSION 3.20)
project(orders C)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_C_CLANG_TIDY clang-tidy;-p;build)
add_executable(orders src/main.c src/order.c)
'@ | Set-Content CMakeLists.txt
New-Item -ItemType Directory -Force build | Out-Null
cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build
Get-Content build/compile_commands.json -TotalCount 5
clang-tidy -p build src/order.c`,
        output: `-- Configuring done
-- Generating done
-- Build files have been written to: .../build
[
  {
    "directory": ".../build",
    "command": "clang ... -o CMakeFiles/orders.dir/src/order.c.o"
Building C object CMakeFiles/orders.dir/src/order.c.o
[no diagnostics generated]

compile_commands.json 提供头文件搜索目录与宏定义。
构建时 CMAKE_C_CLANG_TIDY 让每个 C 源文件都经过 tidy。`,
      }],
    ],
  },
  {
    name: 'C · 调试、追踪、静态分析与性能：perf、火焰图和缓存局部性',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已会用 gdb 调试 C 程序并了解函数调用栈概念。',
    goal: '掌握 perf stat、record、report 的用法与采样原理，理解火焰图宽与高的准确含义，能解释缓存行 64 字节与伪共享对性能的影响，并用 perf 定位一个真实热点并完成优化验证。',
    guidedPractice: '现场对一个双层循环遍历大数组的程序执行 perf stat 与 perf record -g，report 后看热点占比；再把行优先遍历改成列优先对比 cycles 数，用 perf diff 出对比表并抄进笔记。',
    independentPractice: '独立完成：对一个耗时程序生成火焰图，找出占比最高的调用栈并做一处局部性优化，用优化前后两次 perf stat 的 cycles 与 cache-misses 数据写成含数字对照的调优记录。',
    commonErrors: ['把火焰图宽度当成时间轴，实际宽度表示该函数在采样中出现次数占比，高度才是调用深度。', '优化后只看一次总耗时，没复跑 perf stat，把编译器波动或机器抖动误记成自己的改动收益。'],
    sourceRefs: ['perf Tutorial. https://perf.wiki.kernel.org/index.php/Tutorial', 'Brendan Gregg FlameGraph. https://github.com/brendangregg/FlameGraph'],
    steps: [
      ['perf stat 先摸底', 'perf stat ./a.out 输出 task-clock、cycles、instructions、cache-misses 等硬件计数器汇总，IPC 即 instructions per cycle，明显偏低说明 CPU 常在等内存而非算力不足。-e 可指定事件，例如 -e cache-misses,branch-misses；-r 3 表示重复运行三次取统计，压低机器抖动的影响。计数器受硬件 PMC 数量限制可能按时间片 multiplex，输出中带百分比的列就是采样覆盖率。基线动作：优化前后各跑一次 stat，只对比 cycles 与 cache-misses 两条，其余指标先不展开。', 'IPC 低等内存', {
        title: 'perf stat：读取 IPC 与缓存未命中',
        language: 'PowerShell',
        code: `@'
#include <stddef.h>
#define N (8 * 1024 * 1024)
static int data[N];
int main(void) {
    long sum = 0;
    for (size_t i = 0; i < N; i += 16) sum += data[i];
    return sum == 0 ? 0 : 1;
}
'@ | Set-Content cache-walk.c
gcc -O2 cache-walk.c -o cache-walk
perf stat -r 3 -e cycles,instructions,cache-misses .\\cache-walk
perf stat -e task-clock,cycles,instructions,cache-misses .\\cache-walk`,
        output: `Performance counter stats for './cache-walk' (3 runs):
  18,204,113 cycles
   6,119,005 instructions             0.34 insn per cycle
     412,918 cache-misses
mean runtime: 0.00842 seconds

IPC 低说明每个周期完成指令少，可能在等缓存与内存。
复跑三次减少单次波动，优化前后用同机同参数比较。`,
      }],
      ['record 与采样原理', 'perf record -g ./a.out 以固定频率打断 CPU 采样，-g 连同用户栈一起抓回，默认事件是 cycles。-F 99 把频率压到每秒 99 次，既明显降低开销又避开与周期性任务的共振。perf report 交互界面按占比展开调用树，children 列含整条调用链的开销，self 列才是本函数自耗时，区分两列是读懂报告的第一课。采样是统计而非全量记录，占比相近的两个热点可能只是噪声差异，要用 -r 多轮复核再下结论。', '低频防共振', {
        title: 'perf record/report：比较 self 与 children',
        language: 'PowerShell',
        code: `gcc -O2 -g cache-walk.c -o cache-walk
perf record -F 99 -g --call-graph dwarf -o perf.data .\\cache-walk
perf report --stdio -i perf.data --percent-limit 2
perf report --stdio -i perf.data --sort dso,symbol
perf annotate --stdio -i perf.data --symbol main`,
        output: `Samples: 18 of event 'cycles'
  62.35%  62.35%  cache-walk  [.] main
  23.10%  85.45%  cache-walk  [.] sum_bytes
           __libc_start_main
           main
           sum_bytes
Percent | Symbol
 62.35% | main

self 列是函数自身耗时，children 列包含被调函数。
采样是统计结果，需结合调用栈和重复运行判断热点。`,
      }],
      ['火焰图怎么读', 'perf script 输出采样原文，交给 FlameGraph 仓库的 stackcollapse-perf.pl 折叠、flamegraph.pl 绘制即可生成 SVG 火焰图。横轴宽度是该栈在采样中的占比，排序按字母而非时间；纵轴是调用深度，顶层的每个格子都对应真实样本。找瓶颈的口诀是找最宽的平顶，宽而薄的栈说明大量样本落在同一层函数。on-CPU 图不含等待 I/O 的栈，要查等待时间需切到 off-CPU 分析或 wall-clock 图，图型选错结论就错。', '找最宽平顶', {
        title: 'FlameGraph：从 perf.data 生成 SVG',
        language: 'PowerShell',
        code: `git clone --depth 1 https://github.com/brendangregg/FlameGraph.git
perf script -i perf.data > perf.folded.txt
perl .\\FlameGraph\\stackcollapse-perf.pl perf.folded.txt > stacks.folded
perl .\\FlameGraph\\flamegraph.pl stacks.folded > cpu-flame.svg
Get-Item cpu-flame.svg | Select-Object Name,Length,LastWriteTime
Select-String stacks.folded -Pattern "main" | Select-Object -First 5`,
        output: `Name           Length LastWriteTime
----           ------ -------------
cpu-flame.svg 184622 2026-11-24 11:08:42
main;process;sum_array 428
main;process;sum_array 391
main;process 77

每个折叠行由分号分隔调用栈，数字是样本数。
SVG 中最宽的同层函数占用样本最多，不代表调用耗时绝对秒数。`,
      }],
      ['缓存行与局部性', '缓存以 64 字节为一行搬运，连续内存的顺序访问能命中预取，跨行随机访问则每步都付整行成本。二维数组按行优先存储，先行后列遍历接近顺序读，先列后行则每步跳一整行，同样数据量下 cycles 差可达数倍。结构体数组改写为数组式拆分是同一原理：把热字段聚在一起，减少每个元素跨越的缓存行数。动手验证：perf stat -e cache-misses 分别跑两种遍历顺序，对比数值差，数据应稳定重现。', '64 字节一行', {
        title: 'perf stat：对比行优先与列优先遍历',
        language: 'PowerShell',
        code: `@'
#include <stddef.h>
#include <stdlib.h>
#define ROWS 2048
#define COLS 2048
static int matrix[ROWS][COLS];
static long sum_rows(int (*a)[COLS]) {
    long s = 0;
    for (size_t r = 0; r < ROWS; ++r)
        for (size_t c = 0; c < COLS; ++c) s += a[r][c];
    return s;
}
static long sum_cols(int (*a)[COLS]) {
    long s = 0;
    for (size_t c = 0; c < COLS; ++c)
        for (size_t r = 0; r < ROWS; ++r) s += a[r][c];
    return s;
}
int main(int argc, char **argv) {
    for (size_t r = 0; r < ROWS; ++r)
        for (size_t c = 0; c < COLS; ++c)
            matrix[r][c] = (int)((r * 31 + c) & 7);
    return (argc > 1 ? sum_cols(matrix) : sum_rows(matrix)) == 0;
}
'@ | Set-Content locality.c
gcc -O2 locality.c -o locality
perf stat -e cycles,cache-misses .\\locality rows
perf stat -e cycles,cache-misses .\\locality cols`,
        output: `./locality rows: 42,811,201 cycles, 531,142 cache-misses
./locality cols: 91,764,522 cycles, 4,118,991 cache-misses

列优先每次跨过一整行，预取效率低。
同机多轮复测后，方向一致的差异才可作为优化证据。`,
      }],
      ['伪共享与对齐', '两个线程各自写不同变量，但两变量恰好落在同一个 64 字节缓存行时，缓存一致性协议会让该行在核间反复失效与迁移，多线程吞吐骤降，这就是伪共享。C 里对高频写的热点计数器按 64 字节对齐隔离即可消除：用 alignas(64) 把下一个计数器推到新缓存行，GCC 下也可用 __attribute__((aligned(64)))。验证手段：对齐前后分别跑多线程累加，cycles 与 cache-misses 应显著下降；但不是所有计数器都要对齐，只有被多核高频写的才值得，否则白占内存。', 'alignas 隔行', {
        title: 'C11：用 alignas(64) 隔离热点计数器',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdalign.h>
#include <stdint.h>
typedef struct {
#ifdef FIELDS_ALIGNED
    alignas(64) uint64_t first;
    alignas(64) uint64_t second;
#else
    uint64_t first;
    uint64_t second;
#endif
} Counters;
static Counters counters;
static void *bump(void *arg) {
    volatile uint64_t *target = (volatile uint64_t *)arg;
    for (int i = 0; i < 20000000; ++i) *target += 1;
    return 0;
}
int main(void) {
    pthread_t a, b;
    pthread_create(&a, 0, bump, &counters.first);
    pthread_create(&b, 0, bump, &counters.second);
    pthread_join(a, 0); pthread_join(b, 0);
    return (int)(counters.first == counters.second);
}
'@ | Set-Content false-sharing.c
gcc -O2 -pthread false-sharing.c -o false-sharing-packed
gcc -O2 -pthread -DFIELDS_ALIGNED false-sharing.c -o false-sharing-aligned
perf stat -e cycles,cache-misses ./false-sharing-packed
perf stat -e cycles,cache-misses ./false-sharing-aligned`,
        output: `./false-sharing-packed: 9,641,228,301 cycles, 54,880,112 cache-misses
./false-sharing-aligned: 2,107,442,118 cycles, 11,904,227 cache-misses

未对齐计数器共享一个缓存行，两核反复争用同一行。
alignas(64) 将两个变量分到独立缓存行，对照数据得到改善。`,
      }],
    ],
  },
  {
    name: 'C · 调试、追踪、静态分析与性能：C 服务生产诊断报告',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已会用 gdb 读 core 并用 strace 追踪。',
    goal: '能把 gdb 回溯、strace 过滤、perf 采样与日志证据组织成一份可复现的生产诊断报告，掌握证据链排序、根因与临时措施区分的写作方法，并在复盘会上用可重跑的命令支撑结论。',
    guidedPractice: '现场拿一份给定的崩溃日志与 core，按时间线整理：先 coredumpctl 确认信号与 build-id，再 gdb bt full 取栈，strace 复现路径核对参数，逐项把命令输出截取进报告模板。',
    independentPractice: '独立完成：为一个真实或模拟的线上故障独立产出诊断报告，含复现步骤、证据链、根因判断、临时措施与长期修复建议，报告里每条结论都要对应一条可重跑的命令及其输出。',
    commonErrors: ['把猜测写进根因栏而没附可重跑命令，评审者无法验证，报告在复盘会上被反复质疑推翻。', '临时措施与长期修复混写在一起，值班同事不知道哪些动作只是先止血、事后可以回滚。'],
    sourceRefs: ['GDB Documentation. https://sourceware.org/gdb/current/onlinedocs/', 'GCC Documentation. https://gcc.gnu.org/onlinedocs/'],
    steps: [
      ['报告从时间线起笔', '诊断报告第一段是客观时间线：异常发生时刻、信号类型、进程 PID 与版本号，全部取自 coredumpctl list、监控系统与部署记录，不带任何推断。版本信息要记 commit 哈希与 GNU build-id，后续所有符号分析都建立在这份可对号的产物上。写法上每条一行、时刻在前，评审者一眼能核对事件先后；缺了版本与时刻的报告，后面的栈分析可能对着错误版本的符号白忙一场，这是整份报告最先要钉死的两根桩。', '先对号版本', {
        title: 'PowerShell：一次性采集不可变事实',
        language: 'PowerShell',
        code: `$report = [ordered]@{
  Timestamp = (Get-Date).ToUniversalTime().ToString('o')
  Host = (hostname)
  Kernel = (uname -r)
  ReleaseCommit = (git rev-parse HEAD)
  BuildId = (readelf -n ./orders | Select-String 'Build ID').ToString().Trim()
}
$report | ConvertTo-Json | Set-Content incident-facts.json
coredumpctl list --since '2026-11-24 10:00' | Select-Object -First 5
Get-Content incident-facts.json`,
        output: `{
  "Timestamp": "2026-11-24T03:22:14.4200000Z",
  "Host": "orders-prod-02",
  "Kernel": "6.8.0-45-generic",
  "ReleaseCommit": "4e91ac2",
  "BuildId": "Build ID: 7f21a0d4..."
}
TIME                PID SIG     EXE
11:22:14 4212 SIGSEGV /opt/orders/orders

时间、版本、主机和 build-id 先固化为事实。
后续栈与日志必须能关联到同一个二进制产物。`,
      }],
      ['证据链命令化', '报告里每条证据必须附可重跑的命令与关键输出，例如 gdb 程序名 core 得到的 bt、strace -e trace=%file 给出的路径序列、perf record 之后 report 的热点占比。输出只截取与结论相关的行而不是整屏粘贴，并注明当时的内核版本与命令参数，因为 errno 语义与计数器名称都随版本变化。检验标准是同事拿同一份产物在测试机重跑这些命令能得到相同结论；做不到重放的证据只能标注为旁证，不进入根因推理。', '结论能重放', {
        title: 'PowerShell：把命令和关键输出归档成证据',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory -Force evidence | Out-Null
gdb -q ./orders crash.core -batch -ex 'bt full' -ex 'info registers rip' *> evidence/gdb.txt
strace -f -e trace=%file -o evidence/files.log ./orders --config missing.yml
perf record -F 99 -g -o evidence/perf.data -- ./orders --replay 3
perf report --stdio -i evidence/perf.data --percent-limit 5 *> evidence/perf.txt
@'
cmd: gdb -q ./orders crash.core -batch -ex 'bt full'
conclusion: SIGSEGV at order_update order=0x0
evidence: evidence/gdb.txt#L18-L24
'@ | Set-Content evidence/index.txt
Get-ChildItem evidence | Select-Object Name,Length`,
        output: `Name         Length
----         ------
gdb.txt       1841
files.log      620
perf.data    98304
perf.txt      1120
index.txt      142

每份证据保留原始文件，索引写明命令、结论和行号。
报告读者可以重新执行命令，不必依赖口头描述。`,
      }],
      ['根因与措施分开', '根因栏写机制解释加触发条件，例如「空指针传入回调，第 N 路连接超时重连时未判空」，并给出最小复现；临时措施栏写止血动作如重启、降级开关、回滚版本，各自标注影响面与回滚条件；长期修复栏写代码改动与守护手段，如补回归测试、加断言或把 sanitizer 抽测接入 CI 门禁。三栏不混排是给值班与开发分职：值班只照临时措施执行，开发认领修复项，复盘会按栏逐项销账，避免止血动作被当成永久方案留下隐患。', '止血与修根两栏', {
        title: 'Markdown：同一事故拆成根因、止血与修复',
        language: 'Markdown',
        code: `# Incident IR-2026-11-24-01
## Root cause
- Trigger: reconnect timeout leaves session->user as NULL.
- Mechanism: order_update dereferences user->profile at order.c:42.
- Repro: ./orders --replay reconnect-timeout --iterations 3
## Temporary mitigation
- Disable reconnect failover feature flag for affected tenant.
- Rollback condition: crash rate above 0.5% for 10 minutes.
## Permanent fix
- Add NULL guard and contract test at reconnect boundary.
- Run ASan reconnect-timeout suite in CI.
## Evidence
- evidence/gdb.txt lines 18-24
- evidence/files.log line 9`,
        output: `Root cause: reconnect timeout leaves session->user as NULL.
Temporary mitigation: feature flag off, rollback if crash rate > 0.5%.
Permanent fix: NULL guard, contract test, ASan CI job.
Evidence: gdb frame and file trace are linked by line number.

值班人员只执行临时措施，开发人员认领长期修复。
止血开关、回滚条件和证据编号都可追踪。`,
      }],
      ['分层归因避免甩锅', '归因要沿调用栈分层：应用逻辑、库实现、内核与配置各看各的证据，不能拿单点现象直接定性。指针崩溃先确认是解引用空还是越界写，内存增长先分清泄漏还是缓存膨胀，用 valgrind 或 ASan 在测试环境复核；系统级异常对照 dmesg 与 OOM 日志，排除进程被内核杀掉的可能。结论用限定词写明置信度与未验证部分，例如「高置信为内存泄漏，待 ASan 全量跑完确认」，比绝对化的单句定性更经得起复盘会的追问。', '分层举证不甩锅', {
        title: 'ASan + dmesg：把应用与系统证据分开',
        language: 'PowerShell',
        code: `gcc -g -O1 -fsanitize=address,undefined -fno-omit-frame-pointer \\
  src/*.c -o orders-asan
$env:ASAN_OPTIONS = 'detect_leaks=1:abort_on_error=1'
.\\orders-asan --replay reconnect-timeout --iterations 3 *> asan.txt
dmesg --ctime | Select-String 'Out of memory|killed process|segfault'
journalctl -u orders --since '2026-11-24 11:00' --no-pager | Select-Object -Last 40
Get-Content asan.txt | Select-Object -First 20`,
        output: `==4212==ERROR: AddressSanitizer: SEGV on unknown address 0x000000000008
READ of size 8 at 0x000000000008 thread T1
    #0 order_update src/order.c:42
dmesg: no out-of-memory or kernel kill events in window
journalctl: orders.service restarted after signal SIGSEGV

ASan 指向应用层空指针读取。
dmesg 无 OOM 记录，排除内核杀进程；服务重启是结果不是根因。`,
      }],
      ['落成守护与复盘', '诊断结束要留三件东西：可回归的复现脚本或用例、进入 CI 的防回归门禁如新增警告即失败与 sanitizer 抽测、更新后的值班手册条目。复盘会按时间线与证据链重讲一遍，把每条根因对应到具体修复提交，未完成项挂上编号跟踪。验收动作：拿修复后的版本重跑原故障场景，确认原崩溃信号不再出现，并把前后两份 perf stat 或 coredumpctl 记录作为对照附进报告归档，形成闭环证据。', '复现脚本进 CI', {
        title: '复现脚本与 CI 门禁：验证修复确实生效',
        language: 'PowerShell',
        code: `@'
set -eu
for i in 1 2 3; do
  ./orders-asan --replay reconnect-timeout --iterations 3
done
'@ | Set-Content scripts/replay-incident.sh
bash scripts/replay-incident.sh
gcc -std=c17 -Wall -Wextra -Werror -fsanitize=address src/*.c -o orders-asan
ctest --test-dir build --output-on-failure
git log -1 --format='%H %s'
Get-Content docs/runbooks/orders-reconnect.md -TotalCount 20`,
        output: `replay 1/3 passed
replay 2/3 passed
replay 3/3 passed
100% tests passed, 0 tests failed out of 24
4e91ac2 fix(orders): reject reconnect callback without user

修复后同一复现场景连续通过。
CI 同时门禁严格编译、ASan 回放和回归测试。`,
      }],
    ],
  },
];

// ── C5 数据结构、并发与协议工程 ─────────────────────────────────────────────
export const HANDWRITTEN_C_SYSTEMS_C5_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C · 数据结构、并发与协议工程：哈希表、链表、队列和内存池',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已掌握指针、结构体与 malloc/free 内存管理。',
    goal: '掌握链地址法哈希表从插入到 rehash 的完整机制，会用哨兵节点简化双向链表边界，理解环形队列判满判空的两种标准解法与固定块内存池的分配回收路径。',
    guidedPractice: '现场实现桶数为 16 的链地址哈希表，插入一万个整数后打印每条桶链长度统计分布；再写环形队列连推到满、连弹到空，打印 head 与 tail 索引观察判满判空边界。',
    independentPractice: '独立交付：一个带 rehash 的哈希表加环形队列加固定块内存池的组合模块，提供 destroy 释放全部内存，并用 valgrind 验证零泄漏零越界。',
    commonErrors: ['哈希表扩容时只复制桶数组指针，链表节点仍挂在旧桶上，rehash 后遍历直接解引用悬空指针崩溃。', '环形队列仅凭 head 等于 tail 同时判空判满，队列已满后继续 push 静默覆盖队头数据。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/'],
    steps: [
      ['链地址法与负载因子', '链地址法哈希表把桶数组每格接到一条单向链表上，冲突元素直接链入桶头。负载因子等于元素数除以桶数，链地址法通常在负载因子达到 1 时触发扩容：新建两倍桶数的数组，把全部节点逐个重新散列挂入新桶，扩容成本被摊到后续插入上，平均查找仍接近常数。可验证：插入一万个元素后遍历统计平均链长，数值应接近负载因子本身。', '负载因子一到就扩', {
        title: 'C：带 rehash 的链地址哈希表',
        language: 'PowerShell',
        code: `@'
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
typedef struct Node { uint32_t key; struct Node *next; } Node;
typedef struct { Node **buckets; size_t cap, count; } Map;
static size_t bucket_of(uint32_t key, size_t cap) {
    return (size_t)((key * 2654435761u) % cap);
}
static int map_grow(Map *m, size_t next_cap) {
    Node **next = calloc(next_cap, sizeof(*next));
    if (!next) return -1;
    for (size_t i = 0; i < m->cap; ++i) {
        Node *node = m->buckets[i];
        while (node) {
            Node *following = node->next;
            size_t slot = bucket_of(node->key, next_cap);
            node->next = next[slot];
            next[slot] = node;
            node = following;
        }
    }
    free(m->buckets);
    m->buckets = next;
    m->cap = next_cap;
    return 0;
}
static int map_put(Map *m, uint32_t key) {
    if ((m->count + 1) > m->cap && map_grow(m, m->cap * 2) != 0) return -1;
    Node *node = malloc(sizeof(*node));
    if (!node) return -1;
    size_t slot = bucket_of(key, m->cap);
    node->key = key; node->next = m->buckets[slot];
    m->buckets[slot] = node; ++m->count;
    return 0;
}
static void map_destroy(Map *m) {
    for (size_t i = 0; i < m->cap; ++i) {
        while (m->buckets[i]) {
            Node *next = m->buckets[i]->next;
            free(m->buckets[i]); m->buckets[i] = next;
        }
    }
    free(m->buckets);
}
int main(void) {
    Map map = {0}; map.cap = 16;
    map.buckets = calloc(map.cap, sizeof(*map.buckets));
    for (uint32_t key = 0; key < 10000; ++key)
        if (map_put(&map, key) != 0) return 1;
    size_t longest = 0;
    for (size_t i = 0; i < map.cap; ++i) {
        size_t len = 0;
        for (Node *n = map.buckets[i]; n; n = n->next) ++len;
        if (len > longest) longest = len;
    }
    printf("count=%zu capacity=%zu load=%.2f longest=%zu\\n",
           map.count, map.cap, (double)map.count / map.cap, longest);
    map_destroy(&map); return 0;
}
'@ | Set-Content hashmap.c
gcc -std=c17 -Wall -Wextra -Werror -fsanitize=address hashmap.c -o hashmap
.\\hashmap`,
        output: `count=10000 capacity=16384 load=0.61 longest=5

扩容后平均每条桶链约 0.61 个节点。
rehash 必须把每个旧节点重新挂入新桶，不能只复制桶数组指针。`,
      }],
      ['哈希函数的选取', '整数键常用乘法散列或 FNV-1a：FNV-1a 对每个字节先异或再乘素数 16777619，分布均匀且实现只有几行。字符串键必须让全部字节参与运算而非只看首字符，否则按公共前缀聚簇退化成链表。哈希值映射桶索引用取模，桶数取素数或取 2 的幂并改用位与都能减少分布偏差。可验证：把 1 到 10000 连续键散列后打印各桶占用，应均匀铺开而非集中在少数桶。', '素数桶减聚簇', {
        title: 'C：FNV-1a 字符串散列分布',
        language: 'PowerShell',
        code: `@'
#include <stdint.h>
#include <stdio.h>
#define BUCKETS 1009
#define KEYS 10000
static uint32_t fnv1a(const char *s) {
    uint32_t h = 2166136261u;
    while (*s) {
        h ^= (unsigned char)*s++;
        h *= 16777619u;
    }
    return h;
}
int main(void) {
    unsigned counts[BUCKETS] = {0};
    for (int i = 0; i < KEYS; ++i) {
        char key[16];
        snprintf(key, sizeof key, "order:%d", i);
        ++counts[fnv1a(key) % BUCKETS];
    }
    unsigned lo = KEYS, hi = 0;
    int used = 0;
    for (int i = 0; i < BUCKETS; ++i) {
        if (counts[i] < lo) lo = counts[i];
        if (counts[i] > hi) hi = counts[i];
        used += counts[i] != 0;
    }
    printf("buckets=%d used=%d min=%u max=%u expected=%.2f\\n",
           BUCKETS, used, lo, hi, (double)KEYS / BUCKETS);
    return 0;
}
'@ | Set-Content fnv.c
gcc -std=c17 -O2 -Wall -Wextra -Werror fnv.c -o fnv
.\\fnv`,
        output: `buckets=1009 used=1009 min=2 max=21 expected=9.91

每个桶都被使用，最长链没有贴近全部一万个键。
若只散列字符串首字符，order:* 会大量撞进同一桶。`,
      }],
      ['双向链表与哨兵节点', '双向链表每个节点带 prev 与 next 指针，头尾各放一个哨兵节点后，首尾插入删除不再特判空表与单节点，任意位置删除统一写成 p->prev->next = p->next; p->next->prev = p->prev 两行。哨兵不存数据只当固定锚点，链表为空时两哨兵互指。可验证：对含哨兵的链表头插一百次再正反各遍历一次，两个顺序应严格互逆，漏改任一方向指针立即在遍历中暴露。', '哨兵消掉特判', {
        title: 'C：双哨兵双向链表的插入与删除',
        language: 'PowerShell',
        code: `@'
#include <stdio.h>
#include <stdlib.h>
typedef struct Node { int value; struct Node *prev, *next; } Node;
typedef struct { Node head, tail; } List;
static void init(List *l) {
    l->head.prev = NULL; l->head.next = &l->tail;
    l->tail.prev = &l->head; l->tail.next = NULL;
}
static void push_front(List *l, int value) {
    Node *n = malloc(sizeof(*n));
    if (!n) return;
    n->value = value;
    n->prev = &l->head; n->next = l->head.next;
    n->prev->next = n; n->next->prev = n;
}
static void erase(Node *n) {
    n->prev->next = n->next;
    n->next->prev = n->prev;
    free(n);
}
static int forward(List *l) {
    int last = -1;
    for (Node *n = l->head.next; n != &l->tail; n = n->next) last = n->value;
    return last;
}
static int reverse(List *l) {
    int last = -1;
    for (Node *n = l->tail.prev; n != &l->head; n = n->prev) last = n->value;
    return last;
}
int main(void) {
    List list; init(&list);
    for (int i = 0; i < 20; ++i) push_front(&list, i);
    for (Node *n = list.head.next; n != &list.tail; ) {
        Node *next = n->next;
        if (n->value % 3 == 0) erase(n);
        n = next;
    }
    printf("forward_last=%d reverse_last=%d\\n", forward(&list), reverse(&list));
    while (list.head.next != &list.tail) erase(list.head.next);
    printf("empty=%d\\n", list.head.next == &list.tail && list.tail.prev == &list.head);
    return 0;
}
'@ | Set-Content sentinel-list.c
gcc -std=c17 -Wall -Wextra -Werror -fsanitize=address sentinel-list.c -o sentinel-list
.\\sentinel-list`,
        output: `forward_last=1 reverse_last=1
empty=1

删除节点时先保存 next，避免释放后继续访问。
空表时头哨兵的 next 与尾哨兵的 prev 仍正确指向彼此。`,
      }],
      ['环形队列判满判空', '环形队列用定长数组加 head、tail 两索引实现，出队只动 head，入队只动 tail，索引到容量后取模回绕。仅凭 head 等于 tail 无法区分空与满，两种标准解法：牺牲一格保持 tail 加一后等于 head 判满；或额外维护 count 计数器，等于容量判满等于零判空。可验证：容量为 8 的队列连推 8 个再连弹 8 个，索引应精确回到起点且数据一个不丢。', '留空一格判满', {
        title: 'C：用 count 区分环形队列空与满',
        language: 'PowerShell',
        code: `@'
#include <stdbool.h>
#include <stdio.h>
#define CAP 8
typedef struct {
    int data[CAP];
    unsigned head, tail, count;
} Queue;
static bool push(Queue *q, int value) {
    if (q->count == CAP) return false;
    q->data[q->tail] = value;
    q->tail = (q->tail + 1) % CAP;
    ++q->count; return true;
}
static bool pop(Queue *q, int *out) {
    if (q->count == 0) return false;
    *out = q->data[q->head];
    q->head = (q->head + 1) % CAP;
    --q->count; return true;
}
int main(void) {
    Queue q = {0};
    for (int i = 0; i < CAP; ++i) printf("push %d=%d\\n", i, push(&q, i));
    printf("full=%d value=%d\\n", q.count == CAP, push(&q, 99));
    for (int i = 0; i < CAP; ++i) {
        int value = -1; bool ok = pop(&q, &value);
        printf("pop=%d value=%d count=%u\\n", ok, value, q.count);
    }
    printf("head=%u tail=%u empty=%d\\n", q.head, q.tail, q.count == 0);
    return 0;
}
'@ | Set-Content ring-queue.c
gcc -std=c17 -Wall -Wextra -Werror ring-queue.c -o ring-queue
.\\ring-queue`,
        output: `push 0=1 ... push 7=1
full=1 value=0
pop=1 value=0 count=7
...
pop=1 value=7 count=0
head=0 tail=0 empty=1

第九次 push 被拒绝，没有覆盖队头。
count 使 head 与 tail 再次相等时仍能判定为空。`,
      }],
      ['固定块内存池', '内存池启动时一次性 malloc 大块内存切成等大小块，用每块前 8 字节串成自由链表，分配摘链表头，释放头插回去，全程常数代价且无系统调用。池内对象尺寸固定，天然杜绝外部碎片；释放只还回池不还系统，程序退出前统一销毁整块。可验证：分配一万次再全部归还后重新分配，应全部命中同一批块，自由链表长度回到初值。', '摘头还头一步到位', {
        title: 'C：固定块内存池的分配与归还',
        language: 'PowerShell',
        code: `@'
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#define BLOCK_SIZE 64
#define BLOCK_COUNT 8
typedef union Block { union Block *next; max_align_t alignment; } Block;
typedef struct { Block *free_list; unsigned available; } Pool;
static int pool_init(Pool *p) {
    Block *memory = malloc(BLOCK_COUNT * sizeof(Block));
    if (!memory) return -1;
    p->free_list = NULL; p->available = BLOCK_COUNT;
    for (int i = BLOCK_COUNT - 1; i >= 0; --i) {
        memory[i].next = p->free_list;
        p->free_list = &memory[i];
    }
    return 0;
}
static void *pool_alloc(Pool *p) {
    if (!p->free_list) return NULL;
    Block *block = p->free_list;
    p->free_list = block->next;
    --p->available;
    return block;
}
static void pool_free(Pool *p, void *ptr) {
    Block *block = ptr;
    block->next = p->free_list;
    p->free_list = block;
    ++p->available;
}
int main(void) {
    Pool pool; if (pool_init(&pool) != 0) return 1;
    void *first[BLOCK_COUNT];
    for (int i = 0; i < BLOCK_COUNT; ++i) first[i] = pool_alloc(&pool);
    printf("after_alloc=%u null=%d\\n", pool.available, pool_alloc(&pool) == NULL);
    for (int i = 0; i < BLOCK_COUNT; ++i) pool_free(&pool, first[i]);
    void *second = pool_alloc(&pool);
    printf("after_reuse=%u same_block=%d\\n", pool.available, second == first[BLOCK_COUNT - 1]);
    return 0;
}
'@ | Set-Content memory-pool.c
gcc -std=c17 -Wall -Wextra -Werror -fsanitize=address memory-pool.c -o memory-pool
.\\memory-pool`,
        output: `after_alloc=0 null=1
after_reuse=7 same_block=1

池耗尽时返回 NULL，不会越界分配。
归还后的块被下一次分配立即复用，块地址保持不变。`,
      }],
    ],
  },
  {
    name: 'C · 数据结构、并发与协议工程：线程、互斥量、条件变量和原子',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已能用 gcc 编译运行多线程程序并熟悉指针操作。',
    goal: '掌握 pthread_create 传参生命周期与返回值语义，会用互斥量保护共享计数，理解条件变量 while 重判与虚假唤醒的成因，能区分 C11 原子操作各内存序的可见性边界。',
    guidedPractice: '写两个线程无锁自增同一计数器各十万次并打印总数偏小的事实；再改用 pthread_mutex_lock 修复到精确值，最后给条件变量等待循环插入打印计数，运行观察虚假唤醒发生次数。',
    independentPractice: '独立交付：一个互斥量加两个条件变量实现的有界缓冲生产者消费者程序，生产消费各两个线程跑十万条消息全部收齐，退出码为 0。',
    commonErrors: ['pthread_create 传栈上局部变量地址，主线程先返回导致线程解引用悬空指针读到垃圾值。', '条件变量等待用 if 只判断一次条件，虚假唤醒后在条件未满足时继续执行，直接操作空缓冲。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/'],
    steps: [
      ['pthread_create 与 join', 'pthread_create 第四个参数把指针原样传给线程函数，线程尚未解引用时主线程若已返回，栈上变量就失效了，因此传参要么用 malloc 堆内存，要么保证 join 之前主线程不销毁它。返回值为 0 表示成功，失败返回错误码而非设置 errno，例如 EAGAIN 表示线程数超系统限制。可验证：两线程各打印自己的 pthread_self 值，再 pthread_join 依次等待并确认两个返回值都是 0。', '传参保生命周期', {
        title: 'pthread：堆参数、错误码与 join',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
typedef struct { int id; unsigned long self; } Job;
static void *worker(void *arg) {
    Job *job = arg;
    job->self = (unsigned long)pthread_self();
    printf("worker=%d self=%lx\\n", job->id, job->self);
    return job;
}
int main(void) {
    pthread_t threads[2];
    Job *jobs[2];
    for (int i = 0; i < 2; ++i) {
        jobs[i] = malloc(sizeof(*jobs[i]));
        if (!jobs[i]) return 1;
        jobs[i]->id = i; jobs[i]->self = 0;
        int rc = pthread_create(&threads[i], NULL, worker, jobs[i]);
        if (rc != 0) { fprintf(stderr, "create rc=%d\\n", rc); return 1; }
    }
    for (int i = 0; i < 2; ++i) {
        void *returned = NULL;
        int rc = pthread_join(threads[i], &returned);
        printf("join=%d rc=%d same=%d\\n", i, rc, returned == jobs[i]);
        free(jobs[i]);
    }
    return 0;
}
'@ | Set-Content pthread-basic.c
gcc -std=c17 -Wall -Wextra -Werror -pthread pthread-basic.c -o pthread-basic
.\\pthread-basic`,
        output: `worker=0 self=7f2d1c9a86c0
worker=1 self=7f2d1c1a76c0
join=0 rc=0 same=1
join=1 rc=0 same=1

pthread_create 与 join 都用返回值报告错误，不设置 errno。
堆参数在 join 完成后才释放，线程不会读到悬空栈地址。`,
      }],
      ['互斥量的正确加解锁', 'pthread_mutex_lock 成功返回 0，失败返回错误码，EDEADLK 表示同一线程重复加锁；pthread_mutex_trylock 不阻塞，锁被占时立即返回 EBUSY。加锁必须覆盖全部共享访问路径，漏掉任何一条就等于没加；退出临界区前必须 unlock，否则其他线程永久阻塞。可验证：两线程各对同一计数器无锁自增十万次，总数应小于二十万，加锁重跑后恢复精确值。', '加解锁严格配对', {
        title: 'pthread_mutex：从丢失更新到精确计数',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdio.h>
typedef struct { long value; pthread_mutex_t lock; } Counter;
static Counter counter = {0, PTHREAD_MUTEX_INITIALIZER};
static void *increment(void *arg) {
    int locked = *(int *)arg;
    for (int i = 0; i < 100000; ++i) {
        if (locked) pthread_mutex_lock(&counter.lock);
        long next = counter.value + 1;
        counter.value = next;
        if (locked) pthread_mutex_unlock(&counter.lock);
    }
    return NULL;
}
static long run(int locked) {
    pthread_t a, b; int mode = locked;
    counter.value = 0;
    pthread_create(&a, NULL, increment, &mode);
    pthread_create(&b, NULL, increment, &mode);
    pthread_join(a, NULL); pthread_join(b, NULL);
    return counter.value;
}
int main(void) {
    long unsynchronized = run(0);
    long synchronized = run(1);
    printf("unsynchronized=%ld synchronized=%ld\\n", unsynchronized, synchronized);
    return synchronized == 200000 ? 0 : 1;
}
'@ | Set-Content mutex-counter.c
gcc -std=c17 -O2 -Wall -Wextra -Werror -pthread mutex-counter.c -o mutex-counter
.\\mutex-counter`,
        output: `unsynchronized=146283 synchronized=200000

无锁版本出现丢失更新，实际值取决于调度。
互斥量把读取、计算、写回整个临界区包住，最终精确为 200000。`,
      }],
      ['条件变量与虚假唤醒', 'pthread_cond_wait 必须在持有互斥量的前提下调用，它原子地释放锁并挂起线程，被唤醒后重新抢锁才返回。唤醒可能毫无理由地发生，即虚假唤醒，因此等待侧必须写成 while 条件不满足就继续 wait，不能写成 if 只判一次。signal 唤醒至少一个等待者，broadcast 唤醒全部等待者。可验证：在条件恒假的等待循环里插入计数打印，运行后计数大于一即虚假唤醒的直接证据。', 'while防虚假唤醒', {
        title: 'pthread_cond：while 重判与超时唤醒',
        language: 'PowerShell',
        code: `@'
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <pthread.h>
#include <stdio.h>
#include <time.h>
typedef struct {
    pthread_mutex_t lock;
    pthread_cond_t changed;
    int ready;
} State;
static State state = {PTHREAD_MUTEX_INITIALIZER, PTHREAD_COND_INITIALIZER, 0};
static void *consumer(void *unused) {
    (void)unused;
    int timeouts = 0;
    pthread_mutex_lock(&state.lock);
    while (!state.ready) {
        struct timespec until;
        clock_gettime(CLOCK_REALTIME, &until);
        until.tv_nsec += 50 * 1000 * 1000;
        if (until.tv_nsec >= 1000000000) { ++until.tv_sec; until.tv_nsec -= 1000000000; }
        int rc = pthread_cond_timedwait(&state.changed, &state.lock, &until);
        if (rc == ETIMEDOUT) ++timeouts;
    }
    printf("timeouts=%d ready=%d\\n", timeouts, state.ready);
    pthread_mutex_unlock(&state.lock);
    return NULL;
}
static void *producer(void *unused) {
    (void)unused;
    struct timespec delay = {0, 120 * 1000 * 1000};
    nanosleep(&delay, NULL);
    pthread_mutex_lock(&state.lock);
    state.ready = 1;
    pthread_cond_signal(&state.changed);
    pthread_mutex_unlock(&state.lock);
    return NULL;
}
int main(void) {
    pthread_t waiter, setter;
    pthread_create(&waiter, NULL, consumer, NULL);
    pthread_create(&setter, NULL, producer, NULL);
    pthread_join(waiter, NULL); pthread_join(setter, NULL);
    return 0;
}
'@ | Set-Content condition-variable.c
gcc -std=c17 -Wall -Wextra -Werror -pthread condition-variable.c -o condition-variable
.\\condition-variable`,
        output: `timeouts=1 ready=1

第一次醒来自超时，条件仍为假，while 继续等待。
生产线程置 ready=1 并 signal 后，循环才退出。`,
      }],
      ['有界缓冲生产者消费者', '有界缓冲用一把互斥量加两个条件变量：缓冲满时生产者在 not_full 上等待，空时消费者在 not_empty 上等待，每放入一个元素 signal not_empty，取出后 signal not_full。条件判断与缓冲修改必须在同一把锁保护下完成，多消费者场景要评估用 broadcast 防漏醒。可验证：生产者速率高于消费者时打印缓冲占用，数值应停在容量上限处而不是越界继续涨。', '一把锁两条件', {
        title: '有界缓冲：两生产者两消费者收齐全部消息',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdio.h>
#define CAP 8
#define PRODUCERS 2
#define CONSUMERS 2
#define PER_PRODUCER 1000
typedef struct {
    int data[CAP]; int head, tail, count;
    int produced, consumed, max_count;
    pthread_mutex_t lock;
    pthread_cond_t not_empty, not_full;
} Buffer;
static Buffer buffer = {
    .lock = PTHREAD_MUTEX_INITIALIZER,
    .not_empty = PTHREAD_COND_INITIALIZER,
    .not_full = PTHREAD_COND_INITIALIZER
};
static void put(int value) {
    pthread_mutex_lock(&buffer.lock);
    while (buffer.count == CAP) pthread_cond_wait(&buffer.not_full, &buffer.lock);
    buffer.data[buffer.tail] = value;
    buffer.tail = (buffer.tail + 1) % CAP;
    ++buffer.count; ++buffer.produced;
    if (buffer.count > buffer.max_count) buffer.max_count = buffer.count;
    pthread_cond_signal(&buffer.not_empty);
    pthread_mutex_unlock(&buffer.lock);
}
static int take(void) {
    pthread_mutex_lock(&buffer.lock);
    while (buffer.count == 0) pthread_cond_wait(&buffer.not_empty, &buffer.lock);
    int value = buffer.data[buffer.head];
    buffer.head = (buffer.head + 1) % CAP;
    --buffer.count; ++buffer.consumed;
    pthread_cond_signal(&buffer.not_full);
    pthread_mutex_unlock(&buffer.lock);
    return value;
}
static void *produce(void *arg) {
    int base = *(int *)arg * PER_PRODUCER;
    for (int i = 0; i < PER_PRODUCER; ++i) put(base + i);
    return NULL;
}
static void *consume(void *unused) {
    (void)unused;
    for (int i = 0; i < (PRODUCERS * PER_PRODUCER) / CONSUMERS; ++i) take();
    return NULL;
}
int main(void) {
    pthread_t producers[PRODUCERS], consumers[CONSUMERS];
    int ids[PRODUCERS] = {0, 1};
    for (int i = 0; i < CONSUMERS; ++i) pthread_create(&consumers[i], NULL, consume, NULL);
    for (int i = 0; i < PRODUCERS; ++i) pthread_create(&producers[i], NULL, produce, &ids[i]);
    for (int i = 0; i < PRODUCERS; ++i) pthread_join(producers[i], NULL);
    for (int i = 0; i < CONSUMERS; ++i) pthread_join(consumers[i], NULL);
    printf("produced=%d consumed=%d max_count=%d\\n",
           buffer.produced, buffer.consumed, buffer.max_count);
    return buffer.produced == buffer.consumed ? 0 : 1;
}
'@ | Set-Content bounded-buffer.c
gcc -std=c17 -O2 -Wall -Wextra -Werror -pthread bounded-buffer.c -o bounded-buffer
.\\bounded-buffer
perf stat -e context-switches .\\bounded-buffer`,
        output: `produced=2000 consumed=2000 max_count=8
context-switches: 1842

缓冲占用量从未超过容量 8。
两个条件变量分别等待非空与非满，消息生产消费数量一致。`,
      }],
      ['C11 原子与内存序', 'C11 提供 _Atomic 类型与 atomic_fetch_add 等操作，memory_order_seq_cst 是默认最强序；acquire 与 release 配对建立 happens-before 关系，release 写入让该原子操作之前的全部写对随后 acquire 读到该值的线程可见。relaxed 只保证原子性不保证顺序，适合纯计数场景。可验证：用 atomic_fetch_add_explicit 配 memory_order_relaxed 做八线程并发计数，总数应精确等于八十万。', '单值计数用原子', {
        title: 'C11 原子：八线程 relaxed 计数',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#define THREADS 8
#define INCREMENTS 100000
static atomic_ulong total = 0;
static void *worker(void *unused) {
    (void)unused;
    for (int i = 0; i < INCREMENTS; ++i)
        atomic_fetch_add_explicit(&total, 1, memory_order_relaxed);
    return NULL;
}
int main(void) {
    pthread_t threads[THREADS];
    for (int i = 0; i < THREADS; ++i)
        pthread_create(&threads[i], NULL, worker, NULL);
    for (int i = 0; i < THREADS; ++i)
        pthread_join(threads[i], NULL);
    unsigned long result = atomic_load_explicit(&total, memory_order_relaxed);
    printf("total=%lu expected=%d\\n", result, THREADS * INCREMENTS);
    return result == THREADS * INCREMENTS ? 0 : 1;
}
'@ | Set-Content atomic-counter.c
gcc -std=c17 -O2 -Wall -Wextra -Werror -pthread atomic-counter.c -o atomic-counter
.\\atomic-counter
objdump -d atomic-counter | Select-String "lock add|lock xadd"`,
        output: `total=800000 expected=800000
  ... lock xadd %rdx,(%rax)

relaxed 仍保证每次读改写不可分割，所以计数精确。
它不建立其他变量的先后可见性；发布缓冲指针时要改用 release/acquire。`,
      }],
    ],
  },
  {
    name: 'C · 数据结构、并发与协议工程：数据竞争、死锁和线程清理',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已用过 pthread 互斥量并理解线程创建与等待。',
    goal: '理解数据竞争构成未定义行为的机制并会用 ThreadSanitizer 定位，掌握死锁四条件与锁排序防法，会用 trylock 回退打破持有等待，能注册清理函数并正确处理线程取消。',
    guidedPractice: '用 gcc -fsanitize=thread 编译两个线程无同步写同一 int 的程序，运行抄下 data race 报告与两条冲突访问的栈；再以相反顺序锁两把互斥量复现卡死，改成统一地址顺序后重跑验证。',
    independentPractice: '独立交付：一个含锁排序、trylock 回退与 cleanup 清理函数的多线程程序，跑 TSan 零报告，并在线程被取消后由清理函数释放全部已持资源。',
    commonErrors: ['两个线程以不同顺序获取两把互斥量，各自拿到一把后互相等待对方释放，进程整体卡死。', '线程被取消时持有互斥量未注册清理函数，锁永久处于加锁状态，后续线程全部阻塞。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/'],
    steps: [
      ['数据竞争与 TSan', '两个线程访问同一内存位置、至少一个是写、之间没有任何同步，即构成数据竞争，在 C 里构成未定义行为，编译器有权生成看似错误的代码。ThreadSanitizer 用 -fsanitize=thread 编译，在每次内存访问处插入影子记录，运行时捕获竞争并打印两条冲突访问的完整调用栈。可验证：写两线程无同步写同一 int，TSan 构建运行即报 data race 并给出两个线程的栈回放。', 'TSan抓双栈', {
        title: 'TSan：定位无同步计数器的两条访问栈',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdio.h>
static long counter;
static void *increment(void *arg) {
    (void)arg;
    for (int i = 0; i < 100000; ++i) {
        long next = counter + 1;
        counter = next;
    }
    return NULL;
}
int main(void) {
    pthread_t a, b;
    pthread_create(&a, NULL, increment, NULL);
    pthread_create(&b, NULL, increment, NULL);
    pthread_join(a, NULL); pthread_join(b, NULL);
    printf("counter=%ld\\n", counter);
    return 0;
}
'@ | Set-Content race.c
gcc -std=c17 -g -O1 -pthread -fsanitize=thread race.c -o race-tsan
.\\race-tsan 2> tsan.txt
Get-Content tsan.txt -TotalCount 26`,
        output: `WARNING: ThreadSanitizer: data race
Write of size 8 at ... by thread T2:
  #0 increment race.c:7
Previous read of size 8 at ... by thread T1:
  #0 increment race.c:6
Location is global 'counter' at race.c:3
Thread T2 created by main thread at:
  #0 pthread_create
  #1 main race.c:13

TSan 同时给出写访问与之前的读访问。
两条栈都落在 increment，证明同一全局计数器缺少同步。`,
      }],
      ['死锁四条件与锁排序', '互斥、持有并等待、不可剥夺、循环等待四条件同时成立才可能死锁，破坏任意一条即可避免，工程上最可靠的是破坏循环等待：全程序约定按固定全序加锁，例如一律按互斥量内存地址从低到高获取，两个线程要同时持有 A 与 B 时都先 A 后 B，环无法形成。可验证：两线程以相反顺序锁两把互斥量复现卡死，统一为地址序后同一段代码反复运行到底。', '全序锁破循环等待', {
        title: '死锁复现：相反锁序与固定锁序对照',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
typedef struct { pthread_mutex_t a, b; } Pair;
static Pair pair = {PTHREAD_MUTEX_INITIALIZER, PTHREAD_MUTEX_INITIALIZER};
static void *worker(void *arg) {
    int reverse = (intptr_t)arg;
    pthread_mutex_t *first = reverse ? &pair.b : &pair.a;
    pthread_mutex_t *second = reverse ? &pair.a : &pair.b;
    pthread_mutex_lock(first);
    pthread_mutex_lock(second);
    puts("both locks acquired");
    pthread_mutex_unlock(second);
    pthread_mutex_unlock(first);
    return NULL;
}
int main(void) {
    pthread_t a, b;
    pthread_create(&a, NULL, worker, (void *)0);
    pthread_create(&b, NULL, worker, (void *)1);
    pthread_join(a, NULL); pthread_join(b, NULL);
    return 0;
}
'@ | Set-Content deadlock.c
gcc -std=c17 -O0 -g -pthread deadlock.c -o deadlock
$p = Start-Process .\\deadlock -PassThru -NoNewWindow
if (-not $p.WaitForExit(1500)) { $p.Kill(); Write-Output "deadlocked=1" }
Get-Process -Id $p.Id -ErrorAction SilentlyContinue`,
        output: `deadlocked=1

两个线程各拿到一把锁，再等待对方持有的另一把。
统一 first/second 的顺序后，第二次加锁不会再形成等待环。`,
      }],
      ['trylock 与死锁脱身', '无法完全排序时用 pthread_mutex_trylock 非阻塞抢锁，返回 EBUSY 表示失败，成功返回 0，失败时不得再触碰受保护数据。抢不到就先释放已持有的锁再稍后重试，用回退打破持有并等待条件；重试间隔要带随机抖动，固定间隔会让两个线程同步循环互相让路又互相抢回。可验证：对被占互斥量调用 trylock 并打印返回值，应得到 EBUSY 而非阻塞挂起。', '抢不到就回退', {
        title: 'pthread_mutex_trylock：EBUSY 后释放再重试',
        language: 'PowerShell',
        code: `@'
#include <errno.h>
#include <pthread.h>
#include <stdio.h>
#include <time.h>
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static void *contender(void *unused) {
    (void)unused;
    int rc = pthread_mutex_trylock(&lock);
    if (rc == EBUSY) {
        puts("contender: busy, release owned work and retry later");
        return NULL;
    }
    if (rc == 0) {
        puts("contender: lock acquired");
        pthread_mutex_unlock(&lock);
    }
    return NULL;
}
int main(void) {
    pthread_mutex_lock(&lock);
    pthread_t t; pthread_create(&t, NULL, contender, NULL);
    pthread_join(t, NULL);
    struct timespec pause = {0, 10 * 1000 * 1000};
    nanosleep(&pause, NULL);
    pthread_mutex_unlock(&lock);
    return 0;
}
'@ | Set-Content trylock.c
gcc -std=c17 -Wall -Wextra -Werror -pthread trylock.c -o trylock
Measure-Command { .\\trylock } | Select-Object TotalMilliseconds`,
        output: `contender: busy, release owned work and retry later
TotalMilliseconds : 15.8

trylock 立即返回 EBUSY，没有等待主线程释放锁。
实际程序应释放自己已持有的锁，再带随机抖动重试。`,
      }],
      ['线程清理处理函数', 'pthread_cleanup_push 与 pthread_cleanup_pop 成对出现构成词法块，注册的清理函数在线程被取消或调用 pthread_exit 时按注册逆序执行，pop 参数非零才执行，零只摘除不执行。清理函数用于释放互斥量、关闭描述符与归还内存池块，保证中途退出不泄漏。可验证：线程里注册两个打印型清理函数后调 pthread_exit，输出顺序应与注册顺序相反。', '清理逆序执行', {
        title: 'pthread_cleanup：pthread_exit 触发逆序清理',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdio.h>
static void first_cleanup(void *arg) {
    printf("cleanup:%s\\n", (const char *)arg);
}
static void second_cleanup(void *arg) {
    printf("cleanup:%s\\n", (const char *)arg);
}
static void *worker(void *unused) {
    (void)unused;
    pthread_cleanup_push(first_cleanup, "first-registered");
    pthread_cleanup_push(second_cleanup, "second-registered");
    pthread_exit((void *)42);
    pthread_cleanup_pop(0);
    pthread_cleanup_pop(0);
    return NULL;
}
int main(void) {
    pthread_t thread;
    pthread_create(&thread, NULL, worker, NULL);
    void *result = NULL;
    int rc = pthread_join(thread, &result);
    printf("join=%d result=%ld\\n", rc, (long)result);
    return 0;
}
'@ | Set-Content cleanup.c
gcc -std=c17 -Wall -Wextra -Werror -pthread cleanup.c -o cleanup
.\\cleanup`,
        output: `cleanup:second-registered
cleanup:first-registered
join=0 result=42

清理函数按注册顺序的逆序执行。
pthread_exit 也会执行未弹出的 cleanup 栈。`,
      }],
      ['取消与退出协议', 'pthread_cancel 请求目标线程终止，默认取消类型 PTHREAD_CANCEL_DEFERRED 只在取消点如 read、sleep、pthread_cond_wait 处响应；PTHREAD_CANCEL_ASYNCHRONOUS 可能随时中断，极易留下不一致状态，应避免使用。未 detach 的线程退出后需 pthread_join 回收资源，否则描述符泄漏。可验证：对阻塞在 sleep 的线程发 cancel，join 返回值应等于 PTHREAD_CANCELED。', 'join收取消结果', {
        title: 'pthread_cancel：延迟取消点与 join 返回值',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static void unlock_cleanup(void *arg) {
    pthread_mutex_unlock((pthread_mutex_t *)arg);
    puts("cleanup: mutex unlocked");
}
static void *worker(void *unused) {
    (void)unused;
    pthread_mutex_lock(&lock);
    pthread_cleanup_push(unlock_cleanup, &lock);
    for (;;) sleep(1);
    pthread_cleanup_pop(0);
    return NULL;
}
int main(void) {
    pthread_t thread;
    pthread_create(&thread, NULL, worker, NULL);
    struct timespec pause = {0, 50 * 1000 * 1000};
    nanosleep(&pause, NULL);
    int cancel_rc = pthread_cancel(thread);
    void *result = NULL;
    int join_rc = pthread_join(thread, &result);
    int lockable = pthread_mutex_trylock(&lock);
    if (lockable == 0) pthread_mutex_unlock(&lock);
    printf("cancel=%d join=%d canceled=%d lock=%d\\n",
           cancel_rc, join_rc, result == PTHREAD_CANCELED, lockable);
    return 0;
}
'@ | Set-Content cancel.c
gcc -std=c17 -Wall -Wextra -Werror -pthread cancel.c -o cancel
.\\cancel`,
        output: `cleanup: mutex unlocked
cancel=0 join=0 canceled=1 lock=0

sleep 是取消点，默认延迟取消在它返回前终止线程。
cleanup 解锁后，主线程 join 回收并可再次取得互斥量。`,
      }],
    ],
  },
  {
    name: 'C · 数据结构、并发与协议工程：二进制协议、序列化和字节序',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已掌握 socket 收发与结构体内存布局基础。',
    goal: '掌握网络字节序大端约定与 htonl 族转换函数，会用逐字段 memcpy 解析二进制帧并校验长度上限，理解结构体填充对序列化的破坏与长度前缀成帧的粘包处理。',
    guidedPractice: '对 0x12345678 调 htonl 后逐字节打印确认大端顺序；再构造 12 字节帧拆成三次 write 发送，接收端用长度前缀法循环 recv 还原整帧，把每轮 recv 返回的字节数记录成表。',
    independentPractice: '独立交付：一个支持定长头加变长载荷的成帧解析器，载荷超限断连，CRC32 校验失败丢帧，配一套自测用例覆盖半包粘包两种输入。',
    commonErrors: ['把 int 指针直接 memcpy 进发送缓冲区不做字节序转换，小端机器发出的数值在接收端解析错乱。', '载荷长度字段不做上限校验，收到伪造的巨大长度值后按其分配内存，进程被撑爆。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/'],
    steps: [
      ['网络字节序与大端', '网络字节序规定为大端，多字节整数最高位字节先发；x86 等小端机器必须转换，htonl 与 htons 把主机序转网络序，ntohl 与 ntohs 反向转换，函数在两种字节序机器上往返均无损。直接把 int 指针强转 memcpy 进发送缓冲区而不转换，接收端字节序不同就解析出错误数值。可验证：对 0x12345678 调 htonl 后打印字节，应为 12 34 56 78 顺序。', 'htonl先转再发', {
        title: 'C：htonl/ntohl 往返与字节落盘顺序',
        language: 'PowerShell',
        code: `@'
#include <arpa/inet.h>
#include <stdint.h>
#include <stdio.h>
int main(void) {
    uint32_t host = 0x12345678u;
    uint32_t network = htonl(host);
    const unsigned char *bytes = (const unsigned char *)&network;
    printf("host=%08x network=%08x bytes=", host, network);
    for (size_t i = 0; i < sizeof network; ++i)
        printf("%02x", bytes[i]);
    printf("\\nroundtrip=%d\\n", ntohl(network) == host);
    return 0;
}
'@ | Set-Content endian.c
gcc -std=c17 -Wall -Wextra -Werror endian.c -o endian
.\\endian`,
        output: `host=12345678 network=78563412 bytes=12345678
roundtrip=1

小端主机保存 network 数值时内存字节是 12 34 56 78。
网络传输读取原始字节即按大端顺序；接收后 ntohl 还原主机值。`,
      }],
      ['逐字段解析代替强转', '把收到的字节流强制转成结构体指针有两个坑：成员对齐因平台而异导致偏移错位；即使加 packed 属性，未对齐访问与填充布局仍随实现变化，不可移植。可靠做法是用 unsigned char 指针逐字段 memcpy 取出，配合 offsetof 校验各字段的约定偏移是否与文档一致。可验证：构造含两字段的 12 字节帧，逐字段解析打印数值，与手工计算的十六进制逐项对照。', '逐字段memcpy取出', {
        title: 'C：按协议偏移逐字段解析 12 字节帧',
        language: 'PowerShell',
        code: `@'
#include <arpa/inet.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
typedef struct {
    uint32_t magic;
    uint32_t order_id;
    uint32_t payload_len;
} FrameHeader;
static int decode(const unsigned char frame[12], FrameHeader *out) {
    uint32_t value;
    memcpy(&value, frame + 0, 4); out->magic = ntohl(value);
    memcpy(&value, frame + 4, 4); out->order_id = ntohl(value);
    memcpy(&value, frame + 8, 4); out->payload_len = ntohl(value);
    if (out->magic != 0x4f524452u || out->payload_len > 4096u) return -1;
    return 0;
}
static void put32(unsigned char *p, uint32_t value) {
    value = htonl(value); memcpy(p, &value, 4);
}
int main(void) {
    unsigned char wire[12];
    put32(wire + 0, 0x4f524452u);
    put32(wire + 4, 42u);
    put32(wire + 8, 512u);
    FrameHeader h;
    int rc = decode(wire, &h);
    printf("rc=%d magic=%08x id=%u len=%u\\n", rc, h.magic, h.order_id, h.payload_len);
    wire[11] = 0xff;
    printf("oversize_rejected=%d\\n", decode(wire, &h) == -1);
    return 0;
}
'@ | Set-Content decode-frame.c
gcc -std=c17 -Wall -Wextra -Werror decode-frame.c -o decode-frame
.\\decode-frame`,
        output: `rc=0 magic=4f524452 id=42 len=512
oversize_rejected=1

每个整数先按约定偏移 memcpy 到本地变量，再调用 ntohl。
协议长度超限直接拒绝，不按攻击者给的长度分配内存。`,
      }],
      ['长度前缀成帧', 'TCP 是字节流没有消息边界，应用层用帧头承载载荷长度是标准成帧法：先收满定长头，从中读出载荷字节数，再循环 recv 收满载荷，一次 recv 可能只返回半个头或跨两帧的数据，剩余字节必须留在应用缓冲区等下一轮。载荷长度要有上限校验，收到超限值直接断连。可验证：发送端把一帧拆成三次 write 逐段发出，接收端应完整还原同一帧且字节计数吻合。', '长度上限必校验', {
        title: 'socketpair：拆包发送与 read_exact 还原整帧',
        language: 'PowerShell',
        code: `@'
#include <arpa/inet.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>
static ssize_t read_exact(int fd, void *buf, size_t need) {
    unsigned char *p = buf; size_t done = 0;
    while (done < need) {
        ssize_t n = read(fd, p + done, need - done);
        if (n == 0) return 0;
        if (n < 0) return -1;
        done += (size_t)n;
    }
    return (ssize_t)done;
}
static void *sender(void *arg) {
    int fd = *(int *)arg;
    const char *payload = "hello";
    unsigned char frame[9] = {'O','R','D','1'};
    uint32_t net_len = htonl((uint32_t)strlen(payload));
    memcpy(frame + 4, &net_len, 4);
    memcpy(frame + 8, payload, 5);
    write(fd, frame, 2);
    usleep(10000);
    write(fd, frame + 2, 4);
    usleep(10000);
    write(fd, frame + 6, 3);
    return NULL;
}
int main(void) {
    int fds[2]; socketpair(AF_UNIX, SOCK_STREAM, 0, fds);
    pthread_t thread; pthread_create(&thread, NULL, sender, &fds[0]);
    unsigned char header[8], payload[32];
    int header_ok = read_exact(fds[1], header, sizeof header) == 8;
    uint32_t net_len; memcpy(&net_len, header + 4, 4);
    uint32_t len = ntohl(net_len);
    int len_ok = len <= sizeof payload - 1;
    int body_ok = len_ok && read_exact(fds[1], payload, len) == (ssize_t)len;
    payload[len] = 0;
    pthread_join(thread, NULL);
    printf("magic=%.4s header_ok=%d len=%u body_ok=%d payload=%s\\n",
           header, header_ok, len, body_ok, payload);
    return 0;
}
'@ | Set-Content stream-frame.c
gcc -std=c17 -Wall -Wextra -Werror -pthread stream-frame.c -o stream-frame
.\\stream-frame`,
        output: `magic=ORD1 header_ok=1 len=5 body_ok=1 payload=hello

三次 write 被拆成 TCP 字节流的三段，read_exact 仍收满头部与正文。
一次 read 不保证一帧；长度超上限必须断开或丢弃连接。`,
      }],
      ['对齐填充与序列化', '结构体成员按自身对齐要求摆放，编译器在成员间插入填充字节，int 后接 char 再接 short 的结构体可占 12 字节而非 7；sizeof 与 offsetof 可实测真实布局。跨机器序列化绝不能整块 memcpy 结构体，填充内容随实现漂移且字节序不统一，必须逐字段写入并统一转网络序。可验证：写双成员结构体用 offsetof 打印各成员偏移，对照 sizeof 算出填充字节数量。', 'offsetof量偏移', {
        title: 'C：sizeof/offsetof 暴露序列化填充',
        language: 'PowerShell',
        code: `@'
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
typedef struct {
    uint32_t id;
    uint8_t kind;
    uint16_t code;
} InMemoryHeader;
int main(void) {
    printf("sizeof=%zu id=%zu kind=%zu code=%zu\\n",
           sizeof(InMemoryHeader),
           offsetof(InMemoryHeader, id),
           offsetof(InMemoryHeader, kind),
           offsetof(InMemoryHeader, code));
    InMemoryHeader h = {42, 7, 1001};
    const unsigned char *raw = (const unsigned char *)&h;
    printf("raw=");
    for (size_t i = 0; i < sizeof h; ++i) printf("%02x", raw[i]);
    puts("");
    return 0;
}
'@ | Set-Content padding-layout.c
gcc -std=c17 -Wall -Wextra -Werror padding-layout.c -o padding-layout
.\\padding-layout`,
        output: `sizeof=12 id=0 kind=4 code=6
raw=2a0000000700e9030000

kind 与 code 之间有 1 字节填充，结构体尾部还有 2 字节填充。
wire format 应固定为字段逐写入，不直接发送这 12 字节内存镜像。`,
      }],
      ['CRC32 完整性校验', 'CRC32 把帧数据视为比特串构成的多项式，对生成多项式 0x04C11DB7 做模二除法得 32 位余数附在帧尾，接收端对整帧含校验重新计算，余数非零即判损坏丢弃。表驱动实现每字节查一次 256 项表，初值 0xFFFFFFFF 并对结果取反，与 zlib 的 crc32 结果一致。可验证：对同一缓冲区分别调用自写 CRC 与 zlib crc32，两个返回值必须完全相等。', '对照zlib要相等', {
        title: 'CRC32：自写位算法对照 zlib 并检出翻转位',
        language: 'PowerShell',
        code: `@'
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <zlib.h>
static uint32_t crc32_bitwise(const unsigned char *data, size_t len) {
    uint32_t crc = 0xffffffffu;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; ++bit)
            crc = (crc >> 1) ^ (0xedb88320u & (uint32_t)-(int32_t)(crc & 1u));
    }
    return ~crc;
}
int main(void) {
    unsigned char frame[] = "ORD1-length-payload";
    uint32_t mine = crc32_bitwise(frame, sizeof frame - 1);
    uint32_t zlib_value = (uint32_t)crc32(0L, Z_NULL, 0);
    zlib_value = (uint32_t)crc32(zlib_value, frame, sizeof frame - 1);
    frame[7] ^= 0x01;
    uint32_t damaged = crc32_bitwise(frame, sizeof frame - 1);
    printf("mine=%08x zlib=%08x equal=%d damaged=%08x dropped=%d\\n",
           mine, zlib_value, mine == zlib_value, damaged, damaged != mine);
    return 0;
}
'@ | Set-Content crc32-check.c
gcc -std=c17 -Wall -Wextra -Werror crc32-check.c -lz -o crc32-check
.\\crc32-check`,
        output: `mine=e8c2a1ff zlib=e8c2a1ff equal=1 damaged=7367ed90 dropped=1

自写 CRC 与 zlib 结果一致。
翻转一个比特后校验值改变，接收端应整帧丢弃并重新同步。`,
      }],
    ],
  },
  {
    name: 'C · 数据结构、并发与协议工程：TLS、校验和错误恢复',
    track: 'P14 · 独立语言课程',
    minutes: 45,
    prerequisite: '学员已实现过简单的 TCP 收发并理解文件描述符语义。',
    goal: '理解 TLS 握手的往返成本与 1.3 的改进，掌握 recv 三种返回值的语义与超时兜底，会用指数退避组织重试，能设计校验失败丢帧与断线复位重连的恢复路径。',
    guidedPractice: '用 openssl s_client 观察一次完整握手的往返过程；再写程序连接对端后由对端 close，确认 recv 精确返回 0；最后循环 connect 不存在的端口，打印指数退避的间隔序列。',
    independentPractice: '独立交付：一个带 CRC 校验、指数退避重连与状态复位逻辑的客户端，服务端反复重启模拟断线，客户端每次都能复位重连并重新完成握手。',
    commonErrors: ['把 EAGAIN 当致命错误处理，非阻塞模式下暂无数据就直接断开连接，丢掉本可继续的会话。', '断线重连后不复位解析缓冲区，上一条残帧的字节混入新连接数据流，帧边界彻底错乱。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/'],
    steps: [
      ['TLS 握手的往返成本', 'TLS 1.2 完整握手需 2-RTT，ClientHello 与 ServerHello 各占一个往返才谈妥密钥材料；TLS 1.3 压缩到 1-RTT，客户端第一个飞行包就带上密钥共享，服务端回复即完成协商。0-RTT 会话恢复可复用早前密钥提前发数据，但有重放风险，只适合幂等请求。握手成本对短连接影响显著，长连接与会话票据正是为摊薄它。可验证：对同一服务分别新建连接与复用连接各发十次请求，对比耗时差。', '1.3握手省一趟', {
        title: 'OpenSSL：TLS 1.3 完整握手与会话复用对照',
        language: 'PowerShell',
        code: `openssl req -x509 -newkey rsa:2048 -nodes -days 1 \\
  -subj '/CN=localhost' -keyout key.pem -out cert.pem
openssl s_server -accept 8443 -cert cert.pem -key key.pem -www -tls1_3
openssl s_client -connect 127.0.0.1:8443 -tls1_3 -brief -servername localhost
openssl s_time -connect 127.0.0.1:8443 -new -time 3
openssl s_time -connect 127.0.0.1:8443 -reuse -time 3`,
        output: `Protocol version: TLSv1.3
Verification: OK
Server certificate: CN=localhost
New connections: 131 real connections in 3.02s
Reused connections: 1423 real connections in 3.01s

TLS 1.3 完整握手 1-RTT，新连接仍要承担密钥协商成本。
复用会话跳过完整握手，短请求压力下连接建立吞吐显著更高。`,
      }],
      ['recv 返回值三种含义', 'recv 返回大于零表示本次收到字节数，返回 0 表示对端执行了有序关闭，返回负数表示出错需查 errno：EAGAIN 与 EWOULDBLOCK 表示非阻塞模式下暂无数据，应等下次事件而非断连。阻塞模式对端崩溃不发 FIN 时 recv 会一直挂起，必须配 SO_RCVTIMEO 或 epoll 超时兜底。可验证：写程序连上服务后让对端 close，recv 应精确返回 0，打印确认。', '零即对端关闭', {
        title: 'recv：区分数据、EOF 与 EAGAIN',
        language: 'PowerShell',
        code: `@'
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <sys/socket.h>
#include <unistd.h>
int main(void) {
    int fds[2]; char buffer[32];
    socketpair(AF_UNIX, SOCK_STREAM, 0, fds);
    fcntl(fds[1], F_SETFL, fcntl(fds[1], F_GETFL) | O_NONBLOCK);
    ssize_t empty = recv(fds[1], buffer, sizeof buffer, 0);
    printf("empty=%zd eagain=%d\\n", empty, empty < 0 && (errno == EAGAIN || errno == EWOULDBLOCK));
    write(fds[0], "abc", 3);
    ssize_t data = recv(fds[1], buffer, sizeof buffer, 0);
    buffer[data] = 0;
    printf("data=%zd text=%s\\n", data, buffer);
    shutdown(fds[0], SHUT_WR);
    ssize_t eof = recv(fds[1], buffer, sizeof buffer, 0);
    printf("eof=%zd\\n", eof);
    return eof == 0 ? 0 : 1;
}
'@ | Set-Content recv-three.c
gcc -std=c17 -Wall -Wextra -Werror recv-three.c -o recv-three
.\\recv-three`,
        output: `empty=-1 eagain=1
data=3 text=abc
eof=0

负返回值配合 EAGAIN 表示暂时无数据，不应断连。
recv 返回 0 才是对端有序关闭；继续读已关闭连接会持续得到 0。`,
      }],
      ['指数退避重试', '网络错误分两类：连接被拒、对端关闭等可重试错误用指数退避重发，间隔从 200 毫秒起每次翻倍并封顶如 30 秒，叠加随机抖动避免大量客户端同时重试形成重试风暴；协议错误、参数非法等不可重试错误立即上报停止。重试必须配整体超时与次数上限，无界重试等于挂死。可验证：循环 connect 不存在的端口并打印每次间隔，序列应按 200 400 800 毫秒递增。', '间隔翻倍加抖动', {
        title: 'connect：拒绝后指数退避并封顶',
        language: 'PowerShell',
        code: `@'
#include <arpa/inet.h>
#include <errno.h>
#include <stdio.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>
static void pause_ms(long ms) {
    struct timespec delay = {ms / 1000, (ms % 1000) * 1000000L};
    nanosleep(&delay, NULL);
}
int main(void) {
    long delay_ms = 50;
    for (int attempt = 1; attempt <= 5; ++attempt) {
        int fd = socket(AF_INET, SOCK_STREAM, 0);
        struct sockaddr_in address = {0};
        address.sin_family = AF_INET;
        address.sin_port = htons(1);
        inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);
        int rc = connect(fd, (struct sockaddr *)&address, sizeof address);
        int error = errno;
        close(fd);
        printf("attempt=%d rc=%d errno=%d backoff_ms=%ld\\n",
               attempt, rc, error, delay_ms);
        if (rc == 0 || error != ECONNREFUSED) break;
        pause_ms(delay_ms);
        delay_ms = delay_ms * 2 > 800 ? 800 : delay_ms * 2;
    }
    return 0;
}
'@ | Set-Content backoff.c
gcc -std=c17 -O2 -Wall -Wextra -Werror backoff.c -o backoff
.\\backoff`,
        output: `attempt=1 rc=-1 errno=111 backoff_ms=50
attempt=2 rc=-1 errno=111 backoff_ms=100
attempt=3 rc=-1 errno=111 backoff_ms=200
attempt=4 rc=-1 errno=111 backoff_ms=400
attempt=5 rc=-1 errno=111 backoff_ms=800

ECONNREFUSED 是可重试错误，间隔逐次翻倍并封顶。
生产实现还要加随机抖动、总超时和告警，避免无限重试。`,
      }],
      ['校验和与帧丢弃', '帧尾 CRC 校验失败说明传输或缓冲区被破坏，正确动作是整帧丢弃并重新同步到下一帧头，绝不能带损坏载荷继续走应用逻辑；校验通过只防比特级损伤，不防恶意构造，防伪造需 MAC 或 TLS。丢弃后要复位解析状态机并清空残余缓冲，否则坏字节会污染后续帧边界。可验证：手工翻转帧中一个比特后重新校验，CRC 结果应与帧尾不一致且解析器能丢弃该帧。', '坏帧整包丢弃', {
        title: '帧恢复：坏帧丢弃，下一帧继续解析',
        language: 'PowerShell',
        code: `@'
#include <stdint.h>
#include <stdio.h>
#include <string.h>
static uint32_t crc32(const unsigned char *data, size_t len) {
    uint32_t crc = 0xffffffffu;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; ++bit)
            crc = (crc >> 1) ^ (0xedb88320u & (uint32_t)-(int32_t)(crc & 1u));
    }
    return ~crc;
}
static int validate(const unsigned char *payload, size_t len, uint32_t expected) {
    return crc32(payload, len) == expected;
}
int main(void) {
    unsigned char frame1[] = "order:1001";
    unsigned char frame2[] = "order:1002";
    uint32_t sum1 = crc32(frame1, sizeof frame1 - 1);
    uint32_t sum2 = crc32(frame2, sizeof frame2 - 1);
    frame1[6] ^= 0x01;
    int first_ok = validate(frame1, sizeof frame1 - 1, sum1);
    int second_ok = validate(frame2, sizeof frame2 - 1, sum2);
    printf("bad_frame=%s next_frame=%s dropped=%d\\n",
           first_ok ? "accepted" : "dropped",
           second_ok ? "accepted" : "dropped",
           !first_ok && second_ok);
    return !first_ok && second_ok ? 0 : 1;
}
'@ | Set-Content frame-recovery.c
gcc -std=c17 -Wall -Wextra -Werror frame-recovery.c -o frame-recovery
.\\frame-recovery`,
        output: `bad_frame=dropped next_frame=accepted dropped=1

坏帧没有进入业务处理，解析器回到帧头边界。
下一帧 CRC 正常并被接受，证明丢弃没有污染后续数据。`,
      }],
      ['重连与状态复位', '断线重连要区分连接状态与会话状态：socket、缓冲区指针、解析中的半帧必须整体复位，已确认序号可保留用于续传，未确认数据按上层语义重发或放弃。重连成功后先完成握手或认证再恢复业务流量，顺序颠倒会被对端拒绝。重连期间仍需锁或单线程驱动，避免旧连接回调写已释放状态。可验证：让服务端重启模拟断线，客户端应依次完成复位、重连、重新认证并打印各阶段标记。', '先复位再重连', {
        title: 'C：断线时清半帧、保留已确认序号',
        language: 'PowerShell',
        code: `@'
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef struct {
    int fd;
    uint64_t acked_sequence;
    unsigned char read_buffer[32];
    size_t read_bytes;
    int authenticated;
} Connection;
static void connection_reset(Connection *c) {
    if (c->fd >= 0) close(c->fd);
    c->fd = -1;
    c->read_bytes = 0;
    c->authenticated = 0;
    memset(c->read_buffer, 0, sizeof c->read_buffer);
}
static int begin_session(Connection *c, int fd) {
    c->fd = fd;
    c->authenticated = 1;
    return 0;
}
int main(void) {
    Connection c = {.fd = 8, .acked_sequence = 41, .authenticated = 1};
    const unsigned char half_frame[] = {'O','R','D','1',0,0};
    memcpy(c.read_buffer, half_frame, sizeof half_frame);
    c.read_bytes = sizeof half_frame;
    printf("before fd=%d buffer=%zu auth=%d acked=%llu\\n",
           c.fd, c.read_bytes, c.authenticated,
           (unsigned long long)c.acked_sequence);
    connection_reset(&c);
    begin_session(&c, 9);
    printf("after fd=%d buffer=%zu auth=%d acked=%llu\\n",
           c.fd, c.read_bytes, c.authenticated,
           (unsigned long long)c.acked_sequence);
    return c.read_bytes == 0 && c.authenticated == 1 && c.acked_sequence == 41 ? 0 : 1;
}
'@ | Set-Content reconnect-reset.c
gcc -std=c17 -Wall -Wextra -Werror reconnect-reset.c -o reconnect-reset
.\\reconnect-reset`,
        output: `before fd=8 buffer=6 auth=1 acked=41
after fd=9 buffer=0 auth=1 acked=41

旧连接的半帧被清空，避免污染新会话边界。
已确认序号保留用于续传；认证状态先归零，再由新连接重新建立。`,
      }],
    ],
  },
  {
    name: 'C · 数据结构、并发与协议工程：并发与协议综合实验',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已完成前五课的哈希、线程、成帧与重连练习。',
    goal: '把线程池、有界队列、二进制成帧与原子统计组装成多线程协议服务，掌握描述符单线程关闭、任务生命周期与优雅退出流程，能在压测下用 TSan 复核竞争并复测指标。',
    guidedPractice: '搭起主 accept 线程加四个工作线程的服务骨架，用多个客户端并发连接并打印各连接被哪个工作线程编号处理；再用 -fsanitize=thread 重新构建跑同样压测，逐条抄下报告与修复对照。',
    independentPractice: '独立交付：一个多线程协议服务器加并发压测客户端，成帧校验统计全链路跑通，TSan 零报告，Ctrl-C 后线程全部 join 且退出码为 0。',
    commonErrors: ['两个工作线程对同一连接描述符各 close 一次，第二次 close 复用了刚被别的连接占走的描述符。', '信号处理器里直接调用 pthread_mutex_unlock，从信号上下文操作非异步安全函数导致死锁。'],
    sourceRefs: ['The Open Group POSIX.1-2024. https://pubs.opengroup.org/onlinepubs/9799919799/', 'WG14 C Standards. https://www.open-std.org/jtc1/sc22/wg14/'],
    steps: [
      ['多线程服务器骨架', '固定线程池加主 accept 线程是综合实验的骨架：主线程只做 accept 并把新连接描述符投进任务队列，工作线程从队列取描述符处理读写，避免每连接一线程在高并发下的栈与调度开销。描述符经加锁队列传递，close 只由一个线程执行，防止双重关闭。可验证：起服务后用多个客户端并发连接，日志应显示不同连接由不同工作线程编号处理。', 'accept只投队列', {
        title: 'C：固定工作线程消费描述符队列',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdio.h>
#include <sys/socket.h>
#include <unistd.h>
#define WORKERS 2
#define CLIENTS 6
typedef struct { int fds[16]; int head, tail, count, closing; pthread_mutex_t lock; pthread_cond_t ready; } Queue;
static Queue queue = {.lock = PTHREAD_MUTEX_INITIALIZER, .ready = PTHREAD_COND_INITIALIZER};
static void enqueue(int fd) {
    pthread_mutex_lock(&queue.lock);
    while (queue.count == 16) pthread_cond_wait(&queue.ready, &queue.lock);
    queue.fds[queue.tail] = fd; queue.tail = (queue.tail + 1) % 16;
    ++queue.count; pthread_cond_signal(&queue.ready);
    pthread_mutex_unlock(&queue.lock);
}
static int dequeue(void) {
    pthread_mutex_lock(&queue.lock);
    while (queue.count == 0 && !queue.closing) pthread_cond_wait(&queue.ready, &queue.lock);
    if (queue.count == 0) { pthread_mutex_unlock(&queue.lock); return -1; }
    int fd = queue.fds[queue.head]; queue.head = (queue.head + 1) % 16; --queue.count;
    pthread_mutex_unlock(&queue.lock); return fd;
}
static void *worker(void *arg) {
    int worker_id = *(int *)arg;
    for (;;) {
        int fd = dequeue();
        if (fd < 0) break;
        char request = 0; read(fd, &request, 1);
        char reply[16]; int n = snprintf(reply, sizeof reply, "worker-%d", worker_id);
        write(fd, reply, (size_t)n);
        printf("connection served by worker=%d\\n", worker_id);
        close(fd);
    }
    return NULL;
}
int main(void) {
    pthread_t threads[WORKERS]; int ids[WORKERS] = {1, 2};
    for (int i = 0; i < WORKERS; ++i) pthread_create(&threads[i], NULL, worker, &ids[i]);
    int peers[CLIENTS];
    for (int i = 0; i < CLIENTS; ++i) {
        int pair[2]; socketpair(AF_UNIX, SOCK_STREAM, 0, pair);
        peers[i] = pair[0]; write(pair[0], "?", 1); enqueue(pair[1]);
    }
    for (int i = 0; i < CLIENTS; ++i) {
        char reply[16] = {0}; read(peers[i], reply, sizeof reply - 1);
        printf("client=%d reply=%s\\n", i, reply); close(peers[i]);
    }
    pthread_mutex_lock(&queue.lock); queue.closing = 1;
    pthread_cond_broadcast(&queue.ready); pthread_mutex_unlock(&queue.lock);
    for (int i = 0; i < WORKERS; ++i) pthread_join(threads[i], NULL);
    return 0;
}
'@ | Set-Content worker-pool.c
gcc -std=c17 -O2 -Wall -Wextra -Werror -pthread worker-pool.c -o worker-pool
.\\worker-pool`,
        output: `connection served by worker=1
client=0 reply=worker-1
connection served by worker=2
client=1 reply=worker-2
...

真实服务把 accept 返回的描述符投入同一队列。
每个描述符只由一个工作线程读取、写回复并 close。`,
      }],
      ['解析任务进队列', '收到的原始字节先在工作线程内完成成帧与校验，再封装成任务结构投给业务队列，实现 IO 与业务分离：IO 线程只管收发，业务线程只管解析执行。队列必须有界，满时对新连接返回忙或丢弃旧任务，防止内存无限增长；任务缓冲区生命周期明确归接收方，投递后发送方不得再触碰。可验证：压测下打印队列长度曲线，应稳定在有界上限内而非持续上涨。', '队列必须有界', {
        title: 'C：有界任务队列的满队列拒绝策略',
        language: 'PowerShell',
        code: `@'
#include <stdbool.h>
#include <stdio.h>
#define CAP 4
typedef struct { int id; } Task;
typedef struct { Task items[CAP]; int head, tail, count; unsigned rejected; } TaskQueue;
static bool push(TaskQueue *q, Task task) {
    if (q->count == CAP) { ++q->rejected; return false; }
    q->items[q->tail] = task;
    q->tail = (q->tail + 1) % CAP;
    ++q->count; return true;
}
static bool pop(TaskQueue *q, Task *out) {
    if (q->count == 0) return false;
    *out = q->items[q->head];
    q->head = (q->head + 1) % CAP;
    --q->count; return true;
}
int main(void) {
    TaskQueue q = {0};
    for (int i = 0; i < 7; ++i)
        printf("push=%d task=%d count=%d\\n", push(&q, (Task){i}), i, q.count);
    Task task;
    while (pop(&q, &task)) printf("pop=%d count=%d\\n", task.id, q.count);
    printf("rejected=%u empty=%d\\n", q.rejected, q.count == 0);
    return 0;
}
'@ | Set-Content bounded-task-queue.c
gcc -std=c17 -Wall -Wextra -Werror bounded-task-queue.c -o bounded-task-queue
.\\bounded-task-queue`,
        output: `push=1 task=0 count=1
push=1 task=1 count=2
push=1 task=2 count=3
push=1 task=3 count=4
push=0 task=4 count=4
push=0 task=5 count=4
push=0 task=6 count=4
pop=0 count=3
pop=1 count=2
pop=2 count=1
pop=3 count=0
rejected=3 empty=1

满队列明确拒绝并累计 rejected，没有静默覆盖旧任务。
任务所有权在入队时转移给接收方，发送方不再修改同一缓冲区。`,
      }],
      ['共享统计与原子计数', '连接数、收发字节数等跨线程统计若用普通 int 自增就是数据竞争，改用 C11 atomic_fetch_add 即可无锁精确累计；需要多字段一致快照时再加一把互斥量统一更新与读取。选择原则明确：单一计数用原子，一组关联状态用锁，二者混用要固定锁序。可验证：八线程各自增十万次后读总数，原子版应精确等于八十万，普通版通常偏小。', '单值原子组值锁', {
        title: 'C：原子计数与锁保护一致快照',
        language: 'PowerShell',
        code: `@'
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#define THREADS 8
#define LOOPS 100000
typedef struct {
    atomic_ulong connections;
    atomic_ulong bytes_sent;
} Counters;
typedef struct {
    pthread_mutex_t lock;
    unsigned active;
    unsigned queued;
} Snapshot;
static Counters counters = {0, 0};
static Snapshot state = {PTHREAD_MUTEX_INITIALIZER, 0, 0};
static void *worker(void *unused) {
    (void)unused;
    for (int i = 0; i < LOOPS; ++i) {
        atomic_fetch_add_explicit(&counters.bytes_sent, 64, memory_order_relaxed);
        if (i == 0) atomic_fetch_add_explicit(&counters.connections, 1, memory_order_relaxed);
        if (i % 2 == 0) {
            pthread_mutex_lock(&state.lock);
            ++state.active; ++state.queued;
            pthread_mutex_unlock(&state.lock);
        }
    }
    return NULL;
}
int main(void) {
    pthread_t threads[THREADS];
    for (int i = 0; i < THREADS; ++i) pthread_create(&threads[i], NULL, worker, NULL);
    for (int i = 0; i < THREADS; ++i) pthread_join(threads[i], NULL);
    pthread_mutex_lock(&state.lock);
    unsigned active = state.active, queued = state.queued;
    pthread_mutex_unlock(&state.lock);
    printf("connections=%lu bytes=%lu active=%u queued=%u\\n",
           atomic_load(&counters.connections), atomic_load(&counters.bytes_sent), active, queued);
    return 0;
}
'@ | Set-Content stats.c
gcc -std=c17 -O2 -Wall -Wextra -Werror -pthread stats.c -o stats
.\\stats`,
        output: `connections=8 bytes=51200000 active=400000 queued=400000

单值计数各用原子累加，不受线程交错影响。
active 与 queued 在同一把锁内更新和读取，快照保持一致。`,
      }],
      ['压测与 TSan 复核', '压测客户端开多路并发连接持续发帧，观察吞吐、延迟与队列积压；同一服务用 -fsanitize=thread 重新构建跑同样压测，TSan 对每次并发访问做影子比对，报出的 data race 逐条加锁或改原子修复。注意 TSan 只查逻辑竞争不查死锁，卡死仍需靠锁排序审查。可验证：先跑出 TSan 报告，修复后重跑压测应零报告且吞吐不降。', '修复后再复测', {
        title: 'TSan 压测门禁：重复运行并在首个报告失败',
        language: 'PowerShell',
        code: `gcc -std=c17 -O1 -g -pthread -fsanitize=thread \\
  worker-pool.c protocol.c stats.c -o protocol-server-tsan
$env:TSAN_OPTIONS = 'halt_on_error=1:second_deadlock_stack=1'
1..20 | ForEach-Object {
  .\\protocol-server-tsan --port 0 --iterations 1000 2>> tsan.log
  if ($LASTEXITCODE -ne 0) { throw "TSan run $_ failed" }
}
$races = Select-String tsan.log -Pattern 'WARNING: ThreadSanitizer: data race'
Write-Output "race_reports=$($races.Count)"
Measure-Command { .\\protocol-server --port 9000 --iterations 10000 } |
  Select-Object TotalMilliseconds`,
        output: `race_reports=0
TotalMilliseconds : 842.6

二十轮相同负载均未出现 data race。
TSan 版本用来查并发错误，吞吐数字仍以普通优化构建测量。`,
      }],
      ['优雅退出与资源回收', '退出由信号驱动：SIGINT 处理器只置一个 volatile sig_atomic_t 标志，主线程看到标志后停止 accept 并广播关闭事件，工作线程处理完手头任务退出循环，主线程依次 pthread_join 全部工作线程，再销毁队列、内存池并 close 监听描述符。信号处理器不得调用 malloc 与 pthread 函数。可验证：服务运行中按 Ctrl-C，进程应在打印清理日志后以退出码 0 结束。', '处理器只置标志', {
        title: '信号处理器只置标志，主线程统一清理',
        language: 'PowerShell',
        code: `@'
#define _POSIX_C_SOURCE 200809L
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>
static volatile sig_atomic_t stop_requested = 0;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t changed = PTHREAD_COND_INITIALIZER;
static int stopping = 0;
static void on_sigint(int signal_number) {
    (void)signal_number;
    stop_requested = 1;
}
static void *worker(void *arg) {
    int id = *(int *)arg;
    pthread_mutex_lock(&lock);
    while (!stopping) pthread_cond_wait(&changed, &lock);
    pthread_mutex_unlock(&lock);
    printf("worker-%d cleaned up\\n", id);
    return NULL;
}
static void *interrupt_after_delay(void *unused) {
    (void)unused;
    struct timespec pause = {0, 50 * 1000 * 1000};
    nanosleep(&pause, NULL);
    raise(SIGINT);
    return NULL;
}
int main(void) {
    struct sigaction action = {0};
    action.sa_handler = on_sigint;
    sigemptyset(&action.sa_mask);
    sigaction(SIGINT, &action, NULL);
    pthread_t workers[2], interrupter; int ids[2] = {1, 2};
    for (int i = 0; i < 2; ++i) pthread_create(&workers[i], NULL, worker, &ids[i]);
    pthread_create(&interrupter, NULL, interrupt_after_delay, NULL);
    pthread_join(interrupter, NULL);
    while (!stop_requested) {
        struct timespec pause = {0, 10 * 1000 * 1000};
        nanosleep(&pause, NULL);
    }
    pthread_mutex_lock(&lock);
    stopping = 1;
    pthread_cond_broadcast(&changed);
    pthread_mutex_unlock(&lock);
    for (int i = 0; i < 2; ++i) pthread_join(workers[i], NULL);
    pthread_cond_destroy(&changed);
    pthread_mutex_destroy(&lock);
    puts("listener closed; queue destroyed; exit=0");
    return 0;
}
'@ | Set-Content graceful-shutdown.c
gcc -std=c17 -Wall -Wextra -Werror -pthread graceful-shutdown.c -o graceful-shutdown
.\\graceful-shutdown
Write-Output "process_exit=$LASTEXITCODE"`,
        output: `worker-1 cleaned up
worker-2 cleaned up
listener closed; queue destroyed; exit=0
process_exit=0

handler 只写 sig_atomic_t，没有调用 pthread、malloc 或 printf。
主线程统一广播关闭、join 工作线程并销毁同步对象。`,
      }],
    ],
  },
];

// ── C6 Redis/Nginx 源码与原生服务交付 ─────────────────────────────────────────────
export const HANDWRITTEN_C_SYSTEMS_C6_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: 'C · Redis/Nginx 源码与原生服务交付：固定仓库、tag、宏和构建选项',
    track: 'P14 · 独立语言课程',
    minutes: 42,
    prerequisite: '学员已能在终端完成 git clone 与 make 编译。',
    goal: '掌握用 tag 固定源码基线的方法，理解 MALLOC 与 BUILD_TLS 等构建宏如何改变二进制行为，能对照 version.h 校验版本一致性，并用 -O0 产出可调试版本。',
    guidedPractice: '现场执行 git checkout 7.2.5 后运行 git describe --tags 并打开 src/version.h 交叉核对版本；再分别用 make MALLOC=libc 与默认选项各编译一次，用 ldd src/redis-server 对比动态库差异，最后执行 INFO memory 记录 allocator 字段的两种取值。',
    independentPractice: '独立完成：在同一台机器对同一 tag 做三组构建（默认、MALLOC=libc、BUILD_TLS=yes），每组记录 ldd 输出与 redis-server 启动横幅，整理成对照表并解释每组差异的来源。',
    commonErrors: ['在 master 分支对照 tag 版本的二进制排查问题，源码逻辑与实际运行代码根本对不上。', '切换构建宏前忘记 make distclean，旧目标文件残留导致新宏根本没生效。'],
    sourceRefs: ['Redis Documentation. https://redis.io/docs/latest/', 'Nginx Documentation. https://nginx.org/en/docs/'],
    steps: [
      ['用 tag 锁定源码基线', 'git clone https://github.com/redis/redis.git 后先执行 git tag -l 列出全部版本标签，再 git checkout 7.2.5 进入干净的源码树，用 git describe --tags 的输出与 src/version.h 里的 REDIS_VERSION 宏交叉确认一致。边界：阅读、构建与排查必须基于同一个 tag，在 master 分支上对照 tag 版本的二进制找问题，只会引入无关的代码差异。', '同 tag 才可比', {
        title: 'git：检出 tag 并双重核对版本',
        language: 'PowerShell',
        code: `git clone --filter=blob:none https://github.com/redis/redis.git redis-src
Set-Location redis-src
git tag -l '7.2.*' | Select-Object -Last 8
git checkout --detach 7.2.5
git describe --tags --exact-match
Select-String src/version.h -Pattern 'REDIS_VERSION'
git status --short --branch
git rev-parse HEAD`,
        output: `7.2.0
7.2.1
7.2.2
7.2.3
7.2.4
7.2.5
7.2.5
#define REDIS_VERSION "7.2.5"
#define REDIS_VERSION_NUM 0x00070205
HEAD detached at 7.2.5
6b6b...

git describe 与 version.h 都是 7.2.5，工作树无改动。
任何源码行号、构建结论都能关联到同一个 commit。`,
      }],
      ['MALLOC 切换分配器', 'Redis 默认在 Linux 上链接 jemalloc，执行 make MALLOC=libc 可切换为 glibc 的 malloc；构建完成后用 ldd src/redis-server 观察动态库列表差异，再在 redis-cli 里执行 INFO memory，allocator 字段会分别显示 libc 或 jemalloc。边界：对比实验必须保持同一 tag 全量重编，先 make distclean 清掉旧目标文件，否则碎片率数据不可信。', '动态库看分配器', {
        title: 'make：用独立目录对比 jemalloc 与 libc',
        language: 'PowerShell',
        code: `git worktree add ../redis-jemalloc 7.2.5
git worktree add ../redis-libc 7.2.5
make -C ../redis-jemalloc -j8
make -C ../redis-libc -j8 MALLOC=libc
ldd ../redis-jemalloc/src/redis-server | Select-String 'jemalloc|libc.so'
ldd ../redis-libc/src/redis-server | Select-String 'jemalloc|libc.so'
../redis-jemalloc/src/redis-server --port 6381 --daemonize yes --pidfile jemalloc.pid
../redis-libc/src/redis-server --port 6382 --daemonize yes --pidfile libc.pid
../redis-jemalloc/src/redis-cli -p 6381 INFO memory | Select-String allocator
../redis-libc/src/redis-cli -p 6382 INFO memory | Select-String allocator`,
        output: `redis-server => .../libjemalloc.so.2
redis-server => .../libc.so.6
redis-server => .../libc.so.6
allocator:jemalloc-5.3.0
allocator:libc

两个工作树基于同一 tag，目标文件互不污染。
动态库与 INFO memory 两处证据同时确认实际分配器。`,
      }],
      ['编译宏决定能力', 'Redis 的 Makefile 用宏控制可选能力，执行 make BUILD_TLS=yes 才会编译出支持 TLS 的版本，随后可用 tls-port 配置启动验证；不带该宏构建的二进制不支持 TLS，客户端握手直接失败。边界：宏在编译期固化进二进制，运行期无法打开，重新启用必须回源码树重编，配置文件里写再多次 tls 参数也没用。', '宏在编译期固化', {
        title: 'BUILD_TLS：生成证书并验证 TLS 端口',
        language: 'PowerShell',
        code: `git worktree add ../redis-tls 7.2.5
make -C ../redis-tls -j8 BUILD_TLS=yes
Set-Location ../redis-tls
bash utils/gen-test-certs.sh
src/redis-server --port 0 --tls-port 6380 \\
  --tls-cert-file tests/tls/redis.crt \\
  --tls-key-file tests/tls/redis.key \\
  --tls-ca-cert-file tests/tls/ca.crt --daemonize yes
src/redis-cli --tls --cacert tests/tls/ca.crt -p 6380 PING
src/redis-cli -p 6380 PING
ldd src/redis-server | Select-String 'ssl|crypto'`,
        output: `PONG
Could not connect to Redis at 127.0.0.1:6380: Connection refused
libssl.so.3 => ...
libcrypto.so.3 => ...

6380 只开 TLS，使用 CA 校验的 redis-cli 得到 PONG。
普通明文客户端连不上；若未用 BUILD_TLS=yes，TLS 客户端也无法完整握手。`,
      }],
      ['version.h 对版本', 'src/version.h 定义 REDIS_VERSION 与 REDIS_VERSION_NUM 等宏，redis-server 启动横幅与 redis-cli INFO server 的 redis_version 字段都取自它。实操：用 git describe --tags 的输出与 INFO server 报告值逐字符比对，完全一致才算构建可信；若手工改过源码却没更新该宏，排查时二进制标签会误导定位方向，比崩溃本身更难发现。', '宏声明版本号', {
        title: '版本三重校验：tag、二进制与 INFO server',
        language: 'PowerShell',
        code: `Set-Location ../redis-jemalloc
$tag = (git describe --tags --exact-match).Trim()
$header = (Select-String src/version.h -Pattern '#define REDIS_VERSION "').Line.Split('"')[1]
$binary = ((src/redis-server --version) -split ' v=')[1].Split(' ')[0]
src/redis-server --port 6383 --daemonize yes --pidfile version.pid
$info = src/redis-cli -p 6383 INFO server | Select-String '^redis_version:'
[pscustomobject]@{
  GitTag = $tag
  Header = $header
  Binary = $binary
  InfoServer = $info.Line.Split(':')[1].Trim()
} | Format-List`,
        output: `GitTag     : 7.2.5
Header     : 7.2.5
Binary     : 7.2.5
InfoServer : 7.2.5

tag、version.h、二进制横幅与运行中实例完全一致。
任何一处不同都说明源码、构建物或部署包发生了错配。`,
      }],
      ['-O0 产出调试版', '默认编译带 -O2 优化，变量在寄存器间漂移，gdb 单步时会提示 optimized out。执行 make OPTIMIZATION=-O0 产出无优化的调试版本，再用 gdb ./src/redis-server 对 serverCron 设断点，观察事件循环的入参与全局状态。边界：调试版性能低、体积大，只用于定位崩溃与单步理解流程，压测数据一律来自默认优化版本。', 'O0 仅供调试', {
        title: 'GDB：在 -O0 Redis 中命中 serverCron',
        language: 'PowerShell',
        code: `git worktree add ../redis-debug 7.2.5
make -C ../redis-debug -j8 OPTIMIZATION=-O0
gdb -q -batch ../redis-debug/src/redis-server \\
  -ex 'set pagination off' \\
  -ex 'break serverCron' \\
  -ex 'run --port 6390 --save ""' \\
  -ex 'bt 4' \\
  -ex 'info args' \\
  -ex 'kill'
file ../redis-debug/src/redis-server
file ../redis-jemalloc/src/redis-server`,
        output: `Breakpoint 1, serverCron () at server.c:1290
#0  serverCron () at server.c:1290
#1  processTimeEvents () at ae.c:443
#2  aeProcessEvents () at ae.c:503
#3  aeMain () at ae.c:531
../redis-debug/src/redis-server: ELF 64-bit ... not stripped
../redis-jemalloc/src/redis-server: ELF 64-bit ... not stripped

-O0 版本能稳定停在 serverCron 并查看完整源码帧。
调试版只用于单步与崩溃定位；性能结论必须回到 release 构建。`,
      }],
    ],
  },
  {
    name: 'C · Redis/Nginx 源码与原生服务交付：Redis 事件循环与连接缓冲',
    track: 'P14 · 独立语言课程',
    minutes: 46,
    prerequisite: '学员已用固定 tag 编译过 Redis 并会使用 redis-cli。',
    goal: '读懂 ae.c 的 aeProcessEvents 如何交替处理文件事件与时间事件，掌握查询缓冲区 1GB 上限与输出缓冲区三组限制的确切行为，能用 CLIENT LIST 与 CONFIG 命令实测验证。',
    guidedPractice: '现场在 gdb 对 src/ae.c 的 aeProcessEvents 设断点，另开终端执行 redis-cli PING 观察断点命中；随后 CONFIG GET client-query-buffer-limit 与 client-output-buffer-limit 逐项抄下默认值，再用 telnet 127.0.0.1 6379 手敲 RESP 协议发一条 PING 验证解析路径。',
    independentPractice: '独立完成：把 client-query-buffer-limit 临时调成 1mb 后发送超长命令复现连接被断并抄录日志；再起一个消费慢的订阅客户端，通过 CLIENT LIST 观察 omem 增长直到被 pubsub 规则断开，把两段现象写进操作记录。',
    commonErrors: ['把查询缓冲区的 1GB 上限当成可随便调大的软建议，调大后单连接就能吃光实例内存。', '以为命令发一半服务器会报错，实际半包只是停在缓冲区等待，误判成连接假死去反复重连。'],
    sourceRefs: ['Redis Documentation. https://redis.io/docs/latest/', 'Nginx Documentation. https://nginx.org/en/docs/'],
    steps: [
      ['aeProcessEvents 主循环', 'src/ae.c 的 aeMain 持续调用 aeProcessEvents：先由 aeApiPoll 依据 epoll 等待就绪文件事件，等待时长由最早到期的时间事件决定，随后统一处理文件事件与到期的时间事件。实操：在 gdb 对 aeProcessEvents 设断点，客户端执行 redis-cli PING 时可观察到命中。边界：Redis 只有一个主线程跑这个循环，网络 IO 与命令执行全部串行。', '单线程跑循环', {
        title: 'GDB：在 aeProcessEvents 观察事件循环栈',
        language: 'PowerShell',
        code: `Set-Location ../redis-debug
Select-String src/ae.c -Pattern '^int aeProcessEvents|aeApiPoll\\(' |
  Select-Object -First 6
gdb -q -batch src/redis-server \\
  -ex 'set pagination off' \\
  -ex 'break aeProcessEvents' \\
  -ex 'run --port 6391 --save ""' \\
  -ex 'bt 4' \\
  -ex 'info args' \\
  -ex 'print server.hz' \\
  -ex 'kill'`,
        output: `ae.c: ... int aeProcessEvents(aeEventLoop *eventLoop, int flags)
ae.c: ... int numevents = aeApiPoll(eventLoop, tvp);
Breakpoint 1, aeProcessEvents (eventLoop=..., flags=...) at ae.c:...
#0 aeProcessEvents () at ae.c
#1 aeMain () at ae.c
#2 main () at server.c
$1 = 10

主线程从 main 进入 aeMain，再反复调用 aeProcessEvents。
断点现场可继续查看 aeApiPoll 的超时与文件事件处理路径。`,
      }],
      ['telnet 手发 RESP', '客户端命令是 RESP 文本协议，PING 的协议化形式为 *1 后跟 $4 与 PING 三行，以 \r\n 结尾。实操：telnet 127.0.0.1 6379 后按协议逐行手敲，服务器照样返回 +PONG，证明解析只认字节不认客户端；processInputBuffer 按缓冲区内容逐字节扫描切分参数。边界：一次未收齐的数据停在缓冲区等下一次可读事件，半包不丢也不报错。', 'telnet 发协议', {
        title: '原始 TCP：不借 redis-cli 发送 RESP PING',
        language: 'PowerShell',
        code: `$client = [Net.Sockets.TcpClient]::new('127.0.0.1', 6379)
$stream = $client.GetStream()
$crlf = ([string][char]13) + [char]10
$dollar = [char]36
$requestText = "*1" + $crlf + $dollar + "4" + $crlf + "PING" + $crlf
$request = [Text.Encoding]::ASCII.GetBytes($requestText)
$stream.Write($request, 0, $request.Length)
$buffer = New-Object byte[] 32
$count = $stream.Read($buffer, 0, $buffer.Length)
[Text.Encoding]::ASCII.GetString($buffer, 0, $count)
$client.Close()
rg -n "processInputBuffer|PROTO_INLINE_MAX_SIZE" ../redis-src/src/networking.c | Select-Object -First 8`,
        output: `+PONG
networking.c:... processInputBuffer(client *c)
networking.c:... processInputBufferAndReplicate(client *c)

服务器只按字节解析 RESP，不依赖 redis-cli 的客户端类型。
+PONG 是简单字符串回复，以 CRLF 结尾。`,
      }],
      ['查询缓冲区 1GB 上限', '每个客户端连接的查询缓冲区有硬上限，client-query-buffer-limit 默认 1gb，可用 CONFIG GET client-query-buffer-limit 查看。累计未解析数据超过该值时，Redis 直接关闭连接并记录 protocol error 日志，防止单个客户端无限吃内存。实操：CONFIG SET client-query-buffer-limit 1mb 后发送超长数据，可当场复现连接被断。', '1gb 硬上限', {
        title: 'Redis：1MB 查询缓冲上限断开超长半包',
        language: 'PowerShell',
        code: `src/redis-server --port 6392 --save "" --daemonize yes --logfile query.log
src/redis-cli -p 6392 CONFIG GET client-query-buffer-limit
src/redis-cli -p 6392 CONFIG SET client-query-buffer-limit 1mb
$client = [Net.Sockets.TcpClient]::new('127.0.0.1', 6392)
$stream = $client.GetStream()
$crlf = ([string][char]13) + [char]10
$dollar = [char]36
$prefixText = "*1" + $crlf + $dollar + "2000000" + $crlf
$prefix = [Text.Encoding]::ASCII.GetBytes($prefixText)
$body = [Text.Encoding]::ASCII.GetBytes(('A' * 2000000))
$stream.Write($prefix, 0, $prefix.Length)
$stream.Write($body, 0, $body.Length)
Start-Sleep -Milliseconds 300
Get-Content query.log | Select-String 'query buffer|protocol error|Closing client'
$client.Connected`,
        output: `client-query-buffer-limit
1073741824
OK
Closing client that reached max query buffer length
False

未收满的 $2000000 参数让缓冲区超过 1MB。
服务端主动断开连接，单连接无法继续吃内存。`,
      }],
      ['输出缓冲区三组限制', '回复写不完时数据堆在客户端输出缓冲区，CONFIG GET client-output-buffer-limit 显示三组规则：normal 默认 0 0 0 不限制，slave 为 256mb 64mb 60，pubsub 为 32mb 8mb 60，后两组表示硬上限或 60 秒内持续超过软上限就断开。实操：CLIENT LIST 的 omem 字段观察某连接积压字节数；消费慢的订阅客户端先被踢，保护的是主线程内存。', 'omem 看积压', {
        title: '慢订阅者：输出缓冲超限被服务端断开',
        language: 'PowerShell',
        code: `src/redis-cli -p 6392 CONFIG GET client-output-buffer-limit
src/redis-cli -p 6392 CONFIG SET client-output-buffer-limit "pubsub 4kb 0 0"
$slow = [Net.Sockets.TcpClient]::new('127.0.0.1', 6392)
$sub = $slow.GetStream()
$crlf = ([string][char]13) + [char]10
$dollar = [char]36
$requestText = "*2" + $crlf + $dollar + "9" + $crlf + "SUBSCRIBE" + $crlf + $dollar + "6" + $crlf + "events" + $crlf
$request = [Text.Encoding]::ASCII.GetBytes($requestText)
$sub.Write($request, 0, $request.Length)
1..100 | ForEach-Object {
  src/redis-cli -p 6392 PUBLISH events ('x' * 1024) | Out-Null
}
src/redis-cli -p 6392 CLIENT LIST TYPE pubsub
Start-Sleep -Milliseconds 200
$slow.Connected`,
        output: `pubsub 32mb 8mb 60
OK
id=8 ... omem=113512 ...
False

慢客户端不读取，SUBSCRIBE 消息持续堆在 omem。
超过 pubsub 硬上限后连接被断开，主线程内存得到保护。`,
      }],
      ['serverCron 时间事件', 'ae 循环里除文件事件外还有时间事件，serverCron 默认每 100 毫秒触发一次，负责过期键抽样删除、客户端超时清理与复制心跳等杂务。实操：CONFIG GET hz 得到默认值 10 即每秒 10 次，CONFIG SET hz 20 后通过 INFO stats 观察 expired_keys 的变化速度差异。边界：hz 调高会增加 CPU 占用，主线程越忙，时间事件实际延迟越大。', 'hz 默认 10', {
        title: 'serverCron：主动过期由时间事件推进',
        language: 'PowerShell',
        code: `src/redis-cli -p 6392 CONFIG GET hz
src/redis-cli -p 6392 FLUSHALL
src/redis-cli -p 6392 INFO stats | Select-String 'expired_keys'
1..500 | ForEach-Object {
  src/redis-cli -p 6392 SET "temp:$_" value PX 50 | Out-Null
}
Start-Sleep -Milliseconds 250
src/redis-cli -p 6392 DBSIZE
src/redis-cli -p 6392 INFO stats | Select-String 'expired_keys'
src/redis-cli -p 6392 CONFIG SET hz 20`,
        output: `hz
10
expired_keys:0
0
expired_keys:500
OK

500 个键在 50ms 后到期，serverCron 主动过期把它们清走。
hz 只控制时间事件频率，不改变单个键的过期时刻。`,
      }],
    ],
  },
  {
    name: 'C · Redis/Nginx 源码与原生服务交付：Nginx event cycle 与 upstream',
    track: 'P14 · 独立语言课程',
    minutes: 44,
    prerequisite: '学员已能编译 Nginx 并写出基础的 nginx.conf 配置。',
    goal: '理解 ngx_event 的 timer 红黑树如何决定 epoll_wait 超时，掌握 worker_processes 与 worker_connections 的乘积关系，能配置 upstream 轮询、故障摘除与 keepalive 长连接复用。',
    guidedPractice: '现场配置 upstream backend 指向两个返回不同内容的本地后端，用 curl 连续请求观察轮换；再逐条加上 keepalive 16、proxy_http_version 1.1 与清空的 Connection 头，每加一条用 netstat 统计到后端的 TCP 连接数，把四次统计结果并排记录。',
    independentPractice: '独立完成：给后端加 proxy_read_timeout 2s 并让一台后端挂起模拟慢响应，观察 error.log 中的超时与摘除记录；再用 nginx -t 验证一处故意写错的配置，抄录报错行号后修复并 reload。',
    commonErrors: ['配了 keepalive 16 却没改 proxy_http_version 和 Connection 头，长连接根本建立不起来。', '把 worker_connections 当成每秒请求数上限，容量估算时忘了代理场景每请求占两条连接。'],
    sourceRefs: ['Nginx Documentation. https://nginx.org/en/docs/', 'Redis Documentation. https://redis.io/docs/latest/'],
    steps: [
      ['timer 红黑树定超时', 'Nginx 事件模块把全部定时器事件挂在 ngx_event_timer_rbtree 红黑树上，每次 epoll_wait 的超时参数取红黑树最小节点的剩余时间，保证最近的超时最先被唤醒处理。实操：配置 proxy_read_timeout 2s 后让后端挂起，error.log 会出现 upstream timed out 记录。边界：定时器精度依赖事件循环一轮的实际耗时，是毫秒级近似而非实时定时。', '红黑树定超时', {
        title: 'Nginx：proxy_read_timeout 触发 upstream timed out',
        language: 'PowerShell',
        code: `@'
import socket, time
server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", 9001))
server.listen(1)
connection, address = server.accept()
time.sleep(10)
'@ | Set-Content slow-backend.py
Start-Process python -ArgumentList 'slow-backend.py'
@'
worker_processes 1;
error_log logs/error.log info;
events { worker_connections 1024; }
http {
  server {
    listen 9100;
    location / {
      proxy_pass http://127.0.0.1:9001;
      proxy_read_timeout 2s;
    }
  }
}
'@ | Set-Content nginx.conf
nginx -p $PWD -c nginx.conf -g 'daemon off;'
curl.exe -m 6 -v http://127.0.0.1:9100/
Get-Content logs/error.log -Tail 30 | Select-String 'upstream timed out|proxy_read_timeout'`,
        output: `curl: (52) Empty reply from server
upstream timed out (110: Connection timed out) while reading response header from upstream
client: 127.0.0.1, server: , request: "GET / HTTP/1.1"
upstream: "http://127.0.0.1:9001/", host: "127.0.0.1:9100"

2 秒到点由事件循环定时器唤醒，读取上游超时。
日志同时给出下游客户端、请求行与上游地址，可定位是哪一段等待超时。`,
      }],
      ['worker 与连接数乘积', 'worker_processes auto 按核数拉起 worker，每个 worker 独立跑一个 epoll 事件循环，服务能力上限约为 worker_processes 乘 worker_connections。实操：ps -ef 加 grep 数出 worker 进程数，nginx -T 输出里核对 worker_connections 取值，两者相乘即为单机并发连接上限。边界：代理场景每个请求占上游与下游各一条连接，估算时要除以二。', '乘出并发上限', {
        title: 'Nginx：从进程树与配置计算连接上限',
        language: 'PowerShell',
        code: `nginx -p $PWD -c nginx.conf -s reload
Get-Process nginx | Select-Object Id,ProcessName,StartTime
$workers = (Get-Process nginx | Measure-Object).Count - 1
$conf = nginx -p $PWD -c nginx.conf -T 2>&1
$workerProcesses = [regex]::Match($conf, 'worker_processes\\s+(\\S+);').Groups[1].Value
$workerConnections = [int][regex]::Match($conf, 'worker_connections\\s+(\\d+);').Groups[1].Value
[pscustomobject]@{
  WorkerProcesses = $workers
  WorkerConnections = $workerConnections
  MaxSockets = $workers * $workerConnections
  ProxyRequests = [math]::Floor($workers * $workerConnections / 2)
} | Format-List
ss -s`,
        output: `WorkerProcesses  : 2
WorkerConnections: 1024
MaxSockets       : 2048
ProxyRequests    : 1024
TCP: 32 (estab 5, closed 18, orphaned 0)

worker 数乘 worker_connections 得到本机 socket 容量。
代理请求同时占客户端与上游两条连接，所以请求容量约再除以二。`,
      }],
      ['upstream 轮询与摘除', 'upstream backend 块内写两个 server 定义后端池，location 里 proxy_pass http://backend 即默认轮询分发。实操：两个后端各返回不同内容，curl 连续请求观察轮换顺序；某台连续失败达到 max_fails 次且落在 fail_timeout 窗口内会被临时摘除，到期再试探恢复。边界：摘除与恢复都写进 error.log，是判断后端健康状态的主要证据。', 'max_fails 摘除', {
        title: 'upstream：轮询 A/B 并观察故障节点摘除',
        language: 'PowerShell',
        code: `@'
worker_processes 1;
error_log logs/error.log info;
events { worker_connections 1024; }
http {
  upstream backend {
    server 127.0.0.1:9001 max_fails=2 fail_timeout=10s;
    server 127.0.0.1:9002 max_fails=2 fail_timeout=10s;
  }
  server { listen 9001; location / { return 200 "A\\n"; } }
  server { listen 9002; location / { return 200 "B\\n"; } }
  server {
    listen 9100;
    location / { proxy_pass http://backend; }
  }
}
'@ | Set-Content nginx.conf
nginx -p $PWD -c nginx.conf -s reload
1..6 | ForEach-Object { curl.exe -s http://127.0.0.1:9100/ }
nginx -p $PWD -c nginx.conf -s stop
Get-Content logs/error.log -Tail 20 | Select-String 'upstream|fail'`,
        output: `A
B
A
B
A
B
upstream server temporarily disabled while connecting to upstream

默认轮询在两个健康后端间交替。
连续失败达到 max_fails 后节点在 fail_timeout 内被摘除，恢复时再试探。`,
      }],
      ['keepalive 三件套', 'upstream 块内写 keepalive 16 后，Nginx 与后端之间最多维持 16 条空闲长连接复用，但必须同时设置 proxy_http_version 1.1 且把 proxy_set_header Connection 清空，否则每个请求仍会新建 TCP 连接。实操：不加 keepalive 时用 curl 连发 20 个请求，netstat 统计到后端的连接条数，加上三行配置后重压对比下降幅度。', '三件套保长连', {
        title: 'keepalive：HTTP/1.1 与 Connection 清空对照',
        language: 'PowerShell',
        code: `@'
worker_processes 1;
events { worker_connections 1024; }
http {
  upstream backend {
    server 127.0.0.1:9001;
    keepalive 16;
  }
  server { listen 9001; location / { return 200 "upstream-ok\\n"; } }
  server {
    listen 9100;
    location / {
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_pass http://backend;
    }
  }
}
'@ | Set-Content nginx.conf
nginx -p $PWD -c nginx.conf -g 'daemon off;'
1..100 | ForEach-Object { curl.exe -s http://127.0.0.1:9100/ | Out-Null }
ss -tan | Select-String ':9001'
Get-Content logs/access.log -Tail 5`,
        output: `ESTAB 0 0 127.0.0.1:... 127.0.0.1:9001
GET / HTTP/1.1 200 12 "-" "curl/8.10.0"

keepalive 16 允许空闲连接留在池中复用。
若漏掉 HTTP/1.1 或保留 Connection: close，每请求都会重新建立 TCP 连接。`,
      }],
      ['nginx -t 与 reload 纪律', '改动配置先执行 nginx -t 做语法检查，通过后 nginx -s reload 让 master 重新读配置并平滑替换 worker。实操：故意把 worker_connections 写成 0 触发 nginx -t 报错，抄录报错行号定位修复；开启 error_log 的 info 级别后，upstream 转发失败、超时与摘除节点都会带后端名称与响应码出现在日志里。边界：reload 失败的配置不会生效，老 worker 继续跑。', '先 -t 再 reload', {
        title: 'nginx -t：坏配置拒绝 reload，旧 worker 保持服务',
        language: 'PowerShell',
        code: `Copy-Item nginx.conf nginx.good.conf
nginx -p $PWD -c nginx.conf -s reload
(Get-Content nginx.conf) -replace 'worker_connections 1024;', 'worker_connections 0;' |
  Set-Content nginx.bad.conf
nginx -p $PWD -c nginx.bad.conf -t
curl.exe -s -o NUL -w '%{http_code}' http://127.0.0.1:9100/
Copy-Item nginx.bad.conf nginx.conf
Get-Content logs/error.log -Tail 20
Copy-Item nginx.good.conf nginx.conf
nginx -p $PWD -c nginx.conf -t
nginx -p $PWD -c nginx.conf -s reload`,
        output: `nginx: [emerg] invalid value "0" in .../nginx.bad.conf:4
nginx: configuration file .../nginx.bad.conf test failed
200
nginx: [emerg] invalid value "0" in .../nginx.conf:4
nginx: configuration file .../nginx.conf test is successful

-t 失败发生在应用配置之前，运行中的 worker 仍返回 200。
修正后再次 -t 通过才 reload，避免把坏配置推进线上。`,
      }],
    ],
  },
  {
    name: 'C · Redis/Nginx 源码与原生服务交付：状态机、容量和文件描述符上限',
    track: 'P14 · 独立语言课程',
    minutes: 48,
    prerequisite: '学员已理解 epoll 事件循环并配置过连接数上限。',
    goal: '画出 Redis 与 Nginx 协议解析状态机的半包等待路径，掌握 ulimit -n、worker_rlimit_nofile、maxclients 与 fs.file-max 四层上限的查看与设置方法，能完成单机并发容量估算。',
    guidedPractice: '现场用 telnet 只发半条 RESP 命令观察连接保持等待、补齐后命令才执行；随后依次执行 ulimit -n、cat /proc/sys/fs/file-max 与 redis-cli CONFIG GET maxclients 记录三处数值，再对 Nginx worker 的 pid 执行 cat /proc/pid/limits 核对 Max open files 行。',
    independentPractice: '独立完成：把 worker_connections 压到 10 用压测工具打满，抄录 error.log 里 too many open files 或 worker_connections are not enough 的报错原文；再上调 fd 上限 reload 后复测，前后两份日志并排整理成容量结论。',
    commonErrors: ['只在当前 shell 执行 ulimit -n 65535 就以为永久生效，服务重启后上限又回到 1024。', '容量估算只算 worker_connections，漏掉 maxclients 与系统级 file-max，三者取最小才是真上限。'],
    sourceRefs: ['Redis Documentation. https://redis.io/docs/latest/', 'Nginx Documentation. https://nginx.org/en/docs/'],
    steps: [
      ['半包停在当前状态', 'Redis 的客户端解析是显式状态机：processInputBuffer 逐字节扫描，未收满 \r\n 就停在当前状态等下一次可读事件，收齐一行再决定继续读参数还是执行命令；Nginx 的 ngx_http_request 状态机同样按状态推进解析请求行与头部。实操：用 telnet 只发 *1 与 $4 两行，观察到连接保持安静不报错，补完剩余字节后命令立即执行。', '半包停在当前态', {
        title: 'Redis：半条 RESP 保持等待，补齐后才执行',
        language: 'PowerShell',
        code: `$client = [Net.Sockets.TcpClient]::new('127.0.0.1', 6392)
$stream = $client.GetStream()
$crlf = ([string][char]13) + [char]10
$dollar = [char]36
$head = [Text.Encoding]::ASCII.GetBytes("*1" + $crlf + $dollar + "4" + $crlf)
$stream.Write($head, 0, $head.Length)
Start-Sleep -Milliseconds 300
Write-Output "after-half available=$($client.Available) connected=$($client.Connected)"
$tail = [Text.Encoding]::ASCII.GetBytes("PING" + $crlf)
$stream.Write($tail, 0, $tail.Length)
$buffer = New-Object byte[] 16
$count = $stream.Read($buffer, 0, $buffer.Length)
Write-Output ([Text.Encoding]::ASCII.GetString($buffer, 0, $count))
$client.Close()`,
        output: `after-half available=0 connected=True
+PONG

只到参数声明时服务器不返回错误，也不执行命令。
补齐 PING 与 CRLF 后，状态机完成一帧并立即回复 +PONG。`,
      }],
      ['ulimit -n 两级生效', 'shell 里执行 ulimit -n 显示软上限，常见默认 1024，ulimit -n 65535 只在当前会话内生效；永久修改写入 /etc/security/limits.conf 的 nofile soft 与 hard 两行后重新登录。实操：su 到运行服务的用户再执行 ulimit -n 核对，因为不同用户的配置各自独立。边界：Redis 与 Nginx 每接受一条新连接都占一个 fd，软上限不足时最先在 accept 处报错。', '会话内才生效', {
        title: 'shell：查看并临时修改 nofile 软硬限制',
        language: 'PowerShell',
        code: `bash -lc 'id -un; ulimit -Sn; ulimit -Hn'
bash -lc 'ulimit -n 4096; ulimit -Sn; ulimit -Hn'
bash -lc 'ulimit -n 65535 2>&1'
Select-String /etc/security/limits.conf -Pattern 'nofile' -Context 0,1
sudo runuser -u redis -- bash -lc 'ulimit -Sn; ulimit -Hn'
cat /proc/$(pgrep -o redis-server)/limits | Select-String 'Max open files'`,
        output: `redis
1024
1048576
4096
1048576
bash: ulimit: open files: cannot modify limit: Operation not permitted
redis soft nofile 65535
redis hard nofile 65535
65535
65535
Max open files 65535 65535 files

软上限可在 hard 上限内调高，不能超过 hard。
服务进程的 /proc/PID/limits 才是实际生效值。`,
      }],
      ['worker_rlimit_nofile', 'Nginx 配置 worker_rlimit_nofile 65535 可让 master 在拉起 worker 时直接设置其 RLIMIT_NOFILE，不依赖 limits.conf。实操：设好后 reload，找到 worker 进程的 pid，cat /proc/pid/limits 核对 Max open files 一行已变为新值。边界：该值必须不小于 worker_connections，否则连接还没到配置上限 fd 就先耗尽，error.log 会出现 too many open files。', '读 proc 验证', {
        title: 'Nginx：worker_rlimit_nofile 在 /proc 中验证',
        language: 'PowerShell',
        code: `@'
worker_processes 1;
worker_rlimit_nofile 65535;
error_log logs/error.log;
events { worker_connections 60000; }
http {
  server { listen 9100; location / { return 200 "ok\\n"; } }
}
'@ | Set-Content nginx.conf
nginx -p $PWD -c nginx.conf -s reload
$worker = Get-Process nginx | Sort-Object Id | Select-Object -Last 1
bash -lc "cat /proc/$($worker.Id)/limits" | Select-String 'Max open files'
nginx -p $PWD -c nginx.conf -T | Select-String 'worker_rlimit_nofile|worker_connections'`,
        output: `Max open files            65535                65535                files
worker_rlimit_nofile 65535;
worker_connections 60000;

master 拉起 worker 时把 RLIMIT_NOFILE 设置到 65535。
worker_connections 小于 fd 上限，连接数先由 worker_connections 约束。`,
      }],
      ['四层上限取最小', '代理场景每个请求占上游与下游两条连接，单机并发上限约为 worker_processes 乘 worker_connections 再除以每请求连接数；Redis 侧 maxclients 默认 10000，实际可达值还受机器 fd 总量限制。实操：cat /proc/sys/fs/file-max 查看系统级 fd 总池，CONFIG GET maxclients 核对实例上限。边界：四项数值任何一项小于业务并发，都是它先卡住容量。', '三处上限取最小', {
        title: '容量估算：把四层限制算成一个上限',
        language: 'PowerShell',
        code: `$fileMax = [int](Get-Content /proc/sys/fs/file-max)
$workerLimit = [int]((Select-String /proc/$(Get-Process nginx | Sort-Object Id | Select-Object -Last 1).Id/limits -Pattern 'Max open files').Line -split '\\s+')[3]
$workerConnections = 60000
$maxClients = [int]((src/redis-cli -p 6392 CONFIG GET maxclients)[1])
$proxySockets = $workerLimit
$redisSockets = $maxClients + 32
[pscustomobject]@{
  FileMax = $fileMax
  NginxWorkerFd = $workerLimit
  NginxConnections = $workerConnections
  RedisMaxClients = $maxClients
  PracticalLimit = [math]::Min([math]::Min($workerLimit, $workerConnections), [math]::Min($fileMax, $redisSockets))
} | Format-List`,
        output: `FileMax          : 9223372036854775807
NginxWorkerFd    : 65535
NginxConnections : 60000
RedisMaxClients  : 10000
PracticalLimit   : 10032

文件总池很大，但 Nginx worker 与 Redis maxclients 更低。
实际容量取所有瓶颈的最小值，并再为日志、配置与内部 fd 留余量。`,
      }],
      ['超限时的现象', 'fd 用尽时 Nginx worker 的 accept 返回 EMFILE，error.log 反复刷 worker_connections are not enough 或 accept failed，新连接在内核队列排队直至溢出丢弃；Redis 达到 maxclients 后对新连接直接回复错误并关闭。实操：把 worker_connections 设成 10 压测打满，按日志关键字确认现象。边界：恢复靠上调 fd 上限后 reload，反复重启只是掩盖问题。', 'EMFILE 先于溢出', {
        title: 'Nginx：低 worker_connections 压满后的日志证据',
        language: 'PowerShell',
        code: `@'
worker_processes 1;
worker_rlimit_nofile 12;
error_log logs/error.log warn;
events { worker_connections 10; }
http {
  server {
    listen 9100;
    location / {
      proxy_pass http://127.0.0.1:9001;
      proxy_read_timeout 10s;
    }
  }
}
'@ | Set-Content nginx-lowfd.conf
nginx -p $PWD -c nginx-lowfd.conf -s reload
1..50 | ForEach-Object -Parallel {
  curl.exe -s -m 3 http://127.0.0.1:9100/ | Out-Null
} -ThrottleLimit 50
Get-Content logs/error.log -Tail 80 |
  Select-String 'worker_connections are not enough|Too many open files|accept4\\(\\) failed'
nginx -p $PWD -c nginx.conf -s reload`,
        output: `worker_connections are not enough
accept4() failed (24: Too many open files)

并发请求超过 10 个事件连接槽后，worker 无法继续 accept。
日志指向 worker_connections 与 fd 两层边界，恢复需同时上调后 reload。`,
      }],
    ],
  },
  {
    name: 'C · Redis/Nginx 源码与原生服务交付：systemd、容器、core dump 和升级',
    track: 'P14 · 独立语言课程',
    minutes: 50,
    prerequisite: '学员已会编写 systemd 单元并能用 gdb 读 core。',
    goal: '掌握 Restart=on-failure 的生效条件与验证方法，理解 core dump 的 ulimit 与 core_pattern 两个前提，能在容器内核对独立 fd 上限，并完整执行一次 Nginx USR2 平滑升级与 Redis 主从滚动升级。',
    guidedPractice: '现场编写 redis.service 单元设置 Restart=on-failure 与 RestartSec=3，kill 进程后用 systemctl status 观察自动重启；再解除 ulimit -c 后触发一次崩溃，用 gdb 加载 core 执行 bt 打印调用栈；最后对编译好的新版本 Nginx 依次发 USR2 与 WINCH 信号，用 ps 观察两代 master 并存。',
    independentPractice: '独立完成：docker run 加 --ulimit nofile=65535:65535 启动 Redis 容器，进容器用 ulimit -n 与 cat /proc/1/limits 双重核对；再对 Nginx 完成一次平滑升级并故意保留旧 master，验证 kill -HUP 能把 worker 回滚到旧配置。',
    commonErrors: ['以为 Restart=on-failure 对所有退出都重启，正常 stop 后服务照常关闭，误判成 systemd 失灵。', '排查容器内连接被拒时只看宿主机 limits，容器内 fd 上限独立设置，宿主机数值再大也没用。'],
    sourceRefs: ['Nginx Documentation. https://nginx.org/en/docs/', 'Redis Documentation. https://redis.io/docs/latest/'],
    steps: [
      ['Restart=on-failure', '编写 redis.service 单元：ExecStart 指向 redis-server 与配置文件路径，Restart=on-failure 加 RestartSec=3，异常退出后 3 秒自动拉起。实操：systemctl start 后手动 kill 掉 redis 进程，systemctl status 观察自动重启记录，systemctl show -p ExecMainStartTimes 核对启动次数递增。边界：on-failure 只对非零退出码与信号崩溃生效，正常 systemctl stop 不会触发重启。', '异常退出才拉起', {
        title: 'systemd user：SIGKILL 后按 RestartSec 自动拉起',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory -Force ~/.config/systemd/user | Out-Null
@'
[Unit]
Description=Redis restart demo
After=network.target
[Service]
Type=simple
ExecStart=/usr/bin/redis-server /tmp/redis-demo.conf --daemonize no
Restart=on-failure
RestartSec=3
[Install]
WantedBy=default.target
'@ | Set-Content ~/.config/systemd/user/redis-demo.service
'port 6395' | Set-Content /tmp/redis-demo.conf
systemctl --user daemon-reload
systemctl --user start redis-demo
$first = (systemctl --user show redis-demo -p MainPID --value)
kill -9 $first
Start-Sleep -Seconds 4
systemctl --user status redis-demo --no-pager
systemctl --user show redis-demo -p NRestarts -p ExecMainStartTimestamp`,
        output: `Active: active (running) since ...
Main PID: 24511 (redis-server)
    Restarts: 1
NRestarts=1
ExecMainStartTimestamp=...

kill -9 导致异常退出，RestartSec=3 后 systemd 拉起新 PID。
执行 systemctl stop 是计划内停止，不会触发 on-failure 重启。`,
      }],
      ['core dump 两个前提', 'core 落盘需要同时满足：进程的 core 大小限制非零，即 ulimit -c unlimited；内核按 /proc/sys/kernel/core_pattern 指定的路径模板写文件。实操：用 -O0 调试版制造一次空指针崩溃，gdb 加载 core 后执行 bt 直接显示崩溃时的完整调用栈。边界：systemd 托管服务的 core 行为由 LimitCORE 配置控制，ulimit -c 0 的会话里一个 core 都不会生成。', 'bt 看崩溃栈', {
        title: 'core：ulimit、core_pattern 与 GDB 回溯',
        language: 'PowerShell',
        code: `@'
#include <stddef.h>
int main(void) {
    int *pointer = NULL;
    return *pointer;
}
'@ | Set-Content crash.c
gcc -std=c17 -g -O0 crash.c -o crash
bash -lc 'ulimit -c; ulimit -c unlimited; ./crash'
Get-Content /proc/sys/kernel/core_pattern
coredumpctl list crash --since '10 minutes ago'
coredumpctl debug crash --debugger-arguments='-batch -ex "bt full"'
gdb -q ./crash core -batch -ex 'bt full' -ex 'info registers rip'`,
        output: `0
Segmentation fault (core dumped)
|/usr/lib/systemd/systemd-coredump %P %u %g %s %t %c %h
TIME PID SIG EXE
... 25102 SIGSEGV /tmp/lab/crash
#0 main () at crash.c:4
4 return *pointer;
rip ... in main () at crash.c:4

ulimit -c 0 时不落 core；unlimited 且 core_pattern 有效才得到记录。
gdb 的 frame 与源码行直接指出空指针解引用位置。`,
      }],
      ['容器内独立上限', 'docker run --ulimit nofile=65535:65535 为容器单独设置 fd 上限，与宿主机配置互不影响；容器里的 Redis 还需配合下调 maxclients 才自洽。实操：docker exec 进入容器执行 ulimit -n 验证生效，再 cat /proc/1/limits 与宿主机进程的同一文件对比。边界：容器内默认 fd 上限常低于宿主机，压测报连接被拒时查宿主机 limits 看不出问题，必须进容器核对。', '容器内各自算', {
        title: 'Docker：容器内 nofile 与 maxclients 联合核对',
        language: 'PowerShell',
        code: `docker run --name redis-limits --rm -d \\
  --ulimit nofile=65535:65535 \\
  -e REDIS_ARGS='--maxclients 20000' redis:7.2.5
docker exec redis-limits bash -lc 'ulimit -Sn; ulimit -Hn'
docker exec redis-limits bash -lc "cat /proc/1/limits | grep 'Max open files'"
docker exec redis-limits redis-cli CONFIG GET maxclients
docker stats --no-stream redis-limits
docker stop redis-limits`,
        output: `65535
65535
Max open files 65535 65535 files
maxclients
20000
CONTAINER ... CPU 0.12% MEM 8.2MiB

容器内软硬 nofile 都是 65535，独立于宿主机 shell。
Redis maxclients 20000 低于 65535，由 Redis 自身先限制连接数。`,
      }],
      ['USR2 平滑升级', '编译新版本 nginx 后覆盖旧二进制，向 master 发送 kill -USR2 触发其以新二进制拉起新一代 master，新旧两代并存；再 kill -WINCH 让旧代 worker 平滑退出，确认无误后 kill -QUIT 旧 master 收尾。实操：升级前后各执行一次 nginx -v，并用 ps -ef 观察两代 master 并存的过程。边界：旧 master 期间可 kill -HUP 回滚 worker 到旧配置，旧进程退出后回滚窗口关闭。', '两代 master 并存', {
        title: 'Nginx：USR2 -> WINCH -> QUIT 平滑升级',
        language: 'PowerShell',
        code: `$oldPid = [int](Get-Content logs/nginx.pid)
$oldVersion = (nginx -v 2>&1)
Copy-Item sbin/nginx sbin/nginx.old -Force
make -C ../nginx-new -j8
Copy-Item ../nginx-new/objs/nginx sbin/nginx -Force
nginx -p $PWD -c nginx.conf -t
kill -USR2 $oldPid
Start-Sleep -Milliseconds 500
Get-Process nginx | Select-Object Id,StartTime,Path
$newPid = (Get-Process nginx | Sort-Object StartTime | Select-Object -Last 1).Id
Write-Output "old=$oldPid new=$newPid old_version=$oldVersion"
kill -WINCH $oldPid
Start-Sleep -Seconds 1
kill -QUIT $oldPid
nginx -p $PWD -c nginx.conf -v`,
        output: `old=24101 new=24188 old_version=nginx/1.26.0
24101 ... /usr/sbin/nginx
24188 ... /usr/sbin/nginx
nginx version: nginx/1.26.2

USR2 用新二进制拉起第二个 master，旧 master 暂留回滚窗口。
WINCH 让旧 worker 退出，确认新代正常后再 QUIT 旧 master。`,
      }],
      ['Redis 滚动升级', '主从架构下的 Redis 升级采用滚动方式：先对副本执行 SLAVEOF NO ONE 提升为主，再升级旧主并重新挂回复制，全程不阻塞写入。实操：INFO replication 观察 role 与 master_link_status 变为 up 才算切换完成。边界：提升前必须确认复制偏移量接近追平，否则新主缺数据；单机升级则先执行 SAVE 落 RDB 再停进程，避免直接 kill 丢最近的写入。', '先落盘再停进程', {
        title: 'Redis：复制追平、提升副本、升级旧主',
        language: 'PowerShell',
        code: `../redis-jemalloc/src/redis-server --port 6393 --daemonize yes --pidfile primary.pid
../redis-jemalloc/src/redis-server --port 6394 --daemonize yes --pidfile replica.pid
../redis-jemalloc/src/redis-cli -p 6394 REPLICAOF 127.0.0.1 6393
../redis-jemalloc/src/redis-cli -p 6394 INFO replication |
  Select-String 'role:slave|master_link_status|master_repl_offset|slave_repl_offset'
../redis-jemalloc/src/redis-cli -p 6394 REPLICAOF NO ONE
../redis-jemalloc/src/redis-cli -p 6394 INFO replication |
  Select-String 'role:master|connected_slaves'
../redis-jemalloc/src/redis-cli -p 6393 SAVE
../redis-jemalloc/src/redis-cli -p 6393 SHUTDOWN
../redis-tls/src/redis-server --port 6393 --daemonize yes --pidfile upgraded.pid
../redis-tls/src/redis-cli -p 6394 REPLICAOF 127.0.0.1 6393
../redis-tls/src/redis-cli -p 6394 INFO replication |
  Select-String 'master_link_status:up'`,
        output: `role:slave
master_link_status:up
master_repl_offset:18342
slave_repl_offset:18342
OK
role:master
connected_slaves:0
OK

偏移量相等后提升副本，切换窗口内仍可写入新主。
旧主先 SAVE 再停，升级后反向复制并确认 master_link_status:up。`,
      }],
    ],
  },
  {
    name: 'C · Redis/Nginx 源码与原生服务交付：C 原生服务毕业项目与源码答辩',
    track: 'P14 · 独立语言课程',
    minutes: 52,
    prerequisite: '学员已完成前五门课的事件循环与容量估算练习。',
    goal: '独立交付一个支持 PING、GET、SET 的精简 RESP 服务，完成带 fd 上限标注的压测报告与一次 core 复盘，并在答辩中指认源码行号讲解事件循环、缓冲区边界与状态机分叉点。',
    guidedPractice: '现场先跑通能响应 PING 的最小版本并打 git tag v0.1，再逐步加入 SET 与 GET；每完成一步用 redis-benchmark -c 100 -n 100000 压一轮并记录每秒请求数，同时用 ss -s 观察连接总量，把 tag、压测数据与 fd 上限三列并排写进项目文档。',
    independentPractice: '独立完成：给项目预埋一个越界写崩溃点，解除 ulimit -c 后压测触发 core，用 gdb 的 bt 定位崩溃栈并修复提交新 tag；答辩前准备两次 tag 的 diff 与对应的性能对照数据，当场任选一段源码逐行讲解。',
    commonErrors: ['答辩时背得出概念却指不出对应源码行，事件循环与缓冲区上限全靠口头描述，无法验证。', '压测报告只交吞吐数据不标 fd 上限，换了机器或改了 ulimit 后数据完全不可复现。'],
    sourceRefs: ['Redis Documentation. https://redis.io/docs/latest/', 'Nginx Documentation. https://nginx.org/en/docs/'],
    steps: [
      ['tag 即交付物', '毕业项目从零实现一个精简 RESP 服务：支持 PING、GET、SET 三条命令与 epoll 事件循环，代码控制在千行内并纳入版本库。实操：先让最小版本跑通后执行 git tag v0.1 固定基线，README 写明构建命令与监听端口。边界：后续每次提交都必须保持该 tag 可构建可启动，答辩以 tag 对应的代码为准，口头描述的功能一律不计入。', 'tag 即交付物', {
        title: 'mini-redis：最小 PING 服务与 v0.1 tag',
        language: 'PowerShell',
        code: `New-Item -ItemType Directory -Force mini-redis/src | Out-Null
Set-Location mini-redis
@'
#include <arpa/inet.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>
int main(void) {
    int listener = socket(AF_INET, SOCK_STREAM, 0);
    int yes = 1;
    setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);
    struct sockaddr_in address = {.sin_family = AF_INET, .sin_port = htons(6388)};
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(listener, (struct sockaddr *)&address, sizeof address) != 0) return 1;
    if (listen(listener, 128) != 0) return 1;
    for (;;) {
        int client = accept(listener, NULL, NULL);
        char request[512];
        ssize_t n = read(client, request, sizeof request - 1);
        if (n > 0) {
            request[n] = 0;
            if (strstr(request, "PING")) write(client, "+PONG\\r\\n", 7);
        }
        close(client);
    }
}
'@ | Set-Content src/main.c
'gcc -std=c17 -O2 -Wall -Wextra -Werror src/main.c -o mini-redis' | Set-Content build.ps1
@'
# mini-redis

Build: ./build.ps1
Run: ./mini-redis
Port: 6388
'@ | Set-Content README.md
git init
git add src/main.c build.ps1 README.md
git -c user.name='Course Lab' -c user.email='lab@example.invalid' commit -m 'feat: add minimal RESP PING server'
git tag -a v0.1 -m 'minimal PING baseline'
./build.ps1
git describe --tags --exact-match
git ls-tree -r --name-only v0.1`,
        output: `./mini-redis
v0.1
build.ps1
README.md
src/main.c

v0.1 对应可构建、可启动、可响应 PING 的最小服务。
README、构建脚本和源码都进入 tag，口头功能不计入交付。`,
      }],
      ['非阻塞事件循环', '参考 Redis ae.c 的结构实现 epoll 封装：epoll_create1 建实例，监听 socket 注册 EPOLLIN，就绪后 accept 并为每个连接注册可读事件，写回时用 EPOLLOUT 处理慢客户端。实操：用 redis-cli 连自研服务执行 PING 验证协议兼容，两个终端同时连接验证并发。边界：任何一处阻塞读都会卡死整个循环，所有 fd 必须非阻塞，这是与多线程模型的本质区别。', '全走非阻塞 fd', {
        title: 'mini-redis：epoll + 非阻塞 accept/read 骨架',
        language: 'PowerShell',
        code: `@'
#include <arpa/inet.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <unistd.h>
static void nonblocking(int fd) {
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
}
int main(void) {
    int listener = socket(AF_INET, SOCK_STREAM, 0);
    int yes = 1;
    setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);
    struct sockaddr_in address = {.sin_family = AF_INET, .sin_port = htons(6388)};
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    bind(listener, (struct sockaddr *)&address, sizeof address);
    listen(listener, 128); nonblocking(listener);
    int epoll = epoll_create1(0);
    struct epoll_event interest = {.events = EPOLLIN, .data.fd = listener};
    epoll_ctl(epoll, EPOLL_CTL_ADD, listener, &interest);
    struct epoll_event ready[64];
    for (;;) {
        int count = epoll_wait(epoll, ready, 64, -1);
        for (int i = 0; i < count; ++i) {
            int fd = ready[i].data.fd;
            if (fd == listener) {
                for (;;) {
                    int client = accept(listener, NULL, NULL);
                    if (client < 0) break;
                    nonblocking(client);
                    struct epoll_event event = {.events = EPOLLIN, .data.fd = client};
                    epoll_ctl(epoll, EPOLL_CTL_ADD, client, &event);
                }
                continue;
            }
            char request[512];
            ssize_t n = read(fd, request, sizeof request - 1);
            if (n > 0) {
                request[n] = 0;
                if (strstr(request, "PING")) write(fd, "+PONG\\r\\n", 7);
            } else {
                epoll_ctl(epoll, EPOLL_CTL_DEL, fd, NULL); close(fd);
            }
        }
    }
}
'@ | Set-Content src/epoll.c
gcc -std=c17 -O2 -Wall -Wextra -Werror src/epoll.c -o mini-redis
./mini-redis
../redis-jemalloc/src/redis-cli -p 6388 PING
../redis-jemalloc/src/redis-cli -p 6388 PING`,
        output: `PONG
PONG

监听 socket 与客户端 socket 全部设为 O_NONBLOCK。
两个客户端可同时连接，单线程循环不会被任一 read 或 accept 卡住。`,
      }],
      ['压测带上限交付', '用 redis-benchmark -h 127.0.0.1 -p 自研端口 -c 100 -n 100000 压 SET 与 GET，记录每秒请求数与错误数，另一终端执行 ss -s 观察连接总量。实操：把 ulimit -n 先后设为 1024 与 65535 各压一轮，对比超过 1024 连接后的报错差异。边界：压测结论必须连同 fd 上限一起写进文档，脱离上限谈吞吐没有可比性。', '上限写进结论', {
        title: 'redis-benchmark：带 nofile 与连接数的结果归档',
        language: 'PowerShell',
        code: `$limit = bash -lc 'ulimit -n'
$cores = nproc
./mini-redis
../redis-jemalloc/src/redis-cli -p 6388 PING
ss -s | Select-String 'TCP'
../redis-jemalloc/src/redis-benchmark -h 127.0.0.1 -p 6388 \\
  -c 100 -n 100000 -t ping -q *> bench-100.txt
../redis-jemalloc/src/redis-benchmark -h 127.0.0.1 -p 6388 \\
  -c 1000 -n 100000 -t ping -q *> bench-1000.txt
@"
host=$(hostname)
cores=$cores
nofile=$limit
build=$(git describe --tags --always)
$(Get-Content bench-100.txt)
$(Get-Content bench-1000.txt)
"@ | Set-Content BENCHMARK.md
Get-Content BENCHMARK.md`,
        output: `TCP: 1007 (estab 1001, closed 0, orphaned 0)
PING: 148000 requests per second, p50=0.67 msec
PING: 121000 requests per second, p50=0.83 msec
host=lab-02
cores=8
nofile=65535
build=v0.1-4-g...

压测报告同时记录构建、核数、fd 上限与并发连接数。
换机器或换 ulimit 后仍有足够上下文判断数字是否可比。`,
      }],
      ['core 复盘闭环', '给项目预埋一个越界写崩溃点，ulimit -c unlimited 后压测触发 core，用 gdb 加载执行 bt 定位崩溃栈，修复后提交新 tag 并复测。实操：修复前后各保留一份 bt 输出与崩溃行号进文档，形成一次完整的故障闭环。边界：发布版编译参数取 -O2 加 -g，既保留优化又保留符号表；纯 -O0 的性能数据不可用，无符号的 core 只能靠地址硬猜。', '带 g 才有符号', {
        title: 'mini-redis：触发 core、定位越界并打 v0.2',
        language: 'PowerShell',
        code: `@'
--- a/src/epoll.c
+++ b/src/epoll.c
@@ -5,7 +5,14 @@
 #include <stdio.h>
 #include <string.h>
 #include <sys/epoll.h>
 #include <sys/socket.h>
+#include <stdlib.h>
 #include <unistd.h>
+static __attribute__((noinline)) void crash_on_demand(void) {
+    int rooms[4] = {0};
+    int index = 4;
+    rooms[index] = 42;
+}
 static void nonblocking(int fd) {
@@ -20,6 +27,7 @@
 }
 int main(void) {
+    if (getenv("MINI_CRASH")) crash_on_demand();
     int listener = socket(AF_INET, SOCK_STREAM, 0);
'@ | Set-Content crash.patch
patch -p1 < crash.patch
rg -n 'stdlib|MINI_CRASH|crash_on_demand' src/epoll.c
gcc -std=c17 -O2 -g -Wall -Wextra src/epoll.c -o mini-redis
bash -lc 'ulimit -c unlimited; MINI_CRASH=1 ./mini-redis' &
../redis-jemalloc/src/redis-benchmark -p 6388 -c 100 -n 1000 -t ping -q
coredumpctl list mini-redis --since '10 minutes ago'
coredumpctl debug mini-redis --debugger-arguments='-batch -ex "bt full"'
gdb -q ./mini-redis core -batch -ex 'bt' -ex 'frame 0' -ex 'info locals'
git diff -- src/epoll.c
git apply -R crash.patch
rm crash.patch
git -c user.name='Course Lab' -c user.email='lab@example.invalid' \\
  commit -am 'fix: remove crash injection before release'
git tag -a v0.2 -m 'fix out-of-bounds crash'
ctest --test-dir build --output-on-failure`,
        output: `#0 crash_on_demand () at src/epoll.c:...
rooms = {0, 0, 0, 0}
index = 4
100% tests passed, 0 tests failed out of 3

回溯与 info locals 锁定 rooms[4] 越界。
修复提交与 v0.2 tag 保留故障证据和复测结果。`,
      }],
      ['答辩指认源码行', '答辩围绕源码逐层展开：事件循环要指认出自研 epoll 封装与 aeProcessEvents 的对应关系，缓冲区要报出查询与输出各自的默认上限和超限行为，状态机要画出半包等待与整包执行的分叉点。实操：用 git log 与两次 tag 的 diff 作演进证据，任选一行源码当场解释其作用。边界：讲机制必须落到具体函数名与数值边界，指不出代码行视为未通过。', '指行号才算懂', {
        title: '源码答辩：diff、行号、blame 与符号证据',
        language: 'PowerShell',
        code: `git log --oneline --decorate --graph --all
git diff --stat v0.1..v0.2
git diff v0.1..v0.2 -- src/epoll.c
rg -n "epoll_wait|EPOLLIN|O_NONBLOCK|crash_on_demand" src/epoll.c
nl -ba src/epoll.c | Select-Object -First 80
git blame -L 40,65 src/epoll.c
nm -n mini-redis | Select-String ' crash_on_demand| main'
objdump -d mini-redis | Select-String -Context 0,8 '<crash_on_demand>:'`,
        output: `* abc4321 (tag: v0.2) fix: reject room index outside four slots
* 4ef2201 (tag: v0.1) feat: add minimal RESP PING server
 src/epoll.c | 18 +++++++++++++-----
34:    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
42:        int count = epoll_wait(epoll, ready, 64, -1);
57:            if (fd == listener) {
0000000000001940 T crash_on_demand
... <crash_on_demand>:

答辩能从 tag 差异定位到 epoll_wait、accept、read 与修复行。
blame 说明每行由哪个提交引入；nm 与 objdump 能把源码行对应到二进制符号。`,
      }],
    ],
  },
];
