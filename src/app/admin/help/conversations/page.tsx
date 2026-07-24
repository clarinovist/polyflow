import { listHelpConversations } from '@/actions/admin/help-admin';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Search, MessageSquare } from 'lucide-react';

export const dynamic = 'force-dynamic';

const outcomeColors: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  PARTIAL: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  BLOCKED: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  ESCALATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
};

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const outcome = typeof params.outcome === 'string' ? params.outcome : undefined;
  const channel = typeof params.channel === 'string' ? params.channel : undefined;
  const q = typeof params.q === 'string' ? params.q : undefined;

  const { items, total, limit } = await listHelpConversations({ page, limit: 20, outcome, channel, q });
  const totalPages = Math.ceil(total / limit);

  const buildHref = (overrides: { page?: number; outcome?: string | null; channel?: string | null; q?: string | null }) => {
    const sp = new URLSearchParams();
    const o = overrides.outcome !== undefined ? overrides.outcome : outcome;
    const ch = overrides.channel !== undefined ? overrides.channel : channel;
    const qq = overrides.q !== undefined ? overrides.q : q;
    const p = overrides.page ?? page;
    if (o) sp.set('outcome', o);
    if (ch) sp.set('channel', ch);
    if (qq) sp.set('q', qq);
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return qs ? `/admin/help/conversations?${qs}` : '/admin/help/conversations';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conversations (redacted)</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} interaksi · log terpotong, tanpa dump sensitif penuh</p>
        </div>
        <Link href="/admin/help">
          <Button variant="outline" size="sm">← Dashboard</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap gap-3 items-end" method="GET">
            <div className="flex-1 min-w-[200px]">
              <Input name="q" placeholder="Cari pertanyaan…" defaultValue={q} className="h-9" />
            </div>
            <select name="outcome" defaultValue={outcome || ''} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Semua outcome</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="PARTIAL">Partial</option>
              <option value="FAILED">Failed</option>
              <option value="BLOCKED">Blocked</option>
              <option value="ESCALATED">Escalated</option>
            </select>
            <select name="channel" defaultValue={channel || ''} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Semua channel</option>
              <option value="web">web</option>
              <option value="telegram">telegram</option>
            </select>
            <Button type="submit" variant="outline" size="sm" className="gap-1"><Search className="h-3.5 w-3.5" /> Filter</Button>
          </form>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Belum ada interaksi.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.id}>
              <CardContent className="py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium flex-1">{it.question}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-[10px]">{it.channel}</Badge>
                    <Badge className={outcomeColors[it.outcome] || ''}>{it.outcome}</Badge>
                    {it.feedback && <Badge variant="outline" className={it.feedback === 'UP' ? 'text-green-600' : 'text-red-500'}>{it.feedback}</Badge>}
                  </div>
                </div>
                {it.answerPreview && <p className="text-xs text-muted-foreground line-clamp-2">{it.answerPreview}</p>}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                  {it.tenantName && <span className="font-medium">{it.tenantName}</span>}
                  <span>{it.latencyMs}ms</span>
                  {it.blockedReason && <span className="text-orange-600">blok: {it.blockedReason.slice(0, 80)}</span>}
                  <span>{new Date(it.createdAt).toLocaleString('id-ID')}</span>
                  <span className="font-mono text-[10px]">{it.id.slice(0, 8)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-1 flex-wrap">
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 12).map((p) => (
            <Link
              key={p}
              href={buildHref({ page: p })}
              className={`px-3 py-1.5 text-sm rounded-md ${p === page ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
