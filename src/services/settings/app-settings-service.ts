import { prisma } from '@/lib/core/prisma';
import type {
    TenantPaymentBank,
    TenantPaymentBanks,
} from '@/lib/finance/payment-methods';
import { ValidationError } from '@/lib/errors/errors';

export const PAYMENT_BANKS_SETTING_KEY = 'payment.banks';

const LEGACY_BANK_NAMES: Record<string, string> = {
    BCA: 'BCA',
    MANDIRI: 'Mandiri',
};

function isLegacyBankKey(key: string): boolean {
    return key === 'BCA' || key === 'MANDIRI';
}

const BANK_KEY_PATTERN = /^[A-Z0-9_]{2,20}$/;
const MAX_BANKS = 8;

/**
 * Parse and sanitize payment banks JSON from storage.
 * Accepts both the legacy shape ({"BCA": {...}, "MANDIRI": {...}}) and the
 * current array shape ([{key, name, holder, account, glAccountId}, ...]) —
 * legacy rows already persisted in AppSetting upgrade transparently on read,
 * no data migration needed.
 */
export function parsePaymentBanksJson(
    raw: string | null | undefined,
): TenantPaymentBanks {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return [];

        const rows: unknown[] = Array.isArray(parsed)
            ? parsed
            : Object.entries(parsed as Record<string, unknown>).map(
                  ([key, value]) => ({
                      key,
                      ...(value && typeof value === 'object' ? value : {}),
                  }),
              );

        const result: TenantPaymentBanks = [];
        const seenKeys = new Set<string>();
        for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            const r = row as Record<string, unknown>;
            const key =
                typeof r.key === 'string' ? r.key.trim().toUpperCase() : '';
            if (!key || !BANK_KEY_PATTERN.test(key)) continue;
            if (seenKeys.has(key)) continue;

            const holder = typeof r.holder === 'string' ? r.holder.trim() : '';
            const account =
                typeof r.account === 'string' ? r.account.trim() : '';
            if (!account) continue;

            const name =
                typeof r.name === 'string' && r.name.trim()
                    ? r.name.trim()
                    : (LEGACY_BANK_NAMES[key] ?? key);
            const glAccountId =
                typeof r.glAccountId === 'string' && r.glAccountId.trim()
                    ? r.glAccountId.trim()
                    : undefined;

            seenKeys.add(key);
            result.push({
                key,
                name: isLegacyBankKey(key)
                    ? (LEGACY_BANK_NAMES[key] ?? name)
                    : name,
                holder: holder || (LEGACY_BANK_NAMES[key] ?? name),
                account,
                ...(glAccountId ? { glAccountId } : {}),
            });
        }
        return result;
    } catch {
        return [];
    }
}

/**
 * Load payment banks for the current tenant DB.
 * Empty array when not configured yet (labels show without norek).
 */
export async function getPaymentBanksSetting(): Promise<TenantPaymentBanks> {
    const row = await prisma.appSetting.findUnique({
        where: { key: PAYMENT_BANKS_SETTING_KEY },
    });
    return parsePaymentBanksJson(row?.value);
}

/**
 * Validate and save payment banks for the current tenant DB.
 * Non-legacy banks (anything beyond BCA/MANDIRI) must have a glAccountId
 * pointing at an active cash/bank account in the tenant's chart of accounts —
 * otherwise auto-journal posting for that bank has nowhere to resolve to.
 */
export async function savePaymentBanksSetting(
    banks: TenantPaymentBanks,
    updatedBy?: string | null,
): Promise<TenantPaymentBanks> {
    const sanitized = parsePaymentBanksJson(JSON.stringify(banks));

    if (sanitized.length > MAX_BANKS) {
        throw new ValidationError(
            `Maksimal ${MAX_BANKS} rekening bank per tenant.`,
        );
    }

    for (const bank of sanitized as TenantPaymentBank[]) {
        if (bank.account && !/^\d[\d\s-]*$/.test(bank.account)) {
            throw new ValidationError(
                `Nomor rekening ${bank.name} tidak valid. Gunakan angka (boleh spasi/strip).`,
                { bankKey: bank.key },
            );
        }

        if (isLegacyBankKey(bank.key)) continue;

        if (!bank.glAccountId) {
            throw new ValidationError(
                `Pilih akun COA untuk bank ${bank.name} agar jurnal otomatis bisa memposting ke akun yang benar.`,
                { bankKey: bank.key },
            );
        }

        const account = await prisma.account.findUnique({
            where: { id: bank.glAccountId },
        });
        if (!account || account.isActive === false) {
            throw new ValidationError(
                `Akun COA untuk bank ${bank.name} tidak ditemukan atau tidak aktif.`,
                { bankKey: bank.key, glAccountId: bank.glAccountId },
            );
        }
    }

    await prisma.appSetting.upsert({
        where: { key: PAYMENT_BANKS_SETTING_KEY },
        create: {
            key: PAYMENT_BANKS_SETTING_KEY,
            value: JSON.stringify(sanitized),
            updatedBy: updatedBy ?? null,
        },
        update: {
            value: JSON.stringify(sanitized),
            updatedBy: updatedBy ?? null,
        },
    });

    return sanitized;
}
