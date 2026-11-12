import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createMachine,
    updateMachine,
    deleteMachine,
    setMachineStatus,
} from '../machines';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        machine: {
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

const newMachine = {
    name: 'Mesin A',
    code: 'M-01',
    type: 'EXTRUDER' as never,
    locationId: 'loc-1',
};

const actions: Array<[string, () => Promise<{ success: boolean }>]> = [
    ['createMachine', () => createMachine(newMachine) as never],
    ['updateMachine', () => updateMachine('m-1', { name: 'B' }) as never],
    ['deleteMachine', () => deleteMachine('m-1') as never],
    ['setMachineStatus', () => setMachineStatus('m-1', 'ACTIVE') as never],
];

describe('machine write actions — read-only FACTORY_MANAGER', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        asMock(prisma.machine.create).mockResolvedValue({ id: 'm-1' });
        asMock(prisma.machine.update).mockResolvedValue({ id: 'm-1' });
        asMock(prisma.machine.delete).mockResolvedValue({ id: 'm-1' });
    });

    it.each(actions)(
        '%s rejects FACTORY_MANAGER without ADMIN',
        async (_name, run) => {
            asMock(requireAuth).mockResolvedValue(
                sessionFor('FACTORY_MANAGER'),
            );

            const result = await run();

            expect(result.success).toBe(false);
            expect(prisma.machine.create).not.toHaveBeenCalled();
            expect(prisma.machine.update).not.toHaveBeenCalled();
            expect(prisma.machine.delete).not.toHaveBeenCalled();
        },
    );

    it.each(actions)(
        '%s allows FACTORY_MANAGER that also has ADMIN',
        async (_name, run) => {
            asMock(requireAuth).mockResolvedValue(
                sessionFor('FACTORY_MANAGER', ['FACTORY_MANAGER', 'ADMIN']),
            );

            const result = await run();

            expect(result.success).toBe(true);
        },
    );

    it.each(['PRODUCTION', 'PLANNING', 'WAREHOUSE', 'HRD'])(
        'role %s is unaffected',
        async (role) => {
            asMock(requireAuth).mockResolvedValue(sessionFor(role));

            const result = await createMachine(newMachine);

            expect(result.success).toBe(true);
            expect(prisma.machine.create).toHaveBeenCalledTimes(1);
        },
    );
});
