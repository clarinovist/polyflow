import { describe, expect, it } from 'vitest';
import {
    buildPurchasingDashboardAwaitingApprovalRequestWhere,
    buildPurchasingDashboardWaitingReceiptWhere,
} from '../purchasing-dashboard-query';

describe('purchasing dashboard query owners', () => {
    it('keeps awaiting approval OPEN-only', () => {
        expect(buildPurchasingDashboardAwaitingApprovalRequestWhere()).toEqual({
            status: 'OPEN',
        });
    });

    it('keeps the operational receipt queue on SENT and PARTIAL_RECEIVED', () => {
        expect(buildPurchasingDashboardWaitingReceiptWhere()).toEqual({
            status: { in: ['SENT', 'PARTIAL_RECEIVED'] },
        });
    });
});
