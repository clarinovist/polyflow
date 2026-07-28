import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getHrdMobileOverview } from '../mobile-dashboard';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
        attendanceRecord: {
            count: vi.fn(),
        },
        leaveRequest: {
            findMany: vi.fn(),
        },
        payrollPeriod: {
            findFirst: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

describe('getHrdMobileOverview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'u1',
            role: 'HRD',
            isActive: true,
        } as any);
    });

    it('returns empty HRD overview when authenticated', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'HRD' },
        } as any);

        vi.mocked(prisma.attendanceRecord.count).mockResolvedValue(0);
        vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([]);
        vi.mocked(prisma.payrollPeriod.findFirst).mockResolvedValue(null);

        const result = await getHrdMobileOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.presentTodayCount).toBe(0);
            expect(result.data.pendingLeaves).toEqual([]);
        }
    });

    it('returns HRD attendance and leave details', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'HRD' },
        } as any);

        vi.mocked(prisma.attendanceRecord.count).mockResolvedValue(42);
        vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([
            {
                id: 'leave-1',
                leaveType: 'Cuti Tahunan',
                startDate: new Date(),
                endDate: new Date(),
                status: 'PENDING',
                employee: { name: 'Budi Santoso' },
            } as any,
        ]);
        vi.mocked(prisma.payrollPeriod.findFirst).mockResolvedValue({
            month: 7,
            year: 2026,
        } as any);

        const result = await getHrdMobileOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.presentTodayCount).toBe(42);
            expect(result.data.highlights.pendingLeaveCount).toBe(1);
            expect(result.data.highlights.openPayrollPeriodName).toBe('Periode 7/2026');
            expect(result.data.pendingLeaves[0].employeeName).toBe('Budi Santoso');
        }
    });

    it('handles DB errors and returns fallback values', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'HRD' },
        } as any);

        vi.mocked(prisma.attendanceRecord.count).mockRejectedValue(new Error('DB Error'));
        vi.mocked(prisma.leaveRequest.findMany).mockRejectedValue(new Error('DB Error'));
        vi.mocked(prisma.payrollPeriod.findFirst).mockRejectedValue(new Error('DB Error'));

        const result = await getHrdMobileOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.presentTodayCount).toBe(0);
            expect(result.data.highlights.pendingLeaveCount).toBe(0);
            expect(result.data.highlights.openPayrollPeriodName).toBeUndefined();
        }
    });
});
