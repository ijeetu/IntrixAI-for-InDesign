/**
 * Shared discovery/process helpers for the InDesign MCP server, used by both
 * the persistent daemon launcher (mcp-daemon.mjs) and the legacy per-turn
 * launcher (launch-indesign-mcp.mjs).
 *
 * Override discovery with INDESIGN_MCP_SERVER=/absolute/path/to/dist/index.js.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';

const DEFAULT_WEBSOCKET_CONFIG = {
    bridge: {
        port: 8120,
        host: "127.0.0.1",
        maxPayload: 1048576,
        timeout: 30000
    },
    httpBridge: {
        enabled: false,
        port: 18999,
        host: "127.0.0.1",
        token: ""
    },
    server: {
        transport: "websocket",
        name: "indesign-nutria-mcp",
        version: "1.0.0"
    },
    logging: {
        level: "info"
    }
};

export function isServerFile(filePath) {
    if (!filePath) return false;
    try {
        return fs.statSync(filePath).isFile();
    } catch (e) {
        return false;
    }
}

export function findServer(extensionRoot) {
    const userHome = os.homedir();
    const candidates = [
        process.env.INDESIGN_MCP_SERVER,
        extensionRoot ? path.join(extensionRoot, 'vendor', 'adobe-indesign-mcp', 'dist', 'index.js') : null,
        extensionRoot ? path.join(extensionRoot, 'adobe-indesign-mcp', 'dist', 'index.js') : null,
        path.join(userHome, 'Library', 'Application Support', 'IntrixAI', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'Desktop', 'Report', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'Codes', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'Codes', 'IntrixAI-for-InDesign', 'vendor', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'Codes', 'IntrixAI-for-InDesign', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'adobe-indesign-mcp', 'dist', 'index.js')
    ].filter(Boolean);

    for (let i = 0; i < candidates.length; i += 1) {
        if (isServerFile(candidates[i])) return path.resolve(candidates[i]);
    }

    throw new Error(
        'InDesign MCP server not found. Set INDESIGN_MCP_SERVER to its dist/index.js path or run install_extension.command.'
    );
}

export function findConfig(serverFile) {
    const packageRoot = path.dirname(path.dirname(serverFile));
    const candidates = [
        process.env.INDESIGN_MCP_CONFIG,
        path.join(packageRoot, 'indesign-nutria-mcp.json'),
        path.join(packageRoot, 'opencode-indesign.json'),
        path.join(packageRoot, 'opencode.json'),
        path.join(packageRoot, 'mcp-config.json'),
        path.join(packageRoot, 'config.json'),
        path.join(os.homedir(), '.intrixai', 'indesign-nutria-mcp.json')
    ];

    for (let i = 0; i < candidates.length; i += 1) {
        if (!isServerFile(candidates[i])) continue;
        const resolved = path.resolve(candidates[i]);
        try {
            const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
            if (config.server && config.server.transport === 'websocket') return resolved;
        } catch (e) { /* try the next candidate */ }
    }

    // Auto-configure: write a default websocket config file if none exists or none had transport='websocket'
    const autoConfigTargets = [
        path.join(packageRoot, 'indesign-nutria-mcp.json'),
        path.join(os.homedir(), '.intrixai', 'indesign-nutria-mcp.json')
    ];

    for (let i = 0; i < autoConfigTargets.length; i += 1) {
        const targetPath = autoConfigTargets[i];
        try {
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.writeFileSync(targetPath, JSON.stringify(DEFAULT_WEBSOCKET_CONFIG, null, 2), 'utf8');
            process.stderr.write('[IntrixAI MCP] Auto-configured WebSocket config at: ' + targetPath + '\n');
            return targetPath;
        } catch (e) {
            /* Try next target if write failed */
        }
    }

    throw new Error(
        'InDesign MCP WebSocket config not found and auto-configuration failed. Set INDESIGN_MCP_CONFIG.'
    );
}

export function resolveNodeBinary() {
    if (process.execPath && isServerFile(process.execPath) && Number((process.versions?.node || '').split('.')[0] || 0) >= 18) {
        return process.execPath;
    }
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const candidates = [
        home + '/.local/bin/node',
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
        '/usr/bin/node',
        'node'
    ];
    for (let i = 0; i < candidates.length; i += 1) {
        if (candidates[i].indexOf('/') === -1 || isServerFile(candidates[i])) return candidates[i];
    }
    throw new Error('Node.js 18+ is required to launch the InDesign MCP server.');
}

export function listeningPids(port) {
    const result = childProcess.spawnSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' });
    if (!result || !result.stdout) return [];
    return result.stdout.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
}

export function isOurServerProcess(pid) {
    const result = childProcess.spawnSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' });
    const cmd = result && result.stdout ? result.stdout : '';
    return cmd.indexOf('adobe-indesign-mcp') !== -1;
}

/**
 * Kills whatever of our own server processes are bound to `port`, waiting
 * (with an escalating SIGKILL) for the port to actually free up. Used before
 * spawning a fresh server so a process that didn't exit cleanly last time
 * doesn't leave the port permanently stuck.
 */
export async function freeStalePort(port) {
    const pids = listeningPids(port).filter(isOurServerProcess);
    if (pids.length === 0) return;

    pids.forEach(function (pid) {
        process.stderr.write('[IntrixAI MCP] Clearing stale server (pid ' + pid + ') from port ' + port + '.\n');
        try { process.kill(Number(pid), 'SIGTERM'); } catch (e) { /* already gone */ }
    });

    for (let waited = 0; waited < 1000; waited += 100) {
        await new Promise(function (resolve) { setTimeout(resolve, 100); });
        if (listeningPids(port).length === 0) return;
    }

    listeningPids(port).filter(isOurServerProcess).forEach(function (pid) {
        process.stderr.write('[IntrixAI MCP] Force-killing unresponsive stale server (pid ' + pid + ').\n');
        try { process.kill(Number(pid), 'SIGKILL'); } catch (e) { /* already gone */ }
    });
}
