import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { kioskLabels } from '@/lib/labels';

/** Hasil · Kemasan · Affal · QC · Kirim, with the done steps ticked. */
export function WizardStepBar({
    labels,
    current,
}: {
    labels: string[];
    current: number;
}) {
    return (
        <ol className="flex flex-wrap gap-2">
            {labels.map((label, index) => {
                const done = index < current;
                const on = index === current;
                return (
                    <li
                        key={label}
                        aria-current={on ? 'step' : undefined}
                        className={cn(
                            'flex min-h-10 items-center gap-2 rounded-full border-2 px-3 text-base font-semibold',
                            on &&
                                'border-kiosk-go bg-kiosk-go-soft text-kiosk-go-ink',
                            done && 'border-transparent text-muted-foreground',
                            !on &&
                                !done &&
                                'border-border text-muted-foreground',
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                'flex size-6 items-center justify-center rounded-full text-sm',
                                on || done
                                    ? 'bg-kiosk-go text-kiosk-go-fg'
                                    : 'bg-muted',
                            )}
                        >
                            {done ? <Check className="size-4" /> : index + 1}
                        </span>
                        {label}
                    </li>
                );
            })}
        </ol>
    );
}

export interface SummaryRow {
    label: string;
    value: string;
}

/** Running summary beside every step, so the operator sees what will be sent. */
export function WizardSummary({
    rows,
    footer,
    children,
}: {
    rows: SummaryRow[];
    footer?: string;
    children?: ReactNode;
}) {
    return (
        <aside className="grid content-start gap-3 rounded-2xl border-2 border-border bg-card p-4">
            <h3 className="text-base font-semibold text-muted-foreground">
                {kioskLabels.wizardSummaryTitle}
            </h3>
            <dl className="grid gap-2">
                {rows.map((row, index) => (
                    <div
                        key={`${row.label}-${index}`}
                        className="flex items-baseline justify-between gap-3"
                    >
                        <dt className="text-base text-muted-foreground">
                            {row.label}
                        </dt>
                        <dd className="text-right text-lg font-bold tabular-nums">
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>
            {children}
            {footer && (
                <p className="border-t pt-3 text-sm text-muted-foreground">
                    {footer}
                </p>
            )}
        </aside>
    );
}
