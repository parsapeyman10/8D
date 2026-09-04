@echo off
REM اجرای دستیار عیب‌یابی — ویندوز
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js نصب نیست. از https://nodejs.org نسخه LTS را نصب کنید.
  pause
  exit /b 1
)
if not exist node_modules (
  echo در حال نصب وابستگی‌ها...
  call npm install
)
echo اپ روی http://localhost:3000 بالا می‌آید...
start http://localhost:3000
npm start
