@echo off
setlocal

cd /d "%~dp0"

if not exist "%~dp0package.json" (
  echo [ERROR] package.json not found in "%~dp0"
  pause
  exit /b 1
)

if not exist "%~dp0start-dev.cmd" (
  echo [ERROR] start-dev.cmd not found in "%~dp0"
  pause
  exit /b 1
)

call "%~dp0start-dev.cmd"
