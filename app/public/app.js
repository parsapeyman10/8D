// Guided Diagnostic Assistant — Advanced Frontend with 8D Quality Engine & Learning Database
const $ = (id) => document.getElementById(id);

const els = {
  keyDot: $('keyDot'), keyText: $('keyText'),
  settingsBtn: $('settingsBtn'), settingsModal: $('settingsModal'),
  apiKeyInput: $('apiKeyInput'), saveKeyBtn: $('saveKeyBtn'), clearKeyBtn: $('clearKeyBtn'), closeModalBtn: $('closeModalBtn'),
  errorBanner: $('errorBanner'),
  startCard: $('startCard'), symptomInput: $('symptomInput'), dtcInput: $('dtcInput'), dtcList: $('dtcList'),
  startBtn: $('startBtn'), useBomCheckbox: $('useBomCheckbox'), micBtn: $('micBtn'),
  questionCard: $('questionCard'), qCounter: $('qCounter'), progressFill: $('progressFill'),
  systemTag: $('systemTag'), questionText: $('questionText'), optionsBox: $('optionsBox'),
  freetextBox: $('freetextBox'), freetextInput: $('freetextInput'), freetextSubmit: $('freetextSubmit'), freetextCancel: $('freetextCancel'),
  concludeEarlyBtn: $('concludeEarlyBtn'), extendQuestionsBtn: $('extendQuestionsBtn'),
  qLoading: $('qLoading'),
  escalationCard: $('escalationCard'), escTitle: $('escTitle'), escReason: $('escReason'), escAction: $('escAction'), escDoNot: $('escDoNot'), escNewCase: $('escNewCase'),
  reportCard: $('reportCard'), reportSymptom: $('reportSymptom'), rootCauses: $('rootCauses'),
  whysTree: $('whysTree'), eightDGrid: $('eightDGrid'), printReportBtn: $('printReportBtn'), copyReportBtn: $('copyReportBtn'),
  conflictsList: $('conflictsList'), actionsList: $('actionsList'), escalateIfList: $('escalateIfList'),
  confirmResultCheckbox: $('confirmResultCheckbox'), feedbackNotesInput: $('feedbackNotesInput'),
  saveFeedbackBtn: $('saveFeedbackBtn'), feedbackSavedMsg: $('feedbackSavedMsg'),
  newCaseBtn: $('newCaseBtn'), reportExtendBtn: $('reportExtendBtn'),
  mainLoading: $('mainLoading'), mainLoadingText: $('mainLoadingText'),
  hypoBox: $('hypoBox'), learnedMemoryBox: $('learnedMemoryBox'), ruledBox: $('ruledBox'), bomBox: $('bomBox'),
  // Tabs
  tabDiagnosisBtn: $('tabDiagnosisBtn'), tabPartBtn: $('tabPartBtn'), tabPinoutsBtn: $('tabPinoutsBtn'), tabKnowledgeBtn: $('tabKnowledgeBtn'),
  tabDiagnosis: $('tabDiagnosis'), tabPart: $('tabPart'), tabPinouts: $('tabPinouts'), tabKnowledge: $('tabKnowledge'),
  // Pinouts
  pinoutsContainer: $('pinoutsContainer'),
  // BOM upload
  uploadBomBtn: $('uploadBomBtn'), bomFileInput: $('bomFileInput'),
  // Knowledge
  statTotalCases: $('statTotalCases'), statConfirmedCases: $('statConfirmedCases'), statUserKnowledge: $('statUserKnowledge'),
  kTitleInput: $('kTitleInput'), kSymptomInput: $('kSymptomInput'), kPartCodeInput: $('kPartCodeInput'),
  kRootCauseInput: $('kRootCauseInput'), kSolutionInput: $('kSolutionInput'), addKnowledgeBtn: $('addKnowledgeBtn'),
  userKnowledgeList: $('userKnowledgeList'), recentCasesList: $('recentCasesList'),
  exportDbBtn: $('exportDbBtn'), importDbBtn: $('importDbBtn'), importDbInput: $('importDbInput'),
};

let sessionId = null;
let serverHasKey = false;
let pendingFallbackOption = null;
let lastReportData = null;

// ---------- TAB SWITCHING ----------
function switchTab(tabId) {
  [els.tabDiagnosis, els.tabPart, els.tabPinouts, els.tabKnowledge].forEach(t => t && t.classList.remove('active'));
  [els.tabDiagnosisBtn, els.tabPartBtn, els.tabPinoutsBtn, els.tabKnowledgeBtn].forEach(b => b && b.classList.remove('active'));

  if (tabId === 'diagnosis') {
    els.tabDiagnosis.classList.add('active');
    els.tabDiagnosisBtn.classList.add('active');
  } else if (tabId === 'part') {
    els.tabPart.classList.add('active');
    els.tabPartBtn.classList.add('active');
  } else if (tabId === 'pinouts') {
    els.tabPinouts.classList.add('active');
    els.tabPinoutsBtn.classList.add('active');
    loadPinoutsData();
  } else if (tabId === 'knowledge') {
    els.tabKnowledge.classList.add('active');
    els.tabKnowledgeBtn.classList.add('active');
    loadKnowledgeData();
  }
}

els.tabDiagnosisBtn.onclick = () => switchTab('diagnosis');
els.tabPartBtn.onclick = () => switchTab('part');
els.tabPinoutsBtn.onclick = () => switchTab('pinouts');
els.tabKnowledgeBtn.onclick = () => switchTab('knowledge');

