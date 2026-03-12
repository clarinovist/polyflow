'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Database, Server, Settings, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

export default function SystemHealthPage() {
    const [diagnostics, setDiagnostics] = useState<any>(null);
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
                <h2 className="text-3xl font-bold tracking-tight mb-4">System Health</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Skeleton className="h-[120px] w-full" />
                    <Skeleton className="h-[120px] w-full" />
                    <Skeleton className="h-[120px] w-full" />
                    <Skeleton className="h-[120px] w-full" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 space-y-4 p-8 pt-6">
                <h2 className="text-3xl font-bold tracking-tight mb-4">System Health</h2>
                <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200 flex items-center gap-3">
                    <AlertCircle className="h-5 w-5" />
                    <p>{error}</p>
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
                    System Health
                    <Badge variant={isHealthy ? 'default' : 'destructive'} className={isHealthy ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                        {isHealthy ? 'All Systems Operational' : 'Systems Degraded'}
                    </Badge>
                </h2>
                <p className="text-sm text-muted-foreground">
                    Last updated: {new Date(diagnostics.timestamp).toLocaleTimeString()}
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Database</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">{db.status}</div>
                        <p className="text-xs text-muted-foreground mt-1">Latency: {db.latencyMs}ms</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Node.js Uptime</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Math.floor(system.uptimeSeconds / 3600)}h {Math.floor((system.uptimeSeconds % 3600) / 60)}m</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Process uptime
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">OS Memory Usage</CardTitle>
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
                        <CardTitle className="text-sm font-medium">V8 Heap</CardTitle>
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
                            <Settings className="h-5 w-5" /> Environment Variables
                        </CardTitle>
                        <CardDescription>Status of required system configuration keys</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {environment.map((env: any) => (
                                <div key={env.key} className="flex items-center justify-between">
                                    <span className="font-mono text-sm">{env.key}</span>
                                    {env.isSet ? (
                                        <Badge variant="outline" className="text-emerald-600 bg-emerald-50"><CheckCircle2 className="h-3 w-3 mr-1"/> Configured</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-orange-600 bg-orange-50"><AlertCircle className="h-3 w-3 mr-1"/> Missing</Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Server className="h-5 w-5" /> Host Information
                        </CardTitle>
                        <CardDescription>Underlying OS and hardware specs</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex justify-between border-b pb-2 text-sm">
                                <span className="text-muted-foreground">Platform</span>
                                <span className="font-medium">{system.platform} ({system.arch})</span>
                            </div>
                            <div className="flex justify-between border-b pb-2 text-sm">
                                <span className="text-muted-foreground">Logical CPUs</span>
                                <span className="font-medium">{system.cpus} Cores</span>
                            </div>
                            <div className="flex justify-between border-b pb-2 text-sm">
                                <span className="text-muted-foreground">System Uptime</span>
                                <span className="font-medium">{Math.floor(system.osUptimeSeconds / 3600 / 24)} days {Math.floor((system.osUptimeSeconds % (3600 * 24)) / 3600)} hours</span>
                            </div>
                            <div className="flex justify-between pb-2 text-sm">
                                <span className="text-muted-foreground">Node RSS</span>
                                <span className="font-medium">{Math.round(memory.rssBytes / 1024 / 1024)} MB</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
