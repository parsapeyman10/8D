import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TIER1_QUESTION_SELECTOR, TIER2_ANALYZER, PART_ANALYZER, ISSUE_UPDATER } from './prompts.js';
import {
  initDatabase,
  saveCase,
  updateCaseFeedback,
  getAllCases,
  addUserKnowledge,
  getUserKnowledgeList,
  deleteUserKnowledge,
  findLearnedMemory,
  getDbStats,
} from './db.js';
import { lookupDtc, DTC_DATABASE } from './dtc_db.js';
import { getPinoutData, PINOUTS_DATABASE } from './pinouts_db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const ENV_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat';
const REASONER_MODEL = process.env.DEEPSEEK_REASONER_MODEL || 'deepseek-reasoner';
const DEFAULT_MAX_QUESTIONS = 8;

// Initialize Learning Database
initDatabase();

// ---- in-memory session store ----
const sessions = new Map();

// ---- BOM (Bill of Materials) ----
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const BOM_PATH = process.env.BOM_PATH || path.join(__dirname, '..', 'data', 'bom.csv');
const BOM_XLSX_CANDIDATES = [
  process.env.BOM_XLSX,
  path.join(__dirname, '..', '..', 'BOM.xlsx'),
  path.join(__dirname, '..', 'data', 'BOM.xlsx'),
].filter(Boolean);

let BOM = [];
let BOM_SOURCE = 'none';
let BOM_PRODUCT = '';

function parseBomWorkbook(wb, sourceLabel = 'xlsx') {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let product = '';
  for (const row of rows.slice(0, 8)) {
    const i = row.findIndex((c) => /product\s*name/i.test(String(c)));
    if (i >= 0) {
      product = row.slice(i + 1).map(String).find((c) => c.trim()) || '';
      break;
    }
  }

  const headIdx = rows.findIndex(
    (r) => r.some((c) => /part\s*name/i.test(String(c))) && r.some((c) => /designator/i.test(String(c)))
  );
  if (headIdx < 0) throw new Error('ستون‌های جدول BOM (شامل Part Name و Designator) پیدا نشد.');
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

  BOM = parts;
  BOM_SOURCE = sourceLabel;
  BOM_PRODUCT = product;
  return { count: parts.length, product };
}

