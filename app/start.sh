#!/usr/bin/env bash
# اجرای دستیار عیب‌یابی و گزارش 8D با Google Gemini 1.5 Flash (لینوکس / مک)
cd "$(dirname "$0")"
export SE_OFFLINE=true
export LLM_PROVIDER=gemini
export GEMINI_MODEL=gemini-1.5-flash

if ! command -v node >/dev/null; then
  echo "[!] Node.js نصب نیست. از https://nodejs.org نسخه LTS را نصب کنید."
  exit 1
fi

[ -d node_modules ] || { echo "[*] در حال نصب وابستگی‌ها..."; npm install; }
echo "[*] در حال اجرای برنامه روی http://localhost:3000 با مدل Google Gemini (gemini-1.5-flash)..."
npm start
