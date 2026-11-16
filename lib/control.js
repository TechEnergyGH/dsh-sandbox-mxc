// Adapted from deepseek-harness 5db3dc6 mxc-control.ts (MIT).
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:net';
import { openInheritedControlChannel } from '@deepseek-ai/dsh-subprocess/control';

const CHILD = String.raw`
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
const { port, secret, argv, hasControl, timeoutMs } = JSON.parse(process.env.DSH_MXC_CONTROL);
delete process.env.DSH_MXC_CONTROL;
delete process.env.DSH_SUBPROCESS_CONTROL;
let child;
let settled = false;
let confirmed = false;
let pendingExit;
const socket = connect({ host: '127.0.0.1', port });
const timer = setTimeout(() => fail('startup timed out'), timeoutMs);
function fail(message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  socket.destroy();
  console.error('windows-mxc-run: ' + message);
  // Runner's Job kills any spawned target and its descendants.
  process.exit(127);
}
socket.on('error', () => fail('control bridge failed'));
socket.on('close', () => { if (!settled) fail('control bridge closed unexpectedly'); });
socket.once('connect', () => socket.write(secret));
socket.once('data', acknowledgement => {
  if (acknowledgement.length !== 1 || acknowledgement[0] !== 49) return fail('invalid bridge acknowledgement');
  try {
    child = spawn(argv[0], argv.slice(1), {
      // A synchronous Windows pipe can deadlock writes behind a pending read.
      // Match DSH's overlapped duplex fd7 carrier rather than plain 'pipe'.
      stdio: hasControl ? ['inherit', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'overlapped'] : 'inherit',
      env: hasControl ? { ...process.env, DSH_SUBPROCESS_CONTROL: 'pipe' } : process.env,
      windowsHide: true,
    });
  } catch { return fail('target spawn failed'); }
  child.once('error', () => fail('target spawn failed'));
  function finish(code) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    // Drain final control bytes, but never await child.close indefinitely:
    // descendants may retain fd7 after the foreground target has exited.
    const exit = () => {
      if (hasControl) child.stdio[7].destroy();
      socket.destroy();
      // Windows Node mirrors the full DWORD, not only the Unix low byte.
      process.exit(code);
    };
    const hardStop = setTimeout(exit, 1_000);
    let flushing = false;
    const flush = () => {
      if (flushing) return;
      flushing = true;
      if (hasControl) child.stdio[7].unpipe(socket);
      socket.end(() => { clearTimeout(hardStop); exit(); });
    };
    if (!hasControl) return flush();
    socket.unpipe(child.stdio[7]);
    if (child.stdio[7].readableEnded) return flush();
    child.stdio[7].once('end', flush);
    setTimeout(flush, 500);
  }
  child.once('spawn', () => {
    socket.once('data', response => {
      if (response[0] !== 84) return fail('invalid target confirmation acknowledgement');
      confirmed = true;
      clearTimeout(timer);
      if (pendingExit !== undefined) return finish(pendingExit);
      if (hasControl) {
        if (response.length > 1) child.stdio[7].write(response.subarray(1));
        socket.pipe(child.stdio[7]);
      } else if (response.length > 1) fail('unexpected control payload');
    });
    socket.write('S');
    if (hasControl) {
      // Start output immediately after S. A target may write and exit before
      // T arrives; its pipe must already flow when finish() drains that exit.
      child.stdio[7].on('error', () => fail('target control pipe failed'));
      child.stdio[7].pipe(socket, { end: false });
    }
  });
  child.once('exit', (code, signal) => {
    pendingExit = code ?? (signal ? 1 : 0);
    if (confirmed) finish(pendingExit);
  });
});
`;

/** Authenticated fd7 bridge; no target starts outside native containment. */
export async function createMxcControlBridge(argv, hasControl, { timeoutMs = 15_000 } = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every(value => typeof value === 'string' && !value.includes('\0'))) {
    throw new Error('invalid MXC target argv');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('invalid bridge timeout');
  const control = hasControl ? openInheritedControlChannel() : undefined;
  const secret = randomBytes(32).toString('hex');
  const expected = Buffer.from(secret);
  const sockets = new Set();
  let authenticated = false;
  let started = false;
  let disposed = false;
  let failure;
  let resolveDrained;
  const drained = new Promise(resolve => { resolveDrained = resolve; });
  const fail = (message) => { failure ??= new Error(message); };
  const server = createServer(socket => {
    if (authenticated || sockets.size >= 8 || disposed) { socket.destroy(); return; }
    sockets.add(socket);
    let received = Buffer.alloc(0);
    let stage = 'authentication';
    socket.setTimeout(Math.min(timeoutMs, 5_000), () => socket.destroy());
    socket.on('error', () => { if (stage !== 'authentication') fail('MXC control socket failed'); socket.destroy(); });
    socket.on('end', () => {
      if (stage !== 'stream') return;
      // TCP EOF follows the final target bytes; flush the host fd7 write queue
      // before runner teardown closes that inherited endpoint.
      control?.unpipe(socket);
      if (control) control.write(Buffer.alloc(0), error => {
        if (error && !disposed) fail('MXC final control payload could not be flushed');
        resolveDrained();
      });
      else resolveDrained();
    });
    socket.on('close', () => {
      sockets.delete(socket);
      if (stage === 'startup' && !disposed) fail('MXC target did not confirm successful spawn');
    });
    const consume = data => {
      if (stage === 'authentication') {
        // Authentication has no payload: cap allocations before concatenating.
        if (received.length + data.length > expected.length) { socket.destroy(); return; }
        received = Buffer.concat([received, data]);
        if (received.length !== expected.length) return;
        if (authenticated || !timingSafeEqual(received, expected)) { socket.destroy(); return; }
        authenticated = true;
        stage = 'startup';
        received = Buffer.alloc(0);
        for (const other of sockets) if (other !== socket) other.destroy();
        server.close();
        socket.setTimeout(timeoutMs, () => { fail('MXC target startup timed out'); socket.destroy(); });
        socket.write('1');
        return;
      }
      if (stage === 'startup') {
        if (data[0] !== 83) { fail('invalid MXC target startup confirmation'); socket.destroy(); return; }
        stage = 'stream';
        started = true;
        clearTimeout(startupTimer);
        socket.setTimeout(0);
        socket.off('data', consume);
        socket.write('T');
        if (control) {
          if (data.length > 1) control.write(data.subarray(1));
          control.pipe(socket);
          socket.pipe(control, { end: false });
        } else if (data.length > 1) { fail('unexpected MXC control payload'); socket.destroy(); }
      }
    };
    socket.on('data', consume);
  });
  const startupTimer = setTimeout(() => {
    fail('MXC control startup timed out');
    for (const socket of sockets) socket.destroy();
  }, timeoutMs);
  control?.on('error', () => { if (!disposed) fail('inherited MXC control channel failed'); for (const socket of sockets) socket.destroy(); });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(startupTimer);
    for (const socket of sockets) socket.destroy();
    server.close();
    control?.destroy();
  };
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    server.on('error', () => fail('MXC bridge listener failed'));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('MXC bridge has no TCP address');
    return {
      argv: [process.execPath, '--input-type=module', '--eval', CHILD],
      environment: JSON.stringify({ port: address.port, secret, argv, hasControl, timeoutMs }),
      get started() { return started; },
      get failure() { return failure; },
      async drain() {
        if (!started) return;
        await new Promise(resolve => {
          const timer = setTimeout(() => { fail('MXC final control drain timed out'); resolve(); }, 1_000);
          drained.then(() => { clearTimeout(timer); resolve(); });
        });
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
