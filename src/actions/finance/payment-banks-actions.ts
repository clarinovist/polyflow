'use server';

import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { withTenant } from '@/lib/core/tenant';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import { requireRole } from '@/lib/tools/auth-checks';
import type { TenantPaymentBanks } from '@/lib/finance/payment-methods';
import {
  getPaymentBanksSetting,
  savePaymentBanksSetting,
} from '@/services/settings/app-settings-service';

const READ_ROLES: Role[] = [
  Role.ADMIN,
  Role.FINANCE,
  Role.SALES,
  Role.PROCUREMENT,
];

const WRITE_ROLES: Role[] = [Role.ADMIN, Role.FINANCE];

/**
 * Read payment banks for current tenant (any finance-related role).
 */
export const getPaymentBanks = withTenant(async function getPaymentBanks() {
  return safeAction(async () => {
    await requireRole(READ_ROLES);
    return getPaymentBanksSetting();
  });
});

/**
 * Save BCA/Mandiri company accounts for payment forms (ADMIN/FINANCE).
 */
export const updatePaymentBanks = withTenant(async function updatePaymentBanks(
  banks: TenantPaymentBanks,
) {
  return safeAction(async () => {
    const session = await requireRole(WRITE_ROLES);
    try {
      const saved = await savePaymentBanksSetting(banks, session.user.id);
      revalidatePath('/finance/payment-banks');
      revalidatePath('/finance/payments/received');
      revalidatePath('/finance/payments/sent');
      return saved;
    } catch (error) {
      throw new BusinessRuleError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan rekening bank pembayaran.',
      );
    }
  });
});
