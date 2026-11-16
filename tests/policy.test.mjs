import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { quoteArg } from '../lib/win32.js';
import { policyFromJson, requestFor, confinedArgv, FAILURE_EXIT } from '../lib/policy.js';

const base = mkdtempSync(join(tmpdir(), 'dsh-mxc-unit-'));
const workspace = join(base, 'workspace');
const extra = join(base, 'cache');
mkdirSync(workspace); mkdirSync(extra);
const host = { systemDrive: process.env.SystemDrive ?? 'C:', localAppData: process.env.LOCALAPPDATA ?? base };
test.after(() => rmSync(base, { recursive: true, force: true }));
const policy = (mode, roots = [workspace]) => policyFromJson(JSON.stringify({mode, roots, host}));

test('Windows quoting handles empty, spaces, quotes and trailing slashes', () => {
  assert.equal(quoteArg(''), '""');
  assert.equal(quoteArg('plain'), 'plain');
  assert.equal(quoteArg('a b'), '"a b"');
  assert.equal(quoteArg('a"b'), '"a\\"b"');
  assert.equal(quoteArg('a b\\'), '"a b\\\\"');
  assert.throws(() => quoteArg('a\0b'));
});
test('reject malformed modes and roots rather than widening', () => {
  for(const value of [null, {}, {mode:'danger-full-access', roots:[workspace],host}, {mode:'workspace-write',roots:[],host}]) {
    assert.throws(() => policyFromJson(JSON.stringify(value)));
  }
  assert.throws(() => policy('workspace-write', ['relative']));
  assert.throws(() => policy('workspace-write', [join(base,'missing')]));
  assert.throws(() => policy('workspace-write', [parse(workspace).root]));
});
test('workspace-write keeps explicitly authorized extra directories', () => {
  const parsed = policy('workspace-write', [workspace,extra,workspace]);
  assert.equal(parsed.roots.length, 2);
  const request = requestFor(['node.exe', 'a b'], parsed, join(base,'private'));
  assert.deepEqual(request.filesystem.readwritePaths, [...parsed.roots,join(base,'private')]);
  assert.equal(request.containment.type, 'processcontainer');
  assert.equal(request.network.egress.default, 'allow');
  assert.equal(request.network.ingress.hostLoopback, 'allow');
});
test('read-only grants no writes, including private temp and extra roots', () => {
  const request = requestFor(['node.exe'], policy('read-only',[workspace,extra]), join(base,'private'));
  assert.deepEqual(request.filesystem.readwritePaths, []);
});
test('exact argv and partial/failure metadata survive wrapping', () => {
  const argv = ['C:\\with spaces\\node.exe', '-e', 'console.log("中")', ''];
  const wrapped = confinedArgv(['node.exe','runner.js'],argv,policy('read-only'));
  assert.deepEqual(wrapped.argv.slice(4), argv);
  assert.equal(wrapped.argv[3],'--');
  assert.equal(wrapped.enforcement,'partial');
  assert.deepEqual(wrapped.runnerFailureRules[0].allowedExitCodes,[FAILURE_EXIT]);
  assert.throws(() => confinedArgv(['runner'], [],policy('read-only')));
});
