import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, parse, resolve } from 'node:path';
import { quoteArg } from './win32.js';

export const FAILURE_SIGNATURE = 'windows-mxc-run: ';
export const FAILURE_EXIT = 127;
/** Dedicated probe refusal code; ordinary startup/import failures may exit 1. */
export const PROBE_UNAVAILABLE_EXIT = 78;
export const DENIAL_SIGNATURES = ['access is denied', 'access to the path', 'permission denied', 'operation not permitted'];

function directory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw new Error('MXC roots must be absolute directory paths');
  const canonical = realpathSync.native(path);
  if (!statSync(canonical).isDirectory()) throw new Error('MXC root must be an existing directory');
  return canonical;
}

/** Parse only the documented file-effect policy, never widen invalid input. */
export function policyFromJson(raw) {
  const value = JSON.parse(raw);
  if (!value || !['read-only', 'workspace-write'].includes(value.mode)
      || !Array.isArray(value.roots) || value.roots.length === 0
      || !value.host || typeof value.host.systemDrive !== 'string'
      || !/^[A-Za-z]:$/.test(value.host.systemDrive)
      || typeof value.host.localAppData !== 'string' || !isAbsolute(value.host.localAppData)) {
    throw new Error('invalid MXC file policy');
  }
  const roots = [...new Set(value.roots.map(directory))];
  if (value.mode === 'workspace-write' && roots.some(root => root.toLowerCase() === parse(root).root.toLowerCase())) {
    throw new Error('MXC writable roots must not be volume roots');
  }
  return { mode: value.mode, roots, host: { systemDrive: value.host.systemDrive, localAppData: value.host.localAppData } };
}

/** Host reads and networking remain available, matching DSH file-effect semantics. */
export function readRoots(roots) {
  const volumes = Array.from({ length: 26 }, (_, index) => `${String.fromCharCode(65 + index)}:\\`).filter(existsSync);
  return [...new Set([...volumes, ...[...roots, process.cwd(), process.execPath].map(root => parse(root).root)])];
}

export function requestFor(argv, policy, temp) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('invalid MXC command argv');
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ![
    'SYSTEMDRIVE', 'LOCALAPPDATA', 'MXC_FFI_DIR', 'MXC_BIN_DIR', 'DSH_MXC_CONTROL',
  ].includes(key.toUpperCase())));
  return {
    containment: { type: 'processcontainer', config: {
      capabilities: ['registryRead'],
      ui: { isolation: 'desktop', desktopSystemControl: false, systemSettings: 'none', ime: false },
    } },
    command: argv.map(quoteArg).join(' '),
    workingDirectory: process.cwd(),
    environment: {
      ...environment, SystemDrive: policy.host.systemDrive, LOCALAPPDATA: policy.host.localAppData,
      ...(temp === undefined ? {} : { TMP: temp, TEMP: temp }),
    },
    filesystem: {
      readonlyPaths: readRoots(policy.roots),
      readwritePaths: policy.mode === 'workspace-write' ? [...policy.roots, ...(temp === undefined ? [] : [resolve(temp)])] : [],
    },
    network: { egress: { default: 'allow' }, ingress: { default: 'allow', hostLoopback: 'allow' } },
    ui: { disable: false, clipboard: 'none', allowInputInjection: false },
  };
}

/** Structured rules preserve target exit 127 vs actual runner failure. */
export function confinedArgv(runner, argv, policy) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('invalid MXC command argv');
  return {
    argv: [...runner, JSON.stringify(policy), '--', ...argv],
    enforcement: 'partial',
    denialSignatures: [...DENIAL_SIGNATURES],
    runnerFailureRules: [{ allowedExitCodes: [FAILURE_EXIT], fatalSignatures: [FAILURE_SIGNATURE] }],
  };
}
