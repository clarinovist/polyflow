import { prisma } from "@/lib/prisma";
import { Prisma } from '@prisma/client';
import { CreateSalesQuotationValues, UpdateSalesQuotationValues } from "@/lib/schemas/quotation";
import { SalesQuotationStatus, SalesOrderStatus, SalesOrderType } from "@prisma/client";

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
            throw new Error(`Customer with ID ${data.customerId} not found`);
        }

        const quotationNumber = await this.generateQuotationNumber();

        // Calculate totals
        let totalAmount = 0;
        let totalDiscount = 0;
        let totalTax = 0;

        const itemsWithTotals = data.items.map(item => {
            const rawSubtotal = item.quantity * item.unitPrice;
            const discountAmount = rawSubtotal * ((item.discountPercent || 0) / 100);
            const subtotalAfterDiscount = rawSubtotal - discountAmount;
            const taxAmount = subtotalAfterDiscount * ((item.taxPercent || 0) / 100);
            const flowSubtotal = subtotalAfterDiscount + taxAmount;

            totalDiscount += discountAmount;
            totalTax += taxAmount;
            totalAmount += flowSubtotal;

            return {
                ...item,
                discountPercent: item.discountPercent || 0,
                taxPercent: item.taxPercent || 0,
                taxAmount,
                subtotal: flowSubtotal
            };
        });

        return await prisma.salesQuotation.create({
            data: {
                quotationNumber,
                customerId: data.customerId,
                quotationDate: data.quotationDate,
                validUntil: data.validUntil,
                notes: data.notes,
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
        if (!existing) throw new Error("Quotation not found");

        if (existing.status === 'CONVERTED' || existing.status === 'EXPIRED') {
            throw new Error(`Cannot update quotation in ${existing.status} status`);
        }

        // Calculate totals
        let totalAmount = 0;
        let totalDiscount = 0;
        let totalTax = 0;

        const itemsWithTotals = data.items.map(item => {
            const rawSubtotal = item.quantity * item.unitPrice;
            const discountAmount = rawSubtotal * ((item.discountPercent || 0) / 100);
            const subtotalAfterDiscount = rawSubtotal - discountAmount;
            const taxAmount = subtotalAfterDiscount * ((item.taxPercent || 0) / 100);
            const flowSubtotal = subtotalAfterDiscount + taxAmount;

            totalDiscount += discountAmount;
            totalTax += taxAmount;
            totalAmount += flowSubtotal;

            return {
                ...item,
                discountPercent: item.discountPercent || 0,
                taxPercent: item.taxPercent || 0,
                taxAmount,
                subtotal: flowSubtotal
            };
        });

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
                    status: data.status, // Allow updating status manually (e.g. DRAFT -> SENT)
                    totalAmount,
                    discountAmount: totalDiscount,
                    taxAmount: totalTax,
                    items: {
                        create: itemsWithTotals.map(item => ({
                            productVariantId: item.productVariantId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
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
        if (!existing) throw new Error("Quotation not found");
        if (existing.status === 'CONVERTED') throw new Error("Cannot delete converted quotation");

        return await prisma.salesQuotation.delete({
            where: { id }
        });
    }

    static async convertToOrder(quotationId: string, userId: string, sourceLocationId: string) {
        const quotation = await this.getQuotationById(quotationId);
        if (!quotation) throw new Error("Quotation not found");

        if (quotation.status === 'CONVERTED') throw new Error("Quotation already converted");
        if (quotation.status === 'EXPIRED') throw new Error("Quotation expired");
        if (quotation.status === 'REJECTED') throw new Error("Quotation was rejected");

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

            return salesOrder;
        });
    }
}
