"""Build a versioned source archive without caches, diagnostics, or host dumps."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT_FILES = [
    'package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'README.md',
    'NOTICE.md', 'LICENSE', 'TEST-RESULTS.md', 'CHANGELOG.md',
    'CONTRIBUTING.md', 'SECURITY.md', '.gitignore', '.gitattributes',
    '.editorconfig', '.npmrc',
]
SOURCE_DIRS = ['lib', 'tests', 'scripts', 'docs', '.github']


def source_files(root):
    """Explicit public-source allowlist, shared with archive verification."""
    for name in ROOT_FILES:
        path = root / name
        if not path.is_file():
            raise ValueError(f'Missing required source file: {name}')
        yield path
    for directory in SOURCE_DIRS:
        for path in sorted((root / directory).rglob('*')):
            if not path.is_file():
                continue
            relative = path.relative_to(root)
            if '__pycache__' in relative.parts or path.suffix in ['.pyc', '.pyo']:
                continue
            if relative.as_posix() == 'scripts/inspect-runtime.mjs':
                continue  # Local-only host archive diagnostic; not plugin source.
            if path.is_symlink():
                raise ValueError(f'Refusing source symlink: {relative}')
            yield path


def main():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    assert manifest['name'] == 'dsh-sandbox-mxc'
    version = manifest['version']
    assert '/' not in version and '\\' not in version
    out = root / 'dist'
    out.mkdir(exist_ok=True)
    target = out / f'dsh-sandbox-mxc-{version}-source.zip'
    assert not target.exists(), f'Refusing to overwrite existing release: {target}'
    files = list(source_files(root))
    with ZipFile(target, 'x', ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, 'dsh-sandbox-mxc/' + path.relative_to(root).as_posix())
    print(target)


if __name__ == '__main__':
    main()
