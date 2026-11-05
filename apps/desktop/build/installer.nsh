; NSIS 自定义安装脚本
; 参考：https://www.electron.build/nsis
;
; electron-builder 默认设置 ShowInstDetails nevershow，并在安装阶段执行
; SetDetailsPrint none，用户只能看到进度条移动，不知道当前在做什么。
; 这里重新打开详情面板，并直接更新安装页的状态行；进度条仍由 NSIS 按
; SectionSetSize 和实际解压进度驱动。

!include "WinMessages.nsh"

!macro customHeader
  ShowInstDetails show
  InstProgressFlags smooth
!macroend

!ifndef BUILD_UNINSTALLER
  ; 安装页显示时设置初始阶段。直接操作状态控件，避免被 electron-builder
  ; 安装模板随后执行的 SetDetailsPrint none 再次关闭。
  Function yzInstallPageShow
    Push "正在准备安装并解压应用文件，请稍候..."
    Call yzSetInstallStatus
  FunctionEnd

  Function yzSetInstallStatus
    Exch $0
    Push $1
    FindWindow $1 "#32770" "" $HWNDPARENT
    GetDlgItem $1 $1 1006
    SendMessage $1 ${WM_SETTEXT} 0 "STR:$0"
    Pop $1
    Pop $0
  FunctionEnd

  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW yzInstallPageShow
  !macroend

  ; 应用文件解压是整个安装中最耗时的阶段。解压完成后再告知用户剩余动作，
  ; 避免长时间只显示一句笼统的“正在安装”。
  !macro yzMarkFilesExtracted
    Push "应用文件已解压，正在创建快捷方式并完成安装..."
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
    Push "正在完成系统设置，请稍候..."
    Call yzSetInstallStatus
  !macroend
!endif
