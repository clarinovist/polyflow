'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Delete, Loader2 } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface KioskOperatorPinProps {
    operatorName: string;
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
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6 text-center">
            <div>
                <p className="text-2xl font-black">{operatorName}</p>
                <p className="mt-1 text-lg text-muted-foreground">
                    {kioskLabels.pinTitle}
                </p>
            </div>
            <Input
                id="kiosk-pin"
                aria-label="PIN"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={PIN_MAX_LENGTH}
                className="h-16 text-center text-3xl tracking-[0.5em]"
                value={pin}
                onChange={(e) => setDigits(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit) onSubmit();
                }}
            />
            {error && (
                <p
                    role="alert"
                    className="text-sm font-semibold text-destructive"
                >
                    {error}
                </p>
            )}
            <div className="grid grid-cols-3 gap-2">
                {DIGITS.map((digit) => (
                    <Button
                        key={digit}
                        type="button"
                        variant="outline"
                        className="h-16 text-2xl font-bold"
                        onClick={() => setDigits(pin + digit)}
                    >
                        {digit}
                    </Button>
                ))}
                <Button
                    type="button"
                    variant="secondary"
                    className="h-16 text-base"
                    onClick={() => onPinChange('')}
                >
                    Hapus
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="h-16 text-2xl font-bold"
                    onClick={() => setDigits(pin + '0')}
                >
                    0
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    className="h-16"
                    aria-label="Hapus satu angka"
                    onClick={() => onPinChange(pin.slice(0, -1))}
                >
                    <Delete className="h-6 w-6" />
                </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    className="h-14 text-base"
                    onClick={onCancel}
                >
                    {kioskLabels.pinNotMe}
                </Button>
                <Button
                    type="button"
                    className="h-14 text-base font-bold"
                    disabled={!canSubmit}
                    onClick={onSubmit}
                >
                    {isSubmitting && (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    )}
                    {kioskLabels.pinSubmit}
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                {kioskLabels.pinNoPinHint}
            </p>
        </div>
    );
}
