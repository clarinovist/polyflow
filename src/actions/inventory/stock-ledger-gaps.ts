'use server';

import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, ValidationError } from '@/lib/errors/errors';
import { requireWarehouseResourcePermission } from '@/lib/tools/auth-checks';
import {
    checkStockLedgerHealth,
    getStockLedgerPairHistory,
} from '@/services/inventory/stock-ledger-health-service';

const LEDGER_GAPS_RESOURCE = '/warehouse/inventory/ledger-gaps';

const pairHistoryInputSchema = z.object({
    productVariantId: z
        .string()
        .trim()
        .min(1, 'ID varian produk wajib diisi'),
    locationId: z.string().trim().min(1, 'ID lokasi wajib diisi'),
});

export const listStockLedgerGaps = withTenant(
    async function listStockLedgerGaps() {
        return safeAction(async () => {
            await requireWarehouseResourcePermission(LEDGER_GAPS_RESOURCE);
            return checkStockLedgerHealth();
        });
    },
);

export const getStockLedgerGapHistory = withTenant(
    async function getStockLedgerGapHistory(input: unknown) {
        return safeAction(async () => {
            await requireWarehouseResourcePermission(LEDGER_GAPS_RESOURCE);
            const parsed = pairHistoryInputSchema.safeParse(input);
            if (!parsed.success) {
                throw new ValidationError(
                    parsed.error.issues[0]?.message ?? 'Input tidak valid',
                );
            }
            return getStockLedgerPairHistory(
                parsed.data.productVariantId,
                parsed.data.locationId,
            );
        });
    },
);
