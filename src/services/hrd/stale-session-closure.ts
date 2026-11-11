/**
 * Koreksi massal sesi lupa pulang (jalur KRITIS: mengubah upah karyawan).
 *
 * - previewClosure: baca saja. Satu query by id, hitung jam pulang usulan +
 *   upah lewat jalur hitung yang sama dengan AttendanceService.correct().
 * - applyClosure: satu transaksi; pratinjau dihitung ulang DI DALAM transaksi
 *   dan sidiknya harus sama; tiap record diklaim atomik; audit di dalam
 *   transaksi (gagal audit = seluruh batch batal).
 *
 * Kriteria sesi basi SAMA dengan findStaleOpenSessions (attendance-query-service).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { BusinessRuleError, ValidationError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import {
    CLOSURE_AUDIT_ACTION_BATCH,
    CLOSURE_AUDIT_ACTION_RECORD,
    CLOSURE_AUDIT_ENTITY_BATCH,
    CLOSURE_AUDIT_ENTITY_RECORD,
    CLOSURE_MAX_BATCH,
    CLOSURE_POLICIES,
    CLOSURE_POLICY_LABELS,
    CLOSURE_STALE_DATA_MESSAGE,
    CLOSURE_TX_TIMEOUT_MS,
    type ClosureApplyResult,
    type ClosurePolicy,
    type ClosurePreview,
} from '@/lib/hrd/stale-session-closure-constants';
import { computeAttendanceFields } from './attendance-service';
import { STALE_SESSION_LOOKBACK_DAYS } from './attendance-query-service';
import { isStaleOpenSession } from './stale-session';
import { wibDateFrom } from './shift-window';
import {
    CLOSURE_INCLUDE,
    buildPreview,
    evaluateRecord,
    missingEvaluation,
    type ClosureCandidate,
    type ClosureEvaluation,
    type ClosureRow,
} from './stale-session-closure-evaluate';
import { computeFingerprint } from './stale-session-closure-policy';

export {
    computeProposedClockOut,
    computeFingerprint,
} from './stale-session-closure-policy';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RECORD_ID_LENGTH = 100;
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

// ─── Validasi input (batas sistem) ───

export interface ClosureInput {
    recordIds: string[];
    policy: ClosurePolicy;
}

function assertRecordIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        throw new ValidationError('Daftar sesi harus berupa array');
    }
    if (value.length === 0) {
        throw new ValidationError('Pilih minimal satu sesi untuk dikoreksi');
    }
    if (value.length > CLOSURE_MAX_BATCH) {
        throw new ValidationError(
            `Maksimal ${CLOSURE_MAX_BATCH} sesi per koreksi; kurangi pilihan Anda`,
        );
    }
    const isValidId = (id: unknown): id is string =>
        typeof id === 'string' &&
        id.length > 0 &&
        id.length <= MAX_RECORD_ID_LENGTH;
    if (!value.every(isValidId)) {
        throw new ValidationError('ID sesi tidak valid');
    }
    if (new Set(value).size !== value.length) {
        throw new ValidationError('Daftar sesi memuat ID ganda');
    }
    return [...value];
}

function assertPolicy(value: unknown): ClosurePolicy {
    const policy = CLOSURE_POLICIES.find((candidate) => candidate === value);
    if (!policy) throw new ValidationError('Kebijakan jam pulang tidak valid');
    return policy;
}

/** Validasi id + kebijakan dari input yang tidak tepercaya. */
export function parseClosureInput(input: unknown): ClosureInput {
    if (typeof input !== 'object' || input === null) {
        throw new ValidationError('Input koreksi massal tidak valid');
    }
    const { recordIds, policy } = input as Record<string, unknown>;
    return {
        recordIds: assertRecordIds(recordIds),
        policy: assertPolicy(policy),
    };
}

export function parseClosureFingerprint(value: unknown): string {
    if (typeof value !== 'string' || !FINGERPRINT_RE.test(value)) {
        throw new ValidationError(
            'Sidik pratinjau tidak valid, buat pratinjau ulang',
        );
    }
    return value;
}

// ─── Evaluasi (dipakai pratinjau dan terapkan) ───

type ClosureDb = Prisma.TransactionClient;

function staleWindowStart(now: Date): number {
    return (
        wibDateFrom(now).getTime() - STALE_SESSION_LOOKBACK_DAYS * MS_PER_DAY
    );
}

/** Alasan record bukan sesi basi (kriteria = findStaleOpenSessions), atau null bila basi. */
function notStaleReason(record: ClosureRow, now: Date): string | null {
    if (record.status !== 'PRESENT') {
        return 'Status record bukan hadir (PRESENT)';
    }
    if (!record.clockInAt) return 'Record tanpa jam masuk';
    if (record.clockOutAt)
        return 'Sesi sudah ditutup (jam pulang sudah terisi)';
    if (!isStaleOpenSession(record, now)) {
        return 'Sesi belum melewati 20 jam sejak jam masuk';
    }
    if (record.workDate.getTime() < staleWindowStart(now)) {
        return `Tanggal kerja lebih dari ${STALE_SESSION_LOOKBACK_DAYS} hari lalu`;
    }
    return null;
}

async function evaluateClosure(
    db: ClosureDb,
    input: ClosureInput & { now: Date },
): Promise<{ preview: ClosurePreview; candidates: ClosureCandidate[] }> {
    const { recordIds, policy, now } = input;
    const records = await db.attendanceRecord.findMany({
        where: { id: { in: recordIds } },
        include: CLOSURE_INCLUDE,
    });
    const byId = new Map<string, ClosureRow>(records.map((r) => [r.id, r]));
    const evaluations: ClosureEvaluation[] = recordIds.map((id) => {
        const record = byId.get(id);
        if (!record) return missingEvaluation(id);
        return evaluateRecord(record, policy, now, notStaleReason(record, now));
    });
    const fingerprint = computeFingerprint(
        policy,
        evaluations.map((evaluation) => evaluation.fingerprintEntry),
    );
    return {
        preview: buildPreview(policy, fingerprint, now, evaluations),
        candidates: evaluations.flatMap((e) =>
            e.candidate ? [e.candidate] : [],
        ),
    };
}

