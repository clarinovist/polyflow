/**
 * Target perusahaan (company-wide revenue target) per bulan.
 *
 * Disimpan lewat `AppSetting` (key-value), BUKAN model baru — lihat
 * docs/plan/2026-08-08-redesign-sales-routes-targets.md §4.1. Setup ini
 * multi-tenant; menambah model relasional untuk satu angka per bulan
 * menambah risiko migration lintas-tenant tanpa manfaat sepadan (YAGNI).
 *
 * Key: `sales:companyTarget:<YYYY>-<MM>` (mis. `sales:companyTarget:2026-08`).
 * Value: string angka desimal mentah (bukan JSON) — konsisten dengan cara
 * `AppSetting.value` dipakai untuk nilai tunggal di tempat lain.
 */

import { prisma } from '@/lib/core/prisma';
import { ValidationError } from '@/lib/errors/errors';

const KEY_PREFIX = 'sales:companyTarget:';
const MAX_COMPANY_TARGET = 999_999_999_999; // sama dengan RUPIAH_MAX_VALUE, batas atas wajar

function validatePeriod(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new ValidationError(`periodYear tidak valid: ${year}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new ValidationError(`periodMonth harus 1-12, got: ${month}`);
    }
}

function companyTargetKey(year: number, month: number): string {
    return `${KEY_PREFIX}${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Baca target perusahaan untuk periode tertentu.
 * Return `null` kalau belum pernah diset (bukan 0 — UI perlu membedakan
 * "belum diisi" dari "sengaja diisi 0").
 */
export async function getCompanyTarget(
    year: number,
    month: number,
): Promise<number | null> {
    validatePeriod(year, month);

    const row = await prisma.appSetting.findUnique({
        where: { key: companyTargetKey(year, month) },
    });
    if (!row?.value) return null;

    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Simpan target perusahaan untuk periode tertentu.
 * Validasi di batas sistem: harus angka valid, tidak negatif, tidak
 * melebihi batas atas wajar.
 */
export async function setCompanyTarget(
    year: number,
    month: number,
    value: number,
    updatedBy?: string | null,
): Promise<number> {
    validatePeriod(year, month);

    if (!Number.isFinite(value)) {
        throw new ValidationError('Target perusahaan harus berupa angka');
    }
    if (value < 0) {
        throw new ValidationError('Target perusahaan tidak boleh negatif');
    }
    if (value > MAX_COMPANY_TARGET) {
        throw new ValidationError(
            `Target perusahaan melebihi batas wajar (${MAX_COMPANY_TARGET})`,
        );
    }

    const key = companyTargetKey(year, month);
    await prisma.appSetting.upsert({
        where: { key },
        create: { key, value: String(value), updatedBy: updatedBy ?? null },
        update: { value: String(value), updatedBy: updatedBy ?? null },
    });

    return value;
}
