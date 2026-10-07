'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    CheckCircle2,
    ClipboardCheck,
    Play,
    RotateCcw,
    ShieldCheck,
    XCircle,
} from 'lucide-react';
import {
    approveMaintenanceRequest,
    completeMaintenanceRequest,
    rejectMaintenanceRequest,
    startMaintenanceRequest,
    submitMaintenanceRequest,
} from '@/actions/production/maintenance';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type MaintenanceDecisionAction = (
    id: string,
    value: string,
) => Promise<ActionResult>;

interface MaintenanceActionProps {
    id: string;
    status: string;
    viewer: {
        canSubmit: boolean;
        canApprove: boolean;
        canReject: boolean;
        canStart: boolean;
        canComplete: boolean;
    };
    technicians: Array<{ id: string; name: string }>;
    spareParts: Array<{
        id: string;
        name: string;
        fulfilled: boolean;
        productVariantId?: string | null;
    }>;
    approveAction?: MaintenanceDecisionAction;
    rejectAction?: MaintenanceDecisionAction;
}

type ActionResult = { success: boolean; error?: string };

const WAITING_COPY: Record<string, string> = {
    PENDING: 'Menunggu keputusan Admin atau Kepala Pabrik.',
    APPROVED: 'Menunggu teknisi yang ditunjuk memulai pekerjaan.',
    IN_PROGRESS: 'Pekerjaan sedang berjalan dan menunggu catatan penyelesaian.',
    DONE: 'Pekerjaan telah selesai dan tidak memerlukan tindakan lagi.',
    REJECTED: 'Laporan ditutup karena ditolak.',
    CANCELLED: 'Laporan telah dibatalkan.',
};