function loadBom() {
  for (const file of BOM_XLSX_CANDIDATES) {
    try {
      if (fs.existsSync(file)) {
        const wb = XLSX.readFile(file);
        const res = parseBomWorkbook(wb, 'xlsx');
        console.log(`BOM (Excel) loaded: ${res.count} parts from ${file}${res.product ? ` — product: ${res.product}` : ''}`);
        return;
      }
    } catch (e) {
      console.warn(`Failed to parse ${file}: ${e.message}`);
    }
  }
  try {
    const lines = fs.readFileSync(BOM_PATH, 'utf8').trim().split(/\r?\n/);
    const head = lines[0].split(',').map((h) => h.trim());
    BOM = lines.slice(1).map((line) => {
      const cols = line.split(',');
      const row = {};
      head.forEach((h, i) => (row[h] = (cols[i] || '').trim()));
      return row;
    }).filter((r) => r.part_code);
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
  if (BOM_SOURCE === 'xlsx' || BOM_SOURCE === 'upload') return BOM;
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

// ---- Known-issues database ----
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

function newState(symptom, language = 'fa', useBom = true, maxQuestions = DEFAULT_MAX_QUESTIONS) {
  const system = quickClassify(symptom);
  const learned = findLearnedMemory(symptom, system);
  return {
    symptom,
    system,
    language,
    use_bom: useBom,
    max_questions: maxQuestions,
    learned_memory: learned,
    question_count: 0,
    checks_done: [],
    findings: [],
    ruled_out: [],
    leading_hypotheses: [],
    unresolved_conflicts: [],
    known_issue_matches: [],
    pending_question: null,
    phase: 'interview',
  };
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

function fallbackLabel() {
  return 'هیچ‌کدام / مطابقت ندارد — لطفاً توضیح بدهید';
}

function ensureFallbackOption(options) {
  const fb = fallbackLabel();
  const opts = Array.isArray(options) ? options.filter((o) => typeof o === 'string' && o.trim()) : [];
  const hasFb = opts.some((o) => /هیچ.?کدام|مطابقت ندارد|none of the above|does not match/i.test(o));
  if (!hasFb) opts.push(fb);
  return opts;
}

// ---- LLM call helper ----
async function callDeepSeek({ cfg, model, system, user, temperature, jsonMode = true, maxTokens = 3000 }) {
  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
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
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
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
  const useBom = state.use_bom !== false;
  return {
    ...rest,
    ...(useBom && BOM_PRODUCT ? { bom_product: BOM_PRODUCT } : {}),
    ...(useBom ? { bom_parts: bomPartsForModel(state.system) } : {}),
    learned_memory: state.learned_memory || [],
    max_questions: state.max_questions || DEFAULT_MAX_QUESTIONS,
  };
}

// ---- Tier 1: next question ----
async function nextStep(cfg, state) {
  if (state.question_count >= state.max_questions) return { conclude: true };
  if (cfg.demo) return demoNextStep(state);

  const parsed = await callJson({
    cfg,
    model: cfg.chatModel,
    system: TIER1_QUESTION_SELECTOR,
    user: JSON.stringify(caseStateForModel(state)),
    temperature: 0,
  });

  if (!parsed) {
    if (state.question_count >= state.max_questions) return { conclude: true };
    return {
      question: 'این مشکل از چه زمانی شروع شد و تحت چه شرایطی بیشتر دیده می‌شود؟',
      options: ['به‌تازگی و ناگهانی', 'به‌تدریج طی چند روز/هفته', 'از بدو مونتاژ / ابتدای کارکرد', 'فقط در شرایط خاص (دما/بار بالا)', fallbackLabel()],
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

  return {
    root_causes: (state.leading_hypotheses || []).slice(0, 3).map((h) => ({
      cause: h.hypothesis,
      confidence: Math.min(h.confidence ?? 30, 90),
      band: (h.confidence ?? 30) >= 70 ? 'High' : (h.confidence ?? 30) >= 40 ? 'Medium' : 'Low',
      evidence: 'بر اساس پاسخ‌های مصاحبه عیب‌یابی و بررسی تجربیات دیتابیس',
    })),
    five_whys: [
      `چرا ۱: علامت اولیه "${state.symptom}" ثبت شده است.`,
      'چرا ۲: سیگنال الکتریکی یا پاسخ واحد کنترل در حد مطلوب نیست.',
      'چرا ۳: قطعی مسیر یا عدم عملکرد صحیح قطعه درایور ایجاد شده است.',
      'چرا ۴: قطعه تحت تنش حرارتی/ولتاژی یا لحیم‌کاری نامناسب قرار داشته است.',
      'چرا ۵: نیاز به بازرسی کیفیت مونتاژ و تست قطعات روی خط.',
    ],
    eight_d_report: {
      d1_team: 'تیم مهندسی تست و تضمین کیفیت',
      d2_problem: `بررسی عیب: ${state.symptom}`,
      d3_containment: 'قرنطینه بردهای دارای علامت مشابه و بازرسی چشمی',
      d4_root_cause: (state.leading_hypotheses?.[0]?.hypothesis || 'نقص قطعه یا لحیم‌کاری'),
      d5_corrective_actions: 'تعویض قطعه آسیب‌دیده و بهبود پروفایل حرارتی لحیم',
      d6_verification: 'تست عملکردی با دستگاه دیاگ و اسیلوسکوپ',
      d7_prevention: 'بازنگری چک‌لیست بازرسی فرآیند مونتاژ SMT',
      d8_closure: 'تایید نهایی تکنسین و بستن پرونده در دیتابیس',
    },
    unresolved_conflicts: state.unresolved_conflicts || [],
    recommended_actions: [
      'بازرسی فیزیکی، تست پیوستگی و ولتاژ طبق مستندات و نقشه‌های رسمی',
      'بررسی اتصالات لحیم و سلامت مسیرهای تغذیه و دیتا',
    ],
    escalate_if: ['تکرار خرابی در چند نمونه یا وجود ریسک ایمنی و حرارتی'],
    _fallback: true,
  };
}

function escalationPayload(reason) {
  return {
    escalated: true,
    title: 'ارجاع فوری',
    reason: reason || 'این مورد می‌تواند ایمنی خودرو یا مدار را تحت تأثیر قرار دهد.',
    required_action: 'دستگاه/خودرو نباید تا زمان بررسی توسط تکنسین ارشد / واحد مهندسی به‌صورت عادی استفاده شود.',
    do_not: 'هیچ سیستم ایمنی، ترمز، فرمان، ایربگ، ABS، یا مدارهای حفاظتی را دور نزنید.',
  };
}

function getApiKey(req) {
  return (req.headers['x-deepseek-key'] || '').toString().trim() || ENV_API_KEY;
}

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
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = DEEPSEEK_BASE_URL;

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
    needsKey: provider !== 'local',
  };
}

function isDemoKey(apiKey) {
  return process.env.DEMO_MODE === '1' || /^demo$/i.test(apiKey);
}

const DEMO_QUESTIONS = [
  { question: 'این مشکل از چه زمانی شروع شد؟', options: ['به‌تازگی و ناگهانی', 'به‌تدریج طی چند هفته', 'از ابتدا وجود داشته', 'مطمئن نیستم'] },
  { question: 'مشکل در چه شرایطی بیشتر خود را نشان می‌دهد؟', options: ['فقط در استارت سرد', 'فقط پس از گرم شدن', 'در همه شرایط', 'فقط زیر بار / کارکرد سنگین'] },
  { question: 'آیا چراغ هشداری روی پنل یا ال‌ای‌دی خطا روشن است؟', options: ['بله، هشدار فعال است', 'خیر، هیچ چراغی روشن نیست', 'مطمئن نیستم'] },
  { question: 'وضعیت ولتاژ تغذیه و تغذیه ورودی چگونه است؟', options: ['ولتاژ در حد نرمال است', 'افت ولتاژ مشاهده می‌شود', 'تغذیه قطع است / تست نشده'] },
];

function demoNextStep(state) {
  const qs = DEMO_QUESTIONS;
  if (state.question_count >= qs.length) return { conclude: true };
  const q = qs[state.question_count];
  const hypos = [
    { hypothesis: 'فرضیه نمونه ۱ (حالت دمو — بدون اتصال به هوش مصنوعی)', confidence: 55 - state.question_count * 3 },
    { hypothesis: 'فرضیه نمونه ۲', confidence: 30 },
  ];
  return { ...q, system: state.system || 'other', leading_hypotheses: hypos, ruled_out: state.ruled_out };
}

function demoFinalReport(state) {
  return {
    root_causes: [
      {
        cause: 'این یک گزارش نمونه است — برای تحلیل واقعی توسط هوش مصنوعی، تنظیمات مدل را بررسی کنید.',
        confidence: 50,
        band: 'Medium',
        evidence: 'حالت دمو: پاسخ‌ها در دیتابیس ثبت شد ولی پردازش زنده مدل انجام نشد.',
      },
    ],
    five_whys: [
      `چرا ۱: علامت ${state.symptom} رخ داد.`,
      'چرا ۲: افت ولتاژ در مدار ایجاد شده است.',
      'چرا ۳: مقاومت اهمی مسیر افزایش یافته است.',
      'چرا ۴: قلع‌مردگی پایه قطعه وجود دارد.',
      'چرا ۵: نیاز به کنترل دمای کوره SMT در خط مونتاژ.',
    ],
    eight_d_report: {
      d1_team: 'تیم کیفیت و مهندسی خط تولید',
      d2_problem: `گزارش عیب نمونه: ${state.symptom}`,
      d3_containment: 'بررسی ۱۰۰٪ بردهای همان بچ تولیدی',
      d4_root_cause: 'نقص لحیم‌کاری پایه آی‌سی بر اثر شوک حرارتی',
      d5_corrective_actions: 'اصلاح پروفایل خمیر قلع و کوره Reflow',
      d6_verification: 'تست تست‌بک ۱۰۰ عددی بدون خطا',
      d7_prevention: 'بروزرسانی استانداردهای بازرسی چشمی AOI',
      d8_closure: 'ثبت در دیتابیس و پایان پرونده 8D',
    },
    unresolved_conflicts: [],
    recommended_actions: [
      'بررسی اتصالات، تست ولتاژ و بازرسی میکروسکوپی/چشمی طبق نقشه‌ها',
    ],
    escalate_if: ['وجود هرگونه ریسک ایمنی'],
    demo: true,
  };
}

function applyStateUpdates(state, parsed) {
  if (Array.isArray(parsed.leading_hypotheses)) state.leading_hypotheses = parsed.leading_hypotheses;
  if (Array.isArray(parsed.ruled_out)) state.ruled_out = parsed.ruled_out;
  if (typeof parsed.system === 'string' && parsed.system) state.system = parsed.system;
}

// ---- ROUTES ----

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    hasEnvKey: Boolean(ENV_API_KEY),
    maxQuestions: DEFAULT_MAX_QUESTIONS,
    bomParts: BOM.length,
    bomSource: BOM_SOURCE,
    bomProduct: BOM_PRODUCT,
    dbStats: getDbStats(),
  });
});

