'use server';

import { withTenant } from '@/lib/core/tenant';
import { safeAction, ValidationError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { requireSalesFinance } from '@/lib/auth/sales-access';
import {
    calculateCommission,
    type CalculateCommissionInput,
} from '@/services/sales/commission-service';

function parseDateParam(v: unknown, field: string): Date {
    if (v instanceof Date) {
        if (isNaN(v.getTime()))
            throw new ValidationError(`${field} tidak valid`);
        return v;
    }
    if (typeof v === 'string') {
        const d = new Date(v);
        if (isNaN(d.getTime()))
            throw new ValidationError(`${field} tidak valid: ${v}`);
        return d;
    }
    throw new ValidationError(`${field} wajib berupa Date/ISO string`);
}

export const calculateCommissionAction = withTenant(
    async function calculateCommissionAction(raw: {
        from: string | Date;
        to: string | Date;
        userId?: string;
    }) {
        return safeAction(async () => {
            await requireSalesFinance();

            if (!raw) throw new ValidationError('Input tidak valid');

            const from = parseDateParam(raw.from, 'from');
            const to = parseDateParam(raw.to, 'to');

            if (from > to) {
                throw new ValidationError('from harus <= to');
            }

            const input: CalculateCommissionInput = {
                from,
                to,
                userId: raw.userId ? String(raw.userId) : undefined,
            };

            const result = await calculateCommission(input);
            return serializeData(result);
        });
    },
);
