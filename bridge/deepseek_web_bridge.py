# -*- coding: utf-8 -*-
"""
پل وب DeepSeek — نسخه فوق‌پیشرفته و ضد خرابی (Ultra-Resilient Selenium Bridge)
========================================================================
این سرویس مرورگر Google Chrome را با بالاترین سازگاری باز می‌کند:
 ۱. سازگاری با تمام نسخه‌های کروم (حتی در صورت عدم تطابق ورژن ChromeDriver)
 ۲. شناسایی و اتصال خودکار به پروکسی‌های فعال سیستم (V2Ray, Clash, NekoRay)
 ۳. ورود خودکار به حساب کاربری DeepSeek
 ۴. پشتیبانی از مرورگر Microsoft Edge به عنوان جایگزین خودکار در ویندوز
"""

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
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
ANSWER_TIMEOUT = int(os.environ.get("ANSWER_TIMEOUT", "300"))

# اطلاعات ورود خودکار
DEEPSEEK_EMAIL = os.environ.get("DEEPSEEK_EMAIL", "Abraham.Hassanloo689@gmail.com")
DEEPSEEK_PASSWORD = os.environ.get("DEEPSEEK_PASSWORD", "hsshhsj79")

# حالت نمایش پنجره (پیش‌فرض: پنجره نمایان باشد تا کاربر ببیند)
HEADLESS_MODE = os.environ.get("HEADLESS", "0").strip().lower() in ("1", "true", "yes")

app = Flask(__name__)
_lock = threading.Lock()
_driver = None
_chrome_process = None


def find_chrome_binary():
    """پیدا کردن مسیر فایل اجرایی Google Chrome روی سیستم"""
    if os.name == "nt":
        candidates = [
            os.path.join(os.environ.get("PROGRAMFILES", "C:\\Program Files"), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)"), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("USERPROFILE", ""), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
        for path in candidates:
            if os.path.isfile(path):
                return path
    else:
        for name in ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]:
            w = shutil.which(name)
            if w:
                return w
    return None


def detect_local_proxy():
    """شناسایی خودکار نرم‌افزارهای پروکسی محلی فعال در سیستم مانند V2Ray, Clash, NekoRay"""
    env_proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or os.environ.get("ALL_PROXY")
    if env_proxy:
        return env_proxy

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
                s.settimeout(0.15)
                if s.connect_ex((host, port)) == 0:
                    print(f"🛡️ پروکسی محلی فعال شناسایی شد: {label} ({proxy_url})")
                    return proxy_url
        except Exception:
            pass

    return None


def cleanup_stale_locks(profile_path):
    """پاکسازی فایل‌های قفل مانده از کروم قبلی"""
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


