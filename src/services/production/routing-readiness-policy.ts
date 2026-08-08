/**
 * Pure logic for route readiness - no DB calls
 * Used by both UI hints and server enforcement
 */

export type RouteReadinessStatus =
    | 'WAITING_WIP'
    | 'PARTIAL_WIP'
    | 'READY'
    | 'FIRST_STEP';

export type ReadinessInput = {
    isFirstStep: boolean;
    predecessorOutputAvailable: number; // base qty available from previous step not yet allocated
    requiredQty: number; // qty required for this step
    allowsPartialHandoff: boolean;
    isLegacy: boolean; // legacy order without route
};

export function computeReadiness(input: ReadinessInput): {
    status: RouteReadinessStatus;
    canStart: boolean;
    availableQty: number;
    reason?: string;
} {
    if (input.isLegacy || input.isFirstStep) {
        return {
            status: 'FIRST_STEP',
            canStart: true,
            availableQty: input.predecessorOutputAvailable,
        };
    }

    if (input.predecessorOutputAvailable <= 0) {
        return {
            status: 'WAITING_WIP',
            canStart: false,
            availableQty: 0,
            reason: 'Menunggu output step sebelumnya',
        };
    }

    if (input.predecessorOutputAvailable >= input.requiredQty) {
        return {
            status: 'READY',
            canStart: true,
            availableQty: input.predecessorOutputAvailable,
        };
    }

    // partial available
    if (input.allowsPartialHandoff) {
        return {
            status: 'PARTIAL_WIP',
            canStart: true,
            availableQty: input.predecessorOutputAvailable,
            reason: `Sebagian WIP tersedia (${input.predecessorOutputAvailable}/${input.requiredQty})`,
        };
    }

    return {
        status: 'WAITING_WIP',
        canStart: false,
        availableQty: input.predecessorOutputAvailable,
        reason: `WIP tidak cukup (${input.predecessorOutputAvailable}/${input.requiredQty}) — partial handoff tidak diizinkan`,
    };
}

export function canConsumeWip(
    availableUnallocated: number,
    requestedQty: number,
): { allowed: boolean; reason?: string } {
    if (requestedQty <= 0)
        return { allowed: false, reason: 'Quantity harus > 0' };
    if (availableUnallocated < requestedQty) {
        return {
            allowed: false,
            reason: `Tidak boleh melebihi WIP available (${availableUnallocated} < ${requestedQty})`,
        };
    }
    return { allowed: true };
}

export type RouteValidationIssue = {
    code: string;
    severity: 'BLOCKING' | 'WARNING';
    stepCode?: string;
    message: string;
    field?: string;
};

export type ValidateRouteInput = {
    steps: Array<{
        stepCode: string;
        sequence: number;
        bomId: string;
        bomOutputVariantId: string;
        bomIsActive: boolean;
        processCode: string;
        processIsActive: boolean;
        processRequiresMachine: boolean;
        materialSourceLocationId?: string | null;
        outputLocationId?: string | null;
        sourceLocationActive?: boolean;
        outputLocationActive?: boolean;
        isRiskyOutput?: boolean;
        isRiskySource?: boolean;
        bomItems: Array<{ productVariantId: string }>;
        hasCapableMachine: boolean;
    }>;
    finalProductVariantId: string;
};

