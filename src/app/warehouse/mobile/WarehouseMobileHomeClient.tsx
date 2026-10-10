'use client';

import Link from 'next/link';
import {
    ArrowRight,
    ClipboardList,
    Clock,
    Package,
    Truck,
    Boxes,
} from 'lucide-react';
import type { WarehouseMobileDashboard } from '@/actions/dashboard/warehouse-mobile-dashboard';
import { MobileDataFreshness } from '@/components/mobile';

const linkClass =
    'min-h-11 rounded-xl border bg-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]';

function UnavailableCard({ label }: { label: string }) {
    return (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4">
            <p className="text-sm font-medium">{label} tidak tersedia</p>
            <p className="mt-1 text-xs text-muted-foreground">
                Data gagal dimuat dan tidak dihitung sebagai nol.
            </p>
        </div>
    );
}

export function WarehouseMobileHomeClient({
    data,
}: {
    data: WarehouseMobileDashboard;
}) {
    return (
        <div className="space-y-6 p-4">
            <header className="space-y-1">
                <h1 className="text-xl font-bold">Gudang Mobile</h1>
                <p className="text-sm text-muted-foreground">
                    Ringkasan shift hari ini
                </p>
                <MobileDataFreshness generatedAt={data.generatedAt} />
            </header>

            <section aria-labelledby="today-heading" className="space-y-3">
                <h2 id="today-heading" className="text-sm font-semibold">
                    Selesai Hari Ini
                </h2>
                {data.todayShipped.status === 'HIDDEN' &&
                data.todayReceived.status === 'HIDDEN' &&
                data.todayMaterialIssues.status === 'HIDDEN' ? (
                    <p className="text-sm text-muted-foreground">
                        Aktivitas hari ini tidak tersedia untuk akses ini.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {data.todayShipped.status === 'AVAILABLE' ? (
                            <div className="rounded-xl border bg-card p-3 text-center text-xs shadow-sm">
                                <p className="text-base font-bold tabular-nums text-emerald-600">
                                    {data.todayShipped.data.count}
                                </p>
                                <p className="text-muted-foreground">
                                    DO Dikirim Hari Ini
                                </p>
                            </div>
                        ) : data.todayShipped.status === 'UNAVAILABLE' ? (
                            <UnavailableCard label="Pengiriman hari ini" />
                        ) : null}
                        {data.todayReceived.status === 'AVAILABLE' ? (
                            <div className="rounded-xl border bg-card p-3 text-center text-xs shadow-sm">
                                <p className="text-base font-bold tabular-nums text-blue-600">
                                    {data.todayReceived.data.count}
                                </p>
                                <p className="text-muted-foreground">
                                    Penerimaan Selesai
                                </p>
                            </div>
                        ) : data.todayReceived.status === 'UNAVAILABLE' ? (
                            <UnavailableCard label="Penerimaan hari ini" />
                        ) : null}
                        {data.todayMaterialIssues.status === 'AVAILABLE' ? (
                            <div className="rounded-xl border bg-card p-3 text-center text-xs shadow-sm">
                                <p className="text-base font-bold tabular-nums text-violet-600">
                                    {data.todayMaterialIssues.data.count}
                                </p>
                                <p className="text-muted-foreground">
                                    Material Produksi Keluar
                                </p>
                            </div>
                        ) : (
                            <UnavailableCard label="Material produksi keluar" />
                        )}
                    </div>
                )}
            </section>

            <section aria-labelledby="tasks-heading" className="space-y-3">
                <h2 id="tasks-heading" className="text-sm font-semibold">
                    Tugas Operasional
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    {data.loads.status === 'AVAILABLE' &&
                    data.links.outgoing ? (
                        <Link
                            href={data.links.outgoing}
                            className={`${linkClass} p-4`}
                        >
                            <Truck className="mb-2 h-6 w-6 text-primary" />
                            <p className="text-2xl font-bold tabular-nums">
                                {data.loads.data.loading +
                                    data.loads.data.pending}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Antrian Muat
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                {data.loads.data.loading} loading ·{' '}
                                {data.loads.data.pending} pending
                            </p>
                        </Link>
                    ) : data.loads.status === 'UNAVAILABLE' ? (
                        <UnavailableCard label="Antrean muat" />
                    ) : null}
                    {data.receiving.status === 'AVAILABLE' &&
                    data.links.incoming ? (
                        <Link
                            href={data.links.incoming}
                            className={`${linkClass} p-4`}
                        >
                            <Package className="mb-2 h-6 w-6 text-emerald-600" />
                            <p className="text-2xl font-bold tabular-nums">
                                {data.receiving.data.receivable}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Perlu Diterima
                            </p>
                        </Link>
                    ) : data.receiving.status === 'UNAVAILABLE' ? (
                        <UnavailableCard label="Antrean penerimaan" />
                    ) : null}
                    {data.materialQueue.status === 'AVAILABLE' ? (
                        <div className="min-h-11 rounded-xl border bg-card p-4">
                            <Boxes className="mb-2 h-6 w-6 text-violet-600" />
                            <p className="text-2xl font-bold tabular-nums">
                                {data.materialQueue.data.count}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Antrean Material Produksi
                            </p>
                        </div>
                    ) : (
                        <UnavailableCard label="Antrean material produksi" />
                    )}
                    {data.openOpname.status === 'AVAILABLE' &&
                    data.links.opname ? (
                        <Link
                            href={data.links.opname}
                            className={`${linkClass} p-4`}
                        >
                            <ClipboardList className="mb-2 h-6 w-6 text-amber-600" />
                            <p className="text-2xl font-bold tabular-nums">
                                {data.openOpname.data.count}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Opname Aktif
                            </p>
                        </Link>
                    ) : data.openOpname.status === 'UNAVAILABLE' ? (
                        <UnavailableCard label="Opname aktif" />
                    ) : null}
                </div>
            </section>

            {data.loadingAttention.status !== 'HIDDEN' && (
                <section
                    aria-labelledby="loading-heading"
                    className="space-y-3"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2
                                id="loading-heading"
                                className="text-sm font-semibold"
                            >
                                Perlu Verifikasi Muat
                            </h2>
                            {data.loadingAttention.status === 'AVAILABLE' && (
                                <p className="text-xs text-muted-foreground">
                                    Menampilkan{' '}
                                    {data.loadingAttention.data.returned} dari{' '}
                                    {data.loadingAttention.data.total} DO
                                    loading.
                                </p>
                            )}
                        </div>
                        {data.loadingAttention.status === 'AVAILABLE' &&
                            data.links.outgoing && (
                                <Link
                                    href={data.links.outgoing}
                                    className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    Lihat semua{' '}
                                    <ArrowRight className="h-3 w-3" />
                                </Link>
                            )}
                    </div>
                    {data.loadingAttention.status === 'UNAVAILABLE' ? (
                        <UnavailableCard label="Verifikasi muat" />
                    ) : data.loadingAttention.data.items.length === 0 ? (
                        <div className="rounded-xl border bg-card p-4">
                            <p className="text-sm font-medium">
                                Tidak ada DO loading yang menunggu verifikasi.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {data.loadingAttention.data.items.map((order) =>
                                order.href ? (
                                    <Link
                                        key={order.id}
                                        href={order.href}
                                        className={`${linkClass} block p-3`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">
                                                    {order.number}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {order.customerName || '—'}
                                                </p>
                                                <time
                                                    dateTime={
                                                        order.deliveryDate
                                                    }
                                                    className="text-xs text-muted-foreground"
                                                >
                                                    Jadwal{' '}
                                                    {new Date(
                                                        order.deliveryDate,
                                                    ).toLocaleDateString(
                                                        'id-ID',
                                                        {
                                                            timeZone:
                                                                'Asia/Jakarta',
                                                        },
                                                    )}
                                                </time>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1 text-xs text-amber-600">
                                                <Clock className="h-3 w-3" />
                                                Loading
                                            </div>
                                        </div>
                                    </Link>
                                ) : null,
                            )}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
