import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Context } from '@deepseek-ai/cordis';
import { HarnessError } from '@deepseek-ai/dsh-error';
import { SandboxProvider, classifyRunnerFailure, matchesSignature } from '@deepseek-ai/dsh-sandbox';
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot';
import { SUBPROCESS_CONTROL_FD, SUBPROCESS_CONTROL_ENV, openInheritedControlChannel } from '@deepseek-ai/dsh-subprocess/control';
import * as win32 from '@deepseek-ai/dsh-win32-process';
import Provider, { MxcSandboxProvider, MxcUnsupportedPolicyError } from '../lib/index.js';
import { confinedArgv, FAILURE_EXIT, FAILURE_SIGNATURE } from '../lib/policy.js';

const DSH_VERSION = '0.2.2-rc.3';
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// These are seam regressions, not native PSEC capability tests. They neither
// probe MXC nor start processes, open fd7, write scratch trees, or load Win32 FFI.
function mxcMetadata() {
  return confinedArgv(['node.exe', 'runner.js'], ['node.exe', '--version'], {
    mode: 'read-only', roots: [process.cwd()],
  });
}

test('rc.3 imports the real MXC provider and preserves SandboxProvider inheritance', () => {
  assert.equal(Provider, MxcSandboxProvider);
  assert.ok(Provider.prototype instanceof SandboxProvider);
  assert.ok(new Provider(new Context()) instanceof SandboxProvider);
});

test('unsupported modes use the local HarnessError without the removed sandbox export', async () => {
  const error = new MxcUnsupportedPolicyError('unsupported test policy');
  assert.ok(error instanceof HarnessError);
  assert.equal(error.code, 'SANDBOX_UNSUPPORTED_POLICY');

  const provider = new Provider(new Context());
  // This must reject before any platform check, filesystem preparation, or probe.
  await assert.rejects(provider.confine(['node.exe'], {
    mode: 'danger-full-access', workspaceRoot: process.cwd(),
  }), rejected => rejected instanceof MxcUnsupportedPolicyError
    && rejected instanceof HarnessError
    && rejected.code === 'SANDBOX_UNSUPPORTED_POLICY');
});

test('the real DSH version gate accepts the manifest on rc.3 and rejects rc.1', () => {
  assert.equal(manifest.engines.dsh, DSH_VERSION);
  assert.equal(evaluatePluginCompatibility(manifest, {}, DSH_VERSION), undefined);

  const issue = evaluatePluginCompatibility(manifest, {}, '0.2.2-rc.1');
  assert.ok(issue, 'the rc.3-only manifest must reject rc.1 without an exemption');
  assert.equal(issue.name, manifest.name);
  assert.equal(issue.version, manifest.version);
  assert.equal(issue.runtimeVersion, '0.2.2-rc.1');
  assert.deepEqual(issue.requirements, { 'engines.dsh': DSH_VERSION });
  assert.equal(issue.exempted, false);
});

test('DSH manifest pins and the installed seam packages all target rc.3', () => {
  for (const group of ['dependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(manifest[group] ?? {})) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
        assert.equal(version, DSH_VERSION, `${group}.${name}`);
      }
    }
  }
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-error'], DSH_VERSION);

  // Bare package resolution verifies pnpm's actual dependencies, not an audit
  // download or a sibling checkout. This also checks the runner's own packages.
  for (const name of ['dsh-sandbox', 'dsh-error', 'dsh-subprocess', 'dsh-win32-process', 'dsh-app-boot']) {
    const installed = JSON.parse(readFileSync(new URL(import.meta.resolve(`@deepseek-ai/${name}/package.json`)), 'utf8'));
    assert.equal(installed.version, DSH_VERSION, `installed @deepseek-ai/${name}`);
  }
});

test('rc.3 retains the six native runner exports and inherited fd7 contract', () => {
  for (const name of [
    'closeHandleChecked', 'isJobEmpty', 'loadWin32ProcessBindings',
    'pollProcessExit', 'spawnCurrentTokenJobProcess', 'terminateJob',
  ]) {
    assert.equal(typeof win32[name], 'function', name);
  }
  assert.equal(SUBPROCESS_CONTROL_FD, 7);
  assert.equal(SUBPROCESS_CONTROL_ENV, 'DSH_SUBPROCESS_CONTROL');
  assert.equal(typeof openInheritedControlChannel, 'function');
});

test('rc.3 classifier does not conflate target exit 127 with MXC runner failure', () => {
  const { runnerFailureRules, denialSignatures } = mxcMetadata();
  for (const stderr of ['', 'target failed', 'permission denied']) {
    assert.equal(classifyRunnerFailure(FAILURE_EXIT, stderr, runnerFailureRules), undefined);
  }
  assert.equal(matchesSignature(FAILURE_EXIT, 'permission denied', denialSignatures), true);

  const fatalLine = `${FAILURE_SIGNATURE}native capability unavailable`;
  assert.deepEqual(classifyRunnerFailure(FAILURE_EXIT, `diagnostic\n${fatalLine}\n`, runnerFailureRules), {
    detail: fatalLine,
  });
  for (const exitCode of [0, 42, null]) {
    assert.equal(classifyRunnerFailure(exitCode, fatalLine, runnerFailureRules), undefined);
  }
});

test('MXC metadata permits runner-failure precedence over denial-like stderr', () => {
  const { runnerFailureRules, denialSignatures } = mxcMetadata();
  const fatalLine = `${FAILURE_SIGNATURE}access is denied during native startup`;
  const stderr = `permission denied\r\n${fatalLine}\r\n`;
  const failure = classifyRunnerFailure(FAILURE_EXIT, stderr, runnerFailureRules);
  assert.deepEqual(failure, { detail: fatalLine });
  assert.equal(matchesSignature(FAILURE_EXIT, stderr, denialSignatures), true);

  // DSH consumers classify runner failure first: a matching denial phrase must
  // not override infrastructure failure. This tests the shared classifiers and
  // metadata composition, not the pwsh executor's complete execution lifecycle.
  const denied = failure === undefined && matchesSignature(FAILURE_EXIT, stderr, denialSignatures);
  assert.equal(denied, false);
});

// Extra-root authorization and read-only write grants are covered by the
// provider/policy tests; actual native fd7 and Job cleanup belong to integration.
