import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getEmployees,
} from '../employees';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('@/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'u-1', role: 'HRD' } }),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/hrd/salary-history', () => ({
    SALARY_FIELDS: ['payType', 'dailyRate'],
    buildSalaryChanges: vi.fn().mockReturnValue(null),
    createSalaryHistory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/hrd-access', () => ({
    hasHrdFinanceAccess: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        employee: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

const asMock = (fn: unknown) => vi.mocked(fn as (...args: never[]) => unknown);

const sessionFor = (role: string, roles: string[] = [role]) => ({
    user: { id: 'u-1', role, roles },
});

const newEmployee = { name: 'Budi', code: 'EMP-001', role: 'OPERATOR' };

const writes: Array<[string, () => Promise<{ success: boolean }>]> = [
    ['createEmployee', () => createEmployee(newEmployee) as never],
    ['updateEmployee', () => updateEmployee('e-1', { name: 'X' }) as never],
    ['deleteEmployee', () => deleteEmployee('e-1') as never],
];

function expectNoEmployeeWrite() {
    expect(prisma.employee.create).not.toHaveBeenCalled();
    expect(prisma.employee.update).not.toHaveBeenCalled();
    expect(prisma.employee.delete).not.toHaveBeenCalled();
}

describe('employee write actions — read-only FACTORY_MANAGER', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        asMock(prisma.employee.findUnique).mockResolvedValue({
            id: 'e-1',
            code: 'EMP-001',
            name: 'Budi',
            role: 'OPERATOR',
            payType: 'DAILY',
        });
        asMock(prisma.employee.create).mockResolvedValue({
            id: 'e-1',
            code: 'EMP-001',
            name: 'Budi',
            role: 'OPERATOR',
            payType: 'DAILY',
            dailyRate: 0,
        });
        asMock(prisma.employee.update).mockResolvedValue({ id: 'e-1' });
        asMock(prisma.employee.delete).mockResolvedValue({ id: 'e-1' });
        asMock(prisma.employee.findMany).mockResolvedValue([]);
    });

    it.each(writes)(
        '%s rejects FACTORY_MANAGER without ADMIN with the role message',
        async (_name, run) => {
            asMock(requireAuth).mockResolvedValue(
                sessionFor('FACTORY_MANAGER'),
            );

            const result = (await run()) as {
                success: boolean;
                error?: string;
                code?: string;
            };

            expect(result.success).toBe(false);
            expect(result.code).toBe('AUTHORIZATION_ERROR');
            expect(result.error).toMatch(/Kepala pabrik/);
            expectNoEmployeeWrite();
        },
    );

    it('deleteEmployee allows FACTORY_MANAGER that also has ADMIN', async () => {
        asMock(requireAuth).mockResolvedValue(
            sessionFor('FACTORY_MANAGER', ['FACTORY_MANAGER', 'ADMIN']),
        );

        const result = await deleteEmployee('e-1');

        expect(result.success).toBe(true);
        expect(prisma.employee.delete).toHaveBeenCalledTimes(1);
    });

    it.each(['PRODUCTION', 'WAREHOUSE', 'HRD'])(
        'deleteEmployee is unaffected for %s',
        async (role) => {
            asMock(requireAuth).mockResolvedValue(sessionFor(role));

            const result = await deleteEmployee('e-1');

            expect(result.success).toBe(true);
            expect(prisma.employee.delete).toHaveBeenCalledTimes(1);
        },
    );

    it('updateEmployee and createEmployee still work for HRD', async () => {
        asMock(requireAuth).mockResolvedValue(sessionFor('HRD'));

        const updated = await updateEmployee('e-1', { name: 'X' });
        const created = await createEmployee(newEmployee);

        expect(updated.success).toBe(true);
        expect(created.success).toBe(true);
    });

    it('read action getEmployees stays available to FACTORY_MANAGER', async () => {
        asMock(requireAuth).mockResolvedValue(sessionFor('FACTORY_MANAGER'));

        const result = await getEmployees();

        expect(result.success).toBe(true);
    });
});
