import React from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    minWidth?: number;
}

export function ResponsiveTable({ children, minWidth = 800, className, ...props }: ResponsiveTableProps) {
    return (
        <div className={cn("overflow-x-auto -mx-4 sm:mx-0", className)} {...props}>
            <div className="inline-block min-w-full align-middle">
                <div style={{ minWidth: `${minWidth}px` }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
