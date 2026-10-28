export interface ProductionCostRecoveryInspection {
    orderId: string;
    orderNumber: string;
    checkedAt: string;
    status:
        | 'eligible'
        | 'needs_review'
        | 'unsupported'
        | 'already_applied'
        | 'no_repair';
    savedQuantity: string;
    unit: string;
    outputEntries: number;
    nullCostScraps: number;
    wip: { valid: boolean; remaining: string | null; reason: string | null };
    findings: string[];
    previousAuditId: string | null;
    proposal: {
        fingerprint: string;
        absorbedValue: string;
        scraps: Array<{ movementId: string; quantity: string }>;
        recoveryStorageReady: boolean;
    } | null;
}

export interface ProductionCostRecoveryResult {
    auditId: string;
    alreadyApplied: boolean;
}
