# -*- coding: utf-8 -*-
"""
اجراکننده خودکار «دستیار عیب‌یابی هدایت‌شده»
فقط این فایل را اجرا کنید:  python run.py
(یا در ویندوز روی آن دابل‌کلیک کنید)

این اسکریپت خودش:
 1. بررسی می‌کند Node.js نصب باشد
 2. وابستگی‌ها را نصب می‌کند (فقط بار اول)
 3. سرور را بالا می‌آورد
 4. مرورگر را روی http://localhost:3000 باز می‌کند
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
PORT = int(os.environ.get("PORT", "3000"))
URL = f"http://localhost:{PORT}"


def say(msg):
    print(msg, flush=True)


def fail(msg):
    say("\n❌ " + msg)
    if os.name == "nt":
        input("\nبرای خروج Enter بزنید...")
    sys.exit(1)


def find(cmd):
    """پیدا کردن برنامه در سیستم (در ویندوز npm.cmd هم چک می‌شود)"""
    return shutil.which(cmd) or (shutil.which(cmd + ".cmd") if os.name == "nt" else None)


def port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def deps_ok():
    """بررسی واقعی نصب بودن وابستگی‌ها (وجود خود پکیج express، نه فقط پوشه node_modules)"""
    return os.path.isdir(os.path.join(APP_DIR, "node_modules", "express"))


def install_deps(npm):
    say("📦 در حال نصب وابستگی‌ها (کمی صبر کنید)...")
    r = subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=APP_DIR)
    if r.returncode != 0 or not deps_ok():
        fail("نصب وابستگی‌ها ناموفق بود. اتصال اینترنت را بررسی کنید و دوباره اجرا کنید.")
    say("✅ وابستگی‌ها نصب شد.")


def start_server(node):
    return subprocess.Popen([node, os.path.join("src", "server.js")], cwd=APP_DIR)


def main():
    say("=" * 55)
    say("  🔧 دستیار عیب‌یابی هدایت‌شده — اجراکننده خودکار")
    say("=" * 55)

    # ۰) بررسی پوشه اپ
    if not os.path.isdir(APP_DIR):
        fail("پوشه app پیدا نشد. این فایل باید کنار پوشه app (داخل پوشه 8D) باشد.")

    # ۱) بررسی Node.js
    node = find("node")
    npm = find("npm")
    if not node or not npm:
        fail(
            "Node.js روی سیستم شما نصب نیست.\n"
            "   از این آدرس نسخه LTS را دانلود و نصب کنید (Next, Next, Finish):\n"
            "   https://nodejs.org\n"
            "   بعد از نصب، دوباره همین فایل را اجرا کنید."
        )
    ver = subprocess.run([node, "-v"], capture_output=True, text=True).stdout.strip()
    say(f"✅ Node.js پیدا شد: {ver}")

    # ۲) اگر سرور از قبل بالاست، فقط مرورگر را باز کن
    if port_open(PORT):
        say(f"ℹ️ سرور از قبل روی پورت {PORT} در حال اجراست — مرورگر باز می‌شود.")
        webbrowser.open(URL)
        return

    # ۳) نصب وابستگی‌ها (اگر پکیج‌ها واقعاً موجود نباشند — حتی اگر پوشه node_modules خالی باشد)
    if not deps_ok():
        install_deps(npm)

    # ۴) اجرای سرور
    say("🚀 در حال بالا آوردن سرور...")
    server = start_server(node)

    # ۵) صبر تا آماده شدن و باز کردن مرورگر
    for _ in range(60):
        if server.poll() is not None:
            # اگر سرور به‌خاطر پکیج ناقص بالا نیامد، یک بار نصب مجدد و تلاش دوباره
            say("⚠️ سرور بالا نیامد — تلاش برای نصب مجدد وابستگی‌ها...")
            install_deps(npm)
            server = start_server(node)
            for _ in range(60):
                if server.poll() is not None:
                    fail("سرور بالا نیامد. متن خطای بالا را بررسی/ارسال کنید.")
                if port_open(PORT):
                    break
                time.sleep(0.5)
            break
        if port_open(PORT):
            break
        time.sleep(0.5)
    else:
        fail("سرور در زمان مناسب آماده نشد.")

    say(f"\n✅ اپ آماده است: {URL}")
    say("   از دکمه «⚙️ تنظیمات مدل» حالت ابری / لوکال / دمو را انتخاب کنید.")
    say("   برای خاموش کردن سرور: در همین پنجره Ctrl+C بزنید (یا پنجره را ببندید).\n")
    webbrowser.open(URL)

    # ۶) زنده نگه داشتن تا کاربر ببندد
    try:
        server.wait()
    except KeyboardInterrupt:
        say("\n⏹ در حال خاموش کردن سرور...")
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        say("خداحافظ 👋")


if __name__ == "__main__":
    main()
