import { prisma } from "@/lib/core/prisma";
import { Prisma } from '@prisma/client';
import { CreateSalesQuotationValues, UpdateSalesQuotationValues } from "@/lib/schemas/quotation";
import { SalesQuotationStatus, SalesOrderStatus, SalesOrderType, Unit } from "@prisma/client";
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from "@/lib/errors/errors";
import { logActivity } from "@/lib/tools/audit";

type QuotationLineInput = {
    productVariantId: string;
    quantity: number;
    unitPrice: number;
    enteredQuantity?: number;
    enteredUnit?: Unit;
    conversionFactorSnapshot?: number;
    enteredUnitPrice?: number;
    discountPercent?: number;
    taxPercent?: number;
};

function decimalToNumber(value: unknown, fallback = 1) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (typeof value === 'object' && value !== null && 'toNumber' in value) {
        const parsed = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function assertNearlyEqual(clientValue: number | undefined, serverValue: number, label: string) {
    if (clientValue === undefined) return;
    if (Math.abs(Number(clientValue) - serverValue) > 0.0001) {
        throw new ValidationError(`${label} mismatch. Client sent ${clientValue}, server calculated ${serverValue}.`);
    }
}

function normalizeQuotationLineItem(item: QuotationLineInput, variant: { primaryUnit: Unit; salesUnit: Unit | null; conversionFactor: unknown }) {
    const payloadCount = [
        item.enteredQuantity !== undefined,
        item.enteredUnit !== undefined,
        item.enteredUnitPrice !== undefined,
        item.conversionFactorSnapshot !== undefined,
    ].filter(Boolean).length;

    if (payloadCount > 0 && payloadCount < 4) {
        throw new ValidationError('Incomplete quotation conversion payload. Send enteredQuantity, enteredUnit, enteredUnitPrice, and conversionFactorSnapshot together.');
    }

    if (payloadCount === 0) {
        return {
            productVariantId: item.productVariantId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            enteredQuantity: undefined,
            enteredUnit: undefined,
            conversionFactorSnapshot: undefined,
            enteredUnitPrice: undefined,
            discountPercent: item.discountPercent || 0,
            taxPercent: item.taxPercent || 0,
        };
    }

    let factor = 1;
    if (item.enteredUnit !== variant.primaryUnit) {
        if (!variant.salesUnit || item.enteredUnit !== variant.salesUnit) {
            throw new ValidationError(`Unit ${item.enteredUnit} is not valid for this product variant`);
        }
        factor = decimalToNumber(variant.conversionFactor, 1);
    }
    if (!Number.isFinite(factor) || factor <= 0) {
        throw new ValidationError(`Invalid conversion factor for quotation unit ${item.enteredUnit}`);
    }

    const enteredQuantity = Number(item.enteredQuantity);
    const enteredUnitPrice = Number(item.enteredUnitPrice);
    const baseQuantity = enteredQuantity * factor;
    const baseUnitPrice = enteredUnitPrice / factor;

    assertNearlyEqual(item.quantity, baseQuantity, 'Quotation quantity conversion');
    assertNearlyEqual(item.unitPrice, baseUnitPrice, 'Quotation unit price conversion');
    assertNearlyEqual(item.conversionFactorSnapshot, factor, 'Quotation conversion factor');

    return {
        productVariantId: item.productVariantId,
        quantity: baseQuantity,
        unitPrice: baseUnitPrice,
        enteredQuantity,
        enteredUnit: item.enteredUnit,
        conversionFactorSnapshot: factor,
        enteredUnitPrice,
        discountPercent: item.discountPercent || 0,
        taxPercent: item.taxPercent || 0,
    };
}

export class QuotationService {
    static async generateQuotationNumber() {
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);

        const count = await prisma.salesQuotation.count({
            where: {
                createdAt: {
                    gte: startOfYear,
                    lt: endOfYear
                }
            }
        });

        const sequence = (count + 1).toString().padStart(4, '0');
        return `SQ-${year}-${sequence}`;
    }

    static async getQuotations(filters?: { startDate?: Date, endDate?: Date }) {
        const where: Prisma.SalesQuotationWhereInput = {};
        if (filters?.startDate && filters?.endDate) {
            where.quotationDate = {
                gte: filters.startDate,
                lte: filters.endDate
            };
        }

        return await prisma.salesQuotation.findMany({
            where,
            include: {
                customer: true,
                _count: {
                    select: { items: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async getQuotationById(id: string) {
        return await prisma.salesQuotation.findUnique({
            where: { id },
            include: {
                customer: true,
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true
                            }
                        }
                    }
                },
                createdBy: true,
                salesOrders: true // Show linked orders
            }
        });
    }

    static async createQuotation(data: CreateSalesQuotationValues, userId: string) {
        // Validate customer existence
        const customerExists = await prisma.customer.findUnique({
            where: { id: data.customerId }
        });

        if (!customerExists) {
            throw new NotFoundError("Customer", data.customerId);
        }

        const quotationNumber = await this.generateQuotationNumber();

        // Calculate totals
        let totalAmount = 0;
        let totalDiscount = 0;
        let totalTax = 0;

        const itemsWithTotals = await Promise.all(data.items.map(async (item) => {
            const variant = await prisma.productVariant.findUnique({
                where: { id: item.productVariantId },
                select: { id: true, primaryUnit: true, salesUnit: true, conversionFactor: true }
            });
            if (!variant) throw new NotFoundError("Product Variant", item.productVariantId);

            const normalized = normalizeQuotationLineItem(item, variant);
            const rawSubtotal = normalized.quantity * normalized.unitPrice;
            const discountAmount = rawSubtotal * (normalized.discountPercent / 100);
            const subtotalAfterDiscount = rawSubtotal - discountAmount;
            const taxAmount = subtotalAfterDiscount * (normalized.taxPercent / 100);
            const flowSubtotal = subtotalAfterDiscount + taxAmount;

            totalDiscount += discountAmount;
            totalTax += taxAmount;
            totalAmount += flowSubtotal;

            return {
                ...normalized,
                taxAmount,
                subtotal: flowSubtotal
            };
        }));

        return await prisma.salesQuotation.create({
            data: {
                quotationNumber,
                customerId: data.customerId,
                quotationDate: data.quotationDate,
                validUntil: data.validUntil,
                notes: data.notes,
                subject: data.subject,
                paymentTerms: data.paymentTerms,
                shippingTerms: data.shippingTerms,
                termsConditions: data.termsConditions,
                totalAmount,
                discountAmount: totalDiscount,
                taxAmount: totalTax,
                status: SalesQuotationStatus.DRAFT,
                createdById: userId,
                items: {
                    create: itemsWithTotals.map(item => ({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        enteredQuantity: item.enteredQuantity,
                        enteredUnit: item.enteredUnit,
                        conversionFactorSnapshot: item.conversionFactorSnapshot,
                        enteredUnitPrice: item.enteredUnitPrice,
                        discountPercent: item.discountPercent,
                        taxPercent: item.taxPercent,
                        taxAmount: item.taxAmount,
                        subtotal: item.subtotal
                    }))
                }
            },
            include: { items: true }
        });
    }

    static async updateQuotation(data: UpdateSalesQuotationValues) {
        const existing = await prisma.salesQuotation.findUnique({ where: { id: data.id } });
        if (!existing) throw new NotFoundError("Sales Quotation", data.id);

        if (existing.status === 'CONVERTED' || existing.status === 'EXPIRED') {
            throw new BusinessRuleError(
                `Cannot update quotation in ${existing.status} status`,
                { status: existing.status, quotationId: data.id },
                "INVALID_QUOTATION_STATUS",
            );
        }

        // Calculate totals
        let totalAmount = 0;
        let totalDiscount = 0;
        let totalTax = 0;

        const itemsWithTotals = await Promise.all(data.items.map(async (item) => {
            const variant = await prisma.productVariant.findUnique({
                where: { id: item.productVariantId },
                select: { id: true, primaryUnit: true, salesUnit: true, conversionFactor: true }
            });
            if (!variant) throw new NotFoundError("Product Variant", item.productVariantId);

            const normalized = normalizeQuotationLineItem(item, variant);
            const rawSubtotal = normalized.quantity * normalized.unitPrice;
            const discountAmount = rawSubtotal * (normalized.discountPercent / 100);
            const subtotalAfterDiscount = rawSubtotal - discountAmount;
            const taxAmount = subtotalAfterDiscount * (normalized.taxPercent / 100);
            const flowSubtotal = subtotalAfterDiscount + taxAmount;

            totalDiscount += discountAmount;
            totalTax += taxAmount;
            totalAmount += flowSubtotal;

            return {
                ...normalized,
                taxAmount,
                subtotal: flowSubtotal
            };
        }));

        return await prisma.$transaction(async (tx) => {
            await tx.salesQuotationItem.deleteMany({
                where: { salesQuotationId: data.id }
            });

            return await tx.salesQuotation.update({
                where: { id: data.id },
                data: {
                    customerId: data.customerId,
                    quotationDate: data.quotationDate,
                    validUntil: data.validUntil,
                    notes: data.notes,
                    subject: data.subject,
                    paymentTerms: data.paymentTerms,
                    shippingTerms: data.shippingTerms,
                    termsConditions: data.termsConditions,
                    status: data.status, // Allow updating status manually (e.g. DRAFT -> SENT)
                    totalAmount,
                    discountAmount: totalDiscount,
                    taxAmount: totalTax,
                    items: {
                        create: itemsWithTotals.map(item => ({
                            productVariantId: item.productVariantId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            enteredQuantity: item.enteredQuantity,
                            enteredUnit: item.enteredUnit,
                            conversionFactorSnapshot: item.conversionFactorSnapshot,
                            enteredUnitPrice: item.enteredUnitPrice,
                            discountPercent: item.discountPercent,
                            taxPercent: item.taxPercent,
                            taxAmount: item.taxAmount,
                            subtotal: item.subtotal
                        }))
                    }
                },
                include: { items: true }
            });
        });
    }

    static async deleteQuotation(id: string) {
        const existing = await prisma.salesQuotation.findUnique({ where: { id } });
        if (!existing) throw new NotFoundError("Sales Quotation", id);
        if (existing.status === 'CONVERTED') throw new BusinessRuleError(
            "Cannot delete converted quotation",
            { status: existing.status, quotationId: id },
            "INVALID_QUOTATION_STATUS",
        );

        return await prisma.salesQuotation.delete({
            where: { id }
        });
    }

    static async convertToOrder(quotationId: string, userId: string, sourceLocationId: string) {
        const quotation = await this.getQuotationById(quotationId);
        if (!quotation) throw new NotFoundError("Sales Quotation", quotationId);

        if (quotation.status === 'CONVERTED') throw new BusinessRuleError(
            "Quotation already converted",
            { status: quotation.status, quotationId },
            "INVALID_QUOTATION_STATUS",
        );
        if (quotation.status === 'EXPIRED') throw new BusinessRuleError(
            "Quotation expired",
            { status: quotation.status, quotationId },
            "INVALID_QUOTATION_STATUS",
        );
        if (quotation.status === 'REJECTED') throw new BusinessRuleError(
            "Quotation was rejected",
            { status: quotation.status, quotationId },
            "INVALID_QUOTATION_STATUS",
        );

        // Generate Order Number
        // We reuse logic from SalesService, but we need to import SalesService or duplicate logic?
        // Let's duplicate minimal logic or fetch count.
        const year = new Date().getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);
        const count = await prisma.salesOrder.count({
            where: { orderDate: { gte: startOfYear, lt: endOfYear } }
        });
        const sequence = (count + 1).toString().padStart(4, '0');
        const orderNumber = `SO-${year}-${sequence}`;

        return await prisma.$transaction(async (tx) => {
            // 1. Create Sales Order
            const salesOrder = await tx.salesOrder.create({
                data: {
                    orderNumber,
                    quotationId: quotation.id,
                    customerId: quotation.customerId,
                    sourceLocationId: sourceLocationId, // Must be provided as it's not in Quotation
                    orderDate: new Date(),
                    orderType: SalesOrderType.MAKE_TO_ORDER, // Usually MTO if coming from Quote? Or let user decide? Assuming MTO or MTS based on product? Defaulting.
                    status: SalesOrderStatus.DRAFT,
                    notes: quotation.notes ? `From Quotation ${quotation.quotationNumber}\n${quotation.notes}` : `From Quotation ${quotation.quotationNumber}`,
                    totalAmount: quotation.totalAmount,
                    discountAmount: quotation.discountAmount,
                    taxAmount: quotation.taxAmount,
                    createdById: userId,
                    items: {
                        create: quotation.items.map(item => ({
                            productVariantId: item.productVariantId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            enteredQuantity: item.enteredQuantity,
                            enteredUnit: item.enteredUnit,
                            conversionFactorSnapshot: item.conversionFactorSnapshot,
                            enteredUnitPrice: item.enteredUnitPrice,
                            discountPercent: item.discountPercent,
                            taxPercent: item.taxPercent,
                            taxAmount: item.taxAmount,
                            subtotal: item.subtotal
                        }))
                    }
                }
            });

            // 2. Update Quotation Status
            await tx.salesQuotation.update({
                where: { id: quotationId },
                data: { status: SalesQuotationStatus.CONVERTED }
            });

            await logActivity({
                userId,
                action: 'QUOTATION_ACCEPTED',
                entityType: 'SalesQuotation',
                entityId: quotationId,
                details: `Quotation ${quotation.quotationNumber} accepted and converted to Sales Order ${orderNumber}`,
                tx,
            });

            return salesOrder;
        });
    }
}
