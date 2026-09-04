# -*- coding: utf-8 -*-
"""
اسکریپت تست و اعتبارسنجی قطعی لاگین در DeepSeek
===================================================
این اسکریپت پنجره کروم را باز کرده و با ایمیل و رمز عبور شما لاگین را بررسی و تایید می‌کند.
"""

import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "bridge"))

from deepseek_web_bridge import get_driver, ensure_logged_in_strict, check_if_logged_in, DEEPSEEK_EMAIL

def main():
    print("=" * 70)
    print("  🔑 تست و احراز هویت لاگین در DeepSeek")
    print(f"  📧 ایمیل: {DEEPSEEK_EMAIL}")
    print("=" * 70)

    try:
        driver = get_driver()
        is_ok = ensure_logged_in_strict(driver, max_wait_seconds=60)
        if is_ok:
            print("\n✅ نتیجه: لاگین با موفقیت انجام شد و ۱۰۰٪ تایید گردید!")
        else:
            print("\n❌ نتیجه: لاگین هنوز تایید نشده است. لطفاً پنجره کروم را بررسی فرمایید.")
    except Exception as e:
        print(f"\n❌ خطا در اجرای تست لاگین: {e}")

if __name__ == "__main__":
    main()
