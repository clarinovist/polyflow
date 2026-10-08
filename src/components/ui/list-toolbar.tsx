import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/utils';
interface ListToolbarProps extends HTMLAttributes<HTMLDivElement> {
    search?: ReactNode;
    filters?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
}
export function ListToolbar({
    search,
    filters,
    actions,
    children,
    className,
    ...props
}: ListToolbarProps) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3 lg:flex-row lg:items-end lg:justify-between',
                className,
            )}
            {...props}
        >
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                {search}
                {filters}
                {children}
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2">
                    {actions}
                </div>
            )}
        </div>
    );
}