export function validateRouteContinuity(
    input: ValidateRouteInput,
): RouteValidationIssue[] {
    const issues: RouteValidationIssue[] = [];

    if (input.steps.length === 0) {
        issues.push({
            code: 'ROUTE_NO_STEPS',
            severity: 'BLOCKING',
            message: 'Route harus memiliki minimal 1 step',
        });
        return issues;
    }

    const sorted = [...input.steps].sort((a, b) => a.sequence - b.sequence);

    // Check sequence gaps/duplicates
    const seqSet = new Set<number>();
    const codeSet = new Set<string>();
    for (const s of sorted) {
        if (seqSet.has(s.sequence)) {
            issues.push({
                code: 'ROUTE_DUPLICATE_SEQUENCE',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `Sequence ${s.sequence} duplikat`,
                field: 'sequence',
            });
        }
        seqSet.add(s.sequence);
        if (codeSet.has(s.stepCode)) {
            issues.push({
                code: 'ROUTE_DUPLICATE_STEPCODE',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `stepCode ${s.stepCode} duplikat`,
                field: 'stepCode',
            });
        }
        codeSet.add(s.stepCode);
    }

    // Check gaps
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].sequence !== i) {
            issues.push({
                code: 'ROUTE_SEQUENCE_GAP',
                severity: 'BLOCKING',
                stepCode: sorted[i].stepCode,
                message: `Sequence gap: expected ${i}, got ${sorted[i].sequence}`,
                field: 'sequence',
            });
        }
    }

    // Check each step
    for (const s of sorted) {
        if (!s.bomIsActive) {
            issues.push({
                code: 'ROUTE_INACTIVE_BOM',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `BOM step ${s.stepCode} tidak aktif`,
                field: 'bomId',
            });
        }
        if (!s.processIsActive) {
            issues.push({
                code: 'ROUTE_INACTIVE_PROCESS',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `Process ${s.processCode} tidak aktif`,
                field: 'processId',
            });
        }
        if (s.processRequiresMachine && !s.hasCapableMachine) {
            issues.push({
                code: 'ROUTE_NO_CAPABLE_MACHINE',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `Process ${s.stepCode} butuh mesin tapi tidak ada capability`,
                field: 'processId',
            });
        }
        // I1: required output location
        if (!s.outputLocationId) {
            issues.push({
                code: 'ROUTE_MISSING_OUTPUT_LOCATION',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `Output location step ${s.stepCode} wajib diisi`,
                field: 'outputLocationId',
            });
        }
        // G2 fix: an empty source location is not an error — the runtime resolves
        // it to the predecessor step's outputLocationId — but it is worth
        // surfacing so planners know WIP will be tracked implicitly. WARNING
        // (not BLOCKING) on purpose: validateRoute is re-run by createRun, and a
        // BLOCKING issue here would retroactively break every ACTIVE (immutable)
        // route that was published before this check existed.
        if (s.sequence > 0 && !s.materialSourceLocationId) {
            issues.push({
                code: 'ROUTE_MISSING_SOURCE_LOCATION',
                severity: 'WARNING',
                stepCode: s.stepCode,
                message: `Lokasi sumber step ${s.stepCode} kosong — WIP akan diambil dari lokasi output step sebelumnya.`,
                field: 'materialSourceLocationId',
            });
        }
        if (s.materialSourceLocationId && s.sourceLocationActive === false) {
            issues.push({
                code: 'ROUTE_INVALID_SOURCE_LOCATION',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `Source location step ${s.stepCode} tidak aktif`,
                field: 'materialSourceLocationId',
            });
        }
        if (s.outputLocationId && s.outputLocationActive === false) {
            issues.push({
                code: 'ROUTE_INVALID_OUTPUT_LOCATION',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `Output location step ${s.stepCode} tidak aktif`,
                field: 'outputLocationId',
            });
        }
        if (s.isRiskyOutput) {
            issues.push({
                code: 'ROUTE_RISKY_OUTPUT_LOCATION',
                severity: 'BLOCKING',
                stepCode: s.stepCode,
                message: `Output location step ${s.stepCode} risky (RM/supplies/inactive)`,
                field: 'outputLocationId',
            });
        }
        if (s.isRiskySource) {
            issues.push({
                code: 'ROUTE_RISKY_SOURCE_LOCATION',
                severity: 'WARNING',
                stepCode: s.stepCode,
                message: `Source location step ${s.stepCode} terlihat risky`,
                field: 'materialSourceLocationId',
            });
        }
    }

    // Last step must produce final variant
    const last = sorted[sorted.length - 1];
    if (last.bomOutputVariantId !== input.finalProductVariantId) {
        issues.push({
            code: 'ROUTE_FINAL_OUTPUT_MISMATCH',
            severity: 'BLOCKING',
            stepCode: last.stepCode,
            message: `Output step terakhir harus ${input.finalProductVariantId}, got ${last.bomOutputVariantId}`,
            field: 'bomId',
        });
    }

    // Chain validation
    for (let i = 0; i < sorted.length - 1; i++) {
        const cur = sorted[i];
        const next = sorted[i + 1];
        const nextConsumes = next.bomItems.some(
            (item) => item.productVariantId === cur.bomOutputVariantId,
        );
        if (!nextConsumes) {
            issues.push({
                code: 'ROUTE_STEP_OUTPUT_DISCONNECTED',
                severity: 'BLOCKING',
                stepCode: next.stepCode,
                message: `Output ${cur.stepCode} (${cur.bomOutputVariantId}) tidak ada di BOM ${next.stepCode}`,
                field: 'bomId',
            });
        }
    }

    return issues;
}
