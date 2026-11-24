import Link from 'next/link';
import { cn } from '@/lib/utils/utils';
import {
    REIMBURSEMENT_TABS,
    type ReimbursementTab,
} from '@/lib/sales/expense-claim-review';

const BASE_PATH = '/finance/reimbursements';

/** Server-driven tabs: each one is a link with `?tab=`. */
export function ReimbursementTabs({ active }: { active: ReimbursementTab }) {
    return (
        <nav aria-label="Tab reimburse" className="flex flex-wrap gap-2">
            {REIMBURSEMENT_TABS.map((item) => {
                const isActive = item.tab === active;
                return (
                    <Link
                        key={item.tab}
                        href={`${BASE_PATH}?tab=${item.tab}`}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                            'inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors',
                            isActive
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted',
                        )}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
