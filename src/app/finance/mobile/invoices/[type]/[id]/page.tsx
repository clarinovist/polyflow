import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getFinanceMobileInvoiceDetail } from '@/actions/finance/mobile-dashboard';
import { MobileReadError } from '@/components/mobile';
import { formatRupiah } from '@/lib/utils/utils';
import { formatWIB } from '@/lib/utils/timezone';

export default async function FinanceMobileInvoiceDetailPage({
    params,
}: {
    params: Promise<{ type: string; id: string }>;
}) {
    const { type, id } = await params;
    const response = await getFinanceMobileInvoiceDetail(
        type.toUpperCase(),
        id,
    );
    if (!response.success) {
        if (
            response.code === 'NOT_FOUND' ||
            response.code === 'VALIDATION_ERROR'
        )
            notFound();
        return <MobileReadError title="Detail faktur belum tersedia" />;
    }
    const row = response.data;
    return (
        <div className="min-w-0 space-y-5">
            <div className="space-y-3">
                <Link
                    href={`/finance/mobile/tasks?type=${row.type}`}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 dark:text-emerald-300"
                >
                    ← Kembali ke antrean
                </Link>
                <h1 className="text-xl font-bold [overflow-wrap:anywhere]">
                    [{row.type}] {row.invoiceNumber}
                </h1>
                <p className="text-xs text-muted-foreground">
                    Detail read-only dengan field minimum. Pembayaran dan
                    perubahan tetap di desktop Finance.
                </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm [&>div]:min-w-0 [&_dd]:[overflow-wrap:anywhere]">
                <div className="col-span-2">
                    <dt className="text-muted-foreground">Pihak terkait</dt>
                    <dd className="font-semibold">{row.partnerName}</dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">Tanggal invoice</dt>
                    <dd>{formatWIB(row.invoiceDate, 'dd MMM yyyy')}</dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">Jatuh tempo</dt>
                    <dd>
                        {row.dueDate
                            ? formatWIB(row.dueDate, 'dd MMM yyyy')
                            : 'Belum ditetapkan'}
                    </dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{row.status}</dd>
                </div>
                {row.type === 'AR' && row.followUp && (
                    <div className="col-span-2">
                        <dt className="text-muted-foreground">
                            Follow-up terakhir
                        </dt>
                        <dd>
                            {row.followUp.type.replaceAll('_', ' ')} ·{' '}
                            {row.followUp.ownerName} ·{' '}
                            {formatWIB(
                                row.followUp.activityDate,
                                'dd MMM yyyy',
                            )}
                            {row.followUp.promisedDate
                                ? ` · Janji ${formatWIB(row.followUp.promisedDate, 'dd MMM yyyy')}`
                                : ''}
                        </dd>
                    </div>
                )}
                {'remainingAmount' in row && (
                    <div>
                        <dt className="text-muted-foreground">Sisa tagihan</dt>
                        <dd className="font-semibold">
                            {formatRupiah(row.remainingAmount)}
                        </dd>
                    </div>
                )}
            </dl>
        </div>
    );
}
