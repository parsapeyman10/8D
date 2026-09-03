# -*- coding: utf-8 -*-
"""
اجراکننده خودکار و یکپارچه «دستیار عیب‌یابی هدایت‌شده و گزارش 8D»
==================================================================
 1. باز کردن قطعی و خودکار برنامه در مرورگر Google Chrome
 2. بررسی و نصب خودکار وابستگی‌های پایتون (Flask, Selenium) و Node.js
 3. راه‌اندازی پل وب سلنیوم DeepSeek (پورت 8765)
 4. راه‌اندازی سرور اصلی و پایگاه دانش (پورت 3000)
"""

import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser

os.environ["LLM_PROVIDER"] = os.environ.get("LLM_PROVIDER", "gemini")
os.environ["GEMINI_MODEL"] = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")

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
        say(f"🌐 در حال باز کردن برنامه در Google Chrome: {chrome_path}")
        try:
            subprocess.Popen([chrome_path, url])
            return True
        except Exception as e:
            say(f"⚠️ باز کردن مستقیم کروم با خطا مواجه شد ({e})، استفاده از مرورگر پیش‌فرض...")
    
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
    """بررسی و نصب خودکار Flask و Selenium در پایتون برای کارکرد بدون دردسر پل"""
    missing = []
    try: import flask # noqa
    except ImportError: missing.append("flask")
    try: import selenium # noqa
    except ImportError: missing.append("selenium")

    if missing:
        say(f"📦 در حال نصب خودکار پکیج‌های پایتون ({', '.join(missing)})...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", *missing], check=True)
            say("✅ پکیج‌های پایتون با موفقیت نصب شدند.")
            return True
        except Exception as e:
            say(f"⚠️ نصب خودکار پکیج‌های پایتون با خطا مواجه شد: {e}")
            return False
    return True


def deps_ok():
    return os.path.isdir(os.path.join(APP_DIR, "node_modules", "express"))


def install_node_deps(npm):
    say("📦 در حال بررسی و نصب وابستگی‌های Node.js...")
    r = subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=APP_DIR)
    if r.returncode != 0 or not deps_ok():
        fail("نصب وابستگی‌های Node.js ناموفق بود.")
    say("✅ وابستگی‌های Node.js نصب شد.")


def start_bridge():
    if not os.path.isfile(BRIDGE_SCRIPT):
        return None
    ensure_python_deps()
    say("🌐 در حال راه‌اندازی پل وب DeepSeek و مرورگر کروم...")
    try:
        proc = subprocess.Popen([sys.executable, BRIDGE_SCRIPT], cwd=os.path.dirname(BRIDGE_SCRIPT))
        return proc
    except Exception as e:
        say(f"⚠️ اجرای پل وب با خطا مواجه شد: {e}")
        return None


def start_server(node):
    return subprocess.Popen([node, os.path.join("src", "server.js")], cwd=APP_DIR)


def main():
    say("=" * 68)
    say("  🔧 دستیار تخصصی عیب‌یابی خودرو و گزارش کیفیت 8D")
    say("  🌐 اجرا در Google Chrome + پشتیبانی از پل سلنیوم و Google Gemini")
    say("=" * 68)

    if not os.path.isdir(APP_DIR):
        fail("پوشه app پیدا نشد. این فایل باید در ریشه پروژه قرار داشته باشد.")

    node = find("node")
    npm = find("npm")
    if not node or not npm:
        fail(
            "Node.js روی سیستم شما نصب نیست.\n"
            "   از آدرس https://nodejs.org نسخه LTS را نصب کنید."
        )
    ver = subprocess.run([node, "-v"], capture_output=True, text=True).stdout.strip()
    say(f"✅ Node.js پیدا شد: {ver}")

    if not deps_ok():
        install_node_deps(npm)

    bridge_proc = None
    server_proc = None

    try:
        # ۱. اجرای پل سلنیوم در پس‌زمینه
        if not port_open(BRIDGE_PORT):
            bridge_proc = start_bridge()
            time.sleep(1.5)

        # ۲. اجرای سرور اصلی Node
        if not port_open(PORT):
            say("🚀 در حال راه‌اندازی سرور اصلی برنامه...")
            server_proc = start_server(node)

            for _ in range(60):
                if server_proc.poll() is not None:
                    say("⚠️ تلاش مجدد برای اجرای سرور...")
                    install_node_deps(npm)
                    server_proc = start_server(node)
                    for _ in range(60):
                        if server_proc.poll() is not None:
                            fail("سرور اصلی بالا نیامد.")
                        if port_open(PORT):
                            break
                        time.sleep(0.5)
                    break
                if port_open(PORT):
                    break
                time.sleep(0.5)
            else:
                fail("سرور در زمان مقرر پاسخ نداد.")
        else:
            say(f"ℹ️ سرور اصلی از قبل روی پورت {PORT} فعال است.")

        say("\n" + "═" * 68)
        say(f"  🎉 تمام سرویس‌ها با موفقیت بالا آمدند!")
        say(f"  🌐 آدرس وب: http://localhost:{PORT}")
        say(f"  🌉 پل مرورگر DeepSeek: http://localhost:{BRIDGE_PORT}/v1 (پورت فعال: {port_open(BRIDGE_PORT)})")
        say(f"  ⚡ مدل‌های آماده: Google Gemini 1.5 Flash + پل سلنیومی کروم + موتور آفلاین")
        say(f"  برای خروج و خاموش کردن همه سرویس‌ها: در این پنجره Ctrl+C بزنید.")
        say("═" * 68 + "\n")

        # ۳. باز کردن حتمی در Google Chrome
        open_in_chrome(URL)

        # مانیتور پردازش‌ها
        while True:
            if server_proc and server_proc.poll() is not None:
                say("⚠️ سرور اصلی متوقف شد.")
                break
            time.sleep(1)

    except KeyboardInterrupt:
        say("\n⏹ در حال متوقف کردن تمام پردازش‌ها...")
    finally:
        if server_proc:
            try:
                server_proc.terminate()
                server_proc.wait(timeout=3)
            except Exception:
                try: server_proc.kill()
                except Exception: pass
        if bridge_proc:
            try:
                bridge_proc.terminate()
                bridge_proc.wait(timeout=3)
            except Exception:
                try: bridge_proc.kill()
                except Exception: pass
        say("همه سرویس‌ها خاموش شدند. موفق باشید 👋")


if __name__ == "__main__":
    main()
