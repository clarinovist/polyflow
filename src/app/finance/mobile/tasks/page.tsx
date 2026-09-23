import { getFinanceMobileOverview } from '@/actions/finance/mobile-dashboard';
import { MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { formatRupiah } from '@/lib/utils/utils';
import { formatWIB } from '@/lib/utils/timezone';

export default async function FinanceTasksPage() {
    const response = await getFinanceMobileOverview();
    if (!response.success) return <MobileReadError title="Daftar faktur belum tersedia" />;
    const { recentInvoices } = response.data;
    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Faktur Jatuh Tempo" level={1} />
            <p className="text-sm text-muted-foreground">Maksimal 10 piutang dan 10 hutang dengan jatuh tempo paling awal. Ringkasan total mencakup semua faktur overdue. Pembayaran dan jurnal tetap melalui desktop finance.</p>
            {!recentInvoices.length ? <p className="py-4 text-sm">Tidak ada faktur overdue saat ini.</p> : (
                <div className="space-y-3">
                    {recentInvoices.map((inv) => (
                        <article key={`${inv.type}-${inv.id}`} className="space-y-2 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]">
                            <h2 className="font-semibold">[{inv.type}] {inv.invoiceNumber}</h2>
                            <p className="text-sm">{inv.customerName}</p>
                            <dl className="space-y-1 text-sm">
                                <div><dt className="text-muted-foreground">Sisa tagihan</dt><dd className="font-semibold">{formatRupiah(inv.amount)}</dd></div>
                                <div><dt className="text-muted-foreground">Jatuh tempo</dt><dd>{formatWIB(new Date(inv.dueDate), 'dd/MM/yyyy')}</dd></div>
                                <div><dt className="text-muted-foreground">Status</dt><dd>{inv.status}</dd></div>
                            </dl>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
