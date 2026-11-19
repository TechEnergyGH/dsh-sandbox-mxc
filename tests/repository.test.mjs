import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const markdown = [
  ...readdirSync(root).filter(name => name.endsWith('.md')).map(name => join(root, name)),
  ...readdirSync(join(root, 'docs')).filter(name => name.endsWith('.md')).map(name => join(root, 'docs', name)),
];

test('public Markdown links stay within the repository and resolve', () => {
  for (const file of markdown) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))\)/g)) {
      const target = match[1] ?? match[2];
      if (/^(https?:|mailto:|#)/i.test(target)) continue;
      const resolved = resolve(dirname(file), decodeURIComponent(target.split('#')[0]));
      const path = relative(root, resolved);
      assert.ok(!path.startsWith('..'), `${file}: link escapes repository: ${target}`);
      assert.ok(existsSync(resolved), `${file}: broken link: ${target}`);
    }
  }
});

test('public documentation does not expose machine-specific paths or external logs', () => {
  for (const file of markdown) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /[A-Z]:[\\/](?:Users|TechEnergy|Program Files)/i, file);
    assert.doesNotMatch(text, /\.\.\/compatibility-rc3\//, file);
  }
});

test('package includes every root and docs Markdown file used by public documentation', () => {
  for (const file of markdown) {
    const path = relative(root, file).replaceAll('\\', '/');
    assert.ok(manifest.files.some(entry => path === entry || path.startsWith(entry + '/')), path);
  }
});

test('repository stays private to npm and exposes reproducible release commands', () => {
  assert.equal(manifest.private, true);
  assert.equal(manifest.packageManager, 'pnpm@11.28.5');
  const sourcePacker = readFileSync(join(root, 'scripts', 'pack-source.py'), 'utf8');
  assert.ok(sourcePacker.includes("'pnpm-workspace.yaml'"), 'source archive must retain pnpm release-age policy');
  const policy = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const exceptions = [...policy.matchAll(/^\s*- '([^']+)'$/gm)].map(match => match[1]);
  assert.equal(exceptions.length, 21, 'only the reviewed DSH package family is excluded from the release-age delay');
  for (const identity of exceptions) {
    assert.match(identity, /^@deepseek-ai\/dsh-[\w-]+@0\.2\.2-rc\.5$/, identity);
  }
  for (const name of ['test:control', 'pack:plugin', 'pack:source', 'verify:release']) {
    assert.equal(typeof manifest.scripts[name], 'string', name);
  }
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  for (const entry of ['node_modules/', 'dist/', 'integration-result.json', 'control-integration-result.json', 'scripts/inspect-runtime.mjs']) {
    assert.ok(ignore.split(/\r?\n/).includes(entry), entry);
  }
});
