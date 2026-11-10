; NSIS 自定义安装脚本
; 参考：https://www.electron.build/nsis
;
; electron-builder 默认设置 ShowInstDetails nevershow，并在安装阶段执行
; SetDetailsPrint none，用户只能看到进度条移动，不知道当前在做什么。
; 这里重新打开详情面板，展示安装阶段说明，并直接更新安装页的状态行；
; 进度条仍由 NSIS 按 SectionSetSize 和实际解压进度驱动。

!include "WinMessages.nsh"

!macro customHeader
  ShowInstDetails show
  InstProgressFlags smooth
!macroend

!ifndef BUILD_UNINSTALLER
  ; 详情区只显示日志，不抢顶部状态行。安装区开始后 electron-builder 会再次
  ; 执行 SetDetailsPrint none，因此每次更新阶段时都要重新打开列表输出。
  Function yzWriteInstallOverview
    SetDetailsPrint listonly
    DetailPrint "言智安装进度"
    DetailPrint "安装位置：$INSTDIR"
    DetailPrint "----------------------------------------"
    DetailPrint "[1/4] 准备安装环境"
    DetailPrint "       检查安装目录、旧版本和正在运行的程序。"
    DetailPrint "[2/4] 解压应用文件"
    DetailPrint "       释放主程序、运行环境和应用资源；本阶段耗时最长。"
    DetailPrint "[3/4] 创建快捷方式"
    DetailPrint "       创建开始菜单、桌面快捷方式并写入卸载信息。"
    DetailPrint "[4/4] 完成安装"
    DetailPrint "       完成最后设置并检查安装结果。"
    DetailPrint "----------------------------------------"
  FunctionEnd

  Function yzInstallPageShow
    Call yzWriteInstallOverview
    Push "[1/4] 正在检查安装环境，请稍候..."
    Call yzSetInstallStatus
  FunctionEnd

  Function yzSetInstallStatus
    Exch $0
    Push $1
    SetDetailsPrint listonly
    DetailPrint "$0"
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
    Push "[3/4] 应用文件已解压，正在创建快捷方式并写入安装信息..."
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
    Push "[4/4] 正在完成最后设置并检查安装结果..."
    Call yzSetInstallStatus
  !macroend
!endif
