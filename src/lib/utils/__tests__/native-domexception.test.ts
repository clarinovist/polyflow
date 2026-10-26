import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = new URL('../../../../', import.meta.url);

describe('native DOMException dependency contract', () => {
    it('has no deprecated packages left in the dependency lock', () => {
        const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));
        expect(Object.entries(lock.packages).filter(([, value]) =>
            (value as { deprecated?: string }).deprecated)).toEqual([]);
    });

    it('exports the real native constructor and standard error properties', () => {
        const consumerRequire = createRequire(require.resolve('fetch-blob/from.js'));
        const NativeError = consumerRequire('node-domexception');
        expect(NativeError).toBe(globalThis.DOMException);
        const error = new NativeError('file changed', 'NotReadableError');
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('NotReadableError');
        expect(error.message).toBe('file changed');
        expect(error.code).toBe(0);
        expect(consumerRequire.resolve('node-domexception')).toMatch(/node-domexception\/index\.cjs$/);
    });

    it('fails explicitly if the native constructor is unavailable', () => {
        const source = readFileSync(new URL('vendor/node-domexception/index.cjs', root), 'utf8');
        expect(() => runInNewContext(source, { DOMException: undefined, module: { exports: {} } }))
            .toThrow('Polyflow requires a runtime with native DOMException');
    });

    it('keeps the real file-backed Blob read and changed-file rejection behavior', async () => {
        const { fileFrom } = await import('fetch-blob/from.js');
        const dir = mkdtempSync(join(tmpdir(), 'native-domexception-'));
        const file = join(dir, 'fixture.txt');
        try {
            writeFileSync(file, 'synthetic file contents');
            const blob = await fileFrom(file, 'text/plain');
            expect(await blob.text()).toBe('synthetic file contents');
            expect(await blob.slice(0, 9).text()).toBe('synthetic');
            const later = new Date(Date.now() + 10_000);
            utimesSync(file, later, later);
            await expect(blob.text()).rejects.toBeInstanceOf(DOMException);
            await expect(blob.text()).rejects.toMatchObject({ name: 'NotReadableError' });
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });

    it.each(['Dockerfile', 'Dockerfile.assistant-worker'])('%s ships the local dependency before install and at runtime', (file) => {
        const text = readFileSync(new URL(file, root), 'utf8');
        const deps = text.split('FROM base AS deps')[1].split('FROM base AS builder')[0];
        expect(deps.indexOf('COPY vendor/node-domexception')).toBeGreaterThan(-1);
        expect(deps.indexOf('COPY vendor/node-domexception')).toBeLessThan(deps.indexOf('npm ci'));
        const runner = text.split('FROM base AS runner')[1];
        expect(runner).toMatch(/COPY --from=deps .*\/app\/vendor\/node-domexception/);
    });
});
