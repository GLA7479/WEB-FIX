@echo off
setlocal ENABLEDELAYEDEXPANSION
title Apply Git Patch (auto-root + verbose)
cd /d "%~dp0"
for /f "delims=" %%R in ('git rev-parse --show-toplevel 2^>NUL') do set "REPOROOT=%%R"
if not defined REPOROOT (
  echo [ERROR] לא נמצא שורש רפו (git rev-parse --show-toplevel).
  echo הפעל אותי מתוך פרויקט שמנוהל ב-Git.
  pause
  exit /b 1
)
cd /d "%REPOROOT%"

set "LOG=.patch-kit\last-apply.log"
mkdir ".patch-kit" >NUL 2>&1
echo ===== %date% %time% ===== > "%LOG%"

set "PATCH=%~1"
if not exist "%PATCH%" (
  echo אפשר לגרור לפה קובץ diff ^/ patch או להדביק נתיב. Enter ריק = נחפש ב .\git\patches\
  set /p "PATCH=נתיב לקובץ patch: "
)
if "%PATCH%"=="" (
  for /f "delims=" %%F in ('dir /b /o-d "git\patches\*.diff" 2^>NUL') do set "PATCH=git\patches\%%F"
  if not defined PATCH for /f "delims=" %%F in ('dir /b /o-d "git\patches\*.patch" 2^>NUL') do set "PATCH=git\patches\%%F"
)

if not exist "%PATCH%" (
  echo [ERROR] לא נמצא קובץ patch: "%PATCH%"
  pause
  exit /b 1
)

echo [INFO] Patch file: "%PATCH%"
git apply --check "%PATCH%" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] --check נכשל. תוכן הלוג:
  type "%LOG%"
  pause
  exit /b 1
)

for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set "D=%%d-%%b-%%c"
for /f "tokens=1-2 delims=:." %%a in ("%time%") do set "T=%%a-%%b"
set "T=!T: =0!"
set "SAFE_TAG=pre-patch-!D!-!T!"
git tag "!SAFE_TAG!" >> "%LOG%" 2>&1
echo "!SAFE_TAG!" > ".patch-kit\last-tag.txt"
echo "%PATCH%" > ".patch-kit\last-patch.txt"

git apply --whitespace=fix "%PATCH%" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] git apply נכשל. ראה לוג:
  type "%LOG%"
  pause
  exit /b 1
)

echo ✅ ה-Patch הוחל בהצלחה.
pause
exit /b 0