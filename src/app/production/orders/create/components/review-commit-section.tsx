'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/utils';

interface ReviewCommitSectionProps {
    stage: string;
    productName: string;
    bomName: string;
    targetSummary: string;
    machineName: string;
    startDate: string;
    endDate?: string;
    sourceName: string;
    outputName: string;
    consumptionMode?: 'TRANSFER' | 'DIRECT';
    consumptionName?: string;
    priority: string;
    isMaklon: boolean;
    salesOrderNumber?: string;
    linkedSalesOrder?: boolean;
    predictedStatus: 'DRAFT' | 'MENUNGGU_BAHAN' | 'UNKNOWN';
    outputIsRisky: boolean;
    customerNames?: string[];
    maklonCustomerName?: string;
    conversionCost?: string;
    notes?: string;
    onEdit?: () => void;
    onEditLocations?: () => void;
}

export function ReviewCommitSection({
    stage,
    productName,
    bomName,
    targetSummary,
    machineName,
    startDate,
    endDate,
    sourceName,
    outputName,
    consumptionMode = 'TRANSFER',
    consumptionName,
    priority,
    isMaklon,
    salesOrderNumber,
    linkedSalesOrder,
    predictedStatus,
    outputIsRisky,
    customerNames = [],
    maklonCustomerName,
    conversionCost,
    notes,
    onEdit,
    onEditLocations,
}: ReviewCommitSectionProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Ringkasan SPK</CardTitle>
                {onEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="min-h-11 scroll-mt-24 px-2 text-sm underline underline-offset-4"
                    >
                        Ubah rencana
                    </button>
                )}
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Tahap</span>
                    <span className="font-medium">{stage}</span>

                    <span className="text-muted-foreground">Produk</span>
                    <span className="font-medium">{productName || '—'}</span>

                    <span className="text-muted-foreground">Resep</span>
                    <span className="font-medium">{bomName || '—'}</span>

                    <span className="text-muted-foreground">Target</span>
                    <span className="font-medium">{targetSummary}</span>

                    <span className="text-muted-foreground">Mesin</span>
                    <span className="font-medium">
                        {machineName || 'Tidak ditentukan'}
                    </span>

                    <span className="text-muted-foreground">Mulai</span>
                    <span className="font-medium">{startDate}</span>

                    {endDate && (
                        <>
                            <span className="text-muted-foreground">
                                Selesai
                            </span>
                            <span className="font-medium">{endDate}</span>
                        </>
                    )}

                    <span className="text-muted-foreground">
                        Pemakaian bahan
                    </span>
                    <span className="font-medium break-words">
                        {consumptionMode === 'DIRECT'
                            ? 'Langsung per bahan'
                            : 'Transfer ke satu lokasi'}
                    </span>
                    <span className="text-muted-foreground">Gudang asal</span>
                    <span className="font-medium break-words">
                        {sourceName}
                    </span>
                    {consumptionMode === 'TRANSFER' && (
                        <>
                            <span className="text-muted-foreground">
                                Tujuan transfer
                            </span>
                            <span className="font-medium break-words">
                                {consumptionName || outputName}
                            </span>
                        </>
                    )}
                    <span className="text-muted-foreground">
                        Penyimpanan hasil
                    </span>
                    <span className="font-medium break-words">
                        {outputName}
                    </span>

                    <span className="text-muted-foreground">Prioritas</span>
                    <span className="font-medium">
                        {{
                            URGENT: 'Mendesak',
                            NORMAL: 'Normal',
                            LOW: 'Rendah',
                        }[priority] || priority}
                    </span>

                    <span className="text-muted-foreground">Maklon</span>
                    <span className="font-medium">
                        {isMaklon ? 'Ya' : 'Tidak'}
                    </span>

                    {isMaklon && (
                        <>
                            <span className="text-muted-foreground">
                                Pemilik bahan
                            </span>
                            <span className="break-words font-medium">
                                {maklonCustomerName || '—'}
                            </span>
                            <span className="text-muted-foreground">
                                Estimasi jasa
                            </span>
                            <span className="font-medium">
                                {conversionCost || '—'}
                            </span>
                        </>
                    )}
                    <span className="text-muted-foreground">
                        Customer tujuan
                    </span>
                    <span className="break-words font-medium">
                        {customerNames.join(', ') ||
                            (linkedSalesOrder
                                ? 'Customer dari Sales Order'
                                : 'Belum ditentukan')}
                    </span>
                    {notes && (
                        <>
                            <span className="text-muted-foreground">
                                Catatan
                            </span>
                            <span className="break-words whitespace-pre-wrap">
                                {notes}
                            </span>
                        </>
                    )}
                    {linkedSalesOrder && !salesOrderNumber && (
                        <>
                            <span className="text-muted-foreground">
                                Sumber permintaan
                            </span>
                            <span>
                                Tertaut Sales Order · customer SO otomatis
                                disertakan
                            </span>
                        </>
                    )}
                    {salesOrderNumber && (
                        <>
                            <span className="text-muted-foreground">
                                Sales Order
                            </span>
                            <span className="font-medium">
                                {salesOrderNumber}
                            </span>
                        </>
                    )}
                </div>

                {onEditLocations && (
                    <button
                        type="button"
                        className="min-h-11 scroll-mt-24 text-sm underline underline-offset-4"
                        onClick={onEditLocations}
                    >
                        Ubah lokasi, customer & instruksi
                    </button>
                )}
                <div className="pt-3 border-t">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">
                            Perkiraan status:
                        </span>
                        <span
                            className={cn(
                                'font-semibold text-sm px-2 py-0.5 rounded',
                                predictedStatus === 'UNKNOWN'
                                    ? 'bg-muted text-muted-foreground'
                                    : predictedStatus === 'DRAFT'
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
                            )}
                        >
                            {predictedStatus === 'UNKNOWN'
                                ? 'Belum terverifikasi'
                                : predictedStatus === 'DRAFT'
                                  ? 'Draft'
                                  : 'Menunggu Bahan'}
                        </span>
                    </div>
                </div>

                {outputIsRisky && (
                    <div className="pt-3 border-t">
                        <p className="text-xs text-destructive">
                            ⚠ Lokasi output berisiko. Konfirmasi diperlukan saat
                            submit.
                        </p>
                    </div>
                )}

                <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                    Membuat 1 SPK untuk satu tahap, belum memulai produksi. Stok
                    bukan reservasi; status akhir ditentukan saat SPK dibuat.
                </p>
            </CardContent>
        </Card>
    );
}