// ---------- SPEECH RECOGNITION (Voice Input) ----------
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRec();
  recognition.lang = 'fa-IR';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    els.micBtn.classList.add('listening');
    els.micBtn.textContent = '🔴 در حال شنیدن...';
  };
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    els.symptomInput.value = (els.symptomInput.value ? els.symptomInput.value + ' ' : '') + text;
  };
  recognition.onend = () => {
    els.micBtn.classList.remove('listening');
    els.micBtn.textContent = '🎤 ورودی صوتی';
  };
  recognition.onerror = () => {
    els.micBtn.classList.remove('listening');
    els.micBtn.textContent = '🎤 ورودی صوتی';
  };
  els.micBtn.onclick = () => {
    try { recognition.start(); } catch { recognition.stop(); }
  };
} else {
  els.micBtn.style.display = 'none';
}

// Load DTC list for quick suggestion
fetch('/api/dtc/list').then(r => r.json()).then(codes => {
  els.dtcList.innerHTML = codes.map(c => `<option value="${c.code}">${c.code} — ${c.desc_fa}</option>`).join('');
}).catch(() => {});

// ---------- BOM UPLOAD ----------
els.uploadBomBtn.onclick = () => els.bomFileInput.click();
els.bomFileInput.onchange = async () => {
  const file = els.bomFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    setLoading(true, 'در حال پردازش و بارگذاری فایل BOM...');
    try {
      const res = await api('/api/bom/upload', { base64, filename: file.name });
      alert(`✅ فایل BOM با موفقیت بارگذاری شد!\nتعداد قطعات: ${res.count}\nنام محصول: ${res.product || file.name}`);
      location.reload();
    } catch (err) {
      showError('خطا در بارگذاری فایل BOM: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  reader.readAsDataURL(file);
};

// ---------- MODEL CONFIG HANDLING ----------
function getConfig() {
  try {
    const c = JSON.parse(localStorage.getItem('llm_config') || '{}');
    return {
      provider: c.provider || 'offline',
      apiKey: c.apiKey || '',
      baseUrl: c.baseUrl || '',
      bridgeUrl: c.bridgeUrl || 'http://localhost:8765/v1',
      chatModel: c.chatModel || '',
      reasonerModel: c.reasonerModel || '',
      cloudPreset: c.cloudPreset || 'avalai',
      cloudBaseUrl: c.cloudBaseUrl || '',
      cloudChatModel: c.cloudChatModel || '',
      cloudReasonerModel: c.cloudReasonerModel || '',
    };
  } catch {
    return {
      provider: 'offline',
      apiKey: '',
      baseUrl: '',
      bridgeUrl: 'http://localhost:8765/v1',
      chatModel: '',
      reasonerModel: '',
      cloudPreset: 'avalai',
      cloudBaseUrl: '',
      cloudChatModel: '',
      cloudReasonerModel: '',
    };
  }
}
function saveConfig(c) { localStorage.setItem('llm_config', JSON.stringify(c)); }

function configReady() {
  const c = getConfig();
  if (c.provider === 'offline' || c.provider === 'local' || c.provider === 'bridge' || c.provider === 'demo') {
    return true;
  }
  return Boolean(c.apiKey) || serverHasKey;
}

function refreshKeyStatus() {
  const c = getConfig();
  const ok = configReady();
  const presetNames = {
    offline: 'موتور آفلاین',
    avalai: 'AvalAI (ایرانی)',
    gapgpt: 'GapGPT (ایرانی)',
    deepseek: 'DeepSeek',
    openrouter: 'OpenRouter',
    groq: 'Groq',
    gemini: 'Gemini',
    openai: 'OpenAI',
    xai: 'xAI',
    custom: 'سفارشی',
  };
  els.keyDot.classList.toggle('ok', ok);
  els.keyText.textContent =
    c.provider === 'offline' ? 'موتور آفلاین ⚡'
    : c.provider === 'bridge' ? 'پل کروم 🌐'
    : c.provider === 'local' ? 'مدل محلی 🦙'
    : c.provider === 'demo' ? 'حالت دمو'
    : ok ? (presetNames[c.cloudPreset] || 'ابری')
    : 'تنظیم نشده';
}

fetch('/api/health').then(r => r.json()).then(d => {
  serverHasKey = Boolean(d.hasEnvKey);
  refreshKeyStatus();
  if (d.dbStats) updateDbStats(d.dbStats);
}).catch(() => {});

const providerRadios = () => [...document.querySelectorAll('input[name="provider"]')];
const offlineFields = document.getElementById('offlineFields');
const cloudFields = document.getElementById('cloudFields');
const localFields = document.getElementById('localFields');
const bridgeFields = document.getElementById('bridgeFields');
const baseUrlInput = document.getElementById('baseUrlInput');
const bridgeUrlInput = document.getElementById('bridgeUrlInput');
const chatModelInput = document.getElementById('chatModelInput');
const reasonerModelInput = document.getElementById('reasonerModelInput');
const cloudPreset = document.getElementById('cloudPreset');
const presetHint = document.getElementById('presetHint');
const cloudBaseUrlInput = document.getElementById('cloudBaseUrlInput');
const cloudChatModelInput = document.getElementById('cloudChatModelInput');
const cloudReasonerModelInput = document.getElementById('cloudReasonerModelInput');

const PRESETS = {
  avalai:     { base: 'https://api.avalai.ir/v1',                                chat: 'gpt-4o-mini', reasoner: '', keyUrl: 'https://avalai.ir', hint: 'درگاه ایرانی بدون تحریم و بدون نیاز به VPN.' },
  gapgpt:     { base: 'https://api.gapgpt.app/v1',                               chat: 'gpt-4o-mini', reasoner: '', keyUrl: 'https://gapgpt.app', hint: 'درگاه ایرانی با پرداخت ریالی.' },
  deepseek:   { base: 'https://api.deepseek.com',                                chat: 'deepseek-chat', reasoner: 'deepseek-reasoner', keyUrl: 'https://platform.deepseek.com', hint: 'سرویس رسمی DeepSeek.' },
  openrouter: { base: 'https://openrouter.ai/api/v1',                            chat: 'deepseek/deepseek-chat-v3.1:free', reasoner: '', keyUrl: 'https://openrouter.ai/keys', hint: 'دارای مدل‌های رایگان :free.' },
  groq:       { base: 'https://api.groq.com/openai/v1',                          chat: 'llama-3.3-70b-versatile', reasoner: '', keyUrl: 'https://console.groq.com/keys', hint: 'فوق‌العاده سریع با پلن رایگان.' },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/openai', chat: 'gemini-2.0-flash', reasoner: '', keyUrl: 'https://aistudio.google.com/apikey', hint: 'Google AI Studio.' },
  openai:     { base: 'https://api.openai.com/v1',                               chat: 'gpt-4o-mini', reasoner: '', keyUrl: 'https://platform.openai.com/api-keys', hint: 'سرویس رسمی OpenAI.' },
  xai:        { base: 'https://api.x.ai/v1',                                     chat: 'grok-3-mini', reasoner: '', keyUrl: 'https://console.x.ai', hint: 'Grok از xAI.' },
  custom:     { base: '', chat: '', reasoner: '', keyUrl: '', hint: 'هر سرور سازگار با OpenAI.' },
};

function applyPreset(id, keepValues = false) {
  const p = PRESETS[id] || PRESETS.custom;
  presetHint.innerHTML = `${p.hint}${p.keyUrl ? ` دریافت کلید: <a href="${p.keyUrl}" target="_blank" rel="noopener" dir="ltr">${p.keyUrl.replace('https://', '')}</a>` : ''}`;
  if (!keepValues) {
    cloudBaseUrlInput.value = p.base;
    cloudChatModelInput.value = p.chat;
    cloudReasonerModelInput.value = p.reasoner;
  }
}
cloudPreset.addEventListener('change', () => applyPreset(cloudPreset.value));

function syncProviderFields() {
  const p = providerRadios().find(r => r.checked)?.value || 'offline';
  if (offlineFields) offlineFields.style.display = p === 'offline' ? 'block' : 'none';
  cloudFields.style.display = p === 'cloud' ? 'block' : 'none';
  localFields.style.display = p === 'local' ? 'block' : 'none';
  bridgeFields.style.display = p === 'bridge' ? 'block' : 'none';
}
providerRadios().forEach(r => r.addEventListener('change', syncProviderFields));

els.settingsBtn.onclick = () => {
  const c = getConfig();
  providerRadios().forEach(r => r.checked = (r.value === c.provider));
  els.apiKeyInput.value = c.apiKey;
  baseUrlInput.value = c.baseUrl || 'http://localhost:11434/v1';
  if (bridgeUrlInput) bridgeUrlInput.value = c.bridgeUrl || 'http://localhost:8765/v1';
  chatModelInput.value = c.chatModel || 'deepseek-r1:8b';
  reasonerModelInput.value = c.reasonerModel || '';
  cloudPreset.value = c.cloudPreset || 'avalai';
  applyPreset(cloudPreset.value, true);
  cloudBaseUrlInput.value = c.cloudBaseUrl || PRESETS[cloudPreset.value]?.base || '';
  cloudChatModelInput.value = c.cloudChatModel || PRESETS[cloudPreset.value]?.chat || '';
  cloudReasonerModelInput.value = c.cloudReasonerModel || PRESETS[cloudPreset.value]?.reasoner || '';
  syncProviderFields();
  els.settingsModal.classList.add('show');
};
els.closeModalBtn.onclick = () => els.settingsModal.classList.remove('show');
els.saveKeyBtn.onclick = () => {
  const provider = providerRadios().find(r => r.checked)?.value || 'offline';
  const apiKey = els.apiKeyInput.value.trim();
  saveConfig({
    provider,
    apiKey,
    baseUrl: baseUrlInput.value.trim(),
    bridgeUrl: bridgeUrlInput ? bridgeUrlInput.value.trim() : 'http://localhost:8765/v1',
    chatModel: chatModelInput.value.trim(),
    reasonerModel: reasonerModelInput.value.trim(),
    cloudPreset: cloudPreset.value,
    cloudBaseUrl: cloudBaseUrlInput.value.trim(),
    cloudChatModel: cloudChatModelInput.value.trim(),
    cloudReasonerModel: cloudReasonerModelInput.value.trim(),
  });
  els.settingsModal.classList.remove('show');
  refreshKeyStatus();
};
els.clearKeyBtn.onclick = () => {
  saveConfig({ provider: 'offline' });
  els.apiKeyInput.value = ''; baseUrlInput.value = ''; chatModelInput.value = ''; reasonerModelInput.value = '';
  providerRadios().forEach(r => r.checked = (r.value === 'offline'));
  syncProviderFields();
  refreshKeyStatus();
};
els.settingsModal.onclick = (e) => { if (e.target === els.settingsModal) els.settingsModal.classList.remove('show'); };

// ---------- HELPERS ----------
function showError(msg) {
  els.errorBanner.textContent = msg;
  els.errorBanner.classList.add('show');
}
function hideError() { els.errorBanner.classList.remove('show'); }

function errorMessage(err, status) {
  if (status === 401 && err?.error === 'missing_api_key')
    return 'کلید API تنظیم نشده است. می‌توانید در تنظیمات گزینه «موتور هوش مصنوعی آفلاین» را انتخاب نمایید.';
  if (status === 401) return 'کلید API نامعتبر است.';
  if (status === 402) return 'اعتبار حساب مدل کافی نیست.';
  if (status === 502) return 'اتصال به مدل ابری برقرار نشد (به دلیل عدم دسترسی به اینترنت/VPN). پیشنهاد: از منوی تنظیمات حالت «موتور آفلاین» را فعال کنید.';
  return 'خطا در ارتباط با سرور: ' + (err?.detail || err?.error || status || 'نامشخص');
}

async function api(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const c = getConfig();
  if (c.provider === 'offline') {
    headers['x-provider'] = 'offline';
  } else if (c.provider === 'bridge') {
    headers['x-provider'] = 'bridge';
    headers['x-base-url'] = c.bridgeUrl || 'http://localhost:8765/v1';
    if (c.chatModel) headers['x-chat-model'] = c.chatModel;
    if (c.reasonerModel) headers['x-reasoner-model'] = c.reasonerModel;
  } else if (c.provider === 'local') {
    headers['x-provider'] = 'local';
    if (c.baseUrl) headers['x-base-url'] = c.baseUrl;
    if (c.chatModel) headers['x-chat-model'] = c.chatModel;
    if (c.reasonerModel) headers['x-reasoner-model'] = c.reasonerModel;
  } else {
    headers['x-provider'] = 'cloud';
    if (c.apiKey) headers['x-deepseek-key'] = c.apiKey;
    if (c.cloudBaseUrl) headers['x-base-url'] = c.cloudBaseUrl;
    if (c.cloudChatModel) headers['x-chat-model'] = c.cloudChatModel;
    const reasoner = c.cloudReasonerModel || c.cloudChatModel;
    if (reasoner) headers['x-reasoner-model'] = reasoner;
  }
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error(errorMessage(data, res.status));
    e.handled = true;
    throw e;
  }
  return data;
}

function faDigits(n) { return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }

const SYSTEM_FA = {
  engine: 'موتور', electrical: 'برق و مدارات الکترونیک', transmission: 'گیربکس', 'chassis/steering': 'شاسی و فرمان',
  brakes: 'ترمز', fuel: 'سوخت', HVAC: 'تهویه', body: 'بدنه', 'SRS/airbag': 'ایربگ',
  infotainment: 'مالتی‌مدیا', other: 'سایر مدارات',
};

function hide(...ids) { ids.forEach(el => el && el.classList.add('hidden')); }
function show(...ids) { ids.forEach(el => el && el.classList.remove('hidden')); }

function setLoading(on, text) {
  els.mainLoadingText.textContent = text || 'در حال پردازش...';
  els.mainLoading.classList.toggle('hidden', !on);
}

// ---------- SIDEBAR ----------
function renderSidebar(state) {
  if (!state) return;
  const hy = state.leading_hypotheses || [];
  if (hy.length) {
    els.hypoBox.innerHTML = hy.map(h => {
      const c = Math.max(0, Math.min(100, Number(h.confidence) || 0));
      const color = c >= 70 ? 'var(--good)' : c >= 40 ? 'var(--warn)' : 'var(--danger)';
      return `<div class="hypo">
        <div class="name">${esc(h.hypothesis)}</div>
        <div class="meter"><div style="width:${c}%;background:${color}"></div></div>
        <div class="pct">${faDigits(c)}٪</div>
      </div>`;
    }).join('');
  } else {
    els.hypoBox.innerHTML = '<p class="hint" style="margin:0">هنوز فرضیه‌ای ثبت نشده است.</p>';
  }

  const mem = state.learned_memory || [];
  if (mem.length) {
    els.learnedMemoryBox.innerHTML = mem.map(m => `
      <div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--border);line-height:1.7">
        <span style="color:var(--purple);font-weight:700">📌 ${esc(m.title || m.symptom_match)}</span><br>
        <span style="color:var(--muted)">علت تاییدشده:</span> ${esc(m.learned_root_cause)}
      </div>
    `).join('');
  } else {
    els.learnedMemoryBox.innerHTML = '<p class="hint" style="margin:0">مورد مشابهی در حافظه گذشته ثبت نشده است.</p>';
  }

  const ruled = state.ruled_out || [];
  els.ruledBox.innerHTML = ruled.length ? ruled.map(r => `<li>${esc(r)}</li>`).join('') : '<li>—</li>';

  const bom = state.bom_parts || [];
  if (bom.length) {
    const shown = bom.slice(0, 12);
    els.bomBox.innerHTML = shown.map(p =>
      `<li>${esc(p.name || p.name_fa)} <span style="color:var(--accent);direction:ltr;display:inline-block">${esc(p.code)}</span>${p.qty ? ` <span style="opacity:.6">×${esc(p.qty)}</span>` : ''}</li>`
    ).join('') + (bom.length > shown.length ? `<li style="opacity:.6">و ${bom.length - shown.length} قطعه دیگر...</li>` : '');
  } else {
    els.bomBox.innerHTML = '<li>BOM غیرفعال است یا قطعه‌ای ثبت نشده است.</li>';
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function isFallbackOption(opt) {
  return /هیچ.?کدام|مطابقت ندارد|none of the above|does not match/i.test(opt);
}

function renderQuestion(data) {
  hide(els.startCard, els.escalationCard, els.reportCard);
  show(els.questionCard);
  els.qLoading.classList.add('hidden');
  els.freetextBox.classList.remove('show');
  els.freetextInput.value = '';
  pendingFallbackOption = null;

  const n = data.questionNumber, max = data.maxQuestions || 8;
  els.qCounter.textContent = `سوال ${faDigits(n)} از ${faDigits(max)} (امکان پرسش بیشتر وجود دارد)`;
  els.progressFill.style.width = `${Math.min(100, ((n - 1) / max) * 100)}%`;

  const sys = data.state?.system;
  if (sys) {
    els.systemTag.style.display = 'inline-block';
    els.systemTag.textContent = 'سیستم: ' + (SYSTEM_FA[sys] || sys);
  } else {
    els.systemTag.style.display = 'none';
  }

  els.questionText.textContent = data.question;
  els.optionsBox.innerHTML = '';
  (data.options || []).forEach(opt => {
    const b = document.createElement('button');
    b.textContent = opt;
    if (isFallbackOption(opt)) {
      b.classList.add('fallback');
      b.onclick = () => {
        pendingFallbackOption = opt;
        els.freetextBox.classList.add('show');
        els.freetextInput.focus();
      };
    } else {
      b.onclick = () => submitAnswer(opt, '');
    }
    els.optionsBox.appendChild(b);
  });
  renderSidebar(data.state);
}

function renderEscalation(data) {
  hide(els.startCard, els.questionCard, els.reportCard);
  show(els.escalationCard);
  els.escTitle.textContent = data.title || 'ارجاع فوری';
  els.escReason.textContent = data.reason || '';
  els.escAction.textContent = data.required_action || '';
  els.escDoNot.textContent = data.do_not || '';
  renderSidebar(data.state);
}

function renderReport(data) {
  hide(els.startCard, els.questionCard, els.escalationCard);
  show(els.reportCard);
  lastReportData = data;
  const rep = data.report || {};
  els.reportSymptom.textContent = 'علامت گزارش‌شده: ' + (data.state?.symptom || '');
  els.feedbackSavedMsg.style.display = 'none';

  // Root causes
  els.rootCauses.innerHTML = (rep.root_causes || []).map((rc, i) => `
    <div class="rc">
      <div class="head">
        <div class="cause">${faDigits(i + 1)}. ${esc(rc.cause)}</div>
        <span class="band ${esc(rc.band)}">${faDigits(rc.confidence ?? '')}٪ · ${bandFa(rc.band)}</span>
      </div>
      ${rc.evidence ? `<div class="evidence">🔎 ${esc(rc.evidence)}</div>` : ''}
    </div>`).join('') || '<p class="hint">علتی ثبت نشد.</p>';

  // 5-Whys Tree
  const whys = rep.five_whys || [];
  if (whys.length) {
    els.whysTree.innerHTML = whys.map((w, idx) => `
      <div class="why-node">
        <b>گام ${faDigits(idx + 1)}:</b> ${esc(w)}
      </div>
    `).join('');
  } else {
    els.whysTree.innerHTML = '<p class="hint">زنجیره ۵ چرا ثبت نشد.</p>';
  }

  // 8D Report Grid
  const d = rep.eight_d_report || {};
  els.eightDGrid.innerHTML = `
    <div class="eight-d-item"><b>D1. تیم حل مسئله (Team):</b> ${esc(d.d1_team || '-')}</div>
    <div class="eight-d-item"><b>D2. توصیف دقیق عیب (Problem Description 5W2H):</b> ${esc(d.d2_problem || '-')}</div>
    <div class="eight-d-item"><b>D3. اقدامات مهار موقت (Containment Actions):</b> ${esc(d.d3_containment || '-')}</div>
    <div class="eight-d-item"><b>D4. علت ریشه‌ای قطعی (Root Cause):</b> ${esc(d.d4_root_cause || '-')}</div>
    <div class="eight-d-item"><b>D5. اقدامات اصلاحی دائم (Corrective Actions PCA):</b> ${esc(d.d5_corrective_actions || '-')}</div>
    <div class="eight-d-item"><b>D6. صحه‌گذاری اصلاحات (Verification):</b> ${esc(d.d6_verification || '-')}</div>
    <div class="eight-d-item"><b>D7. اقدامات پیشگیرانه از تکرار (Recurrence Prevention):</b> ${esc(d.d7_prevention || '-')}</div>
    <div class="eight-d-item"><b>D8. تایید نهایی و بستن پرونده (Closure):</b> ${esc(d.d8_closure || '-')}</div>
  `;

  const conflicts = rep.unresolved_conflicts || [];
  els.conflictsList.innerHTML = conflicts.length ? conflicts.map(c => `<li>${esc(c)}</li>`).join('') : '<li>ندارد</li>';
  els.actionsList.innerHTML = (rep.recommended_actions || []).map(a => `<li>${esc(a)}</li>`).join('');
  els.escalateIfList.innerHTML = (rep.escalate_if || []).map(a => `<li>${esc(a)}</li>`).join('');
  if (els.progressFill) els.progressFill.style.width = '100%';
  renderSidebar(data.state);
}

function bandFa(b) {
  return b === 'High' ? 'بالا' : b === 'Medium' ? 'متوسط' : b === 'Low' ? 'پایین' : (b || '');
}

function handleResponse(data) {
  sessionId = data.sessionId || sessionId;
  if (data.escalated) return renderEscalation(data);
  if (data.concluded) return renderReport(data);
  if (data.question) return renderQuestion(data);
  showError('پاسخ نامشخص از سرور دریافت شد.');
}

// Print 8D Report
els.printReportBtn.onclick = () => window.print();

// Copy 8D Report Text
els.copyReportBtn.onclick = () => {
  if (!lastReportData?.report?.eight_d_report) return;
  const d = lastReportData.report.eight_d_report;
  const text = `=======================================================
  گزارش حل مسئله ۸ مرحله‌ای (8D Quality Report)
=======================================================
D1. تیم حل مسئله: ${d.d1_team}
D2. شرح عیب (5W2H): ${d.d2_problem}
D3. اقدامات مهار موقت: ${d.d3_containment}
D4. علت ریشه‌ای: ${d.d4_root_cause}
D5. اقدامات اصلاحی دائم: ${d.d5_corrective_actions}
D6. صحه‌گذاری و تست: ${d.d6_verification}
D7. پیشگیری از تکرار: ${d.d7_prevention}
D8. تایید و بستن پرونده: ${d.d8_closure}
=======================================================`;
  navigator.clipboard.writeText(text).then(() => alert('گزارش 8D با موفقیت در کلیپ‌بورد کپی شد!'));
};

// ---------- ACTIONS ----------
async function startSession() {
  const symptom = els.symptomInput.value.trim();
  const dtc = els.dtcInput ? els.dtcInput.value.trim() : '';
  if (!symptom && !dtc) { showError('لطفاً ابتدا علامت یا کد خطای دیاگ (DTC) را وارد کنید.'); return; }
  hideError();
  els.startBtn.disabled = true;
  setLoading(true, 'در حال جستجو در دیتابیس یادگیری و فرمول‌بندی سوالات تخصصی...');
  try {
    const use_bom = Boolean(els.useBomCheckbox.checked);
    const data = await api('/api/session/start', { symptom, dtc, use_bom, max_questions: 8 });
    handleResponse(data);
  } catch (e) {
    showError(e.message);
  } finally {
    els.startBtn.disabled = false;
    setLoading(false);
  }
}

async function submitAnswer(answer, freeText) {
  hideError();
  els.qLoading.classList.remove('hidden');
  [...els.optionsBox.querySelectorAll('button')].forEach(b => b.disabled = true);
  els.freetextSubmit.disabled = true;
  try {
    const data = await api('/api/session/answer', { sessionId, answer, freeText });
    handleResponse(data);
  } catch (e) {
    showError(e.message);
    [...els.optionsBox.querySelectorAll('button')].forEach(b => b.disabled = false);
  } finally {
    els.qLoading.classList.add('hidden');
    els.freetextSubmit.disabled = false;
  }
}

async function extendQuestions() {
  if (!sessionId) return;
  hideError();
  setLoading(true, 'در حال فرمول‌بندی سوالات تکمیلی عمیق‌تر...');
  try {
    const data = await api('/api/session/extend', { sessionId, extend_by: 4 });
    handleResponse(data);
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

async function concludeEarly() {
  if (!sessionId) return;
  hideError();
  setLoading(true, 'در حال استنتاج نهایی، تولید زنجیره ۵ چرا و گزارش کامل 8D...');
  try {
    const data = await api('/api/session/conclude', { sessionId });
    handleResponse(data);
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

async function saveFeedback() {
  if (!sessionId) return;
  const user_confirmed = els.confirmResultCheckbox.checked;
  const user_feedback = els.feedbackNotesInput.value.trim();
  els.saveFeedbackBtn.disabled = true;
  try {
    await api('/api/db/cases/feedback', { id: sessionId, user_confirmed, user_feedback });
    els.feedbackSavedMsg.style.display = 'inline';
    setTimeout(() => { els.feedbackSavedMsg.style.display = 'none'; }, 5000);
  } catch (e) {
    showError('خطا در ثبت بازخورد: ' + e.message);
  } finally {
    els.saveFeedbackBtn.disabled = false;
  }
}

function resetToStart() {
  sessionId = null;
  lastReportData = null;
  hideError();
  hide(els.questionCard, els.escalationCard, els.reportCard);
  show(els.startCard);
  els.symptomInput.value = '';
  if (els.dtcInput) els.dtcInput.value = '';
  els.hypoBox.innerHTML = '<p class="hint" style="margin:0">پس از شروع عیب‌یابی، فرضیه‌ها اینجا نمایش داده می‌شوند.</p>';
  els.learnedMemoryBox.innerHTML = '<p class="hint" style="margin:0">تجربیات بازیابی‌شده نمایش داده می‌شوند.</p>';
  els.ruledBox.innerHTML = '<li>—</li>';
  els.bomBox.innerHTML = '<li>پس از تشخیص سیستم، قطعات BOM مرتبط اینجا نمایش داده می‌شوند.</li>';
}

els.startBtn.onclick = startSession;
els.concludeEarlyBtn.onclick = concludeEarly;
els.extendQuestionsBtn.onclick = extendQuestions;
els.reportExtendBtn.onclick = extendQuestions;
els.saveFeedbackBtn.onclick = saveFeedback;
els.newCaseBtn.onclick = resetToStart;
els.escNewCase.onclick = resetToStart;

els.symptomInput.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) startSession(); });
els.freetextSubmit.onclick = () => {
  const t = els.freetextInput.value.trim();
  if (!t) { showError('لطفاً توضیح خود را بنویسید.'); return; }
  submitAnswer(pendingFallbackOption || '', t);
};
els.freetextCancel.onclick = () => { els.freetextBox.classList.remove('show'); pendingFallbackOption = null; };

document.querySelectorAll('.examples button').forEach(b => {
  b.onclick = () => { els.symptomInput.value = b.dataset.ex; els.symptomInput.focus(); };
});

// ---------- PART ANALYSIS ----------
const partNameInput = $('partNameInput'), partNoInput = $('partNoInput'), partUseBomCheckbox = $('partUseBomCheckbox');
const partAnalyzeBtn = $('partAnalyzeBtn'), issuesRefreshBtn = $('issuesRefreshBtn');
const partLoading = $('partLoading'), partResult = $('partResult');

fetch('/api/bom').then(r => r.json()).then(d => {
  const names = [...new Set((d.parts || []).map(p => p.part_name_en || p.part_name_fa).filter(Boolean))];
  const nos = [...new Set((d.parts || []).flatMap(p => [p.part_no, p.part_code]).filter(Boolean))];
  $('partNameList').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
  $('partNoList').innerHTML = nos.map(n => `<option value="${esc(n)}">`).join('');
}).catch(() => {});

function likBadge(l) {
  const cls = l === 'High' ? 'High' : l === 'Medium' ? 'Medium' : 'Low';
  const fa = l === 'High' ? 'زیاد' : l === 'Medium' ? 'متوسط' : 'کم';
  return `<span class="band ${cls}">${fa}</span>`;
}

async function analyzePart() {
  const part_name = partNameInput.value.trim();
  const part_no = partNoInput.value.trim();
  const use_bom = Boolean(partUseBomCheckbox?.checked);
  if (!part_name && !part_no) { showError('حداقل یکی از Part Name یا Part No. را وارد کنید.'); return; }
  hideError();
  partLoading.classList.remove('hidden');
  partAnalyzeBtn.disabled = true;
  partResult.innerHTML = '';
  try {
    const d = await api('/api/part/analyze', { part_name, part_no, use_bom });
    let html = '';
    if (d.bom_match) {
      html += `<div class="rc"><div class="cause">✅ تطبیق با BOM: ${esc(d.bom_match.part_name_en || d.bom_match.part_name_fa)}</div>
        <div class="evidence" dir="ltr" style="text-align:left">Part No: ${esc(d.bom_match.part_no || '-')} | Stock: ${esc(d.bom_match.part_code)}${d.bom_match.qty ? ' | QTY: ' + esc(d.bom_match.qty) : ''}${d.bom_match.size ? ' | ' + esc(d.bom_match.size) : ''}</div>
        ${d.bom_match.designator ? `<div class="evidence" dir="ltr" style="text-align:left">Refs: ${esc(d.bom_match.designator)}</div>` : ''}</div>`;
    }

    if (d.pinout) {
      html += `<div style="background:var(--panel-2);border:1px solid var(--accent);border-radius:10px;padding:12px;margin:12px 0">
        <h4 style="margin:0 0 6px;color:var(--accent)">📐 نقشه تست پایه‌ها (${esc(d.pinout.package)}):</h4>
        <div style="font-size:12.5px;line-height:1.8">${esc(d.pinout.test_procedure_fa)}</div>
      </div>`;
    }

    if (d.learned_memory?.length) {
      html += `<h3 style="color:var(--purple);font-size:14px;margin:14px 0 6px">🧠 حافظه دیتابیس یادگیری: تجربیات مشابه</h3><ul style="padding-right:18px;line-height:2;font-size:13px">`;
      for (const m of d.learned_memory) {
        html += `<li><b>${esc(m.title)}</b>: علت تاییدشده: ${esc(m.learned_root_cause)} | راهکار: ${esc(m.learned_solution)}</li>`;
      }
      html += '</ul>';
    }

    if (d.known_issues?.length) {
      for (const cat of d.known_issues) {
        html += `<h3 style="color:var(--accent);font-size:14px;margin:14px 0 6px">📚 ایرادات شناخته‌شده: ${esc(cat.category)}</h3><ul style="padding-right:18px;line-height:2;font-size:13px">`;
        for (const i of cat.issues) {
          html += `<li><b>${esc(i.issue_fa)}</b><br><span style="color:var(--muted)">علت: ${esc(i.cause_fa)} | تشخیص: ${esc(i.detection_fa)}</span></li>`;
        }
        html += '</ul>';
      }
    }

    const a = d.analysis;
    if (a && !a.unavailable && a.summary) {
      html += `<h3 style="color:var(--accent);font-size:14px;margin:14px 0 6px">🤖 تحلیل جامع هوش مصنوعی</h3><p style="font-size:13.5px;line-height:2">${esc(a.summary)}</p>`;
      if (a.failure_modes?.length) {
        html += '<div>' + a.failure_modes.map(f => `<div class="rc"><div class="head"><div class="cause" style="font-size:13.5px">${esc(f.mode || f)}</div>${f.likelihood ? likBadge(f.likelihood) : ''}</div>${f.why ? `<div class="evidence">${esc(f.why)}</div>` : ''}</div>`).join('') + '</div>';
      }
      if (a.inspection_steps?.length) html += `<h3 style="color:var(--accent);font-size:14px;margin:10px 0 4px">مراحل تست و اندازه‌گیری</h3><ol style="padding-right:18px;line-height:2;font-size:13px">${a.inspection_steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
    }
    partResult.innerHTML = html;
  } catch (e) {
    showError(e.message);
  } finally {
    partLoading.classList.add('hidden');
    partAnalyzeBtn.disabled = false;
  }
}

partAnalyzeBtn.onclick = analyzePart;
[partNameInput, partNoInput].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') analyzePart(); }));

// ---------- PINOUTS TAB ----------
async function loadPinoutsData() {
  try {
    const list = await fetch('/api/pinouts').then(r => r.json());
    els.pinoutsContainer.innerHTML = list.map(item => `
      <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <b style="color:var(--accent);font-size:15px">${esc(item.part_no)} — ${esc(item.name_fa)}</b>
          <span class="band Medium" dir="ltr">${esc(item.package)} | Stock: ${esc(item.part_code)}</span>
        </div>
        <table class="pinout-table">
          <thead><tr><th>پایه (Pin)</th><th>نام سیگنال</th><th>توضیحات و عملکرد</th></tr></thead>
          <tbody>
            ${item.key_pins.map(p => `<tr><td style="font-weight:700;color:var(--accent)">${esc(p.pin)}</td><td dir="ltr" style="text-align:right"><b>${esc(p.name)}</b></td><td>${esc(p.desc)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:10px;font-size:13px;background:var(--panel);padding:10px;border-radius:8px;line-height:1.8">
          <b style="color:var(--good)">روش تست و ولتاژگیری: </b>${esc(item.test_procedure_fa)}
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.warn('Error loading pinouts:', e);
  }
}

// ---------- KNOWLEDGE & DATABASE TAB ----------
function updateDbStats(s) {
  els.statTotalCases.textContent = faDigits(s.total_cases || 0);
  els.statConfirmedCases.textContent = faDigits(s.confirmed_cases || 0);
  els.statUserKnowledge.textContent = faDigits(s.user_knowledge_count || 0);
}

async function loadKnowledgeData() {
  try {
    const [stats, knowledge, cases] = await Promise.all([
      fetch('/api/db/stats').then(r => r.json()),
      fetch('/api/db/knowledge').then(r => r.json()),
      fetch('/api/db/cases').then(r => r.json()),
    ]);
    updateDbStats(stats);
    renderKnowledgeList(knowledge);
    renderCasesList(cases);
  } catch (e) {
    console.warn('Error loading knowledge data:', e);
  }
}

function renderKnowledgeList(list) {
  if (!list || !list.length) {
    els.userKnowledgeList.innerHTML = '<p class="hint">هنوز تجربه‌ای ثبت نشده است. از فرم بالا اولین مورد را ثبت کنید.</p>';
    return;
  }
  els.userKnowledgeList.innerHTML = list.map(item => `
    <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="color:var(--accent);font-size:14px">${esc(item.title)}</b>
        <button onclick="deleteKnowledge('${item.id}')" style="font-size:11.5px;padding:4px 10px;color:var(--danger)">حذف</button>
      </div>
      <div style="font-size:13px;line-height:1.8;margin-top:6px">
        <div><b>علامت:</b> ${esc(item.symptom_trigger || '-')} ${item.part_code ? ` | <b>کد قطعه:</b> <span dir="ltr">${esc(item.part_code)}</span>` : ''}</div>
        <div><b>علت ریشه‌ای:</b> ${esc(item.root_cause)}</div>
        ${item.solution ? `<div><b>راهکار:</b> ${esc(item.solution)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function renderCasesList(cases) {
  if (!cases || !cases.length) {
    els.recentCasesList.innerHTML = '<p class="hint">هنوز پرونده‌ای در دیتابیس ثبت نشده است.</p>';
    return;
  }
  els.recentCasesList.innerHTML = cases.map(c => `
    <div style="background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <b>${esc(c.symptom)}</b>
        <span class="band ${c.user_confirmed ? 'High' : 'Medium'}">${c.user_confirmed ? '✅ تاییدشده توسط تکنسین' : 'ثبت‌شده در حافظه'}</span>
      </div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.8">
        <div><b>علت تشخیص داده شده:</b> ${esc(c.root_causes?.[0]?.cause || '-')}</div>
        ${c.user_feedback ? `<div><b>یادداشت تکنسین:</b> ${esc(c.user_feedback)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

window.deleteKnowledge = async function(id) {
  if (!confirm('آیا از حذف این مورد از پایگاه دانش مطمئن هستید؟')) return;
  try {
    await fetch(`/api/db/knowledge/${id}`, { method: 'DELETE' });
    loadKnowledgeData();
  } catch (e) {
    showError(e.message);
  }
};

els.addKnowledgeBtn.onclick = async () => {
  const title = els.kTitleInput.value.trim();
  const symptom_trigger = els.kSymptomInput.value.trim();
  const part_code = els.kPartCodeInput.value.trim();
  const root_cause = els.kRootCauseInput.value.trim();
  const solution = els.kSolutionInput.value.trim();

  if (!title && !root_cause) {
    showError('عنوان و علت ریشه‌ای الزامی هستند.');
    return;
  }
  hideError();
  els.addKnowledgeBtn.disabled = true;
  try {
    await fetch('/api/db/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, symptom_trigger, part_code, root_cause, solution }),
    });
    els.kTitleInput.value = ''; els.kSymptomInput.value = ''; els.kPartCodeInput.value = '';
    els.kRootCauseInput.value = ''; els.kSolutionInput.value = '';
    loadKnowledgeData();
  } catch (e) {
    showError(e.message);
  } finally {
    els.addKnowledgeBtn.disabled = false;
  }
};

// Export DB
els.exportDbBtn.onclick = () => window.open('/api/db/export', '_blank');

// Import DB
els.importDbBtn.onclick = () => els.importDbInput.click();
els.importDbInput.onchange = async () => {
  const file = els.importDbInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const json = JSON.parse(e.target.result);
      const res = await api('/api/db/import', json);
      alert(`✅ دیتابیس با موفقیت وارد شد!\nتجربیات واردشده: ${res.imported_knowledge}\nپرونده‌های واردشده: ${res.imported_cases}`);
      loadKnowledgeData();
    } catch (err) {
      showError('خطا در واردسازی دیتابیس: ' + err.message);
    }
  };
  reader.readAsText(file);
};
