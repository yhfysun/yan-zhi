# 封面制作配方（合集封面 + 每集视频封面，2026-10-12 补）

> 核心结论：**生图模型画中文字必糊**（伪字/缺笔画/乱码）→ 两段式：api_image_generate 出无字底图 → ffmpeg drawtext 烧字。
> 复用成片管线（compose_video.py）同款约束：本机 ffmpeg 是 2019 老版，中文字体必须 fontfile='C\:/Windows/Fonts/msyh.ttc'，中文书名号用『』。

## 一、规格（平台硬性要求）
| 封面 | 尺寸 | 格式/大小 | 上传入口 |
|---|---|---|---|
| 合集封面 | 1:1 1080×1080 | JPG ≤5MB（5242880 字节；PNG 禁传） | 合集管理「自定义创建合集」；发布页「添加到合集→创建新合集」 |
| 每集视频封面 | 9:16 1080×1920（4:3 成片则 1080×1440） | JPG/PNG 均可 | 发布页「选封面/编辑封面」本地上传 |

## 二、出图 prompt 模板（只出无字底图）
变量：{题材氛围} {核心意象} {色调} {别名}

合集封面底图（一本书一张，系列总封面）：
「{题材}风格小说合集封面背景，{核心意象，如：夜色中的古井与一只旧怀表}，电影感构图，画面中下部大面积留白，暗调低饱和，{墨蓝+暖金}，细腻光影，高品质，无文字、无字母、无水印、无边框、无签名」
size 传 1024x1024。

每集封面底图（一集一张，意象从本集钩子/scene 提炼一个具体物）：
「{题材}风格竖构图小说封面背景，{本集核心意象}，主体占画面上 2/3，下 1/3 干净留白，电影感光线，{色调}，高品质，无文字、无字母、无水印、无边框、无签名」
size 传 1024x1536。

要点：
- 负向词（无文字/字母/水印/签名）必须写——不写模型默认自己加英文水印；
- 系列各集用同一母版 prompt（只换意象）→ 进合集才有系列感；
- 返回是临时直链：拿到 url 立刻 api_media_fetch { url, kind: image, category: source } 落盘再烧字，链接过期补不回；
- 生图工具报错（上游 key 不可用等）→ 直接走第五节兜底，禁止反复重试。

## 三、烧字命令（老版 ffmpeg 实测口径）
底图落盘后（00-source/cover_bg.png）：

合集封面（1080×1080，JPG ≤5MB）：
ffmpeg -y -i 00-source/cover_bg.png -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':text='{合集名≤20字，优先别名}':fontsize=92:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-50,drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':text='搜『{别名}』看全文｜番茄小说':fontsize=38:fontcolor=white:borderw=2:bordercolor=black@0.85:x=(w-text_w)/2:y=(h-text_h)/2+60" -frames:v 1 -q:v 3 output/cover_合集.jpg

每集封面（9:16 1080×1920，三行）：
ffmpeg -y -i 00-source/ep_bg.png -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':text='第{N}集':fontsize=110:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.58,drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':text='{钩子短句≤12字}':fontsize=60:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.68,drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':text='搜『{别名}』看全文｜番茄小说':fontsize=34:fontcolor=white:borderw=2:bordercolor=black@0.85:x=(w-text_w)/2:y=h*0.78" -frames:v 1 -q:v 3 output/cover_第{N}集.jpg

老版 ffmpeg 转义铁律（与 compose_video.py 的 esc_drawtext 同款）：
- 文本里出现 \ : ' % , [ ] 必须转义成 \\ \: \' \% \, \[ \]；
- 中文书名号用『』——「」在老版 drawtext 里渲染成窄引号；
- 不要 text_align / line_spacing（2019 版报 Option not found）；多行=多个 drawtext 各自算 y；
- 冒号/逗号在 filter 串里是分隔符，text 内的都要转义；单引号包字体路径别漏。

## 四、大小与画质核验（传前必做）
- ls -l output/cover_*.jpg 看字节数 ≤5242880；超了把 -q:v 提到 5-8，仍超就确认 scale 到 1080 宽重出；
- Read 打开成品图核验：文字无乱码、无超框、底图无英文水印残留、无原书名。

## 五、兜底（生图不可用/超时 → 直接走，别干等）
- 每集封面（抽帧，第 2 秒正好「第N集」大字）：
ffmpeg -ss 2 -i output/<别名>_第N集.mp4 -frames:v 1 -vf scale=1080:1920 -q:v 3 output/cover_第N集.jpg
- 合集封面（深色底 + 烧字）：
ffmpeg -f lavfi -i color=c=0x101828:s=1080x1080 -vf "drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':text='{合集名}':fontsize=92:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-50,drawtext=fontfile='C\:/Windows/Fonts/msyh.ttc':text='搜『{别名}』看全文｜番茄小说':fontsize=38:fontcolor=white:borderw=2:bordercolor=black@0.85:x=(w-text_w)/2:y=(h-text_h)/2+60" -frames:v 1 -q:v 3 output/cover_合集.jpg

## 六、书名红线
封面文字（合集名/引导语/钩子句）禁原书名，只烧别名；底图 prompt 的负向词已兜底「无文字」，若底图仍带字样，换 prompt 重出或换兜底方案。