export function MaintenanceActions({
    id,
    status,
    viewer,
    technicians,
    spareParts,
    approveAction = approveMaintenanceRequest,
    rejectAction = rejectMaintenanceRequest,
}: MaintenanceActionProps) {
    const router = useRouter();
    const [note, setNote] = useState('');
    const [assigneeId, setAssigneeId] = useState('');
    const [checked, setChecked] = useState<string[]>(
        spareParts.filter((part) => part.fulfilled).map((part) => part.id),
    );
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');
    const [busyAction, setBusyAction] = useState<string | null>(null);

    const run = async (
        actionKey: string,
        action: () => Promise<ActionResult>,
        success: string,
    ) => {
        if (busyAction) return;
        setBusyAction(actionKey);
        setMessage('');
        try {
            const result = await action();
            setMessageType(result.success ? 'success' : 'error');
            setMessage(result.success ? success : result.error || 'Tindakan gagal.');
            if (result.success) router.refresh();
        } catch (error) {
            setMessageType('error');
            setMessage(
                error instanceof Error ? error.message : 'Tindakan gagal.',
            );
        } finally {
            setBusyAction(null);
        }
    };

    const togglePart = (partId: string, checkedState: boolean) => {
        setChecked((current) =>
            checkedState
                ? [...new Set([...current, partId])]
                : current.filter((value) => value !== partId),
        );
    };

    const hasAction = Object.values(viewer).some(Boolean);

    return (
        <section
            aria-labelledby="maintenance-actions-title"
            className="rounded-xl border bg-card p-5 shadow-sm"
        >
            <div className="mb-4 flex items-start gap-3">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                </div>
                <div>
                    <h2
                        id="maintenance-actions-title"
                        className="font-semibold"
                    >
                        Tindakan berikutnya
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {hasAction
                            ? 'Selesaikan langkah aktif tanpa meninggalkan halaman.'
                            : WAITING_COPY[status] ||
                              'Tidak ada tindakan untuk status ini.'}
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {viewer.canSubmit && (
                    <Button
                        disabled={!!busyAction}
                        className="min-h-11 w-full bg-emerald-700 hover:bg-emerald-800"
                        onClick={() =>
                            run(
                                'submit',
                                () => submitMaintenanceRequest(id),
                                'Laporan berhasil dikirim untuk persetujuan.',
                            )
                        }
                    >
                        <RotateCcw className="h-4 w-4" />
                        {busyAction === 'submit'
                            ? 'Mengirim...'
                            : 'Kirim ulang laporan'}
                    </Button>
                )}

                {viewer.canApprove && (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="maintenance-assignee">
                                Teknisi pelaksana
                            </Label>
                            <select
                                id="maintenance-assignee"
                                value={assigneeId}
                                onChange={(event) =>
                                    setAssigneeId(event.target.value)
                                }
                                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                            >
                                <option value="">Pilih teknisi aktif...</option>
                                {technicians.map((technician) => (
                                    <option
                                        key={technician.id}
                                        value={technician.id}
                                    >
                                        {technician.name}
                                    </option>
                                ))}
                            </select>
                            {!technicians.length && (
                                <p className="text-xs text-destructive">
                                    Belum ada akun aktif dengan akses Produksi.
                                </p>
                            )}
                        </div>
                        <Button
                            disabled={!!busyAction || !assigneeId}
                            className="min-h-11 w-full bg-emerald-700 hover:bg-emerald-800"
                            onClick={() =>
                                run(
                                    'approve',
                                    () => approveAction(id, assigneeId),
                                    'Pekerjaan disetujui dan teknisi ditunjuk.',
                                )
                            }
                        >
                            <ClipboardCheck className="h-4 w-4" />
                            {busyAction === 'approve'
                                ? 'Menyetujui...'
                                : 'Setujui & tugaskan'}
                        </Button>
                    </div>
                )}

                {viewer.canReject && (
                    <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="maintenance-rejection">
                            Alasan penolakan
                        </Label>
                        <Textarea
                            id="maintenance-rejection"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Jelaskan alasan agar pelapor dapat menindaklanjuti."
                            rows={3}
                        />
                        <Button
                            variant="destructive"
                            disabled={!!busyAction || !note.trim()}
                            className="min-h-11 w-full"
                            onClick={() =>
                                run(
                                    'reject',
                                    () => rejectAction(id, note),
                                    'Laporan ditolak.',
                                )
                            }
                        >
                            <XCircle className="h-4 w-4" />
                            {busyAction === 'reject'
                                ? 'Menolak...'
                                : 'Tolak laporan'}
                        </Button>
                    </div>
                )}

                {viewer.canStart && (
                    <Button
                        disabled={!!busyAction}
                        className="min-h-11 w-full bg-emerald-700 hover:bg-emerald-800"
                        onClick={() =>
                            run(
                                'start',
                                () => startMaintenanceRequest(id),
                                'Pengerjaan dimulai.',
                            )
                        }
                    >
                        <Play className="h-4 w-4" />
                        {busyAction === 'start'
                            ? 'Memulai...'
                            : 'Mulai kerjakan'}
                    </Button>
                )}

                {viewer.canComplete && (
                    <div className="space-y-4">
                        {spareParts.length > 0 && (
                            <fieldset className="space-y-2 rounded-lg border p-3">
                                <legend className="px-1 text-sm font-semibold">
                                    Spare part yang terpasang
                                </legend>
                                <p className="text-xs text-muted-foreground">
                                    Centang part yang benar-benar terpasang. Part katalog juga akan dipotong dari stok.
                                </p>
                                {spareParts.map((part) => {
                                    const isManual = !part.productVariantId;
                                    return (
                                        <div
                                            key={part.id}
                                            className="flex min-h-11 items-center gap-3"
                                        >
                                            <Checkbox
                                                id={'part-' + part.id}
                                                checked={checked.includes(part.id)}
                                                onCheckedChange={(value) =>
                                                    togglePart(
                                                        part.id,
                                                        value === true,
                                                    )
                                                }
                                            />
                                            <Label
                                                htmlFor={'part-' + part.id}
                                                className="flex-1 font-normal"
                                            >
                                                {part.name}
                                                {isManual && (
                                                    <span className="ml-1 text-xs text-muted-foreground">
                                                        (catatan manual; tidak memotong stok)
                                                    </span>
                                                )}
                                            </Label>
                                        </div>
                                    );
                                })}
                            </fieldset>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="maintenance-completion">
                                Hasil perbaikan
                            </Label>
                            <Textarea
                                id="maintenance-completion"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="Contoh: bearing diganti, mesin diuji 20 menit dan kembali normal."
                                rows={4}
                            />
                        </div>
                        <Button
                            disabled={!!busyAction || !note.trim()}
                            className="min-h-11 w-full bg-emerald-700 hover:bg-emerald-800"
                            onClick={() =>
                                run(
                                    'complete',
                                    () =>
                                        completeMaintenanceRequest(
                                            id,
                                            note,
                                            checked,
                                        ),
                                    'Maintenance selesai. Ringkasan telah dikirim.',
                                )
                            }
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            {busyAction === 'complete'
                                ? 'Menyelesaikan...'
                                : 'Tandai selesai'}
                        </Button>
                    </div>
                )}

                {message && (
                    <Alert
                        variant={
                            messageType === 'error' ? 'destructive' : 'default'
                        }
                        aria-live="polite"
                        className={
                            messageType === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : undefined
                        }
                    >
                        <AlertDescription>{message}</AlertDescription>
                    </Alert>
                )}
            </div>
        </section>
    );
}
