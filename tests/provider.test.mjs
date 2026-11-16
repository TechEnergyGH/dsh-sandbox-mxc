import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessError } from '@deepseek-ai/dsh-error';
import Provider, { MxcUnsupportedPolicyError } from '../lib/index.js';
const base = mkdtempSync(join(tmpdir(),'dsh-mxc-provider-'));
const workspace = join(base,'workspace'); const extra = join(base,'extra');
mkdirSync(workspace);mkdirSync(extra);
test.after(()=>rmSync(base,{recursive:true,force:true}));
function setup(status=0) {
  const ctx = new Context();
  ctx.logger = { info() {} };
  const provider = new Provider(ctx);
  let probes=0;
  provider.internals={ platform:'win32', probe:()=>{probes++;return {status};} };
  return {provider,probes:()=>probes};
}
test('passes policy additionalWritableRoots and caches only successful probe',async()=>{
  const {provider,probes}=setup();
  const result=await provider.confine(['node.exe','--version'],{mode:'workspace-write',workspaceRoot:workspace,additionalWritableRoots:[extra]});
  assert.deepEqual(JSON.parse(result.argv[2]).roots,[workspace,extra]);
  assert.equal(result.enforcement,'partial');
  await provider.confine(['node.exe'],{mode:'read-only',workspaceRoot:workspace,additionalWritableRoots:[extra]});
  assert.equal(probes(),1);
});
test('unavailable, failed and timeout probes all fail closed',async()=>{
  for(const status of [78,1,127,null]) {
    const {provider}=setup(status);
    await assert.rejects(provider.confine(['node.exe'],{mode:'read-only',workspaceRoot:workspace}),error=>error.code==='SANDBOX_UNAVAILABLE');
  }
});
test('ordinary startup exit 1 is not mislabeled as native capability refusal',async()=>{
  for (const [status,detail] of [[78,'native MXC/PSEC unavailable'],[1,'probe failed or timed out']]) {
    const {provider}=setup(status);
    await assert.rejects(provider.confine(['node.exe'],{mode:'read-only',workspaceRoot:workspace}),error=>error.code==='SANDBOX_UNAVAILABLE' && error.message.includes(detail));
  }
});
test('never wraps unconfined mode and obeys cancellation',async()=>{
  const {provider}=setup();
  for (const policy of [undefined, {}, {mode:'invalid',workspaceRoot:workspace}, {mode:'danger-full-access',workspaceRoot:workspace}]) {
    await assert.rejects(provider.confine(['node.exe'],policy),error=>error instanceof MxcUnsupportedPolicyError && error instanceof HarnessError && error.code==='SANDBOX_UNSUPPORTED_POLICY');
  }
  const controller=new AbortController();controller.abort();
  await assert.rejects(provider.confine(['node.exe'],{mode:'read-only',workspaceRoot:workspace},controller.signal),error=>error.name==='AbortError');
});
test('rejects unsupported hosts and invalid probe timeout',async()=>{
  const {provider}=setup();provider.internals.platform='linux';
  await assert.rejects(provider.confine(['node.exe'],{mode:'read-only',workspaceRoot:workspace}),error=>error.code==='SANDBOX_UNAVAILABLE');
  for(const probeTimeoutMs of [0,-1,Infinity,1.5])assert.throws(()=>new Provider(new Context(),{probeTimeoutMs}));
});
