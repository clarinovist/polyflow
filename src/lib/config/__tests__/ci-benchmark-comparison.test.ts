import { describe, expect, it } from 'vitest';
import { validateComparison } from '../../../../scripts/ci/benchmark.mjs';

const expected = { run: '123', attempt: '1', sha: 'a'.repeat(40), fingerprint: 'lock' };
const file = { file: 'src/__tests__/fixture.test.ts', passed: 2, failed: 0, skipped: 1, pending: 0 };
const result = (candidate: string) => ({ ...expected, candidate, exitCode: 0,
    reason: 'passed', errors: 0, coverageGenerated: true, files: [{ ...file }] });
const singles = () => [result('default'), result('explicit')];
const merged = () => ({ ...result('shards'), coverageGenerated: false, globalCoveragePassed: true });

describe('option A benchmark comparison', () => {
    it('accepts only the full default comparator when shards were explicitly selected', () => {
        expect(() => validateComparison([result('default')], merged(), expected, 'shards')).not.toThrow();
    });

    it.each([[], [result('explicit')], singles(), [result('default'), result('default')]].map(reports => ({ reports })))(
        'rejects a missing, duplicate or unselected comparator (%j)', ({ reports }) => {
            expect(() => validateComparison(reports, merged(), expected, 'shards')).toThrow('comparator');
        },
    );

    it.each(['unknown', '', 'default'])('rejects unknown strategy %j', strategy => {
        expect(() => validateComparison(singles(), merged(), expected, strategy)).toThrow('strategy');
    });

    it.each(['run', 'attempt', 'sha', 'fingerprint'])('still rejects foreign %s', key => {
        expect(() => validateComparison([result('default')], { ...merged(), [key]: 'wrong' }, expected, 'shards'))
            .toThrow('identity');
    });

    it('preserves failure, coverage and exact count checks for the selected strategy', () => {
        expect(() => validateComparison([{ ...result('default'), exitCode: 1 }], merged(), expected, 'shards'))
            .toThrow('incomplete');
        expect(() => validateComparison([result('default')], { ...merged(), globalCoveragePassed: false }, expected, 'shards'))
            .toThrow('coverage');
        expect(() => validateComparison([result('default')], { ...merged(), files: [{ ...file, skipped: 2 }] }, expected, 'shards'))
            .toThrow('differ');
    });
});

describe('final benchmark comparison', () => {
    it('accepts both complete comparators and successful merged coverage', () => {
        expect(() => validateComparison(singles(), merged(), expected)).not.toThrow();
    });

    it.each([
        { reports: [] },
        { reports: [result('default')] },
        { reports: [result('default'), result('default')] },
    ])('rejects missing/duplicate comparators', ({ reports }) => {
        expect(() => validateComparison(reports, merged(), expected)).toThrow('comparator');
    });

    it.each(['run', 'attempt', 'sha', 'fingerprint'])('rejects a foreign %s in any input', key => {
        const comparators = singles();
        Object.assign(comparators[1], { [key]: 'wrong' });
        expect(() => validateComparison(comparators, merged(), expected)).toThrow('identity');
        expect(() => validateComparison(singles(), { ...merged(), [key]: 'wrong' }, expected)).toThrow('identity');
    });

    it.each([{ exitCode: 1 }, { reason: 'failed' }, { errors: 1 }, { files: [] },
        { files: [{ ...file, pending: 1 }] }, { files: [{ ...file, failed: 1 }] }])('rejects failed/incomplete inputs %j', patch => {
        const comparators = singles();
        Object.assign(comparators[0], patch);
        expect(() => validateComparison(comparators, merged(), expected)).toThrow('incomplete');
        expect(() => validateComparison(singles(), { ...merged(), ...patch }, expected)).toThrow('incomplete');
    });

    it('requires the post-process global coverage attestation, not the replay reporter flag', () => {
        const combined = merged();
        expect(combined.coverageGenerated).toBe(false); // Vitest merge does not replay onCoverage.
        expect(() => validateComparison(singles(), { ...combined, globalCoveragePassed: false }, expected)).toThrow('coverage');
        expect(() => validateComparison(singles(), { ...combined, candidate: 'default' }, expected)).toThrow('coverage');
        const comparators = singles();
        comparators[1].coverageGenerated = false;
        expect(() => validateComparison(comparators, combined, expected)).toThrow('coverage');
    });

    it('does not accept different skipped counts, missing files or changed assertions', () => {
        expect(() => validateComparison(singles(), { ...merged(), files: [{ ...file, skipped: 2 }] }, expected)).toThrow('differ');
        expect(() => validateComparison(singles(), { ...merged(), files: [{ ...file, passed: 1 }] }, expected)).toThrow('differ');
        const comparators = singles();
        comparators[1].files.push({ ...file, file: 'extra.test.ts' });
        expect(() => validateComparison(comparators, merged(), expected)).toThrow('differ');
    });
});
