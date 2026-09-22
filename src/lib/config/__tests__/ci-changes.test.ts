import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDocuments, checkStatus, safeDocuments, selectChanges } from '../../../../scripts/ci/changes.mjs';

const root = process.cwd();
let temp: string;
let repo: string;
let before: string;
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
}).trim();
function save(name: string, text = '# Contoh sintetis\n') {
    const path = resolve(repo, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
}
function commit() {
    git('add', '-A');
    git('-c', 'user.name=Uji CI', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false',
        'commit', '-qm', 'test: perubahan sintetis');
    return git('rev-parse', 'HEAD');
}
const event = (after: string) => ({ before, after, ref: 'refs/heads/main', forced: false });
const select = () => {
    const after = git('rev-parse', 'HEAD');
    return selectChanges(repo, 'push', event(after), after);
};

beforeEach(() => {
    temp = mkdtempSync(resolve(tmpdir(), 'polyflow-ci-changes-'));
    repo = resolve(temp, 'repo');
    mkdirSync(repo);
    git('init', '-q');
    save('README.md');
    save('src/example.ts', 'export const value = 1;\n');
    before = commit();
});
afterEach(() => rmSync(temp, { recursive: true, force: true }));

describe('klasifikasi perubahan CI', () => {
    it.each(safeDocuments)('memilih ringan hanya untuk dokumen allow-list %s', name => {
        save(name, '# Dokumentasi diperbarui\n');
        commit();
        expect(select().full).toBe(false);
        expect(() => checkDocuments(repo)).not.toThrow();
    });
    it.each(['src/example.ts', 'src/lib/config/__tests__/new.test.ts', 'package.json', 'package-lock.json',
        '.nvmrc', '.github/workflows/production.yml', 'Dockerfile', '.dockerignore', 'docker-compose.yml',
        'prisma/schema.prisma', 'prisma/migrations/example/migration.sql', 'scripts/ci/changes.mjs',
        'AGENTS.md', '.agents/AGENTS.md', 'docs/RUNBOOK.md', 'docs/development/ci-performance.md',
        'docs/new.md', 'public/example.svg', 'README.md.ts', 'docs/spasi dan\nbaris.md'])('campuran %s tetap lengkap', name => {
        save('README.md', '# Berubah\n');
        save(name, 'contoh\n');
        commit();
        expect(select().full).toBe(true);
    });
    it('daftar aman tertutup, bukan wildcard semua Markdown', () => {
        expect(safeDocuments).toEqual(['README.md', 'docs/README.md', 'docs/development/ci-selective.md']);
        expect(Object.isFrozen(safeDocuments)).toBe(true);
    });
    it('memeriksa seluruh push bukan hanya commit terakhir', () => {
        save('src/example.ts', 'export const value = 2;\n'); commit();
        save('README.md', '# Commit terakhir hanya dokumen\n'); commit();
        expect(select().full).toBe(true);
    });
    it('tidak terpotong oleh batas daftar 300 berkas', () => {
        for (let i = 0; i < 305; i++) save(`docs/synthetic-${i}.md`);
        save('src/example.ts', 'export const value = 2;\n'); commit();
        expect(select().full).toBe(true);
    });
    it.each([['src/example.ts', 'docs/README.md'], ['README.md', 'src/README.md']])('rename %s ke %s tetap memeriksa asal', (from, to) => {
        save(to, readFileSync(resolve(repo, from), 'utf8'));
        git('rm', from); commit();
        expect(select().full).toBe(true);
    });
    it('nama kapital bukan dokumen aman, termasuk pada filesystem Mac', () => {
        git('rm', 'README.md'); save('README.MD'); commit();
        expect(select().full).toBe(true);
    });
    it.each([['README.md', false], ['src/example.ts', true]] as const)('penghapusan %s diperiksa', (name, full) => {
        git('rm', name); commit();
        expect(select().full).toBe(full);
    });
    it('delta kosong tidak boleh melewati gate', () => expect(select().full).toBe(true));
    it.each(['workflow_dispatch', 'pull_request', '', 'schedule'])('event %j selalu lengkap', name => {
        save('README.md', '# Berubah\n'); const after = commit();
        expect(selectChanges(repo, name, { ...event(after), inputs: { full: false } }, after).full).toBe(true);
    });
    it.each([{ before: '0'.repeat(40) }, { before: null }, { before: 'a'.repeat(40) }, { before: '--help' },
        { before: 'HEAD^' }, { before: '$(touch tidak-dijalankan)' }, { after: 'b'.repeat(40) },
        { forced: true }, { forced: null }, { ref: 'refs/heads/other' }])('metadata meragukan selalu lengkap %j', patch => {
        save('README.md', '# Berubah\n'); const after = commit();
        expect(selectChanges(repo, 'push', { ...event(after), ...patch }, after).full).toBe(true);
    });
    it.each([null, [], 'push', {}])('event invalid tidak boleh menjadi ringan %j', value => {
        expect(selectChanges(repo, 'push', value, before).full).toBe(true);
    });
    it('checkout mismatch, Git gagal, dan nonancestor selalu lengkap', () => {
        save('README.md', '# Berubah\n'); const after = commit();
        expect(selectChanges(repo, 'push', event(before), before).full).toBe(true);
        expect(selectChanges(temp, 'push', event(after), after).full).toBe(true);
        const tree = git('rev-parse', 'HEAD^{tree}');
        const orphan = git('-c', 'user.name=Uji CI', '-c', 'user.email=ci@example.invalid', 'commit-tree', tree, '-m', 'test: orphan');
        expect(selectChanges(repo, 'push', { ...event(after), before: orphan }, after).full).toBe(true);
    });
});

describe('dokumen dan output CLI', () => {
    it.each(['<<<<<<< HEAD\nkonflik\n=======\n>>>>>>> lain\n', '# Teks\0rusak',
        '[rusak](missing.md)', '[keluar](../outside.md)'])('menolak dokumen invalid %j', text => {
        save('README.md', text);
        expect(() => checkDocuments(repo)).toThrow();
    });
    it('menolak UTF-8 invalid dan symlink termasuk dangling', () => {
        writeFileSync(resolve(repo, 'README.md'), Buffer.from([255]));
        expect(() => checkDocuments(repo)).toThrow();
        rmSync(resolve(repo, 'README.md'));
        symlinkSync('missing.md', resolve(repo, 'README.md'));
        expect(() => checkDocuments(repo)).toThrow();
    });
    it('tautan lokal aman diterima, eksternal dan anchor tidak diakses', () => {
        save('docs/README.md');
        save('README.md', '[lokal](docs/README.md#judul) [luar](https://example.invalid/tidak-diakses) [anchor](#judul)');
        expect(() => checkDocuments(repo)).not.toThrow();
    });
    it('penghapusan target tetap tertangkap dari dokumen yang tidak berubah', () => {
        save('docs/README.md'); save('README.md', '[lokal](docs/README.md)');
        before = commit(); git('rm', 'docs/README.md'); commit();
        expect(select().full).toBe(false);
        expect(() => checkDocuments(repo)).toThrow('tautan');
    });
    it('dokumen aman repo saat ini lolos', () => expect(() => checkDocuments(root)).not.toThrow());

    function cli(payload: string, after: string, name = 'push') {
        const script = resolve(repo, 'scripts/ci/changes.mjs');
        mkdirSync(dirname(script), { recursive: true });
        copyFileSync(resolve(root, 'scripts/ci/changes.mjs'), script);
        const output = resolve(temp, 'output');
        const summary = resolve(temp, 'summary');
        const eventPath = resolve(temp, 'event.json'); writeFileSync(eventPath, payload);
        const child = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 10_000,
            env: { ...process.env, GITHUB_EVENT_NAME: name, GITHUB_SHA: after,
                GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } });
        return { child, output, summary };
    }
    it.each([['push', false], ['workflow_dispatch', true]] as const)('CLI %s menulis boolean aman', (name, full) => {
        save('README.md', '# Berubah\n'); const after = commit();
        const { child, output, summary } = cli(JSON.stringify(event(after)), after, name);
        expect(child.status, child.stderr).toBe(0);
        expect(readFileSync(output, 'utf8')).toBe(`full=${full}\n`);
        expect(readFileSync(summary, 'utf8')).toContain('Pemilihan pemeriksaan');
        expect(child.stdout + child.stderr).not.toContain('README');
    });
    it('CLI payload rusak memilih lengkap', () => {
        const { child, output } = cli('{invalid', before);
        expect(child.status).toBe(0);
        expect(readFileSync(output, 'utf8')).toBe('full=true\n');
    });
    it('CLI dokumen gagal tidak menerbitkan skip atau nama masukan', () => {
        save('README.md', '[rusak](sentinel-sensitive.md)'); const after = commit();
        const { child, output } = cli(JSON.stringify(event(after)), after);
        expect(child.status).toBe(1);
        expect(existsSync(output)).toBe(false);
        expect(child.stdout + child.stderr).not.toContain('sentinel-sensitive');
    });
});

