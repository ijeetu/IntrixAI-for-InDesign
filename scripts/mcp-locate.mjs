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
        path.join(extensionRoot, 'vendor', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(extensionRoot, 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'Library', 'Application Support', 'IntrixAI', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'Desktop', 'Report', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'Codes', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(userHome, 'adobe-indesign-mcp', 'dist', 'index.js')
    ];

    for (let i = 0; i < candidates.length; i += 1) {
        if (isServerFile(candidates[i])) return path.resolve(candidates[i]);
    }

    throw new Error(
        'InDesign MCP server not found. Set INDESIGN_MCP_SERVER to its dist/index.js path.'
    );
}

export function findConfig(serverFile) {
    const packageRoot = path.dirname(path.dirname(serverFile));
    const candidates = [
        process.env.INDESIGN_MCP_CONFIG,
        path.join(packageRoot, 'indesign-nutria-mcp.json'),
        path.join(packageRoot, 'opencode-indesign.json')
    ];

    for (let i = 0; i < candidates.length; i += 1) {
        if (!isServerFile(candidates[i])) continue;
        const resolved = path.resolve(candidates[i]);
        try {
            const config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
            if (config.server && config.server.transport === 'websocket') return resolved;
        } catch (e) { /* try the next candidate */ }
    }

    throw new Error(
        'InDesign MCP WebSocket config not found beside the server. ' +
        'Set INDESIGN_MCP_CONFIG to a config whose server.transport is "websocket".'
    );
}

export function resolveNodeBinary() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const candidates = [
        home + '/.local/bin/node',
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
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
