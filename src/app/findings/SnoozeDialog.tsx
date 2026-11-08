'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    daysFromToday,
    isSnoozeNoteValid,
    snoozeDateBounds,
} from '@/lib/findings/snooze-days';

export type SnoozeTarget = {
    ids: readonly string[];
    label: string;
};

type SnoozeDialogProps = {
    target: SnoozeTarget | null;
    isBusy: boolean;
    onCancel: () => void;
    onConfirm: (days: number, note: string) => void;
};

/**
 * Snooze needs a wake-up date and a reason ("customer janji bayar tgl 15"):
 * every detector is a condition detector, so snooze is the only manual way to
 * set a finding aside. The date is converted to whole days for snoozeFinding.
 */
export function SnoozeDialog({
    target,
    isBusy,
    onCancel,
    onConfirm,
}: SnoozeDialogProps) {
    const [date, setDate] = useState('');
    const [note, setNote] = useState('');
    const now = new Date();
    const bounds = snoozeDateBounds(now);
    const days = daysFromToday(date, now);
    const canSubmit = days !== null && isSnoozeNoteValid(note) && !isBusy;

    return (
        <Dialog
            open={target !== null}
            onOpenChange={(open) => {
                if (!open) onCancel();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Tunda temuan</DialogTitle>
                    <DialogDescription>
                        {target?.label}
                        {target && target.ids.length > 1
                            ? ` (${target.ids.length} temuan)`
                            : ''}
                        . Temuan muncul lagi setelah tanggal ini bila kondisinya
                        belum beres.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="snooze-date">Tunda sampai</Label>
                        <Input
                            id="snooze-date"
                            type="date"
                            min={bounds.min}
                            max={bounds.max}
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Maksimal 14 hari dari hari ini.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="snooze-note">Catatan (wajib)</Label>
                        <Textarea
                            id="snooze-note"
                            rows={3}
                            maxLength={500}
                            placeholder="Contoh: customer janji bayar tanggal 15"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onCancel}>
                        Batal
                    </Button>
                    <Button
                        disabled={!canSubmit}
                        onClick={() => {
                            if (days === null) return;
                            onConfirm(days, note.trim());
                        }}
                    >
                        Tunda
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
