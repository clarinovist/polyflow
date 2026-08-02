import { getMyFieldReceivables } from '@/actions/sales/field-actions';
import { getMyOverduePromisesAction } from '@/actions/sales/collection';
import { CollectionListClient } from './CollectionListClient';

type InvoiceRow = {
    id: string;
    invoiceNumber: string;
    invoiceDate: string | Date;
    dueDate: string | Date | null;
    totalAmount: unknown;
    paidAmount: unknown;
    status: string;
    salesOrder?: {
        customer?: { name?: string | null } | null;
        orderNumber?: string | null;
    } | null;
    daysOverdue?: number;
    lastPromise?: {
        id: string;
        type: string;
        promisedDate: string | Date | null;
        promisedAmount: unknown;
        activityDate: string | Date;
        notes: string | null;
    } | null;
};

type PromiseRow = {
    id: string;
    invoiceId: string;
    invoice?: { invoiceNumber?: string | null } | null;
    promisedDate: string | Date | null;
    promisedAmount: unknown;
    user?: { name?: string | null } | null;
    userId: string;
};

export default async function SalesMobileCollectionPage() {
    const [invoicesRes, promisesRes] = await Promise.all([
        getMyFieldReceivables(),
        getMyOverduePromisesAction(),
    ]);

    const invoices = (invoicesRes.success && invoicesRes.data
        ? invoicesRes.data
        : []) as unknown as InvoiceRow[];
    const overduePromises = (promisesRes.success && promisesRes.data
        ? promisesRes.data
        : []) as unknown as PromiseRow[];

    const serializedInvoices = invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount as number),
        paidAmount: Number(inv.paidAmount as number),
        status: inv.status,
        customerName: inv.salesOrder?.customer?.name || 'Customer Umum',
        orderNumber: inv.salesOrder?.orderNumber || '',
        daysOverdue: typeof inv.daysOverdue === 'number' ? inv.daysOverdue : 0,
        lastPromise: inv.lastPromise
            ? {
                  id: inv.lastPromise.id,
                  type: inv.lastPromise.type,
                  promisedDate: inv.lastPromise.promisedDate,
                  promisedAmount:
                      inv.lastPromise.promisedAmount != null
                          ? Number(inv.lastPromise.promisedAmount as number)
                          : null,
                  activityDate: inv.lastPromise.activityDate,
                  notes: inv.lastPromise.notes,
              }
            : null,
    }));

    const serializedPromises = overduePromises.map((p) => ({
        id: p.id,
        invoiceId: p.invoiceId,
        invoiceNumber: p.invoice?.invoiceNumber ?? p.invoiceId,
        promisedDate: p.promisedDate,
        promisedAmount:
            p.promisedAmount != null
                ? Number(p.promisedAmount as number)
                : null,
        userName: p.user?.name ?? p.userId,
    }));

    return (
        <CollectionListClient
            invoices={serializedInvoices}
            overduePromises={serializedPromises}
        />
    );
}
