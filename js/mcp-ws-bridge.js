/**
 * IntrixAI — mcp-ws-bridge.js
 *
 * In-panel WebSocket client for the InDesign MCP bridge.
 *
 * The CLI agent runtime (agent-runtime.js) spawns an ephemeral copy of the
 * installed adobe-indesign-mcp server for the duration of each turn. That
 * server opens a WebSocket bridge at ws://127.0.0.1:8120 and expects an
 * InDesign-side client to attach, execute the ExtendScript it sends, and
 * report the result back. This module IS that client — it runs inside the
 * CEP panel (which already has CSInterface + Node access) so no separate
 * UXP plugin install/connect step is required.
 *
 * Protocol (matches adobe-indesign-mcp's BridgeServer):
 *   server -> client: { type: 'connected', version }        (ignored)
 *   server -> client: { id, code, timeout }                 (exec request)
 *   client -> server: { id, type: 'success', result }
 *   client -> server: { id, type: 'error', error }
 *
 * The server is short-lived and only exists while a CLI agent turn is
 * running, so this client just keeps retrying the connection forever at a
 * low fixed interval — cheap while idle, and ready the moment a turn spawns
 * a fresh server instance.
 */

(function () {
    'use strict';

    var WS_URL = 'ws://127.0.0.1:8120';
    var RECONNECT_DELAY_MS = 400;

    var ws = null;
    var isConnected = false;
    var reconnectTimer = null;
    var cs = null;

    function getCSInterface() {
        if (cs) return cs;
        try {
            cs = new CSInterface();
        } catch (e) {
            cs = null;
        }
        return cs;
    }

    function updateStatusUI(state, text) {
        var dot = document.getElementById('mcp-connection-dot');
        var label = document.getElementById('mcp-status-text');
        var wrap = document.getElementById('mcp-indicator-wrap');
        if (dot) dot.className = 'connection-dot ' + state;
        if (label && text) label.textContent = text;
        if (wrap) {
            wrap.title = isConnected
                ? 'Connected to the InDesign MCP bridge (ws://127.0.0.1:8120).'
                : 'Waiting for an InDesign MCP server to start (spawned automatically when you send a message in Agent mode).';
        }
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            connect();
        }, RECONNECT_DELAY_MS);
    }

    function connect() {
        if (typeof WebSocket === 'undefined') return;
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
            return;
        }

        try {
            ws = new WebSocket(WS_URL);
        } catch (e) {
            scheduleReconnect();
            return;
        }

        ws.onopen = function () {
            isConnected = true;
            updateStatusUI('ok', 'MCP: Bridge connected');
        };

        ws.onmessage = function (event) {
            var data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                return;
            }
            if (data && data.id && typeof data.code === 'string') {
                handleExecutionRequest(data);
            }
            // Anything else (e.g. the initial {type:'connected'} handshake) is ignored.
        };

        ws.onclose = function () {
            var wasConnected = isConnected;
            isConnected = false;
            ws = null;
            updateStatusUI('warn', 'MCP: Waiting for agent turn…');
            if (wasConnected) {
                // The ephemeral server for this turn exited normally; keep polling
                // so the next turn's server is picked up automatically.
            }
            scheduleReconnect();
        };

        ws.onerror = function () {
            // onclose always follows onerror for a WebSocket; let onclose schedule the retry.
        };
    }

    function handleExecutionRequest(request) {
        var id = request.id;
        var socket = ws;
        var csi = getCSInterface();

        if (!csi) {
            sendResponse(socket, { id: id, type: 'error', error: 'CSInterface is not available in this CEP panel.' });
            return;
        }

        csi.evalScript(request.code, function (raw) {
            var result = (raw == null || raw === 'undefined') ? '' : String(raw);
            if (result === 'EvalScript error.') {
                sendResponse(socket, { id: id, type: 'error', error: 'EvalScript failed at the CEP level.' });
                return;
            }
            sendResponse(socket, { id: id, type: 'success', result: result });
        });
    }

    function sendResponse(socket, response) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(response));
        }
    }

    function init() {
        updateStatusUI('warn', 'MCP: Waiting for agent turn…');
        connect();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.IntrixMCPBridge = {
        isConnected: function () { return isConnected; }
    };
})();