/** Pratinjau koreksi massal. Read-only: tidak menulis apa pun. */
export async function previewClosure(
    db: PrismaClient,
    input: ClosureInput & { now: Date },
): Promise<ClosurePreview> {
    const parsed = parseClosureInput(input);
    const { preview } = await evaluateClosure(db, {
        ...parsed,
        now: input.now,
    });
    return preview;
}

// ─── Terapkan ───

export interface ApplyClosureInput extends ClosureInput {
    fingerprint: string;
    userId: string;
    now: Date;
}

interface ApplyContext {
    batchId: string;
    policy: ClosurePolicy;
    userId: string;
}

function appendNote(existing: string | null, marker: string): string {
    return existing ? `${existing}\n${marker}` : marker;
}

function changedConcurrently(id: string): BusinessRuleError {
    return new BusinessRuleError(
        `Sesi ${id} sudah berubah atau ditutup oleh pengguna lain; koreksi massal dibatalkan, buat pratinjau ulang`,
    );
}

async function closeOne(
    tx: ClosureDb,
    candidate: ClosureCandidate,
    ctx: ApplyContext,
): Promise<number> {
    const { id, proposedClockOutAt } = candidate;
    // Klaim atomik: hanya sesi yang masih terbuka dan belum berubah sejak dibaca.
    const claim = await tx.attendanceRecord.updateMany({
        where: {
            id,
            status: 'PRESENT',
            clockInAt: { not: null },
            clockOutAt: null,
            updatedAt: candidate.updatedAt,
        },
        data: { clockOutAt: proposedClockOutAt },
    });
    if (claim.count !== 1) throw changedConcurrently(id);

    const closed = await tx.attendanceRecord.findUnique({
        where: { id },
        include: CLOSURE_INCLUDE,
    });
    if (!closed) throw changedConcurrently(id);
    const computed = computeAttendanceFields(closed);
    const earnings = Number(computed.totalEarnings);
    if (earnings !== candidate.totalEarnings) throw changedConcurrently(id);

    const marker = `[Koreksi massal ${ctx.batchId}: jam pulang diasumsikan ${CLOSURE_POLICY_LABELS[ctx.policy]}]`;
    await tx.attendanceRecord.update({
        where: { id },
        data: { ...computed, notes: appendNote(closed.notes, marker) },
    });
    await logActivity({
        userId: ctx.userId,
        action: CLOSURE_AUDIT_ACTION_RECORD,
        entityType: CLOSURE_AUDIT_ENTITY_RECORD,
        entityId: id,
        details: `Koreksi massal ${ctx.batchId}; kebijakan ${ctx.policy} (${CLOSURE_POLICY_LABELS[ctx.policy]})`,
        changes: {
            clockOutAt: { from: null, to: proposedClockOutAt.toISOString() },
            totalEarnings: {
                from: candidate.previousTotalEarnings,
                to: earnings,
            },
        },
        tx,
    });
    return earnings;
}

async function applyInTransaction(
    tx: ClosureDb,
    input: ApplyClosureInput & { batchId: string },
): Promise<ClosureApplyResult> {
    const { batchId, policy, userId, fingerprint } = input;
    // Hitung ulang DI DALAM transaksi: yang dibandingkan = yang akan ditulis.
    const { preview, candidates } = await evaluateClosure(tx, input);
    if (preview.fingerprint !== fingerprint) {
        throw new BusinessRuleError(CLOSURE_STALE_DATA_MESSAGE);
    }
    if (candidates.length === 0) {
        throw new BusinessRuleError('Tidak ada sesi yang layak ditutup');
    }

    let earningsAdded = 0;
    for (const candidate of candidates) {
        earningsAdded += await closeOne(tx, candidate, {
            batchId,
            policy,
            userId,
        });
    }
    earningsAdded = Math.round(earningsAdded * 100) / 100;

    const skippedCount = preview.totals.ineligibleCount;
    await logActivity({
        userId,
        action: CLOSURE_AUDIT_ACTION_BATCH,
        entityType: CLOSURE_AUDIT_ENTITY_BATCH,
        entityId: batchId,
        details: `Koreksi massal sesi lupa pulang: ${candidates.length} ditutup, ${skippedCount} dilewati, total upah ${earningsAdded}; kebijakan ${policy}`,
        changes: {
            closedCount: candidates.length,
            skippedCount,
            totalEarnings: earningsAdded,
            policy,
            recordIds: candidates.map((c) => c.id),
        },
        tx,
    });
    return {
        batchId,
        closedCount: candidates.length,
        skippedCount,
        earningsAdded,
    };
}

/**
 * Terapkan koreksi massal: SATU transaksi, semua-atau-tidak-sama-sekali.
 * Menolak bila sidik pratinjau berbeda dari keadaan data sekarang.
 */
export async function applyClosure(
    db: PrismaClient,
    input: ApplyClosureInput,
): Promise<ClosureApplyResult> {
    const parsed = parseClosureInput(input);
    const fingerprint = parseClosureFingerprint(input.fingerprint);
    const batchId = randomUUID();
    return db.$transaction(
        (tx) =>
            applyInTransaction(tx, {
                ...parsed,
                fingerprint,
                userId: input.userId,
                now: input.now,
                batchId,
            }),
        { timeout: CLOSURE_TX_TIMEOUT_MS },
    );
}
