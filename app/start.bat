@echo off
REM اجرای یکپارچه دستیار عیب‌یابی و گزارش 8D (ویندوز - وب‌درایور Google Chrome)
setlocal
chcp 65001 >nul
cd /d "%~dp0\.."

where python >nul 2>nul
if not errorlevel 1 (
  python run.py
  goto :eof
)

where py >nul 2>nul
if not errorlevel 1 (
  py run.py
  goto :eof
)

echo [!] پایتون یافت نشد. اجرای مستقیم سرور Node.js...
cd /d "%~dp0"
if not exist node_modules (
  call npm install
)

start http://localhost:3000
npm start
