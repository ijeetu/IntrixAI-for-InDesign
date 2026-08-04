/**
 * Aide — chat.js
 * Conversation engine with full message history.
 * Uses /api/chat for Ollama, standard chat completions for remote.
 *
 * System prompt tiers live in system-prompt.js (AideChatModules).
 * Three self-contained tiers: Safe (tier_1), Standard (tier_2), Expert (tier_3).
 * No runtime assembly — each tier is a complete string.
 */

const AideChat = (() => {

    /**
     * Resolve the system prompt from the active tier.
     * Reads localStorage key 'aide_prompt_tier' (default: 'tier_2').
     */
    function _resolveBasePrompt() {
        var tier;
        try { tier = localStorage.getItem('aide_prompt_tier'); } catch(e) {}
        switch (tier) {
            case 'tier_1': return AideChatModules.PROMPT_TIER_1;
            case 'tier_3': return AideChatModules.PROMPT_TIER_3;
            default:       return AideChatModules.PROMPT_TIER_2;
        }
    }

    // Message history for current conversation
    let messages = [];
    let isGenerating = false;
    let _abortController = null; // active AbortController during generation

    /**
     * Start a fresh conversation
     */
    function newConversation() {
        messages = [];
        isGenerating = false;
    }

    /**
     * Get message history (without system prompt for display)
     */
    function getMessages() {
        return messages.filter(m => m.role !== 'system');
    }

    /**
     * Get conversation length (for context window management)
     */
    function getConversationLength() {
        return messages.reduce((total, m) => total + m.content.length, 0);
    }

    /**
     * Send a user message and get assistant response.
     * Manages context window by trimming old messages if conversation grows too long.
     * @param {string}   userText
     * @param {function} onUpdate - callback({ type: 'start'|'done'|'error'|'aborted', text?: string })
     */
    async function send(userText, onUpdate) {
        if (isGenerating) return;
        if (!userText.trim()) return;

        isGenerating = true;
        _abortController = new AbortController();
        messages.push({ role: 'user', content: userText });
        onUpdate({ type: 'start' });

        try {
            // Context window management: if conversation is very long,
            // trim older messages but always keep system prompt + last 6 exchanges
            const messagesToSend = getContextManagedMessages();

            const responseText = await AideModels.sendChat(messagesToSend, _abortController.signal);

            // Post-process: strip code fences and explanation text
            const cleanCode = AideUtils.stripCodeFences(responseText);

            AideModels.log('ai_response', { raw: responseText.substring(0, 500), clean: cleanCode.substring(0, 500) });

            messages.push({ role: 'assistant', content: cleanCode });
            onUpdate({ type: 'done', text: cleanCode });
        } catch (error) {
            // AbortError means the user stopped generation — treat as a clean cancel, not an error
            if (error.name === 'AbortError') {
                messages.pop(); // Remove the user message we already pushed
                onUpdate({ type: 'aborted' });
            } else {
                AideModels.log('error', { type: 'send_failed', message: error.message });
                messages.pop();
                onUpdate({ type: 'error', text: error.message });
            }
        } finally {
            isGenerating = false;
            _abortController = null;
        }
    }

    /**
     * Abort the current in-flight generation (no-op if idle).
     */
    function abort() {
        if (_abortController) {
            _abortController.abort();
        }
    }

    /**
     * Build the messages array for the API call.
     * v3.1: System prompt is self-contained per tier — no runtime assembly.
     * Context window management trims old messages when conversation grows too long.
     */
    function getContextManagedMessages() {
        return messages;
    }

    /**
     * Prefer fenced ``` code from assistant messages; otherwise use full content.
     */
    function extractCodeFromAssistantContent(content) {
        if (!content) return '';
        const fence = content.match(/```(?:javascript|js|jsx)?\s*([\s\S]*?)```/i);
        if (fence) return fence[1].trim();
        return content.trim();
    }

    /**
     * Trim a script to context-aware size for error-fix prompts.
     * If error message contains a line number, include ±CONTEXT_LINES around it.
     * Otherwise cap at MAX_ERROR_CODE_CHARS to avoid context bloat.
     */
    var CONTEXT_LINES = 20;
    var MAX_ERROR_CODE_CHARS = 15000;

    function trimCodeForErrorFix(code, errorMsg) {
        if (!code) return '';
        // Try to extract line number from error message
        // Patterns: "line 36", "at line 36", "Line 36", "line:36"
        var lineMatch = errorMsg.match(/line[:\s]*(\d+)/i);
        if (lineMatch) {
            var errorLine = parseInt(lineMatch[1], 10);
            if (!isNaN(errorLine) && errorLine > 0) {
                var lines = code.split('\n');
                var startLine = Math.max(0, errorLine - CONTEXT_LINES - 1);
                var endLine = Math.min(lines.length, errorLine + CONTEXT_LINES);
                var snippet = lines.slice(startLine, endLine).join('\n');
                var prefix = startLine > 0 ? '/* ... ' + startLine + ' lines omitted ... */\n' : '';
                var suffix = endLine < lines.length ? '\n/* ... ' + (lines.length - endLine) + ' lines omitted ... */' : '';
                return prefix + snippet + suffix;
            }
        }
        // No line number found — cap by character count
        if (code.length > MAX_ERROR_CODE_CHARS) {
            return code.substring(0, MAX_ERROR_CODE_CHARS) + '\n/* ... truncated ... */';
        }
        return code;
    }

    /**
     * Add an error-feedback turn: tells the LLM the previous script failed.
     * @param {string} [failedCodeOverride] when set (e.g. Scripts launcher), use instead of last assistant message
     */
    async function sendErrorFeedback(errorMsg, onUpdate, failedCodeOverride) {
        AideModels.log('auto_fix', { error: errorMsg });

        let lastCode = (failedCodeOverride != null && String(failedCodeOverride).trim())
            ? String(failedCodeOverride).trim()
            : '';

        if (!lastCode) {
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant') {
                    lastCode = extractCodeFromAssistantContent(messages[i].content);
                    break;
                }
            }
        }

        // Context-aware trimming to avoid context bloat
        var trimmedCode = trimCodeForErrorFix(lastCode, errorMsg);

        const feedbackPrompt = `The previous script produced this error when executed in InDesign:

ERROR: ${errorMsg}

THE FAILING SCRIPT WAS:
${trimmedCode}

Fix all issues. Return the COMPLETE corrected script. Remember: use only ECMAScript 3 syntax (var, no arrow functions, no let/const, no template literals, no for...of, no .includes(), no .map(), no .filter()).`;

        return send(feedbackPrompt, onUpdate);
    }

    /**
     * Log a script execution result (called from app.js after evalScript).
     * This captures InDesign-side errors that the chat engine doesn't see.
     */
    function logExecution(code, result, isError) {
        AideModels.log('execution', {
            codePreview: code.substring(0, 200),
            result: result,
            success: !isError
        });
    }

    function getIsGenerating() {
        return isGenerating;
    }

    // Initialize with system prompt
    newConversation();

    return {
        newConversation, getMessages, send, abort, sendErrorFeedback, logExecution, getIsGenerating, getConversationLength,
        extractCodeFromAssistantContent
    };
})();
