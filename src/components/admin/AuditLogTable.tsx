'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Eye, Clock } from 'lucide-react';
import AuditLogDetailDialog from './AuditLogDetailDialog';

export interface AuditLogClientData {
    id: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: string | null;
    changes: unknown; // Prisma Json? field — raw object/string from DB
    createdAt: Date;
    user: {
        name: string | null;
        email: string | null;
    } | null;
    // Cross-tenant fields (only populated in superadmin cross-tenant view).
    // Optional so this interface also fits the tenant-side (single-tenant)
    // audit log viewer without breaking it.
    source?: 'main' | 'tenant';
    tenantName?: string | null;
    tenantSubdomain?: string | null;
}

interface AuditLogTableProps {
    logs: AuditLogClientData[];
    total: number;
    page: number;
    limit: number;
    onPageChange: (newPage: number) => void;
}

export default function AuditLogTable({
    logs,
    total,
    page,
    limit,
    onPageChange
}: AuditLogTableProps) {
    const [selectedLog, setSelectedLog] = useState<AuditLogClientData | null>(null);
    const totalPages = Math.ceil(total / limit);

    const getActionColor = (action: string) => {
        if (action.includes('CREATE')) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
        if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
        if (action.includes('DELETE')) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
        if (action.includes('APPROVE') || action.includes('POST')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    };

    return (
        <div className="space-y-4">
            <div className="rounded-md border bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-gray-50/50 dark:bg-gray-800/50">
                        <TableRow>
                            <TableHead className="w-[180px]">Timestamp</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Entity</TableHead>
                            <TableHead className="w-[120px]">Source</TableHead>
                            <TableHead className="w-[100px] text-center">View</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center space-y-2">
                                        <Clock className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                                        <span>Tidak ada log audit yang cocok dengan kriteria.</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                        {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{log.user?.name || log.userId}</span>
                                            <span className="text-xs text-muted-foreground">{log.user?.email || 'N/A'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`font-mono text-xs ${getActionColor(log.action)}`}>
                                            {log.action}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{log.entityType}</span>
                                            <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={log.entityId}>
                                                ID: {log.entityId}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {log.source === 'main' ? (
                                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-mono text-[10px]">
                                                Platform
                                            </Badge>
                                        ) : log.tenantName ? (
                                            <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 font-mono text-[10px]" title={log.tenantSubdomain ?? ''}>
                                                {log.tenantName}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                                            onClick={() => setSelectedLog(log)}
                                        >
                                            <Eye className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing <span className="font-medium text-foreground">{(page - 1) * limit + 1}</span> to{' '}
                        <span className="font-medium text-foreground">{Math.min(page * limit, total)}</span> of{' '}
                        <span className="font-medium text-foreground">{total}</span> results
                    </p>
                    <div className="flex space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(page - 1)}
                            disabled={page === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Detail Dialog */}
            <AuditLogDetailDialog 
                log={selectedLog}
                open={!!selectedLog} 
                onOpenChange={(open: boolean) => !open && setSelectedLog(null)} 
            />
        </div>
    );
}
