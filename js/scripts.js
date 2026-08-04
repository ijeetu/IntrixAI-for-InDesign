/**
 * Aide — scripts.js
 * Script persistence: save, load, search, delete, favorites.
 * Uses localStorage (CEP doesn't support IndexedDB reliably).
 */

const AideScripts = (() => {
    const STORAGE_KEY = 'aide_scripts';
    const FOLDER_KEY = 'aide_scripts_folder';
    const FOLDERS_KEY = 'aide_local_script_folders';
    const LOCAL_FAV_KEY = 'aide_local_script_favorites';
    const SCRIPTS_SUBTAB_KEY = 'aide_scripts_subtab';
    const SCRIPTS_STAR_FILTER_KEY = 'aide_scripts_star_filter';
    // Light version: compact view only; script descriptions feature removed.
    const DEFAULT_FOLDER = '~/Documents/IntrixAI Scripts/';

    // ──────────────────────────────────────────────
    // CRUD — Aide-saved-from-chat scripts (localStorage)
    // ──────────────────────────────────────────────

    /**
     * Load all saved-from-chat scripts.
     * @returns {Array} array of script objects { id, name, code, favorite, createdAt }
     */
    function loadAll() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function _persist(arr) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || (e.message && e.message.indexOf('quota') !== -1)) {
                window.dispatchEvent(new CustomEvent('QUOTA_EXCEEDED', { detail: { source: 'scripts' } }));
            }
            console.warn('Could not save scripts:', e);
        }
    }

    /**
     * Find a script by id.
     * @param {string} id
     * @returns {object|null}
     */
    function getById(id) {
        return loadAll().find(s => s.id === id) || null;
    }

    /**
     * Save a new script. Generates a random id if not provided.
     * @param {object} script - { name, code, [id], [favorite] }
     * @returns {object} the saved script with id and createdAt
     */
    function save(script) {
        const arr = loadAll();
        const entry = Object.assign({
            id: 'aide_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            name: 'Untitled Script',
            code: '',
            favorite: false,
            createdAt: new Date().toISOString()
        }, script);
        arr.unshift(entry); // newest first
        _persist(arr);
        return entry;
    }

    /**
     * Remove a script by id.
     * @param {string} id
     */
    function remove(id) {
        const arr = loadAll().filter(s => s.id !== id);
        _persist(arr);
    }

    /**
     * Update fields on an existing script.
     * @param {string} id
     * @param {object} delta - partial fields to merge
     */
    function update(id, delta) {
        const arr = loadAll().map(s => s.id === id ? Object.assign({}, s, delta) : s);
        _persist(arr);
    }

    /**
     * Toggle the `favorite` flag on a saved-from-chat script.
     * @param {string} id
     * @returns {boolean} new favorite state
     */
    function toggleFavorite(id) {
        const script = getById(id);
        if (!script) return false;
        const newState = !script.favorite;
        update(id, { favorite: newState });
        return newState;
    }


    function migrateFolderToArray() {
        try {
            if (localStorage.getItem(FOLDERS_KEY)) return;
            const legacy = localStorage.getItem(FOLDER_KEY);
            // Only migrate a real user-set legacy value, not the default
            if (legacy && legacy.trim() && legacy.trim() !== DEFAULT_FOLDER) {
                localStorage.setItem(FOLDERS_KEY, JSON.stringify([legacy.trim()]));
            } else {
                // Mark as migrated with an empty list — no phantom default folder
                localStorage.setItem(FOLDERS_KEY, JSON.stringify([]));
            }
        } catch (e) {
            console.warn('Folder migration:', e);
        }
    }

    // ──── Local script folders (export destination + Local tab roots) ────
    function getScriptFolders() {
        migrateFolderToArray();
        try {
            const raw = localStorage.getItem(FOLDERS_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter(Boolean) : [];
        } catch (e) {
            return [];
        }
    }

    function setScriptFolders(paths) {
        try {
            const clean = (paths || []).map(p => {
                const raw = String(p || '').trim();
                if (!raw) return '';
                try { return decodeURIComponent(raw); } catch (e) { return raw; }
            }).filter(Boolean);
            localStorage.setItem(FOLDERS_KEY, JSON.stringify(clean));
        } catch (e) {
            console.warn('Could not save folder list:', e);
        }
    }

    function addScriptFolder(path, insertAtIdx = -1) {
        let p = String(path || '').trim();
        try { p = decodeURIComponent(p); } catch (e) { /* keep raw */ }
        if (!p) return;
        const cur = getScriptFolders();
        if (cur.indexOf(p) !== -1) return;
        if (insertAtIdx >= 0 && insertAtIdx <= cur.length) {
            cur.splice(insertAtIdx, 0, p);
        } else {
            cur.push(p);
        }
        setScriptFolders(cur);
    }

    function removeScriptFolder(index) {
        const cur = getScriptFolders();
        if (index < 0 || index >= cur.length) return;
        cur.splice(index, 1);
        setScriptFolders(cur); // may become empty - that's valid
    }

    /** First folder: default export target */
    function getScriptsFolder() {
        const folders = getScriptFolders();
        return folders[0] || null;
    }

    function setScriptsFolder(path) {
        const p = String(path || '').trim();
        if (!p) return;
        const cur = getScriptFolders();
        if (cur.length === 0) {
            setScriptFolders([p]);
        } else {
            cur[0] = p;
            setScriptFolders(cur);
        }
    }

    // ──── Local disk script favorites (full fs path as id) ────
    function loadLocalFavorites() {
        try {
            const raw = localStorage.getItem(LOCAL_FAV_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr : []);
        } catch (e) {
            return new Set();
        }
    }

    function persistLocalFavorites(set) {
        try {
            localStorage.setItem(LOCAL_FAV_KEY, JSON.stringify(Array.from(set || [])));
        } catch (e) {
            console.warn('Could not save local favorites:', e);
        }
    }

    function isLocalFavorite(path) {
        return loadLocalFavorites().has(path);
    }

    function toggleLocalFavorite(path) {
        const set = loadLocalFavorites();
        const isFav = set.has(path);
        if (isFav) set.delete(path);
        else set.add(path);
        persistLocalFavorites(set);
        return !isFav;
    }

    function getScriptsSubtab() {
        try {
            const v = localStorage.getItem(SCRIPTS_SUBTAB_KEY);
            return (v === 'sets' || v === 'favs') ? v : 'local';
        } catch (e) {
            return 'local';
        }
    }

    function setScriptsSubtab(tab) {
        try {
            const valid = (tab === 'local' || tab === 'sets' || tab === 'favs') ? tab : 'local';
            localStorage.setItem(SCRIPTS_SUBTAB_KEY, valid);
        } catch (e) { /* ignore */ }
    }

    function getScriptsStarFilter() {
        try {
            return localStorage.getItem(SCRIPTS_STAR_FILTER_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function setScriptsStarFilter(on) {
        try {
            localStorage.setItem(SCRIPTS_STAR_FILTER_KEY, on ? '1' : '0');
        } catch (e) { /* ignore */ }
    }

    // Script descriptions feature removed in light version.



    // ──────────────────────────────────────────────
    // STEP 5 — Hierarchical Script Tree
    // ──────────────────────────────────────────────

    const HIDDEN_KEY   = 'aide_tree_hidden_paths';
    const SHOW_HID_KEY = 'aide_tree_show_hidden';
    const OPEN_FOLDERS_KEY = 'aide_tree_open_folders';

    function loadOpenFolders() {
        try {
            const raw = localStorage.getItem(OPEN_FOLDERS_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr : []);
        } catch (e) { return new Set(); }
    }

    function persistOpenFolders(set) {
        try { localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify(Array.from(set || []))); }
        catch (e) { /* ignore */ }
    }

    function isFolderOpen(path) {
        return loadOpenFolders().has(path);
    }

    function setFolderOpen(path, open) {
        const p = String(path || '');
        if (!p) return;
        const set = loadOpenFolders();
        if (open) set.add(p);
        else set.delete(p);
        persistOpenFolders(set);
    }

    function expandAllFolders(trees) {
        const set = loadOpenFolders();
        function walk(node) {
            if (node.type === 'folder' || node.children) {
                if (node.path) set.add(node.path);
                (node.children || []).forEach(walk);
            }
        }
        (trees || []).forEach(walk);
        persistOpenFolders(set);
    }

    function collapseAllFolders() {
        persistOpenFolders(new Set());
    }

    function loadHiddenPaths() {
        try {
            const raw = localStorage.getItem(HIDDEN_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr : []);
        } catch (e) { return new Set(); }
    }

    function persistHiddenPaths(set) {
        try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(set || []))); }
        catch (e) { console.warn('Could not save hidden paths:', e); }
    }

    function isHiddenPath(path) {
        return loadHiddenPaths().has(path);
    }

    function toggleHiddenPath(path) {
        const set = loadHiddenPaths();
        const hidden = set.has(path);
        if (hidden) set.delete(path);
        else set.add(path);
        persistHiddenPaths(set);
        return !hidden; // true = now hidden
    }

    function getShowHidden() {
        try { return localStorage.getItem(SHOW_HID_KEY) === '1'; }
        catch (e) { return false; }
    }

    function setShowHidden(v) {
        try { localStorage.setItem(SHOW_HID_KEY, v ? '1' : '0'); }
        catch (e) { /* ignore */ }
    }

    /**
     * Internal: load frozen snapshot of all render-relevant state.
     * Prevents localStorage lookups during recursive tree rendering.
     */
    function _loadRenderState() {
        return Object.freeze({
            openFolders: loadOpenFolders(),
            hiddenPaths: loadHiddenPaths(),
            favPaths:    loadLocalFavorites()
        });
    }

    /**
     * Count visible script files in a tree node (recursive).
     * Used for folder count badges.
     */
    function countVisibleFiles(node, showHidden, state) {
        if (!node) return 0;
        if (node.type === 'file') {
            if (!showHidden && state.hiddenPaths.has(node.path)) return 0;
            return 1;
        }
        // folder
        let count = 0;
        if (node.children) {
            node.children.forEach(c => { count += countVisibleFiles(c, showHidden, state); });
        }
        return count;
    }

    /**
     * Filter a tree node's children by search query (recursive).
     * Returns a copy of the node with matching descendants only.
     */
    function filterTreeNode(node, q, showHidden, state) {
        if (!node) return null;
        if (node.type === 'file') {
            if (!showHidden && state.hiddenPaths.has(node.path)) return null;
            if (!q) return node;
            const name = (node.name || '').toLowerCase();
            return name.indexOf(q) !== -1 ? node : null;
        }
        // folder — recurse
        const filteredChildren = [];
        if (node.children) {
            node.children.forEach(c => {
                const r = filterTreeNode(c, q, showHidden, state);
                if (r) filteredChildren.push(r);
            });
        }
        if (!q && filteredChildren.length === 0) return null; // empty folder hidden when no query
        if (q && filteredChildren.length === 0) {
            // Folder name itself matches
            const fname = (node.name || '').toLowerCase();
            if (fname.indexOf(q) === -1) return null;
        }
        return Object.assign({}, node, { children: filteredChildren });
    }

    // ── SVG constants shared between buildTreeDom and patchTreeDom ──
    const _SVG = {
        chevron: '<svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg>',
        folder:  '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
        file:    '<svg viewBox="0 0 24 24"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><polyline points="14 2 14 7 19 7"/></svg>',
        star:    '<svg viewBox="0 0 24 24"><polygon points="12 3.5 14.85 9.28 21.23 10.21 16.61 14.72 17.7 21.08 12 18.08 6.3 21.08 7.39 14.72 2.77 10.21 9.15 9.28 12 3.5"/></svg>',
        lock:    '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" ry="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
        run:     '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5"/></svg>'
    };

    function _decodeLabel(value) {
        const raw = String(value || '');
        try { return decodeURIComponent(raw); } catch (e) { return raw.replace(/%20/g, ' '); }
    }

    // ── Step 6: Deferred Rendering Logic ──
    let _renderQueue = [];
    let _idleCallbackId = null;

    function _cancelDeferredRender() {
        if (_idleCallbackId !== null) {
            if (window.cancelIdleCallback) window.cancelIdleCallback(_idleCallbackId);
            else clearTimeout(_idleCallbackId);
            _idleCallbackId = null;
        }
        _renderQueue = [];
    }

    function _processDeferredQueue(deadline) {
        const isIdle = () => deadline && deadline.timeRemaining ? deadline.timeRemaining() > 1 : true;
        const start = Date.now();
        
        while (_renderQueue.length > 0 && (isIdle() || (deadline && deadline.didTimeout))) {
            const task = _renderQueue.shift();
            task();
            if (!deadline || !deadline.timeRemaining) {
                if (Date.now() - start > 15) break; // 15ms batch for setTimeout fallback
            }
        }
        
        if (_renderQueue.length > 0) {
            if (window.requestIdleCallback) _idleCallbackId = window.requestIdleCallback(_processDeferredQueue);
            else _idleCallbackId = setTimeout(() => _processDeferredQueue(null), 0);
        } else {
            _idleCallbackId = null;
        }
    }

    function _countNodes(nodes) {
        if (!nodes) return 0;
        return nodes.reduce((sum, n) => sum + 1 + (n.children ? _countNodes(n.children) : 0), 0);
    }

    /**
     * Build a real DOM element for a single tree node (initial render).
     * folder → <details class="script-folder">
     * file   → <div class="script-row">
     *
     * @param {object}  node      — tree node { type, path, name, children, binary }
     * @param {number}  depth     — nesting depth (0 = root)
     * @param {object}  state     — frozen render state from _loadRenderState() + query
     * @param {boolean} showHidden
     * @param {boolean} isRoot
     * @returns {HTMLElement}
     */
    function buildTreeDom(node, depth, state, showHidden, isRoot, deferChildren = false) {
        const esc = AideUtils.escapeHtml;

        if (node.type === 'file') {
            const isFav    = state.favPaths.has(node.path);
            const isHidden = state.hiddenPaths.has(node.path);
            const isBin    = !!node.binary;
            const ep       = encodeURIComponent(node.path);
            const decodedPath = _decodeLabel(node.path);
            const decodedName = _decodeLabel(node.name || '');

            let displayName = decodedName;
            const dotPos = displayName.lastIndexOf('.');
            const extDisp = dotPos !== -1 ? displayName.substring(dotPos) : '';
            if (dotPos !== -1) displayName = displayName.substring(0, dotPos);

            const row = document.createElement('div');
            row.className = 'script-row' +
                (isHidden ? ' tree-row--hidden' : '') +
                (isFav    ? ' script-row--fav'  : '');
            row.dataset.path   = ep;
            row.dataset.type   = 'file';
            row.dataset.isBin  = isBin ? 'true' : 'false';
            row.dataset.isFav  = isFav  ? 'true' : 'false';
            row.dataset.isHidden = isHidden ? 'true' : 'false';
            row.style.setProperty('--tree-depth', depth);
            row.title = decodedPath;

            const runBtn = document.createElement('button');
            runBtn.type = 'button';
            runBtn.className = 'tree-run-btn';
            runBtn.dataset.action   = 'tree-run';
            runBtn.dataset.encPath  = ep;
            runBtn.title = 'Run';
            runBtn.innerHTML = _SVG.run;
            row.appendChild(runBtn);

            const iconSpan = document.createElement('span');
            iconSpan.className = 'script-row-icon icon-svg';
            iconSpan.setAttribute('aria-hidden', 'true');
            iconSpan.innerHTML = isBin ? _SVG.lock : (isFav ? _SVG.star : _SVG.file);
            row.appendChild(iconSpan);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'script-row-name';
            nameSpan.textContent = displayName;
            row.appendChild(nameSpan);

            const extSpan = document.createElement('span');
            extSpan.className = 'script-row-ext';
            extSpan.textContent = extDisp;
            row.appendChild(extSpan);

            const right = document.createElement('div');
            right.className = 'script-row-right';
            const overflowBtn = document.createElement('button');
            overflowBtn.type = 'button';
            overflowBtn.className = 'tree-overflow-btn';
            overflowBtn.dataset.action   = 'tree-overflow';
            overflowBtn.dataset.encPath  = ep;
            overflowBtn.dataset.name     = esc(decodedName);
            overflowBtn.dataset.isFav    = String(isFav);
            overflowBtn.dataset.isHidden = String(isHidden);
            overflowBtn.dataset.isBin    = String(isBin);
            overflowBtn.title = 'More options';
            overflowBtn.textContent = '\u22ef';
            right.appendChild(overflowBtn);
            row.appendChild(right);

            return row;
        }

        // ── Folder node ──
        const details = document.createElement('details');
        details.className = 'script-folder';
        details.style.setProperty('--tree-depth', depth);
        details.dataset.folderPath = encodeURIComponent(node.path);
        if (isRoot) details.dataset.root = 'true';

        // Determine open state: always open when query active, else use persisted state
        const shouldOpen = state.query
            ? true
            : state.openFolders.has(node.path);
        if (shouldOpen) details.open = true;

        const summary = document.createElement('summary');
        summary.className = 'folder-row';

        const chevronSpan = document.createElement('span');
        chevronSpan.className = 'folder-chevron icon-svg';
        chevronSpan.setAttribute('aria-hidden', 'true');
        chevronSpan.innerHTML = _SVG.chevron;
        summary.appendChild(chevronSpan);

        const folderIconSpan = document.createElement('span');
        folderIconSpan.className = 'folder-row-icon icon-svg';
        folderIconSpan.setAttribute('aria-hidden', 'true');
        folderIconSpan.innerHTML = _SVG.folder;
        summary.appendChild(folderIconSpan);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-row-name';
        nameSpan.textContent = _decodeLabel(node.name || '');
        summary.appendChild(nameSpan);

        const count = countVisibleFiles(node, showHidden, state);
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'folder-count';
            badge.textContent = count;
            summary.appendChild(badge);
        }

        details.appendChild(summary);

        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'folder-children';
        
        const buildChildren = () => {
            const frag = document.createDocumentFragment();
            (node.children || []).forEach(c => {
                frag.appendChild(buildTreeDom(c, depth + 1, state, showHidden, false, deferChildren));
            });
            childrenDiv.appendChild(frag);
        };

        if (deferChildren && node.children && node.children.length > 0 && !shouldOpen) {
            _renderQueue.push(buildChildren);
        } else {
            buildChildren();
        }

        details.appendChild(childrenDiv);

        return details;
    }

    /**
     * Update a file row in-place without replacing it.
     * Only toggles CSS classes and data attributes — no DOM replacement.
     */
    function _patchFileRow(el, node, state) {
        const isFav    = state.favPaths.has(node.path);
        const isHidden = state.hiddenPaths.has(node.path);

        // Classes
        el.classList.toggle('tree-row--hidden',  isHidden);
        el.classList.toggle('script-row--fav',   isFav);

        // Data attributes that the overflow menu reads
        el.dataset.isFav    = String(isFav);
        el.dataset.isHidden = String(isHidden);

        // Overflow button data attrs
        const ob = el.querySelector('.tree-overflow-btn');
        if (ob) {
            ob.dataset.isFav    = String(isFav);
            ob.dataset.isHidden = String(isHidden);
        }

        // Icon: swap between file/star/lock
        const iconSpan = el.querySelector('.script-row-icon');
        if (iconSpan) {
            const isBin = el.dataset.isBin === 'true';
            iconSpan.innerHTML = isBin ? _SVG.lock : (isFav ? _SVG.star : _SVG.file);
        }
    }

    /**
     * Patch the container to match `filteredTrees` without nuking it.
     *
     * Algorithm:
     *  1. Build a Map<path, domElement> from the live DOM for O(1) lookup.
     *  2. For each node in filteredTrees:
     *     - If a live element exists for that path → update in place (file) or recurse (folder).
     *     - Otherwise → build a fresh element and insert it.
     *  3. Remove live elements whose path is no longer in filteredTrees.
     *  4. Re-order children to match the data order.
     *
     * @param {HTMLElement} container    — scripts-list element
     * @param {Array}       filteredTrees — filtered root nodes
     * @param {object}      state        — frozen render state + query
     * @param {boolean}     showHid
     */
    function patchTreeDom(container, filteredTrees, state, showHid) {
        // Build a lookup of existing top-level elements by their path key
        const existingMap = new Map();
        Array.from(container.children).forEach(el => {
            const key = el.dataset.path || el.dataset.folderPath || '';
            if (key) existingMap.set(key, el);
        });

        // Determine the ordered set of paths we need after filtering
        const desiredKeys = [];
        filteredTrees.forEach(root => {
            const key = encodeURIComponent(root.path);
            desiredKeys.push(key);
        });
        const desiredSet = new Set(desiredKeys);

        // Remove elements no longer in the filtered result
        existingMap.forEach((el, key) => {
            if (!desiredSet.has(key)) {
                el.remove();
                existingMap.delete(key);
            }
        });

        // Build or update, then re-order
        filteredTrees.forEach((root, idx) => {
            const key = encodeURIComponent(root.path);
            let el = existingMap.get(key);

            if (!el) {
                // New root node — build from scratch
                el = buildTreeDom(root, 0, state, showHid, true);
                existingMap.set(key, el);
            } else {
                // Existing root — patch in-place
                _patchNode(el, root, 0, state, showHid, true);
            }

            // Re-order: ensure el is at position `idx`
            const current = container.children[idx];
            if (current !== el) {
                container.insertBefore(el, current || null);
            }
        });
    }

    /**
     * Recursively patch a live DOM node against fresh tree data.
     * For files: update in-place. For folders: recurse into children div.
     */
    function _patchNode(el, node, depth, state, showHidden, isRoot) {
        if (node.type === 'file') {
            _patchFileRow(el, node, state);
            return;
        }

        // Folder: update open state
        const shouldOpen = state.query
            ? true
            : state.openFolders.has(node.path);
        
        el.open = shouldOpen;

        // Update badge count
        const summary = el.querySelector(':scope > summary');
        if (summary) {
            const badge = summary.querySelector('.folder-count');
            const count = countVisibleFiles(node, showHidden, state);
            if (count > 0) {
                if (badge) {
                    badge.textContent = count;
                } else {
                    const b = document.createElement('span');
                    b.className = 'folder-count';
                    b.textContent = count;
                    summary.appendChild(b);
                }
            } else if (badge) {
                badge.remove();
            }
        }

        // Recurse into children
        const childrenDiv = el.querySelector(':scope > .folder-children');
        if (!childrenDiv) return;

        const childNodes = node.children || [];

        // Build lookup of existing child elements
        const existingChildren = new Map();
        Array.from(childrenDiv.children).forEach(child => {
            const key = child.dataset.path || child.dataset.folderPath || '';
            if (key) existingChildren.set(key, child);
        });

        const desiredChildKeys = new Set(
            childNodes.map(c => encodeURIComponent(c.path))
        );

        // Remove children no longer present
        existingChildren.forEach((child, key) => {
            if (!desiredChildKeys.has(key)) {
                child.remove();
                existingChildren.delete(key);
            }
        });

        // Patch or create children, then re-order
        childNodes.forEach((child, idx) => {
            const key = encodeURIComponent(child.path);
            let childEl = existingChildren.get(key);

            if (!childEl) {
                childEl = buildTreeDom(child, depth + 1, state, showHidden, false);
                existingChildren.set(key, childEl);
            } else {
                _patchNode(childEl, child, depth + 1, state, showHidden, false);
            }

            const current = childrenDiv.children[idx];
            if (current !== childEl) {
                childrenDiv.insertBefore(childEl, current || null);
            }
        });
    }

    /**
     * Render the full hierarchical tree for the Local tab.
     *
     * First call: builds the DOM from scratch (buildTreeDom).
     * Subsequent calls: patches the live DOM in place (patchTreeDom),
     * preserving scroll position, open-folder state, and focus.
     *
     * @param {HTMLElement} container   — the scripts-list element
     * @param {HTMLElement} emptyEl     — the empty-state element
     * @param {Array}       trees       — array of root tree nodes from scanScriptFolderJson
     * @param {string}      searchQuery — filter string (may be empty)
     * @param {boolean}     favOnly     — if true, show only favorites
     * @param {boolean}     showHid     — if true, show hidden scripts
     */
    function renderScriptTree(container, emptyEl, trees, searchQuery, favOnly, showHid) {
        _cancelDeferredRender();
        const q = (searchQuery || '').toLowerCase().trim();
        // Attach query to state so buildTreeDom/patchTreeDom can use it for auto-expand
        const baseState = _loadRenderState();
        const state = Object.freeze(Object.assign(Object.create(null), baseState, { query: q }));

        function keepFavs(n) {
            if (!n) return null;
            if (n.type === 'file') return state.favPaths.has(n.path) ? n : null;
            const ch = (n.children || []).map(keepFavs).filter(Boolean);
            return ch.length ? Object.assign({}, n, { children: ch }) : null;
        }

        // Apply filters
        const filtered = trees.map(root => {
            if (!root) return null;
            let r = favOnly ? keepFavs(root) : root;
            return r ? filterTreeNode(r, q, showHid, state) : null;
        }).filter(Boolean);

        const hasContent = filtered.some(root => {
            if (!root) return false;
            if (root.type === 'file') return true;
            return (root.children || []).length > 0;
        });

        if (!hasContent) {
            // Clear tree children but leave emptyEl slot intact
            while (container.firstChild && container.firstChild !== emptyEl) {
                container.removeChild(container.firstChild);
            }
            if (!container.contains(emptyEl)) container.appendChild(emptyEl);
            emptyEl.classList.remove('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        if (container.contains(emptyEl)) container.removeChild(emptyEl);

        // Check if the container already has tree content (i.e. not first render)
        const hasDomContent = container.children.length > 0;

        if (hasDomContent) {
            patchTreeDom(container, filtered, state, showHid);
        } else {
            // Initial render: build real DOM nodes, no innerHTML
            const totalNodes = _countNodes(filtered);
            const useDefer = totalNodes > 150;
            const frag = document.createDocumentFragment();
            filtered.forEach(root => frag.appendChild(buildTreeDom(root, 0, state, showHid, true, useDefer)));
            container.appendChild(frag);
            
            if (useDefer && _renderQueue.length > 0) {
                if (window.requestIdleCallback) _idleCallbackId = window.requestIdleCallback(_processDeferredQueue);
                else _idleCallbackId = setTimeout(() => _processDeferredQueue(null), 0);
            }
        }
    }

    return {
        // ── Saved-from-chat scripts CRUD ──
        loadAll, getById, save, remove, update, toggleFavorite,

        // ── Local script folders ──
        getScriptsFolder, setScriptsFolder, getScriptFolders, setScriptFolders, addScriptFolder, removeScriptFolder,
        setFolderOpen, isFolderOpen, expandAllFolders, collapseAllFolders,
        // ── Local disk favorites ──
        isLocalFavorite, toggleLocalFavorite, loadLocalFavorites,
        // ── UI persistence ──
        getScriptsSubtab, setScriptsSubtab, getScriptsStarFilter, setScriptsStarFilter,
        // Light version: view mode + descriptions removed.
        // ── Tree rendering (Step 5) ──
        renderScriptTree,
        isHiddenPath, toggleHiddenPath,
        getShowHidden, setShowHidden,
        // ── Tree open-state persistence ──
        DEFAULT_FOLDER
    };
})();
