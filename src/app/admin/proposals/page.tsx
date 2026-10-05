'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    listFeatureSignalClusters,
    listFeatureProposals,
    ignoreFeatureSignalCluster,
    reopenFeatureSignalCluster,
    approveFeatureProposal,
    rejectFeatureProposal,
} from '@/actions/admin/feature-proposals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Lightbulb, Check, X as XIcon, Ban, RotateCcw } from 'lucide-react';

type Signal = Awaited<ReturnType<typeof listFeatureSignalClusters>>["items"][number];
type Proposal = Awaited<ReturnType<typeof listFeatureProposals>>["items"][number];

const signalColors: Record<string, string> = {
    OPEN: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    CANDIDATE: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    PROPOSED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    IGNORED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const proposalColors: Record<string, string> = {
    PENDING_REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    BUILT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    SHIPPED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
};

export default function FeatureProposalsPage() {
    const [tab, setTab] = useState<'proposals' | 'signals'>('proposals');
    const [signals, setSignals] = useState<Signal[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [s, p] = await Promise.all([listFeatureSignalClusters({ limit: 50 }), listFeatureProposals({ limit: 50 })]);
            setSignals(s.items);
            setProposals(p.items);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function run(id: string, fn: () => Promise<unknown>) {
        setBusy(id);
        try { await fn(); await load(); } finally { setBusy(null); }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="h-6 w-6" /> Usulan Fitur</h1>
                <p className="text-muted-foreground">Sinyal kebutuhan dari percakapan asisten. Usulan hanya jadi backlog setelah disetujui.</p>
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList>
                    <TabsTrigger value="proposals">Usulan ({proposals.filter((p) => p.status === "PENDING_REVIEW").length})</TabsTrigger>
                    <TabsTrigger value="signals">Sinyal ({signals.filter((s) => s.status === "OPEN" || s.status === "CANDIDATE").length})</TabsTrigger>
                </TabsList>
            </Tabs>
            {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat...</div>
            ) : tab === "proposals" ? (
                <div className="space-y-4">
                    {proposals.length === 0 && <p className="text-muted-foreground">Belum ada usulan.</p>}
                    {proposals.map((p) => (
                        <Card key={p.id}>
                            <CardHeader>
                                <CardTitle className="text-base">{p.title}</CardTitle>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <Badge className={proposalColors[p.status] || ""}>{p.status}</Badge>
                                    <Badge variant="outline">{p.requesterCount} peminta</Badge>
                                    {p.impactedModules.map((m) => (<Badge key={m} variant="secondary">{m}</Badge>))}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-sm whitespace-pre-wrap">{p.problemMd}</p>
                                {p.evidenceMd && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{p.evidenceMd}</p>}
                                {p.decisionNote && <p className="text-xs">Keputusan: {p.decisionNote}</p>}
                                {p.status === "PENDING_REVIEW" && (
                                    <div className="space-y-2">
                                        <Textarea placeholder="Catatan keputusan (wajib untuk tolak)" value={note[p.id] || ""} onChange={(e) => setNote({ ...note, [p.id]: e.target.value })} />
                                        <div className="flex gap-2">
                                            <Button size="sm" disabled={busy === p.id} onClick={() => run(p.id, () => approveFeatureProposal(p.id))}><Check className="h-4 w-4 mr-1" /> Setuju</Button>
                                            <Button size="sm" variant="destructive" disabled={busy === p.id || !(note[p.id] || "").trim()} onClick={() => run(p.id, () => rejectFeatureProposal(p.id, note[p.id]))}><XIcon className="h-4 w-4 mr-1" /> Tolak</Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    {signals.length === 0 && <p className="text-muted-foreground">Belum ada sinyal.</p>}
                    {signals.map((s) => (
                        <Card key={s.id}>
                            <CardHeader>
                                <CardTitle className="text-base">{s.canonicalRequest}</CardTitle>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <Badge className={signalColors[s.status] || ""}>{s.status}</Badge>
                                    <Badge variant="outline">{s.uniqueUsers} user · {s.hitCount}x</Badge>
                                    {s.suggestedModule && <Badge variant="secondary">{s.suggestedModule}</Badge>}
                                    <Badge variant="outline">{s.signalKind}</Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex gap-2">
                                    {s.status !== "IGNORED" ? (
                                        <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => run(s.id, () => ignoreFeatureSignalCluster(s.id))}><Ban className="h-4 w-4 mr-1" /> Abaikan</Button>
                                    ) : (
                                        <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => run(s.id, () => reopenFeatureSignalCluster(s.id))}><RotateCcw className="h-4 w-4 mr-1" /> Buka lagi</Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
