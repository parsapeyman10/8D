# -*- coding: utf-8 -*-
"""
پل وب DeepSeek — بدون کلید API (Bridge)
======================================
این سرویس مرورگر را باز می‌کند، به chat.deepseek.com می‌رود،
سوال را ارسال می‌کند و پاسخ را به اپ تحویل می‌دهد.

آدرس برای اپ:  http://localhost:8765/v1
در اپ: ⚙️ تنظیمات مدل → 🌐 مرورگر کروم (پل سلنیومی)
"""

import json
import os
import shutil
import sys
import threading
import time
import uuid

from flask import Flask, jsonify, request
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
PORT = int(os.environ.get("BRIDGE_PORT", "8765"))
CHAT_URL = "https://chat.deepseek.com/"
PROFILE_DIR = os.path.join(os.path.expanduser("~"), ".deepseek_web_profile")
ANSWER_TIMEOUT = int(os.environ.get("ANSWER_TIMEOUT", "300"))  # ثانیه

app = Flask(__name__)
_lock = threading.Lock()   # هم‌زمان فقط یک سوال
_driver = None


def find_local_driver():
    """جستجوی chromedriver یا msedgedriver در مسیرهای محلی پروژه و سیستم"""
    env_path = os.environ.get("CHROMEDRIVER_PATH")
    if env_path and os.path.isfile(env_path):
        return ("chrome", env_path)

    # پسوندهای احتمالی
    names_chrome = ["chromedriver.exe", "chromedriver"] if os.name == "nt" else ["chromedriver"]
    names_edge = ["msedgedriver.exe", "msedgedriver"] if os.name == "nt" else ["msedgedriver"]

    # ۱. جستجو در پوشه bridge و ریشه پروژه
    search_dirs = [HERE, REPO_ROOT, os.getcwd()]
    for d in search_dirs:
        for name in names_chrome:
            p = os.path.join(d, name)
            if os.path.isfile(p):
                return ("chrome", p)
        for name in names_edge:
            p = os.path.join(d, name)
            if os.path.isfile(p):
                return ("edge", p)

    # ۲. جستجو در PATH سیستم
    for name in names_chrome:
        w = shutil.which(name)
        if w:
            return ("chrome", w)
    for name in names_edge:
        w = shutil.which(name)
        if w:
            return ("edge", w)

    return (None, None)


def print_driver_help():
    print("""
╔══════════════════════════════════════════════════════════════════════════════╗
║  ❌ خطای دسترسی به درایور مرورگر (ChromeDriver)                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  علت خطا:                                                                    ║
║  سلنیوم تلاش کرد درایور کروم را از سایت گوگل (googlechromelabs.github.io)    ║
║  دانلود کند، اما این آدرس در ایران به دلیل تحریم یا فیلترینگ در دسترس نیست.  ║
║                                                                              ║
║  راهکارهای رفع مشکل:                                                         ║
║                                                                              ║
║  🔹 راهکار ۱ (ساده‌ترین - با فیلترشکن):                                       ║
║     فیلترشکن (VPN) را روشن کنید و دوباره این اسکریپت را اجرا کنید.            ║
║     سلنیوم یک بار درایور را دانلود و ذخیره می‌کند و دفعات بعد نیازی نیست.    ║
║                                                                              ║
║  🔹 راهکار ۲ (دانلود دستی chromedriver.exe):                                 ║
║     ۱. در کروم به آدرس chrome://settings/help بروید و نسخه کروم را ببینید.   ║
║     ۲. فایل chromedriver.exe متناسب با نسخه خود را دانلود کنید:               ║
║        https://googlechromelabs.github.io/chrome-for-testing/                ║
║     ۳. فایل chromedriver.exe را داخل پوشه bridge قرار دهید.                  ║
║                                                                              ║
║  🔹 راهکار ۳ (پیشنهادی - بدون نیاز به کروم و پل):                            ║
║     در مرورگر به آدرس http://localhost:3000 بروید.                          ║
║     روی ⚙️ تنظیمات مدل کلیک کنید و یکی از ارائه‌دهنده‌های رایگان مانند:       ║
║     - Groq (مدل Llama 3.3 70B - فوق‌العاده سریع و رایگان)                   ║
║     - OpenRouter (مدل‌های رایگان DeepSeek)                                  ║
║     - AvalAI یا GapGPT (درگاه‌های ایرانی بدون تحریم)                        ║
║     را انتخاب کنید. این روش نیازی به اجرای این اسکریپت یا کروم ندارد!        ║
╚══════════════════════════════════════════════════════════════════════════════╝
""")


