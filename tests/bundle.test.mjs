import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot';
const patches=loadOverlayPatches('dsh',fileURLToPath(new URL('../cordis.patch.yml',import.meta.url)));
const base=[{insert:[{id:'sandbox',name:'@deepseek-ai/dsh-sandbox-local'},{id:'pwsh-sandbox',name:'@deepseek-ai/dsh-pwsh-sandbox'},{id:'fs-sandbox',name:'@deepseek-ai/dsh-fs-sandbox'}]}];
test('actual DSH composer disables legacy sandbox and inserts exactly one MXC provider',()=>{
  const warnings=[];const entries=composeEntries([base,patches],warning=>warnings.push(warning));
  assert.deepEqual(warnings,[]);
  assert.equal(entries.find(e=>e.id==='sandbox').disabled,true);
  assert.equal(entries.filter(e=>e.name==='dsh-sandbox-mxc').length,1);
  assert.equal(entries.find(e=>e.id==='pwsh-sandbox').name,'@deepseek-ai/dsh-pwsh-sandbox');
  assert.equal(entries.find(e=>e.id==='fs-sandbox').name,'@deepseek-ai/dsh-fs-sandbox');
  assert.equal(entries.find(e=>e.id==='sandbox-mxc').config.probeTimeoutMs,15000);
});
test('removing the bundle restores original sandbox without touching permission modes',()=>{
  const entries=composeEntries([base]);assert.equal(entries.find(e=>e.id==='sandbox').disabled,undefined);
  assert.equal(entries.some(e=>e.id==='sandbox-mxc'),false);
  assert.equal(patches.some(e=>e.id==='sandbox-policy'||e.id==='approval'),false);
});
test('manifest pins reviewed rc.3 DSH dependencies and SDK and packages the bundle patch',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(manifest.version,'0.2.0-local.4');
  assert.equal(manifest.engines.node,'>=24.9.0');
  assert.equal(manifest.engines.dsh,'0.2.2-rc.3');
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-sandbox'],'0.2.2-rc.3');
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-error'],'0.2.2-rc.3');
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-app-boot'],'0.2.2-rc.3');
  assert.equal(manifest.dependencies['@microsoft/mxc-sdk'],'1.0.1');
  assert.equal(manifest.dsh.bundle.patch,'./cordis.patch.yml');assert.ok(manifest.files.includes('lib'));
  // A child Node process does not inherit the DSH host's peer resolver.
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-subprocess'],'0.2.2-rc.3');
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-win32-process'],'0.2.2-rc.3');
});
