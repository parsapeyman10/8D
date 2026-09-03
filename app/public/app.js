// Guided Diagnostic Assistant — frontend with Learning Database
const $ = (id) => document.getElementById(id);

const els = {
  keyDot: $('keyDot'), keyText: $('keyText'),
  settingsBtn: $('settingsBtn'), settingsModal: $('settingsModal'),
  apiKeyInput: $('apiKeyInput'), saveKeyBtn: $('saveKeyBtn'), clearKeyBtn: $('clearKeyBtn'), closeModalBtn: $('closeModalBtn'),
  errorBanner: $('errorBanner'),
  startCard: $('startCard'), symptomInput: $('symptomInput'), startBtn: $('startBtn'), useBomCheckbox: $('useBomCheckbox'),
  questionCard: $('questionCard'), qCounter: $('qCounter'), progressFill: $('progressFill'),
  systemTag: $('systemTag'), questionText: $('questionText'), optionsBox: $('optionsBox'),
  freetextBox: $('freetextBox'), freetextInput: $('freetextInput'), freetextSubmit: $('freetextSubmit'), freetextCancel: $('freetextCancel'),
  concludeEarlyBtn: $('concludeEarlyBtn'), extendQuestionsBtn: $('extendQuestionsBtn'),
  qLoading: $('qLoading'),
  escalationCard: $('escalationCard'), escTitle: $('escTitle'), escReason: $('escReason'), escAction: $('escAction'), escDoNot: $('escDoNot'), escNewCase: $('escNewCase'),
  reportCard: $('reportCard'), reportSymptom: $('reportSymptom'), rootCauses: $('rootCauses'),
  conflictsList: $('conflictsList'), actionsList: $('actionsList'), escalateIfList: $('escalateIfList'),
  confirmResultCheckbox: $('confirmResultCheckbox'), feedbackNotesInput: $('feedbackNotesInput'),
  saveFeedbackBtn: $('saveFeedbackBtn'), feedbackSavedMsg: $('feedbackSavedMsg'),
  newCaseBtn: $('newCaseBtn'), reportExtendBtn: $('reportExtendBtn'),
  mainLoading: $('mainLoading'), mainLoadingText: $('mainLoadingText'),
  hypoBox: $('hypoBox'), learnedMemoryBox: $('learnedMemoryBox'), ruledBox: $('ruledBox'), bomBox: $('bomBox'),
  // Tabs
  tabDiagnosisBtn: $('tabDiagnosisBtn'), tabPartBtn: $('tabPartBtn'), tabKnowledgeBtn: $('tabKnowledgeBtn'),
  tabDiagnosis: $('tabDiagnosis'), tabPart: $('tabPart'), tabKnowledge: $('tabKnowledge'),
  // Knowledge
  statTotalCases: $('statTotalCases'), statConfirmedCases: $('statConfirmedCases'), statUserKnowledge: $('statUserKnowledge'),
  kTitleInput: $('kTitleInput'), kSymptomInput: $('kSymptomInput'), kPartCodeInput: $('kPartCodeInput'),
  kRootCauseInput: $('kRootCauseInput'), kSolutionInput: $('kSolutionInput'), addKnowledgeBtn: $('addKnowledgeBtn'),
  userKnowledgeList: $('userKnowledgeList'), recentCasesList: $('recentCasesList'),
};

let sessionId = null;
let serverHasKey = false;
let pendingFallbackOption = null;

// ---------- TAB SWITCHING ----------
function switchTab(tabId) {
  [els.tabDiagnosis, els.tabPart, els.tabKnowledge].forEach(t => t.classList.remove('active'));
  [els.tabDiagnosisBtn, els.tabPartBtn, els.tabKnowledgeBtn].forEach(b => b.classList.remove('active'));

  if (tabId === 'diagnosis') {
    els.tabDiagnosis.classList.add('active');
    els.tabDiagnosisBtn.classList.add('active');
  } else if (tabId === 'part') {
    els.tabPart.classList.add('active');
    els.tabPartBtn.classList.add('active');
  } else if (tabId === 'knowledge') {
    els.tabKnowledge.classList.add('active');
    els.tabKnowledgeBtn.classList.add('active');
    loadKnowledgeData();
  }
}

