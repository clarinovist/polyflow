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
import { Plus } from 'lucide-react';

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

interface PurchaseRemittanceEntryPointProps {
    invoices: PurchaseInvoice[];
    paymentBanks?: TenantPaymentBanks;
    initialRemittances?: RemittanceRow[];
}

export function PurchaseRemittanceEntryPoint({
    invoices,
    paymentBanks = {},
    initialRemittances = [],
}: PurchaseRemittanceEntryPointProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [remittances, setRemittances] =
        useState<RemittanceRow[]>(initialRemittances);
    const canSubmit = invoices.length > 0;

    const refresh = useCallback(async () => {
        try {
            const res = await listPurchaseRemittancesAction({});
            if (res?.success && res.data) {
                setRemittances(res.data as unknown as RemittanceRow[]);
            }
        } catch {
            toast.error('Gagal memuat ulang daftar setoran');
        }
    }, []);

    return (
        <div className="space-y-3">
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
