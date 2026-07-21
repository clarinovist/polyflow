import React from 'react';
import { cn } from '@/lib/utils/utils';

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    minWidth?: number;
    /** Keep table header pinned to top while scrolling vertically inside a maxHeight container. */
    stickyHeader?: boolean;
    /** Max height for the scroll container; only meaningful with stickyHeader. */
    maxHeight?: number | string;
}

export function ResponsiveTable({ children, minWidth = 800, stickyHeader = false, maxHeight, className, ...props }: ResponsiveTableProps) {
    return (
        <div
            className={cn("overflow-x-auto -mx-4 sm:mx-0", className)}
            style={stickyHeader && maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
            {...props}
        >
            <div className="inline-block min-w-full align-middle">
                <div
                    style={{ minWidth: `${minWidth}px` }}
                    className={cn(
                        stickyHeader &&
                            "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-background",
                    )}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
