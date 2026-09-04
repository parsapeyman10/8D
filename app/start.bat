@echo off
REM اجرای دستیار عیب‌یابی و گزارش 8D با Google Gemini 1.5 Flash (ویندوز)
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
  echo [*] در حال نصب وابستگی‌ها...
  call npm install
)

echo [*] در حال اجرای برنامه با مدل Google Gemini (gemini-1.5-flash)...
start http://localhost:3000
npm start
