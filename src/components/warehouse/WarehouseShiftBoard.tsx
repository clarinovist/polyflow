'use client';

import Link from 'next/link';
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    ClipboardList,
    Package,
    ShoppingCart,
    TrendingDown,
    Truck,
} from 'lucide-react';
import type { WarehouseShiftBoard } from '@/actions/dashboard/warehouse-dashboard';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Card, CardContent } from '@/components/ui/card';

interface WarehouseShiftBoardProps {
    data: WarehouseShiftBoard | null;
}

function AttentionSection({
    title,
    total,
    returned,
    items,
    emptyMessage,
    renderItem,
}: {
    title: string;
    total: number;
    returned: number;
    items: Array<Record<string, unknown>>;
    emptyMessage: string;
    renderItem: (item: Record<string, unknown>) => React.ReactNode;
}) {
    return (
        <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 items-start justify-between gap-2">
                <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>{title}</span>
                </h3>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {returned} dari {total}
                </span>
            </div>
            {items.length === 0 ? (
                <p className="py-2 text-xs italic text-muted-foreground">
                    {emptyMessage}
                </p>
            ) : (
                <div className="space-y-1">
                    {items.map((item) => (
                        <div
                            key={String(item.id)}
                            className="flex min-h-11 min-w-0 items-center justify-between rounded-md bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50 [&>*]:min-w-0 [&_span]:break-words"
                        >
                            {renderItem(item)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function formatQuantity(value: number): string {
    return value.toLocaleString('id-ID', {
        maximumFractionDigits: 4,
    });
}

export function WarehouseShiftBoardComponent({
    data,
}: WarehouseShiftBoardProps) {
    if (!data) {
        return (
            <div className="min-w-0 space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Gudang
                    </h1>
                    <p className="text-muted-foreground">
                        Kondisi, perhatian, dan arah utama operasional gudang.
                    </p>
                </div>
                <section
                    className="space-y-3"
                    aria-labelledby="warehouse-health-heading"
                >
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="warehouse-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Dashboard gudang tidak tersedia"
                        description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                    />
                </section>
            </div>
        );
    }

    const { generatedAt, health, today, attention, drivers } = data;

    return (
        <div className="min-w-0 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Gudang
                    </h1>
                    <p className="text-muted-foreground">
                        Kondisi, perhatian, dan arah utama operasional gudang.
                    </p>
                </div>
                <DashboardFreshness generatedAt={generatedAt} />
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="warehouse-health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="warehouse-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {health.operational.status === 'UNAVAILABLE' ? (
                        <div className="sm:col-span-2 xl:col-span-3">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Antrean operasional tidak tersedia"
                                description="Hitungan terima, muat, dan material gagal dimuat dan tidak dianggap nol."
                            />
                        </div>
                    ) : (
                        <>
                            <DashboardHealthCard
                                title="Terima"
                                value={health.operational.data.receivablePOs.toLocaleString(
                                    'id-ID',
                                )}
                                icon={Package}
                                definition={{
                                    unit: 'Pesanan pembelian',
                                    period: 'Saat dashboard diperbarui',
                                    description:
                                        'Pesanan pembelian yang sudah dikirim ke pemasok atau diterima sebagian dan dapat diterima gudang.',
                                    source: 'Data pembelian',
                                }}
                                href={
                                    health.operational.data.receivablePOs > 0
                                        ? '/warehouse/incoming'
                                        : undefined
                                }
                                supportingText={
                                    health.operational.data.receivablePOs > 0
                                        ? 'Buka antrean penerimaan'
                                        : 'Antrean kosong'
                                }
                            />
                            <DashboardHealthCard
                                title="Muat"
                                value={health.operational.data.openLoadOrders.toLocaleString(
                                    'id-ID',
                                )}
                                icon={Truck}
                                definition={{
                                    unit: 'Surat jalan',
                                    period: 'Saat dashboard diperbarui',
                                    description:
                                        'Surat jalan yang masih menunggu atau sedang dimuat.',
                                    source: 'Data gudang',
                                }}
                                href={
                                    health.operational.data.openLoadOrders > 0
                                        ? '/warehouse/outgoing'
                                        : undefined
                                }
                                supportingText={
                                    health.operational.data.openLoadOrders > 0
                                        ? 'Buka antrean pemuatan'
                                        : 'Antrean kosong'
                                }
                            />
                            <DashboardHealthCard
                                title="Bahan produksi"
                                value={health.operational.data.materialQueue.toLocaleString(
                                    'id-ID',
                                )}
                                icon={ClipboardList}
                                definition={{
                                    unit: 'SPK',
                                    period: 'Saat dashboard diperbarui',
                                    description:
                                        'SPK yang sudah dirilis, sedang berjalan, atau menunggu material.',
                                    source: 'Data produksi',
                                }}
                                href={
                                    health.operational.data.materialQueue > 0
                                        ? '/warehouse/materials'
                                        : undefined
                                }
                                supportingText={
                                    health.operational.data.materialQueue > 0
                                        ? 'Buka antrean material'
                                        : 'Antrean kosong'
                                }
                            />
                        </>
                    )}
                    {health.inventory.status === 'UNAVAILABLE' ? (
                        <div className="sm:col-span-2 xl:col-span-2">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Kondisi persediaan tidak tersedia"
                                description="Hitungan stok menipis dan kebutuhan pesan ulang gagal dimuat dan tidak dianggap nol."
                            />
                        </div>
                    ) : (
                        <>
                            <DashboardHealthCard
                                title="Stok menipis"
                                value={health.inventory.data.lowStock.toLocaleString(
                                    'id-ID',
                                )}
                                icon={TrendingDown}
                                definition={{
                                    unit: 'Varian',
                                    period: 'Saat dashboard diperbarui',
                                    description:
                                        'Varian aktif dengan persediaan bahan baku atau barang jadi internal di bawah batas minimum.',
                                    source: 'Data persediaan',
                                }}
                                href={
                                    health.inventory.data.lowStock > 0
                                        ? '/warehouse/inventory?lowStock=true'
                                        : undefined
                                }
                                supportingText={
                                    health.inventory.data.lowStock > 0
                                        ? 'Tinjau varian'
                                        : 'Tidak ada peringatan'
                                }
                            />
                            <DashboardHealthCard
                                title="Perlu dipesan ulang"
                                value={health.inventory.data.suggestedReorder.toLocaleString(
                                    'id-ID',
                                )}
                                icon={ShoppingCart}
                                definition={{
                                    unit: 'Varian',
                                    period: 'Saat dashboard diperbarui',
                                    description:
                                        'Varian aktif dengan persediaan bahan baku atau barang jadi internal di bawah titik pesan ulang.',
                                    source: 'Data persediaan',
                                }}
                                supportingText={
                                    health.inventory.data.suggestedReorder > 0
                                        ? 'Koordinasikan dengan pembelian'
                                        : 'Tidak ada peringatan'
                                }
                            />
                        </>
                    )}
                </div>

                <Card>
                    <CardContent className="min-w-0 p-4">
                        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
                            Aktivitas hari ini
                        </h3>
                        {today.status === 'UNAVAILABLE' ? (
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Aktivitas hari ini tidak tersedia"
                                description="Hitungan event hari bisnis WIB gagal dimuat dan tidak dianggap nol."
                            />
                        ) : (
                            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
                                <div className="flex min-h-11 items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    <span className="text-muted-foreground">
                                        Diterima:
                                    </span>
                                    <span className="font-bold tabular-nums">
                                        {today.data.goodsReceipts} GR
                                    </span>
                                </div>
                                <div className="flex min-h-11 items-center gap-2">
                                    <Truck className="h-4 w-4 text-blue-500" />
                                    <span className="text-muted-foreground">
                                        Dikirim:
                                    </span>
                                    <span className="font-bold tabular-nums">
                                        {today.data.deliveriesShipped} SJ
                                    </span>
                                </div>
                                <div className="flex min-h-11 items-center gap-2">
                                    <ClipboardList className="h-4 w-4 text-amber-500" />
                                    <span className="text-muted-foreground">
                                        Pengeluaran bahan:
                                    </span>
                                    <span className="font-bold tabular-nums">
                                        {today.data.materialIssues}
                                    </span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="warehouse-attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Perlu perhatian
                    </p>
                    <h2
                        id="warehouse-attention-heading"
                        className="text-lg font-semibold"
                    >
                        Butuh perhatian
                    </h2>
                </div>
                {attention.status === 'UNAVAILABLE' ? (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Daftar perhatian tidak tersedia"
                        description="Kegagalan baca tidak dianggap sebagai antrean kosong."
                    />
                ) : (
                    <Card>
                        <CardContent className="min-w-0 p-4">
                            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
                                <AttentionSection
                                    title="SJ sedang dimuat, belum diverifikasi"
                                    total={
                                        attention.data.loadingUnverified.total
                                    }
                                    returned={
                                        attention.data.loadingUnverified
                                            .returned
                                    }
                                    items={attention.data.loadingUnverified.items.map(
                                        (delivery) => ({ ...delivery }),
                                    )}
                                    emptyMessage="Tidak ada SJ menunggu verifikasi"
                                    renderItem={(item) => (
                                        <Link
                                            href={`/warehouse/outgoing/${String(item.id)}`}
                                            className="group/link flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2"
                                        >
                                            <div className="min-w-0">
                                                <span className="text-sm font-mono font-bold">
                                                    {String(item.number)}
                                                </span>
                                                {typeof item.customerName ===
                                                    'string' &&
                                                    item.customerName.length >
                                                        0 && (
                                                        <span className="ml-2 text-xs text-muted-foreground">
                                                            {item.customerName}
                                                        </span>
                                                    )}
                                            </div>
                                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover/link:text-primary" />
                                        </Link>
                                    )}
                                />
                                <AttentionSection
                                    title="PO diterima sebagian, menunggu sisa"
                                    total={attention.data.partialPOs.total}
                                    returned={
                                        attention.data.partialPOs.returned
                                    }
                                    items={attention.data.partialPOs.items.map(
                                        (purchaseOrder) => ({
                                            ...purchaseOrder,
                                        }),
                                    )}
                                    emptyMessage="Tidak ada PO diterima sebagian"
                                    renderItem={(item) => (
                                        <Link
                                            href={`/warehouse/incoming/orders/${String(item.id)}`}
                                            className="group/link flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2"
                                        >
                                            <div className="min-w-0">
                                                <span className="text-sm font-mono font-bold">
                                                    {String(item.orderNumber)}
                                                </span>
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    {String(item.supplierName)}
                                                </span>
                                                {item.expectedDate === null && (
                                                    <span className="block text-[10px] text-muted-foreground">
                                                        Tanggal harapan belum
                                                        diisi
                                                    </span>
                                                )}
                                            </div>
                                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover/link:text-primary" />
                                        </Link>
                                    )}
                                />
                                <AttentionSection
                                    title="SPK menunggu bahan"
                                    total={attention.data.waitingMaterial.total}
                                    returned={
                                        attention.data.waitingMaterial.returned
                                    }
                                    items={attention.data.waitingMaterial.items.map(
                                        (productionOrder) => ({
                                            ...productionOrder,
                                        }),
                                    )}
                                    emptyMessage="Tidak ada SPK menunggu bahan"
                                    renderItem={(item) => (
                                        <Link
                                            href={`/warehouse/materials?orderId=${String(item.id)}`}
                                            className="group/link flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2"
                                        >
                                            <span className="text-sm font-mono font-bold">
                                                {String(item.orderNumber)}
                                            </span>
                                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover/link:text-primary" />
                                        </Link>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="warehouse-drivers-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Arah utama
                    </p>
                    <h2
                        id="warehouse-drivers-heading"
                        className="text-lg font-semibold"
                    >
                        Penyumbang stok menipis
                    </h2>
                </div>
                {drivers.status === 'UNAVAILABLE' ? (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Penyumbang stok tidak tersedia"
                        description="Daftar penyumbang berasal dari data stok yang sama dengan hitungan persediaan dan gagal dimuat."
                    />
                ) : (
                    <Card>
                        <CardContent className="min-w-0 space-y-2 p-4">
                            {drivers.data.lowStock.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Tidak ada varian di bawah batas minimum.
                                </p>
                            ) : (
                                drivers.data.lowStock.map((driver) => (
                                    <div
                                        key={driver.id}
                                        className="flex min-h-11 min-w-0 flex-col justify-center gap-1 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <p className="break-words text-sm font-medium">
                                                {driver.name}
                                            </p>
                                            <p className="break-words text-xs text-muted-foreground">
                                                {driver.skuCode}
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-sm tabular-nums">
                                            {formatQuantity(
                                                driver.eligibleQuantity,
                                            )}{' '}
                                            / {formatQuantity(driver.threshold)}{' '}
                                            {driver.unit}
                                        </p>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                )}
            </section>
        </div>
    );
}
