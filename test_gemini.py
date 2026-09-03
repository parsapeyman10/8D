# -*- coding: utf-8 -*-
"""
تست ارتباط زنده با Google Gemini API (gemini-1.5-flash)
======================================================
نحوه اجرا:
  python test_gemini.py

کلید API از متغیر محیطی GEMINI_API_KEY یا فایل تنظیمات خوانده می‌شود.
"""

import json
import os
import sys
import urllib.request
import urllib.error

API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash").strip()

# تلاش برای خواندن کلید از localStorage یا .env در صورت نبود متغیر محیطی
if not API_KEY and os.path.isfile(".env"):
    try:
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("GEMINI_API_KEY="):
                    API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass


def test_with_google_genai():
    """تست با پکیج رسمی google.generativeai در صورت نصب بودن"""
    try:
        import google.generativeai as genai
        print("📦 استفاده از کتابخانه google-generativeai...")
        genai.configure(api_key=API_KEY)
        model = genai.GenerativeModel(MODEL_NAME)
        response = model.generate_content("ارتباط برقرار است؟ لطفاً یک پاسخ تاییدیه کوتاه به فارسی بدهید.")
        print("\n✅ پاسخ دریافت شد از Google Gemini:")
        print("—" * 50)
        print(response.text.strip())
        print("—" * 50)
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"⚠️ خطای google-generativeai: {e}")
        return False


def test_with_direct_rest():
    """تست مستقیم با پروتکل REST بدون نیاز به هیچ پکیج جانبی"""
    print("🌐 استفاده از اتصال مستقیم REST API گوگل...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": "ارتباط برقرار است؟ لطفاً یک پاسخ تاییدیه کوتاه به فارسی بدهید."}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 150}
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            print("\n✅ پاسخ دریافت شد از Google Gemini (REST):")
            print("—" * 50)
            print(text.strip())
            print("—" * 50)
            return True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        print(f"\n❌ خطای Gemini API (کد {e.code}): {err_body}")
        return False
    except Exception as e:
        print(f"\n❌ خطای اتصال به سرور گوگل: {e}")
        return False


def main():
    global API_KEY
    print("=" * 60)
    print("  ⚡ تست ارتباط با هوش مصنوعی Google Gemini (gemini-1.5-flash)")
    print("=" * 60)

    if not API_KEY:
        print("⚠️ متغیر GEMINI_API_KEY یافت نشد.")
        key_input = input("لطفاً کلید Gemini API خود را وارد کنید (یا Enter برای خروج): ").strip()
        if key_input:
            API_KEY = key_input
        else:
            print("❌ کلید وارد نشد. خروج.")
            sys.exit(1)

    print(f"🔑 کلید: {API_KEY[:6]}...{API_KEY[-4:] if len(API_KEY) > 10 else ''}")
    print(f"🤖 مدل: {MODEL_NAME}")
    print("⏳ در حال ارسال پیام «ارتباط برقرار است؟» به سرور گوگل...")

    ok = test_with_google_genai()
    if not ok:
        ok = test_with_direct_rest()

    if ok:
        print("\n🎉 تست موفقیت‌آمیز بود! ارتباط با Google Gemini برقرار است.")
    else:
        print("\n💡 راهنما:")
        print("۱. برای دریافت کلید رایگان به Google AI Studio مراجعه کنید: https://aistudio.google.com/apikey")
        print("۲. می‌توانید کلید را در محیط سیستم تنظیم کنید: export GEMINI_API_KEY=\"کلید_شما\"")
        print("   یا در ویندوز: set GEMINI_API_KEY=\"کلید_شما\"")
        print("۳. در اپلیکیشن وب نیز در پنجره ⚙️ تنظیمات می‌توانید کلید را ذخیره نمایید.")


if __name__ == "__main__":
    main()
