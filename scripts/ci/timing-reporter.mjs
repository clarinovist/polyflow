import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { availableParallelism } from 'node:os';
import { emit } from './metrics.mjs';

// Public Reporter lifecycle in installed Vitest 4.1.11. onCoverage occurs
// AFTER generation, onTestRunEnd BEFORE report rendering/threshold checking.
export default class TimingReporter {
    onInit(ctx) {
        this.root = ctx.config.root;
        this.start = performance.now();
        this.lastModule = this.start;
        this.coverageGenerated = false;
        emit({ kind: 'vitest-config', pool: ctx.config.pool,
            maxWorkers: ctx.config.maxWorkers ?? Math.max(availableParallelism() - 1, 1),
            workerSource: ctx.config.maxWorkers ? 'explicit' : 'vitest-4-run-default',
            isolate: ctx.config.isolate, fileParallelism: ctx.config.fileParallelism ?? true,
            shard: ctx.config.shard ?? null, merging: Boolean(ctx.config.mergeReports) });
    }
    onTestModuleEnd() { this.lastModule = performance.now(); }
    onCoverage(coverage) {
        this.coverageGenerated = Boolean(coverage && typeof coverage.files === 'function' && coverage.files().length);
        emit({ kind: 'vitest-phase', phase: 'coverage-generation-tail',
            seconds: (performance.now() - this.lastModule) / 1000 });
    }
    onTestRunEnd(modules, errors, reason) {
        const end = performance.now();
        emit({ kind: 'vitest-phase', phase: 'init-through-last-module',
            seconds: (this.lastModule - this.start) / 1000 });
        // Includes report rendering, threshold checks and teardown; not pure coverage time.
        process.once('exit', () => emit({ kind: 'vitest-phase',
            phase: 'report-and-teardown', seconds: (performance.now() - end) / 1000 }));
        if (!process.env.CI_TEST_MANIFEST) return;
        const files = modules.map(module => {
            const counts = { passed: 0, failed: 0, skipped: 0, pending: 0 };
            for (const test of module.children.allTests()) {
                const state = test.result().state;
                if (state === 'passed' || state === 'failed' || state === 'skipped') counts[state]++;
                else counts.pending++;
            }
            return { file: relative(this.root, module.moduleId), ...counts };
        }).sort((a, b) => a.file.localeCompare(b.file));
        writeFileSync(process.env.CI_TEST_MANIFEST, JSON.stringify({
            reason, errors: errors.length, coverageGenerated: this.coverageGenerated, files,
        }));
    }
}
