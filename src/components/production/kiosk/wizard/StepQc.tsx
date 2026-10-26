import { AlertTriangle } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { cn } from '@/lib/utils/utils';
import { parseAmount } from './wizard-model';

export interface QcParameter {
    id: string;
    name: string;
    unit: string;
    targetValue: unknown;
    minValue: unknown;
    maxValue: unknown;
}

export function isQcValueOutOfRange(param: QcParameter, value: number) {
    const min = param.minValue !== null ? Number(param.minValue) : null;
    const max = param.maxValue !== null ? Number(param.maxValue) : null;
    return (min !== null && value < min) || (max !== null && value > max);
}

/** Out-of-range values warn but do not block (QC checkpoint, 2026-08-11). */
export function StepQc({
    parameters,
    values,
    onChange,
}: {
    parameters: QcParameter[];
    values: Record<string, string>;
    onChange: (id: string, value: string) => void;
}) {
    return (
        <div className="grid content-start gap-3 rounded-2xl border-2 border-border bg-card p-4">
            {parameters.map((param, index) => {
                const raw = values[param.id] ?? '';
                const number = parseAmount(raw);
                const outOfRange =
                    raw.trim() !== '' &&
                    Number.isFinite(number) &&
                    isQcValueOutOfRange(param, number);
                return (
                    <div key={param.id} className="grid gap-1.5">
                        <label
                            htmlFor={`log-qc-${param.id}`}
                            className="text-lg font-bold"
                        >
                            {param.name} ({param.unit})
                        </label>
                        <input
                            id={`log-qc-${param.id}`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            autoFocus={index === 0}
                            value={raw}
                            onChange={(event) =>
                                onChange(param.id, event.target.value)
                            }
                            className={cn(
                                'h-14 rounded-xl border-2 bg-background px-4 text-2xl font-bold tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                outOfRange
                                    ? 'border-kiosk-warn'
                                    : 'border-border',
                            )}
                        />
                        {outOfRange && (
                            <p className="flex items-center gap-2 text-base font-semibold text-kiosk-warn-ink">
                                <AlertTriangle
                                    aria-hidden="true"
                                    className="size-4"
                                />
                                {kioskLabels.wizardQCOutOfRange}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
