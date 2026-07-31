'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { TelegramProvider } from '../../components/telegram-provider';
import { BottomNav } from '../../components/bottom-nav';
import { SkeletonList } from '../../components/skeleton';
import { ErrorState, EmptyState } from '../../components/error-states';

type DataItem = {
    id: string;
    title: string;
    subtitle: string;
    status: string;
    statusVariant: 'critical' | 'warning' | 'ok' | 'neutral';
    meta: string;
};

type DataListResponse = {
    domain: string;
    filter: string;
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
    items: DataItem[];
};

type Bootstrap = { user: { allowedDomains: string[] } };

const VARIANT_CLASSES: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    warning:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    ok: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const DOMAIN_LABELS: Record<string, string> = {
    stock: 'Stok',
    sales: 'Sales Order',
    production: 'Produksi',
    finance: 'Finance',
    purchasing: 'Purchasing',
};

const DOMAIN_FILTERS: Record<string, Array<{ key: string; label: string }>> = {
    stock: [
        { key: 'critical', label: 'Kritis' },
        { key: 'all', label: 'Semua' },
    ],
    sales: [
        { key: 'pending', label: 'Pending' },
        { key: 'all', label: 'Semua' },
    ],
    production: [
        { key: 'active', label: 'Aktif' },
        { key: 'all', label: 'Semua' },
    ],
    finance: [
        { key: 'overdue', label: 'Overdue' },
        { key: 'all', label: 'Semua' },
    ],
    purchasing: [
        { key: 'outstanding', label: 'Outstanding' },
        { key: 'all', label: 'Semua' },
    ],
};

function DomainDataInner({ domain }: { domain: string }) {
    const searchParams = useSearchParams();
    const initialFilter = searchParams.get('filter') || '';

    const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
    const [items, setItems] = useState<DataItem[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState(initialFilter);

    const fetchBootstrap = useCallback(async () => {
        try {
            const res = await fetch('/api/telegram/mini-app/bootstrap', {
                credentials: 'include',
            });
            if (res.ok) {
                const data = (await res.json()) as Bootstrap;
                setBootstrap(data);
            }
        } catch {
            /* ignore */
        }
    }, []);

    const fetchData = useCallback(
        async (filterVal: string, pageNum: number, append: boolean) => {
            if (append) setLoadingMore(true);
            else setLoading(true);
            setError(null);

            try {
                const qs = new URLSearchParams();
                if (filterVal) qs.set('filter', filterVal);
                if (pageNum > 0) qs.set('page', String(pageNum));

                const res = await fetch(
                    `/api/telegram/mini-app/data/${domain}?${qs}`,
                    { credentials: 'include' },
                );
                const body = (await res.json()) as DataListResponse & {
                    error?: string;
                };

                if (!res.ok) {
                    if (res.status === 401) {
                        setError('Session expired — muat ulang Mini App');
                        return;
                    }
                    if (res.status === 403) {
                        setError(`Akses ditolak: ${body.error || 'forbidden'}`);
                        return;
                    }
                    if (res.status === 400) {
                        setError(`Domain tidak dikenal: ${domain}`);
                        return;
                    }
                    throw new Error(body.error || 'Gagal memuat data');
                }

                setItems((prev) =>
                    append ? [...prev, ...body.items] : body.items,
                );
                setHasMore(body.hasMore);
                setTotal(body.total);
                setFilter(body.filter);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Network error');
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [domain],
    );

    useEffect(() => {
        fetchBootstrap();
    }, [fetchBootstrap]);

    useEffect(() => {
        setPage(0);
        fetchData(filter || '', 0, false);
    }, [filter, fetchData]);

    const handleFilterChange = (newFilter: string) => {
        setFilter(newFilter);
        setPage(0);
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(filter, nextPage, true);
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-[480px] p-4 pb-24">
                <div className="mb-4 h-5 w-40 animate-pulse rounded bg-black/10" />
                <SkeletonList count={4} />
            </div>
        );
    }

    if (error) {
        const isSession =
            error.toLowerCase().includes('session') ||
            error.toLowerCase().includes('expired');
        return (
            <div className="pb-24">
                <ErrorState
                    title={isSession ? 'Sesi kadaluarsa' : 'Gagal memuat data'}
                    message={error}
                    actionLabel={isSession ? 'Muat ulang Mini App' : 'Kembali'}
                    onAction={() =>
                        isSession
                            ? window.location.reload()
                            : window.history.back()
                    }
                />
            </div>
        );
    }

    const allowedDomains = bootstrap?.user?.allowedDomains || [];
    const filterOptions = DOMAIN_FILTERS[domain] || [];
    const currentFilter = filter || filterOptions[0]?.key || '';

    return (
        <div className="mx-auto max-w-[480px] p-4 pb-28">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-base font-semibold">
                    {DOMAIN_LABELS[domain] || domain}
                </h1>
                <span className="text-xs opacity-50">{total} item</span>
            </div>

            {filterOptions.length > 0 && (
                <div className="mb-4 flex gap-2">
                    {filterOptions.map((fo) => (
                        <button
                            key={fo.key}
                            onClick={() => handleFilterChange(fo.key)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                                currentFilter === fo.key
                                    ? 'bg-black text-white dark:bg-white dark:text-black'
                                    : 'border opacity-60'
                            }`}
                        >
                            {fo.label}
                        </button>
                    ))}
                </div>
            )}

            {items.length === 0 ? (
                <EmptyState message="Tidak ada data" />
            ) : (
                <div className="space-y-2">
                    {items.map((item) => (
                        <div key={item.id} className="tg-card p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                        {item.title}
                                    </div>
                                    <div className="truncate text-xs opacity-60">
                                        {item.subtitle}
                                    </div>
                                </div>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${VARIANT_CLASSES[item.statusVariant] || VARIANT_CLASSES.neutral}`}
                                >
                                    {item.status}
                                </span>
                            </div>
                            <div className="mt-1.5 text-[11px] opacity-50">
                                {item.meta}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {hasMore && (
                <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="mt-4 w-full rounded-full border py-2.5 text-sm font-medium opacity-80 disabled:opacity-40"
                >
                    {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
                </button>
            )}

            <BottomNav allowedDomains={allowedDomains} />
        </div>
    );
}

export default function DomainDataPage({
    params,
}: {
    params: Promise<{ domain: string }>;
}) {
    const { domain } = use(params);
    return (
        <TelegramProvider>
            <DomainDataInner domain={domain} />
        </TelegramProvider>
    );
}
