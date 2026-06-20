'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Database, Server, Settings, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { systemHealthLabels as L } from '@/lib/labels/admin';

interface SystemDiagnostics {
    status: string;
    db: { status: string; latencyMs: number };
    system: { platform: string; arch: string; cpus: number; uptimeSeconds: number; osUptimeSeconds: number };
    memory: { osTotalBytes: number; osFreeBytes: number; heapUsedBytes: number; heapTotalBytes: number; rssBytes: number };
    environment: { key: string; isSet: boolean }[];
    timestamp: string;
}

export default function SystemHealthPage() {
    const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDiagnostics = async () => {
        try {
            const res = await fetch('/api/admin/diagnostics');
            if (!res.ok) {
                if (res.status === 401) throw new Error('Unauthorized');
                throw new Error('Failed to fetch diagnostics');
            }
            const data = await res.json();
            setDiagnostics(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDiagnostics();
        const interval = setInterval(fetchDiagnostics, 30000); // refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading && !diagnostics) {
        return (
            <div className="flex-1 space-y-4 p-8 pt-6">
                <h2 className="text-3xl font-bold tracking-tight mb-4">{L.title}</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Skeleton className="h-[120px] w-full" />
                    <Skeleton className="h-[120px] w-full" />
                    <Skeleton className="h-[120px] w-full" />
                    <Skeleton className="h-[120px] w-full" />
                </div>
            </div>
        );
    }

    if (!diagnostics || error) {
        return (
            <div className="flex-1 space-y-4 p-8 pt-6">
                <h2 className="text-3xl font-bold tracking-tight mb-4">{L.title}</h2>
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md border border-red-200 dark:border-red-800/50 flex items-center gap-3">
                    <AlertCircle className="h-5 w-5" />
                    <p>{error || L.diagnosticsUnavailable}</p>
                </div>
            </div>
        );
    }

    const { status, db, system, memory, environment } = diagnostics;
    const isHealthy = status === 'OK';
    const memoryPercent = (memory.osTotalBytes - memory.osFreeBytes) / memory.osTotalBytes * 100;
    const heapPercent = memory.heapUsedBytes / memory.heapTotalBytes * 100;

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2 mb-4">
                <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    {L.title}
                    <Badge variant={isHealthy ? 'default' : 'destructive'} className={isHealthy ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                        {isHealthy ? L.allSystemsOperational : L.systemsDegraded}
                    </Badge>
                </h2>
                <p className="text-sm text-muted-foreground">
                    {L.lastUpdated} {new Date(diagnostics.timestamp).toLocaleTimeString()}
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{L.database}</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{db.status}</div>
                        <p className="text-xs text-muted-foreground mt-1">{L.latency}: {db.latencyMs}ms</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{L.nodejsUptime}</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Math.floor(system.uptimeSeconds / 3600)}h {Math.floor((system.uptimeSeconds % 3600) / 60)}m</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {L.processUptime}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{L.osMemoryUsage}</CardTitle>
                        <Server className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{memoryPercent.toFixed(1)}%</div>
                        <Progress value={memoryPercent} className="h-2 mt-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {Math.round((memory.osTotalBytes - memory.osFreeBytes) / 1024 / 1024 / 1024)}GB / {Math.round(memory.osTotalBytes / 1024 / 1024 / 1024)}GB
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{L.v8Heap}</CardTitle>
                        <Server className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{heapPercent.toFixed(1)}%</div>
                        <Progress value={heapPercent} className="h-2 mt-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {Math.round(memory.heapUsedBytes / 1024 / 1024)}MB / {Math.round(memory.heapTotalBytes / 1024 / 1024)}MB
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" /> {L.environmentVariables}
                        </CardTitle>
                        <CardDescription>{L.envDescription}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {environment.map((env) => (
                                <div key={env.key} className="flex items-center justify-between">
                                    <span className="font-mono text-sm">{env.key}</span>
                                    {env.isSet ? (
                                        <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"><CheckCircle2 className="h-3 w-3 mr-1"/> {L.configured}</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"><AlertCircle className="h-3 w-3 mr-1"/> {L.missing}</Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Server className="h-5 w-5" /> {L.hostInformation}
                        </CardTitle>
                        <CardDescription>{L.hostDescription}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex justify-between border-b pb-2 text-sm">
                                <span className="text-muted-foreground">{L.platform}</span>
                                <span className="font-medium">{system.platform} ({system.arch})</span>
                            </div>
                            <div className="flex justify-between border-b pb-2 text-sm">
                                <span className="text-muted-foreground">{L.logicalCpus}</span>
                                <span className="font-medium">{system.cpus} Cores</span>
                            </div>
                            <div className="flex justify-between border-b pb-2 text-sm">
                                <span className="text-muted-foreground">{L.systemUptime}</span>
                                <span className="font-medium">{Math.floor(system.osUptimeSeconds / 3600 / 24)} days {Math.floor((system.osUptimeSeconds % (3600 * 24)) / 3600)} hours</span>
                            </div>
                            <div className="flex justify-between pb-2 text-sm">
                                <span className="text-muted-foreground">{L.nodeRss}</span>
                                <span className="font-medium">{Math.round(memory.rssBytes / 1024 / 1024)} MB</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
