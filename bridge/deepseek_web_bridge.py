# -*- coding: utf-8 -*-
"""
پل وب DeepSeek — اتوماسیون دقیق صفحه ورود (chat.deepseek.com/sign_in)
========================================================================
این ماژول پنجره Google Chrome را کنترل کرده و فیلدهای صفحه sign_in را با
دقت کامل (شناسایی المان‌ها، فوکوس، تایپ ایمیل و پسورد، و کلیک دکمه Log in)
تکمیل می‌کند و سپس سوالات عیب‌یابی را از هوش مصنوعی دریافت می‌نماید.

اطلاعات کاربری:
  Email:    Abraham.Hassanloo689@gmail.com
  Password: hsshhsj79
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
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
PORT = int(os.environ.get("BRIDGE_PORT", "8765"))
SIGN_IN_URL = "https://chat.deepseek.com/sign_in"
CHAT_URL = "https://chat.deepseek.com/"
PROFILE_DIR = os.path.join(os.path.expanduser("~"), ".deepseek_web_profile")
DEBUG_PORT = 9222
ANSWER_TIMEOUT = int(os.environ.get("ANSWER_TIMEOUT", "300"))

# اطلاعات دقیق لاگین
DEEPSEEK_EMAIL = os.environ.get("DEEPSEEK_EMAIL", "Abraham.Hassanloo689@gmail.com").strip()
DEEPSEEK_PASSWORD = os.environ.get("DEEPSEEK_PASSWORD", "hsshhsj79").strip()

# وضعیت احراز هویت
LOGIN_STATUS = {
    "logged_in": False,
    "last_check": None,
    "email": DEEPSEEK_EMAIL,
    "message": "در حال ورود خودکار با سلنیوم...",
}

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


def check_if_logged_in(d):
    """بررسی وضعیت لاگین بودن در DeepSeek"""
    try:
        # اگر در صفحه sign_in باشیم، هنوز لاگین نیستیم
        if "sign_in" in d.current_url or "login" in d.current_url:
            LOGIN_STATUS["logged_in"] = False
            LOGIN_STATUS["message"] = "صفحه ورود (sign_in) باز است."
            return False

        # ۱. بررسی وجود کادر چت
        for sel in (
            "textarea#chat-input",
            "textarea[placeholder*='DeepSeek']",
            "textarea[placeholder*='Send']",
            "div[contenteditable='true']",
            "#chat-input",
            ".ds-chat-input"
        ):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed():
                    LOGIN_STATUS["logged_in"] = True
                    LOGIN_STATUS["last_check"] = time.strftime("%Y-%m-%d %H:%M:%S")
                    LOGIN_STATUS["message"] = "لاگین تایید و احراز هویت شد."
                    return True

        # ۲. بررسی سایدبار و دکمه چت جدید
        for sel in (".ds-sidebar", "[class*='sidebar']", "[class*='avatar']", ".ds-avatar"):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            if els and any(e.is_displayed() for e in els):
                LOGIN_STATUS["logged_in"] = True
                LOGIN_STATUS["message"] = "وارد حساب شدید."
                return True

    except Exception as e:
        print(f"ℹ️ بررسی لاگین: {e}")

    LOGIN_STATUS["logged_in"] = False
    return False


def perform_signin_automation(d):
    """
    اتوماسیون کامل صفحه chat.deepseek.com/sign_in:
    ۱. یافتن فیلد اول: Phone number / email address
    ۲. فوکوس و تایپ ایمیل Abraham.Hassanloo689@gmail.com
    ۳. یافتن فیلد دوم: Password
    ۴. فوکوس و تایپ رمز عبور hsshhsj79
    ۵. کلیک روی دکمه آبی Log in
    """
    print("=" * 70)
    print("🤖 [اتوماسیون ورود DeepSeek]")
    print(f"🌐 آدرس صفحه: {d.current_url}")
    print(f"📧 ایمیل:    {DEEPSEEK_EMAIL}")
    print("🔑 کلمه عبور: ********")
    print("=" * 70)

    time.sleep(1.5)

    # ۱. شناسایی فیلد ایمیل (Phone number / email address)
    email_elem = None
    for sel in [
        "input[placeholder*='Phone number' i]",
        "input[placeholder*='email' i]",
        "input[type='text']",
        "input[type='email']",
    ]:
        try:
            elems = d.find_elements(By.CSS_SELECTOR, sel)
            for el in elems:
                if el.is_displayed() and el.is_enabled():
                    email_elem = el
                    break
            if email_elem:
                break
        except Exception:
            pass

    if not email_elem:
        # جستجو بر اساس اولین تگ input در صفحه
        inputs = d.find_elements(By.TAG_NAME, "input")
        if inputs and inputs[0].is_displayed():
            email_elem = inputs[0]

    if email_elem:
        try:
            ActionChains(d).move_to_element(email_elem).click().perform()
            time.sleep(0.2)
            email_elem.send_keys(Keys.CONTROL + "a" if os.name == "nt" else Keys.COMMAND + "a")
            email_elem.send_keys(Keys.BACKSPACE)
            email_elem.send_keys(DEEPSEEK_EMAIL)
            print("✅ [۱] ایمیل با موفقیت در فیلد 'Phone number / email address' تایپ شد.")
        except Exception as e1:
            print(f"⚠️ تلاش برای تایپ ایمیل با اسکریپت: {e1}")
            d.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', {bubbles:true}));", email_elem, DEEPSEEK_EMAIL)
    else:
        print("❌ فیلد ایمیل پیدا نشد!")

    time.sleep(0.5)

    # ۲. شناسایی فیلد کلمه عبور (Password)
    pass_elem = None
    for sel in [
        "input[type='password']",
        "input[placeholder*='Password' i]",
    ]:
        try:
            elems = d.find_elements(By.CSS_SELECTOR, sel)
            for el in elems:
                if el.is_displayed() and el.is_enabled():
                    pass_elem = el
                    break
            if pass_elem:
                break
        except Exception:
            pass

    if not pass_elem:
        inputs = d.find_elements(By.TAG_NAME, "input")
        if len(inputs) > 1 and inputs[1].is_displayed():
            pass_elem = inputs[1]

    if pass_elem:
        try:
            ActionChains(d).move_to_element(pass_elem).click().perform()
            time.sleep(0.2)
            pass_elem.send_keys(Keys.CONTROL + "a" if os.name == "nt" else Keys.COMMAND + "a")
            pass_elem.send_keys(Keys.BACKSPACE)
            pass_elem.send_keys(DEEPSEEK_PASSWORD)
            print("✅ [۲] کلمه عبور با موفقیت در فیلد 'Password' تایپ شد.")
        except Exception as e2:
            print(f"⚠️ تلاش برای تایپ پسورد با اسکریپت: {e2}")
            d.execute_script("arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', {bubbles:true}));", pass_elem, DEEPSEEK_PASSWORD)
    else:
        print("❌ فیلد پسورد پیدا نشد!")

    time.sleep(0.5)

    # ۳. بررسی وجود هرگونه چک‌باکس قوانین در صورت وجود
    for cb in d.find_elements(By.CSS_SELECTOR, "input[type='checkbox'], .ds-checkbox, span[class*='checkbox']"):
        try:
            if cb.is_displayed():
                ActionChains(d).move_to_element(cb).click().perform()
                print("☑️ تیک قوانین زده شد.")
        except Exception:
            pass

    time.sleep(0.5)

    # ۴. کلیک روی دکمه آبی Log in
    login_btn = None
    for sel in [
        "//button[contains(normalize-space(), 'Log in') or contains(normalize-space(), 'Log In')]",
        "//div[contains(@class, 'button') and contains(., 'Log in')]",
        "button[type='submit']",
        ".ds-button--primary",
    ]:
        try:
            btns = d.find_elements(By.XPATH, sel) if sel.startswith("//") else d.find_elements(By.CSS_SELECTOR, sel)
            for b in btns:
                if b.is_displayed() and b.is_enabled():
                    login_btn = b
                    break
            if login_btn:
                break
        except Exception:
            pass

    if login_btn:
        print("🚀 [۳] در حال کلیک روی دکمه آبی 'Log in'...")
        try:
            ActionChains(d).move_to_element(login_btn).click().perform()
        except Exception:
            try:
                login_btn.click()
            except Exception:
                d.execute_script("arguments[0].click();", login_btn)
        print("✅ دکمه Log in فشرده شد!")
    else:
        # اگر دکمه پیدا نشد، Enter روی فیلد پسورد می‌زنیم
        if pass_elem:
            pass_elem.send_keys(Keys.ENTER)
            print("✅ کلید Enter روی فیلد پسورد فشرده شد.")


def ensure_logged_in_strict(d, max_wait_seconds=120):
    """هدایت به صفحه لاگین، ورود خودکار و انتظار برای ورود به چت"""
    # اگر هنوز در صفحه دیگریم یا لاگین نیستیم
    if check_if_logged_in(d):
        print("🎉 [تایید شد] حساب کاربری شما از قبل لاگین است و چت آماده دریافت سوالات است.")
        return True

    # باز کردن صفحه sign_in در صورت نیاز
    if not ("sign_in" in d.current_url or "chat.deepseek.com" in d.current_url):
        d.get(SIGN_IN_URL)
        time.sleep(2)

    # اجرای اتوماسیون ورود
    perform_signin_automation(d)

    print("⏳ در حال مانیتورینگ انتقال به صفحه چت DeepSeek...")
    start_time = time.time()
    captcha_alerted = False

    while time.time() - start_time < max_wait_seconds:
        time.sleep(2)
        if check_if_logged_in(d):
            print("=" * 70)
            print("🎉 لاگین به DeepSeek با موفقیت انجام و تایید شد!")
            print("🤖 هوش مصنوعی آماده پاسخگویی به سوالات عیب‌یابی است.")
            print("=" * 70)
            return True

        # بررسی کپچا
        for sel in ("iframe[src*='geetest']", "iframe[src*='captcha']", ".geetest_holder", ".cf-turnstile", "[class*='captcha']"):
            try:
                cap_els = d.find_elements(By.CSS_SELECTOR, sel)
                if cap_els and any(c.is_displayed() for c in cap_els):
                    if not captcha_alerted:
                        print("⚠️ [توجه] پازل کشویی امنیتی در پنجره کروم ظاهر شده است.")
                        print("👉 لطفاً پازل امنیتی را در کروم حل کنید تا ورود تایید شود.")
                        captcha_alerted = True
            except Exception:
                pass

        # اگر بعد از ۱۰ ثانیه هنوز در sign_in بود و اروری نداده بود، مجدداً فرم را چک کنیم
        if time.time() - start_time > 15 and "sign_in" in d.current_url and not captcha_alerted:
            print("🔄 بررسی مجدد و ارسال فرم لاگین...")
            perform_signin_automation(d)
            time.sleep(5)

    return False


def launch_visible_chrome():
    """راه‌اندازی پنجره بزرگ Google Chrome با پورت دیباگ ۹۲۲۲"""
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
        SIGN_IN_URL
    ]
    if proxy:
        cmd.append(f"--proxy-server={proxy}")

    print(f"🚀 در حال باز کردن پنجره Google Chrome به آدرس {SIGN_IN_URL}")
    try:
        _chrome_process = subprocess.Popen(cmd)
        for _ in range(30):
            if port_is_listening("127.0.0.1", DEBUG_PORT):
                print(f"✅ پنجره Google Chrome باز شد (پورت دیباگ {DEBUG_PORT} فعال است).")
                return True
            time.sleep(0.3)
    except Exception as e:
        print(f"⚠️ اجرای مستقیم کروم با خطا مواجه شد: {e}")

    return False


def get_driver():
    """ایجاد یا اتصال به WebDriver کروم و لاگین قطعی"""
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

    # روش ۱: باز کردن کروم و اتصال از طریق Debugger Address
    if launch_visible_chrome():
        try:
            opts = webdriver.ChromeOptions()
            opts.add_experimental_option("debuggerAddress", f"127.0.0.1:{DEBUG_PORT}")
            _driver = webdriver.Chrome(options=opts)
            print("🌐 [سلنیوم] وب‌درایور به پنجره باز کروم متصل شد!")
            ensure_logged_in_strict(_driver)
            return _driver
        except Exception as e:
            print(f"⚠️ اتصال به پورت دیباگ با خطا مواجه شد ({e})، تلاش با وب‌درایور استاندارد...")

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
        _driver.get(SIGN_IN_URL)
        ensure_logged_in_strict(_driver)
        print("🌐 [سلنیوم] پنجره کروم با سلنیوم باز شد.")
        return _driver
    except Exception as e2:
        print(f"⚠️ روش دوم: {e2}. تلاش با پروفایل موقت...")

    # روش ۳: پروفایل موقت
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
        _driver.get(SIGN_IN_URL)
        ensure_logged_in_strict(_driver)
        return _driver
    except Exception as e3:
        print(f"⚠️ تلاش سوم: {e3}")

    raise RuntimeError("عدم موفقیت در باز کردن پنجره Google Chrome. لطفاً مطمئن شوید کروم نصب است و پنجره‌های قبلی را ببندید.")


def find_input_box(d, timeout=60):
    def probe(_):
        for sel in ("textarea#chat-input", "textarea[placeholder*='DeepSeek']", "textarea[placeholder*='Send']", "textarea", "div[contenteditable='true']", "[role='textbox']"):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed() and el.is_enabled():
                    return el
        return False

    return WebDriverWait(d, timeout).until(probe)


def get_messages(d):
    for sel in (".ds-markdown", "[class*='markdown']", "[class*='message-content']", "[class*='message']"):
        els = d.find_elements(By.CSS_SELECTOR, sel)
        if els:
            return [e.text for e in els if e.text.strip()]
    return []


def ask_deepseek(prompt: str) -> str:
    d = get_driver()

    if not check_if_logged_in(d):
        print("⚠️ کاربر در صفحه چت نیست. اقدام برای بررسی و تکمیل لاگین...")
        if not ensure_logged_in_strict(d, max_wait_seconds=60):
            raise RuntimeError("ابتدا باید وارد حساب DeepSeek شوید. لطفاً لاگین را تکمیل نمایید.")

    print("📩 [سلنیوم] در حال تایپ و ارسال سوال به DeepSeek در پنجره کروم...")
    box = find_input_box(d)
    before_count = len(get_messages(d))

    try:
        ActionChains(d).move_to_element(box).click().perform()
    except Exception:
        pass

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
    print("⏳ [سلنیوم] منتظر دریافت پاسخ هوش مصنوعی از صفحه چت...")

    deadline = time.time() + ANSWER_TIMEOUT
    last, stable = "", 0
    while time.time() < deadline:
        time.sleep(1.5)
        msgs = get_messages(d)
        cur = msgs[-1] if len(msgs) > before_count else ""
        if cur and cur == last:
            stable += 1
            if stable >= 3:
                print("📥 [سلنیوم] پاسخ مدل DeepSeek با موفقیت دریافت شد!")
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
@app.get("/v1/login-status")
def health_and_login():
    global _driver
    if _driver is not None:
        try:
            check_if_logged_in(_driver)
        except Exception:
            pass

    return jsonify({
        "ok": True,
        "bridge": "deepseek-selenium-chrome",
        "port": PORT,
        "chrome_binary": find_chrome_binary(),
        "driver_ready": _driver is not None,
        "login_status": LOGIN_STATUS,
        "proxy": detect_local_proxy(),
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
    print("  🌐 پل وب DeepSeek (اتوماسیون مستقیم صفحه chat.deepseek.com/sign_in)")
    print(f"  ایمیل ورود:    {DEEPSEEK_EMAIL}")
    print(f"  رمز عبور:      ********")
    print(f"  آدرس پل:       http://localhost:{PORT}/v1")
    proxy = detect_local_proxy()
    if proxy:
        print(f"  🛡️ پروکسی شناسایی‌شده: {proxy}")
    print("=" * 70)

    try:
        get_driver()
    except Exception as e:
        print(f"ℹ️ وضعیت اولیه مرورگر: {e}")

    app.run(host="127.0.0.1", port=PORT, threaded=True)
