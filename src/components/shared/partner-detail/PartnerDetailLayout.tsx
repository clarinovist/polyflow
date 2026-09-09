'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/utils';

interface PartnerDetailLayoutProps {
    kind: 'Supplier' | 'Customer';
    name: string;
    code?: string | null;
    isActive: boolean;
    backHref: string;
    profile: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
}

/** Presentation only: portal layout owns outer padding; caller owns data/access. */
export function PartnerDetailLayout({
    kind,
    name,
    code,
    isActive,
    backHref,
    profile,
    actions,
    children,
}: PartnerDetailLayoutProps) {
    const [profileOpen, setProfileOpen] = useState(false);
    const profileId = useId();

    return (
        <div className="min-w-0 space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Link
                        href={backHref}
                        aria-label={`Daftar ${kind.toLowerCase()}`}
                        title={`Daftar ${kind.toLowerCase()}`}
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                        <ChevronLeft className="size-5" aria-hidden="true" />
                    </Link>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <h1 className="text-xl font-semibold tracking-tight wrap-anywhere md:text-2xl">
                            {name}
                        </h1>
                        <span className="text-xs text-muted-foreground wrap-anywhere">
                            {code || 'Tanpa Kode'}
                        </span>
                        <Badge
                            variant="outline"
                            className={
                                isActive
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                                    : ''
                            }
                        >
                            {isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                    </div>
                </div>
                {actions && <div className="shrink-0">{actions}</div>}
            </header>
            <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)]">
                <aside
                    aria-label={`Profil ${kind.toLowerCase()}`}
                    className="min-w-0 overflow-hidden rounded-xl border bg-card"
                >
                    <Button
                        type="button"
                        variant="ghost"
                        aria-expanded={profileOpen}
                        aria-controls={profileId}
                        className="h-auto min-h-11 w-full justify-between rounded-none px-4 py-3 lg:hidden"
                        onClick={() => setProfileOpen(!profileOpen)}
                    >
                        Profil {kind.toLowerCase()}
                        <ChevronDown
                            aria-hidden="true"
                            className={cn(
                                'size-4',
                                profileOpen && 'rotate-180',
                            )}
                        />
                    </Button>
                    <div
                        id={profileId}
                        className={cn(
                            'divide-y px-4 lg:block',
                            !profileOpen && 'hidden',
                        )}
                    >
                        {profile}
                    </div>
                </aside>
                <div className="min-w-0">{children}</div>
            </div>
        </div>
    );
}

export function PartnerProfileSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="space-y-2 py-3 text-sm wrap-anywhere">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {title}
            </h2>
            {children}
        </section>
    );
}

export function PartnerProfileField({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="m-0 text-sm wrap-anywhere">{children}</dd>
        </div>
    );
}

/** Native disclosure keeps child form state mounted when closed. */
export function PartnerDisclosure({
    title,
    children,
    className,
}: {
    title: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <details className={cn('group/disclosure min-w-0', className)}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md py-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                {title}
                <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 group-open/disclosure:rotate-180"
                />
            </summary>
            <div className="min-w-0 pb-3">{children}</div>
        </details>
    );
}
