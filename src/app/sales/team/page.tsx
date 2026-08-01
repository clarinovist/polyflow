'use client';

import { SalesTeamListClient } from '@/components/sales/SalesTeamListClient';

export default function SalesTeamPage() {
    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Daftar Sales</h1>
                <p className="text-muted-foreground">
                    Kelola tim sales dan assignment customer.
                </p>
            </div>
            <SalesTeamListClient />
        </div>
    );
}