def find_local_chromedriver():
    """جستجوی فایل chromedriver در پروژه"""
    env_path = os.environ.get("CHROMEDRIVER_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    names = ["chromedriver.exe", "chromedriver"] if os.name == "nt" else ["chromedriver"]
    search_dirs = [HERE, REPO_ROOT, os.getcwd()]
    for d in search_dirs:
        for name in names:
            p = os.path.join(d, name)
            if os.path.isfile(p):
                return p
    for name in names:
        w = shutil.which(name)
        if w:
            return w
    return None


def _setup_chrome_options(profile_path=PROFILE_DIR, proxy=None):
    cleanup_stale_locks(profile_path)
    opts = webdriver.ChromeOptions()
    chrome_bin = find_chrome_binary()
    if chrome_bin:
        opts.binary_location = chrome_bin

    if profile_path:
        opts.add_argument(f"--user-data-dir={profile_path}")

    if proxy:
        opts.add_argument(f"--proxy-server={proxy}")

    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    opts.add_argument("--ignore-certificate-errors")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    opts.add_experimental_option("useAutomationExtension", False)

    if HEADLESS_MODE:
        opts.add_argument("--headless=new")
        opts.add_argument("--window-size=1920,1080")
    else:
        opts.add_argument("--start-maximized")

    opts.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
    return opts


def _auto_login(d):
    """ورود خودکار به DeepSeek در صورت مشاهده صفحه لاگین"""
    try:
        time.sleep(2)
        # بررسی اینکه آیا از قبل لاگین هستیم
        for sel in ("textarea#chat-input", "textarea[placeholder*='DeepSeek']", "textarea", "div[contenteditable='true']"):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed():
                    print("✅ صفحه چت DeepSeek فعال و آماده دریافت سوال است!")
                    return True

        print(f"🔐 در حال تلاش برای ورود خودکار با ایمیل: {DEEPSEEK_EMAIL}")

        # انتخاب تب رمز عبور
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
                        tab.click()
                        time.sleep(0.4)
                        break
            except Exception:
                pass

        # ایمیل
        email_inputs = d.find_elements(By.CSS_SELECTOR, "input[type='email'], input[placeholder*='email' i], input[placeholder*='phone' i], input[placeholder*='ایمیل' i], input[type='text']")
        for box in email_inputs:
            if box.is_displayed() and box.is_enabled():
                box.clear()
                box.send_keys(DEEPSEEK_EMAIL)
                time.sleep(0.3)
                break

        # پسورد
        pass_inputs = d.find_elements(By.CSS_SELECTOR, "input[type='password']")
        for box in pass_inputs:
            if box.is_displayed() and box.is_enabled():
                box.clear()
                box.send_keys(DEEPSEEK_PASSWORD)
                time.sleep(0.3)
                break

        # تیک قوانین
        for cb in d.find_elements(By.CSS_SELECTOR, "input[type='checkbox'], .ds-checkbox, span[class*='checkbox']"):
            try:
                if cb.is_displayed():
                    d.execute_script("arguments[0].click();", cb)
                    time.sleep(0.2)
            except Exception:
                pass

        # کلیک ورود
        for sel in ["button[type='submit']", ".ds-button--primary", "//button[contains(., 'Log') or contains(., 'Sign') or contains(., 'ورود')]"]:
            try:
                btns = d.find_elements(By.XPATH, sel) if sel.startswith("//") else d.find_elements(By.CSS_SELECTOR, sel)
                for btn in btns:
                    if btn.is_displayed() and btn.is_enabled():
                        d.execute_script("arguments[0].click();", btn)
                        break
            except Exception:
                pass

        # مهلت برای لود شدن چت
        deadline = time.time() + 20
        while time.time() < deadline:
            time.sleep(1.5)
            for sel in ("textarea#chat-input", "textarea[placeholder*='DeepSeek']", "textarea", "div[contenteditable='true']"):
                els = d.find_elements(By.CSS_SELECTOR, sel)
                for el in els:
                    if el.is_displayed():
                        print("🎉 ورود با موفقیت انجام شد!")
                        return True

    except Exception as e:
        print(f"ℹ️ وضعیت لاگین: {e}")

    return False


def get_driver():
    global _driver
    if _driver is not None:
        try:
            _driver.title
            return _driver
        except Exception:
            _driver = None

    proxy = detect_local_proxy()
    if proxy:
        os.environ["HTTP_PROXY"] = proxy
        os.environ["HTTPS_PROXY"] = proxy

    local_driver_path = find_local_chromedriver()
    chrome_bin = find_chrome_binary()

    print(f"🚀 در حال راه‌اندازی Google Chrome...")
    if chrome_bin:
        print(f"🔍 فایل اجرایی کروم: {chrome_bin}")

    # روش ۱: راه‌اندازی استاندارد با Selenium Manager یا Driver محلی
    try:
        opts = _setup_chrome_options(PROFILE_DIR, proxy)
        if local_driver_path and os.path.isfile(local_driver_path):
            service = ChromeService(executable_path=local_driver_path)
            _driver = webdriver.Chrome(service=service, options=opts)
        else:
            _driver = webdriver.Chrome(options=opts)

        _driver.get(CHAT_URL)
        _auto_login(_driver)
        print("🌐 پنجره کروم با موفقیت باز شد و به DeepSeek متصل گردید.")
        return _driver
    except Exception as e1:
        print(f"⚠️ روش اول با خطا مواجه شد ({e1}). تلاش با پروفایل موقت...")

    # روش ۲: تلاش با پروفایل ایزوله جدید
    try:
        temp_profile = os.path.join(tempfile.gettempdir(), f"ds_profile_{uuid.uuid4().hex[:6]}")
        opts2 = _setup_chrome_options(temp_profile, proxy)
        _driver = webdriver.Chrome(options=opts2)
        _driver.get(CHAT_URL)
        _auto_login(_driver)
        print("🌐 کروم با پروفایل ایزوله آماده به کار است.")
        return _driver
    except Exception as e2:
        print(f"⚠️ روش دوم با خطا مواجه شد ({e2}).")

    # روش ۳: استفاده از Microsoft Edge به عنوان جایگزین مطمئن
    try:
        print("🔄 در حال تلاش برای باز کردن با Microsoft Edge...")
        from selenium.webdriver.edge.options import Options as EdgeOptions
        edge_opts = EdgeOptions()
        if proxy:
            edge_opts.add_argument(f"--proxy-server={proxy}")
        edge_opts.add_argument("--start-maximized")
        edge_opts.add_argument("--disable-blink-features=AutomationControlled")
        _driver = webdriver.Edge(options=edge_opts)
        _driver.get(CHAT_URL)
        _auto_login(_driver)
        print("🌐 مرورگر Microsoft Edge با موفقیت باز شد.")
        return _driver
    except Exception as e3:
        print(f"⚠️ تلاش با Edge نیز با خطا مواجه شد: {e3}")

    raise RuntimeError(
        "عدم موفقیت در راه‌اندازی خودکار مرورگر کروم. "
        "لطفاً مطمئن شوید Google Chrome روی سیستم نصب است و پنجره‌های تکراری کروم را ببندید. "
        "همچنین می‌توانید از مدل پیش‌فرض Google Gemini یا موتور آفلاین داخلی استفاده کنید."
    )


def _find_input(d, timeout=45):
    """پیدا کردن جعبه متن ورودی DeepSeek"""
    def probe(_):
        selectors = [
            "textarea#chat-input",
            "textarea[placeholder*='DeepSeek']",
            "textarea[placeholder*='Send']",
            "textarea",
            "div[contenteditable='true']",
            "[role='textbox']"
        ]
        for sel in selectors:
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed() and el.is_enabled():
                    return el
        return False
    return WebDriverWait(d, timeout).until(probe)


def _messages_text(d):
    """استخراج پاسخ مدل از صفحه"""
    for sel in (".ds-markdown", "[class*='markdown']", "[class*='message-content']", "[class*='message']"):
        els = d.find_elements(By.CSS_SELECTOR, sel)
        if els:
            return [e.text for e in els if e.text.strip()]
    return []


def ask_deepseek(prompt: str) -> str:
    d = get_driver()
    print("📩 در حال ارسال پرامپت به سایت DeepSeek...")
    if not d.current_url.startswith("https://chat.deepseek.com"):
        d.get(CHAT_URL)
        time.sleep(2)

    box = _find_input(d)
    before = len(_messages_text(d))

    # درج متن و ارسال
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
                print("📥 پاسخ با موفقیت دریافت و تحویل داده شد.")
                return cur
        else:
            stable = 0
            last = cur
    if last:
        print("📥 پاسخ دریافت شد.")
        return last
    raise TimeoutError("پاسخی از سایت دریافت نشد (تایم‌اوت). لطفاً اتصال اینترنت یا پروکسی را بررسی کنید.")


# ------------------------------------------------- API Endpoint
@app.get("/")
@app.get("/v1")
def health():
    return jsonify({
        "ok": True,
        "bridge": "deepseek-web",
        "port": PORT,
        "headless": HEADLESS_MODE,
        "chrome_binary": find_chrome_binary(),
        "proxy_detected": detect_local_proxy()
    })


@app.post("/v1/chat/completions")
def chat_completions():
    body = request.get_json(force=True, silent=True) or {}
    messages = body.get("messages", [])
    parts = []
    for m in messages:
        content = m.get("content", "")
        if content:
            parts.append(content)
    prompt = "\n\n".join(parts)

    with _lock:
        try:
            answer = ask_deepseek(prompt)
        except Exception as e:
            return jsonify({
                "error": {
                    "message": f"خطا در ارتباط با DeepSeek: {str(e)}"
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
    print("=" * 68)
    print("  🌉 پل وب DeepSeek با سلنیوم (پنجره باز کروم + ضد تحریم)")
    print(f"  ایمیل لاگین:   {DEEPSEEK_EMAIL}")
    print(f"  آدرس پل:       http://localhost:{PORT}/v1")
    proxy = detect_local_proxy()
    if proxy:
        print(f"  🛡️ پروکسی فعال: {proxy}")
    print("=" * 68)

    try:
        get_driver()
    except Exception as e:
        print(f"\n⚠️ پیام راه‌اندازی مرورگر: {e}")

    app.run(host="127.0.0.1", port=PORT, threaded=True)
