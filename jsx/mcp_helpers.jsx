/**
 * Aide for InDesign — mcp_helpers.jsx
 * Injected ExtendScript helper functions from adobe-indesign-mcp.
 * Provides DOM helpers, item collectors, measurement conversion, and JSON polyfills.
 */

// ── JSON Polyfill for ES3 ExtendScript ──
if (typeof JSON === 'undefined' || !JSON.stringify || !JSON.parse) {
    JSON = {
        parse: function (s) {
            return eval('(' + s + ')');
        },
        stringify: (function () {
            var toString = Object.prototype.toString;
            var isArray = Array.isArray || function (a) { return toString.call(a) === '[object Array]'; };
            var escGS = ["\\u0000","\\u0001","\\u0002","\\u0003","\\u0004","\\u0005","\\u0006","\\u0007","\\b","\\t","\\n","\\u000b","\\f","\\r","\\u000e","\\u000f","\\u0010","\\u0011","\\u0012","\\u0013","\\u0014","\\u0015","\\u0016","\\u0017","\\u0018","\\u0019","\\u001a","\\u001b","\\u001c","\\u001d","\\u001e","\\u001f"];
            var escRE = /[\\"\u0000-\u001f\u007f-\u009f\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
            var escMap = { '\\': '\\\\', '"': '\\"', '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r' };

            function escFunc(c) {
                return escMap[c] || '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
            }

            return function stringify(val) {
                if (val === null) return 'null';
                if (val === undefined) return undefined;
                var type = typeof val;
                if (type === 'number') return isFinite(val) ? String(val) : 'null';
                if (type === 'boolean') return String(val);
                if (type === 'string') return '"' + val.replace(escRE, escFunc) + '"';
                if (type === 'object') {
                    if (typeof val.toJSON === 'function') return stringify(val.toJSON());
                    if (isArray(val)) {
                        var res = [];
                        for (var i = 0; i < val.length; i++) {
                            res.push(stringify(val[i]) || 'null');
                        }
                        return '[' + res.join(',') + ']';
                    }
                    var pairs = [];
                    for (var k in val) {
                        if (Object.prototype.hasOwnProperty.call(val, k)) {
                            var v = stringify(val[k]);
                            if (v !== undefined) {
                                pairs.push(stringify(k) + ':' + v);
                            }
                        }
                    }
                    return '{' + pairs.join(',') + '}';
                }
                return undefined;
            };
        })()
    };
}

// ── DOM Helpers ──
function __escapeJsx(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

function __findDocument(nameOrIndex) {
    var docs = app.documents;
    if (!docs || docs.length === 0) return null;
    if (typeof nameOrIndex === 'undefined' || nameOrIndex === null) return app.activeDocument;
    if (typeof nameOrIndex === 'number') return docs[nameOrIndex] || null;
    for (var i = 0; i < docs.length; i++) {
        if (docs[i].name === nameOrIndex) return docs[i];
    }
    return null;
}

function __getActiveDocument() {
    if (!app.documents || app.documents.length === 0) return null;
    return app.activeDocument;
}

function __findPage(doc, pageNameOrIndex) {
    if (!doc || !doc.pages) return null;
    if (typeof pageNameOrIndex === 'number') return doc.pages[pageNameOrIndex] || null;
    for (var i = 0; i < doc.pages.length; i++) {
        if (doc.pages[i].name === pageNameOrIndex) return doc.pages[i];
    }
    return null;
}

function __getAllPages(doc) {
    if (!doc || !doc.pages) return [];
    var result = [];
    for (var i = 0; i < doc.pages.length; i++) {
        result.push(doc.pages[i]);
    }
    return result;
}

function __walkItems(parent, callback) {
    if (!parent) return;
    var items = parent.pageItems;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
        callback(items[i], i);
        if (items[i].pageItems && items[i].pageItems.length > 0) {
            __walkItems(items[i], callback);
        }
    }
}

function __collectTextFrames(parent) {
    if (!parent) return [];
    var result = [];
    var frames = parent.textFrames;
    if (frames) {
        for (var i = 0; i < frames.length; i++) { result.push(frames[i]); }
    }
    return result;
}

function __collectShapes(parent) {
    if (!parent) return [];
    var result = [];
    var rects = parent.rectangles; if (rects) { for (var i = 0; i < rects.length; i++) result.push({ item: rects[i], type: 'rectangle' }); }
    var ellipses = parent.ellipses; if (ellipses) { for (var i = 0; i < ellipses.length; i++) result.push({ item: ellipses[i], type: 'ellipse' }); }
    var polygons = parent.polygons; if (polygons) { for (var i = 0; i < polygons.length; i++) result.push({ item: polygons[i], type: 'polygon' }); }
    var lines = parent.graphicLines; if (lines) { for (var i = 0; i < lines.length; i++) result.push({ item: lines[i], type: 'graphicLine' }); }
    return result;
}

function __collectImages(parent) {
    if (!parent) return [];
    var result = [];
    var images = parent.images;
    if (images) {
        for (var i = 0; i < images.length; i++) { result.push(images[i]); }
    }
    return result;
}

function __findLayer(doc, nameOrIndex) {
    if (!doc || !doc.layers) return null;
    if (typeof nameOrIndex === 'number') return doc.layers[nameOrIndex] || null;
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === nameOrIndex) return doc.layers[i];
    }
    return null;
}

// ── Measurement Conversions ──
function __mmToPoints(mm) { return mm * 2.834645669291338; }
function __pointsToMm(pt) { return pt / 2.834645669291338; }
function __inchesToPoints(inches) { return inches * 72; }
function __pointsToInches(pt) { return pt / 72; }

function __getDocumentInfo(doc) {
    if (!doc) return null;
    var fp = '';
    try { fp = doc.fullName ? doc.fullName.toString() : ''; } catch (e) {}
    return {
        name: doc.name,
        filePath: fp,
        pages: doc.pages ? doc.pages.length : 0,
        pageWidth: doc.documentPreferences.pageWidth,
        pageHeight: doc.documentPreferences.pageHeight,
        orientation: doc.documentPreferences.pageOrientation
    };
}

function __ok(data) { return JSON.stringify({ ok: true, data: data }); }
function __fail(msg) { return JSON.stringify({ ok: false, error: String(msg) }); }
