#!/usr/bin/env node

/**
 * Locate and launch the already-installed InDesign MCP server (ES module).
 *
 * Keeping discovery here lets every CLI use the same portable MCP command.
 * Override discovery with INDESIGN_MCP_SERVER=/absolute/path/to/dist/index.js.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (Number(process.versions.node.split('.')[0]) < 18) {
    process.stderr.write('[IntrixAI MCP] Node.js 18 or newer is required.\n');
    process.exit(1);
}

function isServerFile(filePath) {
    if (!filePath) return false;
    try {
        return fs.statSync(filePath).isFile();
    } catch (e) {
        return false;
    }
}

function findServer() {
    const userHome = os.homedir();
    const candidates = [
        process.env.INDESIGN_MCP_SERVER,
        path.join(__dirname, '..', 'vendor', 'adobe-indesign-mcp', 'dist', 'index.js'),
        path.join(__dirname, '..', 'adobe-indesign-mcp', 'dist', 'index.js'),
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

function findConfig(serverFile) {
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

function readBridgePort(configFile) {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const port = config.bridge && config.bridge.port;
        return Number.isFinite(port) ? port : 8120;
    } catch (e) {
        return 8120;
    }
}

function listeningPids(port) {
    const result = childProcess.spawnSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' });
    if (!result || !result.stdout) return [];
    return result.stdout.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
}

function isOurServerProcess(pid) {
    const result = childProcess.spawnSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' });
    const cmd = result && result.stdout ? result.stdout : '';
    return cmd.indexOf('adobe-indesign-mcp') !== -1;
}

/**
 * Each CLI agent turn spawns its own fresh MCP server that binds the bridge
 * port. If a previous turn's process didn't exit cleanly (a common failure
 * mode when the calling CLI is killed on timeout/abort without cascading the
 * signal to its stdio MCP child), the port stays held and every subsequent
 * turn's server crashes instantly with EADDRINUSE — silently leaving the CLI
 * with zero InDesign tools for that turn, since Node treats an unhandled
 * 'error' on the HTTP/WebSocket listener as fatal. This project only ever
 * runs one turn's bridge at a time by design, so anything still holding the
 * port when a new turn starts is stale and safe to clear — but only if it's
 * actually one of our own server processes, never an unrelated bystander.
 */
async function freeStalePort(port) {
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

async function main() {
    let serverFile;
    let configFile;

    try {
        serverFile = findServer();
        configFile = findConfig(serverFile);
    } catch (error) {
        process.stderr.write('[IntrixAI MCP] ' + error.message + '\n');
        process.exit(1);
        return;
    }

    if (process.argv.indexOf('--check') !== -1) {
        process.stdout.write(JSON.stringify({ ok: true, server: serverFile, config: configFile }) + '\n');
        return;
    }

    await freeStalePort(readBridgePort(configFile));

    const child = childProcess.spawn(process.execPath, [serverFile, configFile], {
        cwd: path.dirname(path.dirname(serverFile)),
        env: process.env,
        stdio: ['pipe', 'pipe', 'inherit']
    });

    // Give the CEP panel's 400 ms reconnect loop (js/mcp-ws-bridge.js) time to
    // attach to the new WebSocket listener before the MCP client can issue its
    // first tool call. MCP stdin is buffered safely during this short window.
    // Wider than the reconnect interval alone so a cold-started InDesign
    // (e.g. right after a restart, competing for CPU) still has margin.
    child.stdout.pipe(process.stdout);
    const bridgeReadyDelay = Number(process.env.INDESIGN_MCP_READY_DELAY_MS || 1800);
    const stdinTimer = setTimeout(function () {
        process.stdin.pipe(child.stdin);
    }, Number.isFinite(bridgeReadyDelay) ? bridgeReadyDelay : 1200);

    child.on('error', function (error) {
        process.stderr.write('[IntrixAI MCP] Failed to launch server: ' + error.message + '\n');
        process.exit(1);
    });

    child.on('exit', function (code, signal) {
        clearTimeout(stdinTimer);
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }
        process.exit(code == null ? 1 : code);
    });

    function forwardSignal(signal) {
        if (!child.killed) child.kill(signal);
    }

    process.on('SIGINT', function () { forwardSignal('SIGINT'); });
    process.on('SIGTERM', function () { forwardSignal('SIGTERM'); });
}

main();
