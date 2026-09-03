# -*- coding: utf-8 -*-
"""
اجراکننده خودکار و یکپارچه «دستیار عیب‌یابی هدایت‌شده و گزارش 8D»
==================================================================
مجهز به هوش مصنوعی پیش‌فرض Google Gemini (gemini-1.5-flash)

فقط این فایل را اجرا کنید:  python run.py
(یا در ویندوز روی آن دابل‌کلیک کنید)

 1. بررسی و راه‌اندازی سرور اصلی و پایگاه دانش (Port 3000)
 2. فعال‌سازی پیش‌فرض مدل Google Gemini 1.5 Flash (با فال‌بک خودکار به موتور آفلاین)
 3. باز کردن خودکار مرورگر روی http://localhost:3000
"""

import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser

os.environ["SE_OFFLINE"] = "true"
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


def port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def deps_ok():
    return os.path.isdir(os.path.join(APP_DIR, "node_modules", "express"))


def install_deps(npm):
    say("📦 در حال بررسی و نصب وابستگی‌های برنامه...")
    r = subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=APP_DIR)
    if r.returncode != 0 or not deps_ok():
        fail("نصب وابستگی‌ها ناموفق بود.")
    say("✅ وابستگی‌ها نصب شد.")


def check_python_bridge_deps():
    try:
        import flask  # noqa
        import selenium  # noqa
        return True
    except ImportError:
        return False


def start_bridge():
    if not os.path.isfile(BRIDGE_SCRIPT):
        return None
    if not check_python_bridge_deps():
        return None
    try:
        proc = subprocess.Popen([sys.executable, BRIDGE_SCRIPT], cwd=os.path.dirname(BRIDGE_SCRIPT))
        return proc
    except Exception:
        return None


def start_server(node):
    return subprocess.Popen([node, os.path.join("src", "server.js")], cwd=APP_DIR)


def main():
    say("=" * 68)
    say("  🔧 دستیار تخصصی عیب‌یابی خودرو و گزارش کیفیت 8D")
    say("  ⚡ مدل هوش مصنوعی پیش‌فرض: Google Gemini 1.5 Flash")
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
        install_deps(npm)

    bridge_proc = None
    server_proc = None

    try:
        # اجرای سرور اصلی Node با پیش‌فرض Google Gemini
        if not port_open(PORT):
            say("🚀 در حال راه‌اندازی سرور و موتور هوش مصنوعی...")
            server_proc = start_server(node)

            for _ in range(60):
                if server_proc.poll() is not None:
                    say("⚠️ تلاش مجدد برای اجرای سرور...")
                    install_deps(npm)
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
        say(f"  🎉 برنامه با موفقیت اجرا شد!")
        say(f"  🌐 آدرس دسترسی در مرورگر: http://localhost:{PORT}")
        say(f"  ⚡ مدل فعال: Google Gemini (gemini-1.5-flash)")
        say(f"  🧠 پایگاه دانش یادگیری دیتابیس: آماده به کار")
        say(f"  📊 گزارش‌ساز 8D و تحلیل ۵ چرا: فعال")
        say(f"  برای تست زنده Gemini: python test_gemini.py")
        say(f"  برای خروج و خاموش کردن: در این پنجره کلیدهای Ctrl+C را بزنید.")
        say("═" * 68 + "\n")

        webbrowser.open(URL)

        # زنده نگه‌داشتن و مانیتور پردازش‌ها
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
