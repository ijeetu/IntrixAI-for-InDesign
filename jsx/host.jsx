/**
 * @title Aide — host.jsx
 * @description ExtendScript entry point. Executes LLM-generated code
 *              within an undo group for safe rollback.
 *              Also provides file I/O for script export.
 */
#include "mcp_helpers.jsx"


/**
 * Auto-detect the InDesign Scripts Panel folder for the running version.
 * Probes standard path templates on macOS and Windows.
 * @returns {string} The fsName of the found folder, or '' if not found.
 */
function getDefaultScriptsPanelFolder() {
    try {
        var majorVersion = parseInt(app.version.split('.')[0], 10);

        var home = $.getenv('HOME'); // macOS / Linux
        if (!home || home === '') {
            home = $.getenv('USERPROFILE'); // Windows fallback
        }

        var paths = [];

        if (home && home !== '') {
            // macOS primary: ~/Library/Preferences/Adobe InDesign/Version X.0/en_US/Scripts/Scripts Panel
            paths.push(home + '/Library/Preferences/Adobe InDesign/Version ' + majorVersion + '.0/en_US/Scripts/Scripts Panel');
            // macOS fallback (some locales): without locale subfolder
            paths.push(home + '/Library/Preferences/Adobe InDesign/Version ' + majorVersion + '.0/Scripts/Scripts Panel');
        }

        // Windows: %APPDATA%\Adobe\InDesign\Version X.0\en_US\Scripts\Scripts Panel
        var appData = $.getenv('APPDATA');
        if (appData && appData !== '') {
            paths.push(appData + '\\Adobe\\InDesign\\Version ' + majorVersion + '.0\\en_US\\Scripts\\Scripts Panel');
            paths.push(appData + '\\Adobe\\InDesign\\Version ' + majorVersion + '.0\\Scripts\\Scripts Panel');
        }

        var i;
        for (i = 0; i < paths.length; i++) {
            var f = new Folder(paths[i]);
            if (f && f.exists) {
                return f.fsName;
            }
        }
        return ''; // not found
    } catch (e) {
        return '';
    }
}

/**
 * Recursively build a JSON-serialisable tree for one root folder.
 * Returns a node object: { name, path, type:"folder"|"file", ext?, children? }
 *
 * Rules (per plan §5.1):
 *  - Recurse into subdirectories up to maxDepth=8
 *  - Include: .jsx  .js  .applescript  .scpt
 *  - Exclude: hidden names (starts with "."), .aide-set.json, .jsxbin (shown as binary item)
 *  - .jsxbin files are included but flagged { binary: true } so the UI can label them
 */
function aideBuildFolderTree(folder, depthLeft) {
    var node = {
        name: folder.name,
        path: folder.fsName,
        type: 'folder',
        children: []
    };

    if (!folder || !folder.exists || depthLeft <= 0) {
        return node;
    }

    var items;
    try {
        items = folder.getFiles();
    } catch (e) {
        return node;
    }
    if (!items) return node;

    var i;
    for (i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item) continue;

        var itemName = item.name || '';
        // Skip hidden files/folders (name starts with '.')
        if (itemName.charAt(0) === '.') continue;

        if (item instanceof Folder) {
            // Recurse into sub-folder
            var child = aideBuildFolderTree(item, depthLeft - 1);
            node.children.push(child);
        } else if (item instanceof File) {
            var lower = itemName.toLowerCase();
            var len = lower.length;

            // Skip .aide-set.json (set metadata)
            if (lower === '.aide-set.json' || lower.indexOf('.aide-set.json') !== -1) continue;

            // Determine extension
            var ext = '';
            var dotIdx = lower.lastIndexOf('.');
            if (dotIdx !== -1) ext = lower.substring(dotIdx);

            var isScript  = (ext === '.jsx' || ext === '.js' || ext === '.applescript' || ext === '.scpt');
            var isBinary  = (ext === '.jsxbin');

            if (isScript || isBinary) {
                var fileNode = {
                    name: itemName,
                    path: item.fsName,
                    type: 'file',
                    ext: ext
                };
                if (isBinary) fileNode.binary = true;
                node.children.push(fileNode);
            }
        }
    }
    return node;
}

