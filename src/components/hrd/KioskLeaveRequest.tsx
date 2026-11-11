'use client';

import { useState } from 'react';
import { CalendarX, Loader2 } from 'lucide-react';
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
import { kioskRequestLeave } from '@/actions/admin/kiosk-leave';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { KioskPill } from '@/components/kiosk/ui/KioskPill';
import { KioskSegmented } from '@/components/kiosk/ui/KioskSegmented';
import {
    countLeaveDays,
    resolveLeavePreset,
    type LeavePreset,
} from '@/lib/hrd/leave-presets';
import { toBusinessDateString } from '@/lib/utils/timezone';

type Duration = LeavePreset | 'CUSTOM';
type ReasonCode = 'SICK' | 'FAMILY' | 'PERSONAL' | 'OTHER';
type ReasonChoice = ReasonCode | 'NONE';

const NOTE_MAX_LENGTH = 200;
const FALLBACK_ERROR = 'Gagal mengirim pengajuan. Coba lagi.';

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

const EMPTY_RANGE: DateRange = { startDate: '', endDate: '' };

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

interface Props {
    employee: { name: string; code: string } | null;
    pin: string;
    disabled?: boolean;
    onSubmitted: (result: { employeeName: string; days: number }) => void;
}

const DATE_INPUT_CLASS = 'h-14 text-lg';
const LABEL_CLASS = 'text-base font-semibold text-muted-foreground';

export function KioskLeaveRequest({
    employee,
    pin,
    disabled = false,
    onSubmitted,
}: Props) {
    const [open, setOpen] = useState(false);
    const [duration, setDuration] = useState<Duration>('TODAY');
    const [customRange, setCustomRange] = useState<DateRange>(EMPTY_RANGE);
    const [reason, setReason] = useState<ReasonChoice>('NONE');
    const [note, setNote] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const todayWib = toBusinessDateString(new Date());
    const range: DateRange =
        duration === 'CUSTOM'
            ? customRange
            : resolveLeavePreset(duration, todayWib);
    const summary = describeRange(range);
    const trimmedNote = note.trim();
    const needsNote = reason === 'OTHER' && trimmedNote === '';
    const canSubmit =
        !pending && reason !== 'NONE' && !needsNote && summary !== null;
    const canOpen = !!employee && pin.trim() !== '' && !disabled;

    const reset = () => {
        setDuration('TODAY');
        setCustomRange(EMPTY_RANGE);
        setReason('NONE');
        setNote('');
        setPending(false);
        setError(null);
    };

    const handleOpenChange = (next: boolean) => {
        if (next) reset();
        setOpen(next);
    };

    const pickDuration = (value: Duration) => {
        setDuration(value);
        if (value === 'CUSTOM' && !customRange.startDate) {
            setCustomRange({ startDate: todayWib, endDate: todayWib });
        }
    };

    const changeStart = (startDate: string) =>
        setCustomRange((prev) => ({
            startDate,
            endDate: prev.endDate < startDate ? startDate : prev.endDate,
        }));

    const submit = async () => {
        if (!canSubmit || !employee) return;
        setPending(true);
        setError(null);
        try {
            const result = await kioskRequestLeave(employee.code, pin, {
                startDate: range.startDate,
                endDate: range.endDate,
                reasonCode: reason,
                note: trimmedNote || undefined,
            });
            if (!result.success || !result.data) {
                setError(result.error || FALLBACK_ERROR);
                return;
            }
            setOpen(false);
            onSubmitted({
                employeeName: employee.name,
                days: result.data.days,
            });
        } catch (err) {
            setError(
                err instanceof Error && err.message
                    ? err.message
                    : FALLBACK_ERROR,
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="grid gap-3 border-t-2 border-border pt-4">
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogTrigger asChild>
                    <button
                        type="button"
                        className={kioskButton({
                            tone: 'info',
                            size: 'lg',
                            className: 'w-full',
                        })}
                        disabled={!canOpen}
                    >
                        <CalendarX aria-hidden="true" />
                        Ajukan Izin Tidak Masuk
                    </button>
                </DialogTrigger>
                <p className="text-center text-base text-muted-foreground">
                    Izin cukup nama + PIN, tanpa selfie.
                </p>
                <DialogContent mobileSheet showCloseButton={false}>
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-extrabold">
                            Ajukan Izin Tidak Masuk
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Pilih lama izin dan alasan, lalu kirim pengajuan.
                        </DialogDescription>
                        <div className="flex flex-wrap items-center justify-center gap-2 text-lg sm:justify-start">
                            <span className="text-muted-foreground">Untuk</span>
                            <KioskPill tone="neutral">
                                {employee?.name}
                            </KioskPill>
                        </div>
                    </DialogHeader>

                    <div className="grid gap-2">
                        <p className={LABEL_CLASS}>Berapa lama?</p>
                        <KioskSegmented
                            label="Berapa lama?"
                            options={DURATION_OPTIONS}
                            value={duration}
                            onChange={pickDuration}
                        />
                        {duration === 'CUSTOM' && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <label
                                        htmlFor="kiosk-leave-start"
                                        className={LABEL_CLASS}
                                    >
                                        Mulai tanggal
                                    </label>
                                    <Input
                                        id="kiosk-leave-start"
                                        type="date"
                                        min={todayWib}
                                        value={customRange.startDate}
                                        onChange={(e) =>
                                            changeStart(e.target.value)
                                        }
                                        className={DATE_INPUT_CLASS}
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <label
                                        htmlFor="kiosk-leave-end"
                                        className={LABEL_CLASS}
                                    >
                                        Sampai tanggal
                                    </label>
                                    <Input
                                        id="kiosk-leave-end"
                                        type="date"
                                        min={customRange.startDate || todayWib}
                                        value={customRange.endDate}
                                        onChange={(e) =>
                                            setCustomRange((prev) => ({
                                                ...prev,
                                                endDate: e.target.value,
                                            }))
                                        }
                                        className={DATE_INPUT_CLASS}
                                    />
                                </div>
                            </div>
                        )}
                        {summary && (
                            <p className="text-base text-muted-foreground">
                                {summary}
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <p className={LABEL_CLASS}>Alasan</p>
                        <KioskSegmented<ReasonChoice>
                            label="Alasan"
                            options={REASON_OPTIONS}
                            value={reason}
                            onChange={setReason}
                        />
                        <label htmlFor="kiosk-leave-note" className="sr-only">
                            Keterangan
                        </label>
                        <Input
                            id="kiosk-leave-note"
                            value={note}
                            maxLength={NOTE_MAX_LENGTH}
                            placeholder={
                                reason === 'OTHER'
                                    ? 'Keterangan (wajib)'
                                    : 'Keterangan tambahan (boleh kosong)'
                            }
                            onChange={(e) => setNote(e.target.value)}
                            className="h-14 text-lg"
                        />
                    </div>

                    {error && (
                        <p
                            role="alert"
                            className="rounded-xl bg-kiosk-stop-soft p-3 text-base font-semibold text-kiosk-stop-ink"
                        >
                            {error}
                        </p>
                    )}

                    <DialogFooter>
                        <button
                            type="button"
                            className={kioskButton({
                                tone: 'neutral',
                                size: 'lg',
                            })}
                            onClick={() => setOpen(false)}
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            className={kioskButton({ tone: 'go', size: 'lg' })}
                            onClick={() => void submit()}
                            disabled={!canSubmit}
                        >
                            {pending && (
                                <Loader2
                                    aria-hidden="true"
                                    className="animate-spin"
                                />
                            )}
                            Kirim Pengajuan
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
