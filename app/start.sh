#!/usr/bin/env bash
# اجرای دستیار عیب‌یابی و گزارش 8D — لینوکس / مک (بدون نیاز به VPN)
cd "$(dirname "$0")"
export SE_OFFLINE=true
export LLM_PROVIDER=offline

if ! command -v node >/dev/null; then
  echo "[!] Node.js نصب نیست. از https://nodejs.org نسخه LTS را نصب کنید."
  exit 1
fi

[ -d node_modules ] || { echo "[*] در حال نصب وابستگی‌ها..."; npm install; }
echo "[*] در حال اجرای برنامه روی http://localhost:3000 با موتور هوش مصنوعی آفلاین..."
npm start
