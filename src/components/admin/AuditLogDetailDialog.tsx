'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { getAuditLogDetail } from '@/actions/admin/audit-log';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AuditLogDetailDialogProps {
    logId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface AuditLogData {
    id: string;
    action: string;
    createdAt: Date | string;
    user?: { name: string | null; email: string | null } | null;
    userId: string;
    entityType: string;
    entityId: string;
    details?: string | null;
    changes?: unknown;
}

export default function AuditLogDetailDialog({
    logId,
    open,
    onOpenChange
}: AuditLogDetailDialogProps) {
    const [log, setLog] = useState<AuditLogData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let mounted = true;
        if (logId && open) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLoading(true);
            getAuditLogDetail(logId).then(data => {
                if (mounted) {
                    setLog(data as AuditLogData | null);
                    setLoading(false);
                }
            }).catch(err => {
                console.error('Failed to load audit log details', err);
                if (mounted) setLoading(false);
            });
        } else {
            setLog(null);
        }
        return () => { mounted = false; };
    }, [logId, open]);

    const getActionColor = (action: string) => {
        if (!action) return 'bg-gray-100 text-gray-800';
        if (action.includes('CREATE')) return 'bg-emerald-100 text-emerald-800';
        if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800';
        if (action.includes('DELETE')) return 'bg-red-100 text-red-800';
        if (action.includes('APPROVE') || action.includes('POST')) return 'bg-purple-100 text-purple-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-3">
                        Audit Log Details
                        {log && (
                            <Badge variant="outline" className={`font-mono ${getActionColor(log.action)}`}>
                                {log.action}
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {logId ? `Log ID: ${logId}` : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-40 w-full" />
                        </div>
                    ) : log ? (
                        <>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm bg-slate-50 p-4 rounded-md border">
                                <div>
                                    <p className="text-muted-foreground mb-1">Timestamp</p>
                                    <p className="font-mono text-foreground font-medium">
                                        {format(new Date(log.createdAt), 'PPpp')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground mb-1">User</p>
                                    <p className="font-medium">
                                        {log.user?.name || log.userId} 
                                        {log.user?.email && <span className="text-muted-foreground font-normal ml-2">({log.user.email})</span>}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground mb-1">Entity Type</p>
                                    <p className="font-medium">{log.entityType}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground mb-1">Entity ID</p>
                                    <p className="font-mono text-xs break-all">{log.entityId}</p>
                                </div>
                                {log.details && (
                                    <div className="col-span-2">
                                        <p className="text-muted-foreground mb-1">Details</p>
                                        <p className="bg-white p-2 border rounded-md">{log.details}</p>
                                    </div>
                                )}
                            </div>

                            {log.changes && (
                                <div className="flex-1 flex flex-col overflow-hidden min-h-[300px]">
                                    <p className="font-medium mb-2 text-sm text-slate-700">JSON Payload / Changes</p>
                                    <ScrollArea className="flex-1 border rounded-md bg-slate-950 p-4">
                                        <pre className="text-xs text-emerald-400 font-mono">
                                            {typeof log.changes === 'object' 
                                                ? JSON.stringify(log.changes, null, 2)
                                                : String(log.changes)}
                                        </pre>
                                    </ScrollArea>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="h-40 flex items-center justify-center text-muted-foreground">
                            Failed to load detail.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
