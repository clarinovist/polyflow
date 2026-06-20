'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils/utils';
import { useSidebarCollapse } from '@/components/layout/sidebar-collapse-context';

interface SidebarSpacerProps {
    children: ReactNode;
    className?: string;
}

/**
 * Client wrapper that adjusts main content margin based on sidebar collapse state.
 * Use in layouts instead of hardcoded `lg:ml-64`.
 */
export function SidebarSpacer({ children, className }: SidebarSpacerProps) {
    const { isCollapsed } = useSidebarCollapse();

    return (
        <div className={cn(
            "transition-[margin-left] duration-300",
            isCollapsed ? "lg:ml-16" : "lg:ml-64",
            className
        )}>
            {children}
        </div>
    );
}
