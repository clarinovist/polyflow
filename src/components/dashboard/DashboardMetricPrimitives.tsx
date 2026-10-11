import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { InfoHint } from '@/components/common/InfoHint';
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
    title,
    definition,
}: {
    title: string;
    definition: DashboardMetricDefinition;
}) {
    return (
        <InfoHint label={`Penjelasan ${title}`}>
            <p>{definition.description}</p>
            {definition.source && (
                <p>
                    <span className="font-semibold">Sumber data:</span>{' '}
                    {definition.source}
                </p>
            )}
        </InfoHint>
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
        title ?? (unavailable ? 'Data tidak tersedia' : 'Belum disiapkan');
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

    return (
        <Card
            className={cn(
                'relative h-full min-w-0 gap-4 overflow-hidden py-4 shadow-sm transition-shadow',
                actionable &&
                    'group hover:border-primary/25 hover:shadow-md',
                className,
            )}
        >
            <CardHeader className="min-w-0 gap-3 px-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                    {actionable ? (
                        <Link
                            href={href!}
                            aria-label={`Buka ${title}`}
                            className="before:absolute before:inset-0 before:z-10 before:rounded-xl focus-visible:outline-none focus-visible:before:ring-2 focus-visible:before:ring-ring focus-visible:before:ring-offset-2"
                        >
                            <CardTitle className="min-w-0 text-sm font-medium leading-snug text-muted-foreground">
                                {title}
                            </CardTitle>
                            <ArrowRight
                                aria-hidden="true"
                                className="absolute bottom-4 right-4 z-10 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                            />
                        </Link>
                    ) : (
                        <CardTitle className="min-w-0 text-sm font-medium leading-snug text-muted-foreground">
                            {title}
                        </CardTitle>
                    )}
                    <div className="relative z-20 flex shrink-0 items-center gap-1">
                        <DashboardMetricInfo
                            title={title}
                            definition={definition}
                        />
                        {Icon && (
                            <Icon
                                aria-hidden="true"
                                className="h-4 w-4 text-muted-foreground"
                            />
                        )}
                    </div>
                </div>
                {state === 'AVAILABLE' ? (
                    <div className="min-w-0 break-words text-xl font-bold tracking-tight text-foreground tabular-nums md:text-2xl">
                        {value ?? '—'}
                    </div>
                ) : (
                    <DashboardSectionState state={state} />
                )}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Badge
                        variant="secondary"
                        className="h-auto max-w-full whitespace-normal break-words text-left font-normal"
                    >
                        {definition.period}
                    </Badge>
                    <Badge
                        variant="outline"
                        className="h-auto max-w-full whitespace-normal break-words text-left font-normal"
                    >
                        {definition.unit}
                    </Badge>
                </div>
            </CardHeader>
            {state === 'AVAILABLE' && (supportingText || progress) && (
                <CardContent className="min-w-0 px-4">
                    {supportingText && (
                        <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                            {supportingText}
                        </div>
                    )}
                    {progress && <TargetProgress {...progress} />}
                </CardContent>
            )}
        </Card>
    );
}
