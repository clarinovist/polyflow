/**
 * Canonical payment methods, labels, and validation.
 * Bank account numbers are stored per-tenant in AppSetting (Settings UI),
 * not hardcoded in source.
 *
 * BCA and MANDIRI are "legacy" banks: always selectable even when
 * unconfigured (historical behavior, tied to hardcoded GL account roles
 * 'bank-bca'/'bank-mandiri' in account-resolver.ts). Any additional bank a
 * tenant configures beyond these two only becomes selectable once it has an
 * account number AND a linked GL account (glAccountId) — see
 * app-settings-service.ts validation and auto-journal-shared.ts
 * resolvePaymentBankAccount().
 */

import { ValidationError } from '@/lib/errors/errors';

const LEGACY_BANK_KEYS = ['BCA', 'MANDIRI'] as const;
type LegacyBankKey = (typeof LEGACY_BANK_KEYS)[number];

const LEGACY_BANK_NAMES: Record<LegacyBankKey, string> = {
    BCA: 'BCA',
    MANDIRI: 'Mandiri',
};

function isLegacyBankKey(key: string): key is LegacyBankKey {
    return (LEGACY_BANK_KEYS as readonly string[]).includes(key);
}

export const PAYMENT_METHODS = [
    'Transfer BCA',
    'Transfer Mandiri',
    'Cash',
    'Check',
] as const;

/** Widened: dynamic tenant banks produce methods like 'Transfer BRI' that don't fit a static union. */
export type PaymentMethod = string;

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'Transfer BCA';

/** Bank key: 'BCA' | 'MANDIRI' (legacy, always available) or a tenant-defined slug (e.g. 'BRI'). */
export type PaymentBankKey = string;

export interface TenantPaymentBank {
    /** Uppercase slug, stable identity. Never changes after creation. */
    key: string;
    /** Display name (e.g. 'BCA', 'Mandiri', 'BRI'). Locked after creation to keep historical "Transfer <name>" labels stable. */
    name: string;
    holder: string;
    account: string;
    /** GL account id for auto-journal posting. Required for non-legacy banks. */
    glAccountId?: string;
}

export type TenantPaymentBanks = TenantPaymentBank[];

function findBank(
    banks: TenantPaymentBanks,
    key: string,
): TenantPaymentBank | undefined {
    return banks.find((b) => b.key === key);
}

function findExtraBankByMethod(
    banks: TenantPaymentBanks,
    method: string,
): TenantPaymentBank | undefined {
    return banks.find(
        (b) => !isLegacyBankKey(b.key) && `Transfer ${b.name}` === method,
    );
}

/** All methods selectable in the payment dropdown for this tenant's configured banks. */
export function getSelectablePaymentMethods(
    banks: TenantPaymentBanks = [],
): string[] {
    const extraBanks = banks.filter((b) => !isLegacyBankKey(b.key));
    return [
        'Transfer BCA',
        'Transfer Mandiri',
        ...extraBanks.map((b) => `Transfer ${b.name}`),
        'Cash',
        'Check',
    ];
}

/** Bank options for the Check/Giro clearing-bank selector. */
export function getClearingBankOptions(
    banks: TenantPaymentBanks = [],
): { key: string; label: string }[] {
    const extra = banks.filter((b) => !isLegacyBankKey(b.key));
    return [
        { key: 'BCA', label: getClearingBankLabel('BCA', banks) },
        { key: 'MANDIRI', label: getClearingBankLabel('MANDIRI', banks) },
        ...extra.map((b) => ({
            key: b.key,
            label: getClearingBankLabel(b.key, banks),
        })),
    ];
}

/** Base labels (without account numbers). */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    'Transfer BCA': 'Transfer BCA',
    'Transfer Mandiri': 'Transfer Mandiri',
    Cash: 'Tunai',
    Check: 'Cek / Giro',
    // Legacy values still present in historical rows
    'Bank Transfer': 'Transfer Bank (lama)',
    'Credit Card': 'Kartu Kredit (lama)',
};

