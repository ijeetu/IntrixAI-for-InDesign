#!/usr/bin/env node

/**
 * Ensures a persistent InDesign MCP server is running and healthy, starting
 * one only if it isn't. Unlike launch-indesign-mcp.mjs (spawned fresh by
 * each CLI turn over stdio and torn down with it), this process is meant to
 * live for as long as the IntrixAI panel is open: one long-running server,
 * shared by every CLI agent turn over its HTTP transport, so the InDesign
 * bridge stays connected continuously instead of connecting only while an
 * agent turn happens to be in flight.
 *
 * Run this any number of times from any number of panel loads — it's
 * idempotent. If a healthy server is already recorded, it does nothing and
 * just returns the existing connection info; only genuinely stale state
 * (dead pid, unresponsive port) triggers a respawn.
 *
 * Prints { pid, host, port, token } as JSON on stdout on success.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findServer, findConfig, resolveNodeBinary, freeStalePort } from './mcp-locate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.join(__dirname, '..');

const RUNTIME_DIR = path.join(os.homedir(), '.intrixai');
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'mcp-runtime.json');
const HTTP_CONFIG_FILE = path.join(RUNTIME_DIR, 'mcp-http-config.json');
const MCP_HOST = '127.0.0.1';
const MCP_PORT = Number(process.env.INTRIXAI_MCP_PORT || 8121);
const HEALTH_TIMEOUT_MS = 10000;
const HEALTH_POLL_INTERVAL_MS = 300;

if (Number(process.versions.node.split('.')[0]) < 18) {
    process.stderr.write('[IntrixAI MCP] Node.js 18 or newer is required.\n');
    process.exit(1);
}

function httpGetOk(url, timeoutMs) {
    return new Promise(function (resolve) {
        const req = http.get(url, { timeout: timeoutMs }, function (res) {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.on('error', function () { resolve(false); });
        req.on('timeout', function () { req.destroy(); resolve(false); });
    });
}

function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

function readRuntimeFile() {
    try {
        return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
    } catch (e) {
        return null;
    }
}

async function checkExisting() {
    const info = readRuntimeFile();
    if (!info || !info.pid || !info.host || !info.port || !info.token) return null;
    if (!isProcessAlive(info.pid)) return null;
    const healthy = await httpGetOk('http://' + info.host + ':' + info.port + '/healthz', 1500);
    return healthy ? info : null;
}

async function waitForHealth(host, port) {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (await httpGetOk('http://' + host + ':' + port + '/healthz', 800)) return true;
        await new Promise(function (resolve) { setTimeout(resolve, HEALTH_POLL_INTERVAL_MS); });
    }
    return false;
}

async function spawnDaemon() {
    const serverFile = findServer(EXTENSION_ROOT);
    const configFile = findConfig(serverFile);
    const nodeBinary = resolveNodeBinary();

    const baseConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const bridgePort = (baseConfig.bridge && baseConfig.bridge.port) || 8120;

    // Clear anything stale on both ports before claiming them — a leftover
    // process from a crashed daemon is the only thing that should ever be
    // sitting here, since this script is the sole owner of both ports.
    await freeStalePort(bridgePort);
    await freeStalePort(MCP_PORT);

    const httpConfig = Object.assign({}, baseConfig, {
        mcpHttp: { enabled: true, host: MCP_HOST, port: MCP_PORT }
    });
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(HTTP_CONFIG_FILE, JSON.stringify(httpConfig), 'utf8');

    const token = crypto.randomBytes(32).toString('hex');

    const child = childProcess.spawn(nodeBinary, [serverFile, HTTP_CONFIG_FILE], {
        cwd: path.dirname(path.dirname(serverFile)),
        env: Object.assign({}, process.env, { INTRIXAI_MCP_TOKEN: token }),
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true
    });
    child.unref();

    const healthy = await waitForHealth(MCP_HOST, MCP_PORT);
    if (!healthy) {
        try { process.kill(child.pid, 'SIGTERM'); } catch (e) { /* already gone */ }
        throw new Error('Persistent InDesign MCP server did not become healthy within ' + HEALTH_TIMEOUT_MS + 'ms.');
    }

    const info = { pid: child.pid, host: MCP_HOST, port: MCP_PORT, token: token, startedAt: Date.now() };
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(info), { mode: 0o600 });
    return info;
}

async function main() {
    try {
        const existing = await checkExisting();
        const info = existing || await spawnDaemon();
        process.stdout.write(JSON.stringify(info) + '\n');
    } catch (error) {
        process.stderr.write('[IntrixAI MCP] ' + error.message + '\n');
        process.exit(1);
    }
}

main();
