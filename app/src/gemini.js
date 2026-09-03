// Google Gemini AI Client (Native REST API + OpenAI-compatible endpoint)
// پیش‌فرض سیستم: gemini-1.5-flash (سریع، دقیق، رایگان و پشتیبانی عالی از زبان فارسی)

const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * ارسال پرامپت به Google Gemini API
 */
export async function callGemini({
  apiKey,
  model = DEFAULT_GEMINI_MODEL,
  system = '',
  user = '',
  temperature = 0.1,
  jsonMode = true,
  maxTokens = 3500,
  baseUrl = '',
}) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new Error('missing_gemini_key: کلید Gemini API تنظیم نشده است.');
  }

  const cleanModel = (model || DEFAULT_GEMINI_MODEL).trim();

  // در صورتی که کاربر Base URL سفارشی یا پروکسی تنظیم کرده باشد
  if (baseUrl && !baseUrl.includes('generativelanguage.googleapis.com')) {
    return callGeminiOpenAiCompat({ apiKey: cleanKey, model: cleanModel, system, user, temperature, jsonMode, maxTokens, baseUrl });
  }

  // ۱. فراخوانی از طریق Native Google Generative AI REST API
  const endpoint = `${GEMINI_API_BASE}/models/${cleanModel}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: user }],
      },
    ],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (system) {
    body.systemInstruction = {
      parts: [{ text: system }],
    };
  }

  if (jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (netErr) {
    // تلاش جایگزین از طریق اندپوینت سازگار با OpenAI در گوگل
    return callGeminiOpenAiCompat({ apiKey: cleanKey, model: cleanModel, system, user, temperature, jsonMode, maxTokens });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let errJson = null;
    try { errJson = JSON.parse(errText); } catch {}
    const msg = errJson?.error?.message || errText;

    if (res.status === 400 && msg.includes('API_KEY_INVALID')) {
      const err = new Error('کلید Google Gemini API نامعتبر است. لطفاً از Google AI Studio یک کلید جدید دریافت کنید.');
      err.status = 401;
      throw err;
    }
    if (res.status === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
      const err = new Error('محدودیت درخواست‌های Gemini (Rate Limit / Quota) به اتمام رسیده است.');
      err.status = 429;
      throw err;
    }

    // در صورت بروز خطای دیگر، تلاش با فرمت OpenAI
    return callGeminiOpenAiCompat({ apiKey: cleanKey, model: cleanModel, system, user, temperature, jsonMode, maxTokens });
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text;
}

/**
 * اندپوینت رسمی سازگار با OpenAI ارائه‌شده توسط گوگل جمینای
 */
async function callGeminiOpenAiCompat({
  apiKey,
  model = DEFAULT_GEMINI_MODEL,
  system = '',
  user = '',
  temperature = 0.1,
  jsonMode = true,
  maxTokens = 3500,
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai',
}) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  if (user) messages.push({ role: 'user', content: user });

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`Gemini API error ${res.status}: ${errText.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * تست زنده ارتباط با مدل Gemini (ارتباط برقرار است؟)
 */
export async function testGemini(apiKey, model = DEFAULT_GEMINI_MODEL) {
  const start = Date.now();
  const res = await callGemini({
    apiKey,
    model,
    system: 'شما دستیار هوش مصنوعی تخصصی خودرویی هستید. پاسخی بسیار کوتاه به فارسی بدهید.',
    user: 'ارتباط برقرار است؟',
    jsonMode: false,
    temperature: 0.2,
    maxTokens: 100,
  });
  const latency = Date.now() - start;
  return { ok: true, text: res.trim(), latency, model };
}