els.tabDiagnosisBtn.onclick = () => switchTab('diagnosis');
els.tabPartBtn.onclick = () => switchTab('part');
els.tabKnowledgeBtn.onclick = () => switchTab('knowledge');

// ---------- model config handling ----------
function getConfig() {
  try {
    const c = JSON.parse(localStorage.getItem('llm_config') || '{}');
    return {
      provider: c.provider || 'cloud',
      apiKey: c.apiKey || localStorage.getItem('deepseek_api_key') || '',
      baseUrl: c.baseUrl || '',
      bridgeUrl: c.bridgeUrl || '',
      chatModel: c.chatModel || '',
      reasonerModel: c.reasonerModel || '',
      cloudPreset: c.cloudPreset || 'deepseek',
      cloudBaseUrl: c.cloudBaseUrl || '',
      cloudChatModel: c.cloudChatModel || '',
      cloudReasonerModel: c.cloudReasonerModel || '',
    };
  } catch { return { provider: 'cloud', apiKey: '', baseUrl: '', bridgeUrl: '', chatModel: '', reasonerModel: '', cloudPreset: 'deepseek', cloudBaseUrl: '', cloudChatModel: '', cloudReasonerModel: '' }; }
}
function saveConfig(c) { localStorage.setItem('llm_config', JSON.stringify(c)); }
function getKey() { return getConfig().apiKey; }

function configReady() {
  const c = getConfig();
  if (c.provider === 'demo') return true;
  if (c.provider === 'local' || c.provider === 'bridge') return true;
  return Boolean(c.apiKey) || serverHasKey;
}

function refreshKeyStatus() {
  const c = getConfig();
  const ok = configReady();
  const presetNames = { deepseek: 'DeepSeek', openrouter: 'OpenRouter', groq: 'Groq', gemini: 'Gemini', openai: 'OpenAI', xai: 'xAI', mistral: 'Mistral', together: 'Together', avalai: 'AvalAI', gapgpt: 'GapGPT', custom: 'سفارشی' };
  els.keyDot.classList.toggle('ok', ok);
  els.keyText.textContent =
    c.provider === 'demo' ? 'حالت دمو فعال است'
    : c.provider === 'bridge' ? 'مرورگر کروم (پل سلنیومی)'
    : c.provider === 'local' ? ('مدل لوکال: ' + (c.baseUrl || 'http://localhost:11434/v1'))
    : ok ? ((presetNames[c.cloudPreset] || 'ابری') + (c.apiKey ? ' (کلید مرورگر)' : ' (کلید سرور)'))
    : 'کلید API تنظیم نشده';
}

fetch('/api/health').then(r => r.json()).then(d => {
  serverHasKey = Boolean(d.hasEnvKey);
  refreshKeyStatus();
  if (d.dbStats) updateDbStats(d.dbStats);
}).catch(() => {});

