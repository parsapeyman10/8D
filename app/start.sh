#!/usr/bin/env bash
# اجرای یکپارچه دستیار عیب‌یابی و گزارش 8D
cd "$(dirname "$0")/.."

if command -v python3 >/dev/null 2>&1; then
  python3 run.py
elif command -v python >/dev/null 2>&1; then
  python run.py
else
  cd app
  [ -d node_modules ] || npm install
  npm start
fi
