@echo off
setlocal

where docker >nul 2>nul
if errorlevel 1 (
  echo [yan-zhi] 未找到 Docker。请安装并启动 Docker Desktop 后重试。
  exit /b 1
)

docker version >nul 2>nul
if errorlevel 1 (
  echo [yan-zhi] Docker 未运行。请先启动 Docker Desktop。
  exit /b 1
)

if not exist "%CD%\dist-release\server" mkdir "%CD%\dist-release\server"

echo [yan-zhi] 构建 Linux 打包环境...
docker build --progress=plain -f scripts\server-linux.Dockerfile -t yanzhi-server-linux-builder .
if errorlevel 1 exit /b 1

echo [yan-zhi] 生成 Linux 后端 + Web 发布包...
docker run --rm -v "%CD%\dist-release\server:/out" yanzhi-server-linux-builder node scripts/package-server-linux.cjs --out=/out --stage-dir=/tmp/yan-zhi-server-stage %*
if errorlevel 1 exit /b 1

echo.
echo [yan-zhi] 完成：dist-release\server
endlocal