interface Needs { [name: string]: { result: string; outputs?: { full?: unknown } } }
function results(full: string, eventName = 'push'): Needs {
    const result = full === 'true' ? 'success' : 'skipped';
    const release = full === 'true' && eventName === 'push' ? 'success' : 'skipped';
    return { 'agents-consistency': { result: 'success', outputs: { full } },
        ...Object.fromEntries(['test-shards', 'test', 'lint', 'build-and-push', 'return-contract'].map(name => [name, { result }])),
        deploy: { result: release }, 'release-please': { result: release } };
}

describe('status akhir CI', () => {
    it.each([['true', 'push'], ['false', 'push'], ['true', 'workflow_dispatch']])('menerima jalur %s %s', (full, name) => {
        expect(() => checkStatus(results(full, name), name)).not.toThrow();
    });
    it.each(['failure', 'cancelled', 'skipped', 'success'])('memeriksa setiap job dengan status %s', status => {
        for (const [full, eventName] of [['true', 'push'], ['false', 'push'], ['true', 'workflow_dispatch']]) {
            for (const name of Object.keys(results(full, eventName))) {
                const needs = results(full, eventName);
                const valid = needs[name].result === status;
                needs[name].result = status;
                if (valid) expect(() => checkStatus(needs, eventName)).not.toThrow();
                else expect(() => checkStatus(needs, eventName), `${full}/${eventName}/${name}`).toThrow();
            }
        }
    });
    it.each(['', undefined, null, true, false, 'True'])('output invalid %j tidak menjadi ringan', full => {
        const needs = results('false'); needs['agents-consistency'].outputs = { full };
        expect(() => checkStatus(needs, 'push')).toThrow();
    });
    it('menolak job hilang dan dispatch ringan', () => {
        const needs = results('true'); delete needs.lint;
        expect(() => checkStatus(needs, 'push')).toThrow();
        expect(() => checkStatus(results('false', 'workflow_dispatch'), 'workflow_dispatch')).toThrow();
        expect(() => checkStatus(results('true'), 'unknown')).toThrow();
    });
});
