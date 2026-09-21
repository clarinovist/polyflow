import Link from 'next/link';
import { getMyPermissions } from '@/actions/admin/permissions';
import { canSeeNavHref } from '@/lib/auth/permission-match';
import { cn } from '@/lib/utils/utils';

const views = [
    { key: 'list', label: 'Daftar', href: '/production/orders' },
    { key: 'board', label: 'Board Proses', href: '/production/daily' },
] as const;

/** Keep both existing routes and their independent resource grants. */
export async function ProductionOrderViews({
    current,
}: {
    current: 'list' | 'board';
}) {
    const result = await getMyPermissions();
    const permissions = result.success && result.data ? result.data : [];

    return (
        <nav aria-label="Tampilan SPK" className="flex flex-wrap gap-2">
            {views
                .filter((view) => canSeeNavHref(view.href, permissions))
                .map((view) => (
                    <Link
                        key={view.key}
                        href={view.href}
                        aria-current={current === view.key ? 'page' : undefined}
                        className={cn(
                            'inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent',
                            current === view.key
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'text-muted-foreground',
                        )}
                    >
                        {view.label}
                    </Link>
                ))}
        </nav>
    );
}
