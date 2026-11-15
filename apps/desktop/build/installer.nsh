; NSIS 自定义安装脚本
; 参考：https://www.electron.build/nsis
;
; 2026-11-15 改造（对标 TRAE CN）：electron-builder 默认隐藏安装详情，旧实现靠
; 打开详情面板 + 四阶段中文日志来补偿，结果是一整块滚动文字和步骤编号。
; 现在改为极简：隐藏详情列表，只保留顶部单行「当前动作」+ 平滑进度条，
; 并给系统进度条上品牌绿。静默安装(/S) 下所有 UI 操作一律跳过。

!include "WinMessages.nsh"

!macro customHeader
  ShowInstDetails nevershow
  InstProgressFlags smooth
  ; 底部默认显示 "yan-zhi <版本>"，对标 TRAE 的极简直接留空（空格占位防布局塌陷）
  BrandingText " "
!macroend

!ifndef BUILD_UNINSTALLER
  ; 升级安装前强制结束言智主进程与它拉起的后端进程。
  ; 后端可能继承 detached 模式继续占用 3001；只覆盖安装而不结束它，新版前端会接到旧后端。
  !macro customCheckAppRunning
    nsExec::ExecToLog 'taskkill /F /T /IM "yan-zhi.exe"'
    Sleep 1200
  !macroend

  ; 顶部状态行（控件 1006）是安装页唯一的动态文字位：一句当前动作，不带步骤编号。
  ; Exch/Pop 必须在 IfSilent 之外，保证调用方 Push 的参数在任何分支都被消耗掉。
  Function yzSetInstallStatus
    Exch $0
    IfSilent yzStatusDone
    Push $1
    FindWindow $1 "#32770" "" $HWNDPARENT
    GetDlgItem $1 $1 1006
    SendMessage $1 ${WM_SETTEXT} 0 "STR:$0"
    Pop $1
    yzStatusDone:
    Pop $0
  FunctionEnd

  Function yzInstallPageShow
    Push $1
    Push $2
    IfSilent yzInstallPageDone
    ; header 标题/副标题（控件 1037/1038 在外层窗口）改成中文产品名，
    ; 覆盖 electron-builder 默认的 "yan-zhi 正在安装，请稍候。"
    GetDlgItem $1 $HWNDPARENT 1037
    SendMessage $1 ${WM_SETTEXT} 0 "STR:正在安装"
    GetDlgItem $1 $HWNDPARENT 1038
    SendMessage $1 ${WM_SETTEXT} 0 "STR:言智 正在安装到您的电脑中，请稍等。"
    ; 安装进行中隐藏 上一步/下一步（保留取消），页面更接近单页进度
    GetDlgItem $1 $HWNDPARENT 3
    ShowWindow $1 0
    GetDlgItem $1 $HWNDPARENT 1
    ShowWindow $1 0
    ; 进度条（控件 1004）着色为品牌绿：COLORREF 是 0x00BBGGRR，#16a34a → 0x004AA316。
    ; 启用 comctl32 v6 视觉样式时该消息可能被忽略，此时退化为系统默认色，不影响安装本身。
    FindWindow $1 "#32770" "" $HWNDPARENT
    GetDlgItem $2 $1 1004
    SendMessage $2 ${PBM_SETBARCOLOR} 0 0x004AA316
    ; 安装页 SHOW 时已进入最耗时的文件释放阶段（约 500MB），直接给出当前动作
    Push "正在解压缩应用文件，请稍等…"
    Call yzSetInstallStatus
    yzInstallPageDone:
    Pop $2
    Pop $1
  FunctionEnd

  ; 离开安装页时显式恢复按钮 —— NSIS 不保证自己恢复，漏了会让完成页没有「完成」按钮
  Function yzInstFilesLeave
    IfSilent yzLeaveDone
    GetDlgItem $1 $HWNDPARENT 1
    ShowWindow $1 1
    GetDlgItem $1 $HWNDPARENT 3
    ShowWindow $1 1
    yzLeaveDone:
  FunctionEnd

  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW yzInstallPageShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE yzInstFilesLeave
  !macroend

  !macro yzMarkFilesExtracted
    Push "应用文件已解压，正在创建快捷方式…"
    Call yzSetInstallStatus
  !macroend

  !macro customFiles_x64
    !insertmacro yzMarkFilesExtracted
  !macroend

  !macro customFiles_arm64
    !insertmacro yzMarkFilesExtracted
  !macroend

  !macro customFiles_ia32
    !insertmacro yzMarkFilesExtracted
  !macroend

  !macro customInstall
    Push "正在完成最后设置…"
    Call yzSetInstallStatus
    ; 覆盖升级后让 Explorer 立即重读 exe / 快捷方式图标，避免任务栏继续显示旧图标。
    nsExec::ExecToLog 'ie4uinit.exe -show'
    nsExec::ExecToLog 'ie4uinit.exe -ClearIconCache'
  !macroend
!endif
