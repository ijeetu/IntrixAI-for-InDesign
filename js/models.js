/**
 * Aide — models.js
 * Model discovery, provider switching, and API configuration.
 * Supports: Ollama (local), Google Gemini, OpenAI, Anthropic, Custom (OpenAI-compatible).
 */

const AideModels = (() => {
    const DEFAULT_MODELS = {
        'claude-cli': 'Claude Code CLI',
        'antigravity-cli': 'Antigravity CLI',
        'codex-cli': 'Codex CLI',
        'gemini-cli': 'Gemini CLI',
        ollama: 'qwen2.5-coder:7b',
        google: 'gemini-2.0-flash',
        openai: 'gpt-4o-mini',
        anthropic: 'claude-sonnet-4-20250514',
        custom: ''
    };

    const DEFAULTS = {
        provider: 'claude-cli',
        ollamaHost: 'http://localhost:11434',
        model: 'Claude Code CLI',
        temperature: 0.3,
        apiKeys: {
            google: '',
            openai: '',
            anthropic: '',
            openrouter: '',
            custom: ''
        },
        customEndpoint: '',
        debugLogging: false
    };

    // Recommended Ollama models, ranked by ExtendScript capability
    const RECOMMENDED_MODELS = [
        { name: 'qwen2.5-coder:14b', desc: 'Best balance — recommended if you have 16GB+ RAM', ram: '16GB' },
        { name: 'qwen2.5-coder:7b', desc: 'Good for 8GB RAM systems', ram: '8GB' },
        { name: 'deepseek-coder-v2:16b', desc: 'Strong code generation, needs 16GB+', ram: '16GB' },
        { name: 'codestral:22b', desc: 'Mistral code model, very capable, 32GB+ RAM', ram: '32GB' },
        { name: 'codegemma:7b', desc: 'Google code model, lightweight', ram: '8GB' },
        { name: 'codellama:7b', desc: 'Meta code-focused, good ES3 adherence', ram: '8GB' },
        { name: 'llama3:8b', desc: 'General purpose, decent at code', ram: '8GB' }
    ];

    // Known models for remote providers
    const REMOTE_MODELS = {
        'claude-cli': [
            { name: 'Claude Code CLI', desc: 'Local CLI agent with live InDesign MCP tools' }
        ],
        'antigravity-cli': [
            { name: 'Antigravity CLI (agy)', desc: 'Local CLI agent with live InDesign MCP tools' }
        ],
        'codex-cli': [
            { name: 'Codex CLI', desc: 'Local CLI agent with live InDesign MCP tools' }
        ],
        'gemini-cli': [
            { name: 'Gemini CLI', desc: 'Local CLI agent with live InDesign MCP tools' }
        ],
        google: [
            { name: 'gemini-2.0-flash', desc: 'Fast, free tier' },
            { name: 'gemini-2.0-flash-lite', desc: 'Ultra-fast, free tier' },
            { name: 'gemini-1.5-flash', desc: 'Fast & capable' },
            { name: 'gemini-1.5-pro', desc: 'Most capable' },
        ],
        openai: [
            { name: 'gpt-4o-mini', desc: 'Fast & cheap' },
            { name: 'gpt-4o', desc: 'Most capable' },
            { name: 'gpt-4-turbo', desc: 'Previous gen' },
        ],
        anthropic: [
            { name: 'claude-sonnet-4-20250514', desc: 'Best value' },
            { name: 'claude-3-5-haiku-20241022', desc: 'Fast & light' },
            { name: 'claude-opus-4-20250514', desc: 'Most capable' },
        ],
        openrouter: [
            { name: 'anthropic/claude-3.5-sonnet', desc: 'Via OpenRouter' },
            { name: 'google/gemini-2.0-flash', desc: 'Via OpenRouter' },
            { name: 'openai/gpt-4o-mini', desc: 'Via OpenRouter' },
            { name: 'openai/gpt-4o', desc: 'Via OpenRouter' }
        ]
    };

    let config = { ...DEFAULTS };

    // ──────────── Debug Logging ────────────
    let debugLog = [];

    function log(type, data) {
        if (!config.debugLogging) return;
        const entry = {
            timestamp: new Date().toISOString(),
            type: type,
            data: data,
            // Always include current provider, model, and temperature context
            provider: config.provider,
            model: config.model,
            temperature: config.temperature
        };
        debugLog.push(entry);
        console.log(`[Aide Debug] ${type}:`, data);
        // Persist to localStorage (keep last 500 entries)
        try {
            if (debugLog.length > 500) debugLog = debugLog.slice(-500);
            localStorage.setItem('aide_debug_log', JSON.stringify(debugLog));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
                debugLog = debugLog.slice(-Math.floor(debugLog.length / 2));
                try {
                    localStorage.setItem('aide_debug_log', JSON.stringify(debugLog));
                } catch (innerE) { /* Give up */ }
                
                // Inform UI in case it wants to show general warning
                window.dispatchEvent(new CustomEvent('QUOTA_EXCEEDED', {
                    detail: { source: 'debug' }
                }));
            }
        }
    }

    function getDebugLog() {
        try {
            const saved = localStorage.getItem('aide_debug_log');
            return saved ? JSON.parse(saved) : debugLog;
        } catch (e) {
            return debugLog;
        }
    }

    function clearDebugLog() {
        debugLog = [];
        try { localStorage.removeItem('aide_debug_log'); } catch (e) { }
    }

    function exportDebugLog() {
        const log = getDebugLog();
        const lines = log.map(e => {
            const data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2);
            // Include per-entry provider/model/temperature if available (2.7.4.1)
            const meta = [
                e.provider ? `Provider: ${e.provider}` : '',
                e.model ? `Model: ${e.model}` : '',
                e.temperature !== undefined ? `Temperature: ${e.temperature}` : ''
            ].filter(Boolean).join(' | ');
            const metaLine = meta ? `\n[${meta}]` : '';
            return `[${e.timestamp}] [${e.type}]${metaLine}\n${data}\n`;
        });
        const cfg = config;
        return `AIDE DEBUG LOG\nExported: ${new Date().toISOString()}\nProvider: ${cfg.provider}\nModel: ${cfg.model}\nTemperature: ${cfg.temperature}\n${'='.repeat(60)}\n\n${lines.join('\n' + '-'.repeat(40) + '\n\n')}`;
    }

    // ──────────── Settings ────────────
    function loadSettings() {
        try {
            const saved = localStorage.getItem('aide_settings');
            if (saved) {
                const parsed = JSON.parse(saved);

                // Migration: v2.0 had string apiKey, v2.1 uses apiKeys object
                if (typeof parsed.apiKey === 'string' && !parsed.apiKeys) {
                    parsed.apiKeys = { ...DEFAULTS.apiKeys };
                    if (parsed.provider && parsed.provider !== 'ollama') {
                        parsed.apiKeys[parsed.provider] = parsed.apiKey;
                    }
                    delete parsed.apiKey; // remove old key
                }

                config = { ...DEFAULTS, ...parsed };
                // Ensure all keys exist if new providers were added
                config.apiKeys = { ...DEFAULTS.apiKeys, ...(config.apiKeys || {}) };
            }
        } catch (e) {
            console.warn('Could not load settings:', e);
        }
        return config;
    }

    function saveSettings() {
        try {
            localStorage.setItem('aide_settings', JSON.stringify(config));
        } catch (e) {
            console.warn('Could not save settings:', e);
        }
    }

    function getConfig() {
        return { ...config };
    }

    function setConfig(updates) {
        Object.assign(config, updates);
        saveSettings();
    }

    function setApiKey(provider, key) {
        if (!config.apiKeys) config.apiKeys = {};
        config.apiKeys[provider] = key;
        saveSettings();
    }

    function getDefaultModel(provider) {
        return DEFAULT_MODELS[provider] || '';
    }

    function getRecommendedModels() {
        return RECOMMENDED_MODELS;
    }

    function getRemoteModels(provider) {
        return REMOTE_MODELS[provider] || [];
    }

    // ──────────── Model Discovery ────────────
    async function fetchOllamaModels() {
        const url = `${config.ollamaHost}/api/tags`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
        const data = await response.json();
        return (data.models || []).map(m => ({
            name: m.name,
            size: m.size,
            family: m.details?.family || 'unknown',
            paramSize: m.details?.parameter_size || '',
            quantization: m.details?.quantization_level || ''
        }));
    }

    async function fetchGoogleModels() {
        try {
            const key = config.apiKeys?.google || '';
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
            const response = await fetch(url);
            if (!response.ok) return REMOTE_MODELS.google;
            const data = await response.json();
            return (data.models || [])
                .filter(m => m.supportedGenerationMethods?.indexOf('generateContent') !== -1)
                .map(m => ({
                    name: m.name.replace('models/', ''),
                    desc: m.displayName || ''
                }));
        } catch (e) {
            return REMOTE_MODELS.google;
        }
    }

    // ──────────── Connection Tests ────────────
    async function checkOllamaConnection() {
        try {
            const models = await fetchOllamaModels();
            return { ok: true, models: models.length };
        } catch (e) {
            return { ok: false, models: 0, error: e.message };
        }
    }

    async function testRemoteConnection() {
        try {
            if (IntrixAgentRuntime.isCliProvider(config.provider)) {
                return IntrixAgentRuntime.check(config.provider);
            }
            const key = config.apiKeys?.[config.provider] || '';
            if (config.provider === 'google') {
                const resp = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
                );
                return { ok: resp.ok, error: resp.ok ? null : `HTTP ${resp.status}` };
            }
            if (config.provider === 'openai' || config.provider === 'openrouter') {
                const endpoint = config.provider === 'openrouter'
                    ? 'https://openrouter.ai/api/v1/models'
                    : 'https://api.openai.com/v1/models';
                const resp = await fetch(endpoint, {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                return { ok: resp.ok, error: resp.ok ? null : `HTTP ${resp.status}` };
            }
            if (config.provider === 'anthropic') {
                const valid = key && key.startsWith('sk-ant-');
                return { ok: valid, error: valid ? null : 'Invalid key format (expected sk-ant-...)' };
            }
            if (config.provider === 'custom') {
                if (!config.customEndpoint) return { ok: false, error: 'No endpoint configured' };
                const resp = await fetch(config.customEndpoint.replace(/\/chat\/completions.*$/, '/models'), {
                    headers: key ? { 'Authorization': `Bearer ${key}` } : {}
                });
                return { ok: resp.ok, error: resp.ok ? null : `HTTP ${resp.status}` };
            }
            return { ok: false, error: 'Unknown provider' };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // ──────────── Retry with Exponential Backoff ────────────
    /**
     * Retry a fetch call with exponential backoff for 5xx and 429 errors.
     * @param {Function} fetchFn - Function that returns a Promise<Response>
     * @param {number} maxRetries - Maximum number of retries (default 3)
     * @param {number} baseDelay - Base delay in ms (default 1000)
     */
    async function fetchWithRetry(fetchFn, maxRetries, baseDelay) {
        maxRetries = maxRetries || 3;
        baseDelay = baseDelay || 1000;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetchFn();
                // Retry on 429 (Too Many Requests) or 5xx server errors
                if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
                    const retryAfter = response.headers.get('Retry-After');
                    let delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : null;
                    if (!delay || isNaN(delay)) {
                        // Exponential backoff with jitter
                        delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
                    }
                    lastError = new Error(`HTTP ${response.status} — retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries + 1})`);
                    if (attempt < maxRetries) {
                        await new Promise(function(resolve) { setTimeout(resolve, delay); });
                        continue;
                    }
                }
                return response;
            } catch (e) {
                // Network errors also retried
                lastError = e;
                if (attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
                    await new Promise(function(resolve) { setTimeout(resolve, delay); });
                    continue;
                }
            }
        }
        throw lastError;
    }

    // ──────────── Chat API ────────────
    /**
     * @param {Array}       messages
     * @param {AbortSignal} [signal]  — pass controller.signal to abort mid-request
     */
    async function sendChat(messages, signal) {
        log('request', {
            provider: config.provider,
            model: config.model,
            messageCount: messages.length,
            lastUserMsg: messages.filter(m => m.role === 'user').slice(-1)[0]?.content
        });

        let response;
        if (IntrixAgentRuntime.isCliProvider(config.provider)) {
            response = await IntrixAgentRuntime.run(config.provider, messages, signal);
        } else if (config.provider === 'ollama') {
            response = await sendOllamaChat(messages, signal);
        } else if (config.provider === 'google') {
            response = await sendGoogleChat(messages, signal);
        } else if (config.provider === 'openai') {
            response = await sendOpenAIChat(messages, signal);
        } else if (config.provider === 'anthropic') {
            response = await sendAnthropicChat(messages, signal);
        } else if (config.provider === 'openrouter') {
            response = await sendOpenRouterChat(messages, signal);
        } else if (config.provider === 'custom') {
            response = await sendCustomChat(messages, signal);
        } else {
            throw new Error('Unknown provider: ' + config.provider);
        }

        log('response', {
            provider: config.provider,
            model: config.model,
            responseLength: response.length,
            responsePreview: response
        });

        return response;
    }



    /**
     * One or two plain-language sentences about ExtendScript; uses Ollama only (configured host).
     * Returns '' if Ollama is unreachable or no suitable model.
     */
    /**
     * Fetch with timeout wrapper (prevents hanging on slow/unreachable Ollama).
     * @param {string} url - URL to fetch
     * @param {number} timeoutMs - Timeout in milliseconds (default 30000)
     */
    async function fetchWithTimeout(url, timeoutMs) {
        timeoutMs = timeoutMs || 30000;
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);
        try {
            var response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (e) {
            clearTimeout(timeoutId);
            throw e;
        }
    }

    // Light version: script descriptions feature removed.

    async function sendOllamaChat(messages, signal) {
        const url = `${config.ollamaHost}/api/chat`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                stream: false,
                options: { temperature: config.temperature, num_ctx: 8192 }
            }),
            signal: signal || null
        });
        if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
        const data = await response.json();
        return data.message?.content || '';
    }

    async function sendGoogleChat(messages, signal) {
        const systemInstruction = messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');

        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

        const model = config.model || 'gemini-2.0-flash';
        const key = config.apiKeys?.google || '';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

        const response = await fetchWithRetry(function() {
            return fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    contents: contents,
                    generationConfig: { temperature: config.temperature }
                }),
                signal: signal || null
            });
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini error: ${response.status}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (!candidate) throw new Error('No response from Gemini');
        return candidate.content?.parts?.[0]?.text || '';
    }

    async function sendOpenAIChat(messages, signal) {
        const key = config.apiKeys?.openai || '';
        const response = await fetchWithRetry(function() {
            return fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: config.model || 'gpt-4o-mini',
                    messages: messages,
                    temperature: config.temperature
                }),
                signal: signal || null
            });
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenAI error: ${response.status}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    async function sendAnthropicChat(messages, signal) {
        const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
        const nonSystem = messages.filter(m => m.role !== 'system');
        const key = config.apiKeys?.anthropic || '';

        const response = await fetchWithRetry(function() {
            return fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: config.model || 'claude-sonnet-4-20250514',
                    max_tokens: 4096,
                    system: system,
                    messages: nonSystem,
                    temperature: config.temperature
                }),
                signal: signal || null
            });
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Anthropic error: ${response.status}`);
        }
        const data = await response.json();
        return data.content?.[0]?.text || '';
    }

    async function sendOpenRouterChat(messages, signal) {
        const key = config.apiKeys?.openrouter || '';
        const response = await fetchWithRetry(function() {
            return fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: config.model || 'google/gemini-2.0-flash',
                    messages: messages,
                    temperature: config.temperature
                }),
                signal: signal || null
            });
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenRouter error: ${response.status}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    async function sendCustomChat(messages, signal) {
        if (!config.customEndpoint) throw new Error('No custom endpoint configured');

        const key = config.apiKeys?.custom || '';
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['Authorization'] = `Bearer ${key}`;

        const response = await fetchWithRetry(function() {
            return fetch(config.customEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: config.model || 'default',
                    messages: messages,
                    temperature: config.temperature
                }),
                signal: signal || null
            });
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Custom API error: ${response.status}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    return {
        loadSettings, saveSettings, getConfig, setConfig, setApiKey,
        getDefaultModel, getRecommendedModels, getRemoteModels,
        fetchOllamaModels, fetchGoogleModels,
        checkOllamaConnection, testRemoteConnection,
        sendChat,
        isCliProvider: function () { return IntrixAgentRuntime.isCliProvider(config.provider); },
        log, getDebugLog, clearDebugLog, exportDebugLog
    };
})();
