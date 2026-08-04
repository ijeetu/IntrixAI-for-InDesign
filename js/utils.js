/**
 * Aide — utils.js
 * Post-processing, helpers, and shared utilities.
 */

const AideUtils = (() => {
    /**
     * Extract ONLY executable code from LLM responses.
     * LLMs often mix explanations with code despite the system prompt.
     * This aggressively strips everything that isn't code.
     */
    function stripCodeFences(raw) {
        if (!raw) return '';
        let text = raw.trim();

        // Strategy 1: If there's a code fence, extract ONLY the fenced content
        // 3.6: Extended regex to also handle language tag on separate line and no-newline before closing fence
        const fenceMatch = text.match(/```(?:javascript|jsx|js|extendscript)?\s*\n?([\s\S]*?)\n?```/i);
        if (fenceMatch) {
            // There might be multiple code blocks — extract all of them
            const allBlocks = [];
            const fenceRegex = /```(?:javascript|jsx|js|extendscript)?\s*\n?([\s\S]*?)\n?```/gi;
            let match;
            while ((match = fenceRegex.exec(text)) !== null) {
                const block = match[1].trim();
                if (block) allBlocks.push(block);
            }
            text = allBlocks.join('\n\n');
        } else {
            // Strategy 2: No fences — try to detect and remove preamble/postamble text
            // Remove common LLM preamble patterns
            text = text.replace(/^(?:Here(?:'s| is) (?:the |your |a )?(?:corrected |fixed |updated |revised |complete )?(?:code|script|ExtendScript)[^:\n]*[:\s]*\n?)/im, '');
            text = text.replace(/^(?:Sure[!,.]?\s*(?:Here(?:'s| is)[^:\n]*)?[:\s]*\n?)/im, '');
            text = text.replace(/^(?:I've (?:written|created|generated|fixed|updated|corrected)[^:\n]*[:\s]*\n?)/im, '');
            text = text.replace(/^(?:The following[^:\n]*[:\s]*\n?)/im, '');
            text = text.replace(/^(?:Try this[^:\n]*[:\s]*\n?)/im, '');
            text = text.replace(/^(?:Below is[^:\n]*[:\s]*\n?)/im, '');

            // Remove trailing explanations (lines that start with common explanation patterns)
            const lines = text.split('\n');
            let lastCodeLine = lines.length - 1;
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                // If line looks like explanation text (not code)
                if (line === '') continue;
                if (isExplanationLine(line)) {
                    lastCodeLine = i - 1;
                } else {
                    break;
                }
            }
            // Remove leading explanation lines
            let firstCodeLine = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === '') { firstCodeLine = i + 1; continue; }
                if (isExplanationLine(line)) {
                    firstCodeLine = i + 1;
                } else {
                    break;
                }
            }

            if (firstCodeLine > 0 || lastCodeLine < lines.length - 1) {
                text = lines.slice(firstCodeLine, lastCodeLine + 1).join('\n');
            }
        }

        return text.trim();
    }

    /**
     * Detect if a line is human-readable explanation rather than code.
     */
    function isExplanationLine(line) {
        // Empty or whitespace-only
        if (!line.trim()) return false;
        
        // Lines that are clearly code — skip them
        if (line.match(/^[\s]*(?:var|function|if|else|for|while|try|catch|return|switch|case|break|continue)\b/)) return false;
        if (line.match(/^[\s]*(?:app\.|doc\.|var |\/\/|\/\*|\*\/|\*\s|}|{|\(|\)|\[|\])/)) return false;
        if (line.match(/;[\s]*$/)) return false;  // Ends with semicolon
        if (line.match(/^[\s]*[a-zA-Z_$][\w$]*\s*[\(=\.\[]/)) return false; // assignment or function call
        if (line.match(/^[\s]*\}\s*(?:else|catch|finally)/)) return false;
        if (line.match(/^[\s]*\}/)) return false;

        // Lines that look like natural language
        if (line.match(/^(?:This |The |Note |Please |Make sure |Remember |I |You |Here |Let me |It |In |To |If you |When |Also |However |Additionally )/i)) return true;
        if (line.match(/^(?:Sure|Okay|Alright|Great|Done|Fixed|Updated|Corrected|Modified|Changed)[!,.:]/i)) return true;
        if (line.match(/^(?:\d+\.\s+\w)/)) return true; // Numbered list items
        if (line.match(/^[-•]\s+\w/)) return true; // Bullet points
        if (line.match(/^(?:Explanation|Changes made|What I changed|Key changes|Notes|Output|Result|Summary)[:\s]/i)) return true;

        return false;
    }

    /**
     * Basic brace-matching validation.
     * Returns null if OK, or a string describing the issue.
     */
    function validateSyntax(code) {
        if (!code || !code.trim()) return 'Empty code';
        let braces = 0, parens = 0, brackets = 0;
        const lines = code.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const clean = line.replace(/"[^"]*"|'[^']*'/g, '');
            for (const ch of clean) {
                if (ch === '{') braces++;
                else if (ch === '}') braces--;
                else if (ch === '(') parens++;
                else if (ch === ')') parens--;
                else if (ch === '[') brackets++;
                else if (ch === ']') brackets--;
            }
        }
        if (braces !== 0) return `Unmatched braces (${braces > 0 ? 'missing }' : 'extra }'})`;
        if (parens !== 0) return `Unmatched parentheses (${parens > 0 ? 'missing )' : 'extra )'})`;
        if (brackets !== 0) return `Unmatched brackets (${brackets > 0 ? 'missing ]' : 'extra ]'})`;
        return null;
    }

    /**
     * Format a Date as a short human-readable string.
     */
    function formatDate(date) {
        const d = date instanceof Date ? date : new Date(date);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    /**
     * Generate a short unique id.
     */
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /**
     * Escape HTML for safe rendering.
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Generate HTML for line-number sidebar.
     */
    function generateLineNumbersHtml(code) {
        const lines = (code || '').split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += `<span class="line-num" data-line="${i}"></span>\n`;
        }
        return html;
    }

    /**
     * Decode PDF string literal or hex string.
     */
    function decodePdfString(str) {
        if (!str) return '';
        str = str.trim();
        // Hex string: <48656C6C6F>
        if (str.startsWith('<') && str.endsWith('>')) {
            const hex = str.slice(1, -1).replace(/\s+/g, '');
            let decoded = '';
            if (hex.length >= 4 && (hex.startsWith('FEFF') || hex.startsWith('feff'))) {
                for (let i = 4; i < hex.length; i += 4) {
                    const code = parseInt(hex.substring(i, i + 4), 16);
                    if (!isNaN(code)) decoded += String.fromCharCode(code);
                }
                return decoded;
            }
            for (let i = 0; i < hex.length; i += 2) {
                const code = parseInt(hex.substring(i, i + 2), 16);
                if (!isNaN(code)) decoded += String.fromCharCode(code);
            }
            return decoded;
        }
        // Literal string: (text)
        if (str.startsWith('(') && str.endsWith(')')) {
            str = str.slice(1, -1);
        }
        // UTF-16 BE with BOM (\xFE\xFF)
        if (str.startsWith('\xFE\xFF') || (str.charCodeAt(0) === 254 && str.charCodeAt(1) === 255)) {
            let decoded = '';
            const body = str.slice(2);
            for (let i = 0; i < body.length; i += 2) {
                const c1 = body.charCodeAt(i);
                const c2 = body.charCodeAt(i + 1) || 0;
                decoded += String.fromCharCode((c1 << 8) | c2);
            }
            return decoded;
        }
        // Unescape PDF escapes
        return str
            .replace(/\\r\\n/g, '\n')
            .replace(/\\r/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\b/g, '\b')
            .replace(/\\f/g, '\f')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\')
            .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
    }

    /**
     * Parse PDF ArrayBuffer to extract comments, annotations, and text content.
     */
    function parsePdfCommentsAndText(buffer, fileName) {
        const bytes = new Uint8Array(buffer);
        let latin1 = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            latin1 += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }

        const comments = [];
        const objBlocks = latin1.match(/\d+\s+\d+\s+obj[\s\S]*?endobj/g) || [];
        let count = 0;

        for (let i = 0; i < objBlocks.length; i++) {
            const block = objBlocks[i];
            if (block.indexOf('/Subtype') === -1) continue;

            const subtypeMatch = block.match(/\/Subtype\s*\/([A-Za-z0-9]+)/);
            if (!subtypeMatch) continue;

            const subtype = subtypeMatch[1];
            const isAnnotSubtype = ['Text', 'Highlight', 'FreeText', 'StrikeOut', 'Underline', 'Squiggly', 'PopUp', 'Square', 'Circle', 'Line', 'Ink', 'Stamp', 'Caret', 'FileAttachment', 'Polygon', 'PolyLine'].indexOf(subtype) !== -1;
            if (!isAnnotSubtype) continue;

            // Contents / Note
            let contents = '';
            const contentsMatch = block.match(/\/Contents\s*(\([^\)]*\)|<[^>]*>)/);
            if (contentsMatch) {
                contents = decodePdfString(contentsMatch[1]);
            }

            // Rich Text (/RC)
            const rcMatch = block.match(/\/RC\s*(\([^\)]*\)|<[^>]*>)/);
            let richText = '';
            if (rcMatch) {
                const rawRc = decodePdfString(rcMatch[1]);
                richText = rawRc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }

            const finalCommentText = contents || richText;

            // Author (/T)
            let author = '';
            const authorMatch = block.match(/\/T\s*(\([^\)]*\)|<[^>]*>)/);
            if (authorMatch) {
                author = decodePdfString(authorMatch[1]);
            }

            // Rect
            let rect = '';
            const rectMatch = block.match(/\/Rect\s*\[\s*([\d\.\s-]+)\s*\]/);
            if (rectMatch) {
                rect = rectMatch[1].trim().replace(/\s+/g, ', ');
            }

            // Page
            let pageNum = '';
            const pageMatch = block.match(/\/Page\s*(\d+)/);
            if (pageMatch) {
                pageNum = pageMatch[1];
            }

            // Color
            let color = '';
            const colorMatch = block.match(/\/C\s*\[\s*([\d\.\s]+)\s*\]/);
            if (colorMatch) {
                color = colorMatch[1].trim();
            }

            if (finalCommentText || subtype === 'Highlight' || subtype === 'StrikeOut' || subtype === 'Underline' || subtype === 'FreeText') {
                count++;
                comments.push({
                    index: count,
                    subtype: subtype,
                    author: author || 'Reviewer',
                    comment: finalCommentText || `[${subtype} markup without explicit text note]`,
                    rect: rect,
                    page: pageNum ? `Page ${pageNum}` : 'Page N/A',
                    color: color
                });
            }
        }

        // Visible page text extraction
        const pageTextChunks = [];
        const textStreamRegex = /BT([\s\S]*?)ET/g;
        let textMatch;
        while ((textMatch = textStreamRegex.exec(latin1)) !== null) {
            const streamBlock = textMatch[1];
            const tjRegex = /\(([^\)]*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g;
            let tjMatch;
            let lineText = '';
            while ((tjMatch = tjRegex.exec(streamBlock)) !== null) {
                if (tjMatch[1]) {
                    lineText += decodePdfString('(' + tjMatch[1] + ')');
                } else if (tjMatch[2]) {
                    const innerTj = tjMatch[2];
                    const innerStrRegex = /\(([^\)]*)\)/g;
                    let innerMatch;
                    while ((innerMatch = innerStrRegex.exec(innerTj)) !== null) {
                        lineText += decodePdfString('(' + innerMatch[1] + ')');
                    }
                }
            }
            if (lineText.trim()) {
                pageTextChunks.push(lineText.trim());
            }
        }

        let summary = `PDF File: ${fileName}\n`;
        summary += `Total PDF Comments / Annotations Found: ${comments.length}\n\n`;

        if (comments.length > 0) {
            summary += `═══ DECODED PDF COMMENTS & INSTRUCTIONS ═══\n`;
            comments.forEach((c) => {
                summary += `Comment #${c.index}:\n`;
                summary += `  - Type: ${c.subtype}\n`;
                summary += `  - Author: ${c.author}\n`;
                summary += `  - Location: ${c.page} (Coordinates: [${c.rect}])\n`;
                summary += `  - Instruction / Comment: "${c.comment}"\n\n`;
            });
        } else {
            summary += `No explicit annotation comments found in PDF objects (or scanned image PDF).\n\n`;
        }

        if (pageTextChunks.length > 0) {
            summary += `═══ EXTRACTED PDF TEXT PREVIEW ═══\n`;
            summary += pageTextChunks.slice(0, 100).join('\n') + `\n`;
        }

        return summary;
    }

    /**
     * Read a text or PDF file and return its decoded contents.
     * Supports: .csv, .txt, .tsv, .json, .pdf
     * @param {File} file
     * @returns {Promise<{name: string, type: string, path: string, content: string}>}
     */
    function readTextFile(file) {
        return new Promise((resolve, reject) => {
            const ext = file.name.split('.').pop().toLowerCase();
            const filePath = file.path || '';

            if (ext === 'pdf') {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const content = parsePdfCommentsAndText(reader.result, file.name);
                        resolve({
                            name: file.name,
                            type: 'pdf',
                            path: filePath,
                            content: content
                        });
                    } catch (err) {
                        reject(new Error('Failed to parse PDF file: ' + err.message));
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read PDF file: ' + file.name));
                reader.readAsArrayBuffer(file);
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                resolve({
                    name: file.name,
                    type: ext,
                    path: filePath,
                    content: reader.result
                });
            };
            reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
            reader.readAsText(file);
        });
    }

    return { stripCodeFences, validateSyntax, formatDate, uid, escapeHtml, generateLineNumbersHtml, readTextFile, parsePdfCommentsAndText };
})();
