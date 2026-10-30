export interface AtkRecoveryIntent {
    sourceMovementId: string;
    kind: 'REFUND' | 'COMPENSATION';
}
export interface AtkRecoveryPreview {
    status: 'eligible' | 'blocked' | 'already_applied';
    message: string;
    proposal?: AtkRecoveryIntent & {
        fingerprint: string;
        postingDate: string;
        amount: string;
        originalLoss: string;
        expectedLoss: string;
        unitCost: string;
        inventoryAccount: string;
        lossAccount: string;
        backupReady: boolean;
    };
    receipt?: AtkRecoveryReceipt;
}
export interface AtkRecoveryReceipt {
    id: string;
    kind: string;
    journalId: string;
    amount: string;
    postingDate: string;
    sourceMovementId: string;
    alreadyApplied: boolean;
}
export interface AtkRecoveryApply extends AtkRecoveryIntent {
    requestId: string;
    fingerprint: string;
    postingDate: string;
    reason: string;
    confirmed: true;
}
