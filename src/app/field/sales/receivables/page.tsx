import { getMyFieldReceivables } from '@/actions/sales/field-actions';
import { ReceivablesListClient } from './ReceivablesListClient';
import { MobileReadError } from '@/components/mobile/MobileReadError';

type EnrichedInvoice = {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date | string;
    dueDate: Date | string | null;
    totalAmount: unknown;
    paidAmount: unknown;
    creditedAmount?: unknown;
    priceAdjustmentAmount?: unknown;
    status: string;
    salesOrder?: {
        orderNumber?: string | null;
        customer?: { name?: string | null } | null;
    } | null;
    daysOverdue?: number;
    lastPromise?: {
        id: string;
        promisedDate?: Date | string | null;
        promisedAmount?: unknown;
    } | null;
};

export default async function SalesMobileReceivablesPage() {
    const invoicesRes = await getMyFieldReceivables();
    if (!invoicesRes.success) return <MobileReadError title="Daftar piutang belum tersedia" />;
    const invoices = (invoicesRes.data ?? []) as unknown as EnrichedInvoice[];

    const serialized = invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        creditedAmount: Number(inv.creditedAmount ?? 0),
        priceAdjustmentAmount: Number(inv.priceAdjustmentAmount ?? 0),
        status: inv.status,
        customerName: inv.salesOrder?.customer?.name || 'Customer Umum',
        orderNumber: inv.salesOrder?.orderNumber || '',
        daysOverdue: typeof inv.daysOverdue === 'number' ? inv.daysOverdue : undefined,
        lastPromise: inv.lastPromise
            ? {
                  id: inv.lastPromise.id,
                  promisedDate: inv.lastPromise.promisedDate ?? null,
                  promisedAmount:
                      inv.lastPromise.promisedAmount != null
                          ? Number(inv.lastPromise.promisedAmount)
                          : null,
              }
            : null,
    }));

    return <ReceivablesListClient invoices={serialized} />;
}
