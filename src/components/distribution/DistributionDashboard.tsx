import type { LucideIcon } from 'lucide-react';
import {
    Boxes,
    FileClock,
    PackageCheck,
    PackageSearch,
    Receipt,
    ShoppingCart,
    Truck,
    Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import type {
    DistributionDashboardData,
    DistributionDashboardQuickActionHref,
} from '@/actions/distribution/dashboard';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Card, CardContent } from '@/components/ui/card';

interface DistributionDashboardProps {
    data: DistributionDashboardData | null;
}

type CountSection =
    | {
          state: 'AVAILABLE';
          data: { count: number };
          href: string | null;
      }
    | { state: 'UNAVAILABLE'; data: null; href: string | null }
    | { state: 'HIDDEN'; data: null; href: null };

const QUICK_ACTIONS: Record<
    DistributionDashboardQuickActionHref,
    { label: string; icon: LucideIcon }
> = {
    '/sales/orders': { label: 'Sales Order', icon: ShoppingCart },
    '/purchasing/orders': {
        label: 'Order Pembelian (PO)',
        icon: PackageSearch,
    },
    '/sales/deliveries': { label: 'Surat Jalan', icon: Truck },
    '/warehouse/inventory': { label: 'Stok', icon: Warehouse },
    '/sales/invoices': { label: 'Invoice & Piutang', icon: Receipt },
};

function formatCount(value: number): string {
    return value.toLocaleString('id-ID');
}

function metricState(
    state: 'AVAILABLE' | 'UNAVAILABLE' | 'HIDDEN',
): 'AVAILABLE' | 'UNAVAILABLE' {
    return state === 'HIDDEN' ? 'UNAVAILABLE' : state;
}

function CountMetric({
    section,
    title,
    icon,
    definition,
}: {
    section: CountSection;
    title: string;
    icon: LucideIcon;
    definition: {
        unit: string;
        period: string;
        description: string;
        source: string;
    };
}) {
    if (section.state === 'HIDDEN') return null;
    return (
        <DashboardHealthCard
            title={title}
            value={
                section.state === 'AVAILABLE'
                    ? formatCount(section.data.count)
                    : undefined
            }
            state={metricState(section.state)}
            icon={icon}
            definition={definition}
            href={
                section.state === 'AVAILABLE'
                    ? (section.href ?? undefined)
                    : undefined
            }
        />
    );
}

