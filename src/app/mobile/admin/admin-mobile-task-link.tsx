'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { trackTaskStarted } from '@/lib/analytics/mobile-task-events';
import type { AdminMobileTaskType } from '@/services/dashboard/mobile-admin-service';

interface AdminMobileTaskLinkProps {
    href: string;
    taskType: AdminMobileTaskType;
    children: ReactNode;
    className?: string;
}

/** Tracks only static Admin Mobile task taxonomy; no business row data leaves the UI. */
export function AdminMobileTaskLink({
    href,
    taskType,
    children,
    className,
}: AdminMobileTaskLinkProps) {
    return (
        <Link
            href={href}
            className={className}
            onClick={() => {
                void trackTaskStarted(
                    '/mobile/admin/attention',
                    'admin',
                    taskType,
                );
            }}
        >
            {children}
        </Link>
    );
}
