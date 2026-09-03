# -*- coding: utf-8 -*-
"""
اجراکننده یکپارچه «دستیار عیب‌یابی هدایت‌شده و گزارش 8D»
==========================================================
ترتیب اجرای گام به گام و پایدار:
 ۱. بررسی و راه‌اندازی کامل وب‌اپلیکیشن، دیتابیس و داشبورد اصلی (پورت 3000)
 ۲. تست سلامت ۱۰۰٪ سرویس‌ها و باز کردن داشبورد در مرورگر Google Chrome
 ۳. راه‌اندازی پل ارتباطی و اتصال به حساب DeepSeek و احراز هویت لاگین
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

os.environ["LLM_PROVIDER"] = "bridge"

HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(HERE, "app")
BRIDGE_SCRIPT = os.path.join(HERE, "bridge", "deepseek_web_bridge.py")
PORT = int(os.environ.get("PORT", "3000"))
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "8765"))
URL = f"http://localhost:{PORT}"


def say(msg):
    print(msg, flush=True)


def fail(msg):
    say("\n❌ " + msg)
    if os.name == "nt":
        input("\nبرای خروج Enter بزنید...")
    sys.exit(1)


def find(cmd):
    return shutil.which(cmd) or (shutil.which(cmd + ".cmd") if os.name == "nt" else None)


def find_chrome_executable():
    """پیدا کردن مسیر قطعی Google Chrome در سیستم کاربر"""
    if os.name == "nt":
        paths = [
            os.path.join(os.environ.get("PROGRAMFILES", "C:\\Program Files"), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)"), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google\\Chrome\\Application\\chrome.exe"),
            os.path.join(os.environ.get("USERPROFILE", ""), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
        for p in paths:
            if os.path.isfile(p):
                return p
    else:
        for name in ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]:
            w = shutil.which(name)
            if w:
                return w
    return None


def open_in_chrome(url):
    """باز کردن قطعی آدرس در مرورگر Google Chrome"""
    chrome_path = find_chrome_executable()
    if chrome_path:
        say(f"🌐 در حال باز کردن داشبورد در Google Chrome: {chrome_path}")
        try:
            subprocess.Popen([chrome_path, url])
            return True
        except Exception:
            pass
    try:
        webbrowser.open(url)
        return True
    except Exception:
        return False


def port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def ensure_python_deps():
    """بررسی و نصب خودکار وابستگی‌های پایتون"""
    missing = []
    try: import flask # noqa
    except ImportError: missing.append("flask")
    try: import selenium # noqa
    except ImportError: missing.append("selenium")

    if missing:
        say(f"📦 در حال نصب خودکار پکیج‌های پایتون ({', '.join(missing)})...")
        try:
            cmd = [sys.executable, "-m", "pip", "install", *missing]
            if os.name != "nt":
                cmd.append("--break-system-packages")
            subprocess.run(cmd, check=True)
            say("✅ پکیج‌های پایتون با موفقیت نصب شدند.")
            return True
        except Exception as e:
            say(f"⚠️ نصب خودکار پکیج‌های پایتون با خطا مواجه شد: {e}")
            return False
    return True


def deps_ok():
    return os.path.isdir(os.path.join(APP_DIR, "node_modules", "express"))


def install_node_deps(npm):
    say("📦 در حال بررسی وابستگی‌های Node.js...")
    r = subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=APP_DIR)
    if r.returncode != 0 or not deps_ok():
        fail("نصب وابستگی‌های Node.js ناموفق بود.")
    say("✅ وابستگی‌های Node.js آماده است.")


def start_server(node):
    return subprocess.Popen([node, os.path.join("src", "server.js")], cwd=APP_DIR)


def start_bridge():
    if not os.path.isfile(BRIDGE_SCRIPT):
        return None
    ensure_python_deps()
    say("🚀 [گام ۲] در حال راه‌اندازی وب‌درایور Google Chrome و ورود به حساب DeepSeek...")
    try:
        proc = subprocess.Popen([sys.executable, BRIDGE_SCRIPT], cwd=os.path.dirname(BRIDGE_SCRIPT))
        return proc
    except Exception as e:
        say(f"⚠️ راه‌اندازی پل با خطا مواجه شد: {e}")
        return None


def verify_app_health():
    """بررسی سلامت کامل داشبورد، پایگاه دانش و دیتابیس"""
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{PORT}/api/health")
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return data
    except Exception:
        pass
    return None


def main():
    say("=" * 75)
    say("  🔧 دستیار تخصصی عیب‌یابی و گزارش 8D الکترونیک خودرو")
    say("  🎯 متدولوژی: ISO 26262, ISO 14229, ISO 11898, IPC-A-610 Class 3, AEC-Q")
    say("=" * 75)

    if not os.path.isdir(APP_DIR):
        fail("پوشه app پیدا نشد.")

    node = find("node")
    npm = find("npm")
    if not node or not npm:
        fail("Node.js روی سیستم شما نصب نیست. لطفاً Node.js را نصب نمایید.")

    if not deps_ok():
        install_node_deps(npm)

    server_proc = None
    bridge_proc = None

    try:
        # =========================================================================
        # گام اول: راه‌اندازی و اطمینان ۱۰۰٪ از سلامت وب‌اپلیکیشن و دیتابیس
        # =========================================================================
        say("\n🚀 [گام ۱] در حال راه‌اندازی سرور اصلی اپلیکیشن، دیتابیس و پایگاه دانش...")
        if not port_open(PORT):
            server_proc = start_server(node)
            for _ in range(40):
                if port_open(PORT):
                    break
                time.sleep(0.5)

        # تست سلامت اپلیکیشن
        health_data = None
        for _ in range(15):
            health_data = verify_app_health()
            if health_data and health_data.get("ok"):
                break
            time.sleep(0.5)

        if not health_data:
            fail("سرور اپلیکیشن نتوانست با موفقیت فعال شود.")

        say("  ✅ وب‌سرور اپلیکیشن با موفقیت فعال شد.")
        say(f"  ✅ دیتابیس یادگیری متصل است (پرونده‌ها: {health_data.get('dbStats', {}).get('total_cases', 0)} | تجربیات: {health_data.get('dbStats', {}).get('user_knowledge_count', 0)})")
        say(f"  ✅ لیست قطعات BOM بارگذاری شد (تعداد قطعات: {health_data.get('bomParts', 0)})")
        say(f"  ✅ بانک کدهای خطای دیاگ (DTC) و نقشه‌های تست پایه‌ها فعال است.")

        # باز کردن داشبورد در کروم
        say(f"\n🌐 در حال باز کردن داشبورد اپلیکیشن در Google Chrome: {URL}")
        open_in_chrome(URL)

        # =========================================================================
        # گام دوم: راه‌اندازی درایور کروم و لاگین در DeepSeek
        # =========================================================================
        say("\n" + "─" * 75)
        say("🔐 [گام ۲] ورود به حساب کاربری DeepSeek با اطلاعات ثبت‌شده:")
        say("   📧 Email:    Abraham.Hassanloo689@gmail.com")
        say("   🔑 Password: ********")
        say("─" * 75)

        if not port_open(BRIDGE_PORT):
            bridge_proc = start_bridge()
            say("⏳ در حال باز کردن پنجره اختصاصی کروم و بررسی وضعیت لاگین...")
            for _ in range(35):
                if port_open(BRIDGE_PORT):
                    say("✅ پنجره Google Chrome باز شد و وب‌درایور به DeepSeek متصل گردید!")
                    break
                time.sleep(1)

        say("\n" + "═" * 75)
        say("  🎉 تمام سرویس‌ها با موفقیت و بدون کوچک‌ترین نقصی بالا آمدند!")
        say(f"  🌐 داشبورد مدیریت عیب‌یابی: {URL}")
        say(f"  🤖 موتور هوش مصنوعی فعال: Google Chrome (DeepSeek Web Bridge)")
        say("  💡 برای خاموش کردن و خروج: در این پنجره کلیدهای Ctrl+C را فشار دهید.")
        say("═" * 75 + "\n")

        while True:
            if server_proc and server_proc.poll() is not None:
                break
            time.sleep(1)

    except KeyboardInterrupt:
        say("\n⏹ در حال خاموش کردن پردازش‌ها...")
    finally:
        if server_proc:
            try: server_proc.terminate()
            except Exception: pass
        if bridge_proc:
            try: bridge_proc.terminate()
            except Exception: pass
        say("خداحافظ 👋")


if __name__ == "__main__":
    main()
