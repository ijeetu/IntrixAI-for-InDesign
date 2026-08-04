/**
 * Aide for InDesign — mcp-bridge.js
 * Bi-directional MCP Server Bridge for InDesign CEP Extension.
 * Connects to adobe-indesign-mcp WebSocket server at ws://127.0.0.1:8120.
 * Automatically spawns the MCP server process if offline!
 */

(function() {
    'use strict';

    var WS_URL = 'ws://127.0.0.1:8120';
    var MCP_SERVER_SCRIPT = '/Users/jeetuvishwakarma/Desktop/Report/adobe-indesign-mcp/dist/index.js';
    var RECONNECT_INTERVAL = 2500;
    var ws = null;
    var isConnected = false;
    var reconnectTimer = null;
    var isSpawning = false;
    var spawnAttempted = false;

    function getNodeRequire() {
        if (typeof require !== 'undefined') return require;
        if (typeof window.require !== 'undefined') return window.require;
        if (typeof window.cep_node !== 'undefined' && window.cep_node.require) return window.cep_node.require;
        return null;
    }

    function updateStatusUI(connected, text) {
        var dot = document.getElementById('mcp-connection-dot');
        var label = document.getElementById('mcp-status-text');
        var wrap = document.getElementById('mcp-indicator-wrap');

        if (dot) {
            dot.className = 'connection-dot ' + (connected ? 'ok' : (isSpawning ? 'warn' : 'err'));
        }
        if (label) {
            label.textContent = text || (connected ? 'MCP: Connected' : (isSpawning ? 'MCP: Starting...' : 'MCP: Offline'));
        }
        if (wrap) {
            wrap.title = connected ? 'Connected to adobe-indesign-mcp (ws://127.0.0.1:8120)' : (isSpawning ? 'Starting adobe-indesign-mcp server...' : 'MCP Server Offline (Click to retry)');
        }
    }

    function trySpawnServer() {
        if (isSpawning || spawnAttempted) return;
        isSpawning = true;
        updateStatusUI(false, 'MCP: Starting...');

        var req = getNodeRequire();
        if (!req) {
            console.warn('[Aide MCP Bridge] Node.js child_process not available in CEP context.');
            isSpawning = false;
            return;
        }

        try {
            var cp = req('child_process');
            var fs = req('fs');

            var nodeCandidates = [
                '/Users/jeetuvishwakarma/.local/bin/node',
                '/opt/homebrew/bin/node',
                '/usr/local/bin/node',
                'node'
            ];
            var nodeBin = 'node';
            for (var i = 0; i < nodeCandidates.length; i++) {
                if (fs.existsSync && fs.existsSync(nodeCandidates[i])) {
                    nodeBin = nodeCandidates[i];
                    break;
                }
            }

            var startServerProc = function() {
                console.log('[IntrixAI MCP Bridge] Launching background MCP server using ' + nodeBin + ' ' + MCP_SERVER_SCRIPT);
                var child = cp.spawn(nodeBin, [MCP_SERVER_SCRIPT], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
                spawnAttempted = true;

                setTimeout(function() {
                    isSpawning = false;
                    connect();
                }, 1500);
            };

            if (!fs.existsSync(MCP_SERVER_SCRIPT)) {
                console.log('[IntrixAI MCP Bridge] MCP Server not found on disk. Auto-installing from GitHub...');
                updateStatusUI(false, 'MCP: Installing...');
                var installCmd = 'git clone https://github.com/nutriandrea/adobe-indesign-mcp.git /Users/jeetuvishwakarma/Desktop/Report/adobe-indesign-mcp && cd /Users/jeetuvishwakarma/Desktop/Report/adobe-indesign-mcp && npm install && npm run build';
                cp.exec(installCmd, { env: process.env }, function(err) {
                    if (err) {
                        console.error('[IntrixAI MCP Bridge] Auto-installation failed:', err);
                        isSpawning = false;
                        updateStatusUI(false, 'MCP: Install Err');
                        return;
                    }
                    startServerProc();
                });
            } else {
                startServerProc();
            }

        } catch (e) {
            console.error('[IntrixAI MCP Bridge] Auto-spawn server failed:', e);
            isSpawning = false;
        }
    }

    function initBridge() {
        if (typeof WebSocket === 'undefined') {
            console.warn('[Aide MCP Bridge] WebSocket is not supported in this CEP environment.');
            updateStatusUI(false, 'MCP: No WS');
            return;
        }

        var wrap = document.getElementById('mcp-indicator-wrap');
        if (wrap) {
            wrap.style.cursor = 'pointer';
            wrap.addEventListener('click', function() {
                spawnAttempted = false;
                connect();
            });
        }

        connect();
    }

    function connect() {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
            return;
        }

        if (!isSpawning) {
            updateStatusUI(false, 'MCP: Connecting...');
        }

        try {
            ws = new WebSocket(WS_URL);
        } catch (e) {
            console.error('[Aide MCP Bridge] Connection error:', e);
            if (!spawnAttempted) {
                trySpawnServer();
            } else {
                scheduleReconnect();
            }
            return;
        }

        ws.onopen = function() {
            isConnected = true;
            isSpawning = false;
            console.log('[Aide MCP Bridge] Connected to adobe-indesign-mcp at ' + WS_URL);
            updateStatusUI(true, 'MCP: Connected');
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        ws.onmessage = function(event) {
            try {
                var data = JSON.parse(event.data);
                if (data.type === 'connected') {
                    console.log('[Aide MCP Bridge] Server handshake received:', data.version);
                    return;
                }

                if (data.id && data.code) {
                    handleExecutionRequest(data);
                }
            } catch (err) {
                console.error('[Aide MCP Bridge] Failed to parse message:', err, event.data);
            }
        };

        ws.onclose = function(event) {
            isConnected = false;
            console.warn('[Aide MCP Bridge] Connection closed:', event.code, event.reason);
            updateStatusUI(false, 'MCP: Offline');
            
            if (!spawnAttempted) {
                trySpawnServer();
            } else {
                scheduleReconnect();
            }
        };

        ws.onerror = function(err) {
            isConnected = false;
            console.error('[Aide MCP Bridge] WebSocket error');
            updateStatusUI(false, 'MCP: Error');

            if (!spawnAttempted) {
                trySpawnServer();
            }
        };
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(function() {
            reconnectTimer = null;
            connect();
        }, RECONNECT_INTERVAL);
    }

    function handleExecutionRequest(request) {
        var id = request.id;
        var code = request.code;

        if (typeof window.csInterface === 'undefined' && typeof CSInterface !== 'undefined') {
            window.csInterface = new CSInterface();
        }

        var cs = window.csInterface;
        if (!cs) {
            sendResponse({
                id: id,
                type: 'error',
                error: 'CSInterface is not available in CEP panel.'
            });
            return;
        }

        cs.evalScript(code, function(rawResult) {
            try {
                var parsed = null;
                try { parsed = JSON.parse(rawResult); } catch(e) {}

                if (parsed && parsed.__extendscript_error) {
                    sendResponse({
                        id: id,
                        type: 'error',
                        error: parsed.message || 'ExtendScript execution error'
                    });
                } else {
                    sendResponse({
                        id: id,
                        type: 'result',
                        result: rawResult
                    });
                }
            } catch (err) {
                sendResponse({
                    id: id,
                    type: 'error',
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        });
    }

    function sendResponse(response) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBridge);
    } else {
        initBridge();
    }

    window.AideMCPBridge = {
        connect: connect,
        getStatus: function() { return isConnected; }
    };
})();
