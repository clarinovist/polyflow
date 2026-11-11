import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import {
    DisciplinaryService,
    LeaveService,
} from '../disciplinary-leave-service';

function makeDb() {
    const disciplinaryCreate = vi.fn().mockResolvedValue({ id: 'd-1' });
    const leaveCreate = vi.fn().mockResolvedValue({ id: 'l-1' });
    const db = {
        employee: {
            findUnique: vi
                .fn()
                .mockResolvedValue({ id: 'emp-1', name: 'A', code: 'E1' }),
        },
        disciplinaryAction: { create: disciplinaryCreate },
        leaveRequest: { create: leaveCreate },
    } as unknown as PrismaClient;
    return { db, disciplinaryCreate, leaveCreate };
}

const day = new Date('2026-01-05T00:00:00Z');
const disciplinaryBase = {
    employeeId: 'emp-1',
    type: 'SP1' as const,
    reason: 'Terlambat',
    effectiveDate: day,
};
const leaveBase = {
    employeeId: 'emp-1',
    type: 'SICK' as const,
    startDate: day,
    endDate: day,
};

describe('DisciplinaryService.create — documentUrl safety', () => {
    it('rejects an unsafe documentUrl without writing', async () => {
        const { db, disciplinaryCreate } = makeDb();

        await expect(
            DisciplinaryService.create(db, {
                ...disciplinaryBase,
                documentUrl: 'javascript:alert(1)',
            }),
        ).rejects.toBeInstanceOf(BusinessRuleError);
        expect(disciplinaryCreate).not.toHaveBeenCalled();
    });

    it('stores a safe documentUrl', async () => {
        const { db, disciplinaryCreate } = makeDb();
        const documentUrl = '/api/images/acme/hrd-docs/disciplinary/e/1.jpg';

        await DisciplinaryService.create(db, {
            ...disciplinaryBase,
            documentUrl,
        });

        expect(disciplinaryCreate.mock.calls[0][0].data.documentUrl).toBe(
            documentUrl,
        );
    });
});

describe('LeaveService.create — documentUrl safety', () => {
    it('rejects an unsafe documentUrl without writing', async () => {
        const { db, leaveCreate } = makeDb();

        await expect(
            LeaveService.create(db, {
                ...leaveBase,
                documentUrl: '//evil.test/a.jpg',
            }),
        ).rejects.toBeInstanceOf(BusinessRuleError);
        expect(leaveCreate).not.toHaveBeenCalled();
    });

    it('accepts a leave request without a documentUrl', async () => {
        const { db, leaveCreate } = makeDb();

        await LeaveService.create(db, leaveBase);

        expect(leaveCreate.mock.calls[0][0].data.documentUrl).toBeNull();
    });
});
