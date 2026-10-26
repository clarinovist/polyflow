import Link from 'next/link';
import { Tag } from 'lucide-react';
import type { KioskJobCard } from '@/services/production/kiosk-job-service';
import {
    formatProductionQuantity,
    getEnteredQuantityDisplay,
} from '@/lib/utils/production-units';
import { kioskLabels } from '@/lib/labels';
import { getStatusLabel } from '@/lib/labels/helpers';
import { resolveKioskMode } from '@/lib/production/rewinder-workflow';
import { cn } from '@/lib/utils/utils';
import { KioskPill } from '@/components/kiosk/ui/KioskPill';

function PackagingPill({
    packaging,
}: {
    packaging: NonNullable<KioskJobCard['packaging']>;
}) {
    if (!packaging.labelName) {
        return (
            <KioskPill tone="tag">
                <Tag aria-hidden="true" className="size-4" />
                {kioskLabels.jobsPackaging}
            </KioskPill>
        );
    }
    const isEmpty = packaging.labelStock === 0;
    return (
        <KioskPill tone={isEmpty ? 'warn' : 'tag'}>
            <Tag aria-hidden="true" className="size-4" />
            {packaging.labelName} ·{' '}
            {isEmpty
                ? kioskLabels.jobsLabelEmpty
                : `${kioskLabels.jobsLabelStock} ${(packaging.labelStock ?? 0).toLocaleString('id-ID')} lbr`}
        </KioskPill>
    );
}

/** One SPK on the kiosk list: the whole card opens Fokus SPK. */
export function KioskOrderCard({ job }: { job: KioskJobCard }) {
    const mode = resolveKioskMode(job.executionMode);
    const done = formatProductionQuantity(job.actualQuantity, job.unit, {
        showBaseWhenAlternate: false,
    });
    const target = getEnteredQuantityDisplay(
        {
            ...job.unit,
            quantity: job.plannedQuantity,
            enteredQuantity: job.plannedEnteredQuantity,
            enteredUnit: job.plannedEnteredUnit,
            conversionFactorSnapshot: job.plannedConversionFactorSnapshot,
        },
        { showBaseWhenAlternate: false },
    );
    const progress =
        job.plannedQuantity > 0
            ? Math.min(100, (job.actualQuantity / job.plannedQuantity) * 100)
            : 0;

    return (
        <Link
            href={`/kiosk/jobs/${job.id}`}
            className={cn(
                'grid gap-3 rounded-2xl border-2 bg-card p-4 transition-colors hover:border-primary active:scale-[0.99]',
                job.isRunning ? 'border-kiosk-go' : 'border-border',
            )}
        >
            <span className="flex flex-wrap items-start justify-between gap-3">
                <span className="grid min-w-0 gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                        {job.isRunning ? (
                            <KioskPill tone="go" live>
                                {kioskLabels.running}
                            </KioskPill>
                        ) : (
                            <KioskPill tone="info">
                                {getStatusLabel(job.status, 'production')}
                            </KioskPill>
                        )}
                        {mode === 'INDIVIDUAL_OUTPUT' && (
                            <KioskPill>{kioskLabels.modeIndividual}</KioskPill>
                        )}
                        {mode === 'MATERIAL_CONVERSION' && (
                            <KioskPill>{kioskLabels.modeMaterial}</KioskPill>
                        )}
                        <span className="font-mono text-sm text-muted-foreground">
                            {job.orderNumber}
                        </span>
                    </span>
                    <span className="text-xl font-bold leading-snug">
                        {job.productName}
                    </span>
                </span>
                <span className="text-2xl font-bold tabular-nums">
                    {done}
                    <span className="text-base font-medium text-muted-foreground">
                        {' '}
                        / {target}
                    </span>
                </span>
            </span>
            <span
                aria-hidden="true"
                className="h-2.5 overflow-hidden rounded-full bg-muted"
            >
                <span
                    className="block h-full rounded-full bg-kiosk-go"
                    style={{ width: `${progress}%` }}
                />
            </span>
            <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap gap-2">
                    <KioskPill>
                        {job.machine?.name ?? kioskLabels.jobsManual}
                    </KioskPill>
                    {job.packaging && (
                        <PackagingPill packaging={job.packaging} />
                    )}
                </span>
                <span className="text-lg font-bold">
                    {job.isRunning
                        ? kioskLabels.jobsOpen
                        : kioskLabels.jobsView}{' '}
                    →
                </span>
            </span>
        </Link>
    );
}
