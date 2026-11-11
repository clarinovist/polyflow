import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { MAX_LEAVE_DAYS, countLeaveDays } from '@/lib/hrd/leave-presets';

export type MyLeaveReasonCode = 'SICK' | 'FAMILY' | 'PERSONAL' | 'OTHER';

export interface MyLeaveInput {
    startDate: string;
    endDate: string;
    reasonCode: MyLeaveReasonCode;
    note?: string;
}

const MAX_DAYS_AHEAD = 60;
const MAX_NOTE_LENGTH = 200;
const MIN_OTHER_NOTE_LENGTH = 3;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIST_LIMIT = 10;

type MyLeaveType = 'SICK' | 'PERMISSION' | 'OTHER';

const REASON_MAP: Record<
    MyLeaveReasonCode,
    { type: MyLeaveType; label: string }
> = {
    SICK: { type: 'SICK', label: 'Sakit' },
    FAMILY: { type: 'PERMISSION', label: 'Keperluan keluarga' },
    PERSONAL: { type: 'PERMISSION', label: 'Urusan pribadi' },
    OTHER: { type: 'OTHER', label: 'Lainnya' },
};

const INVALID_DATE_MESSAGE = 'Tanggal izin tidak valid';
const INVALID_INPUT_MESSAGE = 'Data pengajuan izin tidak valid';
const REASON_CODES: readonly MyLeaveReasonCode[] = [
    'SICK',
    'FAMILY',
    'PERSONAL',
    'OTHER',
];

function isReasonCode(value: unknown): value is MyLeaveReasonCode {
    return (
        typeof value === 'string' &&
        (REASON_CODES as readonly string[]).includes(value)
    );
}

/** Whitelist 4 field dari payload client yang tidak tepercaya. */
export function parseMyLeaveInput(raw: unknown): MyLeaveInput {
    if (typeof raw !== 'object' || raw === null) {
        throw new BusinessRuleError(INVALID_INPUT_MESSAGE);
    }
    const { startDate, endDate, reasonCode, note } = raw as Record<
        string,
        unknown
    >;
    if (
        typeof startDate !== 'string' ||
        typeof endDate !== 'string' ||
        !isReasonCode(reasonCode) ||
        (note !== undefined && typeof note !== 'string')
    ) {
        throw new BusinessRuleError(INVALID_INPUT_MESSAGE);
    }
    return { startDate, endDate, reasonCode, note };
}

function isValidCalendarDate(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.toISOString().slice(0, 10) === value;
}

function toUtcMidnight(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function validateDates(startDate: unknown, endDate: unknown, today: string) {
    if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
        throw new BusinessRuleError(INVALID_DATE_MESSAGE);
    }
    if (endDate < startDate) {
        throw new BusinessRuleError(
            'Tanggal selesai tidak boleh sebelum tanggal mulai',
        );
    }
    if (startDate < today) {
        throw new BusinessRuleError(
            'Tanggal mulai tidak boleh sebelum hari ini',
        );
    }
    if (countLeaveDays(today, startDate) - 1 > MAX_DAYS_AHEAD) {
        throw new BusinessRuleError(
            `Izin hanya bisa diajukan maksimal ${MAX_DAYS_AHEAD} hari ke depan`,
        );
    }
    if (countLeaveDays(startDate, endDate) > MAX_LEAVE_DAYS) {
        throw new BusinessRuleError(
            `Durasi izin maksimal ${MAX_LEAVE_DAYS} hari`,
        );
    }
}

function normalizeNote(reasonCode: MyLeaveReasonCode, note: unknown): string {
    const trimmed = typeof note === 'string' ? note.trim() : '';
    if (trimmed.length > MAX_NOTE_LENGTH) {
        throw new BusinessRuleError(
            `Keterangan maksimal ${MAX_NOTE_LENGTH} karakter`,
        );
    }
    if (reasonCode === 'OTHER' && trimmed.length < MIN_OTHER_NOTE_LENGTH) {
        throw new BusinessRuleError(
            'Keterangan wajib diisi (minimal 3 karakter) untuk alasan Lainnya',
        );
    }
    return trimmed;
}

function validateInput(input: MyLeaveInput, today: string) {
    if (!Object.hasOwn(REASON_MAP, input.reasonCode)) {
        throw new BusinessRuleError('Alasan izin tidak valid');
    }
    const mapping = REASON_MAP[input.reasonCode];
    validateDates(input.startDate, input.endDate, today);
    const note = normalizeNote(input.reasonCode, input.note);
    return {
        type: mapping.type,
        reason: note ? `${mapping.label} — ${note}` : mapping.label,
        startDate: toUtcMidnight(input.startDate),
        endDate: toUtcMidnight(input.endDate),
    };
}

async function assertActiveEmployee(db: PrismaClient, employeeId: string) {
    const employee = await db.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, status: true },
    });
    if (!employee) throw new NotFoundError('Karyawan');
    if (employee.status !== 'ACTIVE') {
        throw new BusinessRuleError('Karyawan tidak aktif');
    }
}

async function assertNoOverlap(
    db: PrismaClient,
    employeeId: string,
    startDate: Date,
    endDate: Date,
) {
    const overlap = await db.leaveRequest.findFirst({
        where: {
            employeeId,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: endDate },
            endDate: { gte: startDate },
        },
        select: { id: true },
    });
    if (overlap) {
        throw new BusinessRuleError(
            'Sudah ada pengajuan izin pada tanggal tersebut',
        );
    }
}

export const MyLeaveService = {
    async create(
        db: PrismaClient,
        employeeId: string,
        input: MyLeaveInput,
        now: Date = new Date(),
    ) {
        const today = toBusinessDateString(now);
        const valid = validateInput(input, today);
        await assertActiveEmployee(db, employeeId);
        await assertNoOverlap(db, employeeId, valid.startDate, valid.endDate);

        return db.leaveRequest.create({
            data: {
                employeeId,
                type: valid.type,
                startDate: valid.startDate,
                endDate: valid.endDate,
                reason: valid.reason,
                status: 'PENDING',
            },
        });
    },

    async listMine(
        db: PrismaClient,
        employeeId: string,
        limit: number = DEFAULT_LIST_LIMIT,
    ) {
        return db.leaveRequest.findMany({
            where: { employeeId },
            orderBy: { createdAt: 'desc' },
            take: limit,
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
    },
};
