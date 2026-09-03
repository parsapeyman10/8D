# -*- coding: utf-8 -*-
"""
پل وب اختصاصی DeepSeek — اتصال زنده و اتوماسیون ۱۰۰٪ سلنیومی در Google Chrome
==============================================================================
این ماژول از وب‌درایور رسمی Selenium WebDriver (پایتون) برای کنترل مرورگر
گوگل کروم استفاده می‌کند. کلیه مراحل باز کردن تب، ورود به صفحه چت، سوئیچ به
فرم پسورد، تایپ نام کاربری و کلمه عبور، پذیرش تیک قوانین، کلیک دکمه ورود،
و ارسال/دریافت پاسخ‌ها از طریق ابزارهای بومی سلنیوم انجام می‌پذیرد.

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
    "message": "در حال بررسی و اجرای اتوماسیون سلنیوم...",
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
    """بررسی دقیق و مطمئن اینکه آیا کاربر در DeepSeek لاگین شده است یا خیر"""
    try:
        # ۱. بررسی وجود چت‌باکس اصلی
        for sel in (
            "textarea#chat-input",
            "textarea[placeholder*='DeepSeek']",
            "textarea[placeholder*='Send']",
            "div[contenteditable='true']",
            ".ds-chat-input",
            "#chat-input"
        ):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed():
                    LOGIN_STATUS["logged_in"] = True
                    LOGIN_STATUS["last_check"] = time.strftime("%Y-%m-%d %H:%M:%S")
                    LOGIN_STATUS["message"] = "لاگین تایید و احراز هویت شد."
                    return True

        # ۲. بررسی سایدبار یا پروفایل کاربر
        for sel in (".ds-avatar", "[class*='avatar']", "[class*='user-profile']", ".ds-sidebar", "[class*='sidebar']"):
            els = d.find_elements(By.CSS_SELECTOR, sel)
            if els and any(e.is_displayed() for e in els):
                login_btns = d.find_elements(By.XPATH, "//button[contains(., 'Log In') or contains(., 'Sign in') or contains(., 'ورود')]")
                if not any(b.is_displayed() for b in login_btns):
                    LOGIN_STATUS["logged_in"] = True
                    LOGIN_STATUS["last_check"] = time.strftime("%Y-%m-%d %H:%M:%S")
                    LOGIN_STATUS["message"] = "لاگین تایید شد."
                    return True

        # ۳. بررسی LocalStorage
        try:
            user_token = d.execute_script("return localStorage.getItem('userToken') || localStorage.getItem('token') || sessionStorage.getItem('token');")
            if user_token:
                LOGIN_STATUS["logged_in"] = True
                LOGIN_STATUS["message"] = "توکن احراز هویت در مرورگر فعال است."
                return True
        except Exception:
            pass

    except Exception as e:
        print(f"ℹ️ بررسی لاگین: {e}")

    LOGIN_STATUS["logged_in"] = False
    LOGIN_STATUS["message"] = "هنوز وارد نشده‌اید یا فرم لاگین باز است."
    return False


def ensure_logged_in_strict(d, max_wait_seconds=120):
    """
    اجرای اتوماسیون کامل ورود سلنیومی:
    ۱. ناوبری به chat.deepseek.com
    ۲. کلیک روی دکمه ورود و تب Password
    ۳. تایپ نام کاربری و پسورد با Selenium Keys
    ۴. کلیک روی چک‌باکس قوانین و دکمه Submit با ActionChains
    ۵. انتظار برای تایید نهایی
    """
    print("=" * 70)
    print("🤖 [اتوماسیون سلنیوم] در حال بررسی و انجام لاگین در DeepSeek...")
    print(f"📧 ایمیل:    {DEEPSEEK_EMAIL}")
    print("🔑 کلمه عبور: ********")
    print("=" * 70)

    if not d.current_url.startswith("https://chat.deepseek.com"):
        d.get(CHAT_URL)
        time.sleep(3)

    if check_if_logged_in(d):
        print("🎉 [سلنیوم] احراز هویت کاربر قبلاً انجام شده و چت آماده است!")
        return True

    print("🔐 فرم ورود به حساب کاربری شناسایی شد. اجرای خودکار فرم لاگین با سلنیوم...")

    # ۱. کلیک دکمه لاگین در صورت وجود
    try:
        login_triggers = d.find_elements(By.XPATH, "//button[contains(., 'Log In') or contains(., 'Log in') or contains(., 'Sign in') or contains(., 'ورود')]")
        for btn in login_triggers:
            if btn.is_displayed():
                ActionChains(d).move_to_element(btn).click().perform()
                print("🖱️ [سلنیوم] روی دکمه ورود کلیک شد.")
                time.sleep(1)
                break
    except Exception:
        pass

    # ۲. سوئیچ به تب Password Login با سلنیوم
    password_tab_found = False
    for xpath in [
        "//div[contains(text(), 'Password') or contains(text(), 'رمز') or contains(text(), 'Log in with password')]",
        "//button[contains(text(), 'Password') or contains(text(), 'Log in with password')]",
        "//span[contains(text(), 'Password') or contains(text(), 'رمز')]",
        "//div[contains(@class, 'tab') and contains(., 'Password')]",
        "//div[@role='tab' and contains(., 'Password')]",
    ]:
        try:
            tabs = d.find_elements(By.XPATH, xpath)
            for tab in tabs:
                if tab.is_displayed():
                    ActionChains(d).move_to_element(tab).click().perform()
                    print("🔘 [سلنیوم] تب 'ورود با پسورد' انتخاب شد.")
                    password_tab_found = True
                    time.sleep(0.5)
                    break
            if password_tab_found:
                break
        except Exception:
            pass

    # ۳. تایپ ایمیل با سلنیوم
    email_entered = False
    for sel in [
        "input[type='email']",
        "input[placeholder*='email' i]",
        "input[placeholder*='phone' i]",
        "input[placeholder*='ایمیل' i]",
        "input[placeholder*='Please enter' i]",
        "input[type='text']",
    ]:
        try:
            boxes = d.find_elements(By.CSS_SELECTOR, sel)
            for box in boxes:
                if box.is_displayed() and box.is_enabled():
                    ActionChains(d).move_to_element(box).click().perform()
                    box.send_keys(Keys.CONTROL + "a" if os.name == "nt" else Keys.COMMAND + "a")
                    box.send_keys(Keys.BACKSPACE)
                    box.send_keys(DEEPSEEK_EMAIL)
                    print(f"⌨️ [سلنیوم] ایمیل '{DEEPSEEK_EMAIL}' در فیلد ورودی تایپ شد.")
                    email_entered = True
                    time.sleep(0.4)
                    break
            if email_entered:
                break
        except Exception:
            pass

    # ۴. تایپ کلمه عبور با سلنیوم
    password_entered = False
    for box in d.find_elements(By.CSS_SELECTOR, "input[type='password']"):
        try:
            if box.is_displayed() and box.is_enabled():
                ActionChains(d).move_to_element(box).click().perform()
                box.send_keys(Keys.CONTROL + "a" if os.name == "nt" else Keys.COMMAND + "a")
                box.send_keys(Keys.BACKSPACE)
                box.send_keys(DEEPSEEK_PASSWORD)
                print("⌨️ [سلنیوم] کلمه عبور تایپ شد.")
                password_entered = True
                time.sleep(0.4)
                break
        except Exception:
            pass

    # ۵. زدن تیک موافقت با قوانین با سلنیوم
    for sel in [
        "input[type='checkbox']",
        ".ds-checkbox",
        ".ds-checkbox__box",
        "span[class*='checkbox']",
        "div[class*='checkbox']",
    ]:
        try:
            cbs = d.find_elements(By.CSS_SELECTOR, sel)
            for cb in cbs:
                if cb.is_displayed():
                    try:
                        ActionChains(d).move_to_element(cb).click().perform()
                    except Exception:
                        d.execute_script("arguments[0].click();", cb)
                    print("☑️ [سلنیوم] تیک موافقت با قوانین زده شد.")
                    time.sleep(0.3)
                    break
        except Exception:
            pass

    # ۶. کلیک روی دکمه تایید نهایی و ورود با سلنیوم
    for sel in [
        "button[type='submit']",
        ".ds-button--primary",
        "//button[contains(., 'Log In') or contains(., 'Log in') or contains(., 'Sign in') or contains(., 'ورود')]",
        "div[class*='button'][class*='primary']",
    ]:
        try:
            btns = d.find_elements(By.XPATH, sel) if sel.startswith("//") else d.find_elements(By.CSS_SELECTOR, sel)
            for btn in btns:
                if btn.is_displayed() and btn.is_enabled():
                    try:
                        ActionChains(d).move_to_element(btn).click().perform()
                    except Exception:
                        d.execute_script("arguments[0].click();", btn)
                    print("🚀 [سلنیوم] دکمه ورود (Log In) کلیک شد.")
                    time.sleep(1.5)
                    break
        except Exception:
            pass

    # ۷. مانیتورینگ وضعیت تا ورود قطعی
    print("⏳ [سلنیوم] در حال نظارت بر بارگذاری چت و تایید نهایی ورود...")
    start_time = time.time()
    captcha_notified = False

    while time.time() - start_time < max_wait_seconds:
        time.sleep(2)
        if check_if_logged_in(d):
            print("=" * 70)
            print("🎉 [سلنیوم] لاگین با موفقیت تایید شد! هوش مصنوعی آماده پاسخگویی است.")
            print("=" * 70)
            return True

        for sel in ("iframe[src*='geetest']", "iframe[src*='captcha']", ".geetest_holder", ".cf-turnstile", "[class*='captcha']"):
            try:
                cap_els = d.find_elements(By.CSS_SELECTOR, sel)
                if cap_els and any(c.is_displayed() for c in cap_els):
                    if not captcha_notified:
                        print("⚠️ [توجه] چالش امنیتی (کپچا / پازل کشویی) در پنجره کروم ظاهر شد.")
                        print("👉 لطفاً پازل را در پنجره کروم بکشید تا لاگین تکمیل شود.")
                        captcha_notified = True
            except Exception:
                pass

    print("⚠️ هشدار: ورود در مهلت زمانی تایید نشد.")
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
        for _ in range(30):
            if port_is_listening("127.0.0.1", DEBUG_PORT):
                print(f"✅ پنجره Google Chrome باز شد (پورت دیباگ {DEBUG_PORT} فعال است).")
                return True
            time.sleep(0.3)
    except Exception as e:
        print(f"⚠️ اجرای مستقیم کروم با خطا مواجه شد: {e}")

    return False


def get_driver():
    """اتصال یا ایجاد WebDriver کروم و اطمینان از لاگین"""
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

    # روش ۱: اتصال سلنیوم به پنجره کروم باز شده
    if launch_visible_chrome():
        try:
            opts = webdriver.ChromeOptions()
            opts.add_experimental_option("debuggerAddress", f"127.0.0.1:{DEBUG_PORT}")
            _driver = webdriver.Chrome(options=opts)
            print("🌐 [سلنیوم] وب‌درایور با موفقیت به پنجره کروم متصل گردید!")
            ensure_logged_in_strict(_driver)
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
        ensure_logged_in_strict(_driver)
        print("🌐 [سلنیوم] پنجره کروم با وب‌درایور باز شد.")
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
        print("⚠️ عدم احراز لاگین قبل از ارسال پیام. اقدام مجدد با سلنیوم...")
        if not ensure_logged_in_strict(d, max_wait_seconds=60):
            raise RuntimeError("ابتدا باید وارد حساب DeepSeek شوید. لطفاً لاگین را تایید نمایید.")

    print("📩 [سلنیوم] در حال تایپ و ارسال سوال به پنجره DeepSeek در کروم...")
    box = find_input_box(d)
    before_count = len(get_messages(d))

    # تایپ با سلنیوم
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
                print("📥 [سلنیوم] پاسخ مدل DeepSeek دریافت شد!")
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
    print("  🌐 پل وب DeepSeek (اتوماسیون کامل سلنیوم در Google Chrome)")
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
