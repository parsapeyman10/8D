import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TIER1_QUESTION_SELECTOR, TIER2_ANALYZER, PART_ANALYZER, ISSUE_UPDATER } from './prompts.js';

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

// ---- BOM (Bill of Materials) ----
// Priority 1: a real product BOM in Excel (BOM.xlsx at repo root or app/data, or BOM_XLSX env)
// Priority 2: the generic vehicle-parts CSV (app/data/bom.csv, or BOM_PATH env)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const BOM_PATH = process.env.BOM_PATH || path.join(__dirname, '..', 'data', 'bom.csv');
const BOM_XLSX_CANDIDATES = [
  process.env.BOM_XLSX,
  path.join(__dirname, '..', '..', 'BOM.xlsx'),
  path.join(__dirname, '..', 'data', 'BOM.xlsx'),
].filter(Boolean);

let BOM = [];
let BOM_SOURCE = 'none';
let BOM_PRODUCT = '';

function loadBomXlsx(file) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // product name from the header block
  for (const row of rows.slice(0, 8)) {
    const i = row.findIndex((c) => /product\s*name/i.test(String(c)));
    if (i >= 0) {
      BOM_PRODUCT = row.slice(i + 1).map(String).find((c) => c.trim()) || '';
      break;
    }
  }

  // locate the header row of the parts table
  const headIdx = rows.findIndex(
    (r) => r.some((c) => /part\s*name/i.test(String(c))) && r.some((c) => /designator/i.test(String(c)))
  );
  if (headIdx < 0) throw new Error('parts table header not found');
  const head = rows[headIdx].map((c) => String(c).trim());
  const col = (re) => head.findIndex((h) => re.test(h));
  const cItem = col(/^item$/i), cDes = col(/designator/i), cName = col(/part\s*name/i);
  const cPartNo = col(/part\s*no/i), cType = col(/type/i), cSize = col(/^size$/i);
  const cQty = col(/qty/i), cStock = col(/stock\s*no/i), cNote = col(/^note$/i);

  const parts = [];
  for (const r of rows.slice(headIdx + 1)) {
    const item = String(r[cItem] ?? '').trim();
    const name = String(r[cName] ?? '').trim();
    if (!/^\d+$/.test(item) || !name) continue;
    const designators = String(r[cDes] ?? '').trim();
    const refCount = designators ? designators.split(',').filter((s) => s.trim()).length : 0;
    parts.push({
      part_code: String(r[cStock] ?? '').trim() || String(r[cPartNo] ?? '').trim() || `ITEM-${item}`,
      part_no: String(r[cPartNo] ?? '').trim(),
      part_name_fa: name,
      part_name_en: name,
      system: 'electrical',
      designator: designators.length > 40 ? designators.slice(0, 40) + `… (${refCount} refs)` : designators,
      type: String(r[cType] ?? '').trim(),
      size: String(r[cSize] ?? '').trim(),
      qty: String(r[cQty] ?? '').trim(),
      notes: String(r[cNote] ?? '').trim(),
    });
  }
  return parts;
}

function loadBomCsv() {
  const lines = fs.readFileSync(BOM_PATH, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    head.forEach((h, i) => (row[h] = (cols[i] || '').trim()));
    return row;
  }).filter((r) => r.part_code);
}

function loadBom() {
  for (const file of BOM_XLSX_CANDIDATES) {
    try {
      if (fs.existsSync(file)) {
        BOM = loadBomXlsx(file);
        BOM_SOURCE = 'xlsx';
        console.log(`BOM (Excel) loaded: ${BOM.length} parts from ${file}${BOM_PRODUCT ? ` — product: ${BOM_PRODUCT}` : ''}`);
        return;
      }
    } catch (e) {
      console.warn(`Failed to parse ${file}: ${e.message}`);
    }
  }
  try {
    BOM = loadBomCsv();
    BOM_SOURCE = 'csv';
    console.log(`BOM (CSV) loaded: ${BOM.length} parts from ${BOM_PATH}`);
  } catch (e) {
    BOM = [];
    console.warn(`BOM not loaded (${e.message}) — continuing without part list.`);
  }
}
loadBom();

function bomForSystem(system) {
  if (!BOM.length) return [];
  // A product BOM (Excel) is the actual bill of the unit under diagnosis:
  // always relevant, regardless of the classified vehicle system.
  if (BOM_SOURCE === 'xlsx') return BOM;
  if (!system) return [];
  return BOM.filter((p) => p.system === system).slice(0, 30);
}

