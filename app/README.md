# Guided Diagnostic Assistant — Web App

اپ عیب‌یابی هدایت‌شده خودرو (پلتفرم‌های ایران‌خودرو) با موتور DeepSeek.

## اجرا

```bash
cd app
npm install
npm start          # http://localhost:3000
```

## منبع مدل (ابری یا آفلاین/لوکال)

از دکمه «⚙️ تنظیمات مدل» در UI یکی از سه حالت را انتخاب کنید:

1. **☁️ API ابری DeepSeek** — کلید `sk-...` از platform.deepseek.com. کلید در localStorage مرورگر ذخیره و با هدر `x-deepseek-key` ارسال می‌شود.
2. **💻 مدل لوکال/آفلاین** — هر سرور سازگار با OpenAI که مدل DeepSeek را اجرا می‌کند (Ollama، LM Studio، vLLM):

   ```bash
   # نمونه با Ollama:
   ollama pull deepseek-r1:14b
   ollama serve   # http://localhost:11434/v1
   ```

   سپس در تنظیمات: آدرس `http://localhost:11434/v1` و نام مدل `deepseek-r1:14b`. کلید لازم نیست. خروجی `<think>...</think>` مدل‌های R1 به‌طور خودکار حذف می‌شود.
   ⚠️ سرور لوکال باید از ماشینی که این اپ روی آن اجرا می‌شود در دسترس باشد (در پیش‌نمایش sandbox، «لوکالِ» شما در دسترس نیست — روی سیستم خودتان اجرا کنید).
3. **🎭 حالت دمو** — بدون هیچ اتصالی، جریان کامل را با داده نمونه نشان می‌دهد.

راه دوم برای استقرار، متغیر محیطی:

```bash
# ابری:
DEEPSEEK_API_KEY=sk-... npm start
# لوکال:
LLM_PROVIDER=local LOCAL_BASE_URL=http://localhost:11434/v1 LOCAL_MODEL=deepseek-r1:14b npm start
```

متغیرهای اختیاری:

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `PORT` | `3000` | پورت سرور |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | آدرس API ابری |
| `DEEPSEEK_CHAT_MODEL` | `deepseek-chat` | مدل Tier 1 (انتخاب سوال) |
| `DEEPSEEK_REASONER_MODEL` | `deepseek-reasoner` | مدل Tier 2 (گزارش نهایی) |
| `LLM_PROVIDER` | `cloud` | `cloud` یا `local` |
| `LOCAL_BASE_URL` | `http://localhost:11434/v1` | آدرس سرور لوکال (حالت local) |
| `LOCAL_MODEL` | — | نام مدل لوکال برای هر دو Tier |

برای تست حالت لوکال بدون Ollama واقعی: `node test/mock_local_llm.js` یک سرور ساختگی سازگار با OpenAI روی پورت 11434 بالا می‌آورد.

## معماری

- **Tier 1 — Question Selector** (`deepseek-chat`, temp 0): با توجه به state پرونده، بهترین سوال گزینه‌ای بعدی را با هدف تفکیک فرضیه‌ها انتخاب می‌کند. خروجی JSON.
- **Tier 2 — Root-Cause Analyzer** (`deepseek-reasoner`): گزارش نهایی با علت ریشه‌ای رتبه‌بندی‌شده، درصد اطمینان، اقدام پیشنهادی و شرایط ارجاع.
- **State** در حافظه سرور نگهداری می‌شود (per session)؛ مدل بین فراخوانی‌ها به حافظه متکی نیست.
- **سقف سخت ۸ سوال** در کد اعمال می‌شود، نه فقط در پرامپت.
- **غربال ایمنی در کد**: علائم ایمنی‌بحرانی (ترمز، فرمان، نشت سوخت، دود، ایربگ...) قبل از هر فراخوانی مدل، بلافاصله ارجاع فوری می‌گیرند. مدل هم می‌تواند `{"escalate": true}` برگرداند.
- **گزینه fallback اجباری**: هر سوال گزینه «هیچ‌کدام / مطابقت ندارد» دارد که کاربر را به پاسخ آزاد می‌برد.
- **اعتبارسنجی JSON + retry**: اگر خروجی مدل JSON معتبر نباشد یک بار retry و در نهایت به سوال امن عمومی fallback می‌شود.

پرامپت‌های مرجع (نسخه XML کامل) در `../guided-diagnostic-assistant/` قرار دارند.

## API

- `GET /api/health` → `{ ok, hasEnvKey, maxQuestions }`
- `POST /api/session/start` body: `{ symptom, language? }` → سوال اول یا escalation
- `POST /api/session/answer` body: `{ sessionId, answer, freeText? }` → سوال بعدی / escalation / گزارش نهایی

هدر اختیاری در هر دو: `x-deepseek-key: sk-...`
