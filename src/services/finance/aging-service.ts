import { prisma } from '@/lib/core/prisma';
import { InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';

export interface AgingRow {
    partnerId: string;
    partnerName: string;
    type: 'AR' | 'AP';
    current: number; // 0-30 days
    days31to60: number;
    days61to90: number;
    over90: number;
    total: number;
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
            }
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
                    current: 0,
                    days31to60: 0,
                    days61to90: 0,
                    over90: 0,
                    total: 0
                });
            }

            const row = map.get(customerId)!;
            const baseDate = inv.dueDate || inv.invoiceDate;
            const daysOld = Math.floor((now - baseDate.getTime()) / (1000 * 3600 * 24));

            if (daysOld <= 30) row.current += outstanding;
            else if (daysOld <= 60) row.days31to60 += outstanding;
            else if (daysOld <= 90) row.days61to90 += outstanding;
            else row.over90 += outstanding;

            row.total += outstanding;
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
            }
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
                    current: 0,
                    days31to60: 0,
                    days61to90: 0,
                    over90: 0,
                    total: 0
                });
            }

            const row = map.get(supplierId)!;
            const baseDate = inv.dueDate || inv.invoiceDate;
            const daysOld = Math.floor((now - baseDate.getTime()) / (1000 * 3600 * 24));

            if (daysOld <= 30) row.current += outstanding;
            else if (daysOld <= 60) row.days31to60 += outstanding;
            else if (daysOld <= 90) row.days61to90 += outstanding;
            else row.over90 += outstanding;

            row.total += outstanding;
        }

        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }
}
