# -*- coding: utf-8 -*-
"""
پل وب DeepSeek — نسخه هوشمند ضد تحریم و ضد کرش (Anti-Sanction & Anti-Crash)
========================================================================
این سرویس پنجره مرورگر کروم را باز می‌کند، پروکسی‌های فعال سیستم (V2Ray/Clash/NekoRay)
را به صورت خودکار شناسایی و اعمال می‌کند و پاسخ‌ها را به اپلیکیشن تحویل می‌دهد.

آدرس برای اپ:  http://localhost:8765/v1
در اپ: ⚙️ تنظیمات مدل → 🌐 مرورگر کروم (پل سلنیومی)
"""

import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import uuid

# غیرفعال‌سازی دانلود اینترنتی Selenium Manager برای جلوگیری از خطای ۶۵ در ایران
os.environ["SE_OFFLINE"] = "true"

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

# اطلاعات ورود
DEEPSEEK_EMAIL = os.environ.get("DEEPSEEK_EMAIL", "Abraham.Hassanloo689@gmail.com")
DEEPSEEK_PASSWORD = os.environ.get("DEEPSEEK_PASSWORD", "hsshhsj79")

# حالت نمایش پنجره (پیش‌فرض: 0 یعنی پنجره نمایان باشد)
HEADLESS_MODE = os.environ.get("HEADLESS", "0").strip().lower() in ("1", "true", "yes")

app = Flask(__name__)
_lock = threading.Lock()   # هم‌زمان فقط یک سوال
_driver = None


def detect_local_proxy():
    """شناسایی خودکار نرم‌افزارهای پروکسی محلی فعال در سیستم مانند V2Ray, Clash, NekoRay"""
    # ۱. بررسی متغیرهای محیطی
    env_proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or os.environ.get("ALL_PROXY")
    if env_proxy:
        return env_proxy

    # ۲. پورت‌های رایج نرم‌افزارهای فیلترشکن در ایران
    candidate_ports = [
        ("http://127.0.0.1:10809", "127.0.0.1", 10809, "V2Ray / Xray HTTP"),
        ("http://127.0.0.1:20809", "127.0.0.1", 20809, "NekoRay HTTP"),
        ("http://127.0.0.1:7890",  "127.0.0.1", 7890,  "Clash / Mihomo HTTP"),
        ("socks5://127.0.0.1:10808", "127.0.0.1", 10808, "V2Ray SOCKS5"),
        ("socks5://127.0.0.1:20808", "127.0.0.1", 20808, "NekoRay SOCKS5"),
        ("http://127.0.0.1:8888",  "127.0.0.1", 8888,  "Custom Proxy 8888"),
        ("http://127.0.0.1:8080",  "127.0.0.1", 8080,  "Custom Proxy 8080"),
    ]

    for proxy_url, host, port, label in candidate_ports:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.2)
                if s.connect_ex((host, port)) == 0:
                    print(f"🛡️ پروکسی محلی فعال شناسایی شد: {label} ({proxy_url})")
                    return proxy_url
        except Exception:
            pass

    return None


def cleanup_stale_locks(profile_path):
    """پاکسازی فایل‌های قفل مانده از کروم قبلی برای جلوگیری از خطای DevToolsActivePort"""
    if not os.path.isdir(profile_path):
        return
    lock_names = ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile", "DevToolsActivePort"]
    for root, _, files in os.walk(profile_path):
        for f in files:
            if f in lock_names:
                try:
                    os.remove(os.path.join(root, f))
                except Exception:
                    pass


def find_local_driver():
    """جستجوی chromedriver یا msedgedriver در مسیرهای محلی پروژه و سیستم"""
    env_path = os.environ.get("CHROMEDRIVER_PATH")
    if env_path and os.path.isfile(env_path):
        return ("chrome", env_path)

    names_chrome = ["chromedriver.exe", "chromedriver"] if os.name == "nt" else ["chromedriver"]
    names_edge = ["msedgedriver.exe", "msedgedriver"] if os.name == "nt" else ["msedgedriver"]

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

    for name in names_chrome:
        w = shutil.which(name)
        if w:
            return ("chrome", w)
    for name in names_edge:
        w = shutil.which(name)
        if w:
            return ("edge", w)

    return (None, None)


