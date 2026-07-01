import { prisma } from '@/lib/core/prisma';
import { InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';

export interface AgingInvoiceDetail {
    invoiceId: string;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date | null;
    daysOverdue: number; // negatif = belum jatuh tempo
    outstanding: number;
    status: string;
    bucket: 'notYetDue' | '1-30' | '31-60' | '61-90' | '90+';
}

export interface AgingRow {
    partnerId: string;
    partnerName: string;
    type: 'AR' | 'AP';
    notYetDue: number;
    current: number;
    days31to60: number;
    days61to90: number;
    over90: number;
    total: number;
    invoices: AgingInvoiceDetail[];
}

function getBucket(daysOverdue: number): AgingInvoiceDetail['bucket'] {
    if (daysOverdue < 0) return 'notYetDue';
    if (daysOverdue <= 30) return '1-30';
    if (daysOverdue <= 60) return '31-60';
    if (daysOverdue <= 90) return '61-90';
    return '90+';
}

export class AgingService {
    /**
     * Get AR Aging (Accounts Receivable - Sales Invoices)
     */
    static async getARAging(): Promise<AgingRow[]> {
        const invoices = await prisma.invoice.findMany({
            where: {
                status: {
                    in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]
                }
            },
            include: {
                salesOrder: {
                    include: { customer: true }
                }
            },
            orderBy: { invoiceDate: 'asc' }
        });

        const now = new Date().getTime();
        const map = new Map<string, AgingRow>();

        for (const inv of invoices) {
            const customerId = inv.salesOrder?.customerId || 'unknown';
            const customerName = inv.salesOrder?.customer?.name || 'Unknown Customer';
            const outstanding = inv.totalAmount.toNumber() - inv.paidAmount.toNumber();

            if (outstanding <= 0) continue;

            if (!map.has(customerId)) {
                map.set(customerId, {
                    partnerId: customerId,
                    partnerName: customerName,
                    type: 'AR',
                    notYetDue: 0,
                    current: 0,
                    days31to60: 0,
                    days61to90: 0,
                    over90: 0,
                    total: 0,
                    invoices: []
                });
            }

            const row = map.get(customerId)!;
            const baseDate = inv.dueDate || inv.invoiceDate;
            const daysOverdue = Math.floor((now - baseDate.getTime()) / (1000 * 3600 * 24));
            const bucket = getBucket(daysOverdue);

            if (daysOverdue < 0) row.notYetDue += outstanding;
            else if (daysOverdue <= 30) row.current += outstanding;
            else if (daysOverdue <= 60) row.days31to60 += outstanding;
            else if (daysOverdue <= 90) row.days61to90 += outstanding;
            else row.over90 += outstanding;

            row.total += outstanding;
            row.invoices.push({
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                dueDate: inv.dueDate,
                daysOverdue,
                outstanding,
                status: inv.status,
                bucket
            });
        }

        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }

    /**
     * Get AP Aging (Accounts Payable - Purchase Invoices)
     */
    static async getAPAging(): Promise<AgingRow[]> {
        const invoices = await prisma.purchaseInvoice.findMany({
            where: {
                status: {
                    in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.PARTIAL, PurchaseInvoiceStatus.OVERDUE]
                }
            },
            include: {
                purchaseOrder: {
                    include: { supplier: true }
                }
            },
            orderBy: { invoiceDate: 'asc' }
        });

        const now = new Date().getTime();
        const map = new Map<string, AgingRow>();

        for (const inv of invoices) {
            const supplierId = inv.purchaseOrder?.supplierId || 'unknown';
            const supplierName = inv.purchaseOrder?.supplier?.name || 'Unknown Supplier';
            const outstanding = inv.totalAmount.toNumber() - inv.paidAmount.toNumber();

            if (outstanding <= 0) continue;

            if (!map.has(supplierId)) {
                map.set(supplierId, {
                    partnerId: supplierId,
                    partnerName: supplierName,
                    type: 'AP',
                    notYetDue: 0,
                    current: 0,
                    days31to60: 0,
                    days61to90: 0,
                    over90: 0,
                    total: 0,
                    invoices: []
                });
            }

            const row = map.get(supplierId)!;
            const baseDate = inv.dueDate || inv.invoiceDate;
            const daysOverdue = Math.floor((now - baseDate.getTime()) / (1000 * 3600 * 24));
            const bucket = getBucket(daysOverdue);

            if (daysOverdue < 0) row.notYetDue += outstanding;
            else if (daysOverdue <= 30) row.current += outstanding;
            else if (daysOverdue <= 60) row.days31to60 += outstanding;
            else if (daysOverdue <= 90) row.days61to90 += outstanding;
            else row.over90 += outstanding;

            row.total += outstanding;
            row.invoices.push({
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                dueDate: inv.dueDate,
                daysOverdue,
                outstanding,
                status: inv.status,
                bucket
            });
        }

        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }
}
