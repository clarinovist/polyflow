import { getMyFieldReceivables } from '@/actions/sales/field-actions';
import { ReceivablesListClient } from './ReceivablesListClient';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export default async function SalesMobileReceivablesPage() {
    const invoicesRes = await getMyFieldReceivables();
    if (!invoicesRes.success) return <MobileReadError title="Daftar piutang belum tersedia" />;
    const invoices = invoicesRes.data;

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
    }));

    return <ReceivablesListClient invoices={serialized} />;
}
