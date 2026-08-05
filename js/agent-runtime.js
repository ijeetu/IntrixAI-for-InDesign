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
        'If PDF comments or multiple instructions are attached, process EVERY SINGLE comment/instruction (Comment #1, Comment #2, ..., Comment #N) systematically. Execute MCP tool calls for each comment sequentially until ALL comments in the attached list are 100% applied and verified. Never stop after processing only a few comments.',
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

    /**
     * Kills the CLI process AND the InDesign MCP server it spawned as a
     * grandchild. A plain child.kill() only signals the CLI itself — the
     * launch-indesign-mcp.mjs -> dist/index.js chain underneath it is left
     * running as an orphan holding the bridge port. That orphan then races
     * the *next* turn's freeStalePort() cleanup: if it still has genuinely
     * in-flight bridge calls when it gets reaped, those calls are rejected
     * with "Execution cancelled", which is what a CLI agent reports back as
     * "MCP bridge calls were cancelled before returning any document data."
     * Spawning the CLI as its own process group (POSIX) / process tree
     * (Windows) lets us tear down the whole tree in one shot instead.
     */
    function killTree(cp, child, signal) {
        if (!child || child.killed) return;
        if (process.platform === 'win32') {
            try {
                cp.spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
            } catch (e) { try { child.kill(signal); } catch (e2) { /* already gone */ } }
            return;
        }
        try {
            process.kill(-child.pid, signal);
        } catch (e) {
            try { child.kill(signal); } catch (e2) { /* already gone */ }
        }
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

    /**
     * Ensures the persistent InDesign MCP daemon (scripts/mcp-daemon.mjs) is
     * up and healthy, starting it only if it isn't. Idempotent and cheap on
     * the common path (already running, just a fast health check) — safe to
     * call at the start of every turn even though the panel-load bootstrap
     * (js/mcp-ws-bridge.js) already calls it once when the panel opens.
     * Uses async spawn, not spawnSync: this runs in the CEP panel's own
     * Node/Chromium process, and a blocking synchronous spawn would freeze
     * the UI for the seconds a cold start can take.
     */
    function ensureMcpDaemon(cp, path, root, nodeBinary) {
        return new Promise(function (resolve, reject) {
            const script = path.join(root, 'scripts', 'mcp-daemon.mjs');
            const child = cp.spawn(nodeBinary, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', function (chunk) { stdout += chunk.toString(); });
            child.stderr.on('data', function (chunk) { stderr += chunk.toString(); });
            child.on('error', reject);
            child.on('close', function (code) {
                if (code !== 0) {
                    reject(new Error('IntrixAI MCP daemon failed to start: ' + (stderr || 'exit code ' + code).trim()));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout.trim()));
                } catch (e) {
                    reject(new Error('IntrixAI MCP daemon returned an unreadable response: ' + stdout.trim()));
                }
            });
        });
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
        const mcpInfo = runtime.mcpInfo;
        const mcpUrl = 'http://' + mcpInfo.host + ':' + mcpInfo.port + '/mcp';
        const tempRoot = path.join(runtime.os.tmpdir(), 'intrixai-agent-runtime');
        fs.mkdirSync(tempRoot, { recursive: true });

        if (provider === 'claude-cli') {
            // Points at the persistent daemon's HTTP endpoint (js/mcp-ws-bridge.js
            // keeps it running for the panel's lifetime) instead of spawning a
            // fresh stdio MCP server per turn — every turn, from every provider,
            // now shares the one live bridge connection to InDesign.
            const configPath = path.join(tempRoot, 'claude-mcp-' + Date.now() + '.json');
            fs.writeFileSync(configPath, JSON.stringify({
                mcpServers: {
                    'intrixai-indesign': {
                        type: 'http',
                        url: mcpUrl,
                        headers: { Authorization: 'Bearer ' + mcpInfo.token }
                    }
                }
            }), { encoding: 'utf8', mode: 0o600 });
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
            return {
                // Codex silently auto-declines every MCP tool call ("user cancelled
                // MCP tool call") under --sandbox read-only or workspace-write when
                // run headlessly via `exec` — there's no TTY for it to actually ask
                // approval, so the InDesign bridge calls never complete, regardless
                // of stdio vs HTTP transport (verified both). Only
                // danger-full-access lets non-interactive MCP calls go through.
                // --disable shell_tool removes Codex's own shell access so the
                // agent is left with only the intrixai-indesign MCP tool, matching
                // the '--tools ""' lockdown used for claude-cli above. The bearer
                // token is passed via env (INTRIXAI_MCP_TOKEN, set by run() below),
                // never as a literal in argv where `ps` could see it.
                args: [
                    'exec',
                    '--ignore-user-config',
                    '--skip-git-repo-check',
                    '--ephemeral',
                    '--sandbox', 'danger-full-access',
                    '--disable', 'shell_tool',
                    '-c', 'approval_policy="never"',
                    '-c', 'mcp_servers.intrixai_indesign.url=' + tomlString(mcpUrl),
                    '-c', 'mcp_servers.intrixai_indesign.bearer_token_env_var="INTRIXAI_MCP_TOKEN"',
                    '--output-last-message', outputPath,
                    '-'
                ],
                stdin: prompt,
                resultFile: outputPath,
                cleanup: [outputPath]
            };
        }

        if (provider === 'gemini-cli') {
            // Unchanged: still resolves intrixai-indesign from the project's
            // committed .gemini/settings.json (stdio, via launch-indesign-mcp.mjs)
            // rather than the persistent HTTP daemon — gemini-cli has no inline
            // --mcp-config equivalent to layer a per-run bearer token onto a
            // git-tracked file, and as of this writing gemini-cli itself is
            // rejecting requests for this account tier independent of MCP wiring.
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

    async function run(provider, messages, signal) {
        if (!isCliProvider(provider)) {
            throw new Error('Not a CLI agent provider: ' + provider);
        }
        const req = getNodeRequire();
        if (!req) {
            throw new Error('Node child_process is unavailable in the CEP panel.');
        }
        if (signal && signal.aborted) {
            const error = new Error('Agent run stopped.');
            error.name = 'AbortError';
            throw error;
        }

        const cp = req('child_process');
        const fs = req('fs');
        const path = req('path');
        const os = req('os');
        const root = getExtensionRoot(path);
        const prompt = buildConversationPrompt(messages);
        let binary;
        let nodeBinary;
        let mcpInfo;
        let invocation;

        try {
            binary = resolveBinary(fs, provider);
            nodeBinary = resolveNodeBinary(fs);
            // Idempotent: near-instant if js/mcp-ws-bridge.js's panel-load
            // bootstrap already has the daemon up, otherwise starts it now.
            mcpInfo = await ensureMcpDaemon(cp, path, root, nodeBinary);
            invocation = createInvocation(provider, prompt, {
                fs: fs,
                path: path,
                os: os,
                root: root,
                mcpInfo: mcpInfo
            });
        } catch (error) {
            throw error;
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
                    ].join(':'),
                    INTRIXAI_MCP_TOKEN: mcpInfo.token
                }),
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: process.platform !== 'win32'
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
                killTree(cp, child, 'SIGTERM');
                const error = new Error('Agent run stopped.');
                error.name = 'AbortError';
                finish(error);
            }

            const timeoutId = setTimeout(function () {
                killTree(cp, child, 'SIGTERM');
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
                    killTree(cp, child, 'SIGTERM');
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

    /**
     * Public entry point for starting the persistent MCP daemon proactively,
     * independent of any CLI agent turn — called once when the panel loads
     * (see js/mcp-ws-bridge.js) so the InDesign bridge is already live by
     * the time the user sends their first message, instead of only coming
     * up on-demand mid-turn.
     */
    function startPersistentServer() {
        const req = getNodeRequire();
        if (!req) {
            return Promise.reject(new Error('Node child_process is unavailable in the CEP panel.'));
        }
        const cp = req('child_process');
        const fs = req('fs');
        const path = req('path');
        const root = getExtensionRoot(path);
        let nodeBinary;
        try {
            nodeBinary = resolveNodeBinary(fs);
        } catch (error) {
            return Promise.reject(error);
        }
        return ensureMcpDaemon(cp, path, root, nodeBinary);
    }

    return {
        isCliProvider: isCliProvider,
        run: run,
        check: check,
        startPersistentServer: startPersistentServer
    };
})();
