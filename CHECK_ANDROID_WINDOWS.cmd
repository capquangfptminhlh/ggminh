@echo off
setlocal
title LHM Android - Windows AVD Acceptance
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 22 or later is missing from PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 2
)
if not exist "tools\android-local-acceptance.js" (
  echo [ERROR] Missing tools\android-local-acceptance.js. Run from the full ggminh source checkout.
  pause
  exit /b 3
)

echo LHM Android Windows acceptance - operator controlled
echo This uses a CLEAN test AVD only. Never select an AVD with personal accounts.
echo Android SDK / Emulator must already be installed. No downloads or APK installs occur.
echo.
node "tools\android-local-acceptance.js"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [FAIL] Android acceptance did not pass. Exit code: %EXIT_CODE%
) else (
  echo [COMPLETE] Review the result above. Synthetic CI PASS is not real-device proof.
)
pause
exit /b %EXIT_CODE%
