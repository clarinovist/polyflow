'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AttendanceLoadError } from './AttendanceLoadError';
import { StaleClosureRowsTable } from './StaleClosureRowsTable';
import {
    StaleClosureSubtotals,
    StaleClosureTotals,
} from './StaleClosureSummary';
import { formatIdr } from './attendance-format';
import type { ClosurePreview } from './stale-closure-types';
import type { ClosurePhase } from './useStaleClosure';

const TITLE = 'Pratinjau koreksi jam pulang';
const DESCRIPTION =
    'Periksa angka di bawah. Koreksi ini mengisi jam pulang sesi yang lupa pulang dan mengubah upah karyawan. Tidak ada yang disimpan sebelum Anda menerapkannya.';
const CONFIRM_TEXT = 'Saya mengerti koreksi ini mengubah upah karyawan';
const NONE_ELIGIBLE_TEXT =
    'Tidak ada sesi yang layak ditutup. Tutup sesi ini satu per satu lewat Koreksi jam.';

interface Props {
    phase: ClosurePhase;
    onClose: () => void;
    onApply: () => void;
    onRetry: () => void;
}

interface BodyProps {
    preview: ClosurePreview;
    isBusy: boolean;
    applyError: string | null;
    isOutdated: boolean;
    onClose: () => void;
    onApply: () => void;
    onRetry: () => void;
}

function PreviewBody({
    preview,
    isBusy,
    applyError,
    isOutdated,
    onClose,
    onApply,
    onRetry,
}: BodyProps) {
    const [isConfirmed, setIsConfirmed] = useState(false);
    const hasEligible = preview.totals.eligibleCount > 0;
    const canApply = isConfirmed && hasEligible && !isBusy && !isOutdated;

    return (
        <>
            <StaleClosureTotals preview={preview} />
            <StaleClosureRowsTable rows={preview.rows} />
            <StaleClosureSubtotals preview={preview} />
            {!hasEligible && (
                <p className="text-sm text-muted-foreground">
                    {NONE_ELIGIBLE_TEXT}
                </p>
            )}
            <div className="flex items-start gap-2">
                <Checkbox
                    id="closure-confirm"
                    checked={isConfirmed}
                    disabled={isBusy}
                    onCheckedChange={(v) => setIsConfirmed(v === true)}
                />
                <Label
                    htmlFor="closure-confirm"
                    className="items-start leading-snug"
                >
                    {CONFIRM_TEXT}
                </Label>
            </div>
            {applyError && (
                <p role="alert" className="text-sm text-destructive">
                    {applyError}
                </p>
            )}
            <DialogFooter>
                <Button
                    type="button"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={onClose}
                >
                    Batal
                </Button>
                {isOutdated && (
                    <Button type="button" variant="outline" onClick={onRetry}>
                        Buat pratinjau ulang
                    </Button>
                )}
                <Button type="button" disabled={!canApply} onClick={onApply}>
                    {isBusy ? 'Memproses…' : 'Terapkan koreksi'}
                </Button>
            </DialogFooter>
        </>
    );
}

function DoneBody({
    phase,
    onClose,
}: {
    phase: Extract<ClosurePhase, { status: 'done' }>;
    onClose: () => void;
}) {
    const { result } = phase;
    return (
        <>
            <div className="space-y-1 text-sm" role="status">
                <p className="font-semibold">
                    {result.closedCount} sesi ditutup
                </p>
                <p>Upah ditambahkan: {formatIdr(result.earningsAdded)}</p>
                {result.skippedCount > 0 && (
                    <p className="text-amber-600">
                        {result.skippedCount} sesi dilewati
                    </p>
                )}
            </div>
            <DialogFooter>
                <Button type="button" onClick={onClose}>
                    Selesai
                </Button>
            </DialogFooter>
        </>
    );
}

function PhaseContent({ phase, onClose, onApply, onRetry }: Props) {
    switch (phase.status) {
        case 'idle':
            return null;
        case 'loading':
            return (
                <p role="status" className="text-sm text-muted-foreground">
                    Membuat pratinjau koreksi…
                </p>
            );
        case 'error':
            return (
                <>
                    <AttendanceLoadError
                        message={phase.message}
                        onRetry={onRetry}
                    />
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Tutup
                        </Button>
                    </DialogFooter>
                </>
            );
        case 'done':
            return <DoneBody phase={phase} onClose={onClose} />;
        case 'ready':
        case 'applying':
            return (
                <PreviewBody
                    key={phase.preview.generatedAt}
                    preview={phase.preview}
                    isBusy={phase.status === 'applying'}
                    applyError={
                        phase.status === 'ready' ? phase.applyError : null
                    }
                    isOutdated={phase.status === 'ready' && phase.isOutdated}
                    onClose={onClose}
                    onApply={onApply}
                    onRetry={onRetry}
                />
            );
    }
}

/**
 * Dialog pratinjau koreksi massal. Tidak bisa ditutup (Esc/klik luar/Batal)
 * selama penerapan berjalan; menerapkan butuh centang konfirmasi.
 */
export function StaleClosurePreviewDialog(props: Props) {
    const { phase, onClose } = props;
    const isBusy = phase.status === 'applying';
    return (
        <Dialog
            open={phase.status !== 'idle'}
            onOpenChange={(open) => {
                if (!open && !isBusy) onClose();
            }}
        >
            <DialogContent
                mobileSheet
                showCloseButton={false}
                className="sm:max-w-4xl"
            >
                <DialogHeader>
                    <DialogTitle>{TITLE}</DialogTitle>
                    <DialogDescription>{DESCRIPTION}</DialogDescription>
                </DialogHeader>
                <PhaseContent {...props} />
            </DialogContent>
        </Dialog>
    );
}
