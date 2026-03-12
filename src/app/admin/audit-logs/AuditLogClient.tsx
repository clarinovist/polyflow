'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, Activity, Database } from 'lucide-react';
import AuditLogTable from '@/components/admin/AuditLogTable';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface AuditLogClientProps {
    initialData: any;
    stats: any;
    currentPage: number;
    limit: number;
}

export default function AuditLogClient({
    initialData,
    stats,
    currentPage,
    limit
}: AuditLogClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleFilterChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value && value !== 'all') {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        params.set('page', '1'); // Reset to first page on filter
        router.push(`/admin/audit-logs?${params.toString()}`);
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`/admin/audit-logs?${params.toString()}`);
    };

    const currentAction = searchParams.get('action') || 'all';
    const currentEntity = searchParams.get('entityType') || 'all';

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Records
                        </CardTitle>
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{initialData.pagination.total}</div>
                        <p className="text-xs text-muted-foreground">
                            Event trails captured
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Actions Profiled
                        </CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.actions.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Unique system operations
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Entities Monitored
                        </CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.entities.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Database models tracked
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-md border shadow-sm w-full">
                <div className="font-medium text-sm text-slate-700 mr-2">Filters:</div>
                <Select value={currentAction} onValueChange={(val) => handleFilterChange('action', val)}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        {stats.actions.map((s: any) => (
                            <SelectItem key={s.action} value={s.action}>
                                {s.action} ({s.count})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={currentEntity} onValueChange={(val) => handleFilterChange('entityType', val)}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Entities" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Entities</SelectItem>
                        {stats.entities.map((s: any) => (
                            <SelectItem key={s.entityType} value={s.entityType}>
                                {s.entityType} ({s.count})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                
                <div className="flex-1"></div>
                
                {(currentAction !== 'all' || currentEntity !== 'all') && (
                    <Button variant="ghost" onClick={() => router.push('/admin/audit-logs')}>
                        Clear Filters
                    </Button>
                )}
            </div>

            <AuditLogTable 
                logs={initialData.logs}
                total={initialData.pagination.total}
                page={currentPage}
                limit={limit}
                onPageChange={handlePageChange}
            />
        </div>
    );
}
