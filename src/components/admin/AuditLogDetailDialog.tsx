'use client';

import { format } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AuditLogClientData } from './AuditLogTable';

interface AuditLogDetailDialogProps {
    // Pass the full log row directly. Previously this fetched the log by id
    // from the main DB only, which broke the cross-tenant viewer (tenant logs
    // don't exist in the main DB). The table already has all the fields.
    log: AuditLogClientData | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function AuditLogDetailDialog({
    log,
    open,
    onOpenChange
}: AuditLogDetailDialogProps) {
    const getActionColor = (action: string) => {
        if (!action) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
        if (action.includes('CREATE')) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
        if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
        if (action.includes('DELETE')) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
        if (action.includes('APPROVE') || action.includes('POST')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
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
                        {log ? `Log ID: ${log.id}` : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
                    {log && (
                        <>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm bg-slate-50 dark:bg-slate-800 p-4 rounded-md border">
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
                                {(log.source || log.tenantName) && (
                                    <div>
                                        <p className="text-muted-foreground mb-1">Source</p>
                                        <p className="font-medium">
                                            {log.source === 'main' ? 'Platform (main DB)' : log.tenantName ?? 'tenant'}
                                        </p>
                                    </div>
                                )}
                                {log.details && (
                                    <div className="col-span-2">
                                        <p className="text-muted-foreground mb-1">Details</p>
                                        <p className="bg-white dark:bg-zinc-900 p-2 border rounded-md">{log.details}</p>
                                    </div>
                                )}
                            </div>

                            {log.changes && (
                                <div className="flex-1 flex flex-col overflow-hidden min-h-[300px]">
                                    <p className="font-medium mb-2 text-sm text-slate-700 dark:text-slate-300">JSON Payload / Changes</p>
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
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
