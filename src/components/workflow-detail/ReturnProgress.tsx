import { Check, Circle } from 'lucide-react';

interface ReturnProgressProps {
    status: string;
    direction: 'inbound' | 'outbound';
}

export function ReturnProgress({ status, direction }: ReturnProgressProps) {
    const steps = [
        { key: 'DRAFT', label: 'Draf' },
        { key: 'CONFIRMED', label: 'Dikonfirmasi' },
        {
            key: direction === 'inbound' ? 'RECEIVED' : 'SHIPPED',
            label: direction === 'inbound' ? 'Barang Diterima' : 'Dikirim ke Supplier',
        },
        { key: 'COMPLETED', label: 'Selesai' },
    ];
    const activeIndex = steps.findIndex((step) => step.key === status);
    const cancelled = status === 'CANCELLED';

    return (
        <section
            aria-labelledby="return-progress-title"
            className="rounded-xl border bg-card p-5 shadow-sm"
        >
            <h2 id="return-progress-title" className="font-semibold">
                Proses Retur
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {cancelled
                    ? 'Retur telah dibatalkan.'
                    : activeIndex < steps.length - 1
                      ? 'Tahap berikutnya: ' + steps[activeIndex + 1]?.label
                      : 'Seluruh tahap retur selesai.'}
            </p>
            {cancelled ? (
                <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Riwayat sebelum pembatalan tersedia pada tab Audit Status.
                </div>
            ) : (
                <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {steps.map((step, index) => {
                        const complete = index < activeIndex;
                        const current = index === activeIndex;
                        return (
                            <li
                                key={step.key}
                                aria-current={current ? 'step' : undefined}
                                className={
                                    'rounded-lg border p-3 ' +
                                    (current
                                        ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
                                        : complete
                                          ? 'border-emerald-500/40 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                                          : 'bg-muted/20')
                                }
                            >
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                    {complete ? (
                                        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                        <Circle
                                            className={
                                                'h-4 w-4 ' +
                                                (current
                                                    ? 'fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400'
                                                    : '')
                                            }
                                        />
                                    )}
                                    {complete
                                        ? 'Selesai'
                                        : current
                                          ? 'Aktif'
                                          : 'Menunggu'}
                                </div>
                                <p className="mt-2 text-sm font-semibold">
                                    {step.label}
                                </p>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
