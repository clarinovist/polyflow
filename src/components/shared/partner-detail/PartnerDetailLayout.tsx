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

/** Presentation only: caller retains ownership of data, permissions and actions. */
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
    const initials = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('');

    return (
        <div className="min-w-0 space-y-6 p-4 md:p-6 lg:p-8">
            <Link
                href={backHref}
                className="inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Daftar {kind.toLowerCase()}
            </Link>
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                        aria-hidden="true"
                        className={cn(
                            'flex size-12 shrink-0 items-center justify-center rounded-xl border text-lg font-semibold',
                            kind === 'Supplier'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
                        )}
                    >
                        {initials}
                    </span>
                    <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Detail {kind}
                        </p>
                        <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere md:text-3xl">
                            {name}
                        </h1>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="wrap-anywhere">
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
                </div>
                {actions && <div className="shrink-0">{actions}</div>}
            </header>
            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[264px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
                <aside
                    aria-label={`Profil ${kind.toLowerCase()}`}
                    className="min-w-0 overflow-hidden rounded-xl border bg-card"
                >
                    <h2 className="hidden border-b px-5 py-4 text-sm font-semibold lg:block">
                        Profil {kind.toLowerCase()}
                    </h2>
                    <Button
                        type="button"
                        variant="ghost"
                        aria-expanded={profileOpen}
                        aria-controls={profileId}
                        className="h-auto min-h-12 w-full justify-between rounded-none px-5 py-4 lg:hidden"
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
                            'divide-y px-5 lg:block',
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
        <section className="space-y-3 py-5 text-sm wrap-anywhere">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {title}
            </h3>
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
        <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="m-0 text-sm wrap-anywhere">{children}</dd>
        </div>
    );
}