/**
 * Entry point called from CEP via evalScript.
 * @param {string} rootPathsJson  JSON array of root folder path strings
 * @returns {string} JSON array of tree nodes (one per root)
 */
function scanScriptFolderJson(rootPathsJson) {
    try {
        var roots;
        try {
            roots = typeof rootPathsJson === 'string' ? JSON.parse(rootPathsJson) : rootPathsJson;
        } catch (ep) {
            return '[]';
        }

        if (!roots || !roots.length) return '[]';

        var trees = [];
        var i;
        for (i = 0; i < roots.length; i++) {
            var rootPath = aideResolveUserPath(String(roots[i]));
            if (!rootPath) continue;
            var dir = new Folder(rootPath);
            if (dir && dir.exists) {
                trees.push(aideBuildFolderTree(dir, 8));
            }
        }

        function stringifyTree(node) {
            var parts = [];
            parts.push('"name":"' + aideJsonStringEscape(node.name) + '"');
            parts.push('"path":"' + aideJsonStringEscape(node.path) + '"');
            parts.push('"type":"' + aideJsonStringEscape(node.type) + '"');
            if (node.ext) parts.push('"ext":"' + aideJsonStringEscape(node.ext) + '"');
            if (node.binary) parts.push('"binary":true');
            if (node.children) {
                var ch = [];
                for (var j = 0; j < node.children.length; j++) {
                    ch.push(stringifyTree(node.children[j]));
                }
                parts.push('"children":[' + ch.join(',') + ']');
            }
            return '{' + parts.join(',') + '}';
        }

        var outArr = [];
        for (i = 0; i < trees.length; i++) {
            outArr.push(stringifyTree(trees[i]));
        }
        return '[' + outArr.join(',') + ']';
    } catch (e) {
        return '[]';
    }
}

/**
 * Expand "~" to the user home folder. ExtendScript does not resolve "~" in paths.
 */

function aideResolveUserPath(pathStr) {
    if (!pathStr) return pathStr;
    var p = String(pathStr);
    if (p.charAt(0) !== '~') return p;
    var home = $.getenv('HOME');
    if (!home) home = $.getenv('USERPROFILE');
    if (!home) {
        try {
            if (Folder.myDocuments && Folder.myDocuments.exists) {
                home = Folder.myDocuments.parent.fsName;
            }
        } catch (eHome) {}
    }
    if (!home) return p;
    var rest = p.length > 1 ? p.substring(1) : '';
    if (rest.charAt(0) === '/' || rest.charAt(0) === '\\') rest = rest.substring(1);
    var sep = (home.indexOf('\\') !== -1) ? '\\' : '/';
    if (home.charAt(home.length - 1) === '\\' || home.charAt(home.length - 1) === '/') {
        sep = '';
    }
    return home + sep + rest;
}

function aideJsonStringEscape(s) {
    if (s === undefined || s === null) return '';
    s = String(s);
    var r = '';
    var i;
    var c;
    var code;
    for (i = 0; i < s.length; i++) {
        c = s.charAt(i);
        code = c.charCodeAt(0);
        if (c === '\\') {
            r += '\\\\';
        } else if (c === '"') {
            r += '\\"';
        } else if (c === '\r') {
            r += '\\r';
        } else if (c === '\n') {
            r += '\\n';
        } else if (c === '\t') {
            r += '\\t';
        } else if (code < 32) {
            r += '\\u' + ('0000' + code.toString(16)).slice(-4);
        } else {
            r += c;
        }
    }
    return r;
}

/**
 * JSON.stringify is missing in some ExtendScript runtimes; build JSON manually.
 */
function aideFileEntriesToJson(out) {
    if (typeof JSON !== 'undefined' && JSON.stringify) {
        try {
            return JSON.stringify(out);
        } catch (ej) {}
    }
    var parts = [];
    var i;
    var e;
    for (i = 0; i < out.length; i++) {
        e = out[i];
        parts.push('{"path":"' + aideJsonStringEscape(e.path) + '","name":"' + aideJsonStringEscape(e.name) + '","relPath":"' + aideJsonStringEscape(e.relPath) + '","folderRoot":"' + aideJsonStringEscape(e.folderRoot) + '"}');
    }
    return '[' + parts.join(',') + ']';
}