def _setup_options(is_chrome=True, profile_path=PROFILE_DIR):
    """تنظیمات ضد کرش و ضد تحریم مرورگر"""
    cleanup_stale_locks(profile_path)

    if is_chrome:
        opts = webdriver.ChromeOptions()
    else:
        opts = webdriver.EdgeOptions()

    # پوشه اختصاصی پروفایل
    if profile_path:
        opts.add_argument(f"--user-data-dir={profile_path}")

    # اعمال خودکار پروکسی محلی در صورت وجود
    proxy = detect_local_proxy()
    if proxy:
        opts.add_argument(f"--proxy-server={proxy}")

    # فلگ‌های حیاتی برای جلوگیری از خطای DevToolsActivePort و کرش در ویندوز
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--disable-software-rasterizer")
    opts.add_argument("--remote-debugging-port=0")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    opts.add_argument("--ignore-certificate-errors")
    opts.add_argument("--disable-features=IsolateOrigins,site-per-process")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    opts.add_experimental_option("useAutomationExtension", False)

    if HEADLESS_MODE:
        opts.add_argument("--headless=new")
        opts.add_argument("--window-size=1920,1080")
        opts.add_argument("--mute-audio")
    else:
        opts.add_argument("--start-maximized")

    opts.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
    return opts


def _auto_login(d):
    """ورود خودکار به DeepSeek با ایمیل و پسورد"""
    try:
        print("🔍 در حال بررسی وضعیت لاگین...")
        time.sleep(2)
        # ۱. بررسی اینکه آیا از قبل لاگین هستیم
        for sel in ("textarea#chat-input", "textarea", "div[contenteditable='true']"):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed():
                    print("✅ حساب از قبل وارد شده و آماده است!")
                    return True

        # ۲. فرم لاگین
        print(f"🔐 شروع ورود خودکار با ایمیل: {DEEPSEEK_EMAIL}")

        # تب رمز عبور یا ورود با ایمیل
        tab_selectors = [
            "//div[contains(text(), 'Password') or contains(text(), 'رمز') or contains(text(), 'Log in with password')]",
            "//button[contains(text(), 'Password') or contains(text(), 'Log in')]",
            "//span[contains(text(), 'Password') or contains(text(), 'رمز')]"
        ]
        for xpath in tab_selectors:
            try:
                tabs = d.find_elements(By.XPATH, xpath)
                for tab in tabs:
                    if tab.is_displayed():
                        print("👉 انتخاب تب ورود با رمز عبور...")
                        tab.click()
                        time.sleep(0.5)
                        break
            except Exception:
                pass

        # ۳. وارد کردن ایمیل
        email_inputs = d.find_elements(By.CSS_SELECTOR, "input[type='email'], input[placeholder*='email' i], input[placeholder*='phone' i], input[placeholder*='ایمیل' i], input[type='text']")
        email_box = None
        for box in email_inputs:
            if box.is_displayed() and box.is_enabled():
                email_box = box
                break

        if email_box:
            print("✍️ تایپ ایمیل...")
            email_box.clear()
            email_box.send_keys(DEEPSEEK_EMAIL)
            time.sleep(0.4)

        # ۴. وارد کردن پسورد
        pass_inputs = d.find_elements(By.CSS_SELECTOR, "input[type='password']")
        pass_box = None
        for box in pass_inputs:
            if box.is_displayed() and box.is_enabled():
                pass_box = box
                break

        if pass_box:
            print("✍️ تایپ رمز عبور...")
            pass_box.clear()
            pass_box.send_keys(DEEPSEEK_PASSWORD)
            time.sleep(0.4)

        # ۵. تیک زدن قوانین و شرایط
        checkboxes = d.find_elements(By.CSS_SELECTOR, "input[type='checkbox'], .ds-checkbox, span[class*='checkbox'], div[class*='checkbox']")
        for cb in checkboxes:
            try:
                if cb.is_displayed():
                    print("☑️ تایید قوانین و شرایط...")
                    d.execute_script("arguments[0].click();", cb)
                    time.sleep(0.3)
            except Exception:
                pass

        # ۶. کلیک روی دکمه ورود
        btn_selectors = [
            "button[type='submit']",
            ".ds-button--primary",
            "//button[contains(., 'Log') or contains(., 'Sign') or contains(., 'ورود')]",
            "//div[contains(@class, 'button') and (contains(., 'Log') or contains(., 'Sign'))]"
        ]
        clicked = False
        for sel in btn_selectors:
            try:
                if sel.startswith("//"):
                    btns = d.find_elements(By.XPATH, sel)
                else:
                    btns = d.find_elements(By.CSS_SELECTOR, sel)
                for btn in btns:
                    if btn.is_displayed() and btn.is_enabled():
                        print("🖱️ کلیک روی دکمه ورود...")
                        d.execute_script("arguments[0].click();", btn)
                        clicked = True
                        break
                if clicked:
                    break
            except Exception:
                pass

        # ۷. صبر برای لود شدن چت
        print("⏳ منتظر تایید و ورود به صفحه اصلی چت...")
        deadline = time.time() + 25
        while time.time() < deadline:
            time.sleep(1.5)
            for sel in ("textarea#chat-input", "textarea", "div[contenteditable='true']"):
                els = d.find_elements(By.CSS_SELECTOR, sel)
                for el in els:
                    if el.is_displayed():
                        print("🎉 ورود با موفقیت انجام شد!")
                        return True

    except Exception as e:
        print(f"⚠️ پیام ورود: {e}")

    return False