const providerRadios = () => [...document.querySelectorAll('input[name="provider"]')];
const cloudFields = document.getElementById('cloudFields');
const localFields = document.getElementById('localFields');
const demoFields = document.getElementById('demoFields');
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
  deepseek:   { base: 'https://api.deepseek.com',                                chat: 'deepseek-chat', reasoner: 'deepseek-reasoner', keyUrl: 'https://platform.deepseek.com', hint: 'سرویس رسمی DeepSeek. ارزان و قوی.' },
  openrouter: { base: 'https://openrouter.ai/api/v1',                            chat: 'deepseek/deepseek-chat-v3.1:free', reasoner: '', keyUrl: 'https://openrouter.ai/keys', hint: 'مدل‌های :free کاملاً رایگان هستند.' },
  groq:       { base: 'https://api.groq.com/openai/v1',                          chat: 'llama-3.3-70b-versatile', reasoner: '', keyUrl: 'https://console.groq.com/keys', hint: 'فوق‌العاده سریع و رایگان.' },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/openai', chat: 'gemini-2.0-flash', reasoner: '', keyUrl: 'https://aistudio.google.com/apikey', hint: 'کلید رایگان از Google AI Studio.' },
  openai:     { base: 'https://api.openai.com/v1',                               chat: 'gpt-4o-mini', reasoner: '', keyUrl: 'https://platform.openai.com/api-keys', hint: 'سرویس رسمی OpenAI.' },
  xai:        { base: 'https://api.x.ai/v1',                                     chat: 'grok-3-mini', reasoner: '', keyUrl: 'https://console.x.ai', hint: 'Grok از xAI.' },
  mistral:    { base: 'https://api.mistral.ai/v1',                               chat: 'mistral-large-latest', reasoner: '', keyUrl: 'https://console.mistral.ai/api-keys', hint: 'پلن رایگان دارد.' },
  together:   { base: 'https://api.together.xyz/v1',                             chat: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', reasoner: '', keyUrl: 'https://api.together.ai/settings/api-keys', hint: 'مدل‌های متن‌باز متنوع.' },
  avalai:     { base: 'https://api.avalai.ir/v1',                                chat: 'gpt-4o-mini', reasoner: '', keyUrl: 'https://avalai.ir', hint: 'درگاه ایرانی بدون تحریم.' },
  gapgpt:     { base: 'https://api.gapgpt.app/v1',                               chat: 'gpt-4o-mini', reasoner: '', keyUrl: 'https://gapgpt.app', hint: 'درگاه ایرانی — پرداخت ریالی.' },
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
  const p = providerRadios().find(r => r.checked)?.value || 'cloud';
  cloudFields.style.display = p === 'cloud' ? 'block' : 'none';
  localFields.style.display = p === 'local' ? 'block' : 'none';
  bridgeFields.style.display = p === 'bridge' ? 'block' : 'none';
  if (demoFields) demoFields.style.display = 'none';
}
providerRadios().forEach(r => r.addEventListener('change', syncProviderFields));

