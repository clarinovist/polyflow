'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    listMyFindings,
    claimFinding,
    resolveFinding,
    snoozeFinding,
} from '@/actions/findings/finding-actions';

type FindingSeverity = 'WARNING' | 'CRITICAL';
type FindingStatus = 'UNCLAIMED' | 'CLAIMED' | 'RESOLVED' | 'SNOOZED';

type FindingItem = {
    id: string;
    detector: string;
    severity: FindingSeverity;
    status: FindingStatus;
    headline: string;
    detail: string | null;
    helpArticleSlug: string | null;
    occurrences: number;
    firstSeenAt: string;
    claimedBy: { id: string; name: string | null; email: string } | null;
    resolvedBy: { id: string; name: string | null; email: string } | null;
    resolutionNote: string | null;
};

const DETECTOR_LABELS: Record<string, string> = {
    critical_stock: 'Stok Kritis',
    production_no_progress: 'Produksi Tanpa Progres',
};

function detectorLabel(detector: string): string {
    return DETECTOR_LABELS[detector] ?? detector;
}

function ageLabel(firstSeenAt: string): string {
    const days = Math.floor(
        (Date.now() - new Date(firstSeenAt).getTime()) / 86_400_000,
    );
    if (days <= 0) return 'Hari ini';
    return `${days} hari`;
}

const TABS = [
    {
        value: 'active',
        label: 'Aktif',
        statuses: ['UNCLAIMED', 'CLAIMED', 'SNOOZED'] as FindingStatus[],
    },
    {
        value: 'resolved',
        label: 'Selesai',
        statuses: ['RESOLVED'] as FindingStatus[],
    },
] as const;

type TabValue = (typeof TABS)[number]['value'];

interface FindingsClientProps {
    initialFindings: FindingItem[];
}

export function FindingsClient({ initialFindings }: FindingsClientProps) {
    const [tab, setTab] = useState<TabValue>('active');
    const activeTab = TABS.find((t) => t.value === tab)!;

    const {
        data: findings,
        mutate,
        isLoading,
    } = useSWR(
        ['findings', tab],
        async () => {
            const res = await listMyFindings({
                statuses: [...activeTab.statuses],
            });
            return res.success && res.data ? (res.data as FindingItem[]) : [];
        },
        { fallbackData: tab === 'active' ? initialFindings : undefined },
    );

    async function handleClaim(id: string) {
        const res = await claimFinding(id);
        if (!res.success) {
            toast.error(res.error);
            return;
        }
        toast.success('Temuan diklaim.');
        mutate();
    }

    async function handleResolve(id: string, note: string) {
        const res = await resolveFinding(id, note);
        if (!res.success) {
            toast.error(res.error);
            return;
        }
        toast.success('Temuan ditandai selesai.');
        mutate();
    }

    async function handleSnooze(id: string, days: number) {
        const res = await snoozeFinding(id, days);
        if (!res.success) {
            toast.error(res.error);
            return;
        }
        toast.success(`Temuan ditunda ${days} hari.`);
        mutate();
    }

    return (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList>
                {TABS.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>
                        {t.label}
                    </TabsTrigger>
                ))}
            </TabsList>
            <TabsContent value={tab} className="mt-4">
                {isLoading ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        Memuat...
                    </div>
                ) : !findings || findings.length === 0 ? (
                    <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                        {tab === 'active'
                            ? 'Tidak ada temuan aktif. Semua aman.'
                            : 'Belum ada temuan yang selesai.'}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {findings.map((f) => (
                            <FindingCard
                                key={f.id}
                                finding={f}
                                onClaim={() => handleClaim(f.id)}
                                onResolve={(note) => handleResolve(f.id, note)}
                                onSnooze={(days) => handleSnooze(f.id, days)}
                            />
                        ))}
                    </div>
                )}
            </TabsContent>
        </Tabs>
    );
}

function FindingCard({
    finding,
    onClaim,
    onResolve,
    onSnooze,
}: {
    finding: FindingItem;
    onClaim: () => void;
    onResolve: (note: string) => void;
    onSnooze: (days: number) => void;
}) {
    const [resolveOpen, setResolveOpen] = useState(false);
    const [note, setNote] = useState('');
    const [snoozeDays, setSnoozeDays] = useState('3');

    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant={
                                finding.severity === 'CRITICAL'
                                    ? 'destructive'
                                    : 'secondary'
                            }
                        >
                            {finding.severity === 'CRITICAL'
                                ? 'Kritis'
                                : 'Perhatian'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                            {detectorLabel(finding.detector)}
                        </span>
                        {finding.occurrences > 1 && (
                            <Badge variant="outline">
                                Berulang {finding.occurrences}x
                            </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {ageLabel(finding.firstSeenAt)}
                        </span>
                    </div>
                    <p className="mt-1 font-medium">{finding.headline}</p>
                    {finding.detail && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {finding.detail}
                        </p>
                    )}
                    {finding.status === 'CLAIMED' && finding.claimedBy && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Diklaim oleh{' '}
                            {finding.claimedBy.name || finding.claimedBy.email}
                        </p>
                    )}
                    {finding.status === 'RESOLVED' && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Diselesaikan oleh{' '}
                            {finding.resolvedBy?.name ||
                                finding.resolvedBy?.email ||
                                'sistem'}
                            {finding.resolutionNote &&
                                ` — ${finding.resolutionNote}`}
                        </p>
                    )}
                    {finding.helpArticleSlug && (
                        <Link
                            href={`/support/${finding.helpArticleSlug}`}
                            className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                            Cara menangani ini →
                        </Link>
                    )}
                </div>

                {finding.status !== 'RESOLVED' && (
                    <div className="flex shrink-0 flex-col gap-2">
                        {finding.status === 'UNCLAIMED' && (
                            <Button size="sm" onClick={onClaim}>
                                Klaim
                            </Button>
                        )}
                        <Dialog
                            open={resolveOpen}
                            onOpenChange={setResolveOpen}
                        >
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                    Selesai
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Tandai selesai</DialogTitle>
                                </DialogHeader>
                                <Textarea
                                    placeholder="Catatan (opsional)"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                                <DialogFooter>
                                    <Button
                                        onClick={() => {
                                            onResolve(note);
                                            setResolveOpen(false);
                                            setNote('');
                                        }}
                                    >
                                        Tandai Selesai
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        {finding.status !== 'SNOOZED' && (
                            <div className="flex items-center gap-1">
                                <Select
                                    value={snoozeDays}
                                    onValueChange={setSnoozeDays}
                                >
                                    <SelectTrigger className="h-8 w-24 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">
                                            1 hari
                                        </SelectItem>
                                        <SelectItem value="3">
                                            3 hari
                                        </SelectItem>
                                        <SelectItem value="7">
                                            7 hari
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onSnooze(Number(snoozeDays))}
                                >
                                    Snooze
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}
