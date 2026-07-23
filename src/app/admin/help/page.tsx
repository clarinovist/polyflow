import { getMainPrisma } from '@/lib/core/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  ShieldAlert,
  Clock,
  TrendingUp,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getHelpMetrics() {
  const mainDb = getMainPrisma();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalInteractions,
    outcomeCounts,
    feedbackCounts,
    avgLatency,
    recentInteractions,
    topQuestions,
  ] = await Promise.all([
    mainDb.helpInteraction.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
    mainDb.helpInteraction.groupBy({
      by: ['outcome'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { outcome: true },
    }),
    mainDb.helpInteraction.groupBy({
      by: ['feedback'],
      where: { createdAt: { gte: sevenDaysAgo }, feedback: { not: null } },
      _count: { feedback: true },
    }),
    mainDb.helpInteraction.aggregate({
      where: { createdAt: { gte: sevenDaysAgo } },
      _avg: { latencyMs: true },
    }),
    mainDb.helpInteraction.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        tenantId: true,
        question: true,
        answerPreview: true,
        outcome: true,
        feedback: true,
        channel: true,
        latencyMs: true,
        createdAt: true,
      },
    }),
    mainDb.$queryRaw<{ question: string; count: bigint }[]>`
      SELECT "question", COUNT(*)::bigint as count
      FROM "HelpInteraction"
      WHERE "createdAt" >= ${sevenDaysAgo}
        AND "outcome" IN ('FAILED', 'BLOCKED')
      GROUP BY "question"
      ORDER BY count DESC
      LIMIT 10
    `,
  ]);

  const outcomeMap: Record<string, number> = {};
  outcomeCounts.forEach((o) => {
    outcomeMap[o.outcome] = o._count.outcome;
  });

  const feedbackMap: Record<string, number> = {};
  feedbackCounts.forEach((f) => {
    if (f.feedback) feedbackMap[f.feedback] = f._count.feedback;
  });

  // Resolve tenant names for recent interactions
  const tenantIds = [...new Set(recentInteractions.map((i) => i.tenantId).filter(Boolean))] as string[];
  const tenants = tenantIds.length > 0
    ? await mainDb.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, subdomain: true },
      })
    : [];
  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name || t.subdomain]));

  return {
    totalInteractions,
    outcomeMap,
    feedbackMap,
    avgLatency: Math.round(avgLatency._avg.latencyMs || 0),
    recentInteractions: recentInteractions.map((i) => ({
      ...i,
      tenantName: i.tenantId ? tenantMap[i.tenantId] || i.tenantId : null,
    })),
    topQuestions: topQuestions.map((q) => ({
      question: q.question,
      count: Number(q.count),
    })),
  };
}

const outcomeColors: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  PARTIAL: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  BLOCKED: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  ESCALATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
};

export default async function AdminHelpPage() {
  const metrics = await getHelpMetrics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Help / Virtual CS Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitoring & analytics Virtual CS — 7 hari terakhir
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Q&A</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalInteractions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.totalInteractions > 0
                ? Math.round(((metrics.outcomeMap.SUCCESS || 0) / metrics.totalInteractions) * 100)
                : 0}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Feedback</CardTitle>
            <div className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3 text-green-600" />
              <ThumbsDown className="h-3 w-3 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <span className="text-green-600 font-bold">{metrics.feedbackMap.UP || 0}</span>
              {' / '}
              <span className="text-red-500 font-bold">{metrics.feedbackMap.DOWN || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avgLatency}ms</div>
          </CardContent>
        </Card>
      </div>

      {/* Outcome Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Outcome Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {['SUCCESS', 'PARTIAL', 'FAILED', 'BLOCKED', 'ESCALATED'].map((outcome) => (
              <div key={outcome} className="flex items-center gap-2">
                <Badge className={outcomeColors[outcome] || ''}>{outcome}</Badge>
                <span className="text-sm font-mono">{metrics.outcomeMap[outcome] || 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Gaps (failed/blocked questions) */}
      {metrics.topQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-500" />
              Top Gaps (Failed / Blocked Questions)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.topQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-muted-foreground shrink-0">{q.count}x</span>
                  <span className="text-foreground">{q.question}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Interactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Interactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {metrics.recentInteractions.length === 0 && (
              <p className="text-sm text-muted-foreground">Belum ada interaksi.</p>
            )}
            {metrics.recentInteractions.map((item) => (
              <div
                key={item.id}
                className="border border-border rounded-lg p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate flex-1">
                    {item.question}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={outcomeColors[item.outcome] || ''}>
                      {item.outcome}
                    </Badge>
                    {item.feedback === 'UP' && <ThumbsUp className="h-3.5 w-3.5 text-green-600" />}
                    {item.feedback === 'DOWN' && <ThumbsDown className="h-3.5 w-3.5 text-red-500" />}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {item.answerPreview || '(no answer)'}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{item.channel}</span>
                  {item.tenantName && <span className="font-medium">{item.tenantName}</span>}
                  <span>{item.latencyMs}ms</span>
                  <span>{new Date(item.createdAt).toLocaleString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
