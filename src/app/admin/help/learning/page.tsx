'use client';

import { useEffect, useState, useCallback } from 'react';
import { listHelpClusters, listHelpDrafts, ignoreCluster, reopenCluster, approveDraftAsArticle, rejectDraft, runLearningJobNow } from '@/actions/admin/help-learning';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { Loader2, Lightbulb, Check, X as XIcon, Eye, Zap, Ban, RotateCcw } from 'lucide-react';

type Cluster = Awaited<ReturnType<typeof listHelpClusters>>['items'][number];
type Draft = Awaited<ReturnType<typeof listHelpDrafts>>['items'][number];

const clusterStatusColors: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  DRAFTED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  IGNORED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const draftStatusColors: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  MERGED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
};

export default function LearningQueuePage() {
  const [tab, setTab] = useState<'clusters' | 'drafts'>('clusters');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [clusterFilter, setClusterFilter] = useState('OPEN');
  const [draftFilter, setDraftFilter] = useState('PENDING_REVIEW');
  const [jobResult, setJobResult] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listHelpClusters({ status: clusterFilter || undefined, limit: 50 });
      setClusters(res.items);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [clusterFilter]);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listHelpDrafts({ status: draftFilter || undefined, limit: 50 });
      setDrafts(res.items);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [draftFilter]);

  useEffect(() => {
    if (tab === 'clusters') fetchClusters();
    else fetchDrafts();
  }, [tab, fetchClusters, fetchDrafts]);

  const handleIgnoreCluster = async (id: string) => {
    setActionLoading(id);
    try { await ignoreCluster(id); await fetchClusters(); } catch { /* ignore */ } finally { setActionLoading(null); }
  };

  const handleReopenCluster = async (id: string) => {
    setActionLoading(id);
    try { await reopenCluster(id); await fetchClusters(); } catch { /* ignore */ } finally { setActionLoading(null); }
  };

  const handleRunJob = async () => {
    setActionLoading('job');
    setJobResult(null);
    try {
      const res = await runLearningJobNow();
      setJobResult(`Created: ${res.created}, Skipped: ${res.skipped}${res.errors.length ? `, Errors: ${res.errors.join('; ')}` : ''}`);
      await fetchDrafts();
      setTab('drafts');
    } catch (e) {
      setJobResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setActionLoading(null); }
  };

  const handleApprove = async () => {
    if (!selectedDraft) return;
    setActionLoading(selectedDraft.id);
    try {
      await approveDraftAsArticle(selectedDraft.id, {
        editTitle: editTitle || selectedDraft.draftTitle,
        editBody: editBody || selectedDraft.draftBodyMd,
      });
      setSelectedDraft(null);
      await fetchDrafts();
    } catch (e) {
      setJobResult(`Approve error: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setActionLoading(null); }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try { await rejectDraft(id, 'Rejected via UI'); await fetchDrafts(); } catch { /* ignore */ } finally { setActionLoading(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="h-6 w-6 text-amber-500" /> Learning Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Supervised auto-learn — cluster pertanyaan → draft artikel → review super-admin → publish</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRunJob} disabled={actionLoading === 'job'} className="gap-1.5">
            {actionLoading === 'job' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Generate Drafts
          </Button>
          <Link href="/admin/help"><Button variant="outline" size="sm">← Dashboard</Button></Link>
        </div>
      </div>

      {jobResult && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 text-sm">{jobResult}</CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'clusters' | 'drafts')}>
        <TabsList>
          <TabsTrigger value="clusters">Question Clusters</TabsTrigger>
          <TabsTrigger value="drafts">Drafts Pending Review</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'clusters' ? (
        <>
          <div className="flex gap-2">
            {['', 'OPEN', 'DRAFTED', 'RESOLVED', 'IGNORED'].map((s) => (
              <Button key={s || 'all'} size="sm" variant={clusterFilter === s ? 'default' : 'outline'} onClick={() => setClusterFilter(s)}>{s || 'All'}</Button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : clusters.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Belum ada cluster. Cluster otomatis dibuat dari pertanyaan FAILED/PARTIAL/BLOCKED.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {clusters.map((c) => (
                <Card key={c.id}>
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={clusterStatusColors[c.status] || ''}>{c.status}</Badge>
                          <span className="text-xs font-mono">{c.hitCount}x</span>
                          {c.suggestedModule && <Badge variant="outline" className="text-xs">{c.suggestedModule}</Badge>}
                        </div>
                        <p className="text-sm font-medium mt-1">{c.canonicalQuestion}</p>
                        {c.sampleQuestions.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                            {c.sampleQuestions.slice(0, 3).map((s, i) => <div key={i} className="truncate">• {s}</div>)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {c.status === 'OPEN' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionLoading === c.id} onClick={() => handleIgnoreCluster(c.id)}>
                            {actionLoading === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Ban className="h-3 w-3 mr-1" /> Ignore</>}
                          </Button>
                        )}
                        {c.status !== 'OPEN' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionLoading === c.id} onClick={() => handleReopenCluster(c.id)}>
                            {actionLoading === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" /> Reopen</>}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">last: {new Date(c.lastSeenAt).toLocaleString('id-ID')} · {c.id.slice(0, 8)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            {['', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'].map((s) => (
              <Button key={s || 'all'} size="sm" variant={draftFilter === s ? 'default' : 'outline'} onClick={() => setDraftFilter(s)}>{s || 'All'}</Button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : drafts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Belum ada draft. Klik &quot;Generate Drafts&quot; untuk buat draft dari cluster.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {drafts.map((d) => (
                <Card key={d.id}>
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={draftStatusColors[d.status] || ''}>{d.status}</Badge>
                          {d.modules.map((m) => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                          <span className="text-xs text-muted-foreground">{d.sourceSampleCount} samples</span>
                        </div>
                        <p className="text-sm font-semibold mt-1">{d.draftTitle}</p>
                        {d.summary && <p className="text-xs text-muted-foreground mt-0.5">{d.summary}</p>}
                        {d.cluster && (
                          <p className="text-[11px] text-muted-foreground mt-1">Cluster: {d.cluster.canonicalQuestion} ({d.cluster.hitCount}x)</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setSelectedDraft(d); setEditTitle(d.draftTitle); setEditBody(d.draftBodyMd); }}>
                          <Eye className="h-3 w-3" /> Review
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Review modal */}
      {selectedDraft && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Review Draft
                <Button variant="ghost" size="sm" onClick={() => setSelectedDraft(null)}><XIcon className="h-4 w-4" /></Button>
              </CardTitle>
              {selectedDraft.cluster && (
                <p className="text-xs text-muted-foreground">Cluster: {selectedDraft.cluster.canonicalQuestion} ({selectedDraft.cluster.hitCount}x)</p>
              )}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3">
              <div>
                <label className="text-xs font-medium">Title</label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Body (Markdown)</label>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="mt-1 min-h-[300px] font-mono text-sm" />
              </div>
              {selectedDraft.cluster && selectedDraft.cluster.sampleQuestions.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium mb-1">Sample questions (redacted):</p>
                  {selectedDraft.cluster.sampleQuestions.map((s, i) => (
                    <p key={i} className="text-xs text-muted-foreground">• {s}</p>
                  ))}
                </div>
              )}
            </CardContent>
            <div className="p-4 border-t flex justify-between gap-2">
              <Button variant="outline" size="sm" disabled={actionLoading === selectedDraft.id} onClick={() => { handleReject(selectedDraft.id); setSelectedDraft(null); }} className="gap-1">
                <XIcon className="h-4 w-4" /> Reject
              </Button>
              <Button size="sm" disabled={actionLoading === selectedDraft.id} onClick={handleApprove} className="gap-1">
                {actionLoading === selectedDraft.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Approve & Publish
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
