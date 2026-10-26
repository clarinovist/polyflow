import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
type Step = { uses?: string; run?: string; with?: Record<string, unknown> };

describe('artifact download runtime and digest safety', () => {
    it('uses the reviewed ESM action without disabling digest checks', () => {
        const downloads = ['ci.yml', 'ci-benchmark.yml', 'production.yml'].flatMap(file => {
            const workflow = load(readFileSync(`.github/workflows/${file}`, 'utf8')) as {
                jobs: Record<string, { steps: Step[] }>;
            };
            const steps = Object.values(workflow.jobs).flatMap(job => job.steps);
            for (const [index, step] of steps.entries()) {
                if (step.uses?.startsWith('actions/download-artifact@')) {
                    expect(steps[index + 1].run).toBe(`python3 scripts/ci/extract-artifacts.py ${step.with?.path}`);
                }
            }
            return steps.filter(step => step.uses?.startsWith('actions/download-artifact@'));
        });
        expect(downloads).toHaveLength(5);
        for (const step of downloads) {
            expect(step.uses).toBe('actions/download-artifact@v8.0.2');
            expect(step.with?.['digest-mismatch'] ?? 'error').toBe('error');
            expect(step.with?.['skip-decompress']).toBe(true);
        }
    });
});
