// Guided Diagnostic Assistant — frontend
const $ = (id) => document.getElementById(id);

const els = {
  keyDot: $('keyDot'), keyText: $('keyText'),
  settingsBtn: $('settingsBtn'), settingsModal: $('settingsModal'),
  apiKeyInput: $('apiKeyInput'), saveKeyBtn: $('saveKeyBtn'), clearKeyBtn: $('clearKeyBtn'), closeModalBtn: $('closeModalBtn'),
  errorBanner: $('errorBanner'),
  startCard: $('startCard'), symptomInput: $('symptomInput'), startBtn: $('startBtn'),
  questionCard: $('questionCard'), qCounter: $('qCounter'), progressFill: $('progressFill'),
  systemTag: $('systemTag'), questionText: $('questionText'), optionsBox: $('optionsBox'),
  freetextBox: $('freetextBox'), freetextInput: $('freetextInput'), freetextSubmit: $('freetextSubmit'), freetextCancel: $('freetextCancel'),
  qLoading: $('qLoading'),
  escalationCard: $('escalationCard'), escTitle: $('escTitle'), escReason: $('escReason'), escAction: $('escAction'), escDoNot: $('escDoNot'), escNewCase: $('escNewCase'),
  reportCard: $('reportCard'), reportSymptom: $('reportSymptom'), rootCauses: $('rootCauses'),
  conflictsList: $('conflictsList'), actionsList: $('actionsList'), escalateIfList: $('escalateIfList'), newCaseBtn: $('newCaseBtn'),
  mainLoading: $('mainLoading'), mainLoadingText: $('mainLoadingText'),
  hypoBox: $('hypoBox'), ruledBox: $('ruledBox'), bomBox: $('bomBox'),
};

let sessionId = null;
let serverHasKey = false;
let pendingFallbackOption = null;

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
    };
  } catch { return { provider: 'cloud', apiKey: '', baseUrl: '', bridgeUrl: '', chatModel: '', reasonerModel: '' }; }
}
function saveConfig(c) { localStorage.setItem('llm_config', JSON.stringify(c)); }
function getKey() { return getConfig().apiKey; }

function configReady() {
  const c = getConfig();
  if (c.provider === 'demo') return true;
  if (c.provider === 'local' || c.provider === 'bridge') return true; // key not required
  return Boolean(c.apiKey) || serverHasKey;
}

function refreshKeyStatus() {
  const c = getConfig();
  const ok = configReady();
  els.keyDot.classList.toggle('ok', ok);
  els.keyText.textContent =
    c.provider === 'demo' ? 'حالت دمو فعال است'
    : c.provider === 'bridge' ? 'مرورگر کروم (پل سلنیومی)'
    : c.provider === 'local' ? ('مدل لوکال: ' + (c.baseUrl || 'http://localhost:11434/v1'))
    : ok ? (c.apiKey ? 'DeepSeek ابری (کلید مرورگر)' : 'DeepSeek ابری (کلید سرور)')
    : 'کلید API تنظیم نشده';
}

