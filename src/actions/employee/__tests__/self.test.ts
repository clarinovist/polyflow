import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionExecution: { findMany: vi.fn() },
        employeeLoan: { findMany: vi.fn() },
        employee: { findUnique: vi.fn() },
    },
}));
vi.mock('@/lib/auth/employee-session', () => ({
    requireEmployeeSession: vi.fn(),
}));
vi.mock('@/services/hrd/payroll-service', () => ({
    PayrollService: { getWeeklyPayroll: vi.fn() },
}));
vi.mock('@/services/hrd/attendance-service', () => ({
    AttendanceService: { listByEmployee: vi.fn() },
}));
vi.mock('@/services/hrd/payroll-monthly-service', () => ({
    PayrollMonthlyService: { listByEmployee: vi.fn() },
}));

import { requireEmployeeSession } from '@/lib/auth/employee-session';
import { prisma } from '@/lib/core/prisma';
import { PayrollService } from '@/services/hrd/payroll-service';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { PayrollMonthlyService } from '@/services/hrd/payroll-monthly-service';
import {
    getMyWeeklyPayroll,
    getMyAttendanceMonth,
    getMyProductions,
    getMyPayslips,
    getMyLoansAndBpjs,
} from '../self';

const session = { employeeId: 'emp-1', code: 'EMP-001', name: 'Budi' };

describe('getMyWeeklyPayroll', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(null);

        const result = await getMyWeeklyPayroll();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
        expect(PayrollService.getWeeklyPayroll).not.toHaveBeenCalled();
    });

    it('returns weekly payroll scoped to the session employee', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(session as any);
        vi.mocked(PayrollService.getWeeklyPayroll).mockResolvedValue({
            netPay: 500000,
        } as any);

        const result = await getMyWeeklyPayroll();

        expect(result.success).toBe(true);
        expect(PayrollService.getWeeklyPayroll).toHaveBeenCalledWith(
            expect.anything(),
            'emp-1',
            expect.any(Date),
            expect.any(Date),
        );
    });
});

describe('getMyAttendanceMonth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(null);

        const result = await getMyAttendanceMonth(2026, 8);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
    });

    it('returns attendance scoped to the session employee', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(session as any);
        vi.mocked(AttendanceService.listByEmployee).mockResolvedValue([
            { id: 'rec-1', status: 'PRESENT' },
        ] as any);

        const result = await getMyAttendanceMonth(2026, 8);

        expect(result.success).toBe(true);
        expect(AttendanceService.listByEmployee).toHaveBeenCalledWith(
            expect.anything(),
            'emp-1',
            expect.any(Date),
            expect.any(Date),
        );
    });
});

describe('getMyProductions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(null);

        const result = await getMyProductions();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
        expect(prisma.productionExecution.findMany).not.toHaveBeenCalled();
    });

    it('scopes production executions to the session employee as operator', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(session as any);
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            {
                id: 'ex-1',
                productionOrder: {
                    orderNumber: 'PO-1',
                    bom: { productVariant: { name: 'Karung', skuCode: 'SKU-1' } },
                },
                machine: { name: 'Mesin 1' },
                quantityProduced: 10,
                pieceEarnings: 5000,
                startTime: new Date(),
                endTime: new Date(),
            },
        ] as any);

        const result = await getMyProductions();

        expect(result.success).toBe(true);
        expect(prisma.productionExecution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ operatorId: 'emp-1' }),
            }),
        );
    });
});

describe('getMyPayslips', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(null);

        const result = await getMyPayslips();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
    });

    it('returns payslips scoped to the session employee', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(session as any);
        vi.mocked(PayrollMonthlyService.listByEmployee).mockResolvedValue([
            { id: 'slip-1', netPay: 4000000 },
        ] as any);

        const result = await getMyPayslips();

        expect(result.success).toBe(true);
        expect(PayrollMonthlyService.listByEmployee).toHaveBeenCalledWith(
            expect.anything(),
            'emp-1',
        );
    });
});

describe('getMyLoansAndBpjs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(null);

        const result = await getMyLoansAndBpjs();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
        expect(prisma.employeeLoan.findMany).not.toHaveBeenCalled();
    });

    it('scopes loans and bpjs/salary data to the session employee', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(session as any);
        vi.mocked(prisma.employeeLoan.findMany).mockResolvedValue([
            {
                id: 'loan-1',
                loanNumber: 'LOAN-1',
                principalAmount: 1000000,
                remainingBalance: 500000,
                status: 'ACTIVE',
                repaymentType: 'INSTALLMENT',
            },
        ] as any);
        vi.mocked(prisma.employee.findUnique).mockResolvedValue({
            bpjsParticipant: true,
            bpjsEmployeeDeduction: 50000,
            bpjsKesehatanNo: '123',
            bpjsKetenagakerjaanNo: '456',
            bankName: 'BCA',
            bankAccountNo: '789',
            monthlySalary: null,
            dailyRate: 150000,
        } as any);

        const result = await getMyLoansAndBpjs();

        expect(result.success).toBe(true);
        expect(prisma.employeeLoan.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { employeeId: 'emp-1' },
            }),
        );
        expect(prisma.employee.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'emp-1' } }),
        );
        expect(result.data?.loans[0].remaining).toBe(500000);
        expect(result.data?.bpjs?.participant).toBe(true);
    });
});