export function DistributionDashboard({ data }: DistributionDashboardProps) {
    if (!data) {
        return (
            <div className="min-w-0 space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Operasional Distribution
                    </h1>
                    <p className="text-muted-foreground">
                        Kondisi seluruh operasi distribusi tenant
                    </p>
                </div>
                <section
                    className="space-y-3"
                    aria-labelledby="distribution-health-heading"
                >
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Health
                    </p>
                    <h2
                        id="distribution-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Dashboard Distribution tidak tersedia"
                        description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                    />
                </section>
            </div>
        );
    }

    const healthCards: React.ReactNode[] = [];

    if (data.health.salesOrders.state !== 'HIDDEN') {
        const salesState = metricState(data.health.salesOrders.state);
        healthCards.push(
            <DashboardHealthCard
                key="active-sales-orders"
                title="Pesanan aktif"
                value={
                    data.health.salesOrders.state === 'AVAILABLE'
                        ? formatCount(data.health.salesOrders.data.active)
                        : undefined
                }
                state={salesState}
                icon={ShoppingCart}
                href={
                    salesState === 'AVAILABLE'
                        ? (data.health.salesOrders.href ?? undefined)
                        : undefined
                }
                definition={{
                    unit: 'SO · jumlah dokumen',
                    period: 'Snapshot saat diperbarui',
                    description:
                        'Sales Order berstatus CONFIRMED, IN_PRODUCTION, READY_TO_SHIP, atau SHIPPED.',
                    source: 'Sales · Sales Order',
                }}
            />,
            <DashboardHealthCard
                key="ready-sales-orders"
                title="Siap dikirim"
                value={
                    data.health.salesOrders.state === 'AVAILABLE'
                        ? formatCount(data.health.salesOrders.data.readyToShip)
                        : undefined
                }
                state={salesState}
                icon={PackageCheck}
                href={
                    salesState === 'AVAILABLE'
                        ? (data.health.salesOrders.href ?? undefined)
                        : undefined
                }
                definition={{
                    unit: 'SO · jumlah dokumen',
                    period: 'Snapshot saat diperbarui',
                    description: 'Sales Order dengan status READY_TO_SHIP.',
                    source: 'Sales · Sales Order',
                }}
            />,
        );
    }

    if (data.health.purchaseOrders.state !== 'HIDDEN') {
        healthCards.push(
            <DashboardHealthCard
                key="purchase-orders"
                title="PO menunggu penerimaan"
                value={
                    data.health.purchaseOrders.state === 'AVAILABLE'
                        ? formatCount(
                              data.health.purchaseOrders.data.waitingReceipt,
                          )
                        : undefined
                }
                state={metricState(data.health.purchaseOrders.state)}
                icon={PackageSearch}
                href={
                    data.health.purchaseOrders.state === 'AVAILABLE'
                        ? (data.health.purchaseOrders.href ?? undefined)
                        : undefined
                }
                definition={{
                    unit: 'PO · jumlah dokumen',
                    period: 'Snapshot saat diperbarui',
                    description:
                        'Purchase Order berstatus SENT atau PARTIAL_RECEIVED; DRAFT, RECEIVED, CANCELLED, dan CLOSED tidak termasuk.',
                    source: 'Purchasing · Purchase Order',
                }}
                supportingText={
                    data.health.purchaseOrders.state === 'AVAILABLE' ? (
                        <span>
                            SENT{' '}
                            {formatCount(data.health.purchaseOrders.data.sent)}{' '}
                            · PARTIAL_RECEIVED{' '}
                            {formatCount(
                                data.health.purchaseOrders.data.partialReceived,
                            )}
                        </span>
                    ) : undefined
                }
            />,
        );
    }

    if (data.health.inventory.state !== 'HIDDEN') {
        const inventoryState = metricState(data.health.inventory.state);
        healthCards.push(
            <DashboardHealthCard
                key="low-stock"
                title="Stok rendah"
                value={
                    data.health.inventory.state === 'AVAILABLE'
                        ? formatCount(data.health.inventory.data.lowStock)
                        : undefined
                }
                state={inventoryState}
                icon={Boxes}
                href={
                    inventoryState === 'AVAILABLE'
                        ? (data.health.inventory.href ?? undefined)
                        : undefined
                }
                definition={{
                    unit: 'Varian · jumlah',
                    period: 'Snapshot saat diperbarui',
                    description:
                        'Varian aktif di bawah minStockAlert positif; hanya lokasi INTERNAL RAW_MATERIAL dan FINISHED_GOOD.',
                    source: 'Inventory · threshold gudang kanonis',
                }}
            />,
            <DashboardHealthCard
                key="reorder"
                title="Perlu dipesan ulang"
                value={
                    data.health.inventory.state === 'AVAILABLE'
                        ? formatCount(data.health.inventory.data.reorder)
                        : undefined
                }
                state={inventoryState}
                icon={PackageSearch}
                href={
                    inventoryState === 'AVAILABLE'
                        ? (data.health.inventory.href ?? undefined)
                        : undefined
                }
                definition={{
                    unit: 'Varian · jumlah',
                    period: 'Snapshot saat diperbarui',
                    description:
                        'Varian aktif di bawah reorderPoint positif pada scope persediaan internal kanonis.',
                    source: 'Inventory · threshold gudang kanonis',
                }}
            />,
        );
    }

    return (
        <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Operasional Distribution
                    </h1>
                    <p className="text-muted-foreground">
                        Kondisi seluruh operasi distribusi tenant
                    </p>
                </div>
                <DashboardFreshness generatedAt={data.generatedAt} />
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="distribution-health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Health
                    </p>
                    <h2
                        id="distribution-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                </div>
                {healthCards.length > 0 ||
                data.health.accountsReceivable.state !== 'HIDDEN' ||
                data.health.accountsPayable.state !== 'HIDDEN' ? (
                    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {healthCards}
                        <CountMetric
                            section={
                                data.health.accountsReceivable.state ===
                                'AVAILABLE'
                                    ? {
                                          state: 'AVAILABLE',
                                          data: {
                                              count: data.health
                                                  .accountsReceivable.data
                                                  .overdue,
                                          },
                                          href: data.health.accountsReceivable
                                              .href,
                                      }
                                    : data.health.accountsReceivable
                            }
                            title="Piutang jatuh tempo"
                            icon={FileClock}
                            definition={{
                                unit: 'Invoice · jumlah dokumen',
                                period: `Jatuh tempo sebelum awal hari WIB ${data.businessDate}`,
                                description:
                                    'Invoice Sales outstanding dengan remaining positif; cohort opening balance dan histori dikecualikan.',
                                source: 'Finance/Sales · piutang operasional',
                            }}
                        />
                        <CountMetric
                            section={
                                data.health.accountsPayable.state ===
                                'AVAILABLE'
                                    ? {
                                          state: 'AVAILABLE',
                                          data: {
                                              count: data.health.accountsPayable
                                                  .data.overdue,
                                          },
                                          href: data.health.accountsPayable
                                              .href,
                                      }
                                    : data.health.accountsPayable
                            }
                            title="Hutang jatuh tempo"
                            icon={FileClock}
                            definition={{
                                unit: 'Invoice · jumlah dokumen',
                                period: `Jatuh tempo sebelum awal hari WIB ${data.businessDate}`,
                                description:
                                    'Invoice pembelian UNPAID, PARTIAL, atau OVERDUE dengan sisa tagihan positif.',
                                source: 'Finance/Purchasing · hutang operasional',
                            }}
                        />
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Tidak ada domain operasional yang diizinkan untuk
                        ditampilkan.
                    </p>
                )}
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="distribution-attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Attention
                    </p>
                    <h2
                        id="distribution-attention-heading"
                        className="text-lg font-semibold"
                    >
                        Butuh perhatian
                    </h2>
                </div>
                {data.attention.readyWithoutDo.state === 'HIDDEN' &&
                data.health.purchaseOrders.state === 'HIDDEN' &&
                data.health.inventory.state === 'HIDDEN' ? (
                    <p className="text-sm text-muted-foreground">
                        Tidak ada antrean perhatian yang diizinkan untuk
                        ditampilkan.
                    </p>
                ) : (
                    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <CountMetric
                            section={data.attention.readyWithoutDo}
                            title="Siap kirim tanpa DO terbuka"
                            icon={Truck}
                            definition={{
                                unit: 'SO · jumlah dokumen',
                                period: 'Snapshot saat diperbarui',
                                description:
                                    'Sales Order READY_TO_SHIP tanpa Delivery Order PENDING atau LOADING.',
                                source: 'Sales · Sales Order dan Delivery Order',
                            }}
                        />
                        {data.health.purchaseOrders.state !== 'HIDDEN' && (
                            <DashboardHealthCard
                                title="Antrean penerimaan PO"
                                value={
                                    data.health.purchaseOrders.state ===
                                    'AVAILABLE'
                                        ? formatCount(
                                              data.health.purchaseOrders.data
                                                  .waitingReceipt,
                                          )
                                        : undefined
                                }
                                state={metricState(
                                    data.health.purchaseOrders.state,
                                )}
                                icon={PackageSearch}
                                href={
                                    data.health.purchaseOrders.state ===
                                    'AVAILABLE'
                                        ? (data.health.purchaseOrders.href ??
                                          undefined)
                                        : undefined
                                }
                                definition={{
                                    unit: 'PO · jumlah dokumen',
                                    period: 'Snapshot saat diperbarui',
                                    description:
                                        'Tekanan operasional faktual dari PO SENT atau PARTIAL_RECEIVED yang masih menunggu penerimaan.',
                                    source: 'Purchasing · Purchase Order',
                                }}
                                supportingText={
                                    data.health.purchaseOrders.state ===
                                    'AVAILABLE' ? (
                                        <span>
                                            SENT{' '}
                                            {formatCount(
                                                data.health.purchaseOrders.data
                                                    .sent,
                                            )}{' '}
                                            · PARTIAL_RECEIVED{' '}
                                            {formatCount(
                                                data.health.purchaseOrders.data
                                                    .partialReceived,
                                            )}
                                        </span>
                                    ) : undefined
                                }
                            />
                        )}
                        {data.health.inventory.state !== 'HIDDEN' && (
                            <DashboardHealthCard
                                title="Tekanan threshold stok internal"
                                value={
                                    data.health.inventory.state === 'AVAILABLE'
                                        ? `${formatCount(data.health.inventory.data.lowStock)} stok rendah · ${formatCount(data.health.inventory.data.reorder)} reorder`
                                        : undefined
                                }
                                state={metricState(data.health.inventory.state)}
                                icon={Boxes}
                                href={
                                    data.health.inventory.state === 'AVAILABLE'
                                        ? (data.health.inventory.href ??
                                          undefined)
                                        : undefined
                                }
                                definition={{
                                    unit: 'Varian · jumlah',
                                    period: 'Snapshot saat diperbarui',
                                    description:
                                        'Hitungan faktual varian internal di bawah minStockAlert atau reorderPoint yang dikonfigurasi.',
                                    source: 'Inventory · threshold gudang kanonis',
                                }}
                            />
                        )}
                    </div>
                )}
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="distribution-drivers-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Drivers
                    </p>
                    <h2
                        id="distribution-drivers-heading"
                        className="text-lg font-semibold"
                    >
                        Pendorong kondisi
                    </h2>
                </div>
                <DashboardSectionState
                    state="NOT_CONFIGURED"
                    title="NOT_CONFIGURED · Driver operasional belum dikonfigurasi"
                    description="Driver kondisi menunggu definisi operasional dan discriminator yang disetujui; hitungan status tidak diubah menjadi ranking kausal."
                />
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="distribution-withheld-heading"
            >
                <h2
                    id="distribution-withheld-heading"
                    className="text-lg font-semibold"
                >
                    Metrik yang ditahan
                </h2>
                <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
                    <DashboardSectionState
                        state="NOT_CONFIGURED"
                        title="NOT_CONFIGURED · Fulfillment dan pengecualian lifecycle ditahan"
                        description="Fulfillment, pengiriman terlambat, PO terlambat, dan SO tertahan stok menunggu keputusan lifecycle dan reservasi yang disetujui."
                    />
                    <DashboardSectionState
                        state="NOT_CONFIGURED"
                        title="NOT_CONFIGURED · Metrik keuangan ditahan"
                        description="Pendapatan dan margin tidak ditampilkan karena tidak ada discriminator baris dan cohort keuangan yang disetujui."
                    />
                </div>
            </section>

            {data.quickActionHrefs.length > 0 && (
                <Card>
                    <CardContent className="p-4">
                        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
                            Aksi cepat
                        </h2>
                        <nav
                            aria-label="Aksi cepat Distribution"
                            className="flex flex-wrap gap-2"
                        >
                            {data.quickActionHrefs.map((href) => {
                                const item = QUICK_ACTIONS[href];
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                        <Icon
                                            aria-hidden="true"
                                            className="h-4 w-4 shrink-0"
                                        />
                                        <span className="break-words">
                                            {item.label}
                                        </span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
