import Link from 'next/link';
import { MobileEmptyState, MobileTaskCard } from '@/components/mobile';
import { formatQuantity, formatRupiah } from '@/lib/utils/utils';
import { formatWIB } from '@/lib/utils/timezone';
import type {
    PurchasingMobileDetailDto,
    PurchasingMobileSections,
    PurchasingMobileTaskDto,
    PurchasingMobileTaskFilter,
} from '@/services/purchasing/mobile-purchasing-service';

const SECTION_LABELS: Record<string, string> = {
    requests: 'PR perlu diproses',
    drafts: 'Draft PO',
    receipts: 'Penerimaan',
    reorder: 'Reorder',
    ap: 'AP overdue',
    apNominal: 'Nominal AP',
};

/**
 * Section state must stay visible without erasing unrelated sections and
 * without rendering a failed/hidden section as a false zero.
 */
export function PurchasingSectionNotice({
    sections,
}: {
    sections?: PurchasingMobileSections;
}) {
    const unavailable = Object.entries(sections ?? {})
        .filter(([, status]) => status === 'UNAVAILABLE')
        .map(([key]) => SECTION_LABELS[key] ?? key);
    const hidden = Object.entries(sections ?? {})
        .filter(([, status]) => status === 'HIDDEN')
        .map(([key]) => SECTION_LABELS[key] ?? key);
    if (unavailable.length === 0 && hidden.length === 0) return null;
    return (
        <div
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
            {unavailable.length > 0 && (
                <p>
                    Sebagian data tidak dapat dibaca: {unavailable.join(', ')}.
                    Bagian lain tetap ditampilkan apa adanya.
                </p>
            )}
            {hidden.length > 0 && (
                <p className="mt-1">
                    Tidak dikirim karena izin: {hidden.join(', ')}.
                </p>
            )}
        </div>
    );
}

/** Preserve a missing section as an explicit placeholder, never as zero. */
export function purchasingMetricValue(value: number | null): string | number {
    return value ?? '—';
}

export function purchasingCountSeverity(
    value: number | null,
    present: 'WARNING' | 'CRITICAL',
    empty: 'SUCCESS' | 'INFO' = 'SUCCESS',
): 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL' {
    if (value == null) return 'INFO';
    return value ? present : empty;
}

const FILTERS: Array<{
    value: PurchasingMobileTaskFilter;
    label: string;
}> = [
    { value: 'ALL', label: 'Semua' },
    { value: 'REQUESTS', label: 'PR' },
    { value: 'DRAFT_PO', label: 'Draft PO' },
    { value: 'RECEIPTS', label: 'Penerimaan' },
    { value: 'ETA', label: 'ETA lewat' },
    { value: 'REORDER', label: 'Reorder' },
];

const STATUS_LABELS: Record<string, string> = {
    OPEN: 'Menunggu review',
    APPROVED: 'Siap dikonversi',
    DRAFT: 'Draft',
    SENT: 'Menunggu penerimaan',
    PARTIAL_RECEIVED: 'Diterima sebagian',
    ETA_TERLEWAT: 'ETA terlewat',
    DI_BAWAH_REORDER_POINT: 'Di bawah reorder point',
};

export function purchasingStatusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}

export function PurchasingQueueFilters({
    current,
}: {
    current: PurchasingMobileTaskFilter;
}) {
    return (
        <nav
            aria-label="Filter antrean purchasing"
            className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        >
            <div className="flex min-w-max gap-2">
                {FILTERS.map((filter) => (
                    <Link
                        key={filter.value}
                        href={
                            filter.value === 'ALL'
                                ? '/purchasing/mobile/tasks'
                                : `/purchasing/mobile/tasks?filter=${filter.value}`
                        }
                        aria-current={
                            current === filter.value ? 'page' : undefined
                        }
                        className={
                            'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 text-xs font-semibold ' +
                            (current === filter.value
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'bg-card text-muted-foreground')
                        }
                    >
                        {filter.label}
                        {current === filter.value && (
                            <span className="sr-only"> (aktif)</span>
                        )}
                    </Link>
                ))}
            </div>
        </nav>
    );
}

