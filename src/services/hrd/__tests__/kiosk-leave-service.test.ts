import {
    describe,
    it,
    expect,
    vi,
    beforeAll,
    beforeEach,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { hashPin } from '../pin-helpers';
import { KioskLeaveService } from '../kiosk-leave-service';
import type { MyLeaveInput } from '../leave-self-service';

// 2026-11-11 12:00 WIB
const NOW = new Date('2026-11-11T05:00:00.000Z');
const PIN = '123456';

function makeDb() {
    return {
        employee: { findUnique: vi.fn() },
        leaveRequest: { findFirst: vi.fn(), create: vi.fn() },
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

describe('KioskLeaveService.create', () => {
    let db: FakeDb;
    let pinHash: string;

    beforeAll(async () => {
        pinHash = await hashPin(PIN);
    });

    beforeEach(() => {
        db = makeDb();
        db.employee.findUnique.mockResolvedValue({
            id: 'emp-1',
            status: 'ACTIVE',
            pinHash,
        });
        db.leaveRequest.findFirst.mockResolvedValue(null);
        db.leaveRequest.create.mockResolvedValue({
            id: 'lr-1',
            employeeId: 'emp-1',
            status: 'PENDING',
        });
    });

    function create(
        overrides: {
            employeeCode?: unknown;
            pin?: unknown;
            input?: MyLeaveInput;
        } = {},
    ) {
        return KioskLeaveService.create(
            asDb(db),
            {
                employeeCode: 'EMP-001',
                pin: PIN,
                input: validInput(),
                ...overrides,
            } as never,
            NOW,
        );
    }

    it('creates a pending request for the employee found by code and returns only id and days', async () => {
        const result = await create();

        expect(result).toEqual({ id: 'lr-1', days: 2 });
        expect(db.employee.findUnique).toHaveBeenCalledWith({
            where: { code: 'EMP-001' },
            select: { id: true, status: true, pinHash: true },
        });
        const data = db.leaveRequest.create.mock.calls[0][0].data;
        expect(data.employeeId).toBe('emp-1');
        expect(data.status).toBe('PENDING');
    });

    it('rejects an unknown employee code without touching leave requests', async () => {
        db.employee.findUnique.mockResolvedValue(null);

        await expect(create()).rejects.toMatchObject({
            name: 'BusinessRuleError',
            message: 'Karyawan tidak ditemukan',
        });
        expect(db.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive employee', async () => {
        db.employee.findUnique.mockResolvedValue({
            id: 'emp-1',
            status: 'INACTIVE',
            pinHash,
        });

        await expect(create()).rejects.toThrow('Karyawan tidak aktif');
        expect(db.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('rejects a wrong PIN', async () => {
        await expect(create({ pin: '000000' })).rejects.toThrow('PIN salah');
        expect(db.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('rejects when the employee has no PIN set', async () => {
        db.employee.findUnique.mockResolvedValue({
            id: 'emp-1',
            status: 'ACTIVE',
            pinHash: null,
        });

        await expect(create()).rejects.toThrow('PIN salah');
        expect(db.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('verifies the PIN before validating dates or hitting leave tables (no oracle)', async () => {
        const badDates = validInput({ startDate: '2020-01-01' });

        await expect(create({ pin: '000000', input: badDates })).rejects.toThrow(
            'PIN salah',
        );
        expect(db.leaveRequest.findFirst).not.toHaveBeenCalled();
        expect(db.leaveRequest.create).not.toHaveBeenCalled();
    });

    it('surfaces date validation errors only after the PIN is correct', async () => {
        const badDates = validInput({ startDate: '2020-01-01' });

        await expect(create({ input: badDates })).rejects.toThrow(
            'Tanggal mulai tidak boleh sebelum hari ini',
        );
    });

    it.each([
        ['empty code', { employeeCode: '' }],
        ['blank code', { employeeCode: '   ' }],
        ['numeric code', { employeeCode: 42 }],
        ['numeric pin', { pin: 123456 }],
        ['missing pin', { pin: undefined }],
    ])('rejects %s before any DB lookup', async (_name, override) => {
        await expect(create(override)).rejects.toBeInstanceOf(
            BusinessRuleError,
        );
        expect(db.employee.findUnique).not.toHaveBeenCalled();
    });
});