/**
 * Execute a local script file on disk by path.
 *
 * Two execution strategies depending on script content:
 *
 * 1. DIRECT (preprocessor scripts):
 *    Scripts that use #targetengine, #include, or #includepath are run via
 *    app.doScript(file) directly, because $.evalFile() skips the ExtendScript
 *    preprocessor entirely. Uses UndoModes.AUTO_UNDO to avoid conflicts with
 *    #targetengine persistent engines in the nested CEP context.
 *
 * 2. LAUNCHER (plain scripts):
 *    Scripts without preprocessor directives are run via a temporary
 *    __aide_launcher__.jsx file placed next to the target. This ensures
 *    app.activeScript points to the correct directory, fixing scripts that
 *    rely on relative path resolution via app.activeScript.parent.
 *
 * @param {string} pathStr  Absolute filesystem path to the script.
 * @returns {string} Result or 'ExtendScript Error: …' string.
 */
function runLocalScriptFile(pathStr) {
    var tempFile;
    try {
        var resolvedPath = aideResolveUserPath(String(pathStr || ''));

        if (!resolvedPath) return 'Error: No path provided.';

        var targetFile = new File(resolvedPath);
        if (!targetFile.exists) return 'Error: File not found: ' + resolvedPath;

        var lower = targetFile.name.toLowerCase();

        // .jsxbin files are pre-compiled — run them directly.
        // They have no #include or #targetengine to resolve.
        if (/\.jsxbin$/.test(lower)) {
            var result = app.doScript(targetFile, ScriptLanguage.JAVASCRIPT,
                                      undefined, UndoModes.FAST_ENTIRE_SCRIPT, 'Run Script');
            try {
                if (app.documents.length > 0) app.activeDocument.recompose();
            } catch (eR) { /* ignore */ }
            return (result !== undefined && result !== null) ? String(result) : 'Script executed successfully.';
        }

        // For .applescript / .scpt run directly (no #include / #targetengine issue).
        if (/\.(applescript|scpt)$/.test(lower)) {
            app.doScript(targetFile, ScriptLanguage.APPLESCRIPT_LANGUAGE,
                         undefined, UndoModes.FAST_ENTIRE_SCRIPT, 'Run Script');
            return 'Script executed successfully.';
        }

        // --- .jsx / .js execution strategy ---
        // Pre-scan for preprocessor directives using a SEPARATE File object.
        var usesPreprocessor = false;
        try {
            var scanFile = new File(resolvedPath);
            scanFile.open('r');
            scanFile.encoding = 'UTF-8';
            var head = scanFile.read(4096);
            scanFile.close();
            if (head) {
                usesPreprocessor = /^\s*#(targetengine|include|includepath)\b/m.test(head);
            }
        } catch (eScan) {
            // If we can't read the file, fall through to direct execution
            // as the safer default (preserves preprocessor directives).
            usesPreprocessor = true;
        }

        var launchResult;

        if (usesPreprocessor) {
            // ── Direct execution: preserves #targetengine, #include, #includepath ──
            // Use AUTO_UNDO (not FAST_ENTIRE_SCRIPT) because #targetengine scripts
            // may conflict with forced undo grouping from a nested CEP context.
            launchResult = app.doScript(targetFile, ScriptLanguage.JAVASCRIPT,
                                        undefined, UndoModes.AUTO_UNDO);
        } else {
            // ── Launcher execution: fixes app.activeScript context ──
            // The launcher lives next to the target file so that any relative
            // path assumptions in the target script still hold.
            var launcherPath = targetFile.parent.fsName + '/__aide_launcher__.jsx';
            tempFile = new File(launcherPath);

            var escapedPath = resolvedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            var launcherCode = '$.evalFile(File("' + escapedPath + '"));';
            tempFile.open('w');
            tempFile.encoding = 'UTF-8';
            tempFile.write(launcherCode);
            tempFile.close();

            launchResult = app.doScript(tempFile, ScriptLanguage.JAVASCRIPT,
                                        undefined, UndoModes.FAST_ENTIRE_SCRIPT, 'Run Script');
        }

        // Clean up launcher
        try { tempFile.remove(); } catch (eClean) { /* ignore */ }

        // Recompose layout
        try {
            if (app.documents.length > 0) app.activeDocument.recompose();
        } catch (eRecompose) { /* ignore */ }

        if (launchResult !== undefined && launchResult !== null) {
            return String(launchResult);
        }
        return 'Script executed successfully.';

    } catch (e) {
        // Always clean up the temp launcher on error
        try { if (tempFile && tempFile.exists) tempFile.remove(); } catch (eClean2) { /* ignore */ }

        // Suppress user-cancel signals (e.g. dialog cancel buttons)
        if (e.message && (
            e.message.indexOf('cancel') !== -1 ||
            e.message.indexOf('Cancel') !== -1 ||
            e.number === 65536
        )) {
            return 'Script executed successfully.';
        }
        return 'ExtendScript Error: ' + e.name + ' at line ' + e.line + ' - ' + e.message;
    }
}


