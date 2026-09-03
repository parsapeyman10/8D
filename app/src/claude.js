// Anthropic Claude API Client
// Supports Claude 3.5 Sonnet, Claude 3 Haiku, and OpenRouter / Anthropic compatible endpoints

export async function callClaude({ apiKey, model = 'claude-3-5-sonnet-20241022', system, user, temperature = 0.1, maxTokens = 3500, baseUrl }) {
  const url = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '') + '/messages';
  const cleanKey = (apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '').trim();

  if (!cleanKey) {
    throw new Error('missing_claude_api_key');
  }

  const payload = {
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: maxTokens,
    temperature,
    system: system || 'You are an expert automotive electronics diagnostic engineer. Output valid JSON only.',
    messages: [
      { role: 'user', content: user },
    ],
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': cleanKey,
    'anthropic-version': '2023-06-01',
  };

  // If using OpenRouter or third party proxy
  if (url.includes('openrouter.ai')) {
    headers['Authorization'] = `Bearer ${cleanKey}`;
    delete headers['x-api-key'];
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    const err = new Error(`Claude API error ${resp.status}: ${errText.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  return text;
}

export async function testClaude(apiKey, model = 'claude-3-5-sonnet-20241022') {
  try {
    const reply = await callClaude({
      apiKey,
      model,
      system: 'You are a test assistant. Output valid JSON only.',
      user: 'Return {"ok": true, "message": "Claude connection verified successfully"}',
      maxTokens: 100,
    });
    return { ok: true, model, reply };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
