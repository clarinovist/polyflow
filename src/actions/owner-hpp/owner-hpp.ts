'use server';

import { readHppPriceSimulatorVariantOptions } from '@/actions/production/hpp-price-simulator-query';
import { requireOwnerHppAccess } from '@/lib/auth/owner-hpp-access';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, ValidationError } from '@/lib/errors/errors';
import { buildStagesFromErp } from '@/lib/owner-hpp/erp-chain';
import { parseOwnerHppWorkspace } from '@/lib/owner-hpp/workspace-schema';
import { toBusinessDateString } from '@/lib/utils/timezone';
import {
    readOwnerHppErpNodes,
    readOwnerHppWorkspace,
    writeOwnerHppWorkspace,
} from './owner-hpp-query';

const VARIANT_ID_PATTERN = /^[\w-]{1,100}$/;

// Every action calls the guard first: the edge lets /owner through unauthenticated.

export const getOwnerHppWorkspace = withTenant(
    async function getOwnerHppWorkspace() {
        return safeAction(async () => {
            const { db, userId } = await requireOwnerHppAccess();
            return readOwnerHppWorkspace(db, userId);
        });
    },
);

export const saveOwnerHppWorkspace = withTenant(
    async function saveOwnerHppWorkspace(input: unknown) {
        return safeAction(async () => {
            const { db, userId } = await requireOwnerHppAccess();
            const parsed = parseOwnerHppWorkspace(input);
            if (!parsed.success) throw new ValidationError(parsed.error);
            return writeOwnerHppWorkspace(db, userId, parsed.data);
        });
    },
);

export const listOwnerHppVariantOptions = withTenant(
    async function listOwnerHppVariantOptions() {
        return safeAction(async () => {
            const { db } = await requireOwnerHppAccess();
            return readHppPriceSimulatorVariantOptions(db);
        });
    },
);

export const getOwnerHppErpChain = withTenant(
    async function getOwnerHppErpChain(rootVariantId: string) {
        return safeAction(async () => {
            const { db } = await requireOwnerHppAccess();
            const variantId = String(rootVariantId).trim();
            if (!VARIANT_ID_PATTERN.test(variantId)) {
                throw new ValidationError('Produk tidak valid.');
            }
            const nodes = await readOwnerHppErpNodes(db, variantId);
            return buildStagesFromErp({
                rootVariantId: variantId,
                nodes,
                fetchedAt: toBusinessDateString(new Date()),
            });
        });
    },
);