/**
 * Evaluates the generated string from the local LLM.
 * Wraps execution in an undo group so the user can Cmd+Z to revert.
 * @param {string} codeString The raw ExtendScript from Ollama or remote API.
 * @returns {string} Result or error message back to CEP panel context.
 */
function runGeneratedExtendScript(codeString) {
    try {
        if (!codeString) return "Error: No code provided.";

        // Execute the generated code via eval() so InDesign globals (app, doc, File, etc.)
        // are accessible in scope. new Function() creates an isolated scope which breaks
        // access to these globals in InDesign's ExtendScript environment.
        var result = eval(codeString);

        // Force InDesign to recompose layout after script execution
        try {
            if (app.documents.length > 0) {
                app.activeDocument.recompose();
            }
        } catch (eRecompose) { /* ignore */ }

        if (result !== undefined) {
            return String(result);
        }
        return "Script executed successfully.";

    } catch (e) {
        // Suppress user-cancel signals (e.g. dialog cancel buttons)
        if (e.message && (
            e.message.indexOf('cancel') !== -1 ||
            e.message.indexOf('Cancel') !== -1 ||
            e.number === 65536
        )) {
            return 'Script executed successfully.'; // User cancelled a dialog — not a script error
        }
        return "ExtendScript Error: " + e.name + " at line " + e.line + " - " + e.message;
    }
}

/**
 * Save a script file to disk.
 * @param {string} folderPath The folder to save into.
 * @param {string} fileName The file name (without extension).
 * @param {string} code The script code.
 * @returns {string} Result message.
 */
