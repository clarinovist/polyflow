'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { countMyOpenFindings } from '@/actions/findings/finding-count-actions';
import { cn } from '@/lib/utils/utils';

/** Fired by the inbox after claim/snooze so the badge can recount. */
export const FINDINGS_CHANGED_EVENT = 'polyflow-findings-changed';

const FINDINGS_HREF = '/findings';
const MAX_BADGE_COUNT = 99;

function formatCount(count: number): string {
    return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
}

function useOpenFindingsCount(): number | null {
    const pathname = usePathname();
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        let isCurrent = true;
        const load = () => {
            countMyOpenFindings()
                .then((total) => {
                    if (isCurrent) setCount(total);
                })
                .catch(() => {
                    // Navigation chrome: a failed count just hides the badge.
                    if (isCurrent) setCount(0);
                });
        };
        load();
        window.addEventListener(FINDINGS_CHANGED_EVENT, load);
        return () => {
            isCurrent = false;
            window.removeEventListener(FINDINGS_CHANGED_EVENT, load);
        };
    }, [pathname]);

    return count;
}

/**
 * Sidebar entry for the findings inbox, shown only when the user has open
 * findings (the count is already filtered by what they may see) or is on the
 * inbox itself. Used by every sidebar so the count follows the user into each
 * workspace without each layout fetching it.
 */
export function FindingsNavLink({ collapsed = false }: { collapsed?: boolean }) {
    const pathname = usePathname();
    const count = useOpenFindingsCount();
    const isActive = pathname.startsWith(FINDINGS_HREF);
    if (count === null || (count === 0 && !isActive)) return null;

    return (
        <Link
            href={FINDINGS_HREF}
            title={collapsed ? 'Temuan' : undefined}
            aria-label={
                count > 0 ? `Temuan, ${count} perlu ditangani` : 'Temuan'
            }
            className={cn(
                'relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center mx-1' : 'gap-3 px-3',
                isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )}
        >
            <ClipboardList
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
            />
            {!collapsed && <span className="flex-1">Temuan</span>}
            {count > 0 && (
                <span
                    className={cn(
                        'rounded-full bg-destructive px-1.5 text-center text-[10px] font-semibold leading-4 text-white',
                        collapsed && 'absolute -right-0.5 -top-0.5',
                    )}
                >
                    {formatCount(count)}
                </span>
            )}
        </Link>
    );
}
