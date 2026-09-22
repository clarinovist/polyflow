'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Calculator, Info } from 'lucide-react';
import { InfoHint } from '@/components/common/InfoHint';
import { formatRupiah } from '@/lib/utils/utils';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { MaklonCostManager } from '@/components/maklon/MaklonCostManager';
import type { getOrderCosting } from '@/actions/finance/finance';

export type OrderCostingData = Extract<
    Awaited<ReturnType<typeof getOrderCosting>>,
    { success: true }
>['data'];

interface OrderCostingTabProps {
    order: ExtendedProductionOrder;
    costingData: OrderCostingData;
    loadingCosting: boolean;
}

export function OrderCostingTab({
    order,
    costingData,
    loadingCosting,
}: OrderCostingTabProps) {
    return (
        <div className="space-y-6">
            {/* Maklon Conversion Costs – only for Maklon orders */}
            {order.isMaklon && (
                <MaklonCostManager
                    productionOrderId={order.id}
                    initialItems={order.maklonCostItems ?? []}
                />
            )}

            {loadingCosting ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Calculator className="w-8 h-8 animate-pulse mb-2" />
                    <p>Menghitung biaya batch…</p>
                </div>
            ) : costingData ? (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Calculator className="w-4 h-4" /> Rincian Biaya
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                                        Biaya Material
                                    </p>
                                    <p className="text-xl font-bold">
                                        {formatRupiah(costingData.materialCost)}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                                        Biaya Konversi
                                    </p>
                                    <p className="text-xl font-bold">
                                        {formatRupiah(
                                            costingData.conversionCost,
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="pt-4 border-t">
                                <div className="flex flex-wrap items-end justify-between gap-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                                            Total HPP (COGM)
                                        </p>
                                        <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
                                            {formatRupiah(
                                                costingData.totalCost,
                                            )}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                                            Biaya Satuan
                                        </p>
                                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                                            {formatRupiah(costingData.unitCost)}{' '}
                                            <span className="text-xs font-normal text-muted-foreground">
                                                /{' '}
                                                {
                                                    order.bom.productVariant
                                                        .primaryUnit
                                                }
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Info className="w-4 h-4" /> Wawasan
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        % Material
                                    </span>
                                    <span className="font-medium">
                                        {(costingData.totalCost > 0
                                            ? (costingData.materialCost /
                                                  costingData.totalCost) *
                                              100
                                            : 0
                                        ).toFixed(1)}
                                        %
                                    </span>
                                </div>
                                <Progress
                                    value={
                                        costingData.totalCost > 0
                                            ? (costingData.materialCost /
                                                  costingData.totalCost) *
                                              100
                                            : 0
                                    }
                                    className="h-1.5"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        % Konversi
                                    </span>
                                    <span className="font-medium">
                                        {(costingData.totalCost > 0
                                            ? (costingData.conversionCost /
                                                  costingData.totalCost) *
                                              100
                                            : 0
                                        ).toFixed(1)}
                                        %
                                    </span>
                                </div>
                                <Progress
                                    value={
                                        costingData.totalCost > 0
                                            ? (costingData.conversionCost /
                                                  costingData.totalCost) *
                                              100
                                            : 0
                                    }
                                    className="h-1.5 bg-amber-100 dark:bg-amber-900/30"
                                />
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>Metode biaya: WAC</span>
                                <InfoHint label="Info metode biaya WAC">
                                    Biaya material dihitung menggunakan Weighted
                                    Average Cost saat pengeluaran.
                                </InfoHint>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                    <Calculator className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Belum ada data biaya untuk SPK ini.</p>
                    <p className="text-xs mt-1">
                        Biaya terhimpun setelah bahan dikeluarkan atau output
                        dicatat.
                    </p>
                </div>
            )}
        </div>
    );
}
