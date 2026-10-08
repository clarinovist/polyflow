'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah, toDecimalNumber } from '@/lib/utils/utils';
import { listPurchaseRemittancesAction } from '@/actions/purchasing/purchase-remittance';
import { CreatePurchaseRemittanceDialog } from '@/components/purchasing/CreatePurchaseRemittanceDialog';
import type { TenantPaymentBanks } from '@/lib/finance/payment-methods';
import { toast } from 'sonner';
import { AlertCircle, Plus, RefreshCw } from 'lucide-react';

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    purchaseOrder: {
        orderNumber: string;
        supplier: { name: string } | null;
    };
}

type RemittanceItemRow = {
    id: string;
    purchaseInvoiceId: string;
    amount: number | string | { toNumber?: () => number };
    method: string;
    proofUrl?: string | null;
    purchaseInvoice?: { invoiceNumber?: string } | null;
};

type RemittanceRow = {
    id: string;
    remittanceNumber: string;
    paidAt: string | Date;
    totalAmount: number | string | { toNumber?: () => number };
    status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    notes?: string | null;
    items: RemittanceItemRow[];
};

function num(v: unknown): number {
    return toDecimalNumber(v);
}

function fmtDate(d: string | Date | null | undefined): string {
    if (!d) return '-';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function statusBadge(status: RemittanceRow['status']) {
    const map: Record<
        RemittanceRow['status'],
        { label: string; className: string }
    > = {
        PENDING: {
            label: 'Menunggu Verifikasi',
            className: 'bg-amber-50 text-amber-700 border-amber-200',
        },
        VERIFIED: {
            label: 'Terverifikasi',
            className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        },
        REJECTED: {
            label: 'Ditolak',
            className: 'bg-red-50 text-red-700 border-red-200',
        },
    };
    const m = map[status];
    return (
        <Badge variant="outline" className={`text-[10px] ${m.className}`}>
            {m.label}
        </Badge>
    );
}

export interface PurchaseRemittanceAuxiliaryState {
    outstanding: 'ready' | 'empty' | 'error';
    remittances: 'ready' | 'empty' | 'error';
    paymentBanks: 'ready' | 'missing' | 'error';
}

interface PurchaseRemittanceEntryPointProps {
    invoices: PurchaseInvoice[];
    paymentBanks?: TenantPaymentBanks;
    initialRemittances?: RemittanceRow[];
    canCreate?: boolean;
    auxiliaryState?: PurchaseRemittanceAuxiliaryState;
}

export function PurchaseRemittanceEntryPoint({
    invoices,
    paymentBanks = [],
    initialRemittances = [],
    canCreate = false,
    auxiliaryState = {
        outstanding: invoices.length > 0 ? 'ready' : 'empty',
        remittances: initialRemittances.length > 0 ? 'ready' : 'empty',
        paymentBanks: paymentBanks.length > 0 ? 'ready' : 'missing',
    },
}: PurchaseRemittanceEntryPointProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [remittances, setRemittances] =
        useState<RemittanceRow[]>(initialRemittances);
    const canSubmit =
        canCreate &&
        auxiliaryState.outstanding === 'ready' &&
        auxiliaryState.paymentBanks === 'ready' &&
        invoices.length > 0;

    const refresh = useCallback(async () => {
        try {
            const res = await listPurchaseRemittancesAction({});
            if (!res?.success) {
                toast.error(res?.error || 'Gagal memuat ulang daftar setoran');
                return;
            }
            setRemittances((res.data ?? []) as unknown as RemittanceRow[]);
        } catch {
            toast.error('Gagal memuat ulang daftar setoran');
        }
    }, []);

    return (
        <div className="space-y-3">
            {(auxiliaryState.outstanding === 'error' ||
                auxiliaryState.remittances === 'error' ||
                auxiliaryState.paymentBanks === 'error') && (
                <div
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
                >
                    <p className="flex items-center gap-2 font-medium text-destructive">
                        <AlertCircle aria-hidden="true" className="h-4 w-4" />
                        Panel pembayaran belum lengkap
                    </p>
                    <p className="mt-1 text-muted-foreground">
                        Layanan pendukung gagal dimuat. Daftar invoice tetap
                        dapat digunakan, tetapi pengajuan pembayaran
                        dinonaktifkan.
                    </p>
                    {auxiliaryState.remittances === 'error' && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => void refresh()}
                        >
                            <RefreshCw aria-hidden="true" className="h-4 w-4" />
                            Coba muat pengajuan lagi
                        </Button>
                    )}
                </div>
            )}
            {auxiliaryState.paymentBanks === 'missing' && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    Rekening pembayaran belum dikonfigurasi. Hubungi Finance
                    sebelum mengajukan pembayaran supplier.
                </p>
            )}
            {auxiliaryState.outstanding === 'empty' && canCreate && (
                <p className="text-sm text-muted-foreground">
                    Tidak ada invoice yang memenuhi syarat pengajuan pembayaran.
                </p>
            )}
            {auxiliaryState.remittances === 'empty' && (
                <p className="text-sm text-muted-foreground">
                    Belum ada pengajuan pembayaran supplier sebelumnya.
                </p>
            )}
            <div className="flex justify-end">
                {canSubmit && (
                    <Button size="sm" onClick={() => setDialogOpen(true)}>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Ajukan Pembayaran Supplier
                    </Button>
                )}
            </div>

            {remittances.length > 0 && (
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm">
                            Pengajuan Setoran Saya
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y">
                            {remittances.map((r) => (
                                <div key={r.id} className="p-4 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-medium">
                                                {r.remittanceNumber}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {fmtDate(r.paidAt)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {statusBadge(r.status)}
                                            <span className="text-sm font-semibold">
                                                {formatRupiah(
                                                    num(r.totalAmount),
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {r.items.map((it) => (
                                            <Badge
                                                key={it.id}
                                                variant="secondary"
                                                className="text-[10px] font-normal"
                                            >
                                                {it.purchaseInvoice
                                                    ?.invoiceNumber ??
                                                    it.purchaseInvoiceId}{' '}
                                                — {formatRupiah(num(it.amount))}
                                                {it.proofUrl && (
                                                    <a
                                                        href={it.proofUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="ml-1 underline"
                                                    >
                                                        bukti
                                                    </a>
                                                )}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <CreatePurchaseRemittanceDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                invoices={invoices}
                paymentBanks={paymentBanks}
                onCreated={() => void refresh()}
            />
        </div>
    );
}
