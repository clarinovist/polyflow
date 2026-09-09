'use server';

import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import { requireWarehouseResourcePermission } from '@/lib/tools/auth-checks';
import { getStockBalance } from '@/services/inventory/stock-balance-service';
import type { StockBalanceFilters } from '@/types/stock-balance';

export const getStockBalanceAction = withTenant(
    async function getStockBalanceAction(filters: StockBalanceFilters = {}) {
        return safeAction(async () => {
            await requireWarehouseResourcePermission('/warehouse/inventory');
            return getStockBalance(filters);
        });
    },
);
