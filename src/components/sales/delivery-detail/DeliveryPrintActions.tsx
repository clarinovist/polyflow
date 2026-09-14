import { Printer } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { DeliveryOrderDetailData } from './types';

interface DeliveryPrintActionsProps {
    order: DeliveryOrderDetailData;
    invoices: NonNullable<
        NonNullable<DeliveryOrderDetailData['salesOrder']>['invoices']
    >;
    bundleHref: (invoiceId: string) => string;
    setShowPreview: Dispatch<SetStateAction<boolean>>;
}

export function DeliveryPrintActions({
    order,
    invoices,
    bundleHref,
    setShowPreview,
}: DeliveryPrintActionsProps) {
    return (
        <>
            <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md text-xs font-medium transition-colors ml-2"
            >
                <Printer className="h-3.5 w-3.5" />
                Cetak Surat Jalan
            </button>
            <a
                href={`/api/print/delivery?id=${order.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-xs font-medium transition-colors"
            >
                <Printer className="h-3.5 w-3.5" />
                ESC/P (Dot Matrix)
            </a>
            {invoices.length === 1 && (
                <a
                    href={bundleHref(invoices[0].id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-700 hover:bg-orange-800 text-white rounded-md text-xs font-medium transition-colors"
                >
                    <Printer className="h-3.5 w-3.5" />
                    ESC/P: SJ + Invoice
                </a>
            )}
            {invoices.length > 1 && (
                <select
                    aria-label="Cetak ESC/P surat jalan bersama invoice"
                    defaultValue=""
                    onChange={(e) => {
                        if (!e.target.value) return;
                        window.location.href = bundleHref(e.target.value);
                        e.target.value = '';
                    }}
                    className="px-3 py-1.5 bg-orange-700 hover:bg-orange-800 text-white rounded-md text-xs font-medium transition-colors"
                >
                    <option value="">ESC/P: SJ + Invoice…</option>
                    {invoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                            {invoice.invoiceNumber}
                        </option>
                    ))}
                </select>
            )}
        </>
    );
}
