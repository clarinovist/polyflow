import React from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveButtonGroupProps {
    children: React.ReactNode;
    mobileStack?: boolean; // Stack vertically on mobile
    className?: string;
}

export function ResponsiveButtonGroup({
    children,
    mobileStack = false,
    className
}: ResponsiveButtonGroupProps) {
    return (
        <div className={cn(
            "flex gap-2 items-center",
            mobileStack
                ? "flex-col sm:flex-row w-full sm:w-auto"
                : "flex-wrap",
            className
        )}>
            {children}
        </div>
    );
}
