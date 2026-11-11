import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { MyLeaveService, type MyLeaveInput } from '../leave-self-service';

// 2026-11-11 12:00 WIB
const NOW = new Date('2026-11-11T05:00:00.000Z');

function makeDb() {
    return {
        employee: { findUnique: vi.fn() },
        leaveRequest: {
            findFirst: vi.fn(),
            create: vi.fn(),
            findMany: vi.fn(),
        },
    };
}

type FakeDb = ReturnType<typeof makeDb>;

function asDb(db: FakeDb): PrismaClient {
    return db as unknown as PrismaClient;
}

function validInput(overrides: Partial<MyLeaveInput> = {}): MyLeaveInput {
    return {
        startDate: '2026-11-12',
        endDate: '2026-11-13',
        reasonCode: 'SICK',
        ...overrides,
    };
}

describe('MyLeaveService.create', () => {
    let db: FakeDb;

    beforeEach(() => {
        db = makeDb();
        db.employee.findUnique.mockResolvedValue({
            id: 'emp-1',
            status: 'ACTIVE',
        });
        db.leaveRequest.findFirst.mockResolvedValue(null);
        db.leaveRequest.create.mockImplementation(
            async ({ data }: { data: Record<string, unknown> }) => ({
                id: 'lr-1',
                ...data,
            }),
        );
    });

    async function expectRule(input: MyLeaveInput, message: RegExp) {
        await expect(
            MyLeaveService.create(asDb(db), 'emp-1', input, NOW),
        ).rejects.toThrow(message);
        await expect(
            MyLeaveService.create(asDb(db), 'emp-1', input, NOW),
        ).rejects.toBeInstanceOf(BusinessRuleError);
        expect(db.leaveRequest.create).not.toHaveBeenCalled();
    }

    it('creates a PENDING request with UTC-midnight dates', async () => {
        await MyLeaveService.create(asDb(db), 'emp-1', validInput(), NOW);

        const arg = db.leaveRequest.create.mock.calls[0][0];
        expect(arg.data).toEqual({
            employeeId: 'emp-1',
            type: 'SICK',
            startDate: new Date(Date.UTC(2026, 10, 12)),
            endDate: new Date(Date.UTC(2026, 10, 13)),
            reason: 'Sakit',
            status: 'PENDING',
        });
        expect(arg.data).not.toHaveProperty('documentUrl');
    });

    it('allows a request starting today (WIB)', async () => {
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ startDate: '2026-11-11', endDate: '2026-11-11' }),
            NOW,
        );
        expect(db.leaveRequest.create).toHaveBeenCalledTimes(1);
    });

    it('uses the WIB date, not UTC, for today', async () => {
        // 2026-11-10 20:00 UTC = 2026-11-11 03:00 WIB
        const lateUtc = new Date('2026-11-10T20:00:00.000Z');
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ startDate: '2026-11-11', endDate: '2026-11-11' }),
            lateUtc,
        );
        expect(db.leaveRequest.create).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['SICK', 'SICK', 'Sakit'],
        ['FAMILY', 'PERMISSION', 'Keperluan keluarga'],
        ['PERSONAL', 'PERMISSION', 'Urusan pribadi'],
    ] as const)('maps %s to type %s and label %s', async (code, type, label) => {
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ reasonCode: code }),
            NOW,
        );
        const data = db.leaveRequest.create.mock.calls[0][0].data;
        expect(data.type).toBe(type);
        expect(data.reason).toBe(label);
    });

    it('maps OTHER to type OTHER with the note appended', async () => {
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ reasonCode: 'OTHER', note: '  Urus dokumen  ' }),
            NOW,
        );
        const data = db.leaveRequest.create.mock.calls[0][0].data;
        expect(data.type).toBe('OTHER');
        expect(data.reason).toBe('Lainnya — Urus dokumen');
    });

    it('appends an optional note to non-OTHER reasons', async () => {
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ note: 'Demam tinggi' }),
            NOW,
        );
        expect(db.leaveRequest.create.mock.calls[0][0].data.reason).toBe(
            'Sakit — Demam tinggi',
        );
    });

    it('treats a whitespace-only note as empty', async () => {
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ note: '   ' }),
            NOW,
        );
        expect(db.leaveRequest.create.mock.calls[0][0].data.reason).toBe(
            'Sakit',
        );
    });

    it('rejects OTHER without a note', async () => {
        await expectRule(validInput({ reasonCode: 'OTHER' }), /keterangan/i);
    });

    it('rejects OTHER with a note shorter than 3 characters', async () => {
        await expectRule(
            validInput({ reasonCode: 'OTHER', note: ' ab ' }),
            /keterangan/i,
        );
    });

    it('rejects a note longer than 200 characters', async () => {
        await expectRule(
            validInput({ note: 'x'.repeat(201) }),
            /200 karakter/,
        );
    });

    it('accepts a note of exactly 200 characters', async () => {
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ note: 'x'.repeat(200) }),
            NOW,
        );
        expect(db.leaveRequest.create).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed date strings', async () => {
        await expectRule(validInput({ startDate: '12/11/2026' }), /tanggal/i);
        await expectRule(validInput({ endDate: '2026-11-13T00:00' }), /tanggal/i);
    });

    it('rejects impossible calendar dates', async () => {
        await expectRule(
            validInput({ startDate: '2026-02-30', endDate: '2026-03-01' }),
            /tanggal/i,
        );
    });

    it('rejects end before start', async () => {
        await expectRule(
            validInput({ startDate: '2026-11-13', endDate: '2026-11-12' }),
            /sebelum/i,
        );
    });

    it('rejects a start date in the past', async () => {
        await expectRule(
            validInput({ startDate: '2026-11-10', endDate: '2026-11-11' }),
            /lampau|kemarin|hari ini/i,
        );
    });

    it('rejects a start date more than 60 days ahead', async () => {
        // today + 61 = 2027-01-11
        await expectRule(
            validInput({ startDate: '2027-01-11', endDate: '2027-01-11' }),
            /60 hari/,
        );
    });

    it('accepts a start date exactly 60 days ahead', async () => {
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ startDate: '2027-01-10', endDate: '2027-01-10' }),
            NOW,
        );
        expect(db.leaveRequest.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a duration over 31 days', async () => {
        // 2026-11-12 .. 2026-12-14 = 33 days
        await expectRule(
            validInput({ startDate: '2026-11-12', endDate: '2026-12-14' }),
            /31 hari/,
        );
    });

    it('accepts a duration of exactly 31 days', async () => {
        await MyLeaveService.create(
            asDb(db),
            'emp-1',
            validInput({ startDate: '2026-11-12', endDate: '2026-12-12' }),
            NOW,
        );
        expect(db.leaveRequest.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown reason code', async () => {
        await expectRule(
            validInput({ reasonCode: 'VACATION' as never }),
            /alasan/i,
        );
    });

    it('throws NotFoundError when the employee does not exist', async () => {
        db.employee.findUnique.mockResolvedValue(null);
        await expect(
            MyLeaveService.create(asDb(db), 'emp-1', validInput(), NOW),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(db.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive employee', async () => {
        db.employee.findUnique.mockResolvedValue({
            id: 'emp-1',
            status: 'INACTIVE',
        });
        await expectRule(validInput(), /tidak aktif/i);
    });

    it('rejects an overlapping PENDING/APPROVED request of the same employee', async () => {
        db.leaveRequest.findFirst.mockResolvedValue({ id: 'existing' });

        await expect(
            MyLeaveService.create(asDb(db), 'emp-1', validInput(), NOW),
        ).rejects.toThrow('Sudah ada pengajuan izin pada tanggal tersebut');

        expect(db.leaveRequest.findFirst).toHaveBeenCalledWith({
            where: {
                employeeId: 'emp-1',
                status: { in: ['PENDING', 'APPROVED'] },
                startDate: { lte: new Date(Date.UTC(2026, 10, 13)) },
                endDate: { gte: new Date(Date.UTC(2026, 10, 12)) },
            },
            select: { id: true },
        });
        expect(db.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('does not hit the database when input validation fails', async () => {
        await expect(
            MyLeaveService.create(
                asDb(db),
                'emp-1',
                validInput({ startDate: 'bad' }),
                NOW,
            ),
        ).rejects.toThrow();
        expect(db.employee.findUnique).not.toHaveBeenCalled();
    });
});

describe('MyLeaveService.listMine', () => {
    it('lists only the given employee, newest first, with limited fields', async () => {
        const db = makeDb();
        db.leaveRequest.findMany.mockResolvedValue([]);

        await MyLeaveService.listMine(asDb(db), 'emp-1');

        expect(db.leaveRequest.findMany).toHaveBeenCalledWith({
            where: { employeeId: 'emp-1' },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                type: true,
                startDate: true,
                endDate: true,
                reason: true,
                status: true,
                reviewNotes: true,
                createdAt: true,
            },
        });
    });

    it('honours a custom limit and returns the rows', async () => {
        const db = makeDb();
        const rows = [{ id: 'lr-1' }];
        db.leaveRequest.findMany.mockResolvedValue(rows);

        const result = await MyLeaveService.listMine(asDb(db), 'emp-2', 3);

        expect(result).toBe(rows);
        expect(db.leaveRequest.findMany.mock.calls[0][0].take).toBe(3);
        expect(db.leaveRequest.findMany.mock.calls[0][0].where).toEqual({
            employeeId: 'emp-2',
        });
    });
});
