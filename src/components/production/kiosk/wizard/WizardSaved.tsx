import { Check } from 'lucide-react';
import { DialogTitle } from '@/components/ui/dialog';
import { kioskLabels } from '@/lib/labels';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import type { SummaryRow } from './WizardFrame';

/** Concrete proof of what was recorded, and only two ways forward. */
export function WizardSaved({
    rows,
    sessionTotal,
    onAgain,
    onDone,
}: {
    rows: SummaryRow[];
    /** Shown when more than one entry was saved in this dialog. */
    sessionTotal: string | null;
    onAgain: () => void;
    onDone: () => void;
}) {
    return (
        <div className="mx-auto grid w-full max-w-xl justify-items-center gap-5 p-6 text-center">
            <span
                aria-hidden="true"
                className="flex size-20 items-center justify-center rounded-full bg-kiosk-go text-kiosk-go-fg"
            >
                <Check className="size-10" />
            </span>
            <DialogTitle className="text-3xl font-extrabold">
                {kioskLabels.wizardSavedTitle}
            </DialogTitle>
            <dl className="grid w-full gap-2 rounded-2xl border-2 border-border bg-card p-4 text-left">
                {rows.map((row, index) => (
                    <div
                        key={`${row.label}-${index}`}
                        className="flex items-baseline justify-between gap-3"
                    >
                        <dt className="text-base text-muted-foreground">
                            {row.label}
                        </dt>
                        <dd className="text-lg font-bold tabular-nums">
                            {row.value}
                        </dd>
                    </div>
                ))}
                {sessionTotal && (
                    <div className="flex items-baseline justify-between gap-3 border-t pt-2">
                        <dt className="text-base text-muted-foreground">
                            {kioskLabels.wizardSavedTotal}
                        </dt>
                        <dd className="text-lg font-bold tabular-nums">
                            {sessionTotal}
                        </dd>
                    </div>
                )}
            </dl>
            <div className="grid w-full grid-cols-2 gap-2">
                <button
                    type="button"
                    className={kioskButton({ size: 'lg' })}
                    onClick={onAgain}
                >
                    {kioskLabels.wizardCatatLagi}
                </button>
                <button
                    type="button"
                    className={kioskButton({ size: 'lg', tone: 'go' })}
                    onClick={onDone}
                >
                    {kioskLabels.wizardBackToSpk}
                </button>
            </div>
        </div>
    );
}