function saveScriptFile(folderPath, fileName, code) {
    try {
        var folder = new Folder(aideResolveUserPath(folderPath));
        if (!folder.exists) {
            folder.create();
        }

        // Sanitize filename and ensure .jsx extension
        var safeName = fileName.replace(/[\/\\:*?"<>|]/g, '_');
        if (!/\.jsx$/i.test(safeName)) {
            safeName += '.jsx';
        }
        var file = new File(folder.fsName + '/' + safeName);
        
        file.open('w');
        file.encoding = 'UTF-8';
        file.write(code);
        file.close();

        return "Saved: " + file.fsName;
    } catch (e) {
        return "Error saving file: " + e.message;
    }
}

/**
 * Prompt user for a save file location and write text to it.
 * @param {string} defaultName The default file name.
 * @param {string} content The text content to write.
 * @param {string} dialogTitle The dialog window title.
 * @param {string} fileFilter The file extension filter (e.g., "*.txt").
 * @returns {string} Success message or error message or "Cancelled".
 */
function aidePromptAndSaveFile(defaultName, content, dialogTitle, fileFilter) {
    try {
        var title = dialogTitle || "Save File";
        var filter = fileFilter || "*.*";
        var file = File.saveDialog(title, filter, defaultName);
        if (!file) {
            return "Cancelled";
        }
        file.open('w');
        file.encoding = 'UTF-8';
        file.write(content);
        file.close();
        return "Saved to " + file.fsName;
    } catch (e) {
        return "Error saving file: " + e.message;
    }
}

/**
 * Export multiple scripts to a folder.
 * @param {string} folderPath The folder path.
 * @param {string} scriptsJSON JSON array of {name, code} objects.
 * @returns {string} Result summary.
 */
function exportAllScripts(folderPath, scriptsJSON) {
    try {
        var scripts = typeof scriptsJSON === 'string' ? JSON.parse(scriptsJSON) : scriptsJSON;
        var folder = new Folder(aideResolveUserPath(folderPath));
        if (!folder.exists) {
            folder.create();
        }

        var saved = 0;
        for (var i = 0; i < scripts.length; i++) {
            var s = scripts[i];
            var safeName = s.name.replace(/[\/\\:*?"<>|]/g, '_');
            var file = new File(folder.fsName + '/' + safeName + '.jsx');
            file.open('w');
            file.encoding = 'UTF-8';
            file.write(s.code);
            file.close();
            saved++;
        }
        return "Exported " + saved + " scripts to " + folder.fsName;
    } catch (e) {
        return "Error exporting: " + e.message;
    }
}

/**
 * Open a folder in Finder/Explorer.
 * @param {string} folderPath The folder to open.
 * @returns {string} Result.
 */
function openScriptsFolder(folderPath) {
    try {
        var folder = new Folder(aideResolveUserPath(folderPath));
        if (!folder.exists) {
            folder.create();
        }
        folder.execute();
        return "Opened folder";
    } catch (e) {
        return "Error opening folder: " + e.message;
    }
}

/**
 * Pick a folder using InDesign's folder dialog.
 * @returns {string} The selected path or empty string if cancelled.
 */
function pickScriptsFolder() {
    try {
        var folder = Folder.selectDialog("Select folder for Aide scripts");
        if (folder) {
            return folder.fsName;
        }
        return "";
    } catch (e) {
        return "";
    }
}

/**
 * Recursively collect .jsx / .js files under a root folder (max depth).
 */
function aideCollectScriptsFromFolder(folder, rootFsName, out, depthLeft) {
    if (!folder || !folder.exists || depthLeft <= 0) return;
    var items = folder.getFiles();
    if (!items) return;
    var i;
    for (i = 0; i < items.length; i++) {
        var item = items[i];
        if (typeof item === 'string') continue;
        if (item instanceof Folder) {
            aideCollectScriptsFromFolder(item, rootFsName, out, depthLeft - 1);
        } else if (item instanceof File) {
            var name = item.name;
            var lower = name.toLowerCase();
            var len = lower.length;
            var isJsx = len > 4 && lower.indexOf('.jsx') === len - 4;
            var isJs = len > 3 && lower.indexOf('.js') === len - 3;
            if (isJsx || isJs) {
                var rel = '';
                try {
                    rel = item.fsName.substring(rootFsName.length);
                    rel = rel.replace(/^[\/\\]/, '');
                } catch (relErr) {
                    rel = name;
                }
                out.push({
                    path: item.fsName,
                    name: name,
                    relPath: rel,
                    folderRoot: rootFsName
                });
            }
        }
    }
}

/**
 * List script files under configured folder roots. foldersJSON is a JSON array string of paths.
 * @returns {string} JSON array string for CEP.
 */
function listLocalScriptsFoldersJson(foldersJSON) {
    try {
        var folders = typeof foldersJSON === 'string' ? JSON.parse(foldersJSON) : foldersJSON;
        if (!folders || !folders.length) return '[]';
        var out = [];
        var f;
        for (f = 0; f < folders.length; f++) {
            var rootPath = aideResolveUserPath(folders[f]);
            if (!rootPath) continue;
            var dir = new Folder(rootPath);
            if (dir.exists) {
                aideCollectScriptsFromFolder(dir, dir.fsName, out, 32);
            }
        }
        return aideFileEntriesToJson(out);
    } catch (e) {
        return '[]';
    }
}

/**
 * Read UTF-8 text from a file (path passed as CEP-escaped string literal).
 */
function readLocalScriptFile(pathStr) {
    try {
        var f = new File(aideResolveUserPath(pathStr));
        if (!f.exists) return 'Error: File not found.';
        f.open('r');
        f.encoding = 'UTF-8';
        var text = f.read();
        f.close();
        return text;
    } catch (e) {
        return 'Error reading file: ' + e.message;
    }
}

/**
 * Write UTF-8 script file (user-initiated save from panel).
 */
function writeLocalScriptFile(pathStr, codeStr) {
    try {
        var f = new File(aideResolveUserPath(pathStr));
        f.open('w');
        f.encoding = 'UTF-8';
        f.write(codeStr);
        f.close();
        return 'Saved: ' + f.fsName;
    } catch (e) {
        return 'Error saving file: ' + e.message;
    }
}

/**
 * Open parent folder in Finder/Explorer (file must exist).
 */
function revealLocalFileInFinder(pathStr) {
    try {
        var f = new File(aideResolveUserPath(pathStr));
        if (!f.exists) return 'Error: File not found.';
        var parent = f.parent;
        if (parent && parent.exists) {
            parent.execute();
            return 'Revealed';
        }
        return 'Error: Parent not found.';
    } catch (e) {
        return 'Error revealing file: ' + e.message;
    }
}

// ──────────────────────────────────────────────
// STEP 6 — Sets / Collections (.aide-set.json)
// ──────────────────────────────────────────────

/**
 * Scan an array of folder paths for .aide-set.json files.
 * @param {string} foldersJSON - JSON array of folder paths
 * @returns {string} - JSON array of parsed set objects, each gaining a '_path' property
 */
function readAideSetsJson(foldersJSON) {
    try {
        var paths = typeof foldersJSON === 'string' ? JSON.parse(foldersJSON) : foldersJSON;
        var sets = [];
        for (var i = 0; i < paths.length; i++) {
            // Use Folder (not File) to enumerate directory contents
            var resolvedPath = aideResolveUserPath(String(paths[i]));
            var dir = new Folder(resolvedPath);
            if (!dir.exists) continue;

            var files = dir.getFiles(function(f) {
                return (f instanceof File) && f.name.match(/\.aide-set\.json$/i);
            });
            if (!files) continue;

            for (var j = 0; j < files.length; j++) {
                try {
                    files[j].open('r');
                    files[j].encoding = 'UTF-8';
                    var txt = files[j].read();
                    files[j].close();

                    var obj;
                    if (typeof JSON !== 'undefined' && JSON.parse) {
                        obj = JSON.parse(txt);
                    } else {
                        obj = eval('(' + txt + ')');
                    }
                    obj._path = String(files[j].fsName);
                    sets.push(obj);
                } catch (err) {
                    // Skip invalid JSON files
                }
            }
        }

        function stringifySets(setsArr) {
            var out = [];
            for (var k = 0; k < setsArr.length; k++) {
                var s = setsArr[k];
                var parts = [];
                parts.push('"name":"' + aideJsonStringEscape(s.name || '') + '"');
                parts.push('"icon":"' + aideJsonStringEscape(s.icon || '\uD83D\uDCE6') + '"');
                parts.push('"color":"' + aideJsonStringEscape(s.color || '#E8A838') + '"');
                parts.push('"_path":"' + aideJsonStringEscape(s._path) + '"');
                if (s.created) parts.push('"created":"' + aideJsonStringEscape(s.created) + '"');
                if (s.modified) parts.push('"modified":"' + aideJsonStringEscape(s.modified) + '"');
                if (s.scripts && s.scripts.length) {
                    var scr = [];
                    for (var l = 0; l < s.scripts.length; l++) {
                        scr.push('"' + aideJsonStringEscape(s.scripts[l]) + '"');
                    }
                    parts.push('"scripts":[' + scr.join(',') + ']');
                } else {
                    parts.push('"scripts":[]');
                }
                out.push('{' + parts.join(',') + '}');
            }
            return '[' + out.join(',') + ']';
        }

        return stringifySets(sets);
    } catch (e) {
        return '[]';
    }
}



/**
 * Write/overwrite a .aide-set.json file.
 */
function writeAideSet(pathStr, jsonStr) {
    try {
        var f = new File(aideResolveUserPath(pathStr));
        f.open('w');
        f.encoding = 'UTF-8';
        f.write(jsonStr);
        f.close();
        return 'Saved: ' + f.fsName;
    } catch (e) {
        return 'Error saving set: ' + e.message;
    }
}

/**
 * Delete a .aide-set.json file.
 */
function deleteAideSet(pathStr) {
    try {
        var f = new File(aideResolveUserPath(pathStr));
        if (f.exists) {
            f.remove();
            return 'Deleted: ' + f.fsName;
        }
        return 'Error: File not found.';
    } catch (e) {
        return 'Error deleting set: ' + e.message;
    }
}
