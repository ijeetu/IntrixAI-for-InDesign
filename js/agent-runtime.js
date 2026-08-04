/**
 * IntrixAI CLI Agent Runtime
 *
 * Runs Claude Code, Antigravity, Codex, or Gemini as a non-interactive agent
 * with the InDesign MCP server attached. No shell interpolation is used.
 */

const IntrixAgentRuntime = (() => {
    'use strict';

    const CLI_PROVIDERS = [
        'claude-cli',
        'antigravity-cli',
        'codex-cli',
        'gemini-cli'
    ];
    const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
    // Large multi-page / multi-element design requests can legitimately run
    // for a long time — many sequential MCP tool calls, each with real
    // ExtendScript latency. This is an outer safety net against a genuinely
    // stuck agent, not a budget for how long a task "should" take, so it
    // defaults generously and stays overridable without a code change.
    const AGENT_TIMEOUT_MS = Number(
        (typeof process !== 'undefined' && process.env && process.env.INTRIXAI_AGENT_TIMEOUT_MS) || 60 * 60 * 1000
    );
    const AGENT_RULES = [
        'You are IntrixAI, an autonomous Adobe InDesign design-editing agent.',
        'Use the intrixai-indesign MCP tools to operate on the LIVE document.',
        'First inspect the active document and relevant pages/items. Then perform the requested changes. Finally inspect again to verify the result.',
        'Do not merely explain, do not return ExtendScript, and do not edit source-code or project files.',
        'Do not save, export, close, or overwrite a document unless the user explicitly requests it.',
        'Preserve unrelated content and make the smallest design change that satisfies the request.',
        'Fully complete every part of the request with the exact values given (fonts, sizes, colors, counts, positions, page numbers). Do not stop partway, approximate, or silently skip a requirement — if something genuinely cannot be done, say so explicitly in the final report instead of pretending it was done.',
        'If a requested font is not installed, call font_find first to search installed fonts and pick the closest reasonable match by family and style (e.g. a similar serif/sans-serif, weight, and classification) — never leave text on the default/wrong font or fail the task outright. Name the exact substitute font you used in your final report so the user knows it was not the one they asked for.',
        'If a bridge tool call fails because InDesign is unreachable, report that clearly instead of pretending the edit succeeded — do not tell the user to open a UXP plugin or a "Plugins > MCP Bridge" menu; the IntrixAI panel connects to the bridge automatically, so suggest they confirm InDesign is running with a document open and retry.',
        'Your final answer must be a short factual report of changes made and verification performed.'
    ].join(' ');

    function getNodeRequire() {
        if (typeof require !== 'undefined') return require;
        if (typeof window !== 'undefined' && typeof window.require !== 'undefined') return window.require;
        if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) {
            return window.cep_node.require;
        }
        return null;
    }

    function isCliProvider(provider) {
        return CLI_PROVIDERS.indexOf(provider) !== -1;
    }

    function getExtensionRoot(pathModule) {
        try {
            if (typeof window !== 'undefined' && window.location && window.location.pathname) {
                let pagePath = decodeURIComponent(window.location.pathname);
                if (/^\/[A-Za-z]:\//.test(pagePath)) pagePath = pagePath.substring(1);
                return pathModule.dirname(pagePath);
            }
        } catch (e) { /* fall through */ }
        return process.cwd();
    }

    function resolveBinary(fs, provider) {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const candidates = {
            'claude-cli': [home + '/.local/bin/claude', '/opt/homebrew/bin/claude', '/usr/local/bin/claude', 'claude'],
            'antigravity-cli': [home + '/.local/bin/agy', '/opt/homebrew/bin/agy', '/usr/local/bin/agy', 'agy'],
            'codex-cli': ['/opt/homebrew/bin/codex', home + '/.local/bin/codex', '/usr/local/bin/codex', 'codex'],
            'gemini-cli': ['/opt/homebrew/bin/gemini', home + '/.local/bin/gemini', '/usr/local/bin/gemini', 'gemini']
        };
        const list = candidates[provider] || [];
        for (let i = 0; i < list.length; i += 1) {
            if (list[i].indexOf('/') === -1 || fs.existsSync(list[i])) return list[i];
        }
        throw new Error('CLI executable not found for ' + provider + '.');
    }

    function resolveNodeBinary(fs) {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const candidates = [
            home + '/.local/bin/node',
            '/opt/homebrew/bin/node',
            '/usr/local/bin/node',
            'node'
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            if (candidates[i].indexOf('/') === -1 || fs.existsSync(candidates[i])) return candidates[i];
        }
        throw new Error('Node.js 18+ is required to launch the InDesign MCP server.');
    }

    function buildConversationPrompt(messages) {
        const recent = messages.slice(-12).map(function (message) {
            const role = message.role === 'assistant' ? 'AGENT' : 'USER';
            return role + ': ' + String(message.content || '');
        }).join('\n\n');
        return AGENT_RULES + '\n\nCONVERSATION:\n' + recent + '\n\nAct on the latest USER request now.';
    }

    function tomlString(value) {
        return JSON.stringify(String(value));
    }

    function createInvocation(provider, prompt, runtime) {
        const path = runtime.path;
        const fs = runtime.fs;
        const root = runtime.root;
        const nodeBinary = runtime.nodeBinary;
        const launcher = path.join(root, 'scripts', 'launch-indesign-mcp.mjs');
        const tempRoot = path.join(runtime.os.tmpdir(), 'intrixai-agent-runtime');
        fs.mkdirSync(tempRoot, { recursive: true });

        if (!fs.existsSync(launcher)) {
            throw new Error('IntrixAI MCP launcher is missing: ' + launcher);
        }

        if (provider === 'claude-cli') {
            const configPath = path.join(tempRoot, 'claude-mcp-' + Date.now() + '.json');
            fs.writeFileSync(configPath, JSON.stringify({
                mcpServers: {
                    'intrixai-indesign': {
                        command: nodeBinary,
                        args: [launcher]
                    }
                }
            }), 'utf8');
            return {
                args: [
                    '-p',
                    '--output-format', 'json',
                    '--mcp-config', configPath,
                    '--strict-mcp-config',
                    '--permission-mode', 'bypassPermissions',
                    '--tools', '',
                    '--append-system-prompt', AGENT_RULES
                ],
                stdin: prompt,
                cleanup: [configPath]
            };
        }

        if (provider === 'codex-cli') {
            const outputPath = path.join(tempRoot, 'codex-result-' + Date.now() + '.txt');
            const mcpArgs = '[' + [launcher].map(tomlString).join(',') + ']';
            return {
                args: [
                    'exec',
                    '--ignore-user-config',
                    '--skip-git-repo-check',
                    '--ephemeral',
                    '--sandbox', 'read-only',
                    '-c', 'approval_policy="never"',
                    '-c', 'mcp_servers.intrixai_indesign.command=' + tomlString(nodeBinary),
                    '-c', 'mcp_servers.intrixai_indesign.args=' + mcpArgs,
                    '--output-last-message', outputPath,
                    '-'
                ],
                stdin: prompt,
                resultFile: outputPath,
                cleanup: [outputPath]
            };
        }

        if (provider === 'gemini-cli') {
            return {
                args: [
                    '--prompt', prompt,
                    '--output-format', 'json',
                    '--skip-trust',
                    '--approval-mode', 'yolo',
                    '--allowed-mcp-server-names', 'intrixai-indesign'
                ],
                stdin: '',
                cleanup: []
            };
        }

        return {
            args: [
                '--print', prompt,
                '--output-format', 'json',
                '--mode', 'accept-edits',
                '--dangerously-skip-permissions',
                '--add-dir', root
            ],
            stdin: '',
            cleanup: []
        };
    }

    function extractText(provider, stdout, resultFile, fs) {
        if (resultFile && fs.existsSync(resultFile)) {
            const fileText = fs.readFileSync(resultFile, 'utf8').trim();
            if (fileText) return fileText;
        }

        const raw = String(stdout || '').trim();
        if (!raw) return '';
        try {
            const parsed = JSON.parse(raw);
            const fields = ['result', 'response', 'text', 'message', 'content', 'output'];
            for (let i = 0; i < fields.length; i += 1) {
                const value = parsed[fields[i]];
                if (typeof value === 'string' && value.trim()) return value.trim();
                if (value && typeof value.text === 'string') return value.text.trim();
            }
        } catch (e) { /* plain-text output */ }
        return raw;
    }

    function run(provider, messages, signal) {
        if (!isCliProvider(provider)) {
            return Promise.reject(new Error('Not a CLI agent provider: ' + provider));
        }
        const req = getNodeRequire();
        if (!req) {
            return Promise.reject(new Error('Node child_process is unavailable in the CEP panel.'));
        }

        const cp = req('child_process');
        const fs = req('fs');
        const path = req('path');
        const os = req('os');
        const root = getExtensionRoot(path);
        const prompt = buildConversationPrompt(messages);
        let binary;
        let nodeBinary;
        let invocation;

        try {
            binary = resolveBinary(fs, provider);
            nodeBinary = resolveNodeBinary(fs);
            invocation = createInvocation(provider, prompt, {
                fs: fs,
                path: path,
                os: os,
                root: root,
                nodeBinary: nodeBinary
            });
        } catch (error) {
            return Promise.reject(error);
        }

        return new Promise(function (resolve, reject) {
            let stdout = '';
            let stderr = '';
            let finished = false;
            const child = cp.spawn(binary, invocation.args, {
                cwd: root,
                env: Object.assign({}, process.env, {
                    PATH: [
                        (process.env.HOME || '') + '/.local/bin',
                        '/opt/homebrew/bin',
                        '/usr/local/bin',
                        '/usr/bin',
                        '/bin',
                        process.env.PATH || ''
                    ].join(':')
                }),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            function cleanup() {
                for (let i = 0; i < invocation.cleanup.length; i += 1) {
                    try { if (fs.existsSync(invocation.cleanup[i])) fs.unlinkSync(invocation.cleanup[i]); } catch (e) { /* ignore */ }
                }
            }

            function finish(error, value) {
                if (finished) return;
                finished = true;
                clearTimeout(timeoutId);
                if (signal) signal.removeEventListener('abort', abortChild);
                cleanup();
                if (error) reject(error); else resolve(value);
            }

            function abortChild() {
                if (!child.killed) child.kill('SIGTERM');
                const error = new Error('Agent run stopped.');
                error.name = 'AbortError';
                finish(error);
            }

            const timeoutId = setTimeout(function () {
                if (!child.killed) child.kill('SIGTERM');
                finish(new Error('CLI agent timed out after 5 minutes.'));
            }, AGENT_TIMEOUT_MS);

            if (signal) {
                if (signal.aborted) {
                    abortChild();
                    return;
                }
                signal.addEventListener('abort', abortChild, { once: true });
            }

            child.stdout.on('data', function (chunk) {
                stdout += chunk.toString();
                if (stdout.length > MAX_OUTPUT_BYTES) {
                    child.kill('SIGTERM');
                    finish(new Error('CLI agent output exceeded 10 MB.'));
                }
            });
            child.stderr.on('data', function (chunk) {
                stderr += chunk.toString();
                if (stderr.length > MAX_OUTPUT_BYTES) stderr = stderr.slice(-MAX_OUTPUT_BYTES);
            });
            child.on('error', function (error) { finish(error); });
            child.on('close', function (code) {
                if (finished) return;
                const text = extractText(provider, stdout, invocation.resultFile, fs);
                if (code !== 0) {
                    const detail = (stderr || text || ('exit code ' + code)).trim();
                    finish(new Error(provider + ' failed: ' + detail.slice(-4000)));
                    return;
                }
                if (!text) {
                    finish(new Error(provider + ' completed without a final report.'));
                    return;
                }
                finish(null, text);
            });

            if (invocation.stdin) child.stdin.end(invocation.stdin);
            else child.stdin.end();
        });
    }

    function check(provider) {
        const req = getNodeRequire();
        if (!req) return { ok: false, error: 'Node unavailable' };
        try {
            const fs = req('fs');
            const path = req('path');
            const cp = req('child_process');
            resolveBinary(fs, provider);
            const nodeBinary = resolveNodeBinary(fs);
            const root = getExtensionRoot(path);
            const launcher = path.join(root, 'scripts', 'launch-indesign-mcp.mjs');
            if (!fs.existsSync(launcher)) throw new Error('InDesign MCP launcher is missing.');
            const checkResult = cp.spawnSync(nodeBinary, [launcher, '--check'], {
                cwd: root,
                env: process.env,
                encoding: 'utf8',
                timeout: 5000
            });
            if (checkResult.status !== 0) {
                throw new Error(String(checkResult.stderr || 'InDesign MCP server is unavailable.').trim());
            }
            return { ok: true, agent: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    return { isCliProvider: isCliProvider, run: run, check: check };
})();
