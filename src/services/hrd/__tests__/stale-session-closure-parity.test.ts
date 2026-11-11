import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { AttendanceService } from '../attendance-service';
import { previewClosure, applyClosure } from '../stale-session-closure';
import type { ClosurePolicy } from '@/lib/hrd/stale-session-closure-constants';
import { logActivity } from '@/lib/tools/audit';
import {
    NOW,
    SHIFT_NIGHT,
    createFakeDb,
    makeRecord,
    type FakeRow,
} from './stale-session-closure-fixtures';

vi.mock('../pin-helpers', () => ({ verifyPin: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

const COMPUTED_FIELDS = [
    'actualHours',
    'regularHours',
    'overtimeHours',
    'dailyEarnings',
    'overtimeEarnings',
    'totalEarnings',
] as const;

const scenarios: Array<{ name: string; policy: ClosurePolicy; record: FakeRow }> = [
    { name: 'shift pagi, pulang akhir shift (jam kerja pecahan)', policy: 'SHIFT_END', record: makeRecord() },
    {
        name: 'shift 08:00-16:20 (8,33 jam terjadwal), masuk + durasi terjadwal',
        policy: 'CLOCK_IN_PLUS_PLANNED',
        record: makeRecord({ workShift: { ...makeRecord().workShift, endTime: '16:20' } }),
    },
    {
        name: 'shift malam lintas tengah malam dengan tarif lain',
        policy: 'SHIFT_END',
        record: makeRecord({
            clockInAt: new Date('2026-11-09T13:30:00.000Z'),
            workShiftId: SHIFT_NIGHT.id,
            workShift: SHIFT_NIGHT,
            dailyRateSnapshot: new Prisma.Decimal(120000),
            overtimeRateSnapshot: new Prisma.Decimal(25000),
        }),
    },
    {
        name: 'masuk lebih awal dari shift -> lembur 2 jam',
        policy: 'SHIFT_END',
        record: makeRecord({ clockInAt: new Date('2026-11-08T23:00:00.000Z') }),
    },
    {
        name: 'tarif harian null -> upah 0',
        policy: 'SHIFT_END',
        record: makeRecord({ dailyRateSnapshot: null, overtimeRateSnapshot: null }),
    },
    {
        name: 'snapshot lembur kosong memakai default 1,5x',
        policy: 'SHIFT_END',
        record: makeRecord({ clockInAt: new Date('2026-11-08T23:00:00.000Z'), overtimeRateSnapshot: null }),
    },
];

/** Jalankan correct() asli pada salinan record dan kembalikan data update ke-2 (kolom hitung). */
async function correctWrites(record: FakeRow, clockOutAt: Date) {
    const row = { ...record };
    const db = {
        attendanceRecord: {
            findUnique: vi.fn(async () => ({ ...row })),
            update: vi.fn(async ({ data }: { data: FakeRow }) => ({ ...row, ...data })),
        },
    };
    await AttendanceService.correct(db as any, row.id, { clockOutAt });
    return db.attendanceRecord.update.mock.calls[1][0].data as FakeRow;
}

describe('parity dengan AttendanceService.correct()', () => {
    beforeEach(() => {
        vi.mocked(logActivity).mockReset();
        vi.mocked(logActivity).mockResolvedValue(undefined);
    });

    it.each(scenarios)('pratinjau == correct(): $name', async ({ policy, record }) => {
        const fake = createFakeDb([record]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: [record.id],
            policy,
            now: NOW,
        });
        const row = preview.rows[0];
        expect(row.eligible).toBe(true);

        const written = await correctWrites(record, new Date(row.proposedClockOutAt as string));

        expect(row.actualHours).toBe(Number(written.actualHours));
        expect(row.regularHours).toBe(Number(written.regularHours));
        expect(row.overtimeHours).toBe(Number(written.overtimeHours));
        expect(row.earnings).toBe(Number(written.totalEarnings));
    });

    it.each(scenarios)('terapkan == correct(): $name', async ({ policy, record }) => {
        const fake = createFakeDb([record]);
        const preview = await previewClosure(fake.readDb as any, {
            recordIds: [record.id],
            policy,
            now: NOW,
        });
        const expected = await correctWrites(
            record,
            new Date(preview.rows[0].proposedClockOutAt as string),
        );

        await applyClosure(fake.db as any, {
            recordIds: [record.id],
            policy,
            fingerprint: preview.fingerprint,
            userId: 'user-hrd',
            now: NOW,
        });

        const stored = fake.get(record.id)!;
        for (const field of COMPUTED_FIELDS) {
            expect(Number(stored[field]), field).toBe(Number(expected[field]));
        }
        expect(stored.clockOutAt).toEqual(new Date(preview.rows[0].proposedClockOutAt as string));
    });
});
