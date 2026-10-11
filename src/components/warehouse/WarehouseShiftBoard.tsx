'use client';

import {
    AlertCircle,
    ArrowDownToLine,
    ArrowUpFromLine,
    Boxes,
    CheckCircle2,
    ClipboardList,
    Package,
    ShoppingCart,
    TrendingDown,
    Truck,
} from 'lucide-react';
import Link from 'next/link';
import type { WarehouseShiftBoard } from '@/actions/dashboard/warehouse-dashboard';
import {
    CommandQueueChip,
    CommandQueueFooter,
    CommandQueueRow,
    type CommandQueueItem,
} from '@/components/dashboard/CommandCenterPrimitives';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface WarehouseShiftBoardProps {
    data: WarehouseShiftBoard | null;
}

function formatQuantity(value: number): string {
    return value.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

function buildQueue(data: WarehouseShiftBoard): CommandQueueItem[] {
    if (data.attention.status === 'UNAVAILABLE') return [];
    const queue: CommandQueueItem[] = [];

    for (const item of data.attention.data.waitingMaterial.items) {
        queue.push({
            id: 'material-' + item.id,
            category: 'Bahan produksi',
            title: item.orderNumber,
            subtitle:
                'SPK menunggu material; urutan mengikuti waktu dibuat terlama.',
            age: 'Menunggu bahan',
            tone: 'critical',
            href: '/warehouse/materials?orderId=' + item.id,
            action: 'Siapkan bahan',
            icon: ClipboardList,
        });
    }

    for (const item of data.attention.data.loadingUnverified.items) {
        queue.push({
            id: 'loading-' + item.id,
            category: 'Pemuatan',
            title: item.number,
            subtitle: item.customerName
                ? 'Tujuan: ' + item.customerName
                : 'Surat jalan sedang dimuat dan belum diverifikasi.',
            age: 'Belum diverifikasi',
            tone: 'critical',
            href: '/warehouse/outgoing/' + item.id,
            action: 'Verifikasi muat',
            icon: Truck,
        });
    }

    for (const item of data.attention.data.partialPOs.items) {
        queue.push({
            id: 'partial-' + item.id,
            category: 'Penerimaan',
            title: item.orderNumber + ' · ' + item.supplierName,
            subtitle: item.expectedDate
                ? 'PO diterima sebagian dan menunggu sisa penerimaan.'
                : 'PO diterima sebagian; tanggal harapan belum diisi.',
            age: item.expectedDate ? 'Menunggu sisa' : 'ETA belum diisi',
            tone: 'warning',
            href: '/warehouse/incoming/orders/' + item.id,
            action: 'Buka incoming',
            icon: Package,
        });
    }

    return queue.slice(0, 8);
}

export function WarehouseShiftBoardComponent({
    data,
}: WarehouseShiftBoardProps) {
    if (!data) {
        return (
            <div className="min-w-0 space-y-6">
                <h1 className="text-3xl font-bold tracking-tight">Gudang</h1>
                <DashboardSectionState
                    state="UNAVAILABLE"
                    title="Dashboard gudang tidak tersedia"
                    description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                />
            </div>
        );
    }

    const { generatedAt, health, today, attention, drivers } = data;
    const queue = buildQueue(data);
    const totalQueue =
        attention.status === 'AVAILABLE'
            ? attention.data.waitingMaterial.total +
              attention.data.loadingUnverified.total +
              attention.data.partialPOs.total
            : null;

    return (
        <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col space-y-6 md:space-y-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Command center
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight">
                        Gudang
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                        Arus barang, kebutuhan produksi, dan exception stok yang
                        menentukan pekerjaan shift.
                    </p>
                    <div className="mt-4">
                        <DashboardFreshness generatedAt={generatedAt} />
                    </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button
                        asChild
                        size="lg"
                        className="min-h-11 gap-2 shadow-sm"
                    >
                        <Link href="/warehouse/incoming">
                            <ArrowDownToLine className="h-4 w-4" />
                            Terima barang
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="min-h-11 gap-2"
                    >
                        <Link href="/warehouse/outgoing">
                            <ArrowUpFromLine className="h-4 w-4" />
                            Barang keluar
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="lg"
                        variant="ghost"
                        className="min-h-11 gap-2"
                    >
                        <Link href="/warehouse/materials">
                            <Boxes className="h-4 w-4" />
                            Bahan produksi
                        </Link>
                    </Button>
                </div>
            </div>

            <section
                aria-labelledby="warehouse-health-heading"
                className="min-w-0 space-y-3"
            >
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="warehouse-health-heading"
                        className="text-lg font-semibold"
                    >
                        Ringkasan kesehatan
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {health.operational.status === 'UNAVAILABLE' ? (
                        <div className="sm:col-span-2">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Antrean operasional tidak tersedia"
                                description="Hitungan terima, muat, dan material gagal dimuat dan tidak dianggap nol."
                            />
                        </div>
                    ) : (
                        <>
                            <DashboardHealthCard
                                title="Menunggu penerimaan"
                                value={health.operational.data.receivablePOs.toLocaleString(
                                    'id-ID',
                                )}
                                icon={Package}
                                definition={{
                                    unit: 'Pesanan pembelian',
                                    period: 'Saat dashboard diperbarui',
                                    description:
                                        'Pesanan pembelian yang sudah dikirim atau diterima sebagian dan dapat diterima gudang.',
                                    source: 'Data pembelian',
                                }}
                                href={
                                    health.operational.data.receivablePOs > 0
                                        ? '/warehouse/incoming'
                                        : undefined
                                }
                                supportingText="Buka antrean penerimaan"
                            />
                            <DashboardHealthCard
                                title="Menunggu pemuatan"
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
                                supportingText="Buka antrean pemuatan"
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
                                supportingText="Buka antrean material"
                            />
                        </>
                    )}
                    {health.inventory.status === 'UNAVAILABLE' ? (
                        <div className="sm:col-span-2">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Kondisi persediaan tidak tersedia"
                                description="Hitungan stok menipis dan kebutuhan pesan ulang gagal dimuat."
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
                                        'Varian aktif dengan persediaan internal di bawah batas minimum.',
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
                                        'Varian aktif dengan persediaan internal di bawah titik pesan ulang.',
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
            </section>

            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.85fr)]">
                <section
                    aria-labelledby="warehouse-attention-heading"
                    className="min-w-0"
                >
                    <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                        <div className="border-b p-4 sm:p-5">
                            <div className="flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                </span>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        Prioritas shift
                                    </p>
                                    <h2
                                        id="warehouse-attention-heading"
                                        className="mt-0.5 text-xl font-semibold tracking-tight"
                                    >
                                        Butuh tindakan
                                    </h2>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Urutan tetap: material produksi,
                                        verifikasi muat, lalu sisa penerimaan.
                                        Ranking tiap sumber mengikuti query
                                        kanonis.
                                    </p>
                                </div>
                            </div>
                            {attention.status === 'AVAILABLE' && (
                                <div
                                    className="scrollbar-none -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1"
                                    aria-label="Ringkasan antrean Warehouse"
                                >
                                    <CommandQueueChip
                                        label="Bahan produksi"
                                        value={
                                            attention.data.waitingMaterial.total
                                        }
                                        href="/warehouse/materials"
                                    />
                                    <CommandQueueChip
                                        label="Pemuatan"
                                        value={
                                            attention.data.loadingUnverified
                                                .total
                                        }
                                        href="/warehouse/outgoing"
                                    />
                                    <CommandQueueChip
                                        label="Penerimaan parsial"
                                        value={attention.data.partialPOs.total}
                                        href="/warehouse/incoming"
                                    />
                                </div>
                            )}
                        </div>
                        {attention.status === 'UNAVAILABLE' ? (
                            <div className="p-4 sm:p-5">
                                <DashboardSectionState
                                    state="UNAVAILABLE"
                                    title="Daftar perhatian tidak tersedia"
                                    description="Kegagalan baca tidak dianggap sebagai antrean kosong."
                                />
                            </div>
                        ) : queue.length > 0 ? (
                            <ul aria-label="Daftar prioritas Warehouse">
                                {queue.map((item) => (
                                    <CommandQueueRow
                                        key={item.id}
                                        item={item}
                                    />
                                ))}
                            </ul>
                        ) : (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                Tidak ada item yang butuh perhatian.
                            </div>
                        )}
                        <CommandQueueFooter
                            total={totalQueue}
                            returned={queue.length}
                            href="/warehouse/materials"
                            label="Buka workbench gudang"
                        />
                    </Card>
                </section>

                <aside
                    aria-labelledby="warehouse-drivers-heading"
                    className="min-w-0 space-y-5"
                >
                    <Card className="gap-0 py-0 shadow-sm">
                        <CardContent className="p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Aktivitas hari ini
                            </p>
                            <h2 className="mt-1 text-lg font-semibold">
                                Throughput WIB
                            </h2>
                            {today.status === 'UNAVAILABLE' ? (
                                <div className="mt-5">
                                    <DashboardSectionState
                                        state="UNAVAILABLE"
                                        title="Aktivitas hari ini tidak tersedia"
                                        description="Hitungan event hari bisnis WIB gagal dimuat."
                                    />
                                </div>
                            ) : (
                                <div className="mt-5 grid gap-3 text-sm">
                                    <div className="flex min-h-11 items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 text-muted-foreground">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            Diterima
                                        </span>
                                        <span className="font-bold tabular-nums">
                                            {today.data.goodsReceipts} GR
                                        </span>
                                    </div>
                                    <div className="flex min-h-11 items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 text-muted-foreground">
                                            <Truck className="h-4 w-4 text-blue-500" />
                                            Dikirim
                                        </span>
                                        <span className="font-bold tabular-nums">
                                            {today.data.deliveriesShipped} SJ
                                        </span>
                                    </div>
                                    <div className="flex min-h-11 items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 text-muted-foreground">
                                            <ClipboardList className="h-4 w-4 text-amber-500" />
                                            Pengeluaran bahan
                                        </span>
                                        <span className="font-bold tabular-nums">
                                            {today.data.materialIssues}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="gap-0 py-0 shadow-sm">
                        <CardContent className="p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Sinyal utama
                            </p>
                            <h2
                                id="warehouse-drivers-heading"
                                className="mt-1 text-lg font-semibold"
                            >
                                Penyumbang stok menipis
                            </h2>
                            {drivers.status === 'UNAVAILABLE' ? (
                                <div className="mt-5">
                                    <DashboardSectionState
                                        state="UNAVAILABLE"
                                        title="Penyumbang stok tidak tersedia"
                                        description="Daftar penyumbang gagal dimuat."
                                    />
                                </div>
                            ) : drivers.data.lowStock.length === 0 ? (
                                <p className="mt-5 text-sm text-muted-foreground">
                                    Tidak ada varian di bawah batas minimum.
                                </p>
                            ) : (
                                <div className="mt-5 space-y-2">
                                    {drivers.data.lowStock.map((driver) => (
                                        <div
                                            key={driver.id}
                                            className="rounded-md border p-3"
                                        >
                                            <p className="text-sm font-medium">
                                                {driver.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {driver.skuCode}
                                            </p>
                                            <p className="mt-1 text-sm tabular-nums">
                                                {formatQuantity(
                                                    driver.eligibleQuantity,
                                                )}{' '}
                                                /{' '}
                                                {formatQuantity(
                                                    driver.threshold,
                                                )}{' '}
                                                {driver.unit}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
