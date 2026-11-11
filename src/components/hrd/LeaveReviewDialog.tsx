'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export type LeaveReviewMode = 'approve' | 'reject';

export interface LeaveReviewTarget {
    id: string;
    employeeName: string;
    startDate: string | Date;
    endDate: string | Date;
}

interface LeaveReviewDialogProps {
    target: LeaveReviewTarget | null;
    mode: LeaveReviewMode;
    isBusy: boolean;
    onConfirm: (notes: string) => void;
    onCancel: () => void;
}

const COPY: Record<
    LeaveReviewMode,
    { title: string; action: string; label: string }
> = {
    approve: {
        title: 'Setujui Pengajuan',
        action: 'Setujui',
        label: 'Catatan (opsional)',
    },
    reject: {
        title: 'Tolak Pengajuan',
        action: 'Tolak',
        label: 'Alasan penolakan (wajib)',
    },
};

function formatRange(start: string | Date, end: string | Date): string {
    const from = format(new Date(start), 'dd MMM', { locale: idLocale });
    const to = format(new Date(end), 'dd MMM yyyy', { locale: idLocale });
    return `${from} – ${to}`;
}

function ReviewForm({
    target,
    mode,
    isBusy,
    onConfirm,
    onCancel,
}: LeaveReviewDialogProps & { target: LeaveReviewTarget }) {
    const [notes, setNotes] = useState('');
    const copy = COPY[mode];
    const isNoteMissing = mode === 'reject' && notes.trim() === '';

    return (
        <>
            <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>
                    {target.employeeName} ·{' '}
                    {formatRange(target.startDate, target.endDate)}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
                <Label
                    htmlFor="leave-review-notes"
                    className="text-xs font-semibold"
                >
                    {copy.label}
                </Label>
                <Textarea
                    id="leave-review-notes"
                    rows={3}
                    value={notes}
                    disabled={isBusy}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
            <DialogFooter>
                <Button
                    type="button"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={onCancel}
                >
                    Batal
                </Button>
                <Button
                    type="button"
                    variant={mode === 'reject' ? 'destructive' : 'default'}
                    disabled={isBusy || isNoteMissing}
                    onClick={() => onConfirm(notes.trim())}
                >
                    {isBusy ? 'Memproses…' : copy.action}
                </Button>
            </DialogFooter>
        </>
    );
}

export function LeaveReviewDialog(props: LeaveReviewDialogProps) {
    const { target, mode, isBusy, onCancel } = props;
    return (
        <Dialog
            open={target !== null}
            onOpenChange={(open) => {
                if (!open && !isBusy) onCancel();
            }}
        >
            <DialogContent mobileSheet showCloseButton={false}>
                {target && (
                    <ReviewForm
                        key={`${target.id}-${mode}`}
                        {...props}
                        target={target}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