def _create_driver_instance(driver_type, driver_path, profile_path):
    """ایجاد نمونه درایور با تنظیمات مشخص"""
    if driver_type == "chrome":
        opts = _setup_options(is_chrome=True, profile_path=profile_path)
        if driver_path:
            service = ChromeService(executable_path=driver_path)
            return webdriver.Chrome(service=service, options=opts)
        return webdriver.Chrome(options=opts)
    else:
        from selenium.webdriver.edge.service import Service as EdgeService
        opts = _setup_options(is_chrome=False, profile_path=profile_path)
        if driver_path:
            service = EdgeService(executable_path=driver_path)
            return webdriver.Edge(service=service, options=opts)
        return webdriver.Edge(options=opts)


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
    driver_type = driver_type or "chrome"
    mode_text = "مخفی (Headless)" if HEADLESS_MODE else "نمایان (Visible Window)"
    print(f"🚀 در حال راه‌اندازی مرورگر ({mode_text})...")
    if driver_path:
        print(f"🔧 درایور: {driver_path}")

    # تلاش ۱: با پوشه پروفایل استاندارد
    try:
        _driver = _create_driver_instance(driver_type, driver_path, PROFILE_DIR)
        _driver.get(CHAT_URL)
        _auto_login(_driver)
        print("🌐 مرورگر آماده به کار است. پنجره را نبندید.")
        return _driver
    except Exception as e1:
        print(f"⚠️ تلاش اول با پروفایل پیش‌فرض با خطا مواجه شد ({e1}). تلاش مجدد با پروفایل ایزوله...")

    # تلاش ۲: با پوشه پروفایل موقت و ایزوله
    try:
        temp_profile = os.path.join(tempfile.gettempdir(), f"deepseek_profile_{uuid.uuid4().hex[:6]}")
        _driver = _create_driver_instance(driver_type, driver_path, temp_profile)
        _driver.get(CHAT_URL)
        _auto_login(_driver)
        print("🌐 مرورگر با پروفایل ایزوله آماده به کار است.")
        return _driver
    except Exception as e2:
        print(f"⚠️ تلاش دوم با خطا مواجه شد: {e2}")

    # تلاش ۳: با مرورگر Edge در ویندوز
    if os.name == "nt" and driver_type != "edge":
        try:
            print("⚠️ تلاش جایگزین با Microsoft Edge...")
            temp_profile_edge = os.path.join(tempfile.gettempdir(), f"deepseek_edge_{uuid.uuid4().hex[:6]}")
            _driver = _create_driver_instance("edge", None, temp_profile_edge)
            _driver.get(CHAT_URL)
            _auto_login(_driver)
            print("🌐 مرورگر Edge آماده به کار است.")
            return _driver
        except Exception as e3:
            print(f"⚠️ تلاش Edge نیز با خطا مواجه شد: {e3}")

    raise RuntimeError("عدم موفقیت در راه‌اندازی خودکار مرورگر. می‌توانید از موتور هوش مصنوعی آفلاین داخلی یا Ollama استفاده کنید.")


