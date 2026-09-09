'use server';

import { revalidatePath } from 'next/cache';

import {
    requireFinanceAccess,
    requireFinanceAdmin,
    requireFinanceApprover,
    requireFinanceMutation,
} from '@/lib/auth/finance-access';
import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import {
    createBarterSettlementSchema,
    saveBarterPartnerSchema,
    voidBarterSettlementSchema,
    type CreateBarterSettlementInput,
    type SaveBarterPartnerInput,
    type VoidBarterSettlementInput,
} from '@/lib/schemas/barter';
import { serializeData } from '@/lib/utils/utils';
import { BarterPartnerService } from '@/services/finance/barter-partner-service';
import { BarterSettlementService } from '@/services/finance/barter-settlement-service';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

function revalidateSettlementSurfaces() {
    revalidatePath('/finance/payments/received');
    revalidatePath('/finance/payments/sent');
    revalidatePath('/finance/invoices/sales');
    revalidatePath('/finance/invoices/purchase');
    revalidatePath('/finance/invoices/sales/[id]', 'page');
    revalidatePath('/finance/invoices/purchase/[id]', 'page');
    revalidatePath('/sales/customers/[id]', 'page');
    revalidatePath('/purchasing/suppliers/[id]', 'page');
}

export const getBarterPartnerSettings = withTenant(
    async function getBarterPartnerSettings(customerId: string) {
        return safeAction(async () => {
            await requireFinanceAdmin();
            return serializeData(
                await BarterPartnerService.getSettings(customerId),
            );
        });
    },
);

export const saveBarterPartner = withTenant(async function saveBarterPartner(
    input: SaveBarterPartnerInput,
) {
    return safeAction(async () => {
        const session = await requireFinanceAdmin();
        const data = saveBarterPartnerSchema.parse(input);
        const partner = await BarterPartnerService.save(data, session.user.id);
        revalidatePath(`/sales/customers/${data.customerId}`);
        revalidatePath('/finance/payments/received');
        return serializeData(partner);
    });
});

export const getBarterOptions = withTenant(async function getBarterOptions(
    invoiceId: string,
    search = '',
) {
    return safeAction(async () => {
        await requireFinanceAccess();
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            select: {
                id: true,
                status: true,
                totalAmount: true,
                paidAmount: true,
                salesOrder: { select: { customerId: true } },
            },
        });
        if (!invoice) throw new NotFoundError('Invoice', invoiceId);
        const customerId = invoice.salesOrder.customerId;
        const receivableBalance = invoice.totalAmount.minus(invoice.paidAmount);
        if (!customerId) {
            throw new BusinessRuleError(
                'Barter hanya tersedia untuk invoice customer eksternal.',
            );
        }
        if (
            !['UNPAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status) ||
            receivableBalance.lte(0)
        ) {
            return { eligible: false as const, purchaseInvoices: [] };
        }
        const partner = await prisma.barterPartner.findUnique({
            where: { customerId },
            include: { customer: true, supplier: true },
        });
        if (
            !partner?.isActive ||
            !partner.customer.isActive ||
            partner.customer.lifecycleStatus === 'MERGED' ||
            partner.customer.lifecycleStatus === 'INACTIVE' ||
            !partner.supplier.isActive
        ) {
            return { eligible: false as const, purchaseInvoices: [] };
        }
        const purchaseInvoices = await prisma.purchaseInvoice.findMany({
            where: {
                status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                purchaseOrder: { supplierId: partner.supplierId },
                paidAmount: { lt: prisma.purchaseInvoice.fields.totalAmount },
                ...(search.trim()
                    ? {
                          invoiceNumber: {
                              contains: search.trim().slice(0, 100),
                              mode: 'insensitive' as const,
                          },
                      }
                    : {}),
            },
            select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true,
                paidAmount: true,
                dueDate: true,
            },
            orderBy: [
                { dueDate: 'asc' },
                { invoiceDate: 'asc' },
                { id: 'asc' },
            ],
            take: 200,
        });
        return serializeData({
            eligible: true as const,
            supplier: {
                id: partner.supplier.id,
                name: partner.supplier.name,
            },
            receivableBalance: Number(receivableBalance),
            truncated: purchaseInvoices.length === 200,
            purchaseInvoices: purchaseInvoices
                .filter((item) => item.totalAmount.minus(item.paidAmount).gt(0))
                .map((item) => ({
                    ...item,
                    totalAmount: Number(item.totalAmount),
                    paidAmount: Number(item.paidAmount),
                })),
        });
    });
});

export const getBarterSettlementDetail = withTenant(
    async function getBarterSettlementDetail(settlementId: string) {
        return safeAction(async () => {
            await requireFinanceAccess();
            const settlement = await prisma.barterSettlement.findUnique({
                where: { id: settlementId },
                include: {
                    customer: { select: { id: true, name: true } },
                    supplier: { select: { id: true, name: true } },
                    invoice: {
                        select: { id: true, invoiceNumber: true },
                    },
                    purchaseInvoice: {
                        select: { id: true, invoiceNumber: true },
                    },
                    createdBy: { select: { id: true, name: true } },
                    voidedBy: { select: { id: true, name: true } },
                },
            });
            if (!settlement) {
                throw new NotFoundError('Barter Settlement', settlementId);
            }
            return serializeData(settlement);
        });
    },
);

export const createBarterSettlement = withTenant(
    async function createBarterSettlement(input: CreateBarterSettlementInput) {
        return safeAction(async () => {
            const session = await requireFinanceMutation();
            const data = createBarterSettlementSchema.parse(input);
            const settlement = await BarterSettlementService.create(
                data,
                session.user.id,
            );
            revalidateSettlementSurfaces();
            return {
                id: settlement.id,
                settlementNumber: settlement.settlementNumber,
            };
        });
    },
);

export const voidBarterSettlement = withTenant(
    async function voidBarterSettlement(input: VoidBarterSettlementInput) {
        return safeAction(async () => {
            const session = await requireFinanceApprover();
            const data = voidBarterSettlementSchema.parse(input);
            const settlement = await BarterSettlementService.void(
                data,
                session.user.id,
            );
            revalidateSettlementSurfaces();
            return {
                id: settlement.id,
                settlementNumber: settlement.settlementNumber,
                status: settlement.status,
            };
        });
    },
);