fetch('/api/health').then(r => r.json()).then(d => {
  serverHasKey = Boolean(d.hasEnvKey);
  refreshKeyStatus();
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
    return 'کلید DeepSeek API تنظیم نشده است. از دکمه «تنظیمات API» بالای صفحه کلید خود را وارد کنید.';
  if (status === 401) return 'کلید API نامعتبر است. لطفاً کلید را در تنظیمات بررسی کنید.';
  if (status === 402) return 'اعتبار حساب DeepSeek شما کافی نیست.';
  if (status === 502) return 'سرور برنامه نمی‌تواند به DeepSeek API متصل شود. اتصال شبکه را بررسی کنید یا برای تست، کلید «demo» را وارد کنید.';
  return 'خطا در ارتباط با سرور: ' + (err?.detail || err?.error || status || 'نامشخص');
}

async function api(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const c = getConfig();
  if (c.provider === 'bridge') {
    headers['x-provider'] = 'local';
    headers['x-base-url'] = c.bridgeUrl || 'http://localhost:8765/v1';
  } else {
    headers['x-provider'] = c.provider === 'demo' ? 'cloud' : c.provider;
    if (c.provider === 'demo') headers['x-deepseek-key'] = 'demo';
    else if (c.apiKey) headers['x-deepseek-key'] = c.apiKey;
    if (c.baseUrl) headers['x-base-url'] = c.baseUrl;
  }
  if (c.chatModel) headers['x-chat-model'] = c.chatModel;
  if (c.reasonerModel) headers['x-reasoner-model'] = c.reasonerModel;
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
  engine: 'موتور', electrical: 'برق', transmission: 'گیربکس', 'chassis/steering': 'شاسی/فرمان',
  brakes: 'ترمز', fuel: 'سوخت', HVAC: 'تهویه', body: 'بدنه', 'SRS/airbag': 'ایربگ',
  infotainment: 'مالتی‌مدیا', other: 'سایر',
};

function hide(...ids) { ids.forEach(el => el.classList.add('hidden')); }
function show(...ids) { ids.forEach(el => el.classList.remove('hidden')); }

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
  const ruled = state.ruled_out || [];
  els.ruledBox.innerHTML = ruled.length ? ruled.map(r => `<li>${esc(r)}</li>`).join('') : '<li>—</li>';

  const bom = state.bom_parts || [];
  if (bom.length) {
    const shown = bom.slice(0, 12);
    els.bomBox.innerHTML = shown.map(p =>
      `<li>${esc(p.name || p.name_fa)} <span style="color:var(--accent);direction:ltr;display:inline-block">${esc(p.code)}</span>${p.qty ? ` <span style="opacity:.6">×${esc(p.qty)}</span>` : ''}${p.notes ? ` — <span style="opacity:.75">${esc(p.notes)}</span>` : ''}</li>`
    ).join('') + (bom.length > shown.length ? `<li style="opacity:.6">و ${bom.length - shown.length} قطعه دیگر...</li>` : '');
  } else {
    els.bomBox.innerHTML = '<li>قطعه‌ای برای این سیستم در BOM ثبت نشده است.</li>';
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- flow rendering ----------
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
  els.qCounter.textContent = `سوال ${faDigits(n)} از ${faDigits(max)}`;
  els.progressFill.style.width = `${((n - 1) / max) * 100}%`;

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
  els.progressFill && (els.progressFill.style.width = '100%');
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
  if (!symptom) { showError('لطفاً ابتدا علامت یا مشکل خودرو را بنویسید.'); return; }
  if (!configReady()) {
    showError('کلید DeepSeek API تنظیم نشده است. از دکمه «تنظیمات API» بالای صفحه کلید خود را وارد کنید، یا حالت لوکال/دمو را انتخاب کنید.');
    els.settingsModal.classList.add('show');
    return;
  }
  hideError();
  els.startBtn.disabled = true;
  setLoading(true, 'در حال تحلیل علامت و آماده‌سازی اولین سوال...');
  try {
    const data = await api('/api/session/start', { symptom });
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

function resetToStart() {
  sessionId = null;
  hideError();
  hide(els.questionCard, els.escalationCard, els.reportCard);
  show(els.startCard);
  els.symptomInput.value = '';
  els.hypoBox.innerHTML = '<p class="hint" style="margin:0">پس از شروع عیب‌یابی، فرضیه‌ها اینجا نمایش داده می‌شوند.</p>';
  els.ruledBox.innerHTML = '<li>—</li>';
  els.bomBox.innerHTML = '<li>پس از تشخیص سیستم، قطعات BOM مرتبط اینجا نمایش داده می‌شوند.</li>';
}

els.startBtn.onclick = startSession;
els.symptomInput.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) startSession(); });
els.freetextSubmit.onclick = () => {
  const t = els.freetextInput.value.trim();
  if (!t) { showError('لطفاً توضیح خود را بنویسید.'); return; }
  submitAnswer(pendingFallbackOption || '', t);
};
els.freetextCancel.onclick = () => { els.freetextBox.classList.remove('show'); pendingFallbackOption = null; };
els.newCaseBtn.onclick = resetToStart;
els.escNewCase.onclick = resetToStart;

document.querySelectorAll('.examples button').forEach(b => {
  b.onclick = () => { els.symptomInput.value = b.dataset.ex; els.symptomInput.focus(); };
});

// ---------- Part analysis (Part Name + Part No. -> result) ----------
const partNameInput = $('partNameInput'), partNoInput = $('partNoInput');
const partAnalyzeBtn = $('partAnalyzeBtn'), issuesRefreshBtn = $('issuesRefreshBtn');
const partLoading = $('partLoading'), partResult = $('partResult');