app.get('/api/bom', (req, res) => {
  const system = (req.query.system || '').toString();
  res.json({ total: BOM.length, source: BOM_SOURCE, product: BOM_PRODUCT, parts: system ? bomForSystem(system) : BOM });
});

// Upload direct BOM Excel file
app.post('/api/bom/upload', (req, res) => {
  try {
    const { base64, filename } = req.body || {};
    if (!base64) return res.status(400).json({ error: 'base64 data required' });
    const buffer = Buffer.from(base64, 'base64');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const result = parseBomWorkbook(wb, 'upload');

    // Persist to app/data/BOM.xlsx
    const targetPath = path.join(__dirname, '..', 'data', 'BOM.xlsx');
    fs.writeFileSync(targetPath, buffer);

    res.json({ ok: true, count: result.count, product: result.product, filename });
  } catch (e) {
    res.status(400).json({ error: 'خطا در بارگذاری فایل اکسل BOM: ' + e.message });
  }
});

// DTC API
app.get('/api/dtc/list', (req, res) => {
  res.json(DTC_DATABASE);
});

app.get('/api/dtc/lookup', (req, res) => {
  const code = (req.query.code || '').toString();
  const match = lookupDtc(code);
  res.json({ match });
});

// Pinout API
app.get('/api/pinouts', (req, res) => {
  res.json(PINOUTS_DATABASE);
});

