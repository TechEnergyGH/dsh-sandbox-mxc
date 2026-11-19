"""Verify release identity, dependency pins, source bytes, and archive contents."""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
import tarfile
import json
import hashlib
from importlib.util import spec_from_file_location, module_from_spec

root = Path(__file__).resolve().parents[1]
expected = json.loads((root / 'package.json').read_text(encoding='utf-8'))
assert expected['name'] == 'dsh-sandbox-mxc'
version = expected['version']
assert '/' not in version and '\\' not in version
out = root / 'dist'
tgz = out / f'dsh-sandbox-mxc-{version}.tgz'
source = out / f'dsh-sandbox-mxc-{version}-source.zip'
allowed = set(expected['files']) | {'package.json'}
required_package = {'package/package.json'}
for name in expected['files']:
    path = root / name
    assert path.exists(), f'Missing package entry: {name}'
    if path.is_dir():
        required_package.update('package/' + file.relative_to(root).as_posix()
                                for file in path.rglob('*') if file.is_file())
    else:
        required_package.add('package/' + name)
with tarfile.open(tgz, 'r:gz') as archive:
    names = archive.getnames()
    assert len(names) == len(set(names)), 'duplicate archive entry'
    actual_files = set()
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        assert not path.is_absolute() and '..' not in path.parts
        assert path.parts[0] == 'package'
        assert member.isfile() or member.isdir(), 'links/special files are not release contents'
        if member.isfile():
            actual_files.add(member.name)
            relative = path.relative_to('package')
            assert relative.parts[0] in allowed, member.name
            # pnpm may normalize JSON property order; compare parsed fields below.
            if str(relative) != 'package.json':
                assert archive.extractfile(member).read() == (root / str(relative)).read_bytes(), member.name
    assert actual_files == required_package, ('package file mismatch', actual_files ^ required_package)
    manifest = json.load(archive.extractfile('package/package.json'))
    assert manifest == expected, 'packed manifest must preserve source fields'
    assert manifest['private'] is True
    assert manifest['engines']['dsh'] == '0.2.2-rc.5'
    assert manifest['engines']['node'] == '>=24.9.0'
    for section in ['dependencies', 'peerDependencies', 'devDependencies']:
        for name, pin in manifest.get(section, {}).items():
            if name.startswith('@deepseek-ai/dsh-'):
                assert pin == '0.2.2-rc.5', (name, pin)
    assert manifest['dependencies']['@microsoft/mxc-sdk'] == '1.0.1'

spec = spec_from_file_location('pack_source', root / 'scripts' / 'pack-source.py')
module = module_from_spec(spec)
spec.loader.exec_module(module)
required_source = {'dsh-sandbox-mxc/' + path.relative_to(root).as_posix()
                   for path in module.source_files(root)}
with ZipFile(source) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert len(names) == len(set(names))
    assert set(names) == required_source, ('source file mismatch', set(names) ^ required_source)
    for name in names:
        path = PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts
        relative = path.relative_to('dsh-sandbox-mxc')
        assert not any(part in ['node_modules', '.git', 'dist', '__pycache__'] for part in relative.parts)
        assert archive.read(name) == (root / str(relative)).read_bytes(), name
print(json.dumps({
    'version': version,
    'targetDsh': manifest['engines']['dsh'],
    'installPackageVerified': True,
    'sourceArchiveVerified': True,
    'sha256': {
        tgz.name: hashlib.sha256(tgz.read_bytes()).hexdigest(),
        source.name: hashlib.sha256(source.read_bytes()).hexdigest(),
    },
}, indent=2))
