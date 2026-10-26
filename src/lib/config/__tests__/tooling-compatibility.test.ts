import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');

// Exercise the installed framework rules; never silence a newly enabled rule.
describe('framework and native Node tooling compatibility', () => {
    it.each([
        'src/app/production/orders/create/production-order-form.tsx',
        'src/components/sales/routes/WeeklyRouteBoard.tsx',
        'src/hooks/useOpnameAutosave.ts',
    ])('%s passes the installed React rules', async (file) => {
        const results = await new ESLint().lintFiles([file]);
        expect(results.flatMap(result => result.messages)).toEqual([]);
    // Cold ESLint/React rule loading took 6.3s on a coverage shard; this is a
    // compatibility assertion, not a 5s performance budget. Keep it bounded.
    }, 20_000);

    it('runs the CI JEV entry point without implicit module detection', () => {
        const workflow = load(readFileSync('.github/workflows/ci.yml', 'utf8'));
        const steps = Object.values(workflow.jobs).flatMap((job: any) => job.steps ?? []);
        const command = steps.find((step: any) => step.run?.includes('node scripts/smoke-assistant-jev.mjs')
            || step.run?.includes(' scripts/smoke-assistant-jev.mjs'))?.run;
        expect(command).toMatch(/^node(?: --[\w=-]+)* scripts\/smoke-assistant-jev\.mjs$/);
        const result = spawnSync(process.execPath, command.split(' ').slice(1), {
            encoding: 'utf8', env: { PATH: process.env.PATH, NODE_ENV: 'test' },
        });
        // No credential and no network: this checks loader compatibility, not live inference.
        expect(result.status).toBe(1);
        expect(result.stderr.trim()).toBe('SYSTEMONE_API_KEY is required.');
    });
});
