import { Minus, Plus } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { parseAmount } from './wizard-model';

const STEP_KG = 0.1;

function AffalRow({
    id,
    label,
    description,
    value,
    onChange,
}: {
    id: string;
    label: string;
    description: string;
    value: string;
    onChange: (value: string) => void;
}) {
    const nudge = (delta: number) => {
        const current = parseAmount(value);
        const next = Math.max(
            0,
            Math.round(
                ((Number.isFinite(current) ? current : 0) + delta) * 10,
            ) / 10,
        );
        onChange(next === 0 ? '' : String(next).replace('.', ','));
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-border p-3">
            <div className="min-w-0">
                <label htmlFor={id} className="text-lg font-bold">
                    {label} (KG)
                </label>
                <p className="text-base text-muted-foreground">{description}</p>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label={`Kurangi ${label.toLowerCase()}`}
                    className={kioskButton({ size: 'lg' })}
                    onClick={() => nudge(-STEP_KG)}
                >
                    <Minus aria-hidden="true" />
                </button>
                <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-14 w-24 rounded-xl border-2 border-border bg-background text-center text-2xl font-bold tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <button
                    type="button"
                    aria-label={`Tambah ${label.toLowerCase()}`}
                    className={kioskButton({ size: 'lg' })}
                    onClick={() => nudge(STEP_KG)}
                >
                    <Plus aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

interface StepAffalProps {
    prongkol: string;
    daun: string;
    onProngkolChange: (value: string) => void;
    onDaunChange: (value: string) => void;
    /** Hidden when the output is 0: then affal is required. */
    showNoAffal: boolean;
    onNoAffal: () => void;
}

export function StepAffal({
    prongkol,
    daun,
    onProngkolChange,
    onDaunChange,
    showNoAffal,
    onNoAffal,
}: StepAffalProps) {
    return (
        <div className="grid content-start gap-3 rounded-2xl border-2 border-border bg-card p-4">
            <AffalRow
                id="log-scrap-prongkol"
                label={kioskLabels.wizardScrapProngkol}
                description={kioskLabels.wizardProngkolDesc}
                value={prongkol}
                onChange={onProngkolChange}
            />
            <AffalRow
                id="log-scrap-daun"
                label={kioskLabels.wizardScrapDaun}
                description={kioskLabels.wizardDaunDesc}
                value={daun}
                onChange={onDaunChange}
            />
            {showNoAffal && (
                <button
                    type="button"
                    className={kioskButton({
                        size: 'lg',
                        tone: 'ghost',
                        className: 'border-dashed border-border',
                    })}
                    onClick={onNoAffal}
                >
                    {kioskLabels.wizardNoScrap}
                </button>
            )}
        </div>
    );
}