# ---------------------------------------------------------------- مرورگر
def get_driver():
    global _driver
    if _driver is not None:
        try:
            _driver.title  # زنده است؟
            return _driver
        except Exception:
            _driver = None

    driver_type, driver_path = find_local_driver()

    # ۱. اگر درایور محلی پیدا شد، مستقیماً از آن استفاده کن (بدون اتصال به سرور گوگل)
    if driver_path:
        print(f"🔧 استفاده از درایور محلی یافت‌شده: {driver_path}")
        try:
            if driver_type == "chrome":
                opts = webdriver.ChromeOptions()
                opts.add_argument(f"--user-data-dir={PROFILE_DIR}")
                opts.add_argument("--disable-blink-features=AutomationControlled")
                opts.add_experimental_option("excludeSwitches", ["enable-automation"])
                opts.add_argument("--start-maximized")
                service = ChromeService(executable_path=driver_path)
                _driver = webdriver.Chrome(service=service, options=opts)
            else:
                from selenium.webdriver.edge.service import Service as EdgeService
                opts = webdriver.EdgeOptions()
                opts.add_argument(f"--user-data-dir={PROFILE_DIR}_edge")
                opts.add_argument("--disable-blink-features=AutomationControlled")
                opts.add_experimental_option("excludeSwitches", ["enable-automation"])
                opts.add_argument("--start-maximized")
                service = EdgeService(executable_path=driver_path)
                _driver = webdriver.Edge(service=service, options=opts)

            _driver.get(CHAT_URL)
            print("🌐 مرورگر باز شد. اگر صفحه ورود می‌بینید، یک بار وارد شوید...")
            return _driver
        except Exception as e:
            print(f"⚠️ استفاده از درایور محلی با خطا مواجه شد: {e}")

    # ۲. تلاش عادی با Selenium Manager خودکار
    try:
        opts = webdriver.ChromeOptions()
        opts.add_argument(f"--user-data-dir={PROFILE_DIR}")
        opts.add_argument("--disable-blink-features=AutomationControlled")
        opts.add_experimental_option("excludeSwitches", ["enable-automation"])
        opts.add_argument("--start-maximized")
        _driver = webdriver.Chrome(options=opts)
        _driver.get(CHAT_URL)
        print("🌐 کروم باز شد. اگر صفحه ورود می‌بینید، یک بار وارد شوید...")
        return _driver
    except Exception as chrome_err:
        # ۳. تلاش با Edge به عنوان جایگزین در ویندوز
        if os.name == "nt":
            try:
                print("⚠️ کروم در دسترس نبود — تلاش برای باز کردن با Microsoft Edge...")
                from selenium.webdriver.edge.options import Options as EdgeOptions
                edge_opts = EdgeOptions()
                edge_opts.add_argument(f"--user-data-dir={PROFILE_DIR}_edge")
                edge_opts.add_argument("--disable-blink-features=AutomationControlled")
                edge_opts.add_experimental_option("excludeSwitches", ["enable-automation"])
                edge_opts.add_argument("--start-maximized")
                _driver = webdriver.Edge(options=edge_opts)
                _driver.get(CHAT_URL)
                print("🌐 مرورگر Edge باز شد. اگر صفحه ورود می‌بینید، یک بار وارد شوید...")
                return _driver
            except Exception:
                pass

        print_driver_help()
        raise chrome_err


def _find_input(d, timeout=60):
    """پیدا کردن جعبه تایپ چت (چند حالت مختلف را امتحان می‌کند)"""
    def probe(_):
        for sel in ("textarea#chat-input", "textarea", "div[contenteditable='true']"):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed() and el.is_enabled():
                    return el
        return False
    return WebDriverWait(d, timeout).until(probe)


def _messages_text(d):
    """متن همه پیام‌های صفحه (پاسخ‌های مدل)"""
    for sel in (".ds-markdown", "[class*='markdown']", "[class*='message']"):
        els = d.find_elements(By.CSS_SELECTOR, sel)
        if els:
            return [e.text for e in els if e.text.strip()]
    return []


def ask_deepseek(prompt: str) -> str:
    d = get_driver()
    d.get(CHAT_URL)  # هر سوال در یک چت تازه (بدون آلودگی زمینه قبلی)
    box = _find_input(d)
    before = len(_messages_text(d))

    # تزریق متن (سازگار با React) و ارسال
    d.execute_script(
        """
        const el = arguments[0], text = arguments[1];
        if (el.tagName === 'TEXTAREA') {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(el, text);
          el.dispatchEvent(new Event('input', {bubbles: true}));
        } else {
          el.focus();
          document.execCommand('insertText', false, text);
        }
        """,
        box, prompt,
    )
    time.sleep(0.5)
    box.send_keys(Keys.ENTER)

    # صبر تا پاسخ کامل شود: متن آخرین پیام ۳ بار پشت سر هم بدون تغییر بماند
    deadline = time.time() + ANSWER_TIMEOUT
    last, stable = "", 0
    while time.time() < deadline:
        time.sleep(1.5)
        msgs = _messages_text(d)
        cur = msgs[-1] if len(msgs) > before else ""
        if cur and cur == last:
            stable += 1
            if stable >= 3:
                return cur
        else:
            stable = 0
            last = cur
    if last:
        return last
    raise TimeoutError("پاسخی از سایت دریافت نشد (تایم‌اوت). لاگین بودن و باز بودن پنجره مرورگر را بررسی کنید.")


# ------------------------------------------------- endpoint سازگار با OpenAI
@app.get("/")
@app.get("/v1")
def health():
    return jsonify({"ok": True, "bridge": "deepseek-web", "port": PORT})


@app.post("/v1/chat/completions")
def chat_completions():
    body = request.get_json(force=True, silent=True) or {}
    messages = body.get("messages", [])
    parts = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            parts.append(content)
        else:
            parts.append(content)
    prompt = "\n\n".join(parts)

    with _lock:
        try:
            answer = ask_deepseek(prompt)
        except Exception as e:
            return jsonify({"error": {"message": str(e)}}), 500

    return jsonify({
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "model": body.get("model", "deepseek-web"),
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": answer},
            "finish_reason": "stop",
        }],
    })


if __name__ == "__main__":
    print("=" * 65)
    print("  🌉 پل وب DeepSeek (بدون کلید API)")
    print(f"  آدرس برای اپ:  http://localhost:{PORT}/v1")
    print("  در اپ: ⚙️ تنظیمات مدل → 🌐 مرورگر کروم (پل سلنیومی)")
    print("=" * 65)
    try:
        get_driver()  # مرورگر از همان اول باز شود تا کاربر لاگین کند
    except Exception:
        print("\n⚠️ برنامه متوقف شد. لطفاً راهنماهای بالا را بررسی کنید.")
        if os.name == "nt":
            input("\nبرای خروج Enter بزنید...")
        sys.exit(1)

    app.run(host="127.0.0.1", port=PORT, threaded=True)
