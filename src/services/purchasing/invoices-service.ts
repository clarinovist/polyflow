import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/audit';
import { addDays } from 'date-fns';
import { PurchaseInvoiceStatus } from '@prisma/client';
import { CreatePurchaseInvoiceValues } from '@/lib/schemas/purchasing';

export async function createInvoice(data: CreatePurchaseInvoiceValues) {
    const finalDueDate = data.dueDate || addDays(data.invoiceDate, data.termOfPaymentDays || 0);

    const po = await prisma.purchaseOrder.findUnique({
        where: { id: data.purchaseOrderId },
        select: { totalAmount: true }
    });

    if (!po) throw new Error("Purchase Order not found");

    return await prisma.purchaseInvoice.create({
        data: {
            invoiceNumber: data.invoiceNumber,
            purchaseOrderId: data.purchaseOrderId,
            invoiceDate: data.invoiceDate,
            dueDate: finalDueDate,
            termOfPaymentDays: data.termOfPaymentDays || 0,
            totalAmount: po.totalAmount || 0,
            status: PurchaseInvoiceStatus.UNPAID,
        }
    });
}

export async function recordPayment(id: string, amount: number, userId: string) {
    return await prisma.$transaction(async (tx) => {
        const invoice = await tx.purchaseInvoice.findUnique({ where: { id } });
        if (!invoice) throw new Error("Invoice not found");

        const newPaidAmount = invoice.paidAmount.toNumber() + amount;
        let status: PurchaseInvoiceStatus = PurchaseInvoiceStatus.PARTIAL;

        if (newPaidAmount >= invoice.totalAmount.toNumber()) {
            status = PurchaseInvoiceStatus.PAID;
        }

        await tx.purchasePayment.create({
            data: {
                purchaseInvoiceId: id,
                amount,
                paymentDate: new Date(),
                createdById: userId
            }
        });

        const updated = await tx.purchaseInvoice.update({
            where: { id },
            data: {
                paidAmount: newPaidAmount,
                status
            }
        });

        await logActivity({
            userId,
            action: 'PAYMENT_PURCHASE',
            entityType: 'PurchaseInvoice',
            entityId: id,
            details: `Recorded payment of ${amount} for Invoice ${invoice.invoiceNumber}. New Status: ${status}`,
            tx
        });

        return updated;
    });
}

export async function getPurchaseInvoiceById(id: string) {
    return await prisma.purchaseInvoice.findUnique({
        where: { id },
        include: {
            purchaseOrder: {
                select: {
                    id: true,
                    orderNumber: true,
                    totalAmount: true,
                    supplier: { select: { name: true, code: true } }
                }
            },
            purchasePayments: {
                include: {
                    createdBy: { select: { name: true } }
                },
                orderBy: { paymentDate: 'desc' }
            }
        }
    });
}

export async function getPurchaseInvoices() {
    return await prisma.purchaseInvoice.findMany({
        include: {
            purchaseOrder: {
                select: {
                    orderNumber: true,
                    supplier: { select: { name: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
}

export async function generateBillNumber(): Promise<string> {
    const dateStr = new Date().getFullYear().toString();
    const prefix = `BILL-${dateStr}-`;

    const lastBill = await prisma.purchaseInvoice.findFirst({
        where: { invoiceNumber: { startsWith: prefix } },
        orderBy: { invoiceNumber: 'desc' },
    });

    let nextSequence = 1;
    if (lastBill) {
        const parts = lastBill.invoiceNumber.split('-');
        const lastSeq = parseInt(parts[2]);
        if (!isNaN(lastSeq)) {
            nextSequence = lastSeq + 1;
        }
    }

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
}

export async function createDraftBillFromPo(purchaseOrderId: string, userId: string) {
    const po = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        select: { totalAmount: true, orderNumber: true, status: true }
    });

    if (!po || !po.totalAmount) return;

    const existing = await prisma.purchaseInvoice.findFirst({
        where: { purchaseOrderId }
    });
    if (existing) return;

    const invoiceNumber = await generateBillNumber();
    const invoiceDate = new Date();
    const dueDate = addDays(invoiceDate, 30);

    // Set status to UNPAID if PO is RECEIVED or PARTIAL_RECEIVED, otherwise DRAFT
    const status = (po.status === 'RECEIVED' || po.status === 'PARTIAL_RECEIVED')
        ? PurchaseInvoiceStatus.UNPAID
        : PurchaseInvoiceStatus.DRAFT;

    const invoice = await prisma.purchaseInvoice.create({
        data: {
            invoiceNumber,
            purchaseOrderId,
            invoiceDate,
            dueDate,
            termOfPaymentDays: 30,
            totalAmount: po.totalAmount,
            status,
            notes: `System generated bill for PO ${po.orderNumber}`
        }
    });

    await logActivity({
        userId,
        action: 'AUTO_GENERATE_BILL',
        entityType: 'PurchaseInvoice',
        entityId: invoice.id,
        details: `Automated bill ${invoiceNumber} generated for PO ${po.orderNumber} with status ${status}`,
    });

    return invoice;
}
