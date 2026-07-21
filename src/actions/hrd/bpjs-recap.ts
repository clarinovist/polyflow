'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { BpjsRecapService } from '@/services/hrd/bpjs-recap-service';

export const getBpjsRecap = withTenant(
  async function getBpjsRecap(year: number, month: number) {
    return safeAction(async () => {
      await requireHrdFinance();
      if (!year || month < 1 || month > 12) {
        throw new BusinessRuleError('Tahun/bulan tidak valid');
      }
      return BpjsRecapService.getRecap(prisma, year, month);
    });
  },
);
