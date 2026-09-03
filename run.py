# -*- coding: utf-8 -*-
"""
اجراکننده خودکار و یکپارچه «دستیار عیب‌یابی هدایت‌شده»
======================================================
فقط این فایل را اجرا کنید:  python run.py
(یا در ویندوز روی آن دابل‌کلیک کنید)

این اسکریپت همه‌چیز را به صورت خودکار و یک‌جا بالا می‌آورد:
 1. بررسی و نصب وابستگی‌های Node.js
 2. اجرای سرور عیب‌یابی و دیتابیس (Port 3000)
 3. اجرای خودکار پل وب کروم/سلنیوم (Port 8765 - در صورت نصب بودن کتابخانه‌ها)
 4. باز کردن خودکار مرورگر روی http://localhost:3000
 5. مدیریت و خاموش کردن یکپارچه تمام پردازش‌ها هنگام خروج
"""

import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser

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
    say("📦 در حال نصب وابستگی‌های برنامه (فقط بار اول)...")
    r = subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=APP_DIR)
    if r.returncode != 0 or not deps_ok():
        fail("نصب وابستگی‌ها ناموفق بود. اتصال اینترنت را بررسی کنید.")
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
        say("ℹ️ کتابخانه‌های selenium یا flask روی پایتون نصب نیستند (پل مرورگر رد شد).")
        return None

    say("🌐 در حال بالا آوردن پل مرورگر (Selenium Bridge)...")
    try:
        proc = subprocess.Popen([sys.executable, BRIDGE_SCRIPT], cwd=os.path.dirname(BRIDGE_SCRIPT))
        return proc
    except Exception as e:
        say(f"⚠️ بالا آوردن پل با خطا مواجه شد: {e}")
        return None


def start_server(node):
    return subprocess.Popen([node, os.path.join("src", "server.js")], cwd=APP_DIR)


def main():
    say("=" * 65)
    say("  🔧 دستیار عیب‌یابی هدایت‌شده با دیتابیس یادگیری")
    say("  اجرای یکپارچه: سرور اصلی + دیتابیس + پل مرورگر")
    say("=" * 65)

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
        # ۱. اجرای پل وب (در صورت تمایل و عدم اجرا بودن از قبل)
        if not port_open(BRIDGE_PORT):
            bridge_proc = start_bridge()
            time.sleep(1)

        # ۲. اجرای سرور اصلی Node
        if not port_open(PORT):
            say("🚀 در حال راه‌اندازی سرور اصلی و پایگاه دانش دیتابیس...")
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

        say("\n" + "═" * 65)
        say(f"  🎉 تمام سرویس‌ها با موفقیت بالا آمدند!")
        say(f"  🌐 آدرس اپلیکیشن: http://localhost:{PORT}")
        if port_open(BRIDGE_PORT):
            say(f"  🌉 پل مرورگر (سلنیوم): http://localhost:{BRIDGE_PORT}/v1 (فعال)")
        say(f"  🧠 پایگاه دانش و دیتابیس یادگیری: آماده به کار")
        say(f"  برای خاموش کردن همه سرویس‌ها: در این پنجره Ctrl+C بزنید.")
        say("═" * 65 + "\n")

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
        say("همه سرویس‌ها با موفقیت خاموش شدند. خداحافظ 👋")


if __name__ == "__main__":
    main()
