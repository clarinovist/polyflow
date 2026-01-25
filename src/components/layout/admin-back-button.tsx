'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LayoutDashboard } from 'lucide-react';

interface AdminBackButtonProps {
    role?: string;
}

export function AdminBackButton({ role }: AdminBackButtonProps) {
    const isAuthorized = role === 'ADMIN' || role === 'PRODUCTION' || role === 'WAREHOUSE' || role === 'PPIC';

    if (!isAuthorized) {
        return null;
    }

    return (
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary">
            <Link href="/dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Back to Office</span>
            </Link>
        </Button>
    );
}