els.settingsBtn.onclick = () => {
  const c = getConfig();
  providerRadios().forEach(r => r.checked = (r.value === c.provider) || (c.provider === 'demo' && r.value === 'cloud'));
  els.apiKeyInput.value = c.apiKey;
  baseUrlInput.value = c.baseUrl;
  if (bridgeUrlInput) bridgeUrlInput.value = c.bridgeUrl || '';
  chatModelInput.value = c.chatModel;
  reasonerModelInput.value = c.reasonerModel;
  cloudPreset.value = c.cloudPreset || 'deepseek';
  applyPreset(cloudPreset.value, true);
  cloudBaseUrlInput.value = c.cloudBaseUrl || PRESETS[cloudPreset.value]?.base || '';
  cloudChatModelInput.value = c.cloudChatModel || PRESETS[cloudPreset.value]?.chat || '';
  cloudReasonerModelInput.value = c.cloudReasonerModel || PRESETS[cloudPreset.value]?.reasoner || '';
  syncProviderFields();
  els.settingsModal.classList.add('show');
};
els.closeModalBtn.onclick = () => els.settingsModal.classList.remove('show');
els.saveKeyBtn.onclick = () => {
  const provider = providerRadios().find(r => r.checked)?.value || 'cloud';
  const apiKey = els.apiKeyInput.value.trim();
  saveConfig({
    provider: provider === 'cloud' && /^demo$/i.test(apiKey) ? 'demo' : provider,
    apiKey,
    baseUrl: baseUrlInput.value.trim(),
    bridgeUrl: bridgeUrlInput ? bridgeUrlInput.value.trim() : '',
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
  localStorage.removeItem('llm_config');
  localStorage.removeItem('deepseek_api_key');
  els.apiKeyInput.value = ''; baseUrlInput.value = ''; chatModelInput.value = ''; reasonerModelInput.value = '';
  refreshKeyStatus();
};
els.settingsModal.onclick = (e) => { if (e.target === els.settingsModal) els.settingsModal.classList.remove('show'); };

// ---------- helpers ----------
function showError(msg) {
  els.errorBanner.textContent = msg;
  els.errorBanner.classList.add('show');
}
function hideError() { els.errorBanner.classList.remove('show'); }

function errorMessage(err, status) {
  if (status === 401 && err?.error === 'missing_api_key')
    return 'کلید API تنظیم نشده است. از دکمه «⚙️ تنظیمات مدل» بالای صفحه کلید را وارد کنید یا گزینه لوکال/پل را انتخاب کنید.';
  if (status === 401) return 'کلید API نامعتبر است. لطفاً تنظیمات را بررسی کنید.';
  if (status === 402) return 'اعتبار حساب مدل کافی نیست.';
  if (status === 502) return 'اتصال به مدل برقرار نشد. شبکه یا سرور لوکال را بررسی کنید.';
  return 'خطا در ارتباط با سرور: ' + (err?.detail || err?.error || status || 'نامشخص');
}

async function api(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const c = getConfig();
  if (c.provider === 'bridge') {
    headers['x-provider'] = 'local';
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
    if (c.provider === 'demo') headers['x-deepseek-key'] = 'demo';
    else if (c.apiKey) headers['x-deepseek-key'] = c.apiKey;
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
  engine: 'موتور', electrical: 'برق و الکترونیک', transmission: 'گیربکس', 'chassis/steering': 'شاسی و فرمان',
  brakes: 'ترمز', fuel: 'سوخت', HVAC: 'تهویه', body: 'بدنه', 'SRS/airbag': 'ایربگ',
  infotainment: 'مالتی‌مدیا', other: 'سایر مدارات',
};

function hide(...ids) { ids.forEach(el => el && el.classList.add('hidden')); }
function show(...ids) { ids.forEach(el => el && el.classList.remove('hidden')); }

function setLoading(on, text) {
  els.mainLoadingText.textContent = text || 'در حال پردازش...';
  els.mainLoading.classList.toggle('hidden', !on);
}

// ---------- sidebar ----------
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

  // Learned Memory in sidebar
  const mem = state.learned_memory || [];
  if (mem.length) {
    els.learnedMemoryBox.innerHTML = mem.map(m => `
      <div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--border);line-height:1.7">
        <span style="color:var(--purple);font-weight:700">📌 ${esc(m.title || m.symptom_match)}</span><br>
        <span style="color:var(--muted)">علت تاییدشده:</span> ${esc(m.learned_root_cause)}
      </div>
    `).join('');
  } else {
    els.learnedMemoryBox.innerHTML = '<p class="hint" style="margin:0">مورد مشابهی در حافظه گذشته یافت نشد (عیب‌یابی آزاد/مستقل).</p>';
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
  els.qCounter.textContent = `سوال ${faDigits(n)} از ${faDigits(max)} (امکان پرسیدن سوالات بیشتر وجود دارد)`;
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
  const rep = data.report || {};
  els.reportSymptom.textContent = 'علامت گزارش‌شده: ' + (data.state?.symptom || '');
  els.feedbackSavedMsg.style.display = 'none';

  els.rootCauses.innerHTML = (rep.root_causes || []).map((rc, i) => `
    <div class="rc">
      <div class="head">
        <div class="cause">${faDigits(i + 1)}. ${esc(rc.cause)}</div>
        <span class="band ${esc(rc.band)}">${faDigits(rc.confidence ?? '')}٪ · ${bandFa(rc.band)}</span>
      </div>
      ${rc.evidence ? `<div class="evidence">🔎 ${esc(rc.evidence)}</div>` : ''}
    </div>`).join('') || '<p class="hint">علتی ثبت نشد.</p>';

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

// ---------- actions ----------
async function startSession() {
  const symptom = els.symptomInput.value.trim();
  if (!symptom) { showError('لطفاً ابتدا علامت یا مشکل را بنویسید.'); return; }
  if (!configReady()) {
    showError('لطفاً ابتدا از دکمه «⚙️ تنظیمات مدل» یک سرویس را انتخاب کنید.');
    els.settingsModal.classList.add('show');
    return;
  }
  hideError();
  els.startBtn.disabled = true;
  setLoading(true, 'در حال جستجو در دیتابیس یادگیری و آماده‌سازی اولین سوال...');
  try {
    const use_bom = Boolean(els.useBomCheckbox.checked);
    const data = await api('/api/session/start', { symptom, use_bom, max_questions: 8 });
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

// Extend questions (+4 more questions)
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

// Conclude early
async function concludeEarly() {
  if (!sessionId) return;
  hideError();
  setLoading(true, 'در حال استنتاج نهایی و تحلیل تمام شواهد با مدل هوش مصنوعی...');
  try {
    const data = await api('/api/session/conclude', { sessionId });
    handleResponse(data);
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

// Save feedback to Database
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
  hideError();
  hide(els.questionCard, els.escalationCard, els.reportCard);
  show(els.startCard);
  els.symptomInput.value = '';
  els.hypoBox.innerHTML = '<p class="hint" style="margin:0">پس از شروع عیب‌یابی، فرضیه‌ها اینجا نمایش داده می‌شوند.</p>';
  els.learnedMemoryBox.innerHTML = '<p class="hint" style="margin:0">تجربیات بازیابی‌شده از دیتابیس برای این مورد نمایش داده می‌شوند.</p>';
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

// ---------- Part Analysis ----------
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
    } else {
      html += `<div class="rc"><div class="cause">ℹ️ تحلیل بر اساس پایگاه دانش عمومی قطعات الکترونیک / مکانیک</div></div>`;
    }

    if (d.learned_memory?.length) {
      html += `<h3 style="color:var(--purple);font-size:14.5px;margin:14px 0 6px">🧠 حافظه دیتابیس یادگیری: تجربیات مشابه ثبت‌شده</h3><ul style="padding-right:18px;line-height:2;font-size:13.5px">`;
      for (const m of d.learned_memory) {
        html += `<li><b>${esc(m.title)}</b>: علت تاییدشده: ${esc(m.learned_root_cause)} | راهکار: ${esc(m.learned_solution)}</li>`;
      }
      html += '</ul>';
    }

    if (d.known_issues?.length) {
      for (const cat of d.known_issues) {
        html += `<h3 style="color:var(--accent);font-size:14.5px;margin:14px 0 6px">📚 ایرادات شناخته‌شده: ${esc(cat.category)} <span style="font-size:11px;color:var(--muted)">(بروزرسانی: ${esc(cat.updated_at)})</span></h3><ul style="padding-right:18px;line-height:2;font-size:13.5px">`;
        for (const i of cat.issues) {
          html += `<li><b>${esc(i.issue_fa)}</b><br><span style="color:var(--muted)">علت: ${esc(i.cause_fa)} | تشخیص: ${esc(i.detection_fa)}</span></li>`;
        }
        html += '</ul>';
      }
    }

    const a = d.analysis;
    if (a && !a.unavailable && a.summary) {
      html += `<h3 style="color:var(--accent);font-size:14.5px;margin:14px 0 6px">🤖 تحلیل جامع مدل هوش مصنوعی</h3><p style="font-size:13.5px;line-height:2">${esc(a.summary)}</p>`;
      if (a.failure_modes?.length) {
        html += '<div>' + a.failure_modes.map(f => `<div class="rc"><div class="head"><div class="cause" style="font-size:13.5px">${esc(f.mode)}</div>${likBadge(f.likelihood)}</div><div class="evidence">${esc(f.why || '')}</div></div>`).join('') + '</div>';
      }
      if (a.inspection_steps?.length) html += `<h3 style="color:var(--accent);font-size:14px;margin:10px 0 4px">مراحل تست و بازرسی</h3><ol style="padding-right:18px;line-height:2;font-size:13.5px">${a.inspection_steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
      if (a.process_notes?.length) html += `<h3 style="color:var(--accent);font-size:14px;margin:10px 0 4px">نکات فرآیندی و مونتاژ</h3><ul style="padding-right:18px;line-height:2;font-size:13.5px">${a.process_notes.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
    } else {
      html += '<p class="hint">🤖 برای تحلیل زنده هوش مصنوعی، تنظیمات مدل را فعال کنید.</p>';
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
    els.userKnowledgeList.innerHTML = '<p class="hint">هنوز تجربه یا قانونی توسط شما در دیتابیس ثبت نشده است. از فرم بالا اولین مورد را اضافه کنید.</p>';
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
    els.recentCasesList.innerHTML = '<p class="hint">هنوز پرونده عیب‌یابی در دیتابیس ثبت نشده است.</p>';
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
