import { Check, Circle, Package, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { getStatusLabel } from '@/lib/labels';

/** Lifecycle is a status indicator, not navigation or permission to execute an action. */
export function OrderWorkflowStepper({ status }: { status: string }) {
    const steps = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED'];
    const waiting = status === 'WAITING_MATERIAL';
    const currentIndex = waiting ? 1 : steps.indexOf(status);
    if (status === 'CANCELLED')
        return (
            <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                SPK Dibatalkan
            </p>
        );
    return (
        <section
            aria-label="Status SPK"
            className="rounded-lg border bg-muted/20 px-3 py-2"
        >
            <ol className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {steps.map((step, index) => {
                    const current = index === currentIndex;
                    const complete = index < currentIndex;
                    const label =
                        waiting && current
                            ? getStatusLabel('WAITING_MATERIAL', 'production')
                            : getStatusLabel(step, 'production');
                    return (
                        <li
                            key={step}
                            aria-current={current ? 'step' : undefined}
                            className={cn(
                                'flex min-h-8 items-center gap-2 text-xs text-muted-foreground',
                                current && 'font-semibold text-foreground',
                                waiting &&
                                    current &&
                                    'text-amber-800 dark:text-amber-300',
                            )}
                        >
                            {complete ? (
                                <Check
                                    className="h-4 w-4"
                                    aria-label="Tahap terlewati"
                                />
                            ) : (
                                <Circle
                                    className={cn(
                                        'h-3 w-3',
                                        current && 'fill-current',
                                    )}
                                />
                            )}
                            {label}
                        </li>
                    );
                })}
            </ol>
            {waiting && (
                <p className="mt-2 flex items-start gap-2 border-t pt-2 text-xs text-muted-foreground">
                    <Package className="h-4 w-4 shrink-0" />
                    Periksa kebutuhan dan alur bahan pada tab Bahan, tim &
                    kualitas sebelum melanjutkan produksi.
                </p>
            )}
        </section>
    );
}
