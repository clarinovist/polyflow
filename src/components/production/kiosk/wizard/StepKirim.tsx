import { useState } from 'react';
import { AlertTriangle, Camera, Loader2, NotebookPen } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { formatShiftOptionLabel } from '@/lib/production/shift-label';
import { cn } from '@/lib/utils/utils';
import { CameraCapture } from '@/components/ui/camera-capture';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';

interface ShiftOption {
    id: string;
    shiftName: string;
    startTime: Date | string;
    endTime: Date | string;
}

interface StepKirimProps {
    shifts: ShiftOption[];
    /** Chosen or auto-selected shift id; '' when none. */
    shiftId: string;
    onShiftChange: (id: string) => void;
    hasActiveShift: boolean;
    operatorName: string;
    helperCount: number;
    notes: string;
    onNotesChange: (value: string) => void;
    onPhoto: (file: File | null) => void;
    isUploadingPhoto: boolean;
    disabled: boolean;
}

/** Shift, team and optional evidence before the entry is sent. */
export function StepKirim({
    shifts,
    shiftId,
    onShiftChange,
    hasActiveShift,
    operatorName,
    helperCount,
    notes,
    onNotesChange,
    onPhoto,
    isUploadingPhoto,
    disabled,
}: StepKirimProps) {
    const [showPhoto, setShowPhoto] = useState(false);
    const [showNotes, setShowNotes] = useState(Boolean(notes));

    return (
        <div className="grid content-start gap-4 rounded-2xl border-2 border-border bg-card p-4">
            <section className="grid gap-2">
                <h3 className="text-base font-semibold text-muted-foreground">
                    {kioskLabels.shift}
                </h3>
                {shifts.length === 0 ? (
                    <p className="flex items-start gap-2 rounded-xl bg-kiosk-stop-soft p-3 text-base text-kiosk-stop-ink">
                        <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 size-5 shrink-0"
                        />
                        {kioskLabels.wizardNoShift}
                    </p>
                ) : (
                    <>
                        {!hasActiveShift && (
                            <p className="flex items-start gap-2 rounded-xl bg-kiosk-warn-soft p-3 text-base text-kiosk-warn-ink">
                                <AlertTriangle
                                    aria-hidden="true"
                                    className="mt-0.5 size-5 shrink-0"
                                />
                                {kioskLabels.wizardShiftStale}
                            </p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-2">
                            {shifts.map((shift) => (
                                <button
                                    key={shift.id}
                                    type="button"
                                    aria-pressed={shift.id === shiftId}
                                    onClick={() => onShiftChange(shift.id)}
                                    className={cn(
                                        kioskButton({
                                            className:
                                                'h-auto justify-start py-2 text-left',
                                        }),
                                        shift.id === shiftId &&
                                            'border-kiosk-go bg-kiosk-go-soft text-kiosk-go-ink',
                                    )}
                                >
                                    {formatShiftOptionLabel(shift)}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </section>

            <p className="border-t pt-3 text-lg">
                <span className="text-muted-foreground">
                    {kioskLabels.wizardTeam}:
                </span>{' '}
                <span className="font-bold">{operatorName}</span>
                {helperCount > 0 &&
                    ` + ${helperCount} ${kioskLabels.wizardHelpers}`}
            </p>

            <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
                <button
                    type="button"
                    aria-expanded={showPhoto}
                    className={kioskButton()}
                    onClick={() => setShowPhoto((value) => !value)}
                >
                    <Camera aria-hidden="true" />
                    {kioskLabels.wizardPhotoAdd}
                </button>
                <button
                    type="button"
                    aria-expanded={showNotes}
                    className={kioskButton()}
                    onClick={() => setShowNotes((value) => !value)}
                >
                    <NotebookPen aria-hidden="true" />
                    {kioskLabels.wizardNotesAdd}
                </button>
            </div>
            {showPhoto && (
                <div className="grid gap-2">
                    <CameraCapture
                        onCapture={onPhoto}
                        onRemove={() => onPhoto(null)}
                        disabled={disabled || isUploadingPhoto}
                    />
                    {isUploadingPhoto && (
                        <p className="flex items-center gap-2 text-base text-muted-foreground">
                            <Loader2
                                aria-hidden="true"
                                className="size-4 animate-spin"
                            />
                            {kioskLabels.wizardUploading}
                        </p>
                    )}
                </div>
            )}
            {showNotes && (
                <textarea
                    id="log-notes"
                    aria-label={kioskLabels.wizardNotesAdd}
                    placeholder={kioskLabels.wizardNotesHint}
                    value={notes}
                    onChange={(event) => onNotesChange(event.target.value)}
                    className="min-h-24 rounded-xl border-2 border-border bg-background p-3 text-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
            )}

            <p className="rounded-xl bg-kiosk-info-soft p-3 text-base text-kiosk-info">
                {kioskLabels.wizardSentAs}{' '}
                <span className="font-bold">{operatorName}</span>,{' '}
                {kioskLabels.wizardSentAsHint}
            </p>
        </div>
    );
}
