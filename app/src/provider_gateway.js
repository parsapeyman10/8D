// Multi-Model Auto-Failover, Health Monitoring & Key Rotation Gateway
// Seamlessly rotates across Claude, Gemini, DeepSeek, Local LLMs, and 100% Offline Engine

import { callClaude, testClaude } from './claude.js';
import { callGemini, testGemini } from './gemini.js';
import { runOfflineStep, runOfflineReport } from './offline_engine.js';

// Provider health tracking state
const providerHealth = {
  claude: { healthy: true, failures: 0, lastFailure: 0, keyIndex: 0 },
  gemini: { healthy: true, failures: 0, lastFailure: 0, keyIndex: 0 },
  deepseek: { healthy: true, failures: 0, lastFailure: 0 },
  bridge: { healthy: true, failures: 0, lastFailure: 0 },
  offline: { healthy: true, failures: 0, lastFailure: 0 },
};

const COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown on failure

function getKeysFromEnv(envVarName) {
  const raw = process.env[envVarName] || '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

// Key Pools for Claude and Gemini
const CLAUDE_KEY_POOL = [
  ...getKeysFromEnv('ANTHROPIC_API_KEYS'),
  ...getKeysFromEnv('CLAUDE_API_KEYS'),
  process.env.ANTHROPIC_API_KEY,
  process.env.CLAUDE_API_KEY,
].filter(Boolean);

const GEMINI_KEY_POOL = [
  ...getKeysFromEnv('GEMINI_API_KEYS'),
  process.env.GEMINI_API_KEY,
].filter(Boolean);

export function getNextKey(provider, userProvidedKey = '') {
  if (userProvidedKey) return userProvidedKey;

  if (provider === 'claude') {
    if (!CLAUDE_KEY_POOL.length) return '';
    const st = providerHealth.claude;
    st.keyIndex = (st.keyIndex + 1) % CLAUDE_KEY_POOL.length;
    return CLAUDE_KEY_POOL[st.keyIndex];
  }

  if (provider === 'gemini') {
    if (!GEMINI_KEY_POOL.length) return '';
    const st = providerHealth.gemini;
    st.keyIndex = (st.keyIndex + 1) % GEMINI_KEY_POOL.length;
    return GEMINI_KEY_POOL[st.keyIndex];
  }

  return '';
}

export function isProviderAvailable(providerName) {
  const st = providerHealth[providerName];
  if (!st) return false;
  if (providerName === 'offline') return true;
  if (!st.healthy && Date.now() - st.lastFailure < COOLDOWN_MS) {
    return false;
  }
  return true;
}

export function markProviderSuccess(providerName) {
  if (providerHealth[providerName]) {
    providerHealth[providerName].healthy = true;
    providerHealth[providerName].failures = 0;
  }
}

export function markProviderFailure(providerName, error) {
  if (providerHealth[providerName]) {
    providerHealth[providerName].failures += 1;
    providerHealth[providerName].lastFailure = Date.now();
    if (providerHealth[providerName].failures >= 2) {
      providerHealth[providerName].healthy = false;
      console.warn(`⚠️ سرویس ${providerName} موقتاً به دلیل خطا (${error?.message || error}) از دسترس خارج شد. سوییچ خودکار به مدل پشتیبان.`);
    }
  }
}

/**
 * Universal resilient caller with automatic failover across Claude, Gemini, DeepSeek, and Offline Engine.
 */
export async function resilientCall({ preferredProvider = 'bridge', system, user, temperature = 0.1, maxTokens = 3500, state, customConfig = {} }) {
  // Provider priority list based on preferred selection
  const priorityChain = [];

  if (preferredProvider === 'claude') {
    priorityChain.push('claude', 'gemini', 'bridge', 'offline');
  } else if (preferredProvider === 'gemini') {
    priorityChain.push('gemini', 'claude', 'bridge', 'offline');
  } else if (preferredProvider === 'bridge') {
    priorityChain.push('bridge', 'gemini', 'claude', 'offline');
  } else if (preferredProvider === 'offline') {
    priorityChain.push('offline');
  } else {
    priorityChain.push(preferredProvider, 'gemini', 'claude', 'bridge', 'offline');
  }

  let lastError = null;

  for (const provider of priorityChain) {
    if (!isProviderAvailable(provider)) {
      continue;
    }

    try {
      // 1. Anthropic Claude
      if (provider === 'claude') {
        const apiKey = customConfig.claudeKey || getNextKey('claude');
        if (apiKey) {
          const raw = await callClaude({
            apiKey,
            model: customConfig.claudeModel || 'claude-3-5-sonnet-20241022',
            system,
            user,
            temperature,
            maxTokens,
            baseUrl: customConfig.claudeBaseUrl,
          });
          const parsed = tryParseJson(raw);
          if (parsed) {
            markProviderSuccess('claude');
            return { result: parsed, provider: 'claude', model: 'claude-3-5-sonnet' };
          }
        }
      }

      // 2. Google Gemini
      if (provider === 'gemini') {
        const apiKey = customConfig.geminiKey || getNextKey('gemini');
        if (apiKey) {
          const raw = await callGemini({
            apiKey,
            model: customConfig.geminiModel || 'gemini-1.5-flash',
            system,
            user,
            temperature,
            maxTokens,
            baseUrl: customConfig.geminiBaseUrl,
          });
          const parsed = tryParseJson(raw);
          if (parsed) {
            markProviderSuccess('gemini');
            return { result: parsed, provider: 'gemini', model: 'gemini-1.5-flash' };
          }
        }
      }

      // 3. DeepSeek Bridge / Cloud
      if (provider === 'bridge' || provider === 'deepseek') {
        const base = (customConfig.bridgeUrl || 'http://127.0.0.1:8765/v1').replace(/\/+$/, '');
        const resp = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bridge' },
          body: JSON.stringify({
            model: 'deepseek-web-chrome',
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            temperature,
            max_tokens: maxTokens,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content || '';
          const parsed = tryParseJson(content);
          if (parsed) {
            markProviderSuccess(provider);
            return { result: parsed, provider: 'deepseek_bridge', model: 'deepseek-web-chrome' };
          }
        }
      }

      // 4. Offline Fallback
      if (provider === 'offline') {
        if (state && state.findings) {
          return { result: runOfflineReport(state), provider: 'offline_engine', model: 'offline_automotive_fmea' };
        } else if (state) {
          return { result: runOfflineStep(state), provider: 'offline_engine', model: 'offline_automotive_fmea' };
        }
      }
    } catch (err) {
      lastError = err;
      markProviderFailure(provider, err);
    }
  }

  // Guaranteed fallback to offline engine if everything else fails
  if (state && state.findings && state.phase === 'concluding') {
    return { result: runOfflineReport(state), provider: 'offline_fallback', model: 'offline_automotive_fmea' };
  } else if (state) {
    return { result: runOfflineStep(state), provider: 'offline_fallback', model: 'offline_automotive_fmea' };
  }

  throw lastError || new Error('تمامی ارائه‌دهندگان هوش مصنوعی با خطا مواجه شدند.');
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

export function getGatewayStatus() {
  return {
    providers: providerHealth,
    hasClaudePool: CLAUDE_KEY_POOL.length > 0,
    hasGeminiPool: GEMINI_KEY_POOL.length > 0,
  };
}