// fill datalist suggestions from the BOM
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
  if (!part_name && !part_no) { showError('حداقل یکی از Part Name یا Part No. را وارد کنید.'); return; }
  hideError();
  partLoading.classList.remove('hidden');
  partAnalyzeBtn.disabled = true;
  partResult.innerHTML = '';
  try {
    const d = await api('/api/part/analyze', { part_name, part_no });
    let html = '';
    if (d.bom_match) {
      html += `<div class="rc"><div class="cause">✅ در BOM پیدا شد: ${esc(d.bom_match.part_name_en || d.bom_match.part_name_fa)}</div>
        <div class="evidence" dir="ltr" style="text-align:left">Part No: ${esc(d.bom_match.part_no || '-')} | Stock: ${esc(d.bom_match.part_code)}${d.bom_match.qty ? ' | QTY: ' + esc(d.bom_match.qty) : ''}${d.bom_match.size ? ' | ' + esc(d.bom_match.size) : ''}</div>
        ${d.bom_match.designator ? `<div class="evidence" dir="ltr" style="text-align:left">Refs: ${esc(d.bom_match.designator)}</div>` : ''}</div>`;
    } else {
      html += `<div class="rc"><div class="cause">⚠️ این قطعه در BOM فعلی پیدا نشد — تحلیل عمومی انجام می‌شود.</div></div>`;
    }
    if (d.known_issues?.length) {
      for (const cat of d.known_issues) {
        html += `<h3 style="color:var(--accent);font-size:14.5px;margin:14px 0 6px">📚 ایرادات شناخته‌شده: ${esc(cat.category)} <span style="font-size:11px;color:var(--muted)">(بروزرسانی: ${esc(cat.updated_at)})</span></h3><ul style="padding-right:18px;line-height:2;font-size:13.5px">`;
        for (const i of cat.issues) {
          html += `<li><b>${esc(i.issue_fa)}</b><br><span style="color:var(--muted)">علت: ${esc(i.cause_fa)} | تشخیص: ${esc(i.detection_fa)}</span></li>`;
        }
        html += '</ul>';
        if (cat.sources?.length) html += `<div style="font-size:11px;color:var(--muted)" dir="ltr">Sources: ${cat.sources.map(s => `<a href="${esc(s)}" target="_blank" style="color:var(--accent)">${esc(new URL(s).hostname)}</a>`).join(' · ')}</div>`;
      }
    } else {
      html += '<p class="hint">برای این قطعه دسته‌ای در دیتابیس ایرادات ثبت نشده است.</p>';
    }
    const a = d.analysis;
    if (a && !a.unavailable && a.summary) {
      html += `<h3 style="color:var(--accent);font-size:14.5px;margin:14px 0 6px">🤖 تحلیل مدل</h3><p style="font-size:13.5px;line-height:2">${esc(a.summary)}</p>`;
      if (a.failure_modes?.length) {
        html += '<div>' + a.failure_modes.map(f => `<div class="rc"><div class="head"><div class="cause" style="font-size:13.5px">${esc(f.mode)}</div>${likBadge(f.likelihood)}</div><div class="evidence">${esc(f.why || '')}</div></div>`).join('') + '</div>';
      }
      if (a.inspection_steps?.length) html += `<h3 style="color:var(--accent);font-size:14px;margin:10px 0 4px">مراحل بازرسی</h3><ol style="padding-right:18px;line-height:2;font-size:13.5px">${a.inspection_steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
      if (a.process_notes?.length) html += `<h3 style="color:var(--accent);font-size:14px;margin:10px 0 4px">نکات فرآیندی</h3><ul style="padding-right:18px;line-height:2;font-size:13.5px">${a.process_notes.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
    } else if (a?.unavailable) {
      html += `<p class="hint">🤖 تحلیل مدل در دسترس نبود (${esc(a.reason || '')}) — نتایج بالا از دیتابیس محلی است.</p>`;
    } else {
      html += '<p class="hint">🤖 برای تحلیل مدل، در تنظیمات یکی از حالت‌های ابری/کروم/لوکال را فعال کنید — نتایج بالا از دیتابیس محلی است.</p>';
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

issuesRefreshBtn.onclick = async () => {
  hideError();
  issuesRefreshBtn.disabled = true;
  issuesRefreshBtn.textContent = '⏳ در حال بروزرسانی...';
  try {
    const d = await api('/api/known-issues/refresh', {});
    const done = (d.results || []).filter(r => r.updated).length;
    issuesRefreshBtn.textContent = `✅ ${done} دسته بروزرسانی شد (${d.db_updated_at})`;
  } catch (e) {
    showError(e.message);
    issuesRefreshBtn.textContent = '🔄 بروزرسانی دیتابیس ایرادات';
  } finally {
    issuesRefreshBtn.disabled = false;
    setTimeout(() => { issuesRefreshBtn.textContent = '🔄 بروزرسانی دیتابیس ایرادات'; }, 6000);
  }
};
