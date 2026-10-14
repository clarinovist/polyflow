'use server';

import {
    readHppPriceSimulatorDefault,
    readHppPriceSimulatorVariantOptions,
} from '@/actions/production/hpp-price-simulator-query';
import { requireHppPriceSimulatorAccess } from '@/lib/auth/hpp-price-simulator-access';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, ValidationError } from '@/lib/errors/errors';

export const getHppPriceSimulatorVariantOptions = withTenant(
    async function getHppPriceSimulatorVariantOptions() {
        return safeAction(async () => {
            const { db } = await requireHppPriceSimulatorAccess();
            return readHppPriceSimulatorVariantOptions(db);
        });
    },
);

export const getHppPriceSimulatorDefault = withTenant(
    async function getHppPriceSimulatorDefault(productVariantId: string) {
        return safeAction(async () => {
            const { db } = await requireHppPriceSimulatorAccess();
            return readHppPriceSimulatorDefault(
                db,
                validateProductVariantId(productVariantId),
            );
        });
    },
);

function validateProductVariantId(value: string): string {
    const normalized = value.trim();
    if (!/^[\w-]{1,100}$/.test(normalized)) {
        throw new ValidationError('Varian produk tidak valid.');
    }
    return normalized;
}