export function getPaymentMethodLabel(
    method: string,
    banks: TenantPaymentBanks = [],
): string {
    if (method === 'Transfer BCA') {
        const acc = findBank(banks, 'BCA')?.account;
        return acc
            ? `Transfer BCA — ${acc}`
            : PAYMENT_METHOD_LABELS['Transfer BCA'];
    }
    if (method === 'Transfer Mandiri') {
        const acc = findBank(banks, 'MANDIRI')?.account;
        return acc
            ? `Transfer Mandiri — ${acc}`
            : PAYMENT_METHOD_LABELS['Transfer Mandiri'];
    }
    const extra = findExtraBankByMethod(banks, method);
    if (extra) {
        return extra.account
            ? `Transfer ${extra.name} — ${extra.account}`
            : `Transfer ${extra.name}`;
    }
    return PAYMENT_METHOD_LABELS[method] ?? method;
}

export function getClearingBankLabel(
    bankKey: string,
    banks: TenantPaymentBanks = [],
): string {
    if (isLegacyBankKey(bankKey)) {
        const acc = findBank(banks, bankKey)?.account;
        const name = LEGACY_BANK_NAMES[bankKey];
        return acc ? `${name} — ${acc}` : name;
    }
    const bank = findBank(banks, bankKey);
    if (!bank) return bankKey;
    return bank.account ? `${bank.name} — ${bank.account}` : bank.name;
}

/**
 * Derive destination bank from method + optional explicit value.
 * For Check, explicit destinationBank is required by validation.
 */
export function deriveDestinationBank(
    method: string,
    destinationBank?: string | null,
    banks: TenantPaymentBanks = [],
): string | null {
    if (destinationBank) {
        if (
            isLegacyBankKey(destinationBank) ||
            findBank(banks, destinationBank)
        ) {
            return destinationBank;
        }
    }
    if (
        method === 'Transfer BCA' ||
        method === 'Bank Transfer' ||
        method === 'Credit Card'
    ) {
        return 'BCA';
    }
    if (method === 'Transfer Mandiri') {
        return 'MANDIRI';
    }
    const extra = findExtraBankByMethod(banks, method);
    return extra ? extra.key : null;
}

export function isSelectablePaymentMethod(
    method: string,
    banks: TenantPaymentBanks = [],
): boolean {
    return getSelectablePaymentMethods(banks).includes(method);
}

export interface PaymentMethodFields {
    method: string;
    referenceNumber?: string | null;
    destinationBank?: string | null;
}

export interface NormalizedPaymentFields {
    method: string;
    referenceNumber: string | null;
    destinationBank: string | null;
}

/**
 * Validate and normalize payment method fields for create/update.
 * Throws ValidationError (ApplicationError) so safeAction surfaces the message.
 */
export function normalizePaymentMethodFields(
    input: PaymentMethodFields,
    banks: TenantPaymentBanks = [],
): NormalizedPaymentFields {
    const method = (input.method || '').trim();
    if (!method) {
        throw new ValidationError('Metode pembayaran wajib diisi.');
    }

    // Allow legacy methods only if already stored — new forms should use selectable methods.
    // Still accept them if submitted so old clients don't break hard.
    const isKnown =
        isSelectablePaymentMethod(method, banks) ||
        method === 'Bank Transfer' ||
        method === 'Credit Card';

    if (!isKnown) {
        throw new ValidationError(
            `Metode pembayaran tidak dikenali: ${method}`,
            {
                method,
            },
        );
    }

    if (method === 'Check') {
        const ref = (input.referenceNumber || '').trim();
        if (!ref) {
            throw new ValidationError('Nomor Cek / Giro wajib diisi.');
        }
        const bank = deriveDestinationBank(
            method,
            input.destinationBank,
            banks,
        );
        if (!bank) {
            throw new ValidationError(
                'Pilih bank tujuan clearing untuk Cek / Giro.',
            );
        }
        return {
            method: 'Check',
            referenceNumber: ref,
            destinationBank: bank,
        };
    }

    if (method === 'Cash') {
        return {
            method: 'Cash',
            referenceNumber: null,
            destinationBank: null,
        };
    }

    // Transfer / legacy bank methods
    const bank = deriveDestinationBank(method, input.destinationBank, banks);
    const ref = (input.referenceNumber || '').trim() || null;
    return {
        method,
        referenceNumber: ref,
        destinationBank: bank,
    };
}