app.get('/api/pinouts/:partCode', (req, res) => {
  const match = getPinoutData(req.params.partCode);
  res.json({ match });
});

// Database endpoints
app.get('/api/db/stats', (req, res) => {
  res.json(getDbStats());
});

app.get('/api/db/cases', (req, res) => {
  res.json(getAllCases(50));
});

app.post('/api/db/cases/feedback', (req, res) => {
  const { id, user_confirmed, user_feedback, root_cause } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required' });
  updateCaseFeedback(id, { user_confirmed, user_feedback, root_cause });
  res.json({ ok: true });
});

app.get('/api/db/knowledge', (req, res) => {
  res.json(getUserKnowledgeList());
});

app.post('/api/db/knowledge', (req, res) => {
  const { title, symptom_trigger, root_cause, solution, part_code } = req.body || {};
  if (!title && !root_cause) return res.status(400).json({ error: 'title and root_cause are required' });
  const item = addUserKnowledge({ title, symptom_trigger, root_cause, solution, part_code });
  res.json({ ok: true, item });
});

app.delete('/api/db/knowledge/:id', (req, res) => {
  deleteUserKnowledge(req.params.id);
  res.json({ ok: true });
});

// Database Export & Import
app.get('/api/db/export', (req, res) => {
  const knowledge = getUserKnowledgeList();
  const cases = getAllCases(200);
  res.setHeader('Content-Disposition', 'attachment; filename="diagnostic_learning_db.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json({ exported_at: new Date().toISOString(), stats: getDbStats(), user_knowledge: knowledge, cases });
});

app.post('/api/db/import', (req, res) => {
  try {
    const data = req.body || {};
    let countK = 0, countC = 0;
    if (Array.isArray(data.user_knowledge)) {
      for (const k of data.user_knowledge) {
        addUserKnowledge(k);
        countK++;
      }
    }
    if (Array.isArray(data.cases)) {
      for (const c of data.cases) {
        saveCase(c);
        countC++;
      }
    }
    res.json({ ok: true, imported_knowledge: countK, imported_cases: countC, stats: getDbStats() });
  } catch (e) {
    res.status(400).json({ error: 'خطا در واردسازی دیتابیس: ' + e.message });
  }
});

// Part analysis
app.post('/api/part/analyze', async (req, res) => {
  try {
    const partName = (req.body?.part_name || '').toString().trim();
    const partNo = (req.body?.part_no || '').toString().trim();
    const useBom = req.body?.use_bom !== false;
    if (!partName && !partNo) return res.status(400).json({ error: 'part_name or part_no required' });

    const bomMatch = useBom ? findBomPart(partName, partNo) : null;
    const cats = issuesForPart(
      partName || bomMatch?.part_name_en || '',
      partNo || bomMatch?.part_no || bomMatch?.part_code || ''
    );
    const pinout = getPinoutData(partNo || bomMatch?.part_no || bomMatch?.part_code);
    const learned = findLearnedMemory(`${partName} ${partNo}`, 'electrical', partNo || bomMatch?.part_code);

    const base = {
      query: { part_name: partName, part_no: partNo },
      bom_match: bomMatch,
      pinout: pinout,
      known_issues: cats.map((c) => ({
        category: c.title_fa,
        updated_at: c.updated_at,
        issues: c.issues,
        sources: c.sources || [],
      })),
      learned_memory: learned,
      db_updated_at: KNOWN_ISSUES.updated_at,
    };

    const cfg = getLlmConfig(req);
    let analysis = null;
    if (!cfg.demo && (cfg.apiKey || !cfg.needsKey)) {
      try {
        analysis = await callJson({
          cfg,
          model: cfg.chatModel,
          system: PART_ANALYZER,
          user: JSON.stringify({
            product: useBom ? BOM_PRODUCT : '',
            part_name: partName || bomMatch?.part_name_en,
            part_no: partNo || bomMatch?.part_no,
            bom_match: bomMatch,
            known_issue_categories: base.known_issues,
            learned_memory: learned,
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

// Refresh known issues
app.post('/api/known-issues/refresh', async (req, res) => {
  try {
    const cfg = getLlmConfig(req);
    if (cfg.demo) return res.status(400).json({ error: 'demo_mode', detail: 'برای بروزرسانی، مدل واقعی (ابری/کروم/لوکال) لازم است.' });
    if (cfg.needsKey && !cfg.apiKey) return res.status(401).json({ error: 'missing_api_key' });

    const onlyId = (req.body?.category_id || '').toString().trim();
    const targets = (KNOWN_ISSUES.categories || []).filter((c) => !onlyId || c.id === onlyId);
    if (!targets.length) return res.status(404).json({ error: 'category_not_found' });

    const results = [];
    for (const cat of targets.slice(0, 4)) {
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

// Session start
app.post('/api/session/start', async (req, res) => {
  try {
    const symptom = (req.body?.symptom || '').toString().trim();
    const dtc = (req.body?.dtc || '').toString().trim();
    if (!symptom && !dtc) return res.status(400).json({ error: 'symptom is required' });
    const cfg = getLlmConfig(req);
    if (cfg.needsKey && !cfg.apiKey) return res.status(401).json({ error: 'missing_api_key' });

    let fullSymptom = symptom;
    if (dtc) {
      const dtcInfo = lookupDtc(dtc);
      const dtcDesc = dtcInfo ? ` [کد خطای دیاگ ${dtcInfo.code}: ${dtcInfo.desc_fa}]` : ` [DTC: ${dtc}]`;
      fullSymptom = `${dtcDesc} ${symptom}`;
    }

    const useBom = req.body?.use_bom !== false;
    const maxQuestions = Number(req.body?.max_questions) || DEFAULT_MAX_QUESTIONS;
    const state = newState(fullSymptom, 'fa', useBom, maxQuestions);
    const id = crypto.randomUUID();
    sessions.set(id, state);

    // immediate safety screen
    if (quickSafetyCheck(fullSymptom)) {
      state.phase = 'escalated';
      saveCase({ id, symptom: state.symptom, system: state.system, findings: [], root_causes: [{ cause: 'ارجاع فوری به دلیل ریسک ایمنی', confidence: 99 }] });
      return res.json({ sessionId: id, ...escalationPayload(), state: publicState(state) });
    }

    const step = await nextStep(cfg, state);
    return handleStep(res, id, state, step, cfg);
  } catch (e) {
    handleError(res, e);
  }
});

// Session answer
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

    if (quickSafetyCheck(finalAnswer)) {
      state.phase = 'escalated';
      saveCase({ id, symptom: state.symptom, system: state.system, findings: state.findings, root_causes: [{ cause: 'ارجاع فوری به دلیل ریسک ایمنی', confidence: 99 }] });
      return res.json({ sessionId: id, ...escalationPayload(), state: publicState(state) });
    }

    const step = await nextStep(cfg, state);
    return handleStep(res, id, state, step, cfg);
  } catch (e) {
    handleError(res, e);
  }
});

// Extend questions
app.post('/api/session/extend', async (req, res) => {
  try {
    const id = (req.body?.sessionId || '').toString();
    const state = sessions.get(id);
    if (!state) return res.status(404).json({ error: 'session_not_found' });

    const extendBy = Number(req.body?.extend_by) || 4;
    state.max_questions = (state.max_questions || DEFAULT_MAX_QUESTIONS) + extendBy;
    state.phase = 'interview';

    const cfg = getLlmConfig(req);
    const step = await nextStep(cfg, state);
    return handleStep(res, id, state, step, cfg);
  } catch (e) {
    handleError(res, e);
  }
});

// Conclude interview on demand
app.post('/api/session/conclude', async (req, res) => {
  try {
    const id = (req.body?.sessionId || '').toString();
    const state = sessions.get(id);
    if (!state) return res.status(404).json({ error: 'session_not_found' });

    const cfg = getLlmConfig(req);
    const report = await finalReport(cfg, state);
    state.phase = 'concluded';

    saveCase({
      id,
      symptom: state.symptom,
      system: state.system,
      findings: state.findings,
      root_causes: report.root_causes,
    });

    return res.json({
      sessionId: id,
      concluded: true,
      report,
      savedToDb: true,
      state: publicState(state),
    });
  } catch (e) {
    handleError(res, e);
  }
});

async function handleStep(res, id, state, step, cfg) {
  if (step.escalate) {
    state.phase = 'escalated';
    saveCase({ id, symptom: state.symptom, system: state.system, findings: state.findings, root_causes: [{ cause: step.reason || 'ارجاع فوری', confidence: 99 }] });
    return res.json({ sessionId: id, ...escalationPayload(step.reason), state: publicState(state) });
  }
  if (step.conclude || state.question_count >= state.max_questions) {
    applyStateUpdates(state, step);
    const report = await finalReport(cfg, state);
    state.phase = 'concluded';

    saveCase({
      id,
      symptom: state.symptom,
      system: state.system,
      findings: state.findings,
      root_causes: report.root_causes,
    });

    return res.json({
      sessionId: id,
      concluded: true,
      report,
      savedToDb: true,
      state: publicState(state),
    });
  }
  applyStateUpdates(state, step);
  const options = ensureFallbackOption(step.options);
  state.pending_question = { question: step.question, options };
  return res.json({
    sessionId: id,
    question: step.question,
    options,
    questionNumber: state.question_count + 1,
    maxQuestions: state.max_questions,
    state: publicState(state),
  });
}

function publicState(state) {
  return {
    symptom: state.symptom,
    system: state.system,
    language: state.language,
    use_bom: state.use_bom,
    max_questions: state.max_questions,
    learned_memory: state.learned_memory,
    question_count: state.question_count,
    leading_hypotheses: state.leading_hypotheses,
    ruled_out: state.ruled_out,
    bom_parts: state.use_bom ? bomPartsForModel(state.system) : [],
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
    return res.status(502).json({ error: 'network_error', detail: 'اتصال به مدل برقرار نشد. شبکه یا سرور لوکال را بررسی کنید یا از حالت دمو استفاده کنید.' });
  }
  return res.status(500).json({ error: 'server_error', detail: e.message });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Guided Diagnostic Assistant listening on http://0.0.0.0:${PORT}`);
});
