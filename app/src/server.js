import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TIER1_QUESTION_SELECTOR, TIER2_ANALYZER } from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const ENV_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat';
const REASONER_MODEL = process.env.DEEPSEEK_REASONER_MODEL || 'deepseek-reasoner';
const MAX_QUESTIONS = 8;

// ---- in-memory session store ----
const sessions = new Map();

function newState(symptom, language) {
  return {
    symptom,
    system: '',
    language,
    question_count: 0,
    checks_done: [],
    findings: [],
    ruled_out: [],
    leading_hypotheses: [],
    unresolved_conflicts: [],
    known_issue_matches: [],
    pending_question: null,
    phase: 'interview', // interview | escalated | concluded
  };
}

function detectLanguage(text) {
  return /[\u0600-\u06FF]/.test(text) ? 'fa' : 'en';
}

const SAFETY_PATTERNS = [
  /ترمز.*(نمی|نمي|خالی|قطع|نشت|ضعیف)|(نمی|خالی|قطع|نشت|ضعیف).*ترمز/,
  /فرمان.*(قفل|سنگین|قطع)|(قفل|سنگین).*فرمان/,
  /نشت\s*(بنزین|سوخت|گازوئیل)|بوی\s*(بنزین|سوخت|سوختگی)/,
  /دود|آتش|شعله|حریق/,
  /ایربگ|کیسه\s*هوا|پیش.?کشنده/,
  /brake\s*(fail|loss|leak|weak)|no\s*brakes/i,
  /steering\s*(loss|lock|fail)|lost\s*steering/i,
  /fuel\s*(leak|smell|drip)|smell\s*of\s*(fuel|gas|petrol)/i,
  /smoke|burning\s*smell|fire|flame/i,
  /airbag.*(deploy|warning)|srs\s*warning|pretensioner/i,
];

function quickSafetyCheck(text) {
  return SAFETY_PATTERNS.some((re) => re.test(text));
}

function fallbackLabel(lang) {
  return lang === 'fa'
    ? 'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید'
    : 'None of the above / does not match - please describe';
}

function ensureFallbackOption(options, lang) {
  const fb = fallbackLabel(lang);
  const opts = Array.isArray(options) ? options.filter((o) => typeof o === 'string' && o.trim()) : [];
  const hasFb = opts.some((o) => /هیچ.?کدام|مطابقت ندارد|none of the above|does not match/i.test(o));
  if (!hasFb) opts.push(fb);
  return opts;
}