export function PurchasingTaskQueue({
    items,
    emptyTitle = 'Tidak ada exception pada filter ini',
}: {
    items: PurchasingMobileTaskDto[];
    emptyTitle?: string;
}) {
    if (items.length === 0) {
        return (
            <MobileEmptyState
                title={emptyTitle}
                description="Antrean hanya memuat pekerjaan read-only yang perlu perhatian."
                className="rounded-xl border bg-card"
            />
        );
    }

    return (
        <div className="space-y-3">
            {items.map((item) =>
                item.href ? (
                    <MobileTaskCard
                        key={`${item.kind}:${item.id}`}
                        id={item.id}
                        title={item.title}
                        subtitle={`${item.subtitle} · ${purchasingStatusLabel(item.status)}`}
                        priority={item.priority}
                        href={item.href}
                    />
                ) : (
                    <article
                        key={`${item.kind}:${item.id}`}
                        className="min-w-0 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]"
                    >
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                            {purchasingStatusLabel(item.status)}
                        </p>
                        <h2 className="mt-1 font-semibold">{item.title}</h2>
                        <p className="text-sm text-muted-foreground">
                            {item.subtitle}
                        </p>
                    </article>
                ),
            )}
        </div>
    );
}

function DetailHeader({
    title,
    filter,
}: {
    title: string;
    filter: PurchasingMobileTaskFilter;
}) {
    return (
        <div className="space-y-3">
            <Link
                href={
                    filter === 'ALL'
                        ? '/purchasing/mobile/tasks'
                        : `/purchasing/mobile/tasks?filter=${filter}`
                }
                className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 dark:text-blue-300"
            >
                ← Kembali ke antrean
            </Link>
            <h1 className="text-xl font-bold [overflow-wrap:anywhere]">
                {title}
            </h1>
            <p className="text-xs text-muted-foreground">
                Detail read-only. Persetujuan dan perubahan tetap dilakukan di
                desktop.
            </p>
        </div>
    );
}

