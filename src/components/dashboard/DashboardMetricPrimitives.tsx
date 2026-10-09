import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { AlertCircle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils/utils';

export type DashboardMetricState =
    | 'AVAILABLE'
    | 'UNAVAILABLE'
    | 'NOT_CONFIGURED';

export interface DashboardMetricDefinition {
    unit: string;
    period: string;
    description: string;
    source?: string;
}

export function DashboardMetricInfo({
    definition,
}: {
    definition: DashboardMetricDefinition;
}) {
    const label = [
        definition.description,
        'Unit: ' + definition.unit + '.',
        'Periode: ' + definition.period + '.',
        definition.source ? 'Sumber: ' + definition.source + '.' : null,
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <p
            aria-label={label}
            className="flex min-w-0 items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"
        >
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">
                {definition.description}
                {definition.source ? ' · ' + definition.source : ''}
            </span>
        </p>
    );
}

export function DashboardFreshness({
    generatedAt,
    label = 'Diperbarui',
}: {
    generatedAt: string;
    label?: string;
}) {
    const date = new Date(generatedAt);
    const valid = !Number.isNaN(date.getTime());
    const formatted = valid
        ? new Intl.DateTimeFormat('id-ID', {
              timeZone: 'Asia/Jakarta',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
              timeZoneName: 'short',
          }).format(date)
        : 'waktu tidak tersedia';
    return (
        <time
            dateTime={valid ? date.toISOString() : undefined}
            aria-live="polite"
            className="text-xs text-muted-foreground tabular-nums"
        >
            {label} {formatted}
        </time>
    );
}

export function DashboardSectionState({
    state,
    title,
    description,
}: {
    state: Exclude<DashboardMetricState, 'AVAILABLE'>;
    title?: string;
    description?: string;
}) {
    const unavailable = state === 'UNAVAILABLE';
    const heading =
        title ?? (unavailable ? 'Data tidak tersedia' : 'Belum dikonfigurasi');
    const detail =
        description ??
        (unavailable
            ? 'Angka kosong tidak dianggap nol. Coba segarkan kembali.'
            : 'Metrik ditahan sampai definisi bisnis disetujui.');
    return (
        <div
            role={unavailable ? 'status' : undefined}
            className={cn(
                'flex min-w-0 items-start gap-3 rounded-lg border p-3 text-sm',
                unavailable
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-dashed bg-muted/30',
            )}
        >
            <AlertCircle
                aria-hidden="true"
                className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    unavailable ? 'text-amber-600' : 'text-muted-foreground',
                )}
            />
            <div className="min-w-0">
                <p className="font-medium text-foreground">{heading}</p>
                <p className="text-muted-foreground">{detail}</p>
            </div>
        </div>
    );
}

export function TargetProgress({
    value,
    label,
    indicatorClassName,
}: {
    value: number;
    label: string;
    indicatorClassName?: string;
}) {
    const bounded = Math.min(100, Math.max(0, value));
    return (
        <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{label}</span>
                <span className="tabular-nums">{bounded.toFixed(0)}%</span>
            </div>
            <Progress
                value={bounded}
                aria-label={label + ': ' + bounded.toFixed(0) + '%'}
                className="h-1.5"
                indicatorClassName={indicatorClassName}
            />
        </div>
    );
}

export function DashboardHealthCard({
    title,
    value,
    icon: Icon,
    definition,
    state = 'AVAILABLE',
    supportingText,
    href,
    progress,
    className,
}: {
    title: string;
    value?: string;
    icon?: LucideIcon;
    definition: DashboardMetricDefinition;
    state?: DashboardMetricState;
    supportingText?: React.ReactNode;
    href?: string;
    progress?: { value: number; label: string; indicatorClassName?: string };
    className?: string;
}) {
    const actionable = state !== 'UNAVAILABLE' && Boolean(href);
    const card = (
        <Card
            className={cn(
                'h-full min-w-0 gap-4 overflow-hidden py-4 shadow-sm transition-shadow',
                actionable &&
                    'cursor-pointer hover:border-primary/25 hover:shadow-md',
                className,
            )}
        >
            <CardHeader className="min-w-0 gap-2 px-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <CardTitle className="min-w-0 text-sm font-medium leading-snug text-muted-foreground">
                        {title}
                    </CardTitle>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <Badge
                            variant="outline"
                            className={cn(
                                'h-auto whitespace-normal text-[10px] font-semibold',
                                state === 'AVAILABLE' &&
                                    'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
                                state === 'UNAVAILABLE' &&
                                    'border-amber-500/40 text-amber-700 dark:text-amber-300',
                            )}
                        >
                            {state}
                        </Badge>
                        {Icon && (
                            <Icon
                                aria-hidden="true"
                                className="h-4 w-4 text-muted-foreground"
                            />
                        )}
                    </div>
                </div>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                    <Badge
                        variant="outline"
                        className="h-auto max-w-full whitespace-normal break-words text-left font-normal"
                    >
                        {definition.unit}
                    </Badge>
                    <Badge
                        variant="secondary"
                        className="h-auto max-w-full whitespace-normal break-words text-left font-normal"
                    >
                        {definition.period}
                    </Badge>
                </div>
                <DashboardMetricInfo definition={definition} />
            </CardHeader>
            <CardContent className="min-w-0 px-4">
                {state === 'AVAILABLE' ? (
                    <>
                        <div className="min-w-0 break-words text-xl font-bold tracking-tight text-foreground tabular-nums md:text-2xl">
                            {value ?? '—'}
                        </div>
                        {supportingText && (
                            <div className="mt-2 min-w-0 text-xs leading-relaxed text-muted-foreground">
                                {supportingText}
                            </div>
                        )}
                        {progress && <TargetProgress {...progress} />}
                    </>
                ) : (
                    <DashboardSectionState state={state} />
                )}
            </CardContent>
        </Card>
    );
    return actionable ? (
        <Link href={href!} className="block h-full min-w-0">
            {card}
        </Link>
    ) : (
        card
    );
}
