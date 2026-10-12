import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Reopen/dedupe simulation for the planned crash labels. These cases all
// submit then exit before settle; they pin requestId reuse but do not claim
// phase-accurate crash timing. `real-crash.test.ts` separately sends SIGKILL
// after observed sqlite_admitted, tool_started, and sqlite_final barriers.
const roots: string[] = [];
afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const SEED_POINTS = [
    'accept', // 1. after request accepted, before first model byte
    'stream', // 2. during model stream
    'admitted', // 3. after tool call persisted, before tool starts
    'tool', // 4. during replay-safe read-only tool
    'tool-result', // 5. after tool result, before next model request
    'final', // 6. after final durable answer, before projection
    'projected', // 7. after projection, before web done event
    'disconnect', // 8. SSE disconnect/reconnect
    'hardkill', // 9b. hard kill (no close)
    'recreate', // 11. worker recreate, same volume
] as const;

function child() {
    return path.resolve(
        'src/lib/bot/durable/__tests__/crash-matrix-child.mjs',
    );
}

function seed(database: string, point: string) {
    const seeded = spawnSync(
        process.execPath,
        [child(), database, `seed-${point}`],
        { encoding: 'utf8', timeout: 15_000 },
    );
    expect(seeded.status).toBe(73);
    expect(seeded.stdout).toMatch(/^\d+:\d+:seed-/);
}

function resume(database: string) {
    const out = execFileSync(process.execPath, [child(), database, 'resume'], {
        encoding: 'utf8',
        timeout: 30_000,
    });
    return JSON.parse(out) as {
        status: string;
        deduped: boolean;
        calls: number;
    };
}

describe('Pi Durable crash matrix (scoped subprocess dedupe)', () => {
    for (const point of SEED_POINTS) {
        it(`point ${point}: hard exit then resume settles one submission`, () => {
            const root = mkdtempSync(path.join(tmpdir(), 'polyflow-matrix-'));
            roots.push(root);
            const database = path.join(root, 'assistant.sqlite');
            seed(database, point);
            const result = resume(database);
            expect(result.status).toBe('done');
            expect(result.deduped).toBe(true);
            expect(result.calls).toBeLessThanOrEqual(1);
        });
    }

    it('point sigterm: graceful close then resume settles one submission', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'polyflow-matrix-'));
        roots.push(root);
        const database = path.join(root, 'assistant.sqlite');
        const closed = spawnSync(
            process.execPath,
            [child(), database, 'seed-sigterm'],
            { encoding: 'utf8', timeout: 15_000 },
        );
        expect(closed.status).toBe(0);
        const result = resume(database);
        expect(result.status).toBe('done');
        expect(result.deduped).toBe(true);
    });

    it('point web-restart: worker SQLite survives an unrelated process cycle', () => {
        // Modelled as seed + resume on the same file: the web process is not
        // involved in durable admission, so only the SQLite volume matters.
        const root = mkdtempSync(path.join(tmpdir(), 'polyflow-matrix-'));
        roots.push(root);
        const database = path.join(root, 'assistant.sqlite');
        seed(database, 'accept');
        const first = resume(database);
        expect(first.status).toBe('done');
        // Second resume proves idempotent re-observation after settle.
        const second = resume(database);
        expect(second.status).toBe('done');
        expect(second.deduped).toBe(true);
    });
});
