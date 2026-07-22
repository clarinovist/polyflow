'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Truck, ClipboardList, AlertTriangle, ShoppingCart, ArrowRight, TrendingDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import type { WarehouseShiftBoard } from '@/actions/dashboard/warehouse-dashboard';

type BoardData = WarehouseShiftBoard;

interface WarehouseShiftBoardProps {
    data: BoardData;
}

function StatCard({
    label,
    count,
    icon: Icon,
    href,
    ctaLabel,
    colorClass,
}: {
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
    ctaLabel: string;
    colorClass: string;
}) {
    return (
        <Link href={href} className="contents">
            <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group h-full">
                <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className={cn("p-2 rounded-lg", colorClass)}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <span className="text-2xl font-bold tabular-nums">{count}</span>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">{label}</p>
                        <p className="text-xs text-primary font-semibold flex items-center gap-1 mt-1 group-hover:underline">
                            {ctaLabel} <ArrowRight className="h-3 w-3" />
                        </p>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

function AttentionSection({
    title,
    items,
    emptyMessage,
    renderItem,
}: {
    title: string;
    items: Array<Record<string, unknown>>;
    emptyMessage: string;
    renderItem: (item: Record<string, unknown>) => React.ReactNode;
}) {
    return (
        <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {title}
            </h3>
            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">{emptyMessage}</p>
            ) : (
                <div className="space-y-1">
                    {items.map(item => (
                        <div key={String(item.id)} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors min-h-[44px]">
                            {renderItem(item)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function WarehouseShiftBoardComponent({ data }: WarehouseShiftBoardProps) {
    const { counts, today, attention } = data;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Hari Ini</h1>
                <p className="text-muted-foreground">Ringkasan pekerjaan shift + antrean prioritas.</p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard
                    label="Terima"
                    count={counts.receivablePOs}
                    icon={Package}
                    href="/warehouse/incoming"
                    ctaLabel="Buka"
                    colorClass="bg-blue-500/10 text-blue-600"
                />
                <StatCard
                    label="Muat"
                    count={counts.openLoadOrders}
                    icon={Truck}
                    href="/warehouse/outgoing"
                    ctaLabel="Buka"
                    colorClass="bg-emerald-500/10 text-emerald-600"
                />
                <StatCard
                    label="Bahan Produksi"
                    count={counts.materialQueue}
                    icon={ClipboardList}
                    href="/warehouse/materials"
                    ctaLabel="Buka"
                    colorClass="bg-amber-500/10 text-amber-600"
                />
                <StatCard
                    label="Stok Menipis"
                    count={counts.lowStock}
                    icon={TrendingDown}
                    href="/warehouse/inventory?lowStock=true"
                    ctaLabel="Lihat"
                    colorClass="bg-red-500/10 text-red-600"
                />
                <StatCard
                    label="Perlu Reorder"
                    count={counts.suggestedReorder}
                    icon={ShoppingCart}
                    href="/warehouse/analytics#reorder"
                    ctaLabel="Analitik"
                    colorClass="bg-purple-500/10 text-purple-600"
                />
            </div>

            {/* Attention Section */}
            <Card>
                <CardContent className="p-4 space-y-4">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Butuh Perhatian</h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <AttentionSection
                            title="SJ Loading belum diverifikasi"
                            items={attention.loadingUnverified.map(d => ({ id: d.id, number: d.number, customerName: d.customerName ?? '' }))}
                            emptyMessage="Tidak ada SJ pending verifikasi"
                            renderItem={(item) => (
                                <Link href={`/warehouse/outgoing/${String(item.id)}`} className="flex-1 flex items-center justify-between group/link">
                                    <div>
                                        <span className="text-sm font-mono font-bold">{String(item.number)}</span>
                                        {typeof item.customerName === 'string' && item.customerName.length > 0 && (
                                            <span className="text-xs text-muted-foreground ml-2">{item.customerName}</span>
                                        )}
                                    </div>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                                </Link>
                            )}
                        />

                        <AttentionSection
                            title="PO partial menunggu sisa"
                            items={attention.partialPOs.map(p => ({ id: p.id, orderNumber: p.orderNumber, supplierName: p.supplierName }))}
                            emptyMessage="Tidak ada PO partial"
                            renderItem={(item) => (
                                <Link href={`/warehouse/incoming/orders/${String(item.id)}`} className="flex-1 flex items-center justify-between group/link">
                                    <div>
                                        <span className="text-sm font-mono font-bold">{String(item.orderNumber)}</span>
                                        <span className="text-xs text-muted-foreground ml-2">{String(item.supplierName)}</span>
                                    </div>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                                </Link>
                            )}
                        />

                        <AttentionSection
                            title="SPK menunggu bahan"
                            items={attention.waitingMaterial.map(p => ({ id: p.id, orderNumber: p.orderNumber }))}
                            emptyMessage="Tidak ada SPK waiting material"
                            renderItem={(item) => (
                                <Link href={`/warehouse/materials`} className="flex-1 flex items-center justify-between group/link">
                                    <span className="text-sm font-mono font-bold">{String(item.orderNumber)}</span>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                                </Link>
                            )}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Today Ops KPI */}
            <Card>
                <CardContent className="p-4">
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">Aktivitas Hari Ini</h2>
                    <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <span className="text-muted-foreground">Diterima:</span>
                            <span className="font-bold">{today.goodsReceipts} GR</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-blue-500" />
                            <span className="text-muted-foreground">Dikirim:</span>
                            <span className="font-bold">{today.deliveriesShipped} SJ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-amber-500" />
                            <span className="text-muted-foreground">Issue bahan:</span>
                            <span className="font-bold">{today.materialIssues}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
