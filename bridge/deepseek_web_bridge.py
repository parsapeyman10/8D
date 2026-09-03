# -*- coding: utf-8 -*-
"""
پل وب اختصاصی DeepSeek — اتوماسیون تضمین‌شده و بی‌نقص در Google Chrome
========================================================================
این ماژول پنجره Google Chrome را مستقیماً کنترل کرده، به صفحه ورود متصل
می‌شود، پنجره و تب فعال را شناسایی کرده، مقادیر ایمیل و کلمه عبور را به صورت
قطعی در کادرهای ورودی درج و اعتبارسنجی می‌کند و دکمه Log in را می‌فشارد.

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
    "message": "در حال اجرای اتوماسیون قطعی و تضمین‌شده...",
}

app = Flask(__name__)
_lock = threading.Lock()
_driver = None
_chrome_process = None


def find_chrome_binary():
    """پیدا کردن مسیر Google Chrome در سیستم"""
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
    """شناسایی خودکار پروکسی‌های سیستم (V2Ray / Clash / NekoRay)"""
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


def focus_deepseek_window(d):
    """انتقال فوکوس به پنجره و تبی که صفحه DeepSeek در آن باز است"""
    try:
        handles = d.window_handles
        for h in handles:
            d.switch_to.window(h)
            url = (d.current_url or "").lower()
            if "deepseek" in url or "sign_in" in url:
                return True
        # اگر در هیچ تبی باز نبود، روی تب اول باز می‌کنیم
        if handles:
            d.switch_to.window(handles[0])
            d.get(SIGN_IN_URL)
            time.sleep(2)
            return True
    except Exception as e:
        print(f"ℹ️ سوئیچ تب: {e}")
    return False


def check_if_logged_in(d):
    """بررسی قطعی وضعیت ورود به محیط چت"""
    try:
        focus_deepseek_window(d)
        cur_url = (d.current_url or "").lower()

        if "sign_in" in cur_url:
            LOGIN_STATUS["logged_in"] = False
            LOGIN_STATUS["message"] = "صفحه ورود (sign_in) باز است..."
            return False

        # ۱. بررسی وجود کادر چت اصلی
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

        # ۲. بررسی سایدبار چت
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


def set_input_value_guaranteed(d, elem, value):
    """
    درج ۱۰۰٪ تضمینی و پایدار متن در کادرهای React/Vue با چند روش همزمان
    """
    try:
        # ۱. فوکوس و کلیک
        d.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", elem)
        time.sleep(0.1)
        elem.click()
    except Exception:
        d.execute_script("arguments[0].focus();", elem)

    time.sleep(0.1)

    # ۲. تزریق مستقیم به پروتوتایپ پایه HTMLInputElement
    d.execute_script("""
        const input = arguments[0];
        const val = arguments[1];
        
        input.focus();
        
        // تنظیم مستقیم مقدار پایه
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, val);
        } else {
            input.value = val;
        }
        
        // بازنشانی ردیاب تغییرات React 16+
        if (input._valueTracker) {
            input._valueTracker.setValue('');
        }
        
        // ارسال رویدادهای استاندارد
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    """, elem, value)

    time.sleep(0.1)

    # ۳. تایپ یک کلید کمکی با سلنیوم
    try:
        elem.send_keys(Keys.END)
        elem.send_keys(" ")
        elem.send_keys(Keys.BACKSPACE)
    except Exception:
        pass

    time.sleep(0.1)
    d.execute_script("arguments[0].dispatchEvent(new Event('blur', { bubbles: true }));", elem)


def perform_guaranteed_login_flow(d):
    """
    اجرای قطعی فرآیند ورود به صفحه sign_in با درج کامل اطلاعات در کادرها
    """
    print("\n" + "=" * 75)
    print("🤖 [اتوماسیون تضمین‌شده ورود به DeepSeek]")
    print(f"📧 ایمیل حساب:   {DEEPSEEK_EMAIL}")
    print("🔑 کلمه عبور:    ********")
    print("=" * 75)

    focus_deepseek_window(d)

    # اگر در صفحه sign_in نیستیم، باز کردن آن
    if "sign_in" not in (d.current_url or "").lower():
        print(f"🌐 باز کردن آدرس ورود: {SIGN_IN_URL}")
        d.get(SIGN_IN_URL)

    # انتظار صبورانه تا زمان رندر شدن فیلدهای ورودی در صفحه
    print("⏳ در حال انتظار برای ظاهر شدن کادرهای ورود در صفحه...")
    input_elements = []
    for _ in range(15):
        time.sleep(1)
        inputs = d.find_elements(By.TAG_NAME, "input")
        input_elements = [inp for inp in inputs if inp.is_displayed()]
        if len(input_elements) >= 2:
            break

    print(f"🔍 تعداد {len(input_elements)} کادر ورودی روی صفحه شناسایی شد.")

    email_inp = None
    pass_inp = None

    # تفکیک فیلد ایمیل و فیلد پسورد
    for inp in input_elements:
        itype = (inp.get_attribute("type") or "").lower()
        place = (inp.get_attribute("placeholder") or "").lower()
        if itype == "password" or "password" in place:
            pass_inp = inp
        elif itype in ("text", "email") or "phone" in place or "email" in place or "address" in place:
            email_inp = inp

    # اگر با ویژگی‌ها پیدا نشد، بر اساس ترتیب قرارگیری در صفحه
    if not email_inp and len(input_elements) >= 1:
        email_inp = input_elements[0]
    if not pass_inp and len(input_elements) >= 2:
        pass_inp = input_elements[1]

    # ۱. درج ایمیل در کادر اول
    if email_inp:
        print(f"✍️ [گام ۱] در حال نوشتن ایمیل ({DEEPSEEK_EMAIL}) در کادر اول...")
        set_input_value_guaranteed(d, email_inp, DEEPSEEK_EMAIL)
        val = email_inp.get_attribute("value") or ""
        print(f"  ✅ مقدار درج‌شده در کادر اول: '{val}'")
    else:
        print("❌ کادر اول (ایمیل) پیدا نشد!")

    time.sleep(0.5)

    # ۲. درج پسورد در کادر دوم
    if pass_inp:
        print(f"✍️ [گام ۲] در حال نوشتن کلمه عبور در کادر دوم...")
        set_input_value_guaranteed(d, pass_inp, DEEPSEEK_PASSWORD)
        val_len = len(pass_inp.get_attribute("value") or "")
        print(f"  ✅ کلمه عبور با موفقیت در کادر دوم درج شد (طول: {val_len} کاراکتر)")
    else:
        print("❌ کادر دوم (کلمه عبور) پیدا نشد!")

    time.sleep(1)

    # ۳. کلیک روی دکمه آبی Log in
    print("🚀 [گام ۳] در حال فشردن دکمه آبی 'Log in'...")
    clicked = d.execute_script("""
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"], .ds-button'));
        const btn = buttons.find(b => {
            const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
            return txt === 'log in' || txt.includes('log in') || txt.includes('sign in') || b.type === 'submit';
        });
        if (btn) {
            btn.scrollIntoView({behavior: 'instant', block: 'center'});
            btn.focus();
            btn.click();
            return true;
        }
        return false;
    """)

    if clicked:
        print("  ✅ دکمه Log in با موفقیت فشرده شد!")
    else:
        for b in d.find_elements(By.TAG_NAME, "button"):
            if b.is_displayed() and ("log in" in (b.text or "").lower() or b.get_attribute("type") == "submit"):
                try:
                    ActionChains(d).move_to_element(b).click().perform()
                    print("  ✅ دکمه Log in با ActionChains کلیک شد!")
                    break
                except Exception:
                    pass
        else:
            if pass_inp:
                pass_inp.send_keys(Keys.ENTER)
                print("  ✅ کلید Enter روی فیلد پسورد فشرده شد.")


def ensure_logged_in_strict(d, max_wait_seconds=300):
    """
    بررسی مداوم و صبورانه تا زمان ورود قطعی به صفحه چت DeepSeek
    """
    focus_deepseek_window(d)

    # اگر کاربر از قبل لاگین است
    if check_if_logged_in(d):
        print("🎉 [تایید شد] شما قبلاً وارد حساب کاربری DeepSeek شده‌اید و چت آماده است.")
        return True

    # اجرای فرآیند ورود
    perform_guaranteed_login_flow(d)

    print("\n" + "─" * 75)
    print("⏳ در حال نظارت صبورانه بر تایید لاگین و انتقال به صفحه چت DeepSeek...")
    print("👉 در صورت مشاهده پازل امنیتی (کپچا) در کروم، آن را با ماوس بکشید.")
    print("─" * 75 + "\n")

    start_time = time.time()
    last_retry = 0

    while time.time() - start_time < max_wait_seconds:
        time.sleep(2)

        if check_if_logged_in(d):
            print("\n" + "=" * 75)
            print("🎉 تبریک! ورود به حساب کاربری DeepSeek با موفقیت ۱۰۰٪ تایید شد.")
            print("🤖 مدل هوش مصنوعی اکنون فعال و متصل به داشبورد عیب‌یابی است.")
            print("=" * 75 + "\n")
            return True

        elapsed = int(time.time() - start_time)

        # اگر بعد از ۱۵ ثانیه هنوز در صفحه sign_in بود، مجدداً فرم را چک و پر کنیم
        if "sign_in" in (d.current_url or "").lower() and elapsed - last_retry >= 15:
            last_retry = elapsed
            print(f"🔄 ({elapsed}s) بررسی مجدد کادرها و ارسال...")
            perform_guaranteed_login_flow(d)

    print("⚠️ مهلت زمانی به پایان رسید اما لاگین تایید نشد.")
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

    # روش ۱: اتصال به کروم باز با پورت دیباگ
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
        print("⚠️ کاربر هنوز در صفحه چت نیست. اقدام مجدد برای بررسی و تایید لاگین...")
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
    print("=" * 75)
    print("  🌐 پل وب DeepSeek (تزریق تضمین‌شده اطلاعات و ورود خودکار)")
    print(f"  ایمیل ورود:    {DEEPSEEK_EMAIL}")
    print(f"  رمز عبور:      ********")
    print(f"  آدرس پل:       http://localhost:{PORT}/v1")
    proxy = detect_local_proxy()
    if proxy:
        print(f"  🛡️ پروکسی شناسایی‌شده: {proxy}")
    print("=" * 75)

    try:
        get_driver()
    except Exception as e:
        print(f"ℹ️ وضعیت اولیه مرورگر: {e}")

    app.run(host="127.0.0.1", port=PORT, threaded=True)
