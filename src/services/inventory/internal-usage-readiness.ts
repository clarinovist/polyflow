import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import {
    ApplicationError,
    BusinessRuleError,
    ValidationError,
} from '@/lib/errors/errors';
import { internalUsageReadinessSchema } from '@/lib/schemas/internal-usage';
import type { InternalUsageReadiness } from '@/types/internal-usage';
import {
    assertInternalUsageAccounting,
    internalUsageAmount,
    resolveInternalUsageAccounts,
    selectInternalUsageInventory,
    skuInventoryBasis,
} from './internal-usage-accounting';

type Tx = Prisma.TransactionClient;
type Accounting = NonNullable<InternalUsageReadiness['accounting']>;

const ref = (account: { code: string; name: string }) => ({
    code: account.code,
    name: account.name,
});

async function describeBasis(
    tx: Tx,
    productVariantId: string,
): Promise<Accounting['basis']> {
    const basis = await skuInventoryBasis(tx, productVariantId);
    const accounts = await tx.account.findMany({
        where: { id: { in: [...basis.keys()] } },
        select: { id: true, code: true, name: true },
    });
    return accounts
        .map((account) => ({
            ...ref(account),
            value: basis.get(account.id)!.toNumber(),
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
}

/** Stale form data is common: recheck item, custody and availability first. */
async function loadStock(
    tx: Tx,
    input: { productVariantId: string; locationId: string; quantity: number },
) {
    const variant = await tx.productVariant.findUnique({
        where: { id: input.productVariantId },
        include: { product: true },
    });
    if (
        !variant ||
        variant.archivedAt ||
        variant.product.productType !== 'OPERATIONAL'
    )
        throw new BusinessRuleError(
            'Pilih Barang Operasional yang masih aktif. Muat ulang formulir.',
        );
    const location = await tx.location.findUnique({
        where: { id: input.locationId },
    });
    if (
        !location ||
        location.locationType !== 'INTERNAL' ||
        location.packagingOwnerCustomerId
    )
        throw new BusinessRuleError(
            'Pilih lokasi internal milik perusahaan, bukan stok pelanggan atau maklon.',
        );
    const [inventory, reserved] = await Promise.all([
        tx.inventory.findUnique({
            where: {
                locationId_productVariantId: {
                    locationId: location.id,
                    productVariantId: variant.id,
                },
            },
        }),
        tx.stockReservation.aggregate({
            where: {
                locationId: location.id,
                productVariantId: variant.id,
                status: 'ACTIVE',
            },
            _sum: { quantity: true },
        }),
    ]);
    const available = new Prisma.Decimal(inventory?.quantity ?? 0).minus(
        reserved._sum.quantity ?? 0,
    );
    if (!inventory || available.lt(input.quantity))
        throw new BusinessRuleError(
            'Stok tersedia di gudang ini tidak mencukupi. Muat ulang formulir.',
        );
    return { variant, inventory };
}

/**
 * Read-only readiness check before the user confirms a handover. It runs the
 * same account selection and proof as posting, without locks; posting still
 * re-verifies everything inside its own transaction.
 */
export async function checkInternalUsageReadiness(
    input: unknown,
    { includeAccounting }: { includeAccounting: boolean },
): Promise<InternalUsageReadiness> {
    const parsed = internalUsageReadinessSchema.safeParse(input);
    if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0].message);
    const data = parsed.data;
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        let amount: Prisma.Decimal | undefined;
        try {
            const { variant, inventory } = await loadStock(tx, data);
            amount = internalUsageAmount(inventory.averageCost, data.quantity);
            const resolved = await resolveInternalUsageAccounts(
                variant.product.inventoryAccountId,
            );
            const accountIds = {
                ...resolved,
                inventory: await selectInternalUsageInventory(
                    tx,
                    variant.id,
                    resolved.inventory,
                    amount,
                    Boolean(variant.product.inventoryAccountId),
                ),
            };
            const proof = await assertInternalUsageAccounting(
                tx,
                variant.id,
                accountIds,
                amount,
                { lock: false },
            );
            return {
                ready: true,
                message:
                    'Pemakaian siap dicatat. Serahkan barang, lalu konfirmasi.',
                ...(includeAccounting && {
                    accounting: {
                        amount: amount.toNumber(),
                        inventoryAccount: ref(proof.inventory),
                        expenseAccount: ref(proof.expense),
                        glBalance: proof.balance.toNumber(),
                        basis: await describeBasis(tx, variant.id),
                    },
                }),
            };
        } catch (error) {
            if (!(error instanceof ApplicationError)) throw error;
            return {
                ready: false,
                code: error.code,
                message: error.message,
                ...(includeAccounting && {
                    accounting: {
                        ...(amount && { amount: amount.toNumber() }),
                        basis: await describeBasis(tx, data.productVariantId),
                    },
                }),
            };
        }
    });
}
