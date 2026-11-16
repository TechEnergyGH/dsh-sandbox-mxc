// Adapted from deepseek-harness 5db3dc6 mxc-runner.ts (MIT).
import { existsSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { SUBPROCESS_CONTROL_ENV } from '@deepseek-ai/dsh-subprocess/control';
import {
  closeHandleChecked, isJobEmpty, loadWin32ProcessBindings, pollProcessExit,
  spawnCurrentTokenJobProcess, terminateJob,
} from '@deepseek-ai/dsh-win32-process';
import { createMxcControlBridge } from './control.js';
import { policyFromJson, requestFor, PROBE_UNAVAILABLE_EXIT } from './policy.js';

const FAILURE_EXIT = 127;
const SIGNATURE = 'windows-mxc-run:';
const require = createRequire(import.meta.url);

/** Never allow SDK path overrides to load external native executables/FFI. */
function cleanEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (['MXC_FFI_DIR', 'MXC_BIN_DIR'].includes(key.toUpperCase())) delete process.env[key];
  }
}

/** Run or probe native PSEC only. An unavailable probe returns PROBE_UNAVAILABLE_EXIT, not ACL fallback. */
export async function runMxc(args) {
  if (process.platform !== 'win32') throw new Error('native MXC requires Windows');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('MXC SDK requires Node >=24');
  const probing = args.length === 1 && args[0] === '--probe';
  if (!probing && (args[1] !== '--' || args.length < 3)) throw new Error('expected JSON policy -- command argv');
  const policy = policyFromJson(probing ? JSON.stringify({
    mode: 'read-only', roots: [process.cwd()],
    host: { systemDrive: process.env.SystemDrive, localAppData: process.env.LOCALAPPDATA },
  }) : args[0]);
  const argv = probing ? [process.execPath, '--version'] : args.slice(2);
  cleanEnvironment();
  // Import after removing SDK native-path overrides (SDK initialization can read them).
  const { MxcError, probe, SDK_CONTRACT_VERSION } = await import('@microsoft/mxc-sdk/v1');
  const sdk = dirname(require.resolve('@microsoft/mxc-sdk/package.json'));
  if (JSON.parse(readFileSync(join(sdk, 'package.json'), 'utf8')).version !== '1.0.1') {
    throw new Error('only reviewed MXC SDK 1.0.1 is supported');
  }
  let temp;
  let tempParent;
  let bridge;
  try {
    const support = probe();
    if (support.tier !== 'base-container' || support.needsDaclAugmentation !== false) {
      if (probing) return PROBE_UNAVAILABLE_EXIT;
      throw new Error('native PSEC unavailable; refusing ACL augmentation or fallback');
    }
    tempParent = realpathSync.native(tmpdir());
    temp = mkdtempSync(join(tempParent, 'dsh-mxc-'));
    bridge = await createMxcControlBridge(argv, !probing && process.env[SUBPROCESS_CONTROL_ENV] === 'pipe');
    const request = requestFor(bridge.argv, policy, temp);
    if (request.containment?.type !== 'processcontainer') throw new Error('MXC requires native processcontainer policy');
    request.environment = { ...request.environment, DSH_MXC_CONTROL: bridge.environment };
    // Control marker must only be supplied to the target after opening the host fd7.
    for (const key of Object.keys(request.environment)) {
      if (key.toUpperCase() === SUBPROCESS_CONTROL_ENV) delete request.environment[key];
    }
    const requestSupport = probe(request);
    if (requestSupport.tier !== 'base-container' || requestSupport.needsDaclAugmentation !== false) {
      throw new Error('native PSEC cannot enforce requested policy without ACL augmentation');
    }
    const configuration = {
      version: SDK_CONTRACT_VERSION,
      containment: 'processcontainer',
      containerId: randomUUID().replaceAll('-', ''),
      lifecycle: { destroyOnExit: true, preservePolicy: false },
      process: {
        commandLine: request.command, cwd: request.workingDirectory,
        env: Object.entries(request.environment).filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${key}=${value}`),
      },
      filesystem: request.filesystem, network: request.network,
      processContainer: request.containment.config,
      ui: { disable: false, clipboard: 'none', injection: false },
    };
    const configFile = join(temp, 'policy.json');
    writeFileSync(configFile, JSON.stringify(configuration), { flag: 'wx', mode: 0o600 });
    const executable = join(sdk, 'bin', process.arch, 'wxc-exec.exe');
    if (!existsSync(executable)) throw new Error('bundled native MXC executable is missing');
    const api = loadWin32ProcessBindings();
    const child = spawnCurrentTokenJobProcess(api, {
      command: executable, applicationName: executable, args: [configFile], cwd: process.cwd(),
      env: Object.fromEntries(Object.entries({
        ...process.env, SystemDrive: policy.host.systemDrive, LOCALAPPDATA: policy.host.localAppData,
      }).filter(([, value]) => value !== undefined)),
      stdio: { stdin: 0, stdout: 1, stderr: 2 },
    });
    try {
      let exitCode;
      while ((exitCode = pollProcessExit(api, child.process)) === undefined) {
        if (bridge.failure) throw bridge.failure;
        await delay(25);
      }
      if (!bridge.started) throw new Error('native MXC executor failed before target successfully spawned');
      await bridge.drain();
      if (bridge.failure) throw bridge.failure;
      return exitCode;
    } finally {
      // Foreground completion is the lifetime boundary, including detached descendants.
      try {
        if (!isJobEmpty(api, child.job)) {
          terminateJob(api, child.job, 1);
          const deadline = Date.now() + 5_000;
          while (!isJobEmpty(api, child.job)) {
            if (Date.now() >= deadline) throw new Error('MXC process tree cleanup timed out');
            await delay(25);
          }
        }
      } finally {
        try { closeHandleChecked(api, child.process, 'MXC executor process'); }
        finally { closeHandleChecked(api, child.job, 'MXC executor Job'); }
      }
    }
  } catch (error) {
    // Native buffers may include command/environment: expose only the SDK error code.
    if (error instanceof MxcError) throw new Error(`native MXC failure (${error.code})`);
    throw error;
  } finally {
    bridge?.dispose();
    if (temp !== undefined) {
      // Validate the absolute, owned path immediately before destructive cleanup.
      const owned = relative(tempParent, resolve(temp));
      if (isAbsolute(owned) || owned.startsWith('..') || dirname(temp) !== tempParent || !owned.startsWith('dsh-mxc-')) {
        throw new Error('refusing cleanup outside private MXC temp directory');
      }
      rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMxc(process.argv.slice(2)).then(exitCode => {
    // Node on Windows retains all 32 exit bits; do not mask to Unix's 8 bits.
    process.exitCode = exitCode;
  }, error => {
    process.stderr.write(`${SIGNATURE} ${error instanceof Error ? error.message : 'native runner failed'}\n`);
    process.exitCode = FAILURE_EXIT;
  });
}