// ---- LLM call helper (DeepSeek cloud OR any OpenAI-compatible local server: Ollama, LM Studio, vLLM...) ----
async function callDeepSeek({ cfg, model, system, user, temperature, jsonMode = true, maxTokens = 2000 }) {
  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  // reasoning models (deepseek-reasoner / R1) don't support response_format reliably
  if (jsonMode && !/reasoner|r1/i.test(model)) {
    body.response_format = { type: 'json_object' };
  }
  const base = (cfg.baseUrl || DEEPSEEK_BASE_URL).replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey || 'local'}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function tryParseJson(text) {
  if (!text) return null;
  // strip reasoning tags (local R1 models) and markdown fences if present
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    // try to extract first {...} block
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callJson(opts, retries = 1) {
  let content = await callDeepSeek(opts);
  let parsed = tryParseJson(content);
  while (parsed === null && retries > 0) {
    retries -= 1;
    content = await callDeepSeek({
      ...opts,
      user: opts.user + '\n\nReturn valid JSON only. No prose, no markdown, no explanation.',
    });
    parsed = tryParseJson(content);
  }
  return parsed;
}

function caseStateForModel(state) {
  const { pending_question, phase, ...rest } = state;
  return rest;
}

// ---- Tier 1: next question ----
async function nextStep(cfg, state) {
  // hard cap enforced in code
  if (state.question_count >= MAX_QUESTIONS) return { conclude: true };
  if (cfg.demo) return demoNextStep(state);

  const parsed = await callJson({
    cfg,
    model: cfg.chatModel,
    system: TIER1_QUESTION_SELECTOR,
    user: JSON.stringify(caseStateForModel(state)),
    temperature: 0,
  });

  if (!parsed) {
    // fallback: safe broad question or conclude
    if (state.question_count >= MAX_QUESTIONS) return { conclude: true };
    const lang = state.language;
    return {
      question:
        lang === 'fa'
          ? 'این مشکل از چه زمانی شروع شد؟'
          : 'When did this problem start?',
      options:
        lang === 'fa'
          ? ['به‌تازگی و ناگهانی', 'به‌تدریج طی چند هفته', 'از ابتدا وجود داشته', 'مطمئن نیستم', fallbackLabel('fa')]
          : ['Recently and suddenly', 'Gradually over weeks', 'Since the beginning', 'Not sure', fallbackLabel('en')],
      leading_hypotheses: state.leading_hypotheses,
      ruled_out: state.ruled_out,
      _fallback: true,
    };
  }
  return parsed;
}

// ---- Tier 2: final report ----
async function finalReport(cfg, state) {
  if (cfg.demo) return demoFinalReport(state);
  const parsed = await callJson({
    cfg,
    model: cfg.reasonerModel,
    system: TIER2_ANALYZER,
    user: JSON.stringify(caseStateForModel(state)),
    temperature: 0.1,
    maxTokens: 4000,
  });
  if (parsed && Array.isArray(parsed.root_causes)) return parsed;

  // fallback: build report from leading hypotheses
  const lang = state.language;
  return {
    root_causes: (state.leading_hypotheses || []).slice(0, 3).map((h) => ({
      cause: h.hypothesis,
      confidence: Math.min(h.confidence ?? 30, 90),
      band: (h.confidence ?? 30) >= 70 ? 'High' : (h.confidence ?? 30) >= 40 ? 'Medium' : 'Low',
      evidence: lang === 'fa' ? 'بر اساس پاسخ‌های ثبت‌شده در مصاحبه عیب‌یابی' : 'Based on recorded interview findings',
    })),
    unresolved_conflicts: state.unresolved_conflicts || [],
    recommended_actions: [
      lang === 'fa'
        ? 'بازرسی فیزیکی و بررسی با دستگاه دیاگ طبق مستندات رسمی IKCO/OEM'
        : 'Physical inspection and scan-tool check per official IKCO/OEM documentation',
    ],
    escalate_if: [
      lang === 'fa'
        ? 'تکرار خرابی در چند خودرو یا وجود ریسک ایمنی'
        : 'Failure repeats across vehicles or a safety risk exists',
    ],
    _fallback: true,
  };
}

function escalationPayload(lang, reason) {
  if (lang === 'fa') {
    return {
      escalated: true,
      title: 'ارجاع فوری',
      reason: reason || 'این مورد می‌تواند ایمنی خودرو یا سرنشینان را تحت تأثیر قرار دهد.',
      required_action:
        'خودرو نباید تا زمان بررسی توسط تکنسین ارشد / واحد مهندسی / مرجع مجاز، به‌صورت عادی استفاده شود.',
      do_not:
        'هیچ سیستم ایمنی، ترمز، فرمان، ایربگ، ABS، ایموبلایزر یا آلایندگی را برای تست غیرفعال، دور زده یا override نکنید.',
    };
  }
  return {
    escalated: true,
    title: 'Immediate Escalation',
    reason: reason || 'This issue may affect vehicle or occupant safety.',
    required_action:
      'The vehicle should not be used normally until inspected by a senior technician / engineering team / authorized authority.',
    do_not:
      'Do not disable, bypass, override, unplug, or defeat any safety, brake, steering, airbag, ABS, immobilizer, or emissions system for testing.',
  };
}

function getApiKey(req) {
  return (req.headers['x-deepseek-key'] || '').toString().trim() || ENV_API_KEY;
}

// Build per-request LLM config from headers (set by the settings UI) with env fallbacks.
function getLlmConfig(req) {
  const provider = (req.headers['x-provider'] || '').toString().trim() || (process.env.LLM_PROVIDER || 'cloud');
  const apiKey = getApiKey(req);
  const headerBase = (req.headers['x-base-url'] || '').toString().trim();
  const chatModel = (req.headers['x-chat-model'] || '').toString().trim() || CHAT_MODEL;
  const reasonerModel = (req.headers['x-reasoner-model'] || '').toString().trim() || REASONER_MODEL;

  let baseUrl = DEEPSEEK_BASE_URL;
  if (provider === 'local') {
    baseUrl = headerBase || process.env.LOCAL_BASE_URL || 'http://localhost:11434/v1';
  } else if (headerBase) {
    baseUrl = headerBase;
  }
  // basic validation
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = DEEPSEEK_BASE_URL;

  return {
    provider,
    apiKey,
    baseUrl,
    chatModel: provider === 'local' && !req.headers['x-chat-model'] ? (process.env.LOCAL_MODEL || chatModel) : chatModel,
    reasonerModel: provider === 'local' && !req.headers['x-reasoner-model'] ? (process.env.LOCAL_MODEL || reasonerModel) : reasonerModel,
    demo: isDemoKey(apiKey),
    // local servers don't need a key; cloud does (unless demo)
    needsKey: provider !== 'local',
  };
}

function isDemoKey(apiKey) {
  return process.env.DEMO_MODE === '1' || /^demo$/i.test(apiKey);
}

// ---- Demo mode (no external API calls) ----
const DEMO_QUESTIONS = {
  fa: [
    { question: 'این مشکل از چه زمانی شروع شد؟', options: ['به‌تازگی و ناگهانی', 'به‌تدریج طی چند هفته', 'از ابتدا وجود داشته', 'مطمئن نیستم'] },
    { question: 'مشکل در چه شرایطی بیشتر خود را نشان می‌دهد؟', options: ['فقط در استارت سرد', 'فقط پس از گرم شدن', 'در همه شرایط', 'فقط زیر بار / سربالایی'] },
    { question: 'آیا چراغ هشداری روی صفحه کیلومتر روشن است؟', options: ['بله، چراغ چک', 'بله، چراغ دیگری', 'خیر، هیچ چراغی روشن نیست', 'مطمئن نیستم'] },
    { question: 'آخرین سرویس دوره‌ای (روغن/فیلتر) چه زمانی انجام شده است؟', options: ['کمتر از ۵ هزار کیلومتر پیش', 'بین ۵ تا ۱۰ هزار کیلومتر پیش', 'بیش از ۱۰ هزار کیلومتر پیش / نمی‌دانم'] },
  ],
  en: [
    { question: 'When did this problem start?', options: ['Recently and suddenly', 'Gradually over weeks', 'Since the beginning', 'Not sure'] },
    { question: 'Under which condition does the problem appear most?', options: ['Only on cold start', 'Only after warm-up', 'All conditions', 'Only under load / uphill'] },
    { question: 'Is any warning light on in the instrument cluster?', options: ['Yes, check engine light', 'Yes, another light', 'No lights on', 'Not sure'] },
    { question: 'When was the last periodic service (oil/filter)?', options: ['Less than 5,000 km ago', '5,000-10,000 km ago', 'More than 10,000 km / not sure'] },
  ],
};

function demoNextStep(state) {
  const qs = DEMO_QUESTIONS[state.language] || DEMO_QUESTIONS.fa;
  if (state.question_count >= qs.length) return { conclude: true };
  const q = qs[state.question_count];
  const hypos = state.language === 'fa'
    ? [
        { hypothesis: 'فرضیه نمونه ۱ (حالت دمو — بدون اتصال به DeepSeek)', confidence: 55 - state.question_count * 3 },
        { hypothesis: 'فرضیه نمونه ۲', confidence: 30 },
      ]
    : [
        { hypothesis: 'Sample hypothesis 1 (demo mode — no DeepSeek connection)', confidence: 55 - state.question_count * 3 },
        { hypothesis: 'Sample hypothesis 2', confidence: 30 },
      ];
  return { ...q, system: state.system || 'other', leading_hypotheses: hypos, ruled_out: state.ruled_out };
}

function demoFinalReport(state) {
  const fa = state.language === 'fa';
  return {
    root_causes: [
      {
        cause: fa
          ? 'این یک گزارش نمونه است — برای تحلیل واقعی، کلید DeepSeek API را در تنظیمات وارد کنید.'
          : 'This is a sample report — enter a real DeepSeek API key in settings for actual analysis.',
        confidence: 50,
        band: 'Medium',
        evidence: fa ? 'حالت دمو: پاسخ‌ها ثبت شد ولی تحلیل مدل انجام نشد.' : 'Demo mode: answers recorded but no model analysis was run.',
      },
    ],
    unresolved_conflicts: [],
    recommended_actions: [
      fa ? 'کلید واقعی DeepSeek را از platform.deepseek.com دریافت و در «تنظیمات API» وارد کنید.' : 'Get a real DeepSeek key from platform.deepseek.com and enter it in API settings.',
      fa ? 'در استقرار واقعی، بازرسی فیزیکی و دیاگ طبق مستندات رسمی IKCO/OEM انجام شود.' : 'In real deployment, perform physical inspection and scan-tool check per official IKCO/OEM documentation.',
    ],
    escalate_if: [fa ? 'وجود هرگونه ریسک ایمنی' : 'Any safety risk exists'],
    demo: true,
  };
}

function applyStateUpdates(state, parsed) {
  if (Array.isArray(parsed.leading_hypotheses)) state.leading_hypotheses = parsed.leading_hypotheses;
  if (Array.isArray(parsed.ruled_out)) state.ruled_out = parsed.ruled_out;
  if (typeof parsed.system === 'string' && parsed.system) state.system = parsed.system;
}

// ---- routes ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasEnvKey: Boolean(ENV_API_KEY), maxQuestions: MAX_QUESTIONS });
});

