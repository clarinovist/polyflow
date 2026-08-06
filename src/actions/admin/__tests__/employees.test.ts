import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getEmployees,
    getEmployeeById,
    updateEmployee,
} from '../employees';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn().mockResolvedValue({
        user: { id: 'actor-1', role: 'PRODUCTION' },
    }),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/hrd/salary-history', () => ({
    SALARY_FIELDS: [
        'payType',
        'dailyRate',
        'monthlySalary',
        'overtimeHourlyRate',
        'standardDayHours',
        'bpjsParticipant',
        'bpjsEmployeeDeduction',
        'bpjsEmployerCost',
    ],
    buildSalaryChanges: vi.fn().mockReturnValue(null),
    createSalaryHistory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        employee: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

const HRD_EMPLOYEE = {
    id: 'emp-1',
    code: 'EMP-001',
    name: 'Budi',
    role: 'OPERATOR',
    status: 'ACTIVE',
    pinHash: 'hashed-pin',
    payType: 'DAILY',
    dailyRate: 150000,
    monthlySalary: null,
    overtimeHourlyRate: 20000,
    standardDayHours: 8,
    bpjsParticipant: true,
    bpjsEmployeeDeduction: 50000,
    bpjsEmployerCost: 100000,
};

describe('employees action — salary access control', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getEmployeeById', () => {
        it('returns salary fields intact for HRD session', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'hrd-1', role: 'HRD' },
            } as any);
            vi.mocked(prisma.employee.findUnique).mockResolvedValue(
                HRD_EMPLOYEE as any,
            );

            const res = await getEmployeeById('emp-1');

            expect(res.success).toBe(true);
            if (res.success) {
                expect(res.data.dailyRate).toBe(150000);
                expect(res.data.pinHash).toBe('hashed-pin');
            }
        });

        it('redacts salary fields and pinHash for PRODUCTION session', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'prod-1', role: 'PRODUCTION' },
            } as any);
            vi.mocked(prisma.employee.findUnique).mockResolvedValue(
                HRD_EMPLOYEE as any,
            );

            const res = await getEmployeeById('emp-1');

            expect(res.success).toBe(true);
            if (res.success) {
                expect(res.data.dailyRate).toBeNull();
                expect(res.data.monthlySalary).toBeNull();
                expect(res.data.overtimeHourlyRate).toBeNull();
                expect(res.data.standardDayHours).toBeNull();
                expect(res.data.bpjsParticipant).toBeNull();
                expect(res.data.bpjsEmployeeDeduction).toBeNull();
                expect(res.data.bpjsEmployerCost).toBeNull();
                expect(res.data.payType).toBeNull();
                expect(res.data.pinHash).toBeNull();
                // Non-salary fields stay untouched.
                expect(res.data.name).toBe('Budi');
                expect(res.data.code).toBe('EMP-001');
                expect(res.data.role).toBe('OPERATOR');
            }
        });
    });

    describe('getEmployees', () => {
        it('redacts salary fields across the list for non-HRD/Finance/Admin session', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'prod-1', role: 'PRODUCTION' },
            } as any);
            vi.mocked(prisma.employee.findMany).mockResolvedValue([
                HRD_EMPLOYEE,
            ] as any);

            const res = await getEmployees();

            expect(res.success).toBe(true);
            if (res.success) {
                expect(res.data[0].dailyRate).toBeNull();
                expect(res.data[0].pinHash).toBeNull();
                expect(res.data[0].name).toBe('Budi');
            }
        });

        it('keeps salary fields for ADMIN session', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'admin-1', role: 'ADMIN' },
            } as any);
            vi.mocked(prisma.employee.findMany).mockResolvedValue([
                HRD_EMPLOYEE,
            ] as any);

            const res = await getEmployees();

            expect(res.success).toBe(true);
            if (res.success) {
                expect(res.data[0].dailyRate).toBe(150000);
            }
        });
    });

    describe('updateEmployee', () => {
        it('excludes salary fields from the Prisma update payload for PRODUCTION actor', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'prod-1', role: 'PRODUCTION' },
            } as any);
            vi.mocked(prisma.employee.findUnique).mockResolvedValue({
                id: 'emp-1',
                code: 'EMP-001',
                name: 'Budi',
                dailyRate: 150000,
                overtimeHourlyRate: 20000,
                standardDayHours: 8,
                payType: 'DAILY',
                status: 'ACTIVE',
                role: 'OPERATOR',
                monthlySalary: null,
                bpjsParticipant: false,
                bpjsEmployeeDeduction: null,
                bpjsEmployerCost: null,
            } as any);
            vi.mocked(prisma.employee.update).mockResolvedValue({
                ...HRD_EMPLOYEE,
                // Simulate DB leaving dailyRate untouched (no salary keys sent).
                dailyRate: 150000,
                name: 'Budi Santoso',
            } as any);

            const res = await updateEmployee('emp-1', {
                name: 'Budi Santoso',
                dailyRate: 999999, // attacker-controlled payload
            });

            expect(res.success).toBe(true);
            const updateCall = vi.mocked(prisma.employee.update).mock
                .calls[0][0];
            expect(updateCall.data).not.toHaveProperty('dailyRate');
            expect(updateCall.data).not.toHaveProperty('overtimeHourlyRate');
            expect(updateCall.data).not.toHaveProperty('standardDayHours');
            expect(updateCall.data).not.toHaveProperty('payType');
            expect(updateCall.data).toMatchObject({ name: 'Budi Santoso' });
        });

        it('applies salary changes normally for HRD actor', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'hrd-1', role: 'HRD' },
            } as any);
            vi.mocked(prisma.employee.findUnique).mockResolvedValue({
                id: 'emp-1',
                code: 'EMP-001',
                name: 'Budi',
                dailyRate: 150000,
                overtimeHourlyRate: 20000,
                standardDayHours: 8,
                payType: 'DAILY',
                status: 'ACTIVE',
                role: 'OPERATOR',
                monthlySalary: null,
                bpjsParticipant: false,
                bpjsEmployeeDeduction: null,
                bpjsEmployerCost: null,
            } as any);
            vi.mocked(prisma.employee.update).mockResolvedValue({
                ...HRD_EMPLOYEE,
                dailyRate: 200000,
            } as any);

            const res = await updateEmployee('emp-1', {
                dailyRate: 200000,
            });

            expect(res.success).toBe(true);
            const updateCall = vi.mocked(prisma.employee.update).mock
                .calls[0][0];
            expect(updateCall.data).toMatchObject({ dailyRate: 200000 });
        });
    });
});
