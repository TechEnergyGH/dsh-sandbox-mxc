import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const runnerUrl = new URL('../lib/runner.js', import.meta.url).href;
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the independent runner pins its runtime dependency closure directly', () => {
  for (const name of [
    '@deepseek-ai/dsh-error',
    '@deepseek-ai/dsh-subprocess',
    '@deepseek-ai/dsh-win32-process',
  ]) {
    assert.equal(manifest.dependencies?.[name], '0.2.2-rc.3', `direct dependency ${name}`);
  }
  assert.equal(manifest.dependencies?.['@microsoft/mxc-sdk'], '1.0.1');
});

test('a fresh standalone Node imports the runner without host resolver or loader environment', {
  // Do not accidentally start a second Desktop GUI from an Electron test host.
  // Desktop/Electron and packed autoInstallPeers=false fixtures are verified separately.
  skip: process.versions.electron ? 'requires a standalone Node test host' : false,
}, () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => {
    const name = key.toUpperCase();
    return value !== undefined
      && name !== 'NODE_OPTIONS'
      && name !== 'NODE_PATH'
      && name !== 'ELECTRON_RUN_AS_NODE'
      && !name.startsWith('TSX_')
      && !name.startsWith('DSH_');
  }));
  const source = `const { runMxc } = await import(${JSON.stringify(runnerUrl)});\n`
    + `if (typeof runMxc !== 'function') throw new Error('runner export is missing');\n`;
  // Import only: do not call runMxc, SDK probe, or create any native container.
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
    timeout: 10_000,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null, 'runner import child must not terminate by signal');
  assert.equal(child.status, 0, 'runner import must resolve its own runtime dependencies');
});
