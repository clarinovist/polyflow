'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Clock, ArrowRight } from 'lucide-react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getEntityStatusTimeline } from '@/actions/audit/entity-timeline';
import type { StatusTimelineEntry } from '@/actions/audit/entity-timeline';

interface EntityStatusTimelineProps {
    entityType: string;
    entityId: string;
    title?: string;
    description?: string;
}

export function EntityStatusTimeline({
    entityType,
    entityId,
    title = 'Riwayat Status',
    description = 'Perubahan status tercatat otomatis',
}: EntityStatusTimelineProps) {
    const [entries, setEntries] = useState<StatusTimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const result = await getEntityStatusTimeline(entityType, entityId);
            if (!cancelled && result?.success && result.data) {
                setEntries(result.data);
            }
            if (!cancelled) setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [entityType, entityId]);

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">Memuat...</p>
                </CardContent>
            </Card>
        );
    }

    if (entries.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Belum ada perubahan status tercatat.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <ol className="relative border-l border-muted-foreground/20 space-y-4 ml-2">
                    {entries.map((entry) => (
                        <li key={entry.id} className="ml-4">
                            <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-muted-foreground/30 border border-background" />
                            <div className="text-sm">
                                {entry.fromStatus && entry.toStatus ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Badge
                                            variant="outline"
                                            className="text-xs"
                                        >
                                            {formatStatusLabel(
                                                entry.fromStatus,
                                            )}
                                        </Badge>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                        <Badge
                                            variant="default"
                                            className="text-xs"
                                        >
                                            {formatStatusLabel(entry.toStatus)}
                                        </Badge>
                                    </div>
                                ) : (
                                    <span className="font-medium">
                                        {entry.action}
                                    </span>
                                )}
                                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>
                                        {format(
                                            new Date(entry.createdAt),
                                            'dd MMM yyyy HH:mm',
                                        )}
                                    </span>
                                    <span>·</span>
                                    <span>{entry.userName}</span>
                                </div>
                                {entry.details && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {entry.details}
                                    </p>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            </CardContent>
        </Card>
    );
}

function formatStatusLabel(status: string): string {
    return status
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