function bomPartsForModel(system) {
  return bomForSystem(system).slice(0, 120).map((p) => ({
    code: p.part_code,
    name: p.part_name_en || p.part_name_fa,
    ...(p.designator ? { refs: p.designator } : {}),
    ...(p.size ? { pkg: p.size } : {}),
    ...(p.qty ? { qty: p.qty } : {}),
    ...(p.notes ? { notes: p.notes } : {}),
  }));
}

// ---- Known-issues database (per-component failure knowledge, refreshable) ----
const KNOWN_ISSUES_PATH = process.env.KNOWN_ISSUES_PATH || path.join(__dirname, '..', 'data', 'known_issues.json');
let KNOWN_ISSUES = { updated_at: '', categories: [] };
function loadKnownIssues() {
  try {
    KNOWN_ISSUES = JSON.parse(fs.readFileSync(KNOWN_ISSUES_PATH, 'utf8'));
    console.log(`Known-issues DB loaded: ${KNOWN_ISSUES.categories.length} categories (updated ${KNOWN_ISSUES.updated_at})`);
  } catch (e) {
    console.warn(`Known-issues DB not loaded: ${e.message}`);
  }
}
loadKnownIssues();

function saveKnownIssues() {
  KNOWN_ISSUES.updated_at = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(KNOWN_ISSUES_PATH, JSON.stringify(KNOWN_ISSUES, null, 2), 'utf8');
}

function issuesForPart(partName, partNo) {
  const hay = `${partName} ${partNo}`;
  return (KNOWN_ISSUES.categories || []).filter((c) => {
    try { return new RegExp(c.match, 'i').test(hay); } catch { return false; }
  });
}

