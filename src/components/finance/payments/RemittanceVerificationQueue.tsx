'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { formatRupiah, toDecimalNumber } from '@/lib/utils/utils';
import {
    verifyRemittanceAction,
    rejectRemittanceAction,
    listRemittancesForVerificationAction,
} from '@/actions/sales/collection';
import { toast } from 'sonner';
import { Loader2, FileText, Check, X } from 'lucide-react';

type RemittanceItemRow = {
    id: string;
    invoiceId: string;
    amount: number | string | { toNumber?: () => number };
    method: string;
    referenceNumber?: string | null;
    proofUrl?: string | null;
    proofOriginalName?: string | null;
    proofMimeType?: string | null;
    invoice?: { invoiceNumber?: string } | null;
};

export type RemittanceQueueRow = {
    id: string;
    remittanceNumber: string;
    collectedAt: string | Date;
    totalAmount: number | string | { toNumber?: () => number };
    status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    notes?: string | null;
    user?: { id: string; name?: string | null } | null;
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

function isImage(mimeType?: string | null) {
    return mimeType?.startsWith('image/') ?? false;
}

interface RemittanceVerificationQueueProps {
    initialRemittances: RemittanceQueueRow[];
}

export function RemittanceVerificationQueue({
    initialRemittances,
}: RemittanceVerificationQueueProps) {
    const [remittances, setRemittances] =
        useState<RemittanceQueueRow[]>(initialRemittances);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const refresh = async () => {
        try {
            const res = await listRemittancesForVerificationAction({
                status: 'PENDING',
            });
            if (res?.success && res.data) {
                setRemittances(res.data as unknown as RemittanceQueueRow[]);
            }
        } catch {
            toast.error('Gagal memuat ulang antrian setoran');
        }
    };

    const handleVerify = async (remittanceId: string) => {
        setProcessingId(remittanceId);
        try {
            const result = await verifyRemittanceAction({ remittanceId });
            if (result.success) {
                const data = result.data as {
                    successCount?: number;
                    failedCount?: number;
                } | null;
                if (data?.failedCount && data.failedCount > 0) {
                    toast.warning(
                        `Setoran diverifikasi sebagian: ${data.successCount} sukses, ${data.failedCount} gagal. Cek catatan setoran.`,
                    );
                } else {
                    toast.success('Setoran diverifikasi & pembayaran dicatat.');
                }
                await refresh();
            } else {
                toast.error(result.error || 'Gagal memverifikasi setoran.');
            }
        } catch {
            toast.error('Gagal memproses verifikasi.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (remittanceId: string) => {
        if (!rejectReason.trim()) {
            toast.error('Alasan penolakan wajib diisi');
            return;
        }
        setProcessingId(remittanceId);
        try {
            const result = await rejectRemittanceAction({
                remittanceId,
                reason: rejectReason.trim(),
            });
            if (result.success) {
                toast.success('Setoran ditolak.');
                setRejectingId(null);
                setRejectReason('');
                await refresh();
            } else {
                toast.error(result.error || 'Gagal menolak setoran.');
            }
        } catch {
            toast.error('Gagal memproses penolakan.');
        } finally {
            setProcessingId(null);
        }
    };

    if (remittances.length === 0) {
        return (
            <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Tidak ada setoran yang menunggu verifikasi.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            {remittances.map((r) => (
                <Card key={r.id}>
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <CardTitle className="text-sm">
                                    {r.remittanceNumber}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    {fmtDate(r.collectedAt)} — diajukan oleh{' '}
                                    {r.user?.name ?? r.user?.id ?? '-'}
                                </p>
                            </div>
                            <span className="text-sm font-semibold">
                                {formatRupiah(num(r.totalAmount))}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-3">
                        <div className="space-y-2">
                            {r.items.map((it) => (
                                <div
                                    key={it.id}
                                    className="flex items-center gap-3 rounded-md border p-2 text-sm"
                                >
                                    {it.proofUrl ? (
                                        isImage(it.proofMimeType) ? (
                                            <a
                                                href={it.proofUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={it.proofUrl}
                                                    alt={
                                                        it.proofOriginalName ||
                                                        'Bukti transfer'
                                                    }
                                                    className="h-12 w-12 rounded object-cover border"
                                                />
                                            </a>
                                        ) : (
                                            <a
                                                href={it.proofUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex h-12 w-12 items-center justify-center rounded border text-muted-foreground"
                                            >
                                                <FileText className="h-5 w-5" />
                                            </a>
                                        )
                                    ) : (
                                        <div className="flex h-12 w-12 items-center justify-center rounded border text-muted-foreground text-[9px] text-center">
                                            Tanpa bukti
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">
                                            {it.invoice?.invoiceNumber ??
                                                it.invoiceId}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {it.method}
                                            {it.referenceNumber
                                                ? ` — ${it.referenceNumber}`
                                                : ''}
                                        </p>
                                    </div>
                                    <span className="font-mono text-xs shrink-0">
                                        {formatRupiah(num(it.amount))}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {rejectingId === r.id ? (
                            <div className="space-y-2">
                                <Textarea
                                    placeholder="Alasan penolakan (wajib)"
                                    value={rejectReason}
                                    onChange={(e) =>
                                        setRejectReason(e.target.value)
                                    }
                                    rows={2}
                                />
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={processingId === r.id}
                                        onClick={() => {
                                            setRejectingId(null);
                                            setRejectReason('');
                                        }}
                                    >
                                        Batal
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        disabled={processingId === r.id}
                                        onClick={() => handleReject(r.id)}
                                    >
                                        {processingId === r.id ? (
                                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <X className="mr-1 h-3.5 w-3.5" />
                                        )}
                                        Konfirmasi Tolak
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={processingId === r.id}
                                    onClick={() => setRejectingId(r.id)}
                                >
                                    Tolak
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={processingId === r.id}
                                    onClick={() => handleVerify(r.id)}
                                >
                                    {processingId === r.id ? (
                                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Check className="mr-1 h-3.5 w-3.5" />
                                    )}
                                    Verifikasi
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
