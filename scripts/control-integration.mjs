// Native-container fd7 / lifecycle tests. Only a fresh scratch tree is written.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const parent = realpathSync.native(tmpdir());
const workspace = mkdtempSync(join(parent, 'dsh-mxc-control-test-'));
const runner = process.argv[2] ?? fileURLToPath(new URL('../lib/runner.js', import.meta.url));
const host = { systemDrive: process.env.SystemDrive, localAppData: process.env.LOCALAPPDATA };
const policy = JSON.stringify({ mode: 'workspace-write', roots: [workspace], host });
const results = [];
function record(name) { results.push({ name, status: 'passed' }); console.log('PASS ' + name); }
function native(code, args = []) {
  return spawnSync(process.execPath, [runner, policy, '--', process.execPath, '-e', code, ...args], {
    cwd: workspace, encoding: 'utf8', timeout: 30_000,
  });
}
try {
  // The inherited fd7 is opened on the host, authenticated over loopback, then
  // recreated inside native PSEC. This is NOT a bridge-only host test.
  const code = `
    const { Socket } = require('node:net');
    setTimeout(() => { console.error('native fd7 target timed out waiting for data'); process.exit(96); }, 15_000);
    if (process.env.DSH_MXC_CONTROL !== undefined) process.exit(92);
    if (process.env.DSH_SUBPROCESS_CONTROL !== 'pipe') process.exit(93);
    delete process.env.DSH_SUBPROCESS_CONTROL;
    const socket = new Socket({ fd: 7, readable: true, writable: true, allowHalfOpen: true });
    socket.on('error', () => process.exit(94));
    let received = '';
    socket.on('data', data => {
      received += data.toString();
      if (received === 'ping') { socket.write('pong'); received = ''; }
      else if (received === 'finish') { socket.write('final', () => process.exit(42)); }
    });
  `;
  const child = spawn(process.execPath, [runner, policy, '--', process.execPath, '-e', code], {
    cwd: workspace, env: { ...process.env, DSH_SUBPROCESS_CONTROL: 'pipe' },
    stdio: ['ignore', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'overlapped'],
  });
  const timer = setTimeout(() => child.kill(), 25_000);
  try {
    let response = '';
    let sentFinish = false;
    child.stdio[7].on('data', data => {
      response += data.toString();
      if (response === 'pong' && !sentFinish) {
        sentFinish = true;
        child.stdio[7].write('finish');
      }
    });
    child.stdio[7].on('error', error => { console.error('fd7 carrier error:', error.code); });
    child.stdio[7].write('ping');
    const status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(status, 42, 'native fd7 target exit');
    assert.equal(response, 'pongfinal', 'native fd7 bidirectional and final payload');
    record('native PSEC fd7 bidirectional bridge and credential removal');
  } finally { clearTimeout(timer); child.stdio[7].destroy(); }

  const immediate = spawn(process.execPath, [runner, policy, '--', process.execPath, '-e', `
    const { Socket } = require('node:net');
    const channel = new Socket({ fd: 7, readable: true, writable: true, allowHalfOpen: true });
    channel.write('final'.repeat(4096), () => process.exit(42));
  `], {
    cwd: workspace, env: { ...process.env, DSH_SUBPROCESS_CONTROL: 'pipe' },
    stdio: ['ignore', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'overlapped'],
  });
  const immediateTimer = setTimeout(() => immediate.kill(), 25_000);
  let immediatePayload = '';
  immediate.stdio[7].on('data', data => { immediatePayload += data.toString(); });
  immediate.stdio[7].on('error', () => {});
  try {
    const status = await new Promise((resolve, reject) => {
      immediate.once('error', reject); immediate.once('close', resolve);
    });
    assert.equal(status, 42);
    assert.equal(immediatePayload, 'final'.repeat(4096));
    record('native startup-immediate final payload survives exit before acknowledgement');
  } finally { clearTimeout(immediateTimer); immediate.stdio[7].destroy(); }

  const fullWidth = native('process.exit(0xf1234567)');
  assert.equal(fullWidth.status >>> 0, 0xf1234567, fullWidth.stderr);
  record('native full DWORD exit mirroring');

  const pidFile = join(workspace, 'descendant-pid.txt');
  const desc = native(`
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.once('error', () => process.exit(95));
    child.once('spawn', () => {
      require('node:fs').writeFileSync(process.argv[1], String(child.pid));
      process.exit(43);
    });
  `, [pidFile]);
  assert.equal(desc.status, 43, desc.stderr);
  const pid = Number(readFileSync(pidFile, 'utf8'));
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  // Allow Windows process-table bookkeeping to settle, without restarting work.
  await delay(150);
  let alive = true;
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
  assert.equal(alive, false, `descendant ${pid} survived foreground exit`);
  record('native detached descendant dies with foreground lifetime');
  writeFileSync(fileURLToPath(new URL('../control-integration-result.json', import.meta.url)), JSON.stringify({ results, profileChanged: false }, null, 2) + '\n');
} finally {
  const owned = relative(parent, workspace);
  if (isAbsolute(owned) || owned.startsWith('..') || !owned.startsWith('dsh-mxc-control-test-')) throw new Error('unexpected cleanup path');
  rmSync(workspace, { recursive: true, force: true, maxRetries: 3 });
}
