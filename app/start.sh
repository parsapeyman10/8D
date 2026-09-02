#!/usr/bin/env bash
# اجرای دستیار عیب‌یابی — لینوکس / مک
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Node.js نصب نیست. از https://nodejs.org نسخه LTS را نصب کنید."
  exit 1
fi
[ -d node_modules ] || { echo "در حال نصب وابستگی‌ها..."; npm install; }
echo "اپ روی http://localhost:3000 بالا می‌آید..."
npm start
