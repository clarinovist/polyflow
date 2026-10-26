/**
 * Rekap-shift picker untuk kiosk job focus — menentukan shift mana yang
 * ditampilkan di kartu "Rekap Shift" DAN apakah pilihan itu basi.
 *
 * Latar belakang (plan 2026-09-02, opsi C1): saat admin belum membuat shift
 * untuk jadwal berjalan (mis. shift malam bolong), fallback lama diam-diam
 * memakai shift terakhir yang window-nya sudah lewat — operator tidak
 * diberi tahu, dan entri dini hari tidak bisa di-backdate (guard 24 jam)
 * sehingga Laporan Harian salah bucket. Extraksi logika eksisting dari
 * KioskJobFocus dengan SATU tambahan perilaku: flag `stale`.
 *
 * Urutan pencarian tetap identik (tidak ada perubahan perilaku selain flag):
 * 1. shift aktif milik operator
 * 2. shift aktif mana pun
 * 3. shift terakhir dalam daftar (status quo)
 *
 * Pure function — tanpa DB/network. `shifts` kosong = kiosk generik tanpa
 * shift → bukan kondisi basi (guard: jangan ganggu tenant yang tidak
 * memakai shift sama sekali).
 */

import { toDisplayQuantity } from '@/lib/utils/production-units';

export interface RekapShiftCandidate {
    id: string;
    shiftName: string;
    startTime: Date | string;
    endTime: Date | string;
    operatorId?: string | null;
}

export interface RekapShiftResult<C> {
    /** Shift yang dipakai kartu rekap (null saat daftar kosong). */
    shift: C | null;
    /**
     * true = tidak ada satupun shift aktif pada `nowMs` dan fallback
     * "shift terakhir" dipakai — tampilkan banner peringatan di kiosk.
     */
    stale: boolean;
}

function asTime(value: Date | string): number {
    return (
        value instanceof Date ? value : new Date(value)
    ).getTime();
}

function isActiveShift(
    s: RekapShiftCandidate,
    nowMs: number,
): boolean {
    return nowMs >= asTime(s.startTime) && nowMs <= asTime(s.endTime);
}

export function pickRekapShift<C extends RekapShiftCandidate>(
    shifts: readonly C[],
    nowMs: number,
    operatorId?: string | null,
): RekapShiftResult<C> {
    if (shifts.length === 0) {
        return { shift: null, stale: false };
    }

    // Logika pilihan eksisting KioskJobFocus — dipertahankan apa adanya.
    const byOperator =
        operatorId != null
            ? shifts.find(
                  (s) => s.operatorId === operatorId && isActiveShift(s, nowMs),
              )
            : undefined;
    const anyActive = shifts.find((s) => isActiveShift(s, nowMs));
    const selected = byOperator ?? anyActive ?? shifts[shifts.length - 1];

    return {
        shift: selected ?? null,
        stale: selected != null && !shifts.some((s) => isActiveShift(s, nowMs)),
    };
}

export interface ShiftOutputExecution {
    id: string;
    endTime?: Date | string | null;
    status?: string | null;
    shiftId?: string | null;
    operatorId?: string | null;
    quantityProduced?: unknown;
    enteredQuantity?: unknown;
    enteredUnit?: string | null;
}

export interface ShiftOutputUnits {
    primaryUnit: string;
    hasAlternateUnit: boolean;
    conversionFactor: number;
}

const RECENT_SHIFT_LOGS = 3;

/**
 * Rekap Shift totals. quantityProduced is always in the base unit, so totals
 * are converted to the display unit they are labelled with; each log keeps
 * the unit it was entered in, falling back to the base unit.
 */
export function summarizeShiftOutput<E extends ShiftOutputExecution>(
    executions: readonly E[],
    shiftId: string | undefined,
    operatorId: string | null | undefined,
    units: ShiftOutputUnits,
) {
    const rows = executions.filter(
        (e) => e.endTime && e.status !== 'VOIDED' && e.shiftId === shiftId,
    );
    const baseTotal = (list: readonly E[]) =>
        list.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);
    const toDisplay = (base: number) =>
        units.hasAlternateUnit
            ? toDisplayQuantity(base, units.conversionFactor)
            : base;

    return {
        myTotal: toDisplay(
            baseTotal(rows.filter((e) => e.operatorId === operatorId)),
        ),
        orderTotal: toDisplay(baseTotal(rows)),
        logs: rows.slice(0, RECENT_SHIFT_LOGS).map((execution) => {
            const entered =
                execution.enteredQuantity != null && execution.enteredUnit;
            return {
                execution,
                quantity: Number(
                    entered
                        ? execution.enteredQuantity
                        : execution.quantityProduced || 0,
                ),
                unit: entered
                    ? (execution.enteredUnit as string)
                    : units.primaryUnit,
            };
        }),
    };
}
