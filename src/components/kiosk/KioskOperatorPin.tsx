'use client';

import { Delete, Loader2 } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { cn } from '@/lib/utils/utils';
import { kioskButton } from './ui/kiosk-button';
import { operatorInitials } from './ui/operator-initials';

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const KEY = cn(kioskButton({ size: 'xl' }), 'text-2xl');

interface KioskOperatorPinProps {
    operatorName: string;
    /** Machines or role shown under the name. */
    operatorDetail?: string;
    pin: string;
    error: string;
    isSubmitting: boolean;
    onPinChange: (pin: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}

/** PIN entry with an on-screen keypad sized for gloved fingers. */
export function KioskOperatorPin({
    operatorName,
    operatorDetail,
    pin,
    error,
    isSubmitting,
    onPinChange,
    onSubmit,
    onCancel,
}: KioskOperatorPinProps) {
    const setDigits = (value: string) =>
        onPinChange(value.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH));
    const canSubmit = pin.length >= PIN_MIN_LENGTH && !isSubmitting;

    return (
        <div className="mx-auto grid w-full max-w-md gap-4 p-4 md:p-6">
            <div className="grid gap-4 rounded-2xl border-2 border-border bg-card p-5 text-center shadow-sm">
                <div className="mx-auto flex items-center gap-3 rounded-full border-2 border-border py-1.5 pr-5 pl-1.5 text-left">
                    <span
                        aria-hidden="true"
                        className="flex size-11 items-center justify-center rounded-full bg-muted text-base font-bold"
                    >
                        {operatorInitials(operatorName)}
                    </span>
                    <span className="grid">
                        <span className="text-lg font-bold">
                            {operatorName}
                        </span>
                        {operatorDetail && (
                            <span className="text-sm text-muted-foreground">
                                {operatorDetail}
                            </span>
                        )}
                    </span>
                </div>
                <h2 className="text-2xl font-extrabold">
                    {kioskLabels.pinTitle}
                </h2>
                <input
                    id="kiosk-pin"
                    aria-label="PIN"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    maxLength={PIN_MAX_LENGTH}
                    className="h-16 w-full rounded-xl border-2 border-border bg-background text-center text-3xl tracking-[0.5em] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={pin}
                    onChange={(e) => setDigits(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && canSubmit) onSubmit();
                    }}
                />
                {error && (
                    <p
                        role="alert"
                        className="rounded-xl bg-kiosk-stop-soft p-3 text-base font-semibold text-kiosk-stop-ink"
                    >
                        {error}
                    </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                    {DIGITS.map((digit) => (
                        <button
                            key={digit}
                            type="button"
                            className={KEY}
                            onClick={() => setDigits(pin + digit)}
                        >
                            {digit}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={kioskButton({ size: 'xl', tone: 'ghost' })}
                        onClick={() => onPinChange('')}
                    >
                        Hapus
                    </button>
                    <button
                        type="button"
                        className={KEY}
                        onClick={() => setDigits(pin + '0')}
                    >
                        0
                    </button>
                    <button
                        type="button"
                        className={kioskButton({ size: 'xl', tone: 'ghost' })}
                        aria-label="Hapus satu angka"
                        onClick={() => onPinChange(pin.slice(0, -1))}
                    >
                        <Delete aria-hidden="true" />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        className={kioskButton({ size: 'lg', tone: 'ghost' })}
                        onClick={onCancel}
                    >
                        {kioskLabels.pinNotMe}
                    </button>
                    <button
                        type="button"
                        className={kioskButton({ size: 'lg', tone: 'go' })}
                        disabled={!canSubmit}
                        onClick={onSubmit}
                    >
                        {isSubmitting && (
                            <Loader2
                                aria-hidden="true"
                                className="animate-spin"
                            />
                        )}
                        {kioskLabels.pinSubmit}
                    </button>
                </div>
            </div>
            <p className="text-center text-base text-muted-foreground">
                {kioskLabels.pinNoPinHint}
            </p>
        </div>
    );
}
