// Mock OpenAI-compatible local LLM server (simulates Ollama /v1) for testing the "local model" mode.
// Run: node test/mock_local_llm.js   (listens on 11434)
import http from 'node:http';

const PORT = process.env.MOCK_PORT || 11434;

http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
    res.writeHead(404); return res.end();
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    const userMsg = parsed.messages?.find(m => m.role === 'user')?.content || '{}';
    let state = {};
    try { state = JSON.parse(userMsg); } catch {}
    const isTier2 = /root-cause analyst/i.test(parsed.messages?.[0]?.content || '');

    let content;
    if (isTier2) {
      content = '<think>reasoning about the case...</think>\n' + JSON.stringify({
        root_causes: [{ cause: 'خلاصی هیدرولیکی تایپیت (پاسخ مدل لوکالِ آزمایشی)', confidence: 65, band: 'Medium', evidence: 'صدا فقط در استارت سرد و قطع پس از گرم شدن' }],
        unresolved_conflicts: [],
        recommended_actions: ['بررسی سطح و ویسکوزیته روغن', 'تست فشار روغن طبق مستندات رسمی IKCO/OEM'],
        escalate_if: ['تکرار در چند خودرو'],
      });
    } else if ((state.question_count ?? 0) >= 2) {
      content = JSON.stringify({ conclude: true, leading_hypotheses: [{ hypothesis: 'خلاصی تایپیت', confidence: 70 }], ruled_out: ['یاتاقان - صدا در گرم ادامه ندارد'] });
    } else {
      content = JSON.stringify({
        question: `سوال آزمایشی شماره ${(state.question_count ?? 0) + 1} از مدل لوکال؟`,
        options: ['گزینه الف', 'گزینه ب'],
        system: 'engine',
        leading_hypotheses: [{ hypothesis: 'فرضیه لوکال ۱', confidence: 50 }],
        ruled_out: [],
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
  });
}).listen(PORT, '127.0.0.1', () => console.log(`mock local LLM on http://127.0.0.1:${PORT}/v1`));
