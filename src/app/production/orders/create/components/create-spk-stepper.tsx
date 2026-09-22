import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

const STEPS = ['Produk & target', 'Bahan & tujuan', 'Periksa & buat'];
export type StepNumber = 1 | 2 | 3;

export function CreateSpkStepper({ currentStep }: { currentStep: StepNumber }) {
    return (
        <nav
            aria-label="Progress pembuatan SPK"
            className="rounded-xl border bg-card px-4 py-3"
        >
            <p className="mb-3 text-sm font-medium sm:hidden">
                Langkah {currentStep} dari 3 · {STEPS[currentStep - 1]}
            </p>
            <ol className="flex items-center gap-3">
                {STEPS.map((label, index) => (
                    <li
                        key={label}
                        aria-current={
                            currentStep === index + 1 ? 'step' : undefined
                        }
                        className={cn(
                            'flex min-w-0 flex-1 items-center gap-2 text-sm',
                            currentStep !== index + 1 &&
                                'text-muted-foreground',
                        )}
                    >
                        <span
                            className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                                currentStep === index + 1 &&
                                    'border-emerald-700 bg-emerald-700 text-white',
                                currentStep > index + 1 &&
                                    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                            )}
                        >
                            {currentStep > index + 1 ? (
                                <Check
                                    className="h-4 w-4"
                                    aria-label="Selesai"
                                />
                            ) : (
                                index + 1
                            )}
                        </span>
                        <span className="hidden font-medium sm:inline">
                            {label}
                        </span>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
