import type { ReactNode } from 'react';

export interface WorkflowSummaryItem {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    icon: ReactNode;
}

interface WorkflowSummaryGridProps {
    label: string;
    items: WorkflowSummaryItem[];
}

export function WorkflowSummaryGrid({
    label,
    items,
}: WorkflowSummaryGridProps) {
    return (
        <section
            aria-label={label}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
            {items.map((item) => (
                <div
                    key={item.label}
                    className="min-w-0 rounded-xl border bg-card px-4 py-3 text-card-foreground shadow-sm"
                >
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        {item.icon}
                        {item.label}
                    </div>
                    <div className="mt-2 break-words font-semibold">
                        {item.value}
                    </div>
                    {item.detail && (
                        <div className="mt-1 text-sm text-muted-foreground">
                            {item.detail}
                        </div>
                    )}
                </div>
            ))}
        </section>
    );
}
