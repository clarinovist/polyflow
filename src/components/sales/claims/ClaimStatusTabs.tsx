import Link from 'next/link';
import { cn } from '@/lib/utils/utils';
import {
    REVIEW_STATUS_TABS,
    type ReviewStatus,
} from '@/lib/sales/expense-claim-review';

/** Server-driven status filter: each tab is a link with `?status=`. */
export function ClaimStatusTabs({
    active,
    pendingCount,
}: {
    active: ReviewStatus;
    pendingCount: number | null;
}) {
    return (
        <nav aria-label="Filter status klaim" className="flex flex-wrap gap-2">
            {REVIEW_STATUS_TABS.map((tab) => {
                const isActive = tab.status === active;
                const showCount =
                    tab.status === 'SUBMITTED' && pendingCount !== null;
                return (
                    <Link
                        key={tab.status}
                        href={`/sales/claims?status=${tab.status}`}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                            'inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                            isActive
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted',
                        )}
                    >
                        {tab.label}
                        {showCount && (
                            <span className="rounded-full bg-background/20 px-1.5 text-xs tabular-nums">
                                {pendingCount}
                            </span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
