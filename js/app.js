/**
 * Aide — app.js
 * Main application: theme detection, tab routing, event wiring,
 * and InDesign bridge (CSInterface).
 */

document.addEventListener('DOMContentLoaded', () => {
    // ──────────────── DOM Refs ────────────────
    const $id = id => document.getElementById(id);

    const CHAT_DRAFT_KEY = 'aide_chat_input_draft';

    const dom = {
        tabBar:             $id('tab-bar'),
        chatMessages:       $id('chat-messages'),
        chatWelcome:        $id('chat-welcome'),
        promptInput:        $id('prompt-input'),
        sendBtn:            $id('send-btn'),
        newChatBtn:         $id('new-chat-btn'),
        attachBtn:          $id('attach-btn'),
        fileInput:          $id('file-input'),
        attachedFile:       $id('attached-file'),
        attachedFileName:   $id('attached-file-name'),
        removeAttachment:   $id('remove-attachment'),
        scriptsSearch:      $id('scripts-search'),
        scriptsSearchClear: $id('scripts-search-clear'),
        scriptsList:        $id('scripts-list'),
        scriptsEmpty:       $id('scripts-empty'),
        providerSelect:     $id('provider-select'),
        ollamaHostRow:      $id('ollama-host-row'),
        ollamaHost:         $id('ollama-host'),
        customEndpointRow:  $id('custom-endpoint-row'),
        customEndpoint:     $id('custom-endpoint'),
        apiKeyRow:          $id('api-key-row'),
        apiKey:             $id('api-key'),
        providerHint:       $id('provider-hint'),
        toggleKeyVis:       $id('toggle-key-vis'),
        modelSelect:        $id('model-select'),
        modelCustom:        $id('model-custom'),
        modelCustomRow:     $id('model-custom-row'),
        clearCustomModel:   $id('clear-custom-model'),
        clearCustomModelsListBtn: $id('clear-custom-models-list-btn'),
        refreshModels:      $id('refresh-models-btn'),
        tempSlider:         $id('temperature-slider'),
        tempValue:          $id('temperature-value'),
        promptTierSelect:   $id('prompt-tier-select'),
        debugToggle:        $id('debug-toggle'),
        debugActions:       $id('debug-actions'),
        exportDebugBtn:     $id('export-debug-btn'),
        clearDebugBtn:      $id('clear-debug-btn'),
        testConnBtn:        $id('test-connection-btn'),
        testResult:         $id('test-result'),
        localFoldersList:   $id('local-scripts-folders-list'),
        // Light version: script descriptions feature removed.
        scriptsSubtabLocal: $id('scripts-subtab-local'),
        scriptsSubtabSets:  $id('scripts-subtab-sets'),
        scriptsSubtabFavs:  $id('scripts-subtab-favs'),
        scriptsStarFilterBtn: $id('scripts-star-filter-btn'),
        scriptsShowHiddenBtn: $id('scripts-show-hidden-btn'),
        scriptsExpandAllBtn:  $id('scripts-expand-all'),
        scriptsCollapseAllBtn: $id('scripts-collapse-all'),
        scriptsRefreshBtn:  $id('scripts-refresh-btn'),
        scriptsToolbarActions: $id('scripts-toolbar-actions'),
        scriptsSearchBar:     $id('scripts-search-bar'),
        autoRunCheckbox:    $id('auto-run-checkbox'),
        // Step 5: Tree overflow menu
        treeOverflowMenu:    $id('tree-overflow-menu'),
        // Step 6: Sets overlay and overflow
        setOverflowMenu:     $id('set-overflow-menu'),
        setOverlay:          $id('set-overlay'),
        setOverlayTitle:     $id('set-overlay-title'),
        setOverlayName:      $id('set-overlay-name'),
        setOverlayColor:     $id('set-overlay-color'),
        setOverlaySave:      $id('set-overlay-save'),
        setOverlayCancel:    $id('set-overlay-cancel'),
        // Add to Set Overlay
        addToSetOverlay:     $id('add-to-set-overlay'),
        addToSetCloseBtn:    $id('add-to-set-close-btn'),
        addToSetScriptName:  $id('add-to-set-script-name'),
        addToSetList:        $id('add-to-set-list'),
        // Overlay
        aideOverlay:         $id('aide-overlay'),
        overlayCloseBtn:     $id('overlay-close-btn'),
        overlayNativeBtn:    $id('overlay-native-btn'),
        overlayFolders:      $id('overlay-folders'),
        overlayScriptName:   $id('overlay-script-name'),
        // Step 8: Import / Export
        exportSettingsBtn:   $id('export-settings-btn'),
        importSettingsBtn:   $id('import-settings-btn'),
        importSettingsFile:  $id('import-settings-file'),
        importExportStatus:  $id('import-export-status'),
    };

    // Current file attachment
    let currentAttachment = null;

    // Step 4: Cached auto-detected Scripts Panel path (empty = not found / not yet detected)
    let autoDetectedScriptsPanelPath = '';

    // Step 5: Cached tree data from scanScriptFolderJson
    let localTreeData = [];
    // Step 6: Cached sets data
    let localSetsData = [];
    // Step 5: Show hidden scripts toggle
    let showHiddenScripts = AideScripts.getShowHidden();

    let scriptsSubTab = AideScripts.getScriptsSubtab();
    let scriptsStarFilter = AideScripts.getScriptsStarFilter();
    // Light version: compact-only scripts view (no toggle)
    let scriptsViewMode = 'compact';

    const AUTO_RUN_KEY = 'intrixai_auto_run_enabled';
    let autoRunEnabled = true;
    try {
        const savedAutoRun = localStorage.getItem(AUTO_RUN_KEY);
        if (savedAutoRun !== null) {
            autoRunEnabled = savedAutoRun === 'true';
        }
    } catch (e) { /* ignore */ }

    // Light version: script descriptions feature removed.
    
    // Persistent custom models list per provider (2.3.1.1 fix)
    // Structure: { ollama: [...], google: [...], openai: [...], anthropic: [...], openrouter: [...], custom: [...] }
    let savedCustomModels = {};
    try {
        const stored = localStorage.getItem('aide_custom_models');
        if (stored) {
            const parsed = JSON.parse(stored);
            // Migration: if old format was a plain array, convert to per-provider object
            if (Array.isArray(parsed)) {
                savedCustomModels = { __legacy: parsed };
            } else {
                savedCustomModels = parsed;
            }
        }
    } catch (e) {}

    function getCustomModelsForProvider(provider) {
        return savedCustomModels[provider] || [];
    }

    function addCustomModelForProvider(provider, model) {
        if (!savedCustomModels[provider]) savedCustomModels[provider] = [];
        if (savedCustomModels[provider].indexOf(model) === -1) {
            savedCustomModels[provider].push(model);
            try { localStorage.setItem('aide_custom_models', JSON.stringify(savedCustomModels)); }
            catch (e) { /* quota – ignore */ }
        }
    }

    function removeCustomModelForProvider(provider, model) {
        if (savedCustomModels[provider]) {
            savedCustomModels[provider] = savedCustomModels[provider].filter(function(m) { return m !== model; });
            try { localStorage.setItem('aide_custom_models', JSON.stringify(savedCustomModels)); }
            catch (e) { /* quota – ignore */ }
        }
    }

    function clearAllCustomModels() {
        savedCustomModels = {};
        localStorage.removeItem('aide_custom_models');
    }

    // Light version: script descriptions toggle removed.

    if (dom.autoRunCheckbox) {
        dom.autoRunCheckbox.checked = autoRunEnabled;
        dom.autoRunCheckbox.addEventListener('change', () => {
            autoRunEnabled = dom.autoRunCheckbox.checked;
            try {
                localStorage.setItem(AUTO_RUN_KEY, autoRunEnabled);
            } catch (e) { /* ignore */ }
        });
    }

    function persistChatDraft(text) {
        try {
            localStorage.setItem(CHAT_DRAFT_KEY, text == null ? '' : String(text));
        } catch (e) { /* ignore */ }
    }

    function restoreChatDraft() {
        try {
            const t = localStorage.getItem(CHAT_DRAFT_KEY);
            if (t != null) {
                dom.promptInput.value = t;
                dom.promptInput.style.height = 'auto';
                dom.promptInput.style.height = Math.min(dom.promptInput.scrollHeight, 100) + 'px';
            }
        } catch (e) { /* ignore */ }
    }
    let localScriptEntries = [];
    const localScriptContentCache = {};

    function clearLocalScriptContentCache() {
        Object.keys(localScriptContentCache).forEach(k => delete localScriptContentCache[k]);
    }

    /** True when user has not set up any local folders */
    function hasNoLocalFolders() {
        const folders = AideScripts.getScriptFolders();
        return !folders || folders.length === 0;
    }

    // ──────────────── CSInterface + Theme ────────────────
    let csInterface = null;
    try {
        csInterface = new CSInterface();
        applyInDesignTheme();
        csInterface.addEventListener('com.adobe.csxs.events.ThemeColorChanged', applyInDesignTheme);

        // Tell InDesign to pass Cmd+Z and Cmd+Shift+Z (Undo/Redo) to the panel
        // KeyCode 90 = 'Z'. This allows native browser shortcuts to fire inside the panel.
        const shortcuts = [
            { "keyCode": 90, "metaKey": true },               // Cmd+Z
            { "keyCode": 90, "metaKey": true, "shiftKey": true }   // Cmd+Shift+Z
        ];
        // For Windows support, also register Ctrl equivalents
        if (navigator.platform.indexOf('Win') > -1) {
            shortcuts.push({ "keyCode": 90, "ctrlKey": true });
            shortcuts.push({ "keyCode": 90, "ctrlKey": true, "shiftKey": true });
        }
        csInterface.registerKeyEventsInterest(JSON.stringify(shortcuts));
    } catch (e) {
        console.warn('CSInterface unavailable — running outside InDesign');
    }

    // ──────────────── evalScriptSafe ────────────────
    /**
     * Unified CEP → ExtendScript bridge wrapper.
     * Normalises every known failure mode into a consistent result object:
     *   { success: true,  result: string }   — script ran without error
     *   { success: false, error:  string }   — any kind of failure
     *
     * Failure modes caught:
     *   • null / undefined / 'undefined'     — runtime crash with no return value
     *   • 'EvalScript error.'                — CSInterface-level eval failure (CEP constant)
     *   • starts with 'ExtendScript Error'   — error string returned by host.jsx catch block
     *   • empty string                       — silent host-level failure
     *
     * @param {string}   script  — the ExtendScript expression to evaluate
     * @param {function} cb      — callback receiving {success, result?, error?}
     */
    function evalScriptSafe(script, cb) {
        // 3.6: Guard against null csInterface before calling evalScript
        if (!csInterface) {
            cb({ success: false, error: 'No InDesign connection (CSInterface unavailable).' });
            return;
        }
        csInterface.evalScript(script, function(raw) {
            // Normalise missing/undefined
            var result = (raw == null || raw === 'undefined') ? '' : String(raw);

            // CEP-level eval failure (matches CSInterface.js constant)
            if (result === 'EvalScript error.' || result === EvalScript_ErrMessage) {
                cb({ success: false, error: 'EvalScript failed at CEP level — check host.jsx syntax.' });
                return;
            }

            // Error string prefix set by host.jsx catch block
            if (result.indexOf('ExtendScript Error') === 0) {
                cb({ success: false, error: result });
                return;
            }

            // Note: empty string IS a valid return (e.g. pickScriptsFolder cancelled = '')
            // Callers must check result content themselves if relevant.
            cb({ success: true, result: result });
        });
    }

    function applyInDesignTheme() {
        if (!csInterface) return;
        try {
            const skinInfo = csInterface.getHostEnvironment().appSkinInfo;
            const bg = skinInfo.panelBackgroundColor.color;
            const brightness = (bg.red + bg.green + bg.blue) / 3;

            const bgHex = rgbToHex(bg.red, bg.green, bg.blue);
            document.documentElement.style.setProperty('--bg-primary', bgHex);

            if (brightness < 80) {
                document.body.classList.remove('theme-light');
                document.documentElement.style.setProperty('--bg-secondary', lighten(bg, 12));
                document.documentElement.style.setProperty('--bg-tertiary', darken(bg, 10));
            } else if (brightness < 130) {
                document.body.classList.remove('theme-light');
                document.documentElement.style.setProperty('--bg-secondary', lighten(bg, 8));
                document.documentElement.style.setProperty('--bg-tertiary', darken(bg, 12));
            } else {
                document.body.classList.add('theme-light');
                document.documentElement.style.setProperty('--bg-secondary', darken(bg, 6));
                document.documentElement.style.setProperty('--bg-tertiary', darken(bg, 12));
            }
        } catch (e) {
            console.warn('Could not read theme:', e);
        }
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(v => {
            const hex = Math.round(Math.max(0, Math.min(255, v))).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }
    function lighten(color, amount) {
        return rgbToHex(color.red + amount, color.green + amount, color.blue + amount);
    }
    function darken(color, amount) {
        return rgbToHex(color.red - amount, color.green - amount, color.blue - amount);
    }

    async function checkConnection() {
        const dot = $id('chat-connection-dot');
        const textArea = $id('chat-model-indicator');
        const mcpWrap = $id('mcp-indicator-wrap');
        const mcpDot = $id('mcp-connection-dot');
        const mcpText = $id('mcp-status-text');
        if (!dot || !textArea) return;

        const cfg = AideModels.getConfig();
        const isCli = AideModels.isCliProvider();
        textArea.textContent = cfg.model || 'No model';
        dot.className = 'connection-dot';
        dot.title = 'Checking connection...';

        if (mcpWrap) mcpWrap.classList.toggle('hidden', !isCli);

        let result;
        if (cfg.provider === 'ollama') {
            result = await AideModels.checkOllamaConnection();
        } else {
            result = await AideModels.testRemoteConnection();
        }

        if (result.ok) {
            dot.className = 'connection-dot ok';
            dot.title = 'Connected';
        } else {
            dot.className = 'connection-dot err';
            dot.title = result.error || 'Connection Failed';
            textArea.textContent = 'Error';
            if (cfg.provider !== 'ollama') {
               textArea.textContent = 'Auth Error';
            }
        }

        // `result.ok` here only confirms the CLI binary and installed InDesign MCP
        // server files are present on disk — it says nothing about whether a bridge
        // is actually connected right now. Live connection state (idle/connecting/
        // connected) is owned by js/mcp-ws-bridge.js, which keeps the indicator
        // updated in real time. We only need to override it here for the one state
        // the bridge module can't detect on its own: the server isn't installed.
        if (isCli && mcpDot && mcpText) {
            if (!result.ok) {
                mcpDot.className = 'connection-dot err';
                mcpText.textContent = 'MCP: Not installed';
                if (mcpWrap) mcpWrap.title = result.error || 'InDesign MCP server not found. Run install_extension.command to install it.';
            }
        }
    }

    // ──────────────── Tab Routing ────────────────
    dom.tabBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        const tab = btn.dataset.tab;

        persistChatDraft(dom.promptInput.value);

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(v => v.classList.remove('active'));

        btn.classList.add('active');
        const view = $id('view-' + tab);
        if (view) view.classList.add('active');

        if (tab === 'chat') {
            restoreChatDraft();
        }

        if (tab === 'scripts') {
            runScriptsToolbarRefresh();
        }
    });

    // ──────────────── File Attachment ────────────────
    if (dom.attachBtn) {
        dom.attachBtn.addEventListener('click', () => dom.fileInput.click());
    }

    if (dom.fileInput) {
        dom.fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                currentAttachment = await AideUtils.readTextFile(file);
                dom.attachedFileName.textContent = currentAttachment.name;
                dom.attachedFile.classList.remove('hidden');
                AideModels.log('attachment', { name: file.name, type: currentAttachment.type, size: file.size });
            } catch (err) {
                currentAttachment = null;
                console.error('Failed to read file:', err);
            }
            dom.fileInput.value = '';
        });
    }

    if (dom.removeAttachment) {
        dom.removeAttachment.addEventListener('click', () => {
            currentAttachment = null;
            dom.attachedFile.classList.add('hidden');
            dom.attachedFileName.textContent = '';
        });
    }

    // ──────────────── Chat ────────────────

    // Track original code for undo feature
    const originalCodeMap = {};

    function renderChatMessages() {
        const msgs = AideChat.getMessages();
        dom.chatMessages.innerHTML = '';

        if (msgs.length === 0) {
            dom.chatMessages.appendChild(dom.chatWelcome);
            dom.chatWelcome.style.display = '';
            return;
        }

        dom.chatWelcome.style.display = 'none';

        msgs.forEach((msg, idx) => {
            const el = document.createElement('div');
            el.className = `chat-msg ${msg.role}`;

            if (msg.role === 'user') {
                el.innerHTML = `
                    <span class="msg-role">You</span>
                    <div class="msg-body">${AideUtils.escapeHtml(msg.content)}</div>
                `;
            } else if (msg.role === 'assistant') {
                const hasCode = msg.content.trim().length > 0;
                const codeId = 'code-' + idx;
                const lineNumsHtml = AideUtils.generateLineNumbersHtml(msg.content);

                if (msg.mode === 'agent') {
                    el.classList.add('agent-report');
                    el.innerHTML = `
                        <span class="msg-role">IntrixAI Agent</span>
                        <div class="msg-agent-report">
                            <span class="agent-report-badge">MCP</span>
                            <div class="msg-body">${AideUtils.escapeHtml(msg.content)}</div>
                        </div>
                    `;
                    dom.chatMessages.appendChild(el);
                    return;
                }

                // Store original code for undo
                originalCodeMap[codeId] = msg.content;

                el.innerHTML = `
                    <span class="msg-role">IntrixAI</span>
                    ${hasCode ? `
                    <div class="msg-code-block">
                        <div class="msg-code-header">
                            <span class="msg-code-label">ExtendScript</span>
                            <div class="msg-code-actions">
                                <button class="undo-edit-btn" data-action="undo-edit" data-code-id="${codeId}" title="Undo edits">↩ Undo</button>
                                <button class="code-action-btn" data-action="copy" data-code-id="${codeId}">Copy</button>
                                <button class="code-action-btn save-btn" data-action="save" data-code-id="${codeId}">Save</button>
                                <button class="code-action-btn execute-btn" data-action="execute" data-code-id="${codeId}">▶ Run</button>
                            </div>
                        </div>
                        <div class="msg-code-editor">
                            <div class="line-numbers-col" aria-hidden="true">${lineNumsHtml}</div>
                            <pre class="msg-code-pre" id="${codeId}" contenteditable="true" spellcheck="false" autocomplete="off">${AideUtils.escapeHtml(msg.content)}</pre>
                        </div>
                    </div>
                    ` : `<div class="msg-body">${AideUtils.escapeHtml(msg.content)}</div>`}
                `;
            }
            dom.chatMessages.appendChild(el);
        });

        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }

    // Detect user edits in code blocks → activate undo button + re-render line numbers
    let _lineNumTimer = null;
    dom.chatMessages.addEventListener('input', (e) => {
        const pre = e.target.closest('.msg-code-pre[contenteditable]');
        if (!pre) return;

        // Activate undo button
        const codeId = pre.id;
        const undoBtn = dom.chatMessages.querySelector(`.undo-edit-btn[data-code-id="${codeId}"]`);
        if (undoBtn) undoBtn.classList.add('active');

        // Debounce line-number rebuild (avoids per-keystroke re-render)
        clearTimeout(_lineNumTimer);
        _lineNumTimer = setTimeout(() => {
            rebuildLineNumbers(pre);
        }, 300);
    });

    /**
     * Re-renders the line-number sidebar to match the code box newline count.
     * Prevents contenteditable DOM corruption by targeting the sibling element.
     */
    function rebuildLineNumbers(pre) {
        const text = getCodeFromElement(pre);
        const lines = text.split('\n').length;
        
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += `<span class="line-num" data-line="${i}"></span>\n`;
        }
        
        const col = pre.previousElementSibling;
        if (col && col.classList.contains('line-numbers-col')) {
            col.innerHTML = html;
        }
    }

    function showTypingIndicator() {
        const isAgent = AideModels.isCliProvider();
        const el = document.createElement('div');
        el.className = 'chat-msg assistant';
        el.id = 'typing-indicator';
        el.innerHTML = `
            <span class="msg-role">IntrixAI</span>
            <div class="cli-process-indicator" role="status" aria-live="polite">
                <span class="cli-spinner" aria-hidden="true"></span>
                <span class="cli-process-text">${isAgent ? 'Working in InDesign…' : 'Preparing script…'}</span>
            </div>
        `;
        dom.chatMessages.appendChild(el);
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        const el = $id('typing-indicator');
        if (el) el.remove();
    }

    // ──────────────── Send / Stop button helpers ────────────────
    const SEND_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    const STOP_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2" fill="currentColor" stroke="none"/></svg>';
    const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5"/></svg>';

    function setSendState() {
        dom.sendBtn.innerHTML = SEND_SVG;
        dom.sendBtn.classList.remove('stop');
        dom.sendBtn.title = 'Send (⌘+Enter)';
        dom.sendBtn.disabled = false;
    }

    function setStopState() {
        dom.sendBtn.innerHTML = STOP_SVG;
        dom.sendBtn.classList.add('stop');
        dom.sendBtn.title = 'Stop generation';
        dom.sendBtn.disabled = false;
    }

    // Initialise the icon (replaces the static paper-plane SVG in HTML)
    setSendState();

    async function handleSend() {
        const userFacingPrompt = dom.promptInput.value.trim();
        if (!userFacingPrompt) return;

        // If already generating, act as a Stop button
        if (AideChat.getIsGenerating()) {
            AideChat.abort();
            return;
        }

        let text = userFacingPrompt;
        const attachmentSnapshot = currentAttachment;
        if (attachmentSnapshot) {
            text = `[Attached file: ${attachmentSnapshot.name}]\n\nFile contents:\n${attachmentSnapshot.content}\n\n---\n\nUser request: ${userFacingPrompt}`;
        }

        setStopState();
        dom.promptInput.disabled = true;
        dom.promptInput.classList.add('generating');

        renderChatMessages();
        const userDiv = document.createElement('div');
        userDiv.className = 'chat-msg user';
        userDiv.innerHTML = `
            <span class="msg-role">You</span>
            <div class="msg-body">${AideUtils.escapeHtml(text)}</div>
        `;
        dom.chatMessages.appendChild(userDiv);
        showTypingIndicator();

        await AideChat.send(text, (update) => {
            if (update.type === 'done' || update.type === 'error' || update.type === 'aborted') {
                removeTypingIndicator();
                setSendState();
                dom.promptInput.disabled = false;
                dom.promptInput.classList.remove('generating');

                if (update.type === 'done') {
                    renderChatMessages();
                    dom.promptInput.value = '';
                    dom.promptInput.style.height = 'auto';
                    persistChatDraft('');
                    if (attachmentSnapshot) {
                        currentAttachment = null;
                        dom.attachedFile.classList.add('hidden');
                        dom.attachedFileName.textContent = '';
                    }

                    // CLI agents have already changed and verified the live document
                    // through MCP. Auto-run is only for code-generation providers, and
                    // only runs code the user can see in the message above — no silent
                    // fallback executes unreviewed ExtendScript.
                    if (!update.agent && autoRunEnabled && update.text && update.text.trim()) {
                        const cleanedCode = AideUtils.stripCodeFences(update.text);
                        const isCode = cleanedCode && (
                            cleanedCode.indexOf('var ') !== -1 ||
                            cleanedCode.indexOf('app.') !== -1 ||
                            cleanedCode.indexOf('doc.') !== -1 ||
                            cleanedCode.indexOf('try') !== -1 ||
                            cleanedCode.indexOf('__find') !== -1
                        );
                        if (isCode) {
                            setTimeout(() => {
                                const runBtns = dom.chatMessages.querySelectorAll('.execute-btn');
                                if (runBtns.length > 0) {
                                    runBtns[runBtns.length - 1].click();
                                }
                            }, 50);
                        }
                    }
                } else if (update.type === 'aborted') {
                    // Generation was stopped — leave the prompt intact so the user can retry
                    renderChatMessages();
                } else {
                    renderChatMessages();
                    dom.promptInput.value = userFacingPrompt;
                    dom.promptInput.style.height = 'auto';
                    dom.promptInput.style.height = Math.min(dom.promptInput.scrollHeight, 100) + 'px';
                    persistChatDraft(userFacingPrompt);
                    const errDiv = document.createElement('div');
                    errDiv.className = 'msg-exec-result error';
                    errDiv.textContent = '\u26a0 ' + update.text;
                    dom.chatMessages.appendChild(errDiv);
                    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
                }

                dom.promptInput.disabled = false;
                dom.promptInput.classList.remove('generating');
                dom.promptInput.focus();
            }
        });
    }

    dom.sendBtn.addEventListener('click', handleSend);

    // —— Scoped undo/redo stack for chat textarea ——
    const undoStack = [''];
    let redoStack = [];
    let undoDebounce = null;

    dom.promptInput.addEventListener('input', () => {
        dom.promptInput.style.height = 'auto';
        dom.promptInput.style.height = Math.min(dom.promptInput.scrollHeight, 100) + 'px';
        persistChatDraft(dom.promptInput.value);

        // Snapshot state for custom undo (debounced to avoid per-character entries)
        clearTimeout(undoDebounce);
        undoDebounce = setTimeout(() => {
            const currentVal = dom.promptInput.value;
            if (undoStack[undoStack.length - 1] !== currentVal) {
                undoStack.push(currentVal);
                redoStack = [];
                if (undoStack.length > 50) undoStack.shift(); 
            }
        }, 300);
    });

    dom.promptInput.addEventListener('keydown', (e) => {
        // Cmd+Enter or Ctrl+Enter to send
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
            return;
        }

        // Custom Cmd+Z / Ctrl+Z (Undo)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                // Redo
                if (redoStack.length > 0) {
                    undoStack.push(dom.promptInput.value);
                    dom.promptInput.value = redoStack.pop();
                    dom.promptInput.dispatchEvent(new Event('input'));
                }
            } else {
                // Undo
                if (undoStack.length > 1) {
                    redoStack.push(undoStack.pop());
                    dom.promptInput.value = undoStack[undoStack.length - 1];
                    dom.promptInput.dispatchEvent(new Event('input'));
                }
            }
        }
    });

    document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            dom.promptInput.value = btn.dataset.prompt;
            dom.promptInput.dispatchEvent(new Event('input'));
            dom.promptInput.focus();
        });
    });

    dom.newChatBtn.addEventListener('click', () => {
        AideChat.newConversation();
        dom.promptInput.value = '';
        dom.promptInput.style.height = 'auto';
        persistChatDraft('');
        renderChatMessages();
    });

    // Code action buttons (delegated)
    dom.chatMessages.addEventListener('click', (e) => {
        const btn = e.target.closest('.code-action-btn, .undo-edit-btn');
        if (!btn) return;

        const codeId = btn.dataset.codeId;
        const codeEl = $id(codeId);
        if (!codeEl) return;

        const code = getCodeFromElement(codeEl);
        const action = btn.dataset.action;

        if (action === 'copy') {
            copyToClipboard(code);
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = 'Copy', 1500);
        }
        if (action === 'save') {
            const name = prompt('Script name:', 'Untitled Script');
            if (name !== null) {
                if (csInterface && autoDetectedScriptsPanelPath) {
                    const savePath = autoDetectedScriptsPanelPath + '/Aide-Scripts';
                    evalScriptSafe(`saveScriptFile(${JSON.stringify(savePath)}, ${JSON.stringify(name)}, ${JSON.stringify(code)})`, () => {
                        AideScripts.addScriptFolder(autoDetectedScriptsPanelPath);
                        clearLocalScriptContentCache();
                        if (scriptsSubTab === 'local') runScriptsToolbarRefresh();
                        btn.textContent = '✓ Saved';
                        setTimeout(() => btn.textContent = 'Save', 1500);
                    });
                } else {
                    btn.textContent = '✓ Saved (Mock)';
                    setTimeout(() => btn.textContent = 'Save', 1500);
                }
            }
        }
        if (action === 'execute') {
            executeCode(code, btn);
        }
        if (action === 'undo-edit') {
            const original = originalCodeMap[codeId];
            if (original) {
                codeEl.innerText = original;
                rebuildLineNumbers(codeEl);
                btn.classList.remove('active');
            }
        }
    });

    /**
     * Extract raw code from a code element.
     */
    function getCodeFromElement(el) {
        return el.innerText || el.textContent;
    }

    /**
     * Clipboard helper — works in both browser and CEP contexts.
     */
    function copyToClipboard(text) {
        // Try modern API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
    }

    // ──────────────── Execute ────────────────
    /**
     * @param {object} [opts]
     * @param {string} [opts.failedCode] script text for auto-fix when not from chat
     * @param {HTMLElement} [opts.launcherCard] script-card for launcher inline toast
     */
    function executeCode(code, triggerBtn, opts) {
        opts = opts || {};
        if (!csInterface) {
            showExecResult(triggerBtn, false, 'No InDesign connection', opts.launcherCard);
            return;
        }

        const scriptCall = `runGeneratedExtendScript(${JSON.stringify(code)})`;

        if (triggerBtn) {
            triggerBtn.textContent = '⏳';
            triggerBtn.disabled = true;
        }

        evalScriptSafe(scriptCall, ({ success, result, error }) => {
            const isError = !success;
            const message = success ? result : error;
            AideChat.logExecution(code, message, isError);

            if (triggerBtn) {
                triggerBtn.disabled = false;
                
                const isTreeBtn = triggerBtn.classList.contains('tree-run-btn');
                triggerBtn.textContent = isError ? (isTreeBtn ? '✕' : '✕ Failed') : (isTreeBtn ? '✓' : '✓ Done');
                if (isTreeBtn) triggerBtn.classList.add(isError ? 'state-error' : 'state-success');
                
                setTimeout(() => {
                    if (isTreeBtn) {
                        triggerBtn.classList.remove('state-error', 'state-success');
                        triggerBtn.innerHTML = PLAY_ICON_SVG;
                    } else {
                        triggerBtn.textContent = '▶ Run';
                    }
                }, 2000);
            }

            showExecResult(triggerBtn, !isError, message, opts.launcherCard);

            if (isError) {
                offerAutoFix(message, opts.failedCode != null ? opts.failedCode : code);
            }
        });
    }

    /**
     * Execute a local script file on disk by path using app.doScript.
     * This preserves #include relative paths and #targetengine directives,
     * matching the behaviour of the native InDesign Scripts panel.
     * Used for all Local / Favs / Sets run actions.
     *
     * @param {string}      path       Absolute filesystem path to the script
     * @param {HTMLElement} triggerBtn The button that was clicked (may be null)
     * @param {object}      [opts]     { launcherCard }
     */
    function executeLocalFile(path, triggerBtn, opts) {
        opts = opts || {};
        if (!csInterface) {
            showExecResult(triggerBtn, false, 'No InDesign connection', opts.launcherCard);
            return;
        }

        const scriptCall = `runLocalScriptFile(${JSON.stringify(path)})`;

        if (triggerBtn) {
            triggerBtn.textContent = '⏳';
            triggerBtn.disabled = true;
        }

        evalScriptSafe(scriptCall, ({ success, result, error }) => {
            const isError = !success;
            const message = success ? result : error;

            if (triggerBtn) {
                triggerBtn.disabled = false;
                triggerBtn.textContent = isError ? '✕' : '✓';
                triggerBtn.classList.add(isError ? 'state-error' : 'state-success');
                setTimeout(() => { 
                    if (triggerBtn) {
                        triggerBtn.classList.remove('state-error', 'state-success');
                        triggerBtn.innerHTML = PLAY_ICON_SVG; 
                    }
                }, 2000);
            }

            showExecResult(triggerBtn, !isError, message, opts.launcherCard);

            if (isError) {
                // Surface the error in the Chat panel; no AI auto-fix for local files
                appendSystemErrorToChat(message);
            }
        });
    }

    // 3.4: Decode %20 and other URL-encoded characters in filenames
    function cleanFileName(name) {
        try { return decodeURIComponent(name); }
        catch(e) { return name; }
    }

    // 3.5: Replace toast injection in script cards with CSS flash feedback.
    // Error details are sent to the Chat panel as a system message.
    function showExecResult(nearEl, success, message, launcherCard) {
        // 1. Try to find a row/card container for visual feedback (flash/shake)
        const container = launcherCard || (nearEl ? nearEl.closest('.script-row, .set-script-row, .script-card') : null);
        
        if (container) {
            const cls = success ? 'exec-flash-success' : 'exec-flash-error';
            container.classList.add(cls);
            setTimeout(() => container.classList.remove(cls), success ? 1200 : 1800);
            
            if (!success) {
                // If it's a card in the Aide tab, it might not have an error display, so use chat
                appendSystemErrorToChat(message);
            }
            return;
        }

        // 2. Fallback to chat message code block (for generated scripts)
        const codeBlock = nearEl ? nearEl.closest('.msg-code-block') : null;
        if (!codeBlock) return;

        const prev = codeBlock.parentElement.querySelector('.msg-exec-result');
        if (prev) prev.remove();

        const resultEl = document.createElement('div');
        resultEl.className = `msg-exec-result ${success ? 'success' : 'error'}`;
        resultEl.textContent = success
            ? '✓ Script executed successfully'
            : `✕ ${message}`;
        codeBlock.parentElement.appendChild(resultEl);
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }

    // 3.5: Display script errors in the Chat panel instead of inline toasts
    function appendSystemErrorToChat(message) {
        const errDiv = document.createElement('div');
        errDiv.className = 'msg-exec-result error';
        errDiv.textContent = `✕ Script error: ${message}`;
        dom.chatMessages.appendChild(errDiv);
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }

    function offerAutoFix(errorMsg, failedCode) {
        const fixDiv = document.createElement('div');
        fixDiv.className = 'chat-msg assistant';
        fixDiv.innerHTML = `
            <div class="msg-body" style="display:flex;align-items:center;gap:6px;">
                <span>Script failed. Want me to try fixing it?</span>
                <button class="code-action-btn" id="auto-fix-btn" style="color:var(--accent);border-color:var(--accent);">Auto-fix</button>
            </div>
        `;
        dom.chatMessages.appendChild(fixDiv);
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;

        $id('auto-fix-btn')?.addEventListener('click', async () => {
            fixDiv.remove();
            showTypingIndicator();
            dom.sendBtn.disabled = true;

            await AideChat.sendErrorFeedback(errorMsg, (update) => {
                if (update.type === 'done' || update.type === 'error') {
                    removeTypingIndicator();
                    renderChatMessages();
                    dom.sendBtn.disabled = false;
                }
            }, failedCode);
        });
    }

    // ──────────────── Scripts launcher (Aide | Local) ────────────────
    function normalizeFsPath(p) {
        return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    }

    function isAllowedLocalScriptPath(fsPath) {
        const norm = normalizeFsPath(fsPath);
        const roots = AideScripts.getScriptFolders().slice(); // copy
        // Always include the auto-detected Scripts Panel path even if not saved by user
        if (autoDetectedScriptsPanelPath && roots.indexOf(autoDetectedScriptsPanelPath) === -1) {
            roots.push(autoDetectedScriptsPanelPath);
        }
        for (let i = 0; i < roots.length; i++) {
            const base = normalizeFsPath(roots[i]);
            if (!base) continue;
            if (norm === base || norm.indexOf(base + '/') === 0) return true;
        }
        return false;
    }

    function syncScriptsSubtabUI() {
        const isLocal = scriptsSubTab === 'local';
        const isSets  = scriptsSubTab === 'sets';
        const isFavs  = scriptsSubTab === 'favs';
        if (dom.scriptsSubtabLocal) dom.scriptsSubtabLocal.classList.toggle('active', isLocal);
        if (dom.scriptsSubtabSets) dom.scriptsSubtabSets.classList.toggle('active', isSets);
        if (dom.scriptsSubtabFavs) dom.scriptsSubtabFavs.classList.toggle('active', isFavs);

        // Expand/Collapse only on Local
        if (dom.scriptsExpandAllBtn) dom.scriptsExpandAllBtn.classList.toggle('hidden', !isLocal);
        if (dom.scriptsCollapseAllBtn) dom.scriptsCollapseAllBtn.classList.toggle('hidden', !isLocal);

        // Hide ALL action buttons on Sets and Favs
        if (dom.scriptsToolbarActions) dom.scriptsToolbarActions.classList.toggle('hidden', isSets || isFavs);

        // Hide search on Sets
        if (dom.scriptsSearchBar) dom.scriptsSearchBar.classList.toggle('hidden', isSets);
    }

    function syncViewToggleBtn() {
        // Light version: ensure expanded class is never applied.
        if (dom.scriptsList) dom.scriptsList.classList.remove('scripts-list--expanded');
    }

    // Light version: script descriptions feature removed.

    async function runScriptsToolbarRefresh() {
        if (dom.scriptsRefreshBtn) {
            dom.scriptsRefreshBtn.disabled = true;
            dom.scriptsRefreshBtn.classList.add('is-loading');
        }
        try {
            if (scriptsSubTab === 'local') {
                clearLocalScriptContentCache();
                await new Promise(resolve => {
                    // Step 5: use tree scanner instead of flat list
                    fetchLocalScriptTree(() => {
                        // Also refresh flat list for enrichment jobs
                        fetchLocalScriptList(() => resolve());
                    });
                });
            } else if (scriptsSubTab === 'sets') {
                await new Promise(resolve => fetchAideSets(resolve));
            }
            refreshScriptsList();
        } finally {
            if (dom.scriptsRefreshBtn) {
                dom.scriptsRefreshBtn.disabled = false;
                dom.scriptsRefreshBtn.classList.remove('is-loading');
            }
        }
    }
    // Light version: script descriptions feature removed.

    function syncStarFilterBtn() {
        if (!dom.scriptsStarFilterBtn) return;
        dom.scriptsStarFilterBtn.classList.toggle('active', scriptsStarFilter);
        dom.scriptsStarFilterBtn.classList.toggle('starred', scriptsStarFilter);
        dom.scriptsStarFilterBtn.textContent = scriptsStarFilter ? '★' : '☆';
        dom.scriptsStarFilterBtn.title = scriptsStarFilter ? 'Show all scripts' : 'Show starred only';
    }

    let _lastScriptsSubtab = null;

    function setScriptsSubTab(tab) {
        if (['local', 'sets', 'favs'].indexOf(tab) >= 0) {
            scriptsSubTab = tab;
        } else {
            scriptsSubTab = 'local';
        }
        AideScripts.setScriptsSubtab(scriptsSubTab);
        syncScriptsSubtabUI();
        
        if (_lastScriptsSubtab !== scriptsSubTab) {
            if (dom.scriptsList) dom.scriptsList.innerHTML = '';
            _lastScriptsSubtab = scriptsSubTab;
        }

        if (scriptsSubTab === 'local' || scriptsSubTab === 'favs') {
            fetchLocalScriptTree(() => {
                fetchLocalScriptList(() => refreshScriptsList());
            });
        } else if (scriptsSubTab === 'sets') {
            fetchAideSets(() => refreshScriptsList());
        } else {
            refreshScriptsList();
        }
    }

    function setScriptsStarFilter(on) {
        scriptsStarFilter = !!on;
        AideScripts.setScriptsStarFilter(scriptsStarFilter);
        syncStarFilterBtn();
        refreshScriptsList();
    }

    function updateScriptsEmptyState() {
        const title = dom.scriptsEmpty.querySelector('.scripts-empty-title');
        const hint = dom.scriptsEmpty.querySelector('.scripts-empty-hint');
        if (scriptsSubTab === 'local') {
            if (title) title.textContent = 'No local scripts found';
            if (hint) {
                hint.textContent = 'Scripts Panel folder is empty.';
            }
        } else if (scriptsSubTab === 'sets') {
            if (title) title.textContent = 'No sets found';
            if (hint) {
                hint.textContent = 'Create a Set with the + New Set button below.';
            }
        } else if (scriptsSubTab === 'favs') {
            if (title) title.textContent = 'No favorites yet';
            if (hint) {
                hint.textContent = 'Star (★) any script to add it here.';
            }
        }
    }

    function refreshScriptsList() {
        syncScriptsSubtabUI();
        syncStarFilterBtn();
        syncViewToggleBtn();
        syncShowHiddenBtn();
        updateScriptsEmptyState();
        if (scriptsSubTab === 'local') {
            renderLocalTreePanel();
        } else if (scriptsSubTab === 'favs') {
            renderFavsPanel();
        } else if (scriptsSubTab === 'sets') {
            renderSetsPanel();
        }
    }

    // ── Step 5: Fetch tree data via scanScriptFolderJson ──
    function fetchLocalScriptTree(cb) {
        let folders = AideScripts.getScriptFolders();
        if (autoDetectedScriptsPanelPath && !folders.includes(autoDetectedScriptsPanelPath)) {
            folders.unshift(autoDetectedScriptsPanelPath);
        }
        if (!folders.length) {
            localTreeData = [];
            cb([]);
            return;
        }
        if (!csInterface) {
            // Browser mode: use mock tree from getMockTreeData()
            localTreeData = getMockTreeData();
            cb(localTreeData);
            return;
        }
        const payload = JSON.stringify(folders);
        evalScriptSafe(`scanScriptFolderJson(${payload})`, ({ success, result }) => {
            if (!success) { localTreeData = []; cb([]); return; }
            try {
                const parsed = result ? JSON.parse(result) : [];
                localTreeData = Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                localTreeData = [];
            }
            cb(localTreeData);
        });
    }

    // Backwards-compat: flat list fetch still used by enrichment / save functions.
    function fetchLocalScriptList(cb) {
        let folders = AideScripts.getScriptFolders();
        if (autoDetectedScriptsPanelPath && !folders.includes(autoDetectedScriptsPanelPath)) {
            folders.unshift(autoDetectedScriptsPanelPath);
        }
        if (!csInterface || !folders.length) {
            localScriptEntries = [];
            cb([]);
            return;
        }
        const payload = JSON.stringify(folders);
        evalScriptSafe(`listLocalScriptsFoldersJson(${payload})`, ({ success, result }) => {
            if (!success) {
                localScriptEntries = [];
                cb([]);
                return;
            }
            try {
                const parsed = result ? JSON.parse(result) : [];
                localScriptEntries = Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                localScriptEntries = [];
            }
            cb(localScriptEntries);
        });
    }

    // ── Step 6: Fetch Sets data via readAideSetsJson ──
    function fetchAideSets(cb) {
        let folders = AideScripts.getScriptFolders();
        if (autoDetectedScriptsPanelPath && !folders.includes(autoDetectedScriptsPanelPath)) {
            folders.unshift(autoDetectedScriptsPanelPath);
        }
        if (!folders.length) {
            localSetsData = [];
            cb([]);
            return;
        }
        if (!csInterface) {
            localSetsData = [{ _path: '/mock/set.aide-set.json', name: 'Mock Set', color: '#E8A838', icon: '📦', scripts: [] }];
            cb(localSetsData);
            return;
        }
        const payload = JSON.stringify(folders);
        evalScriptSafe(`readAideSetsJson(${payload})`, ({ success, result }) => {
            if (!success) { localSetsData = []; cb([]); return; }
            try {
                const parsed = result ? JSON.parse(result) : [];
                localSetsData = Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                localSetsData = [];
            }
            cb(localSetsData);
        });
    }

    // ── Step 6: Render the Sets panel ──
    function renderSetsPanel() {
        const enc = p => encodeURIComponent(p);
        const esc = AideUtils.escapeHtml;

        const fileIconSvg = `<svg viewBox="0 0 24 24" class="icon-svg"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><polyline points="14 2 14 7 19 7"/></svg>`;
        const folderIconSvg = `<svg viewBox="0 0 24 24" class="icon-svg"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
        const decodeLabel = (value) => {
            const raw = String(value || '');
            try { return decodeURIComponent(raw); } catch (e) { return raw.replace(/%20/g, ' '); }
        };
        const q     = (dom.scriptsSearch.value || '').toLowerCase().trim();

        if (localSetsData.length === 0 && !q) {
            dom.scriptsList.innerHTML = `<button class="create-set-full-btn" id="create-new-set-btn" style="margin-top:20px">Add New Set</button>`;
            return;
        }

        let filteredSets = localSetsData.slice();
        if (q) {
            filteredSets = filteredSets.filter(s => (s.name || '').toLowerCase().indexOf(q) !== -1);
        }

        dom.scriptsList.innerHTML = `
            <div class="sets-container">
                ${filteredSets.map(s => {
                    // Extract filenames for scripts array
                    const scriptRows = (s.scripts || []).map(p => {
                        const name = decodeLabel(p.split('/').pop().split('\\').pop());
                        return `<div class="set-script-row">
                            <button type="button" class="tree-run-btn" data-action="run-local" data-enc-path="${enc(p)}" title="Run">${PLAY_ICON_SVG}</button>
                            <span class="set-script-row-icon icon-svg" aria-hidden="true">${fileIconSvg}</span>
                            <span>${esc(name)}</span>
                        </div>`;
                    }).join('');

                    return `<details class="set-card" style="border-left-color: ${esc(s.color || '#fff')};">
                        <summary class="set-card-header">
                            <span class="set-icon icon-svg">${folderIconSvg}</span>
                            <span class="set-name">${esc(s.name)}</span>
                            <span class="set-count">${(s.scripts || []).length} scripts</span>
                            <button class="tree-overflow-btn" data-action="set-overflow" data-path="${enc(s._path)}" title="Set options">⋯</button>
                        </summary>
                        <div class="set-card-scripts">${scriptRows}</div>
                    </details>`;
                }).join('')}
            </div>
            <button class="create-set-full-btn" id="create-new-set-btn">Add New Set</button>
        `;
    }

    // ── Step 9: Smooth accordion for set-card <details> ──
    // Delegated on scriptsList so it re-attaches automatically after re-renders.
    if (dom.scriptsList) {
        dom.scriptsList.addEventListener('toggle', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLDetailsElement)) return;

            // Sets card accordion animation
            const setCard = t.closest('.set-card');
            if (setCard) {
                const body = setCard.querySelector('.set-card-scripts');
                if (!body) return;

                if (setCard.open) {
                    // Expanding: animate from 0 → scrollHeight
                    body.style.maxHeight = '0';
                    body.style.overflow  = 'hidden';
                    body.style.transition = 'max-height 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
                    requestAnimationFrame(() => {
                        body.style.maxHeight = body.scrollHeight + 'px';
                    });
                    body.addEventListener('transitionend', function once() {
                        body.style.maxHeight = '';
                        body.style.overflow  = '';
                        body.style.transition = '';
                        body.removeEventListener('transitionend', once);
                    }, { once: true });
                } else {
                    // Collapsing: animate from current height → 0
                    body.style.maxHeight = body.scrollHeight + 'px';
                    body.style.overflow  = 'hidden';
                    body.style.transition = 'max-height 0.18s ease-in';
                    requestAnimationFrame(() => {
                        body.style.maxHeight = '0';
                    });
                }
                return;
            }

            // Scripts tree: persist open/closed state so rerenders don't collapse folders
            const folder = t.closest('.script-folder');
            if (folder) {
                const encPath = folder.getAttribute('data-folder-path') || '';
                let path = '';
                try { path = decodeURIComponent(encPath); } catch (e2) { path = encPath; }
                AideScripts.setFolderOpen(path, folder.open);
            }
        }, true /* capture to beat default toggle behaviour */);
    }

    // ── Step 7: Render the Favs panel ──
    function renderFavsPanel() {
        const enc = p => encodeURIComponent(p);
        const esc = AideUtils.escapeHtml;
        const q     = (dom.scriptsSearch.value || '').toLowerCase().trim();
        const favs = Array.from(AideScripts.loadLocalFavorites());

        const fileIconSvg = `<svg viewBox="0 0 24 24" class="icon-svg"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><polyline points="14 2 14 7 19 7"/></svg>`;

        if (favs.length === 0 && !q) {
            dom.scriptsList.innerHTML = '';
            dom.scriptsList.appendChild(dom.scriptsEmpty);
            return;
        }

        let filteredFavs = favs.slice().sort((a,b) => {
            const nameA = a.split('/').pop().split('\\').pop().toLowerCase();
            const nameB = b.split('/').pop().split('\\').pop().toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        if (q) {
            filteredFavs = filteredFavs.filter(p => {
                const name = p.split('/').pop().split('\\').pop();
                return name.toLowerCase().indexOf(q) !== -1;
            });
        }

        dom.scriptsList.innerHTML = `
            <div class="favs-container" style="padding-top: 4px;">
                ${filteredFavs.map(p => {
                    const name = p.split('/').pop().split('\\').pop();
                    const isBin = name.toLowerCase().endsWith('.jsxbin') || name.toLowerCase().endsWith('.bin');
                    return `<div class="tree-row">
                        <span class="fav-script-row-icon icon-svg" aria-hidden="true">${fileIconSvg}</span>
                        <span class="tree-label">${esc(name)}</span>
                        <div class="tree-actions">
                            <button type="button" class="tree-run-btn" data-action="tree-run" data-enc-path="${enc(p)}" title="Run script">${PLAY_ICON_SVG}</button>
                            <button type="button" class="tree-overflow-btn" data-action="tree-overflow" data-enc-path="${enc(p)}" data-name="${esc(name)}" data-is-fav="true" data-is-hidden="false" data-is-bin="${isBin}">⋯</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    // ── Step 5: Render the hierarchical tree for the Local subtab ──
    function renderLocalTreePanel() {
        const q     = (dom.scriptsSearch.value || '').toLowerCase().trim();
        AideScripts.renderScriptTree(
            dom.scriptsList,
            dom.scriptsEmpty,
            localTreeData,
            q,
            scriptsStarFilter,
            showHiddenScripts
        );
    }

    // Show-hidden button sync
    function syncShowHiddenBtn() {
        if (!dom.scriptsShowHiddenBtn) return;
        // Only visible on Local sub-tab
        dom.scriptsShowHiddenBtn.classList.toggle('hidden', scriptsSubTab !== 'local');
        dom.scriptsShowHiddenBtn.classList.toggle('active', showHiddenScripts);
        dom.scriptsShowHiddenBtn.title = showHiddenScripts ? 'Hide hidden scripts' : 'Show hidden scripts';
    }

    // ── Step 5: Overflow menu controller ──
    let overflowTarget = null; // { path, name, isFav, isHidden, isBin }
    let menuOverlayBackdrop = null;

    function ensureMenuOverlayBackdrop() {
        if (menuOverlayBackdrop) return menuOverlayBackdrop;
        const backdrop = document.createElement('div');
        backdrop.className = 'menu-overlay-backdrop hidden';
        backdrop.addEventListener('click', () => {
            hideTreeOverflowMenu();
            hideSetOverflowMenu();
        });
        document.body.appendChild(backdrop);
        menuOverlayBackdrop = backdrop;
        return backdrop;
    }

    function syncMenuOverlayBackdrop() {
        if (!menuOverlayBackdrop) return;
        const treeOpen = dom.treeOverflowMenu && !dom.treeOverflowMenu.classList.contains('hidden');
        const setOpen = dom.setOverflowMenu && !dom.setOverflowMenu.classList.contains('hidden');
        menuOverlayBackdrop.classList.toggle('hidden', !(treeOpen || setOpen));
    }

    function showMenuAsOverlay(menuEl) {
        if (!menuEl) return;
        ensureMenuOverlayBackdrop().classList.remove('hidden');
        menuEl.classList.add('menu-overlay-sheet');
        menuEl.classList.remove('hidden');
    }

    function showTreeOverflowMenu(btn, encPath, name, isFav, isHidden, isBin) {
        const menu = dom.treeOverflowMenu;
        if (!menu) return;
        hideSetOverflowMenu();
        overflowTarget = {
            path: decodeURIComponent(encPath),
            name,
            isFav: isFav === 'true',
            isHidden: isHidden === 'true',
            isBin: isBin === 'true'
        };
        // Update menu item labels based on current state
        const tomFav  = $id('tom-fav');
        const tomHide = $id('tom-hide');
        const tomRun  = $id('tom-run');
        if (tomFav)  tomFav.textContent  = overflowTarget.isFav    ? '☆ Unfavorite' : '★ Favorite';
        if (tomHide) tomHide.textContent = overflowTarget.isHidden ? '👁 Unhide'     : '🙈 Hide';
        if (tomRun)  tomRun.style.display = overflowTarget.isBin   ? 'none'         : '';
        showMenuAsOverlay(menu);
        // Focus first item for accessibility
        const first = menu.querySelector('.tree-overflow-item:not([style*="none"])');
        if (first) first.focus();
    }

    function hideTreeOverflowMenu() {
        if (dom.treeOverflowMenu) {
            dom.treeOverflowMenu.classList.add('hidden');
            dom.treeOverflowMenu.classList.remove('menu-overlay-sheet');
        }
        overflowTarget = null;
        syncMenuOverlayBackdrop();
    }

    function dispatchTreeOverflowAction(action) {
        if (!overflowTarget) return;
        const { path, name, isFav, isHidden, isBin } = overflowTarget;
        hideTreeOverflowMenu();

        if (action === 'run') {
            if (!isAllowedLocalScriptPath(path)) return;
            executeLocalFile(path, null);
        }
        if (action === 'fav') {
            AideScripts.toggleLocalFavorite(path);
            runScriptsToolbarRefresh();
        }
        if (action === 'hide') {
            AideScripts.toggleHiddenPath(path);
            runScriptsToolbarRefresh();
        }
        if (action === 'copy-path') {
            try { navigator.clipboard.writeText(path); } catch (e) { /* ignore */ }
        }
        if (action === 'reveal') {
            if (csInterface) {
                evalScriptSafe(`revealLocalFileInFinder(${JSON.stringify(path)})`, () => {});
            }
        }

        if (action === 'add-to-set') {
            showAddToSetOverlay(path, name);
        }
    }

    // ── Browser mode: mock tree data ──
    function getMockTreeData() {
        return [
            {
                name: 'Scripts Panel',
                path: '/Users/MockUser/Library/Preferences/Adobe InDesign/Version 20.0/en_US/Scripts/Scripts Panel',
                type: 'folder',
                children: [
                    {
                        name: 'Utilities',
                        path: '/Users/MockUser/Library/Preferences/Adobe InDesign/Version 20.0/en_US/Scripts/Scripts Panel/Utilities',
                        type: 'folder',
                        children: [
                            { name: 'Hello World.jsx', path: '/Users/MockUser/.../Hello World.jsx', type: 'file', ext: '.jsx' },
                            { name: 'Auto-flow text.jsx', path: '/Users/MockUser/.../Auto-flow text.jsx', type: 'file', ext: '.jsx' }
                        ]
                    },
                    { name: 'Export All.jsx', path: '/Users/MockUser/.../Export All.jsx', type: 'file', ext: '.jsx' },
                    { name: 'Make Grid.jsx',  path: '/Users/MockUser/.../Make Grid.jsx',  type: 'file', ext: '.jsx' }
                ]
            }
        ];
    }

    function getDecodedPath(encPath) {
        try {
            return decodeURIComponent(encPath);
        } catch (e) {
            return '';
        }
    }

    function loadLocalFileContent(path, cb) {
        if (!isAllowedLocalScriptPath(path)) {
            cb('Error: Path not allowed.');
            return;
        }
        if (localScriptContentCache[path]) {
            cb(localScriptContentCache[path]);
            return;
        }
        if (!csInterface) {
            cb('Error: No InDesign connection.');
            return;
        }
        // 3.6: Route through evalScriptSafe for consistent error handling
        evalScriptSafe(`readLocalScriptFile(${JSON.stringify(path)})`, ({ success, result, error }) => {
            if (!success) {
                cb('Error: ' + (error || 'Failed to read file'));
                return;
            }
            if (result && result.indexOf('Error') === 0) {
                cb(result);
                return;
            }
            localScriptContentCache[path] = result;
            cb(result);
        });
    }


    if (dom.scriptsSubtabLocal) {
        dom.scriptsSubtabLocal.addEventListener('click', () => setScriptsSubTab('local'));
    }
    if (dom.scriptsSubtabSets) {
        dom.scriptsSubtabSets.addEventListener('click', () => setScriptsSubTab('sets'));
    }
    if (dom.scriptsSubtabFavs) {
        dom.scriptsSubtabFavs.addEventListener('click', () => setScriptsSubTab('favs'));
    }
    if (dom.scriptsStarFilterBtn) {
        dom.scriptsStarFilterBtn.addEventListener('click', () => setScriptsStarFilter(!scriptsStarFilter));
    }
    // Light version: view toggle removed.

    if (dom.scriptsRefreshBtn) {
        dom.scriptsRefreshBtn.addEventListener('click', () => {
            runScriptsToolbarRefresh();
        });
    }

    if (dom.scriptsExpandAllBtn) {
        dom.scriptsExpandAllBtn.addEventListener('click', () => {
            if (scriptsSubTab !== 'local') return;
            AideScripts.expandAllFolders(localTreeData);
            refreshScriptsList();
        });
    }

    if (dom.scriptsCollapseAllBtn) {
        dom.scriptsCollapseAllBtn.addEventListener('click', () => {
            if (scriptsSubTab !== 'local') return;
            AideScripts.collapseAllFolders();
            refreshScriptsList();
        });
    }

    // Step 5: Show Hidden toggle
    if (dom.scriptsShowHiddenBtn) {
        dom.scriptsShowHiddenBtn.addEventListener('click', () => {
            showHiddenScripts = !showHiddenScripts;
            AideScripts.setShowHidden(showHiddenScripts);
            syncShowHiddenBtn();
            renderLocalTreePanel();
        });
    }

    function syncScriptsSearchClear() {
        if (!dom.scriptsSearchClear) return;
        const has = !!(dom.scriptsSearch && dom.scriptsSearch.value && dom.scriptsSearch.value.trim());
        dom.scriptsSearchClear.disabled = !has;
    }

    dom.scriptsSearch.addEventListener('input', () => {
        syncScriptsSearchClear();
        refreshScriptsList();
    });
    if (dom.scriptsSearchClear) {
        dom.scriptsSearchClear.addEventListener('click', () => {
            dom.scriptsSearch.value = '';
            syncScriptsSearchClear();
            refreshScriptsList();
            try { dom.scriptsSearch.focus(); } catch (e) { /* ignore */ }
        });
        syncScriptsSearchClear();
    }

    /* Delegated to unified scriptsList click handler below */

    // Double-click local tree row → execute script
    if (dom.scriptsList) {
        dom.scriptsList.addEventListener('dblclick', (e) => {
            const row = e.target.closest('.script-row');
            if (!row) return;
            if (e.target.closest('.tree-run-btn') || e.target.closest('.tree-overflow-btn')) return;
            const encPath = row.dataset.path || '';
            const path = getDecodedPath(encPath);
            if (!path || !isAllowedLocalScriptPath(path)) return;
            executeLocalFile(path, null);
        });
    }

    // ── Step 5: Overflow menu item click ──
    if (dom.treeOverflowMenu) {
        dom.treeOverflowMenu.addEventListener('click', (e) => {
            const item = e.target.closest('[data-overflow-action]');
            if (!item) return;
            dispatchTreeOverflowAction(item.dataset.overflowAction);
        });
        // Keyboard dismiss
        dom.treeOverflowMenu.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideTreeOverflowMenu();
        });
    }

    // Click outside overflow menu → dismiss
    document.addEventListener('click', (e) => {
        if (dom.treeOverflowMenu && !dom.treeOverflowMenu.classList.contains('hidden')) {
            if (!dom.treeOverflowMenu.contains(e.target) && !e.target.closest('[data-action="tree-overflow"]')) {
                hideTreeOverflowMenu();
            }
        }
        if (dom.setOverflowMenu && !dom.setOverflowMenu.classList.contains('hidden')) {
            if (!dom.setOverflowMenu.contains(e.target) && !e.target.closest('[data-action="set-overflow"]')) {
                hideSetOverflowMenu();
            }
        }
    });

    // ── Step 6: Sets Overflow & Overlay logic ──
    let setOverflowTarget = null; // enc path

    function showSetOverflowMenu(btn, encPath) {
        const menu = dom.setOverflowMenu;
        if (!menu) return;
        hideTreeOverflowMenu();
        setOverflowTarget = encPath;
        showMenuAsOverlay(menu);
        const first = menu.querySelector('.tree-overflow-item');
        if (first) first.focus();
    }

    function hideSetOverflowMenu() {
        if (dom.setOverflowMenu) {
            dom.setOverflowMenu.classList.add('hidden');
            dom.setOverflowMenu.classList.remove('menu-overlay-sheet');
        }
        setOverflowTarget = null;
        syncMenuOverlayBackdrop();
    }

    // Set Edit State
    let editingSetPath = null;
    
    function showSetOverlay(existingSet) {
        if (!dom.setOverlay) return;
        function normalizeHex(v) {
            const s = String(v || '').trim();
            if (!s) return '';
            const up = s.charAt(0) === '#' ? s.toUpperCase() : ('#' + s.toUpperCase());
            return /^#[0-9A-F]{6}$/.test(up) ? up : '';
        }
        function syncSetSwatches(color) {
            const wrap = document.getElementById('set-color-swatches');
            if (!wrap) return;
            const btns = Array.prototype.slice.call(wrap.querySelectorAll('.set-color-swatch'));
            btns.forEach(b => b.classList.toggle('active', String(b.getAttribute('data-color') || '').toUpperCase() === String(color || '').toUpperCase()));
        }

        if (existingSet) {
            editingSetPath = existingSet._path;
            dom.setOverlayTitle.textContent = 'Edit Set';
            dom.setOverlayName.value = existingSet.name || '';
            if (dom.setOverlayIcon) dom.setOverlayIcon.value = existingSet.icon || '📦';
            dom.setOverlayColor.value = normalizeHex(existingSet.color) || '#E8A838';
        } else {
            editingSetPath = null;
            dom.setOverlayTitle.textContent = 'Add New Set';
            dom.setOverlayName.value = '';
            if (dom.setOverlayIcon) dom.setOverlayIcon.value = '📦';
            dom.setOverlayColor.value = '#E8A838';
        }
        syncSetSwatches(dom.setOverlayColor.value);
        dom.setOverlay.classList.remove('hidden');
        dom.setOverlayName.focus();
    }
    
    function hideSetOverlay() {
        if (dom.setOverlay) dom.setOverlay.classList.add('hidden');
    }

    function saveAideSet(name, icon, color, existingScripts) {
        const setJson = JSON.stringify({
            name, icon, color,
            scripts: existingScripts || [],
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        }, null, 2);

        let targetPath = editingSetPath;
        if (!targetPath) {
            // Use first user-added folder, fall back to auto-detected Scripts Panel path
            let folders = AideScripts.getScriptFolders();
            if (!folders.length && autoDetectedScriptsPanelPath) {
                folders = [autoDetectedScriptsPanelPath];
            }
            if (!folders.length) return alert("Please add a local scripts folder in Settings first.");
            const safeName = name.replace(/[\/\\:*?"<>|]/g, '_') || 'New Set';
            targetPath = folders[0] + '/' + safeName + '.aide-set.json';
        }
        
        evalScriptSafe(`writeAideSet(${JSON.stringify(targetPath)}, ${JSON.stringify(setJson)})`, () => {
            hideSetOverlay();
            runScriptsToolbarRefresh();
        });
    }

    if (dom.setOverlayCancel) dom.setOverlayCancel.addEventListener('click', hideSetOverlay);
    if (dom.setOverlay) {
        dom.setOverlay.addEventListener('click', (e) => {
            if (e.target === dom.setOverlay) hideSetOverlay();
        });
    }
    // Set color swatches (avoid native color picker behind CEP)
    const setSwatches = $id('set-color-swatches');
    if (setSwatches && dom.setOverlayColor) {
        setSwatches.addEventListener('click', (e) => {
            const btn = e.target.closest('.set-color-swatch');
            if (!btn) return;
            const c = String(btn.getAttribute('data-color') || '').trim();
            if (!c) return;
            dom.setOverlayColor.value = c;
            const btns = Array.prototype.slice.call(setSwatches.querySelectorAll('.set-color-swatch'));
            btns.forEach(b => b.classList.toggle('active', b === btn));
        });
    }
    if (dom.setOverlayColor) {
        dom.setOverlayColor.addEventListener('input', () => {
            // live sync swatch active state if exact match
            const val = String(dom.setOverlayColor.value || '').trim().toUpperCase();
            const wrap = $id('set-color-swatches');
            if (!wrap) return;
            const btns = Array.prototype.slice.call(wrap.querySelectorAll('.set-color-swatch'));
            btns.forEach(b => b.classList.toggle('active', String(b.getAttribute('data-color') || '').toUpperCase() === val));
        });
    }
    if (dom.setOverlaySave) {
        dom.setOverlaySave.addEventListener('click', () => {
            const name = dom.setOverlayName.value.trim();
            if (!name) return alert("Name is required.");
            
            // Find existing if editing
            let existingScripts = [];
            if (editingSetPath) {
                const s = localSetsData.find(x => x._path === editingSetPath);
                if (s) existingScripts = s.scripts || [];
            }
            saveAideSet(name, '', dom.setOverlayColor.value || '#E8A838', existingScripts);
        });
    }

    if (dom.setOverflowMenu) {
        dom.setOverflowMenu.addEventListener('click', (e) => {
            const item = e.target.closest('[data-set-action]');
            if (!item || !setOverflowTarget) return;
            const action = item.dataset.setAction;
            const path = decodeURIComponent(setOverflowTarget);
            hideSetOverflowMenu();

            if (action === 'delete') {
                if (confirm('Delete this set? The scripts inside will not be deleted.')) {
                    evalScriptSafe(`deleteAideSet(${JSON.stringify(path)})`, () => {
                        runScriptsToolbarRefresh();
                    });
                }
            } else if (action === 'rename' || action === 'color') {
                const s = localSetsData.find(x => x._path === path);
                if (s) showSetOverlay(s);
            }
        });
        dom.setOverflowMenu.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideSetOverflowMenu();
        });
    }

    /* Delegated to unified scriptsList click handler below */

    function showAddToSetOverlay(scriptPath, scriptName) {
        if (!dom.addToSetOverlay) return;
        if (!localSetsData.length) {
            alert("No Sets available. Create one in the Sets tab first.");
            return;
        }

        dom.addToSetScriptName.textContent = scriptName;
        const listWrap = dom.addToSetList;
        listWrap.innerHTML = '';

        localSetsData.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'overlay-folder-btn';
            btn.style.borderLeft = `3px solid ${s.color || '#E8A838'}`;
            btn.innerHTML = `
                <span style="margin-right:8px">${AideUtils.escapeHtml(s.icon || '📦')}</span>
                <span>${AideUtils.escapeHtml(s.name)}</span>
            `;
            btn.onclick = () => {
                let newScripts = s.scripts || [];
                if (newScripts.indexOf(scriptPath) === -1) {
                    newScripts.push(scriptPath);
                    const setJson = JSON.stringify({
                        name: s.name,
                        icon: s.icon,
                        color: s.color,
                        scripts: newScripts,
                        created: s.created || new Date().toISOString(),
                        modified: new Date().toISOString()
                    }, null, 2);
                    evalScriptSafe(`writeAideSet(${JSON.stringify(s._path)}, ${JSON.stringify(setJson)})`, () => {
                        hideAddToSetOverlay();
                        runScriptsToolbarRefresh();
                    });
                } else {
                    hideAddToSetOverlay();
                }
            };
            listWrap.appendChild(btn);
        });

        dom.addToSetOverlay.classList.remove('hidden');
    }

    function hideAddToSetOverlay() {
        if (dom.addToSetOverlay) dom.addToSetOverlay.classList.add('hidden');
    }

    if (dom.addToSetCloseBtn) dom.addToSetCloseBtn.addEventListener('click', hideAddToSetOverlay);
    if (dom.addToSetOverlay) {
        dom.addToSetOverlay.addEventListener('click', (e) => {
            if (e.target === dom.addToSetOverlay) hideAddToSetOverlay();
        });
    }

    function downloadJsxFile(name, code) {
        const base = (name || 'script').replace(/[/\\:*?"<>|]/g, '_').replace(/\.jsx?$/i, '');
        const defaultName = base + '.jsx';
        
        // 3.6: Guard csInterface before use
        if (!csInterface) return;
        const scriptStr = `aidePromptAndSaveFile(${JSON.stringify(defaultName)}, ${JSON.stringify(code)}, "Save Script", "*.jsx")`;
        evalScriptSafe(scriptStr, ({ success, error }) => {
            if (!success && error) {
                alert(error);
            }
        });
    }

    // ──────────────── Download Overlay ────────────────

    // Pending overlay state
    let _overlayScript = null;

    function showDownloadOverlay(script) {
        if (!dom.aideOverlay) return;
        _overlayScript = script;

        // Populate script name label
        if (dom.overlayScriptName) {
            dom.overlayScriptName.textContent = (script.name || 'Untitled') + '.jsx';
        }

        // Populate folder buttons
        if (dom.overlayFolders) {
            const folders = AideScripts.getScriptFolders();
            const folderSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
            if (folders.length === 0) {
                dom.overlayFolders.innerHTML = '';
            } else {
                dom.overlayFolders.innerHTML = folders.map((f, i) =>
                    `<button class="overlay-folder-btn" data-folder-index="${i}" title="${AideUtils.escapeHtml(f)}">${folderSvg}${AideUtils.escapeHtml(f)}</button>`
                ).join('');
            }
        }

        dom.aideOverlay.classList.remove('hidden');
    }

    function hideDownloadOverlay() {
        if (dom.aideOverlay) dom.aideOverlay.classList.add('hidden');
        _overlayScript = null;
    }

    function saveScriptToFolder(folderPath, script, sourceCardId) {
        if (!script || !csInterface) return;
        const fname = script.name.endsWith('.jsx') ? script.name : script.name + '.jsx';
        // 3.6: Route through evalScriptSafe
        evalScriptSafe(
            `saveScriptFile(${JSON.stringify(folderPath)}, ${JSON.stringify(fname)}, ${JSON.stringify(script.code)})`,
            ({ success, result, error }) => {
                hideDownloadOverlay();
                if (!success) {
                    alert(error || 'Failed to save script');
                    return;
                }
                // Slide-out and remove from Aide list
                const id = sourceCardId || (script && script.id);
                if (!id) { refreshScriptsList(); return; }
                const card = dom.scriptsList.querySelector(`[data-id="${id}"]`);
                if (card) {
                    card.classList.add('script-card-slide-out');
                    setTimeout(() => {
                        AideScripts.remove(id);
                        refreshScriptsList();
                        fetchLocalScriptList(() => {});
                    }, 400);
                } else {
                    AideScripts.remove(id);
                    refreshScriptsList();
                }
            }
        );
    }

    function saveScriptNative(name, code, card, id) {
        if (!csInterface) { downloadJsxFile(name, code); return; }
        const fname = name.endsWith('.jsx') ? name : name + '.jsx';
        // 3.6: Route through evalScriptSafe
        evalScriptSafe('pickScriptsFolder()', ({ success, result }) => {
            if (!success || !result || result === '') return;
            // Add the picked folder to the list for future use
            AideScripts.addScriptFolder(result.trim());
            renderLocalFoldersSettings();
            // Now save into that folder
            evalScriptSafe(
                `saveScriptFile(${JSON.stringify(result.trim())}, ${JSON.stringify(fname)}, ${JSON.stringify(code)})`,
                ({ success: ok, error }) => {
                    if (!ok) { alert(error || 'Failed to save'); return; }
                    if (card) {
                        card.classList.add('script-card-slide-out');
                        setTimeout(() => {
                            if (id) AideScripts.remove(id);
                            refreshScriptsList();
                            fetchLocalScriptList(() => {});
                        }, 400);
                    } else {
                        if (id) AideScripts.remove(id);
                        refreshScriptsList();
                    }
                }
            );
        });
    }

    // Overlay event wiring
    if (dom.aideOverlay) {
        // Close when clicking backdrop
        dom.aideOverlay.addEventListener('click', (e) => {
            if (e.target === dom.aideOverlay) hideDownloadOverlay();
        });
    }
    if (dom.overlayCloseBtn) {
        dom.overlayCloseBtn.addEventListener('click', hideDownloadOverlay);
    }
    if (dom.overlayNativeBtn) {
        dom.overlayNativeBtn.addEventListener('click', () => {
            const script = _overlayScript;
            if (!script) { hideDownloadOverlay(); return; }
            hideDownloadOverlay();
            saveScriptNative(script.name, script.code, null, script.id);
        });
    }
    if (dom.overlayFolders) {
        dom.overlayFolders.addEventListener('click', (e) => {
            const btn = e.target.closest('.overlay-folder-btn');
            if (!btn) return;
            const idx = parseInt(btn.dataset.folderIndex, 10);
            const folders = AideScripts.getScriptFolders();
            if (isNaN(idx) || !folders[idx]) return;
            const script = _overlayScript;
            if (!script) { hideDownloadOverlay(); return; }
            saveScriptToFolder(folders[idx], script, script.id);
        });
    }



    // ── Step 5: Unified Single Event Delegation on scriptsList ──
    dom.scriptsList.addEventListener('click', (e) => {
        // Intercept create-set button (no data-action)
        const createBtn = e.target.closest('#create-new-set-btn');
        if (createBtn) {
            showSetOverlay(null);
            return;
        }

        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        const encPath = btn.dataset.encPath || btn.dataset.path;
        const localPath = encPath ? getDecodedPath(encPath) : '';

        if (action === 'tree-run') {
            if (!localPath || !isAllowedLocalScriptPath(localPath)) return;
            btn.classList.add('pulse');
            setTimeout(() => btn.classList.remove('pulse'), 300);
            executeLocalFile(localPath, btn);
            return;
        }

        if (action === 'tree-overflow') {
            e.stopPropagation();
            const name     = btn.dataset.name || '';
            const isFav    = btn.dataset.isFav || 'false';
            const isHidden = btn.dataset.isHidden || 'false';
            const isBin    = btn.dataset.isBin || 'false';
            showTreeOverflowMenu(btn, encPath || '', name, isFav, isHidden, isBin);
            return;
        }

        if (action === 'set-overflow') {
            e.stopPropagation();
            showSetOverflowMenu(btn, encPath || '');
            return;
        }

        if (action === 'run') {
            const script = AideScripts.getById(id);
            if (script) {
                const card = btn.closest('.script-card');
                executeCode(script.code, btn, { launcherCard: card, failedCode: script.code });
            }
        }
        if (action === 'view' || action === 'toggle-code') {
            const viewer = $id('code-viewer-' + id);
            if (viewer) {
                viewer.classList.toggle('hidden');
                if (btn.dataset.action === 'view') {
                    btn.textContent = viewer.classList.contains('hidden') ? '{ }' : '{ ✕ }';
                }
            }
        }
        if (action === 'download' && id) {
            const script = AideScripts.getById(id);
            if (!script) return;
            const folders = AideScripts.getScriptFolders();
            if (folders.length > 0 && csInterface) {
                // Show overlay so user picks destination
                showDownloadOverlay(script);
            } else if (csInterface) {
                // No folders: launch native file picker directly
                saveScriptNative(script.name, script.code, btn.closest('.script-card'), id);
            } else {
                downloadJsxFile(script.name, script.code);
            }
        }
        if (action === 'load-chat') {
            const script = AideScripts.getById(id);
            if (script) {
                AideChat.newConversation();
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(v => v.classList.remove('active'));
                $id('tab-chat').classList.add('active');
                $id('view-chat').classList.add('active');
                dom.promptInput.value = '';
                persistChatDraft('');
                currentAttachment = {
                    name: script.name + '.jsx',
                    type: 'jsx',
                    content: script.code
                };
                dom.attachedFileName.textContent = currentAttachment.name;
                dom.attachedFile.classList.remove('hidden');
                dom.promptInput.focus();
                renderChatMessages();
            }
        }
        if (action === 'fav') {
            AideScripts.toggleFavorite(id);
            refreshScriptsList();
        }
        if (action === 'delete') {
            if (confirm('Delete this script?')) {
                AideScripts.remove(id);
                refreshScriptsList();
            }
        }
        if (action === 'save-edits') {
            const viewer = $id('code-viewer-' + id);
            if (viewer) {
                const pre = viewer.querySelector('pre');
                if (pre) {
                    AideScripts.update(id, { code: pre.textContent });
                    btn.textContent = '✓ Saved';
                    setTimeout(() => { btn.textContent = 'Save Changes'; }, 1500);
                }
            }
        }
        if (action === 'rename') {
            const script = AideScripts.getById(id);
            if (script) {
                const newName = prompt('New name:', script.name);
                if (newName !== null && newName.trim()) {
                    AideScripts.update(id, { name: newName.trim() });
                    refreshScriptsList();
                }
            }
        }

        if (action === 'run-local' && localPath) {
            if (!isAllowedLocalScriptPath(localPath)) return;
            // Step 9: pulse animation on the run button
            const runBtn = e.target.closest('.tree-run-btn');
            if (runBtn) {
                runBtn.classList.add('pulse');
                setTimeout(() => runBtn.classList.remove('pulse'), 300);
            }
            const card = btn.closest('.script-card');
            executeLocalFile(localPath, btn, { launcherCard: card });
        }
        if (action === 'view-local' && localPath) {
            const card = btn.closest('.script-card');
            const viewer = card ? card.querySelector('.script-code-viewer') : null;
            if (!viewer || !card) return;
            const pre = viewer.querySelector('pre');
            const opening = viewer.classList.contains('hidden');
            viewer.classList.toggle('hidden');
            btn.textContent = viewer.classList.contains('hidden') ? '{ }' : '{ ✕ }';
            if (opening && pre && !pre.textContent.trim()) {
                loadLocalFileContent(localPath, (code) => {
                    if (code.indexOf('Error') === 0) {
                        pre.textContent = code;
                        return;
                    }
                    pre.textContent = code;
                });
            }
        }
        if (action === 'load-chat-local' && localPath) {
            loadLocalFileContent(localPath, (code) => {
                if (code.indexOf('Error') === 0) {
                    alert(code);
                    return;
                }
                const base = localPath.replace(/^[\\/]/, '').split(/[/\\]/).pop() || 'script.jsx';
                AideChat.newConversation();
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(v => v.classList.remove('active'));
                $id('tab-chat').classList.add('active');
                $id('view-chat').classList.add('active');
                dom.promptInput.value = '';
                persistChatDraft('');
                currentAttachment = { name: base, type: 'jsx', content: code };
                dom.attachedFileName.textContent = currentAttachment.name;
                dom.attachedFile.classList.remove('hidden');
                dom.promptInput.focus();
                renderChatMessages();
            });
        }
        if (action === 'fav-local' && localPath) {
            AideScripts.toggleLocalFavorite(localPath);
            refreshScriptsList();
        }
        if (action === 'reveal-local' && localPath && csInterface) {
            if (!isAllowedLocalScriptPath(localPath)) return;
            // 3.6: Route through evalScriptSafe
            evalScriptSafe(`revealLocalFileInFinder(${JSON.stringify(localPath)})`, () => {});
        }
        if (action === 'save-edits-local' && localPath) {
            const card = btn.closest('.script-card');
            const viewer = card ? card.querySelector('.script-code-viewer') : null;
            if (!viewer || !csInterface) return;
            const pre = viewer.querySelector('pre');
            if (!pre || !isAllowedLocalScriptPath(localPath)) return;
            const text = pre.textContent;
            // 3.6: Route through evalScriptSafe
            evalScriptSafe(
                `writeLocalScriptFile(${JSON.stringify(localPath)}, ${JSON.stringify(text)})`,
                ({ success, result, error }) => {
                    if (!success) alert(error || 'Failed to save');
                    else {
                        localScriptContentCache[localPath] = text;
                        btn.textContent = '✓ Saved';
                        setTimeout(() => { btn.textContent = 'Save Changes'; }, 1500);
                        if (scriptsSubTab === 'local') runScriptsToolbarRefresh();
                    }
                }
            );
        }
    });

    // ──────────────── Settings Tab ────────────────
    const PROVIDER_HINTS = {
        'claude-cli': 'Agent mode: Claude Code inspects, edits, and verifies the live InDesign document through MCP.',
        'antigravity-cli': 'Agent mode: Antigravity discovers the project InDesign MCP plugin and operates on the live document.',
        'codex-cli': 'Agent mode: Codex receives only the InDesign MCP server and operates in a read-only filesystem sandbox.',
        'gemini-cli': 'Agent mode: Gemini uses the trusted project InDesign MCP server to edit the live document.',
        ollama: '',
        google: 'Get your key at <a href="#" onclick="openUrl(\'https://aistudio.google.com/apikey\')">Google AI Studio</a>',
        openai: 'Get your key at <a href="#" onclick="openUrl(\'https://platform.openai.com/api-keys\')">platform.openai.com</a>',
        anthropic: 'Get your key at <a href="#" onclick="openUrl(\'https://console.anthropic.com/\')">console.anthropic.com</a>',
        openrouter: 'Get your key at <a href="#" onclick="openUrl(\'https://openrouter.ai/keys\')">openrouter.ai/keys</a>',
        custom: 'Any OpenAI-compatible endpoint (LM Studio, text-gen-webui, Together AI, etc.)'
    };

    const PROVIDER_KEY_PLACEHOLDERS = {
        ollama: '',
        google: 'AIza...',
        openai: 'sk-...',
        anthropic: 'sk-ant-...',
        openrouter: 'sk-or-v1-...',
        custom: 'API key (optional)'
    };

    window.openUrl = function(url) {
        if (csInterface) {
            csInterface.openURLInDefaultBrowser(url);
        } else {
            window.open(url, '_blank');
        }
    };

    function initSettings() {
        const cfg = AideModels.loadSettings();

        dom.providerSelect.value = cfg.provider;
        dom.ollamaHost.value = cfg.ollamaHost;
        dom.apiKey.value = cfg.apiKeys?.[cfg.provider] || '';
        if (dom.customEndpoint) dom.customEndpoint.value = cfg.customEndpoint || '';
        dom.tempSlider.value = Math.round(cfg.temperature * 100);
        dom.tempValue.textContent = cfg.temperature.toFixed(1);

        // Debug toggle
        if (dom.debugToggle) {
            dom.debugToggle.checked = cfg.debugLogging || false;
            toggleDebugUI(cfg.debugLogging);
        }

        if (dom.promptTierSelect) {
            dom.promptTierSelect.value = localStorage.getItem('intrixai_prompt_tier') || 'tier_2';
        }

        renderLocalFoldersSettings();
        syncScriptsSubtabUI();
        syncStarFilterBtn();
        syncViewToggleBtn();
        syncShowHiddenBtn();

        // Step 4: Detect Scripts Panel folder asynchronously
        detectAndRenderAutoFolder();

        toggleProviderUI(cfg.provider);
        refreshModelList();
    }

    // ── Step 4: Auto-detect Scripts Panel folder ──
    /**
     * Calls getDefaultScriptsPanelFolder() via evalScriptSafe.
     * Updates the auto-folder UI row in Settings with the result.
     */
    function detectAndRenderAutoFolder() {
        if (!csInterface) {
            autoDetectedScriptsPanelPath = '~/Library/Preferences/Adobe InDesign/Version 20.0/en_US/Scripts/Scripts Panel';
            renderLocalFoldersSettings();
            return;
        }

        evalScriptSafe('getDefaultScriptsPanelFolder()', ({ success, result }) => {
            const path = (success && result && result.trim() && result !== 'EvalScript error.') ? result.trim() : '';
            autoDetectedScriptsPanelPath = path;
            renderLocalFoldersSettings();
        });
    }

    function renderLocalFoldersSettings() {
        if (!dom.localFoldersList) return;
        let folders = AideScripts.getScriptFolders();
        if (autoDetectedScriptsPanelPath && !folders.includes(autoDetectedScriptsPanelPath)) {
            folders.unshift(autoDetectedScriptsPanelPath);
        }

        if (folders.length === 0) {
            dom.localFoldersList.innerHTML = `
            <div class="local-folders-empty" id="add-local-scripts-folder-empty" role="button" tabindex="0" title="Add a local scripts folder">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                Add folder…
            </div>`;
            return;
        }

        dom.localFoldersList.innerHTML = folders.map((p, i) => {
            const isAuto = (p === autoDetectedScriptsPanelPath);
            let displayPath = String(p || '');
            try { displayPath = decodeURIComponent(displayPath); } catch (e) { displayPath = displayPath.replace(/%20/g, ' '); }
            // If the folder is auto-detected and was unshifted, the real index in AideScripts is i-1
            // (Wait, actually if it is NOT in the real list, its real index is invalid anyway, but removeBtnHtml is empty)
            const realIndex = (autoDetectedScriptsPanelPath && !AideScripts.getScriptFolders().includes(autoDetectedScriptsPanelPath)) ? i - 1 : i;

            const badgeHtml = isAuto ? `<span style="font-size: 9px; color: var(--success); margin-right: 5px;" title="Scripts Panel folder automatically detected">● Default Panel</span> ` : '';
            const removeBtnHtml = isAuto ? '' : `<button type="button" class="compact-btn danger local-folder-remove" data-folder-index="${realIndex}" title="Remove folder">−</button>`;
            
            return `
            <div class="local-folder-row">
                <span class="storage-path-value">${badgeHtml}${AideUtils.escapeHtml(displayPath)}</span>
                <button type="button" class="code-action-btn local-folder-open-btn" data-open-folder-index="${realIndex}" title="Open folder">📁</button>
                ${removeBtnHtml}
                <button type="button" class="compact-btn local-folder-add" data-folder-index="${realIndex}" title="Add another folder">+</button>
            </div>`;
        }).join('');
    }

    function toggleProviderUI(provider) {
        var isCli = (provider === 'claude-cli' || provider === 'antigravity-cli' || provider === 'codex-cli' || provider === 'gemini-cli');
        dom.ollamaHostRow.classList.toggle('hidden', provider !== 'ollama');
        dom.apiKeyRow.classList.toggle('hidden', provider === 'ollama' || isCli);
        if (dom.customEndpointRow) {
            dom.customEndpointRow.classList.toggle('hidden', provider !== 'custom');
        }

        dom.apiKey.placeholder = PROVIDER_KEY_PLACEHOLDERS[provider] || 'API key';

        const hint = PROVIDER_HINTS[provider];
        if (dom.providerHint) {
            if (hint) {
                dom.providerHint.innerHTML = hint;
                dom.providerHint.classList.remove('hidden');
            } else {
                dom.providerHint.classList.add('hidden');
            }
        }

        const autoRunWrap = $id('auto-run-wrap');
        if (autoRunWrap) {
            autoRunWrap.classList.toggle('hidden', isCli);
        }
    }

    function toggleDebugUI(enabled) {
        if (dom.debugActions) {
            dom.debugActions.classList.toggle('hidden', !enabled);
        }
    }

    // Provider change → auto-select default model and restore its API key
    dom.providerSelect.addEventListener('change', () => {
        const provider = dom.providerSelect.value;
        const defaultModel = AideModels.getDefaultModel(provider);

        AideModels.setConfig({ provider, model: defaultModel });
        dom.apiKey.value = AideModels.getConfig().apiKeys?.[provider] || '';

        // Clear custom model on provider switch
        dom.modelCustom.value = '';
        dom.modelCustomRow.classList.add('hidden');
        dom.clearCustomModel.disabled = true;

        toggleProviderUI(provider);
        refreshModelList();
        checkConnection();
    });

    dom.ollamaHost.addEventListener('change', () => {
        AideModels.setConfig({ ollamaHost: dom.ollamaHost.value.trim() });
        refreshModelList();
        checkConnection();
    });

    if (dom.customEndpoint) {
        dom.customEndpoint.addEventListener('change', () => {
            AideModels.setConfig({ customEndpoint: dom.customEndpoint.value.trim() });
        });
    }

    dom.apiKey.addEventListener('change', () => {
        const provider = AideModels.getConfig().provider;
        AideModels.setApiKey(provider, dom.apiKey.value.trim());
        refreshModelList();
        checkConnection();
    });

    dom.toggleKeyVis.addEventListener('click', () => {
        dom.apiKey.type = dom.apiKey.type === 'password' ? 'text' : 'password';
    });

    dom.tempSlider.addEventListener('input', () => {
        const val = parseInt(dom.tempSlider.value) / 100;
        dom.tempValue.textContent = val.toFixed(1);
        AideModels.setConfig({ temperature: val });
    });

    // ── Prompt Tier wiring (v3.1 — simplified, modules baked into tiers) ──
    if (dom.promptTierSelect) {
        dom.promptTierSelect.addEventListener('change', () => {
            const tier = dom.promptTierSelect.value;
            try { localStorage.setItem('aide_prompt_tier', tier); } catch(e) {}
            // Re-init conversation with the new tier
            AideChat.newConversation();
        });
    }

    // Custom model input — enable/disable clear button
    dom.modelCustom.addEventListener('input', () => {
        dom.clearCustomModel.disabled = !dom.modelCustom.value.trim();
    });

    dom.modelCustom.addEventListener('change', () => {
        const model = dom.modelCustom.value.trim();
        if (model) {
            AideModels.setConfig({ model });
            
            // Persist to custom models list for current provider (2.3.1.1 fix)
            const provider = AideModels.getConfig().provider;
            addCustomModelForProvider(provider, model);
            
            dom.clearCustomModel.disabled = false;
            // No refresh here, it will refresh next time the tab is opened or provider changed
            checkConnection();
        }
    });

    // Clear custom model → revert to dropdown selection
    if (dom.clearCustomModel) {
        dom.clearCustomModel.addEventListener('click', () => {
            dom.modelCustom.value = '';
            dom.clearCustomModel.disabled = true;
            dom.modelCustomRow.classList.add('hidden');

            // Revert to dropdown-selected model
            const selected = dom.modelSelect.value;
            if (selected) {
                AideModels.setConfig({ model: selected });
            } else {
                const cfg = AideModels.getConfig();
                const defaultModel = AideModels.getDefaultModel(cfg.provider);
                AideModels.setConfig({ model: defaultModel });
            }
            checkConnection();
        });
    }

    if (dom.clearCustomModelsListBtn) {
        dom.clearCustomModelsListBtn.addEventListener('click', () => {
            if (confirm('Clear all manually added models from the dropdown list?')) {
                clearAllCustomModels();
                refreshModelList();
                dom.clearCustomModelsListBtn.textContent = '✓ Cleared';
                setTimeout(() => { dom.clearCustomModelsListBtn.textContent = '🗑 Clear Saved Models'; }, 1500);
            }
        });
    }

    // Dropdown model selection
    dom.modelSelect.addEventListener('change', () => {
        const model = dom.modelSelect.value;
        if (model === '__custom__') {
            // Show custom model input
            dom.modelCustomRow.classList.remove('hidden');
            dom.modelCustom.focus();
            return;
        }
        if (model) {
            // Hide custom row, use dropdown selection
            dom.modelCustomRow.classList.add('hidden');
            dom.modelCustom.value = '';
            dom.clearCustomModel.disabled = true;
            AideModels.setConfig({ model });
            checkConnection();
        }
    });

    function reconcileSavedModelOption(cfg) {
        const val = (cfg.model || '').trim();
        if (!val || val === '__custom__') return;
        
        // If it's in our saved list or defaults, we don't need a temporary one
        const sel = dom.modelSelect;
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === val) {
                sel.options[i].selected = true;
                return;
            }
        }

        // If not found in defaults or persistent list, add it temporarily
        const customOpt = sel.querySelector('option[value="__custom__"]');
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val + ' (unsaved)';
        if (customOpt) sel.insertBefore(opt, customOpt);
        else sel.appendChild(opt);
        opt.selected = true;
    }

    async function refreshModelList() {
        const cfg = AideModels.getConfig();
        dom.modelSelect.innerHTML = '<option value="">Loading...</option>';

        try {
            let options = '';

            if (cfg.provider === 'ollama') {
                const models = await AideModels.fetchOllamaModels();
                if (models.length === 0) {
                    options = '<option value="">No models found</option>';
                } else {
                    options = models.map(m =>
                        `<option value="${m.name}" ${m.name === cfg.model ? 'selected' : ''}>${m.name} (${m.paramSize})</option>`
                    ).join('');
                }
            } else if (cfg.provider === 'google') {
                const models = cfg.apiKeys?.google
                    ? await AideModels.fetchGoogleModels()
                    : AideModels.getRemoteModels('google');
                options = models.map(m =>
                    `<option value="${m.name}" ${m.name === cfg.model ? 'selected' : ''}>${m.name}${m.desc ? ' — ' + m.desc : ''}</option>`
                ).join('');
            } else {
                const models = AideModels.getRemoteModels(cfg.provider);
                if (models.length > 0) {
                    options = models.map(m =>
                        `<option value="${m.name}" ${m.name === cfg.model ? 'selected' : ''}>${m.name}${m.desc ? ' — ' + m.desc : ''}</option>`
                    ).join('');
                } else {
                    options = '<option value="">No preset models</option>';
                }
            }

            // Show custom models for current provider only (2.3.1.1 fix)
            const providerModels = getCustomModelsForProvider(cfg.provider);
            if (providerModels.length > 0) {
                options += `<optgroup label="Custom Models">`;
                options += providerModels.map(name =>
                    `<option value="${name}" ${name === cfg.model ? 'selected' : ''}>${name}</option>`
                ).join('');
                options += `</optgroup>`;
            }

            options += '<option value="__custom__">Custom model name…</option>';
            dom.modelSelect.innerHTML = options;
            reconcileSavedModelOption(AideModels.getConfig());

            // Light version: script descriptions feature removed.

        } catch (e) {
            dom.modelSelect.innerHTML = '<option value="">Could not load models</option><option value="__custom__">Custom model name…</option>';
            reconcileSavedModelOption(AideModels.getConfig());
        }
    }

    dom.refreshModels.addEventListener('click', refreshModelList);

    // ── Debug Logging ──
    if (dom.debugToggle) {
        dom.debugToggle.addEventListener('change', () => {
            const enabled = dom.debugToggle.checked;
            AideModels.setConfig({ debugLogging: enabled });
            toggleDebugUI(enabled);
        });
    }

    // Light version: script descriptions feature removed.

    if (dom.exportDebugBtn) {
        dom.exportDebugBtn.addEventListener('click', () => {
            const logText = AideModels.exportDebugLog();
            if (!logText || logText.indexOf('='.repeat(60)) === -1) {
                dom.exportDebugBtn.textContent = 'No logs yet';
                setTimeout(() => { dom.exportDebugBtn.textContent = 'Export Log'; }, 1500);
                return;
            }

            const defaultName = 'aide_debug_log_' + new Date().toISOString().slice(0, 10) + '.txt';
            const scriptStr = `aidePromptAndSaveFile(${JSON.stringify(defaultName)}, ${JSON.stringify(logText)}, "Save Debug Log", "*.txt")`;

            // 3.6: Route through evalScriptSafe
            if (!csInterface) return;
            evalScriptSafe(scriptStr, ({ success, result, error }) => {
                if (result === 'Cancelled') return;
                
                if (!success) {
                    alert(error || 'Failed to save log');
                    return;
                }

                dom.exportDebugBtn.textContent = '✓ Saved';
                setTimeout(() => { dom.exportDebugBtn.textContent = 'Export Log'; }, 2000);
            });
        });
    }

    if (dom.clearDebugBtn) {
        dom.clearDebugBtn.addEventListener('click', () => {
            if (confirm('Clear all debug log entries?')) {
                AideModels.clearDebugLog();
                dom.clearDebugBtn.textContent = '✓';
                setTimeout(() => { dom.clearDebugBtn.textContent = 'Clear'; }, 1500);
            }
        });
    }

    if (dom.localFoldersList) {
        dom.localFoldersList.addEventListener('click', (e) => {
            const openBtn = e.target.closest('[data-open-folder-index]');
            if (openBtn) {
                const idx = parseInt(openBtn.dataset.openFolderIndex, 10);
                const folders = AideScripts.getScriptFolders();
                if (!isNaN(idx) && folders[idx] && csInterface) {
                    // 3.6: Route through evalScriptSafe
                    evalScriptSafe(`openScriptsFolder(${JSON.stringify(folders[idx])})`, () => { });
                }
                return;
            }
            const rm = e.target.closest('.local-folder-remove');
            if (rm) {
                const idx = parseInt(rm.dataset.folderIndex, 10);
                if (!isNaN(idx)) {
                    AideScripts.removeScriptFolder(idx);
                    clearLocalScriptContentCache();
                    renderLocalFoldersSettings();
                    if (scriptsSubTab === 'local') runScriptsToolbarRefresh();
                }
                return;
            }
            const add = e.target.closest('.local-folder-add') || e.target.closest('#add-local-scripts-folder-empty') || e.target.closest('.local-folders-empty');
            if (add) {
                const idxStr = add.dataset.folderIndex;
                const insertIdx = (idxStr !== undefined) ? parseInt(idxStr, 10) + 1 : -1;
                if (csInterface) {
                    // 3.6: Route through evalScriptSafe
                    evalScriptSafe('pickScriptsFolder()', ({ success, result }) => {
                        if (success && result && result !== '') {
                            AideScripts.addScriptFolder(result, insertIdx);
                            clearLocalScriptContentCache();
                            renderLocalFoldersSettings();
                            if (scriptsSubTab === 'local') runScriptsToolbarRefresh();
                        }
                    });
                } else {
                    const path = prompt('Enter folder path:', '');
                    if (path && path.trim()) {
                        AideScripts.addScriptFolder(path.trim(), insertIdx);
                        clearLocalScriptContentCache();
                        renderLocalFoldersSettings();
                        if (scriptsSubTab === 'local') runScriptsToolbarRefresh();
                    }
                }
            }
        });
    }

    // Light version: script descriptions feature removed.

    dom.testConnBtn.addEventListener('click', async () => {
        dom.testResult.textContent = 'Testing...';
        dom.testResult.className = 'test-result';

        const cfg = AideModels.getConfig();
        let result;
        if (cfg.provider === 'ollama') {
            result = await AideModels.checkOllamaConnection();
        } else {
            result = await AideModels.testRemoteConnection();
        }

        dom.testResult.textContent = result.ok ? '✓ Connected' : `✕ ${result.error || 'Failed'}`;
        dom.testResult.className = `test-result ${result.ok ? 'ok' : 'fail'}`;
    });

    window.addEventListener('QUOTA_EXCEEDED', (e) => {
        const source = e.detail?.source || 'unknown';
        if (source === 'scripts') {
            alert('Extension Storage Quota Exceeded!\n\nPlease delete some older scripts or move them to Local Folders to free up space.');
        } else if (source === 'debug') {
            console.warn('Debug log exceeded storage quota. Pruning automatically.');
        } else {
            alert('Extension Storage Quota Exceeded!\n\nPlease clear some data to ensure proper functionality.');
        }
    });

    // ──────────────── Step 8: Settings Import / Export ────────────────

    function buildSettingsExport() {
        const cfg = AideModels.getConfig();
        // Use the live in-memory object (already synced with localStorage)
        const customModels = Object.assign({}, savedCustomModels);

        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            provider: cfg.provider,
            model: cfg.model,
            ollamaHost: cfg.ollamaHost,
            customEndpoint: cfg.customEndpoint || '',
            temperature: cfg.temperature,
            customModels: customModels,          // per-provider lists of saved custom model names
            additionalFolders: AideScripts.getScriptFolders(),
            showHidden: showHiddenScripts
            // API keys are intentionally excluded
        };
    }

    function showImportExportStatus(msg, isError) {
        if (!dom.importExportStatus) return;
        dom.importExportStatus.textContent = msg;
        dom.importExportStatus.className = 'setting-hint import-export-hint' + (isError ? ' hint-error' : ' hint-ok');
        dom.importExportStatus.classList.remove('hidden');
        clearTimeout(dom.importExportStatus._t);
        dom.importExportStatus._t = setTimeout(() => {
            if (dom.importExportStatus) dom.importExportStatus.classList.add('hidden');
        }, 4000);
    }

    if (dom.exportSettingsBtn) {
        dom.exportSettingsBtn.addEventListener('click', () => {
            const data = buildSettingsExport();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'aide-settings-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showImportExportStatus('✓ Settings exported — API keys were not included.', false);
        });
    }

    if (dom.importSettingsBtn && dom.importSettingsFile) {
        dom.importSettingsBtn.addEventListener('click', () => dom.importSettingsFile.click());

        dom.importSettingsFile.addEventListener('change', () => {
            const file = dom.importSettingsFile.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    if (!data || typeof data !== 'object') throw new Error('Invalid JSON');

                    // Restore provider / model / temperature / endpoints
                    const cfgUpdate = {};
                    if (data.provider) cfgUpdate.provider = data.provider;
                    if (data.model)    cfgUpdate.model    = data.model;
                    if (typeof data.temperature === 'number') cfgUpdate.temperature = data.temperature;
                    if (data.ollamaHost)     cfgUpdate.ollamaHost     = data.ollamaHost;
                    if (data.customEndpoint) cfgUpdate.customEndpoint = data.customEndpoint;
                    AideModels.setConfig(cfgUpdate);

                    // Restore per-provider custom model lists
                    if (data.customModels && typeof data.customModels === 'object') {
                        try {
                            localStorage.setItem('aide_custom_models', JSON.stringify(data.customModels));
                            // Refresh the in-memory map used by app.js
                            Object.keys(savedCustomModels).forEach(k => delete savedCustomModels[k]);
                            Object.assign(savedCustomModels, data.customModels);
                        } catch (e) { /* quota – ignore */ }
                    }

                    // Restore script folders
                    if (Array.isArray(data.additionalFolders) && data.additionalFolders.length > 0) {
                        AideScripts.setScriptFolders(data.additionalFolders);
                        clearLocalScriptContentCache();
                    }

                    // Restore showHidden
                    if (typeof data.showHidden === 'boolean') {
                        showHiddenScripts = data.showHidden;
                        AideScripts.setShowHidden(showHiddenScripts);
                        syncShowHiddenBtn();
                    }

                    // Re-initialise the Settings panel to reflect restored values
                    initSettings();
                    showImportExportStatus('✓ Settings imported successfully.', false);

                    // If on local tab, refresh tree
                    if (scriptsSubTab === 'local') runScriptsToolbarRefresh();
                } catch (err) {
                    showImportExportStatus('✕ Import failed: ' + err.message, true);
                }
            };
            reader.readAsText(file);
            dom.importSettingsFile.value = ''; // reset so same file can be re-selected
        });
    }

    // ──────────────── Boot ────────────────
    initSettings();
    restoreChatDraft();
    renderChatMessages();
    checkConnection();
});