app.post('/api/session/start', async (req, res) => {
  try {
    const symptom = (req.body?.symptom || '').toString().trim();
    if (!symptom) return res.status(400).json({ error: 'symptom is required' });
    const cfg = getLlmConfig(req);
    if (cfg.needsKey && !cfg.apiKey) return res.status(401).json({ error: 'missing_api_key' });

    const language = req.body?.language === 'en' || req.body?.language === 'fa'
      ? req.body.language
      : detectLanguage(symptom);
    const state = newState(symptom, language);
    const id = crypto.randomUUID();
    sessions.set(id, state);

    // immediate safety screen (code-level, before any model call)
    if (quickSafetyCheck(symptom)) {
      state.phase = 'escalated';
      return res.json({ sessionId: id, ...escalationPayload(language), state: publicState(state) });
    }

    const step = await nextStep(cfg, state);
    return handleStep(res, id, state, step, cfg);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/api/session/answer', async (req, res) => {
  try {
    const id = (req.body?.sessionId || '').toString();
    const state = sessions.get(id);
    if (!state) return res.status(404).json({ error: 'session_not_found' });
    if (state.phase !== 'interview') return res.status(400).json({ error: 'session_closed' });

    const cfg = getLlmConfig(req);
    if (cfg.needsKey && !cfg.apiKey) return res.status(401).json({ error: 'missing_api_key' });

    const answer = (req.body?.answer || '').toString().trim();
    const freeText = (req.body?.freeText || '').toString().trim();
    if (!answer && !freeText) return res.status(400).json({ error: 'answer is required' });

    const question = state.pending_question?.question || '';
    const finalAnswer = freeText ? `${answer ? answer + ' — ' : ''}${freeText}` : answer;

    state.findings.push({ question, answer: finalAnswer, conflict: false });
    if (question) state.checks_done.push(question);
    state.question_count += 1;
    state.pending_question = null;

    // code-level safety screen on free-text answers
    if (quickSafetyCheck(finalAnswer)) {
      state.phase = 'escalated';
      return res.json({ sessionId: id, ...escalationPayload(state.language), state: publicState(state) });
    }

    const step = await nextStep(cfg, state);
    return handleStep(res, id, state, step, cfg);
  } catch (e) {
    handleError(res, e);
  }
});

async function handleStep(res, id, state, step, cfg) {
  if (step.escalate) {
    state.phase = 'escalated';
    return res.json({ sessionId: id, ...escalationPayload(state.language, step.reason), state: publicState(state) });
  }
  if (step.conclude || state.question_count >= MAX_QUESTIONS) {
    applyStateUpdates(state, step);
    const report = await finalReport(cfg, state);
    state.phase = 'concluded';
    return res.json({ sessionId: id, concluded: true, report, state: publicState(state) });
  }
  applyStateUpdates(state, step);
  const options = ensureFallbackOption(step.options, state.language);
  state.pending_question = { question: step.question, options };
  return res.json({
    sessionId: id,
    question: step.question,
    options,
    questionNumber: state.question_count + 1,
    maxQuestions: MAX_QUESTIONS,
    state: publicState(state),
  });
}

function publicState(state) {
  return {
    symptom: state.symptom,
    system: state.system,
    language: state.language,
    question_count: state.question_count,
    leading_hypotheses: state.leading_hypotheses,
    ruled_out: state.ruled_out,
    phase: state.phase,
  };
}

function handleError(res, e) {
  console.error(e);
  if (e.status === 401 || e.status === 403) {
    return res.status(401).json({ error: 'invalid_api_key', detail: e.message });
  }
  if (e.status === 402) {
    return res.status(402).json({ error: 'insufficient_balance', detail: e.message });
  }
  if (/fetch failed/i.test(e.message || '')) {
    return res.status(502).json({ error: 'network_error', detail: 'Cannot reach the model server (DeepSeek API or local endpoint). Check network/base URL, make sure the local server (e.g. Ollama) is running, or use the key "demo" for demo mode.' });
  }
  return res.status(500).json({ error: 'server_error', detail: e.message });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Guided Diagnostic Assistant listening on http://0.0.0.0:${PORT}`);
});
