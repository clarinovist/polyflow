import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/utils';

export type CommandQueueTone = 'critical' | 'warning' | 'neutral';

export type CommandQueueItem = {
    id: string;
    category: string;
    title: string;
    subtitle: string;
    value?: string;
    age?: string;
    tone: CommandQueueTone;
    href?: string | null;
    action: string;
    icon?: LucideIcon;
};

function dotClass(tone: CommandQueueTone) {
    if (tone === 'critical') return 'bg-destructive ring-destructive/10';
    if (tone === 'warning') return 'bg-amber-500 ring-amber-500/10';
    return 'bg-zinc-400 ring-zinc-400/10 dark:bg-zinc-500';
}

function badgeClass(tone: CommandQueueTone) {
    if (tone === 'critical') return 'bg-destructive/10 text-destructive';
    if (tone === 'warning')
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
    return 'bg-muted text-muted-foreground';
}

export function CommandQueueRow({ item }: { item: CommandQueueItem }) {
    const Icon = item.icon;
    const body = (
        <>
            <div className="flex min-w-0 gap-3">
                <span
                    aria-hidden="true"
                    className={cn(
                        'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4',
                        dotClass(item.tone),
                    )}
                />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant="outline"
                            className={cn(
                                'h-6 rounded-full border-0 px-2 text-[10px] uppercase tracking-wide',
                                badgeClass(item.tone),
                            )}
                        >
                            {Icon && (
                                <Icon
                                    aria-hidden="true"
                                    className="mr-1 h-3 w-3"
                                />
                            )}
                            {item.category}
                        </Badge>
                        {item.age && (
                            <span className="text-[11px] font-medium text-muted-foreground">
                                {item.age}
                            </span>
                        )}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold sm:text-[15px]">
                        {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.subtitle}
                    </p>
                </div>
            </div>
            <p className="pl-5 text-sm font-semibold tabular-nums sm:pl-0 sm:text-right">
                {item.value ?? '—'}
            </p>
            <span className="ml-5 inline-flex min-h-11 items-center justify-start gap-1 text-xs font-semibold text-primary sm:ml-0 sm:min-w-28 sm:justify-end">
                {item.action}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
        </>
    );
    const className =
        'grid min-w-0 gap-3 border-b px-4 py-4 last:border-b-0 hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5';
    return item.href ? (
        <li>
            <Link href={item.href} className={className}>
                {body}
            </Link>
        </li>
    ) : (
        <li className={className}>{body}</li>
    );
}

export function CommandQueueChip({
    label,
    value,
    href,
}: {
    label: string;
    value?: number | string;
    href?: string | null;
}) {
    const className =
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-background px-3 text-xs font-semibold text-muted-foreground transition hover:border-foreground/25 hover:text-foreground';
    const body = (
        <>
            <span>{label}</span>
            {value !== undefined && (
                <span className="tabular-nums">{value}</span>
            )}
        </>
    );
    return href ? (
        <Link href={href} className={className}>
            {body}
        </Link>
    ) : (
        <span className={className}>{body}</span>
    );
}

export function CommandQueueFooter({
    total,
    returned,
    href,
    label,
    itemLabel = 'prioritas',
}: {
    total?: number | null;
    returned: number;
    href?: string | null;
    label: string;
    itemLabel?: string;
}) {
    const summary =
        total != null && total > returned
            ? total + ' total · ' + returned + ' ditampilkan'
            : returned + ' ' + itemLabel + ' ditampilkan';
    return (
        <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-muted-foreground">{summary}</p>
            {href && (
                <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="min-h-11 justify-start gap-1 px-0 sm:justify-center sm:px-3"
                >
                    <Link href={href}>
                        {label}
                        <ArrowRight
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                        />
                    </Link>
                </Button>
            )}
        </div>
    );
}
