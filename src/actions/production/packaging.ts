'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requirePlanningRole, requireProductionLeaderRole } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { packagingOptionSchema } from '@/lib/schemas/production-packaging';
import { logActivity } from '@/lib/tools/audit';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const getProductionPackagingOptions = withTenant(async function getProductionPackagingOptions(baseVariantId: string) {
    return safeAction(async () => {
        await requireProductionLeaderRole();
        z.string().min(1).parse(baseVariantId);
        const [options, stock] = await Promise.all([
            prisma.productionPackagingOption.findMany({
                where: { baseVariantId, outputVariant: { archivedAt: null } },
                include: { outputVariant: { select: { id: true, name: true, primaryUnit: true } } },
                orderBy: { outputVariant: { name: 'asc' } },
            }),
            prisma.inventory.findMany({ where: {
                quantity: { gt: 0 }, productVariant: { archivedAt: null, primaryUnit: 'PCS', product: { productType: 'PACKAGING' } },
                OR: [{ location: { locationType: 'INTERNAL' } }, { location: { packagingOwnerCustomerId: { not: null } } }],
            }, include: {
                productVariant: { select: { id: true, name: true } },
                location: { select: { id: true, name: true, packagingOwnerCustomerId: true, packagingOwnerCustomer: { select: { name: true } } } },
            }, orderBy: [{ productVariantId: 'asc' }, { locationId: 'asc' }] }),
        ]);
        return {
            options: options.map((option) => ({ id: option.outputVariantId, name: option.outputVariant.name, labelVariantId: option.labelVariantId })),
            stock: stock.map((row) => ({
                id: row.id, productVariantId: row.productVariantId, name: row.productVariant.name,
                locationId: row.locationId, locationName: row.location.name,
                ownerCustomerId: row.location.packagingOwnerCustomerId,
                ownerName: row.location.packagingOwnerCustomer?.name ?? null,
                quantity: Number(row.quantity),
            })),
        };
    });
});

export const createProductionPackagingOption = withTenant(async function createProductionPackagingOption(input: z.infer<typeof packagingOptionSchema>) {
    return safeAction(async () => {
        const session = await requirePlanningRole();
        const data = packagingOptionSchema.parse(input);
        const id = await prisma.$transaction(async (tx) => {
            const [base, output, label] = await Promise.all([
                tx.productVariant.findUniqueOrThrow({ where: { id: data.baseVariantId } }),
                tx.productVariant.findUniqueOrThrow({ where: { id: data.outputVariantId } }),
                data.labelVariantId ? tx.productVariant.findUniqueOrThrow({ where: { id: data.labelVariantId }, include: { product: true } }) : null,
            ]);
            if (base.archivedAt || output.archivedAt || base.productId !== output.productId || base.primaryUnit !== output.primaryUnit ||
                base.salesUnit !== output.salesUnit || !base.conversionFactor.equals(output.conversionFactor)) {
                throw new BusinessRuleError('SKU hasil harus berada pada produk dasar yang sama dengan kontrak satuan identik.');
            }
            if (label && (label.archivedAt || label.primaryUnit !== 'PCS' || label.product.productType !== 'PACKAGING')) {
                throw new BusinessRuleError('Etiket harus merupakan kemasan aktif bersatuan PCS/lembar.');
            }
            const option = await tx.productionPackagingOption.create({ data });
            await logActivity({ userId: session.user.id, action: 'CREATE_PACKAGING_OPTION', entityType: 'ProductionPackagingOption', entityId: option.id, details: 'Pemetaan SKU hasil ke BOM inti.', tx });
            return option.id;
        });
        revalidatePath('/production/packaging');
        return id;
    });
});

export const createPackagingCustodyLocation = withTenant(async function createPackagingCustodyLocation(input: { customerId: string }) {
    return safeAction(async () => {
        const session = await requirePlanningRole();
        const { customerId } = z.object({ customerId: z.string().min(1) }).parse(input);
        const id = await prisma.$transaction(async (tx) => {
            const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId, isActive: true } });
            const slug = `packaging-custody-${customer.id}`;
            const existing = await tx.location.findUnique({ where: { slug } });
            if (existing) {
                if (existing.packagingOwnerCustomerId !== customer.id) throw new BusinessRuleError('Lokasi sudah ada dengan kepemilikan berbeda.');
                return existing.id;
            }
            const location = await tx.location.create({ data: {
                name: `Kemasan titipan — ${customer.name}`, slug,
                locationType: 'CUSTOMER_OWNED', packagingOwnerCustomerId: customer.id,
            } });
            await logActivity({ userId: session.user.id, action: 'CREATE_PACKAGING_CUSTODY', entityType: 'Location', entityId: location.id, details: 'Lokasi titipan kemasan kosong; tidak memindahkan saldo lama.', tx });
            return location.id;
        });
        revalidatePath('/production/packaging');
        return id;
    });
});
