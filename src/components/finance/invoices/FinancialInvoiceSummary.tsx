import { Banknote, CircleDollarSign, ReceiptText, RotateCcw } from 'lucide-react';
import { WorkflowSummaryGrid } from '@/components/workflow-detail/WorkflowSummaryGrid';
import { formatRupiah } from '@/lib/utils/utils';

interface FinancialInvoiceSummaryProps {
    totalAmount: number;
    paidAmount: number;
    creditedAmount: number;
    priceAdjustmentAmount: number;
    remainingAmount: number;
}

export function FinancialInvoiceSummary({
    totalAmount,
    paidAmount,
    creditedAmount,
    priceAdjustmentAmount,
    remainingAmount,
}: FinancialInvoiceSummaryProps) {
    const adjustmentDetail =
        priceAdjustmentAmount === 0
            ? 'Tidak ada penyesuaian harga'
            : 'Penyesuaian harga ' + formatRupiah(priceAdjustmentAmount);

    return (
        <WorkflowSummaryGrid
            label="Ringkasan invoice"
            items={[
                {
                    label: 'Total Invoice',
                    icon: <ReceiptText className="h-4 w-4" />,
                    value: formatRupiah(totalAmount),
                    detail: 'Nilai tersimpan pada invoice',
                },
                {
                    label: 'Sudah Dibayar',
                    icon: <Banknote className="h-4 w-4" />,
                    value: formatRupiah(paidAmount),
                    detail: 'Pembayaran kas yang sudah tercatat',
                },
                {
                    label: 'Kredit Retur',
                    icon: <RotateCcw className="h-4 w-4" />,
                    value: formatRupiah(creditedAmount),
                    detail: adjustmentDetail,
                },
                {
                    label: 'Sisa Tagihan',
                    icon: <CircleDollarSign className="h-4 w-4" />,
                    value: formatRupiah(remainingAmount),
                    detail:
                        remainingAmount <= 0
                            ? 'Tidak ada saldo yang perlu ditagih'
                            : 'Saldo yang masih perlu ditindaklanjuti',
                },
            ]}
        />
    );
}
