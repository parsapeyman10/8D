# -*- coding: utf-8 -*-
"""
اجراکننده یکپارچه «دستیار عیب‌یابی هدایت‌شده و گزارش 8D»
==========================================================
 1. باز کردن پنجره اختصاصی Google Chrome برای DeepSeek (پل سلنیوم)
 2. راه‌اندازی سرور اصلی و پایگاه دانش یادگیری (پورت 3000)
 3. باز کردن خودکار داشبورد وب در مرورگر Google Chrome
"""

import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser

os.environ["LLM_PROVIDER"] = "bridge"  # پل وب سلنیومی کروم به عنوان پیش‌فرض اصلی

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
            say(f"⚠️ نصب خودکار با خطا مواجه شد: {e}")
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


def start_bridge():
    if not os.path.isfile(BRIDGE_SCRIPT):
        return None
    ensure_python_deps()
    say("🚀 در حال باز کردن پنجره Google Chrome و اتصال به DeepSeek...")
    try:
        proc = subprocess.Popen([sys.executable, BRIDGE_SCRIPT], cwd=os.path.dirname(BRIDGE_SCRIPT))
        return proc
    except Exception as e:
        say(f"⚠️ بالا آوردن پل با خطا مواجه شد: {e}")
        return None


def start_server(node):
    return subprocess.Popen([node, os.path.join("src", "server.js")], cwd=APP_DIR)


def main():
    say("=" * 70)
    say("  🔧 دستیار تخصصی عیب‌یابی و گزارش 8D")
    say("  🌐 اتصال زنده و نمایان به DeepSeek از طریق وب‌درایور Google Chrome")
    say("=" * 70)

    if not os.path.isdir(APP_DIR):
        fail("پوشه app پیدا نشد.")

    node = find("node")
    npm = find("npm")
    if not node or not npm:
        fail("Node.js روی سیستم شما نصب نیست. لطفاً نسخه LTS را نصب نمایید.")

    if not deps_ok():
        install_node_deps(npm)

    bridge_proc = None
    server_proc = None

    try:
        # ۱. اجرای پل وب و باز کردن پنجره کروم
        if not port_open(BRIDGE_PORT):
            bridge_proc = start_bridge()
            say("⏳ در حال صبر برای باز شدن پنجره کروم و آماده‌سازی چت DeepSeek...")
            for _ in range(30):
                if port_open(BRIDGE_PORT):
                    say("✅ پنجره Google Chrome باز شد و پل وب DeepSeek فعال گردید!")
                    break
                time.sleep(1)

        # ۲. اجرای سرور اصلی برنامه
        if not port_open(PORT):
            say("🚀 در حال راه‌اندازی سرور اصلی داشبورد...")
            server_proc = start_server(node)
            for _ in range(40):
                if port_open(PORT):
                    break
                time.sleep(0.5)

        say("\n" + "═" * 70)
        say(f"  🎉 تمام سرویس‌ها با موفقیت بالا آمدند!")
        say(f"  🌐 داشبورد عیب‌یابی: http://localhost:{PORT}")
        say(f"  🤖 هوش مصنوعی فعال: Google Chrome (DeepSeek Web Driver) روی پورت {BRIDGE_PORT}")
        say(f"  🧠 پایگاه دانش یادگیری: متصل و فعال")
        say(f"  برای خروج و خاموش کردن: در این پنجره Ctrl+C بزنید.")
        say("═" * 70 + "\n")

        # ۳. باز کردن داشبورد در کروم
        open_in_chrome(URL)

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
