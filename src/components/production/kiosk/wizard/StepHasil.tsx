import { kioskLabels } from '@/lib/labels';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { KioskNumberPad } from './KioskNumberPad';

export interface ConversionInfo {
    /** e.g. "2 KG / 1 BAL". */
    standard: string | null;
    /** e.g. "Perkiraan WIP terpakai: 10 KG". */
    preview: string | null;
}

interface StepHasilProps {
    value: string;
    unit: string;
    onChange: (value: string) => void;
    /** Records only affal: output 0 is an explicit choice, not a confirmation. */
    onZeroOutput: () => void;
    /** Unit the system stores when the entry is in a sales unit. */
    baseUnitNote: string | null;
    conversion: ConversionInfo | null;
    conversionInvalid: boolean;
}

export function StepHasil({
    value,
    unit,
    onChange,
    onZeroOutput,
    baseUnitNote,
    conversion,
    conversionInvalid,
}: StepHasilProps) {
    const label = `${kioskLabels.wizardQtyLabel} (${unit})`;

    return (
        <div className="grid content-start gap-4 rounded-2xl border-2 border-border bg-card p-4">
            <label className="flex items-baseline gap-3 rounded-xl border-2 border-kiosk-go bg-kiosk-go-soft/40 px-4 focus-within:ring-[3px] focus-within:ring-ring/50">
                <input
                    id="log-quantity"
                    aria-label={label}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-20 w-full min-w-0 bg-transparent text-5xl font-extrabold tabular-nums outline-none placeholder:text-muted-foreground/60"
                />
                <span className="text-2xl font-bold text-muted-foreground">
                    {unit}
                </span>
            </label>
            {baseUnitNote && (
                <p className="text-base text-muted-foreground">
                    {kioskLabels.wizardBaseUnitNote} {baseUnitNote}.
                </p>
            )}
            {conversion && (
                <div className="grid gap-1 rounded-xl bg-kiosk-info-soft p-3 text-base text-kiosk-info">
                    {conversion.standard && (
                        <p>
                            {kioskLabels.bomStandardLabel}:{' '}
                            {conversion.standard}
                        </p>
                    )}
                    {conversion.preview && (
                        <p className="font-bold">{conversion.preview}</p>
                    )}
                </div>
            )}
            {conversionInvalid && (
                <p className="rounded-xl bg-kiosk-warn-soft p-3 text-base font-semibold text-kiosk-warn-ink">
                    {kioskLabels.bomInvalidMessage}
                </p>
            )}
            <KioskNumberPad
                value={value}
                onChange={onChange}
                label={kioskLabels.wizardKeypad}
            />
            <button
                type="button"
                className={kioskButton({
                    size: 'lg',
                    tone: 'ghost',
                    className: 'border-dashed border-border',
                })}
                onClick={onZeroOutput}
            >
                {kioskLabels.wizardQtyZero}
            </button>
        </div>
    );
}
