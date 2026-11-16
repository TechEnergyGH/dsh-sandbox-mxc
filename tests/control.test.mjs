import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createMxcControlBridge } from '../lib/control.js';

async function execute(bridge) {
  const child = spawn(bridge.argv[0], bridge.argv.slice(1), {
    env: { ...process.env, DSH_MXC_CONTROL: bridge.environment }, stdio: 'inherit',
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
}

test('fast targets must confirm spawn before exiting', { timeout: 10_000 }, async () => {
  for (let i = 0; i < 10; i++) {
    const bridge = await createMxcControlBridge([process.execPath, '-e', 'process.exit(37)'], false, { timeoutMs: 3_000 });
    try {
      assert.equal(await execute(bridge), 37);
      assert.equal(bridge.started, true);
      assert.equal(bridge.failure, undefined);
    } finally { bridge.dispose(); }
  }
});

test('failed target spawn is not a successful startup', { timeout: 5_000 }, async () => {
  const bridge = await createMxcControlBridge(['Z:\\missing-mxc-target-876269236.exe'], false, { timeoutMs: 3_000 });
  try {
    assert.equal(await execute(bridge), 127);
    assert.equal(bridge.started, false);
  } finally { bridge.dispose(); }
});

test('missing authentication has a bounded startup timeout', { timeout: 3_000 }, async () => {
  const bridge = await createMxcControlBridge([process.execPath, '--version'], false, { timeoutMs: 60 });
  try {
    await delay(120);
    assert.equal(bridge.started, false);
    assert.match(bridge.failure.message, /startup timed out/);
  } finally { bridge.dispose(); }
});

test('bad secret and oversized authentication cannot claim startup', { timeout: 5_000 }, async () => {
  const bridge = await createMxcControlBridge([process.execPath, '-e', 'process.exit(23)'], false, { timeoutMs: 3_000 });
  try {
    const { port } = JSON.parse(bridge.environment);
    for (const payload of ['x'.repeat(64), 'x'.repeat(1024)]) {
      await new Promise((resolve, reject) => {
        const socket = connect({ port, host: '127.0.0.1' });
        socket.once('connect', () => socket.write(payload));
        socket.once('error', reject);
        socket.once('close', resolve);
      });
      assert.equal(bridge.started, false);
    }
    assert.equal(await execute(bridge), 23);
    assert.equal(bridge.started, true);
    assert.equal(bridge.failure, undefined);
  } finally { bridge.dispose(); }
});

test('target does not inherit bridge credentials or stale control marker', { timeout: 5_000 }, async () => {
  const argv = [process.execPath, '-e', "process.exit(process.env.DSH_MXC_CONTROL === undefined && process.env.DSH_SUBPROCESS_CONTROL === undefined ? 0 : 97)"];
  const bridge = await createMxcControlBridge(argv, false, { timeoutMs: 3_000 });
  try { assert.equal(await execute(bridge), 0); }
  finally { bridge.dispose(); }
});

test('overlapped fd7 final payload drains before foreground exit', { timeout: 8_000 }, async () => {
  const moduleUrl = new URL('../lib/control.js', import.meta.url).href;
  for (const waitForInput of [true, false]) {
  const target = `
    const { Socket } = require('node:net');
    const channel = new Socket({ fd: 7, readable: true, writable: true, allowHalfOpen: true });
    const send = () => channel.write('final'.repeat(4096), () => process.exit(17));
    ${waitForInput ? "channel.once('data', send);" : 'send();'}
  `;
  const helper = `
    import { createMxcControlBridge } from ${JSON.stringify(moduleUrl)};
    import { spawn } from 'node:child_process';
    const bridge = await createMxcControlBridge([process.execPath, '-e', ${JSON.stringify(target)}], true);
    try {
      const child = spawn(bridge.argv[0], bridge.argv.slice(1), { env: { ...process.env, DSH_MXC_CONTROL: bridge.environment }, stdio: 'inherit' });
      const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
      await bridge.drain();
      if (bridge.failure) throw bridge.failure;
      process.exitCode = code;
    } finally { bridge.dispose(); }
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', helper], {
    env: { ...process.env, DSH_SUBPROCESS_CONTROL: 'pipe' },
    stdio: ['ignore', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'overlapped'],
  });
  const timer = setTimeout(() => child.kill(), 6_000);
  let received = '';
  child.stdio[7].on('data', data => { received += data.toString(); });
  child.stdio[7].on('error', () => {});
  if (waitForInput) child.stdio[7].write('go');
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 17);
    assert.equal(received, 'final'.repeat(4096));
  } finally { clearTimeout(timer); child.stdio[7].destroy(); }
  }
});

test('Windows bootstrap preserves full-width exit code', { skip: process.platform !== 'win32', timeout: 5_000 }, async () => {
  const code = 0xf1234567;
  const bridge = await createMxcControlBridge([process.execPath, '-e', `process.exit(${code})`], false, { timeoutMs: 3_000 });
  try {
    assert.equal((await execute(bridge)) >>> 0, code);
    assert.equal(bridge.started, true);
  } finally { bridge.dispose(); }
});
