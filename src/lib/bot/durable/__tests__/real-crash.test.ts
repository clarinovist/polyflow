import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];
afterEach(() => {
    for (const child of children.splice(0)) {
        if (!child.killed) child.kill('SIGKILL');
    }
    for (const root of roots.splice(0))
        rmSync(root, { recursive: true, force: true });
});

const childScript = path.resolve(
    'src/lib/bot/durable/__tests__/real-crash-child.mjs',
);

function killAtPhase(database: string, phase: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [childScript, database, 'seed', phase],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        children.push(child);
        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('phase timeout: ' + phase + ' ' + stderr));
        }, 15_000);
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
            if (!stdout.includes('PHASE:' + phase)) return;
            clearTimeout(timeout);
            child.once('exit', () => resolve());
            child.kill('SIGKILL');
        });
        child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', (code, signal) => {
            if (!stdout.includes('PHASE:' + phase)) {
                clearTimeout(timeout);
                reject(
                    new Error(
                        'child exited before phase: ' +
                            phase +
                            ' code=' +
                            code +
                            ' signal=' +
                            signal +
                            ' stderr=' +
                            stderr,
                    ),
                );
            }
        });
    });
}

function resume(database: string, phase: string) {
    return JSON.parse(
        execFileSync(
            process.execPath,
            [childScript, database, 'resume', phase],
            { encoding: 'utf8', timeout: 30_000 },
        ),
    ) as { status: string; deduped: boolean };
}

describe('Pi Durable real process phase recovery', () => {
    for (const phase of [
        'sqlite_admitted',
        'tool_started',
        'sqlite_final',
    ]) {
        it('SIGKILL at ' + phase + ' resumes one submission', async () => {
            const root = mkdtempSync(path.join(tmpdir(), 'polyflow-real-crash-'));
            roots.push(root);
            const database = path.join(root, 'assistant.sqlite');
            await killAtPhase(database, phase);
            expect(resume(database, phase)).toEqual({
                status: 'done',
                deduped: true,
            });
        }, 45_000);
    }
});
