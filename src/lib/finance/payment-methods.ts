/**
 * Canonical payment methods, labels, and validation.
 * Bank account numbers are stored per-tenant in AppSetting (Settings UI),
 * not hardcoded in source.
 */

export const PAYMENT_METHODS = [
  'Transfer BCA',
  'Transfer Mandiri',
  'Cash',
  'Check',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'Transfer BCA';

export type PaymentBankKey = 'BCA' | 'MANDIRI';

export interface PaymentBankAccount {
  holder: string;
  account: string;
}

export type TenantPaymentBanks = Partial<
  Record<PaymentBankKey, PaymentBankAccount>
>;

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

const DESTINATION_FROM_METHOD: Partial<Record<string, PaymentBankKey>> = {
  'Transfer BCA': 'BCA',
  'Transfer Mandiri': 'MANDIRI',
  'Bank Transfer': 'BCA',
  'Credit Card': 'BCA',
};

export function getPaymentMethodLabel(
  method: string,
  banks?: TenantPaymentBanks,
): string {
  if (method === 'Transfer BCA') {
    const acc = banks?.BCA?.account;
    return acc ? `Transfer BCA — ${acc}` : PAYMENT_METHOD_LABELS['Transfer BCA'];
  }
  if (method === 'Transfer Mandiri') {
    const acc = banks?.MANDIRI?.account;
    return acc
      ? `Transfer Mandiri — ${acc}`
      : PAYMENT_METHOD_LABELS['Transfer Mandiri'];
  }
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export function getClearingBankLabel(
  bank: PaymentBankKey,
  banks?: TenantPaymentBanks,
): string {
  const acc = banks?.[bank]?.account;
  const name = bank === 'BCA' ? 'BCA' : 'Mandiri';
  return acc ? `${name} — ${acc}` : name;
}

/**
 * Derive destination bank from method + optional explicit value.
 * For Check, explicit destinationBank is required by validation.
 */
export function deriveDestinationBank(
  method: string,
  destinationBank?: string | null,
): PaymentBankKey | null {
  if (destinationBank === 'BCA' || destinationBank === 'MANDIRI') {
    return destinationBank;
  }
  return DESTINATION_FROM_METHOD[method] ?? null;
}

export function isSelectablePaymentMethod(
  method: string,
): method is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(method);
}

export interface PaymentMethodFields {
  method: string;
  referenceNumber?: string | null;
  destinationBank?: string | null;
}

export interface NormalizedPaymentFields {
  method: string;
  referenceNumber: string | null;
  destinationBank: PaymentBankKey | null;
}

/**
 * Validate and normalize payment method fields for create/update.
 * Throws Error with Indonesian message on validation failure.
 */
export function normalizePaymentMethodFields(
  input: PaymentMethodFields,
): NormalizedPaymentFields {
  const method = (input.method || '').trim();
  if (!method) {
    throw new Error('Metode pembayaran wajib diisi.');
  }

  // Allow legacy methods only if already stored — new forms should use selectable methods.
  // Still accept them if submitted so old clients don't break hard.
  const isKnown =
    isSelectablePaymentMethod(method) ||
    method === 'Bank Transfer' ||
    method === 'Credit Card';

  if (!isKnown) {
    throw new Error(`Metode pembayaran tidak dikenali: ${method}`);
  }

  if (method === 'Check') {
    const ref = (input.referenceNumber || '').trim();
    if (!ref) {
      throw new Error('Nomor Cek / Giro wajib diisi.');
    }
    const bank = deriveDestinationBank(method, input.destinationBank);
    if (!bank) {
      throw new Error(
        'Pilih bank tujuan clearing (BCA atau Mandiri) untuk Cek / Giro.',
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
  const bank = deriveDestinationBank(method, input.destinationBank);
  const ref = (input.referenceNumber || '').trim() || null;
  return {
    method,
    referenceNumber: ref,
    destinationBank: bank,
  };
}