function findBomPart(partName, partNo) {
  const name = (partName || '').toLowerCase().trim();
  const no = (partNo || '').toLowerCase().trim();
  let best = null, bestScore = 0;
  for (const p of BOM) {
    let score = 0;
    const pn = (p.part_name_en || p.part_name_fa || '').toLowerCase();
    const pc = (p.part_code || '').toLowerCase();
    const rawNo = (p.part_no || '').toLowerCase();
    if (no && (pc === no || rawNo.includes(no))) score += 3;
    if (name && pn === name) score += 3;
    else if (name && (pn.includes(name) || name.includes(pn))) score += 2;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 2 ? best : null;
}

// quick keyword classifier so the BOM filter works from the first question
const SYSTEM_KEYWORDS = [
  ['brakes', /ترمز|لنت|ABS|brake/i],
  ['SRS/airbag', /ایربگ|کیسه\s*هوا|airbag|srs/i],
  ['chassis/steering', /فرمان|جلوبندی|سیبک|طبق|کمک\s*فنر|steering|suspension/i],
  ['transmission', /گیربکس|کلاچ|دنده|clutch|gearbox|transmission/i],
  ['HVAC', /کولر|بخاری|تهویه|a\/?c|air\s*condition|hvac|heater/i],
  ['fuel', /بنزین|سوخت|باک|پمپ\s*بنزین|fuel/i],
  ['electrical', /باتری|دینام|استارت(?!\s*سرد)|برق|فیوز|battery|alternator|starter|electric/i],
  ['engine', /موتور|روغن|جوش|شمع|انژکتور|engine|oil|overheat|misfire/i],
];
function quickClassify(symptom) {
  for (const [system, re] of SYSTEM_KEYWORDS) {
    if (re.test(symptom)) return system;
  }
  return '';
}

function newState(symptom, language) {
  return {
    symptom,
    system: quickClassify(symptom),
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
  return {
    ...rest,
    ...(BOM_PRODUCT ? { bom_product: BOM_PRODUCT } : {}),
    bom_parts: bomPartsForModel(state.system),
  };
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

  // For non-DeepSeek providers, "deepseek-reasoner" would be an invalid model:
  // default the reasoner to the chat model when a custom base URL is used.
  let effReasoner = reasonerModel;
  if (!req.headers['x-reasoner-model'] && headerBase && !/deepseek\.com/i.test(baseUrl)) {
    effReasoner = (req.headers['x-chat-model'] || '').toString().trim() || chatModel;
  }

  return {
    provider,
    apiKey,
    baseUrl,
    chatModel: provider === 'local' && !req.headers['x-chat-model'] ? (process.env.LOCAL_MODEL || chatModel) : chatModel,
    reasonerModel: provider === 'local' && !req.headers['x-reasoner-model'] ? (process.env.LOCAL_MODEL || effReasoner) : effReasoner,
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
  res.json({ ok: true, hasEnvKey: Boolean(ENV_API_KEY), maxQuestions: MAX_QUESTIONS, bomParts: BOM.length, bomSource: BOM_SOURCE, bomProduct: BOM_PRODUCT });
});

app.get('/api/bom', (req, res) => {
  const system = (req.query.system || '').toString();
  res.json({ total: BOM.length, source: BOM_SOURCE, product: BOM_PRODUCT, parts: system ? bomForSystem(system) : BOM });
});

// ---- Part analysis: user gives Part Name + Part No. -> result ----
app.post('/api/part/analyze', async (req, res) => {
  try {
    const partName = (req.body?.part_name || '').toString().trim();
    const partNo = (req.body?.part_no || '').toString().trim();
    if (!partName && !partNo) return res.status(400).json({ error: 'part_name or part_no required' });

    const bomMatch = findBomPart(partName, partNo);
    const cats = issuesForPart(
      partName || bomMatch?.part_name_en || '',
      partNo || bomMatch?.part_no || bomMatch?.part_code || ''
    );

    const base = {
      query: { part_name: partName, part_no: partNo },
      bom_match: bomMatch,
      known_issues: cats.map((c) => ({
        category: c.title_fa,
        updated_at: c.updated_at,
        issues: c.issues,
        sources: c.sources || [],
      })),
      db_updated_at: KNOWN_ISSUES.updated_at,
    };

    // optional model synthesis (skipped in demo or when model unreachable)
    const cfg = getLlmConfig(req);
    let analysis = null;
    if (!cfg.demo && (cfg.apiKey || !cfg.needsKey)) {
      try {
        analysis = await callJson({
          cfg,
          model: cfg.chatModel,
          system: PART_ANALYZER,
          user: JSON.stringify({
            product: BOM_PRODUCT,
            part_name: partName || bomMatch?.part_name_en,
            part_no: partNo || bomMatch?.part_no,
            bom_match: bomMatch,
            known_issue_categories: base.known_issues,
            language: 'fa',
          }),
          temperature: 0.1,
          maxTokens: 2500,
        });
      } catch (e) {
        analysis = { unavailable: true, reason: e.message };
      }
    }
    res.json({ ...base, analysis });
  } catch (e) {
    handleError(res, e);
  }
});

// ---- Known-issues refresh: keep the DB up to date via the configured model ----
app.post('/api/known-issues/refresh', async (req, res) => {
  try {
    const cfg = getLlmConfig(req);
    if (cfg.demo) return res.status(400).json({ error: 'demo_mode', detail: 'برای بروزرسانی، مدل واقعی (ابری/کروم/لوکال) لازم است.' });
    if (cfg.needsKey && !cfg.apiKey) return res.status(401).json({ error: 'missing_api_key' });

    const onlyId = (req.body?.category_id || '').toString().trim();
    const targets = (KNOWN_ISSUES.categories || []).filter((c) => !onlyId || c.id === onlyId);
    if (!targets.length) return res.status(404).json({ error: 'category_not_found' });

    const results = [];
    for (const cat of targets.slice(0, 4)) { // cap per call to keep it fast
      const parsed = await callJson({
        cfg,
        model: cfg.chatModel,
        system: ISSUE_UPDATER,
        user: JSON.stringify({
          category: cat.title_fa,
          match: cat.match,
          current_issues: cat.issues,
          product: BOM_PRODUCT,
          language: 'fa',
        }),
        temperature: 0.1,
        maxTokens: 2500,
      });
      if (parsed && Array.isArray(parsed.issues) && parsed.issues.length) {
        cat.issues = parsed.issues.filter((i) => i.issue_fa);
        cat.updated_at = new Date().toISOString().slice(0, 10);
        results.push({ id: cat.id, updated: true, count: cat.issues.length });
      } else {
        results.push({ id: cat.id, updated: false });
      }
    }
    saveKnownIssues();
    res.json({ ok: true, results, db_updated_at: KNOWN_ISSUES.updated_at });
  } catch (e) {
    handleError(res, e);
  }
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
    bom_parts: bomPartsForModel(state.system),
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
