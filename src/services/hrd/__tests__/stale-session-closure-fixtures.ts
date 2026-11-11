import { vi } from 'vitest';
import { Prisma } from '@prisma/client';

/** 2026-11-11 10:00 WIB. */
export const NOW = new Date('2026-11-11T03:00:00.000Z');

export const SHIFT_DAY = {
    id: 'shift-day',
    name: 'Shift Pagi',
    startTime: '08:00',
    endTime: '16:00',
    plannedHours: null,
    status: 'ACTIVE',
};

export const SHIFT_NIGHT = {
    id: 'shift-night',
    name: 'Shift Malam',
    startTime: '20:00',
    endTime: '08:00',
    plannedHours: null,
    status: 'ACTIVE',
};

export type FakeRow = Record<string, any>;

const D = (n: number) => new Prisma.Decimal(n);

/** Sesi basi default: masuk 08:05 WIB 9 Nov, 49,9 jam sebelum NOW, tarif Rp100.000/hari. */
export function makeRecord(overrides: FakeRow = {}): FakeRow {
    return {
        id: 'rec-1',
        employeeId: 'emp-1',
        workDate: new Date('2026-11-09T00:00:00.000Z'),
        workShiftId: SHIFT_DAY.id,
        clockInAt: new Date('2026-11-09T01:05:00.000Z'),
        clockOutAt: null,
        isOvertimeShift: false,
        status: 'PRESENT',
        source: 'KIOSK',
        plannedHours: D(8),
        actualHours: null,
        regularHours: D(0),
        overtimeHours: D(0),
        standardDayHours: D(8),
        dailyRateSnapshot: D(100000),
        overtimeRateSnapshot: D(18750),
        dailyEarnings: D(0),
        overtimeEarnings: D(0),
        totalEarnings: D(0),
        notes: null,
        updatedAt: new Date('2026-11-09T10:00:00.000Z'),
        employee: { name: 'Karyawan Contoh', code: 'E001', payType: 'DAILY' },
        workShift: { ...SHIFT_DAY, plannedHours: null },
        ...overrides,
    };
}

function matchesClaim(row: FakeRow, where: FakeRow): boolean {
    if (row.id !== where.id) return false;
    if (where.status !== undefined && row.status !== where.status) return false;
    if (where.clockInAt?.not === null && row.clockInAt === null) return false;
    if (where.clockOutAt === null && row.clockOutAt !== null) return false;
    if (where.updatedAt && row.updatedAt.getTime() !== where.updatedAt.getTime()) {
        return false;
    }
    return true;
}

/**
 * DB palsu dengan keadaan di memori. `$transaction` meniru atomisitas: bila
 * callback melempar, keadaan dikembalikan ke snapshot sebelum transaksi.
 * `db` (akar) hanya punya `$transaction`; semua tulis harus lewat `tx`.
 */
export function createFakeDb(initial: FakeRow[]) {
    let store = new Map<string, FakeRow>(
        initial.map((r) => [r.id as string, { ...r }]),
    );
    let tick = 0;
    const bump = () => new Date(Date.UTC(2026, 10, 11, 4, 0, ++tick));

    const attendanceRecord = {
        findMany: vi.fn(async ({ where }: { where: FakeRow }) =>
            (where.id.in as string[])
                .map((id) => store.get(id))
                .filter((r): r is FakeRow => r !== undefined)
                .map((r) => ({ ...r })),
        ),
        updateMany: vi.fn(async ({ where, data }: { where: FakeRow; data: FakeRow }) => {
            const row = store.get(where.id);
            if (!row || !matchesClaim(row, where)) return { count: 0 };
            store.set(row.id, { ...row, ...data, updatedAt: bump() });
            return { count: 1 };
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
            const row = store.get(where.id);
            return row ? { ...row } : null;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: FakeRow }) => {
            const row = store.get(where.id);
            if (!row) throw new Error('row hilang');
            const next = { ...row, ...data, updatedAt: bump() };
            store.set(row.id, next);
            return { ...next };
        }),
    };
    const tx = { attendanceRecord };

    const rootGuard = {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
    };
    const db = {
        attendanceRecord: rootGuard,
        $transaction: vi.fn(
            async (fn: (t: typeof tx) => Promise<unknown>, _options?: unknown) => {
                const snapshot = new Map(
                    [...store].map(([k, v]) => [k, { ...v }] as const),
                );
                try {
                    return await fn(tx);
                } catch (error) {
                    store = snapshot;
                    throw error;
                }
            },
        ),
    };
    /** DB baca-saja untuk pratinjau: pakai spy yang sama dengan tx supaya dihitung. */
    const readDb = { attendanceRecord };

    return {
        db,
        tx,
        readDb,
        rootGuard,
        snapshot: () => new Map([...store].map(([k, v]) => [k, { ...v }] as const)),
        get: (id: string) => store.get(id),
        /** Ubah baris di luar transaksi (mensimulasikan penulis lain). */
        mutate: (id: string, patch: FakeRow) => {
            const row = store.get(id) as FakeRow;
            store.set(id, { ...row, ...patch, updatedAt: bump() });
        },
    };
}
