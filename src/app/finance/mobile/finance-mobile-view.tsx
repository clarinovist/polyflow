import Link from 'next/link';
import { MobileEmptyState } from '@/components/mobile';
import { formatRupiah } from '@/lib/utils/utils';
import { formatWIB } from '@/lib/utils/timezone';
import type {
    FinanceMobileBucket,
    FinanceMobileDueFilter,
    FinanceMobileType,
} from '@/services/finance/mobile-finance-service';

const TYPES: Array<[FinanceMobileType, string]> = [
    ['ALL', 'Semua'],
    ['AR', 'Piutang'],
    ['AP', 'Hutang'],
];
const DUES: Array<[FinanceMobileDueFilter, string]> = [
    ['ALL', 'Semua tempo'],
    ['OVERDUE', 'Overdue'],
    ['DUE_SOON', '7 hari'],
];
const BUCKETS: Array<[FinanceMobileBucket, string]> = [
    ['ALL', 'Semua umur'],
    ['NOT_DUE', 'Belum tempo'],
    ['1_30', '1–30'],
    ['31_60', '31–60'],
    ['61_90', '61–90'],
    ['90_PLUS', '90+'],
];
const labels: Record<string, string> = {
    NOT_DUE: 'Belum jatuh tempo',
    '1_30': '1–30 hari',
    '31_60': '31–60 hari',
    '61_90': '61–90 hari',
    '90_PLUS': 'Lebih dari 90 hari',
};

type Query = {
    type: FinanceMobileType;
    due: FinanceMobileDueFilter;
    bucket: FinanceMobileBucket;
    page: number;
};
function href(q: Query) {
    const params = new URLSearchParams();
    if (q.type !== 'ALL') params.set('type', q.type);
    if (q.due !== 'ALL') params.set('due', q.due);
    if (q.bucket !== 'ALL') params.set('bucket', q.bucket);
    if (q.page > 1) params.set('page', String(q.page));
    const value = params.toString();
    return value ? `/finance/mobile/tasks?${value}` : '/finance/mobile/tasks';
}
function FilterRow({
    label,
    values,
    current,
    query,
    keyName,
}: {
    label: string;
    values: Array<[string, string]>;
    current: string;
    query: Query;
    keyName: 'type' | 'due' | 'bucket';
}) {
    return (
        <nav
            aria-label={label}
            className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        >
            <div className="flex min-w-max gap-2">
                {values.map(([value, text]) => (
                    <Link
                        key={value}
                        href={href({
                            ...query,
                            ...(keyName === 'due'
                                ? { bucket: 'ALL' as const }
                                : {}),
                            ...(keyName === 'bucket'
                                ? { due: 'ALL' as const }
                                : {}),
                            [keyName]: value,
                            page: 1,
                        })}
                        className={
                            'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 text-xs font-semibold ' +
                            (current === value
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'bg-card text-muted-foreground')
                        }
                    >
                        {text}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
export function FinanceInvoiceFilters({ query }: { query: Query }) {
    return (
        <div className="space-y-2">
            <FilterRow
                label="Jenis faktur finance"
                values={TYPES}
                current={query.type}
                query={query}
                keyName="type"
            />
            <FilterRow
                label="Status jatuh tempo"
                values={DUES}
                current={query.due}
                query={query}
                keyName="due"
            />
            <FilterRow
                label="Bucket umur faktur"
                values={BUCKETS}
                current={query.bucket}
                query={query}
                keyName="bucket"
            />
        </div>
    );
}
export type FinanceInvoiceItem = {
    id: string;
    type: 'AR' | 'AP';
    invoiceNumber: string;
    partnerName: string;
    status: string;
    invoiceDate: string;
    dueDate: string | null;
    bucket: string;
    remainingAmount?: number;
    followUp?: {
        type: string;
        activityDate: string;
        promisedDate: string | null;
        ownerName: string;
    } | null;
};
export function FinanceInvoiceList({
    invoices,
}: {
    invoices: FinanceInvoiceItem[];
}) {
    if (!invoices.length)
        return (
            <MobileEmptyState
                title="Tidak ada faktur pada filter ini"
                description="Coba ubah jenis, jatuh tempo, atau bucket umur."
                className="rounded-xl border bg-card"
            />
        );
    return (
        <div className="space-y-3">
            {invoices.map((inv) => (
                <Link
                    key={`${inv.type}:${inv.id}`}
                    href={`/finance/mobile/invoices/${inv.type.toLowerCase()}/${inv.id}`}
                    className="block min-h-11 space-y-2 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]"
                >
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="font-semibold">
                            [{inv.type}] {inv.invoiceNumber}
                        </h2>
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            {labels[inv.bucket] ?? inv.bucket}
                        </span>
                    </div>
                    <p className="text-sm">{inv.partnerName}</p>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <dt className="text-muted-foreground">
                                Jatuh tempo
                            </dt>
                            <dd>
                                {inv.dueDate
                                    ? formatWIB(inv.dueDate, 'dd MMM yyyy')
                                    : 'Mengikuti tanggal invoice'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Status</dt>
                            <dd>{inv.status}</dd>
                        </div>
                        {inv.type === 'AR' && inv.followUp && (
                            <div className="col-span-2">
                                <dt className="text-muted-foreground">
                                    Follow-up terakhir
                                </dt>
                                <dd>
                                    {inv.followUp.type.replaceAll('_', ' ')} ·{' '}
                                    {inv.followUp.ownerName} ·{' '}
                                    {formatWIB(
                                        inv.followUp.activityDate,
                                        'dd MMM yyyy',
                                    )}
                                </dd>
                            </div>
                        )}
                        {'remainingAmount' in inv && (
                            <div className="col-span-2">
                                <dt className="text-muted-foreground">
                                    Sisa tagihan
                                </dt>
                                <dd className="font-semibold">
                                    {formatRupiah(inv.remainingAmount)}
                                </dd>
                            </div>
                        )}
                    </dl>
                </Link>
            ))}
        </div>
    );
}
export function FinancePagination({
    query,
    hasNext,
    returned,
}: {
    query: Query;
    hasNext: boolean;
    returned: number;
}) {
    const hasPrevious = query.page > 1;
    return (
        <nav
            aria-label="Halaman faktur finance"
            className="flex items-center justify-between gap-3"
        >
            <span className="text-xs text-muted-foreground">
                Halaman {query.page}
            </span>
            <div className="flex gap-2">
                {hasPrevious && (
                    <Link
                        className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold"
                        href={href({ ...query, page: query.page - 1 })}
                    >
                        Sebelumnya
                    </Link>
                )}
                {hasNext && returned > 0 && (
                    <Link
                        className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold"
                        href={href({ ...query, page: query.page + 1 })}
                    >
                        Berikutnya
                    </Link>
                )}
            </div>
        </nav>
    );
}
