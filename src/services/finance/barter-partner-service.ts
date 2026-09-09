import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { normalizePartnerName } from '@/lib/finance/barter';
import type { SaveBarterPartnerInput } from '@/lib/schemas/barter';
import { retryBarterWrite } from './barter-write-retry';

export class BarterPartnerService {
    static async getByCustomerId(customerId: string) {
        return prisma.barterPartner.findUnique({
            where: { customerId },
            include: {
                supplier: true,
                _count: { select: { settlements: true } },
            },
        });
    }

    static async listMatchingSuppliers(customerId: string) {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true, name: true },
        });
        if (!customer) throw new NotFoundError('Customer', customerId);

        const normalizedName = normalizePartnerName(customer.name);
        const suppliers = await prisma.supplier.findMany({
            where: { isActive: true },
            select: { id: true, name: true, code: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
        return suppliers.filter(
            (supplier) =>
                normalizePartnerName(supplier.name) === normalizedName,
        );
    }

    static async getSettings(customerId: string) {
        const [partner, candidates] = await Promise.all([
            this.getByCustomerId(customerId),
            this.listMatchingSuppliers(customerId),
        ]);
        return { partner, candidates };
    }

    static async save(input: SaveBarterPartnerInput, userId: string) {
        return retryBarterWrite(() =>
            prisma.$transaction(
                async (tx) => {
                    // Existing partner first, then identities, matching settlement/FK order.
                    await tx.$queryRaw`SELECT id FROM "BarterPartner" WHERE "customerId" = ${input.customerId} FOR UPDATE`;
                    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${input.customerId} FOR UPDATE`;
                    await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${input.supplierId} FOR UPDATE`;

                    const [
                        customer,
                        supplier,
                        customerPartner,
                        supplierPartner,
                    ] = await Promise.all([
                        tx.customer.findUnique({
                            where: { id: input.customerId },
                            select: {
                                id: true,
                                name: true,
                                isActive: true,
                                lifecycleStatus: true,
                            },
                        }),
                        tx.supplier.findUnique({
                            where: { id: input.supplierId },
                            select: { id: true, name: true, isActive: true },
                        }),
                        tx.barterPartner.findUnique({
                            where: { customerId: input.customerId },
                            include: {
                                _count: { select: { settlements: true } },
                            },
                        }),
                        tx.barterPartner.findUnique({
                            where: { supplierId: input.supplierId },
                        }),
                    ]);

                    if (!customer) {
                        throw new NotFoundError('Customer', input.customerId);
                    }
                    if (!supplier) {
                        throw new NotFoundError('Supplier', input.supplierId);
                    }
                    if (
                        customerPartner?.supplierId === input.supplierId &&
                        !input.isActive
                    ) {
                        return tx.barterPartner.update({
                            where: { id: customerPartner.id },
                            data: { isActive: false, updatedById: userId },
                            include: { supplier: true },
                        });
                    }
                    if (
                        !customer.isActive ||
                        customer.lifecycleStatus === 'MERGED' ||
                        customer.lifecycleStatus === 'INACTIVE'
                    ) {
                        throw new BusinessRuleError(
                            'Pelanggan tidak aktif atau sudah digabung sehingga tidak dapat diizinkan untuk barter.',
                            undefined,
                            'BARTER_CUSTOMER_INACTIVE',
                        );
                    }
                    if (!supplier.isActive) {
                        throw new BusinessRuleError(
                            'Supplier tidak aktif sehingga tidak dapat dipasangkan untuk barter.',
                            undefined,
                            'BARTER_SUPPLIER_INACTIVE',
                        );
                    }
                    if (
                        normalizePartnerName(customer.name) !==
                        normalizePartnerName(supplier.name)
                    ) {
                        throw new BusinessRuleError(
                            'Nama customer dan supplier harus sama setelah normalisasi spasi dan huruf.',
                            undefined,
                            'BARTER_PARTNER_NAME_MISMATCH',
                        );
                    }
                    if (
                        supplierPartner &&
                        supplierPartner.id !== customerPartner?.id
                    ) {
                        throw new BusinessRuleError(
                            'Supplier sudah dipasangkan dengan customer lain.',
                            undefined,
                            'BARTER_SUPPLIER_ALREADY_PAIRED',
                        );
                    }

                    if (customerPartner) {
                        if (
                            customerPartner.supplierId !== input.supplierId &&
                            customerPartner._count.settlements > 0
                        ) {
                            throw new BusinessRuleError(
                                'Pasangan barter yang sudah memiliki histori tidak dapat diganti. Nonaktifkan pasangan bila tidak lagi digunakan.',
                                undefined,
                                'BARTER_PARTNER_IMMUTABLE',
                            );
                        }
                        return tx.barterPartner.update({
                            where: { id: customerPartner.id },
                            data: {
                                supplierId: input.supplierId,
                                isActive: input.isActive,
                                updatedById: userId,
                            },
                            include: { supplier: true },
                        });
                    }

                    return tx.barterPartner.create({
                        data: {
                            customerId: input.customerId,
                            supplierId: input.supplierId,
                            isActive: input.isActive,
                            createdById: userId,
                            updatedById: userId,
                        },
                        include: { supplier: true },
                    });
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                },
            ),
        );
    }
}
