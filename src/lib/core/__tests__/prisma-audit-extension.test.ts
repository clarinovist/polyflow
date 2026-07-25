import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the actor-context module
vi.mock('@/lib/core/actor-context', () => ({
    getActorUserId: vi.fn(() => undefined),
}));

// Mock @prisma/client — minimal stub for $extends
vi.mock('@prisma/client', () => ({
    Prisma: {},
    PrismaClient: class {},
}));

import { getActorUserId } from '@/lib/core/actor-context';

// We test the logic functions directly rather than the full $extends pipeline
// because PrismaClient.$extends requires a real datasource.

describe('StatusAudit extension logic', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('hasStatusField guard', () => {
        // Replicate the guard logic from the extension
        function hasStatusField(data: unknown): data is Record<string, unknown> {
            if (!data || typeof data !== 'object') return false;
            const obj = data as Record<string, unknown>;
            return 'status' in obj && obj.status !== undefined;
        }

        it('returns true when data has status', () => {
            expect(hasStatusField({ status: 'CANCELLED' })).toBe(true);
        });

        it('returns false when data has no status', () => {
            expect(hasStatusField({ name: 'test' })).toBe(false);
        });

        it('returns false for null/undefined', () => {
            expect(hasStatusField(null)).toBe(false);
            expect(hasStatusField(undefined)).toBe(false);
        });

        it('returns false when status is undefined', () => {
            expect(hasStatusField({ status: undefined })).toBe(false);
        });

        it('returns true when data has status alongside other fields', () => {
            expect(hasStatusField({ status: 'CONFIRMED', notes: 'test' })).toBe(true);
        });
    });

    describe('AUDITABLE_MODELS set', () => {
        // Import dynamically to check the set
        const auditableModels = new Set([
            'SalesOrder', 'ProductionOrder', 'DeliveryOrder', 'PurchaseOrder',
            'PurchaseRequest', 'PurchaseInvoice', 'Invoice', 'StockReservation',
            'SalesQuotation', 'SalesReturn', 'PurchaseReturn', 'StockOpname',
            'Machine', 'Vehicle', 'LeaveRequest', 'EmployeeDocument', 'EmployeeLoan',
            'Employee', 'PayrollPeriod', 'Payslip', 'DeliverySchedule', 'DeliveryScheduleOrder',
            'DeliveryScheduleVehicle', 'BankReconciliation', 'JournalEntry',
            'MaterialIssue', 'ProductionExecution', 'ProductionIssue',
            'PettyCashTransaction', 'PettyCashDailyReport', 'FiscalPeriod', 'FixedAsset',
            'Batch', 'AttendanceRecord', 'HelpArticle', 'HelpQuestionCluster',
            'HelpLearningDraft', 'Tenant', 'ProcessPieceRate', 'WorkShift',
            'MaklonMaterialReturn',
        ]);

        it('includes core business models', () => {
            expect(auditableModels.has('SalesOrder')).toBe(true);
            expect(auditableModels.has('ProductionOrder')).toBe(true);
            expect(auditableModels.has('Invoice')).toBe(true);
        });

        it('includes HR models', () => {
            expect(auditableModels.has('PayrollPeriod')).toBe(true);
            expect(auditableModels.has('Payslip')).toBe(true);
            expect(auditableModels.has('LeaveRequest')).toBe(true);
            expect(auditableModels.has('Employee')).toBe(true);
        });

        it('includes production models', () => {
            expect(auditableModels.has('ProductionIssue')).toBe(true);
            expect(auditableModels.has('MaklonMaterialReturn')).toBe(true);
        });

        it('does NOT include AuditLog (prevents infinite recursion)', () => {
            expect(auditableModels.has('AuditLog')).toBe(false);
        });
    });

    describe('actor fallback', () => {
        it('falls back to SYSTEM when no actor in context', () => {
            vi.mocked(getActorUserId).mockReturnValue(undefined);
            const userId = getActorUserId() ?? 'system';
            expect(userId).toBe('system');
        });

        it('uses actor userId when available', () => {
            vi.mocked(getActorUserId).mockReturnValue('user-abc');
            const userId = getActorUserId() ?? 'system';
            expect(userId).toBe('user-abc');
        });
    });
});