export function PurchasingMobileDetailView({
    detail,
}: {
    detail: PurchasingMobileDetailDto;
}) {
    if (detail.kind === 'REQUEST') {
        return (
            <div className="min-w-0 space-y-5">
                <DetailHeader title={detail.number} filter="REQUESTS" />
                <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm [&>div]:min-w-0 [&_dd]:[overflow-wrap:anywhere]">
                    <div>
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="font-semibold">
                            {purchasingStatusLabel(detail.status)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Prioritas</dt>
                        <dd className="font-semibold">{detail.priority}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Dibuat</dt>
                        <dd>{formatWIB(detail.requestedAt, 'dd MMM yyyy')}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Pemilik</dt>
                        <dd>{detail.createdByName}</dd>
                    </div>
                    {detail.reviewedByName && (
                        <div className="col-span-2">
                            <dt className="text-muted-foreground">Reviewer</dt>
                            <dd>{detail.reviewedByName}</dd>
                        </div>
                    )}
                </dl>
                <section
                    className="space-y-3"
                    aria-labelledby="request-items-heading"
                >
                    <h2 id="request-items-heading" className="font-semibold">
                        Item permintaan
                    </h2>
                    {detail.items.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-xl border bg-card p-4"
                        >
                            <h3 className="font-semibold [overflow-wrap:anywhere]">
                                {item.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {item.skuCode}
                            </p>
                            <p className="mt-2 text-sm">
                                {formatQuantity(item.quantity)} {item.unit}
                            </p>
                        </article>
                    ))}
                </section>
            </div>
        );
    }

    if (detail.kind === 'ORDER') {
        return (
            <div className="min-w-0 space-y-5">
                <DetailHeader title={detail.number} filter="DRAFT_PO" />
                <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm [&>div]:min-w-0 [&_dd]:[overflow-wrap:anywhere]">
                    <div>
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="font-semibold">
                            {purchasingStatusLabel(detail.status)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Supplier</dt>
                        <dd>{detail.supplierName}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Tanggal PO</dt>
                        <dd>{formatWIB(detail.orderedAt, 'dd MMM yyyy')}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">ETA</dt>
                        <dd>
                            {detail.expectedAt
                                ? formatWIB(detail.expectedAt, 'dd MMM yyyy')
                                : 'Belum ditetapkan'}
                        </dd>
                    </div>
                    {'totalAmount' in detail && (
                        <div className="col-span-2">
                            <dt className="text-muted-foreground">Total</dt>
                            <dd className="font-semibold">
                                {formatRupiah(detail.totalAmount)}
                            </dd>
                        </div>
                    )}
                </dl>
                <section
                    className="space-y-3"
                    aria-labelledby="order-items-heading"
                >
                    <h2 id="order-items-heading" className="font-semibold">
                        Item PO
                    </h2>
                    {detail.items.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-xl border bg-card p-4"
                        >
                            <h3 className="font-semibold [overflow-wrap:anywhere]">
                                {item.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {item.skuCode}
                            </p>
                            <p className="mt-2 text-sm">
                                Dipesan {formatQuantity(item.quantity)}{' '}
                                {item.unit}
                            </p>
                            {'unitPrice' in item && (
                                <p className="text-sm">
                                    Harga satuan {formatRupiah(item.unitPrice)}
                                </p>
                            )}
                            {'subtotal' in item && (
                                <p className="text-sm font-semibold">
                                    Subtotal {formatRupiah(item.subtotal)}
                                </p>
                            )}
                        </article>
                    ))}
                </section>
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-5">
            <DetailHeader title={detail.number} filter="RECEIPTS" />
            <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm [&>div]:min-w-0 [&_dd]:[overflow-wrap:anywhere]">
                <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-semibold">
                        {purchasingStatusLabel(detail.status)}
                    </dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">Supplier</dt>
                    <dd>{detail.supplierName}</dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">ETA</dt>
                    <dd>
                        {detail.expectedAt
                            ? formatWIB(detail.expectedAt, 'dd MMM yyyy')
                            : 'Belum ditetapkan'}
                    </dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">Penerimaan</dt>
                    <dd>{detail.receiptCount} dokumen</dd>
                </div>
                {detail.latestReceiptAt && (
                    <div className="col-span-2">
                        <dt className="text-muted-foreground">
                            Terakhir diterima
                        </dt>
                        <dd>
                            {formatWIB(
                                detail.latestReceiptAt,
                                'dd MMM yyyy HH:mm',
                            )}
                        </dd>
                    </div>
                )}
            </dl>
            <section
                className="space-y-3"
                aria-labelledby="receipt-items-heading"
            >
                <h2 id="receipt-items-heading" className="font-semibold">
                    Progres penerimaan
                </h2>
                {detail.items.map((item) => (
                    <article
                        key={item.id}
                        className="rounded-xl border bg-card p-4"
                    >
                        <h3 className="font-semibold [overflow-wrap:anywhere]">
                            {item.name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {item.skuCode}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <p>
                                Dipesan
                                <br />
                                <strong>
                                    {formatQuantity(item.orderedQuantity)}{' '}
                                    {item.unit}
                                </strong>
                            </p>
                            <p>
                                Diterima
                                <br />
                                <strong>
                                    {formatQuantity(item.receivedQuantity)}{' '}
                                    {item.unit}
                                </strong>
                            </p>
                            <p>
                                Sisa
                                <br />
                                <strong>
                                    {formatQuantity(item.remainingQuantity)}{' '}
                                    {item.unit}
                                </strong>
                            </p>
                        </div>
                    </article>
                ))}
            </section>
        </div>
    );
}
