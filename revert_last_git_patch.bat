@echo off
setlocal ENABLEDELAYEDEXPANSION
title Revert Last Git Patch
cd /d "%~dp0"
for /f "delims=" %%R in ('git rev-parse --show-toplevel 2^>NUL') do set "REPOROOT=%%R"
if not defined REPOROOT (
  echo [ERROR] לא נמצא שורש רפו.
  pause
  exit /b 1
)
cd /d "%REPOROOT%"

set "PATCH_FILE="
set "TAG_NAME="
if exist ".patch-kit\last-patch.txt" set /p PATCH_FILE=<".patch-kit\last-patch.txt"
if exist ".patch-kit\last-tag.txt" set /p TAG_NAME=<".patch-kit\last-tag.txt"

if defined PATCH_FILE if exist "%PATCH_FILE%" (
  echo מנסה git apply -R "%PATCH_FILE%"
  git apply -R "%PATCH_FILE%"
  if not errorlevel 1 (
    echo ✅ בוטל ה-Patch באמצעות git apply -R.
    pause
    exit /b 0
  )
)

if defined TAG_NAME (
  echo מנסה git reset --hard "%TAG_NAME%"
  git reset --hard "%TAG_NAME%"
  if errorlevel 1 (
    echo [ERROR] reset ל-tag נכשל.
    pause
    exit /b 1
  )
  echo ✅ חזרנו לתג "%TAG_NAME%".
  pause
  exit /b 0
)

echo [ERROR] אין מידע מספיק לביטול אוטומטי.
pause
exit /b 1