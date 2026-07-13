import { prisma } from '@/lib/core/prisma';
import type {
  PaymentBankKey,
  TenantPaymentBanks,
} from '@/lib/finance/payment-methods';
import { ValidationError } from '@/lib/errors/errors';

export const PAYMENT_BANKS_SETTING_KEY = 'payment.banks';

function isPaymentBankKey(value: string): value is PaymentBankKey {
  return value === 'BCA' || value === 'MANDIRI';
}

/**
 * Parse and sanitize payment banks JSON from storage.
 * Unknown keys and incomplete entries are dropped.
 */
export function parsePaymentBanksJson(raw: string | null | undefined): TenantPaymentBanks {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: TenantPaymentBanks = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isPaymentBankKey(key)) continue;
      if (!value || typeof value !== 'object') continue;
      const row = value as { holder?: unknown; account?: unknown };
      const holder = typeof row.holder === 'string' ? row.holder.trim() : '';
      const account = typeof row.account === 'string' ? row.account.trim() : '';
      if (!account) continue;
      result[key] = {
        holder: holder || (key === 'BCA' ? 'BCA' : 'Mandiri'),
        account,
      };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Load payment banks for the current tenant DB.
 * Empty object when not configured yet (labels show without norek).
 */
export async function getPaymentBanksSetting(): Promise<TenantPaymentBanks> {
  const row = await prisma.appSetting.findUnique({
    where: { key: PAYMENT_BANKS_SETTING_KEY },
  });
  return parsePaymentBanksJson(row?.value);
}

/**
 * Validate and save payment banks for the current tenant DB.
 */
export async function savePaymentBanksSetting(
  banks: TenantPaymentBanks,
  updatedBy?: string | null,
): Promise<TenantPaymentBanks> {
  const sanitized = parsePaymentBanksJson(JSON.stringify(banks));

  // Require at least one digit in account when provided
  for (const [key, bank] of Object.entries(sanitized) as [
    PaymentBankKey,
    { holder: string; account: string },
  ][]) {
    if (bank.account && !/^\d[\d\s-]*$/.test(bank.account)) {
      throw new ValidationError(
        `Nomor rekening ${key} tidak valid. Gunakan angka (boleh spasi/strip).`,
        { bankKey: key },
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
