'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarX, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createMyLeaveRequest } from '@/actions/employee/leave';
import {
    countLeaveDays,
    resolveLeavePreset,
    type LeavePreset,
} from '@/lib/hrd/leave-presets';
import { toBusinessDateString } from '@/lib/utils/timezone';

type Duration = LeavePreset | 'CUSTOM';
type ReasonCode = 'SICK' | 'FAMILY' | 'PERSONAL' | 'OTHER';

const NOTE_MAX_LENGTH = 200;

const DURATION_OPTIONS: ReadonlyArray<{ value: Duration; label: string }> = [
    { value: 'TODAY', label: 'Hari ini' },
    { value: 'TOMORROW', label: 'Besok' },
    { value: 'WEEK', label: '1 minggu' },
    { value: 'MONTH', label: '1 bulan' },
    { value: 'CUSTOM', label: 'Pilih tanggal' },
];

const REASON_OPTIONS: ReadonlyArray<{ value: ReasonCode; label: string }> = [
    { value: 'SICK', label: 'Sakit' },
    { value: 'FAMILY', label: 'Keperluan keluarga' },
    { value: 'PERSONAL', label: 'Urusan pribadi' },
    { value: 'OTHER', label: 'Lainnya' },
];

interface DateRange {
    startDate: string;
    endDate: string;
}

function formatDay(isoDate: string, withWeekday: boolean): string {
    return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('id-ID', {
        weekday: withWeekday ? 'long' : undefined,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function isValidRange({ startDate, endDate }: DateRange): boolean {
    return Boolean(startDate) && Boolean(endDate) && endDate >= startDate;
}

function describeRange(range: DateRange): string | null {
    if (!isValidRange(range)) return null;
    const days = countLeaveDays(range.startDate, range.endDate);
    if (days <= 1) return `${formatDay(range.startDate, true)} · 1 hari`;
    return `${formatDay(range.startDate, false)} – ${formatDay(range.endDate, false)} · ${days} hari`;
}

interface ChipProps<T extends string> {
    options: ReadonlyArray<{ value: T; label: string }>;
    selected: T | null;
    onSelect: (value: T) => void;
}

function ChipGroup<T extends string>({ options, selected, onSelect }: ChipProps<T>) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.map((o) => (
                <Button
                    key={o.value}
                    type="button"
                    size="sm"
                    variant={selected === o.value ? 'default' : 'outline'}
                    aria-pressed={selected === o.value}
                    onClick={() => onSelect(o.value)}
                >
                    {o.label}
                </Button>
            ))}
        </div>
    );
}

export function LeaveRequestSheet() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [duration, setDuration] = useState<Duration>('TODAY');
    const [customRange, setCustomRange] = useState<DateRange>({
        startDate: '',
        endDate: '',
    });
    const [reason, setReason] = useState<ReasonCode | null>(null);
    const [note, setNote] = useState('');
    const [pending, startTransition] = useTransition();

    const todayWib = toBusinessDateString(new Date());
    const range: DateRange =
        duration === 'CUSTOM' ? customRange : resolveLeavePreset(duration, todayWib);
    const summary = describeRange(range);
    const trimmedNote = note.trim();
    const needsNote = reason === 'OTHER' && trimmedNote === '';
    const canSubmit = !pending && reason !== null && !needsNote && summary !== null;

    const reset = () => {
        setDuration('TODAY');
        setCustomRange({ startDate: '', endDate: '' });
        setReason(null);
        setNote('');
    };

    const submit = () => {
        if (!canSubmit || reason === null) return;
        startTransition(async () => {
            const result = await createMyLeaveRequest({
                startDate: range.startDate,
                endDate: range.endDate,
                reasonCode: reason,
                note: trimmedNote || undefined,
            });
            if (!result.success) {
                toast.error(result.error ?? 'Gagal mengirim pengajuan');
                return;
            }
            toast.success('Pengajuan izin terkirim');
            setOpen(false);
            reset();
            router.refresh();
        });
    };

    const pickDuration = (value: Duration) => {
        setDuration(value);
        if (value === 'CUSTOM' && !customRange.startDate) {
            setCustomRange({ startDate: todayWib, endDate: todayWib });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-11">
                    <CalendarX className="h-4 w-4 mr-2" aria-hidden="true" />
                    Tidak bisa masuk? Ajukan Izin
                </Button>
            </DialogTrigger>
            <DialogContent mobileSheet>
                <DialogHeader>
                    <DialogTitle>Ajukan Izin Tidak Masuk</DialogTitle>
                    <DialogDescription>
                        Pilih lama dan alasan. Atasan akan menyetujui.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <p className="text-sm font-medium">Berapa lama?</p>
                    <ChipGroup
                        options={DURATION_OPTIONS}
                        selected={duration}
                        onSelect={pickDuration}
                    />
                    {duration === 'CUSTOM' && (
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label htmlFor="leave-start">Mulai</Label>
                                <Input
                                    id="leave-start"
                                    type="date"
                                    min={todayWib}
                                    value={customRange.startDate}
                                    onChange={(e) =>
                                        setCustomRange({
                                            startDate: e.target.value,
                                            endDate:
                                                customRange.endDate < e.target.value
                                                    ? e.target.value
                                                    : customRange.endDate,
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="leave-end">Selesai</Label>
                                <Input
                                    id="leave-end"
                                    type="date"
                                    min={customRange.startDate || todayWib}
                                    value={customRange.endDate}
                                    onChange={(e) =>
                                        setCustomRange({
                                            ...customRange,
                                            endDate: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    )}
                    {summary && (
                        <div className="bg-muted rounded-md p-3 text-sm">
                            {summary}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-medium">Alasan</p>
                    <ChipGroup
                        options={REASON_OPTIONS}
                        selected={reason}
                        onSelect={setReason}
                    />
                    <Label htmlFor="leave-note" className="sr-only">
                        Keterangan tambahan
                    </Label>
                    <Input
                        id="leave-note"
                        value={note}
                        maxLength={NOTE_MAX_LENGTH}
                        placeholder={
                            reason === 'OTHER'
                                ? 'Keterangan (wajib)'
                                : 'Keterangan tambahan (boleh kosong)'
                        }
                        onChange={(e) => setNote(e.target.value)}
                    />
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Batal
                    </Button>
                    <Button type="button" onClick={submit} disabled={!canSubmit}>
                        {pending && (
                            <Loader2
                                className="h-4 w-4 mr-2 animate-spin"
                                aria-hidden="true"
                            />
                        )}
                        Kirim Pengajuan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
