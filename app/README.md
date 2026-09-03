# Guided Diagnostic Assistant — Web App

اپ عیب‌یابی هدایت‌شده خودرو (پلتفرم‌های ایران‌خودرو) با موتور DeepSeek.

## اجرا

```bash
cd app
npm install
npm start          # http://localhost:3000
```

## منبع مدل — هر سرویس‌دهنده‌ای، محدود نیستید

از دکمه «⚙️ تنظیمات مدل» در UI انتخاب کنید:

### ☁️ API ابری — ۱۱ سرویس‌دهنده آماده + سفارشی

| سرویس | Base URL | مدل پیش‌فرض | نکته |
|---|---|---|---|
| DeepSeek رسمی | api.deepseek.com | deepseek-chat / deepseek-reasoner | |
| OpenRouter | openrouter.ai/api/v1 | deepseek/deepseek-chat-v3.1:free | **مدل‌های رایگان** |
| Groq | api.groq.com/openai/v1 | llama-3.3-70b-versatile | سریع، پلن رایگان |
| Google Gemini | generativelanguage.googleapis.com/v1beta/openai | gemini-2.0-flash | کلید رایگان از AI Studio |
| OpenAI | api.openai.com/v1 | gpt-4o-mini | |
| xAI (Grok) | api.x.ai/v1 | grok-3-mini | |
| Mistral | api.mistral.ai/v1 | mistral-large-latest | پلن رایگان |
| Together | api.together.xyz/v1 | Llama-3.3-70B-Turbo | |
| **AvalAI (ایرانی)** | api.avalai.ir/v1 | gpt-4o-mini | پرداخت ریالی، بدون تحریم‌شکن |
| **GapGPT (ایرانی)** | api.gapgpt.app/v1 | gpt-4o-mini | پرداخت ریالی |
| سفارشی | هر آدرس | هر مدل | هر سرویس سازگار با OpenAI |

انتخاب سرویس، آدرس و مدل را خودکار پر می‌کند؛ همه قابل ویرایش‌اند. اگر «مدل گزارش (Tier 2)» را خالی بگذارید، همان مدل Tier 1 استفاده می‌شود. کلید فقط در localStorage مرورگر ذخیره می‌شود.

### 💻 مدل لوکال/آفلاین — هر سرور سازگار با OpenAI (Ollama، LM Studio، vLLM)

   ```bash
   # نمونه با Ollama:
   ollama pull deepseek-r1:14b
   ollama serve   # http://localhost:11434/v1
   ```

   سپس در تنظیمات: آدرس `http://localhost:11434/v1` و نام مدل `deepseek-r1:14b`. کلید لازم نیست. خروجی `<think>...</think>` مدل‌های R1 به‌طور خودکار حذف می‌شود.
   ⚠️ سرور لوکال باید از ماشینی که این اپ روی آن اجرا می‌شود در دسترس باشد (در پیش‌نمایش sandbox، «لوکالِ» شما در دسترس نیست — روی سیستم خودتان اجرا کنید).

### 🎭 حالت دمو — بدون هیچ اتصالی (در حالت ابری کلمه `demo` را به‌جای کلید وارد کنید)

### 🌉 راه چهارم: پل وب سلنیومی (بدون کلید API)

اگر نمی‌خواهید کلید API بگیرید، `bridge/deepseek_web_bridge.py` یک کروم واقعی باز می‌کند، به chat.deepseek.com می‌رود و سوال/جواب را از خود سایت می‌گیرد:

```bash
pip install -r bridge/requirements.txt
python bridge/deepseek_web_bridge.py
# بار اول: در پنجره کروم یک بار لاگین کنید (در پروفایل ذخیره می‌شود)
```

سپس در اپ: ⚙️ تنظیمات مدل → **مدل لوکال** → آدرس `http://localhost:8765/v1` (نام مدل مهم نیست).

> ⚠️ این روش کندتر از API است، پنجره کروم باید باز بماند، و اگر دیپ‌سیک ظاهر سایت را عوض کند ممکن است نیاز به به‌روزرسانی داشته باشد. برای کار جدی/تولیدی API رسمی توصیه می‌شود.

## 🧩 فایل BOM (فهرست قطعات)

اپ از `app/data/bom.csv` فهرست قطعات را می‌خواند (۶۱ قطعه نمونه). پس از تشخیص سیستمِ مشکل:

- قطعات همان سیستم به state مدل تزریق می‌شوند تا **فرضیه‌ها و گزارش نهایی به قطعات واقعی BOM (با کد قطعه) ارجاع بدهند**
- قطعات مرتبط در سایدبار UI نمایش داده می‌شوند
- `GET /api/bom?system=engine` فهرست را برمی‌گرداند

**برای استفاده از BOM واقعی خودتان:** فایل CSV را با همین ستون‌ها جایگزین کنید:
`part_code,part_name_fa,part_name_en,system,notes`
(مقادیر ستون system: `engine, electrical, transmission, chassis/steering, brakes, fuel, HVAC, body, SRS/airbag, infotainment, other`)
یا مسیر دلخواه بدهید: `BOM_PATH=/path/to/bom.csv npm start`


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
