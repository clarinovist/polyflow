'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CloudOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { submitExpenseClaim } from '@/actions/sales/expense-claims';
import { useMobileConnectivity } from '@/hooks/use-mobile-connectivity';
import { CLAIM_DESCRIPTION_MAX_LENGTH } from '@/lib/sales/expense-claim';
import {
    CATEGORY_OPTIONS,
    buildSubmitInput,
    claimDateBounds,
    formatAmountInput,
    sanitizeAmountInput,
    todayWib,
    validateClaimDraft,
    type ClaimDraft,
    type ExpenseClaimCategoryValue,
} from '@/lib/sales/expense-claim-ui';
import {
    ReceiptUploadError,
    uploadExpenseReceipt,
} from '@/lib/sales/expense-receipt-upload';

export interface ClaimVisitContext {
    id: string;
    /** "Pelanggan, tanggal" when the visit is among the recent ones, else null. */
    label: string | null;
}

const OFFLINE_MESSAGE =
    'Anda sedang offline. Klaim nota hanya bisa dikirim saat online.';
const SUBMIT_FAILED_MESSAGE =
    'Gagal mengajukan klaim. Periksa koneksi lalu coba lagi.';
const UPLOAD_FAILED_MESSAGE = 'Gagal mengunggah nota. Cek koneksi.';

function emptyDraft(now: Date): ClaimDraft {
    return {
        receiptUrl: null,
        category: '',
        amountDigits: '',
        expenseDate: todayWib(now),
        description: '',
    };
}

export function NewClaimForm({ visit }: { visit: ClaimVisitContext | null }) {
    const router = useRouter();
    const { isOnline } = useMobileConnectivity();
    const photoInputRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState<ClaimDraft>(() =>
        emptyDraft(new Date()),
    );
    // One id per form session: a retried submit must not create a second claim.
    const [clientClaimId, setClientClaimId] = useState(() =>
        crypto.randomUUID(),
    );
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const bounds = claimDateBounds(new Date());
    const isBusy = uploading || submitting;
    const canSubmit = isOnline && !isBusy;

    const update = (patch: Partial<ClaimDraft>) =>
        setDraft((current) => ({ ...current, ...patch }));

    const handlePhotoSelect = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setError(null);
        setUploading(true);
        try {
            update({ receiptUrl: await uploadExpenseReceipt(file) });
        } catch (uploadError) {
            setError(
                uploadError instanceof ReceiptUploadError
                    ? uploadError.message
                    : UPLOAD_FAILED_MESSAGE,
            );
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSubmit) return;
        setSuccess(null);
        const problem = validateClaimDraft(draft, new Date());
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            const result = await submitExpenseClaim(
                buildSubmitInput(draft, {
                    clientClaimId,
                    salesVisitId: visit?.id,
                }),
            );
            if (!result.success) {
                setError(result.error);
                return;
            }
            setSuccess(
                `Klaim ${result.data.claimNumber} diajukan, menunggu persetujuan.`,
            );
            setDraft(emptyDraft(new Date()));
            setClientClaimId(crypto.randomUUID());
            router.refresh();
        } catch {
            setError(SUBMIT_FAILED_MESSAGE);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-4 rounded-2xl border bg-card p-4"
            aria-label="Form klaim nota"
        >
            <h2 className="text-base font-bold">Klaim nota</h2>

            {visit && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {visit.label
                        ? `Terkait kunjungan: ${visit.label}`
                        : 'Terkait kunjungan'}
                </p>
            )}

            {!isOnline && (
                <p
                    role="status"
                    className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
                >
                    <CloudOff className="h-4 w-4 shrink-0" />
                    {OFFLINE_MESSAGE}
                </p>
            )}

            <div className="space-y-2">
                <Label>Foto nota</Label>
                {draft.receiptUrl ? (
                    <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={draft.receiptUrl}
                            alt="Foto nota"
                            className="h-14 w-14 rounded object-cover"
                        />
                        <span className="flex-1 truncate text-xs text-muted-foreground">
                            Foto nota terunggah
                        </span>
                        <button
                            type="button"
                            aria-label="Hapus foto nota"
                            disabled={isBusy}
                            onClick={() => update({ receiptUrl: null })}
                            className="p-2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full"
                        disabled={uploading || !isOnline}
                        onClick={() => photoInputRef.current?.click()}
                    >
                        {uploading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Camera className="mr-2 h-4 w-4" />
                        )}
                        {uploading ? 'Mengunggah…' : 'Ambil foto nota'}
                    </Button>
                )}
                <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="Berkas foto nota"
                    onChange={handlePhotoSelect}
                    className="hidden"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="claim-category">Kategori</Label>
                <NativeSelect
                    id="claim-category"
                    value={draft.category}
                    onChange={(e) =>
                        update({
                            category: e.target.value as
                                | ExpenseClaimCategoryValue
                                | '',
                        })
                    }
                >
                    <option value="">Pilih kategori</option>
                    {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </NativeSelect>
            </div>

            <div className="space-y-2">
                <Label htmlFor="claim-amount">Nominal (Rp)</Label>
                <Input
                    id="claim-amount"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    className="text-right tabular-nums"
                    value={formatAmountInput(draft.amountDigits)}
                    onChange={(e) =>
                        update({
                            amountDigits: sanitizeAmountInput(e.target.value),
                        })
                    }
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="claim-date">Tanggal pengeluaran</Label>
                <Input
                    id="claim-date"
                    type="date"
                    min={bounds.min}
                    max={bounds.max}
                    value={draft.expenseDate}
                    onChange={(e) => update({ expenseDate: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="claim-description">Keterangan</Label>
                <Textarea
                    id="claim-description"
                    rows={3}
                    maxLength={CLAIM_DESCRIPTION_MAX_LENGTH}
                    placeholder="Contoh: bensin kunjungan ke toko"
                    value={draft.description}
                    onChange={(e) => update({ description: e.target.value })}
                />
                <p className="text-right text-xs text-muted-foreground">
                    {draft.description.length}/{CLAIM_DESCRIPTION_MAX_LENGTH}
                </p>
            </div>

            {error && (
                <p
                    role="alert"
                    className="text-sm font-medium text-destructive"
                >
                    {error}
                </p>
            )}
            {success && (
                <p
                    role="status"
                    className="text-sm font-medium text-emerald-700"
                >
                    {success}
                </p>
            )}

            <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
                {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Ajukan klaim
            </Button>
        </form>
    );
}
