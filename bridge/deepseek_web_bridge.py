# -*- coding: utf-8 -*-
"""
پل وب DeepSeek — بدون کلید API
================================
این سرویس یک مرورگر کروم واقعی باز می‌کند، به chat.deepseek.com می‌رود،
سوال را در چت تایپ می‌کند، جواب را برمی‌دارد و به اپ عیب‌یابی تحویل می‌دهد.

خودش را شبیه یک «سرور مدل لوکال» (سازگار با OpenAI) نشان می‌دهد، بنابراین
در اپ کافی است: ⚙️ تنظیمات مدل → «مدل لوکال» → آدرس: http://localhost:8765/v1

نصب و اجرا:
    pip install selenium flask
    python deepseek_web_bridge.py

بار اول: پنجره کروم باز می‌شود → یک بار در chat.deepseek.com وارد شوید (لاگین).
لاگین در پروفایل ذخیره می‌شود و دفعات بعد لازم نیست.

⚠️ توجه:
- پنجره کروم را در طول کار نبندید.
- «DeepThink» را در سایت خاموش نگه دارید (پاسخ سریع‌تر و تمیزتر).
- این روش کندتر از API است و اگر دیپ‌سیک ظاهر سایتش را عوض کند ممکن است
  نیاز به به‌روزرسانی داشته باشد. برای استفاده جدی، API رسمی مطمئن‌تر است.
"""

import json
import os
import threading
import time
import uuid

from flask import Flask, jsonify, request
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait

PORT = int(os.environ.get("BRIDGE_PORT", "8765"))
CHAT_URL = "https://chat.deepseek.com/"
PROFILE_DIR = os.path.join(os.path.expanduser("~"), ".deepseek_web_profile")
ANSWER_TIMEOUT = int(os.environ.get("ANSWER_TIMEOUT", "300"))  # ثانیه

app = Flask(__name__)
_lock = threading.Lock()   # هم‌زمان فقط یک سوال
_driver = None


# ---------------------------------------------------------------- مرورگر
def get_driver():
    global _driver
    if _driver is not None:
        try:
            _driver.title  # زنده است؟
            return _driver
        except Exception:
            _driver = None

    opts = webdriver.ChromeOptions()
    opts.add_argument(f"--user-data-dir={PROFILE_DIR}")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_argument("--start-maximized")
    _driver = webdriver.Chrome(options=opts)  # Selenium 4.6+ درایور را خودش دانلود می‌کند
    _driver.get(CHAT_URL)
    print("🌐 کروم باز شد. اگر صفحه ورود می‌بینید، همین یک بار وارد شوید و منتظر بمانید...")
    return _driver


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
    raise TimeoutError("پاسخی از سایت دریافت نشد (تایم‌اوت). لاگین بودن و باز بودن پنجره کروم را بررسی کنید.")


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
    # یادآوری JSON برای خروجی تمیز (پرامپت‌های اپ خودشان JSON می‌خواهند)
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
    print("=" * 60)
    print("  🌉 پل وب DeepSeek (بدون کلید API)")
    print(f"  آدرس برای اپ:  http://localhost:{PORT}/v1")
    print("  در اپ: ⚙️ تنظیمات مدل → مدل لوکال → همین آدرس")
    print("=" * 60)
    get_driver()  # مرورگر از همان اول باز شود تا کاربر لاگین کند
    app.run(host="127.0.0.1", port=PORT, threaded=True)