def _find_input(d, timeout=60):
    """پیدا کردن جعبه تایپ چت"""
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
    print("📩 در حال ارسال پرامپت به سایت DeepSeek...")
    d.get(CHAT_URL)
    box = _find_input(d)
    before = len(_messages_text(d))

    # تزریق متن و ارسال
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
    print("⏳ منتظر دریافت کامل پاسخ از DeepSeek...")

    deadline = time.time() + ANSWER_TIMEOUT
    last, stable = "", 0
    while time.time() < deadline:
        time.sleep(1.5)
        msgs = _messages_text(d)
        cur = msgs[-1] if len(msgs) > before else ""
        if cur and cur == last:
            stable += 1
            if stable >= 3:
                print("📥 پاسخ با موفقیت دریافت و به اپلیکیشن تحویل داده شد.")
                return cur
        else:
            stable = 0
            last = cur
    if last:
        print("📥 پاسخ دریافت شد.")
        return last
    raise TimeoutError("پاسخی از سایت دریافت نشد (تایم‌اوت). لطفا اتصال اینترنت یا پروکسی را بررسی کنید.")


# ------------------------------------------------- endpoint سازگار با OpenAI
@app.get("/")
@app.get("/v1")
def health():
    return jsonify({
        "ok": True,
        "bridge": "deepseek-web",
        "port": PORT,
        "headless": HEADLESS_MODE,
        "proxy_detected": detect_local_proxy()
    })


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
            return jsonify({
                "error": {
                    "message": f"خطا در ارتباط با DeepSeek: {str(e)}. در صورت نداشتن VPN، می‌توانید در تنظیمات مدل گزینه 'موتور هوش مصنوعی آفلاین (بدون اینترنت)' یا 'Ollama' را انتخاب نمایید."
                }
            }), 500

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
    print("  🌉 پل وب DeepSeek (ضد تحریم با شناسایی خودکار پروکسی و ورود خودکار)")
    print(f"  حالت:          {'مخفی (Headless)' if HEADLESS_MODE else 'پنجره نمایان و بزرگ'}")
    print(f"  ایمیل لاگین:   {DEEPSEEK_EMAIL}")
    print(f"  آدرس برای اپ:  http://localhost:{PORT}/v1")
    proxy = detect_local_proxy()
    if proxy:
        print(f"  🛡️ وضعیت پروکسی: {proxy} (متصل)")
    else:
        print("  ℹ️ پروکسی محلی شناسایی نشد (در صورت عدم دسترسی به DeepSeek، فیلترشکن را فعال کنید یا از حالت آفلاین اپ استفاده کنید)")
    print("=" * 65)
    try:
        get_driver()
    except Exception as e:
        print(f"\n⚠️ توجه: {e}")
        print("برنامه وب همچنان با موتور هوش مصنوعی آفلاین داخلی یا مدل‌های لوکال به کار خود ادامه می‌دهد.")

    app.run(host="127.0.0.1", port=PORT, threaded=True)
