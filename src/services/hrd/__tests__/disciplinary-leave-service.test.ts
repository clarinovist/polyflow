import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
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

// ── approve / reject (atomic guard + attendance sync) ──

type LeaveRow = {
    id: string;
    employeeId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    startDate: Date;
    endDate: Date;
};

const SHIFT_DEFAULT = {
    id: 'shift-default',
    plannedHours: null,
    startTime: '08:00',
    endTime: '16:00',
};
const SHIFT_ASSIGNED = {
    id: 'shift-assigned',
    plannedHours: 6,
    startTime: '09:00',
    endTime: '15:00',
    status: 'ACTIVE',
};

function leaveRow(overrides: Partial<LeaveRow> = {}): LeaveRow {
    return {
        id: 'l-1',
        employeeId: 'emp-1',
        status: 'PENDING',
        startDate: new Date('2026-01-05T00:00:00Z'),
        endDate: new Date('2026-01-07T00:00:00Z'),
        ...overrides,
    };
}

interface TxOptions {
    leave?: LeaveRow | null;
    claimCount?: number;
    existing?: Array<{ workDate: Date; clockInAt: Date | null }>;
    assignments?: Array<Record<string, unknown>>;
    defaultShift?: typeof SHIFT_DEFAULT | null;
}

function makeApproveDb(opts: TxOptions = {}) {
    const tx = {
        leaveRequest: {
            findUnique: vi
                .fn()
                .mockResolvedValue(opts.leave === undefined ? leaveRow() : opts.leave),
            updateMany: vi.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
        },
        attendanceRecord: {
            findMany: vi.fn().mockResolvedValue(opts.existing ?? []),
            findFirst: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        employeeShiftAssignment: {
            findMany: vi.fn().mockResolvedValue(opts.assignments ?? []),
        },
        workShift: {
            findFirst: vi
                .fn()
                .mockResolvedValue(
                    opts.defaultShift === undefined ? SHIFT_DEFAULT : opts.defaultShift,
                ),
        },
    };
    const db = {
        $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaClient;
    return { db, tx };
}

describe('LeaveService.approve — atomic status guard', () => {
    it('claims the request with updateMany filtered on PENDING', async () => {
        const { db, tx } = makeApproveDb();

        await LeaveService.approve(db, 'l-1', ' ok ', 'user-1');

        const arg = tx.leaveRequest.updateMany.mock.calls[0][0];
        expect(arg.where).toEqual({ id: 'l-1', status: 'PENDING' });
        expect(arg.data).toMatchObject({
            status: 'APPROVED',
            reviewedById: 'user-1',
            reviewNotes: 'ok',
        });
    });

    it('throws NotFoundError when the request does not exist', async () => {
        const { db, tx } = makeApproveDb({ leave: null });

        await expect(
            LeaveService.approve(db, 'missing', undefined, 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(tx.leaveRequest.updateMany).not.toHaveBeenCalled();
    });

    it('lets only one of two concurrent approvals through', async () => {
        const winner = makeApproveDb({ claimCount: 1 });
        const loser = makeApproveDb({ claimCount: 0 });

        const results = await Promise.allSettled([
            LeaveService.approve(winner.db, 'l-1', undefined, 'user-1'),
            LeaveService.approve(loser.db, 'l-1', undefined, 'user-2'),
        ]);

        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        const reason = (results[1] as PromiseRejectedResult).reason;
        expect(reason).toBeInstanceOf(BusinessRuleError);
        expect(reason.message).toBe('Pengajuan sudah diproses');
        expect(loser.tx.attendanceRecord.updateMany).not.toHaveBeenCalled();
        expect(loser.tx.attendanceRecord.createMany).not.toHaveBeenCalled();
    });

    it('rejects an unreasonably long range before claiming', async () => {
        const { db, tx } = makeApproveDb({
            leave: leaveRow({ endDate: new Date('2028-01-05T00:00:00Z') }),
        });

        await expect(
            LeaveService.approve(db, 'l-1', undefined, 'user-1'),
        ).rejects.toBeInstanceOf(BusinessRuleError);
        expect(tx.leaveRequest.updateMany).not.toHaveBeenCalled();
    });
});

describe('LeaveService.reject — atomic status guard', () => {
    it('claims the request with updateMany filtered on PENDING', async () => {
        const { db, tx } = makeApproveDb();

        const result = await LeaveService.reject(db, 'l-1', ' no ', 'user-1');

        const arg = tx.leaveRequest.updateMany.mock.calls[0][0];
        expect(arg.where).toEqual({ id: 'l-1', status: 'PENDING' });
        expect(arg.data).toMatchObject({ status: 'REJECTED', reviewNotes: 'no' });
        expect(result).toMatchObject({ id: 'l-1', status: 'REJECTED' });
    });

    it('is refused when the request was already approved', async () => {
        const { db } = makeApproveDb({ claimCount: 0 });

        await expect(
            LeaveService.reject(db, 'l-1', 'no', 'user-1'),
        ).rejects.toThrow('Pengajuan sudah diproses');
    });

    it('throws NotFoundError when the request does not exist', async () => {
        const { db } = makeApproveDb({ leave: null });

        await expect(
            LeaveService.reject(db, 'missing', 'no', 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe('LeaveService.approve — attendance sync', () => {
    it('only converts records without a clock-in to ON_LEAVE', async () => {
        const { db, tx } = makeApproveDb();

        await LeaveService.approve(db, 'l-1', undefined, 'user-1');

        const arg = tx.attendanceRecord.updateMany.mock.calls[0][0];
        expect(arg.where).toMatchObject({
            employeeId: 'emp-1',
            clockInAt: null,
        });
        expect(arg.data).toEqual({ status: 'ON_LEAVE', source: 'MANUAL' });
    });

    it('reports preserved records that already have a clock-in', async () => {
        const { db, tx } = makeApproveDb({
            existing: [
                {
                    workDate: new Date('2026-01-05T00:00:00Z'),
                    clockInAt: new Date('2026-01-05T01:00:00Z'),
                },
                { workDate: new Date('2026-01-06T00:00:00Z'), clockInAt: null },
            ],
        });

        const result = await LeaveService.approve(db, 'l-1', undefined, 'user-1');

        expect(result.preservedAttendanceCount).toBe(1);
        const created = tx.attendanceRecord.createMany.mock.calls[0][0].data;
        expect(created.map((r: { workDate: Date }) => r.workDate.toISOString())).toEqual([
            '2026-01-07T00:00:00.000Z',
        ]);
    });

    it('reports zero preserved records when none have a clock-in', async () => {
        const { db } = makeApproveDb();

        const result = await LeaveService.approve(db, 'l-1', undefined, 'user-1');

        expect(result.preservedAttendanceCount).toBe(0);
    });

    it('loads existing records with one query and no per-day lookup', async () => {
        const { db, tx } = makeApproveDb();

        await LeaveService.approve(db, 'l-1', undefined, 'user-1');

        expect(tx.attendanceRecord.findMany).toHaveBeenCalledTimes(1);
        expect(tx.attendanceRecord.findFirst).not.toHaveBeenCalled();
        expect(tx.attendanceRecord.create).not.toHaveBeenCalled();
        expect(tx.attendanceRecord.createMany).toHaveBeenCalledTimes(1);
        expect(tx.attendanceRecord.createMany.mock.calls[0][0].data).toHaveLength(3);
    });

    it('falls back to the default shift and its computed planned hours', async () => {
        const { db, tx } = makeApproveDb();

        await LeaveService.approve(db, 'l-1', undefined, 'user-1');

        const [first] = tx.attendanceRecord.createMany.mock.calls[0][0].data;
        expect(first).toMatchObject({
            workShiftId: 'shift-default',
            status: 'ON_LEAVE',
            source: 'MANUAL',
            plannedHours: 8,
        });
    });

    it('uses the assigned shift on days covered by an assignment', async () => {
        const { db, tx } = makeApproveDb({
            assignments: [
                {
                    effectiveFrom: new Date('2026-01-06T00:00:00Z'),
                    effectiveTo: null,
                    workShiftId: SHIFT_ASSIGNED.id,
                    workShift: SHIFT_ASSIGNED,
                },
            ],
        });

        await LeaveService.approve(db, 'l-1', undefined, 'user-1');

        const rows = tx.attendanceRecord.createMany.mock.calls[0][0].data;
        expect(rows.map((r: { workShiftId: string }) => r.workShiftId)).toEqual([
            'shift-default',
            'shift-assigned',
            'shift-assigned',
        ]);
        expect(rows[1].plannedHours).toBe(6);
    });

    it('skips creating records when no shift can be resolved', async () => {
        const { db, tx } = makeApproveDb({ defaultShift: null });

        await LeaveService.approve(db, 'l-1', undefined, 'user-1');

        expect(tx.attendanceRecord.createMany).not.toHaveBeenCalled();
    });
});
