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
    createdAt: Date;
    user: {
        name: string | null;
        email: string | null;
    } | null;
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
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
    const totalPages = Math.ceil(total / limit);

    const getActionColor = (action: string) => {
        if (action.includes('CREATE')) return 'bg-emerald-100 text-emerald-800';
        if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800';
        if (action.includes('DELETE')) return 'bg-red-100 text-red-800';
        if (action.includes('APPROVE') || action.includes('POST')) return 'bg-purple-100 text-purple-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="space-y-4">
            <div className="rounded-md border bg-white overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="w-[180px]">Timestamp</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Entity</TableHead>
                            <TableHead className="w-[100px] text-center">View</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center space-y-2">
                                        <Clock className="h-6 w-6 text-gray-400" />
                                        <span>No audit logs found matching criteria.</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.id} className="hover:bg-gray-50/50 transition-colors">
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
                                    <TableCell className="text-center">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 hover:bg-slate-100"
                                            onClick={() => setSelectedLogId(log.id)}
                                        >
                                            <Eye className="h-4 w-4 text-slate-500" />
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
                logId={selectedLogId} 
                open={!!selectedLogId} 
                onOpenChange={(open: boolean) => !open && setSelectedLogId(null)} 
            />
        </div>
    );
}
