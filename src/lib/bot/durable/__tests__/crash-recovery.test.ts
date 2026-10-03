import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Pi Durable subprocess crash recovery', () => {
    it('reopens the same SQLite submission after abrupt process exit', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'polyflow-crash-'));
        roots.push(root);
        const database = path.join(root, 'assistant.sqlite');
        const script = path.resolve(
            'src/lib/bot/durable/__tests__/crash-child.mjs',
        );
        const seeded = spawnSync(process.execPath, [script, database, 'seed'], {
            encoding: 'utf8',
            timeout: 10_000,
        });
        expect(seeded.status).toBe(73);
        expect(seeded.stdout).toMatch(/^\d+:\d+/);
        const resumed = execFileSync(
            process.execPath,
            [script, database, 'resume'],
            { encoding: 'utf8', timeout: 15_000 },
        );
        expect(JSON.parse(resumed)).toEqual({ status: 'done', calls: 1 });
    });
});
