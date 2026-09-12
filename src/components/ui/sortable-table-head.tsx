'use client';

import {
    useId,
    type ComponentProps,
    type MouseEventHandler,
    type ReactNode,
} from 'react';

import { DataTableSortIcon } from '@/components/ui/data-table-sort-icon';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils/utils';

export type TableSortDirection = 'asc' | 'desc' | false;

interface SortableTableHeadProps
    extends Omit<ComponentProps<typeof TableHead>, 'aria-sort' | 'children'> {
    children: ReactNode;
    direction: TableSortDirection;
    sortable?: boolean;
    onSort?: MouseEventHandler<HTMLButtonElement>;
}

function getAriaSort(direction: TableSortDirection) {
    if (direction === 'asc') return 'ascending';
    if (direction === 'desc') return 'descending';
    return 'none';
}

export function SortableTableHead({
    children,
    direction,
    sortable = false,
    onSort,
    className,
    ...props
}: SortableTableHeadProps) {
    const contentId = useId();
    const sortActionId = useId();

    return (
        <TableHead
            aria-labelledby={sortable ? contentId : undefined}
            aria-sort={sortable ? getAriaSort(direction) : undefined}
            className={cn(sortable && 'select-none', className)}
            {...props}
        >
            <div className="flex w-full items-center gap-2 whitespace-nowrap">
                <div
                    id={sortable ? contentId : undefined}
                    className="min-w-0 flex-1"
                >
                    {children}
                </div>
                {sortable && (
                    <button
                        type="button"
                        aria-labelledby={`${sortActionId} ${contentId}`}
                        className="flex shrink-0 items-center rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        onClick={onSort}
                    >
                        <span id={sortActionId} className="sr-only">
                            Urutkan berdasarkan
                        </span>
                        <DataTableSortIcon direction={direction} />
                    </button>
                )}
            </div>
        </TableHead>
    );
}
