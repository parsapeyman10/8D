# -*- coding: utf-8 -*-
"""
پل وب DeepSeek — اتصال زنده و نمایان به مرورگر Google Chrome
========================================================================
این سرویس پنجره بزرگ Google Chrome را مستقیماً روی صفحه باز می‌کند،
به سایت chat.deepseek.com متصل می‌شود و پرامپت‌های عیب‌یابی را به آن ارسال می‌کند.

آدرس برای اپلیکیشن: http://localhost:8765/v1
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid

from flask import Flask, jsonify, request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
PORT = int(os.environ.get("BRIDGE_PORT", "8765"))
CHAT_URL = "https://chat.deepseek.com/"
PROFILE_DIR = os.path.join(os.path.expanduser("~"), ".deepseek_web_profile")
DEBUG_PORT = 9222
ANSWER_TIMEOUT = int(os.environ.get("ANSWER_TIMEOUT", "300"))

# اطلاعات ورود
DEEPSEEK_EMAIL = os.environ.get("DEEPSEEK_EMAIL", "Abraham.Hassanloo689@gmail.com")
DEEPSEEK_PASSWORD = os.environ.get("DEEPSEEK_PASSWORD", "hsshhsj79")

# حالت نمایش پنجره (پیش‌فرض: 0 یعنی پنجره کروم کاملاً روی مانیتور باز و نمایان باشد)
HEADLESS_MODE = os.environ.get("HEADLESS", "0").strip().lower() in ("1", "true", "yes")

app = Flask(__name__)
_lock = threading.Lock()
_driver = None
_chrome_process = None


def find_chrome_binary():
    """پیدا کردن فایل اجرایی Google Chrome در ویندوز یا لینوکس"""
    if os.name == "nt":
        candidates = [
            os.path.join(os.environ.get("PROGRAMFILES", "C:\\Program Files"), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)"), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("USERPROFILE", ""), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
        for p in candidates:
            if os.path.isfile(p):
                return p
    else:
        for name in ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]:
            w = shutil.which(name)
            if w:
                return w
    return None


def detect_local_proxy():
    """شناسایی خودکار پروکسی‌های فعال در سیستم (V2Ray / Clash / NekoRay)"""
    env_proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or os.environ.get("ALL_PROXY")
    if env_proxy:
        return env_proxy

    candidate_ports = [
        ("http://127.0.0.1:10809", "127.0.0.1", 10809, "V2Ray HTTP"),
        ("http://127.0.0.1:20809", "127.0.0.1", 20809, "NekoRay HTTP"),
        ("http://127.0.0.1:7890",  "127.0.0.1", 7890,  "Clash HTTP"),
        ("socks5://127.0.0.1:10808", "127.0.0.1", 10808, "V2Ray SOCKS5"),
        ("socks5://127.0.0.1:20808", "127.0.0.1", 20808, "NekoRay SOCKS5"),
    ]

    for proxy_url, host, port, label in candidate_ports:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.15)
                if s.connect_ex((host, port)) == 0:
                    print(f"🛡️ پروکسی فعال شناسایی شد: {label} ({proxy_url})")
                    return proxy_url
        except Exception:
            pass

    return None


def port_is_listening(host, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def cleanup_stale_locks(profile_path):
    if not os.path.isdir(profile_path):
        return
    lock_names = ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile", "DevToolsActivePort"]
    for root, _, files in os.walk(profile_path):
        for f in files:
            if f in lock_names:
                try: os.remove(os.path.join(root, f))
                except Exception: pass


def auto_login(d):
    """ورود خودکار به DeepSeek در صورت ظاهر شدن صفحه لاگین"""
    from selenium.webdriver.common.by import By
    try:
        time.sleep(2)
        # بررسی اینکه آیا چت لود شده است
        for sel in ("textarea#chat-input", "textarea[placeholder*='DeepSeek']", "textarea", "div[contenteditable='true']"):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed():
                    print("✅ صفحه چت DeepSeek باز و آماده دریافت سوالات است!")
                    return True

        print(f"🔐 در حال ورود خودکار با ایمیل: {DEEPSEEK_EMAIL}")
        # تب پسورد
        for xpath in [
            "//div[contains(text(), 'Password') or contains(text(), 'رمز') or contains(text(), 'Log in with password')]",
            "//button[contains(text(), 'Password') or contains(text(), 'Log in')]",
            "//span[contains(text(), 'Password') or contains(text(), 'رمز')]"
        ]:
            try:
                tabs = d.find_elements(By.XPATH, xpath)
                for tab in tabs:
                    if tab.is_displayed():
                        tab.click()
                        time.sleep(0.4)
                        break
            except Exception: pass

        # وارد کردن ایمیل
        for box in d.find_elements(By.CSS_SELECTOR, "input[type='email'], input[placeholder*='email' i], input[placeholder*='phone' i], input[placeholder*='ایمیل' i], input[type='text']"):
            if box.is_displayed() and box.is_enabled():
                box.clear()
                box.send_keys(DEEPSEEK_EMAIL)
                time.sleep(0.3)
                break

        # پسورد
        for box in d.find_elements(By.CSS_SELECTOR, "input[type='password']"):
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
            except Exception: pass

        # کلیک دکمه ورود
        for sel in ["button[type='submit']", ".ds-button--primary", "//button[contains(., 'Log') or contains(., 'Sign') or contains(., 'ورود')]"]:
            try:
                btns = d.find_elements(By.XPATH, sel) if sel.startswith("//") else d.find_elements(By.CSS_SELECTOR, sel)
                for btn in btns:
                    if btn.is_displayed() and btn.is_enabled():
                        d.execute_script("arguments[0].click();", btn)
                        break
            except Exception: pass

        # مهلت برای لود
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
        print(f"ℹ️ لاگین: {e}")
    return False


def launch_visible_chrome():
    """راه‌اندازی قطعی پنجره Google Chrome با پورت دیباگ ۹۲۲۲"""
    global _chrome_process
    chrome_bin = find_chrome_binary()
    if not chrome_bin:
        print("⚠️ فایل اجرایی کروم پیدا نشد. تلاش با سلنیوم استاندارد...")
        return False

    os.makedirs(PROFILE_DIR, exist_ok=True)
    cleanup_stale_locks(PROFILE_DIR)

    proxy = detect_local_proxy()
    cmd = [
        chrome_bin,
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={PROFILE_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        "--start-maximized",
        CHAT_URL
    ]
    if proxy:
        cmd.append(f"--proxy-server={proxy}")

    print(f"🚀 در حال باز کردن پنجره کروم: {chrome_bin}")
    try:
        _chrome_process = subprocess.Popen(cmd)
        # صبر برای لیسن شدن پورت دیباگ
        for _ in range(30):
            if port_is_listening("127.0.0.1", DEBUG_PORT):
                print(f"✅ پنجره Google Chrome باز شد (پورت دیباگ {DEBUG_PORT} فعال است).")
                return True
            time.sleep(0.3)
    except Exception as e:
        print(f"⚠️ اجرای مستقیم کروم با خطا مواجه شد: {e}")

    return False


def get_driver():
    """اتصال یا ایجاد WebDriver کروم"""
    global _driver
    if _driver is not None:
        try:
            _driver.title
            return _driver
        except Exception:
            _driver = None

    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service as ChromeService

    proxy = detect_local_proxy()
    if proxy:
        os.environ["HTTP_PROXY"] = proxy
        os.environ["HTTPS_PROXY"] = proxy

    # روش ۱: باز کردن مستقیم کروم و اتصال از طریق Debugger Address (بدون حساسیت به نسخه ChromeDriver)
    if launch_visible_chrome():
        try:
            opts = webdriver.ChromeOptions()
            opts.add_experimental_option("debuggerAddress", f"127.0.0.1:{DEBUG_PORT}")
            _driver = webdriver.Chrome(options=opts)
            print("🌐 وب‌درایور با موفقیت به پنجره کروم متصل گردید!")
            auto_login(_driver)
            return _driver
        except Exception as e:
            print(f"⚠️ اتصال به کروم باز با خطا مواجه شد ({e})، تلاش با روش استاندارد...")

    # روش ۲: راه‌اندازی استاندارد WebDriver
    try:
        cleanup_stale_locks(PROFILE_DIR)
        opts = webdriver.ChromeOptions()
        chrome_bin = find_chrome_binary()
        if chrome_bin:
            opts.binary_location = chrome_bin
        opts.add_argument(f"--user-data-dir={PROFILE_DIR}")
        if proxy:
            opts.add_argument(f"--proxy-server={proxy}")
        opts.add_argument("--start-maximized")
        opts.add_argument("--disable-blink-features=AutomationControlled")
        _driver = webdriver.Chrome(options=opts)
        _driver.get(CHAT_URL)
        auto_login(_driver)
        print("🌐 پنجره کروم با سلنیوم باز شد.")
        return _driver
    except Exception as e2:
        print(f"⚠️ روش دوم با خطا مواجه شد ({e2}). تلاش با پروفایل ایزوله...")

    # روش ۳: پروفایل ایزوله موقت
    try:
        temp_dir = os.path.join(tempfile.gettempdir(), f"ds_{uuid.uuid4().hex[:6]}")
        opts3 = webdriver.ChromeOptions()
        chrome_bin = find_chrome_binary()
        if chrome_bin:
            opts3.binary_location = chrome_bin
        opts3.add_argument(f"--user-data-dir={temp_dir}")
        if proxy:
            opts3.add_argument(f"--proxy-server={proxy}")
        opts3.add_argument("--start-maximized")
        _driver = webdriver.Chrome(options=opts3)
        _driver.get(CHAT_URL)
        auto_login(_driver)
        return _driver
    except Exception as e3:
        print(f"⚠️ تلاش سوم: {e3}")

    raise RuntimeError("عدم موفقیت در باز کردن پنجره Google Chrome. لطفاً مطمئن شوید کروم نصب است و پنجره‌های قبلی را ببندید.")


def find_input_box(d, timeout=60):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait

    def probe(_):
        for sel in ("textarea#chat-input", "textarea[placeholder*='DeepSeek']", "textarea[placeholder*='Send']", "textarea", "div[contenteditable='true']", "[role='textbox']"):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed() and el.is_enabled():
                    return el
        return False

    return WebDriverWait(d, timeout).until(probe)


def get_messages(d):
    from selenium.webdriver.common.by import By
    for sel in (".ds-markdown", "[class*='markdown']", "[class*='message-content']", "[class*='message']"):
        els = d.find_elements(By.CSS_SELECTOR, sel)
        if els:
            return [e.text for e in els if e.text.strip()]
    return []


def ask_deepseek(prompt: str) -> str:
    from selenium.webdriver.common.keys import Keys
    d = get_driver()
    print("📩 در حال تایپ و ارسال سوال به پنجره DeepSeek در کروم...")

    if not d.current_url.startswith("https://chat.deepseek.com"):
        d.get(CHAT_URL)
        time.sleep(2)

    box = find_input_box(d)
    before_count = len(get_messages(d))

    # تایپ پرامپت در چت‌باکس
    d.execute_script(
        """
        const el = arguments[0], text = arguments[1];
        if (el.tagName === 'TEXTAREA') {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
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
    print("⏳ منتظر دریافت کامل پاسخ از مدل DeepSeek...")

    deadline = time.time() + ANSWER_TIMEOUT
    last, stable = "", 0
    while time.time() < deadline:
        time.sleep(1.5)
        msgs = get_messages(d)
        cur = msgs[-1] if len(msgs) > before_count else ""
        if cur and cur == last:
            stable += 1
            if stable >= 3:
                print("📥 پاسخ مدل DeepSeek با موفقیت دریافت و تحویل داده شد!")
                return cur
        else:
            stable = 0
            last = cur

    if last:
        return last
    raise TimeoutError("پاسخی از سایت DeepSeek دریافت نشد. لطفاً پنجره کروم را بررسی کنید.")


# ------------------------------------------------- API Endpoints
@app.get("/")
@app.get("/v1")
def health():
    return jsonify({
        "ok": True,
        "bridge": "deepseek-selenium-chrome",
        "port": PORT,
        "chrome_binary": find_chrome_binary(),
        "driver_ready": _driver is not None,
        "proxy": detect_local_proxy()
    })


@app.post("/v1/chat/completions")
def chat_completions():
    body = request.get_json(force=True, silent=True) or {}
    messages = body.get("messages", [])
    parts = []
    for m in messages:
        c = m.get("content", "")
        if c: parts.append(c)
    prompt = "\n\n".join(parts)

    with _lock:
        try:
            answer = ask_deepseek(prompt)
        except Exception as e:
            return jsonify({
                "error": {
                    "message": f"خطا در وب‌درایور DeepSeek: {str(e)}"
                }
            }), 500

    return jsonify({
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "model": "deepseek-web-chrome",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": answer},
            "finish_reason": "stop",
        }],
    })


if __name__ == "__main__":
    print("=" * 70)
    print("  🌐 پل وب DeepSeek (پنجره باز و زنده Google Chrome)")
    print(f"  ایمیل ورود:    {DEEPSEEK_EMAIL}")
    print(f"  آدرس پل:       http://localhost:{PORT}/v1")
    proxy = detect_local_proxy()
    if proxy:
        print(f"  🛡️ پروکسی شناسایی‌شده: {proxy}")
    print("=" * 70)

    try:
        get_driver()
    except Exception as e:
        print(f"⚠️ وضعیت اولیه مرورگر: {e}")

    app.run(host="127.0.0.1", port=PORT, threaded=True)
