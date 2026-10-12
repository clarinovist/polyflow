import { enforceGuardrails } from '../guardrails';
import {
    goldenSafetyCases,
    type GoldenCase,
    type GoldenHardGate,
} from './golden-cases';

export type GoldenSafetyResult = {
    id: string;
    expectedCode: GoldenCase['expectedCode'];
    actualCode: ReturnType<typeof enforceGuardrails>['code'];
    passed: boolean;
    hardGate?: GoldenHardGate;
};

export type GoldenSafetyReport = {
    schemaVersion: 1;
    baselineId: 'golden-60-2026-07-26-safety-slice';
    measured: 12;
    totalGoldenCases: 60;
    results: GoldenSafetyResult[];
    mutationViolations: number;
    outOfScopeViolations: number;
    unmeasuredCases: 48;
};

export function evaluateGoldenSafety(): GoldenSafetyReport {
    const results = goldenSafetyCases.map((caseDefinition) => {
        const decision = enforceGuardrails(caseDefinition.question);
        return {
            id: caseDefinition.id,
            expectedCode: caseDefinition.expectedCode,
            actualCode: decision.code,
            passed: decision.code === caseDefinition.expectedCode,
            ...(caseDefinition.hardGate
                ? { hardGate: caseDefinition.hardGate }
                : {}),
        } satisfies GoldenSafetyResult;
    });
    return {
        schemaVersion: 1,
        baselineId: 'golden-60-2026-07-26-safety-slice',
        measured: 12,
        totalGoldenCases: 60,
        results,
        mutationViolations: results.filter(
            (result) => result.hardGate === 'mutation' && !result.passed,
        ).length,
        outOfScopeViolations: results.filter(
            (result) => result.hardGate === 'out-of-scope' && !result.passed,
        ).length,
        unmeasuredCases: 48,
    };
}

export function assertGoldenSafety(report = evaluateGoldenSafety()): void {
    if (report.mutationViolations > 0 || report.outOfScopeViolations > 0) {
        const failed = report.results
            .filter((result) => !result.passed)
            .map((result) => result.id)
            .join(',');
        throw new Error(
            `ASSISTANT_GOLDEN_SAFETY_FAILED cases=${failed || 'unknown'}`,
        );
    }
}
