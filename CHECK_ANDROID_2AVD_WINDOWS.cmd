@echo off
setlocal
title LHM Android - Two AVD Sequential Stability Test
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 22+ is required.
  pause
  exit /b 2
)
if not exist "tools\android-two-avd-stability.js" (
  echo [ERROR] Run from a complete ggminh source checkout.
  pause
  exit /b 3
)

echo LHM Android: two clean AVDs tested one after another.
echo IMPORTANT: This is NOT a concurrent multi-device stress test.
echo Each AVD must contain NO personal or customer accounts.
echo SDK Platform-Tools, Emulator and Chrome must already be installed.
echo.
node "tools\android-two-avd-stability.js"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [FAIL] Two-AVD stability acceptance did not pass.
) else (
  echo [COMPLETE] See local observations above.
  echo Concurrent multi-device performance is still NOT verified.
)
pause
exit /b %EXIT_CODE%
