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

/** The `updatedAt` the client loaded (null before the first save). */
function parseLoadedVersion(value: unknown): string | null {
    if (value === null) return null;
    if (
        typeof value !== 'string' ||
        value.length > 40 ||
        Number.isNaN(Date.parse(value))
    ) {
        throw new ValidationError('Versi dokumen tidak valid.');
    }
    return value;
}

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
    async function saveOwnerHppWorkspace(
        input: unknown,
        loadedUpdatedAt: string | null,
    ) {
        return safeAction(async () => {
            const { db, userId } = await requireOwnerHppAccess();
            const parsed = parseOwnerHppWorkspace(input);
            if (!parsed.success) throw new ValidationError(parsed.error);
            const loadedVersion = parseLoadedVersion(loadedUpdatedAt);
            return writeOwnerHppWorkspace(
                db,
                userId,
                parsed.data,
                loadedVersion,
            );
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
