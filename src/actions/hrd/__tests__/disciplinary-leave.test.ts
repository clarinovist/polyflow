import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDisciplinaryAction } from '../disciplinary-leave';
import { requireHrdApprover } from '@/lib/auth/hrd-access';
import { DisciplinaryService } from '@/services/hrd/disciplinary-leave-service';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/hrd-access', () => ({
    requireHrdApprover: vi.fn(),
    requireHrdFinance: vi.fn(),
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/services/hrd/disciplinary-leave-service', () => ({
    DisciplinaryService: { create: vi.fn() },
    LeaveService: {},
}));

describe('createDisciplinaryAction — issuer integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireHrdApprover).mockResolvedValue({
            user: { id: 'hrd-1', role: 'HRD' },
        } as never);
        vi.mocked(DisciplinaryService.create).mockResolvedValue({
            id: 'd-1',
            type: 'SP1',
            effectiveDate: new Date('2026-01-05T00:00:00Z'),
            employee: { code: 'E1', name: 'A' },
        } as never);
    });

    it('ignores a client-supplied issuedById and uses the session user', async () => {
        await createDisciplinaryAction({
            employeeId: 'emp-1',
            type: 'SP1',
            reason: 'Terlambat',
            effectiveDate: new Date('2026-01-05T00:00:00Z'),
            issuedById: 'someone-else',
        });

        const passed = vi.mocked(DisciplinaryService.create).mock.calls[0][1];
        expect(passed.issuedById).toBe('hrd-1');
    });

    it('sets issuedById from the session when the client sends none', async () => {
        await createDisciplinaryAction({
            employeeId: 'emp-1',
            type: 'SP1',
            reason: 'Terlambat',
            effectiveDate: new Date('2026-01-05T00:00:00Z'),
        });

        const passed = vi.mocked(DisciplinaryService.create).mock.calls[0][1];
        expect(passed.issuedById).toBe('hrd-1');
    });
});
