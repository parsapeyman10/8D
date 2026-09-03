@echo off
REM اجرای دستیار عیب‌یابی و گزارش 8D (ویندوز - اجرای مستقیم در Google Chrome)
setlocal
set SE_OFFLINE=true
set LLM_PROVIDER=gemini
set GEMINI_MODEL=gemini-1.5-flash
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js نصب نیست. لطفا از https://nodejs.org نسخه LTS را نصب کنید.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [*] در حال نصب وابستگی‌های Node.js...
  call npm install
)

echo [*] در حال باز کردن برنامه در مرورگر Google Chrome...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" http://localhost:3000
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" http://localhost:3000
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" http://localhost:3000
) else (
  start http://localhost:3000
)

npm start
