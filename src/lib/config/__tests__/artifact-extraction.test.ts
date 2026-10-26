import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'artifact-extract-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const script = resolve('scripts/ci/extract-artifacts.py');
const createZip = `import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as z:
 for name,body,mode in json.load(sys.stdin):
  info=zipfile.ZipInfo(name)
  info.external_attr=mode<<16
  z.writestr(info,body)
`;
function archive(directory: string, entries: [string, string, number][] = [['result.json', '{"ok":true}', 0]]) {
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'raw-download'); // Content-Disposition need not end in .zip.
    const result = spawnSync('python3', ['-c', createZip, file], {
        encoding: 'utf8', input: JSON.stringify(entries),
    });
    expect(result.status, result.stderr).toBe(0);
    return file;
}
function run(directory = root) { return spawnSync('python3', [script, directory], { encoding: 'utf8' }); }
function reject() {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Artifact extraction failed:');
}

describe('stdlib artifact extraction', () => {
    it.each([false, true])('preserves single/multiple artifact layout: multiple=%s', multiple => {
        const directories = multiple ? [join(root, 'shard-1'), join(root, 'shard-2')] : [root];
        const archives = directories.map(directory => archive(directory));
        const result = run();
        expect(result.status, result.stderr).toBe(0);
        expect(result.stderr).toBe('');
        for (const directory of directories) expect(JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'))).toEqual({ ok: true });
        for (const file of archives) expect(existsSync(file)).toBe(false);
    });

    it.each(['../outside.txt', '/absolute.txt', 'folder\\outside.txt'])('rejects unsafe member %s before extracting any archive', name => {
        const good = archive(join(root, 'first'));
        const bad = archive(join(root, 'second'), [[name, 'unsafe', 0]]);
        reject();
        expect(existsSync(join(root, 'first/result.json'))).toBe(false);
        expect(existsSync(good)).toBe(true);
        expect(existsSync(bad)).toBe(true);
    });

    it('extracts nested directories and rejects empty ZIPs or conflicting member paths', () => {
        archive(root, [['nested/', '', 0o40755], ['nested/result.json', '{}', 0]]);
        expect(run().status).toBe(0);
        expect(readFileSync(join(root, 'nested/result.json'), 'utf8')).toBe('{}');
        rmSync(join(root, 'nested'), { recursive: true });
        archive(root, []);
        reject();
        archive(root, [['parent', 'file', 0], ['parent/child', 'file', 0]]);
        reject();
        archive(root, [['raw-download', 'would overwrite the archive', 0]]);
        reject();
    });

    it('rejects mixed layouts and filesystem symlinks without changing files', () => {
        archive(root);
        archive(join(root, 'nested'));
        reject();
        expect(existsSync(join(root, 'result.json'))).toBe(false);
        symlinkSync(root, join(root, 'alias'));
        reject();
        expect(run(join(root, 'alias')).status).toBe(1);
        expect(run(join(root, 'missing')).status).toBe(1);
    });

    it('rejects symlinks', () => {
        archive(root, [['link', 'outside', 0o120777]]);
        reject();
        expect(existsSync(join(root, 'link'))).toBe(false);
    });

    it('fails on empty input, corrupt ZIPs and existing output rather than overwriting', () => {
        reject();
        const raw = join(root, 'raw-download');
        writeFileSync(raw, 'invalid zip');
        reject();
        archive(root);
        writeFileSync(join(root, 'result.json'), 'keep');
        reject();
        expect(readFileSync(join(root, 'result.json'), 'utf8')).toBe('keep');
    });
});
